import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Target, Gauge, GitCompareArrows, Sparkles, ListChecks } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Panel from '../components/Panel.jsx'
import SeverityBadge from '../components/SeverityBadge.jsx'
import { LoadingState } from '../components/States.jsx'
import { useSimulation } from '../context/SimulationContext.jsx'
import { getEvaluation, getMlComparison } from '../services/api.js'

const METRIC_META = {
  precision: {
    label: 'Precision',
    desc: 'Of everything surfaced to an analyst, how much was actually risky.',
  },
  recall: {
    label: 'Recall',
    desc: 'Of everything actually risky, how much got surfaced.',
  },
  critical_recall: {
    label: 'Critical Recall',
    desc: 'Of CRITICAL-severity real drift, how much got surfaced. Zero tolerance target.',
  },
  benign_suppression: {
    label: 'Benign Suppression',
    desc: 'Of true noise (approved CI/CD, autoscale, matches-baseline), how much was correctly filtered out.',
  },
}

function MetricCard({ id, value, target, pass }) {
  const meta = METRIC_META[id]
  return (
    <div className="fade-in-up bg-base-850 border border-base-border rounded-xl p-5 shadow-panel relative overflow-hidden">
      <div
        className="absolute top-0 left-0 w-full h-[2px]"
        style={{ background: `linear-gradient(90deg, ${pass ? '#22C6AA' : '#FF5470'}, transparent)` }}
      />
      <div className="flex items-start justify-between mb-3">
        <span className="text-ink-500 text-[11px] font-mono uppercase tracking-widest">{meta.label}</span>
        {pass
          ? <CheckCircle2 size={16} className="text-brand-400" strokeWidth={2} />
          : <XCircle size={16} className="text-sev-critical" strokeWidth={2} />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold font-mono mono-tabular text-ink-100">{value}%</span>
        <span className="text-xs font-mono text-ink-700">target &gt;{target}%</span>
      </div>
      <div className="text-ink-500 text-xs mt-2 leading-snug">{meta.desc}</div>
    </div>
  )
}

function ComparisonBucket({ label, icon: Icon, accent, stats }) {
  return (
    <div className="bg-base-900 rounded-lg p-4 flex-1 min-w-[160px]">
      <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: accent }}>
        <Icon size={12} /> {label}
      </div>
      <div className="text-2xl font-bold font-mono text-ink-100">{stats.count}</div>
      <div className="text-[11px] text-ink-500 mt-1">
        <span className="font-mono text-ink-300">{stats.true_positives}</span> true positives
        <span className="mx-1">·</span>
        <span className="font-mono">{stats.precision_pct}%</span> precision
      </div>
    </div>
  )
}

function ExampleTable({ title, examples }) {
  if (!examples || examples.length === 0) return null
  return (
    <div>
      <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider mb-2">{title}</div>
      <div className="space-y-1.5">
        {examples.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-xs bg-base-900 rounded-lg px-3 py-2">
            <SeverityBadge severity={e.severity} />
            <span className="font-mono text-ink-300 shrink-0">{e.control_id}</span>
            <span className="text-ink-500 truncate flex-1">{e.description}</span>
            <span className="text-[10px] font-mono text-ink-700 shrink-0 capitalize">{e.ground_truth}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RulesVsMlPanel({ cmp }) {
  if (!cmp) return null
  const { coverage } = cmp
  const maxCoverage = Math.max(coverage.total_ground_truth_positive, 1)

  return (
    <Panel
      title="Rules vs ML — Why a Hybrid System"
      subtitle="Same ground-truth labels as above, split by which detection layer actually surfaced each event"
      className="mt-5"
    >
      <div className="flex flex-wrap gap-3 mb-5">
        <ComparisonBucket label="Rules Only" icon={ListChecks} accent="#FF9F45" stats={cmp.rules_only} />
        <ComparisonBucket label="Both Layers" icon={GitCompareArrows} accent="#3FE0C5" stats={cmp.both} />
        <ComparisonBucket label="ML Only" icon={Sparkles} accent="#22C6AA" stats={cmp.ml_only} />
      </div>

      <div className="space-y-2.5 mb-5">
        {[
          { label: 'Rules alone would catch', value: coverage.rules_alone_would_catch, color: '#FF9F45' },
          { label: 'ML alone would catch', value: coverage.ml_alone_would_catch, color: '#3FE0C5' },
          { label: 'Combined system catches', value: coverage.combined_catches, color: '#4ADE80' },
        ].map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-ink-300">{row.label}</span>
              <span className="font-mono text-ink-500">{row.value} / {coverage.total_ground_truth_positive}</span>
            </div>
            <div className="h-1.5 rounded-full bg-base-800 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(row.value / maxCoverage) * 100}%`, backgroundColor: row.color }} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-brand-500/25 bg-brand-500/5 px-4 py-3 text-sm text-ink-100 mb-5 leading-relaxed">
        {cmp.narrative}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ExampleTable title="Highest-risk: rules caught, ML didn't flag as anomalous" examples={cmp.rules_only.examples} />
        <ExampleTable title="Highest-risk: ML flagged as anomalous, rules suppressed" examples={cmp.ml_only.examples} />
      </div>
    </Panel>
  )
}

export default function Evaluation() {
  const { refreshKey, simulating } = useSimulation()
  const [data, setData] = useState(null)
  const [mlComparison, setMlComparison] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getEvaluation()
      .then((d) => !cancelled && setData(d))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    getMlComparison()
      .then((d) => !cancelled && setMlComparison(d))
      .catch(() => {})
    return () => { cancelled = true }
  }, [refreshKey])

  return (
    <div>
      <TopBar
        title="Self-Evaluation"
        subtitle="Scoring the system against the problem statement's own success targets"
      />

      {loading && !data ? (
        <Panel><LoadingState label={simulating ? 'Generating enterprise dataset…' : 'Computing metrics…'} /></Panel>
      ) : !data ? (
        <Panel><LoadingState label="No data yet" /></Panel>
      ) : (
        <>
          <div
            className={`flex items-center gap-3 rounded-xl px-5 py-4 mb-5 border ${
              data.overall_pass
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                : 'bg-sev-critical/10 border-sev-critical/30 text-sev-critical'
            }`}
          >
            {data.overall_pass ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            <div>
              <div className="text-sm font-semibold">
                {data.overall_pass ? 'All success targets met' : 'One or more targets missed'}
              </div>
              <div className="text-xs opacity-80 font-mono mt-0.5">
                Evaluated against {data.sample_size} labeled ground-truth events
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {Object.keys(METRIC_META).map((key) => (
              <MetricCard
                key={key}
                id={key}
                value={data.metrics[key]}
                target={data.targets[key]}
                pass={data.passed[key]}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title="Confusion Matrix" subtitle="Ground truth vs. what the pipeline actually surfaced">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-ink-700 font-mono uppercase tracking-wider">
                    <th className="text-left py-2"></th>
                    <th className="text-center py-2">Surfaced</th>
                    <th className="text-center py-2">Filtered out</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  <tr className="border-t border-base-border">
                    <td className="py-3 text-ink-500">Truly risky / ambiguous</td>
                    <td className="py-3 text-center text-sev-low text-base font-semibold">{data.confusion_matrix.tp}</td>
                    <td className="py-3 text-center text-sev-critical text-base font-semibold">{data.confusion_matrix.fn}</td>
                  </tr>
                  <tr className="border-t border-base-border">
                    <td className="py-3 text-ink-500">Truly benign / normal</td>
                    <td className="py-3 text-center text-sev-medium text-base font-semibold">{data.confusion_matrix.fp}</td>
                    <td className="py-3 text-center text-sev-low text-base font-semibold">{data.confusion_matrix.tn}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-4 pt-4 border-t border-base-border grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 text-ink-500">
                  <Gauge size={13} /> False Positive Rate
                  <span className="ml-auto font-mono text-ink-100">{data.false_positive_rate}%</span>
                </div>
                <div className="flex items-center gap-2 text-ink-500">
                  <Target size={13} /> Ambiguous reaching human review
                  <span className="ml-auto font-mono text-ink-100">{data.ambiguous_reached_human_review_pct}%</span>
                </div>
              </div>
            </Panel>

            <Panel title="Ground Truth Composition" subtitle="Simulator-assigned labels, independent of detector output">
              <div className="space-y-3">
                {Object.entries(data.ground_truth_counts).map(([label, count]) => {
                  const total = Object.values(data.ground_truth_counts).reduce((a, b) => a + b, 0)
                  const pct = total ? (count / total) * 100 : 0
                  const color = {
                    risky: '#FF5470', benign: '#4ADE80', ambiguous: '#FFD24C', normal: '#7C8798',
                  }[label]
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize text-ink-300">{label}</span>
                        <span className="font-mono text-ink-500">{count} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-base-800 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          </div>

          <RulesVsMlPanel cmp={mlComparison} />
        </>
      )}
    </div>
  )
}
