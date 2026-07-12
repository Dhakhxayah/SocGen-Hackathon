import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Globe, Lock } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Panel from '../components/Panel.jsx'
import { LoadingState, EmptyState } from '../components/States.jsx'
import { useSimulation } from '../context/SimulationContext.jsx'
import { getControls, getControlHealth } from '../services/api.js'

const CATEGORY_ICONS = { logging: '📋', encryption: '🔐', firewall: '🧱', endpoint: '💻', access: '🔑' }

export default function ControlHealth() {
  const { refreshKey, simulating } = useSimulation()
  const [controls, setControls] = useState([])
  const [health, setHealth] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getControls(), getControlHealth()])
      .then(([c, h]) => { if (!cancelled) { setControls(c); setHealth(h) } })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [refreshKey])

  const categories = useMemo(() => [...new Set(controls.map((c) => c.category))], [controls])

  const filtered = controls.filter((c) => {
    if (category && c.category !== category) return false
    if (statusFilter && c.status !== statusFilter) return false
    return true
  })

  return (
    <div>
      <TopBar title="Control Health" subtitle="Live baseline compliance across every monitored control" />

      {loading && controls.length === 0 ? (
        <LoadingState label={simulating ? 'Generating enterprise dataset…' : 'Loading controls…'} />
      ) : controls.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {health.map((h) => (
              <button
                key={h.category}
                onClick={() => setCategory(category === h.category ? '' : h.category)}
                className={`text-left rounded-xl p-4 border transition-all ${
                  category === h.category
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-base-border bg-base-850 hover:border-base-600'
                }`}
              >
                <div className="text-lg mb-1">{CATEGORY_ICONS[h.category] || '🛡️'}</div>
                <div className="text-xs text-ink-300 capitalize font-medium mb-2">{h.category}</div>
                <div className="flex items-baseline gap-1">
                  <span
                    className="text-xl font-bold font-mono"
                    style={{ color: h.health_pct >= 70 ? '#4ADE80' : h.health_pct >= 40 ? '#FF9F45' : '#FF5470' }}
                  >
                    {h.health_pct}%
                  </span>
                </div>
                <div className="text-[10px] text-ink-700 font-mono mt-1">{h.passing}/{h.total} passing</div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-base-800 border border-base-border text-ink-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-500"
            >
              <option value="">All Statuses</option>
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
            </select>
            {category && (
              <button onClick={() => setCategory('')} className="text-xs text-ink-500 hover:text-ink-300">
                clear category filter ×
              </button>
            )}
            <span className="text-ink-700 text-xs font-mono ml-auto">{filtered.length} controls</span>
          </div>

          <Panel>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((c) => (
                <div
                  key={c.control_id}
                  className={`rounded-lg border p-3.5 ${
                    c.status === 'Fail' ? 'border-sev-critical/25 bg-sev-critical/5' : 'border-base-border bg-base-900'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-mono text-xs text-ink-100 font-semibold">{c.control_id}</span>
                    {c.status === 'Fail' ? (
                      <XCircle size={15} className="text-sev-critical shrink-0" />
                    ) : (
                      <CheckCircle2 size={15} className="text-sev-low shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-ink-300 mb-1">{c.system}</div>
                  <div className="text-[11px] text-ink-700 font-mono mb-2 truncate">{c.parameter} = {c.baseline_value}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-700 text-ink-500 capitalize">{c.environment}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-700 text-ink-500 flex items-center gap-1">
                      {c.exposure === 'internet_facing' ? <Globe size={9} /> : <Lock size={9} />}
                      {c.exposure === 'internet_facing' ? 'external' : 'internal'}
                    </span>
                    {c.status === 'Fail' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{
                        color: c.current_severity === 'CRITICAL' ? '#FF5470' : '#FF9F45',
                        background: c.current_severity === 'CRITICAL' ? 'rgba(255,84,112,0.1)' : 'rgba(255,159,69,0.1)',
                      }}>{c.current_severity}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
