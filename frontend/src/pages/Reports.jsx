import { Download, FileSpreadsheet, FileText, FileBarChart2 } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Panel from '../components/Panel.jsx'
import { reportUrl, fullExportUrl, pdfReportUrl } from '../services/api.js'

export default function Reports() {
  return (
    <div>
      <TopBar title="Reports" subtitle="Audit-ready exports for compliance meetings" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Panel>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/25 flex items-center justify-center shrink-0">
              <FileBarChart2 size={18} className="text-brand-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-100">Executive PDF Report</h3>
              <p className="text-xs text-ink-500 mt-1">
                One page: KPI summary, top risk incidents with AI root cause, and compliance
                framework coverage — built for a 10-second judge or executive skim.
              </p>
            </div>
          </div>
          <a
            href={pdfReportUrl}
            download
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg bg-brand-400 text-base-950 hover:bg-brand-500 transition-colors"
          >
            <Download size={14} /> Export PDF
          </a>
        </Panel>

        <Panel>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-ink-700/10 border border-base-border flex items-center justify-center shrink-0">
              <FileSpreadsheet size={18} className="text-ink-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-100">Top Risky Drift Report</h3>
              <p className="text-xs text-ink-500 mt-1">
                The top 10 highest-risk, unsuppressed drift events with compliance mappings and
                evidence — ready to drop into an audit meeting.
              </p>
            </div>
          </div>
          <a
            href={reportUrl}
            download
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg bg-base-800 border border-base-border text-ink-300 hover:border-base-600 hover:text-ink-100 transition-colors"
          >
            <Download size={14} /> Export CSV
          </a>
        </Panel>

        <Panel>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-ink-700/10 border border-base-border flex items-center justify-center shrink-0">
              <FileText size={18} className="text-ink-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-100">Full Drift Archive</h3>
              <p className="text-xs text-ink-500 mt-1">
                Every drift event detected in the current dataset (including suppressed and
                ambiguous), for long-term audit archival.
              </p>
            </div>
          </div>
          <a
            href={fullExportUrl}
            download
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg bg-base-800 border border-base-border text-ink-300 hover:border-base-600 hover:text-ink-100 transition-colors"
          >
            <Download size={14} /> Export Full CSV
          </a>
        </Panel>
      </div>

      <Panel title="What's in the export" className="mt-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-ink-500">
          {['control_id', 'severity + risk_score', 'compliance_mappings', 'changed_by / approval_status',
            'timestamp', 'description', 'status', 'incident_id'].map((f) => (
            <div key={f} className="font-mono bg-base-900 rounded-lg px-3 py-2 border border-base-border">{f}</div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
