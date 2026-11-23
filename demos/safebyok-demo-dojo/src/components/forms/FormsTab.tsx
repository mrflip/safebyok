import { useQueryClient } from '@tanstack/react-query'
import { type ComponentType, useEffect, useState } from 'react'
import { ActionKeptRow } from './ActionKeptRow'
import { ActionRow } from './ActionRow'
import { ClearedAtOnceRow } from './ClearedAtOnceRow'
import { ControlledRow } from './ControlledRow'
import { HookFormBesideRow } from './HookFormBesideRow'
import { HookFormRow } from './HookFormRow'
import { MutationFormRow } from './MutationFormRow'
import { MutationReadRow } from './MutationReadRow'
import { PutBackRow } from './PutBackRow'
import type { RowProps } from './RowParts'
import { SubmitRow } from './SubmitRow'
import { startVariablesMirror } from './variables-mirror'

/** How a host should take a way of building the form: the one to choose, one to choose where it fits, one of the strictest, or one to avoid. */
type Standing = 'Recommended' | 'Balanced' | 'Hardened' | 'Avoid'

/** One way of building the form: its component, how to take it, its name, what becomes of the password's field, where the password is while the save runs and after an error, and why a host would choose it, or the bad practice in it. */
type RowSpec = Readonly<{ Row: ComponentType<RowProps>, standing: Standing, rowname: string, fieldFate: string, whileSaving: string, afterError: string, why: string }>

/** The rows a host might choose, best first. */
const ChoiceRows: readonly RowSpec[] = [
  { Row: ActionKeptRow, standing: 'Recommended', rowname: 'form Action', fieldFate: 'cleared on save, kept for edit or retry on error',
    whileSaving: 'field', afterError: 'field',
    why: "Choose it for React 19's own form idiom, plus one line: the form cancels React's reset when the save was refused." },
  { Row: SubmitRow, standing: 'Balanced', rowname: 'plain HTML form', fieldFate: 'cleared on save, kept for edit or retry on error',
    whileSaving: 'field', afterError: 'field',
    why: 'Choose it where a form Action does not fit: React never resets an onSubmit form, so the form clears itself once the box is stored.' },
  { Row: MutationReadRow, standing: 'Balanced', rowname: 'with TanStack', fieldFate: 'cleared on save, kept for edit or retry on error',
    whileSaving: 'field', afterError: 'field',
    why: "Choose it to keep useMutation's pending and error state: the mutation is handed nothing and reads the form inside its mutationFn, so its variables hold nothing." },
  { Row: HookFormBesideRow, standing: 'Balanced', rowname: 'with a form library', fieldFate: 'cleared on save, kept for edit or retry on error',
    whileSaving: 'field', afterError: 'field',
    why: 'Choose it when the app already has a form library: give it every field but the secret, and read the secret from its input when the form submits.' },
  { Row: ClearedAtOnceRow, standing: 'Hardened', rowname: 'unpleasant', fieldFate: 'cleared at once, typed again after an error',
    whileSaving: 'nowhere', afterError: 'nowhere',
    why: 'Choose it where a secret must not sit in a field while a slow save runs, as on a shared screen; the cost is typing it again after any error.' },
  { Row: PutBackRow, standing: 'Hardened', rowname: 'kinder', fieldFate: 'hidden while saving, put back for edit or retry on error',
    whileSaving: 'nowhere', afterError: 'field',
    why: 'Choose it where a secret must not sit in a field while a slow save runs, but an error should not cost typing it again; the cost is a handler that empties the input and fills it again by hand.' },
]

/** The rows that show what goes wrong, each with its bad practice. */
const AvoidRows: readonly RowSpec[] = [
  { Row: ActionRow, standing: 'Avoid', rowname: "React's default", fieldFate: 'cleared after every outcome',
    whileSaving: 'field', afterError: 'nowhere',
    why: "The bad practice is letting React's reset run after a refusal: the secret sits in its field for the whole save, and is still lost on an error." },
  { Row: MutationFormRow, standing: 'Avoid', rowname: 'a mutation handed the form', fieldFate: 'cleared at once, never kept',
    whileSaving: "nowhere, but once in the mutation's variables and React's form status", afterError: 'nowhere',
    why: "The bad practice is a secret in a mutation's variables: TanStack shows them to its cache's subscribers, as the Variables cell does, before the library deletes the password from them." },
  { Row: ControlledRow, standing: 'Avoid', rowname: 'a controlled input', fieldFate: 'cleared on save, kept for edit or retry on error',
    whileSaving: 'field, attribute, state', afterError: 'field, attribute, state',
    why: "The bad practice is a secret in React state: React also writes it into the input's value attribute, so it is in the page's markup." },
  { Row: HookFormRow, standing: 'Avoid', rowname: 'a form library holding the secret', fieldFate: 'cleared on save, kept for edit or retry on error',
    whileSaving: "field, state (the library's store)", afterError: "field, state (the library's store)",
    why: 'The bad practice is registering the secret with the form library: its store keeps the text as typed, until the form is reset.' },
]

/** A table of `rows`, numbered from `firstNum`: each one's name, where the password is while its save runs and after an error, and the reason given for it. */
function RowsTable({ title, namehead, reasonhead, rows, firstNum }: Readonly<{ title: string, namehead: string, reasonhead: string, rows: readonly RowSpec[], firstNum: number }>) {
  return (
    <table className="readout" aria-label={title}>
      <thead>
        <tr><th>{namehead}</th><th>While saving</th><th>After an error</th><th>{reasonhead}</th></tr>
      </thead>
      <tbody>
        {rows.map(({ standing, rowname, whileSaving, afterError, why }, ii) => (
          <tr key={rowname}><td>{firstNum + ii}. {standing}, {rowname}</td><td>{whileSaving}</td><td>{afterError}</td><td>{why}</td></tr>
        ))}
      </tbody>
    </table>
  )
}

/** The forms of `rows`, numbered from `firstNum`, each headed by its name and what becomes of the password's field. */
function RowForms({ rows, firstNum, userid, secretType }: Readonly<{ rows: readonly RowSpec[], firstNum: number, userid: string | null, secretType: RowProps['secretType'] }>) {
  return rows.map(({ Row, standing, rowname, fieldFate }, ii) => (
    <div key={rowname} className="formrow-frame">
      <p className="formrow-head"><b>{firstNum + ii}. {standing}, {rowname}:</b> {fieldFate}.</p>
      <Row title={`${standing}, ${rowname}`} userid={userid} secretType={secretType} />
    </div>
  ))
}

/** Ten ways of building a form with a secret in it, a row each, those to choose from apart from those that show what goes wrong; every save is held six seconds, with mirrors beside each row of where the secret's text is in the page and in a mutation's variables. */
export function FormsTab({ userid }: Readonly<{ userid: string | null }>) {
  const [isSecretShown, setIsSecretShown] = useState(false)
  const queryClient = useQueryClient()
  useEffect(() => startVariablesMirror(queryClient.getMutationCache()), [queryClient])
  const secretType = isSecretShown ? 'text' : 'password'
  return (
    <section aria-labelledby="forms-title" className="card">
      <h2 id="forms-title">Forms: a secret in a form</h2>
      <p>
        First, choose your tradeoff: would you like the value cleared on save, but kept for edit or retry on error? Or would you like it cleared
        immediately, but require the user to re-enter it on a problem?
      </p>
      <RowsTable title="Forms to choose from" namehead="How to choose" reasonhead="Why" rows={ChoiceRows} firstNum={1} />
      <p className="quiet">
        Where the password is: <b>field</b>, the input&apos;s <code>value</code>; <b>attribute</b>, its <code>value</code> attribute, in the page&apos;s
        markup; <b>state</b>, React state or a form library&apos;s store. Once a save is stored, no row leaves it in the field or the attribute.
      </p>
      <p className="quiet">
        Sign in as Hero or Thierry, and unlock. Each row saves a box of its own: the username in its sidecar, the password in its whisper.
        Every save is held six seconds by the dojo&apos;s vaultDB, then <b>save</b> stores it, <b>stale</b> meets a box another device wrote
        meanwhile (<code>stale_write</code>), and <b>fail</b> is refused by the vaultDB.
      </p>
      <p className="quiet">
        The mirror is written by a script that is not React (<code>src/lib/mirror.ts</code>): what the password input&apos;s <code>value</code> holds,
        and its <code>value</code> attribute, which the Elements panel and a session replay show. Beside it, a listener on the page&apos;s mutation cache
        writes what a row&apos;s mutation held in its variables as it went pending, as React Query&apos;s devtools would see them. Neither can see React state
        or a form library&apos;s store: right-click a row and Inspect, with React DevTools.
      </p>
      <label className="row">
        <input type="checkbox" checked={isSecretShown} onChange={(event) => { setIsSecretShown(event.target.checked) }} />
        Show each password as text (<code>type=&quot;text&quot;</code>)
      </label>
      <RowForms rows={ChoiceRows} firstNum={1} userid={userid} secretType={secretType} />
      <h3>What goes wrong: forms to avoid</h3>
      <p className="quiet">Each of these shows a bad practice, named in its last column. None is a way to build the form.</p>
      <RowsTable title="Forms to avoid" namehead="Avoid" reasonhead="What goes wrong" rows={AvoidRows} firstNum={ChoiceRows.length + 1} />
      <RowForms rows={AvoidRows} firstNum={ChoiceRows.length + 1} userid={userid} secretType={secretType} />
    </section>
  )
}
