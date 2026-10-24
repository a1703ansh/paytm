import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  Clock3,
  Inbox,
  Lock,
  RotateCcw,
  ShieldCheck,
  Wallet
} from 'lucide-react'
import { api } from '../lib/api'
import {
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  Spinner,
  StatCard
} from '../components/ui'
import { ConsoleApprovalCard } from '../components/console-approval-card'
import { ConsoleRail } from '../components/console-rail'

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

function NoticeIcon({ tone }) {
  if (tone === 'mint') return <Check size={15} />
  if (tone === 'amber') return <Clock3 size={15} />
  if (tone === 'red') return <Lock size={15} />
  return <RotateCcw size={15} />
}

function approvalAmount(approval) {
  const raw = approval?.action?.amount ?? approval?.action?.params?.amount
  if (raw == null || raw === '') return null
  const amount = Number(raw)
  return Number.isFinite(amount) ? amount : null
}

function waitMinutes(value, now) {
  if (!value) return null
  const started = new Date(value).getTime()
  if (!Number.isFinite(started)) return null
  const minutes = Math.floor((now - started) / 60000)
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null
}

function formatWait(minutes) {
  if (!Number.isFinite(minutes)) return '—'
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`
}

export default function Console() {
  const wide = useWideLayout()
  const [approvals, setApprovals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState({})

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await api.getApprovals()
      setApprovals(Array.isArray(response?.approvals) ? response.approvals : [])
    } catch (err) {
      setError(err?.message || 'Could not load approvals.')
      if (!silent) setApprovals(null)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    await load(true)
    setRefreshing(false)
  }

  async function handleApprove(approval) {
    const actionId = approval?.action?.id
    if (!actionId || busy[actionId]) return false
    setBusy((current) => ({ ...current, [actionId]: 'approve' }))
    setNotice(null)
    try {
      const response = await api.approveAction(actionId)
      setApprovals((current) => (current || []).filter((item) => item?.action?.id !== actionId))
      window.dispatchEvent(new Event('resolveos:refresh'))
      setNotice({
        tone: 'mint',
        text: 'Approved. Agent resumed at execute and verified reference.',
        ticketId: response?.ticket?.id || approval?.ticket?.id
      })
      await load(true)
      return true
    } catch (err) {
      setNotice({ tone: 'red', text: err?.message || 'Could not approve this action.' })
      return false
    } finally {
      setBusy((current) => {
        const next = { ...current }
        delete next[actionId]
        return next
      })
    }
  }

  async function handleReject(actionId, reason) {
    if (!actionId || busy[actionId]) return false
    const approval = (approvals || []).find((item) => item?.action?.id === actionId)
    setBusy((current) => ({ ...current, [actionId]: 'reject' }))
    setNotice(null)
    try {
      const response = await api.rejectAction(actionId, reason || '')
      setApprovals((current) => (current || []).filter((item) => item?.action?.id !== actionId))
      window.dispatchEvent(new Event('resolveos:refresh'))
      setNotice({
        tone: 'amber',
        text: 'Rejected. Ticket returned to the human queue.',
        ticketId: response?.ticket?.id || approval?.ticket?.id
      })
      await load(true)
      return true
    } catch (err) {
      setNotice({ tone: 'red', text: err?.message || 'Could not reject this action.' })
      return false
    } finally {
      setBusy((current) => {
        const next = { ...current }
        delete next[actionId]
        return next
      })
    }
  }

  const header = (
    <PageHeader
      eyebrow="HUMAN CONSOLE"
      title="The human is the last mile, not the first."
      description="Full case briefs, a recommended action, and one-click approval. No transcript re-reading."
      actions={(
        <div className="row gap-2 wrap">
          <Button
            variant="secondary"
            icon={RotateCcw}
            loading={refreshing}
            disabled={loading}
            onClick={refresh}
          >
            Refresh
          </Button>
          <Link to="/inbox" className="btn btn-secondary btn-md">
            <Inbox size={16} /> Inbox
          </Link>
        </div>
      )}
    />
  )

  const approvalList = Array.isArray(approvals) ? approvals : []
  const waitingCount = approvalList.length
  const amounts = approvalList.map(approvalAmount)
  const queueValue = waitingCount > 0 && amounts.every((amount) => amount != null)
    ? amounts.reduce((sum, amount) => sum + amount, 0)
    : null
  const now = Date.now()
  const waits = approvalList.map((approval) => waitMinutes(
    approval?.waiting_since ?? approval?.ticket?.waiting_since,
    now
  ))
  const oldestWait = waitingCount > 0 && waits.every((minutes) => minutes != null)
    ? Math.max(...waits)
    : null

  return (
    <>
      {header}

      {notice ? (
        <div className={`callout callout-${notice.tone}`} style={{ marginBottom: 16 }} role="status">
          <div className="row gap-2 wrap">
            <NoticeIcon tone={notice.tone} />
            <span className="small" style={{ fontWeight: 650 }}>{notice.text}</span>
            {notice.ticketId ? (
              <Link
                to={`/tickets/${notice.ticketId}`}
                className="small"
                style={{ marginLeft: 4, fontWeight: 750, textDecoration: 'underline' }}
              >
                Open ticket
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {error && approvals ? (
        <div className="callout callout-red mb-4">
          <div className="row between wrap gap-2">
            <span className="small">{error}</span>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={refresh}>Retry</Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-3">
        <StatCard
          label="Waiting approvals"
          value={waitingCount}
          hint="SLA-aware human queue"
          icon={Clock3}
          tone="amber"
        />
        <StatCard
          label="Queue value"
          value={queueValue == null ? '—' : <Money value={queueValue} />}
          hint="Pending approval amount"
          icon={Wallet}
          tone="cyan"
        />
        <StatCard
          label="Oldest wait"
          value={oldestWait == null ? '—' : formatWait(oldestWait)}
          hint="Longest waiting approval"
          icon={Clock3}
          tone="amber"
        />
      </div>

      {!approvals && loading ? (
        <Card className="mt-4">
          <Spinner label="Loading approvals" />
        </Card>
      ) : !approvals && !loading ? (
        <Card className="mt-4">
          <EmptyState
            icon={ShieldCheck}
            title="Approvals unavailable"
            description={error || 'The human queue could not be loaded.'}
            action={(
              <div className="row gap-2 justify-center wrap">
                <Button icon={RotateCcw} onClick={() => load()}>Retry</Button>
                <Link to="/inbox" className="btn btn-secondary btn-md">
                  <Inbox size={16} /> Open inbox
                </Link>
              </div>
            )}
          />
        </Card>
      ) : (
        <div
          className="two-col mt-4"
          style={wide ? { gridTemplateColumns: 'minmax(0, 2.2fr) minmax(300px, 1fr)' } : undefined}
        >
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            {waitingCount ? approvalList.map((approval, index) => {
              const actionId = approval?.action?.id
              return (
                <ConsoleApprovalCard
                  key={actionId || approval?.ticket?.id || index}
                  approval={approval}
                  onApprove={() => handleApprove(approval)}
                  onReject={handleReject}
                  approving={Boolean(actionId && busy[actionId] === 'approve')}
                  rejecting={Boolean(actionId && busy[actionId] === 'reject')}
                />
              )
            }) : (
              <Card>
                <EmptyState
                  icon={ShieldCheck}
                  title="No approvals waiting"
                  description="Run T-1003 (VIP refund) in the inbox to see a live case brief."
                  action={(
                    <Link to="/inbox" className="btn btn-secondary btn-md">
                      <Inbox size={16} /> Open inbox
                    </Link>
                  )}
                />
              </Card>
            )}
          </div>

          <ConsoleRail />
        </div>
      )}
    </>
  )
}
