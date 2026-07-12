from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import DriftEvent
from services.ml_engine import FEATURE_COLUMNS, compare_rules_vs_ml

router = APIRouter()


@router.get("/ml/scatter")
def ml_scatter(db: Session = Depends(get_db)):
    """risk_score vs ml_anomaly_score per event — for the anomaly scatter chart."""
    rows = (
        db.query(DriftEvent)
        .filter(DriftEvent.is_drift.is_(True))
        .filter(DriftEvent.ml_anomaly_score.isnot(None))
        .all()
    )
    return [
        {
            "id": d.id,
            "control_id": d.control_id,
            "risk_score": d.risk_score,
            "ml_anomaly_score": d.ml_anomaly_score,
            "ml_is_anomaly": d.ml_is_anomaly,
            "severity": d.severity,
            "suppressed": d.suppressed,
        }
        for d in rows
    ]


@router.get("/ml/summary")
def ml_summary(db: Session = Depends(get_db)):
    total = db.query(DriftEvent).count()
    scored = db.query(DriftEvent).filter(DriftEvent.ml_anomaly_score.isnot(None)).count()
    flagged = db.query(DriftEvent).filter(DriftEvent.ml_is_anomaly.is_(True)).count()
    flagged_but_suppressed = db.query(DriftEvent).filter(
        DriftEvent.ml_is_anomaly.is_(True), DriftEvent.suppressed.is_(True)
    ).count()

    return {
        "model": "IsolationForest (scikit-learn)",
        "training_strategy": "Fit on labeled-benign subset (approved CI/CD, autoscale, "
                              "maintenance-window changes, and baseline-matching events); "
                              "scores every event by dissimilarity from that learned normal.",
        "feature_columns": FEATURE_COLUMNS,
        "total_events": total,
        "events_scored": scored,
        "anomalies_flagged": flagged,
        "anomalies_also_rule_suppressed": flagged_but_suppressed,
    }


@router.get("/ml/comparison")
def ml_comparison(db: Session = Depends(get_db)):
    """Rules-vs-ML side-by-side: what each detector would catch alone vs combined."""
    return compare_rules_vs_ml(db)
