"""
End-to-end tests for the KAIROS resolution reverification loop.
Requires the backend running at BASE_URL (default http://127.0.0.1:8000).
Run: python tests/verify_reverification.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8000")
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
passed, failed = 0, 0


def call(method, path, body=None, token=None, reporter=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if reporter:
        headers["X-Reporter-Token"] = reporter
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"[PASS] {name}")
    else:
        failed += 1
        print(f"[FAIL] {name} {detail}")


def new_ticket(title):
    code, t = call("POST", "/api/tickets", {
        "description": f"{title} — reverification test", "location": "Central Library, Reading Room", "title": title,
        "category": "Infrastructure", "priority": "Medium", "department": "Facilities",
        "summary": "test", "recommended_action": "inspect", "priority_rationale": "test"})
    assert code == 200, (code, t)
    return t


def audit_actions(admin, tid):
    code, t = call("GET", f"/api/tickets/{tid}")
    return [a["action"] for a in t.get("activity", [])]


code, login = call("POST", "/api/auth/login", {"username": "admin", "password": os.environ.get("ADMIN_PASSWORD", "KAIROS@2026!Secure")})
if code != 200:
    print("Admin login failed — is the backend running?", code, login)
    sys.exit(1)
admin = login["token"]

# --- Ticket A: confirm path -------------------------------------------------
a = new_ticket("Reverify A: door closer broken")
check("Submission returns a one-time reporter credential", bool(a.get("reporter_token")))
code, again = call("GET", f"/api/tickets/{a['id']}")
check("Credential is never returned by the public ticket lookup", code == 200 and not again.get("reporter_token"))
rt_a = a["reporter_token"]

code, _ = call("POST", f"/api/tickets/{a['id']}/confirm-resolution", {"confirmed": True}, reporter=rt_a)
check("11. Open ticket cannot be verified", code == 400, code)

call("PATCH", f"/api/tickets/{a['id']}", {"owner": "R. Mahesh (Facilities)"}, token=admin)
code, _ = call("PATCH", f"/api/tickets/{a['id']}", {"status": "Resolved", "comment": "Replaced door closer arm."}, token=admin)
check("1. Admin marks ticket resolved", code == 200, code)

code, v = call("GET", f"/api/tickets/{a['id']}/verification")
check("2. Ticket enters Awaiting Reverification", v.get("state") == "awaiting_reporter" and v.get("status") == "Awaiting reverification", v.get("state"))
check("2b. Lifecycle shows requested + pending stages from real state",
      [s["stage"] for s in v["lifecycle"]][-3:] == ["Marked resolved", "Reverification requested", "Awaiting reverification"],
      [s["stage"] for s in v["lifecycle"]])

code, mine = call("POST", "/api/reporter/tickets", {"tickets": [{"ticket_id": a["id"], "token": rt_a}, {"ticket_id": a["id"], "token": "wrong"}]})
check("3. Reporter sees the reverification request", code == 200 and len(mine["tickets"]) == 1 and mine["tickets"][0]["reporter_can_respond"], mine)

code, _ = call("POST", f"/api/tickets/{a['id']}/confirm-resolution", {"confirmed": True})
check("10a. No credential -> rejected", code == 403, code)
code, _ = call("POST", f"/api/tickets/{a['id']}/confirm-resolution", {"confirmed": True}, reporter="guessed-token")
check("10b. Wrong credential (unrelated user) -> rejected", code == 403, code)

code, v = call("POST", f"/api/tickets/{a['id']}/confirm-resolution", {"confirmed": True}, reporter=rt_a)
check("4. Reporter confirms", code == 200, (code, v))
check("5. Ticket becomes Verified (by reporter)", v.get("state") == "verified_reporter" and v["lifecycle"][-1]["stage"] == "Reporter verified", v.get("state"))

code, _ = call("POST", f"/api/tickets/{a['id']}/confirm-resolution", {"confirmed": False, "reason": "unresolved"}, reporter=rt_a)
check("12. Repeated verification in the same cycle is rejected", code == 409, code)
check("13a. Audit log records request + confirmation",
      any("reverification requested" in x for x in audit_actions(admin, a["id"])) and "Reporter confirmed resolution" in audit_actions(admin, a["id"]))

# --- Ticket B: dispute path -------------------------------------------------
b = new_ticket("Reverify B: ceiling leak")
rt_b = b["reporter_token"]
call("PATCH", f"/api/tickets/{b['id']}", {"status": "Resolved"}, token=admin)
code, _ = call("POST", f"/api/tickets/{b['id']}/confirm-resolution", {"confirmed": False}, reporter=rt_b)
check("7. Dispute requires a reason", code == 400, code)
code, v = call("POST", f"/api/tickets/{b['id']}/confirm-resolution",
               {"confirmed": False, "reason": "returned", "note": "Dripping again after rain.", "image": PNG}, reporter=rt_b)
check("6. Reporter disputes", code == 200, (code, v))
check("8. Optional photo evidence accepted and stored", v.get("last_dispute", {}).get("has_image") is True and (v["last_dispute"].get("image") or "").startswith("data:image/png"))
code, tb = call("GET", f"/api/tickets/{b['id']}")
check("9. Disputed ticket returns to the operational workflow (In Progress)", tb["status"] == "In Progress", tb["status"])
check("9b. State is 'disputed_returned', lifecycle shows dispute then reopen",
      v.get("state") == "disputed_returned" and [s["stage"] for s in v["lifecycle"]][-2:] == ["Reporter disputed", "Reopened for review"],
      [s["stage"] for s in v["lifecycle"]])
acts = audit_actions(admin, b["id"])
check("13b. Audit log records dispute + return for review",
      "Reporter disputed resolution: Problem returned" in acts and any("Returned for review after reporter dispute" in x for x in acts))

code, pub = call("GET", f"/api/tickets/{b['id']}/verification")
check("Privacy: public lookup hides reporter comment and photo", pub["last_dispute"]["note"] is None and "image" not in pub["last_dispute"])
code, adm = call("GET", f"/api/tickets/{b['id']}/verification", token=admin)
check("Admin sees reporter comment and photo", adm["last_dispute"]["note"] == "Dripping again after rain." and adm["last_dispute"]["image"].startswith("data:image"))

code, ov = call("GET", "/api/intelligence/overview", token=admin)
check("War Room reverification queue lists the dispute", any(d["ticket_id"] == b["id"] for d in ov["reverification"]["disputed"]))
check("War Room raises a 'Reverification required' warning", any(w["id"] == f"dispute:{b['id']}" for w in ov["warnings"]))

code, _ = call("POST", f"/api/tickets/{b['id']}/verify", {"note": "x"}, token=admin)
check("Admin cannot verify a reopened (open) ticket", code == 400, code)

call("PATCH", f"/api/tickets/{b['id']}", {"status": "Resolved", "comment": "Resealed roof flashing."}, token=admin)
code, v = call("GET", f"/api/tickets/{b['id']}/verification")
check("New resolution cycle: reporter can respond again", v.get("state") == "awaiting_reporter" and v["reopen_count"] == 1 and v["dispute_count"] == 1, v.get("state"))

code, rv_view = call("GET", f"/api/tickets/{a['id']}/verification", reporter=rt_a)
check("Privacy: reporter timeline shows no staff usernames",
      not any("Admin (" in (e.get("actor") or "") for e in rv_view["lifecycle"]) and any(e.get("actor") == "Operations team" for e in rv_view["lifecycle"]))
code, adm_view = call("GET", f"/api/tickets/{a['id']}/verification", token=admin)
check("Admin timeline keeps full staff attribution", any("Admin (" in (e.get("actor") or "") for e in adm_view["lifecycle"]))

code, mem = call("GET", f"/api/intelligence/memory?ticket_id={a['id']}", token=admin)
check("Campus memory endpoint still answers", code == 200)

print(f"\n--- REVERIFICATION TESTS: {passed} PASSED, {failed} FAILED ---")
sys.exit(1 if failed else 0)
