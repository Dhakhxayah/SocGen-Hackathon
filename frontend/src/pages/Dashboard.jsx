import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts'
import { ShieldCheck, FileCheck2, ShieldAlert, GitMerge, EyeOff, Brain, Radius } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import StatCard from '../components/StatCard.jsx'
import Panel from '../components/Panel.jsx'
import SeverityBadge from '../components/SeverityBadge.jsx'
import { LoadingState, EmptyState } from '../components/States.jsx'
import { useSimulation } from '../context/SimulationContext.jsx'
import { getDashboard, getTimeline, getIncidents, getControlHealth, getMlScatter } from '../services/api.js'

const SEV_COLOR = { CRITICAL: '#FF5470', HIGH: '#FF9F45', MEDIUM: '#FFD24C', LOW: '#4ADE80', NONE: '#3A4557' }

export default function Dashboard() {
  const { refreshKey, simulating } = useSimulation()
  const [dash, setDash] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [incidents, setIncidents] = useState([])
  const [health, setHealth] = useState([])
  const [mlScatter, setMlScatter] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getDashboard(), getTimeline(30), getIncidents(), getControlHealth(), getMlScatter()])
      .then(([d, t, i, h, ml]) => {
        if (cancelled) return
        setDash(d); setTimeline(t); setIncidents(i); setHealth(h); setMlScatter(ml)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [refreshKey])

  const topIncidents = incidents
    .filter((i) => i.max_severity === 'CRITICAL' || i.is_compound)
    .slice(0, 5)

  return (
    <div>
      <TopBar
        title="Executive Overview"
        subtitle="Continuous baseline comparison across cloud, network, endpoint & identity controls"
      />

      {loading && !dash ? (
        <LoadingState label={simulating ? 'Generating enterprise dataset…' : 'Loading dashboard…'} />
      ) : !dash || dash.total_controls === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Security Score"
              value={`${dash.security_score}%`}
              sublabel={`${dash.passing_controls}/${dash.total_controls} controls passing`}
              accent={dash.security_score >= 70 ? 'brand' : dash.security_score >= 40 ? 'high' : 'critical'}
              icon={ShieldCheck}
            />
            <StatCard
              label="Compliance Score"
              value={`${dash.compliance_score}%`}
              sublabel="NIST · CIS · GDPR blended coverage"
              accent="brand"
              icon={FileCheck2}
            />
            <StatCard
              label="Critical Drift"
              value={dash.critical_drift_count}
              sublabel={`${dash.high_drift_count} high-severity active`}
              accent="critical"
              icon={ShieldAlert}
            />
            <StatCard
              label="Compound Incidents"
              value={dash.compound_incidents}
              sublabel={`${dash.total_incidents} correlated incidents total`}
              accent="high"
              icon={GitMerge}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <StatCard
              label="ML Anomalies Flagged"
              value={dash.ml_anomalies_flagged}
              sublabel="Isolation Forest, top 20% of drift by behavioral deviation"
              accent="high"
              icon={Brain}
            />
            <StatCard
              label="Max Blast Radius"
              value={dash.max_blast_radius}
              sublabel="Highest cross-system exposure score, worst incident"
              accent="critical"
              icon={Radius}
            />
            <StatCard
              label="Avg Blast Radius"
              value={dash.avg_blast_radius}
              sublabel="Mean exposure across all correlated incidents"
              accent="brand"
              icon={Radius}
            />
          </div>

          <Panel
            title="Drift Timeline (30 days)"
            subtitle="Change events classified by severity, per day"
            className="mb-6"
          >
            {timeline.length === 0 ? (
              <EmptyState label="No drift history yet" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="critGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF5470" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#FF5470" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="highGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF9F45" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#FF9F45" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="medGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFD24C" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FFD24C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1B2330" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#7C8798', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#212B38' }} />
                  <YAxis tick={{ fill: '#7C8798', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0F141C', border: '1px solid #212B38', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#E7EBF1' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#7C8798' }} />
                  <Area type="monotone" dataKey="CRITICAL" stackId="1" stroke="#FF5470" fill="url(#critGrad)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="HIGH" stackId="1" stroke="#FF9F45" fill="url(#highGrad)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="MEDIUM" stackId="1" stroke="#FFD24C" fill="url(#medGrad)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
            <Panel
              title="ML Anomaly Detection"
              subtitle="Isolation Forest: rule-based risk score vs. learned behavioral anomaly score"
              className="lg:col-span-2"
              action={
                <span className="text-[10px] font-mono text-ink-700 flex items-center gap-1.5">
                  <Brain size={11} className="text-brand-400" /> scikit-learn
                </span>
              }
            >
              {mlScatter.length === 0 ? (
                <EmptyState label="No ML scores yet" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1B2330" />
                    <XAxis
                      type="number" dataKey="risk_score" name="Rule-Based Risk Score" domain={[0, 100]}
                      tick={{ fill: '#7C8798', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#212B38' }}
                      label={{ value: 'Rule-Based Risk Score', position: 'insideBottom', offset: -5, fill: '#7C8798', fontSize: 10 }}
                    />
                    <YAxis
                      type="number" dataKey="ml_anomaly_score" name="ML Anomaly Score" domain={[0, 100]}
                      tick={{ fill: '#7C8798', fontSize: 10 }} tickLine={false} axisLine={false}
                      label={{ value: 'ML Anomaly Score', angle: -90, position: 'insideLeft', fill: '#7C8798', fontSize: 10 }}
                    />
                    <ZAxis range={[28, 28]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3', stroke: '#28323F' }}
                      contentStyle={{ background: '#0F141C', border: '1px solid #212B38', borderRadius: 8, fontSize: 12 }}
                      formatter={(v, n) => [v, n]}
                      labelFormatter={() => ''}
                    />
                    <Scatter data={mlScatter} fillOpacity={0.85}>
                      {mlScatter.map((d, i) => (
                        <Cell
                          key={i}
                          fill={SEV_COLOR[d.severity] || '#3A4557'}
                          stroke={d.ml_is_anomaly ? '#3FE0C5' : 'transparent'}
                          strokeWidth={d.ml_is_anomaly ? 2 : 0}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {Object.entries(SEV_COLOR).filter(([k]) => k !== 'NONE').map(([sev, color]) => (
                  <span key={sev} className="flex items-center gap-1.5 text-[10px] text-ink-500 font-mono">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} /> {sev}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-[10px] text-ink-500 font-mono">
                  <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: '#3FE0C5' }} /> ML-flagged anomaly
                </span>
              </div>
            </Panel>

            <Panel title="Suppression Efficiency" subtitle="Noise filtered from real risk">
              <div className="flex flex-col items-center justify-center h-[260px]">
                <div className="relative w-36 h-36 flex items-center justify-center mb-2">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#1B2330" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="42" fill="none" stroke="#22C6AA" strokeWidth="10"
                      strokeDasharray={`${(dash.suppression_rate / 100) * 264} 264`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-2xl font-bold font-mono text-ink-100">{dash.suppression_rate}%</span>
                    <span className="text-[10px] text-ink-500 font-mono">SUPPRESSED</span>
                  </div>
                </div>
                <div className="text-center text-xs text-ink-500 flex items-center gap-1.5">
                  <EyeOff size={12} />
                  {dash.suppressed_events} of {dash.total_drift_events} events auto-filtered
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Panel title="Control Health by Category" className="lg:col-span-1">
              <div className="space-y-3">
                {health.map((h) => (
                  <div key={h.category}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="capitalize text-ink-300 font-medium">{h.category}</span>
                      <span className="font-mono text-ink-500">{h.passing}/{h.total}</span>
                    </div>
                    <div className="h-1.5 bg-base-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${h.health_pct}%`,
                          background: h.health_pct >= 70 ? '#22C6AA' : h.health_pct >= 40 ? '#FF9F45' : '#FF5470',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Priority Incidents" subtitle="Critical severity or cross-domain compound" className="lg:col-span-2">
              {topIncidents.length === 0 ? (
                <EmptyState label="No priority incidents" hint="All correlated drift is within acceptable risk." />
              ) : (
                <div className="divide-y divide-base-border -mx-5">
                  {topIncidents.map((inc) => (
                    <div key={inc.id} className="px-5 py-3 flex items-center justify-between hover:bg-base-800/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <SeverityBadge severity={inc.max_severity} />
                        <div className="min-w-0">
                          <div className="text-sm text-ink-100 font-medium truncate">{inc.title}</div>
                          <div className="text-[11px] text-ink-500 font-mono">
                            {inc.incident_id} · {inc.domains_involved.join(' + ')}
                            {inc.is_compound && <span className="text-sev-critical ml-1.5">● compound</span>}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-sm text-ink-300 shrink-0 ml-3">{inc.total_risk_score}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
