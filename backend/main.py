"""
SecureDrift AI — FastAPI backend entrypoint.

Run with:  uvicorn main:app --reload --port 8000
Swagger docs auto-available at:  http://localhost:8000/docs
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database.db import init_db, get_db, SessionLocal
from services.simulator import run_full_simulation
from services.pipeline import run_pipeline

from api import dashboard, controls, drifts, incidents, compliance, reports, ml, evaluation, demo, actors

app = FastAPI(
    title="SecureDrift AI",
    description="Security Control Drift & Misconfiguration Detection Across Enterprise Systems",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local hackathon build — lock down before any real deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router, tags=["Dashboard"])
app.include_router(controls.router, tags=["Controls"])
app.include_router(drifts.router, tags=["Drift Events"])
app.include_router(incidents.router, tags=["Incidents"])
app.include_router(compliance.router, tags=["Compliance"])
app.include_router(reports.router, tags=["Reports"])
app.include_router(ml.router, tags=["ML Insights"])
app.include_router(evaluation.router, tags=["Self-Evaluation"])
app.include_router(demo.router, tags=["Live Demo"])
app.include_router(actors.router, tags=["Actor Risk"])


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def root():
    return {
        "service": "SecureDrift AI",
        "status": "running",
        "docs": "/docs",
        "tip": "POST /simulate to generate a fresh dataset and run the full pipeline",
    }


@app.post("/simulate")
def simulate(
    n_events: int = 750,
    n_windows: int = 35,
    run_analysis: bool = True,
    db: Session = Depends(get_db),
):
    """
    Regenerates the full simulated enterprise dataset (controls, maintenance
    windows, change events) and runs the whole pipeline: drift detection ->
    suppression -> risk scoring -> cross-domain correlation. Optionally also
    kicks off AI analysis for every new incident.
    """
    gen_stats = run_full_simulation(SessionLocal(), n_events=n_events, n_windows=n_windows)
    pipeline_stats = run_pipeline(db)

    ai_stats = None
    if run_analysis:
        from database.models import Incident
        from services.ai_engine import analyze_incident
        incidents_to_analyze = db.query(Incident).filter(Incident.ai_generated_at.is_(None)).all()
        fallback_count = 0
        for inc in incidents_to_analyze:
            inc, used_fallback = analyze_incident(db, inc)
            if used_fallback:
                fallback_count += 1
        ai_stats = {"analyzed": len(incidents_to_analyze), "used_fallback": fallback_count}

    return {
        "generation": gen_stats,
        "pipeline": pipeline_stats,
        "ai_analysis": ai_stats,
    }


@app.post("/reprocess")
def reprocess(db: Session = Depends(get_db)):
    """Re-run detection/suppression/scoring/correlation without regenerating data."""
    return run_pipeline(db)
