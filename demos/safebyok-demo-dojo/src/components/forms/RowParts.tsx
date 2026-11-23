import { type FormOutcomekind, FormOutcomekinds, type RowOutcome, armOutcome } from '../../lib/form-outcomes'
import { messageOf } from '../../lib/messages'

/** What every Forms row is handed: the title its form is named by, who is signed in, and the secret input's `type`. */
export type RowProps = Readonly<{ title: string, userid: string | null, secretType: 'password' | 'text' }>

/** The row's three submit buttons, each arranging its outcome as it is pressed, and disabled while a save is pending. */
export function OutcomeButtons({ userid, labelpath, isPending }: Readonly<{ userid: string | null, labelpath: string, isPending: boolean }>) {
  return FormOutcomekinds.map((outcomekind: FormOutcomekind) => (
    <button key={outcomekind} type="submit" disabled={isPending} onClick={() => { armOutcome(outcomekind, userid, labelpath) }}>{outcomekind}</button>
  ))
}

// React renders it empty and never again touches what is inside: src/lib/mirror.ts writes there.
/** The cell the page's mirror writes the row's secret into, as the DOM shows it. */
export function MirrorCell() {
  return <span className="mirror" data-mirror="" aria-label="Mirror" />
}

// React renders it empty and never again touches what is inside: ./variables-mirror.ts writes there.
/** The cell that shows what a mutation the row started held in its variables as it went pending; it stays empty in a row with no mutation. */
export function VariablesCell() {
  return <span className="variables" data-variables="" aria-label="Variables" />
}

/** The cell that says how the row's last save ended, in the browser's locale time, or that one is pending. */
export function ResultCell({ isPending, outcome }: Readonly<{ isPending: boolean, outcome: RowOutcome | null }>) {
  if (isPending) { return <span className="result" aria-label="Result">saving…</span> }
  if (outcome === null) { return <span className="result" aria-label="Result" /> }
  const time = <time dateTime={new Date(outcome.at).toISOString()}>{new Date(outcome.at).toLocaleTimeString()}</time>
  return (
    <span className="result" aria-label="Result">
      {(outcome.err === null) ? <>ok @ {time}</> : <span className="gripe">err @ {time}: {messageOf(outcome.err)}</span>}
    </span>
  )
}
