import { useMemo } from 'react'
import { buildExploreDirectoryFullList } from './exploreDirectoryMock.js'
import { ExploreDirectoryListPage } from './ExploreDirectoryListPage.jsx'

export function ExploreActorsPage({
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onActorRowClick = null,
}) {
  const rows = useMemo(() => buildExploreDirectoryFullList('actors'), [])

  return (
    <ExploreDirectoryListPage
      kind="actors"
      rows={rows}
      backendUp={backendUp}
      macroActive={macroActive}
      onMacroClick={onMacroClick}
      settingsActive={settingsActive}
      onSettingsClick={onSettingsClick}
      onBrandClick={onBrandClick}
      onActorRowClick={onActorRowClick}
    />
  )
}
