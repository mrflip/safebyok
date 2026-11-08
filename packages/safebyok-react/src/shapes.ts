import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ReactNode, Ref } from 'react'
import type { AnyGating, BadNewsHandler, Bank, BankOpts, Box, DeviceDB, Gating, LifecycleHandler, RequestCleartext, Vault, VaultDB, VaultError } from 'safebyok'
import { Checker, Checkers, bankOpts, type AssertEqual, type BoxesListed, type BoxSparse, type CheckerInput, type DamagedBox, type DamagedVault, type LeaseQuery, type LeaseScopepath, type VaultRow } from 'safebyok/storage'
import { fromB64, type WhisperFieldAttributes } from 'safebyok/utils'

// The types and checkers of safebyok-react, grouped by area. It imports types from no component or hook,
// so nothing in it can make a cycle at run time.

// == [Provider]: BankProviderProps, providerProps, HeldBankOpts, Handlers, ContextValue, TellBadNews, GatingModalProps, BoundaryProps, BoundarySource

/** What BankProvider is handed: the Bank.make options but `device_id`, the signed-in `user_id`, and the dialogs' props. */
export interface BankProviderProps extends Omit<BankOpts, 'user_id' | 'device_id' | 'requestCleartext'> {
  /** The signed-in user, or null while nobody is. Call `bank.vacate()` at sign-out: a null leaves the leases. */
  user_id:             string | null
  /** What asks the user for a passphrase or passkey, in place of the provider's own dialogs, which follow the bank's snapshot. */
  requestCleartext?:   RequestCleartext | undefined
  /** What a password manager files a vault's passphrase under. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. */
  passphraseAdvice?:   PassphraseAdvice | undefined
  /** The relying party the vault's passkey is made and asked under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
  children:            ReactNode
}

/** BankProvider's props: Bank.make's options but `device_id`, beside the signed-in user and the dialogs' props. */
export const providerProps = Checker(({ fn, custom, str }) => bankOpts.omit({ device_id: true }).extend({
  user_id:            bankOpts.shape.user_id.nullable(),
  requestCleartext:   fn<RequestCleartext>().optional(),
  passphraseUsername: str.optional(),
  passphraseAdvice:   custom<PassphraseAdvice>().optional(),
  passkeyRpId:        str.optional(),
  children:           custom<ReactNode>(),
}), 'bad_option')

// Hand-written for the doc comment a host sees on each prop, and held to the checker so neither drifts.
true satisfies AssertEqual<BankProviderProps, CheckerInput<typeof providerProps>>

/** The options a held bank is made from: Bank.make's, but `device_id` and the handlers, for a `user_id` that may be null. */
export type HeldBankOpts = Omit<BankOpts, 'user_id' | 'device_id' | 'onLifecycle' | 'onBadNews' | 'requestCleartext'> & { user_id: string | null }

/** The functions a held bank calls back, each as it was last rendered. */
export type Handlers = { onLifecycle: LifecycleHandler, onBadNews: BadNewsHandler, requestCleartext: RequestCleartext | undefined }

/** What the provider hands down: the signed-in user's bank, the Vault objects a hook has called `tryHello` on, and how to tell the host's `onBadNews`. */
export type ContextValue = { bank: Bank | null, helloedVaults: WeakSet<Vault>, tellBadNews: TellBadNews }

/** Tell the host's `onBadNews` each refusal no caller waits on, while the bank is enabled. Never throws. */
export type TellBadNews = (badnews: readonly VaultError[]) => void

/** What GatingModal is handed: any gating, and the props its dialogs share. */
export type GatingModalProps = {
  /** The gating the dialog answers, from `requestCleartext` or the bank's snapshot. */
  gating:              AnyGating
  /** Called once with 'unlocked' or 'deleted' when an attempt succeeds, and with 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** The bank's `leaseMillis`, for the line saying how long an unlock lasts. */
  leaseMillis?:        number | undefined
  /** What a password manager files the passphrase under. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a new passphrase. */
  passphraseAdvice?:   PassphraseAdvice | undefined
  /** The relying party the vault's passkey is made and asked under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
}

/** What a {@link Boundary} is handed: what to show once something broke, and whom to tell. */
export type BoundaryProps = {
  /** Shown in the children's place once one of them has thrown while rendering. */
  fallback:  ReactNode
  /** Called once, when the boundary first catches. */
  onCaught?: (() => void) | undefined
  children:  ReactNode
}

/** The safebyok-react component a {@link forBoundary} report comes from, which its message names. */
export type BoundarySource = 'PassphraseModal' | 'ReplacePassphraseModal' | 'DelVaultModal' | 'AddPasskeyModal' | 'RevokePasskeyModal' | 'PasskeyUnlockButton'
// --

// == [Hooks]: VaultStage, VaultHeld, WhenShown

/** Where the vault a hook names stands: `waiting`, `unborn`, `present`, or `spent` once its bank is swept or vacated. */
export type VaultStage = 'waiting' | 'unborn' | 'present' | 'spent'

/** What {@link useVault} answers: the vault's stage, its Vault object while it is `present`, and why its bank ended once `spent`. */
export type VaultHeld = { stage: 'waiting' | 'unborn', vault: null } | { stage: 'present', vault: Vault } | { stage: 'spent', vault: null, cause: VaultError }

/** A function that calls `goOn` once the component is shown, for an async handler to go on through. */
export type WhenShown = <ValT>(goOn: () => ValT) => Promise<Awaited<ValT>>
// --

// == [Helpers]: AttemptRefusalFlavor, CreatePasskeyOpts, AskPasskeyOpts, PasskeyChecks

/** What a dialog does with a refusal a gating's attempt met. */
export type AttemptRefusalFlavor = 'in_place' | 'close' | 'trouble' | 'in_flight'

/** What `createPasskey` asks of the host: how the authenticator shows the new passkey. */
export type CreatePasskeyOpts = {
  /** The relying party: the `name` the authenticator shows, and the `id` domain the passkey answers to. */
  rp:       { name: string, id?: string | undefined }
  /** How the authenticator lists the passkey: an account `name` and a `displayName`. */
  user:     { name: string, displayName: string }
  /** How long the browser waits for the user, in milliseconds. Defaults to the browser's own. */
  timeout?: number | undefined
}

/** What `askPasskey` may be told: the relying party's `rpId`, if the passkey was made under one, and a `timeout`. */
export type AskPasskeyOpts = {
  rpId?:    string | undefined
  timeout?: number | undefined
}

/** True for base64url text. */
const isB64 = (text: string): boolean => {
  try {
    fromB64(text)
    return true
  } catch {
    return false
  }
}

// A passkey header's salt is checked here as base64url, as the core checks it when it reads the vault.
// The core checks its credential_id only as text, so one that is not base64url refuses later, as a
// damaged record (credentialBytesOf).
export const PasskeyChecks = Checkers('bad_option', ({ obj, discrim, lit, str, int, bytes, fn }) => {
  const timeout = int.positive().optional()
  const named = str.min(1)
  const passphraseHeader = obj({ wayinkind: lit('passphrase') })
  const passkeyHeader = obj({ wayinkind: lit('passkey'), credential_id: named, prf_salt_b64: named.refine(isB64, 'Expected base64url text') })
  return {
    createPasskeyOpts: obj({
      rp:   obj({ name: named, id: named.optional() }).strict(),
      user: obj({ name: named, displayName: str }).strict(),
      timeout,
    }).strict(),
    askPasskeyInput: obj({
      passkeyHeader: discrim('wayinkind', [passphraseHeader, passkeyHeader]).nullable(),
      opts:          obj({ rpId: named.optional(), timeout }).strict(),
    }),
    // The attempt checks the rest of the answer.
    /** The part of a passkey answer attemptOnce itself touches. */
    attemptOnceAnswer:  obj({ prfBytes: bytes() }),
    attemptOnceAttempt: fn(),
  }
})
// --

// == [Components]: WhisperFieldProps, BoxWhisperFieldProps, PasskeyUnlockButtonProps, VaultControlProps

/** What a WhisperField is handed: where each change goes, and any input attribute but a value. */
export type WhisperFieldProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'name' | 'value' | 'defaultValue' | 'onChange' | keyof typeof WhisperFieldAttributes> & {
  /** Hears the whole text after each change. */
  onChange?: ((whisperText: string) => void) | undefined
}

/** What a BoxWhisperField is handed: the box, the dotted path, and input attributes. */
export type BoxWhisperFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'name' | 'value' | 'defaultValue' | 'onChange' | keyof typeof WhisperFieldAttributes> & {
  box:  Box
  path: string
}

/** What PasskeyUnlockButton is handed. */
export type PasskeyUnlockButtonProps = {
  /** The gating the passkey answers, as the bank handed it to `requestCleartext`. */
  gating:      Gating<'unlock_vault'>
  /** Called with 'unlocked' when the passkey unlocks the vault, and with 'declined' on a refusal that closes the dialog. */
  onDone:      (answer: 'unlocked' | 'declined') => void
  /** What the button has to say, or null once what it said last no longer stands. */
  onGripe:     (gripe: string | null) => void
  /** The relying party the passkey was made under, if not the page's own domain. */
  rpId?:       string | undefined
  /** Whether the button takes the focus when it first shows. */
  takesFocus?: boolean | undefined
}

/** What a VaultLockControl or a CreateVaultButton is handed: the vaultlabel of the vault it acts on. */
export type VaultControlProps = { vaultlabel: string }
// --

// == [Modals]: DialogAnswer, PassphraseAdvice, Gripe, ModalFormProps, PassphraseGating, PassphraseModalProps, ReplacePassphraseModalProps, AddPasskeyModalProps, RevokePasskeyModalProps, DelVaultModalProps

/** How a dialog closed: 'unlocked', 'deleted' or 'declined'. */
export type DialogAnswer = 'unlocked' | 'deleted' | 'declined'

/** What a host says of a passphrase as the user chooses it, or null for nothing. It hears the passphrase in plain text, so keep it on the device. */
export type PassphraseAdvice = (passphrase: string) => string | null | Promise<string | null>

/** What a dialog's live region says, and whether it is about the passkey or a mismatch. */
export type Gripe = { text: string, fromPasskey: boolean, mismatched?: true }

/** What a {@link ModalForm} is handed. */
export type ModalFormProps = {
  /** The heading, which names the dialog. */
  title:      string
  /** The paragraph under it, which describes the dialog. */
  blurb:      string
  /** The submit button's word. */
  submitWord: string
  /** What to say in the live region, or null for nothing. */
  gripe:      Gripe | null
  /** The live region's id, from {@link useConfirmation}. */
  gripeId?:   string | undefined
  /** A quiet line under the live region: how long an unlock lasts. */
  footnote?:  string | undefined
  formRef?:   Ref<HTMLFormElement> | undefined
  /** The dialog's one answer: Cancel and Escape answer 'declined'. */
  done:       (answer: DialogAnswer) => void
  /** Called at each submit. The form's default is already prevented. */
  onSubmit:   () => void
  /** The fields, between the blurb and the live region. */
  children:   ReactNode
}

/** The gatings the passphrase dialog answers: a vault's build, and an unlock. */
export type PassphraseGating = Gating<'build_vault'> | Gating<'unlock_vault'>

/** What PassphraseModal is handed. */
export type PassphraseModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              PassphraseGating
  /** Called once with 'unlocked' when an attempt succeeds, and with 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** The bank's `leaseMillis`, for the line saying how long an unlock lasts. */
  leaseMillis?:        number | undefined
  /** What a password manager files the passphrase under. */
  passphraseUsername?: string | undefined
  /** What to say beside the field as the user chooses a passphrase. */
  passphraseAdvice?:   PassphraseAdvice | undefined
  /** The relying party the vault's passkey was made under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
}

/** What ReplacePassphraseModal is handed. */
export type ReplacePassphraseModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              Gating<'replace_passphrase'>
  /** Called once with 'unlocked' when the passphrase is replaced, and with 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** What a password manager files the passphrase under. */
  passphraseUsername?: string | undefined
  /** What to say beside the new passphrase's field as the user chooses it. */
  passphraseAdvice?:   PassphraseAdvice | undefined
}

/** What AddPasskeyModal is handed. */
export type AddPasskeyModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              Gating<'add_passkey'>
  /** Called once with 'unlocked' when the passkey is added, and with 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** What a password manager files the passphrase under, and what the authenticator lists the passkey under. */
  passphraseUsername?: string | undefined
  /** The relying party the passkey is made under, if not the page's own domain. */
  passkeyRpId?:        string | undefined
}

/** What RevokePasskeyModal is handed. */
export type RevokePasskeyModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              Gating<'revoke_passkey'>
  /** Called once with 'unlocked' when the passkey is removed, and with 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** What a password manager files the passphrase under. */
  passphraseUsername?: string | undefined
}

/** What DelVaultModal is handed. */
export type DelVaultModalProps = {
  /** The gating the dialog answers, as the bank handed it to `requestCleartext`. */
  gating:              Gating<'del_vault'>
  /** Called once with 'deleted' when the vault is deleted, and with 'declined' otherwise. */
  onDone:              (answer: DialogAnswer) => void
  /** What a password manager files the passphrase under. */
  passphraseUsername?: string | undefined
}
// --

// == [Devmode]: DevBoxInspectorProps, DevDeviceDBInspectorProps, DevVaultDBInspectorProps, LastCall, Listing, ListedLease, LeaseRowLineProps, VaultRowLinesProps

/** What a DevBoxInspector is handed: the vaultlabel and boxlabel it opens on. */
export type DevBoxInspectorProps = { defaultVaultlabel?: string, defaultBoxlabel?: string }

/** What a DevDeviceDBInspector is handed: the deviceDB whose rows it shows. */
export type DevDeviceDBInspectorProps = { deviceDB: DeviceDB }

/** What a DevVaultDBInspector is handed: the vaultDB whose rows it shows. */
export type DevVaultDBInspectorProps = { vaultDB: VaultDB }

/** What a panel's last button answered: the verb it called, whether it refused, and what it said. */
export type LastCall = { verbname: string, isOk: boolean, said: string }

/** What a panel's listing holds: the rows last listed, null before the first, and the refusal of the last attempt. */
export type Listing<ValT> = { val: ValT | null, trouble: string | null }

/** A lease row as the table lists it, with the scopepath it is filed under where `listRawLeases` gave one. */
export type ListedLease = { row: Record<string, unknown>, scopepath: LeaseScopepath | null }

/** What a lease row's line is handed: the row, where it is filed, and what its buttons call, null for a button it lacks. */
export type LeaseRowLineProps = {
  row:       Record<string, unknown>
  scopepath: LeaseScopepath | null
  onForget:  (asked: LeaseQuery) => Promise<void>
  onDelRaw:  ((scopepath: LeaseScopepath) => Promise<void>) | null
}

/** What a vault row's lines are handed: the row, its boxes as listed, and what each button calls. */
export type VaultRowLinesProps = {
  vaultRow:   VaultRow | DamagedVault
  boxes:      BoxesListed | null
  onGetVault: () => Promise<void>
  onGetBox:   (boxRow: BoxSparse | DamagedBox) => Promise<void>
  onDelBox:   (boxRow: BoxSparse | DamagedBox) => Promise<void>
}
// --
