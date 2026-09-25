"""
Campus topology configuration for the KAIROS Future Engine.

This is CONFIGURATION, not observed data: it describes which buildings share a power feeder,
water line or network zone, and which services depend on which. Institutions edit this file to
match their campus. Every scenario result built on it is labeled as a topology-based estimate.
Occupancy is intentionally absent — KAIROS never invents affected-population numbers.
"""
from typing import Dict, List, Optional, Tuple

TOPOLOGY_VERSION = "campus-topology/1.0 (configured)"

BUILDINGS: Dict[str, Dict] = {
    "CSE Block": {"type": "Academic", "keywords": ["cse"], "zone": "SEC-A"},
    "Mechanical Workshop": {"type": "Laboratory", "keywords": ["mechanical", "workshop"], "zone": "SEC-B"},
    "North Hostel": {"type": "Residential", "keywords": ["north hostel"], "zone": "SEC-H1"},
    "South Hostel Block B": {"type": "Residential", "keywords": ["south hostel"], "zone": "SEC-H2"},
    "Central Cafeteria": {"type": "Dining", "keywords": ["cafeteria", "canteen", "mess"], "zone": "SEC-C"},
    "Central Library": {"type": "Academic", "keywords": ["library"], "zone": "SEC-L"},
    "Main Gate & Security Post": {"type": "Security", "keywords": ["main gate", "security post", "gate"], "zone": "SEC-G"},
    "Sports Complex": {"type": "Recreation", "keywords": ["sports", "gym"], "zone": "SEC-S"},
    "Admin Block": {"type": "Administrative", "keywords": ["admin block", "dean"], "zone": "SEC-ADM"},
}

# Shared physical supply lines: an outage on a line reaches every building on it.
SERVICE_LINES: Dict[str, Dict[str, List[str]]] = {
    "Power": {
        "Feeder A — Academic": ["CSE Block", "Mechanical Workshop", "Central Library", "Admin Block"],
        "Feeder B — Residential": ["North Hostel", "South Hostel Block B", "Central Cafeteria"],
        "Feeder C — Perimeter": ["Main Gate & Security Post", "Sports Complex"],
    },
    "Water": {
        "North Riser": ["North Hostel", "CSE Block", "Central Library"],
        "South Main": ["South Hostel Block B", "Central Cafeteria", "Sports Complex"],
        "Admin Line": ["Admin Block", "Mechanical Workshop", "Main Gate & Security Post"],
    },
    "Network": {
        "Core Zone A": ["CSE Block", "Central Library", "Admin Block"],
        "Residential Zone B": ["North Hostel", "South Hostel Block B"],
        "Service Zone C": ["Central Cafeteria", "Sports Complex", "Mechanical Workshop", "Main Gate & Security Post"],
    },
}

# Service -> services that stop working when it fails (cascade inside the affected buildings)
SERVICE_DEPENDENTS: Dict[str, List[str]] = {
    "Power": ["Network", "HVAC", "Lifts", "Pumped Water", "Access Control", "Lighting"],
    "Network": ["Access Control", "Digital Services"],
    "Water": ["Sanitation", "Drinking Water"],
    "HVAC": [],
}

SERVICES = ["Power", "Water", "Network", "HVAC", "Sanitation", "Access & Safety", "Facilities"]

CATEGORY_SERVICE = {
    "Water": "Water",
    "Electrical": "Power",
    "Network": "Network",
    "Security": "Access & Safety",
    "Sanitation": "Sanitation",
    "Infrastructure": "Facilities",
}

# What an outage means per building type — qualitative, never a head count
BUILDING_IMPACT = {
    "Residential": "residents' daily living (sanitation, drinking water, night-time safety)",
    "Academic": "classes, labs and exam schedules",
    "Laboratory": "practical sessions and equipment safety",
    "Dining": "meal service and food safety",
    "Security": "campus entry control and emergency response",
    "Recreation": "sports and recreation programmes",
    "Administrative": "administrative services and records",
}

# Same roster the Operations Hub assigns from (App.jsx STAFF_MEMBERS)
STAFF_DIRECTORY: List[Tuple[str, str]] = [
    ("R. Mahesh (Facilities)", "Facilities"),
    ("K. Anand (Facilities)", "Facilities"),
    ("S. Ramesh (Electrical)", "Electrical Maintenance"),
    ("K. Srilatha (Housekeeping)", "Housekeeping"),
    ("A. Sharma (IT Infrastructure)", "IT Infrastructure"),
    ("P. Kumar (Security)", "Security"),
    ("V. Murugan (Hostel Admin)", "Hostel Administration"),
]


def resolve_building(location: str) -> Tuple[str, bool]:
    """Map a free-text location to a configured building. Returns (building, is_mapped)."""
    text = (location or "").lower()
    for name, cfg in BUILDINGS.items():
        if any(k in text for k in cfg["keywords"]):
            return name, True
    base = (location or "Unspecified").split(",")[0].strip() or "Unspecified"
    return base, False


def line_for(building: str, service: str) -> Optional[str]:
    for line, members in SERVICE_LINES.get(service, {}).items():
        if building in members:
            return line
    return None


def buildings_on_line(service: str, line: str) -> List[str]:
    return list(SERVICE_LINES.get(service, {}).get(line, []))


def cascade(service: str) -> List[str]:
    seen, queue = [], [service]
    while queue:
        s = queue.pop(0)
        for d in SERVICE_DEPENDENTS.get(s, []):
            if d not in seen and d != service:
                seen.append(d)
                queue.append(d)
    return seen
