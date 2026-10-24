import { useRef, useSyncExternalStore } from 'react'
import type { ChangePassphraseGating, DelPasskeyGating, DelVaultGating, Gating, PutPasskeyGating, Vault } from 'safebyok'
import { useRoundFor } from './boundary'
import { Messages } from './messages'
import { AnsweringOnce, ModalForm, PassphraseField, UsernameField, unlockedFor, useAdvice, useAttempts, type DialogAnswer, type PassphraseAdvice } from './modal'
import { createPasskey } from './passkey'
import { PassphraseModal } from './passphrase-modal'

/**
 * The dialog for any gating, by its `gatingkind`: what `BankProvider`'s own `requestCleartext`
 * shows, one at a time. A first passphrase or an unlock is `PassphraseModal`'s; a passphrase
 * change asks for the current passphrase and the next; adding or replacing the passkey asks for
 * the passphrase, then has the browser make a passkey (`createPasskey`); removing the passkey,
 * and deleting the vault, ask for the passphrase. A host writing its own `requestCleartext` may
 * render it for every gating: hand it the gating, and resolve once `onDone` is told.
 *
 * Every kind behaves as `PassphraseModal` does: unstyled markup under the `modal-scrim` / `modal`
 * / `quiet` / `gripe` class names, with a dialog's semantics, Escape or Cancel answering
 * `declined`; each submit one attempt of the gating; a refusal the user can correct -- a wrong
 * passphrase, a weak new one, the same one again, a passkey the browser cannot make -- shown in
 * place, the gating left open to try again; any other refusal, or a lock landing, closing it,
 * answering `declined`; and misuse, or a failure that is no VaultError, meeting a calm notice
 * that React reports, carrying nothing typed. It calls `onDone` once: 'unlocked' once a change to
 * the ways in is made (the vault is then unlocked under it), 'deleted' once the vault is, and
 * 'declined' otherwise. Handed another gating, it starts afresh, keeping nothing typed.
 *
 * Adding a passkey makes it at each submit, before the attempt checks the passphrase: a passkey
 * made for an attempt refused (a typo in the passphrase, say) stays on the authenticator, of no
 * use to the vault, and the next submit makes another. The passkey is filed under
 * `passphraseUsername`, the relying party named for the vault's `applabel`, at this page's own
 * domain. A browser without WebAuthn says so in place.
 *
 * `passphraseUsername`, `passphraseAdvice`, `allowStartOver` and `onStartedOver` are
 * `PassphraseModal`'s; the advice is heard for a new passphrase being chosen, at a change too.
 *
 * @example
 *   const requestCleartext: RequestCleartext = (gating) => new Promise((closed) => {
 *     showDialog(<GatingModal gating={gating} onDone={() => { closed() }} />)
 *   })
 */
export const GatingModal = (props: GatingModalProps) => {
  const { gating, ...rest } = props
  switch (gating.gatingkind) {
  case 'initialize_gate':
  case 'unlock_vault': { return <PassphraseModal gating={gating} {...rest} /> }
  case 'change_passphrase': { return <ChangePassphraseModal gating={gating} {...rest} /> }
  case 'put_passkey': { return <PutPasskeyModal gating={gating} {...rest} /> }
  case 'del_passkey': { return <DelPasskeyModal gating={gating} {...rest} /> }
  case 'del_vault': { return <DelVaultModal gating={gating} {...rest} /> }
  }
}

/** What GatingModal is handed: any gating, and `PassphraseModal`'s other props. */
export type GatingModalProps = {
  /** The gating the dialog answers, as the vault handed it to `requestCleartext`. */
  gating:              Gating
  /** Called once, with the dialog's answer: 'unlocked' or 'deleted' once an attempt is ok, 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** `PassphraseModal`'s: taken, and offers nothing, for now. */
  allowStartOver?:     boolean | undefined
  /** `PassphraseModal`'s: taken, and never called. */
  onStartedOver?:      (() => void) | undefined
  /** What a password manager files the passphrase under, and the name a new passkey is listed by. Default: the user and the vault, as 'u1 (main vault)'. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a new passphrase. Default: the reason `vault.tryCheckStrength` gives for a weak one. */
  passphraseAdvice?:   PassphraseAdvice | undefined
}

/** The props a kind's dialog takes: GatingModal's, its gating of that kind. */
type KindModalProps<GatingT extends Gating> = Omit<GatingModalProps, 'gating'> & { gating: GatingT }

/** The form a kind's dialog renders, handed its one answer as `done`. */
type KindFormProps<GatingT extends Gating> = KindModalProps<GatingT> & { done: (answer: DialogAnswer) => void }

/** The vault's snapshot, read live, and what a password manager files its passphrase under. */
const useFiling = (vault: Vault, passphraseUsername: string | undefined) => {
  const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
  return { snapshot, username: passphraseUsername ?? Messages.passphraseUsername(snapshot.user_id, snapshot.vaultlabel) }
}

// == [change_passphrase]: ChangePassphraseModal, ChangePassphraseForm

/** The `change_passphrase` dialog: the current passphrase and the next, the advice heard for the next. */
const ChangePassphraseModal = (props: KindModalProps<ChangePassphraseGating>) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <ChangePassphraseForm {...props} done={done} />}
  </AnsweringOnce>
)

const ChangePassphraseForm = ({ gating, done, passphraseUsername, passphraseAdvice }: KindFormProps<ChangePassphraseGating>) => {
  const { vault } = gating
  const { snapshot, username } = useFiling(vault, passphraseUsername)
  const { gripe, setGripe, fail, attempt } = useAttempts('GatingModal', done)
  const advice = useAdvice(passphraseAdvice, vault, true, fail)
  const currentRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLInputElement>(null)
  const submit = () => {
    const current = currentRef.current?.value ?? ''
    const next = nextRef.current?.value ?? ''
    void attempt(() => gating.attempt(current, next), 'unlocked')
  }
  return (
    <ModalForm
      title={Messages.changeTitle}
      blurb={snapshot.passkey === null ? Messages.changeBlurb : `${Messages.changeBlurb} ${Messages.changeDropsPasskey}`}
      submitWord={Messages.changeButton}
      gripe={gripe}
      footnote={unlockedFor(vault.leaseMillis, false)}
      done={done}
      onSubmit={submit}
    >
      <UsernameField username={username} />
      <PassphraseField ref={currentRef} credential="current-password" fieldlabel={Messages.currentField} takesFocus onChange={() => { setGripe(null) }} />
      <PassphraseField
        ref={nextRef}
        credential="new-password"
        fieldlabel={Messages.newField}
        takesFocus={false}
        advice={advice.said}
        onChange={(typed) => { setGripe(null); void advice.hear(typed) }}
      />
    </ModalForm>
  )
}
// --

// == [put_passkey]: PutPasskeyModal, PutPasskeyForm

/** The `put_passkey` dialog: the passphrase, then a passkey the browser makes. */
const PutPasskeyModal = (props: KindModalProps<PutPasskeyGating>) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => <PutPasskeyForm {...props} done={done} />}
  </AnsweringOnce>
)

const PutPasskeyForm = ({ gating, done, passphraseUsername }: KindFormProps<PutPasskeyGating>) => {
  const { vault } = gating
  const { snapshot, username } = useFiling(vault, passphraseUsername)
  const { gripe, setGripe, meet, attempt, isMounted } = useAttempts('GatingModal', done)
  const fieldRef = useRef<HTMLInputElement>(null)
  // One submit at a time: the browser asks for one passkey at a time, and a second submit while
  // one runs would make a second passkey.
  const submitting = useRef(false)
  const replacing = snapshot.passkey !== null

  const putPasskey = async () => {
    setGripe(null)
    const typed = fieldRef.current?.value ?? ''
    try {
      // Asked first, within the submit's own gesture, as WebAuthn wants.
      const made = await createPasskey({ rp: { name: snapshot.applabel }, user: { name: username, displayName: username } })
      if (made === null || ! isMounted()) { return }
      await attempt(() => gating.attempt(typed, made), 'unlocked')
    } catch (err) {
      if (isMounted()) { meet(err) }
    }
  }

  const submit = () => {
    if (submitting.current) { return }
    submitting.current = true
    void putPasskey().finally(() => { submitting.current = false })
  }

  return (
    <ModalForm
      title={replacing ? Messages.replacePasskeyTitle : Messages.putPasskeyTitle}
      blurb={replacing ? Messages.replacePasskeyBlurb : Messages.putPasskeyBlurb}
      submitWord={replacing ? Messages.replacePasskeyButton : Messages.putPasskeyButton}
      gripe={gripe}
      footnote={unlockedFor(vault.leaseMillis, false)}
      done={done}
      onSubmit={submit}
    >
      <UsernameField username={username} />
      <PassphraseField ref={fieldRef} credential="current-password" fieldlabel={Messages.passphraseField} takesFocus onChange={() => { setGripe(null) }} />
    </ModalForm>
  )
}
// --

// == [del_passkey and del_vault]: DelPasskeyModal, DelVaultModal, ProvenByPassphraseForm

/** The `del_passkey` dialog: the passphrase, to remove the passkey. */
const DelPasskeyModal = (props: KindModalProps<DelPasskeyGating>) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => (
      <ProvenByPassphraseForm
        {...props}
        done={done}
        words={{ title: Messages.delPasskeyTitle, blurb: Messages.delPasskeyBlurb, submitWord: Messages.delPasskeyButton }}
        footnote={unlockedFor(props.gating.vault.leaseMillis, false)}
        answer="unlocked"
      />
    )}
  </AnsweringOnce>
)

/** The `del_vault` dialog: the passphrase, to delete the vault. */
const DelVaultModal = (props: KindModalProps<DelVaultGating>) => (
  <AnsweringOnce key={useRoundFor(props.gating)} gating={props.gating} onDone={props.onDone}>
    {(done) => (
      <ProvenByPassphraseForm
        {...props}
        done={done}
        words={{ title: Messages.delVaultTitle, blurb: Messages.delVaultBlurb, submitWord: Messages.delVaultButton }}
        footnote={undefined}
        answer="deleted"
      />
    )}
  </AnsweringOnce>
)

/** A form proven by the passphrase alone, whose attempt takes it: `del_passkey`'s and `del_vault`'s, each in its own `words`, answering `answer` once ok. */
const ProvenByPassphraseForm = ({ gating, done, passphraseUsername, words, footnote, answer }: KindFormProps<DelPasskeyGating | DelVaultGating> & {
  words:    { title: string, blurb: string, submitWord: string }
  footnote: string | undefined
  answer:   DialogAnswer
}) => {
  const { username } = useFiling(gating.vault, passphraseUsername)
  const { gripe, setGripe, attempt } = useAttempts('GatingModal', done)
  const fieldRef = useRef<HTMLInputElement>(null)
  const submit = () => {
    const typed = fieldRef.current?.value ?? ''
    void attempt(() => gating.attempt(typed), answer)
  }
  return (
    <ModalForm {...words} gripe={gripe} footnote={footnote} done={done} onSubmit={submit}>
      <UsernameField username={username} />
      <PassphraseField ref={fieldRef} credential="current-password" fieldlabel={Messages.passphraseField} takesFocus onChange={() => { setGripe(null) }} />
    </ModalForm>
  )
}
// --
