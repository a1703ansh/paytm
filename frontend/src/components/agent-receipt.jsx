import {
  AlertTriangle,
  Braces,
  Cpu,
  Fingerprint,
  Scale,
  ShieldCheck,
  Terminal,
  Wrench
} from 'lucide-react'
import { Badge, LaneBadge } from './ui'

function formatNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-IN') : '—'
}

function formatLatency(value) {
  if (value == null || value === '') return '—'
  return `${formatNumber(value)} ms`
}

function formatJson(value) {
  if (value == null) return '—'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function shortHash(value) {
  const hash = String(value || '')
  if (!hash) return 'No input hash'
  if (hash.length <= 26) return hash
  return `${hash.slice(0, 16)}…${hash.slice(-8)}`
}

function receiptBadge(run) {
  if (run?.status === 'failed') return { tone: 'red', label: 'Failed', dot: true }
  if (run?.fallback_used || run?.status === 'fallback') {
    return { tone: 'amber', label: 'Fallback', dot: true }
  }
  if (run?.mode === 'live') return { tone: 'green', label: 'Live AI', dot: true }
  return { tone: 'gray', label: 'Scripted' }
}

const executionTones = {
  verified: 'green',
  executed: 'navy',
  pending: 'amber',
  pending_approval: 'amber',
  denied: 'red',
  failed: 'red'
}

function Meta({ label, value, mono = false }) {
  return (
    <div className="receipt-meta-item">
      <div className="receipt-meta-label">{label}</div>
      <div className={`receipt-meta-value ${mono ? 'mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}

export function AgentReceipt({ run }) {
  if (!run) {
    return (
      <section className="panel agent-receipt">
        <div className="panel-head">
          <div>
            <h2>Agent receipt</h2>
            <div className="card-sub">Model, tools, policy, and sandbox proof.</div>
          </div>
        </div>
        <div className="panel-body">
          <div className="receipt-empty">
            <Terminal size={17} />
            <div>
              <strong className="small">No live AI receipt yet</strong>
              <p className="tiny muted">
                Run the agent in Live AI mode to capture model, latency, tokens, tool calls,
                and policy.
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const badge = receiptBadge(run)
  const tools = Array.isArray(run.tool_calls) ? run.tool_calls : []
  const policy = run.policy || {}
  const reasons = Array.isArray(policy.reasons) ? policy.reasons : []
  const execution = run.execution || {}
  const executionTone = executionTones[execution.status] || 'gray'
  return (
    <section className="panel agent-receipt">
      <div className="panel-head">
        <div>
          <h2>Agent receipt</h2>
          <div className="card-sub">Model, tools, policy, and sandbox proof.</div>
        </div>
        <Badge tone={badge.tone} dot={badge.dot}>{badge.label}</Badge>
      </div>

      <div className="panel-body agent-receipt-body">
        <div className="receipt-model">
          <div className="receipt-model-line">
            <Cpu size={14} />
            <span>{run.model || 'Model not reported'}</span>
          </div>
          {run.status === 'fallback' ? (
            <p className="tiny" style={{ color: 'var(--ink-2)' }}>
              The live model call did not complete. The scripted agent completed the ticket;
              this receipt records the live attempt.
            </p>
          ) : run.fallback_used ? (
            <p className="tiny" style={{ color: 'var(--ink-2)' }}>
              The primary model was unavailable. This run completed with the fallback model
              {run.model ? ` ${run.model}` : ''}.
            </p>
          ) : null}
          <div className="receipt-meta">
            <Meta label="Provider" value={run.provider} />
            <Meta label="Prompt" value={run.prompt_version} />
            <Meta label="Latency" value={formatLatency(run.latency_ms)} />
            <Meta
              label="Tokens"
              value={`${formatNumber(run.input_tokens)} in · ${formatNumber(run.output_tokens)} out`}
            />
          </div>
        </div>

        <div className="receipt-section">
          <div className="receipt-section-head">
            <span className="receipt-section-title">
              <Wrench size={13} /> Tool calls
            </span>
            <Badge tone="gray">{tools.length}</Badge>
          </div>
          {tools.length ? (
            <div className="receipt-tools">
              {tools.map((tool, index) => (
                <div className="receipt-tool" key={`${tool?.name || 'tool'}-${index}`}>
                  <div className="receipt-tool-head">
                    <span className="receipt-tool-name">{tool?.name || 'Unnamed tool'}</span>
                    <span className="row gap-2">
                      <Badge tone={tool?.ok === false ? 'red' : 'green'}>
                        {tool?.ok === false ? 'Failed' : 'OK'}
                      </Badge>
                      <span className="receipt-tool-latency">{formatLatency(tool?.latency_ms)}</span>
                    </span>
                  </div>
                  {tool?.result_summary ? (
                    <p className="receipt-tool-summary">{tool.result_summary}</p>
                  ) : null}
                  {tool?.arguments != null ? (
                    <details className="receipt-tool-args">
                      <summary>Arguments</summary>
                      <pre className="receipt-json">{formatJson(tool.arguments)}</pre>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="tiny muted">No tool calls recorded for this run.</p>
          )}
        </div>

        <div className="receipt-section">
          <div className="receipt-section-title">Model rationale</div>
          <p className="receipt-text">{run.rationale || 'No rationale returned.'}</p>
        </div>

        <div className="receipt-section">
          <div className="receipt-section-head">
            <span className="receipt-section-title">
              <Scale size={13} /> Policy verdict
            </span>
            {policy.lane ? <LaneBadge lane={policy.lane} /> : <Badge tone="gray">No lane</Badge>}
          </div>
          <div className="receipt-policy-meta">
            <span>Rule <span className="mono">{policy.rule_id || '—'}</span></span>
            <span>Version <span className="mono">{policy.policy_version || '—'}</span></span>
          </div>
          {reasons.length ? (
            <ul className="receipt-reasons">
              {reasons.map((reason, index) => (
                <li key={`${typeof reason === 'string' ? reason : index}-${index}`}>
                  {typeof reason === 'string' ? reason : formatJson(reason)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="tiny muted">No policy reasons returned.</p>
          )}
        </div>

        <div className="receipt-section">
          <div className="receipt-section-head">
            <span className="receipt-section-title">
              <ShieldCheck size={13} /> Sandbox execution
            </span>
            {execution.status ? (
              <Badge tone={executionTone} dot>{execution.status}</Badge>
            ) : (
              <Badge tone="gray">Not executed</Badge>
            )}
          </div>
          <div className="receipt-exec">
            <span className="tiny muted">Reference</span>
            <span className="mono small">{execution.reference || '—'}</span>
          </div>
          {execution.detail ? <p className="receipt-text">{execution.detail}</p> : null}
        </div>

        {run.error ? (
          <div className={`callout callout-${run.status === 'failed' ? 'red' : 'amber'}`}>
            <div className="row gap-2 items-start">
              <AlertTriangle size={13} style={{ flex: '0 0 auto', marginTop: 2 }} />
              <span className="tiny">{run.error}</span>
            </div>
          </div>
        ) : null}

        <details className="receipt-proposal">
          <summary>
            <Braces size={13} /> Raw proposal JSON
          </summary>
          <pre className="receipt-json">{formatJson(run.proposal)}</pre>
        </details>

        <div className="receipt-footer">
          <span className="receipt-hash" title={run.input_hash || ''}>
            <Fingerprint size={11} />
            {shortHash(run.input_hash)}
          </span>
          {run.id ? <span className="mono tiny muted">{run.id}</span> : null}
        </div>
      </div>
    </section>
  )
}
