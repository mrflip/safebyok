import { reservedLabel, saltDoesNotFit, suppliedSpecChanged } from '../refusals/throwers'
import { type KeyDeriverSpec, ReservedLabelPrefix, SuppliedSpecs, TestLabelPrefix, keyDeriverSpec } from './shapes'

// == [KeyDeriver]: KeyDeriver, Argon2idKeyDeriver

/** What `Bank.make` takes to make a key from a passphrase: `argon2idWebV1Deriver` from `safebyok/browser`, or your own. */
export interface KeyDeriver {
  /** The name each wayin stores for how its key was derived, so a later device derives it alike. */
  readonly key_deriver_label: string
  /** How many bytes of salt each derivation takes. */
  readonly salt_bytes:        number
  /** The name of the derivation algorithm, as the supplied derivers carry it (`argon2id`). */
  readonly algorithm?:        string | undefined
  /** Derive the key's bytes from the passphrase and the wayin's salt, the same bytes for the same two. */
  readonly deriveKeyBytes:    (passphrase: string, saltBytes: Uint8Array) => Promise<Uint8Array>
  /** Get ready to derive, such as by fetching a WebAssembly module, at each bank's `hello()`. */
  readonly load?:             (() => void | Promise<void>) | undefined
}

export type Argon2idKeyDeriver = KeyDeriverSpec & KeyDeriver
// --

// == [Checks]: parseKeyDeriverSpec, checkSuppliedSpecKept, checkSaltFits, isTestDeriver

export const parseKeyDeriverSpec = (candidate: unknown): KeyDeriverSpec => {
  const spec = keyDeriverSpec.parse(candidate)
  checkSuppliedSpecKept(spec)
  return spec
}

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

export const checkSaltFits = (spec: Pick<KeyDeriverSpec, 'salt_bytes'>, saltBytes: Uint8Array): void => {
  if (saltBytes.length !== spec.salt_bytes) { throw saltDoesNotFit(spec.salt_bytes, saltBytes.length) }
}

export const isTestDeriver = (keyDeriver: Pick<KeyDeriver, 'key_deriver_label'>): boolean => keyDeriver.key_deriver_label.startsWith(TestLabelPrefix)
// --
