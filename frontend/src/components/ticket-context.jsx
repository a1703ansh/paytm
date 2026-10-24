import { Badge, Card, Money, Avatar } from './ui'

function formatDate(value) {
  if (!value) return '—'
  const text = String(value)
  if (!/\d{4}/.test(text)) return text
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function humanize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function paymentTone(status) {
  const value = String(status || '').toLowerCase()
  if (!value) return 'gray'
  if (/captur|paid|success|settled|complete/.test(value)) return 'green'
  if (/pending|authoriz|process|initiat/.test(value)) return 'amber'
  if (/fail|refund|void|cancel/.test(value)) return 'red'
  return 'gray'
}

function riskTone(risk) {
  const value = Number(risk)
  if (!Number.isFinite(value)) return 'gray'
  if (value >= 70) return 'red'
  if (value >= 40) return 'amber'
  return 'green'
}

function Meta({ label, children }) {
  return (
    <div>
      <div className="passport-label">{label}</div>
      <div className="passport-value" style={{ marginTop: 2 }}>{children}</div>
    </div>
  )
}

export function TicketContextStrip({ ticket }) {
  const customer = ticket?.customer || {}
  const order = ticket?.order || {}
  const shipment = order.shipment || ticket?.shipment || {}
  const items = Array.isArray(order.items) ? order.items : []
  const flags = Array.isArray(customer.flags) ? customer.flags : []
  const risk = ticket?.risk ?? customer.risk
  const tracking = shipment.tracking || shipment.awb || order.tracking || order.tracking_id || ticket?.tracking
  const eta = shipment.eta || shipment.estimated_delivery || order.eta || order.expected_delivery
  const paymentStatus = order.payment_status || order.payment?.status || ticket?.payment?.status || ticket?.payment_status
  const customerName = customer.name || 'Unknown customer'
  const segment = customer.segment || ticket?.customer_segment || 'Unsegmented'

  return (
    <Card padded={false}>
      <div style={{ display: 'grid', gap: 14, padding: '16px 18px' }}>
        <div className="row between wrap gap-3">
          <div className="row gap-3">
            <Avatar name={customerName} size={42} />
            <div>
              <div className="row gap-2 wrap">
                <strong style={{ fontSize: 14 }}>{customerName}</strong>
                <Badge tone="navy">{segment}</Badge>
              </div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                {customer.email || customer.phone || `Customer ${customer.id || '—'}`}
              </div>
            </div>
          </div>
          <div className="row gap-2 wrap">
            {flags.length ? flags.map((flag, index) => (
              <Badge
                key={`${typeof flag === 'string' ? flag : flag?.label || flag?.name || index}`}
                tone="amber"
                dot
              >
                {typeof flag === 'string' ? flag : flag?.label || flag?.name || 'Flag'}
              </Badge>
            )) : <Badge tone="green" dot>No flags</Badge>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(124px, 1fr))', gap: 12 }}>
          <Meta label="Lifetime value">
            {customer.ltv != null ? <Money value={customer.ltv} /> : '—'}
          </Meta>
          <Meta label="Risk score">
            <Badge tone={riskTone(risk)}>{risk != null ? risk : '—'}</Badge>
          </Meta>
          <Meta label="Order total">
            {order.total != null ? <Money value={order.total} currency={order.currency || 'INR'} /> : '—'}
          </Meta>
          <Meta label="Placed">
            <span className="small">{formatDate(order.placed_at)}</span>
          </Meta>
          <Meta label="Payment">
            <Badge tone={paymentTone(paymentStatus)}>{humanize(paymentStatus) || 'Unknown'}</Badge>
          </Meta>
          <Meta label="Tracking">
            <span className="mono small" title={tracking || ''}>{tracking || '—'}</span>
          </Meta>
          <Meta label="ETA">
            <span className="small">{formatDate(eta)}</span>
          </Meta>
        </div>

        <div className="row items-start gap-2 wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 11 }}>
          <span className="passport-label" style={{ paddingTop: 3 }}>Items</span>
          <div className="row gap-2 wrap flex-1">
            {items.length ? items.map((item, index) => (
              <span key={`${item?.name || index}-${index}`} className="badge badge-gray">
                {item?.name || `Item ${index + 1}`}
                {item?.qty ? ` × ${item.qty}` : ''}
              </span>
            )) : <span className="tiny muted">No line items</span>}
          </div>
        </div>
      </div>
    </Card>
  )
}
