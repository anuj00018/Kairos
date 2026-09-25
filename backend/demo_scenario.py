"""
Optional, clearly-labeled DEMO scenario pack for the Future Engine.

Loaded only when an administrator explicitly asks for it. Every inserted ticket is recorded in
the `demo_records` table so the UI can badge it as demo data and it can be removed cleanly.
The Future Engine treats these rows like any other data — nothing about the analysis is faked.
"""
from datetime import datetime, timedelta, timezone
from typing import List

from .database import get_connection

DEMO_NOTE = "(Demo scenario data)"

# (id, title, location, category, priority, department, status, owner, sla_h, created_h_ago, closed_h_ago, notes, verification)
DEMO_TICKETS = [
    # North Hostel water — clustering, SLA pressure, recurrence after a recent fix
    ("GRV-9001", "Low water pressure on 2nd floor washrooms", "North Hostel Walkway", "Water", "High", "Facilities", "In Progress", "R. Mahesh (Facilities)", 12, 30, None, ["Pressure drop confirmed on upper floors; checking riser valve."], None),
    ("GRV-9002", "Brown water coming from taps in Block A", "North Hostel Walkway", "Water", "High", "Facilities", "New", "Unassigned", 12, 10, None, [], None),
    ("GRV-9003", "Water leaking from ceiling near stairwell", "North Hostel Walkway", "Water", "Medium", "Facilities", "New", "Unassigned", 24, 5, None, [], None),
    ("GRV-9004", "No water supply in 3rd floor washroom", "North Hostel Walkway", "Water", "High", "Facilities", "New", "Unassigned", 12, 2, None, [], None),
    ("GRV-9005", "Pipe joint leak on hostel riser branch", "North Hostel Walkway", "Water", "High", "Facilities", "Closed", "K. Anand (Facilities)", 12, 240, 228, ["Replaced corroded joint on riser branch."], None),
    ("GRV-9006", "Water cooler not dispensing, ground floor", "North Hostel Walkway", "Water", "Medium", "Facilities", "Resolved", "R. Mahesh (Facilities)", 24, 110, 96, ["Cleared inlet blockage and reset float valve."], None),
    ("GRV-9007", "Washroom taps dry, CSE ground floor", "CSE Block, Ground Floor", "Water", "Medium", "Facilities", "New", "Unassigned", 24, 20, None, [], None),
    # Core Zone A network — three buildings, same network zone, same window
    ("GRV-9008", "Wi-Fi dropping every few minutes in 2nd floor labs", "CSE Block, 2nd Floor Labs", "Network", "High", "IT Infrastructure", "Assigned", "A. Sharma (IT Infrastructure)", 12, 6, None, [], None),
    ("GRV-9009", "Library Wi-Fi not connecting on any device", "Central Library, Reading Room", "Network", "Medium", "IT Infrastructure", "New", "Unassigned", 24, 4, None, [], None),
    ("GRV-9010", "Wired LAN down in Dean office corridor", "Admin Block, Dean Office Corridor", "Network", "High", "IT Infrastructure", "New", "Unassigned", 12, 3, None, [], None),
    # Critical safety item close to its 2h SLA
    ("GRV-9013", "Exposed wiring near cafeteria kitchen counter", "Central Cafeteria", "Electrical", "Critical", "Electrical Maintenance", "New", "Unassigned", 2, 1.2, None, [], None),
    # Proof of resolution examples
    ("GRV-9011", "Broken window latch, South Hostel room 214", "South Hostel Block B, Floor 1", "Infrastructure", "Low", "Facilities", "In Progress", "K. Anand (Facilities)", 48, 72, 24, ["Latch replaced."], ("reporter_disputed", "Reporter", "Latch still does not lock after closing.", 21, "returned")),
    ("GRV-9012", "Corridor light out near Admin records room", "Admin Block, Dean Office Corridor", "Electrical", "Medium", "Electrical Maintenance", "Resolved", "S. Ramesh (Electrical)", 24, 48, 36, ["Replaced failed LED driver; tested circuit."], ("reporter_confirmed", "Reporter", None, 30, None)),
]

# Audit entries the live workflow would have written for these demo lifecycles (same actions as production code)
EXTRA_LOGS = {
    "GRV-9006": [(95.9, "Reporter reverification requested (in-app)", "KAIROS", None)],
    "GRV-9012": [(35.9, "Reporter reverification requested (in-app)", "KAIROS", None),
                 (30, "Reporter confirmed resolution", "Reporter", None)],
    "GRV-9011": [(23.9, "Reporter reverification requested (in-app)", "KAIROS", None),
                 (21, "Reporter disputed resolution: Problem returned", "Reporter", "Latch still does not lock after closing."),
                 (20.99, "Status updated from 'Resolved' to 'In Progress'", "KAIROS Reverification", None),
                 (20.98, "Note: Returned for review after reporter dispute (Problem returned).", "KAIROS Reverification", "Returned for review after reporter dispute (Problem returned).")],
}

# Tickets the simulated demo reporter "submitted" — the demo endpoint issues real reporter credentials for them
DEMO_REPORTER_TICKETS = ["GRV-9006", "GRV-9008", "GRV-9009", "GRV-9011", "GRV-9012"]


def _ensure_table(cur) -> None:
    cur.execute("CREATE TABLE IF NOT EXISTS demo_records (ticket_id TEXT PRIMARY KEY, loaded_at TEXT NOT NULL)")


def demo_ticket_ids() -> List[str]:
    conn, _ = get_connection()
    cur = conn.cursor()
    _ensure_table(cur)
    conn.commit()
    cur.execute("SELECT ticket_id FROM demo_records")
    ids = [r[0] if not isinstance(r, dict) else r["ticket_id"] for r in cur.fetchall()]
    conn.close()
    return ids


def clear_demo() -> int:
    conn, engine = get_connection()
    cur = conn.cursor()
    _ensure_table(cur)
    ph = "%s" if engine == "postgresql" else "?"
    cur.execute("SELECT ticket_id FROM demo_records")
    ids = [r[0] if not isinstance(r, dict) else r["ticket_id"] for r in cur.fetchall()]
    for tid in ids:
        cur.execute(f"DELETE FROM activity_logs WHERE ticket_id = {ph}", (tid,))
        cur.execute(f"DELETE FROM resolution_verifications WHERE ticket_id = {ph}", (tid,))
        cur.execute(f"DELETE FROM reporter_credentials WHERE ticket_id = {ph}", (tid,))
        cur.execute(f"DELETE FROM tickets WHERE id = {ph}", (tid,))
    cur.execute("DELETE FROM demo_records")
    cur.execute("DELETE FROM signal_states")
    conn.commit()
    conn.close()
    return len(ids)


def load_demo() -> int:
    clear_demo()
    conn, engine = get_connection()
    cur = conn.cursor()
    ph = "%s" if engine == "postgresql" else "?"
    now = datetime.now(timezone.utc)
    iso = lambda h: (now - timedelta(hours=h)).isoformat()
    for (tid, title, loc, cat, pri, dept, status, owner, sla, c_ago, closed_ago, notes, ver) in DEMO_TICKETS:
        cur.execute(f"DELETE FROM tickets WHERE id = {ph}", (tid,))
        resolved = iso(closed_ago) if (closed_ago is not None and status == "Resolved") else None
        cur.execute(
            f"""INSERT INTO tickets (id, title, description, location, category, priority, department, status, owner,
                sla_hours, created_at, resolved_at, image, summary, action, priority_rationale)
                VALUES ({', '.join([ph] * 16)})""",
            (tid, title, f"{title}. {DEMO_NOTE}", loc, cat, pri, dept, status, owner, sla, iso(c_ago), resolved, None,
             f"{cat} issue reported at {loc}. {DEMO_NOTE}", "Inspect on site and restore service.", "Demo scenario classification."))
        logs = [(iso(c_ago), "Complaint submitted through KAIROS portal", "Student / Complainant", None),
                (iso(c_ago), f"KAIROS classified as {cat} ({pri}) and routed to {dept}", "KAIROS Triage", None)]
        step = c_ago
        if owner != "Unassigned":
            step = c_ago - min(1.0, max(0.2, c_ago * 0.05))
            logs.append((iso(step), f"Assigned owner to '{owner}'", "Admin (demo)", None))
        if status == "In Progress":
            logs.append((iso(step - 0.2), "Status updated from 'Assigned' to 'In Progress'", "Admin (demo)", None))
        for n in notes:
            at = (closed_ago + 0.3) if closed_ago is not None else max(0.1, step - 0.5)
            logs.append((iso(at), f"Note: {n}", owner, n))
        if closed_ago is not None:
            logs.append((iso(closed_ago), "Status updated from 'In Progress' to 'Resolved'", owner, None))
            if status == "Closed":
                logs.append((iso(closed_ago - 0.5), "Status updated from 'Resolved' to 'Closed'", "Admin (demo)", None))
        logs += [(iso(h), a, who, n) for h, a, who, n in EXTRA_LOGS.get(tid, [])]
        logs.sort(key=lambda x: x[0])
        for at, action, actor, note in logs:
            cur.execute(f"INSERT INTO activity_logs (ticket_id, action, actor, created_at, notes) VALUES ({ph},{ph},{ph},{ph},{ph})",
                        (tid, action, actor, at, note))
        if ver:
            method, actor, note, ago, reason = ver
            cur.execute(f"INSERT INTO resolution_verifications (ticket_id, method, actor, note, image, created_at, reason) VALUES ({ph},{ph},{ph},{ph},{ph},{ph},{ph})",
                        (tid, method, actor, note, None, iso(ago), reason))
        cur.execute(f"INSERT INTO demo_records (ticket_id, loaded_at) VALUES ({ph},{ph})", (tid, now.isoformat()))
    conn.commit()
    conn.close()
    return len(DEMO_TICKETS)
