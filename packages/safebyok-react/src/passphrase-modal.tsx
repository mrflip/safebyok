import { useRef, useSyncExternalStore } from 'react'
import type { InitializeGateGating, UnlockVaultGating } from 'safebyok'
import { useRoundFor } from './boundary'
import { Messages } from './messages'
import { AnsweringOnce, ModalForm, PassphraseField, UsernameField, holdsFocus, unlockedFor, useAdvice, useAttempts, type DialogAnswer, type PassphraseAdvice } from './modal'
import { PasskeyUnlockButton, offersPasskey } from './passkey-unlock-button'

/**
 * The passphrase dialog, for an `unlock_vault` or `initialize_gate` gating: what `GatingModal`,
 * and so `BankProvider`'s own `requestCleartext`, shows for those two kinds. A host writing its
 * own `requestCleartext` may render it too: hand it the gating, and resolve its
 * `requestCleartext` once `onDone` is told.
 * Unstyled markup under the `modal-scrim` / `modal` / `quiet` / `gripe` class names, for the
 * host's stylesheet to dress, with a dialog's semantics: the scrim is the `dialog`, named by its
 * heading, and Escape anywhere in it cancels, answering `declined`. Each submit is one attempt
 * of the gating. Its behaviors are the contract: an `initialize_gate` gating reads as "choose a
 * passphrase" (it sets the vault's first); a wrong passphrase stays in the dialog with a calm message;
 * an attempt that is ok answers `unlocked`; and a lock that lands while it is up -- its gating's
 * `lockLanded` -- closes it, answering `declined`, as does an attempt the lock won. Whichever the
 * case, it says plainly that a forgotten passphrase cannot be recovered, and how long an unlock
 * lasts on this device. For a vault with a passkey, in a browser offering WebAuthn, "Use a
 * passkey" comes first, and takes the focus.
 *
 * It follows the vault as it changes -- a passkey added brings its button; whether it chooses or
 * unlocks is its gating's kind, fixed when raised -- and handed another gating, it starts afresh,
 * keeping nothing typed for the last. Taken away, it lets go: an attempt or advice still
 * under way finishes unheard, calling `onDone` no more and showing nothing. It calls `onDone` once.
 *
 * The refusals an attempt meets it handles as `attemptRefusalFlavor` groups them. The ones the
 * user can correct -- a wrong passphrase or passkey, a weak new passphrase, or a way in that cannot
 * answer -- show in the dialog in place, in the vault's own calm words, through a live region a
 * screen reader announces, and the gating stays open for the user to try again or cancel. A
 * submit, or a press of the passkey, while an attempt runs changes nothing: that attempt answers.
 * A lock that won, storage out of reach, or any other refusal closes it, answering `declined`,
 * `gate_made_elsewhere` among them: the gating it answered is over, and the next call asks for
 * the passphrase chosen on the other device. Anything else -- misuse, such as a strength checker
 * that answers no verdict, or a failure that is no VaultError -- never reaches the host's page:
 * the dialog shows a calm notice in its place, "Something went wrong", whose Close (or Escape)
 * calls `onDone('declined')` -- unless a lock lands under it first, as for the form -- and React
 * reports the error, carrying nothing typed, through the root's `onCaughtError` (the console, by
 * default, with the component stack), where the developer and an error tracker meet it. A passkey
 * that fails that way takes its button away and leaves the passphrase.
 *
 * How long a lease lasts it reads from the vault itself (its `leaseMillis`, the `leaseHours` it
 * was opened with): 'Locks again on this device in 7 days', 'in 15 minutes', 'Stays unlocked on
 * this device until you lock it' for `Infinity`; while it creates the vault, 'Locks on this
 * device in 7 days', with nothing yet to lock again. Nobody need tell the dialog the lease again.
 * It needs `Intl.RelativeTimeFormat`, which a host on an engine without it (Hermes, an older
 * browser) supplies with the standard polyfill: the README says how.
 *
 * `allowStartOver` and `onStartedOver` are taken and offer nothing, for now.
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
 * Left out, the dialog asks `vault.tryCheckStrength`, and shows the reason of a 'weak_passphrase',
 * so the advice and Create decide alike. It is advice: what the vault itself refuses at creation
 * shows as any refusal does. It is never asked while unlocking.
 *
 * Advice that throws fails the dialog: the host's is reported as 'unexpected_error', carrying
 * nothing of what it heard; the vault's own check throws a refusal that quotes nothing, which goes
 * on as it is.
 *
 * @example
 *   const requestCleartext: RequestCleartext = (gating) => new Promise((closed) => {
 *     if (gating.gatingkind !== 'unlock_vault' && gating.gatingkind !== 'initialize_gate') { closed(); return }
 *     showDialog(<PassphraseModal gating={gating} onDone={() => { closed() }} />)
 *   })
 * @example <PassphraseModal gating={gating} passphraseUsername={`${email} (vault)`} onDone={close} />
 * @example <PassphraseModal gating={gating} passphraseAdvice={(typed) => (typed.length < 12 ? 'Twelve characters or more, please.' : null)} onDone={close} />
 */
export const PassphraseModal = (props: PassphraseModalProps) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <UnlockForm {...props} onDone={done} />}
  </AnsweringOnce>
)

/** The gatings the passphrase dialog answers: a vault's first passphrase, and an unlock. */
export type PassphraseGating = InitializeGateGating | UnlockVaultGating

/** What PassphraseModal is handed. */
export type PassphraseModalProps = {
  /** The gating the dialog answers, as the vault handed it to `requestCleartext`. */
  gating:              PassphraseGating
  /** Called once, with the dialog's answer: 'unlocked' once an attempt is ok, 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** Taken, and offers nothing, for now. */
  allowStartOver?:     boolean | undefined
  /** Taken, and never called: see `allowStartOver`. */
  onStartedOver?:      (() => void) | undefined
  /** What a password manager files the passphrase under. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. Default: the reason `vault.tryCheckStrength` gives for a weak one. */
  passphraseAdvice?:   PassphraseAdvice | undefined
}

/** The dialog itself, inside PassphraseModal's boundary: its `onDone` is the one answer, `AnsweringOnce`'s. */
const UnlockForm = ({ gating, onDone: done, passphraseUsername, passphraseAdvice }: PassphraseModalProps) => {
  const { vault } = gating
  const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
  const { gripe, setGripe, fail, attempt } = useAttempts('PassphraseModal', done)
  const formRef = useRef<HTMLFormElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  // The gating's kind, fixed when it was raised: a first passphrase, or an unlock.
  const creating = gating.gatingkind === 'initialize_gate'
  // The host's advice heard the passphrase: what it threw may quote it, so none of it goes on but safebyok's own refusal.
  const advice = useAdvice(passphraseAdvice, vault, creating, fail)
  const passkeyGating = gating.gatingkind === 'unlock_vault' && offersPasskey(snapshot) ? gating : null

  const submit = () => {
    const typed = fieldRef.current?.value ?? ''
    void attempt(() => (gating.gatingkind === 'initialize_gate' ? gating.attempt(typed) : gating.attemptPassphrase(typed)), 'unlocked')
  }

  /** Each change to the field: a complaint about what was typed before goes (a passkey's word stays till the next submit), and, while choosing, the host's advice is asked anew. */
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
    <ModalForm
      title={creating ? Messages.chooseTitle : Messages.unlockTitle}
      blurb={creating ? Messages.chooseBlurb : Messages.unlockBlurb}
      submitWord={creating ? Messages.createButton : Messages.unlockButton}
      gripe={gripe}
      footnote={unlockedFor(vault.leaseMillis, creating)}
      formRef={formRef}
      done={done}
      onSubmit={submit}
    >
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the passkey is the dialog's first choice: the WAI-ARIA dialog pattern moves focus to its first control */}
      {passkeyGating !== null && <PasskeyUnlockButton gating={passkeyGating} autoFocus onDone={done} onGripe={passkeyGripe} />}
      <UsernameField username={passphraseUsername ?? Messages.passphraseUsername(snapshot.user_id, snapshot.vaultlabel)} />
      <PassphraseField
        ref={fieldRef}
        credential={creating ? 'new-password' : 'current-password'}
        fieldlabel={Messages.passphraseField}
        takesFocus={passkeyGating === null}
        advice={creating ? advice.said : undefined}
        onChange={hearPassphrase}
      />
    </ModalForm>
  )
}
