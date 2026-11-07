// safebyok-react's public surface: the provider that makes the signed-in user's bank, the hooks that
// read it and its boxes, the dialogs it asks the user through, the fields a user types a whisper
// into, and the controls an account menu builds, locks and unlocks a vault with.
export { BankProvider } from './bank-provider'
export type { BankProviderProps } from './bank-provider'
export { useBank, useBankSnapshot, useVault, useVaultSnapshot } from './hooks'
export { useBox, useBoxes, useBoxSnapshot, useWhisper } from './hooks'
export type { VaultHeld, VaultStage } from './hooks'
export { BoxWhisperField } from './box-whisper-field'
export type { BoxWhisperFieldProps } from './box-whisper-field'
export { CreateVaultButton, VaultLockControl } from './vault-controls'
export type { VaultControlProps } from './vault-controls'
export { GatingModal } from './gating-modal'
export type { GatingModalProps } from './gating-modal'
export type { DialogAnswer, PassphraseAdvice } from './modal'
export { PassphraseModal } from './passphrase-modal'
export type { PassphraseGating, PassphraseModalProps } from './passphrase-modal'
export { ReplacePassphraseModal } from './replace-passphrase-modal'
export type { ReplacePassphraseModalProps } from './replace-passphrase-modal'
export { DelVaultModal } from './del-vault-modal'
export type { DelVaultModalProps } from './del-vault-modal'

// Passkeys: the dialogs that add and remove one, the button that unlocks with it, and the WebAuthn calls beneath them.
export { AddPasskeyModal } from './add-passkey-modal'
export type { AddPasskeyModalProps } from './add-passkey-modal'
export { RevokePasskeyModal } from './revoke-passkey-modal'
export type { RevokePasskeyModalProps } from './revoke-passkey-modal'
export { PasskeyUnlockButton, offersPasskey } from './passkey-unlock-button'
export type { PasskeyUnlockButtonProps } from './passkey-unlock-button'
export { askPasskey, attemptOnce, createPasskey, passkeysAvailable } from './passkey'
export type { AskPasskeyOpts, CreatePasskeyOpts } from './passkey'

export { WhisperField } from './whisper-field'
export type { WhisperFieldProps } from './whisper-field'
