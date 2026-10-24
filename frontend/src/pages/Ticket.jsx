import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Clock3,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import { api } from '../lib/api'
import {
  Button,
  Card,
  EmptyState,
  LaneBadge,
  Money,
  PageHeader,
  Spinner,
  StatusBadge
} from '../components/ui'
import { TicketContextStrip } from '../components/ticket-context'
import { TicketConversation } from '../components/ticket-conversation'
import { TicketTrace } from '../components/ticket-trace'
import { TicketActionsPanel } from '../components/ticket-actions'
import { TicketPassport } from '../components/ticket-passport'
import { CaseBrief } from '../components/ticket-brief'
import { AgentReceipt } from '../components/agent-receipt'

function normalizeTicket(payload) {
  if (!payload) return null
  return payload.ticket && !payload.id ? payload.ticket : payload
}

function NoticeIcon({ tone }) {
  if (tone === 'mint') return <Check size={15} />
  if (tone === 'amber') return <Clock3 size={15} />
  if (tone === 'red') return <Lock size={15} />
  return <RotateCcw size={15} />
}

export default function Ticket() {
  const { id } = useParams()
  const requestRef = useRef(0)
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [runStage, setRunStage] = useState(0)
  const [resetting, setResetting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [selectedActionId, setSelectedActionId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [agentStatus, setAgentStatus] = useState(null)
  const [runMode, setRunMode] = useState('scripted')
  const [runResult, setRunResult] = useState(null)
  const modeTouched = useRef(false)

  const load = useCallback(async (quiet = false) => {
    const sequence = ++requestRef.current
    if (!quiet) {
      setLoading(true)
      setError('')
    }
    try {
      const data = await api.getTicket(id)
      if (sequence !== requestRef.current) return null
      const next = normalizeTicket(data)
      setTicket(next)
      return next
    } catch (err) {
      if (sequence === requestRef.current && !quiet) {
        setError(err?.message || 'Could not load this ticket.')
      }
      return null
    } finally {
      if (sequence === requestRef.current && !quiet) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setTicket(null)
    setSelectedActionId(null)
    setNotice(null)
    setRunResult(null)
    load()
    return () => {
      requestRef.current += 1
    }
  }, [load])

  useEffect(() => {
    let cancelled = false
    api.getAgentStatus()
      .then((data) => {
        if (cancelled) return
        const status = data && typeof data === 'object' ? data : { configured: false }
        setAgentStatus(status)
        if (status.configured && !modeTouched.current) setRunMode('live')
      })
      .catch((err) => {
        if (cancelled) return
        setAgentStatus({
          configured: false,
          error: err?.message || 'Live AI status is unavailable.'
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const actions = Array.isArray(ticket?.actions) ? ticket.actions : []

  useEffect(() => {
    const list = Array.isArray(ticket?.actions) ? ticket.actions : []
    setSelectedActionId((current) => {
      if (current && list.some((action) => action?.id === current)) return current
      return list.length ? list[list.length - 1].id : null
    })
  }, [ticket])

  const effectiveActionId = actions.some((action) => action?.id === selectedActionId)
    ? selectedActionId
    : actions.length
      ? actions[actions.length - 1].id
      : null
  const selectedAction = actions.find((action) => action?.id === effectiveActionId) || null
  const pendingAction = [...actions].reverse().find((action) => action?.status === 'pending_approval') || null
  const briefActionId = ticket?.brief?.action_id || pendingAction?.id || (
    selectedAction?.status === 'pending_approval' ? selectedAction.id : null
  )
  const showBrief = Boolean(ticket?.brief && ticket?.status === 'waiting_human')
  const policyVersion = pendingAction?.policy_version ||
    actions[actions.length - 1]?.policy_version ||
    ticket?.policy_version ||
    'v3'

  const customerName = ticket?.customer?.name || 'Unknown customer'
  const segment = ticket?.customer?.segment || ticket?.customer_segment || 'Unsegmented'
  const orderId = ticket?.order?.id || ticket?.order_id || 'No order'
  const amountAtRisk = ticket?.amount_at_risk ?? ticket?.order?.total

  const liveAvailable = Boolean(agentStatus?.configured)
  const providerLabel = agentStatus?.provider
    ? agentStatus.provider.charAt(0).toUpperCase() + agentStatus.provider.slice(1)
    : 'Live AI'
  const modeHint = agentStatus === null
    ? 'Checking live AI status…'
    : liveAvailable
      ? `${providerLabel} · ${agentStatus.model || 'model ready'}`
      : agentStatus?.error
        ? 'Live AI status unavailable · using Scripted'
        : 'Live AI is not configured'
  const activeStages = [
    ...(runMode === 'live' && liveAvailable ? ['Calling live model'] : []),
    'Running read-only tools',
    'Applying policy',
    'Executing sandbox action'
  ]
  const agentRun = ticket?.agent_run || runResult?.agent_run || null

  function chooseMode(mode) {
    if (running) return
    if (mode === 'live' && !liveAvailable) return
    modeTouched.current = true
    setRunMode(mode)
  }

  async function runAgent() {
    if (running || resetting) return
    const mode = runMode === 'live' && liveAvailable ? 'live' : 'scripted'
    const stages = [
      ...(mode === 'live' ? ['Calling live model'] : []),
      'Running read-only tools',
      'Applying policy',
      'Executing sandbox action'
    ]
    setRunMode(mode)
    setRunning(true)
    setRunStage(0)
    setNotice(null)
    const timer = setInterval(() => {
      setRunStage((current) => Math.min(current + 1, stages.length - 1))
    }, 1100)
    try {
      const response = await api.runTicket(id, mode)
      setRunResult(response || null)
      const next = normalizeTicket(response?.ticket) || await load(true)
      if (next) setTicket(next)
      const lane = response?.decision?.lane || next?.lane
      const status = next?.status
      const receipt = next?.agent_run || response?.agent_run || null
      const fallback = Boolean(receipt?.fallback_used || receipt?.status === 'fallback')
      const liveReceipt = receipt?.mode === 'live' && !fallback && receipt?.status !== 'failed'
      if (lane === 'deny' || status === 'blocked') {
        setNotice({
          tone: 'red',
          text: `${fallback ? 'Fallback used · ' : liveReceipt ? 'Live AI · ' : ''}Policy blocked this action`
        })
      } else if (receipt?.status === 'failed') {
        setNotice({ tone: 'red', text: receipt.error || 'Live AI failed before a decision.' })
      } else if (fallback) {
        setNotice({
          tone: 'amber',
          text: lane === 'review' || status === 'waiting_human'
            ? 'Fallback used · escalated with case brief'
            : 'Fallback used · sandbox action verified'
        })
      } else if (lane === 'review' || status === 'waiting_human') {
        setNotice({
          tone: 'amber',
          text: liveReceipt ? 'Live AI escalated with case brief' : 'Escalated with case brief'
        })
      } else {
        setNotice({
          tone: 'mint',
          text: liveReceipt ? 'Live AI resolved and verified' : 'Scripted run resolved and verified'
        })
      }
      window.dispatchEvent(new Event('resolveos:refresh'))
    } catch (err) {
      setNotice({ tone: 'red', text: err?.message || 'The agent could not finish this run.' })
    } finally {
      clearInterval(timer)
      setRunStage(0)
      setRunning(false)
    }
  }

  async function resetTicket() {
    if (resetting || running) return
    setResetting(true)
    setNotice(null)
    setRunResult(null)
    try {
      await api.resetTicket(id)
      const next = await load(true)
      if (next) setTicket(next)
      setNotice({ tone: 'cyan', text: 'Ticket restored to its seeded state.' })
      window.dispatchEvent(new Event('resolveos:refresh'))
    } catch (err) {
      setNotice({ tone: 'red', text: err?.message || 'Could not reset this ticket.' })
    } finally {
      setResetting(false)
    }
  }

  async function approveAction(actionId) {
    if (!actionId || approving || rejecting) return
    setApproving(true)
    setNotice(null)
    try {
      const response = await api.approveAction(actionId)
      const next = normalizeTicket(response?.ticket) || await load(true)
      if (next) setTicket(next)
      setSelectedActionId(actionId)
      setNotice({ tone: 'mint', text: 'Approved — agent resumed and verified' })
      window.dispatchEvent(new Event('resolveos:refresh'))
    } catch (err) {
      setNotice({ tone: 'red', text: err?.message || 'Could not approve this action.' })
    } finally {
      setApproving(false)
    }
  }

  async function rejectAction(actionId, reason) {
    if (!actionId || rejecting || approving) return
    setRejecting(true)
    setNotice(null)
    try {
      const response = await api.rejectAction(actionId, reason || '')
      const next = normalizeTicket(response?.ticket) || await load(true)
      if (next) setTicket(next)
      setSelectedActionId(actionId)
      setNotice({ tone: 'amber', text: 'Rejected — sent to human queue' })
      window.dispatchEvent(new Event('resolveos:refresh'))
    } catch (err) {
      setNotice({ tone: 'red', text: err?.message || 'Could not reject this action.' })
    } finally {
      setRejecting(false)
    }
  }

  async function undoAction(actionId) {
    if (!actionId || undoing) return
    setUndoing(true)
    setNotice(null)
    try {
      const response = await api.undoAction(actionId)
      const next = normalizeTicket(response?.ticket) || await load(true)
      if (next) setTicket(next)
      setSelectedActionId(actionId)
      setNotice({ tone: 'mint', text: 'Reversed with compensating entry' })
      window.dispatchEvent(new Event('resolveos:refresh'))
    } catch (err) {
      setNotice({ tone: 'red', text: err?.message || 'Could not reverse this action.' })
    } finally {
      setUndoing(false)
    }
  }

  if (!ticket) {
    return (
      <>
        <Link to="/inbox" className="row gap-1 small muted" style={{ marginBottom: 12, width: 'fit-content' }}>
          <ArrowLeft size={14} /> Back to inbox
        </Link>
        <Card>
          {loading ? (
            <Spinner label="Loading ticket" />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Ticket unavailable"
              description={error || 'This ticket could not be found.'}
              action={(
                <div className="row gap-2 justify-center wrap">
                  <Button icon={RotateCcw} onClick={() => load()}>Retry</Button>
                  <Link to="/inbox" className="btn btn-secondary btn-md">
                    <ArrowLeft size={16} /> Back to inbox
                  </Link>
                </div>
              )}
            />
          )}
        </Card>
      </>
    )
  }

  return (
    <>
      <Link to="/inbox" className="row gap-1 small muted" style={{ marginBottom: 12, width: 'fit-content' }}>
        <ArrowLeft size={14} /> Back to inbox
      </Link>

      <PageHeader
        eyebrow={`TICKET ${ticket.id} · ${ticket.channel || 'Paytm Inbox'}`}
        title={ticket.subject || 'Untitled ticket'}
        description={(
          <span>
            {customerName} · {segment} · <span className="mono">{orderId}</span>
            {amountAtRisk != null ? <> · <Money value={amountAtRisk} /> at risk</> : null}
          </span>
        )}
        actions={(
          <div className="row gap-2 wrap">
            <div className="mode-control">
              <div className="mode-toggle" role="group" aria-label="Agent mode">
                <button
                  type="button"
                  data-mode="scripted"
                  className={runMode === 'scripted' ? 'active' : ''}
                  aria-pressed={runMode === 'scripted'}
                  disabled={running}
                  onClick={() => chooseMode('scripted')}
                >
                  Scripted
                </button>
                <button
                  type="button"
                  data-mode="live"
                  className={`${runMode === 'live' ? 'active' : ''} ${liveAvailable ? '' : 'unavailable'}`.trim()}
                  aria-pressed={runMode === 'live'}
                  disabled={running || !liveAvailable}
                  title={liveAvailable
                    ? `Run with ${agentStatus?.model || 'the live model'}`
                    : 'Live AI is not configured'}
                  onClick={() => chooseMode('live')}
                >
                  Live AI
                </button>
              </div>
              <span className="mode-hint">{modeHint}</span>
            </div>
            <StatusBadge status={ticket.status} />
            <LaneBadge lane={ticket.lane} />
            {running ? (
              <span className="row gap-1 tiny muted">
                <Sparkles size={13} className="spin" />
                {activeStages[Math.min(runStage, activeStages.length - 1)]}…
              </span>
            ) : null}
            <Button
              variant="secondary"
              icon={RotateCcw}
              loading={resetting}
              disabled={running}
              onClick={resetTicket}
            >
              Reset ticket
            </Button>
            <Button
              icon={Play}
              loading={running}
              disabled={resetting}
              onClick={runAgent}
            >
              Run Resolve agent
            </Button>
          </div>
        )}
      />

      {notice ? (
        <div className={`callout callout-${notice.tone}`} style={{ marginBottom: 16 }} role="status">
          <div className="row gap-2">
            <NoticeIcon tone={notice.tone} />
            <span className="small" style={{ fontWeight: 650 }}>{notice.text}</span>
          </div>
        </div>
      ) : null}

      <TicketContextStrip ticket={ticket} />

      <div className="three-col mt-4">
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <TicketConversation ticket={ticket} />
          {showBrief ? (
            <CaseBrief
              brief={ticket.brief}
              onApprove={() => approveAction(briefActionId)}
              onReject={(reason) => rejectAction(briefActionId, reason)}
              approving={approving}
              rejecting={rejecting}
              disabled={!briefActionId}
              approveLabel="Approve"
            />
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <TicketTrace trace={ticket.trace} policyVersion={policyVersion} />
          <AgentReceipt run={agentRun} />
          <TicketActionsPanel
            actions={actions}
            selectedId={effectiveActionId}
            onSelect={setSelectedActionId}
          />
        </div>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <TicketPassport
            action={selectedAction}
            actions={actions}
            onSelect={setSelectedActionId}
            onUndo={undoAction}
            undoing={undoing}
          />
        </div>
      </div>
    </>
  )
}
