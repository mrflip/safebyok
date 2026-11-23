import { startTransition, useRef, useState } from 'react'
import type { Gating } from 'safebyok'
import { popField } from 'safebyok-react-lean'
import { useNewPassphrase } from 'safebyok-react-lean/kit'
import { PassphraseInput } from 'safebyok-react-lean/parts'
import { Dojo, SOK } from '../lib/dojo'
import { messageOf, refusalkindOf } from '../lib/messages'
import { type Arrangement, arrange, disarm } from '../lib/scenarios'
import { type Outcome, Readout } from './Readout'

/** The fields the readout reports on. */
const LoginFieldnames = ['username', 'passphrase', 'confirmation'] as const

/** What the host's own check says when the two passphrases differ. */
const MismatchMessage = 'The passphrases do not match.'

/** Each scenario button that submits: its title, and what it arranges before the form submits. Dismiss submits nothing. */
const Buttons: readonly (readonly [title: string, arrangement: Arrangement])[] = [
  ['Sign In', 'nothing'], ['Weak', 'weak'], ['Exists', 'stored'], ['Failed', 'refused'],
]

/** The form that creates the signed-in user's vault: a username, a new passphrase and its confirmation, the strength verdict beside them, and a button for each outcome. */
export function LoginTab({ userid }: Readonly<{ userid: string | null }>) {
  const birth = Dojo.useBirth()
  const newPassphrase = useNewPassphrase(SOK)
  const formRef = useRef<HTMLFormElement>(null)
  const pressedRef = useRef('Sign In')
  const [hostErr, setHostErr] = useState<Error | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  /** Arrange what the button `title` stands for, then submit the form. */
  async function press(title: string, arrangement: Arrangement) {
    pressedRef.current = title
    setHostErr(null)
    birth.reset()
    await arrange(arrangement, userid)
    formRef.current?.requestSubmit()
  }

  // The secret fields leave the FormData before the first await. The outcome is set in a transition, so that it commits
  // with React's reset of the form, which comes once the action ends.
  /** Create the vault under the form's passphrase, where it matches its confirmation. */
  async function action(form: FormData) {
    const passphraseCleartext = popField(form, 'passphrase')
    const isMatched = (popField(form, 'confirmation') === passphraseCleartext)
    const gating = gatingOf(passphraseCleartext, isMatched)
    if (gating !== null) {
      try {
        await birth.mutateAsync(gating)
      } catch {
        // The refusal shows as `birth.error`.
      }
    }
    disarm()
    const title = pressedRef.current
    startTransition(() => { setOutcome((prior) => ({ title, seq: (prior?.seq ?? 0) + 1 })) })
  }

  /** The birth's gating, or null where the host's own check, or the gating itself, refuses: that refusal then shows. */
  function gatingOf(passphraseCleartext: string, isMatched: boolean): Gating | null {
    try {
      if (! isMatched) { throw new Error(MismatchMessage) }
      return birth.gating({ passphraseCleartext })
    } catch (err) {
      setHostErr(err as Error)
      return null
    }
  }

  /** Back out: empty the form, as a Cancel button would. Nothing reaches the library. */
  function dismiss() {
    pressedRef.current = 'Dismiss'
    setHostErr(null)
    birth.reset()
    formRef.current?.reset()
    setOutcome((prior) => ({ title: 'Dismiss', seq: (prior?.seq ?? 0) + 1 }))
  }

  const shownErr = hostErr ?? birth.error
  return (
    <section aria-labelledby="login-title" className="card">
      <h2 id="login-title">Login: create the vault</h2>
      <p className="quiet">Sign in as Nolo for an unborn bank. Each button but Dismiss submits the same form, after arranging its outcome.</p>
      <form ref={formRef} action={action} onReset={newPassphrase.forget}>
        <input name="username" aria-label="Username" placeholder="Username" autoComplete="username" />
        <PassphraseInput {...newPassphrase.field} name="passphrase" />
        <p role="status" id={newPassphrase.verdictId}>{newPassphrase.verdictText}</p>
        <PassphraseInput {...newPassphrase.confirmField} name="confirmation" />
        <p role="status" id={newPassphrase.matchId}>{newPassphrase.matchText}</p>
        <div role="alert" className="gripe" data-refusalkind={shownErr ? refusalkindOf(shownErr) : ''}>
          {shownErr ? messageOf(shownErr) : (birth.isSuccess && 'Your vault is created.')}
        </div>
        <p className="row">
          {Buttons.map(([title, arrangement]) => <button key={title} type="button" onClick={() => { void press(title, arrangement) }}>{title}</button>)}
          <button type="button" onClick={dismiss}>Dismiss</button>
        </p>
      </form>
      <Readout formRef={formRef} fieldnames={LoginFieldnames} outcome={outcome} />
    </section>
  )
}
