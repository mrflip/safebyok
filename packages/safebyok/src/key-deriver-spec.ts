import { VaultError } from './errors'
import { keyDeriverSpec } from './checks/key-deriver-spec-checks'
import type { KeyDeriver } from './key-deriver'

/** A keyDeriverSpec: Argon2id's whole parameter set, under the keyDeriverLabel a vault records.
 * A vault stores only the label, so a label must always mean the same parameters: change one and
 * the vaults made under it stop opening. {@link Argon2idWebV1} is the one safebyok supplies.
 * `argon2idDeriver` turns a spec of your own into a KeyDeriver.
 *
 * @example
 *   const spec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 }
 */
export type KeyDeriverSpec = {
  readonly algorithm:         'argon2id'
  /** Stored with each passphrase wayin, which opens only under a deriver carrying the same label. */
  readonly key_deriver_label: string
  /** Argon2 memory cost, in KiB: from 8 per lane up to 1048576 (1 GiB). */
  readonly memory_kib:        number
  /** Argon2 passes over memory (its time cost): at least 1. */
  readonly iterations:        number
  /** Argon2 lanes: at least 1. A JavaScript deriver runs them one after another. */
  readonly parallelism:       number
  /** How long a passphraseSalt is, in bytes: from 8 to 65536. */
  readonly salt_bytes:        number
  /** How many key bytes come out: always 32, as a 256-bit passphraseKey needs. */
  readonly output_bytes:      number
}

/** The keyDeriverSpec safebyok supplies, which `browserOpts()` derives under: Argon2id over 64 MiB, 3 passes, 1 lane, a 16-byte salt.
 * It is above OWASP's Argon2id minimums. It is RFC 9106's second recommended option with one lane
 * in place of four, since a JavaScript deriver runs lanes one after another. A deriver wearing its
 * label must carry exactly these parameters, or Bank.make and `argon2idDeriver` refuse it.
 *
 * @example Argon2idWebV1.key_deriver_label  // 'argon2id_web_v1'
 * @example Argon2idWebV1.memory_kib         // 65536, i.e. 64 MiB
 */
export const Argon2idWebV1 = Object.freeze({
  algorithm:         'argon2id',
  key_deriver_label: 'argon2id_web_v1',
  memory_kib:        65_536,
  iterations:        3,
  parallelism:       1,
  salt_bytes:        16,
  output_bytes:      32,
} as const) satisfies KeyDeriverSpec

/** Every keyDeriverSpec safebyok supplies: a deriver wearing one's label carries its fields. */
const SuppliedSpecs: readonly KeyDeriverSpec[] = [Argon2idWebV1]

/** The label prefix reserved, in any case, for the specs safebyok supplies now and later: a host's own label may not begin with it. */
export const ReservedLabelPrefix = 'argon2id_web_'

/** Refuse 'bad_option' for a key deriver or spec wearing a label safebyok reserves, unless it carries that spec's every parameter.
 * Otherwise a vault made under it on one device would not open under the real one on another.
 */
export const checkSuppliedSpecKept = (candidate: Readonly<Record<string, unknown>> & { readonly key_deriver_label: string }) => {
  const supplied = SuppliedSpecs.find((spec) => spec.key_deriver_label === candidate.key_deriver_label)
  if (supplied === undefined) {
    if (candidate.key_deriver_label.toLowerCase().startsWith(ReservedLabelPrefix)) {
      throw new VaultError('bad_option', `Labels beginning ${ReservedLabelPrefix} are reserved for the specs safebyok supplies, present and future: choose a label of your own, naming your app, say.`)
    }
    return
  }
  const carried: Readonly<Record<string, unknown>> = candidate
  const kept = Object.entries(supplied).every(([field, val]) => carried[field] === val)
  if (! kept) {
    throw new VaultError('bad_option', `A key deriver labelled ${supplied.key_deriver_label} must carry that spec's parameters exactly, or vaults made under it will not open elsewhere: spread the exported spec into yours and test that it derives the same bytes as argon2idWebV1Deriver, or choose a label of your own.`)
  }
}

/** Run `keyDeriver`'s `load`, if it has one, refusing a failure 'unexpected_error' with what it threw as the cause, as a load hears no passphrase.
 *
 * @example await loadKeyDeriver(argon2idWebV1Deriver)   // resolves at once: it carries no load
 */
export const loadKeyDeriver = async (keyDeriver: Pick<KeyDeriver, 'load'>): Promise<void> => {
  try {
    await keyDeriver.load?.()
  } catch (err) {
    throw new VaultError('unexpected_error', "The keyDeriver's load() failed, so no passphrase could be turned into a key, and bank.hello() was refused rather than open a vault in that state. Its error is this error's cause: check that your build ships what the deriver loads and your page may fetch it. A dropped connection mends at the next bank.hello().", { cause: err })
  }
}

/** Refuse 'bad_option' for a passphraseSalt that is not `spec.salt_bytes` long, never quoting it. Call it in a deriver before it derives.
 * So a damaged stored salt fails with a kind, not as the library's plain Error.
 *
 * @example checkSaltFits(Argon2idWebV1, randomBytes(16))  // returns
 * @example checkSaltFits(Argon2idWebV1, new Uint8Array(15))  // throws 'bad_option': a salt of 16 bytes is asked
 */
export const checkSaltFits = (spec: { readonly salt_bytes: number }, saltBytes: Uint8Array) => {
  if (saltBytes.length !== spec.salt_bytes) {
    throw new VaultError('bad_option', `This key deriver takes a passphraseSalt of ${String(spec.salt_bytes)} bytes, and was handed one of ${String(saltBytes.length)}: a salt made by another deriver, or a stored salt that has been damaged.`)
  }
}

/** The message of a spec's refusal, whichever field failed: every field and what it must be, quoting nothing handed in. */
const SpecRefused = "Argon2id cannot run that keyDeriverSpec. A spec holds algorithm 'argon2id', the one key derivation function safebyok runs; key_deriver_label, a non-empty string of your own choosing; memory_kib, a whole number of KiB, at least 8 for each lane and at most 1048576 (1 GiB); iterations, a whole number of passes, at least 1 and below 2^32; parallelism, a whole number of lanes, at least 1; salt_bytes, a whole number of bytes from 8 to 65536; and output_bytes, 32, as the passphraseKey is a 256-bit key."

/** `candidate` as a KeyDeriverSpec Argon2id can run, holding nothing but a spec's fields. Check a spec through it in another Argon2id implementation.
 * Weak parameters that run are allowed: choosing them is the host's call.
 *
 * It refuses 'bad_option' for a spec Argon2id cannot run, in one sentence saying what each field
 * must be: a salt under 8 bytes or over 65536, memory under 8 KiB a lane or over 1 GiB, no passes,
 * no lanes, or a passphraseKey other than 32 bytes. It refuses a label safebyok reserves as
 * {@link checkSuppliedSpecKept} does.
 *
 * @example
 *   const spec = parseKeyDeriverSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
 *   // spec.memory_kib === 131_072
 * @example
 *   parseKeyDeriverSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 })
 *   // throws 'bad_option': Argon2id takes no salt under 8 bytes
 * @example
 *   parseKeyDeriverSpec({ ...Argon2idWebV1, key_deriver_label: 'argon2id_web_v2' })
 *   // throws 'bad_option': that label is reserved
 */
export const parseKeyDeriverSpec = (candidate: KeyDeriverSpec): KeyDeriverSpec => {
  const checked = keyDeriverSpec.safeParse(candidate)
  if (! checked.success) { throw new VaultError('bad_option', SpecRefused) }
  checkSuppliedSpecKept(checked.data)
  return checked.data
}

/** The label prefix that marks a deriver made cheap for tests, which no vault of real secrets should use. */
export const TestLabelPrefix = 'test_'

/** The warning `Bank.make` logs when the keyDeriver's label begins {@link TestLabelPrefix}. */
export const TestDeriverNotice = "The keyDeriver's label begins test_, the mark of a deriver made cheap for tests: it gives a passphrase next to no protection against guessing. If this vault holds real secrets, open it with argon2idWebV1Deriver, or another vetted Argon2id deriver."
