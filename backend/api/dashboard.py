import datetime as dt
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.db import get_db
from database.models import Control, DriftEvent, Incident
from services.compliance_mapper import compliance_coverage
from services.state import currently_failing_control_ids

router = APIRouter()


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    total_controls = db.query(Control).count()
    drifted_control_ids = currently_failing_control_ids(db)
    passing_controls = total_controls - len(drifted_control_ids)
    security_score = round((passing_controls / total_controls) * 100, 1) if total_controls else 100.0

    coverage = compliance_coverage(db)
    compliance_score = round(sum(v["coverage_pct"] for v in coverage.values()) / len(coverage), 1) if coverage else 100.0

    critical_drift = db.query(DriftEvent).filter(
        DriftEvent.severity == "CRITICAL", DriftEvent.suppressed.is_(False),
        DriftEvent.status != "remediated"
    ).count()
    high_drift = db.query(DriftEvent).filter(
        DriftEvent.severity == "HIGH", DriftEvent.suppressed.is_(False),
        DriftEvent.status != "remediated"
    ).count()

    total_drift_events = db.query(DriftEvent).filter(DriftEvent.is_drift.is_(True)).count()
    suppressed_events = db.query(DriftEvent).filter(DriftEvent.suppressed.is_(True)).count()
    suppression_rate = round((suppressed_events / total_drift_events) * 100, 1) if total_drift_events else 0.0

    compound_incidents = db.query(Incident).filter(Incident.is_compound.is_(True)).count()
    total_incidents = db.query(Incident).count()

    ml_anomalies = db.query(DriftEvent).filter(
        DriftEvent.ml_is_anomaly.is_(True), DriftEvent.suppressed.is_(False)
    ).count()
    avg_blast_radius = db.query(func.avg(Incident.blast_radius_score)).scalar() or 0.0
    max_blast_radius = db.query(func.max(Incident.blast_radius_score)).scalar() or 0.0

    return {
        "security_score": security_score,
        "compliance_score": compliance_score,
        "total_controls": total_controls,
        "passing_controls": passing_controls,
        "critical_drift_count": critical_drift,
        "high_drift_count": high_drift,
        "total_drift_events": total_drift_events,
        "suppressed_events": suppressed_events,
        "suppression_rate": suppression_rate,
        "total_incidents": total_incidents,
        "compound_incidents": compound_incidents,
        "compliance_coverage": coverage,
        "ml_anomalies_flagged": ml_anomalies,
        "avg_blast_radius": round(avg_blast_radius, 1),
        "max_blast_radius": round(max_blast_radius, 1),
    }


@router.get("/timeline")
def get_timeline(days: int = 14, db: Session = Depends(get_db)):
    since = dt.datetime.utcnow() - dt.timedelta(days=days)
    rows = (
        db.query(
            func.strftime("%Y-%m-%d", DriftEvent.timestamp).label("day"),
            DriftEvent.severity,
            func.count(DriftEvent.id),
        )
        .filter(DriftEvent.is_drift.is_(True), DriftEvent.timestamp >= since)
        .group_by("day", DriftEvent.severity)
        .all()
    )

    by_day = {}
    for day, severity, count in rows:
        by_day.setdefault(day, {"date": day, "CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0})
        by_day[day][severity] = count

    return sorted(by_day.values(), key=lambda r: r["date"])
