from fastapi import FastAPI, HTTPException, Query, Depends, Request, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from typing import List, Optional
from pydantic import BaseModel, Field
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
from .agent import run_agent, synthesize_speech, AgentUnavailable
from . import intelligence
from .models import sanitize_user_input
from .auth import (
    get_optional_admin,
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
    intelligence.init_intelligence_tables()


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
    reporter_token = intelligence.issue_reporter_token(ticket_id)
    intelligence.invalidate()
    created = fetch_ticket_by_id(ticket_id)
    created["reporter_token"] = reporter_token
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
        
    intelligence.invalidate()
    if updates.get("status") in ("Resolved", "Closed"):
        intelligence.request_reverification(ticket_id)
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
    intelligence.invalidate()
    if str(getattr(req.status, "value", req.status)) in ("Resolved", "Closed"):
        for tid in req.ticket_ids:
            intelligence.request_reverification(tid)
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
    intelligence.invalidate()
    return {"status": "cleared", "message": "All tickets removed by administrator."}


# --- KAIROS AI Assistant ---
class AgentMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=6000)

class AgentChatRequest(BaseModel):
    messages: List[AgentMessage] = Field(..., min_length=1, max_length=24)

class AgentTTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)

@app.post("/api/agent/chat")
@limiter.limit("20/minute")
def agent_chat(request: Request, req: AgentChatRequest, admin: Optional[dict] = Depends(get_optional_admin)):
    history = [{"role": m.role, "content": m.content.strip()} for m in req.messages if m.content.strip()]
    if not history or history[-1]["role"] != "user":
        raise HTTPException(status_code=400, detail="The last message must be a non-empty user message.")
    if len(history[-1]["content"]) > 2000:
        raise HTTPException(status_code=400, detail="Message is too long (2000 characters max).")
    result = run_agent(history, is_admin=admin is not None)
    result["access"] = "admin" if admin else "guest"
    return result

@app.post("/api/agent/tts")
@limiter.limit("30/minute")
def agent_tts(request: Request, req: AgentTTSRequest):
    try:
        audio = synthesize_speech(req.text.strip())
    except AgentUnavailable as e:
        code = 503 if str(e) == "not_configured" else 502
        raise HTTPException(status_code=code, detail="Voice synthesis is not configured." if code == 503 else "Voice synthesis is temporarily unavailable.")
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


# --- KAIROS Future Engine (admin only; every write goes through the audited ticket workflow) ---
class SignalStateRequest(BaseModel):
    state: str = Field(..., pattern="^(acknowledged|dismissed|active)$")
    fingerprint: str = Field("", max_length=64)
    note: Optional[str] = Field(None, max_length=500)

class ScenarioRequest(BaseModel):
    type: str = Field(..., pattern="^(service_outage|delay_ticket|ignore_signal)$")
    building: Optional[str] = Field(None, max_length=100)
    service: Optional[str] = Field(None, max_length=40)
    scope: str = Field("building", pattern="^(building|line)$")
    hours: int = Field(24, ge=1, le=168)
    ticket_id: Optional[str] = Field(None, max_length=30)
    signal_id: Optional[str] = Field(None, max_length=200)

class OperationalAction(BaseModel):
    type: str = Field(..., pattern="^(assign|escalate|set_status|add_note|reroute|broadcast|verify_resolution)$")
    ticket_id: Optional[str] = Field(None, max_length=30)
    owner: Optional[str] = Field(None, max_length=100)
    priority: Optional[str] = Field(None, max_length=20)
    status: Optional[str] = Field(None, max_length=20)
    department: Optional[str] = Field(None, max_length=60)
    note: Optional[str] = Field(None, max_length=2000)
    title: Optional[str] = Field(None, max_length=200)
    message: Optional[str] = Field(None, max_length=2000)
    level: Optional[str] = Field("warning", pattern="^(critical|warning|info)$")
    sector: Optional[str] = Field(None, max_length=100)

class ActionPlanRequest(BaseModel):
    actions: List[OperationalAction] = Field(..., min_length=1, max_length=25)
    reason: Optional[str] = Field(None, max_length=500)
    signal_key: Optional[str] = Field(None, max_length=200)
    signal_fingerprint: Optional[str] = Field(None, max_length=64)

def _clean_actions(req: ActionPlanRequest) -> List[dict]:
    out = []
    for a in req.actions:
        d = a.dict()
        for k in ("owner", "note", "title", "message", "sector"):
            if d.get(k):
                d[k] = sanitize_user_input(d[k], 2000)
        out.append(d)
    return out

def _admin_actor(admin: dict) -> str:
    return f"Admin ({admin.get('username', 'Operations')}) · Future Engine"

@app.get("/api/intelligence/overview")
@limiter.limit("60/minute")
def intelligence_overview(request: Request, admin: dict = Depends(get_current_admin)):
    return intelligence.overview()

@app.get("/api/intelligence/topology")
def intelligence_topology(admin: dict = Depends(get_current_admin)):
    return intelligence.topology()

@app.post("/api/intelligence/signal-state")
def intelligence_signal_state(req: SignalStateRequest, signal_id: str = Query(..., max_length=200),
                              admin: dict = Depends(get_current_admin)):
    note = sanitize_user_input(req.note, 500) if req.note else None
    intelligence.set_signal_state(signal_id, req.state, req.fingerprint, _admin_actor(admin), note)
    return {"status": "ok", "signal_id": signal_id, "state": req.state}

@app.get("/api/intelligence/signal")
def intelligence_signal(signal_id: str = Query(..., max_length=200), admin: dict = Depends(get_current_admin)):
    snap = intelligence.snapshot()
    signals = intelligence.detect_signals(snap)
    warnings = {w["id"]: w for w in intelligence.early_warnings(snap, signals)}
    sig = next((s for s in signals if s["id"] == signal_id), None)
    if not sig and signal_id not in warnings:
        raise HTTPException(status_code=404, detail="This risk signal is no longer active.")
    return {"signal": sig, "warning": warnings.get(signal_id),
            "graph": intelligence.incident_graph(snap, signal_id, signals) if sig else None}

@app.post("/api/intelligence/simulate")
@limiter.limit("30/minute")
def intelligence_simulate(request: Request, req: ScenarioRequest, admin: dict = Depends(get_current_admin)):
    try:
        return intelligence.simulate(intelligence.snapshot(), req.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/intelligence/memory")
def intelligence_memory(
    ticket_id: Optional[str] = Query(None, max_length=30),
    building: Optional[str] = Query(None, max_length=100),
    category: Optional[str] = Query(None, max_length=40),
    q: Optional[str] = Query(None, max_length=100),
    admin: dict = Depends(get_current_admin),
):
    return intelligence.campus_memory(intelligence.snapshot(), ticket_id, building, category, q)

@app.post("/api/intelligence/actions/preview")
def intelligence_preview(req: ActionPlanRequest, admin: dict = Depends(get_current_admin)):
    return intelligence.preview_actions(_clean_actions(req))

@app.post("/api/intelligence/actions/execute")
@limiter.limit("20/minute")
def intelligence_execute(request: Request, req: ActionPlanRequest, admin: dict = Depends(get_current_admin)):
    reason = sanitize_user_input(req.reason, 500) if req.reason else None
    return intelligence.execute_actions(_clean_actions(req), _admin_actor(admin), reason, req.signal_key, req.signal_fingerprint)


class DemoRequest(BaseModel):
    action: str = Field(..., pattern="^(load|clear)$")

@app.post("/api/intelligence/demo")
def intelligence_demo(req: DemoRequest, admin: dict = Depends(get_current_admin)):
    from .demo_scenario import load_demo, clear_demo
    count = load_demo() if req.action == "load" else clear_demo()
    intelligence.invalidate()
    reporter = []
    if req.action == "load":
        from .demo_scenario import DEMO_REPORTER_TICKETS
        reporter = [{"ticket_id": tid, "token": intelligence.issue_reporter_token(tid)} for tid in DEMO_REPORTER_TICKETS]
    return {"status": req.action, "tickets": count, "demo_reporter_tickets": reporter}


# --- Proof of Resolution & Reporter Reverification ---
class ResolutionConfirmRequest(BaseModel):
    confirmed: bool
    reason: Optional[str] = Field(None, pattern="^(unresolved|partial|returned|different)$")
    note: Optional[str] = Field(None, max_length=500)
    image: Optional[str] = None

class ResolutionVerifyRequest(BaseModel):
    note: Optional[str] = Field(None, max_length=500)
    image: Optional[str] = None

class ReporterTicketRef(BaseModel):
    ticket_id: str = Field(..., max_length=30)
    token: str = Field(..., max_length=100)

class ReporterTicketsRequest(BaseModel):
    tickets: List[ReporterTicketRef] = Field(..., max_length=50)

@app.get("/api/tickets/{ticket_id}/verification")
def get_verification(ticket_id: str, admin: Optional[dict] = Depends(get_optional_admin),
                     x_reporter_token: Optional[str] = Header(None)):
    tid = ticket_id.upper()[:30]
    # Reporter comments and dispute photos are only shown to the reporter (credential) or an administrator
    private = admin is not None or intelligence.check_reporter_token(tid, x_reporter_token)
    result = intelligence.ticket_verification(tid, include_private=private, admin_view=admin is not None)
    if not result:
        raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")
    return result

@app.post("/api/tickets/{ticket_id}/confirm-resolution")
@limiter.limit("10/minute")
def confirm_resolution(request: Request, ticket_id: str, req: ResolutionConfirmRequest,
                       x_reporter_token: Optional[str] = Header(None)):
    tid = ticket_id.upper()[:30]
    image = validate_and_sanitize_image(req.image) if (req.image and not req.confirmed) else None
    note = sanitize_user_input(req.note, 500) if req.note else None
    try:
        return intelligence.reporter_respond(tid, x_reporter_token, req.confirmed, req.reason, note, image)
    except intelligence.ReverificationError as e:
        raise HTTPException(status_code=e.status, detail=str(e))

@app.post("/api/reporter/tickets")
@limiter.limit("30/minute")
def reporter_ticket_status(request: Request, req: ReporterTicketsRequest):
    return {"tickets": intelligence.reporter_tickets([t.dict() for t in req.tickets])}

@app.post("/api/tickets/{ticket_id}/verify")
def verify_resolution(ticket_id: str, req: ResolutionVerifyRequest, admin: dict = Depends(get_current_admin)):
    tid = ticket_id.upper()[:30]
    ticket = fetch_ticket_by_id(tid)
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {tid} not found")
    if ticket["status"] not in ("Resolved", "Closed"):
        raise HTTPException(status_code=400, detail="Only resolved tickets can be verified.")
    image = validate_and_sanitize_image(req.image)
    note = sanitize_user_input(req.note, 500) if req.note else None
    intelligence.record_verification(tid, "admin_verified", f"Admin ({admin.get('username', 'Operations')})", note, image)
    return intelligence.ticket_verification(tid, include_private=True, admin_view=True)


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



