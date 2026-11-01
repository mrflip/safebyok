import { VaultError } from '../errors'
import * as Phrases from '../phrases'
import { type KeyDeriverSpec, ReservedLabelPrefix, SuppliedSpecs, TestLabelPrefix, keyDeriverSpec } from './shapes'

// == [KeyDeriver]: KeyDeriver, Argon2idKeyDeriver

export interface KeyDeriver {
  readonly key_deriver_label: string
  readonly salt_bytes:        number
  readonly algorithm?:        string | undefined
  deriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array>
  load?(): void | Promise<void>
}

export type Argon2idKeyDeriver = KeyDeriverSpec & KeyDeriver
// --

// == [Checks]: parseKeyDeriverSpec, checkSuppliedSpecUnchanged, checkSaltFits, isTestDeriver

export const parseKeyDeriverSpec = (candidate: unknown): KeyDeriverSpec => {
  const spec = keyDeriverSpec.parse(candidate)
  checkSuppliedSpecUnchanged(spec)
  return spec
}

export const checkSuppliedSpecUnchanged = (candidate: KeyDeriverSpec): void => {
  const supplied = SuppliedSpecs.find((spec) => spec.key_deriver_label === candidate.key_deriver_label)
  if (supplied === undefined) {
    if (candidate.key_deriver_label.toLowerCase().startsWith(ReservedLabelPrefix)) { throw reservedLabel() }
    return
  }
  const carried: Readonly<Record<string, unknown>> = candidate
  const unchanged = Object.entries(supplied).every(([fieldname, val]) => carried[fieldname] === val)
  if (! unchanged) { throw suppliedSpecChanged(supplied.key_deriver_label) }
}

export const checkSaltFits = (spec: Pick<KeyDeriverSpec, 'salt_bytes'>, saltBytes: Uint8Array): void => {
  if (saltBytes.length !== spec.salt_bytes) { throw saltDoesNotFit(spec.salt_bytes, saltBytes.length) }
}

export const isTestDeriver = (keyDeriver: Pick<KeyDeriver, 'key_deriver_label'>): boolean => keyDeriver.key_deriver_label.startsWith(TestLabelPrefix)
// --

// == [Refusals]: reservedLabel, suppliedSpecChanged, saltDoesNotFit

const reservedLabel = (): VaultError => new VaultError('bad_option', Phrases.reservedDeriverLabel(ReservedLabelPrefix))

const suppliedSpecChanged = (label: string): VaultError => new VaultError('bad_option', Phrases.suppliedSpecChanged(label))

const saltDoesNotFit = (expectedCount: number, handedCount: number): VaultError => new VaultError('bad_option', Phrases.saltDoesNotFit(expectedCount, handedCount))
// --
