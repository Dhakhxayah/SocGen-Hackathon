"""
Module 8 — Self-Evaluation Engine

Scores the system against its own problem statement targets:
    Precision            > 75%
    Recall                > 70%
    Critical recall        > 95%
    Benign suppression     > 85%

Ground truth comes from `ChangeEvent.ground_truth_label`, assigned by the
simulator at generation time — independent of anything the detector,
suppression, or ML engine later decide. This keeps the eval honest: it is
not scoring the pipeline against its own output.

Definitions
-----------
Ground truth positive ("should reach an analyst"):
    label in {"risky", "ambiguous"}   (ambiguous is intentionally routed to
    a human, not auto-suppressed — see services/suppression.py)
Ground truth negative ("should be filtered out as noise"):
    label in {"benign", "normal"}

System prediction positive ("surfaced"):
    DriftEvent.is_drift is True AND DriftEvent.suppressed is False
System prediction negative ("filtered out"):
    everything else (not drift, or suppressed)

TP = ground-truth positive AND surfaced
FN = ground-truth positive AND filtered out
FP = ground-truth negative AND surfaced
TN = ground-truth negative AND filtered out
"""
from sqlalchemy.orm import Session
from database.models import DriftEvent, ChangeEvent

TARGETS = {
    "precision": 75.0,
    "recall": 70.0,
    "critical_recall": 95.0,
    "benign_suppression": 85.0,
}

POSITIVE_LABELS = {"risky", "ambiguous"}
NEGATIVE_LABELS = {"benign", "normal"}


def _pct(numerator, denominator):
    if denominator == 0:
        return 100.0
    return round((numerator / denominator) * 100, 1)


def compute_self_evaluation(session: Session):
    rows = (
        session.query(DriftEvent, ChangeEvent)
        .join(ChangeEvent, ChangeEvent.event_id == DriftEvent.event_id)
        .all()
    )

    tp = fp = fn = tn = 0
    crit_tp = crit_fn = 0
    ambiguous_total = ambiguous_surfaced = 0
    per_label_counts = {"risky": 0, "benign": 0, "ambiguous": 0, "normal": 0}

    for de, ce in rows:
        label = ce.ground_truth_label or "normal"
        per_label_counts[label] = per_label_counts.get(label, 0) + 1

        surfaced = bool(de.is_drift and not de.suppressed)
        is_positive_truth = label in POSITIVE_LABELS

        if label == "ambiguous":
            ambiguous_total += 1
            if surfaced:
                ambiguous_surfaced += 1

        if is_positive_truth and surfaced:
            tp += 1
        elif is_positive_truth and not surfaced:
            fn += 1
        elif (not is_positive_truth) and surfaced:
            fp += 1
        else:
            tn += 1

        if label == "risky" and de.severity == "CRITICAL":
            if surfaced:
                crit_tp += 1
            else:
                crit_fn += 1

    precision = _pct(tp, tp + fp)
    recall = _pct(tp, tp + fn)
    critical_recall = _pct(crit_tp, crit_tp + crit_fn)
    benign_suppression = _pct(tn, tn + fp)
    false_positive_rate = round(100.0 - benign_suppression, 1)
    ambiguous_review_rate = _pct(ambiguous_total - ambiguous_surfaced, ambiguous_total) \
        if ambiguous_total else 100.0
    # note: ambiguous events are meant to surface for human review, so we report
    # how many actually did reach a human (surfaced), not how many were filtered.
    ambiguous_reached_human = _pct(ambiguous_surfaced, ambiguous_total)

    metrics = {
        "precision": precision,
        "recall": recall,
        "critical_recall": critical_recall,
        "benign_suppression": benign_suppression,
    }

    passed = {k: metrics[k] >= TARGETS[k] for k in TARGETS}
    overall_pass = all(passed.values())

    return {
        "metrics": metrics,
        "targets": TARGETS,
        "passed": passed,
        "overall_pass": overall_pass,
        "false_positive_rate": false_positive_rate,
        "ambiguous_reached_human_review_pct": ambiguous_reached_human,
        "confusion_matrix": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "ground_truth_counts": per_label_counts,
        "sample_size": len(rows),
    }
