# SecureDrift AI

**Security Control Drift & Misconfiguration Detection Across Enterprise Systems**
Hackathon build — **Option A (ML-Driven Cross-Domain Drift Intelligence)**.

Continuously compares live configuration state against approved baselines across cloud,
network, endpoint, and identity controls; filters routine CI/CD and maintenance noise;
scores what's actually risky with both a rules engine *and* a trained Isolation Forest;
correlates related drift across domains into one incident; estimates blast radius across
a synthetic infra dependency graph (NetworkX); maps everything to NIST/CIS/GDPR; and has
an AI security analyst explain root cause, MITRE mapping, and a sequenced fix — instead
of just another alert.

```
SecureDrift-AI/
├── backend/     FastAPI + SQLite + simulator + rule engine + ML anomaly detection +
│                NetworkX blast radius + Groq AI analyst
├── frontend/    React + Vite + Tailwind + Recharts dashboard
```

Backend and frontend are fully separate — run/deploy them independently whenever you're ready.

---

## 0. What makes this "ML-Driven" (Option A), not just heuristics

| PS requirement (Option A) | Where it lives |
|---|---|
| Feature extraction per change event (severity delta, approval, time-of-day, actor history, domain, environment criticality) | `services/ml_engine.py::_engineer_features` |
| Train anomaly detection (Isolation Forest) on labeled benign changes | `services/ml_engine.py::train_and_score` — `sklearn.ensemble.IsolationForest`, fit on approved CI/CD/autoscale/maintenance + baseline-matching events |
| Flag deviations | `ml_is_anomaly` + `ml_anomaly_score` (0-100) written back to every drift event, with a 3-feature explainability snapshot (`ml_top_contributors`) |
| Correlate drift across domains (time-window + actor + system) | `services/correlation_engine.py` |
| Estimate blast radius per incident | `services/blast_radius.py` — `networkx` graph of a synthetic `app -> db -> server` dependency topology, BFS from affected systems, weighted by hop distance × environment criticality |
| LLM-powered analyst narratives (root cause, MITRE, compliance, remediation) | `services/ai_engine.py` — Groq Llama 3.3 70B, with deterministic fallback |
| Dashboard: heatmap, timeline, compound incidents, blast radius viz | `frontend/src/pages/*` |

The ML layer is genuinely trained, not a relabeled rule: `train_and_score()` fits
`StandardScaler` + `IsolationForest` on the benign subset each time you simulate, then
scores the full dataset by dissimilarity from that learned distribution. To keep the
signal meaningful (rather than "anomalous" just re-deriving "high severity"), the
`ml_is_anomaly` flag is the top 20% most anomalous *within the already-drifted*
population — see the comment in `ml_engine.py` for the reasoning.

---

## 1. One-time setup

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Open `backend/.env` and (optionally) add a free Groq API key from
https://console.groq.com/keys — set `GROQ_API_KEY=...`.

> **No Groq key? No problem.** The AI Security Analyst automatically falls back to a
> deterministic, rule-based narrative generator so the app (and your demo) never breaks
> without internet or a key. Add the key later for real LLM-written root-cause analysis.
> The ML anomaly detection and blast radius engine need no external key at all — they
> run 100% locally via scikit-learn and networkx.

### Frontend
```bash
cd frontend
npm install
```

---

## 2. Running locally (two terminals)

**Terminal 1 — backend**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```
- API: http://localhost:8000
- Interactive Swagger docs: http://localhost:8000/docs

**Terminal 2 — frontend**
```bash
cd frontend
npm run dev
```
- Dashboard: http://localhost:5173

The frontend's Vite dev server proxies `/api/*` → `http://localhost:8000/*`
(see `frontend/vite.config.js`), so just leave both running and open the dashboard.

---

## 3. Generating data

The database starts empty. Click **"Simulate New Dataset"** in the top-right of any
dashboard page (or `POST http://localhost:8000/simulate`). This will:

1. Wipe and regenerate ~50–100 control baselines across cloud/network/endpoint/identity
2. Generate ~750 timestamped change events (CI/CD noise, approved maintenance,
   autoscaling, manual changes, emergency bypasses, expired "temporary" changes) —
   including the 4 signature incidents from the problem statement (encryption downgrade,
   CloudTrail disabled, port 8080 left open for 2 years, endpoint agents silently stopped)
3. Run the full pipeline: drift detection → suppression → risk scoring → cross-domain
   correlation → AI analysis for every new incident

Re-running "Simulate New Dataset" gives you a fresh dataset any time. "Reprocess"
re-runs the pipeline on the existing data without regenerating it (useful if you tweak
scoring/suppression logic and want to see it applied to the same events).

---

## 4. Architecture

```
Enterprise Simulator (controls, system dependency graph, maintenance windows, change events)
        │
        ▼
Drift Detection Engine  ──►  compares current_value vs baseline per control
        │
        ▼
Suppression Logic  ──►  filters approved CI/CD & autoscale noise (never fully
        │                suppresses CRITICAL — that's how Real Incident #1 slipped through)
        ▼
Risk Scoring Engine  ──►  severity × environment × exposure − suppression discount
        │
        ▼
ML Anomaly Detection  ──►  IsolationForest trained on labeled-benign events;
        │                   scores every event by dissimilarity from learned normal
        ▼
Correlation Engine  ──►  groups drift by actor + time window (2h) across 2+ domains
        │                 into Incidents (3+ domains = "Compound Incident")
        ▼
Blast Radius Engine  ──►  NetworkX BFS from affected systems across the synthetic
        │                  app→db→server dependency graph, hop-decayed & criticality-weighted
        ▼
Compliance Mapper  ──►  NIST / CIS / GDPR coverage per control
        │
        ▼
Attack Path Reconstruction  ──►  chains an incident's correlated drift events
        │                        chronologically, tags each with a MITRE tactic,
        │                        and extends into blast radius for projected impact
        ▼
Actor Risk Profile  ──►  ranks every actor by a composite insider-risk score
        │                (severity history, off-hours, unapproved rate, ML
        │                anomaly rate, incident involvement)
        ▼
AI Security Analyst (Groq Llama 3.3 70B, with local fallback)
        │                 root_cause, risk_explanation, MITRE technique,
        ▼                 compliance_impact, sequenced remediation_steps, priority
Dashboard (React)
```

### Backend modules (`backend/services/`)
| File | Responsibility |
|---|---|
| `simulator.py` | Generates the simulated multi-domain enterprise dataset + infra dependency graph |
| `drift_detector.py` | Compares change events to control baselines |
| `suppression.py` | Filters benign CI/CD / autoscale / maintenance noise |
| `risk_engine.py` | Scores drift: `severity × env × exposure − suppression` |
| `ml_engine.py` | **Isolation Forest** anomaly detection — feature engineering, training on labeled-benign data, scoring + explainability |
| `correlation_engine.py` | Groups related drift into compound incidents |
| `blast_radius.py` | **NetworkX** graph traversal estimating cross-system exposure per incident |
| `compliance_mapper.py` | Maps controls/drift to NIST/CIS/GDPR/MITRE |
| `attack_path.py` | Reconstructs a chronological kill-chain per incident (actor → tactic-tagged steps → projected blast-radius impact) |
| `actor_profile.py` | Insider risk ranking per actor — composite score from severity history, off-hours/unapproved rates, ML anomaly rate, incident involvement |
| `ai_engine.py` | Groq LLM analyst narrative, with rule-based fallback |
| `pipeline.py` | Orchestrates the above in order |

### Key API endpoints
| Endpoint | Purpose |
|---|---|
| `POST /simulate` | Regenerate dataset + run full pipeline (incl. ML training + blast radius) |
| `POST /reprocess` | Re-run pipeline on existing data |
| `GET /dashboard` | Executive summary stats (incl. ML anomaly & blast radius stats) |
| `GET /controls` | All controls with pass/fail state |
| `GET /controls/health-by-category` | Health grid data |
| `GET /drifts` | Drift events, filterable/sortable, incl. ML anomaly score/flag |
| `GET /incidents` | Correlated compound incidents, incl. blast radius detail |
| `POST /analyze/{id}` | Trigger/re-run AI analysis for one incident |
| `GET /compliance` | NIST/CIS/GDPR coverage % |
| `GET /ml/scatter` | risk_score vs ml_anomaly_score per event, for the dashboard scatter chart |
| `GET /ml/summary` | Model info: features used, training strategy, counts |
| `GET /ml/comparison` | Rules-vs-ML side-by-side: what each layer would catch alone vs the combined hybrid system, against ground truth |
| `GET /actors` | Ranked insider-risk profile for every actor |
| `GET /actors/{actor}` | Actor detail: timeline, domain breakdown, incidents touched |
| `GET /incidents/{id}/attack-path` | Chronological kill-chain reconstruction for one incident, tagged with MITRE tactics and projected blast-radius impact |
| `GET /report` | CSV export — top 10 risky drifts (incl. ML fields) |
| `GET /report/full-export` | CSV export — full drift archive |

Full interactive docs (try-it-out included) at **http://localhost:8000/docs** once the
backend is running.

---

