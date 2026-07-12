import io
import json
import pandas as pd
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import DriftEvent, Control
from services.pdf_report import build_executive_pdf
from api.dashboard import get_dashboard

router = APIRouter()


@router.get("/report/pdf")
def export_pdf(db: Session = Depends(get_db)):
    """One-page executive PDF: KPI summary, top incidents, compliance snapshot."""
    dashboard = get_dashboard(db)
    pdf_bytes = build_executive_pdf(db, dashboard)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=securedrift_executive_report.pdf"},
    )


@router.get("/report")
def export_report(db: Session = Depends(get_db), top_n: int = 10):
    """Sample drift report: top N risky, unsuppressed drifts with compliance mapping + remediation."""
    controls_by_id = {c.control_id: c for c in db.query(Control).all()}

    rows = (
        db.query(DriftEvent)
        .filter(DriftEvent.is_drift.is_(True), DriftEvent.suppressed.is_(False))
        .order_by(DriftEvent.risk_score.desc())
        .limit(top_n)
        .all()
    )

    records = []
    for d in rows:
        control = controls_by_id.get(d.control_id)
        mappings = json.loads(control.compliance_mappings) if control else []
        records.append({
            "control_id": d.control_id,
            "domain": d.domain,
            "category": d.category,
            "system": control.system if control else "",
            "severity": d.severity,
            "risk_score": d.risk_score,
            "ml_anomaly_score": d.ml_anomaly_score,
            "ml_is_anomaly": d.ml_is_anomaly,
            "environment": d.environment,
            "changed_by": d.changed_by,
            "change_source": d.change_source,
            "approval_status": d.approval_status,
            "timestamp": d.timestamp.isoformat() if d.timestamp else "",
            "description": d.description,
            "compliance_mappings": "; ".join(mappings),
            "status": d.status,
            "incident_id": d.incident_id,
        })

    df = pd.DataFrame(records)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=securedrift_report.csv"},
    )


@router.get("/report/full-export")
def export_full(db: Session = Depends(get_db)):
    """All drift events, for audit archival."""
    rows = db.query(DriftEvent).filter(DriftEvent.is_drift.is_(True)).all()
    records = [{
        "control_id": d.control_id, "domain": d.domain, "category": d.category,
        "severity": d.severity, "risk_score": d.risk_score, "environment": d.environment,
        "changed_by": d.changed_by, "change_source": d.change_source,
        "approval_status": d.approval_status, "suppressed": d.suppressed,
        "suppression_reason": d.suppression_reason, "ambiguous": d.ambiguous,
        "timestamp": d.timestamp.isoformat() if d.timestamp else "",
        "status": d.status, "incident_id": d.incident_id,
    } for d in rows]

    df = pd.DataFrame(records)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=securedrift_full_export.csv"},
    )
