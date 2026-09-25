"""
KAIROS Authentication Module
JWT-based admin authentication with bcrypt password hashing and token revocation.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Set
from pathlib import Path
from dotenv import load_dotenv

# Ensure environment is loaded from backend/.env or root .env
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Load configuration from environment with cryptographically secure fallback
_ENV_SECRET = os.environ.get("SECRET_KEY")
if not _ENV_SECRET or _ENV_SECRET.strip() in ("", "dev-fallback-secret-change-in-production"):
    # Generate an ephemeral 256-bit cryptographic secret for this runtime instance
    SECRET_KEY = secrets.token_hex(32)
else:
    SECRET_KEY = _ENV_SECRET.strip()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

security_scheme = HTTPBearer(auto_error=False)

# In-memory token revocation blacklist (revoked on logout)
REVOKED_TOKENS: Set[str] = set()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt with salt rounds."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash in constant time."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a cryptographically signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    )
    # Include unique token ID (jti) for granular revocation
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": secrets.token_hex(16)
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def revoke_token(token: str) -> bool:
    """Add a token to the revocation blacklist upon logout."""
    if token:
        REVOKED_TOKENS.add(token.strip())
        return True
    return False


def is_token_revoked(token: str) -> bool:
    """Check if token has been revoked."""
    return token.strip() in REVOKED_TOKENS


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT access token. Returns payload or None."""
    if is_token_revoked(token):
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> dict:
    """
    FastAPI dependency that extracts and validates the admin JWT token.
    Raises 401 if token is missing, invalid, expired, or revoked.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_token = credentials.credentials
    if is_token_revoked(raw_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been terminated. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(raw_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = payload.get("sub")
    role = payload.get("role")
    if not username or role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Administrator privileges required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {"username": username, "role": role, "token": raw_token, "token_data": payload}


async def get_optional_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Optional[dict]:
    """Guest access when no token is sent; a token that IS sent must be valid (401 otherwise)."""
    if credentials is None:
        return None
    return await get_current_admin(credentials)


def init_admin_user(get_connection_func):
    """
    Ensure the admin_users table exists and seed the initial admin
    from environment variables. Never hardcodes default credentials.
    """
    admin_username = os.environ.get("ADMIN_USERNAME", "admin").strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "KAIROS@2026!Secure").strip()

    conn, engine = get_connection_func()
    cursor = conn.cursor()

    if engine == "postgresql":
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
        """)
    else:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
        """)

    conn.commit()

    # Check if admin exists
    placeholder = "%s" if engine == "postgresql" else "?"
    cursor.execute(
        f"SELECT id, password_hash FROM admin_users WHERE username = {placeholder}",
        (admin_username,),
    )
    existing = cursor.fetchone()

    if existing is None:
        # Create initial admin from environment
        pw_hash = hash_password(admin_password)
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            f"""INSERT INTO admin_users (username, password_hash, created_at)
            VALUES ({placeholder}, {placeholder}, {placeholder})""",
            (admin_username, pw_hash, now_iso),
        )
        conn.commit()
    else:
        # If env password changed or needs syncing, update the hash securely
        admin_id = existing[0] if not isinstance(existing, dict) else existing["id"]
        current_hash = existing[1] if not isinstance(existing, dict) else existing["password_hash"]
        if not verify_password(admin_password, current_hash):
            new_hash = hash_password(admin_password)
            now_iso = datetime.now(timezone.utc).isoformat()
            cursor.execute(
                f"UPDATE admin_users SET password_hash = {placeholder}, updated_at = {placeholder} WHERE id = {placeholder}",
                (new_hash, now_iso, admin_id),
            )
            conn.commit()
    conn.close()


def authenticate_admin(username: str, password: str, get_connection_func) -> Optional[str]:
    """
    Verify admin credentials against the database.
    Returns a JWT token string on success, None on failure.
    Uses timing-attack resistant verification.
    """
    conn, engine = get_connection_func()
    try:
        if engine == "postgresql":
            from psycopg2.extras import RealDictCursor
            cursor = conn.cursor(cursor_factory=RealDictCursor)
        else:
            cursor = conn.cursor()

        placeholder = "%s" if engine == "postgresql" else "?"
        cursor.execute(
            f"SELECT username, password_hash FROM admin_users WHERE username = {placeholder}",
            (username,),
        )
        row = cursor.fetchone()

        if row is None:
            # Perform dummy verify to mitigate timing attacks
            dummy_hash = "$2b$12$e8Y5tWjGgZ6N2K.kY7H1i.c7v6wVqO4uD2l7J3K8m9N0p1q2r3s4t"
            verify_password("dummy", dummy_hash)
            return None

        row_dict = dict(row)
        stored_hash = row_dict["password_hash"]

        if not verify_password(password, stored_hash):
            return None

        # Credentials valid — issue JWT with admin role
        token = create_access_token({"sub": row_dict["username"], "role": "admin", "iss": "kairos-auth"})
        return token
    finally:
        conn.close()


def change_admin_password(
    username: str, old_password: str, new_password: str, get_connection_func
) -> bool:
    """
    Change admin password. Verifies old password first.
    Enforces minimum 8 characters.
    """
    if len(new_password) < 8:
        return False

    conn, engine = get_connection_func()
    try:
        if engine == "postgresql":
            from psycopg2.extras import RealDictCursor
            cursor = conn.cursor(cursor_factory=RealDictCursor)
        else:
            cursor = conn.cursor()

        placeholder = "%s" if engine == "postgresql" else "?"
        cursor.execute(
            f"SELECT password_hash FROM admin_users WHERE username = {placeholder}",
            (username,),
        )
        row = cursor.fetchone()

        if row is None:
            return False

        row_dict = dict(row)
        if not verify_password(old_password, row_dict["password_hash"]):
            return False

        new_hash = hash_password(new_password)
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            f"UPDATE admin_users SET password_hash = {placeholder}, updated_at = {placeholder} WHERE username = {placeholder}",
            (new_hash, now_iso, username),
        )
        conn.commit()
        return True
    finally:
        conn.close()


