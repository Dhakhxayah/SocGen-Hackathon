"""
Runs the full drift pipeline in order, matching the architecture diagram:
Simulator -> Normalizer(implicit, data generated pre-normalized) -> Drift
Detection -> Suppression -> Risk Scoring -> Correlation -> (Compliance is
read on demand) -> AI analysis is triggered per-incident from the API.
"""
from sqlalchemy.orm import Session

from services.drift_detector import detect_drift
from services.suppression import apply_suppression
from services.risk_engine import score_drift_events
from services.correlation_engine import correlate_incidents
from services.ml_engine import train_and_score
from services.blast_radius import estimate_all_incidents


def run_pipeline(session: Session):
    drift_created = detect_drift(session)
    suppressed = apply_suppression(session)
    scored = score_drift_events(session)
    ml_result = train_and_score(session)
    incidents = correlate_incidents(session)
    blast_result = estimate_all_incidents(session)
    return {
        "drift_events_created": len(drift_created),
        "suppressed_count": len(suppressed),
        "scored_count": len(scored),
        "ml_anomaly_detection": ml_result,
        "incidents_created": len(incidents),
        "blast_radius": blast_result,
    }
