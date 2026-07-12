import { Loader2, DatabaseZap } from 'lucide-react'

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-ink-500">
      <Loader2 size={22} className="animate-spin mb-3 text-brand-400" />
      <span className="text-sm font-mono">{label}</span>
    </div>
  )
}

export function EmptyState({ label = 'No data yet', hint = 'Click "Simulate New Dataset" to generate one.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-ink-500">
      <DatabaseZap size={26} className="mb-3 text-ink-700" />
      <span className="text-sm font-medium text-ink-300">{label}</span>
      <span className="text-xs mt-1 text-ink-700">{hint}</span>
    </div>
  )
}
