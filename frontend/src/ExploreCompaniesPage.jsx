import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { isMockDataMode } from './dataMode.js'
import { loadExploreDirectoryBundle } from './exploreApi.js'
import { buildExploreDirectoryFullList } from './exploreDirectoryMock.js'
import { ExploreDirectoryListPage } from './ExploreDirectoryListPage.jsx'

export function ExploreCompaniesPage({
  backendUp = null,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  onCompanyRowClick = null,
}) {
  const { user } = useAuth()
  const authUserId = user?.id ?? null
  const [rows, setRows] = useState(() =>
    isMockDataMode(backendUp) ? buildExploreDirectoryFullList('companies') : [],
  )
  const [rowsLoading, setRowsLoading] = useState(() => !isMockDataMode(backendUp))

  useEffect(() => {
    let cancelled = false
    if (isMockDataMode(backendUp)) {
      setRows(buildExploreDirectoryFullList('companies'))
      setRowsLoading(false)
      return
    }
    setRowsLoading(true)
    ;(async () => {
      const bundle = await loadExploreDirectoryBundle(backendUp)
      if (cancelled) return
      setRows(bundle.fullCompanies ?? [])
      setRowsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [backendUp, authUserId])

  return (
    <ExploreDirectoryListPage
      kind="companies"
      rows={rows}
      rowsLoading={rowsLoading}
      backendUp={backendUp}
      macroActive={macroActive}
      onMacroClick={onMacroClick}
      settingsActive={settingsActive}
      onSettingsClick={onSettingsClick}
      onBrandClick={onBrandClick}
      onCloseClick={onCloseClick}
      onCompanyRowClick={onCompanyRowClick}
    />
  )
}
