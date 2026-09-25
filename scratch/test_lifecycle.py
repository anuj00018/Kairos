import urllib.request
import json

# 1. Create a second ticket
req_data = json.dumps({
    'title': 'High Pressure Water Leak in Ground Floor Restroom',
    'description': 'Main supply pipe leaking heavily near washbasin, water pooling on floor.',
    'location': 'Mechanical Block, Ground Floor',
    'category': 'Water',
    'priority': 'High',
    'department': 'Facilities',
    'summary': 'Water pipe leakage reported.',
    'recommended_action': 'Shut off sub-valve and deploy plumbing crew.',
    'priority_rationale': 'Slip hazard and water waste.',
    'sla_hours': 12
}).encode('utf-8')

req = urllib.request.Request('http://127.0.0.1:8000/api/tickets', data=req_data, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as res:
    created = json.loads(res.read().decode('utf-8'))
    print('Created ticket:', created['id'], created['title'])

# 2. Update status, owner, and add a note
ticket_id = created['id']
patch_data = json.dumps({
    'owner': 'R. Mahesh (Plumbing)',
    'status': 'In Progress',
    'comment': 'Main sub-valve shut off. Replacing pipe union.'
}).encode('utf-8')

patch_req = urllib.request.Request(f'http://127.0.0.1:8000/api/tickets/{ticket_id}', data=patch_data, headers={'Content-Type': 'application/json'}, method='PATCH')
with urllib.request.urlopen(patch_req) as res:
    updated = json.loads(res.read().decode('utf-8'))
    print('Updated ticket:', updated['id'], 'Status:', updated['status'], 'Owner:', updated['owner'])

# 3. Re-send identical status to ensure database DOES NOT record duplicate redundant status log
patch_dup = json.dumps({
    'status': 'In Progress'
}).encode('utf-8')
dup_req = urllib.request.Request(f'http://127.0.0.1:8000/api/tickets/{ticket_id}', data=patch_dup, headers={'Content-Type': 'application/json'}, method='PATCH')
with urllib.request.urlopen(dup_req) as res:
    pass

# 4. Check audit logs to verify no duplicate status entries
with urllib.request.urlopen('http://127.0.0.1:8000/api/audit-logs?limit=100') as res:
    logs = json.loads(res.read().decode('utf-8'))
    print(f'\nTotal audit logs now: {len(logs)}')
    groups = {}
    for l in logs:
        groups.setdefault(l['ticket_id'], []).append(l['action'])
    for tid, acts in groups.items():
        print(f'  Ticket {tid} (Total Events: {len(acts)}):')
        for a in acts:
            print(f'    * {a}')

