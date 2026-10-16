import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type SubmitEvent } from 'react'
import { ForeverMillis, MinuteMillis, isVaultCondition, isVaultError, type Vault } from 'safebyok'
import { Boundary, useRoundFor } from './boundary'
import { Locale, Messages } from './messages'
import { PasskeyUnlockButton, offersPasskey } from './passkey-unlock-button'

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

/**
 * Whether this engine phrases relative times (`Intl.RelativeTimeFormat`), as every current
 * browser does. Where it does not, the dialog leaves out how long an unlock lasts, and a host
 * that wants the line there imports the standard polyfill, `@formatjs/intl-relativetimeformat`.
 */
export const phrasesRelativeTime = (): boolean => typeof (Intl as Partial<typeof Intl>).RelativeTimeFormat === 'function'

/**
 * What the dialog promises about how long an unlock lasts, from the vault's `reentryWindowMillis`:
 * 'Locks again on this device in 7 days' (a whole number of days, else of hours, else of
 * minutes, phrased by `Intl.RelativeTimeFormat`), or 'Locks on this device in 7 days' when the
 * dialog is creating the vault, which has nothing yet to lock "again". A window within a minute
 * of the longest a vault keeps (`ForeverMillis`, which `Infinity` hours becomes) reads as lasting
 * until the user locks it. Null on an engine that cannot phrase a relative time.
 */
const unlockedFor = (reentryWindowMillis: number, creating: boolean): string | null => {
  // Never compared for equality: the far future is anything within a minute of it.
  if (reentryWindowMillis >= ForeverMillis - MinuteMillis) { return Messages.staysUnlocked }
  if (! phrasesRelativeTime()) { return null }
  const { count, unit } = windowCount(reentryWindowMillis)
  // numeric 'always', so that one day reads 'in 1 day' and never 'tomorrow'.
  const relativeTime = new Intl.RelativeTimeFormat(Locale, { numeric: 'always', style: 'long' })
  const relative = relativeTime.format(count, unit)
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
 * dialog the window again. On an engine without `Intl.RelativeTimeFormat` the line is left out.
 *
 * With `allowStartOver`, a user who has forgotten the passphrase is offered a way out: "Forgot it?
 * Start a new vault" asks first, then erases the vault (`vault.destroy()`, on every device) and
 * turns the dialog into "Choose a vault passphrase" for the new one. Off by default.
 *
 * @example
 *   <PassphraseModal vault={vault} onDone={(unlocked) => { setAsking(false) }} />
 * @example <PassphraseModal vault={vault} allowStartOver onDone={close} />  // offers to erase and start over
 */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <Boundary key={useRoundFor(props.vault)} fallback={<DialogTrouble onDone={props.onDone} />}>
    <UnlockForm {...props} />
  </Boundary>
)

/** What PassphraseModal is handed. */
type PassphraseModalProps = {
  vault:           Vault
  onDone:          (unlocked: boolean) => void
  /** Whether to offer a user who has forgotten the passphrase to erase the vault and start a new one. */
  allowStartOver?: boolean | undefined
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

/** The dialog itself, inside PassphraseModal's boundary. */
const UnlockForm = ({ vault, onDone, allowStartOver }: PassphraseModalProps) => {
  const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
  const [passphrase, setPassphrase] = useState('')
  const [gripe, setGripe] = useState<Gripe | null>(null)
  const [startingOver, setStartingOver] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const blurbId = useId()
  // Wrapped, so that a failure carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  if (failure !== null) { throw failure.err }
  const creating = snapshot.state === 'absent'
  const passkeyFirst = ! creating && offersPasskey(snapshot)
  const windowLine = unlockedFor(vault.reentryWindowMillis, creating)
  // Asked only of a vault there is to erase: one erased meanwhile has the user choose anew.
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
      await vault.unlock(passphrase)
      onDone(true)
    } catch (err) {
      // The vault was locked while this unlock was under way, and the lock wins: as if dismissed.
      if (isVaultError(err, 'vault_locked')) { onDone(false); return }
      meet(err)
    }
  }

  const startOver = async () => {
    setGripe(null)
    try {
      await vault.destroy()
      setStartingOver(false)
    } catch (err) {
      // The vault the user agreed to erase was destroyed or made anew elsewhere: what stands now
      // was never confirmed, so the question goes, to be asked afresh.
      if (isVaultError(err, 'stale_write')) { setStartingOver(false) }
      meet(err)
    }
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
              <input
                type="password"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- moving focus to the dialog's first field on open is the WAI-ARIA dialog pattern; the rule aims at page-load autofocus
                autoFocus={! passkeyFirst}
                ref={fieldRef}
                aria-label={Messages.passphraseField}
                placeholder={Messages.passphraseField}
                value={passphrase}
                onChange={(evt) => { setPassphrase(evt.target.value); setGripe((prev) => (prev?.fromPasskey === true ? prev : null)) }}
              />
            </>
          )}
        {/* A live region, mounted from the start, so that each word put in it is announced. */}
        <div role="alert">{gripe !== null && <p className="gripe">{gripe.text}</p>}</div>
        {windowLine !== null && ! askingStartOver && <p className="quiet">{windowLine}</p>}
        {askingStartOver
          ? (
            <div className="row" key="start-over">
              <button type="button" onClick={() => { void startOver() }}>{Messages.startOverConfirm}</button>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the button that held focus is gone; it moves to the choice that loses nothing */}
              <button type="button" autoFocus onClick={() => { setStartingOver(false); setGripe(null) }}>{Messages.startOverBack}</button>
            </div>
          )
          : (
            <div className="row" key="unlock">
              <button type="submit">{creating ? Messages.createButton : Messages.unlockButton}</button>
              <button type="button" onClick={() => { onDone(false) }}>{Messages.cancelButton}</button>
              {allowStartOver === true && ! creating && (
                <button type="button" className="quiet" onClick={() => { setStartingOver(true); setPassphrase(''); setGripe(null) }}>{Messages.startOverButton}</button>
              )}
            </div>
          )}
      </form>
    </div>
  )
}
