const CONFIG = {
  CRITICAL: { color: '#FF5470', bg: 'rgba(255,84,112,0.12)', label: 'CRITICAL' },
  HIGH: { color: '#FF9F45', bg: 'rgba(255,159,69,0.12)', label: 'HIGH' },
  MEDIUM: { color: '#FFD24C', bg: 'rgba(255,210,76,0.12)', label: 'MEDIUM' },
  LOW: { color: '#4ADE80', bg: 'rgba(74,222,128,0.12)', label: 'LOW' },
  NONE: { color: '#7C8798', bg: 'rgba(124,135,152,0.12)', label: 'NONE' },
}

export default function SeverityBadge({ severity, size = 'sm' }) {
  const cfg = CONFIG[severity] || CONFIG.NONE
  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-mono font-semibold tracking-wider ${sizeClasses}`}
      style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.color}33` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  )
}

export { CONFIG as SEVERITY_CONFIG }
