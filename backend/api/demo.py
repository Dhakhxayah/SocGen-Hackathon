"""
Live Demo Mode — "trigger one live incident" and watch it flow through the
entire pipeline (detect -> suppress -> score -> ML -> correlate -> blast
radius -> AI analyst) in a single request. The response is a step-by-step
trace; the frontend reveals each stage with a short delay so judges watch
detection happen in near-real-time instead of a wall of pre-baked data.
"""
import json
import random
import string
import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Control, ChangeEvent, DriftEvent, Incident
from services.drift_detector import detect_drift
from services.suppression import apply_suppression
from services.risk_engine import score_drift_events
from services.ml_engine import train_and_score
from services.correlation_engine import correlate_incidents
from services.blast_radius import estimate_all_incidents
from services.ai_engine import analyze_incident

router = APIRouter()


def _rand_id(prefix, n=6):
    return f"{prefix}-{''.join(random.choices(string.ascii_lowercase + string.digits, k=n))}"


def _flip_value(baseline_value, category):
    if category == "encryption":
        return "AES-128" if baseline_value == "AES-256" else baseline_value
    if baseline_value in ("true", "false"):
        return "false" if baseline_value == "true" else "true"
    return "modified_value"


@router.post("/demo/trigger-incident")
def trigger_live_incident(db: Session = Depends(get_db)):
    """
    Injects a fresh 3-step compound drift (logging disabled -> firewall
    opened -> encryption downgraded, same actor, ~10 minutes apart — the
    exact "Real Incident #2" pattern from the problem statement) and runs
    the full pipeline against it, returning a stage-by-stage trace.
    """
    controls = db.query(Control).all()
    if not controls:
        return {"error": "no controls in database — run /simulate first"}

    log_controls = [c for c in controls if c.category == "logging"]
    fw_controls = [c for c in controls if c.category == "firewall"]
    enc_controls = [c for c in controls if c.category == "encryption"]

    chosen = [c for c in (
        random.choice(log_controls) if log_controls else None,
        random.choice(fw_controls) if fw_controls else None,
        random.choice(enc_controls) if enc_controls else None,
    ) if c is not None]

    if len(chosen) < 2:
        return {"error": "not enough control diversity (need logging/firewall/encryption controls) — run /simulate first"}

    actor = f"live_demo_actor_{random.randint(100, 999)}"
    base_ts = dt.datetime.utcnow()
    new_event_ids = []
    ingest_trace = []

    for i, control in enumerate(chosen):
        ts = base_ts + dt.timedelta(minutes=i * 9)
        current_value = _flip_value(control.baseline_value, control.category)
        ce = ChangeEvent(
            event_id=_rand_id("demo-evt"),
            timestamp=ts,
            control_id=control.control_id,
            action="modification",
            parameter=control.parameter,
            baseline_value=control.baseline_value,
            current_value=current_value,
            changed_by=actor,
            change_source="manual",
            approval_status="none",
            environment=control.environment,
            maintenance_window=False,
            domain=control.domain,
            category=control.category,
            ground_truth_label="risky",
        )
        db.add(ce)
        db.flush()
        new_event_ids.append(ce.event_id)
        ingest_trace.append({
            "event_id": ce.event_id,
            "control_id": control.control_id,
            "system": control.system,
            "category": control.category,
            "domain": control.domain,
            "parameter": control.parameter,
            "baseline_value": control.baseline_value,
            "current_value": current_value,
            "timestamp": ts.isoformat(),
            "changed_by": actor,
        })
    db.commit()

    # --- run the real pipeline, exactly as /reprocess does ---
    detect_drift(db)
    apply_suppression(db)
    score_drift_events(db)
    ml_result = train_and_score(db)
    correlate_incidents(db)
    estimate_all_incidents(db)

    drift_rows = (
        db.query(DriftEvent)
        .filter(DriftEvent.event_id.in_(new_event_ids))
        .all()
    )

    def _drift_summary(d: DriftEvent):
        return {
            "id": d.id,
            "control_id": d.control_id,
            "severity": d.severity,
            "description": d.description,
            "suppressed": d.suppressed,
            "suppression_reason": d.suppression_reason,
            "risk_score": d.risk_score,
            "ml_anomaly_score": d.ml_anomaly_score,
            "ml_is_anomaly": d.ml_is_anomaly,
            "incident_id": d.incident_id,
        }

    detect_stage = [_drift_summary(d) for d in drift_rows]
    suppress_stage = [
        {"control_id": d.control_id, "suppressed": d.suppressed,
         "reason": d.suppression_reason or "not suppressed — surfaced for review"}
        for d in drift_rows
    ]
    score_stage = [{"control_id": d.control_id, "risk_score": d.risk_score, "severity": d.severity}
                   for d in drift_rows]
    ml_stage = [
        {"control_id": d.control_id, "ml_anomaly_score": d.ml_anomaly_score, "ml_is_anomaly": d.ml_is_anomaly}
        for d in drift_rows
    ]

    incident_ids = {d.incident_id for d in drift_rows if d.incident_id}
    incident_stage = None
    ai_stage = None
    blast_stage = None
    if incident_ids:
        inc = db.query(Incident).filter(Incident.id.in_(incident_ids)).order_by(
            Incident.total_risk_score.desc()
        ).first()
        incident_stage = {
            "incident_id": inc.incident_id,
            "title": inc.title,
            "actor": inc.actor,
            "domains_involved": json.loads(inc.domains_involved or "[]"),
            "max_severity": inc.max_severity,
            "total_risk_score": inc.total_risk_score,
            "is_compound": inc.is_compound,
        }
        blast_stage = {
            "blast_radius_score": inc.blast_radius_score,
            "hops": inc.blast_radius_hops,
            "exposed_systems": json.loads(inc.blast_radius_systems or "[]")[:8],
        }
        inc, used_fallback = analyze_incident(db, inc)
        ai_stage = {
            "root_cause": inc.ai_root_cause,
            "risk_explanation": inc.ai_risk_explanation,
            "mitre_technique": inc.ai_mitre_technique,
            "compliance_impact": inc.ai_compliance_impact,
            "remediation_steps": json.loads(inc.ai_remediation_steps or "[]"),
            "priority": inc.ai_priority,
            "used_fallback": used_fallback,
        }

    return {
        "actor": actor,
        "stages": [
            {"stage": "ingest", "label": "Change events ingested", "detail": ingest_trace},
            {"stage": "detect", "label": "Drift Detection Engine", "detail": detect_stage},
            {"stage": "suppress", "label": "Benign Suppression Filter", "detail": suppress_stage},
            {"stage": "score", "label": "Risk Scoring Engine", "detail": score_stage},
            {"stage": "ml", "label": "ML Anomaly Detection", "detail": ml_stage, "meta": ml_result},
            {"stage": "correlate", "label": "Cross-Domain Correlation", "detail": incident_stage},
            {"stage": "blast_radius", "label": "Blast Radius Estimation", "detail": blast_stage},
            {"stage": "ai_analyst", "label": "AI Security Analyst", "detail": ai_stage},
        ],
    }
