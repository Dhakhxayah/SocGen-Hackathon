import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, ShieldCheck, GitMerge, FileCheck2, Download, ShieldAlert,
  Target, Zap, UserSearch,
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/drifts', label: 'Drift Monitoring', icon: Activity },
  { to: '/controls', label: 'Control Health', icon: ShieldCheck },
  { to: '/incidents', label: 'Incidents', icon: GitMerge },
  { to: '/actors', label: 'Actor Risk', icon: UserSearch },
  { to: '/compliance', label: 'Compliance', icon: FileCheck2 },
  { to: '/evaluation', label: 'Self-Evaluation', icon: Target },
  { to: '/live-demo', label: 'Live Demo', icon: Zap },
  { to: '/reports', label: 'Reports', icon: Download },
]

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-base-border bg-base-900 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-base-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
            <ShieldAlert size={17} className="text-brand-400" strokeWidth={2.25} />
          </div>
          <div>
            <div className="text-ink-100 font-bold text-[15px] leading-tight tracking-tight">SecureDrift</div>
            <div className="text-brand-400 text-[10px] font-mono tracking-[0.2em] uppercase">AI</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-500/10 text-brand-400 border border-brand-500/25'
                  : 'text-ink-500 hover:text-ink-100 hover:bg-base-800 border border-transparent'
              }`
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-base-border">
        <div className="flex items-center gap-2 text-[11px] text-ink-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 pulse-dot" />
          MONITORING LIVE
        </div>
        <div className="text-ink-700 text-[10px] mt-1 font-mono">Config Governance & Risk Mgmt</div>
      </div>
    </aside>
  )
}
