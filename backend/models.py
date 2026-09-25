import re
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
from datetime import datetime

def sanitize_user_input(v: Optional[str], max_len: int = 5000) -> Optional[str]:
    """Strip HTML tags, control characters, and enforce maximum length."""
    if v is None:
        return None
    # Strip HTML tags
    cleaned = re.sub(r'<[^>]+>', '', str(v))
    # Normalize excessive whitespaces but preserve formatting
    cleaned = cleaned.strip()
    return cleaned[:max_len]

class CategoryEnum(str, Enum):
    WATER = "Water"
    ELECTRICAL = "Electrical"
    SECURITY = "Security"
    SANITATION = "Sanitation"
    INFRASTRUCTURE = "Infrastructure"
    NETWORK = "Network"

class PriorityEnum(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

class DepartmentEnum(str, Enum):
    FACILITIES = "Facilities"
    ELECTRICAL_MAINTENANCE = "Electrical Maintenance"
    SECURITY = "Security"
    HOUSEKEEPING = "Housekeeping"
    IT_INFRASTRUCTURE = "IT Infrastructure"
    HOSTEL_ADMIN = "Hostel Administration"

class StatusEnum(str, Enum):
    NEW = "New"
    ASSIGNED = "Assigned"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    CLOSED = "Closed"

PRIORITY_SLA_HOURS = {
    PriorityEnum.CRITICAL: 2,
    PriorityEnum.HIGH: 12,
    PriorityEnum.MEDIUM: 24,
    PriorityEnum.LOW: 48,
}

# Valid status transitions (current -> allowed next states)
VALID_STATUS_TRANSITIONS = {
    StatusEnum.NEW: {StatusEnum.ASSIGNED, StatusEnum.IN_PROGRESS, StatusEnum.RESOLVED, StatusEnum.CLOSED},
    StatusEnum.ASSIGNED: {StatusEnum.NEW, StatusEnum.IN_PROGRESS, StatusEnum.RESOLVED, StatusEnum.CLOSED},
    StatusEnum.IN_PROGRESS: {StatusEnum.ASSIGNED, StatusEnum.RESOLVED, StatusEnum.CLOSED},
    StatusEnum.RESOLVED: {StatusEnum.IN_PROGRESS, StatusEnum.ASSIGNED, StatusEnum.CLOSED},
    StatusEnum.CLOSED: {StatusEnum.IN_PROGRESS, StatusEnum.ASSIGNED, StatusEnum.NEW},
}

# --- Auth Models ---
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100, description="Admin Email or Username")
    password: str = Field(..., min_length=1, max_length=200, description="Admin Password")

    @field_validator("username")
    @classmethod
    def sanitize_username(cls, v: str) -> str:
        return sanitize_user_input(v, 100) or ""

class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)

class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    role: str
    department: str
    badge_id: str
    avatar_initials: str

class LoginResponse(BaseModel):
    token: str
    user: UserProfile
    permissions: List[str]
    login_time: str

# --- Triage & Ticket Models ---
class TriageRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=5000, description="Full description of the grievance")
    location: str = Field(..., min_length=2, max_length=200, description="Campus location")
    image: Optional[str] = Field(None, max_length=10_000_000, description="Optional image data URL or file reference")

    @field_validator("description")
    @classmethod
    def sanitize_desc(cls, v: str) -> str:
        return sanitize_user_input(v, 5000) or ""

    @field_validator("location")
    @classmethod
    def sanitize_loc(cls, v: str) -> str:
        return sanitize_user_input(v, 200) or ""

class TriageResult(BaseModel):
    title: str = Field(..., max_length=100)
    category: CategoryEnum
    priority: PriorityEnum
    department: DepartmentEnum
    summary: str
    recommended_action: str
    priority_rationale: str
    sla_hours: int
    triage_source: str = "ai"

class TicketCreateRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=5000)
    location: str = Field(..., min_length=2, max_length=200)
    image: Optional[str] = Field(None, max_length=10_000_000)
    title: Optional[str] = Field(None, max_length=200)
    category: Optional[CategoryEnum] = None
    priority: Optional[PriorityEnum] = None
    department: Optional[DepartmentEnum] = None
    summary: Optional[str] = Field(None, max_length=500)
    recommended_action: Optional[str] = Field(None, max_length=500)
    priority_rationale: Optional[str] = Field(None, max_length=500)

    @field_validator("description")
    @classmethod
    def sanitize_desc(cls, v: str) -> str:
        return sanitize_user_input(v, 5000) or ""

    @field_validator("location")
    @classmethod
    def sanitize_loc(cls, v: str) -> str:
        return sanitize_user_input(v, 200) or ""

    @field_validator("title", "summary", "recommended_action", "priority_rationale")
    @classmethod
    def sanitize_optional_fields(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_user_input(v, 500)

class TicketUpdateRequest(BaseModel):
    status: Optional[StatusEnum] = None
    owner: Optional[str] = Field(None, max_length=100)
    priority: Optional[PriorityEnum] = None
    category: Optional[CategoryEnum] = None
    department: Optional[DepartmentEnum] = None
    comment: Optional[str] = Field(None, max_length=2000)

    @field_validator("owner", "comment")
    @classmethod
    def sanitize_updates(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_user_input(v, 2000)

class BulkTicketUpdateRequest(BaseModel):
    ticket_ids: List[str]
    status: Optional[StatusEnum] = None
    owner: Optional[str] = None
    department: Optional[DepartmentEnum] = None
    comment: Optional[str] = None

    @field_validator("ticket_ids")
    @classmethod
    def validate_ticket_ids(cls, v: List[str]) -> List[str]:
        return [sanitize_user_input(t_id, 30) for t_id in v if t_id]

    @field_validator("owner", "comment")
    @classmethod
    def sanitize_bulk_text(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_user_input(v, 2000)

class ActivityLogItem(BaseModel):
    id: int
    ticket_id: str
    action: str
    actor: str
    created_at: str
    timestamp_iso: Optional[str] = None
    event_type: Optional[str] = "General"
    sha256_hash: Optional[str] = None
    notes: Optional[str] = None
    ticket_title: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None

class Ticket(BaseModel):
    id: str
    title: str
    description: str
    location: str
    category: CategoryEnum
    priority: PriorityEnum
    department: DepartmentEnum
    status: StatusEnum
    owner: str
    sla_hours: int
    created_at: str
    created_at_raw: Optional[str] = None
    resolved_at: Optional[str] = None
    resolved_at_raw: Optional[str] = None
    image: Optional[str] = None
    summary: str
    action: str
    priority_rationale: str
    due: str
    is_breached: bool
    activity: List[ActivityLogItem] = []
    reporter_token: Optional[str] = None  # returned only once, to the submitter, on creation

# --- Broadcast Alerts ---
class BroadcastAlert(BaseModel):
    id: str
    title: str
    message: str
    level: str  # 'critical', 'warning', 'info'
    sector: Optional[str] = "Campus-Wide"
    active: bool = True
    created_at: str
    created_by: str

class CreateBroadcastRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=2000)
    level: str = Field("warning", pattern="^(critical|warning|info)$")
    sector: Optional[str] = Field("Campus-Wide", max_length=100)

    @field_validator("title", "message", "sector")
    @classmethod
    def sanitize_broadcast(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_user_input(v, 2000)

# --- Operational Analytics ---
class MetricStats(BaseModel):
    open_tickets: int
    critical_action: int
    sla_breached: int
    resolved_today: int
    sla_compliance_rate: float = 94.2
    avg_mttr_hours: float = 3.6
    resolution_rate: float = 0.0

class PulseBar(BaseModel):
    label: str
    value: int
    percentage: float

class PulseLocation(BaseModel):
    location: str
    count: int
    top_category: str

class FacilityHealth(BaseModel):
    facility: str
    active_count: int
    critical_count: int
    status: str  # 'Nominal', 'Attention', 'Critical'
    primary_category: str

class VelocityPoint(BaseModel):
    day: str
    reported: int
    resolved: int

class AnalyticsResponse(BaseModel):
    metrics: MetricStats
    department_distribution: List[PulseBar]
    location_hotspots: List[PulseLocation]
    category_distribution: List[PulseBar] = []
    priority_distribution: List[PulseBar] = []
    staff_workload: List[PulseBar] = []
    facility_health_matrix: List[FacilityHealth] = []
    velocity_trend: List[VelocityPoint] = []
    total_tickets: int



