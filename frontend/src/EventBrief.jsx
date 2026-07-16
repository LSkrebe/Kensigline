export function EventBriefAnalysis({ text, className = 'researchPaperDocCardAnalysis' }) {
  const body = String(text ?? '').trim()
  if (!body) return null
  const paras = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  if (paras.length === 0) {
    return <p className={className}>{body}</p>
  }
  return paras.map((p, i) => (
    <p className={className} key={`event-brief-p-${i}`}>
      {p}
    </p>
  ))
}
