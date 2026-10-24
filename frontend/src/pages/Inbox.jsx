import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Inbox as InboxIcon,
  RotateCcw,
  Search,
  SearchX,
  ShieldCheck,
  SlidersHorizontal
} from 'lucide-react'
import { api } from '../lib/api'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LaneBadge,
  Money,
  PageHeader,
  Spinner,
  StatCard,
  StatusBadge
} from '../components/ui'

const INTENT_LABELS = {
  wismo: 'Where is my order',
  refund: 'Refund',
  damaged: 'Damaged item',
  return: 'Return',
  replacement: 'Replacement',
  payment_failure: 'Payment failure',
  injection: 'Prompt injection',
  delayed: 'Delayed shipment',
  wrong_item: 'Wrong item'
}

const INTENT_TONES = {
  wismo: 'cyan',
  refund: 'navy',
  damaged: 'amber',
  return: 'navy',
  replacement: 'cyan',
  payment_failure: 'amber',
  injection: 'red',
  delayed: 'gray',
  wrong_item: 'amber'
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'waiting_human', label: 'Needs approval' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'blocked', label: 'Blocked' }
]

const DEMO_STEPS = [
  {
    id: 'T-1001',
    title: 'WISMO, still in transit',
    detail: 'Auto tracking reply, verified in 0.8 min',
    lane: 'auto'
  },
  {
    id: 'T-1002',
    title: 'Damaged item, ₹1,299',
    detail: 'Auto refund, read-back, undo window',
    lane: 'auto'
  },
  {
    id: 'T-1003',
    title: 'VIP escalation, ₹15,000',
    detail: 'Review lane with a case brief',
    lane: 'review'
  },
  {
    id: 'T-1007',
    title: 'Prompt injection',
    detail: 'Hard deny, evidence preserved',
    lane: 'deny'
  }
]

const GATE_STEPS = [
  {
    title: 'Evidence',
    detail: 'Order, payment, payee, and policy facts are loaded and cited before reasoning.'
  },
  {
    title: 'Policy',
    detail: 'Amount, risk, segment, and payee are checked against the deterministic policy gate.'
  },
  {
    title: 'Execute',
    detail: 'A scoped action runs with an idempotency key and a complete action passport.'
  },
  {
    title: 'Verify',
    detail: 'The adapter result is read back, written to the ledger, and left reversible for 24h.'
  }
]

function intentLabel(intent) {
  if (!intent) return 'Unclassified'
  if (INTENT_LABELS[intent]) return INTENT_LABELS[intent]
  return String(intent)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function intentTone(intent) {
  return INTENT_TONES[intent] || 'gray'
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

function matchesStatus(ticket, key) {
  if (key === 'all') return true
  if (key === 'open') return ticket.status === 'open' || ticket.status === 'running'
  if (key === 'blocked') return ticket.status === 'blocked' || ticket.status === 'escalated'
  return ticket.status === key
}

function Sentiment({ value }) {
  const tone = value === 'angry' || value === 'frustrated' ? value : 'neutral'
  const label = value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Neutral'
  return (
    <span className={`row gap-1 sentiment sentiment-${tone}`}>
      <span className="badge-dot" />
      {label}
    </span>
  )
}

export default function InboxPage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [intentFilter, setIntentFilter] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await api.getTickets()
      const list = Array.isArray(payload) ? payload : payload?.tickets
      setTickets(Array.isArray(list) ? list : [])
    } catch (err) {
      setTickets([])
      setError(err?.message || 'Could not load the support inbox.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(
    () => ({
      open: tickets.filter((ticket) => matchesStatus(ticket, 'open')).length,
      waiting_human: tickets.filter((ticket) => ticket.status === 'waiting_human').length,
      resolved: tickets.filter((ticket) => ticket.status === 'resolved').length,
      blocked: tickets.filter((ticket) => matchesStatus(ticket, 'blocked')).length
    }),
    [tickets]
  )

  const intentOptions = useMemo(() => {
    const known = Object.keys(INTENT_LABELS)
    const extra = Array.from(
      new Set(tickets.map((ticket) => ticket.intent).filter((intent) => intent && !known.includes(intent)))
    )
    return [...known, ...extra]
  }, [tickets])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (!matchesStatus(ticket, statusFilter)) return false
      if (intentFilter !== 'all' && ticket.intent !== intentFilter) return false
      if (!query) return true
      const haystack = [
        ticket.subject,
        ticket.customer_name,
        ticket.id,
        ticket.channel,
        ticket.order_id,
        ticket.order && ticket.order.id,
        intentLabel(ticket.intent)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [tickets, statusFilter, intentFilter, search])

  function clearFilters() {
    setStatusFilter('all')
    setIntentFilter('all')
    setSearch('')
  }

  function openTicket(ticket) {
    if (ticket?.id) navigate(`/tickets/${ticket.id}`)
  }

  const summary = [
    {
      label: 'Open',
      value: counts.open,
      hint: 'ready for the agent',
      icon: InboxIcon,
      tone: 'cyan'
    },
    {
      label: 'Needs approval',
      value: counts.waiting_human,
      hint: 'human in the loop',
      icon: ShieldCheck,
      tone: 'amber'
    },
    {
      label: 'Resolved',
      value: counts.resolved,
      hint: 'closed with evidence',
      icon: CheckCircle2,
      tone: 'green'
    },
    {
      label: 'Blocked',
      value: counts.blocked,
      hint: 'denied or escalated',
      icon: Ban,
      tone: 'red'
    }
  ]

  return (
    <>
      <PageHeader
        eyebrow="INBOX"
        title="Tickets with a licence to resolve."
        description="Eight live post-purchase scenarios. Run the agent, watch the policy gate, and escalate only when trust demands it."
        actions={
          <>
            <Button icon={ShieldCheck} onClick={() => navigate('/console')}>
              Open approvals
            </Button>
            <Button
              variant="secondary"
              icon={SlidersHorizontal}
              onClick={() => navigate('/policy')}
            >
              Autonomy studio
            </Button>
          </>
        }
      />

      {loading ? (
        <Card>
          <Spinner label="Loading tickets" />
        </Card>
      ) : error ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Inbox unavailable"
            description={error}
            action={
              <Button variant="secondary" icon={RotateCcw} onClick={load}>
                Retry
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-4 mb-4">
            {summary.map((item) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                hint={item.hint}
                icon={item.icon}
                tone={item.tone}
              />
            ))}
          </div>

          <div className="filter-bar">
            <div className="filter-left">
              <div
                className="tabs"
                role="group"
                aria-label="Filter by status"
                style={{ maxWidth: '100%', overflowX: 'auto' }}
              >
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={statusFilter === tab.key}
                    className={`tab ${statusFilter === tab.key ? 'active' : ''}`}
                    onClick={() => setStatusFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <select
                className="select"
                style={{ width: 178 }}
                value={intentFilter}
                onChange={(event) => setIntentFilter(event.target.value)}
                aria-label="Filter by intent"
              >
                <option value="all">All intents</option>
                {intentOptions.map((intent) => (
                  <option value={intent} key={intent}>
                    {intentLabel(intent)}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-right">
              <label className="search-field">
                <Search size={15} />
                <input
                  className="input"
                  type="search"
                  style={{ width: 262 }}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search subject, customer, order, ID"
                  aria-label="Search tickets"
                />
              </label>
              <span className="tiny muted">
                {filtered.length} of {tickets.length} tickets
              </span>
            </div>
          </div>

          <Card padded={false}>
            <div className="panel-head">
              <div>
                <h3>Resolution queue</h3>
                <div className="card-sub">Open a ticket to run the agent and follow the gate.</div>
              </div>
              <Badge tone="navy">{filtered.length} shown</Badge>
            </div>

            {filtered.length ? (
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 960 }}>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Customer</th>
                      <th>Intent</th>
                      <th>At risk</th>
                      <th>Trust lane</th>
                      <th>Status</th>
                      <th>Sentiment</th>
                      <th>Updated</th>
                      <th aria-label="Open ticket" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((ticket) => (
                      <tr
                        key={ticket.id}
                        className="ticket-row"
                        tabIndex={0}
                        role="link"
                        aria-label={`Open ${ticket.subject || ticket.id}`}
                        onClick={() => openTicket(ticket)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openTicket(ticket)
                          }
                        }}
                      >
                        <td>
                          <div className="ticket-subject">{ticket.subject || 'Untitled ticket'}</div>
                          <div className="ticket-meta">
                            <span className="mono">{ticket.id}</span>
                            <span>·</span>
                            <span>{ticket.channel || 'Paytm Inbox'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="ticket-customer">
                            <Avatar name={ticket.customer_name || 'Unknown'} size={30} />
                            <div>
                              <strong className="small">
                                {ticket.customer_name || 'Unknown customer'}
                              </strong>
                              <div className="tiny muted">{ticket.customer_segment || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge tone={intentTone(ticket.intent)}>{intentLabel(ticket.intent)}</Badge>
                        </td>
                        <td>
                          <Money value={Number(ticket.amount_at_risk) || 0} />
                        </td>
                        <td>
                          <LaneBadge lane={ticket.lane} />
                        </td>
                        <td>
                          <StatusBadge status={ticket.status} />
                        </td>
                        <td>
                          <Sentiment value={ticket.sentiment} />
                        </td>
                        <td>
                          <span className="tiny muted">{formatWhen(ticket.updated_at)}</span>
                        </td>
                        <td className="text-right">
                          <ChevronRight size={15} className="muted" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={SearchX}
                title={tickets.length ? 'No tickets match this view' : 'No tickets yet'}
                description={
                  tickets.length
                    ? 'Adjust the status, intent, or search term to bring tickets back.'
                    : 'Reset the demo data to reload the eight seeded scenarios.'
                }
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={tickets.length ? clearFilters : load}
                  >
                    {tickets.length ? 'Clear filters' : 'Reload inbox'}
                  </Button>
                }
              />
            )}
          </Card>

          <div className="two-col mt-4">
            <Card>
              <div className="card-title">
                <div>
                  <h3>Demo run order</h3>
                  <div className="card-sub">Four tickets that show the gate end to end.</div>
                </div>
                <Badge tone="cyan" dot>
                  Guided flow
                </Badge>
              </div>
              <div className="list">
                {DEMO_STEPS.map((step, index) => (
                  <Link
                    to={`/tickets/${step.id}`}
                    className="list-item ticket-row"
                    key={step.id}
                  >
                    <Badge tone="gray" className="mono">
                      {index + 1}
                    </Badge>
                    <div className="flex-1" style={{ minWidth: 0 }}>
                      <div className="small truncate">
                        <strong>{step.title}</strong>
                      </div>
                      <div className="tiny muted">{step.detail}</div>
                    </div>
                    <LaneBadge lane={step.lane} />
                  </Link>
                ))}
              </div>
            </Card>

            <Card>
              <div className="card-title">
                <div>
                  <h3>How the gate works</h3>
                  <div className="card-sub">Deterministic checks before any money moves.</div>
                </div>
                <Badge tone="navy">Bounded authority</Badge>
              </div>
              <div className="trace-list">
                {GATE_STEPS.map((step, index) => (
                  <div className="trace-item" key={step.title}>
                    <span className="trace-dot done" />
                    <div className="trace-head">
                      <span className="trace-title">{step.title}</span>
                      <span className="trace-time">
                        STEP {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="trace-detail">{step.detail}</div>
                  </div>
                ))}
              </div>
              <div className="callout mt-4 tiny muted">
                Deny wins over review. Review wins over auto. Every decision cites the policy
                version that licensed it.
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  )
}
