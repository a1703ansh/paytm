import { Link } from 'react-router-dom'
import { Badge, Card, Progress, TooltipLabel } from './ui'

function percentText(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${number.toFixed(1).replace(/\.0$/, '')}%`
}

export default function TrustPanel({ trust, licenses }) {
  const safeTrust = trust || {}
  const safeLicenses = Array.isArray(licenses) ? licenses : []
  const nextPromotion = safeLicenses.find((license) => license && license.next_promotion)
  const blocks = Number(safeTrust.policy_blocks) || 0

  const rows = [
    {
      label: 'Evidence coverage',
      hint: 'Share of actions with every required fact attached.',
      value: percentText(safeTrust.evidence_coverage),
      bar: Number(safeTrust.evidence_coverage) || 0,
      tone: 'green'
    },
    {
      label: 'Verification rate',
      hint: 'Executed actions read back and confirmed by the adapter.',
      value: percentText(safeTrust.verification_rate),
      bar: Number(safeTrust.verification_rate) || 0,
      tone: 'cyan'
    },
    {
      label: 'Policy blocks',
      hint: 'Attempts stopped before any money or entitlement moved.',
      value: String(blocks),
      bar: Math.min(100, blocks * 5),
      tone: 'red'
    },
    {
      label: 'Human override rate',
      hint: 'Resolved tickets that a human later reversed or escalated.',
      value: percentText(safeTrust.override_rate),
      bar: Number(safeTrust.override_rate) || 0,
      tone: 'amber'
    }
  ]

  return (
    <Card>
      <div className="card-title">
        <div>
          <h3>Trust panel</h3>
          <div className="card-sub">The evidence and guardrails behind every lane.</div>
        </div>
        <Badge tone="green" dot>
          Monitoring
        </Badge>
      </div>
      <div>
        {rows.map((row) => (
          <div className="trust-row" key={row.label}>
            <div className="flex-1">
              <div className="row between gap-3">
                <span className="trust-row-label">
                  <TooltipLabel label={row.label} hint={row.hint} />
                </span>
                <span className="trust-row-value">{row.value}</span>
              </div>
              <div className="mt-2">
                <Progress value={row.bar} tone={row.tone} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <strong className="small">Next autonomy promotion</strong>
        <p className="tiny muted mt-1">
          {nextPromotion?.next_promotion || 'No promotion queued. Keep clean actions flowing.'}
        </p>
        <Link to="/policy" className="btn btn-secondary btn-sm mt-2">
          Review promotion
        </Link>
      </div>
    </Card>
  )
}
