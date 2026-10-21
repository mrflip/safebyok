/* eslint-disable sonarjs/redundant-type-aliases */
import * as Z from 'zod' // eslint-disable-line no-restricted-imports
import type { ZodMiniType} from 'zod/mini'
import { FarFuture, vaultKeyEpoch } from './types.js'
import { NameFloor } from './validators.js'
// export { object as obj, string as str, custom, boolean as bool, any as wth } from 'zod' // eslint-disable-line no-restricted-imports
export { VaultProps as vaultProps } from './types.js'

export const str = Z.string()
export const num = Z.number()
export const bool = Z.boolean()
export const obj = Z.object

export const label = str.regex(/^[a-z0-9_]+$/)
export const callback = Z.custom<((whisper: any) => any)>(
  (val) => (typeof val === 'function'),
  { message: 'Expected a callback function' },
)
export const argsGetWhisper = obj({
  boxlabel: label,
  callback: callback,
})

export type Bag<PT> = Record<string, PT>
export type Label   = string
export type Whisper  = Exclude<Jsonable, null>
export type Jsonable = null | string | number | boolean | Jsonable[] | { [ckey: string]: Jsonable }

/** True for a plain key-value object: one built by a literal or Object.create(null), nothing with its own prototype (a Date, a Map) that JSON would silently flatten. */
export const isPlainBag = (val: unknown): val is Record<string, unknown> => {
  if (typeof val !== 'object' || val === null) { return false }
  const proto: unknown = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

/**
 * Validator for a {@link Whisper}: accepts exactly what JSON can carry, refuses what JSON would
 * mangle (undefined, functions, class instances such as Date or Map), and refuses a bare null.
 *
 * @example Whisper.parse('sk-ant-...')                  // a string passes through
 * @example Whisper.safeParse(new Date()).success        // false: JSON would flatten it to {}
 * @example Whisper.safeParse(undefined).success         // false: undefined cannot be stored
 * @example Whisper.safeParse(null).success              // false: emptying a box is delBox's job
 * @example Whisper.safeParse({ orgId: null }).success   // true: null inside a structure is JSON
 */
export const whisper: ZodMiniType<Whisper> = Z.lazy(() => Z.union([
  str,
  num,
  bool,
  jsonableArr,
  jsonableBag,
]))
export const jsonable: ZodMiniType<Jsonable> = Z.lazy(() => Z.union([
  str,
  num,
  bool,
  jsonableArr,
  jsonableBag,
  Z.null(),
]))
// const jsonableRecord = Z.record(Z.string(), jsonable)
export const jsonableArr    = Z.array(jsonable)
export const jsonableBag    = Z.pipe(Z.custom<Record<string, unknown>>(isPlainBag, 'a whisper object must be a plain object'), Z.record(Z.string(), jsonable))
export const whisperBag     = Z.pipe(Z.custom<Record<string, unknown>>(isPlainBag, 'a whisper object must be a plain object'), Z.record(Z.string(), whisper))

export type Timer = ReturnType<typeof setTimeout>

export const vaultKey = Z.custom<CryptoKey>((val: any) => (val instanceof CryptoKey), 'a vault key must be a CryptoKey')

export const MIN_TIMESTAMP = Date.UTC(2026, 1, 1, 0, 0, 0, 808).valueOf()
export const MAX_TIMESTAMP = FarFuture + 1
export const timestamp = num.int().min(MIN_TIMESTAMP).max(MAX_TIMESTAMP)
export const timerange = num.int().min(0).max(MAX_TIMESTAMP - MIN_TIMESTAMP)
export type  Timestamp = Z.infer<typeof timestamp>
export type  Timerange = Z.infer<typeof timerange>

export const leaseFormat = str.regex(/^safebyok-lease-v\d+$/)

export const guid = str.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

export const argsGrantLease = obj({
  askPassphraseAt: timestamp,
})
export const lease = obj({
  format:     leaseFormat,
  applabel:   label,
  user_id:     NameFloor,
  vaultlabel: label,
  vault_id:     str,
  vault_key_epoch: vaultKeyEpoch,
  until:      timestamp,
})
