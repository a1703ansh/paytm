import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Ban,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Zap
} from 'lucide-react'
import { Badge, Card } from './ui'

const EVENT_META = {
  'action.verified': { icon: ShieldCheck, tone: 'green', label: 'Verified' },
  'action.executed': { icon: Zap, tone: 'cyan', label: 'Executed' },
  'action.undone': { icon: RotateCcw, tone: 'amber', label: 'Undone' },
  'action.blocked': { icon: Ban, tone: 'red', label: 'Blocked' },
  'action.denied': { icon: Ban, tone: 'red', label: 'Denied' },
  'policy.promoted': { icon: TrendingUp, tone: 'cyan', label: 'Policy promoted' },
  'ticket.escalated': { icon: AlertTriangle, tone: 'amber', label: 'Escalated' }
}

function formatWhen(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const now = new Date()
  const time = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`
  const sameYear = date.getFullYear() === now.getFullYear()
  const day = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  })
  return `${day}, ${time}`
}

export default function RecentLedger({ events = [] }) {
  const rows = (Array.isArray(events) ? events : []).slice(0, 8)

  return (
    <Card>
      <div className="card-title">
        <div>
          <h3>Recent ledger</h3>
          <div className="card-sub">Everything the agent decided, in order.</div>
        </div>
        <Badge tone="navy">Audit trail</Badge>
      </div>
      {rows.length ? (
        <div className="list">
          {rows.map((event, index) => {
            const meta = EVENT_META[event.type] || { icon: Activity, tone: 'gray', label: 'Ledger' }
            const Icon = meta.icon
            const body = (
              <>
                <Badge tone={meta.tone}>
                  <Icon size={12} aria-hidden="true" />
                </Badge>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="small truncate" title={event.label}>
                    {event.label || 'Ledger event'}
                  </div>
                  <div className="ticket-meta">
                    <span className="mono">{event.ticket_id || '—'}</span>
                    <span>·</span>
                    <span>{meta.label}</span>
                  </div>
                </div>
                <span className="tiny muted">{formatWhen(event.ts)}</span>
              </>
            )
            return event.ticket_id ? (
              <Link
                to={`/tickets/${event.ticket_id}`}
                className="list-item ticket-row"
                key={event.id || index}
              >
                {body}
              </Link>
            ) : (
              <div className="list-item" key={event.id || index}>
                {body}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="small muted">No ledger events yet.</p>
      )}
      <div className="divider" />
      <Link to="/console" className="btn btn-ghost btn-sm">
        View all events <ArrowUpRight size={13} />
      </Link>
    </Card>
  )
}
