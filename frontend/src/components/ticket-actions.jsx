import { ChevronRight, Zap } from 'lucide-react'
import { Badge, EmptyState, LaneBadge, Money } from './ui'

const statusMeta = {
  proposed: { label: 'Proposed', tone: 'cyan' },
  pending_approval: { label: 'Needs approval', tone: 'amber' },
  executed: { label: 'Executed', tone: 'navy' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'gray' },
  undone: { label: 'Undone', tone: 'amber' },
  denied: { label: 'Denied', tone: 'red' },
  failed: { label: 'Failed', tone: 'red' }
}

const labels = {
  issue_refund: 'Issue refund',
  refund: 'Issue refund',
  issue_replacement: 'Issue replacement',
  replace_item: 'Replace item',
  send_tracking: 'Send tracking update',
  send_tracking_update: 'Send tracking update',
  create_return_label: 'Create return label',
  retry_payment: 'Retry payment',
  resend_payment_link: 'Resend payment link',
  resend_receipt: 'Resend receipt',
  cancel_order: 'Cancel order',
  update_address: 'Update address',
  escalate: 'Escalate to human',
  deny: 'Deny request'
}

export function actionStatusMeta(status) {
  return statusMeta[status] || { label: status || 'Unknown', tone: 'gray' }
}

export function actionLabel(type) {
  if (!type) return 'Action'
  if (labels[type]) return labels[type]
  return String(type)
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function actionAmount(action) {
  const raw = action?.params?.amount ?? action?.amount ?? action?.params?.value
  const amount = Number(raw)
  return Number.isFinite(amount) ? amount : null
}

export function TicketActionsPanel({ actions, selectedId, onSelect }) {
  const list = Array.isArray(actions) ? actions : []

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Actions</h2>
        <Badge tone="navy">{list.length}</Badge>
      </div>
      <div className="panel-body">
        {list.length ? (
          <div className="list">
            {list.map((action, index) => {
              const meta = actionStatusMeta(action?.status)
              const amount = actionAmount(action)
              const selected = action?.id === selectedId
              return (
                <button
                  key={action?.id || index}
                  type="button"
                  className="list-item"
                  onClick={() => onSelect?.(action?.id)}
                  aria-pressed={selected}
                  style={{
                    width: '100%',
                    border: 0,
                    borderBottom: index === list.length - 1 ? '0' : '1px solid var(--line)',
                    alignItems: 'stretch',
                    flexDirection: 'column',
                    gap: 0,
                    textAlign: 'left',
                    background: selected ? 'var(--paper)' : 'transparent',
                    borderRadius: 8,
                    padding: '12px 10px',
                    cursor: 'pointer'
                  }}
                >
                  <div className="row between wrap gap-2">
                    <div className="row gap-2">
                      <span className="mono tiny muted">{action?.id || '—'}</span>
                      <strong style={{ fontSize: 12 }}>{actionLabel(action?.type)}</strong>
                    </div>
                    <div className="row gap-2">
                      {amount != null ? <Money value={amount} /> : null}
                      <Badge tone={meta.tone} dot>{meta.label}</Badge>
                    </div>
                  </div>
                  <div className="row gap-2 wrap tiny muted" style={{ marginTop: 5 }}>
                    <LaneBadge lane={action?.lane} />
                    <span>Rule <span className="mono">{action?.rule_id || '—'}</span></span>
                    <span>Policy <span className="mono">{action?.policy_version || '—'}</span></span>
                    <span>Ref <span className="mono">{action?.reference || 'pending'}</span></span>
                    <span className="row gap-1 ml-auto">
                      Passport <ChevronRight size={12} />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={Zap}
            title="No actions proposed"
            description="Run the agent to produce a policy-bound action and its passport."
          />
        )}
      </div>
    </section>
  )
}
