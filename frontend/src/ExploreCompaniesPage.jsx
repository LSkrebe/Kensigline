import { useEffect, useState } from 'react'
import { loadExploreDirectoryBundle } from './exploreApi.js'
import { buildExploreDirectoryFullList } from './exploreDirectoryMock.js'
import { ExploreDirectoryListPage } from './ExploreDirectoryListPage.jsx'

export function ExploreCompaniesPage({
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  onCompanyRowClick = null,
}) {
  const [rows, setRows] = useState(() => buildExploreDirectoryFullList('companies'))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const bundle = await loadExploreDirectoryBundle({ preferLive: backendUp !== false })
      if (cancelled) return
      if (bundle?.fullCompanies?.length) setRows(bundle.fullCompanies)
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
