from fastapi import FastAPI, HTTPException, Query, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from typing import List, Optional
import os
import re
import base64
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from backend/.env or root .env
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .models import (
    TriageRequest,
    TriageResult,
    TicketCreateRequest,
    TicketUpdateRequest,
    BulkTicketUpdateRequest,
    Ticket,
    AnalyticsResponse,
    LoginRequest,
    LoginResponse,
    ChangePasswordRequest,
    UserProfile,
    BroadcastAlert,
    CreateBroadcastRequest
)
from .database import (
    get_connection,
    init_db,
    fetch_all_tickets,
    fetch_ticket_by_id,
    insert_ticket,
    update_ticket_record,
    bulk_update_tickets,
    get_analytics_data,
    get_broadcast_alerts,
    create_broadcast_alert,
    dismiss_broadcast_alert,
    get_all_audit_logs,
    clear_all_tickets_data,
    get_engine_status
)
from .triage import triage_grievance
from .auth import (
    get_current_admin,
    authenticate_admin,
    init_admin_user,
    change_admin_password,
    revoke_token
)

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="KAIROS Backend API",
    description="Campus Grievance Triage, SLA Monitoring & Operations Hub API",
    version="2.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Safe Global Exception Handler (Never expose tracebacks to clients) ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log internal error on server without leaking details to client
    print(f"[ERROR] Unhandled server exception on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please contact the system administrator."}
    )

# --- Production-Safe CORS Configuration ---
# Configured via FRONTEND_URL or ALLOWED_ORIGINS (comma-separated)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
extra_origins = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

allowed_origins = [
    FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
] + extra_origins

# Remove duplicates while preserving order
allowed_origins = list(dict.fromkeys(allowed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
)

# --- Request Size Limiting & Security Headers Middleware ---
MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024  # 10MB

@app.middleware("http")
async def security_and_size_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BODY_SIZE:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Request body exceeds the maximum allowed size of 10MB."}
        )
    response = await call_next(request)
    # Hardened Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# --- Strict Image Validation Helper ---
ALLOWED_IMAGE_PREFIXES = (
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,"
)

# Regex to safely validate static asset references and prevent path traversal (../)
SAFE_ASSET_REGEX = re.compile(r"^/(assets|static)/[a-zA-Z0-9_\-\.]+\.(png|jpg|jpeg|webp)$")

def validate_and_sanitize_image(image_str: Optional[str]) -> Optional[str]:
    """
    Validates uploaded image data:
    - Path traversal prevention for internal assets
    - Checks MIME type prefix for base64 uploads
    - Limits size to 5MB decoded bytes
    - Verifies actual image magic bytes (JPEG, PNG, WebP)
    """
    if not image_str:
        return None
    
    # Check internal asset reference with strict regex
    if image_str.startswith("/"):
        if SAFE_ASSET_REGEX.match(image_str):
            return image_str
        raise HTTPException(
            status_code=400,
            detail="Invalid asset path format."
        )

    if not any(image_str.startswith(prefix) for prefix in ALLOWED_IMAGE_PREFIXES):
        raise HTTPException(
            status_code=400,
            detail="Invalid image format. Allowed formats: PNG, JPEG, WebP."
        )

    try:
        header, encoded = image_str.split(",", 1)
        data = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(status_code=400, detail="Corrupted image base64 data.")

    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image file exceeds maximum limit of 5MB.")

    # Binary Magic Byte Verification
    is_valid = False
    if data.startswith(b"\xff\xd8\xff"):  # JPEG
        is_valid = True
    elif data.startswith(b"\x89PNG\r\n\x1a\n"):  # PNG
        is_valid = True
    elif data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":  # WebP
        is_valid = True

    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file failed binary verification. Not a valid PNG, JPEG, or WebP image."
        )

    return image_str


@app.on_event("startup")
def on_startup():
    init_db()
    init_admin_user(get_connection)


# --- Public Diagnostics & Health ---
@app.get("/api/health")
def health_check():
    db_info = get_engine_status()
    return {
        "status": "online",
        "service": "KAIROS Operational Engine",
        "version": "2.0.0",
        "database": db_info
    }

@app.get("/api/database/status")
def database_status():
    return get_engine_status()


# --- Authentication Endpoints ---
@app.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit("15/minute")
def admin_login(request: Request, req: LoginRequest):
    u = req.username.strip()
    p = req.password.strip()

    token = authenticate_admin(u, p, get_connection)
    if not token:
        # Generic message — never reveals whether username exists and avoids leaking role info
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your username and password."
        )

    user = UserProfile(
        id="ADM-01",
        name="System Administrator",
        email=u if "@" in u else f"{u}@kairos.campus",
        role="Lead Operations Administrator",
        department="Executive Facilities",
        badge_id="ADMIN-MASTER",
        avatar_initials=u[:2].upper()
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    return LoginResponse(
        token=token,
        user=user,
        permissions=["all", "triage_override", "sla_reassign", "bulk_actions", "emergency_broadcast", "audit_view"],
        login_time=now_iso
    )

@app.post("/api/auth/change-password")
def change_password(req: ChangePasswordRequest, admin: dict = Depends(get_current_admin)):
    success = change_admin_password(admin["username"], req.old_password, req.new_password, get_connection)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Failed to change password. Please ensure your current password is correct and new password is at least 8 characters."
        )
    return {"status": "success", "message": "Password updated successfully."}

@app.post("/api/auth/logout")
def admin_logout(admin: dict = Depends(get_current_admin)):
    # Invalidate token in revocation store
    token_str = admin.get("token")
    if token_str:
        revoke_token(token_str)
    return {"status": "logged_out", "message": "Session terminated and token revoked successfully."}



# --- Public Student Grievance Endpoints ---

@app.post("/api/tickets/triage", response_model=TriageResult)
@limiter.limit("20/minute")
async def triage_ticket(request: Request, req: TriageRequest):
    safe_image = validate_and_sanitize_image(req.image)
    return await triage_grievance(req.description, req.location, safe_image)

@app.post("/api/tickets", response_model=Ticket)
@limiter.limit("15/minute")
async def create_ticket(request: Request, req: TicketCreateRequest):
    safe_image = validate_and_sanitize_image(req.image)
    
    if not req.title or not req.category or not req.priority or not req.department:
        triage = await triage_grievance(req.description, req.location, safe_image)
        data = {
            "title": triage.title,
            "description": req.description,
            "location": req.location,
            "image": safe_image,
            "category": triage.category,
            "priority": triage.priority,
            "department": triage.department,
            "summary": triage.summary,
            "recommended_action": triage.recommended_action,
            "priority_rationale": triage.priority_rationale,
            "sla_hours": triage.sla_hours,
        }
    else:
        from .models import PRIORITY_SLA_HOURS
        sla_hours = PRIORITY_SLA_HOURS.get(req.priority, 24)
        data = {
            "title": req.title,
            "description": req.description,
            "location": req.location,
            "image": safe_image,
            "category": req.category,
            "priority": req.priority,
            "department": req.department,
            "summary": req.summary or req.description[:100],
            "recommended_action": req.recommended_action or "Dispatch technician for on-site assessment.",
            "priority_rationale": req.priority_rationale or "Classified according to standard campus policy.",
            "sla_hours": sla_hours,
        }
        
    ticket_id = insert_ticket(data)
    created = fetch_ticket_by_id(ticket_id)
    return created

# Public single-ticket status lookup by ID (students can track their issue)
@app.get("/api/tickets/{ticket_id}", response_model=Ticket)
def get_ticket(ticket_id: str):
    ticket = fetch_ticket_by_id(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")
    return ticket

# Public emergency broadcasts for campus safety
@app.get("/api/broadcasts", response_model=List[BroadcastAlert])
def list_broadcasts():
    return get_broadcast_alerts(active_only=True)


# --- Protected Admin Endpoints ---

@app.get("/api/tickets", response_model=List[Ticket])
def list_tickets(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    admin: dict = Depends(get_current_admin)
):
    return fetch_all_tickets(status, priority, department)

@app.patch("/api/tickets/{ticket_id}", response_model=Ticket)
def update_ticket(
    ticket_id: str,
    req: TicketUpdateRequest,
    admin: dict = Depends(get_current_admin)
):
    updates = req.dict(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update")
        
    actor_name = f"Admin ({admin.get('username', 'Operations')})"
    success = update_ticket_record(ticket_id, updates, actor=actor_name)
    if not success:
        raise HTTPException(
            status_code=400,
            detail=f"Update failed for ticket {ticket_id}. Check that ticket exists and status transition is valid."
        )
        
    return fetch_ticket_by_id(ticket_id)

@app.post("/api/tickets/bulk")
def bulk_update(
    req: BulkTicketUpdateRequest,
    admin: dict = Depends(get_current_admin)
):
    updates = {
        "status": req.status,
        "owner": req.owner,
        "department": req.department,
        "comment": req.comment
    }
    actor_name = f"Admin ({admin.get('username', 'Bulk')})"
    count = bulk_update_tickets(req.ticket_ids, updates, actor=actor_name)
    return {"status": "success", "updated_count": count, "ticket_ids": req.ticket_ids}

@app.post("/api/broadcasts", response_model=dict)
def post_broadcast(
    req: CreateBroadcastRequest,
    admin: dict = Depends(get_current_admin)
):
    alert_id = create_broadcast_alert(req.dict(), creator=f"Admin ({admin.get('username', 'Alert')})")
    return {"status": "created", "id": alert_id}

@app.delete("/api/broadcasts/{alert_id}")
def dismiss_broadcast(
    alert_id: str,
    admin: dict = Depends(get_current_admin)
):
    dismiss_broadcast_alert(alert_id)
    return {"status": "dismissed", "id": alert_id}

@app.get("/api/audit-logs")
def list_audit_logs(
    limit: int = Query(40, le=100),
    admin: dict = Depends(get_current_admin)
):
    return get_all_audit_logs(limit=limit)

@app.get("/api/analytics/pulse", response_model=AnalyticsResponse)
def get_pulse(admin: dict = Depends(get_current_admin)):
    return get_analytics_data()

@app.post("/api/tickets/clear")
def clear_tickets(admin: dict = Depends(get_current_admin)):
    clear_all_tickets_data()
    return {"status": "cleared", "message": "All tickets removed by administrator."}


# --- Direct Download Endpoints ---
@app.get("/api/download/concept")
def download_concept():
    file_path = Path(__file__).resolve().parent.parent / "CONCEPT_AND_ARCHITECTURE.md"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=file_path,
        filename="KAIROS_Concept_and_Architecture.md",
        media_type="text/markdown"
    )

@app.get("/api/download/walkthrough")
def download_walkthrough():
    file_path = Path(__file__).resolve().parent.parent.parent / "walkthrough.md"
    if not file_path.exists():
        file_path = Path(__file__).resolve().parent.parent / "walkthrough.md"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=file_path,
        filename="KAIROS_Walkthrough.md",
        media_type="text/markdown"
    )

@app.get("/api/download/readme")
def download_readme():
    file_path = Path(__file__).resolve().parent.parent / "README.md"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=file_path,
        filename="KAIROS_README.md",
        media_type="text/markdown"
    )

@app.get("/api/download/project-zip")
def download_project_zip():
    file_path = Path(__file__).resolve().parent.parent.parent / "KAIROS-Project.zip"
    if not file_path.exists():
        file_path = Path(__file__).resolve().parent.parent / "KAIROS-Project.zip"
    if not file_path.exists():
        file_path = Path(__file__).resolve().parent.parent.parent / "ResolveAI-Project.zip"
    if not file_path.exists():
        file_path = Path(__file__).resolve().parent.parent / "ResolveAI-Project.zip"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=file_path,
        filename="KAIROS-Project.zip",
        media_type="application/zip"
    )

@app.get("/api/download/pdf")
def download_pdf():
    file_path = Path(__file__).resolve().parent.parent.parent / "KAIROS_Complete_Product_and_Technical_Documentation.pdf"
    if not file_path.exists():
        file_path = Path(__file__).resolve().parent.parent / "public" / "KAIROS_Complete_Product_and_Technical_Documentation.pdf"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="KAIROS PDF documentation not found")
    return FileResponse(
        path=file_path,
        filename="KAIROS_Complete_Product_and_Technical_Documentation.pdf",
        media_type="application/pdf"
    )

if __name__ == "__main__":
    import uvicorn
    server_port = int(os.environ.get("PORT", os.environ.get("BACKEND_PORT", 8000)))
    uvicorn.run("backend.main:app", host="127.0.0.1", port=server_port, reload=True)



