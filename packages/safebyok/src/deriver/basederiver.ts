import { VaultError } from '../errors'
import * as Phrases from '../phrases'
import { type KeyDeriverSpec, ReservedLabelPrefix, SuppliedSpecs, TestLabelPrefix, keyDeriverSpec } from './shapes'

// == [KeyDeriver]: KeyDeriver, Argon2idKeyDeriver

/** The bank's `keyDeriver`, turning a passphrase into passphraseKey bytes: a label a vault stores, the salt length it takes, and the function that derives.
 * A vault opens only through a deriver wearing the `key_deriver_label` its wayin stores, so a
 * deriver of your own commits every user's vault to it. To substitute, use a vetted Argon2id
 * implementation under {@link Argon2idKeyDeriver}, never your own derivation.
 *
 * @example const wasmDeriver: KeyDeriver = { ...Argon2idWebV1, deriveKeyBytes: deriveWithWasm }
 */
export interface KeyDeriver {
  readonly key_deriver_label: string
  readonly salt_bytes:        number
  /** The algorithm the deriver runs, in the host's own words: `argon2id` means the deriver carries a whole {@link KeyDeriverSpec}. */
  readonly algorithm?:        string | undefined
  /** 32 fresh bytes from the passphrase and salt; refuses a salt of another length than `salt_bytes`.
   * It hears the passphrase, so what it throws is replaced.
   */
  deriveKeyBytes(passphrase: string, saltBytes: Uint8Array): Promise<Uint8Array>
  /** Readies the deriver (a WebAssembly module, say); runs in each `bank.hello()`. */
  load?:              (() => void | Promise<void>) | undefined
}

/** A {@link KeyDeriver} running Argon2id, carrying its whole {@link KeyDeriverSpec}, as `argon2idDeriver`'s do. */
export type Argon2idKeyDeriver = KeyDeriverSpec & KeyDeriver
// --

// == [Checks]: parseKeyDeriverSpec, checkKeyDeriver, checkSuppliedSpecUnchanged, checkSaltFits, isTestDeriver

/** `candidate` as a {@link KeyDeriverSpec} Argon2id can run, holding nothing but a spec's fields. Refuses 'bad_option', naming the field.
 * Refuses a label safebyok reserves, and a supplied spec's label on other parameters. Another
 * Argon2id implementation checks its spec through it, so its bounds are `argon2idDeriver`'s.
 *
 * @example parseKeyDeriverSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
 */
export const parseKeyDeriverSpec = (candidate: unknown): KeyDeriverSpec => {
  const spec = keyDeriverSpec.parse(candidate)
  checkSuppliedSpecUnchanged(spec)
  return spec
}

/** Check that a {@link KeyDeriver} is one a vault can keep, refusing 'bad_option': one declaring `algorithm: 'argon2id'` that Argon2id cannot run, or one wearing a label safebyok reserves or supplies under other parameters. */
export const checkKeyDeriver = (keyDeriver: KeyDeriver): void => {
  if (keyDeriver.algorithm === 'argon2id') { parseKeyDeriverSpec(keyDeriver) } else { checkSuppliedSpecUnchanged(keyDeriver) }
}

/** Check that a deriver of the `key_deriver_label` of a spec safebyok supplies carries that spec whole, and that no other deriver wears a reserved label. Refuses 'bad_option'. */
export const checkSuppliedSpecUnchanged = (candidate: Pick<KeyDeriver, 'key_deriver_label'>): void => {
  const supplied = SuppliedSpecs.find((spec) => spec.key_deriver_label === candidate.key_deriver_label)
  if (supplied === undefined) {
    if (candidate.key_deriver_label.toLowerCase().startsWith(ReservedLabelPrefix)) { throw reservedLabel() }
    return
  }
  const carried: Readonly<Record<string, unknown>> = candidate
  const unchanged = Object.entries(supplied).every(([fieldname, val]) => carried[fieldname] === val)
  if (! unchanged) { throw suppliedSpecChanged(supplied.key_deriver_label) }
}

/** Refuse 'bad_option' a salt of another length than the deriver's `salt_bytes`, naming both lengths and never the salt. */
export const checkSaltFits = (spec: Pick<KeyDeriverSpec, 'salt_bytes'>, saltBytes: Uint8Array): void => {
  if (saltBytes.length !== spec.salt_bytes) { throw saltDoesNotFit(spec.salt_bytes, saltBytes.length) }
}

/** Whether the deriver's label begins {@link TestLabelPrefix}: made cheap for tests, and no protection against guessing. */
export const isTestDeriver = (keyDeriver: Pick<KeyDeriver, 'key_deriver_label'>): boolean => keyDeriver.key_deriver_label.startsWith(TestLabelPrefix)
// --

// == [Refusals]: reservedLabel, suppliedSpecChanged, saltDoesNotFit

const reservedLabel = (): VaultError => new VaultError('bad_option', Phrases.reservedDeriverLabel(ReservedLabelPrefix))

const suppliedSpecChanged = (label: string): VaultError => new VaultError('bad_option', Phrases.suppliedSpecChanged(label))

const saltDoesNotFit = (expectedCount: number, handedCount: number): VaultError => new VaultError('bad_option', Phrases.saltDoesNotFit(expectedCount, handedCount))
// --
