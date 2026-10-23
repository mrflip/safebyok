/**
 * safebyok-react's public surface: the thin React binding over safebyok. No vault logic lives here --
 * only the provider that makes the app's bank, the hooks that reach it and ask it for the signed-in
 * user's vaults (`useBank`, `useVault`, `useVaultSnapshot`), the passphrase dialog it asks through, the field a user types
 * a whisper into, and the WebAuthn calls a passkey unlock needs (`createPasskey`, `askPasskey`),
 * which import no React.
 */
export { BankProvider, useBank, useVault, useVaultSnapshot } from './bank-provider'
export type { BankProviderProps } from './bank-provider'
export { PassphraseModal } from './passphrase-modal'
export type { DialogAnswer, PassphraseAdvice, PassphraseGating, PassphraseModalProps } from './passphrase-modal'
export { PasskeyUnlockButton } from './passkey-unlock-button'
export { WhisperField } from './whisper-field'
export type { WhisperFieldProps } from './whisper-field'
export { askPasskey, createPasskey, passkeysAvailable } from './passkey'
export type { AskPasskeyOpts, CreatePasskeyOpts } from './passkey'
