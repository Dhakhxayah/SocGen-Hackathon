from typing import Optional
import json
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import DriftEvent

router = APIRouter()

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "NONE": 4}


@router.get("/drifts")
def list_drifts(
    severity: Optional[str] = None,
    domain: Optional[str] = None,
    suppressed: Optional[bool] = None,
    ml_anomaly_only: bool = False,
    include_normal: bool = False,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    q = db.query(DriftEvent)
    if not include_normal:
        q = q.filter(DriftEvent.is_drift.is_(True))
    if severity:
        q = q.filter(DriftEvent.severity == severity.upper())
    if domain:
        q = q.filter(DriftEvent.domain == domain)
    if suppressed is not None:
        q = q.filter(DriftEvent.suppressed.is_(suppressed))
    if ml_anomaly_only:
        q = q.filter(DriftEvent.ml_is_anomaly.is_(True))

    rows = q.order_by(DriftEvent.timestamp.desc()).limit(limit).all()
    rows.sort(key=lambda r: (SEVERITY_ORDER.get(r.severity, 5), -(r.risk_score or 0)))

    return [
        {
            "id": d.id,
            "event_id": d.event_id,
            "control_id": d.control_id,
            "timestamp": d.timestamp.isoformat() if d.timestamp else None,
            "domain": d.domain,
            "category": d.category,
            "environment": d.environment,
            "changed_by": d.changed_by,
            "change_source": d.change_source,
            "approval_status": d.approval_status,
            "severity": d.severity,
            "description": d.description,
            "suppressed": d.suppressed,
            "suppression_reason": d.suppression_reason,
            "ambiguous": d.ambiguous,
            "ambiguous_reason": d.ambiguous_reason,
            "risk_score": d.risk_score,
            "status": d.status,
            "incident_id": d.incident_id,
            "ml_anomaly_score": d.ml_anomaly_score,
            "ml_is_anomaly": d.ml_is_anomaly,
            "ml_top_contributors": json.loads(d.ml_feature_snapshot).get("top_contributors", [])
                if d.ml_feature_snapshot else [],
        }
        for d in rows
    ]


@router.post("/drifts/{drift_id}/status")
def update_status(drift_id: int, status: str, db: Session = Depends(get_db)):
    d = db.query(DriftEvent).filter_by(id=drift_id).first()
    if not d:
        return {"error": "not found"}
    d.status = status
    db.commit()
    return {"id": d.id, "status": d.status}


@router.post("/drifts/{drift_id}/remediate")
def remediate_drift(drift_id: int, db: Session = Depends(get_db)):
    """
    One-click remediation: marks the drift event as fixed. services.state's
    currently_failing_control_ids() checks status != "remediated", so the
    control immediately stops counting as failing the moment this commits -
    the dashboard's security score and compliance coverage recover on the
    very next fetch, no reprocessing/resimulation needed.
    """
    from database.models import Control
    from services.state import currently_failing_control_ids

    d = db.query(DriftEvent).filter_by(id=drift_id).first()
    if not d:
        return {"error": "not found"}
    d.status = "remediated"
    db.commit()

    control = db.query(Control).filter_by(control_id=d.control_id).first()
    mappings = json.loads(control.compliance_mappings) if control and control.compliance_mappings else []

    return {
        "id": d.id,
        "control_id": d.control_id,
        "status": d.status,
        "control_now_passing": d.control_id not in currently_failing_control_ids(db),
        "compliance_frameworks_affected": mappings,
    }
