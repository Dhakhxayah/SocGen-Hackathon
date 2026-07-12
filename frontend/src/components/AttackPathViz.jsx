import { User, ArrowRight, Crosshair, Server, Sparkles } from 'lucide-react'
import SeverityBadge from './SeverityBadge.jsx'

function GapLabel({ minutes }) {
  if (minutes === null || minutes === undefined) return null
  const label = minutes < 60 ? `${minutes}m` : `${(minutes / 60).toFixed(1)}h`
  return (
    <div className="flex flex-col items-center justify-center px-1 shrink-0">
      <ArrowRight size={14} className="text-ink-700" />
      <span className="text-[9px] font-mono text-ink-700 mt-0.5">+{label}</span>
    </div>
  )
}

function StepCard({ node }) {
  if (node.type === 'actor') {
    return (
      <div className="shrink-0 w-[130px] rounded-lg border border-brand-500/30 bg-brand-500/5 px-3 py-2.5 text-center">
        <User size={16} className="text-brand-400 mx-auto mb-1" />
        <div className="text-[11px] font-mono text-ink-100 truncate">{node.label}</div>
        <div className="text-[9px] text-ink-600 mt-0.5">origin actor</div>
      </div>
    )
  }
  if (node.type === 'impact') {
    return (
      <div className="shrink-0 w-[130px] rounded-lg border border-sev-medium/30 bg-sev-medium/5 px-3 py-2.5 text-center">
        <Server size={16} className="mx-auto mb-1" style={{ color: '#FFD24C' }} />
        <div className="text-[11px] font-mono text-ink-100 truncate">{node.label}</div>
        <div className="text-[9px] text-ink-600 mt-0.5">{node.hops_away}h away · projected</div>
      </div>
    )
  }
  // step node
  return (
    <div className="shrink-0 w-[190px] rounded-lg border border-base-border bg-base-900 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-ink-700">STEP {node.step_index}</span>
        <SeverityBadge severity={node.severity} />
      </div>
      <div className="text-xs font-mono text-ink-100 truncate mb-1">{node.label}</div>
      <div className="text-[10px] text-brand-400 font-medium truncate flex items-center gap-1">
        <Crosshair size={10} /> {node.tactic}
      </div>
      <div className="text-[9px] text-ink-600 font-mono truncate mt-0.5">{node.technique}</div>
      {node.ml_is_anomaly && (
        <div className="text-[9px] text-brand-400 flex items-center gap-1 mt-1">
          <Sparkles size={9} /> ML-flagged anomaly
        </div>
      )}
    </div>
  )
}

export default function AttackPathViz({ attackPath }) {
  if (!attackPath || attackPath.nodes.length === 0) return null

  const nodeById = Object.fromEntries(attackPath.nodes.map((n) => [n.id, n]))
  // reconstruct linear order from edges (chain is built sequentially in the backend)
  const ordered = []
  const seen = new Set()
  let cursor = attackPath.edges.length > 0 ? attackPath.edges[0].source : null
  if (cursor && nodeById[cursor]) {
    ordered.push(nodeById[cursor])
    seen.add(cursor)
  }
  attackPath.edges.forEach((e) => {
    if (!seen.has(e.target) && nodeById[e.target]) {
      ordered.push(nodeById[e.target])
      seen.add(e.target)
    }
  })
  const gapById = Object.fromEntries(attackPath.edges.map((e) => [e.target, e.gap_minutes]))

  return (
    <div className="mt-4 rounded-lg border border-base-border bg-base-900 p-4">
      <div className="flex items-center gap-2 text-ink-300 text-xs font-mono uppercase tracking-wider mb-3">
        <Crosshair size={13} className="text-sev-critical" /> Reconstructed Attack Path
      </div>
      <div className="flex items-center overflow-x-auto pb-2 gap-0">
        {ordered.map((node, i) => (
          <div key={node.id} className="flex items-center">
            {i > 0 && <GapLabel minutes={gapById[node.id]} />}
            <StepCard node={node} />
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-300 leading-relaxed mt-3 pt-3 border-t border-base-border">
        {attackPath.narrative}
      </p>
    </div>
  )
}
