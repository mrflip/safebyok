import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { ForeverMillis, HostErrorSanitizer, MinuteMillis, type AnyGating, type Outcome, type Vault } from 'safebyok'
import { attemptRefusalFlavor } from './attempt-refusals'
import { Boundary, forBoundary, type BoundarySource } from './boundary'
import { Doing, Locale, Messages } from './messages'
import { useRevealToggle } from './reveal-toggle'
import { useWhenShown } from './when-shown'

// The parts every gating's dialog is built of: its one answer, kept above the boundary that shows a
// calm notice; the form, with a dialog's semantics; the passphrase field and the advice beside it;
// and what a form does with each refusal its attempt meets.

// == [Answer]: DialogAnswer, answerOf, useAnswerOnce, AnsweringOnce, DialogTrouble, cancelOnEscape

/** How a dialog closed: 'unlocked', 'deleted' or 'declined'. */
export type DialogAnswer = 'unlocked' | 'deleted' | 'declined'

/** The answer for `gating` settled with `outcome`. */
const answerOf = (gating: AnyGating, outcome: Outcome<Vault>): DialogAnswer => {
  if (! outcome.ok) { return 'declined' }
  return gating.gatingkind === 'del_vault' ? 'deleted' : 'unlocked'
}

/** The dialog's one answer to `gating`, calling `onDone` the first time only. */
const useAnswerOnce = (gating: AnyGating, onDone: (answer: DialogAnswer) => void) => {
  const onDoneRef = useRef(onDone)
  useLayoutEffect(() => { onDoneRef.current = onDone })
  const answered = useRef(false)
  const done = useCallback((answer: DialogAnswer) => {
    if (answered.current) { return }
    answered.current = true
    onDoneRef.current(answer)
  }, [])
  const { whenShown } = useWhenShown()
  useEffect(() => {
    let current = true
    // A lock, a sweep or a vacate settles the gating with no attempt: the dialog closes on it.
    void gating.whenSettled.then((outcome) => whenShown(() => { if (current) { done(answerOf(gating, outcome)) } }))
    return () => { current = false }
  }, [gating, done, whenShown])
  return done
}

/** A dialog's one answer, kept above its boundary. */
export const AnsweringOnce = ({ gating, onDone, children }: {
  gating:   AnyGating
  onDone:   (answer: DialogAnswer) => void
  children: (done: (answer: DialogAnswer) => void) => ReactNode
}) => {
  const done = useAnswerOnce(gating, onDone)
  return (
    <Boundary fallback={<DialogTrouble doing={Doing[gating.gatingkind]} onDone={done} />}>
      {children(done)}
    </Boundary>
  )
}

/** Escape, from anywhere in a dialog, cancels it, and goes no further. */
const cancelOnEscape = (onDone: (answer: DialogAnswer) => void) => (evt: KeyboardEvent) => {
  if (evt.key !== 'Escape') { return }
  evt.stopPropagation()
  onDone('declined')
}

/** What the dialog shows once something not the user's to mend went wrong inside it. */
const DialogTrouble = ({ doing, onDone }: { doing: string, onDone: (answer: DialogAnswer) => void }) => {
  const titleId = useId()
  const wordId = useId()
  return (
    <div className="modal-scrim">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes a dialog from anywhere inside it, as the WAI-ARIA dialog pattern has it */}
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={wordId}
        onKeyDown={cancelOnEscape(onDone)}
      >
        <h3 id={titleId}>{Messages.troubleTitle}</h3>
        <p className="gripe" id={wordId}>{Messages.troubleWord(doing)}</p>
        <div className="row">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the field that held focus is gone; the WAI-ARIA dialog pattern moves focus to the dialog's one control */}
          <button type="button" autoFocus onClick={() => { onDone('declined') }}>{Messages.closeButton}</button>
        </div>
      </div>
    </div>
  )
}
// --

// == [Form]: Gripe, useAttempts, ModalForm, holdsFocus, unlockedFor

/** What a dialog's live region says, and whether it is about the passkey or a mismatch. */
export type Gripe = { text: string, fromPasskey: boolean, mismatched?: true }

/** A form's state around its attempts: the gripe it shows, and what one submit's attempt does with its outcome. */
export const useAttempts = (source: BoundarySource, done: (answer: DialogAnswer) => void) => {
  const [gripe, setGripe] = useState<Gripe | null>(null)
  // Wrapped, so that a failure carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  // A dialog gone meanwhile touches neither its state nor its host's onDone again. One hidden
  // meanwhile meets the outcome once it shows again.
  const { whenShown, isShown } = useWhenShown()
  const fail = useCallback((err: unknown) => { setFailure({ err }) }, [])
  if (failure !== null) { throw forBoundary(failure.err, source) }

  const meet = (err: unknown) => {
    const flavor = attemptRefusalFlavor(err)
    // A second submit while the first runs: the first answers for the dialog.
    if (flavor === 'in_flight') { return }
    if (flavor === 'in_place') { setGripe({ text: (err as Error).message, fromPasskey: false }); return }
    if (flavor === 'close') { done('declined'); return }
    // Thrown from an event handler, it would miss every boundary.
    fail(err)
  }

  const attempt = async (tried: () => Promise<Outcome<Vault>>, answer: DialogAnswer) => {
    setGripe(null)
    const { ok, err } = await tried()
    await whenShown(() => {
      if (ok) { done(answer); return }
      meet(err)
    })
  }

  return { gripe, setGripe, meet, fail, attempt, whenShown, isShown }
}

/** What a {@link ModalForm} is handed. */
type ModalFormProps = {
  /** The heading, which names the dialog. */
  title:      string
  /** The paragraph under it, which describes the dialog. */
  blurb:      string
  /** The submit button's word. */
  submitWord: string
  /** What to say in the live region, or null for nothing. */
  gripe:      Gripe | null
  /** The live region's id, for a field it describes: a confirmation's, from {@link useConfirmation}. */
  gripeId?:   string | undefined
  /** A quiet line under the live region: how long an unlock lasts. */
  footnote?:  string | undefined
  formRef?:   Ref<HTMLFormElement> | undefined
  /** The dialog's one answer: Cancel and Escape answer 'declined'. */
  done:       (answer: DialogAnswer) => void
  /** Each submit, its default prevented. */
  onSubmit:   () => void
  /** The fields, between the blurb and the live region. */
  children:   ReactNode
}

/** A gating's form with a dialog's semantics, unstyled under `modal` class names. */
export const ModalForm = ({ title, blurb, submitWord, gripe, gripeId, footnote, formRef, done, onSubmit, children }: ModalFormProps) => {
  const titleId = useId()
  const blurbId = useId()
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes a dialog from anywhere inside it, as the WAI-ARIA dialog pattern has it
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={blurbId} onKeyDown={cancelOnEscape(done)}>
      <form ref={formRef} className="modal" onSubmit={(evt) => { evt.preventDefault(); onSubmit() }}>
        <h3 id={titleId}>{title}</h3>
        <p className="quiet" id={blurbId}>{blurb}</p>
        {children}
        <div role="alert" id={gripeId}>{gripe !== null && <p className="gripe">{gripe.text}</p>}</div>
        {footnote !== undefined && <p className="quiet">{footnote}</p>}
        <div className="row">
          <button type="submit">{submitWord}</button>
          <button type="button" onClick={() => { done('declined') }}>{Messages.cancelButton}</button>
        </div>
      </form>
    </div>
  )
}

/** Whether the focus is inside `container`, read in the document or shadow root it lives in. */
export const holdsFocus = (container: HTMLElement | null): boolean => {
  if (container === null) { return false }
  const root = container.getRootNode()
  // A document and a shadow root each know their own focused element; the document alone would
  // name only the shadow host.
  const focused = root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null
  return container.contains(focused)
}

const MinutesPerHour = 60
const MinutesPerDay = 24 * MinutesPerHour

type Unit = 'day' | 'hour' | 'minute'

/** The lease as a count of whole days, else of whole hours, else of minutes (at least one). */
const leaseCount = (leaseMillis: number): { count: number, unit: Unit } => {
  const minutes = Math.max(1, Math.round(leaseMillis / MinuteMillis))
  if (minutes % MinutesPerDay === 0) { return { count: minutes / MinutesPerDay, unit: 'day' } }
  if (minutes % MinutesPerHour === 0) { return { count: minutes / MinutesPerHour, unit: 'hour' } }
  return { count: minutes, unit: 'minute' }
}

/** One relative-time formatter per locale, made at first use, after any polyfill the host imports has run. */
const relativeTimes = new Map<string, Intl.RelativeTimeFormat>()

/** The formatter for `locale`: numeric 'always', so that one day reads 'in 1 day' and never 'tomorrow'. */
const relativeTimeIn = (locale: string): Intl.RelativeTimeFormat => {
  const made = relativeTimes.get(locale) ?? new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' })
  relativeTimes.set(locale, made)
  return made
}

/** What a dialog promises about how long an unlock lasts, from the bank's `leaseMillis`. */
export const unlockedFor = (leaseMillis: number, creating: boolean): string => {
  // Never compared for equality: the far future is anything within a minute of it.
  if (leaseMillis >= ForeverMillis - MinuteMillis) { return Messages.staysUnlocked }
  const { count, unit } = leaseCount(leaseMillis)
  const relative = relativeTimeIn(Locale).format(count, unit)
  return creating ? Messages.locksIn(relative) : Messages.locksAgainIn(relative)
}
// --

// == [Passphrase field]: UsernameField, PassphraseField, useConfirmation, ConfirmField, PassphraseAdvice, useAdvice, adviceFailed, checkerAdvice

/** The hidden field a password manager files a form's passphrase under, `username`: never shown, never typed. */
export const UsernameField = ({ username }: { username: string }) => (
  // The inline display wins over a host's stylesheet, which can override [hidden].
  <input type="text" name="username" autoComplete="username" value={username} readOnly hidden style={{ display: 'none' }} />
)

/** A passphrase field made for password managers, uncontrolled, with its Show / Hide button and the advice beside it. */
export const PassphraseField = ({ ref, credential, fieldlabel, takesFocus, advice, invalidBy, onChange }: {
  ref:        Ref<HTMLInputElement>
  credential: 'new-password' | 'current-password'
  fieldlabel: string
  takesFocus: boolean
  advice?:    string | null | undefined
  invalidBy?: string | undefined
  onChange:   (typed: string) => void
}) => {
  const reveal = useRevealToggle(Messages.showPassphrase, Messages.hidePassphrase)
  const fieldId = useId()
  const adviceId = useId()
  const describedBy = [advice === undefined ? undefined : adviceId, invalidBy].filter((id) => id !== undefined).join(' ')
  return (
    <>
      <span className="passphrase-field">
        <input
          id={fieldId}
          ref={ref}
          type={reveal.fieldType}
          name={credential}
          autoComplete={credential}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- moving focus to the dialog's first field on open is the WAI-ARIA dialog pattern; the rule aims at page-load autofocus
          autoFocus={takesFocus}
          aria-label={fieldlabel}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          aria-invalid={invalidBy === undefined ? undefined : true}
          placeholder={fieldlabel}
          onChange={(evt) => { onChange(evt.target.value) }}
        />
        {reveal.button(fieldId)}
      </span>
      {/* Mounted with the field, so that each word put in it is announced, politely. */}
      {advice !== undefined && <p className="quiet" id={adviceId} role="status">{advice}</p>}
    </>
  )
}

/** The gripe for a new passphrase and a confirmation that differ. */
const MismatchGripe: Gripe = { text: Messages.passphrasesDiffer, fromPasskey: false, mismatched: true }

/** The confirmation of a new passphrase, and `differs(chosen)` to check it at a submit. */
export const useConfirmation = (setGripe: (gripe: Gripe) => void) => {
  const ref = useRef<HTMLInputElement>(null)
  const gripeId = useId()
  const differs = (chosen: string): boolean => {
    if ((ref.current?.value ?? '') === chosen) { return false }
    setGripe(MismatchGripe)
    return true
  }
  return { ref, gripeId, differs }
}

/** The field that confirms a new passphrase, marked invalid while `gripe` says the two differ. */
export const ConfirmField = ({ ref, gripeId, fieldlabel, gripe, onChange }: {
  ref:        Ref<HTMLInputElement>
  gripeId:    string
  fieldlabel: string
  gripe:      Gripe | null
  onChange:   (typed: string) => void
}) => (
  <PassphraseField
    ref={ref}
    credential="new-password"
    fieldlabel={fieldlabel}
    takesFocus={false}
    invalidBy={gripe?.mismatched === true ? gripeId : undefined}
    onChange={onChange}
  />
)

/** What a host says of a passphrase as the user chooses it, or null for nothing. */
export type PassphraseAdvice = (passphrase: string) => string | null | Promise<string | null>

/** The refusal for a host's `passphraseAdvice` that threw, leaving out what it threw. */
const adviceFailed = (thrown: unknown) => HostErrorSanitizer.refusalFor(thrown, 'unexpected_error', "The passphraseAdvice handed to the dialog threw rather than answering. What it threw is left out of this report, as it may quote the passphrase: have it answer a sentence or null, and catch its own failures.")

/** The bank's own advice: the reason its strength checker gives for a weak passphrase, and nothing for a strong one. */
const checkerAdvice = async (gating: AnyGating, typed: string): Promise<string | null> => {
  const verdict = await gating.checkStrength(typed)
  return verdict.strong ? null : verdict.reason
}

/** What the advice last said of the text typed so far, and `hear` to ask it of a new text. */
export const useAdvice = (passphraseAdvice: PassphraseAdvice | undefined, gating: AnyGating, creating: boolean, fail: (err: unknown) => void) => {
  const [said, setSaid] = useState<string | null>(null)
  const asked = useRef(0)
  // The mode as of the last commit, which an answer on its way is checked against.
  const creatingNow = useRef(creating)
  // A change of mode forgets what was said (React's "adjusting state while rendering"), and makes
  // any answer or failure still on its way stale from the same commit.
  const [saidWhile, setSaidWhile] = useState(creating)
  if (saidWhile !== creating) {
    setSaidWhile(creating)
    setSaid(null)
  }
  useLayoutEffect(() => { creatingNow.current = creating }, [creating])
  const { whenShown } = useWhenShown()
  const hear = async (typed: string) => {
    asked.current += 1
    if (typed === '') { setSaid(null); return }
    const askedNow = asked.current
    // Only the latest call, in the mode it was asked in, is heard.
    const latest = () => askedNow === asked.current && creating === creatingNow.current
    try {
      // A JavaScript host's undefined is nothing to say, as null is.
      const answer = passphraseAdvice === undefined ? await checkerAdvice(gating, typed) : (await passphraseAdvice(typed)) ?? null
      await whenShown(() => { if (latest()) { setSaid(answer) } })
    } catch (err) {
      // The bank's own check throws only a refusal that quotes nothing; the host's may quote anything.
      await whenShown(() => { if (latest()) { fail(passphraseAdvice === undefined ? err : adviceFailed(err)) } })
    }
  }
  return { said, hear }
}
// --
