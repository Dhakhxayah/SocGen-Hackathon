import { RefreshCw, PlayCircle, Loader2 } from 'lucide-react'
import { useSimulation } from '../context/SimulationContext.jsx'

export default function TopBar({ title, subtitle }) {
  const { simulating, simulate, runReprocess, lastRun } = useSimulation()

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-ink-100 tracking-tight">{title}</h1>
        {subtitle && <p className="text-ink-500 text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        {lastRun && (
          <span className="text-[11px] font-mono text-ink-700 hidden lg:inline">
            last dataset: {lastRun.generation?.change_events} events / {lastRun.pipeline?.incidents_created} incidents
          </span>
        )}
        <button
          onClick={() => runReprocess()}
          disabled={simulating}
          title="Re-run detection, suppression, scoring & correlation on existing data"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-ink-300 bg-base-800 border border-base-border hover:border-base-600 hover:text-ink-100 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={simulating ? 'animate-spin' : ''} />
          Reprocess
        </button>
        <button
          onClick={() => simulate(750)}
          disabled={simulating}
          title="Generate a fresh simulated enterprise dataset and run the full pipeline"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-base-950 bg-brand-400 hover:bg-brand-500 transition-colors disabled:opacity-50"
        >
          {simulating ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
          {simulating ? 'Simulating…' : 'Simulate New Dataset'}
        </button>
      </div>
    </div>
  )
}
