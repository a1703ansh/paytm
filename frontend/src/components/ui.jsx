import { useId } from 'react'
import { Loader2, Inbox, ArrowUpRight } from 'lucide-react'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  ...props
}) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      {...props}
      disabled={loading || disabled}
    >
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  )
}

export function Card({ children, className = '', padded = true, tone, ...props }) {
  return (
    <section
      className={`card ${padded ? 'card-padded' : ''} ${tone ? `card-${tone}` : ''} ${className}`}
      {...props}
    >
      {children}
    </section>
  )
}

export function Badge({ children, tone = 'gray', dot = false, className = '' }) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  )
}

export function StatCard({ label, value, delta, hint, icon: Icon, tone = 'cyan', spark }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon ? (
          <span className="stat-icon">
            <Icon size={17} />
          </span>
        ) : null}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {delta ? <span className="stat-delta">{delta}</span> : null}
        {hint ? <span className="stat-hint">{hint}</span> : null}
      </div>
      {spark?.length ? (
        <div className="mini-spark" aria-hidden="true">
          {spark.map((n, i) => (
            <span key={i} style={{ height: `${Math.max(12, n)}%` }} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function Progress({ value = 0, tone = 'cyan' }) {
  const clampedValue = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="progress">
      <span
        className={`progress-fill progress-${tone}`}
        style={{ transform: `scaleX(${clampedValue / 100})` }}
      />
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  )
}

const laneMap = {
  auto: { label: 'Auto', tone: 'green' },
  review: { label: 'Review', tone: 'amber' },
  deny: { label: 'Hard deny', tone: 'red' }
}

export function LaneBadge({ lane }) {
  if (!lane) return <Badge tone="gray">Not run</Badge>
  const item = laneMap[lane] || { label: lane, tone: 'gray' }
  return <Badge tone={item.tone} dot>{item.label}</Badge>
}

const statusMap = {
  open: { label: 'Open', tone: 'cyan' },
  running: { label: 'Agent running', tone: 'cyan' },
  waiting_human: { label: 'Needs approval', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'green' },
  escalated: { label: 'Escalated', tone: 'red' },
  blocked: { label: 'Blocked', tone: 'red' }
}

export function StatusBadge({ status }) {
  const item = statusMap[status] || { label: status || 'Unknown', tone: 'gray' }
  return <Badge tone={item.tone} dot>{item.label}</Badge>
}

export function Money({ value, currency = 'INR', compact = false }) {
  const amount = Number(value || 0)
  if (compact) {
    let out
    if (amount >= 10000000) out = `₹${(amount / 10000000).toFixed(2)}Cr`
    else if (amount >= 100000) out = `₹${(amount / 100000).toFixed(1)}L`
    else if (amount >= 1000) out = `₹${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}K`
    else out = `₹${amount.toLocaleString('en-IN')}`
    return <span className="money">{out}</span>
  }
  return (
    <span className="money">
      {new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(amount)}
    </span>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="spinner-wrap">
      <Loader2 size={22} className="spin" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={24} />
      </div>
      <h3>{title}</h3>
      {description ? <p className="muted">{description}</p> : null}
      {action}
    </div>
  )
}

export function IconButton({ label, icon: Icon, className = '', ...props }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      <Icon size={17} />
    </button>
  )
}

export function Avatar({ name = '?', size = 34 }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  )
}

export function TooltipLabel({ label, hint }) {
  const tooltipId = useId()
  return (
    <span className="tooltip-label">
      {label}
      {hint ? (
        <span
          className="tooltip"
          tabIndex={0}
          aria-label={`About ${label}`}
          aria-describedby={tooltipId}
        >
          <span className="info-dot" aria-hidden="true">
            i
          </span>
          <span className="tooltip-content" role="tooltip" id={tooltipId}>
            {hint}
          </span>
        </span>
      ) : null}
    </span>
  )
}

export function Trend({ value, positive = true }) {
  return (
    <span className={`trend ${positive ? 'trend-up' : 'trend-down'}`}>
      <ArrowUpRight size={13} />
      {value}
    </span>
  )
}
