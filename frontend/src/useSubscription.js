import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'

export function useSubscription() {
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetchJsonSafe('/api/billing/status')
    const isActive = Boolean(res.ok && res.data?.active)
    setActive(isActive)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { loading, active, refresh }
}
