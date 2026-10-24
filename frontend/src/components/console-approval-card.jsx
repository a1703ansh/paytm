import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Clock3, X } from 'lucide-react'
import { Avatar, Badge, Button, LaneBadge, Money } from './ui'
import { CaseBrief } from './ticket-brief'
import { actionAmount, actionLabel } from './ticket-actions'

function formatClock(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function riskTone(risk) {
  const value = Number(risk)
  if (!Number.isFinite(value)) return 'gray'
  if (value >= 70) return 'red'
  if (value >= 40) return 'amber'
  return 'green'
}

function confidenceLabel(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${Math.round(number <= 1 ? number * 100 : number)}%`
}

export function ConsoleApprovalCard({ approval, onApprove, onReject, approving = false, rejecting = false }) {
  const navigate = useNavigate()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const ticket = approval?.ticket || {}
  const action = approval?.action || {}
  const brief = approval?.brief || {}
  const customerName = ticket.customer_name || 'Customer'
  const segment = ticket.customer_segment || 'Unsegmented'
  const waitingSince = approval?.waiting_since || ticket.waiting_since
  const amount = actionAmount(action) ?? brief?.recommendation?.amount
  const risk = action.risk ?? brief.risk
  const confidence = action.confidence ?? brief.confidence

  async function confirmReject() {
    if (!onReject || rejecting) return
    const ok = await onReject(action.id, reason.trim())
    if (ok !== false) {
      setShowReject(false)
      setReason('')
    }
  }

  return (
    <section className="panel">
      <div className="panel-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="row gap-3">
          <Avatar name={customerName} size={38} />
          <div>
            <div className="row gap-2 wrap">
              <strong style={{ fontSize: 13.5 }}>{customerName}</strong>
              <Badge tone="navy">{segment}</Badge>
              {ticket.id ? (
                <Link to={`/tickets/${ticket.id}`} className="mono tiny" style={{ color: 'var(--navy-800)' }}>
                  {ticket.id}
                </Link>
              ) : null}
            </div>
            <div className="tiny muted" style={{ marginTop: 2 }}>{ticket.subject || brief.issue || 'Approval required'}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
            <Badge tone="amber" dot>
              <Clock3 size={10} /> {brief.sla || '4h'}
            </Badge>
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {waitingSince ? `Waiting since ${formatClock(waitingSince)}` : 'Waiting for review'}
          </div>
        </div>
      </div>

      <div className="panel-body" style={{ paddingBottom: 14 }}>
        <div className="row between wrap gap-3" style={{ marginBottom: 14 }}>
          <div>
            <div className="passport-label">Proposed action</div>
            <div className="row gap-2 wrap" style={{ marginTop: 3 }}>
              <strong style={{ fontSize: 12.5 }}>{actionLabel(action.type)}</strong>
              {amount != null ? <Money value={amount} /> : null}
              <Badge tone={riskTone(risk)}>Risk {risk ?? '—'}</Badge>
              <Badge tone="green">Confidence {confidenceLabel(confidence)}</Badge>
            </div>
          </div>
          <LaneBadge lane={action.lane || 'review'} />
        </div>
        <CaseBrief brief={brief} />
      </div>

      <div className="panel-body" style={{ borderTop: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          variant="success"
          icon={Check}
          loading={approving}
          disabled={rejecting}
          onClick={() => onApprove?.(action.id)}
        >
          Approve &amp; resume
        </Button>
        <Button
          variant="secondary"
          icon={ChevronRight}
          disabled={approving || rejecting}
          onClick={() => navigate(ticket.id ? `/tickets/${ticket.id}` : '/inbox')}
        >
          Open ticket
        </Button>
        <Button
          variant="ghost"
          icon={X}
          disabled={approving || rejecting}
          onClick={() => setShowReject((open) => !open)}
          style={{ color: 'var(--red)' }}
        >
          Reject
        </Button>
      </div>

      {showReject ? (
        <div className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="passport-label" htmlFor={`console-reject-${action.id || ticket.id || 'approval'}`}>
            Rejection reason
          </label>
          <textarea
            id={`console-reject-${action.id || ticket.id || 'approval'}`}
            className="textarea"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Tell the agent why this needs a human decision."
            style={{ marginTop: 6 }}
          />
          <div className="row gap-2 wrap" style={{ marginTop: 8 }}>
            <Button variant="danger" size="sm" loading={rejecting} disabled={approving} onClick={confirmReject}>
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
    </section>
  )
}
