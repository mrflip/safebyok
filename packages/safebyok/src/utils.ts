/**
 * safebyok's small helpers for the app around a vault, in an entry point of their own so that an
 * app that wants one pulls in none of the vault: `import { mask } from 'safebyok/utils'`. Beside
 * `mask`, the base64url codec every stored `_b64` field (and a passkey's `credential_id`) is
 * written in, `toB64` and `fromB64`, for a host or binding that hands such a field to an API
 * wanting bytes, as WebAuthn does; `WhisperFieldAttributes`, for the field a user types a
 * whisper into, whatever framework draws it; and `adorn` and `decorate`, which hang a property
 * off an object without it showing in the object's data, as each model hangs its vault.
 */
export { mask } from './mask'
export type { MaskOpts } from './mask'
export { fromB64, toB64 } from './crypto'
export { WhisperFieldAttributes } from './whisper-field'

/**
 * Attach `val` to `obj` as the property `ckey`, hidden and read-only: not enumerable, so
 * `JSON.stringify`, `Object.keys`, a spread and a log line all pass it by, and not writable, so an
 * assignment to it throws in strict code. Still configurable, so a test may stand a double in.
 *
 * @param obj - The object to attach to; mutated in place.
 * @param ckey - Name of the property.
 * @param val - What to attach.
 * @returns `val`, so the call can stand in for the value.
 *
 * @example adorn(wayin, 'vault', vault)   // => vault; JSON.stringify(wayin) leaves it out
 */
export function adorn<VT>(obj: object, ckey: string, val: VT): VT {
  Object.defineProperty(obj, ckey, { value: val, enumerable: false, writable: false, configurable: true })
  return val
}

/**
 * Attach every entry of `props` to `obj`, each hidden and read-only as {@link adorn} attaches one:
 * the usual way to hang a model's machinery off it without the machinery showing in its data.
 *
 * @param obj - The object to attach to; mutated in place.
 * @param props - The properties to attach, by name.
 * @returns `obj`.
 *
 * @example decorate(this, { vault, props: Object.freeze(record) })   // => this, with neither enumerable
 */
export function decorate<OT extends object>(obj: OT, props: Partial<OT>): OT {
  for (const [ckey, val] of Object.entries(props)) {
    adorn(obj, ckey, val)
  }
  return obj
}
