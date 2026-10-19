/**
 * safebyok's small helpers for the app around a vault, in an entry point of their own so that an
 * app that wants one pulls in none of the vault: `import { mask } from 'safebyok/utils'`. Beside
 * `mask`, the base64url codec every stored `_b64` field (and a passkey's `credential_id`) is
 * written in, `toB64` and `fromB64`, for a host or binding that hands such a field to an API
 * wanting bytes, as WebAuthn does; `WhisperFieldAttributes`, for the field a user types a
 * whisper into, whatever framework draws it; and `adorn` and `decorate`, which attach a value to
 * an object where no loop, spread, log line or `JSON.stringify` will find it.
 */
export { mask } from './mask'
export type { MaskOpts } from './mask'
export { fromB64, toB64 } from './crypto'
export { WhisperFieldAttributes } from './whisper-field'

/**
 * `obj`, with each of `props`' own entries attached to it as a hidden, fixed property:
 * non-enumerable, so `Object.keys`, a spread, `JSON.stringify` and a log line pass it by, and
 * neither writable nor configurable, so nothing replaces it. Reading it by name works as for any
 * property. What a vault's model keeps beside its stored record -- the vault it belongs to, the
 * vault's logger and clock -- is attached this way, so the record alone is what serializes.
 *
 * @example decorate(box, { vault })        // box.vault reads; JSON.stringify(box) leaves it out
 */
export const decorate = <OT>(obj: OT, props: Partial<OT>): OT => {
  for (const [ckey, val] of Object.entries(props)) {
    Object.defineProperty(obj, ckey, { value: val, enumerable: false, writable: false, configurable: false })
  }
  return obj
}

/**
 * `val`, once each of its own entries is attached to `obj` as {@link decorate} attaches them:
 * hidden and fixed. For a property `obj`'s type does not declare, so the caller keeps the value in
 * hand as well as on the object.
 *
 * @example const { logger } = adorn(handle, { logger: consoleLogger })   // handle.logger reads; a spread of handle leaves it out
 */
export const adorn = <VT>(obj: object, val: VT): VT => {
  decorate(obj, val as Partial<object>)
  return val
}
