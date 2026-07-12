import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Control, DriftEvent
from services.state import currently_failing_control_ids

router = APIRouter()


@router.get("/controls")
def list_controls(db: Session = Depends(get_db)):
    controls = db.query(Control).all()
    failing_ids = currently_failing_control_ids(db)
    latest_severity = {}
    for d in db.query(DriftEvent).filter(DriftEvent.control_id.in_(failing_ids)).order_by(DriftEvent.timestamp.desc()).all():
        latest_severity.setdefault(d.control_id, d.severity)
    drifted = latest_severity

    result = []
    for c in controls:
        status = "Fail" if c.control_id in drifted else "Pass"
        result.append({
            "control_id": c.control_id,
            "domain": c.domain,
            "category": c.category,
            "system": c.system,
            "parameter": c.parameter,
            "baseline_value": c.baseline_value,
            "environment": c.environment,
            "exposure": c.exposure,
            "severity_if_drifted": c.severity_if_drifted,
            "compliance_mappings": json.loads(c.compliance_mappings or "[]"),
            "status": status,
            "current_severity": drifted.get(c.control_id, "NONE"),
        })
    return result


@router.get("/controls/health-by-category")
def health_by_category(db: Session = Depends(get_db)):
    controls = db.query(Control).all()
    drifted_ids = currently_failing_control_ids(db)

    grid = {}
    for c in controls:
        key = c.category
        grid.setdefault(key, {"category": key, "total": 0, "passing": 0, "failing": 0})
        grid[key]["total"] += 1
        if c.control_id in drifted_ids:
            grid[key]["failing"] += 1
        else:
            grid[key]["passing"] += 1

    out = []
    for row in grid.values():
        row["health_pct"] = round((row["passing"] / row["total"]) * 100, 1) if row["total"] else 100.0
        out.append(row)
    return sorted(out, key=lambda r: r["health_pct"])
