import urllib.request
import urllib.error
import json
import sys

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:8000'

def request(method, path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(f'{BASE}{path}', data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))

def main():
    print('=== 1. TEST TRIAGE ===')
    s, triage = request('POST', '/api/tickets/triage', {
        'description': 'Elevator stuck between 3rd and 4th floors with students inside',
        'location': 'Academic Block C Elevator 2'
    })
    print(f"Triage status: {s}, priority: {triage.get('priority')}, category: {triage.get('category')}")
    assert s == 200, f"Expected 200, got {s}"
    assert triage.get('priority') == 'Critical', f"Expected Critical, got {triage.get('priority')}"

    print('\n=== 2. TEST TICKET SUBMISSION WITH IMAGE ===')
    sample_img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    s, created = request('POST', '/api/tickets', {
        'description': 'Elevator stuck between 3rd and 4th floors with students inside',
        'location': 'Academic Block C Elevator 2',
        'image': sample_img,
        'triage': triage
    })
    ticket_id = created.get('id')
    print(f"Created status: {s}, ticket_id: {ticket_id}")
    assert s == 200 and ticket_id.startswith('GRV-')

    print('\n=== 3. TEST PUBLIC TICKET TRACKING ===')
    s, tracked = request('GET', f'/api/tickets/{ticket_id}')
    print(f"Tracking status: {s}, title: {tracked.get('title')}, image stored: {bool(tracked.get('image'))}")
    assert s == 200 and tracked.get('image') == sample_img

    print('\n=== 4. TEST ADMIN LOGIN ===')
    s, login = request('POST', '/api/auth/login', {
        'username': 'admin',
        'password': 'KAIROS@2026!Secure'
    })
    token = login.get('token')
    print(f"Login status: {s}, token acquired: {bool(token)}")
    assert s == 200 and bool(token)

    print('\n=== 5. TEST PROTECTED ADMIN TICKET UPDATE ===')
    s, updated = request('PATCH', f'/api/tickets/{ticket_id}', {
        'status': 'In Progress',
        'owner': 'R. Mahesh (Facilities)',
        'comment': 'Emergency technician dispatched to lift motor room.'
    }, token=token)
    print(f"Update status: {s}, new status: {updated.get('status')}")
    assert s == 200 and updated.get('status') == 'In Progress'

    print('\n=== 6. TEST RESOLUTION AND SLA EVIDENCE ===')
    s, resolved = request('PATCH', f'/api/tickets/{ticket_id}', {
        'status': 'Resolved',
        'comment': 'Elevator safely brought to level 3, passengers assisted out.'
    }, token=token)
    print(f"Resolved status: {s}, status: {resolved.get('status')}, resolved_at: {resolved.get('resolved_at')}")
    assert s == 200 and resolved.get('status') == 'Resolved' and resolved.get('resolved_at')

    print('\n=== 7. TEST ACTIVITY LOG INTEGRITY ===')
    s, refetched = request('GET', f'/api/tickets/{ticket_id}')
    acts = refetched.get('activity', [])
    print(f"Activity count: {len(acts)}")
    for a in acts:
        print(f" - [{a.get('actor')}] {a.get('action')}")
    assert len(acts) >= 4

    print('\n=== 8. TEST ANALYTICS PULSE ===')
    s, pulse = request('GET', '/api/analytics/pulse', token=token)
    print(f"Pulse status: {s}, metrics: {pulse.get('metrics')}")
    assert s == 200 and 'open_tickets' in pulse.get('metrics', {})

    print('\n=== 9. TEST AUDIT LOGS ===')
    s, audit = request('GET', '/api/audit-logs?limit=10', token=token)
    print(f"Audit status: {s}, logs count: {len(audit)}")
    assert s == 200 and len(audit) > 0

    print('\n=== 10. TEST LOGOUT & TOKEN REVOCATION ===')
    s, logout = request('POST', '/api/auth/logout', token=token)
    print(f"Logout status: {s}")
    s_blocked, blocked = request('PATCH', f'/api/tickets/{ticket_id}', {'status': 'Closed'}, token=token)
    print(f"Blocked request with revoked token status: {s_blocked} (Expected: 401)")
    assert s_blocked == 401

    print('\n>>> ALL 10 E2E VERIFICATION TESTS PASSED SUCCESSFULLY! <<<')

if __name__ == '__main__':
    main()

