"""
Shared helper: a control's *current* health should reflect its most recent
observed state, not "has this control ever drifted in history." Otherwise a
control that drifted once 40 days ago and was fixed would still show as
failing forever, which misrepresents real posture.
"""
from sqlalchemy.orm import Session
from database.models import DriftEvent


def currently_failing_control_ids(session: Session) -> set:
    """
    For each control_id, look at its most recent DriftEvent (by timestamp).
    A control counts as currently failing if that latest event is real drift,
    not suppressed, and not yet marked remediated.
    """
    all_events = (
        session.query(DriftEvent)
        .order_by(DriftEvent.control_id, DriftEvent.timestamp.desc())
        .all()
    )
    latest_by_control = {}
    for e in all_events:
        if e.control_id not in latest_by_control:
            latest_by_control[e.control_id] = e

    failing = set()
    for control_id, e in latest_by_control.items():
        if e.is_drift and not e.suppressed and e.status != "remediated":
            failing.add(control_id)
    return failing
