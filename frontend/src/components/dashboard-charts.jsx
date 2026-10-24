import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Badge } from './ui'

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

const AREA_META = {
  auto: { label: 'Auto', color: 'var(--cyan)' },
  review: { label: 'Review', color: 'var(--mint)' },
  blocked: { label: 'Blocked', color: 'var(--red)' }
}

const DONUT_META = {
  auto: { label: 'Auto', tone: 'green', color: 'var(--mint)' },
  review: { label: 'Review', tone: 'amber', color: 'var(--amber)' },
  deny: { label: 'Blocked', tone: 'red', color: 'var(--red)' },
  blocked: { label: 'Blocked', tone: 'red', color: 'var(--red)' }
}

function intentLabel(intent) {
  if (!intent) return 'Unknown'
  if (INTENT_LABELS[intent]) return INTENT_LABELS[intent]
  return String(intent)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function LaneTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="chart-tooltip">
      <div className="mb-1">{label}</div>
      {payload.map((entry) => (
        <div className="row between gap-4" key={entry.dataKey}>
          <span>{AREA_META[entry.dataKey]?.label || entry.dataKey}</span>
          <span className="mono">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const item = payload[0].payload
  const meta = DONUT_META[item.lane] || { label: item.lane }
  return (
    <div className="chart-tooltip">
      <div className="mb-1">{meta.label}</div>
      <div className="row between gap-4">
        <span>tickets</span>
        <span className="mono">{Number(item.count) || 0}</span>
      </div>
    </div>
  )
}

function IntentTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const item = payload[0].payload
  return (
    <div className="chart-tooltip">
      <div className="mb-1">{item.label}</div>
      <div className="row between gap-4">
        <span>tickets</span>
        <span className="mono">{Number(item.count) || 0}</span>
      </div>
    </div>
  )
}

export function LaneAreaChart({ data = [] }) {
  const rows = Array.isArray(data) ? data : []
  if (!rows.length) return <div className="muted small">No lane history yet.</div>
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            dy={6}
            tick={{ fill: 'var(--muted-2)', fontSize: 10 }}
          />
          <YAxis
            width={34}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: 'var(--muted-2)', fontSize: 10 }}
          />
          <Tooltip content={<LaneTooltip />} cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }} />
          <Area
            type="monotone"
            dataKey="auto"
            stroke={AREA_META.auto.color}
            strokeWidth={2}
            fill={AREA_META.auto.color}
            fillOpacity={0.1}
            activeDot={{ r: 3 }}
          />
          <Area
            type="monotone"
            dataKey="review"
            stroke={AREA_META.review.color}
            strokeWidth={2}
            fill={AREA_META.review.color}
            fillOpacity={0.08}
            activeDot={{ r: 3 }}
          />
          <Area
            type="monotone"
            dataKey="blocked"
            stroke={AREA_META.blocked.color}
            strokeWidth={2}
            fill={AREA_META.blocked.color}
            fillOpacity={0.07}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AutonomyDonut({ data = [] }) {
  const rows = (Array.isArray(data) ? data : []).filter((item) => item && item.lane)
  const total = rows.reduce((sum, item) => sum + (Number(item.count) || 0), 0)
  if (!rows.length) return <div className="muted small">No lane mix yet.</div>
  return (
    <div className="row gap-4 wrap items-center">
      <div style={{ position: 'relative', width: 180, height: 230, flex: '0 0 180px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="lane"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={3}
              stroke="var(--white)"
              strokeWidth={2}
            >
              {rows.map((item) => (
                <Cell key={item.lane} fill={(DONUT_META[item.lane] || {}).color || 'var(--muted-2)'} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <h2>{total}</h2>
          <span className="tiny muted">tickets</span>
        </div>
      </div>
      <div className="flex-1" style={{ minWidth: 160 }}>
        <div className="flex-col gap-3">
          {rows.map((item) => {
            const meta = DONUT_META[item.lane] || { label: item.lane, tone: 'gray' }
            const share = total ? Math.round(((Number(item.count) || 0) / total) * 100) : 0
            return (
              <div className="row between gap-3" key={item.lane}>
                <Badge tone={meta.tone} dot>
                  {meta.label}
                </Badge>
                <div className="row gap-2">
                  <span className="mono small">{Number(item.count) || 0}</span>
                  <span className="tiny muted">{share}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function IntentBarChart({ data = [] }) {
  const rows = (Array.isArray(data) ? data : [])
    .filter(Boolean)
    .map((item) => ({ ...item, label: intentLabel(item.intent) }))
  if (!rows.length) return <div className="muted small">No intent data yet.</div>
  return (
    <div className="chart-box" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={122}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-2)', fontSize: 10 }}
          />
          <Tooltip content={<IntentTooltip />} cursor={{ fill: 'var(--paper)' }} />
          <Bar dataKey="count" fill="var(--cyan)" radius={[0, 5, 5, 0]} barSize={13}>
            <LabelList dataKey="count" position="right" fill="var(--muted-2)" fontSize={10} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
