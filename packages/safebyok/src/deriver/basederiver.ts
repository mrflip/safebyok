import type { PassphraseSaltBytes } from '../helpers/consts'
import { reservedLabel, suppliedSpecChanged } from '../refusals/throwers'
import { type KeyDeriverSpec, ReservedLabelPrefix, SuppliedSpecs, TestLabelPrefix, keyDeriverSpec } from './shapes'

// == [KeyDeriver]: KeyDeriver, Argon2idKeyDeriver

/** What `Bank.make` accepts to make a key from a passphrase: `argon2idWebV1Deriver` from `safebyok/browser`, or your own. */
export interface KeyDeriver {
  /** The name each wayin records for how its key was derived, so a later device derives it alike. */
  readonly key_deriver_label: string
  /** How many bytes of salt each derivation takes: {@link PassphraseSaltBytes}, for every deriver. */
  readonly salt_bytes:        typeof PassphraseSaltBytes
  /** The name of the derivation algorithm, as the supplied derivers carry it (`argon2id`). */
  readonly algorithm?:        string | undefined
  /** Derive the key's bytes from the passphrase and the wayin's salt, the same bytes for the same two. */
  readonly deriveKeyBytes:    (passphrase: string, saltBytes: Uint8Array) => Promise<Uint8Array>
  /** Get ready to derive, such as by fetching a WebAssembly module, at each bank's `hello()`. */
  readonly load?:             (() => void | Promise<void>) | undefined
}

/** A key deriver that carries the settings of its {@link KeyDeriverSpec}. */
export type Argon2idKeyDeriver = KeyDeriverSpec & KeyDeriver
// --

// == [Checks]: parseKeyDeriverSpec, checkSuppliedSpecKept, isTestDeriver

/** Parse `candidate` into a {@link KeyDeriverSpec}, and refuse a spec that misuses a supplied label. */
export const parseKeyDeriverSpec = (candidate: unknown): KeyDeriverSpec => {
  const spec = keyDeriverSpec.parse(candidate)
  checkSuppliedSpecKept(spec)
  return spec
}

/** Refuse a spec that changes a supplied spec's settings, or claims a label under {@link ReservedLabelPrefix}. */
export const checkSuppliedSpecKept = (candidate: KeyDeriverSpec): void => {
  const supplied = SuppliedSpecs.find((spec) => spec.key_deriver_label === candidate.key_deriver_label)
  if (supplied === undefined) {
    if (candidate.key_deriver_label.toLowerCase().startsWith(ReservedLabelPrefix)) { throw reservedLabel(ReservedLabelPrefix) }
    return
  }
  const carried: Readonly<Record<string, unknown>> = candidate
  const kept = Object.entries(supplied).every(([fieldname, val]) => carried[fieldname] === val)
  if (! kept) { throw suppliedSpecChanged(supplied.key_deriver_label) }
}

/** True when `keyDeriver`'s label starts with {@link TestLabelPrefix}. */
export const isTestDeriver = (keyDeriver: Pick<KeyDeriver, 'key_deriver_label'>): boolean => keyDeriver.key_deriver_label.startsWith(TestLabelPrefix)
// --
