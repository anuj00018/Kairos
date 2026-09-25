import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import {
  Activity,
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  Clock3,
  Crosshair,
  Eye,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  Radio,
  RefreshCw,
  Rotate3D,
  Send,
  ShieldAlert,
  Sparkles,
  Truck,
  Wifi,
  Wrench,
  X,
  Zap
} from 'lucide-react'

const CAMPUS_ZONES = [
  { id: 'CSE Block, Ground Floor', name: 'CSE Block (Grd)', x: -6.5, z: -4.5, width: 4.2, height: 3.2, depth: 3.5, code: 'SEC-A' },
  { id: 'CSE Block, 2nd Floor Labs', name: 'CSE Block (Labs)', x: -6.5, z: -0.5, width: 4.2, height: 4.8, depth: 2.8, code: 'SEC-A2' },
  { id: 'Mechanical Workshop, Bay 2', name: 'Mech Workshop', x: -6.5, z: 5.5, width: 4.8, height: 2.4, depth: 4.0, code: 'SEC-B' },
  { id: 'North Hostel Walkway', name: 'North Hostel', x: 6.0, z: -6.0, width: 3.6, height: 4.0, depth: 4.5, code: 'SEC-H1' },
  { id: 'South Hostel Block B, Floor 1', name: 'South Hostel', x: 6.8, z: 0.5, width: 3.8, height: 4.2, depth: 4.5, code: 'SEC-H2' },
  { id: 'Central Cafeteria', name: 'Cafeteria Hub', x: 0.0, z: -1.0, width: 4.2, height: 2.0, depth: 4.2, code: 'SEC-C' },
  { id: 'Central Library, Reading Room', name: 'Central Library', x: 0.0, z: -6.5, width: 4.8, height: 3.8, depth: 3.8, code: 'SEC-L' },
  { id: 'Main Gate & Security Post', name: 'Main Gate Post', x: 0.0, z: 7.5, width: 3.2, height: 1.8, depth: 2.4, code: 'SEC-G' },
  { id: 'Sports Complex & Gymnasium', name: 'Sports Complex', x: 6.5, z: 6.5, width: 5.0, height: 2.8, depth: 4.0, code: 'SEC-S' },
  { id: 'Admin Block, Dean Office Corridor', name: 'Admin Block', x: -1.2, z: 3.8, width: 4.0, height: 3.5, depth: 3.2, code: 'SEC-ADM' }
]

export default function CampusDigitalTwin3D({ tickets = [], selectedLocation = null, onSelectLocation, onQuickDispatch }) {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const targetCamPos = useRef(new THREE.Vector3(22, 20, 24))
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0))
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0))

  const [hoveredBuilding, setHoveredBuilding] = useState(null)
  const [activeBuildingModal, setActiveBuildingModal] = useState(null)
  const [autoRotate, setAutoRotate] = useState(false)
  const [viewMode, setViewMode] = useState('isometric') // 'isometric', 'overhead', 'focus'
  const [activeLayers, setActiveLayers] = useState({
    radar: true,
    patrols: true,
    beacons: true,
    grid: true
  })
  const [activeDroneRoute, setActiveDroneRoute] = useState(null)
  const [dispatchNotice, setDispatchNotice] = useState('')

  // Map ticket counts and critical tickets per location
  const locationStats = React.useMemo(() => {
    const map = {}
    CAMPUS_ZONES.forEach(z => {
      map[z.id] = { count: 0, critical: false, high: false, items: [] }
    })
    tickets.forEach(t => {
      if (map[t.location]) {
        map[t.location].count += 1
        map[t.location].items.push(t)
        if (t.priority === 'Critical' && t.status !== 'Resolved' && t.status !== 'Closed') {
          map[t.location].critical = true
        } else if (t.priority === 'High' && t.status !== 'Resolved' && t.status !== 'Closed') {
          map[t.location].high = true
        }
      }
    })
    return map
  }, [tickets])

  const setCameraPreset = useCallback((mode, targetZone = null) => {
    setViewMode(mode)
    if (mode === 'overhead') {
      targetCamPos.current.set(0, 36, 0.01)
      targetLookAt.current.set(0, 0, 0)
    } else if (mode === 'isometric') {
      targetCamPos.current.set(22, 20, 24)
      targetLookAt.current.set(0, 0, 0)
    } else if (mode === 'focus' && targetZone) {
      targetCamPos.current.set(targetZone.x + 8, targetZone.height + 7, targetZone.z + 8)
      targetLookAt.current.set(targetZone.x, targetZone.height / 2, targetZone.z)
    }
  }, [])

  // Trigger simulated field technician dispatch in 3D
  const triggerSimulation = (zone) => {
    setActiveDroneRoute(zone)
    setDispatchNotice(`Simulated Field Technician dispatched to ${zone.name}`)
    window.setTimeout(() => setDispatchNotice(''), 4000)
    if (onQuickDispatch) {
      onQuickDispatch(zone.id)
    }
  }

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight || 420

    // 1. Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene
    scene.background = new THREE.Color(0x040404)
    scene.fog = new THREE.FogExp2(0x040404, 0.032)

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000)
    camera.position.set(22, 20, 24)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    // 4. Monochrome High-Contrast Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0)
    keyLight.position.set(16, 32, 16)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.width = 1024
    keyLight.shadow.mapSize.height = 1024
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8)
    rimLight.position.set(-16, 20, -16)
    scene.add(rimLight)

    const centralBeacon = new THREE.PointLight(0xffffff, 2.2, 40)
    centralBeacon.position.set(0, 9, 0)
    scene.add(centralBeacon)

    // 5. Tactical Ground Plane & Coordinate Grid
    const gridHelper = new THREE.GridHelper(36, 36, 0xffffff, 0x1f1f1f)
    gridHelper.position.y = -0.01
    scene.add(gridHelper)

    const groundGeo = new THREE.PlaneGeometry(42, 42)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x080808,
      roughness: 0.85,
      metalness: 0.15
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // 6. Tactical Radar Sweep Beam
    const radarBeamGeo = new THREE.BufferGeometry()
    const radarPts = [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(18, 0.05, 0)]
    radarBeamGeo.setFromPoints(radarPts)
    const radarBeamMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6
    })
    const radarBeam = new THREE.Line(radarBeamGeo, radarBeamMat)
    scene.add(radarBeam)

    // Concentric Radar Rings on Ground
    ;[6, 12, 18].forEach(r => {
      const ringGeo = new THREE.RingGeometry(r - 0.05, r + 0.05, 64)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.12
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.02
      scene.add(ring)
    })

    // 7. Build 3D Campus Architectural Zones
    const buildingMeshes = []
    const beaconRings = []
    const verticalLaserPillars = []

    CAMPUS_ZONES.forEach((zone) => {
      const stats = locationStats[zone.id] || { count: 0, critical: false, high: false, items: [] }
      const isSelected = selectedLocation === zone.id

      // Base Structure Geometry
      const geo = new THREE.BoxGeometry(zone.width, zone.height, zone.depth)
      
      let baseColor = isSelected ? 0xffffff : stats.critical ? 0x333333 : stats.count > 0 ? 0x1f1f1f : 0x121212
      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: isSelected ? 0.1 : 0.4,
        metalness: isSelected ? 0.9 : 0.6,
        emissive: isSelected ? 0x555555 : stats.critical ? 0x383838 : stats.count > 0 ? 0x222222 : 0x080808,
        emissiveIntensity: isSelected ? 0.9 : stats.critical ? 0.8 : 0.3
      })

      const building = new THREE.Mesh(geo, mat)
      building.position.set(zone.x, zone.height / 2, zone.z)
      building.castShadow = true
      building.receiveShadow = true
      building.userData = { ...zone, stats, isSelected }
      scene.add(building)
      buildingMeshes.push(building)

      // Stark High-Contrast Wireframe Edges
      const edges = new THREE.EdgesGeometry(geo)
      const lineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0x000000 : stats.critical ? 0xffffff : stats.count > 0 ? 0xdddddd : 0x444444,
        linewidth: isSelected || stats.critical ? 2.5 : 1
      })
      const wireframe = new THREE.LineSegments(edges, lineMat)
      building.add(wireframe)

      // Critical / High Severity Vertical Laser Pillar
      if (stats.critical || stats.count >= 3) {
        const pillarGeo = new THREE.CylinderGeometry(0.12, 0.12, 14, 16)
        const pillarMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: stats.critical ? 0.8 : 0.4
        })
        const pillar = new THREE.Mesh(pillarGeo, pillarMat)
        pillar.position.set(zone.x, zone.height + 7, zone.z)
        scene.add(pillar)
        verticalLaserPillars.push(pillar)
      }

      // 3D Incident Floating Beacon & Pulsing Laser Rings
      if (stats.count > 0) {
        const pinGeo = new THREE.SphereGeometry(0.38, 16, 16)
        const pinMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: stats.critical ? 2.2 : 1.4,
          roughness: 0.05
        })
        const pin = new THREE.Mesh(pinGeo, pinMat)
        pin.position.set(zone.x, zone.height + 1.2, zone.z)
        scene.add(pin)

        // Pulsing Laser Ring
        const ringGeo = new THREE.RingGeometry(0.4, 0.85, 24)
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9
        })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.rotation.x = -Math.PI / 2
        ring.position.set(zone.x, zone.height + 0.3, zone.z)
        scene.add(ring)

        beaconRings.push({ mesh: ring, initialY: zone.height + 0.3, speed: 1.8 + Math.random() * 0.8 })
      }
    })

    // 8. 3D Inter-Facility Optical Highway Lines
    const highwayCurves = [
      [new THREE.Vector3(-6.5, 0.1, -4.5), new THREE.Vector3(-3.0, 0.5, -2.5), new THREE.Vector3(0, 0.1, -1.0)],
      [new THREE.Vector3(0, 0.1, -1.0), new THREE.Vector3(3.0, 0.5, -3.5), new THREE.Vector3(6.0, 0.1, -6.0)],
      [new THREE.Vector3(0, 0.1, -1.0), new THREE.Vector3(3.5, 0.5, -0.2), new THREE.Vector3(6.8, 0.1, 0.5)],
      [new THREE.Vector3(0, 0.1, -1.0), new THREE.Vector3(-0.6, 0.6, 1.4), new THREE.Vector3(-1.2, 0.1, 3.8)],
      [new THREE.Vector3(-1.2, 0.1, 3.8), new THREE.Vector3(-0.6, 0.4, 5.6), new THREE.Vector3(0, 0.1, 7.5)],
      [new THREE.Vector3(-1.2, 0.1, 3.8), new THREE.Vector3(2.6, 0.6, 5.2), new THREE.Vector3(6.5, 0.1, 6.5)],
      [new THREE.Vector3(-6.5, 0.1, 5.5), new THREE.Vector3(-3.8, 0.5, 4.6), new THREE.Vector3(-1.2, 0.1, 3.8)],
      [new THREE.Vector3(0, 0.1, -6.5), new THREE.Vector3(0, 0.5, -3.8), new THREE.Vector3(0, 0.1, -1.0)]
    ]

    highwayCurves.forEach(pts => {
      const curve = new THREE.CatmullRomCurve3(pts)
      const points = curve.getPoints(32)
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3
      })
      const pathLine = new THREE.Line(lineGeo, lineMat)
      scene.add(pathLine)
    })

    // 9. Simulated Autonomous Technician Patrol Units (Moving 3D Beacons)
    const patrolNodes = []
    for (let i = 0; i < 3; i++) {
      const pGeo = new THREE.BoxGeometry(0.4, 0.25, 0.4)
      const pMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.8
      })
      const patrolMesh = new THREE.Mesh(pGeo, pMat)
      scene.add(patrolMesh)
      
      const curveIndex = i % highwayCurves.length
      const curve = new THREE.CatmullRomCurve3(highwayCurves[curveIndex])
      patrolNodes.push({ mesh: patrolMesh, curve, progress: i * 0.33, speed: 0.0035 + i * 0.001 })
    }

    // 10. Interactive Raycasting & Mouse Controls
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    let isDragging = false
    let prevMouseX = 0
    let prevMouseY = 0
    let theta = 0.85
    let phi = 0.65
    const radius = 34

    const updateCameraFromOrbit = () => {
      if (viewMode === 'isometric') {
        targetCamPos.current.x = radius * Math.sin(phi) * Math.sin(theta)
        targetCamPos.current.y = Math.max(10, radius * Math.cos(phi))
        targetCamPos.current.z = radius * Math.sin(phi) * Math.cos(theta)
      }
    }

    const onMouseDown = (e) => {
      if (e.target !== renderer.domElement) return
      isDragging = true
      prevMouseX = e.clientX
      prevMouseY = e.clientY
    }

    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1

      if (isDragging && viewMode === 'isometric') {
        const deltaX = e.clientX - prevMouseX
        const deltaY = e.clientY - prevMouseY
        theta -= deltaX * 0.007
        phi = Math.max(0.2, Math.min(1.4, phi - deltaY * 0.007))
        prevMouseX = e.clientX
        prevMouseY = e.clientY
        updateCameraFromOrbit()
      } else {
        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObjects(buildingMeshes)
        if (intersects.length > 0) {
          const hit = intersects[0].object.userData
          setHoveredBuilding(hit)
          container.style.cursor = 'pointer'
        } else {
          setHoveredBuilding(null)
          container.style.cursor = 'grab'
        }
      }
    }

    const onMouseUp = () => {
      isDragging = false
    }

    const onClick = (e) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(buildingMeshes)
      if (intersects.length > 0) {
        const zone = intersects[0].object.userData
        setActiveBuildingModal(zone)
        setCameraPreset('focus', zone)
        if (onSelectLocation) {
          onSelectLocation(selectedLocation === zone.id ? 'All' : zone.id)
        }
      }
    }

    container.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    container.addEventListener('click', onClick)

    // 11. Animation Render Loop with Smooth Camera Lerping
    let animationFrameId
    let clock = new THREE.Clock()

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      // Smooth Camera Lerp
      camera.position.lerp(targetCamPos.current, 0.06)
      currentLookAt.current.lerp(targetLookAt.current, 0.06)
      camera.lookAt(currentLookAt.current)

      // Ambient Orbit when active
      if (autoRotate && !isDragging && viewMode === 'isometric') {
        theta += 0.0018
        updateCameraFromOrbit()
      }

      // Radar sweep rotation
      if (activeLayers.radar) {
        radarBeam.rotation.y = elapsed * 1.2
      }

      // Pulsing Incident Laser Rings
      if (activeLayers.beacons) {
        beaconRings.forEach((b) => {
          const scale = 1 + 0.45 * Math.sin(elapsed * b.speed)
          b.mesh.scale.set(scale, scale, 1)
          b.mesh.material.opacity = 0.8 - 0.4 * Math.sin(elapsed * b.speed)
        })
      }

      // Animate Autonomous Patrol Units
      if (activeLayers.patrols) {
        patrolNodes.forEach(p => {
          p.progress = (p.progress + p.speed) % 1
          const pt = p.curve.getPointAt(p.progress)
          p.mesh.position.set(pt.x, pt.y + 0.15, pt.z)
        })
      }

      renderer.render(scene, camera)
    }
    animate()

    // 12. Resize
    const handleResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight || 420
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationFrameId)
      container.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('click', onClick)
      window.removeEventListener('resize', handleResize)
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [locationStats, selectedLocation, autoRotate, viewMode, activeLayers, setCameraPreset, onSelectLocation])

  return (
    <div className="twin-3d-wrapper">
      {/* HUD Header Toolbar */}
      <div className="twin-3d-header">
        <div className="twin-3d-title">
          <Rotate3D size={17} />
          <strong>Spatial Digital Twin Command HUD</strong>
          <span className="twin-badge">Live Three.js Matrix</span>
        </div>

        {/* View Perspective Controls */}
        <div className="twin-view-controls">
          <button
            className={`twin-view-btn ${viewMode === 'isometric' ? 'active' : ''}`}
            onClick={() => setCameraPreset('isometric')}
            title="Isometric 3D Perspective"
          >
            <Box size={13} />
            Isometric
          </button>
          <button
            className={`twin-view-btn ${viewMode === 'overhead' ? 'active' : ''}`}
            onClick={() => setCameraPreset('overhead')}
            title="Overhead Tactical View"
          >
            <Navigation size={13} />
            Overhead Radar
          </button>
          <button
            className={`twin-view-btn ${autoRotate ? 'active' : ''}`}
            onClick={() => setAutoRotate(!autoRotate)}
            title="Ambient 3D Rotation"
          >
            <Sparkles size={13} />
            {autoRotate ? 'Orbit Active' : 'Orbit'}
          </button>
        </div>

        {/* Tactical Layer Toggles */}
        <div className="twin-layer-controls">
          <button
            className={`layer-chip ${activeLayers.patrols ? 'active' : ''}`}
            onClick={() => setActiveLayers(prev => ({ ...prev, patrols: !prev.patrols }))}
            title="Toggle Live Dispatch Patrols"
          >
            <Truck size={12} />
            Patrols
          </button>
          <button
            className={`layer-chip ${activeLayers.radar ? 'active' : ''}`}
            onClick={() => setActiveLayers(prev => ({ ...prev, radar: !prev.radar }))}
            title="Toggle Radar Sweep"
          >
            <Radio size={12} />
            Radar
          </button>
          {selectedLocation && selectedLocation !== 'All' && (
            <button
              className="layer-chip filter-reset"
              onClick={() => {
                onSelectLocation && onSelectLocation('All')
                setActiveBuildingModal(null)
                setCameraPreset('isometric')
              }}
            >
              Reset Filter &times;
            </button>
          )}
        </div>
      </div>

      {/* Main 3D Canvas Canvas & Interactive In-Scene Overlays */}
      <div className="twin-3d-canvas-container" ref={mountRef}>
        {/* Floating Raycast Hover Tooltip */}
        {hoveredBuilding && !activeBuildingModal && (
          <div className="twin-tooltip">
            <div className="twin-tooltip-header">
              <span className="sec-code">{hoveredBuilding.code}</span>
              <strong>{hoveredBuilding.name}</strong>
            </div>
            <p>{hoveredBuilding.id}</p>
            <div className="twin-tooltip-meta">
              <span className={`twin-pill ${hoveredBuilding.stats?.critical ? 'critical' : hoveredBuilding.stats?.count > 0 ? 'active' : 'idle'}`}>
                {hoveredBuilding.stats?.count || 0} Active Grievances
              </span>
              <small>Click to focus & inspect sector</small>
            </div>
          </div>
        )}

        {/* In-Scene Building Inspection Drawer */}
        {activeBuildingModal && (
          <div className="twin-sector-card">
            <div className="sector-card-header">
              <div>
                <span className="sec-code-badge">{activeBuildingModal.code}</span>
                <h3>{activeBuildingModal.name}</h3>
                <small>{activeBuildingModal.id}</small>
              </div>
              <button
                className="close-sector-btn"
                onClick={() => {
                  setActiveBuildingModal(null)
                  setCameraPreset('isometric')
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="sector-card-body">
              <div className="sector-stat-grid">
                <div>
                  <small>Active Incidents</small>
                  <strong>{activeBuildingModal.stats?.count || 0}</strong>
                </div>
                <div>
                  <small>Sector Status</small>
                  <span className={`status-pill ${activeBuildingModal.stats?.critical ? 'critical' : activeBuildingModal.stats?.count > 0 ? 'warning' : 'clear'}`}>
                    {activeBuildingModal.stats?.critical ? 'Critical Alert' : activeBuildingModal.stats?.count > 0 ? 'Action Required' : 'Operational'}
                  </span>
                </div>
              </div>

              {/* List of Grievances in this Sector */}
              <div className="sector-incidents-list">
                <h4>Sector Incident Queue</h4>
                {(activeBuildingModal.stats?.items || []).length === 0 ? (
                  <p className="no-incident-txt">No open grievances reported in this sector.</p>
                ) : (
                  (activeBuildingModal.stats?.items || []).slice(0, 3).map(ticket => (
                    <div key={ticket.id} className="sector-incident-item">
                      <div>
                        <strong>{ticket.id} &bull; {ticket.category}</strong>
                        <p>{ticket.title}</p>
                      </div>
                      <span className="sla-tag">{ticket.due}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Direct 3D Operational Actions */}
              <div className="sector-card-actions">
                <button
                  className="sector-action-btn primary"
                  onClick={() => triggerSimulation(activeBuildingModal)}
                >
                  <Send size={13} />
                  Simulate Field Dispatch
                </button>
                <button
                  className="sector-action-btn secondary"
                  onClick={() => {
                    if (onSelectLocation) onSelectLocation(activeBuildingModal.id)
                  }}
                >
                  <Crosshair size={13} />
                  Filter Queue to Sector
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Live Dispatch Notification Toast inside Canvas */}
        {dispatchNotice && (
          <div className="twin-dispatch-toast">
            <Truck size={15} />
            <span>{dispatchNotice}</span>
          </div>
        )}
      </div>

      {/* HUD Footer Diagnostics */}
      <div className="twin-3d-footer">
        <span><i className="dot white"></i> Active Incident Beacon</span>
        <span><i className="dot laser"></i> Severe SLA Beacon Flare</span>
        <span><i className="dot dark"></i> Normal / Resolved Facility</span>
        <span className="twin-instruction">
          Click any 3D sector to inspect & simulate field dispatch &bull; Drag to rotate camera
        </span>
      </div>
    </div>
  )
}

