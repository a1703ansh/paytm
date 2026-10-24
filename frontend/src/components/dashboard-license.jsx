import { Badge, LaneBadge, Money, Progress } from './ui'

function percent(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${number.toFixed(1).replace(/\.0$/, '')}%`
}

export default function LicenseCard({ license }) {
  const lane = license.lane || 'auto'
  const tone = lane === 'review' ? 'amber' : lane === 'deny' ? 'red' : 'green'
  const laneClass = lane === 'review' ? 'review' : lane === 'deny' ? 'deny' : ''
  const precision = Number(license.precision)

  return (
    <div className={`license-card ${laneClass}`}>
      <div className="license-top">
        <div>
          <div className="license-action">{license.action || 'Unnamed action'}</div>
          <div className="license-limit">
            <Money value={Number(license.limit) || 0} />
          </div>
        </div>
        <LaneBadge lane={license.lane} />
      </div>
      <div className="license-meta">
        <Badge tone="gray">{license.segment || 'All segments'}</Badge>
        <span>{Number(license.clean_actions) || 0} clean actions</span>
      </div>
      <div className="row between gap-3 mt-3">
        <span className="tiny muted">Precision</span>
        <span className="tiny">
          <strong>{percent(precision)}</strong>
        </span>
      </div>
      <div className="mt-1">
        <Progress value={Number.isFinite(precision) ? precision : 0} tone={tone} />
      </div>
      <div className="license-foot">
        <span className="truncate" title={license.next_promotion || 'No promotion queued'}>
          {license.next_promotion || 'No promotion queued'}
        </span>
      </div>
    </div>
  )
}
