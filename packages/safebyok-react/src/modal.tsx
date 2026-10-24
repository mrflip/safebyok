import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { ForeverMillis, MinuteMillis, Sanitizer, type Gating, type Outcome, type Vault } from 'safebyok'
import { attemptRefusalFlavor } from './attempt-refusals'
import { Boundary, forBoundary, type BoundarySource } from './boundary'
import { useIsMounted } from './is-mounted'
import { Doing, Locale, Messages } from './messages'
import { useRevealToggle } from './reveal-toggle'

/**
 * The parts every gating's dialog is built of: its one answer, kept above the boundary that shows
 * a calm notice once something not the user's to mend went wrong; the form, with a dialog's
 * semantics; the passphrase field made for password managers, and the advice beside it; and what
 * a form does with each refusal its attempt meets. `PassphraseModal` and `GatingModal` are made of
 * them.
 */

// == [Answer]: DialogAnswer, useAnswerOnce, AnsweringOnce, DialogTrouble, cancelOnEscape

/** How a dialog closed: 'unlocked' once an attempt that leaves the vault unlocked is ok, 'deleted' once a deletion is, 'declined' otherwise. */
export type DialogAnswer = 'unlocked' | 'deleted' | 'declined'

/**
 * The dialog's one answer to `gating`: `done`, which calls the host's `onDone` (as of the last
 * commit) the first time only. A lock landing answers `declined`.
 */
const useAnswerOnce = (gating: Gating, onDone: (answer: DialogAnswer) => void) => {
  const onDoneRef = useRef(onDone)
  useLayoutEffect(() => { onDoneRef.current = onDone })
  const answered = useRef(false)
  const done = useCallback((answer: DialogAnswer) => {
    if (answered.current) { return }
    answered.current = true
    onDoneRef.current(answer)
  }, [])
  useEffect(() => {
    let current = true
    void gating.lockLanded.then(() => { if (current) { done('declined') } })
    return () => { current = false }
  }, [gating, done])
  return done
}

/**
 * A dialog's one answer, kept above its boundary, so that the notice shown once something went
 * wrong follows the gating as the form did: a lock landing closes it, answering `declined`, once,
 * whatever its Close says later. `children` renders the form, handed that one answer.
 */
export const AnsweringOnce = ({ gating, onDone, children }: {
  gating:   Gating
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

/** Escape, from anywhere in a dialog, cancels it, and goes no further: a host's own Escape handler never hears it too. */
const cancelOnEscape = (onDone: (answer: DialogAnswer) => void) => (evt: KeyboardEvent) => {
  if (evt.key !== 'Escape') { return }
  evt.stopPropagation()
  onDone('declined')
}

/**
 * What the dialog shows once something has gone wrong inside it that is not the user's to mend:
 * a calm word saying what it could not do (`doing`), and the way out.
 */
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

/**
 * What the dialog says to the user, and whether it is about the passkey: a word about a typed
 * passphrase goes once the user types again; one about the passkey stays until the next submit,
 * or the next press of the passkey.
 */
export type Gripe = { text: string, fromPasskey: boolean }

/**
 * A form's state around its attempts, for the dialog that `done` answers and `source` names:
 * the `gripe` it shows, `meet`, what it does with a refusal (as `attemptRefusalFlavor` groups
 * them), `fail`, which has the next render throw to the dialog's boundary what an event handler
 * met, `attempt`, one submit's attempt and what follows it, and `isMounted`, asked after each
 * await. A refusal to show in place becomes the gripe; one that ends the gating closes the
 * dialog, answering `declined`; a second attempt while one runs changes nothing.
 */
export const useAttempts = (source: BoundarySource, done: (answer: DialogAnswer) => void) => {
  const [gripe, setGripe] = useState<Gripe | null>(null)
  // Wrapped, so that a failure carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  // A dialog gone meanwhile -- its host took it away, another gating remounted it, or the page
  // closed -- touches neither its state nor its host's onDone again.
  const isMounted = useIsMounted()
  const fail = useCallback((err: unknown) => { setFailure({ err }) }, [])
  if (failure !== null) { throw forBoundary(failure.err, source) }

  const meet = (err: unknown) => {
    const flavor = attemptRefusalFlavor(err)
    // A second submit while the first runs: the first answers for the dialog.
    if (flavor === 'in_flight') { return }
    if (flavor === 'in_place') { setGripe({ text: (err as Error).message, fromPasskey: false }); return }
    // The gating is over, gate_made_elsewhere among it: the next call asks afresh.
    if (flavor === 'close' || flavor === 'gate_made_elsewhere') { done('declined'); return }
    // Thrown from an event handler, it would miss every boundary.
    fail(err)
  }

  const attempt = async (tried: () => Promise<Outcome<Vault>>, answer: DialogAnswer) => {
    setGripe(null)
    const { ok, err } = await tried()
    if (! isMounted()) { return }
    if (ok) { done(answer); return }
    meet(err)
  }

  return { gripe, setGripe, meet, fail, attempt, isMounted }
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

/**
 * A gating's form, with a dialog's semantics: the scrim is the `dialog`, named by its heading and
 * described by its blurb, and Escape anywhere in it cancels; the fields; a live region, mounted
 * from the start, so that each word put in it is announced; then the submit and Cancel buttons.
 * Unstyled markup under the `modal-scrim` / `modal` / `quiet` / `gripe` class names.
 */
export const ModalForm = ({ title, blurb, submitWord, gripe, footnote, formRef, done, onSubmit, children }: ModalFormProps) => {
  const titleId = useId()
  const blurbId = useId()
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes a dialog from anywhere inside it, as the WAI-ARIA dialog pattern has it
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={blurbId} onKeyDown={cancelOnEscape(done)}>
      <form ref={formRef} className="modal" onSubmit={(evt) => { evt.preventDefault(); onSubmit() }}>
        <h3 id={titleId}>{title}</h3>
        <p className="quiet" id={blurbId}>{blurb}</p>
        {children}
        <div role="alert">{gripe !== null && <p className="gripe">{gripe.text}</p>}</div>
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

/**
 * What a dialog promises about how long an unlock lasts, from the vault's `leaseMillis`:
 * 'Locks again on this device in 7 days' (a whole number of days, else of hours, else of
 * minutes, phrased by `Intl.RelativeTimeFormat`), or 'Locks on this device in 7 days' when the
 * dialog is creating the vault, which has nothing yet to lock "again". A lease within a minute
 * of the longest a vault keeps (`ForeverMillis`, which `Infinity` hours becomes) reads as lasting
 * until the user locks it.
 */
export const unlockedFor = (leaseMillis: number, creating: boolean): string => {
  // Never compared for equality: the far future is anything within a minute of it.
  if (leaseMillis >= ForeverMillis - MinuteMillis) { return Messages.staysUnlocked }
  const { count, unit } = leaseCount(leaseMillis)
  const relative = relativeTimeIn(Locale).format(count, unit)
  return creating ? Messages.locksIn(relative) : Messages.locksAgainIn(relative)
}
// --

// == [Passphrase field]: UsernameField, PassphraseField, PassphraseAdvice, useAdvice, adviceFailed, vaultAdvice

/**
 * The hidden field a password manager files a form's passphrase under, `username`: never shown,
 * never typed. One to a form.
 */
export const UsernameField = ({ username }: { username: string }) => (
  // The inline display wins over a host's stylesheet, which can override [hidden].
  <input type="text" name="username" autoComplete="username" value={username} readOnly hidden style={{ display: 'none' }} />
)

/**
 * A passphrase field, made for password managers: `new-password` for one being chosen,
 * `current-password` for one the vault has; uncontrolled, so that React writes nothing typed
 * into the page; never capitalized, corrected or spell-checked; with its Show / Hide button, and,
 * when there is advice to give (`advice` is not undefined), the polite region that says it.
 * `fieldlabel` is its label and placeholder.
 */
export const PassphraseField = ({ ref, credential, fieldlabel, takesFocus, advice, onChange }: {
  ref:        Ref<HTMLInputElement>
  credential: 'new-password' | 'current-password'
  fieldlabel: string
  takesFocus: boolean
  advice?:    string | null | undefined
  onChange:   (typed: string) => void
}) => {
  const reveal = useRevealToggle(Messages.showPassphrase, Messages.hidePassphrase)
  const fieldId = useId()
  const adviceId = useId()
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
          aria-describedby={advice === undefined ? undefined : adviceId}
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

/**
 * What a host says of a passphrase as the user chooses it: a sentence to show beside the field, or
 * null for nothing to say; through a promise, if it must wait. It hears the passphrase itself, in
 * plain text, at every change: keep it on the device -- never send it to a server, log it, or let
 * an error tracker capture it.
 *
 * @example const passphraseAdvice: PassphraseAdvice = (typed) => (typed.length < 12 ? 'Twelve characters or more, please.' : null)
 */
export type PassphraseAdvice = (passphrase: string) => string | null | Promise<string | null>

/** The refusal for a host's `passphraseAdvice` that threw: it heard the passphrase, so nothing of what it threw goes on. */
const adviceFailed = (thrown: unknown) => Sanitizer.refusalFor(thrown, 'unexpected_error', "The passphraseAdvice handed to the dialog threw rather than answering. What it threw is left out of this report, as it may quote the passphrase: have it answer a sentence or null, and catch its own failures.")

/** The vault's own advice: the message of `vault.tryCheckStrength`'s 'weak_passphrase', the checker's reason, and nothing for a passphrase it admits. Any other refusal is thrown. */
const vaultAdvice = async (vault: Vault, typed: string): Promise<string | null> => {
  const checked = await vault.tryCheckStrength(typed)
  if (checked.ok) { return null }
  if (checked.err.refusalkind === 'weak_passphrase') { return checked.err.message }
  throw checked.err
}

/**
 * What the advice last said of the text typed so far -- the host's `passphraseAdvice`, or the
 * vault's own -- and `hear`, which asks it of a new text. Only the answer to the latest text is
 * kept, and only the latest call's failure goes to `fail`; an empty text has nothing said of it,
 * nor has an undefined answer; what was said goes when `creating` changes; and nothing comes back
 * once the dialog has gone.
 */
export const useAdvice = (passphraseAdvice: PassphraseAdvice | undefined, vault: Vault, creating: boolean, fail: (err: unknown) => void) => {
  const [said, setSaid] = useState<string | null>(null)
  const asked = useRef(0)
  // A change of mode forgets what was said (React's "adjusting state while rendering"), and makes
  // any answer or failure still on its way stale, in the same commit. The dialog unmounting makes
  // them stale too, so that none reaches a dialog that has gone.
  const [saidWhile, setSaidWhile] = useState(creating)
  if (saidWhile !== creating) {
    setSaidWhile(creating)
    setSaid(null)
  }
  useLayoutEffect(() => {
    return () => { asked.current += 1 }
  }, [creating])
  const hear = async (typed: string) => {
    asked.current += 1
    if (typed === '') { setSaid(null); return }
    const askedNow = asked.current
    try {
      // A JavaScript host's undefined is nothing to say, as null is.
      const answer = passphraseAdvice === undefined ? await vaultAdvice(vault, typed) : (await passphraseAdvice(typed)) ?? null
      if (askedNow === asked.current) { setSaid(answer) }
    } catch (err) {
      // Only the latest call can fail: a superseded one's failure is as stale as its answer. The
      // vault's own check throws only a refusal that quotes nothing; the host's may quote anything.
      if (askedNow === asked.current) { fail(passphraseAdvice === undefined ? err : adviceFailed(err)) }
    }
  }
  return { said, hear }
}
// --
