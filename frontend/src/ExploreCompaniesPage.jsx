import { useMemo } from 'react'
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
  const rows = useMemo(() => buildExploreDirectoryFullList('companies'), [])

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
