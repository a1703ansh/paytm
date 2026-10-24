import { Check, FlaskConical, ShieldCheck, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Spinner } from './ui'

export function PolicyEvals({ evals, loading = false, error = '', onRerun }) {
  const results = Array.isArray(evals?.results) ? evals.results : []
  const passed = Number.isFinite(Number(evals?.passed))
    ? Number(evals.passed)
    : results.filter((result) => result?.passed).length
  const total = Number.isFinite(Number(evals?.total))
    ? Number(evals.total)
    : results.length
  const allBlocked = total > 0 && passed === total

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <div className="panel-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div className="row gap-2 wrap">
            <h2>Red-team the gate</h2>
            <Badge tone={allBlocked ? 'green' : 'red'} dot>{passed}/{total} attacks blocked</Badge>
          </div>
          <div className="row gap-2 wrap" style={{ marginTop: 8 }}>
            <Badge tone="cyan">Prompt injection</Badge>
            <Badge tone="amber">Payee swap</Badge>
            <Badge tone="navy">Over-limit refund</Badge>
          </div>
        </div>
        <Button variant="secondary" icon={FlaskConical} loading={loading} onClick={onRerun}>
          Re-run red-team
        </Button>
      </div>

      <div className="panel-body">
        {error ? (
          <div className="callout callout-red mb-3">
            <div className="row between wrap gap-2">
              <span className="small">{error}</span>
              <Button variant="ghost" size="sm" icon={FlaskConical} onClick={onRerun}>Retry</Button>
            </div>
          </div>
        ) : null}

        {results.length ? (
          <div className="grid grid-2">
            {results.map((result, index) => (
              <div className="eval-row" key={result?.id || index}>
                <div className={`eval-icon ${result?.passed ? 'eval-pass' : 'eval-fail'}`}>
                  {result?.passed ? <Check size={11} /> : <X size={11} />}
                </div>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="eval-prompt" style={{ overflowWrap: 'anywhere' }}>
                    {result?.prompt || 'Adversarial prompt'}
                  </div>
                  <div className="eval-blocker">
                    Blocked by <span className="mono">{result?.blocked_by || 'policy gate'}</span>
                  </div>
                  <div className="row gap-2 wrap" style={{ marginTop: 4 }}>
                    {result?.id ? <span className="mono tiny muted">{result.id}</span> : null}
                    {result?.expected ? <Badge tone="gray">Expected {result.expected}</Badge> : null}
                    {result?.actual ? <span className="tiny muted">Actual {result.actual}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : loading ? (
          <Spinner label="Running adversarial suite" />
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="No eval results"
            description="Run the red-team suite to verify the policy gate against known attacks."
            action={(
              <Button variant="secondary" icon={FlaskConical} onClick={onRerun}>
                Re-run red-team
              </Button>
            )}
          />
        )}
      </div>
    </Card>
  )
}
