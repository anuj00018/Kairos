// Test both required flows:
// Flow 1: AI-assisted ticket creation with manual editing.
// Flow 2: Completely manual ticket creation when AI is unavailable.

const BACKEND_URL = 'http://127.0.0.1:8000'

async function runTests() {
  console.log('--- STARTING MANUAL INTAKE FLOW VERIFICATION ---')
  let passed = 0
  let failed = 0

  function assert(condition, name) {
    if (condition) {
      console.log(`[PASS] ${name}`)
      passed++
    } else {
      console.error(`[FAIL] ${name}`)
      failed++
    }
  }

  // --- FLOW 1: AI-assisted ticket creation with manual editing ---
  console.log('\n--- TESTING FLOW 1: AI-Assisted with Manual Overrides ---')
  try {
    // 1. Run AI triage simulation endpoint
    const triageRes = await fetch(`${BACKEND_URL}/api/tickets/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Server rack UPS power backup in Main Library floor 3 has started smoking and beeping loudly.',
        location: 'Central Library, Reading Room',
        image: null
      })
    })

    assert(triageRes.ok, 'Triage endpoint responded 200 OK')
    const triageData = await triageRes.json()
    console.log(`AI suggested: Category=${triageData.category}, Priority=${triageData.priority}, Dept=${triageData.department}`)

    // 2. User reviews suggestions and MANUALLY OVERRIDES them:
    // User changes Priority from High/Critical to Low or vice versa, overrides Title, Dept, Recommended Action
    const manuallyOverriddenPayload = {
      description: 'Server rack UPS power backup in Main Library floor 3 has started smoking and beeping loudly.',
      location: 'Central Library, 3rd Floor Server Alcove (Custom Location)',
      title: 'CRITICAL OVERRIDE: Library UPS Unit Fire Hazard & Smoking Batteries',
      category: 'Electrical', // User manual override
      priority: 'Critical', // User manual override
      department: 'Electrical Maintenance', // User manual override
      summary: 'Automated triage overridden by Lead Technician after inspection.',
      recommended_action: 'Immediately isolate circuit breaker CB-12 and deploy class-C fire extinguisher team.',
      priority_rationale: 'Technician verified active smoke emission presenting critical facility risk.'
    }

    const createRes = await fetch(`${BACKEND_URL}/api/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manuallyOverriddenPayload)
    })

    assert(createRes.ok, 'Ticket with manual overrides created successfully (HTTP 200)')
    const createdTicket = await createRes.json()

    assert(createdTicket.title === manuallyOverriddenPayload.title, 'Ticket title matches manual override')
    assert(createdTicket.category === 'Electrical', 'Ticket category matches manual override (Electrical)')
    assert(createdTicket.priority === 'Critical', 'Ticket priority matches manual override (Critical)')
    assert(createdTicket.department === 'Electrical Maintenance', 'Ticket department matches manual override (Electrical Maintenance)')
    assert(createdTicket.location === manuallyOverriddenPayload.location, 'Ticket location matches custom manual location')
    assert(createdTicket.action === manuallyOverriddenPayload.recommended_action, 'Ticket action matches manual recommended action')
    assert(createdTicket.sla_hours === 2, 'Critical priority automatically assigned 2-hour SLA')
    console.log(`Created Ticket ID: ${createdTicket.id}`)
  } catch (err) {
    console.error('Error in Flow 1:', err)
    failed++
  }

  // --- FLOW 2: Completely manual ticket creation when AI is unavailable / skipped ---
  console.log('\n--- TESTING FLOW 2: 100% Manual Ticket Creation (No AI) ---')
  try {
    const purelyManualPayload = {
      description: 'Air conditioning unit in Seminar Hall B is leaking condensed water onto the presenter podium carpet.',
      location: 'CSE Block, 2nd Floor Labs',
      title: 'AC Condensation Leak onto Audio-Visual Podium in Seminar Hall B',
      category: 'Water',
      priority: 'Medium',
      department: 'Facilities',
      summary: 'Manually logged grievance by faculty member.',
      recommended_action: 'Clear condensation drainage pipe and vacuum wet carpet area.',
      priority_rationale: 'Standard maintenance procedure.'
    }

    // Direct submission without invoking AI triage
    const directCreateRes = await fetch(`${BACKEND_URL}/api/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purelyManualPayload)
    })

    assert(directCreateRes.ok, 'Direct manual ticket created without AI triage (HTTP 200)')
    const directTicket = await directCreateRes.json()

    assert(directTicket.title === purelyManualPayload.title, 'Manual ticket title preserved')
    assert(directTicket.category === 'Water', 'Manual ticket category preserved (Water)')
    assert(directTicket.priority === 'Medium', 'Manual ticket priority preserved (Medium)')
    assert(directTicket.department === 'Facilities', 'Manual ticket department preserved (Facilities)')
    assert(directTicket.sla_hours === 24, 'Medium priority assigned 24-hour SLA')
    console.log(`Created Manual Ticket ID: ${directTicket.id}`)
  } catch (err) {
    console.error('Error in Flow 2:', err)
    failed++
  }

  console.log(`\n--- TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`)
  if (failed > 0) process.exit(1)
}

runTests()
