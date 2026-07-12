import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

export const getDashboard = () => api.get('/dashboard').then(r => r.data)
export const getTimeline = (days = 30) => api.get(`/timeline?days=${days}`).then(r => r.data)
export const getControls = () => api.get('/controls').then(r => r.data)
export const getControlHealth = () => api.get('/controls/health-by-category').then(r => r.data)
export const getDrifts = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return api.get(`/drifts${q ? `?${q}` : ''}`).then(r => r.data)
}
export const updateDriftStatus = (id, status) =>
  api.post(`/drifts/${id}/status?status=${encodeURIComponent(status)}`).then(r => r.data)
export const remediateDrift = (id) => api.post(`/drifts/${id}/remediate`).then(r => r.data)
export const getIncidents = () => api.get('/incidents').then(r => r.data)
export const getIncident = (id) => api.get(`/incidents/${id}`).then(r => r.data)
export const analyzeIncident = (id) => api.post(`/analyze/${id}`).then(r => r.data)
export const analyzeAll = () => api.post('/analyze-all').then(r => r.data)
export const getCompliance = () => api.get('/compliance').then(r => r.data)
export const getMlScatter = () => api.get('/ml/scatter').then(r => r.data)
export const getMlSummary = () => api.get('/ml/summary').then(r => r.data)
export const getMlComparison = () => api.get('/ml/comparison').then(r => r.data)
export const getActors = () => api.get('/actors').then(r => r.data)
export const getActorDetail = (actor) => api.get(`/actors/${encodeURIComponent(actor)}`).then(r => r.data)
export const getAttackPath = (incidentId) => api.get(`/incidents/${incidentId}/attack-path`).then(r => r.data)
export const getEvaluation = () => api.get('/evaluation').then(r => r.data)
export const triggerLiveIncident = () =>
  api.post('/demo/trigger-incident', {}, { timeout: 60000 }).then(r => r.data)
export const runSimulate = (n_events = 750) =>
  api.post(`/simulate?n_events=${n_events}&run_analysis=true`, {}, { timeout: 120000 }).then(r => r.data)
export const reprocess = () => api.post('/reprocess').then(r => r.data)
export const reportUrl = `${import.meta.env.VITE_API_URL || '/api'}/report`
export const fullExportUrl = `${import.meta.env.VITE_API_URL || '/api'}/report/full-export`
export const pdfReportUrl = `${import.meta.env.VITE_API_URL || '/api'}/report/pdf`

export default api
