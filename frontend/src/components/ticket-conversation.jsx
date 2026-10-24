import { Check, ShieldCheck, Sparkles } from 'lucide-react'
import { Avatar, Badge, EmptyState, Money } from './ui'

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function evidenceLabel(evidence) {
  if (typeof evidence === 'string') return evidence
  return evidence?.label || evidence?.value || 'Evidence'
}

function MessageBubble({ message, customerName }) {
  const role = message?.role === 'agent' || message?.role === 'customer' ? message.role : 'system'
  const created = formatTime(message?.created_at)
  const evidence = Array.isArray(message?.evidence) ? message.evidence : []

  if (role === 'system') {
    return (
      <div style={{ width: '100%' }}>
        <div className="bubble system" style={{ width: '100%' }}>
          <div className="row gap-2">
            <ShieldCheck size={13} />
            <span>{message?.content || 'System event'}</span>
          </div>
          <div className="bubble-meta">
            <span>Policy / system</span>
            {created ? <span>· {created}</span> : null}
          </div>
        </div>
      </div>
    )
  }

  const isAgent = role === 'agent'
  const name = isAgent ? message?.author || 'Resolve agent' : customerName

  return (
    <div className={`bubble-row ${isAgent ? 'agent' : ''}`}>
      <Avatar name={isAgent ? 'Resolve agent' : customerName} size={28} />
      <div className={`bubble ${isAgent ? 'agent' : 'customer'}`}>
        <div>{message?.content || ''}</div>
        {evidence.length ? (
          <div className="evidence-chips">
            {evidence.map((item, index) => (
              <span
                key={`${evidenceLabel(item)}-${index}`}
                className="evidence-chip"
                title={typeof item === 'string' ? item : item?.source || ''}
              >
                <Check size={9} />
                {evidenceLabel(item)}
              </span>
            ))}
          </div>
        ) : null}
        <div className="bubble-meta">
          <span>{name}</span>
          {created ? <span>· {created}</span> : null}
        </div>
      </div>
    </div>
  )
}

export function TicketConversation({ ticket }) {
  const messages = Array.isArray(ticket?.messages) ? ticket.messages : []
  const resolution = ticket?.resolution
  const customerName = ticket?.customer?.name || 'Customer'
  const verified = resolution?.verified !== false
  const reversed = resolution?.reversed === true
  const valueSaved = resolution?.value_saved
  const valueHandled = resolution?.value_handled
  const value = valueSaved != null ? valueSaved : valueHandled
  const valueLabel = valueSaved != null ? 'Value saved' : 'Value handled'

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: 'wrap' }}>
        <h2>Conversation</h2>
        <div className="row gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
          <Badge tone="cyan">{ticket?.channel || 'Paytm Inbox'}</Badge>
          <Badge tone="green" dot>Evidence-bound replies</Badge>
        </div>
      </div>
      <div className="panel-body">
        {messages.length ? (
          <div className="chat-thread">
            {messages.map((message, index) => (
              <MessageBubble
                key={message?.id || `${message?.role || 'message'}-${index}`}
                message={message}
                customerName={customerName}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No messages yet"
            description="Run the Resolve agent to gather context and draft an evidence-bound reply."
          />
        )}

        {resolution ? (
          <div className={`callout ${reversed ? 'callout-amber' : 'callout-mint'}`} style={{ marginTop: 16 }}>
            <div className="row between wrap gap-2">
              <div className="row gap-2">
                <Check size={15} />
                <strong style={{ fontSize: 12.5 }}>{reversed ? 'Resolution reversed' : 'Verified resolution'}</strong>
              </div>
              <Badge tone={reversed ? 'amber' : verified ? 'green' : 'gray'} dot>
                {reversed ? 'Reversed' : verified ? 'Verified' : 'Unverified'}
              </Badge>
            </div>
            <p className="small" style={{ marginTop: 6 }}>
              {resolution.summary || resolution.detail || 'The action was executed and read back from the source of truth.'}
            </p>
            {!reversed ? (
              <div className="row wrap gap-4" style={{ marginTop: 11 }}>
                {value != null ? (
                  <div>
                    <div className="passport-label">{valueLabel}</div>
                    <div className="passport-value">
                      <Money value={value} />
                    </div>
                  </div>
                ) : null}
                <div>
                  <div className="passport-label">Minutes saved</div>
                  <div className="passport-value mono">
                    {resolution.minutes_saved != null ? `${resolution.minutes_saved}m` : '—'}
                  </div>
                </div>
                {resolution.reference ? (
                  <div>
                    <div className="passport-label">Reference</div>
                    <div className="passport-value mono">{resolution.reference}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
