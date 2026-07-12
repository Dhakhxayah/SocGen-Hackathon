import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import DriftMonitoring from './pages/DriftMonitoring.jsx'
import ControlHealth from './pages/ControlHealth.jsx'
import Incidents from './pages/Incidents.jsx'
import ActorRiskProfile from './pages/ActorRiskProfile.jsx'
import Compliance from './pages/Compliance.jsx'
import Reports from './pages/Reports.jsx'
import Evaluation from './pages/Evaluation.jsx'
import LiveDemo from './pages/LiveDemo.jsx'
import { SimulationProvider } from './context/SimulationContext.jsx'

export default function App() {
  return (
    <SimulationProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px]">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/drifts" element={<DriftMonitoring />} />
            <Route path="/controls" element={<ControlHealth />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/actors" element={<ActorRiskProfile />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/evaluation" element={<Evaluation />} />
            <Route path="/live-demo" element={<LiveDemo />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>
      </div>
    </SimulationProvider>
  )
}
