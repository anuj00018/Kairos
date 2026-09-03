import urllib.request
import json

with urllib.request.urlopen('http://127.0.0.1:8000/api/audit-logs?limit=100') as res:
    logs = json.loads(res.read().decode('utf-8'))
    print(f'Total audit logs returned: {len(logs)}')
    for l in logs:
        print(f"  [{l['event_type']}] {l['ticket_id']} :: {l['action']}")
