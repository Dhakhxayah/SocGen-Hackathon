export default function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`bg-base-850 border border-base-border rounded-xl shadow-panel overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-border">
          <div>
            {title && <h3 className="text-sm font-semibold text-ink-100 tracking-wide">{title}</h3>}
            {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
