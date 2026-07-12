import { useEffect, useState } from 'react'
import {
  ChevronDown, ChevronUp, Clock, Moon, ShieldOff, Sparkles, GitMerge, Network, Loader2,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import TopBar from '../components/TopBar.jsx'
import Panel from '../components/Panel.jsx'
import SeverityBadge from '../components/SeverityBadge.jsx'
import { LoadingState, EmptyState } from '../components/States.jsx'
import { useSimulation } from '../context/SimulationContext.jsx'
import { getActors, getActorDetail } from '../services/api.js'

const TIER_COLOR = {
  Critical: '#FF5470',
  Elevated: '#FF9F45',
  Watch: '#FFD24C',
  Low: '#4ADE80',
}

function TierBadge({ tier }) {
  const color = TIER_COLOR[tier] || '#7C8798'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded font-mono font-semibold tracking-wider text-[10px] px-2 py-0.5"
      style={{ color, backgroundColor: `${color}1F`, border: `1px solid ${color}55` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {tier}
    </span>
  )
}

function ScoreBar({ score }) {
  const color = score >= 70 ? '#FF5470' : score >= 45 ? '#FF9F45' : score >= 20 ? '#FFD24C' : '#4ADE80'
  return (
    <div className="flex items-center gap-2 w-full max-w-[140px]">
      <div className="flex-1 h-1.5 rounded-full bg-base-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono text-xs mono-tabular text-ink-100 w-9 text-right">{score}</span>
    </div>
  )
}

function ActorDetailPanel({ actor }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getActorDetail(actor)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [actor])

  if (loading) return <div className="py-6"><LoadingState label="Loading actor timeline…" /></div>
  if (!detail) return null

  const domainData = Object.entries(detail.domain_breakdown || {}).map(([domain, count]) => ({ domain, count }))

  return (
    <div className="px-5 pb-5 border-t border-base-border pt-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-base-900 rounded-lg px-3 py-2.5">
          <div className="text-[10px] text-ink-500 font-mono uppercase tracking-wider">Off-Hours</div>
          <div className="text-lg font-bold font-mono text-ink-100 mt-0.5">{detail.off_hours_rate}%</div>
        </div>
        <div className="bg-base-900 rounded-lg px-3 py-2.5">
          <div className="text-[10px] text-ink-500 font-mono uppercase tracking-wider">Unapproved</div>
          <div className="text-lg font-bold font-mono text-ink-100 mt-0.5">{detail.unapproved_rate}%</div>
        </div>
        <div className="bg-base-900 rounded-lg px-3 py-2.5">
          <div className="text-[10px] text-ink-500 font-mono uppercase tracking-wider">ML Anomaly Rate</div>
          <div className="text-lg font-bold font-mono text-ink-100 mt-0.5">{detail.ml_anomaly_rate}%</div>
        </div>
        <div className="bg-base-900 rounded-lg px-3 py-2.5">
          <div className="text-[10px] text-ink-500 font-mono uppercase tracking-wider">Avg Risk Score</div>
          <div className="text-lg font-bold font-mono text-ink-100 mt-0.5">{detail.avg_risk_score}</div>
        </div>
      </div>

      {domainData.length > 0 && (
        <div className="bg-base-900 rounded-lg p-3">
          <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider mb-2">Drift by Domain</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={domainData} layout="vertical" margin={{ left: 8, right: 12, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#212B38" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                type="category" dataKey="domain" width={70}
                tick={{ fill: '#7C8798', fontSize: 11, fontFamily: 'monospace' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#0F141C', border: '1px solid #212B38', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#E7EBF1' }} cursor={{ fill: 'rgba(63,224,197,0.06)' }}
              />
              <Bar dataKey="count" fill="#3FE0C5" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {detail.incidents.length > 0 && (
        <div>
          <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <GitMerge size={12} /> Incidents Anchored By This Actor
          </div>
          <div className="space-y-1.5">
            {detail.incidents.slice(0, 6).map((i) => (
              <div key={i.id} className="flex items-center gap-2 text-xs bg-base-900 rounded-lg px-3 py-2">
                <SeverityBadge severity={i.max_severity} />
                {i.is_compound && (
                  <span className="text-[9px] font-mono uppercase text-sev-critical bg-sev-critical/10 px-1.5 py-0.5 rounded border border-sev-critical/25">
                    Compound
                  </span>
                )}
                <span className="text-ink-300 truncate flex-1">{i.title}</span>
                <span className="font-mono text-ink-500">{i.total_risk_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock size={12} /> Recent Drift Timeline
        </div>
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {detail.timeline.slice(0, 20).map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-xs bg-base-900 rounded-lg px-3 py-2">
              <SeverityBadge severity={e.severity} />
              <span className="font-mono text-ink-300 shrink-0">{e.control_id}</span>
              <span className="text-ink-500 truncate flex-1">{e.description}</span>
              {e.ml_is_anomaly && (
                <span title="Flagged anomalous by ML layer" className="shrink-0">
                  <Sparkles size={11} className="text-brand-400" />
                </span>
              )}
              {e.suppressed && (
                <span title="Suppressed by rule engine" className="shrink-0">
                  <ShieldOff size={11} className="text-ink-700" />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ActorRow({ profile, open, onToggle }) {
  return (
    <div className={`rounded-xl border overflow-hidden ${profile.risk_tier === 'Critical' ? 'border-sev-critical/30' : 'border-base-border'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-base-800/40 transition-colors text-left gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <TierBadge tier={profile.risk_tier} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-100 truncate font-mono">{profile.actor}</div>
            <div className="flex items-center gap-3 text-[11px] text-ink-500 font-mono mt-0.5">
              <span className="flex items-center gap-1"><Network size={11} />{profile.domains_touched.join(', ') || '—'}</span>
              <span>{profile.drift_events} drift events</span>
              {profile.incidents_touched > 0 && (
                <span className="flex items-center gap-1 text-sev-high"><GitMerge size={11} />{profile.incidents_touched} incident(s)</span>
              )}
              {profile.off_hours_rate > 40 && (
                <span className="flex items-center gap-1 text-ink-500"><Moon size={11} />{profile.off_hours_rate}% off-hours</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-3">
          <ScoreBar score={profile.insider_risk_score} />
          {open ? <ChevronUp size={16} className="text-ink-500" /> : <ChevronDown size={16} className="text-ink-500" />}
        </div>
      </button>
      {open && <ActorDetailPanel actor={profile.actor} />}
    </div>
  )
}

export default function ActorRiskProfile() {
  const { refreshKey, simulating } = useSimulation()
  const [actors, setActors] = useState([])
  const [loading, setLoading] = useState(true)
  const [openActor, setOpenActor] = useState(null)

  useEffect(() => {
    setLoading(true)
    getActors().then(setActors).catch(() => {}).finally(() => setLoading(false))
  }, [refreshKey])

  const tierCounts = actors.reduce((acc, a) => {
    acc[a.risk_tier] = (acc[a.risk_tier] || 0) + 1
    return acc
  }, {})

  return (
    <div>
      <TopBar
        title="Actor Risk Profile"
        subtitle="Insider risk ranking — same actor-history features the ML engine trains on, surfaced as their own view"
      />

      {loading && actors.length === 0 ? (
        <LoadingState label={simulating ? 'Generating enterprise dataset…' : 'Loading actor profiles…'} />
      ) : actors.length === 0 ? (
        <EmptyState label="No actor activity yet" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            {['Critical', 'Elevated', 'Watch', 'Low'].map((tier) => (
              <div key={tier} className="fade-in-up bg-base-850 border border-base-border rounded-xl p-4 shadow-panel relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(90deg, ${TIER_COLOR[tier]}, transparent)` }} />
                <div className="text-ink-500 text-[11px] font-mono uppercase tracking-widest mb-1.5">{tier}</div>
                <div className="text-2xl font-bold font-mono text-ink-100">{tierCounts[tier] || 0}</div>
              </div>
            ))}
          </div>

          <Panel title="Ranked by Insider Risk Score" subtitle="Composite of severity history, off-hours & unapproved activity, ML anomaly rate, and incident involvement">
            <div className="space-y-3">
              {actors.map((p) => (
                <ActorRow
                  key={p.actor}
                  profile={p}
                  open={openActor === p.actor}
                  onToggle={() => setOpenActor((cur) => (cur === p.actor ? null : p.actor))}
                />
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
