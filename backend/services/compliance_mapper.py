"""
Module 6 — Compliance Mapper

Each Control already carries its own compliance_mappings (set at generation
time, mirroring the PS's control-metadata deliverable). This module
aggregates that into framework-level coverage percentages for the
dashboard, and exposes a helper to map a single drifted control to the
frameworks it violates.
"""
import json
from collections import defaultdict
from sqlalchemy.orm import Session
from database.models import Control, DriftEvent

FRAMEWORKS = ["NIST", "CIS", "GDPR"]

MITRE_BY_CATEGORY = {
    "logging": "T1562 - Impair Defenses (Disable/modify logging)",
    "encryption": "T1562 - Impair Defenses (Weaken encryption controls)",
    "firewall": "T1562.004 - Impair Defenses (Disable/modify network firewall)",
    "endpoint": "T1562.001 - Impair Defenses (Disable/modify security tools)",
    "access": "T1556 - Modify Authentication Process",
}


def _framework_of(mapping: str) -> str:
    for fw in FRAMEWORKS:
        if mapping.upper().startswith(fw):
            return fw
    return "OTHER"


def mitre_for_category(category: str) -> str:
    return MITRE_BY_CATEGORY.get(category, "T1036 - Masquerading (Unauthorized configuration change)")


def compliance_coverage(session: Session):
    """
    For each framework, coverage% = controls with NO active (unsuppressed) drift
    among controls mapped to that framework, divided by total controls mapped.
    """
    from services.state import currently_failing_control_ids
    controls = session.query(Control).all()
    drifted_control_ids = currently_failing_control_ids(session)

    fw_total = defaultdict(int)
    fw_passing = defaultdict(int)

    for c in controls:
        mappings = json.loads(c.compliance_mappings or "[]")
        frameworks_hit = {_framework_of(m) for m in mappings}
        for fw in frameworks_hit:
            fw_total[fw] += 1
            if c.control_id not in drifted_control_ids:
                fw_passing[fw] += 1

    result = {}
    for fw in FRAMEWORKS:
        total = fw_total.get(fw, 0)
        passing = fw_passing.get(fw, 0)
        result[fw] = {
            "total_controls": total,
            "passing_controls": passing,
            "coverage_pct": round((passing / total) * 100, 1) if total else 100.0,
        }
    return result


def compliance_for_control(session: Session, control_id: str):
    control = session.query(Control).filter_by(control_id=control_id).first()
    if not control:
        return []
    return json.loads(control.compliance_mappings or "[]")
