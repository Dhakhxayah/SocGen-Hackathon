import { createContext, useContext, useState, useCallback } from 'react'
import { runSimulate, reprocess } from '../services/api'

const SimCtx = createContext(null)

export function SimulationProvider({ children }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [simulating, setSimulating] = useState(false)
  const [lastRun, setLastRun] = useState(null)
  const [error, setError] = useState(null)

  const simulate = useCallback(async (n = 750) => {
    setSimulating(true)
    setError(null)
    try {
      const result = await runSimulate(n)
      setLastRun(result)
      setRefreshKey((k) => k + 1)
      return result
    } catch (e) {
      setError(e?.message || 'Simulation failed')
      throw e
    } finally {
      setSimulating(false)
    }
  }, [])

  const runReprocess = useCallback(async () => {
    setSimulating(true)
    setError(null)
    try {
      const result = await reprocess()
      setRefreshKey((k) => k + 1)
      return result
    } catch (e) {
      setError(e?.message || 'Reprocess failed')
      throw e
    } finally {
      setSimulating(false)
    }
  }, [])

  // Lightweight refresh trigger for actions that mutate data directly
  // (e.g. one-click remediate) without needing a full reprocess/resimulate.
  const bumpRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <SimCtx.Provider value={{ refreshKey, simulating, lastRun, error, simulate, runReprocess, bumpRefresh }}>
      {children}
    </SimCtx.Provider>
  )
}

export const useSimulation = () => useContext(SimCtx)
