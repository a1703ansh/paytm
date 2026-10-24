import { Lock, ShieldCheck, Undo2 } from 'lucide-react'
import { Badge, Button, EmptyState, Money } from './ui'
import { actionAmount, actionLabel, actionStatusMeta } from './ticket-actions'

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function truncateKey(value) {
  const key = String(value || '')
  if (!key) return '—'
  if (key.length <= 22) return key
  return `${key.slice(0, 12)}…${key.slice(-6)}`
}

function humanize(value) {
  if (!value) return '—'
  return String(value)
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function compensationLabel(compensation) {
  if (!compensation) return 'None'
  if (typeof compensation === 'string') return humanize(compensation)
  const type = humanize(compensation.type)
  if (compensation.window_hours != null) return `${type} · ${compensation.window_hours}h window`
  return type
}

function PassportRow({ label, children }) {
  return (
    <div className="passport-row">
      <div className="passport-label">{label}</div>
      <div className="passport-value">{children}</div>
    </div>
  )
}

function evidenceText(item) {
  if (typeof item === 'string') return item
  return item?.label || item?.name || 'Evidence'
}

function evidenceValue(item) {
  if (typeof item === 'string') return ''
  return item?.value || ''
}

export function TicketPassport({ action, actions, onSelect, onUndo, undoing = false }) {
  const list = Array.isArray(actions) ? actions : []
  const amount = actionAmount(action)
  const meta = actionStatusMeta(action?.status)
  const evidence = Array.isArray(action?.evidence) ? action.evidence : []
  const confidence = Number(action?.confidence)
  const confidenceLabel = Number.isFinite(confidence)
    ? `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%`
    : '—'
  const undoable = ['issue_refund', 'create_replacement', 'create_return']
  const canUndo = undoable.includes(action?.type) && ['executed', 'verified'].includes(action?.status)
  const undoLabel = action?.type === 'issue_refund'
    ? 'refund'
    : action?.type === 'create_replacement'
      ? 'replacement'
      : 'return'
  const undoWindow = Number(action?.compensation?.window_hours) || 24

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Action passport</h2>
        <Badge tone="navy">Policy artifact</Badge>
      </div>
      <div className="panel-body">
        {list.length > 1 ? (
          <div className="segmented" style={{ display: 'flex', maxWidth: '100%', overflowX: 'auto', marginBottom: 12 }}>
            {list.map((item, index) => (
              <button
                key={item?.id || index}
                type="button"
                className={item?.id === action?.id ? 'active' : ''}
                onClick={() => onSelect?.(item?.id)}
                aria-pressed={item?.id === action?.id}
              >
                {item?.id || `A-${index + 1}`}
              </button>
            ))}
          </div>
        ) : null}

        {action ? (
          <>
            <div className="passport">
              <div className="passport-head">
                <div>
                  <div className="passport-label">Action</div>
                  <div className="row gap-2 wrap" style={{ marginTop: 3 }}>
                    <strong style={{ fontSize: 12.5 }}>{actionLabel(action.type)}</strong>
                    {amount != null ? <Money value={amount} /> : null}
                  </div>
                  <div className="mono tiny muted" style={{ marginTop: 2 }}>{action.id || '—'}</div>
                </div>
                <Badge tone={meta.tone} dot>{meta.label}</Badge>
              </div>

              <div className="passport-grid">
                <PassportRow label="Action ID">
                  <span className="passport-code">{action.id || '—'}</span>
                </PassportRow>
                <PassportRow label="Policy version">
                  <span className="passport-code">{action.policy_version || '—'}</span>
                </PassportRow>
                <PassportRow label="Rule">
                  <span className="passport-code">{action.rule_id || '—'}</span>
                </PassportRow>
                <PassportRow label="Risk">
                  <span className="mono">{action.risk != null ? `${action.risk} / 100` : '—'}</span>
                </PassportRow>
                <PassportRow label="Confidence">
                  <span className="mono">{confidenceLabel}</span>
                </PassportRow>
                <PassportRow label="Idempotency key">
                  <span className="passport-code" title={action.idempotency_key || ''}>
                    {truncateKey(action.idempotency_key)}
                  </span>
                </PassportRow>
                <PassportRow label="Compensation">
                  {compensationLabel(action.compensation)}
                </PassportRow>
                <PassportRow label="Reference">
                  <span className="passport-code">{action.reference || 'Not issued'}</span>
                </PassportRow>
                <PassportRow label="Created">
                  <span className="small">{formatDateTime(action.created_at)}</span>
                </PassportRow>
                <PassportRow label="Executed">
                  <span className="small">{action.executed_at ? formatDateTime(action.executed_at) : '—'}</span>
                </PassportRow>
              </div>

              <div style={{ padding: '12px 14px', borderTop: '1px dashed var(--line-strong)' }}>
                <div className="passport-label" style={{ marginBottom: 6 }}>Evidence</div>
                {evidence.length ? (
                  <div className="list">
                    {evidence.map((item, index) => (
                      <div
                        key={`${evidenceText(item)}-${index}`}
                        className="row between items-start wrap gap-2"
                        style={{ padding: '7px 0', borderBottom: index === evidence.length - 1 ? '0' : '1px solid var(--line)' }}
                      >
                        <div>
                          <div className="small" style={{ fontWeight: 650 }}>{evidenceText(item)}</div>
                          {evidenceValue(item) ? (
                            <div className="mono tiny muted" style={{ marginTop: 1 }}>{evidenceValue(item)}</div>
                          ) : null}
                        </div>
                        {typeof item === 'object' && item?.source ? (
                          <span className="trace-tool">{item.source}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="tiny muted">No evidence attached.</p>
                )}
              </div>
            </div>

            {action.status === 'pending_approval' ? (
              <div className="callout callout-amber" style={{ marginTop: 12 }}>
                <div className="row gap-2">
                  <Lock size={13} />
                  <span className="tiny">Awaiting a human decision. Use the case brief above to approve or reject.</span>
                </div>
              </div>
            ) : null}

            {canUndo ? (
              <div style={{ marginTop: 12 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Undo2}
                  loading={undoing}
                  onClick={() => onUndo?.(action.id)}
                  className="w-full"
                >
                  Undo {undoLabel} within {undoWindow}h
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="No action passport"
            description="Run the agent to generate a passport."
          />
        )}

        <div className="callout callout-cyan" style={{ marginTop: 14 }}>
          <div className="row gap-2">
            <ShieldCheck size={15} />
            <strong style={{ fontSize: 11.5 }}>No passport, no execution.</strong>
          </div>
          <div className="row gap-2 tiny" style={{ marginTop: 6 }}>
            <Lock size={12} />
            <span>Write firewall active</span>
            <Badge tone="green" dot>Scoped</Badge>
          </div>
        </div>
      </div>
    </section>
  )
}
