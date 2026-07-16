import { useMemo } from 'react'
import { buildExploreDirectoryFullList } from './exploreDirectoryMock.js'
import { ExploreDirectoryListPage } from './ExploreDirectoryListPage.jsx'

export function ExploreInvestorsPage({
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  onInvestorRowClick = null,
}) {
  const rows = useMemo(() => buildExploreDirectoryFullList('investors'), [])

  return (
    <ExploreDirectoryListPage
      kind="investors"
      rows={rows}
      backendUp={backendUp}
      macroActive={macroActive}
      onMacroClick={onMacroClick}
      settingsActive={settingsActive}
      onSettingsClick={onSettingsClick}
      onBrandClick={onBrandClick}
      onCloseClick={onCloseClick}
      onInvestorRowClick={onInvestorRowClick}
    />
  )
}
