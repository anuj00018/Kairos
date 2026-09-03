# KAIROS: Next-Gen Autonomous Campus Grievance & Facility Resolution Engine

KAIROS is an enterprise-grade, real-time campus operational intelligence and grievance resolution system. It merges multimodal AI intake with automated triage, dynamic priority scoring, SLA countdown tracking, role-based admin incident dispatch, and interactive campus 3D visualizations.

---

## Key Features

1. **Multimodal Student Grievance Intake**:
   - Instant issue capture with image attachment support.
   - Intelligent auto-tagging, location binding, and automated ticket generation (`GRV-XXXX`).
   - Public live status tracking and resolution verification.

2. **Autonomous AI Triage & Classification**:
   - Dual-engine triage: Google Gemini multimodal API + high-speed deterministic heuristic fallback.
   - Automatic category assignment (`Infrastructure`, `Sanitation`, `Hostel`, `Academics`, `Security`, etc.).
   - Life-safety hazard auto-escalation to `CRITICAL` priority.

3. **Operations Command Center (Admin)**:
   - Real-time incident queue filtering by status, priority, and department.
   - Single-click and bulk status updates (`New` → `In Progress` → `Resolved`).
   - Ownership assignment and technician dispatch notes.
   - Campus emergency broadcasts with priority levels.

4. **SLA Engine & Immutable Audit Logs**:
   - Priority-based SLA countdown timer with breach detection.
   - Cryptographic timestamp recording for resolution and turnaround time computation.
   - Detailed activity audit trail for compliance and reporting.

5. **Operational Analytics Pulse**:
   - Live metrics: Open tickets, SLA compliance rate, average MTTR, and resolution rate.
   - Departmental and category load distribution charts.

---

## Technology Stack

- **Frontend**: React 19, Vite, Lucide Icons, Canvas 3D rendering, Tailwind/Vanilla CSS.
- **Backend**: FastAPI (Python 3.11+), Pydantic v2, SlowAPI (rate limiting).
- **Security**: JWT bearer authentication, Passlib Bcrypt password hashing, session revocation.
- **Database**: PostgreSQL (Production / Supabase) / SQLite (Local prototyping).
- **AI Engine**: Google Gemini API (`gemini-1.5-flash`) with heuristic fallback.

---

## Local Development Quickstart

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+

### 1. Backend Setup
```bash
# Navigate to project directory
cd resolveai

# Create virtual environment and install dependencies
python -m venv .venv
.\.venv\Scripts\activate  # Windows (or source .venv/bin/activate on Linux/Mac)
pip install -r requirements.txt

# Configure environment variables
copy .env.example backend\.env

# Run backend API server
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
API Documentation will be accessible at: `http://127.0.0.1:8000/docs`

### 2. Frontend Setup
```bash
# In a separate terminal
npm install
npm run dev
```
KAIROS portal will be accessible at: `http://localhost:5173`

---

## Automated Verification Suite

Run the full 10-step end-to-end verification suite against the running backend:
```bash
python tests/verify_e2e.py
```

---

## Production Deployment

- **Backend (Render)**: Connect repo to Render using [`render.yaml`](./render.yaml). Set `DATABASE_URL` (Supabase) and `SECRET_KEY`.
- **Frontend (Vercel)**: Connect repo to Vercel using [`vercel.json`](./vercel.json). Build command: `npm run build`, output: `dist`.
- **Database (Supabase)**: Create a PostgreSQL project at [supabase.com](https://supabase.com) and paste the connection URI into `DATABASE_URL`.
