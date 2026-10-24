import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Wallet
} from 'lucide-react'
import { api } from '../lib/api'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  Spinner,
  StatCard
} from '../components/ui'
import {
  AutonomyDonut,
  IntentBarChart,
  LaneAreaChart
} from '../components/dashboard-charts'
import LicenseCard from '../components/dashboard-license'
import RecentLedger from '../components/dashboard-ledger'
import TrustPanel from '../components/dashboard-trust'

function percentText(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${number.toFixed(1).replace(/\.0$/, '')}%`
}

function display(value) {
  return value === null || value === undefined || value === '' ? '—' : value
}

function statLabel(label) {
  return <span style={{ display: 'block', minHeight: 33 }}>{label}</span>
}

function reductionDelta(before, after) {
  if (
    before === null ||
    before === undefined ||
    before === '' ||
    after === null ||
    after === undefined ||
    after === ''
  ) {
    return undefined
  }
  const from = Number(before)
  const to = Number(after)
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return undefined
  const reduction = Math.round((1 - to / from) * 100)
  return reduction > 0 ? `-${reduction}%` : undefined
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await api.getDashboard()
      setDashboard(payload || {})
    } catch (err) {
      setDashboard(null)
      setError(err?.message || 'Could not load the outcome control room.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <PageHeader
        eyebrow="OUTCOME CONTROL ROOM"
        title="Every resolution, on the record."
        description="ResolveOS owns the ticket, not just the reply. Verified actions, bounded authority, measurable outcomes."
        actions={
          <>
            <Button icon={ArrowRight} onClick={() => navigate('/inbox')}>
              Open inbox
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
          <Spinner label="Loading outcome data" />
        </Card>
      ) : error ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Dashboard unavailable"
            description={error}
            action={
              <Button variant="secondary" icon={RotateCcw} onClick={load}>
                Retry
              </Button>
            }
          />
        </Card>
      ) : dashboard ? (
        <DashboardBody data={dashboard} navigate={navigate} />
      ) : null}
    </>
  )
}

function DashboardBody({ data, navigate }) {
  const kpis = data.kpis || {}
  const trust = data.trust || {}
  const daily = Array.isArray(data.daily) ? data.daily : []
  const laneMix = Array.isArray(data.lane_mix) ? data.lane_mix : []
  const intentMix = Array.isArray(data.intent_mix) ? data.intent_mix : []
  const licenses = Array.isArray(data.licenses) ? data.licenses : []
  const events = Array.isArray(data.recent_events) ? data.recent_events : []
  const visibleLicenses = licenses.slice(0, 6)
  const autonomous = Number(kpis.autonomous_resolutions) || 0
  const eligible = Number(kpis.eligible_tickets) || 0
  const laneTotal = laneMix.reduce((sum, item) => sum + (Number(item.count) || 0), 0)

  return (
    <>
      <section className="hero-strip mb-4">
        <div>
          <div className="eyebrow">VERIFIED AUTONOMOUS RESOLUTIONS</div>
          <h2>Autonomy is earned, not switched on.</h2>
          <p>
            {autonomous} verified resolutions without a human. Every action carries evidence, a
            policy version, and an undo path.
          </p>
        </div>
        <div className="flex-col gap-3">
          <div className="hero-metrics">
            <div className="hero-metric">
              <strong>{percentText(kpis.var_rate)}</strong>
              <span>VAR rate</span>
            </div>
            <div className="hero-metric">
              <strong>{percentText(kpis.auto_precision)}</strong>
              <span>Auto precision</span>
            </div>
            <div className="hero-metric">
              <strong>
                <Money value={Number(kpis.blocked_value) || 0} compact />
              </strong>
              <span>Blocked value</span>
            </div>
          </div>
          <div className="hero-actions">
            <Button
              variant="primary"
              size="sm"
              icon={ShieldCheck}
              onClick={() => navigate('/console')}
            >
              Review approvals
            </Button>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          label={statLabel('Verified autonomous resolution')}
          value={percentText(kpis.var_rate)}
          hint={`${autonomous}/${eligible} eligible tickets`}
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label={statLabel('Auto-action precision')}
          value={percentText(kpis.auto_precision)}
          delta="99%+ target"
          hint="sampled audit"
          icon={ShieldCheck}
          tone="cyan"
        />
        <StatCard
          label={statLabel('Handle time')}
          value={`${display(kpis.aht_before)}m → ${display(kpis.aht_after)}m`}
          delta={reductionDelta(kpis.aht_before, kpis.aht_after)}
          hint="p50 per ticket"
          icon={Timer}
          tone="navy"
        />
        <StatCard
          label={statLabel('Cost per resolution')}
          value={`₹${display(kpis.cost_before)} → ₹${display(kpis.cost_after)}`}
          delta={reductionDelta(kpis.cost_before, kpis.cost_after)}
          hint="model + actions + human time"
          icon={Wallet}
          tone="amber"
        />
  <StatCard
    label={statLabel('Unauthorized spend blocked')}
    value={<Money value={Number(kpis.blocked_value) || 0} compact />}
    hint={`${display(trust.policy_blocks)} ${Number(trust.policy_blocks) === 1 ? 'attempt' : 'attempts'} blocked`}
    icon={Ban}
    tone="red"
  />
      </div>

      <div className="two-col mt-4">
        <Card>
          <div className="card-title">
            <div>
              <h3>Resolutions by lane</h3>
              <div className="card-sub">Daily outcomes against the active policy.</div>
            </div>
            <div className="row gap-2 wrap">
              <Badge tone="cyan" dot>
                Auto
              </Badge>
              <Badge tone="green" dot>
                Review
              </Badge>
              <Badge tone="red" dot>
                Blocked
              </Badge>
            </div>
          </div>
          <LaneAreaChart data={daily} />
        </Card>
        <Card>
          <div className="card-title">
            <div>
              <h3>Autonomy mix</h3>
              <div className="card-sub">
                {laneTotal ? `${laneTotal} tickets routed by lane.` : 'Awaiting lane activity.'}
              </div>
            </div>
            <Badge tone="navy">Policy lanes</Badge>
          </div>
          <AutonomyDonut data={laneMix} />
        </Card>
      </div>

      <div className="two-col mt-4">
        <Card>
          <div className="card-title">
            <div>
              <h3>Where the work goes</h3>
              <div className="card-sub">Ticket volume by intent across the live queue.</div>
            </div>
            <Badge tone="cyan">By intent</Badge>
          </div>
          <IntentBarChart data={intentMix} />
        </Card>
        <TrustPanel trust={trust} licenses={licenses} />
      </div>

      <div className="two-col mt-4">
        <Card className="card-plain">
          <div className="card-title">
            <div>
              <h3>Autonomy licenses</h3>
              <div className="card-sub">Scoped authority, reviewed action by action.</div>
            </div>
            <Link to="/policy" className="btn btn-ghost btn-sm">
              Autonomy studio <ArrowUpRight size={13} />
            </Link>
          </div>
          {visibleLicenses.length ? (
            <div className="grid grid-2">
              {visibleLicenses.map((license, index) => (
                <LicenseCard
                  license={license}
                  key={`${license.action || 'license'}-${license.segment || index}`}
                />
              ))}
            </div>
          ) : (
            <p className="small muted">No autonomy licenses are active yet.</p>
          )}
          {licenses.length > 6 ? (
            <div className="mt-3">
              <Link to="/policy" className="btn btn-ghost btn-sm">
                View all {licenses.length} licenses <ChevronRight size={13} />
              </Link>
            </div>
          ) : null}
        </Card>
        <RecentLedger events={events} />
      </div>

      <Link to="/policy" className="callout callout-cyan row between wrap gap-3 mt-4">
        <div className="row gap-3">
          <ShieldCheck size={19} />
          <div>
            <strong className="small">Answers are cheap. Outcomes are auditable.</strong>
            <div className="tiny muted">
              Stress-test the same gate with adversarial prompts and promotion scenarios.
            </div>
          </div>
        </div>
        <span className="row gap-1 small">
          <strong>Open red-team evals</strong>
          <ChevronRight size={14} />
        </span>
      </Link>
    </>
  )
}
