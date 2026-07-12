export default function StatCard({ label, value, sublabel, accent = 'brand', icon: Icon, trend }) {
  const accentColor = {
    brand: '#22C6AA',
    critical: '#FF5470',
    high: '#FF9F45',
    ink: '#AEB9C7',
  }[accent] || '#22C6AA'

  return (
    <div className="fade-in-up bg-base-850 border border-base-border rounded-xl p-5 shadow-panel relative overflow-hidden">
      <div
        className="absolute top-0 left-0 w-full h-[2px]"
        style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
      />
      <div className="flex items-start justify-between mb-3">
        <span className="text-ink-500 text-[11px] font-mono uppercase tracking-widest">{label}</span>
        {Icon && <Icon size={16} style={{ color: accentColor }} strokeWidth={2} />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold font-mono mono-tabular text-ink-100">{value}</span>
        {trend && <span className="text-xs font-mono" style={{ color: accentColor }}>{trend}</span>}
      </div>
      {sublabel && <div className="text-ink-500 text-xs mt-1.5">{sublabel}</div>}
    </div>
  )
}
