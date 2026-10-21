import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type Ref, type SubmitEvent } from 'react'
import { ForeverMillis, MinuteMillis, Sanitizer, isCondition, isVaultError, type Ask, type ProofAnswer } from 'safebyok'
import { attemptRefusalFlavor } from './attempt-refusals'
import { Boundary, forBoundary, useRoundFor } from './boundary'
import { Locale, Messages } from './messages'
import { PasskeyUnlockButton, offersPasskey } from './passkey-unlock-button'
import { useIsMounted } from './is-mounted'
import { useRevealToggle } from './reveal-toggle'

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
 * What the dialog promises about how long an unlock lasts, from the vault's `leaseMillis`:
 * 'Locks again on this device in 7 days' (a whole number of days, else of hours, else of
 * minutes, phrased by `Intl.RelativeTimeFormat`), or 'Locks on this device in 7 days' when the
 * dialog is creating the vault, which has nothing yet to lock "again". A lease within a minute
 * of the longest a vault keeps (`ForeverMillis`, which `Infinity` hours becomes) reads as lasting
 * until the user locks it.
 */
const unlockedFor = (leaseMillis: number, creating: boolean): string => {
  // Never compared for equality: the far future is anything within a minute of it.
  if (leaseMillis >= ForeverMillis - MinuteMillis) { return Messages.staysUnlocked }
  const { count, unit } = leaseCount(leaseMillis)
  const relative = relativeTimeIn(Locale).format(count, unit)
  return creating ? Messages.locksIn(relative) : Messages.locksAgainIn(relative)
}

/**
 * The passphrase dialog: safebyok-react's `getProof`, which `VaultProvider` shows for each
 * {@link Ask} the vault hands it, unless given a `getProof` of the host's own. A host writing its
 * own `getProof` may render it too: hand it the ask, and answer with what `onDone` is told.
 * Unstyled markup under the `modal-scrim` / `modal` / `quiet` / `gripe` class names, for the
 * host's stylesheet to dress, with a dialog's semantics: the scrim is the `dialog`, named by its
 * heading, and Escape anywhere in it cancels, answering `declined`. Each submit is one
 * `ask.attempt`. Its behaviors are the contract: an ask whose `why` is `absent` reads as "choose a
 * passphrase" (it creates the vault); a wrong passphrase stays in the dialog with a calm message;
 * an attempt that is ok answers `unlocked`; and a lock that lands while it is up -- its ask's
 * `lockLanded` -- closes it, answering `declined`, as does an attempt the lock won. Whichever the
 * case, it says plainly that a forgotten passphrase cannot be recovered, and how long an unlock
 * lasts on this device. For a vault with a passkey, in a browser offering WebAuthn, "Use a
 * passkey" comes first, and takes the focus. A vault that comes to be unlocked while it asks for
 * a locked or absent one -- by `unlock()` elsewhere in the app, say -- answers it `unlocked`.
 *
 * It follows the vault as it changes -- a vault made on another device meanwhile turns "choose"
 * into "unlock", a passkey added brings its button -- and handed another ask, it starts afresh,
 * keeping nothing typed for the last. Taken away, it lets go: an attempt, a delete or advice still
 * under way finishes unheard, calling `onDone` no more and showing nothing. It calls `onDone` once.
 *
 * The refusals an attempt meets it handles as `Ask.attempt` groups them. A wrong
 * passphrase or passkey, a weak new passphrase, or a way in that cannot answer shows in the dialog
 * in place, in the vault's own calm words, through a live region a screen reader announces, and
 * the user may try again or cancel. A lock that won, storage out of reach, or any other refusal
 * closes it, answering `declined`. A first unlock that
 * lost the race to create the vault to another device (`created_elsewhere`) is shown as advice,
 * in the `quiet` style rather than the `gripe` one -- it is no typo -- and the dialog, now an
 * unlock of that vault, stays open: the field is emptied and focused for the passphrase chosen
 * there, and the advice stays, through typing, until the next submit. Anything else --
 * misuse, such as a closed vault handle, or a failure that is no VaultError -- never reaches the
 * host's page: the dialog shows a calm notice in its place, "Something went wrong", whose Close
 * (or Escape) calls `onDone('declined')` -- unless a lock lands or the vault unlocks under it first,
 * as for the form -- and React reports the error, carrying nothing typed, through the root's
 * `onCaughtError` (the console, by default, with the component stack), where the developer and an
 * error tracker meet it. A passkey that fails that way takes its button away and leaves the
 * passphrase.
 *
 * How long a lease lasts it reads from the vault itself (its `leaseMillis`, the `leaseHours` it
 * was opened with): 'Locks again on this device in 7 days', 'in 15 minutes', 'Stays unlocked on
 * this device until you lock it' for `Infinity`; while it creates the vault, 'Locks on this
 * device in 7 days', with nothing yet to lock again. Nobody need tell the dialog the lease again.
 * It needs `Intl.RelativeTimeFormat`, which a host on an engine without it (Hermes, an older
 * browser) supplies with the standard polyfill: the README says how.
 *
 * With `allowStartOver`, a user who has forgotten the passphrase is offered a way out: "Forgot it?
 * Start a new vault" asks first, then deletes the vault (`vault.del()`, on every device). A
 * delete lands as a lock does, so the dialog then closes, answering `declined`, and the next call
 * that needs the vault asks the user to choose a passphrase for the new one. Off by default.
 *
 * The passphrase field is made for password managers, so that a user may keep a long, strong
 * passphrase without remembering it: a real form, `autocomplete="new-password"` while choosing
 * (a manager offers to generate one, and to save it) and `current-password` while unlocking (it
 * offers the one it saved), and beside it a hidden `autocomplete="username"` field naming what the
 * manager files it under, `passphraseUsername`. That defaults to the user and the vault, as
 * 'u1 (main vault)'; never make it the user's sign-in name alone, or a manager may take the
 * passphrase for their sign-in password and offer to overwrite it. The field is uncontrolled, so
 * React never writes what is typed into the page; a Show / Hide button reveals it, and it is
 * never capitalized, corrected or spell-checked.
 *
 * While the user chooses a passphrase, `passphraseAdvice` hears what they have typed after each
 * change, and what it answers shows beside the field, tied to it by `aria-describedby` and
 * announced politely: 'Longer is stronger: try a few unrelated words'. It answers null for
 * nothing to say, and may answer through a promise; only the answer to the latest text shows.
 * Left out, the dialog asks `vault.checkPassphrase`, and shows its reason for a passphrase it
 * finds weak, so the advice and Create decide alike. It is advice: what the vault itself refuses
 * at creation shows as any refusal does. It is never asked while unlocking.
 *
 * Advice that throws, and an attempt that throws rather than refusing (a broken strength checker),
 * are not the dialog's to handle: the dialog throws them on to the app's error boundary, above its
 * own. Advice of the host's that throws is reported as 'unexpected_error', carrying nothing of
 * what it heard; the vault's own check throws a refusal that quotes nothing, which goes on as it is.
 *
 * @example
 *   const getProof: GetProof = (ask) => new Promise((answer) => { showDialog(<PassphraseModal ask={ask} onDone={answer} />) })
 * @example <PassphraseModal ask={ask} allowStartOver onDone={answer} />  // offers to delete the vault and start over
 * @example <PassphraseModal ask={ask} passphraseUsername={`${email} (vault)`} onDone={answer} />
 * @example <PassphraseModal ask={ask} passphraseAdvice={(typed) => (typed.length < 12 ? 'Twelve characters or more, please.' : null)} onDone={answer} />
 */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <AnsweringOnce key={useRoundFor(props.ask)} {...props} />
)

/**
 * The dialog's one answer, kept above its boundary, so that the notice shown once something went
 * wrong follows the ask as the form did: a lock landing closes it, answering `declined`, and a vault
 * unlocked under it answers `unlocked`, once, whatever its Close says later.
 */
const AnsweringOnce = (props: PassphraseModalProps) => {
  const { ask, onDone } = props
  const snapshot = useSyncExternalStore(ask.vault.subscribe, ask.vault.getSnapshot)
  const done = useAnswerOnce(ask, onDone, snapshot.state === 'unlocked')
  // What the form threw rather than met: thrown here, above the dialog's boundary, for the app's.
  // Wrapped, so that a failure carrying any value at all still reads as "failed".
  const [raised, setRaised] = useState<{ err: unknown } | null>(null)
  const raise = useCallback((err: unknown) => { setRaised({ err }) }, [])
  if (raised !== null) { throw forBoundary(raised.err, 'PassphraseModal') }
  return (
    <Boundary fallback={<DialogTrouble onDone={done} />}>
      <UnlockForm {...props} onDone={done} raise={raise} />
    </Boundary>
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

/** What PassphraseModal is handed. */
export type PassphraseModalProps = {
  /** The ask the dialog answers, as the vault handed it to `getProof`. */
  ask:                 Ask
  /** Called once, with the dialog's answer: 'unlocked' once an attempt is ok, 'declined' otherwise. */
  onDone:              (answer: ProofAnswer) => void
  /** Whether to offer a user who has forgotten the passphrase to delete the vault and start a new one. */
  allowStartOver?:     boolean | undefined
  /** What a password manager files the passphrase under. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. Default: `vault.checkPassphrase`'s reason for a weak one. */
  passphraseAdvice?:   PassphraseAdvice | undefined
}

/** The refusal for a host's `passphraseAdvice` that threw: it heard the passphrase, so nothing of what it threw goes on. */
const adviceFailed = (thrown: unknown) => Sanitizer.refusalFor(thrown, 'unexpected_error', "The passphraseAdvice handed to the dialog threw rather than answering. What it threw is left out of this report, as it may quote the passphrase: have it answer a sentence or null, and catch its own failures.")

/** The vault's own advice: `vault.checkPassphrase`'s reason for a passphrase it finds weak, and nothing for one it admits. */
const vaultAdvice = async (vault: Ask['vault'], typed: string): Promise<string | null> => {
  const verdict = await vault.checkPassphrase(typed)
  return verdict.strong ? null : verdict.reason
}

/** Escape, from anywhere in a dialog, cancels it, and goes no further: a host's own Escape handler never hears it too. */
const cancelOnEscape = (onDone: (answer: ProofAnswer) => void) => (evt: KeyboardEvent) => {
  if (evt.key !== 'Escape') { return }
  evt.stopPropagation()
  onDone('declined')
}

/**
 * What the dialog shows once something has gone wrong inside it that is not the user's to mend:
 * a calm word, and the way out.
 */
const DialogTrouble = ({ onDone }: { onDone: (answer: ProofAnswer) => void }) => {
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
        <p className="gripe" id={wordId}>{Messages.troubleWord}</p>
        <div className="row">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the field that held focus is gone; the WAI-ARIA dialog pattern moves focus to the dialog's one control */}
          <button type="button" autoFocus onClick={() => { onDone('declined') }}>{Messages.closeButton}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * What the dialog says to the user, whether it is about the passkey, and whether it is advice
 * rather than a complaint: a word about the typed passphrase goes once the user types again;
 * one about the passkey stays until the next submit, or the next press of the passkey. Advice
 * (a vault created on another device meanwhile) shows in the `quiet` style, not the `gripe` one,
 * and stays until the next submit as the passkey's does: the user's first move is to clear the
 * field, and the advice is what tells them what to type instead.
 */
type Gripe = { text: string, fromPasskey: boolean, asAdvice: boolean }

/** Whether the focus is inside `container`, read in the document or shadow root it lives in. */
const holdsFocus = (container: HTMLElement | null): boolean => {
  if (container === null) { return false }
  const root = container.getRootNode()
  // A document and a shadow root each know their own focused element; the document alone would
  // name only the shadow host.
  const focused = root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null
  return container.contains(focused)
}

/**
 * What the advice last said of the text typed so far -- the host's `passphraseAdvice`, or the
 * vault's own -- and `hear`, which asks it of a new text. Only the answer to the latest text is
 * kept, and only the latest call's failure goes to `fail`; an empty text has nothing said of it,
 * nor has an undefined answer; what was said goes when `creating` changes; and nothing comes back
 * once the dialog has gone.
 */
const useAdvice = (passphraseAdvice: PassphraseAdvice | undefined, vault: Ask['vault'], creating: boolean, fail: (err: unknown) => void) => {
  const [said, setSaid] = useState<string | null>(null)
  const asked = useRef(0)
  // A change of mode -- the vault made elsewhere, or deleted -- forgets what was said (React's
  // "adjusting state while rendering"), and makes any answer or failure still on its way stale,
  // in the same commit: advice given while choosing never shows again after the vault changed.
  // The dialog unmounting makes them stale too, so that none reaches a dialog that has gone.
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

/**
 * The passphrase field, made for password managers: the hidden username they file it under, the
 * field itself (`new-password` while choosing, `current-password` while unlocking), uncontrolled
 * so that React writes nothing typed into the page, its Show / Hide button, and, when there is
 * advice to give (`advice` is not undefined), the polite region that says it.
 */
const PassphraseField = ({ ref, creating, takesFocus, username, advice, onChange }: {
  ref:        Ref<HTMLInputElement>
  creating:   boolean
  takesFocus: boolean
  username:   string
  advice:     string | null | undefined
  onChange:   (typed: string) => void
}) => {
  const reveal = useRevealToggle(Messages.showPassphrase, Messages.hidePassphrase)
  const fieldId = useId()
  const adviceId = useId()
  const credential = creating ? 'new-password' : 'current-password'
  return (
    <>
      {/* What a password manager files the passphrase under: never shown, never typed. The inline
          display wins over a host's stylesheet, which can override [hidden]. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden style={{ display: 'none' }} />
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
          aria-label={Messages.passphraseField}
          aria-describedby={advice === undefined ? undefined : adviceId}
          placeholder={Messages.passphraseField}
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
 * The dialog's one answer to `ask`: `done`, which calls the host's `onDone` (as of the last
 * commit) the first time only. A lock landing answers `declined`, and a vault `unlocked` under a
 * dialog asking for a locked or absent one answers `unlocked`.
 */
const useAnswerOnce = (ask: Ask, onDone: (answer: ProofAnswer) => void, unlocked: boolean) => {
  const onDoneRef = useRef(onDone)
  useLayoutEffect(() => { onDoneRef.current = onDone })
  const answered = useRef(false)
  const done = useCallback((answer: ProofAnswer) => {
    if (answered.current) { return }
    answered.current = true
    onDoneRef.current(answer)
  }, [])
  useEffect(() => {
    let current = true
    void ask.lockLanded.then(() => { if (current) { done('declined') } })
    return () => { current = false }
  }, [ask, done])
  const unlockedUnder = ask.why !== 'lease_ending' && unlocked
  useEffect(() => { if (unlockedUnder) { done('unlocked') } }, [unlockedUnder, done])
  return done
}

/** The dialog itself, inside PassphraseModal's boundary: its `onDone` is the one answer, `AnsweringOnce`'s. */
const UnlockForm = ({ ask, onDone: done, raise, allowStartOver, passphraseUsername, passphraseAdvice }: PassphraseModalProps & { raise: (err: unknown) => void }) => {
  const { vault } = ask
  const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
  const [gripe, setGripe] = useState<Gripe | null>(null)
  const [startingOver, setStartingOver] = useState(false)
  // While a delete runs, so that a second press never starts another.
  const [deleting, setDeleting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  // Asked after each await: a dialog gone meanwhile -- its host took it away, another vault
  // remounted it, or the page closed -- touches neither its state nor its host's onDone again.
  const isMounted = useIsMounted()
  const titleId = useId()
  const blurbId = useId()
  // Wrapped, so that a failure carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  // Advice that throws is the app's to handle, never the dialog's.
  const advice = useAdvice(passphraseAdvice, vault, snapshot.state === 'absent', raise)
  if (failure !== null) { throw forBoundary(failure.err, 'PassphraseModal') }
  const creating = snapshot.state === 'absent'
  const passkeyFirst = ! creating && offersPasskey(snapshot)
  const windowLine = unlockedFor(vault.leaseMillis, creating)
  // Asked only of a vault there is to delete: one deleted meanwhile has the user choose anew, and
  // ends the question, so that a vault made after it is never asked of. React's "adjusting state
  // while rendering": it renders again at once, before committing this.
  if (startingOver && creating) { setStartingOver(false) }
  const askingStartOver = startingOver && ! creating

  /** A refusal the user meets, as `attemptRefusalFlavor` groups them: in place, as advice, closing the dialog, or misuse rethrown in render, for PassphraseModal's boundary. */
  const meet = (err: unknown) => {
    const flavor = attemptRefusalFlavor(err)
    if (flavor === 'created_elsewhere') {
      // The passphrase typed has just been shown not to open the vault: the field is emptied for
      // the one chosen on the other device, and the advice stays until the next submit.
      setGripe({ text: (err as Error).message, fromPasskey: false, asAdvice: true })
      if (fieldRef.current !== null) { fieldRef.current.value = '' }
      fieldRef.current?.focus()
      return
    }
    if (flavor === 'in_place') { setGripe({ text: (err as Error).message, fromPasskey: false, asAdvice: false }); return }
    if (flavor === 'close') { done('declined'); return }
    // Thrown from an event handler, it would miss every boundary.
    setFailure({ err })
  }

  const submit = async (evt: SubmitEvent) => {
    evt.preventDefault()
    setGripe(null)
    let tried: Awaited<ReturnType<Ask['attempt']>>
    try {
      tried = await ask.attempt(fieldRef.current?.value ?? '')
    } catch (err) {
      // An attempt throws only what no refusal says, a broken strength checker: the app's to handle.
      if (isMounted()) { raise(err) }
      return
    }
    const { ok, err } = tried
    if (! isMounted()) { return }
    if (ok) { done('unlocked'); return }
    meet(err)
  }

  const startOver = async () => {
    setDeleting(true)
    setGripe(null)
    const { ok, err } = await vault.tryDel()
    if (! isMounted()) { return }
    setDeleting(false)
    // A delete lands as a lock: lockLanded closes the dialog.
    if (ok) { setStartingOver(false); return }
    // The vault the user agreed to delete was deleted already, or made anew, elsewhere: what
    // stands now was never confirmed, so the question goes, to be asked afresh.
    if (isVaultError(err, 'stale_write')) { setStartingOver(false) }
    // A condition the delete meets is shown in place, to try again; misuse goes to the boundary.
    if (isCondition(err)) { setGripe({ text: err.message, fromPasskey: false, asAdvice: false }); return }
    setFailure({ err })
  }

  /** Each change to the field: a complaint about what was typed before goes (a passkey's word, or a vault made elsewhere, stays till the next submit), and, while choosing, the host's advice is asked anew. */
  const hearPassphrase = (typed: string) => {
    setGripe((prev) => (prev?.fromPasskey === true || prev?.asAdvice === true ? prev : null))
    if (creating) { void advice.hear(typed) }
  }

  const passkeyGripe = (text: string | null) => {
    setGripe(text === null ? null : { text, fromPasskey: true, asAdvice: false })
    // A passkey button that took itself away took the focus with it: back to the passphrase.
    if (text !== null && ! holdsFocus(formRef.current)) { fieldRef.current?.focus() }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes a dialog from anywhere inside it, as the WAI-ARIA dialog pattern has it
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={blurbId} onKeyDown={cancelOnEscape(done)}>
      <form ref={formRef} className="modal" onSubmit={(evt) => { void submit(evt) }}>
        <h3 id={titleId}>{creating ? Messages.chooseTitle : Messages.unlockTitle}</h3>
        <p className="quiet" id={blurbId}>{creating ? Messages.chooseBlurb : Messages.unlockBlurb}</p>
        {askingStartOver
          ? <p className="gripe">{Messages.startOverQuestion}</p>
          : (
            <>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the passkey is the dialog's first choice: the WAI-ARIA dialog pattern moves focus to its first control */}
              {passkeyFirst && <PasskeyUnlockButton ask={ask} autoFocus onDone={done} onGripe={passkeyGripe} />}
              <PassphraseField
                ref={fieldRef}
                creating={creating}
                takesFocus={! passkeyFirst}
                username={passphraseUsername ?? Messages.passphraseUsername(snapshot.user_id, snapshot.vaultlabel)}
                advice={creating ? advice.said : undefined}
                onChange={hearPassphrase}
              />
            </>
          )}
        {/* A live region, mounted from the start, so that each word put in it is announced. */}
        <div role="alert">{gripe !== null && <p className={gripe.asAdvice ? 'quiet' : 'gripe'}>{gripe.text}</p>}</div>
        {! askingStartOver && <p className="quiet">{windowLine}</p>}
        {askingStartOver
          ? (
            <div className="row" key="start-over">
              <button type="button" disabled={deleting} onClick={() => { void startOver() }}>{Messages.startOverConfirm}</button>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the button that held focus is gone; it moves to the choice that loses nothing */}
              <button type="button" autoFocus onClick={() => { setStartingOver(false); setGripe(null) }}>{Messages.startOverBack}</button>
            </div>
          )
          : (
            <div className="row" key="unlock">
              <button type="submit">{creating ? Messages.createButton : Messages.unlockButton}</button>
              <button type="button" onClick={() => { done('declined') }}>{Messages.cancelButton}</button>
              {allowStartOver === true && ! creating && (
                <button type="button" className="quiet" onClick={() => { setStartingOver(true); setGripe(null) }}>{Messages.startOverButton}</button>
              )}
            </div>
          )}
      </form>
    </div>
  )
}
