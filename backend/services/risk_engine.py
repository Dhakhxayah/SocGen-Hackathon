"""
Module 4 — Risk Scoring Engine

score = (rule_weight x environment_criticality x exposure_multiplier)
        + approval_penalty - suppression_discount

Weights match the PS Option B spec exactly:
  Logging disabled   -> CRITICAL (10)
  Encryption downgrade -> HIGH   (8)
  Firewall broadened -> MEDIUM   (5)
  Timeout increased  -> LOW      (2)
"""
from sqlalchemy.orm import Session
from database.models import DriftEvent, Control

SEVERITY_WEIGHT = {"CRITICAL": 10, "HIGH": 8, "MEDIUM": 5, "LOW": 2, "NONE": 0}
ENV_MULTIPLIER = {"production": 2.0, "staging": 1.5, "dev": 1.0}
EXPOSURE_MULTIPLIER = {"internet_facing": 2.0, "internal": 1.0}
UNAPPROVED_STATUSES = {"pending", "none", "expired_temporary"}

MAX_RAW_SCORE = 10 * 2.0 * 2.0 + 2  # weight * env * exposure + approval penalty ceiling


def score_drift_events(session: Session):
    controls_by_id = {c.control_id: c for c in session.query(Control).all()}
    drift_events = session.query(DriftEvent).filter(DriftEvent.is_drift.is_(True)).all()

    for de in drift_events:
        control = controls_by_id.get(de.control_id)
        exposure = control.exposure if control else "internal"

        weight = SEVERITY_WEIGHT.get(de.severity, 0)
        env_mult = ENV_MULTIPLIER.get(de.environment, 1.0)
        exp_mult = EXPOSURE_MULTIPLIER.get(exposure, 1.0)

        approval_penalty = 2 if de.approval_status in UNAPPROVED_STATUSES else 0
        suppression_discount = 5 if de.suppressed else 0

        raw = (weight * env_mult * exp_mult) + approval_penalty - suppression_discount
        raw = max(raw, 0)

        normalized = min(100.0, round((raw / MAX_RAW_SCORE) * 100, 1))
        de.risk_score = normalized

    session.commit()
    return drift_events


def priority_bucket(score: float) -> str:
    if score >= 70:
        return "P1 - Immediate"
    if score >= 45:
        return "P2 - Urgent"
    if score >= 20:
        return "P3 - Scheduled"
    return "P4 - Monitor"
