import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Users, Clock, Network, Loader2, Radius } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Panel from '../components/Panel.jsx'
import SeverityBadge from '../components/SeverityBadge.jsx'
import BlastRadiusGraph from '../components/BlastRadiusGraph.jsx'
import AttackPathViz from '../components/AttackPathViz.jsx'
import { LoadingState, EmptyState } from '../components/States.jsx'
import { useSimulation } from '../context/SimulationContext.jsx'
import { getIncidents, analyzeIncident, getAttackPath } from '../services/api.js'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function AIAnalysisCard({ analysis }) {
  if (!analysis) return null
  return (
    <div className="mt-4 rounded-lg border border-brand-500/25 bg-brand-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-brand-400 text-xs font-mono uppercase tracking-wider">
        <Sparkles size={13} /> AI Security Analyst
        {analysis.priority && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-sev-critical/15 text-sev-critical font-semibold">
            {analysis.priority}
          </span>
        )}
      </div>
      <div>
        <div className="text-[11px] text-ink-500 uppercase font-mono mb-1">Root Cause</div>
        <p className="text-sm text-ink-100">{analysis.root_cause}</p>
      </div>
      <div>
        <div className="text-[11px] text-ink-500 uppercase font-mono mb-1">Why This Is Dangerous</div>
        <p className="text-sm text-ink-300">{analysis.risk_explanation}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-ink-500 uppercase font-mono mb-1">MITRE ATT&CK</div>
          <p className="text-sm text-ink-300 font-mono">{analysis.mitre_technique}</p>
        </div>
        <div>
          <div className="text-[11px] text-ink-500 uppercase font-mono mb-1">Compliance Impact</div>
          <p className="text-sm text-ink-300">{analysis.compliance_impact}</p>
        </div>
      </div>
      <div>
        <div className="text-[11px] text-ink-500 uppercase font-mono mb-1.5">Sequenced Remediation</div>
        <ol className="space-y-1.5">
          {(analysis.remediation_steps || []).map((step, idx) => (
            <li key={idx} className="flex gap-2.5 text-sm text-ink-100">
              <span className="shrink-0 w-5 h-5 rounded-full bg-brand-500/15 text-brand-400 text-[11px] font-mono flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function IncidentCard({ incident, onAnalyze, analyzing }) {
  const [open, setOpen] = useState(false)
  const [attackPath, setAttackPath] = useState(null)
  const [loadingPath, setLoadingPath] = useState(false)

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next && !attackPath) {
      setLoadingPath(true)
      getAttackPath(incident.id).then(setAttackPath).catch(() => {}).finally(() => setLoadingPath(false))
    }
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${incident.is_compound ? 'border-sev-critical/30' : 'border-base-border'}`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-base-800/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <SeverityBadge severity={incident.max_severity} size="md" />
          {incident.is_compound && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-sev-critical bg-sev-critical/10 px-2 py-0.5 rounded border border-sev-critical/25">
              Compound
            </span>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-100 truncate">{incident.title}</div>
            <div className="flex items-center gap-3 text-[11px] text-ink-500 font-mono mt-0.5">
              <span className="flex items-center gap-1"><Users size={11} />{incident.actor}</span>
              <span className="flex items-center gap-1"><Network size={11} />{incident.domains_involved.join(', ')}</span>
              <span className="flex items-center gap-1"><Clock size={11} />{fmtDate(incident.window_start)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {incident.blast_radius?.score > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-ink-500" title="Blast radius score">
              <Radius size={11} /> {incident.blast_radius.score}
            </span>
          )}
          <span className="font-mono text-sm text-ink-300">{incident.total_risk_score}</span>
          {open ? <ChevronUp size={16} className="text-ink-500" /> : <ChevronDown size={16} className="text-ink-500" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-base-border">
          <div className="text-[11px] text-ink-500 uppercase font-mono mt-4 mb-2">Correlated Drift Events</div>
          <div className="space-y-1.5 mb-2">
            {incident.drift_events.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs bg-base-900 rounded-lg px-3 py-2">
                <SeverityBadge severity={e.severity} />
                <span className="font-mono text-ink-300">{e.control_id}</span>
                <span className="text-ink-500 truncate flex-1">{e.description}</span>
              </div>
            ))}
          </div>

          {incident.ai_analysis ? (
            <AIAnalysisCard analysis={incident.ai_analysis} />
          ) : (
            <button
              onClick={() => onAnalyze(incident.id)}
              disabled={analyzing}
              className="mt-3 flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg bg-brand-400 text-base-950 font-semibold hover:bg-brand-500 transition-colors disabled:opacity-50"
            >
              {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {analyzing ? 'Analyzing…' : 'Run AI Analysis'}
            </button>
          )}

          <BlastRadiusGraph blastRadius={incident.blast_radius} incidentTitle={incident.title} />

          {loadingPath && !attackPath ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-ink-500 font-mono">
              <Loader2 size={13} className="animate-spin" /> Reconstructing attack path…
            </div>
          ) : (
            <AttackPathViz attackPath={attackPath} />
          )}
        </div>
      )}
    </div>
  )
}

export default function Incidents() {
  const { refreshKey, simulating } = useSimulation()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzingId, setAnalyzingId] = useState(null)

  const load = () => {
    setLoading(true)
    getIncidents().then(setIncidents).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(load, [refreshKey])

  const handleAnalyze = async (id) => {
    setAnalyzingId(id)
    try {
      const updated = await analyzeIncident(id)
      setIncidents((prev) => prev.map((i) => (i.id === id ? updated : i)))
    } finally {
      setAnalyzingId(null)
    }
  }

  return (
    <div>
      <TopBar title="Compound Incidents" subtitle="Cross-domain drift correlated by actor, system & time window" />

      {loading && incidents.length === 0 ? (
        <LoadingState label={simulating ? 'Generating enterprise dataset…' : 'Loading incidents…'} />
      ) : incidents.length === 0 ? (
        <EmptyState label="No correlated incidents" hint="Compound incidents appear when 2+ domains drift together." />
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <IncidentCard key={inc.id} incident={inc} onAnalyze={handleAnalyze} analyzing={analyzingId === inc.id} />
          ))}
        </div>
      )}
    </div>
  )
}
