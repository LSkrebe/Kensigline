import { useEffect, useState } from 'react'
import { loadExploreDirectoryBundle } from './exploreApi.js'
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
  const [rows, setRows] = useState(() => buildExploreDirectoryFullList('investors'))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const bundle = await loadExploreDirectoryBundle({ preferLive: backendUp !== false })
      if (cancelled) return
      if (bundle?.fullInvestors?.length) setRows(bundle.fullInvestors)
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
