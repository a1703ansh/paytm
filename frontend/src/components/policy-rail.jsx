import { Check, ChevronRight, Lock, ShieldCheck } from 'lucide-react'
import { Badge, Card, EmptyState, LaneBadge, Money, Progress } from './ui'

function inr(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function laneTone(lane) {
  if (lane === 'auto') return 'green'
  if (lane === 'review') return 'amber'
  if (lane === 'deny') return 'red'
  return 'cyan'
}

export function PolicyRail({ policy }) {
  const active = policy?.active || policy || {}
  const licenses = Array.isArray(policy?.licenses)
    ? policy.licenses
    : Array.isArray(active?.licenses)
      ? active.licenses
      : []
  const history = Array.isArray(policy?.history)
    ? policy.history
    : Array.isArray(active?.history)
      ? active.history
      : []
  const historyRows = history.length ? [...history].reverse() : (active?.version ? [active] : [])

  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      <Card className="license-list-card">
        <div className="card-title">
          <h2>Autonomy licences</h2>
          <Badge tone="navy">{licenses.length}</Badge>
        </div>
        {licenses.length ? (
          <div style={{ maxHeight: 440, overflowY: 'auto', paddingRight: 4 }}>
            {licenses.map((license, index) => {
              const rawPrecision = Number(license?.precision)
              const precision = Number.isFinite(rawPrecision) ? (rawPrecision <= 1 ? rawPrecision * 100 : rawPrecision) : NaN
              const tone = laneTone(license?.lane)
              return (
                <div
                  key={`${license?.action || 'license'}-${license?.segment || index}`}
                  className={`license-card ${license?.lane === 'review' ? 'review' : license?.lane === 'deny' ? 'deny' : ''}`}
                  style={{ marginBottom: index === licenses.length - 1 ? 0 : 10 }}
                >
                  <div className="license-top">
                    <div>
                      <div className="license-action">{license?.action || 'unknown_action'}</div>
                      <div className="tiny muted" style={{ marginTop: 2 }}>{license?.segment || 'All segments'}</div>
                    </div>
                    <LaneBadge lane={license?.lane} />
                  </div>
                  <div className="license-limit">
                    {license?.limit != null ? <Money value={license.limit} /> : '—'}
                  </div>
                  <div className="license-meta">
                    <span>Precision {Number.isFinite(precision) ? `${precision.toFixed(1)}%` : '—'}</span>
                    <span>·</span>
                    <span>{license?.clean_actions ?? 0} clean actions</span>
                  </div>
                  <div style={{ marginTop: 7 }}>
                    <Progress value={Number.isFinite(precision) ? precision : 0} tone={tone === 'navy' ? 'navy' : tone} />
                  </div>
                  <div className="license-foot">
                    <span>{license?.next_promotion || 'No promotion queued'}</span>
                    <ChevronRight size={12} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="No licences yet"
            description="Promote a policy to grant the agent its first scoped licence."
          />
        )}
      </Card>

      <Card>
        <div className="row gap-2">
          <ShieldCheck size={16} />
          <h2>Trust contract</h2>
        </div>
        <div className="mt-2">
          <div className="trust-row">
            <span className="trust-row-label"><Check size={13} /> Precedence</span>
            <span className="trust-row-value">Deny &gt; Review &gt; Auto</span>
          </div>
          <div className="trust-row">
            <span className="trust-row-label"><Check size={13} /> Evidence</span>
            <span className="trust-row-value">Required</span>
          </div>
          <div className="trust-row">
            <span className="trust-row-label"><Lock size={13} /> Passport</span>
            <span className="trust-row-value">Signed</span>
          </div>
          <div className="trust-row">
            <span className="trust-row-label"><Lock size={13} /> Undo window</span>
            <span className="trust-row-value">24h</span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="card-title">
          <h2>Policy history</h2>
          <Badge tone="gray">{historyRows.length}</Badge>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Limits</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((row, index) => (
                <tr key={`${row?.version || 'version'}-${index}`}>
                  <td>
                    <span className="passport-code">{row?.version || '—'}</span>
                    <div className="tiny muted" style={{ marginTop: 3 }}>{formatDate(row?.updated_at)}</div>
                  </td>
                  <td>
                    <div className="mono tiny" style={{ whiteSpace: 'nowrap' }}>
                      {inr(row?.auto_limit)} / {inr(row?.notify_limit)} / {row?.risk_threshold ?? '—'}
                    </div>
                  </td>
                  <td>
                    <span className="tiny muted">{row?.note || (index === 0 ? 'Active licence' : 'Policy release')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
