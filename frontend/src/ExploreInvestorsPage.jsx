import { useEffect, useState } from 'react'
import { isMockDataMode } from './dataMode.js'
import { loadExploreDirectoryBundle } from './exploreApi.js'
import { buildExploreDirectoryFullList } from './exploreDirectoryMock.js'
import { ExploreDirectoryListPage } from './ExploreDirectoryListPage.jsx'

export function ExploreInvestorsPage({
  backendUp = null,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  onInvestorRowClick = null,
}) {
  const [rows, setRows] = useState(() =>
    isMockDataMode(backendUp) ? buildExploreDirectoryFullList('investors') : [],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const bundle = await loadExploreDirectoryBundle(backendUp)
      if (cancelled) return
      setRows(bundle.fullInvestors ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [backendUp])

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
