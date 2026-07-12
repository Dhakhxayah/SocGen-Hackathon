import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { FileCheck2 } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Panel from '../components/Panel.jsx'
import { LoadingState, EmptyState } from '../components/States.jsx'
import { useSimulation } from '../context/SimulationContext.jsx'
import { getCompliance } from '../services/api.js'

const FRAMEWORK_INFO = {
  NIST: { name: 'NIST SP 800-53', desc: 'CM-2 Baseline Config · CM-3 Change Control · SI-4 Continuous Monitoring' },
  CIS: { name: 'CIS Benchmarks', desc: 'Security Configuration Management across cloud, endpoint & network' },
  GDPR: { name: 'GDPR', desc: 'Art. 32 Security of Processing · Art. 25 Data Protection by Design' },
}

function barColor(pct) {
  if (pct >= 70) return '#4ADE80'
  if (pct >= 40) return '#FF9F45'
  return '#FF5470'
}

export default function Compliance() {
  const { refreshKey, simulating } = useSimulation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCompliance().then((d) => !cancelled && setData(d)).catch(() => {}).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [refreshKey])

  const chartData = data
    ? Object.entries(data).map(([fw, v]) => ({ name: fw, coverage: v.coverage_pct, total: v.total_controls, passing: v.passing_controls }))
    : []

  return (
    <div>
      <TopBar title="Compliance Mapping" subtitle="Drift translated into regulatory & framework risk" />

      {loading && !data ? (
        <LoadingState label={simulating ? 'Generating enterprise dataset…' : 'Loading compliance data…'} />
      ) : !data ? (
        <EmptyState />
      ) : (
        <>
          <Panel title="Framework Coverage" subtitle="% of mapped controls currently matching baseline" className="mb-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1B2330" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#7C8798', fontSize: 10 }} axisLine={{ stroke: '#212B38' }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#AEB9C7', fontSize: 12, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  contentStyle={{ background: '#0F141C', border: '1px solid #212B38', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, n, p) => [`${v}% (${p.payload.passing}/${p.payload.total})`, 'Coverage']}
                />
                <Bar dataKey="coverage" radius={[0, 6, 6, 0]} barSize={28}>
                  {chartData.map((entry, i) => <Cell key={i} fill={barColor(entry.coverage)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {Object.entries(data).map(([fw, v]) => (
              <Panel key={fw}>
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck2 size={16} className="text-brand-400" />
                  <span className="text-sm font-semibold text-ink-100">{FRAMEWORK_INFO[fw]?.name || fw}</span>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-bold font-mono" style={{ color: barColor(v.coverage_pct) }}>{v.coverage_pct}%</span>
                  <span className="text-xs text-ink-500 font-mono">{v.passing_controls}/{v.total_controls} controls</span>
                </div>
                <p className="text-xs text-ink-500 leading-relaxed">{FRAMEWORK_INFO[fw]?.desc}</p>
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
