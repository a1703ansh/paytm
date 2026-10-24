const BASE = '/api'

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const body = await response.json()
      detail = body.detail || body.message || detail
    } catch {
      // Keep the status-based message.
    }
    throw new Error(detail)
  }
  if (response.status === 204) return null
  return response.json()
}

export const api = {
  getTickets: () => request('/tickets'),
  getTicket: (id) => request(`/tickets/${id}`),
  getAgentStatus: () => request('/agent/status'),
  getAgentRun: (id) => request(`/agent/runs/${id}`),
  runTicket: (id, mode = 'scripted') =>
    request(`/tickets/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ mode })
    }),
  resetTicket: (id) => request(`/tickets/${id}/reset`, { method: 'POST' }),
  approveAction: (id) => request(`/actions/${id}/approve`, { method: 'POST' }),
  rejectAction: (id, reason = '') =>
    request(`/actions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  undoAction: (id) => request(`/actions/${id}/undo`, { method: 'POST' }),
  getApprovals: () => request('/approvals'),
  getDashboard: () => request('/dashboard'),
  getPolicy: () => request('/policy'),
  simulatePolicy: (payload) =>
    request('/policy/simulate', { method: 'POST', body: JSON.stringify(payload) }),
  promotePolicy: (payload) =>
    request('/policy/promote', { method: 'POST', body: JSON.stringify(payload) }),
  getAdversarial: () => request('/evals/adversarial'),
  resetDemo: () => request('/demo/reset', { method: 'POST' })
}
