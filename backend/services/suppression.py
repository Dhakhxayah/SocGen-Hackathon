"""
Module 3 — Benign Change Suppression Logic

Filters out low-value noise (CI/CD deploys, autoscaling, approved
maintenance) so the risky drift isn't drowned out. CRITICAL severity is
never fully suppressed - it only gets a scoring discount - because a
"whitelisted pipeline" is exactly how Real Incident #1 in the PS slipped
through (encryption AES-256 -> AES-128 via an approved pipeline).
"""
from sqlalchemy.orm import Session
from database.models import DriftEvent

NEVER_FULLY_SUPPRESS = {"CRITICAL"}


def apply_suppression(session: Session):
    drift_events = session.query(DriftEvent).filter(DriftEvent.suppressed.is_(False)).all()
    updated = []

    for de in drift_events:
        if not de.is_drift:
            # normal state, nothing to suppress or escalate
            continue
        if de.ambiguous:
            # ambiguous changes are never auto-suppressed - they need human eyes
            continue

        reason = None
        if de.change_source in ("ci_cd", "autoscale") and de.approval_status == "approved" \
                and de.severity in ("LOW", "MEDIUM"):
            reason = f"Benign: approved {de.change_source} change, severity {de.severity}"
        elif de.change_source in ("ci_cd", "autoscale") and de.approval_status == "approved" \
                and de.severity in ("HIGH", "CRITICAL") and de.change_source == "autoscale":
            # autoscaling can legitimately touch security groups (HIGH) - still suppress if approved
            reason = "Benign: approved autoscaling event (security group churn)"

        if reason and de.severity not in NEVER_FULLY_SUPPRESS:
            de.suppressed = True
            de.suppression_reason = reason
            updated.append(de)

    session.commit()
    return updated
