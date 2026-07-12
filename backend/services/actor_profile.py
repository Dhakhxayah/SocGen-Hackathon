"""
Module A3 — Actor Risk Profile (Insider Risk Ranking)

The ML engine already computes actor-level aggregates (actor_risk_history,
actor_change_frequency) purely as model features and throws them away after
training. This module recomputes the same kind of per-actor aggregates —
plus a few more (off-hours rate, unapproved rate, ML anomaly rate, incident
involvement) — and turns them into a standalone ranked view: "who is the
riskiest actor in this environment, and why."

This is deliberately a separate, human-facing read model rather than a
persisted table: it's cheap to compute on demand from DriftEvent +
Incident, and staying stateless means it never drifts out of sync with the
pipeline's latest run.
"""
import datetime as dt
from collections import defaultdict
from sqlalchemy.orm import Session

from database.models import DriftEvent, Incident

SEVERITY_WEIGHT = {"CRITICAL": 10, "HIGH": 8, "MEDIUM": 5, "LOW": 2, "NONE": 0}
UNAPPROVED_STATUSES = {"pending", "none", "expired_temporary"}


def _off_hours(ts):
    if not ts:
        return False
    return ts.hour < 6 or ts.hour >= 22


def _risk_tier(score):
    if score >= 70:
        return "Critical"
    if score >= 45:
        return "Elevated"
    if score >= 20:
        return "Watch"
    return "Low"


def _build_profile(actor, evs, incidents_for_actor):
    total = len(evs)
    drift_evs = [e for e in evs if e.is_drift]
    risky_evs = [e for e in drift_evs if SEVERITY_WEIGHT.get(e.severity, 0) >= 8]
    critical_evs = [e for e in drift_evs if e.severity == "CRITICAL"]
    unapproved = [e for e in drift_evs if e.approval_status in UNAPPROVED_STATUSES]
    off_hours_evs = [e for e in drift_evs if _off_hours(e.timestamp)]
    ml_flagged = [e for e in drift_evs if e.ml_is_anomaly]
    surfaced = [e for e in drift_evs if not e.suppressed]
    domains = sorted({e.domain for e in drift_evs if e.domain})
    controls = {e.control_id for e in drift_evs}

    n_drift = len(drift_evs) or 1  # avoid div-by-zero, rates just read 0
    avg_risk = round(sum(e.risk_score or 0 for e in drift_evs) / len(drift_evs), 1) if drift_evs else 0.0

    actor_risk_history = round(len(risky_evs) / total, 3) if total else 0.0
    off_hours_rate = round(len(off_hours_evs) / n_drift * 100, 1) if drift_evs else 0.0
    unapproved_rate = round(len(unapproved) / n_drift * 100, 1) if drift_evs else 0.0
    ml_anomaly_rate = round(len(ml_flagged) / n_drift * 100, 1) if drift_evs else 0.0

    compound_incidents = sum(1 for i in incidents_for_actor if i.is_compound)

    # Composite 0-100 "insider risk score": blends how risky this actor's
    # historical severity mix is, how much of their activity happens off
    # hours or without approval, how often the ML layer independently
    # flags them as behaviorally anomalous, and how many correlated
    # incidents they've been the anchor actor for.
    composite = (
        actor_risk_history * 35
        + (off_hours_rate / 100) * 20
        + (unapproved_rate / 100) * 20
        + (ml_anomaly_rate / 100) * 15
        + min(len(incidents_for_actor) / 3, 1) * 10
    )
    composite = round(min(composite, 100.0), 1)

    last_ts = max((e.timestamp for e in evs if e.timestamp), default=None)

    return {
        "actor": actor,
        "total_events": total,
        "drift_events": len(drift_evs),
        "risky_events": len(risky_evs),
        "critical_events": len(critical_evs),
        "surfaced_events": len(surfaced),
        "unapproved_count": len(unapproved),
        "unapproved_rate": unapproved_rate,
        "off_hours_count": len(off_hours_evs),
        "off_hours_rate": off_hours_rate,
        "ml_anomalies_flagged": len(ml_flagged),
        "ml_anomaly_rate": ml_anomaly_rate,
        "domains_touched": domains,
        "controls_touched": len(controls),
        "avg_risk_score": avg_risk,
        "actor_risk_history": actor_risk_history,
        "incidents_touched": len(incidents_for_actor),
        "compound_incidents_touched": compound_incidents,
        "insider_risk_score": composite,
        "risk_tier": _risk_tier(composite),
        "last_active": last_ts.isoformat() if last_ts else None,
    }


def compute_actor_profiles(session: Session):
    events = session.query(DriftEvent).all()
    by_actor = defaultdict(list)
    for e in events:
        by_actor[e.changed_by].append(e)

    incidents = session.query(Incident).all()
    incidents_by_actor = defaultdict(list)
    for inc in incidents:
        incidents_by_actor[inc.actor].append(inc)

    profiles = [
        _build_profile(actor, evs, incidents_by_actor.get(actor, []))
        for actor, evs in by_actor.items()
        if actor
    ]
    profiles.sort(key=lambda p: -p["insider_risk_score"])
    return profiles


def get_actor_detail(session: Session, actor: str):
    events = session.query(DriftEvent).filter(DriftEvent.changed_by == actor).all()
    if not events:
        return None

    incidents = session.query(Incident).filter(Incident.actor == actor).all()
    profile = _build_profile(actor, events, incidents)

    drift_events = sorted(
        [e for e in events if e.is_drift], key=lambda e: e.timestamp or dt.datetime.min, reverse=True
    )[:75]
    timeline = [{
        "id": e.id,
        "control_id": e.control_id,
        "domain": e.domain,
        "category": e.category,
        "severity": e.severity,
        "description": e.description,
        "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        "approval_status": e.approval_status,
        "suppressed": e.suppressed,
        "ml_is_anomaly": e.ml_is_anomaly,
        "risk_score": e.risk_score,
    } for e in drift_events]

    incident_list = sorted(
        [{
            "id": i.id,
            "incident_id": i.incident_id,
            "title": i.title,
            "is_compound": i.is_compound,
            "max_severity": i.max_severity,
            "total_risk_score": i.total_risk_score,
            "window_start": i.window_start.isoformat() if i.window_start else None,
        } for i in incidents],
        key=lambda i: i["window_start"] or "", reverse=True,
    )

    domain_breakdown = defaultdict(int)
    category_breakdown = defaultdict(int)
    for e in events:
        if not e.is_drift:
            continue
        domain_breakdown[e.domain] += 1
        category_breakdown[e.category] += 1

    return {
        **profile,
        "timeline": timeline,
        "incidents": incident_list,
        "domain_breakdown": dict(domain_breakdown),
        "category_breakdown": dict(category_breakdown),
    }
