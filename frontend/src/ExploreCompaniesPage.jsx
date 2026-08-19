import { useEffect, useState } from 'react'
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
  const [rows, setRows] = useState(() =>
    isMockDataMode(backendUp) ? buildExploreDirectoryFullList('companies') : [],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const bundle = await loadExploreDirectoryBundle(backendUp)
      if (cancelled) return
      setRows(bundle.fullCompanies ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [backendUp])

  return (
    <ExploreDirectoryListPage
      kind="companies"
      rows={rows}
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
