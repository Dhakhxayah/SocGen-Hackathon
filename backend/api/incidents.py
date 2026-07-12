import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Incident, DriftEvent
from services.ai_engine import analyze_incident
from services.attack_path import build_attack_path

router = APIRouter()

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def _serialize(inc: Incident, db: Session):
    events = db.query(DriftEvent).filter_by(incident_id=inc.id).all()
    return {
        "id": inc.id,
        "incident_id": inc.incident_id,
        "title": inc.title,
        "actor": inc.actor,
        "window_start": inc.window_start.isoformat() if inc.window_start else None,
        "window_end": inc.window_end.isoformat() if inc.window_end else None,
        "domains_involved": json.loads(inc.domains_involved or "[]"),
        "controls_involved": json.loads(inc.controls_involved or "[]"),
        "max_severity": inc.max_severity,
        "total_risk_score": inc.total_risk_score,
        "is_compound": inc.is_compound,
        "created_at": inc.created_at.isoformat() if inc.created_at else None,
        "blast_radius": {
            "score": inc.blast_radius_score,
            "hops": inc.blast_radius_hops,
            "exposed_systems": json.loads(inc.blast_radius_systems) if inc.blast_radius_systems else [],
        },
        "drift_events": [
            {
                "id": e.id,
                "control_id": e.control_id,
                "domain": e.domain,
                "category": e.category,
                "severity": e.severity,
                "description": e.description,
                "changed_by": e.changed_by,
                "approval_status": e.approval_status,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            }
            for e in events
        ],
        "ai_analysis": {
            "root_cause": inc.ai_root_cause,
            "risk_explanation": inc.ai_risk_explanation,
            "mitre_technique": inc.ai_mitre_technique,
            "compliance_impact": inc.ai_compliance_impact,
            "remediation_steps": json.loads(inc.ai_remediation_steps) if inc.ai_remediation_steps else [],
            "priority": inc.ai_priority,
            "generated_at": inc.ai_generated_at.isoformat() if inc.ai_generated_at else None,
        } if inc.ai_generated_at else None,
    }


@router.get("/incidents")
def list_incidents(db: Session = Depends(get_db)):
    incidents = db.query(Incident).order_by(Incident.window_start.desc()).all()
    incidents.sort(key=lambda i: (SEVERITY_ORDER.get(i.max_severity, 4), -i.total_risk_score))
    return [_serialize(i, db) for i in incidents]


@router.get("/incidents/{incident_id}")
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter_by(id=incident_id).first()
    if not inc:
        return {"error": "not found"}
    return _serialize(inc, db)


@router.get("/incidents/{incident_id}/attack-path")
def get_attack_path(incident_id: int, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter_by(id=incident_id).first()
    if not inc:
        return {"error": "not found"}
    return build_attack_path(db, inc)


@router.post("/analyze/{incident_id}")
def analyze(incident_id: int, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter_by(id=incident_id).first()
    if not inc:
        return {"error": "not found"}
    inc, used_fallback = analyze_incident(db, inc)
    result = _serialize(inc, db)
    result["ai_used_fallback"] = used_fallback
    return result


@router.post("/analyze-all")
def analyze_all(db: Session = Depends(get_db)):
    incidents = db.query(Incident).filter(Incident.ai_generated_at.is_(None)).all()
    results = []
    for inc in incidents:
        inc, used_fallback = analyze_incident(db, inc)
        results.append({"incident_id": inc.incident_id, "ai_used_fallback": used_fallback})
    return {"analyzed": len(results), "details": results}
