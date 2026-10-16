import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type Ref, type SubmitEvent } from 'react'
import { ForeverMillis, MinuteMillis, isVaultCondition, isVaultError, type Vault } from 'safebyok'
import { Boundary, useRoundFor } from './boundary'
import { Locale, Messages } from './messages'
import { PasskeyUnlockButton, offersPasskey } from './passkey-unlock-button'
import { useRevealToggle } from './reveal-toggle'

const MinutesPerHour = 60
const MinutesPerDay = 24 * MinutesPerHour

type Unit = 'day' | 'hour' | 'minute'

/** The window as a count of whole days, else of whole hours, else of minutes (at least one). */
const windowCount = (reentryWindowMillis: number): { count: number, unit: Unit } => {
  const minutes = Math.max(1, Math.round(reentryWindowMillis / MinuteMillis))
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
 * What the dialog promises about how long an unlock lasts, from the vault's `reentryWindowMillis`:
 * 'Locks again on this device in 7 days' (a whole number of days, else of hours, else of
 * minutes, phrased by `Intl.RelativeTimeFormat`), or 'Locks on this device in 7 days' when the
 * dialog is creating the vault, which has nothing yet to lock "again". A window within a minute
 * of the longest a vault keeps (`ForeverMillis`, which `Infinity` hours becomes) reads as lasting
 * until the user locks it.
 */
const unlockedFor = (reentryWindowMillis: number, creating: boolean): string => {
  // Never compared for equality: the far future is anything within a minute of it.
  if (reentryWindowMillis >= ForeverMillis - MinuteMillis) { return Messages.staysUnlocked }
  const { count, unit } = windowCount(reentryWindowMillis)
  const relative = relativeTimeIn(Locale).format(count, unit)
  return creating ? Messages.locksIn(relative) : Messages.locksAgainIn(relative)
}

/**
 * The dialog withUnlockedVault summons when the vault turns out to be locked. Unstyled markup
 * under the `modal-scrim` / `modal` / `quiet` / `gripe` class names, for the host's stylesheet
 * to dress, with a dialog's semantics: the scrim is the `dialog`, named by its heading, and
 * Escape anywhere in it cancels. Its behaviors are the contract: a first-ever unlock reads as
 * "choose a passphrase" (it creates the vault); a wrong passphrase stays in the dialog with a
 * calm message rather than failing the action; and an unlock that loses to a `lock()` called
 * while it ran closes the dialog as if dismissed. Whichever the case, it says plainly that a
 * forgotten passphrase cannot be recovered, and how long an unlock lasts on this device. For a
 * vault with a passkey, in a browser offering WebAuthn, "Use a passkey" comes first, and takes
 * the focus.
 *
 * It follows the vault as it changes -- a vault made on another device meanwhile turns "choose"
 * into "unlock", a passkey added brings its button -- and handed another vault, it starts afresh,
 * keeping nothing typed for the last.
 *
 * A condition the unlock meets (storage that cannot be reached, a record that fails
 * verification) shows in the dialog in place, in the vault's own calm words, through a live
 * region a screen reader announces, and the user may try again or cancel. Anything else --
 * misuse, such as a closed vault handle, or a failure that is no VaultError -- never reaches the
 * host's page: the dialog shows a calm notice in its place, "Something went wrong", whose Close
 * (or Escape) calls `onDone(false)`, and React reports the error through the root's
 * `onCaughtError` (the console, by default, with the component stack), where the developer and an
 * error tracker meet it. A passkey that fails that way takes its button away and leaves the
 * passphrase.
 *
 * How long an unlock lasts it reads from the vault itself (its `reentryWindowMillis`, the
 * `forcePassphraseReentryHours` it was opened with): 'Locks again on this device in 7 days', 'in 15
 * minutes', 'Stays unlocked on this device until you lock it' for `Infinity`; while it creates the
 * vault, 'Locks on this device in 7 days', with nothing yet to lock again. Nobody need tell the
 * dialog the window again. It needs `Intl.RelativeTimeFormat`, which a host on an engine without
 * it (Hermes, an older browser) supplies with the standard polyfill: the README says how.
 *
 * With `allowStartOver`, a user who has forgotten the passphrase is offered a way out: "Forgot it?
 * Start a new vault" asks first, then erases the vault (`vault.destroy()`, on every device) and
 * turns the dialog into "Choose a vault passphrase" for the new one. Off by default.
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
 * While the user chooses a passphrase, `passphraseAdvice` (if given) hears what they have typed
 * after each change, and what it answers shows beside the field, tied to it by
 * `aria-describedby` and announced politely: 'Longer is stronger: try a few unrelated words'.
 * It answers null for nothing to say, and may answer through a promise; only the answer to the
 * latest text shows. It is advice: what the vault itself refuses at creation shows as any refusal
 * does. It is never asked while unlocking.
 *
 * @example
 *   <PassphraseModal vault={vault} onDone={(unlocked) => { setAsking(false) }} />
 * @example <PassphraseModal vault={vault} allowStartOver onDone={close} />  // offers to erase and start over
 * @example <PassphraseModal vault={vault} passphraseUsername={`${email} (vault)`} onDone={close} />
 * @example <PassphraseModal vault={vault} passphraseAdvice={(typed) => (typed.length < 12 ? 'Twelve characters or more, please.' : null)} onDone={close} />
 */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <Boundary key={useRoundFor(props.vault)} fallback={<DialogTrouble onDone={props.onDone} />}>
    <UnlockForm {...props} />
  </Boundary>
)

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
  vault:               Vault
  onDone:              (unlocked: boolean) => void
  /** Whether to offer a user who has forgotten the passphrase to erase the vault and start a new one. */
  allowStartOver?:     boolean | undefined
  /** What a password manager files the passphrase under. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. Default: nothing. */
  passphraseAdvice?:   PassphraseAdvice | undefined
}

/** Escape, from anywhere in a dialog, cancels it, and goes no further: a host's own Escape handler never hears it too. */
const cancelOnEscape = (onDone: (unlocked: boolean) => void) => (evt: KeyboardEvent) => {
  if (evt.key !== 'Escape') { return }
  evt.stopPropagation()
  onDone(false)
}

/**
 * What the dialog shows once something has gone wrong inside it that is not the user's to mend:
 * a calm word, and the way out.
 */
const DialogTrouble = ({ onDone }: { onDone: (unlocked: boolean) => void }) => {
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
          <button type="button" autoFocus onClick={() => { onDone(false) }}>{Messages.closeButton}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * What the dialog says to the user, and whether it is about the passkey: a word about the typed
 * passphrase goes once the user types again; one about the passkey stays until the next submit,
 * or the next press of the passkey.
 */
type Gripe = { text: string, fromPasskey: boolean }

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
 * What the host's `passphraseAdvice` last said of the text typed so far, and `hear`, which asks it
 * of a new text. Only the answer to the latest text is kept; an empty text has nothing said of
 * it; advice that throws or rejects goes to `fail`.
 */
const useAdvice = (passphraseAdvice: PassphraseAdvice | undefined, fail: (err: unknown) => void) => {
  const [said, setSaid] = useState<string | null>(null)
  const asked = useRef(0)
  const hear = async (typed: string) => {
    if (passphraseAdvice === undefined) { return }
    asked.current += 1
    if (typed === '') { setSaid(null); return }
    const askedNow = asked.current
    try {
      const answer = await passphraseAdvice(typed)
      if (askedNow === asked.current) { setSaid(answer) }
    } catch (err) {
      fail(err)
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
      {/* What a password manager files the passphrase under: never shown, never typed. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
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

/** The dialog itself, inside PassphraseModal's boundary. */
const UnlockForm = ({ vault, onDone, allowStartOver, passphraseUsername, passphraseAdvice }: PassphraseModalProps) => {
  const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
  const [gripe, setGripe] = useState<Gripe | null>(null)
  const [startingOver, setStartingOver] = useState(false)
  // While an erase runs, so that a second press never starts another.
  const [erasing, setErasing] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const blurbId = useId()
  // Wrapped, so that a failure carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  const advice = useAdvice(passphraseAdvice, (err) => { setFailure({ err }) })
  if (failure !== null) { throw failure.err }
  const creating = snapshot.state === 'absent'
  const passkeyFirst = ! creating && offersPasskey(snapshot)
  const windowLine = unlockedFor(vault.reentryWindowMillis, creating)
  // Asked only of a vault there is to erase: one erased meanwhile has the user choose anew, and
  // ends the question, so that a vault made after it is never asked of. React's "adjusting state
  // while rendering": it renders again at once, before committing this.
  if (startingOver && creating) { setStartingOver(false) }
  const askingStartOver = startingOver && ! creating

  /** A refusal the user meets: a condition shown in place, misuse rethrown in render, for PassphraseModal's boundary. */
  const meet = (err: unknown) => {
    if (isVaultCondition(err)) { setGripe({ text: err.message, fromPasskey: false }); return }
    // Thrown from an event handler, it would miss every boundary.
    setFailure({ err })
  }

  const submit = async (evt: SubmitEvent) => {
    evt.preventDefault()
    setGripe(null)
    try {
      await vault.unlock(fieldRef.current?.value ?? '')
      onDone(true)
    } catch (err) {
      // The vault was locked while this unlock was under way, and the lock wins: as if dismissed.
      if (isVaultError(err, 'vault_locked')) { onDone(false); return }
      meet(err)
    }
  }

  const startOver = async () => {
    setErasing(true)
    setGripe(null)
    try {
      await vault.destroy()
      setStartingOver(false)
    } catch (err) {
      // The vault the user agreed to erase was destroyed or made anew elsewhere: what stands now
      // was never confirmed, so the question goes, to be asked afresh.
      if (isVaultError(err, 'stale_write')) { setStartingOver(false) }
      meet(err)
    } finally {
      setErasing(false)
    }
  }

  /** Each change to the field: a word about what was typed before goes, and, while choosing, the host's advice is asked anew. */
  const hearPassphrase = (typed: string) => {
    setGripe((prev) => (prev?.fromPasskey === true ? prev : null))
    if (creating) { void advice.hear(typed) }
  }

  const passkeyGripe = (text: string | null) => {
    setGripe(text === null ? null : { text, fromPasskey: true })
    // A passkey button that took itself away took the focus with it: back to the passphrase.
    if (text !== null && ! holdsFocus(formRef.current)) { fieldRef.current?.focus() }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes a dialog from anywhere inside it, as the WAI-ARIA dialog pattern has it
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={blurbId} onKeyDown={cancelOnEscape(onDone)}>
      <form ref={formRef} className="modal" onSubmit={(evt) => { void submit(evt) }}>
        <h3 id={titleId}>{creating ? Messages.chooseTitle : Messages.unlockTitle}</h3>
        <p className="quiet" id={blurbId}>{creating ? Messages.chooseBlurb : Messages.unlockBlurb}</p>
        {askingStartOver
          ? <p className="gripe">{Messages.startOverQuestion}</p>
          : (
            <>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the passkey is the dialog's first choice: the WAI-ARIA dialog pattern moves focus to its first control */}
              {passkeyFirst && <PasskeyUnlockButton vault={vault} autoFocus onDone={onDone} onGripe={passkeyGripe} />}
              <PassphraseField
                ref={fieldRef}
                creating={creating}
                takesFocus={! passkeyFirst}
                username={passphraseUsername ?? Messages.passphraseUsername(snapshot.scope.user_id, snapshot.scope.vaultlabel)}
                advice={creating && passphraseAdvice !== undefined ? advice.said : undefined}
                onChange={hearPassphrase}
              />
            </>
          )}
        {/* A live region, mounted from the start, so that each word put in it is announced. */}
        <div role="alert">{gripe !== null && <p className="gripe">{gripe.text}</p>}</div>
        {! askingStartOver && <p className="quiet">{windowLine}</p>}
        {askingStartOver
          ? (
            <div className="row" key="start-over">
              <button type="button" disabled={erasing} onClick={() => { void startOver() }}>{Messages.startOverConfirm}</button>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the button that held focus is gone; it moves to the choice that loses nothing */}
              <button type="button" autoFocus onClick={() => { setStartingOver(false); setGripe(null) }}>{Messages.startOverBack}</button>
            </div>
          )
          : (
            <div className="row" key="unlock">
              <button type="submit">{creating ? Messages.createButton : Messages.unlockButton}</button>
              <button type="button" onClick={() => { onDone(false) }}>{Messages.cancelButton}</button>
              {allowStartOver === true && ! creating && (
                <button type="button" className="quiet" onClick={() => { setStartingOver(true); setGripe(null) }}>{Messages.startOverButton}</button>
              )}
            </div>
          )}
      </form>
    </div>
  )
}
