import { useState, useRef } from 'react'
import {
  Zap, ArrowDownCircle, ShieldAlert, EyeOff, Gauge, Brain, GitMerge, Radius, Bot,
  Loader2, CheckCircle2, PlayCircle,
} from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Panel from '../components/Panel.jsx'
import SeverityBadge from '../components/SeverityBadge.jsx'
import { triggerLiveIncident } from '../services/api.js'

const STAGE_ICON = {
  ingest: ArrowDownCircle,
  detect: ShieldAlert,
  suppress: EyeOff,
  score: Gauge,
  ml: Brain,
  correlate: GitMerge,
  blast_radius: Radius,
  ai_analyst: Bot,
}

const STAGE_DELAY_MS = 1100

export default function LiveDemo() {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [stages, setStages] = useState([])       // full stage list from the backend
  const [visibleCount, setVisibleCount] = useState(0)
  const timers = useRef([])

  const reset = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setStages([])
    setVisibleCount(0)
    setError(null)
  }

  const run = async () => {
    reset()
    setRunning(true)
    try {
      const result = await triggerLiveIncident()
      if (result.error) {
        setError(result.error)
        setRunning(false)
        return
      }
      setStages(result.stages)
      // reveal one stage at a time so judges watch detection happen live
      result.stages.forEach((_, i) => {
        const t = setTimeout(() => {
          setVisibleCount((v) => v + 1)
          if (i === result.stages.length - 1) setRunning(false)
        }, i * STAGE_DELAY_MS)
        timers.current.push(t)
      })
    } catch (e) {
      setError(e?.message || 'Live demo failed')
      setRunning(false)
    }
  }

  return (
    <div>
      <TopBar
        title="Live Demo Mode"
        subtitle="Inject one real incident and watch it flow through detection in near-real-time"
      />

      <Panel className="mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-ink-300 max-w-xl">
            Injects a fresh 3-step compound drift — logging disabled, then firewall opened, then
            encryption downgraded, same actor, minutes apart — and runs it through detection,
            suppression, risk scoring, ML anomaly detection, correlation, blast radius, and the AI
            analyst, live.
          </div>
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-base-950 bg-brand-400 hover:bg-brand-500 transition-colors disabled:opacity-50 shrink-0"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {running ? 'Running…' : 'Trigger Live Incident'}
          </button>
        </div>
        {error && <div className="mt-3 text-xs text-sev-critical font-mono">{error}</div>}
      </Panel>

      {stages.length > 0 && (
        <div className="space-y-4">
          {stages.slice(0, visibleCount).map((s, idx) => {
            const Icon = STAGE_ICON[s.stage] || PlayCircle
            const isLast = idx === visibleCount - 1
            return (
              <Panel key={s.stage} className="fade-in-up">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                      isLast && running
                        ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                        : 'bg-base-800 border-base-border text-ink-300'
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-ink-100">{s.label}</h4>
                      <CheckCircle2 size={13} className="text-brand-400" />
                    </div>
                    <StageBody stage={s} />
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StageBody({ stage }) {
  switch (stage.stage) {
    case 'ingest':
      return (
        <div className="mt-2 space-y-1.5">
          {stage.detail.map((e) => (
            <div key={e.event_id} className="text-xs font-mono text-ink-500">
              <span className="text-ink-300">{e.control_id}</span> ({e.category}/{e.domain}) —{' '}
              {e.baseline_value} → <span className="text-sev-high">{e.current_value}</span> by {e.changed_by}
            </div>
          ))}
        </div>
      )
    case 'detect':
      return (
        <div className="mt-2 space-y-1.5">
          {stage.detail.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs">
              <SeverityBadge severity={d.severity} />
              <span className="text-ink-500 truncate">{d.description}</span>
            </div>
          ))}
        </div>
      )
    case 'suppress':
      return (
        <div className="mt-2 space-y-1">
          {stage.detail.map((d) => (
            <div key={d.control_id} className="text-xs font-mono">
              <span className="text-ink-300">{d.control_id}</span>{' '}
              <span className={d.suppressed ? 'text-ink-700' : 'text-brand-400'}>— {d.reason}</span>
            </div>
          ))}
        </div>
      )
    case 'score':
      return (
        <div className="mt-2 flex flex-wrap gap-3">
          {stage.detail.map((d) => (
            <div key={d.control_id} className="text-xs font-mono bg-base-900 border border-base-border rounded-lg px-3 py-1.5">
              {d.control_id}: <span className="text-ink-100 font-semibold">{d.risk_score}</span>
            </div>
          ))}
        </div>
      )
    case 'ml':
      return (
        <div className="mt-2 flex flex-wrap gap-3">
          {stage.detail.map((d) => (
            <div key={d.control_id} className="text-xs font-mono bg-base-900 border border-base-border rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              {d.control_id}:{' '}
              <span className={d.ml_is_anomaly ? 'text-brand-400 font-semibold' : 'text-ink-500'}>
                {d.ml_anomaly_score ?? '—'}
              </span>
              {d.ml_is_anomaly && <Brain size={11} className="text-brand-400" />}
            </div>
          ))}
        </div>
      )
    case 'correlate':
      if (!stage.detail) return <div className="mt-2 text-xs text-ink-500">No cross-domain correlation formed.</div>
      return (
        <div className="mt-2 text-xs text-ink-300 space-y-1">
          <div><span className="text-ink-500">Incident:</span> <span className="font-mono">{stage.detail.incident_id}</span> — {stage.detail.title}</div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={stage.detail.max_severity} />
            {stage.detail.is_compound && (
              <span className="text-[10px] font-mono text-sev-critical bg-sev-critical/10 px-2 py-0.5 rounded border border-sev-critical/25">COMPOUND</span>
            )}
            <span className="font-mono text-ink-500">risk {stage.detail.total_risk_score}</span>
          </div>
        </div>
      )
    case 'blast_radius':
      if (!stage.detail) return <div className="mt-2 text-xs text-ink-500">Not applicable — no incident formed.</div>
      return (
        <div className="mt-2 text-xs text-ink-300">
          Blast radius score <span className="font-mono text-ink-100 font-semibold">{stage.detail.blast_radius_score}</span>{' '}
          across {stage.detail.exposed_systems?.length ?? 0} exposed systems within {stage.detail.hops} hop(s).
        </div>
      )
    case 'ai_analyst':
      if (!stage.detail) return <div className="mt-2 text-xs text-ink-500">Not applicable — no incident formed.</div>
      return (
        <div className="mt-2 space-y-2 text-xs">
          <div className="text-ink-300"><span className="text-ink-500">Root cause:</span> {stage.detail.root_cause}</div>
          <div className="text-ink-300"><span className="text-ink-500">MITRE:</span> {stage.detail.mitre_technique}</div>
          <div className="text-ink-300"><span className="text-ink-500">Priority:</span> {stage.detail.priority}</div>
          {stage.detail.used_fallback && (
            <div className="text-ink-700 font-mono text-[10px]">(rule-based fallback narrative — no LLM key configured)</div>
          )}
        </div>
      )
    default:
      return null
  }
}
