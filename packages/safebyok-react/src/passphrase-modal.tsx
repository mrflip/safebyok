import { useId, useRef, useState, type SubmitEvent } from 'react'
import { ForeverMillis, isVaultCondition, isVaultError, type Vault } from 'safebyok'
import { Boundary } from './boundary'
import { PasskeyUnlockButton } from './passkey-unlock-button'

const MinutesPerHour = 60
const MinutesPerDay = 24 * MinutesPerHour
const MinuteMillis = 60_000

/** The locale the window's count and relative phrase are formatted in. */
const Locale = 'en'

type Unit = 'day' | 'hour' | 'minute'

/** The window as a count of whole days, else of whole hours, else of minutes (at least one). */
const windowCount = (reentryWindowMillis: number): { count: number, unit: Unit } => {
  const minutes = Math.max(1, Math.round(reentryWindowMillis / MinuteMillis))
  if (minutes % MinutesPerDay === 0) { return { count: minutes / MinutesPerDay, unit: 'day' } }
  if (minutes % MinutesPerHour === 0) { return { count: minutes / MinutesPerHour, unit: 'hour' } }
  return { count: minutes, unit: 'minute' }
}

/**
 * What the dialog promises about how long an unlock lasts, from the vault's `reentryWindowMillis`:
 * 'Locks again on this device in 7 days' (a whole number of days, else of hours, else of
 * minutes, phrased by `Intl.RelativeTimeFormat`), or 'Locks on this device in 7 days' when the
 * dialog is creating the vault, which has nothing yet to lock "again". The longest window a vault
 * keeps (`ForeverMillis`, which `Infinity` hours becomes) reads as lasting until the user locks it.
 */
const unlockedFor = (reentryWindowMillis: number, creating: boolean): string => {
  if (reentryWindowMillis >= ForeverMillis) { return 'Stays unlocked on this device until you lock it.' }
  const { count, unit } = windowCount(reentryWindowMillis)
  // numeric 'always', so that one day reads 'in 1 day' and never 'tomorrow'.
  const relativeTime = new Intl.RelativeTimeFormat(Locale, { numeric: 'always', style: 'long' })
  const relative = relativeTime.format(count, unit)
  return creating ? `Locks on this device ${relative}.` : `Locks again on this device ${relative}.`
}

/**
 * The dialog withUnlockedVault summons when the vault turns out to be locked. Unstyled markup
 * under the `modal-scrim` / `modal` / `quiet` / `gripe` class names, for the host's stylesheet
 * to dress. Its behaviors are the contract: a first-ever unlock reads as "choose a passphrase"
 * (it creates the vault); a wrong passphrase stays in the dialog with a calm message rather than
 * failing the action; and an unlock that loses to a `lock()` called while it ran closes the
 * dialog as if dismissed. Whichever the case, it says plainly that a forgotten passphrase cannot
 * be recovered, and how long an unlock lasts on this device.
 *
 * A condition the unlock meets (storage that cannot be reached, a record that fails
 * verification) shows in the dialog in place, in the vault's own calm words, and the user may
 * try again or cancel. Anything else -- misuse, such as a closed vault handle, or a failure that
 * is no VaultError -- never reaches the host's page: the dialog shows a calm notice in its place,
 * "Something went wrong", whose Close (or Escape) calls `onDone(false)`,
 * and React reports the error through the root's `onCaughtError` (the console, by default, with
 * the component stack), where the developer and an error tracker meet it. A passkey that fails
 * that way takes its button away and leaves the passphrase.
 *
 * How long an unlock lasts it reads from the vault itself (its `reentryWindowMillis`, the
 * `forcePassphraseReentryHours` it was opened with): 'Locks again on this device in 7 days', 'in 15
 * minutes', 'Stays unlocked on this device until you lock it' for `Infinity`; while it creates the
 * vault, 'Locks on this device in 7 days', with nothing yet to lock again. Nobody need tell the
 * dialog the window again.
 *
 * @example
 *   <PassphraseModal vault={vault} onDone={(unlocked) => { setAsking(false) }} />
 */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <Boundary fallback={<DialogTrouble onDone={props.onDone} />}>
    <UnlockForm {...props} />
  </Boundary>
)

/** What PassphraseModal is handed. */
type PassphraseModalProps = {
  vault:  Vault
  onDone: (unlocked: boolean) => void
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
        onKeyDown={(evt) => { if (evt.key === 'Escape') { onDone(false) } }}
      >
        <h3 id={titleId}>Something went wrong</h3>
        <p className="gripe" id={wordId}>
          This app ran into a problem of its own, not one you caused, and could not unlock your vault. Your secrets are safe. Close this, reload the page, and try again.
        </p>
        <div className="row">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the field that held focus is gone; the WAI-ARIA dialog pattern moves focus to the dialog's one control */}
          <button type="button" autoFocus onClick={() => { onDone(false) }}>Close</button>
        </div>
      </div>
    </div>
  )
}

/**
 * What the dialog says to the user, and whether it is about the passkey: a word about the typed
 * passphrase goes once the user types again; one about the passkey stays until the next submit.
 */
type Gripe = { text: string, fromPasskey: boolean }

/** The dialog itself, inside PassphraseModal's boundary. */
const UnlockForm = ({ vault, onDone }: PassphraseModalProps) => {
  const [passphrase, setPassphrase] = useState('')
  const [gripe, setGripe] = useState<Gripe | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  // Wrapped, so that a failure carrying any value at all still reads as "failed".
  const [failure, setFailure] = useState<{ err: unknown } | null>(null)
  if (failure !== null) { throw failure.err }
  const creating = vault.getSnapshot().state === 'absent'

  const submit = async (evt: SubmitEvent) => {
    evt.preventDefault()
    setGripe(null)
    try {
      await vault.unlock(passphrase)
      onDone(true)
    } catch (err) {
      // The vault was locked while this unlock was under way, and the lock wins: as if dismissed.
      if (isVaultError(err, 'vault_locked')) { onDone(false); return }
      // A condition (a wrong passphrase, storage out of reach): shown calmly, to try again.
      if (isVaultCondition(err)) { setGripe({ text: err.message, fromPasskey: false }); return }
      // Misuse, or no VaultError at all: not for the user. Rethrown in render, where
      // PassphraseModal's boundary catches it; thrown from here it would miss every boundary.
      setFailure({ err })
    }
  }

  const passkeyGripe = (text: string) => {
    setGripe({ text, fromPasskey: true })
    // A passkey button that took itself away took the focus with it: back to the passphrase.
    if (! (formRef.current?.contains(document.activeElement) ?? false)) { fieldRef.current?.focus() }
  }

  return (
    <div className="modal-scrim">
      <form ref={formRef} className="modal" onSubmit={(evt) => { void submit(evt) }}>
        <h3>{creating ? 'Choose a vault passphrase' : 'Unlock your vault'}</h3>
        <p className="quiet">
          {creating
            ? "This passphrase encrypts your secrets on your device. Nobody can recover it for you -- not even us."
            : 'Your secrets are encrypted with this passphrase; enter it to continue. A forgotten passphrase cannot be recovered -- you would start a new vault and re-enter your secrets.'}
        </p>
        <input
          type="password"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- moving focus to the dialog's first field on open is the WAI-ARIA dialog pattern; the rule aims at page-load autofocus
          autoFocus
          ref={fieldRef}
          placeholder="vault passphrase"
          value={passphrase}
          onChange={(evt) => { setPassphrase(evt.target.value); setGripe((prev) => (prev?.fromPasskey === true ? prev : null)) }}
        />
        {gripe !== null && <p className="gripe" role="alert">{gripe.text}</p>}
        <p className="quiet">{unlockedFor(vault.reentryWindowMillis, creating)}</p>
        <div className="row">
          <button type="submit">{creating ? 'Create vault' : 'Unlock'}</button>
          {! creating && <PasskeyUnlockButton vault={vault} onDone={onDone} onGripe={passkeyGripe} />}
          <button type="button" onClick={() => { onDone(false) }}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
