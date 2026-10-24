import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Badge, Button, Money } from './ui'
import { actionLabel } from './ticket-actions'

function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

function sentimentTone(sentiment) {
  const value = String(sentiment || '').toLowerCase()
  if (value === 'angry') return 'red'
  if (value === 'frustrated' || value === 'negative') return 'amber'
  if (value === 'happy' || value === 'positive') return 'green'
  return 'gray'
}

export function CaseBrief({
  brief,
  onApprove,
  onReject,
  approving = false,
  rejecting = false,
  disabled = false,
  approveLabel = 'Approve & resume',
  className = ''
}) {
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const recommendation = brief?.recommendation && typeof brief.recommendation === 'object'
    ? brief.recommendation
    : {}
  const evidence = toList(brief?.evidence)
  const aiDid = toList(brief?.ai_did)
  const action = recommendation.action || brief?.action || 'issue_refund'
  const amount = recommendation.amount ?? brief?.amount
  const confidence = Number(brief?.confidence)
  const confidenceLabel = Number.isFinite(confidence)
    ? `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%`
    : '—'
  const hasActions = Boolean(onApprove || onReject)

  async function submitReject() {
    if (!onReject || rejecting) return
    await onReject(reason.trim())
    setShowReject(false)
    setReason('')
  }

  return (
    <div className={`brief ${className}`}>
      <div className="brief-head" style={{ flexWrap: 'wrap' }}>
        <div>
          <h3>Case brief</h3>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            Prepared by Resolve agent{brief?.policy_version ? ` · Policy ${brief.policy_version}` : ''}
          </div>
        </div>
        <div className="row gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
          <Badge tone="amber" dot>Human decision</Badge>
          {brief?.sla ? <Badge tone="amber">{brief.sla} SLA</Badge> : null}
          <Badge tone={sentimentTone(brief?.sentiment)}>{brief?.sentiment || 'neutral'}</Badge>
          <Badge tone="navy">Risk {brief?.risk ?? '—'}</Badge>
          <Badge tone="green">Confidence {confidenceLabel}</Badge>
        </div>
      </div>

      <div className="brief-grid">
        <div className="brief-block">
          <div className="brief-label">Issue</div>
          <div className="brief-value">{brief?.issue || '—'}</div>
        </div>
        <div className="brief-block">
          <div className="brief-label">Customer</div>
          <div className="brief-value">{brief?.customer || '—'}</div>
        </div>
        <div className="brief-block">
          <div className="brief-label">Evidence</div>
          {evidence.length ? (
            <ul className="brief-list">
              {evidence.map((item, index) => (
                <li key={`${typeof item === 'string' ? item : item?.label || index}-${index}`}>
                  {typeof item === 'string' ? item : item?.label || item?.value || 'Evidence'}
                </li>
              ))}
            </ul>
          ) : <div className="brief-value">—</div>}
        </div>
        <div className="brief-block">
          <div className="brief-label">AI did</div>
          {aiDid.length ? (
            <ul className="brief-list">
              {aiDid.map((item, index) => (
                <li key={`${typeof item === 'string' ? item : index}-${index}`}>
                  {typeof item === 'string' ? item : item?.label || item?.value || 'Step'}
                </li>
              ))}
            </ul>
          ) : <div className="brief-value">—</div>}
        </div>
        <div className="brief-block full">
          <div className="brief-label">Escalation reason</div>
          <div className="brief-value">{brief?.escalation_reason || brief?.reason || 'Human decision required for this action.'}</div>
        </div>
      </div>

      <div className="brief-rec" style={{ flexWrap: 'wrap' }}>
        <div>
          <div className="brief-label">Recommendation</div>
          <div className="row gap-2 wrap">
            <strong>{actionLabel(action)}</strong>
            {amount != null ? <Money value={amount} /> : null}
          </div>
          {recommendation.reason || brief?.reason ? (
            <div className="tiny" style={{ marginTop: 3 }}>{recommendation.reason || brief.reason}</div>
          ) : null}
        </div>
        {hasActions ? (
          <div className="row gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
            {onApprove ? (
              <Button
                variant="success"
                size="sm"
                icon={Check}
                loading={approving}
                disabled={disabled || rejecting}
                onClick={() => onApprove()}
              >
                {approveLabel}
              </Button>
            ) : null}
            {onReject ? (
              <Button
                variant="ghost"
                size="sm"
                icon={X}
                disabled={disabled || approving || rejecting}
                onClick={() => setShowReject((open) => !open)}
              >
                Reject
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {showReject && onReject ? (
        <div style={{ padding: '12px 15px', borderTop: '1px solid var(--line-strong)', background: 'var(--amber-soft)' }}>
          <label className="brief-label" htmlFor={`reject-reason-${brief?.action_id || 'brief'}`}>
            Rejection reason
          </label>
          <textarea
            id={`reject-reason-${brief?.action_id || 'brief'}`}
            className="textarea"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why should the agent stop and hand this back?"
            style={{ marginTop: 6 }}
          />
          <div className="row gap-2 wrap" style={{ marginTop: 8 }}>
            <Button variant="danger" size="sm" loading={rejecting} disabled={approving} onClick={submitReject}>
              Confirm reject
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={rejecting}
              onClick={() => {
                setShowReject(false)
                setReason('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
