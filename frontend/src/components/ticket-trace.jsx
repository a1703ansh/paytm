import { Lock, ShieldCheck } from 'lucide-react'
import { Badge, EmptyState } from './ui'

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function dotClass(status) {
  const value = String(status || '').toLowerCase()
  if (['done', 'verified', 'executed', 'success', 'complete'].includes(value)) return 'done'
  if (['blocked', 'denied', 'failed', 'rejected'].includes(value)) return 'blocked'
  if (['waiting', 'pending', 'pending_approval', 'review'].includes(value)) return 'waiting'
  return ''
}

function titleFor(item) {
  if (item?.title) return item.title
  if (item?.step) {
    return String(item.step)
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }
  return 'Trace step'
}

export function TicketTrace({ trace, policyVersion }) {
  const list = Array.isArray(trace) ? trace : []
  const versionLabel = policyVersion
    ? String(policyVersion).startsWith('Policy')
      ? policyVersion
      : `Policy ${policyVersion}`
    : 'Policy v3'

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Agent trace</h2>
          <div className="card-sub">Everything read, proposed, licensed, and verified.</div>
        </div>
        <Badge tone="navy">{versionLabel}</Badge>
      </div>
      <div className="panel-body">
        {list.length ? (
          <div className="trace-list">
            {list.map((item, index) => {
              const latency = item?.latency_ms != null ? `${item.latency_ms}ms` : ''
              const time = formatTime(item?.ts || item?.timestamp || item?.created_at)
              const meta = [time, latency].filter(Boolean).join(' · ')
              return (
                <div className="trace-item" key={`${item?.step || item?.title || 'trace'}-${index}`}>
                  <span className={`trace-dot ${dotClass(item?.status)}`} />
                  <div className="trace-head">
                    <span className="trace-title">{titleFor(item)}</span>
                    {meta ? <span className="trace-time">{meta}</span> : null}
                  </div>
                  {item?.detail ? <div className="trace-detail">{item.detail}</div> : null}
                  {item?.tool ? <span className="trace-tool">{item.tool}</span> : null}
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="No trace yet"
            description="Run the agent to see evidence gathering, policy licensing, execution, and read-back verification."
          />
        )}

        <div className="callout callout-cyan" style={{ marginTop: 16 }}>
          <div className="row between wrap gap-2">
            <div className="row gap-2">
              <Lock size={14} />
              <strong style={{ fontSize: 11.5 }}>Write firewall</strong>
            </div>
            <Badge tone="green" dot>Executor scoped</Badge>
          </div>
          <p className="tiny" style={{ marginTop: 6, lineHeight: 1.55 }}>
            The model has read + propose tools only. The executor holds scoped write credentials.
          </p>
        </div>
      </div>
    </section>
  )
}
