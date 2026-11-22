/** The kit: the forms a host shows at each stage of the bank, assembled from the parts over the bank's hooks, and the passkey helpers and new-passphrase hook they use. */

export { type CreateVaultFormProps, CreateVaultForm } from './create-vault-form'
export { type AskPasskeyOpts, type CreatePasskeyOpts, askPasskey, createPasskey, passkeysAvailable } from './passkey'
export { type AddPasskeyFormProps, type PasskeyUnlockButtonProps, type RevokePasskeyFormProps, AddPasskeyForm, PasskeyUnlockButton, RevokePasskeyForm } from './passkey-forms'
export { refusalTextOf } from './phrases-kit'
export { ModalDialog } from './modal-dialog'
export { type ReplacePassphraseFormProps, ReplacePassphraseForm } from './replace-passphrase-form'
export { type NewPassphrase, type NewPassphraseFieldProps, useNewPassphrase } from './use-new-passphrase'
export { type UnlockDialogProps, type UnlockFormProps, UnlockDialog, UnlockForm } from './unlock-form'
