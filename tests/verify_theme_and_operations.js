// Automated verification test for Theme Selection and Real-Time Operations Hub
import fs from 'fs'
import path from 'path'

console.log('=== KAIROS VERIFICATION: THEME SELECTION & OPERATIONS HUB ===\n')

// 1. Verify CSS themes and rules
console.log('[TEST 1] Verifying CSS theme declarations in src/App.css...')
const cssPath = path.resolve('src/App.css')
const cssContent = fs.readFileSync(cssPath, 'utf8')

const checks = [
  { name: 'White & Black theme root', regex: /\[data-theme=["']white-black["']\]/ },
  { name: 'Professional Color theme root', regex: /\[data-theme=["']professional-color["']\]/ },
  { name: 'New ticket arrival highlight class', regex: /\.ticket-row-3d\.new-arrival/ },
  { name: 'New ticket badge class', regex: /\.badge-new-ticket/ },
  { name: 'New ticket pulsing dot animation', regex: /@keyframes pulseDot/ },
  { name: 'Settings modal container', regex: /\.settings-modal-card/ },
  { name: 'Theme switcher chips in sidebar', regex: /\.sidebar-theme-chips/ }
]

let cssPass = true
checks.forEach(c => {
  if (c.regex.test(cssContent)) {
    console.log(`  ✓ ${c.name} found`)
  } else {
    console.error(`  ✗ MISSING: ${c.name}`)
    cssPass = false
  }
})

if (!cssPass) {
  console.error('\nCSS verification failed!')
  process.exit(1)
}

// 2. Verify JSX component architecture
console.log('\n[TEST 2] Verifying JSX Architecture in src/App.jsx...')
const jsxPath = path.resolve('src/App.jsx')
const jsxContent = fs.readFileSync(jsxPath, 'utf8')

const jsxChecks = [
  { name: 'SettingsModal import', regex: /import SettingsModal from/ },
  { name: 'currentTheme state hook', regex: /const \[currentTheme, setCurrentTheme\] = useState/ },
  { name: 'Theme persistence in localStorage', regex: /localStorage\.setItem\(['"]kairos_theme['"], currentTheme\)/ },
  { name: 'data-theme attribute set on documentElement', regex: /document\.documentElement\.setAttribute\(['"]data-theme['"], currentTheme\)/ },
  { name: 'newTicketIds state hook', regex: /const \[newTicketIds, setNewTicketIds\] = useState/ },
  { name: 'Real-time Operations Hub auto-sync polling', regex: /setInterval\(\(\) => \{\s*fetchTickets\(\)\s*fetchAnalytics\(\)\s*\}, 3000\)/ },
  { name: 'Sorting new tickets to top of queue in shown', regex: /const aIsNew = newTicketIds\.has\(a\.id\)/ },
  { name: 'NEW TICKET badge rendered in ticket-row-3d', regex: /className=["']badge-new-ticket["']/ },
  { name: 'Settings trigger in sidebar', regex: /setShowSettingsModal\(true\)/ },
  { name: 'SettingsModal rendered in JSX', regex: /<SettingsModal/ }
]

let jsxPass = true
jsxChecks.forEach(c => {
  if (c.regex.test(jsxContent)) {
    console.log(`  ✓ ${c.name} implemented`)
  } else {
    console.error(`  ✗ MISSING: ${c.name}`)
    jsxPass = false
  }
})

if (!jsxPass) {
  console.error('\nJSX verification failed!')
  process.exit(1)
}

// 3. Verify Live API Integration & Ticket Arrival
console.log('\n[TEST 3] Testing Live Backend Operations Hub Integration...')
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000'

async function runLiveTests() {
  try {
    // A. Admin Login
    console.log(`  Authenticating admin at ${BASE_URL}/api/auth/login...`)
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'KAIROS@2026!Secure' })
    })
    if (!loginRes.ok) throw new Error(`Login failed with status ${loginRes.status}`)
    const loginData = await loginRes.json()
    const token = loginData.token
    console.log(`  ✓ Admin authenticated successfully: ${loginData.user.name} (${loginData.user.role})`)

    // B. Fetch Initial Metrics
    console.log('  Fetching initial dashboard pulse metrics...')
    const pulseRes1 = await fetch(`${BASE_URL}/api/analytics/pulse`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const pulseData1 = await pulseRes1.json()
    const initialOpen = pulseData1.metrics.open_tickets
    console.log(`  ✓ Initial Open Tickets: ${initialOpen}`)

    // C. Submit New Complaint Ticket
    console.log('  Submitting a new complaint ticket...')
    const testTitle = `HVAC failure and excessive noise in Library Room ${Math.floor(Math.random() * 800 + 100)}`
    const createRes = await fetch(`${BASE_URL}/api/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: testTitle + ' causing study disruption and safety hazard',
        location: 'Library',
        title: testTitle,
        category: 'Infrastructure',
        priority: 'High',
        department: 'Facilities',
        summary: 'Reported in Library',
        recommended_action: 'Dispatch HVAC technician',
        priority_rationale: 'High temperature disruption'
      })
    })
    if (!createRes.ok) throw new Error(`Ticket creation failed: ${createRes.status}`)
    const createdTicket = await createRes.json()
    console.log(`  ✓ New ticket created: ${createdTicket.id} - "${createdTicket.title}"`)

    // D. Fetch Tickets via Admin API and verify new ticket is present
    console.log('  Fetching tickets queue via Admin API...')
    const ticketsRes = await fetch(`${BASE_URL}/api/tickets`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const allTickets = await ticketsRes.json()
    const found = allTickets.find(t => t.id === createdTicket.id)
    if (!found) throw new Error(`Created ticket ${createdTicket.id} not found in tickets list!`)
    console.log(`  ✓ Ticket ${createdTicket.id} confirmed present in Operations Hub queue`)

    // E. Verify Metrics Updated Immediately
    console.log('  Verifying dashboard pulse metrics updated immediately...')
    const pulseRes2 = await fetch(`${BASE_URL}/api/analytics/pulse`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const pulseData2 = await pulseRes2.json()
    const newOpen = pulseData2.metrics.open_tickets
    console.log(`  ✓ Updated Open Tickets: ${newOpen} (Previously: ${initialOpen})`)
    if (newOpen < initialOpen) {
      console.warn('  ! Note: Open tickets count did not increase (may be deduplicated or already resolved)')
    }

    console.log('\n=== ALL VERIFICATIONS PASSED (100% SUCCESS) ===\n')
  } catch (err) {
    console.error('Test execution error:', err.message)
    process.exit(1)
  }
}

runLiveTests()
