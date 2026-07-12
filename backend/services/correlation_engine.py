"""
Module 5 — Correlation Engine

Groups unsuppressed, risky drift events that share the same actor OR the
same underlying system within a rolling time window (default 2 hours).
If the group spans 2+ distinct domains it becomes an Incident; 3+ domains
is flagged as a full "Compound Incident" (matches the PS sample scenario:
logging + firewall + encryption weakened within 35 minutes by related
actors -> one incident, not three isolated alerts).
"""
import json
import datetime as dt
from sqlalchemy.orm import Session
from database.models import DriftEvent, Incident

WINDOW_HOURS = 2
MIN_SCORE_TO_CONSIDER = 15  # ignore near-zero risk noise when correlating


def _rand_incident_id(existing_count):
    return f"INC-{existing_count + 1:04d}"


def correlate_incidents(session: Session):
    candidates = (
        session.query(DriftEvent)
        .filter(DriftEvent.is_drift.is_(True))
        .filter(DriftEvent.suppressed.is_(False))
        .filter(DriftEvent.risk_score >= MIN_SCORE_TO_CONSIDER)
        .filter(DriftEvent.incident_id.is_(None))
        .order_by(DriftEvent.timestamp)
        .all()
    )

    # group by actor, then re-check time window + domain diversity
    by_actor = {}
    for de in candidates:
        by_actor.setdefault(de.changed_by, []).append(de)

    created_incidents = []
    existing_count = session.query(Incident).count()

    for actor, events in by_actor.items():
        events.sort(key=lambda e: e.timestamp)
        used = set()
        for i, anchor in enumerate(events):
            if anchor.id in used:
                continue
            group = [anchor]
            window_end = anchor.timestamp + dt.timedelta(hours=WINDOW_HOURS)
            for other in events[i + 1:]:
                if other.id in used:
                    continue
                if other.timestamp <= window_end:
                    group.append(other)
                else:
                    break

            domains = {g.domain for g in group}
            if len(group) >= 2 and len(domains) >= 2:
                for g in group:
                    used.add(g.id)
                severities = [g.severity for g in group]
                max_sev = "CRITICAL" if "CRITICAL" in severities else \
                          "HIGH" if "HIGH" in severities else \
                          "MEDIUM" if "MEDIUM" in severities else "LOW"
                total_score = round(sum(g.risk_score for g in group), 1)

                existing_count += 1
                inc = Incident(
                    incident_id=_rand_incident_id(existing_count - 1),
                    title=f"Correlated drift across {len(domains)} domains by {actor}",
                    actor=actor,
                    window_start=min(g.timestamp for g in group),
                    window_end=max(g.timestamp for g in group),
                    domains_involved=json.dumps(sorted(domains)),
                    controls_involved=json.dumps(sorted({g.control_id for g in group})),
                    max_severity=max_sev,
                    total_risk_score=total_score,
                    is_compound=len(domains) >= 3,
                )
                session.add(inc)
                session.flush()  # get inc.id
                for g in group:
                    g.incident_id = inc.id
                created_incidents.append(inc)

    session.commit()
    return created_incidents
