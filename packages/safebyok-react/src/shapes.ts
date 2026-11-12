import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ReactNode, Ref } from 'react'
import type { AnyGating, BadNewsHandler, Box, Device, DeviceDB, DeviceOpts, Gating, LifecycleHandler, RequestCleartext, Vault, VaultDB, VaultError } from 'safebyok'
import { Checker, Checkers, deviceOpts, type AssertEqual, type BoxesListed, type BoxSparse, type CheckerInput, type DamagedBox, type DamagedVault, type LeaseQuery, type LeaseScopepath, type VaultRow } from 'safebyok/storage'
import { fromB64, type WhisperFieldAttributes } from 'safebyok/utils'

// The types and checkers of safebyok-react, grouped by area. This file imports nothing from a component or
// hook, so it cannot be part of an import cycle at run time.

// == [Provider]: BankProviderProps, bankProviderProps, ProviderDeviceOpts, Handlers, ContextValue, TellBadNews, GatingModalProps, BoundaryProps, BoundarySource

/** BankProvider's props: the `Device.make` options except `gates`, which it fills in, plus the signed-in `user_id` and props for the dialogs. */
export interface BankProviderProps extends Omit<DeviceOpts, 'user_id' | 'gates' | 'requestCleartext'> {
  /** The signed-in user's id, or null while nobody is signed in. Null does not remove cached leases: call `bank.device.vacate()` at sign-out. */
  user_id:             string | null
  /** Your own function to ask the user for a passphrase or passkey. When omitted, the provider shows its built-in dialogs. */
  requestCleartext?:   RequestCleartext | undefined
  /** The username a password manager saves the vault's passphrase under. */
  passphraseUsername?: string | undefined
  /** The WebAuthn relying-party id for the vault's passkey. Defaults to the page's own domain. */
  passkeyRpId?:        string | undefined
  children:            ReactNode
}

/** Checker for {@link BankProviderProps}. */
export const bankProviderProps = Checker(({ fn, custom, str }) => deviceOpts.omit({ gates: true }).extend({
  user_id:            deviceOpts.shape.user_id.nullable(),
  requestCleartext:   fn<RequestCleartext>().optional(),
  passphraseUsername: str.optional(),
  passkeyRpId:        str.optional(),
  children:           custom<ReactNode>(),
}), 'bad_option')

// The interface is written by hand so that each prop has a doc comment. This line fails to compile if it and the checker drift apart.
true satisfies AssertEqual<BankProviderProps, CheckerInput<typeof bankProviderProps>>

/** The `Device.make` options the provider passes through: all but `gates` and the handlers, with a `user_id` that may be null. */
export type ProviderDeviceOpts = Omit<DeviceOpts, 'user_id' | 'gates' | 'onLifecycle' | 'onBadNews' | 'requestCleartext'> & { user_id: string | null }

/** The host's callbacks for the provider's device, as of the latest render. */
export type Handlers = { onLifecycle: LifecycleHandler, onBadNews: BadNewsHandler, requestCleartext: RequestCleartext | undefined }

/** The provider's context value: the signed-in user's device, the vaults a hook has already called `tryHello` on, and a way to report bad news to the host. */
export type ContextValue = { device: Device | null, helloedVaults: WeakSet<Vault>, tellBadNews: TellBadNews }

/** Report refusals that no caller is waiting on to the host's `onBadNews`. Does nothing once the device is disabled. Never throws. */
export type TellBadNews = (badnews: readonly VaultError[]) => void

/** GatingModal's props: a gating of any kind, and the props its dialogs share. */
export type GatingModalProps = {
  /** The gating this dialog is for, from `requestCleartext` or the device's snapshot. */
  gating:              AnyGating
  /** The device's `leaseMillis`, used for the line that says how long an unlock lasts. */
  leaseMillis?:        number | undefined
  /** The username a password manager saves the passphrase under. */
  passphraseUsername?: string | undefined
  /** The WebAuthn relying-party id for the vault's passkey. Defaults to the page's own domain. */
  passkeyRpId?:        string | undefined
}

/** Props of the `Boundary` error boundary. */
export type BoundaryProps = {
  /** Rendered instead of the children once one of them throws while rendering. */
  fallback:  ReactNode
  /** Called once, the first time the boundary catches an error. */
  onCaught?: (() => void) | undefined
  children:  ReactNode
}

/** The component that a `boundaryRefusalOf` error message names as its source. */
export type BoundarySource = 'PassphraseModal' | 'ReplacePassphraseModal' | 'DelVaultModal' | 'AddPasskeyModal' | 'RevokePasskeyModal' | 'PasskeyUnlockButton'
// --

// == [Hooks]: VaultStage, VaultLifecycle

/** The lifecycle stage of the vault a hook asked for.
 * - `'waiting'` -- there is no bank yet, or it is not ready
 * - `'unborn'`  -- the bank is ready and has no present vault under that vaultlabel
 * - `'present'` -- the vault exists
 * - `'spent'`   -- the bank was swept or vacated
 */
export type VaultStage = 'waiting' | 'unborn' | 'present' | 'spent'

/** `useVault`'s return value: the vault's stage, the Vault object while `present`, and the reason the bank ended once `spent`. */
export type VaultLifecycle = { stage: 'waiting' | 'unborn', vault: null } | { stage: 'present', vault: Vault } | { stage: 'spent', vault: null, cause: VaultError }
// --

// == [Helpers]: CreatePasskeyOpts, AskPasskeyOpts, PasskeyChecks

/** Options for `createPasskey`: how the authenticator labels the new passkey. */
export type CreatePasskeyOpts = {
  /** The relying party: the `name` the authenticator shows, and the `id` (a domain) the passkey is tied to. */
  rp:       { name: string, id?: string | undefined }
  /** The account `name` and `displayName` the authenticator lists the passkey under. */
  user:     { name: string, displayName: string }
  /** Milliseconds the browser waits for the user. Defaults to the browser's own limit. */
  timeout?: number | undefined
}

/** Options for `askPasskey`: the `rpId` the passkey was created under, if it was not the page's own domain, and a `timeout` in milliseconds. */
export type AskPasskeyOpts = {
  rpId?:    string | undefined
  timeout?: number | undefined
}

/** True when `text` is base64url. */
const isB64 = (text: string): boolean => {
  try {
    fromB64(text)
    return true
  } catch {
    return false
  }
}

// The header's salt is checked as base64url here, the same check the core makes when it reads the vault.
// The core checks credential_id only as text, so one that is not base64url passes here and is refused
// later as a damaged record (credentialBytesOf).
/** Checkers for the arguments of the passkey helpers. */
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
    askPasskeyArgs: obj({
      passkeyHeader: discrim('wayinkind', [passphraseHeader, passkeyHeader]).nullable(),
      opts:          obj({ rpId: named.optional(), timeout }).strict(),
    }),
    // The gating's attempt validates the rest of the answer.
    /** The only field of a passkey answer that attemptThenZero reads. */
    attemptThenZeroAnswer:  obj({ prfBytes: bytes() }),
    attemptThenZeroAttempt: fn(),
  }
})
// --

// == [Components]: WhisperFieldProps, BoxWhisperFieldProps, PasskeyUnlockButtonProps, VaultControlProps

/** WhisperField's props: an `onChange` for the text, and any `<input>` attribute except the value and the ones WhisperField sets itself. */
export type WhisperFieldProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'name' | 'value' | 'defaultValue' | 'onChange' | keyof typeof WhisperFieldAttributes> & {
  /** Called with the field's full text after each change. */
  onChange?: ((whisperText: string) => void) | undefined
}

/** BoxWhisperField's props: the box, the dotted path into its whisper, and `<input>` attributes. */
export type BoxWhisperFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'name' | 'value' | 'defaultValue' | 'onChange' | keyof typeof WhisperFieldAttributes> & {
  box:  Box
  path: string
}

/** Props of the button that unlocks the vault with its passkey. */
export type PasskeyUnlockButtonProps = {
  /** The unlock gating, as the bank passed it to `requestCleartext`. */
  gating:      Gating<'unlock_vault'>
  /** Called with a message to show the user, or with null to clear the last message. */
  onGripe:     (gripe: string | null) => void
  /** The relying-party id the passkey was created under. Defaults to the page's own domain. */
  rpId?:       string | undefined
  /** True to focus the button when it first renders. */
  takesFocus?: boolean | undefined
}

/** Props for VaultLockControl and CreateVaultButton: the vaultlabel of the vault to act on. */
export type VaultControlProps = { vaultlabel: string }
// --

// == [Modals]: PassphraseFieldname, Gripe, ModalFormProps, PassphraseGating, PassphraseModalProps, ReplacePassphraseModalProps, AddPasskeyModalProps, RevokePasskeyModalProps, DelVaultModalProps

/** The `name` attribute of a passphrase field. Password managers read it, and the form action looks the field up by it. */
export type PassphraseFieldname = 'current-password' | 'new-password' | 'confirm-password'

/** The message a dialog shows for a refused attempt, with the refusal's kind, which identifies the field at fault. */
export type Gripe = { text: string, refusalkind: string }

/** Props of `ModalForm`, the layout every gating dialog shares. */
export type ModalFormProps = {
  /** The gating this dialog is for. Cancel and Escape dismiss it. */
  gating:         AnyGating
  /** The heading. It is also the dialog's accessible name. */
  title:          string
  /** The paragraph under the heading. It is also the dialog's accessible description. */
  blurb:          string
  /** The submit button's label. */
  submitWord:     string
  /** The submit button's label while an attempt runs. */
  pendingWord:    string
  /** False to keep the submit button disabled. */
  isSubmittable?: boolean | undefined
  /** The message for the live region, or null for none. */
  gripeText:      string | null
  /** The live region's id. */
  gripeId:        string
  /** A muted line under the live region, saying how long an unlock lasts. */
  footnote?:      string | undefined
  formRef?:       Ref<HTMLFormElement> | undefined
  /** The form's action, called with the form's data at each submit. */
  action:         (form: FormData) => void
  /** Called after React clears the fields following an attempt. */
  onReset?:       (() => void) | undefined
  /** The fields, rendered between the blurb and the live region. */
  children:       ReactNode
}

/** The gatings PassphraseModal handles: building a vault, and unlocking one. */
export type PassphraseGating = Gating<'build_vault'> | Gating<'unlock_vault'>

/** Props of the passphrase dialog for a `build_vault` or an `unlock_vault` gating. */
export type PassphraseModalProps = {
  /** The gating this dialog is for, as the bank passed it to `requestCleartext`. */
  gating:              PassphraseGating
  /** The device's `leaseMillis`, used for the line that says how long an unlock lasts. */
  leaseMillis?:        number | undefined
  /** The username a password manager saves the passphrase under. */
  passphraseUsername?: string | undefined
  /** The relying-party id the vault's passkey was created under. Defaults to the page's own domain. */
  passkeyRpId?:        string | undefined
}

/** Props of the dialog for a `replace_passphrase` gating. */
export type ReplacePassphraseModalProps = {
  /** The gating this dialog is for, as the bank passed it to `requestCleartext`. */
  gating:              Gating<'replace_passphrase'>
  /** The username a password manager saves the passphrase under. */
  passphraseUsername?: string | undefined
}

/** Props of the dialog for an `add_passkey` gating. */
export type AddPasskeyModalProps = {
  /** The gating this dialog is for, as the bank passed it to `requestCleartext`. */
  gating:              Gating<'add_passkey'>
  /** The username a password manager saves the passphrase under. The authenticator lists the new passkey under it too. */
  passphraseUsername?: string | undefined
  /** The relying-party id to create the passkey under. Defaults to the page's own domain. */
  passkeyRpId?:        string | undefined
}

/** Props of the dialog for a `revoke_passkey` gating. */
export type RevokePasskeyModalProps = {
  /** The gating this dialog is for, as the bank passed it to `requestCleartext`. */
  gating:              Gating<'revoke_passkey'>
  /** The username a password manager saves the passphrase under. */
  passphraseUsername?: string | undefined
}

/** Props of the dialog for a `del_vault` gating. */
export type DelVaultModalProps = {
  /** The gating this dialog is for, as the bank passed it to `requestCleartext`. */
  gating:              Gating<'del_vault'>
  /** The username a password manager saves the passphrase under. */
  passphraseUsername?: string | undefined
}
// --

// == [Devmode]: DevBoxInspectorProps, DevDeviceDBInspectorProps, DevVaultDBInspectorProps, LastCall, Listing, ListedLease, LeaseRowLineProps, VaultRowLinesProps

/** DevBoxInspector's props: the vaultlabel and boxlabel its fields start with. */
export type DevBoxInspectorProps = { defaultVaultlabel?: string, defaultBoxlabel?: string }

/** DevDeviceDBInspector's props: the deviceDB whose rows it shows. */
export type DevDeviceDBInspectorProps = { deviceDB: DeviceDB }

/** DevVaultDBInspector's props: the vaultDB whose rows it shows. */
export type DevVaultDBInspectorProps = { vaultDB: VaultDB }

/** The result of a panel's last button press: the verb called, whether it succeeded, and the text to show. */
export type LastCall = { verbname: string, isOk: boolean, said: string }

/** A panel's listing state: the rows from the last listing, null before the first, and the error text if the last attempt failed. */
export type Listing<ValT> = { val: ValT | null, trouble: string | null }

/** A lease row for the table, with its scopepath when `listRawLeases` supplied one. */
export type ListedLease = { row: Record<string, unknown>, scopepath: LeaseScopepath | null }

/** Props for one lease row of the table: the row, its scopepath, and its button handlers. A null handler means the row has no such button. */
export type LeaseRowLineProps = {
  row:       Record<string, unknown>
  scopepath: LeaseScopepath | null
  onForget:  (asked: LeaseQuery) => Promise<void>
  onForgetRaw:  ((scopepath: LeaseScopepath) => Promise<void>) | null
}

/** Props for one vault's rows of the table: the vault row, its listed boxes, and the button handlers. */
export type VaultRowLinesProps = {
  vaultRow:   VaultRow | DamagedVault
  boxes:      BoxesListed | null
  onGetVault: () => Promise<void>
  onGetBox:   (boxRow: BoxSparse | DamagedBox) => Promise<void>
  onDelBox:   (boxRow: BoxSparse) => Promise<void>
}
// --
