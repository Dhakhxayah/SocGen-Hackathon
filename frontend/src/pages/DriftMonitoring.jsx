import { useEffect, useMemo, useState } from 'react'
import { Filter, EyeOff, AlertTriangle, Brain, CheckCircle2, Loader2 } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Panel from '../components/Panel.jsx'
import SeverityBadge from '../components/SeverityBadge.jsx'
import { LoadingState, EmptyState } from '../components/States.jsx'
import { useSimulation } from '../context/SimulationContext.jsx'
import { getDrifts, remediateDrift } from '../services/api.js'

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const DOMAINS = ['cloud', 'network', 'endpoint', 'identity']

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function DriftMonitoring() {
  const { refreshKey, simulating, bumpRefresh } = useSimulation()
  const [drifts, setDrifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [severity, setSeverity] = useState('')
  const [domain, setDomain] = useState('')
  const [showSuppressed, setShowSuppressed] = useState(false)
  const [mlOnly, setMlOnly] = useState(false)
  const [remediatingId, setRemediatingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getDrifts({ limit: 500 })
      .then((d) => !cancelled && setDrifts(d))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [refreshKey])

  const handleRemediate = async (drift) => {
    setRemediatingId(drift.id)
    try {
      await remediateDrift(drift.id)
      setDrifts((prev) => prev.map((d) => (d.id === drift.id ? { ...d, status: 'remediated' } : d)))
      // security score / compliance coverage on the Dashboard depend on this
      // control's current status, so nudge every other page to refetch too.
      bumpRefresh()
    } catch {
      // no-op — row simply stays in its previous state on failure
    } finally {
      setRemediatingId(null)
    }
  }

  const filtered = useMemo(() => {
    return drifts.filter((d) => {
      if (!showSuppressed && d.suppressed) return false
      if (severity && d.severity !== severity) return false
      if (domain && d.domain !== domain) return false
      if (mlOnly && !d.ml_is_anomaly) return false
      return true
    })
  }, [drifts, severity, domain, showSuppressed, mlOnly])

  const ambiguousCount = drifts.filter((d) => d.ambiguous).length

  return (
    <div>
      <TopBar title="Drift Monitoring" subtitle="Live baseline vs. current-state comparison, ranked by risk" />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 text-ink-500 text-xs mr-1">
          <Filter size={13} /> Filter:
        </div>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="bg-base-800 border border-base-border text-ink-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-500"
        >
          <option value="">All Severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="bg-base-800 border border-base-border text-ink-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-500"
        >
          <option value="">All Domains</option>
          {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button
          onClick={() => setShowSuppressed((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            showSuppressed
              ? 'bg-ink-700/20 border-ink-700 text-ink-300'
              : 'bg-base-800 border-base-border text-ink-500 hover:text-ink-300'
          }`}
        >
          <EyeOff size={13} /> {showSuppressed ? 'Hiding' : 'Hide'} suppressed
        </button>
        <button
          onClick={() => setMlOnly((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            mlOnly
              ? 'bg-brand-500/10 border-brand-500/40 text-brand-400'
              : 'bg-base-800 border-base-border text-ink-500 hover:text-ink-300'
          }`}
        >
          <Brain size={13} /> ML-flagged only
        </button>
        {ambiguousCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sev-medium/10 text-sev-medium border border-sev-medium/25">
            <AlertTriangle size={13} /> {ambiguousCount} ambiguous need review
          </span>
        )}
        <span className="text-ink-700 text-xs font-mono ml-auto">{filtered.length} events</span>
      </div>

      <Panel>
        {loading && drifts.length === 0 ? (
          <LoadingState label={simulating ? 'Generating enterprise dataset…' : 'Loading drift events…'} />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-ink-700 font-mono uppercase tracking-wider border-b border-base-border">
                  <th className="px-5 py-2.5 font-medium">Severity</th>
                  <th className="px-3 py-2.5 font-medium">Control</th>
                  <th className="px-3 py-2.5 font-medium">Domain</th>
                  <th className="px-3 py-2.5 font-medium">Description</th>
                  <th className="px-3 py-2.5 font-medium">Actor</th>
                  <th className="px-3 py-2.5 font-medium">Approval</th>
                  <th className="px-3 py-2.5 font-medium text-right">Risk</th>
                  <th className="px-3 py-2.5 font-medium text-right">ML</th>
                  <th className="px-3 py-2.5 font-medium">When</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((d) => (
                  <tr key={d.id} className="border-b border-base-border/60 hover:bg-base-800/40 transition-colors">
                    <td className="px-5 py-2.5"><SeverityBadge severity={d.severity} /></td>
                    <td className="px-3 py-2.5 font-mono text-ink-300 text-xs">{d.control_id}</td>
                    <td className="px-3 py-2.5 text-ink-500 text-xs capitalize">{d.domain}</td>
                    <td className="px-3 py-2.5 text-ink-300 text-xs max-w-xs truncate" title={d.description}>
                      {d.description}
                      {d.ambiguous && (
                        <span className="ml-1.5 text-sev-medium text-[10px]" title={d.ambiguous_reason}>⚠ ambiguous</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-500 text-xs font-mono">{d.changed_by}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className={
                        d.approval_status === 'approved' ? 'text-sev-low' :
                        d.approval_status === 'pending' ? 'text-sev-medium' : 'text-sev-critical'
                      }>{d.approval_status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink-100">{d.risk_score}</td>
                    <td className="px-3 py-2.5 text-right">
                      {d.ml_is_anomaly ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-brand-400 bg-brand-500/10 border border-brand-500/25 px-1.5 py-0.5 rounded"
                          title={d.ml_top_contributors?.map((c) => c.feature).join(', ')}
                        >
                          <Brain size={10} /> {d.ml_anomaly_score}
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-700 font-mono">{d.ml_anomaly_score ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-700 text-xs font-mono whitespace-nowrap">{timeAgo(d.timestamp)}</td>
                    <td className="px-5 py-2.5">
                      {d.suppressed ? (
                        <span className="text-[10px] font-mono text-ink-700 bg-base-700/50 px-2 py-0.5 rounded">suppressed</span>
                      ) : d.status === 'remediated' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-sev-low bg-sev-low/10 border border-sev-low/25 px-2 py-0.5 rounded">
                          <CheckCircle2 size={11} /> remediated
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded capitalize">{d.status}</span>
                          <button
                            onClick={() => handleRemediate(d)}
                            disabled={remediatingId === d.id}
                            title="Mark this drift as fixed — control returns to passing immediately"
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border border-brand-500/40 text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-40"
                          >
                            {remediatingId === d.id
                              ? <Loader2 size={10} className="animate-spin" />
                              : <CheckCircle2 size={10} />}
                            Remediate
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
