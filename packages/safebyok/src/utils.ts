/**
 * safebyok's small helpers for the app around a vault, in an entry point of their own so that an
 * app that wants one pulls in none of the vault: `import { mask } from 'safebyok/utils'`. Beside
 * `mask`, the base64url codec every stored `_b64` field (and a passkey's `credential_id`) is
 * written in, `toB64` and `fromB64`, for a host or binding that hands such a field to an API
 * wanting bytes, as WebAuthn does; and `WhisperFieldAttributes`, for the field a user types a
 * whisper into, whatever framework draws it.
 */
export { mask } from './mask'
export type { MaskOpts } from './mask'
export { fromB64, toB64 } from './crypto'
export { WhisperFieldAttributes } from './whisper-field'
