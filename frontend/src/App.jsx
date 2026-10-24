import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Inbox,
  ShieldCheck,
  SlidersHorizontal,
  RotateCcw,
  Menu,
  X,
  Sparkles,
  ChevronRight
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import InboxPage from './pages/Inbox'
import Ticket from './pages/Ticket'
import Console from './pages/Console'
import Policy from './pages/Policy'
import { api } from './lib/api'
import { Avatar, Badge, Button } from './components/ui'

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/console', label: 'Approvals', icon: ShieldCheck },
  { to: '/policy', label: 'Autonomy', icon: SlidersHorizontal }
]

const titles = {
  '/': 'Overview',
  '/inbox': 'Inbox',
  '/console': 'Approvals',
  '/policy': 'Autonomy studio'
}

function pageTitle(pathname) {
  if (titles[pathname]) return titles[pathname]
  if (pathname.startsWith('/tickets/')) return 'Ticket'
  return 'Workspace'
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [resetting, setResetting] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [approvalCount, setApprovalCount] = useState(null)
  const [policyVersion, setPolicyVersion] = useState(null)
  const [licenseSummary, setLicenseSummary] = useState({ licensed: null, total: null, precision: null })
  const [agentStatus, setAgentStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadChrome() {
      try {
        const [approvalData, policyData] = await Promise.all([api.getApprovals(), api.getPolicy()])
        if (cancelled) return
        setApprovalCount(Array.isArray(approvalData?.approvals) ? approvalData.approvals.length : 0)
        const active = policyData?.active || policyData || {}
        if (active.version) setPolicyVersion(active.version)
        const licenses = Array.isArray(policyData?.licenses) ? policyData.licenses : []
        if (licenses.length) {
          const licensed = licenses.filter((item) => item?.lane === 'auto').length
          const coreRefund = licenses.find((item) => item?.action === 'issue_refund' && item?.segment === 'Core')
          setLicenseSummary({
            licensed,
            total: licenses.length,
            precision: coreRefund?.precision ?? null
          })
        }
      } catch {
        return
      }
    }
    const refresh = () => { loadChrome() }
    loadChrome()
    window.addEventListener('resolveos:refresh', refresh)
    const timer = window.setInterval(loadChrome, 10000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('resolveos:refresh', refresh)
    }
  }, [location.pathname])

  useEffect(() => {
    let cancelled = false
    async function loadAgentStatus() {
      try {
        const data = await api.getAgentStatus()
        if (!cancelled) setAgentStatus(data && typeof data === 'object' ? data : null)
      } catch {
        if (!cancelled) setAgentStatus({ configured: false })
      }
    }
    const refresh = () => { loadAgentStatus() }
    loadAgentStatus()
    window.addEventListener('resolveos:refresh', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('resolveos:refresh', refresh)
    }
  }, [])

  const liveAgent = Boolean(agentStatus?.configured)
  const toolCount = Array.isArray(agentStatus?.tools) ? agentStatus.tools.length : 0
  const toolLabel = toolCount ? `${toolCount} read tools` : 'read-only tools'
  const agentModel = agentStatus?.model || 'Unavailable'
  const licensedCount = Number(licenseSummary.licensed)
  const totalCount = Number(licenseSummary.total)
  const precisionValue = Number(licenseSummary.precision)
  const hasLicenseCounts = licenseSummary.licensed != null
    && licenseSummary.total != null
    && Number.isFinite(licensedCount)
    && Number.isFinite(totalCount)
  const licensedLabel = hasLicenseCounts ? licensedCount : '—'
  const totalLabel = hasLicenseCounts ? totalCount : '—'
  const precisionLabel = licenseSummary.precision != null && Number.isFinite(precisionValue)
    ? `${precisionValue}%`
    : '—'
  const licenseMeterWidth = hasLicenseCounts && totalCount > 0
    ? Math.max(0, Math.min(100, Math.round((licensedCount / totalCount) * 100)))
    : 0

  async function resetDemo() {
    if (resetting) return
    setResetting(true)
    try {
      await api.resetDemo()
      navigate('/')
      window.location.reload()
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <button className="mobile-scrim" onClick={() => setNavOpen(false)} aria-label="Close navigation" />
      <aside className="sidebar">
        <div className="brand-row">
          <NavLink to="/" className="brand" onClick={() => setNavOpen(false)}>
            <span className="brand-mark">
              <span />
              <span />
            </span>
            <span className="brand-copy">
              <strong>ResolveOS</strong>
              <small>Paytm edition</small>
            </span>
          </NavLink>
          <button className="sidebar-close" onClick={() => setNavOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="workspace-pill">
          <span className="workspace-avatar">P</span>
          <div>
            <strong>Paytm Commerce</strong>
            <span>Support operations</span>
          </div>
          <ChevronRight size={15} />
        </div>

        <div className="nav-label">Workspace</div>
        <nav className="nav">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setNavOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Approvals' && approvalCount ? <span className="nav-count">{approvalCount}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="nav-label">Trust layer</div>
        <div className="trust-mini">
          <div className="trust-mini-head">
            <Sparkles size={15} />
            <span>Autonomy earned</span>
          </div>
          <p>
            {licensedLabel} of {totalLabel} actions licensed. Refund precision at {precisionLabel}.
          </p>
          <div className="trust-meter">
            <span style={{ width: `${licenseMeterWidth}%` }} />
          </div>
          <NavLink to="/policy" className="trust-link" onClick={() => setNavOpen(false)}>
            Open autonomy studio <ChevronRight size={13} />
          </NavLink>
        </div>

        <div className="sidebar-foot">
          <div className="agent-status">
            <span className={`pulse-dot ${liveAgent ? '' : 'scripted'}`} />
            <div>
              <strong title={liveAgent ? `Provider: ${agentStatus?.provider || 'Unknown'}` : 'Scripted demo agent'}>
                {liveAgent ? `Live AI · ${agentModel}` : 'Scripted agent'}
              </strong>
              <small>Policy {policyVersion ?? '—'} · {toolLabel}</small>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            loading={resetting}
            onClick={resetDemo}
            className="reset-btn"
          >
            Reset demo data
          </Button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-btn" onClick={() => setNavOpen(true)} aria-label="Open navigation">
              <Menu size={19} />
            </button>
            <div className="crumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{pageTitle(location.pathname)}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <Badge tone="green" dot className="demo-badge">Demo live</Badge>
            {liveAgent ? <Badge tone="green" dot className="live-ai-badge">Live AI</Badge> : null}
            <div className="topbar-user">
              <Avatar name="Aarav Kapoor" size={34} />
              <div>
                <strong>Aarav Kapoor</strong>
                <span>Ops manager</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-wrap">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/tickets/:id" element={<Ticket />} />
            <Route path="/console" element={<Console />} />
            <Route path="/policy" element={<Policy />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
