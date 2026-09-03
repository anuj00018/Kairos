import os
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any

# Attempt PostgreSQL connection via psycopg2
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

PG_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:password@127.0.0.1:5432/kairos")
_DEFAULT_SQLITE = os.path.join(os.path.dirname(__file__), "kairos.db")
_LEGACY_SQLITE = os.path.join(os.path.dirname(__file__), "resolveai.db")
SQLITE_PATH = _LEGACY_SQLITE if os.path.exists(_LEGACY_SQLITE) and not os.path.exists(_DEFAULT_SQLITE) else _DEFAULT_SQLITE

_ACTIVE_ENGINE = None

def get_connection():
    """
    Returns a tuple (connection, engine_type) where engine_type is 'postgresql' or 'sqlite'.
    Prefers PostgreSQL 18 on 127.0.0.1:5432, falling back to SQLite if PostgreSQL is unavailable.
    """
    global _ACTIVE_ENGINE
    if PSYCOPG2_AVAILABLE:
        try:
            conn = psycopg2.connect(PG_URL, connect_timeout=3)
            conn.autocommit = False
            _ACTIVE_ENGINE = "postgresql"
            return conn, "postgresql"
        except Exception as e:
            # Fall back to SQLite
            pass

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    _ACTIVE_ENGINE = "sqlite"
    return conn, "sqlite"

def get_engine_status() -> Dict[str, Any]:
    conn, engine = get_connection()
    status = {
        "engine": engine,
        "is_postgres": engine == "postgresql",
        "url": PG_URL if engine == "postgresql" else f"sqlite:///{SQLITE_PATH}",
        "connected": True
    }
    conn.close()
    return status

def init_db():
    conn, engine = get_connection()
    cursor = conn.cursor()

    if engine == "postgresql":
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            location TEXT NOT NULL,
            category TEXT NOT NULL,
            priority TEXT NOT NULL,
            department TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'New',
            owner TEXT DEFAULT 'Unassigned',
            sla_hours INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            image TEXT,
            summary TEXT NOT NULL,
            action TEXT NOT NULL,
            priority_rationale TEXT NOT NULL
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id SERIAL PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL,
            created_at TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS broadcast_alerts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT 'warning',
            sector TEXT DEFAULT 'Campus-Wide',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL
        );
        """)
        conn.commit()
    else:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            location TEXT NOT NULL,
            category TEXT NOT NULL,
            priority TEXT NOT NULL,
            department TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'New',
            owner TEXT DEFAULT 'Unassigned',
            sla_hours INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            image TEXT,
            summary TEXT NOT NULL,
            action TEXT NOT NULL,
            priority_rationale TEXT NOT NULL
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL,
            created_at TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS broadcast_alerts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT 'warning',
            sector TEXT DEFAULT 'Campus-Wide',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL
        );
        """)
        conn.commit()

    # Automatically populate seed data if tickets table is empty (Clean Start)
    try:
        placeholder = "%s" if engine == "postgresql" else "?"
        cursor.execute("SELECT COUNT(*) as count FROM tickets")
        r_count = cursor.fetchone()
        total_tickets = r_count["count"] if isinstance(r_count, dict) else r_count[0]

        if total_tickets == 0:
            from .seed_data import SEED_TICKETS
            now = datetime.now(timezone.utc)

            insert_ticket_sql = f"""
            INSERT INTO tickets (
                id, title, description, location, category, priority, department,
                status, owner, sla_hours, created_at, resolved_at, image,
                summary, action, priority_rationale
            ) VALUES ({', '.join([placeholder]*16)})
            """

            insert_act_sql = f"""
            INSERT INTO activity_logs (ticket_id, action, actor, created_at, notes)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """

            for t in SEED_TICKETS:
                created_dt = now - timedelta(hours=t.get("created_offset_hours", 4.0))
                created_iso = created_dt.isoformat()

                resolved_iso = None
                if t.get("status") in ["Resolved", "Closed"]:
                    res_acts = [a for a in t.get("activities", []) if any(k in a.get("action", "").lower() for k in ["resolve", "complete", "cleared", "restored", "replaced"])]
                    res_offset = res_acts[-1].get("offset_hours") if res_acts else max(0.5, t.get("created_offset_hours", 4.0) * 0.5)
                    resolved_iso = (now - timedelta(hours=res_offset)).isoformat()

                cursor.execute(insert_ticket_sql, (
                    t["id"], t["title"], t["description"], t["location"],
                    t["category"], t["priority"], t["department"], t["status"],
                    t["owner"], t["sla_hours"], created_iso, resolved_iso,
                    t.get("image"), t["summary"], t["action"], t["priority_rationale"]
                ))

                for act in t.get("activities", []):
                    act_dt = now - timedelta(hours=act.get("offset_hours", t.get("created_offset_hours", 4.0)))
                    act_iso = act_dt.isoformat()
                    cursor.execute(insert_act_sql, (
                        t["id"], act["action"], act["actor"], act_iso, None
                    ))

            # Populate initial campus broadcast alerts
            cursor.execute("SELECT COUNT(*) as count FROM broadcast_alerts")
            r_b = cursor.fetchone()
            b_count = r_b["count"] if isinstance(r_b, dict) else r_b[0]
            if b_count == 0:
                insert_alert_sql = f"""
                INSERT INTO broadcast_alerts (id, title, message, level, sector, active, created_at, created_by)
                VALUES ({', '.join([placeholder]*8)})
                """
                cursor.execute(insert_alert_sql, (
                    "ALERT-01",
                    "CSE Block Ground Floor Main Water Valve Isolated",
                    "Emergency plumbing crew active outside CSE Block. Main entry doorway caution signs active. Expected resolution within 4 hours.",
                    "warning",
                    "CSE Block",
                    1,
                    (now - timedelta(hours=2)).isoformat(),
                    "Facilities Safety Operations"
                ))
                cursor.execute(insert_alert_sql, (
                    "ALERT-02",
                    "Central Library Elevator B Maintenance Notice",
                    "Passenger Elevator B interlock recalibration completed by OEM service team. Full operational service restored.",
                    "info",
                    "Central Library",
                    1,
                    (now - timedelta(hours=5)).isoformat(),
                    "Lead Administrator"
                ))

            conn.commit()
    except Exception as e:
        print(f"[Database] Notice during seed initialization: {e}")

    conn.close()

def format_relative_time(dt_str: str) -> str:
    if not dt_str:
        return "Unknown"
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff = now - dt
        seconds = diff.total_seconds()
        
        if seconds < 60:
            return "Just now"
        elif seconds < 3600:
            mins = int(seconds / 60)
            return f"{mins}m ago"
        elif seconds < 86400:
            hours = int(seconds / 3600)
            return f"Today, {dt.strftime('%H:%M')}"
        elif seconds < 172800:
            return f"Yesterday, {dt.strftime('%H:%M')}"
        else:
            days = int(seconds / 86400)
            return f"{days} days ago"
    except Exception:
        return dt_str

def calculate_sla_status(created_at_str: str, sla_hours: int, status: str, resolved_at: Optional[str] = None):
    try:
        created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        due_at = created_at + timedelta(hours=sla_hours)
        
        if status in ["Resolved", "Closed"]:
            if resolved_at:
                return f"Resolved ({resolved_at})", False
            return "Resolved", False
            
        remaining_seconds = (due_at - now).total_seconds()
        
        if remaining_seconds < 0:
            breach_hours = abs(int(remaining_seconds / 3600))
            breach_mins = abs(int((remaining_seconds % 3600) / 60))
            if breach_hours > 0:
                return f"SLA breached by {breach_hours}h {breach_mins}m", True
            return f"SLA breached by {breach_mins}m", True
        else:
            rem_hours = int(remaining_seconds / 3600)
            rem_mins = int((remaining_seconds % 3600) / 60)
            if rem_hours > 24:
                return "Due tomorrow", False
            elif rem_hours > 0:
                return f"Due in {rem_hours}h {rem_mins}m", False
            else:
                return f"Due in {rem_mins}m", False
    except Exception:
        return f"Due in {sla_hours}h", False

def fetch_all_tickets(status_filter: Optional[str] = None, priority_filter: Optional[str] = None, department_filter: Optional[str] = None):
    conn, engine = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor) if engine == "postgresql" else conn.cursor()
    placeholder = "%s" if engine == "postgresql" else "?"

    query = "SELECT * FROM tickets WHERE 1=1"
    params = []

    if status_filter and status_filter != "All":
        query += f" AND status = {placeholder}"
        params.append(status_filter)

    if priority_filter and priority_filter != "All":
        query += f" AND priority = {placeholder}"
        params.append(priority_filter)

    if department_filter and department_filter != "All":
        query += f" AND department = {placeholder}"
        params.append(department_filter)

    query += " ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, created_at DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()

    results = []
    for r in rows:
        r_dict = dict(r)
        due_str, is_breached = calculate_sla_status(r_dict["created_at"], r_dict["sla_hours"], r_dict["status"], r_dict["resolved_at"])

        # Fetch activities for ticket
        act_query = f"SELECT * FROM activity_logs WHERE ticket_id = {placeholder} ORDER BY id ASC"
        cursor.execute(act_query, (r_dict["id"],))
        acts = cursor.fetchall()
        activity_list = [
            {
                "id": a["id"],
                "ticket_id": a["ticket_id"],
                "action": a["action"],
                "actor": a["actor"],
                "created_at": format_relative_time(a["created_at"]),
                "notes": a.get("notes") if isinstance(a, dict) else a["notes"]
            }
            for a in [dict(item) for item in acts]
        ]

        results.append({
            "id": r_dict["id"],
            "title": r_dict["title"],
            "description": r_dict["description"],
            "location": r_dict["location"],
            "category": r_dict["category"],
            "priority": r_dict["priority"],
            "department": r_dict["department"],
            "status": r_dict["status"],
            "owner": r_dict["owner"],
            "sla_hours": r_dict["sla_hours"],
            "created_at": format_relative_time(r_dict["created_at"]),
            "created_at_raw": r_dict["created_at"],
            "resolved_at": format_relative_time(r_dict["resolved_at"]) if (r_dict["resolved_at"] and "T" in str(r_dict["resolved_at"])) else r_dict["resolved_at"],
            "resolved_at_raw": r_dict["resolved_at"],
            "image": r_dict["image"],
            "summary": r_dict["summary"],
            "action": r_dict["action"],
            "priority_rationale": r_dict["priority_rationale"],
            "due": due_str,
            "is_breached": is_breached,
            "activity": activity_list
        })

    conn.close()
    return results

def fetch_ticket_by_id(ticket_id: str):
    conn, engine = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor) if engine == "postgresql" else conn.cursor()
    placeholder = "%s" if engine == "postgresql" else "?"

    cursor.execute(f"SELECT * FROM tickets WHERE id = {placeholder}", (ticket_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    r = dict(row)
    due_str, is_breached = calculate_sla_status(r["created_at"], r["sla_hours"], r["status"], r["resolved_at"])

    cursor.execute(f"SELECT * FROM activity_logs WHERE ticket_id = {placeholder} ORDER BY id ASC", (ticket_id,))
    acts = cursor.fetchall()
    activity_list = [
        {
            "id": a["id"],
            "ticket_id": a["ticket_id"],
            "action": a["action"],
            "actor": a["actor"],
            "created_at": format_relative_time(a["created_at"]),
            "notes": a.get("notes") if isinstance(a, dict) else a["notes"]
        }
        for a in [dict(item) for item in acts]
    ]

    ticket = {
        "id": r["id"],
        "title": r["title"],
        "description": r["description"],
        "location": r["location"],
        "category": r["category"],
        "priority": r["priority"],
        "department": r["department"],
        "status": r["status"],
        "owner": r["owner"],
        "sla_hours": r["sla_hours"],
        "created_at": format_relative_time(r["created_at"]),
        "created_at_raw": r["created_at"],
        "resolved_at": format_relative_time(r["resolved_at"]) if (r["resolved_at"] and "T" in str(r["resolved_at"])) else r["resolved_at"],
        "resolved_at_raw": r["resolved_at"],
        "image": r["image"],
        "summary": r["summary"],
        "action": r["action"],
        "priority_rationale": r["priority_rationale"],
        "due": due_str,
        "is_breached": is_breached,
        "activity": activity_list
    }
    conn.close()
    return ticket

def insert_ticket(data: Dict[str, Any]) -> str:
    conn, engine = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor) if engine == "postgresql" else conn.cursor()
    placeholder = "%s" if engine == "postgresql" else "?"

    cursor.execute("SELECT COUNT(*) as count FROM tickets")
    r_count = cursor.fetchone()
    total = r_count["count"] if isinstance(r_count, dict) else r_count[0]
    ticket_id = f"GRV-{1050 + total}"

    now_iso = datetime.now(timezone.utc).isoformat()

    insert_sql = f"""
    INSERT INTO tickets (
        id, title, description, location, category, priority, department,
        status, owner, sla_hours, created_at, resolved_at, image,
        summary, action, priority_rationale
    ) VALUES ({', '.join([placeholder]*16)})
    """

    cursor.execute(insert_sql, (
        ticket_id, data["title"], data["description"], data["location"],
        data["category"], data["priority"], data["department"], "New",
        "Unassigned", data["sla_hours"], now_iso, None, data.get("image"),
        data["summary"], data["recommended_action"], data["priority_rationale"]
    ))

    act_sql = f"""
    INSERT INTO activity_logs (ticket_id, action, actor, created_at)
    VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})
    """
    cursor.execute(act_sql, (ticket_id, "Complaint submitted through KAIROS portal", "Student / Complainant", now_iso))
    cursor.execute(act_sql, (ticket_id, f"KAIROS classified as {data['category']} ({data['priority']}) and routed to {data['department']}", "KAIROS Triage", now_iso))

    conn.commit()
    conn.close()
    return ticket_id

def update_ticket_record(ticket_id: str, updates: Dict[str, Any], actor: str = "Admin") -> bool:
    conn, engine = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor) if engine == "postgresql" else conn.cursor()
    placeholder = "%s" if engine == "postgresql" else "?"

    cursor.execute(f"SELECT * FROM tickets WHERE id = {placeholder}", (ticket_id,))
    ticket_row = cursor.fetchone()
    if not ticket_row:
        conn.close()
        return False

    ticket = dict(ticket_row)
    set_clauses = []
    params = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for key, raw_val in updates.items():
        if raw_val is not None and key in ["status", "owner", "priority", "category", "department"]:
            val = raw_val.value if hasattr(raw_val, "value") else str(raw_val)
            
            # Avoid duplicate logs if value did not change
            if str(val).strip() == str(ticket.get(key, '')).strip():
                continue

            # Validate status transitions
            if key == "status":
                from .models import StatusEnum, VALID_STATUS_TRANSITIONS
                try:
                    current_status = StatusEnum(ticket.get("status", "New"))
                    new_status = StatusEnum(val)
                    allowed = VALID_STATUS_TRANSITIONS.get(current_status, set())
                    if new_status not in allowed:
                        conn.close()
                        return False  # Invalid transition
                except ValueError:
                    conn.close()
                    return False

            set_clauses.append(f"{key} = {placeholder}")
            params.append(val)

            act_sql = f"""
            INSERT INTO activity_logs (ticket_id, action, actor, created_at)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})
            """

            if key == "status":
                if val == "Resolved":
                    set_clauses.append(f"resolved_at = {placeholder}")
                    params.append(now_iso)
                else:
                    set_clauses.append(f"resolved_at = {placeholder}")
                    params.append(None)
                cursor.execute(act_sql, (ticket_id, f"Status updated from '{ticket['status']}' to '{val}'", actor, now_iso))
            elif key == "owner":
                cursor.execute(act_sql, (ticket_id, f"Assigned owner to '{val}'", actor, now_iso))
            elif key == "priority":
                cursor.execute(act_sql, (ticket_id, f"Priority changed to '{val}'", actor, now_iso))
            elif key == "department":
                cursor.execute(act_sql, (ticket_id, f"Re-routed to department '{val}'", actor, now_iso))

    comment_text = updates.get("comment")
    if comment_text and str(comment_text).strip():
        # Prevent identical consecutive notes on same ticket
        cursor.execute(f"SELECT action FROM activity_logs WHERE ticket_id = {placeholder} ORDER BY id DESC LIMIT 1", (ticket_id,))
        last_log = cursor.fetchone()
        last_act = (last_log["action"] if isinstance(last_log, dict) else last_log[0]) if last_log else None
        new_act = f"Note: {str(comment_text).strip()}"
        if last_act != new_act:
            note_sql = f"""
            INSERT INTO activity_logs (ticket_id, action, actor, created_at, notes)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """
            cursor.execute(note_sql, (ticket_id, new_act, actor, now_iso, str(comment_text).strip()))

    if set_clauses:
        params.append(ticket_id)
        cursor.execute(f"UPDATE tickets SET {', '.join(set_clauses)} WHERE id = {placeholder}", params)

    conn.commit()
    conn.close()
    return True

def bulk_update_tickets(ticket_ids: List[str], updates: Dict[str, Any], actor: str = "Admin") -> int:
    success_count = 0
    for tid in ticket_ids:
        if update_ticket_record(tid, updates, actor=actor):
            success_count += 1
    return success_count

def get_broadcast_alerts(active_only: bool = True) -> List[Dict[str, Any]]:
    conn, engine = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor) if engine == "postgresql" else conn.cursor()

    if active_only:
        cursor.execute("SELECT * FROM broadcast_alerts WHERE active = 1 ORDER BY created_at DESC")
    else:
        cursor.execute("SELECT * FROM broadcast_alerts ORDER BY created_at DESC")

    rows = cursor.fetchall()
    results = [
        {
            "id": r["id"],
            "title": r["title"],
            "message": r["message"],
            "level": r["level"],
            "sector": r["sector"],
            "active": bool(r["active"]),
            "created_at": format_relative_time(r["created_at"]),
            "created_by": r["created_by"]
        }
        for r in [dict(item) for item in rows]
    ]
    conn.close()
    return results

def create_broadcast_alert(data: Dict[str, Any], creator: str = "Admin") -> str:
    conn, engine = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor) if engine == "postgresql" else conn.cursor()
    placeholder = "%s" if engine == "postgresql" else "?"

    cursor.execute("SELECT COUNT(*) as count FROM broadcast_alerts")
    r_count = cursor.fetchone()
    count = r_count["count"] if isinstance(r_count, dict) else r_count[0]
    alert_id = f"ALERT-{count + 1:02d}"
    now_iso = datetime.now(timezone.utc).isoformat()

    cursor.execute(f"""
    INSERT INTO broadcast_alerts (id, title, message, level, sector, active, created_at, created_by)
    VALUES ({', '.join([placeholder]*7)})
    """, (
        alert_id,
        data["title"],
        data["message"],
        data.get("level", "warning"),
        data.get("sector", "Campus-Wide"),
        1,
        now_iso,
        creator
    ))
    conn.commit()
    conn.close()
    return alert_id

def dismiss_broadcast_alert(alert_id: str) -> bool:
    conn, engine = get_connection()
    cursor = conn.cursor()
    placeholder = "%s" if engine == "postgresql" else "?"
    cursor.execute(f"UPDATE broadcast_alerts SET active = 0 WHERE id = {placeholder}", (alert_id,))
    conn.commit()
    conn.close()
    return True

def get_all_audit_logs(limit: int = 100) -> List[Dict[str, Any]]:
    import hashlib
    conn, engine = get_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor) if engine == "postgresql" else conn.cursor()
    placeholder = "%s" if engine == "postgresql" else "?"

    cursor.execute(f"""
    SELECT a.*, t.title as ticket_title, t.location, t.category 
    FROM activity_logs a 
    LEFT JOIN tickets t ON a.ticket_id = t.id 
    ORDER BY a.id DESC LIMIT {placeholder}
    """, (limit,))
    rows = cursor.fetchall()
    logs = []
    last_item_key = None
    for r in [dict(item) for item in rows]:
        act_text = r.get("action", "").strip()
        # Deduplicate consecutive identical actions on same ticket
        item_key = (r.get("ticket_id"), act_text)
        if item_key == last_item_key:
            continue
        last_item_key = item_key

        # Classify event type
        if "Status updated" in act_text or "Resolved" in act_text:
            event_type = "Status Transition"
        elif "Assigned owner" in act_text:
            event_type = "Staff Assignment"
        elif "Note:" in act_text:
            event_type = "Admin Directive"
        elif "classified as" in act_text:
            event_type = "AI Autonomous Triage"
        elif "submitted through" in act_text:
            event_type = "Grievance Intake"
        elif "Re-routed" in act_text:
            event_type = "Department Re-route"
        else:
            event_type = "Operational Event"

        # Generate cryptographic proof hash
        raw_sig = f"{r.get('id')}:{r.get('ticket_id')}:{r.get('created_at')}:{act_text}"
        proof_hash = f"SHA256:{hashlib.sha256(raw_sig.encode()).hexdigest()[:16].upper()}"

        logs.append({
            "id": r["id"],
            "ticket_id": r["ticket_id"],
            "ticket_title": r.get("ticket_title") or f"Ticket {r['ticket_id']}",
            "location": r.get("location") or "Campus",
            "category": r.get("category") or "General",
            "action": act_text,
            "actor": r["actor"],
            "created_at": format_relative_time(r["created_at"]),
            "timestamp_iso": r["created_at"],
            "event_type": event_type,
            "sha256_hash": proof_hash,
            "notes": r.get("notes")
        })
    conn.close()
    return logs

def clear_all_tickets_data():
    conn, engine = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM activity_logs")
    cursor.execute("DELETE FROM tickets")
    conn.commit()
    conn.close()

def get_analytics_data() -> Dict[str, Any]:
    tickets = fetch_all_tickets()
    total = len(tickets)

    open_tickets = [t for t in tickets if t["status"] not in ["Resolved", "Closed"]]
    critical_action = [t for t in open_tickets if t["priority"] == "Critical"]
    sla_breached = [t for t in open_tickets if t["is_breached"]]
    resolved_today = [t for t in tickets if t["status"] in ["Resolved", "Closed"]]

    compliance_rate = round(((total - len(sla_breached)) / total) * 100, 1) if total > 0 else 100.0
    resolution_rate = round((len(resolved_today) / total) * 100, 1) if total > 0 else 0.0

    # Calculate actual MTTR from resolved tickets
    mttr_samples = []
    for t in resolved_today:
        c_raw = t.get("created_at_raw") or t.get("created_at")
        r_raw = t.get("resolved_at_raw") or t.get("resolved_at")
        if c_raw and r_raw:
            try:
                c_dt = datetime.fromisoformat(str(c_raw).replace("Z", "+00:00"))
                r_dt = datetime.fromisoformat(str(r_raw).replace("Z", "+00:00"))
                diff_h = max(0.2, (r_dt - c_dt).total_seconds() / 3600)
                mttr_samples.append(diff_h)
            except Exception:
                pass
    avg_mttr = round(sum(mttr_samples) / len(mttr_samples), 1) if mttr_samples else 2.8

    # Department breakdown
    dept_counts: Dict[str, int] = {}
    for t in tickets:
        dept_counts[t["department"]] = dept_counts.get(t["department"], 0) + 1

    max_dept = max(dept_counts.values()) if dept_counts else 1
    department_distribution = [
        {
            "label": dept,
            "value": count,
            "percentage": round((count / max_dept) * 100, 1)
        }
        for dept, count in sorted(dept_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Category breakdown
    cat_counts: Dict[str, int] = {}
    for t in tickets:
        cat = t.get("category", "General")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    max_cat = max(cat_counts.values()) if cat_counts else 1
    category_distribution = [
        {
            "label": cat,
            "value": count,
            "percentage": round((count / max_cat) * 100, 1)
        }
        for cat, count in sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Priority breakdown
    pri_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for t in tickets:
        p = t.get("priority", "Medium")
        if p in pri_counts:
            pri_counts[p] += 1
    max_pri = max(pri_counts.values()) if any(pri_counts.values()) else 1
    priority_distribution = [
        {
            "label": p,
            "value": count,
            "percentage": round((count / max_pri) * 100, 1)
        }
        for p, count in pri_counts.items()
    ]

    # Staff workload breakdown
    staff_counts: Dict[str, int] = {}
    for t in tickets:
        owner = t.get("owner") or "Unassigned"
        staff_counts[owner] = staff_counts.get(owner, 0) + 1
    max_staff = max(staff_counts.values()) if staff_counts else 1
    staff_workload = [
        {
            "label": owner,
            "value": count,
            "percentage": round((count / max_staff) * 100, 1)
        }
        for owner, count in sorted(staff_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Location hotspots
    loc_counts: Dict[str, List[str]] = {}
    for t in tickets:
        loc = t["location"]
        if loc not in loc_counts:
            loc_counts[loc] = []
        loc_counts[loc].append(t["category"])

    location_hotspots = []
    for loc, cats in sorted(loc_counts.items(), key=lambda x: len(x[1]), reverse=True)[:6]:
        top_cat = max(set(cats), key=cats.count)
        location_hotspots.append({
            "location": loc,
            "count": len(cats),
            "top_category": top_cat
        })

    # Facility Health Matrix
    major_facilities = [
        "CSE Block, 2nd Floor Labs",
        "North Hostel Walkway",
        "Central Library, Reading Room",
        "Sports Complex & Gymnasium",
        "Central Cafeteria",
        "Mechanical Workshop, Bay 2"
    ]
    facility_health_matrix = []
    for fac in major_facilities:
        fac_tickets = [t for t in tickets if fac.lower() in t["location"].lower()]
        active = [t for t in fac_tickets if t["status"] not in ["Resolved", "Closed"]]
        crit = [t for t in active if t["priority"] == "Critical"]
        cats = [t["category"] for t in fac_tickets]
        top_c = max(set(cats), key=cats.count) if cats else "Normal"
        
        status = "Nominal"
        if len(crit) > 0:
            status = "Critical"
        elif len(active) >= 2:
            status = "Attention"

        facility_health_matrix.append({
            "facility": fac,
            "active_count": len(active),
            "critical_count": len(crit),
            "status": status,
            "primary_category": top_c
        })

    # Velocity trend (last 5 days)
    now = datetime.now(timezone.utc)
    days_labels = ["-4d", "-3d", "-2d", "Yesterday", "Today"]
    velocity_trend = []
    for i, lbl in enumerate(days_labels):
        target_day = (now - timedelta(days=4 - i)).date()
        rep_count = 0
        res_count = 0
        for t in tickets:
            try:
                c_raw = t.get("created_at_raw") or t.get("created_at")
                if c_raw:
                    t_dt = datetime.fromisoformat(str(c_raw).replace("Z", "+00:00")).date()
                    if t_dt == target_day:
                        rep_count += 1
                r_raw = t.get("resolved_at_raw") or t.get("resolved_at")
                if r_raw:
                    r_dt = datetime.fromisoformat(str(r_raw).replace("Z", "+00:00")).date()
                    if r_dt == target_day:
                        res_count += 1
            except Exception:
                pass
        velocity_trend.append({
            "day": lbl,
            "reported": rep_count if total > 0 else [1, 2, 4, 3, 2][i],
            "resolved": res_count if total > 0 else [1, 1, 3, 4, 2][i]
        })

    return {
        "metrics": {
            "open_tickets": len(open_tickets),
            "critical_action": len(critical_action),
            "sla_breached": len(sla_breached),
            "resolved_today": len(resolved_today),
            "sla_compliance_rate": compliance_rate,
            "avg_mttr_hours": avg_mttr,
            "resolution_rate": resolution_rate
        },
        "department_distribution": department_distribution,
        "location_hotspots": location_hotspots,
        "category_distribution": category_distribution,
        "priority_distribution": priority_distribution,
        "staff_workload": staff_workload,
        "facility_health_matrix": facility_health_matrix,
        "velocity_trend": velocity_trend,
        "total_tickets": total
    }

