/** `safebyok/utils`: small helpers for the app around a vault, which pull in none of the vault.
 * `toB64` and `fromB64` are the base64url codec of every stored `_b64` field, for an API that wants bytes, as WebAuthn does.
 */

// Each is the one safebyok-big defines, from its own `utils` entry, which carries none of the vault, so that a host
// importing this entry gets the very binding the core uses.
export { MaskSchedule, WhisperFieldAttributes, fromB64, mash, mask, toB64, type MaskOpts, type MaskRow } from 'safebyok-big/utils'
