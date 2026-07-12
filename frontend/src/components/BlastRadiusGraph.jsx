import { Radius, Server, Crosshair } from 'lucide-react'
import ForceGraph from './ForceGraph.jsx'

const HOP_COLOR = { 0: '#FF5470', 1: '#FF9F45', 2: '#FFD24C' }

export default function BlastRadiusGraph({ blastRadius, incidentTitle }) {
  const systems = blastRadius?.exposed_systems || []
  if (systems.length === 0) return null

  const originId = 'origin'
  const nodes = [
    {
      id: originId, label: 'Origin', color: '#FF5470', radius: 11, pulse: true,
      kind: 'origin', detail: incidentTitle,
    },
    ...systems.slice(0, 18).map((s) => ({
      id: s.system,
      label: s.system,
      color: HOP_COLOR[s.hops_away] || '#7C8798',
      radius: 6 + Math.min(s.controls_attached, 5),
      kind: 'system',
      hops_away: s.hops_away,
      controls_attached: s.controls_attached,
    })),
  ]

  const links = systems.slice(0, 18).map((s) => ({
    source: originId, target: s.system,
    distance: 60 + s.hops_away * 55,
    color: HOP_COLOR[s.hops_away] || '#28323F',
    dashed: s.hops_away > 1,
  }))

  return (
    <div className="mt-4 rounded-lg border border-base-border bg-base-900 p-4">
      <div className="flex items-center gap-2 text-ink-300 text-xs font-mono uppercase tracking-wider mb-3">
        <Radius size={13} className="text-brand-400" /> Blast Radius — Force Graph
        <span className="ml-auto text-sev-critical font-semibold">score {blastRadius.score}</span>
      </div>
      <div className="flex items-start gap-5 flex-wrap">
        <ForceGraph
          nodes={nodes}
          links={links}
          width={320}
          height={240}
          className="shrink-0 mx-auto"
          renderTooltip={(n) => (
            n.kind === 'origin' ? (
              <div>
                <div className="text-ink-100 font-semibold mb-0.5 flex items-center gap-1"><Crosshair size={11} /> Incident Origin</div>
                <div className="text-ink-500">{n.detail}</div>
              </div>
            ) : (
              <div>
                <div className="text-ink-100 font-mono font-semibold mb-0.5 flex items-center gap-1"><Server size={11} /> {n.label}</div>
                <div className="text-ink-500">{n.hops_away} hop(s) away · {n.controls_attached} control(s) attached</div>
              </div>
            )
          )}
        />
        <div className="flex-1 min-w-[180px] space-y-1.5 max-h-[240px] overflow-y-auto">
          {systems.slice(0, 10).map((s) => (
            <div key={s.system} className="flex items-center justify-between text-xs bg-base-850 rounded px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 font-mono text-ink-300">
                <Server size={11} className="text-ink-700" /> {s.system}
              </span>
              <span className="text-ink-500 font-mono">{s.hops_away}h · {s.controls_attached} ctrl</span>
            </div>
          ))}
          {systems.length > 10 && (
            <div className="text-[11px] text-ink-700 font-mono px-1">+{systems.length - 10} more exposed systems</div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-ink-700 font-mono mt-3">Drag nodes to rearrange · hover for details</div>
    </div>
  )
}
