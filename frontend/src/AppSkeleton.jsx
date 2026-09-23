import './ExplorePage.css'

function Bar({ className = '' }) {
  return <span className={`appSkel ${className}`} aria-hidden="true" />
}

export function SkeletonStatus({ label = 'Loading', className = '', children }) {
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      {children}
    </div>
  )
}

export function SkeletonRow({ tag: Tag = 'div' }) {
  return (
    <Tag className="appSkelRow">
      <Bar className="appSkel--avatar" />
      <span className="appSkelStack">
        <Bar className="appSkel--title" />
        <Bar className="appSkel--sub" />
      </span>
      <Bar className="appSkel--value" />
    </Tag>
  )
}

export function SkeletonList({ count = 3, tag = 'div' }) {
  const rows = Array.from({ length: count }, (_, index) => <SkeletonRow key={index} tag={tag} />)
  if (tag === 'li') return rows
  return (
    <SkeletonStatus label="Loading" className="appSkelList">
      {rows}
    </SkeletonStatus>
  )
}

export function SkeletonStats() {
  return (
    <SkeletonStatus label="Loading metrics" className="appSkelStats">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="appSkelStat" key={index}>
          <Bar className="appSkel--statLabel" />
          <Bar className="appSkel--statValue" />
        </div>
      ))}
    </SkeletonStatus>
  )
}

export function SkeletonChart() {
  return (
    <SkeletonStatus label="Loading chart">
      <Bar className="appSkel--chart" />
    </SkeletonStatus>
  )
}

export function SkeletonReturn() {
  return (
    <SkeletonStatus label="Loading performance" className="appSkelReturn">
      <Bar className="appSkel--return" />
      <Bar className="appSkel--since" />
    </SkeletonStatus>
  )
}

export function SkeletonField() {
  return <Bar className="appSkel--field" />
}
