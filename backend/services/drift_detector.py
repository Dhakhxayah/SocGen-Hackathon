"""
Module 2 — Drift Detection Engine

Compares each ChangeEvent's current_value against the Control baseline.
Produces a DriftEvent row for every change (including non-drifted / normal
state) so the dashboard can report "X/Y controls passing" accurately.
"""
import datetime as dt
from sqlalchemy.orm import Session

from database.models import Control, ChangeEvent, DriftEvent


def _describe(control: Control, event: ChangeEvent) -> str:
    return (f"{control.parameter} on {control.system} changed from "
            f"'{event.baseline_value}' to '{event.current_value}' "
            f"(source: {event.change_source}, by: {event.changed_by})")


def detect_drift(session: Session):
    """
    Walk every ChangeEvent, compare to its Control baseline, and create a
    DriftEvent record classifying it as drift or normal state.
    Returns the list of created DriftEvent rows.
    """
    controls_by_id = {c.control_id: c for c in session.query(Control).all()}
    change_events = session.query(ChangeEvent).all()

    created = []
    for event in change_events:
        # skip if already processed
        existing = session.query(DriftEvent).filter_by(event_id=event.event_id).first()
        if existing:
            continue

        control = controls_by_id.get(event.control_id)
        if control is None:
            continue

        is_drift = str(event.current_value) != str(event.baseline_value)
        severity = control.severity_if_drifted if is_drift else "NONE"

        ambiguous = False
        ambiguous_reason = None
        if event.approval_status == "expired_temporary":
            ambiguous = True
            ambiguous_reason = "Temporary change never reverted after approval expiry"
        elif is_drift and event.approval_status == "none" and event.change_source == "manual" and \
                (dt.datetime.utcnow() - event.timestamp).total_seconds() < 4 * 3600 and \
                0 <= event.timestamp.hour <= 5:
            ambiguous = True
            ambiguous_reason = "Off-hours manual change with no approval trail"

        de = DriftEvent(
            event_id=event.event_id,
            control_id=event.control_id,
            timestamp=event.timestamp,
            domain=event.domain,
            category=event.category,
            environment=event.environment,
            changed_by=event.changed_by,
            change_source=event.change_source,
            approval_status=event.approval_status,
            maintenance_window=event.maintenance_window,
            is_drift=is_drift,
            severity=severity,
            description=_describe(control, event) if is_drift else "Matches baseline (normal state)",
            ambiguous=ambiguous,
            ambiguous_reason=ambiguous_reason,
            status="new",
        )
        session.add(de)
        created.append(de)

    session.commit()
    return created
