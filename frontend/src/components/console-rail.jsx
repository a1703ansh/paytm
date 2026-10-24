import { Check, Lock, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge, Card } from './ui'

const briefSteps = [
  { title: 'Evidence gathered', detail: 'Order, payment, customer, and conversation are linked.' },
  { title: 'Policy refused auto-lane', detail: 'The proposed action sits outside the licensed ceiling.' },
  { title: 'Human decision with context', detail: 'A full brief, not a transcript. Approve or reject once.' }
]

const previewLines = [
  { label: 'Issue', value: 'Damaged item · O-4821' },
  { label: 'Customer', value: 'Meera Iyer · VIP · LTV ₹48.2K' },
  { label: 'Evidence', value: 'Order, payment, photo verified' },
  { label: 'AI did', value: 'Policy v3 R2 · entitlement ₹2,999' },
  { label: 'Recommendation', value: 'Refund ₹15,000 → human' }
]

export function ConsoleRail() {
  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      <Card>
        <div className="card-title">
          <h2>Why this brief exists</h2>
          <Sparkles size={16} className="muted" />
        </div>
        <div className="list">
          {briefSteps.map((step, index) => (
            <div className="list-item" key={step.title} style={{ alignItems: 'flex-start' }}>
              <Badge tone="navy">{String(index + 1).padStart(2, '0')}</Badge>
              <div>
                <strong style={{ fontSize: 12 }}>{step.title}</strong>
                <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.5 }}>{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="card-title">
          <h2>Anatomy of a brief</h2>
          <Badge tone="amber">Example</Badge>
        </div>
        <div className="callout" style={{ padding: '4px 12px' }}>
          {previewLines.map((line, index) => (
            <div
              key={line.label}
              className="row between items-start gap-3"
              style={{
                padding: '8px 0',
                borderBottom: index === previewLines.length - 1 ? '0' : '1px solid var(--line)'
              }}
            >
              <span className="brief-label" style={{ margin: 0 }}>{line.label}</span>
              <span className="tiny" style={{ textAlign: 'right', maxWidth: '64%' }}>{line.value}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="row gap-2">
          <ShieldCheck size={16} />
          <h2>Trust contract</h2>
        </div>
        <p className="small" style={{ marginTop: 8 }}>
          Approval resumes the same plan. Your edit becomes a labeled policy signal.
        </p>
        <div className="divider" />
        <div className="trust-row">
          <span className="trust-row-label"><Check size={13} /> Approval scope</span>
          <span className="trust-row-value">Same plan</span>
        </div>
        <div className="trust-row">
          <span className="trust-row-label"><Lock size={13} /> Write access</span>
          <span className="trust-row-value">Executor only</span>
        </div>
      </Card>
    </div>
  )
}
