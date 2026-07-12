"""
Module 7 — AI Security Analyst

Sends a compound incident (controls, drift, actor, timeline, compliance
context) to Groq (Llama 3.3 70B, free tier, very fast inference) and asks
for a structured JSON analyst narrative: root cause, risk explanation,
MITRE technique, compliance impact, and an ordered remediation plan.

If GROQ_API_KEY isn't set (or the request fails for any reason - offline
demo, rate limit, etc.) this falls back to a deterministic, rule-based
narrative generator so the demo never breaks mid-pitch.
"""
import os
import json
import datetime as dt
import requests
from dotenv import load_dotenv

from database.models import Incident, DriftEvent, Control
from services.compliance_mapper import mitre_for_category, compliance_for_control

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_PROMPT = """You are a senior security analyst reviewing correlated configuration \
drift incidents for an enterprise SOC. You are given a compound drift incident spanning \
one or more control domains (cloud, network, endpoint, identity). Respond with ONLY a \
JSON object (no markdown, no preamble) with exactly these keys:
{
  "root_cause": "1-2 sentence plain-English root cause hypothesis",
  "risk_explanation": "2-3 sentences on why this combination is dangerous",
  "mitre_technique": "primary MITRE ATT&CK technique id + name",
  "compliance_impact": "which frameworks/controls this violates and why, 1-2 sentences",
  "remediation_steps": ["ordered", "list", "of", "concrete", "fix", "steps"],
  "priority": "P1 - Immediate | P2 - Urgent | P3 - Scheduled | P4 - Monitor"
}"""


def _build_incident_context(session, incident: Incident) -> dict:
    drift_events = session.query(DriftEvent).filter_by(incident_id=incident.id).all()
    controls_by_id = {c.control_id: c for c in session.query(Control).filter(
        Control.control_id.in_([d.control_id for d in drift_events])
    ).all()}

    events_ctx = []
    for d in drift_events:
        control = controls_by_id.get(d.control_id)
        events_ctx.append({
            "control_id": d.control_id,
            "category": d.category,
            "domain": d.domain,
            "severity": d.severity,
            "description": d.description,
            "environment": d.environment,
            "approval_status": d.approval_status,
            "change_source": d.change_source,
            "timestamp": d.timestamp.isoformat() if d.timestamp else None,
            "compliance_mappings": compliance_for_control(session, d.control_id),
            "system": control.system if control else None,
        })

    return {
        "incident_id": incident.incident_id,
        "actor": incident.actor,
        "window_start": incident.window_start.isoformat() if incident.window_start else None,
        "window_end": incident.window_end.isoformat() if incident.window_end else None,
        "domains_involved": json.loads(incident.domains_involved or "[]"),
        "is_compound": incident.is_compound,
        "max_severity": incident.max_severity,
        "total_risk_score": incident.total_risk_score,
        "drift_events": events_ctx,
    }


def _fallback_analysis(context: dict) -> dict:
    """Deterministic rule-based narrative used when Groq is unavailable."""
    events = context["drift_events"]
    categories = [e["category"] for e in events]
    domains = context["domains_involved"]
    actor = context["actor"]
    unapproved = any(e["approval_status"] in ("pending", "none", "expired_temporary") for e in events)

    root_cause = (
        f"{len(events)} related controls across {len(domains)} domain(s) were weakened by "
        f"'{actor}' within the same change window"
        + (", with no approval trail on record" if unapproved else ", though some changes carried approvals")
        + " — consistent with either a misconfigured automation source or a manual/insider change."
    )

    risk_explanation = (
        "Individually, each change might pass as routine. Combined, they remove "
        "overlapping layers of defense (visibility, access control, and/or data "
        "protection) in the same window, which is the classic pattern for defense "
        "evasion ahead of, or during, an intrusion. This compounding effect is exactly "
        "what single-control monitors miss."
    )

    primary_category = categories[0] if categories else "access"
    mitre = mitre_for_category(primary_category)

    all_mappings = sorted({m for e in events for m in e["compliance_mappings"]})
    compliance_impact = (
        f"Violates {', '.join(all_mappings[:6])}"
        + (" and others" if len(all_mappings) > 6 else "")
        + ". Continuous monitoring and baseline configuration requirements are not being met "
          "for the affected controls."
    )

    # sequence remediation: restore visibility (logging) first, then access/firewall, then encryption/endpoint
    order_priority = {"logging": 0, "access": 1, "firewall": 2, "endpoint": 3, "encryption": 4}
    ordered_events = sorted(events, key=lambda e: order_priority.get(e["category"], 5))
    steps = []
    for e in ordered_events:
        steps.append(
            f"Restore {e['control_id']} ({e['category']}) on {e.get('system') or e['domain']} "
            f"to its approved baseline; verify via {e['domain']} console and re-run compliance check."
        )
    steps.append(f"Review recent activity by actor '{actor}' for the affected systems and confirm intent.")
    steps.append("File/close the change ticket retroactively or open an incident review if unauthorized.")

    max_sev = context["max_severity"]
    priority = "P1 - Immediate" if max_sev == "CRITICAL" or context["is_compound"] else \
               "P2 - Urgent" if max_sev == "HIGH" else "P3 - Scheduled"

    return {
        "root_cause": root_cause,
        "risk_explanation": risk_explanation,
        "mitre_technique": mitre,
        "compliance_impact": compliance_impact,
        "remediation_steps": steps,
        "priority": priority,
    }


def _call_groq(context: dict) -> dict:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(context, indent=2)},
        ],
        "temperature": 0.3,
        "max_tokens": 900,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(GROQ_URL, headers=headers, json=payload, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)


def analyze_incident(session, incident: Incident) -> Incident:
    context = _build_incident_context(session, incident)

    analysis = None
    used_fallback = False
    if GROQ_API_KEY:
        try:
            analysis = _call_groq(context)
        except Exception:
            used_fallback = True
    else:
        used_fallback = True

    if analysis is None:
        analysis = _fallback_analysis(context)

    incident.ai_root_cause = analysis.get("root_cause", "")
    incident.ai_risk_explanation = analysis.get("risk_explanation", "")
    incident.ai_mitre_technique = analysis.get("mitre_technique", "")
    incident.ai_compliance_impact = analysis.get("compliance_impact", "")
    incident.ai_remediation_steps = json.dumps(analysis.get("remediation_steps", []))
    incident.ai_priority = analysis.get("priority", "P3 - Scheduled")
    incident.ai_generated_at = dt.datetime.utcnow()

    session.commit()
    return incident, used_fallback
