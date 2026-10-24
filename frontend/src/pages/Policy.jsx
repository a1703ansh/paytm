import { useEffect, useState } from 'react'
import {
  Check,
  FlaskConical,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import { api } from '../lib/api'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  Progress,
  Spinner
} from '../components/ui'
import { PolicyRail } from '../components/policy-rail'
import { PolicyEvals } from '../components/policy-evals'

const metricDefs = [
  { key: 'auto_rate', label: 'Auto-resolution rate', kind: 'percent', upGood: true },
  { key: 'precision', label: 'Auto precision', kind: 'percent', upGood: true },
  { key: 'expected_leakage', label: 'Expected leakage', kind: 'money', upGood: false },
  { key: 'escalations', label: 'Escalations', kind: 'count', upGood: false }
]

const limitKeys = ['auto_limit', 'notify_limit', 'risk_threshold']

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function asVersion(value) {
  const match = String(value || '').match(/\d+/)
  return match ? `v${match[0]}` : 'v3'
}

function nextVersion(value) {
  const match = String(value || '').match(/\d+/)
  return `v${(match ? Number(match[0]) : 3) + 1}`
}

function inr(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount)
}

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

function normalizeLimits(source, fallback = {}) {
  const auto = Number(source?.auto_limit ?? fallback.auto_limit ?? 2000)
  const notify = Number(source?.notify_limit ?? fallback.notify_limit ?? 20000)
  const risk = Number(source?.risk_threshold ?? fallback.risk_threshold ?? 30)
  return {
    auto_limit: clamp(Number.isFinite(auto) ? auto : 2000, 500, 5000),
    notify_limit: clamp(Number.isFinite(notify) ? notify : 20000, 2000, 25000),
    risk_threshold: clamp(Number.isFinite(risk) ? risk : 30, 10, 70)
  }
}

function metricNumber(source, key) {
  const value = Number(source?.[key])
  return Number.isFinite(value) ? value : 0
}

function formatMetric(metric, value) {
  if (metric.kind === 'percent') return `${Number(value || 0).toFixed(1)}%`
  if (metric.kind === 'count') return `${Math.round(Number(value) || 0)}`
  return inr(value)
}

function formatDelta(metric, delta) {
  if (Math.abs(delta) < 0.05) return 'No change'
  const sign = delta > 0 ? '+' : '−'
  const absolute = Math.abs(delta)
  if (metric.kind === 'money') return `${sign}${inr(absolute)}`
  if (metric.kind === 'percent') return `${sign}${absolute.toFixed(1)} pts`
  return `${sign}${Math.round(absolute)}`
}

function useWideLayout() {
  const [wide, setWide] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth > 1100
  ))

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth > 1100)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return wide
}

export default function Policy() {
  const wide = useWideLayout()
  const [policy, setPolicy] = useState(null)
  const [evals, setEvals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [evalError, setEvalError] = useState('')
  const [evalLoading, setEvalLoading] = useState(false)
  const [limits, setLimits] = useState(null)
  const [simulatedLimits, setSimulatedLimits] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [simulation, setSimulation] = useState(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState('')
  const [promoting, setPromoting] = useState(false)
  const [notice, setNotice] = useState(null)

  async function boot() {
    setLoading(true)
    setError('')
    setEvalError('')
    setSimError('')
    setNotice(null)
    setPolicy(null)
    setLimits(null)
    setSimulation(null)
    setBaseline(null)
    setSimulatedLimits(null)
    setEvals(null)
    const evalPromise = api.getAdversarial().catch((err) => {
      setEvalError(err?.message || 'Could not run the red-team suite.')
      return null
    })
    try {
      const policyData = await api.getPolicy()
      setPolicy(policyData)
      const activeData = policyData?.active || policyData || {}
      const initial = normalizeLimits(activeData)
      setLimits(initial)
      setSimLoading(true)
      try {
        const data = await api.simulatePolicy(initial)
        setSimulation(data)
        setBaseline(data?.baseline || data?.metrics || null)
        setSimulatedLimits(initial)
      } catch (err) {
        setSimError(err?.message || 'Baseline simulation failed.')
      } finally {
        setSimLoading(false)
      }
      setEvals(await evalPromise)
    } catch (err) {
      setError(err?.message || 'Could not load the autonomy studio.')
    } finally {
      setLoading(false)
      setSimLoading(false)
    }
  }

  useEffect(() => {
    boot()
  }, [])

  async function runEvals() {
    if (evalLoading) return
    setEvalLoading(true)
    setEvalError('')
    try {
      const data = await api.getAdversarial()
      setEvals(data)
    } catch (err) {
      setEvalError(err?.message || 'Could not run the red-team suite.')
    } finally {
      setEvalLoading(false)
    }
  }

  async function simulate(values = limits) {
    if (!values || simLoading) return
    if (values.auto_limit > values.notify_limit) {
      setSimError('The auto limit cannot exceed the notify limit.')
      return
    }
    setSimLoading(true)
    setSimError('')
    try {
      const data = await api.simulatePolicy(values)
      setSimulation(data)
      setSimulatedLimits(values)
      if (!baseline) setBaseline(data?.baseline || data?.metrics || null)
    } catch (err) {
      setSimError(err?.message || 'The simulation could not be completed.')
    } finally {
      setSimLoading(false)
    }
  }

  function updateLimit(key, value) {
    setLimits((current) => (current ? { ...current, [key]: Number(value) } : current))
  }

  async function applySuggestion() {
    if (!limits) return
    const suggestion = policy?.suggestion || {}
    const proposed = suggestion.proposed_values || {}
    const next = normalizeLimits({
      auto_limit: proposed.auto_limit ?? suggestion.auto_limit ?? limits.auto_limit,
      notify_limit: proposed.notify_limit ?? suggestion.notify_limit ?? limits.notify_limit,
      risk_threshold: proposed.risk_threshold ?? suggestion.risk_threshold ?? limits.risk_threshold
    }, limits)
    setLimits(next)
    await simulate(next)
  }

  async function promote() {
    if (!limits || promoting || !policy) return
    setPromoting(true)
    setNotice(null)
    setSimError('')
    try {
      const submitted = { ...limits }
      const response = await api.promotePolicy({
        ...submitted,
        note: 'Promoted from autonomy studio'
      })
      const raw = response?.policy || response?.active || {}
      const version = asVersion(raw?.version || raw?.active?.version || nextVersion(policy?.active?.version))
      const now = new Date().toISOString()
      const currentHistory = Array.isArray(policy?.history)
        ? policy.history
        : Array.isArray(policy?.active?.history)
          ? policy.active.history
          : []
      const history = Array.isArray(raw?.history)
        ? raw.history
        : [...currentHistory, { version, ...submitted, updated_at: now, note: 'Promoted from autonomy studio' }]
      const mergedActive = raw?.active
        ? raw.active
        : {
            ...(policy?.active || {}),
            ...raw,
            ...submitted,
            version,
            updated_at: raw?.updated_at || now,
            history
          }
      const mergedPolicy = raw?.active
        ? { ...raw, licenses: raw?.licenses || policy?.licenses || [] }
        : {
            ...(policy || {}),
            ...raw,
            active: mergedActive,
            licenses: raw?.licenses || policy?.licenses || []
          }
      setPolicy(mergedPolicy)
      const newLimits = normalizeLimits(mergedPolicy?.active || mergedPolicy, submitted)
      setLimits(newLimits)
      setNotice({
        tone: 'mint',
        text: `Policy ${asVersion(mergedPolicy?.active?.version || version)} active. Canary 10% for 24h.`
      })
      window.dispatchEvent(new Event('resolveos:refresh'))

      const promotedMetrics = response?.metrics || simulation?.metrics || null
      if (promotedMetrics) {
        setBaseline(promotedMetrics)
        setSimulation({ metrics: promotedMetrics, baseline: promotedMetrics })
      }

      try {
        const data = await api.simulatePolicy(newLimits)
        setSimulation(data)
        setBaseline(promotedMetrics || data?.baseline || data?.metrics || null)
        setSimulatedLimits(newLimits)
      } catch (err) {
        setSimError(err?.message || 'Policy promoted, but the replay could not be refreshed.')
      }
    } catch (err) {
      setNotice({ tone: 'red', text: err?.message || 'Could not promote this policy.' })
    } finally {
      setPromoting(false)
    }
  }

  const active = policy?.active || policy || {}
  const activeVersion = asVersion(active.version)
  const nextLabel = nextVersion(active.version)
  const invalid = Boolean(limits && limits.auto_limit > limits.notify_limit)
  const changed = Boolean(limits && limitKeys.some((key) => Number(limits[key]) !== Number(active[key])))
  const dirty = Boolean(limits && simulatedLimits && limitKeys.some((key) => Number(limits[key]) !== Number(simulatedLimits[key])))
  const candidate = simulation?.metrics || simulation?.candidate || {}
  const baselineMetrics = baseline || simulation?.baseline || {}
  const leakage = metricNumber(candidate, 'expected_leakage')
  const suggestion = policy?.suggestion
  const suggestionTitle = suggestion?.title || ''
  const suggestionDetail = suggestion?.detail || suggestion?.description || ''
  const suggestionApprovals = suggestion?.approvals ?? suggestion?.overrides
  const suggestionDecisions = suggestion?.decisions ?? suggestion?.total
  const suggestionOverrides = suggestionApprovals != null && suggestionDecisions != null
    ? `${suggestionApprovals} of ${suggestionDecisions} human decisions in this band were approvals.`
    : null

  const header = {
    eyebrow: 'AUTONOMY STUDIO',
    title: 'Give the teammate more rope, on evidence.',
    description: 'Versioned policy-as-code, replay simulation, and a red-team suite. Autonomy is earned, not switched on.'
  }

  const headerActions = policy ? (
    <div className="row gap-2 wrap">
      <Badge tone="navy" dot>Policy {activeVersion}</Badge>
      <Button
        variant="secondary"
        icon={FlaskConical}
        loading={evalLoading}
        onClick={runEvals}
      >
        Run red-team
      </Button>
    </div>
  ) : null

  if (loading && !policy) {
    return (
      <>
        <PageHeader {...header} />
        <Card>
          <Spinner label="Loading autonomy studio" />
        </Card>
      </>
    )
  }

  if (!policy) {
    return (
      <>
        <PageHeader {...header} />
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="Autonomy studio unavailable"
            description={error || 'The policy engine could not be loaded.'}
            action={<Button icon={RotateCcw} onClick={boot}>Retry</Button>}
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader {...header} actions={headerActions} />

      {notice ? (
        <div className={`callout callout-${notice.tone}`} style={{ marginBottom: 16 }} role="status">
          <div className="row gap-2">
            {notice.tone === 'mint' ? <Check size={15} /> : <ShieldCheck size={15} />}
            <span className="small" style={{ fontWeight: 650 }}>{notice.text}</span>
          </div>
        </div>
      ) : null}

      <div
        className="two-col"
        style={wide ? { gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)' } : undefined}
      >
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card>
            <div className="card-title" style={{ flexWrap: 'wrap' }}>
              <div>
                <h2>Active autonomy licence</h2>
                <div className="card-sub">What the engine may approve without a human in the loop.</div>
              </div>
              <div className="row gap-2 wrap">
                <Badge tone="green" dot>Live</Badge>
                <Badge tone="navy">Policy {activeVersion}</Badge>
              </div>
            </div>
            <div className="grid grid-3">
              <div>
                <div className="passport-label">Auto-refund limit</div>
                <div className="license-limit">
                  {active.auto_limit != null ? <Money value={active.auto_limit} /> : '—'}
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>Licensed without review</div>
              </div>
              <div>
                <div className="passport-label">Notify limit</div>
                <div className="license-limit">
                  {active.notify_limit != null ? <Money value={active.notify_limit} /> : '—'}
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>Above this, the action is denied</div>
              </div>
              <div>
                <div className="passport-label">Risk ceiling</div>
                <div className="license-limit">
                  {active.risk_threshold != null ? `${active.risk_threshold} / 100` : '—'}
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>Hard stop on high-risk cases</div>
              </div>
            </div>
            <div
              className="row between wrap gap-2"
              style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--line)' }}
            >
              <span className="tiny muted">Updated {formatDateTime(active.updated_at)}</span>
              <span className="tiny muted">
                {Number.isFinite(Number(active.hard_deny)) && Number(active.hard_deny) > 0 ? (
                  <>Hard deny above <Money value={active.hard_deny} /> · Deny &gt; review &gt; auto</>
                ) : 'Deny precedence over review over auto'}
              </span>
            </div>
          </Card>

          <Card padded={false} style={{ overflow: 'hidden' }}>
            <div className="panel-head" style={{ flexWrap: 'wrap' }}>
              <div>
                <h2>What-if simulator</h2>
                <div className="card-sub">Replay a candidate licence against 240 historical tickets.</div>
              </div>
              <div className="row gap-2 wrap">
                {dirty ? <Badge tone="amber" dot>Unsimulated</Badge> : <Badge tone="green" dot>Replayed</Badge>}
                <Badge tone="cyan">240 tickets</Badge>
              </div>
            </div>
            <div className="panel-body">
              {limits ? (
                <>
                  <div className="slider-row">
                    <div>
                      <div className="slider-label">Auto-refund limit</div>
                      <div className="slider-hint">Maximum refund the policy can license without review.</div>
                      <input
                        className="range"
                        type="range"
                        min="500"
                        max="5000"
                        step="100"
                        value={limits.auto_limit}
                        onChange={(event) => updateLimit('auto_limit', event.target.value)}
                        disabled={promoting}
                        aria-invalid={invalid}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                    <div className="slider-value"><Money value={limits.auto_limit} /></div>
                  </div>

                  <div className="slider-row">
                    <div>
                      <div className="slider-label">Notify limit</div>
                      <div className="slider-hint">Ceiling before the policy hard-denies the action.</div>
                      <input
                        className="range"
                        type="range"
                        min="2000"
                        max="25000"
                        step="500"
                        value={limits.notify_limit}
                        onChange={(event) => updateLimit('notify_limit', event.target.value)}
                        disabled={promoting}
                        aria-invalid={invalid}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                    <div className="slider-value"><Money value={limits.notify_limit} /></div>
                  </div>

                  <div className="slider-row">
                    <div>
                      <div className="slider-label">Risk threshold</div>
                      <div className="slider-hint">Actions above this risk score are never auto-approved.</div>
                      <input
                        className="range"
                        type="range"
                        min="10"
                        max="70"
                        step="1"
                        value={limits.risk_threshold}
                        onChange={(event) => updateLimit('risk_threshold', event.target.value)}
                        disabled={promoting}
                        aria-invalid={invalid}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                    <div className="slider-value">{limits.risk_threshold}</div>
                  </div>

                  {suggestion ? (
                    <div className="callout callout-amber" style={{ marginTop: 14 }}>
                      <div className="row between items-start wrap gap-3">
                        <div style={{ maxWidth: 520 }}>
                          <div className="row gap-2 wrap">
                            <Sparkles size={14} />
                            {suggestionTitle ? <strong style={{ fontSize: 12 }}>{suggestionTitle}</strong> : null}
                          </div>
                          {suggestionDetail ? <p className="small" style={{ marginTop: 5 }}>{suggestionDetail}</p> : null}
                          {suggestionOverrides ? <p className="tiny muted" style={{ marginTop: 4 }}>{suggestionOverrides}</p> : null}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={simLoading}
                          disabled={promoting}
                          onClick={applySuggestion}
                        >
                          Apply to simulator
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="callout" style={{ marginTop: 14 }}>
                      <span className="small muted">No promotion suggestion yet.</span>
                    </div>
                  )}

                  <div className="row between items-center wrap gap-3" style={{ marginTop: 14 }}>
                    {invalid ? (
                      <span className="tiny" style={{ color: 'var(--red)' }}>
                        Auto limit cannot exceed the notify limit.
                      </span>
                    ) : (
                      <span className="tiny muted">Baseline held at {activeVersion}. Slider changes stay local until replayed.</span>
                    )}
                    <Button
                      icon={Play}
                      loading={simLoading}
                      disabled={invalid || promoting}
                      onClick={() => simulate()}
                    >
                      Simulate on 240 tickets
                    </Button>
                  </div>

                  {simError ? (
                    <div className="callout callout-red" style={{ marginTop: 12 }}>
                      <span className="small">{simError}</span>
                    </div>
                  ) : null}

                  {simulation ? (
                    <>
                      <div className="row between wrap gap-2 mt-4 mb-2">
                        <span className="small" style={{ fontWeight: 700 }}>Baseline vs candidate</span>
                        <span className="tiny muted">Candidate replayed on 240 tickets</span>
                      </div>
                      <div className="grid grid-4">
                        {metricDefs.map((metric) => {
                          const baseValue = metricNumber(baselineMetrics, metric.key)
                          const candidateValue = metricNumber(candidate, metric.key)
                          const delta = candidateValue - baseValue
                          const improved = metric.upGood ? delta >= 0 : delta <= 0
                          const noChange = Math.abs(delta) < 0.05
                          return (
                            <div className="compare-card" key={metric.key}>
                              <div className="compare-label">{metric.label}</div>
                              <div className="compare-value">
                                {metric.kind === 'money'
                                  ? <Money value={candidateValue} />
                                  : formatMetric(metric, candidateValue)}
                              </div>
                              <div className="row gap-1 wrap tiny" style={{ marginTop: 4 }}>
                                {noChange ? (
                                  <span className="muted">No change</span>
                                ) : (
                                  <span className={improved ? 'delta-up' : 'delta-down'}>
                                    {formatDelta(metric, delta)}
                                  </span>
                                )}
                                <span className="muted">
                                  vs {metric.kind === 'money'
                                    ? <Money value={baseValue} />
                                    : formatMetric(metric, baseValue)}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {leakage > 0 ? (
                        <div className="callout callout-amber" style={{ marginTop: 12 }}>
                          <div className="row gap-2">
                            <ShieldCheck size={14} />
                            <span className="small">
                              This raises auto coverage but exposes <Money value={leakage} /> to out-of-policy approvals.
                            </span>
                          </div>
                        </div>
                      ) : null}

                      <div style={{ marginTop: 14 }}>
                        <div className="row between gap-2" style={{ marginBottom: 8 }}>
                          <span className="small" style={{ fontWeight: 700 }}>Lane mix</span>
                          <span className="tiny muted">
                            {candidate.auto_count != null ? `${candidate.auto_count} auto actions` : 'Last replay'}
                          </span>
                        </div>
                        {[
                          { label: 'Auto', value: metricNumber(candidate, 'auto_rate'), tone: 'green' },
                          { label: 'Review', value: metricNumber(candidate, 'review_rate'), tone: 'amber' },
                          { label: 'Deny', value: metricNumber(candidate, 'deny_rate'), tone: 'red' }
                        ].map((lane, index) => (
                          <div key={lane.label} style={{ marginBottom: index === 2 ? 0 : 10 }}>
                            <div className="row between gap-2" style={{ marginBottom: 4 }}>
                              <span className="tiny">{lane.label}</span>
                              <span className="mono tiny muted">{lane.value.toFixed(1)}%</span>
                            </div>
                            <Progress value={lane.value} tone={lane.tone} />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="callout callout-cyan" style={{ marginTop: 14 }}>
                      <span className="small">
                        Run the simulator to compare the candidate licence with the active baseline.
                      </span>
                    </div>
                  )}

                  <div
                    className="row between items-center wrap gap-3"
                    style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}
                  >
                    <span className="tiny muted">
                      Baseline Policy {activeVersion}. Promotion writes a signed version and starts a canary.
                    </span>
                    <Button
                      variant="dark"
                      icon={Sparkles}
                      loading={promoting}
                      disabled={!changed || invalid || !simulation || simLoading || dirty}
                      onClick={promote}
                    >
                      Promote to {nextLabel}
                    </Button>
                  </div>
                </>
              ) : (
                <Spinner label="Preparing simulator" />
              )}
            </div>
          </Card>
        </div>

        <PolicyRail policy={policy} />
      </div>

      <div className="mt-4">
        <PolicyEvals
          evals={evals}
          loading={evalLoading}
          error={evalError}
          onRerun={runEvals}
        />
      </div>

      <p className="small muted text-center" style={{ marginTop: 22, letterSpacing: '-0.1px' }}>
        The winning teammate isn&apos;t the smartest model. It&apos;s the one whose mistakes are bounded, visible, and reversible.
      </p>
    </>
  )
}
