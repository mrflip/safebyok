import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import type { PassphraseVerdict, Whisper } from 'safebyok'
import type { BoxSelected, PutBoxActionResult } from 'safebyok-react-lean'
import { WhisperInput } from 'safebyok-react-lean/parts'
import { Dojo, LoginLabelpath, SOK } from '../lib/dojo'
import { formTextOf } from '../lib/form-text'
import { messageOf, refusalkindOf } from '../lib/messages'
import { type Arrangement, arrange, disarm } from '../lib/scenarios'
import { type Outcome, Readout } from './Readout'

/** The fields the readout reports on. */
const BoxFieldnames = ['username', 'boxPassword', 'boxConfirmation'] as const

/** What the host's own check says when the two passwords differ. */
const MismatchMessage = 'The passwords do not match.'

/** What the host's own check says when the strength verdict shown is not strong. */
const WeakMessage = 'That password is too easy to guess: the verdict beside it must say strong.'

/** Each scenario button: its title, and what it arranges before the form submits. */
const Buttons: readonly (readonly [title: string, arrangement: Arrangement])[] = [
  ['Save', 'nothing'], ['Weak', 'weak'], ['Exists', 'stored'], ['Failed', 'refused'], ['Dismiss', 'locked'],
]

/** The form that adds a box at the labelpath `login`: the username in its sidecar, the password in its whisper, the strength verdict beside it, and a button for each outcome. */
export function NewBoxTab({ userid }: Readonly<{ userid: string | null }>) {
  const strength = SOK.useStrengthVerdict()
  // Observed, so the minder has heard whether a box is stored here: Exists stores one behind its back.
  const { data: box } = Dojo.useBox(LoginLabelpath)
  const formRef = useRef<HTMLFormElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const pressedRef = useRef('Save')
  const [submitseq, setSubmitseq] = useState(0)
  const isStrong = (! strength.isJudging) && (strength.verdict?.strong === true)

  // Remade when the verdict changes, so the host's own check reads the verdict shown.
  const saveAction = useMemo(() => Dojo.putBoxAction(LoginLabelpath, {
    whisperOf: (form): Whisper => {
      const password = formTextOf(form, 'boxPassword')
      if (formTextOf(form, 'boxConfirmation') !== password) { throw new Error(MismatchMessage) }
      if (! isStrong) { throw new Error(WeakMessage) }
      return { password }
    },
    sidecarOf:        (_whisper, form) => ({ username: formTextOf(form, 'username') }),
    secretFieldnames: ['boxPassword', 'boxConfirmation'],
  }), [isStrong])

  const [put, putAction] = useActionState(async (prior: (PutBoxActionResult & { outcome: Outcome }) | null, form: FormData) => {
    const result = await saveAction(prior, form)
    disarm()
    return { ...result, outcome: { title: pressedRef.current, seq: (prior?.outcome.seq ?? 0) + 1 } }
  }, null)

  // Weak's verdict must land in a render before the form submits, for the host's check to read it: so each press submits
  // from an effect, after the render its arrangement caused.
  useEffect(() => {
    if (submitseq > 0) { formRef.current?.requestSubmit() }
  }, [submitseq])

  /** Arrange what the button `title` stands for, judge the password again where it asks for a weak verdict, then submit the form. */
  async function press(title: string, arrangement: Arrangement) {
    pressedRef.current = title
    await arrange(arrangement, userid)
    if (arrangement === 'weak') { await strength.judge(passwordRef.current?.value ?? '') }
    setSubmitseq((prior) => prior + 1)
  }

  const shownErr = put?.err ?? null
  return (
    <section aria-labelledby="box-title" className="card">
      <h2 id="box-title">New Box: a login</h2>
      <p className="quiet">
        Sign in as Hero or Thierry, and unlock. The box goes at the labelpath <code>{LoginLabelpath}</code>: {storedTextOf(box)}
      </p>
      <form ref={formRef} action={putAction}>
        <input name="username" aria-label="Username" placeholder="Username" autoComplete="off" defaultValue={put?.texts['username']} />
        <WhisperInput ref={passwordRef} name="boxPassword" aria-label="Password" placeholder="Password" onChange={(event) => { void strength.judge(event.target.value) }} />
        <p role="status">{strengthTextOf(strength.verdict)}</p>
        <WhisperInput name="boxConfirmation" aria-label="Confirm password" placeholder="Confirm password" />
        <div role="alert" className="gripe" data-refusalkind={shownErr ? refusalkindOf(shownErr) : ''}>
          {shownErr ? messageOf(shownErr) : (put?.box && 'Saved the box.')}
        </div>
        <p className="row">
          {Buttons.map(([title, arrangement]) => <button key={title} type="button" onClick={() => { void press(title, arrangement) }}>{title}</button>)}
        </p>
      </form>
      <Readout formRef={formRef} fieldnames={BoxFieldnames} outcome={put?.outcome ?? null} />
    </section>
  )
}

/** What the page says of the box stored at the labelpath, sealed: its username, from its sidecar. */
function storedTextOf(box: BoxSelected): string {
  if (box === undefined) { return 'not fetched yet.' }
  if (box === null) { return 'none stored yet.' }
  return `one stored, for ${JSON.stringify(box.sidecar['username'])}.`
}

/** The line beside the password: the verdict's reason while weak, or that it is strong. */
function strengthTextOf(verdict: PassphraseVerdict | null): string {
  if (verdict === null) { return '' }
  return verdict.strong ? 'Strong enough' : verdict.reason
}
