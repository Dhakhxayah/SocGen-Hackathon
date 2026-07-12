"""
Module A5 — Attack Path Reconstruction

For a compound incident, orders its correlated drift events chronologically
and overlays each step with the MITRE ATT&CK tactic implied by its control
category (reusing the same category -> technique map the AI analyst uses),
then extends the chain into the blast-radius graph to show which downstream
systems become reachable if the sequence continues unaddressed.

This turns "N drift events happened near each other" into an explicit
kill-chain narrative: what the actor touched, in what order, how much time
elapsed between steps, and what's reachable from the last system touched —
using data the pipeline already computed (correlation + blast radius), not
a new model.
"""
from database.models import Incident, DriftEvent, Control
from services.compliance_mapper import mitre_for_category

TACTIC_BY_CATEGORY = {
    "access": "Credential Access / Initial Access",
    "logging": "Defense Evasion",
    "firewall": "Defense Evasion / Lateral Movement",
    "endpoint": "Persistence / Defense Evasion",
    "encryption": "Collection / Exfiltration",
}


def build_attack_path(session, incident: Incident):
    from services.blast_radius import build_infra_graph, estimate_blast_radius

    events = (
        session.query(DriftEvent)
        .filter_by(incident_id=incident.id)
        .order_by(DriftEvent.timestamp)
        .all()
    )
    if not events:
        return {"nodes": [], "edges": [], "narrative": "No correlated events to chain."}

    controls_by_id = {
        c.control_id: c
        for c in session.query(Control)
        .filter(Control.control_id.in_([e.control_id for e in events]))
        .all()
    }

    nodes = []
    edges = []

    actor_node_id = f"actor::{incident.actor}"
    nodes.append({
        "id": actor_node_id,
        "type": "actor",
        "label": incident.actor,
        "detail": "Origin actor for this correlated change sequence",
    })

    prev_node_id = actor_node_id
    tactics_seen = []
    for i, e in enumerate(events):
        control = controls_by_id.get(e.control_id)
        node_id = f"step::{e.id}"
        tactic = TACTIC_BY_CATEGORY.get(e.category, "Impact")
        tactics_seen.append(tactic)
        technique = mitre_for_category(e.category)

        nodes.append({
            "id": node_id,
            "type": "step",
            "step_index": i + 1,
            "label": e.control_id,
            "domain": e.domain,
            "category": e.category,
            "severity": e.severity,
            "tactic": tactic,
            "technique": technique,
            "system": control.system_instance if control else None,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            "description": e.description,
            "ml_is_anomaly": e.ml_is_anomaly,
            "risk_score": e.risk_score,
        })

        gap_minutes = None
        if i > 0 and events[i - 1].timestamp and e.timestamp:
            gap_minutes = round((e.timestamp - events[i - 1].timestamp).total_seconds() / 60, 1)

        edges.append({"source": prev_node_id, "target": node_id, "gap_minutes": gap_minutes})
        prev_node_id = node_id

    # Extend the chain into the blast-radius graph: where could this go next
    # if it isn't remediated.
    graph = build_infra_graph(session)
    br = estimate_blast_radius(session, incident, graph=graph)
    exposed = br["exposed_systems"][:6]
    for sys in exposed:
        node_id = f"impact::{sys['system']}"
        nodes.append({
            "id": node_id,
            "type": "impact",
            "label": sys["system"],
            "hops_away": sys["hops_away"],
            "controls_attached": sys["controls_attached"],
        })
        edges.append({
            "source": prev_node_id,
            "target": node_id,
            "hops_away": sys["hops_away"],
            "is_projected": True,
        })

    unique_domains = len({e.domain for e in events})
    unique_tactics = sorted(set(tactics_seen), key=tactics_seen.index)
    narrative = (
        f"{incident.actor} touched {len(events)} control(s) across {unique_domains} domain(s) in sequence, "
        f"progressing through {' -> '.join(unique_tactics)}. "
        + (
            f"If left unremediated, blast-radius traversal shows {len(exposed)} downstream system(s) "
            f"reachable within {incident.blast_radius_hops or 2} hop(s) of the last touched control."
            if exposed else
            "No further systems are reachable from the affected controls within the traversal limit."
        )
    )

    return {"nodes": nodes, "edges": edges, "narrative": narrative}
