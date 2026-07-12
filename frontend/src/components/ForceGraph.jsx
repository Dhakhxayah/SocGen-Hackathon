import { useEffect, useRef, useState, useMemo } from 'react'

/**
 * Dependency-free force-directed graph. Runs a small physics simulation
 * (pairwise repulsion + spring links + centering gravity) for a fixed
 * number of ticks on mount / whenever the node set changes, then holds
 * the settled layout. Nodes can be dragged afterwards; a short local
 * re-simulation keeps things from overlapping after a drag.
 *
 * nodes: [{ id, label, color, radius, group }]
 * links: [{ source, target, distance?, strength? }]
 */
export default function ForceGraph({
  nodes, links, width = 480, height = 320,
  onNodeClick, renderTooltip, className = '',
}) {
  const simNodesRef = useRef({})
  const [tick, setTick] = useState(0)
  const [positions, setPositions] = useState({})
  const [hovered, setHovered] = useState(null)
  const [dragging, setDragging] = useState(null)
  const rafRef = useRef(null)

  const nodeKey = useMemo(() => nodes.map((n) => n.id).join('|'), [nodes])

  useEffect(() => {
    const cx = width / 2;
    const cy = height / 2
    const sim = {}
    nodes.forEach((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * 2 * Math.PI
      const existing = simNodesRef.current[n.id]
      sim[n.id] = existing
        ? { ...existing }
        : {
            x: cx + Math.cos(angle) * (Math.min(width, height) / 3),
            y: cy + Math.sin(angle) * (Math.min(width, height) / 3),
            vx: 0, vy: 0,
          }
    })
    simNodesRef.current = sim

    const linkPairs = links
      .map((l) => ({ ...l, distance: l.distance || 90, strength: l.strength ?? 0.06 }))
      .filter((l) => sim[l.source] && sim[l.target])

    let iterations = 0
    const maxIterations = 220

    function step() {
      const ids = Object.keys(sim)
      // repulsion
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = sim[ids[i]];
          const b = sim[ids[j]]
          let dx = a.x - b.x;
          let dy = a.y - b.y
          let distSq = dx * dx + dy * dy
          if (distSq < 1) distSq = 1
          const force = 2400 / distSq
          const dist = Math.sqrt(distSq)
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force
          a.vx += fx; a.vy += fy
          b.vx -= fx; b.vy -= fy
        }
      }
      // springs
      linkPairs.forEach((l) => {
        const a = sim[l.source];
        const b = sim[l.target]
        if (!a || !b) return
        const dx = b.x - a.x;
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const diff = (dist - l.distance) * l.strength
        const fx = (dx / dist) * diff;
        const fy = (dy / dist) * diff
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      })
      // gravity toward center + integrate
      ids.forEach((id) => {
        const n = sim[id]
        n.vx += (width / 2 - n.x) * 0.01
        n.vy += (height / 2 - n.y) * 0.01
        n.vx *= 0.82; n.vy *= 0.82
        n.x += n.vx; n.y += n.vy
        n.x = Math.max(24, Math.min(width - 24, n.x))
        n.y = Math.max(24, Math.min(height - 24, n.y))
      })

      iterations++
      setPositions({ ...Object.fromEntries(Object.entries(sim).map(([k, v]) => [k, { x: v.x, y: v.y }])) })

      if (iterations < maxIterations) {
        rafRef.current = requestAnimationFrame(step)
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, width, height])

  const handlePointerDown = (id) => (e) => {
    e.stopPropagation()
    setDragging(id)
  }

  const handlePointerMove = (e) => {
    if (!dragging) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = Math.max(24, Math.min(width - 24, e.clientX - rect.left))
    const y = Math.max(24, Math.min(height - 24, e.clientY - rect.top))
    simNodesRef.current[dragging] = { ...simNodesRef.current[dragging], x, y, vx: 0, vy: 0 }
    setPositions((prev) => ({ ...prev, [dragging]: { x, y } }))
  }

  const handlePointerUp = () => setDragging(null)

  const linksResolved = links.filter((l) => positions[l.source] && positions[l.target])

  return (
    <div className={`relative ${className}`}>
      <svg
        width={width} height={height}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="select-none touch-none"
      >
        {linksResolved.map((l, i) => {
          const a = positions[l.source];
          const b = positions[l.target]
          return (
            <line
              key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={l.color || '#28323F'} strokeWidth={l.width || 1}
              strokeDasharray={l.dashed ? '3 3' : undefined}
              opacity={0.8}
            />
          )
        })}
        {nodes.map((n) => {
          const pos = positions[n.id]
          if (!pos) return null
          const r = n.radius || 8
          return (
            <g
              key={n.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onPointerDown={handlePointerDown(n.id)}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered((h) => (h === n.id ? null : h))}
              onClick={() => onNodeClick && onNodeClick(n)}
              style={{ cursor: onNodeClick ? 'pointer' : 'grab' }}
            >
              {n.pulse && (
                <circle r={r} fill="none" stroke={n.color} strokeWidth="2" opacity="0.5">
                  <animate attributeName="r" values={`${r};${r * 2};${r}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r={r} fill={n.color || '#7C8798'} fillOpacity={0.9} stroke={hovered === n.id ? '#E7EBF1' : 'transparent'} strokeWidth={1.5} />
              {n.showLabel !== false && (
                <text
                  y={r + 13} textAnchor="middle"
                  className="fill-ink-500 font-mono"
                  style={{ fontSize: 9, pointerEvents: 'none' }}
                >
                  {n.label?.length > 14 ? `${n.label.slice(0, 13)}…` : n.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hovered && renderTooltip && (
        <div className="absolute top-2 left-2 max-w-[240px] bg-base-950 border border-base-border rounded-lg px-3 py-2 text-xs shadow-panel z-10 pointer-events-none">
          {renderTooltip(nodes.find((n) => n.id === hovered))}
        </div>
      )}
    </div>
  )
}
