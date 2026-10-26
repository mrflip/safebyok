import { VaultError } from './errors'
import { Validator } from './checks/validator'

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

/** The most bytes `crypto.getRandomValues` hands out at once, and so the longest passphraseSalt. */
export const MaxSaltBytes = 65_536

/** How many bytes a passphraseKey is: a 256-bit AES-GCM key. */
export const PassphraseKeyBytes = 32

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

/** Refuse 'bad_option' for a passphraseSalt that is not `spec.salt_bytes` long, never quoting it: a deriver's check before it derives.
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

/** The fewest salt bytes Argon2id takes: its reference code and `@noble/hashes` refuse fewer. */
const MinArgon2SaltBytes = 8

/** The most memory `@noble/hashes` allocates for one Argon2 derivation, in KiB: 1 GiB. */
const MaxMemoryKib = 1_048_576

/** Argon2's least memory per lane, in KiB. */
const MinMemoryKibPerLane = 8

/** One past the largest 32-bit unsigned integer, Argon2's bound on its counts. */
const Uint32Bound = 2 ** 32

// Marked pure, and read only inside parseKeyDeriverSpec, so a bundler drops it, and Zod with it,
// from an app that imports only argon2idWebV1Deriver: a destructured or exported member would keep it.
const SpecChecks = /* @__PURE__ */ Validator('bad_option', ({ obj, str, int, lit }) => ({
  keyDeriverSpec: obj({
    algorithm:         lit('argon2id'),
    key_deriver_label: str.min(1),
    memory_kib:        int.gte(MinMemoryKibPerLane).lte(MaxMemoryKib),
    iterations:        int.gte(1).lt(Uint32Bound),
    parallelism:       int.gte(1),
    salt_bytes:        int.gte(MinArgon2SaltBytes).lte(MaxSaltBytes),
    output_bytes:      lit(PassphraseKeyBytes),
  }).refine((spec) => spec.memory_kib >= MinMemoryKibPerLane * spec.parallelism, { path: ['memory_kib'] }),
}))

/** What each of a spec's fields must be, as a refusal says it: never quoting what was handed in. */
const SpecLimitForField: Readonly<Record<keyof KeyDeriverSpec, string>> = {
  algorithm:         "algorithm is 'argon2id', the one key derivation function safebyok runs.",
  key_deriver_label: 'key_deriver_label is a non-empty string of your own choosing, stored beside every vault made under the spec.',
  memory_kib:        'memory_kib is a whole number of KiB, at least 8 for each lane (parallelism) and at most 1048576 (1 GiB), the most @noble/hashes allocates.',
  iterations:        'iterations is a whole number of passes, at least 1 and below 2^32, the most Argon2 counts.',
  parallelism:       'parallelism is a whole number of lanes, at least 1.',
  salt_bytes:        "salt_bytes is a whole number of bytes, at least 8 (Argon2id's least) and at most 65536 (the most the platform's random source hands out at once).",
  output_bytes:      'output_bytes is 32: the passphraseKey is a 256-bit key.',
}

/** `candidate` as a KeyDeriverSpec Argon2id can run, holding nothing but a spec's fields: the check for another Argon2id implementation to make.
 * `argon2idDeriver` makes it, and so does `Bank.make` of a deriver declaring `algorithm: 'argon2id'`.
 * Weak parameters that run are allowed: choosing them is the host's call.
 *
 * It refuses 'bad_option', naming the field, for a spec Argon2id cannot run. That is a salt under
 * 8 bytes or over 65536, memory under 8 KiB a lane or over 1 GiB, no passes, no lanes, or a key
 * other than 32 bytes. It refuses as {@link checkSuppliedSpecKept} does a label safebyok reserves.
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
  const checked = SpecChecks.keyDeriverSpec.safeParse(candidate)
  if (! checked.success) {
    const field = checked.error.issues[0]?.path[0]
    const limit = (typeof field === 'string' && Object.hasOwn(SpecLimitForField, field))
      ? SpecLimitForField[field as keyof KeyDeriverSpec]
      : 'It needs every field of a KeyDeriverSpec: algorithm, key_deriver_label, memory_kib, iterations, parallelism, salt_bytes and output_bytes.'
    throw new VaultError('bad_option', `Argon2id cannot run that keyDeriverSpec. ${limit}`)
  }
  checkSuppliedSpecKept(checked.data)
  return checked.data
}

/** The label prefix that marks a deriver made cheap for tests, which no vault of real secrets should use. */
export const TestLabelPrefix = 'test_'

/** What `Bank.make` warns through the logger when the keyDeriver's label begins {@link TestLabelPrefix}. */
export const TestDeriverNotice = "The keyDeriver's label begins test_, the mark of a deriver made cheap for tests: it gives a passphrase next to no protection against guessing. If this vault holds real secrets, open it with argon2idWebV1Deriver, or another vetted Argon2id deriver."
