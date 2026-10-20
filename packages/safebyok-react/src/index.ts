/**
 * safebyok-react's public surface: the thin React binding over safebyok. No vault logic lives here --
 * only the provider that makes the vault for the host's signed-in user, the hooks that read it
 * (`useVault`, `useVaultSnapshot`, `useOpenError`), the passphrase dialog it asks through, the field a user types
 * a whisper into, and the WebAuthn calls a passkey unlock needs (`createPasskey`, `askPasskey`),
 * which import no React.
 */
export { VaultProvider, useOpenError, useVault, useVaultSnapshot } from './vault-provider'
export type { OpenErrorShape, VaultProviderProps } from './vault-provider'
export { PassphraseModal } from './passphrase-modal'
export type { PassphraseAdvice, PassphraseModalProps } from './passphrase-modal'
export { PasskeyUnlockButton } from './passkey-unlock-button'
export { WhisperField } from './whisper-field'
export type { WhisperFieldProps } from './whisper-field'
export { askPasskey, createPasskey, passkeysAvailable } from './passkey'
export type { AskPasskeyOpts, CreatePasskeyOpts } from './passkey'
