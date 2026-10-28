/** `safebyok/utils`: small helpers for the app around a vault, which pull in none of the vault.
 * `toB64` and `fromB64` are the base64url codec of every stored `_b64` field and a passkey's
 * `credential_id`, for an API that wants bytes, as WebAuthn does.
 */
export { mask } from './mask'
export type { MaskOpts } from './mask'
export { fromB64, toB64 } from './crypto'
export { WhisperFieldAttributes } from './whisper-field'

