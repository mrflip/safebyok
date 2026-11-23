import type { RowOutcome } from '../../lib/form-outcomes'
import { messageOf } from '../../lib/messages'

/** How many saves are under way, and how the last few ended, newest first, in the browser's locale time. */
export function SaveLog({ pendingCount, outcomes }: Readonly<{ pendingCount: number, outcomes: readonly RowOutcome[] }>) {
  return (
    <div className="savelog" aria-label="Saves">
      {(pendingCount > 0) && <span>saving… ({pendingCount})</span>}
      {outcomes.map((outcome) => (
        <span key={`${outcome.at.toString()}:${outcome.err?.message ?? ''}`} className={(outcome.err === null) ? undefined : 'gripe'}>
          {(outcome.err === null) ? 'ok' : `err: ${messageOf(outcome.err)}`} @ <time dateTime={new Date(outcome.at).toISOString()}>{new Date(outcome.at).toLocaleTimeString()}</time>
        </span>
      ))}
    </div>
  )
}
