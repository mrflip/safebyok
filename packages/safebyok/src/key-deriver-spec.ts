import * as Z from 'zod/mini'
import { VaultError } from './errors'

/**
 * A keyDeriverSpec: what every key deriver is made with, whatever it runs -- the algorithm, the
 * keyDeriverLabel a vault records, and the length of salt it takes. A deriver's own algorithm
 * adds its parameters ({@link Argon2idSpec} for Argon2id's). A vault stores only the label, so a
 * label must always mean the same derivation: change any of it and the vaults made under the old
 * one stop opening.
 *
 * @example const spec: KeyDeriverSpec = { algorithm: 'scrypt', key_deriver_label: 'acme_scrypt_v1', salt_bytes: 16 }
 */
export type KeyDeriverSpec = {
  /** What the deriver runs, in its own words: `argon2id`, which only the Argon2id family may say, or another. */
  readonly algorithm:         string
  /** Stored beside each vault: a vault opens only under a deriver carrying the same one. */
  readonly key_deriver_label: string
  /** How long a passphraseSalt is, in bytes: from 1 to 65536. */
  readonly salt_bytes:        number
}

/**
 * Argon2id's keyDeriverSpec: its whole parameter set, under the keyDeriverLabel a vault records.
 * {@link Argon2idWebV1} is the one safebyok supplies; `argon2idDeriver` turns one of your own into
 * a KeyDeriver.
 *
 * @example
 *   const spec: Argon2idSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 }
 */
export type Argon2idSpec = KeyDeriverSpec & {
  readonly algorithm:    'argon2id'
  /** Argon2 memory cost, in KiB: from 8 per lane up to 1048576 (1 GiB). */
  readonly memory_kib:   number
  /** Argon2 passes over memory (its time cost): at least 1. */
  readonly iterations:   number
  /** Argon2 lanes: at least 1. A JavaScript deriver runs them one after another. */
  readonly parallelism:  number
  /** How many key bytes come out: always 32, as a 256-bit passphraseKey needs. */
  readonly output_bytes: number
}

/**
 * The keyDeriverSpec safebyok supplies, and the one `browserOpts()` derives under: Argon2id over
 * 64 MiB, three passes, one lane, a 16-byte salt and a 32-byte key. It is above OWASP's
 * Argon2id minimums, and is RFC 9106's second recommended option with one lane in place of four
 * (a JavaScript deriver runs lanes one after another, so more lanes buy a browser nothing).
 * A deriver that wears its label must carry exactly these parameters: every KeyDeriver refuses
 * one that does not, as it is made.
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
} as const) satisfies Argon2idSpec

/** Every keyDeriverSpec safebyok supplies: a deriver wearing a label here carries its fields. */
const SuppliedSpecs: readonly Argon2idSpec[] = [Argon2idWebV1]

/** The most bytes `crypto.getRandomValues` hands out at once, and so the longest passphraseSalt. */
export const MaxSaltBytes = 65_536

/** How many bytes a passphraseKey is: a 256-bit AES-GCM key. */
export const PassphraseKeyBytes = 32

/**
 * The label prefix reserved for the specs safebyok supplies, present and to come
 * (`argon2id_web_v1` now, an `argon2id_web_v2` one day): a host's own label may not start with it,
 * whatever the letters' case, so a spec added later never collides with a label a host already
 * stored vaults under.
 */
export const ReservedLabelPrefix = 'argon2id_web_'

/**
 * Refuse (kind 'bad_option') a key deriver or spec whose label is one safebyok reserves for
 * itself: one that begins `argon2id_web_` (any case) and is not a supplied spec's own label, or
 * is one but does not carry each of that spec's parameters -- a vault made under it on one device
 * would not open under the real one on another.
 *
 * @param candidate - A key deriver or spec as a host hands it over: its label, and the parameters it carries.
 */
export const ensureSuppliedSpecKept = (candidate: Readonly<Record<string, unknown>> & { readonly key_deriver_label: string }) => {
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

/**
 * Refuse (kind 'bad_option') a passphraseSalt whose length is not the one `spec` says: what every
 * KeyDeriver checks before its runner derives anything, so a corrupt stored salt fails with a
 * kind and not as a library's plain Error. It never quotes the salt.
 *
 * @param spec - The spec the deriver runs: its `salt_bytes` is the length asked.
 * @param saltBytes - The passphraseSalt a deriver was handed.
 *
 * @example ensureSaltFits(Argon2idWebV1, randomBytes(16))  // returns
 * @example ensureSaltFits(Argon2idWebV1, new Uint8Array(15))  // throws 'bad_option': a salt of 16 bytes is asked
 */
export const ensureSaltFits = (spec: { readonly salt_bytes: number }, saltBytes: Uint8Array) => {
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

// Marked pure, so a bundler drops them from an app that imports only a spec, and makes no deriver.
const keyDeriverSpec = /* @__PURE__ */ Z.object({
  algorithm:         Z.string().check(Z.minLength(1)),
  key_deriver_label: Z.string().check(Z.minLength(1)),
  salt_bytes:        Z.int().check(Z.gte(1), Z.lte(MaxSaltBytes)),
})

const argon2idSpec = /* @__PURE__ */ Z.object({
  algorithm:         Z.literal('argon2id'),
  key_deriver_label: Z.string().check(Z.minLength(1)),
  memory_kib:        Z.int().check(Z.gte(MinMemoryKibPerLane), Z.lte(MaxMemoryKib)),
  iterations:        Z.int().check(Z.gte(1), Z.lt(Uint32Bound)),
  parallelism:       Z.int().check(Z.gte(1)),
  salt_bytes:        Z.int().check(Z.gte(MinArgon2SaltBytes), Z.lte(MaxSaltBytes)),
  output_bytes:      Z.literal(PassphraseKeyBytes),
}).check(Z.refine((spec) => spec.memory_kib >= MinMemoryKibPerLane * spec.parallelism, { path: ['memory_kib'] }))

/** What each of a keyDeriverSpec's fields must be, as a refusal says it: never quoting what was handed in. */
const SpecLimitForField: Readonly<Record<keyof KeyDeriverSpec, string>> = {
  algorithm:         'algorithm is non-empty text naming what the deriver runs.',
  key_deriver_label: 'key_deriver_label is a non-empty string of your own choosing, stored beside every vault made under the spec.',
  salt_bytes:        "salt_bytes is a whole number of bytes, at least 1 and at most 65536 (the most the platform's random source hands out at once).",
}

/** What each of an Argon2idSpec's fields must be, as a refusal says it: never quoting what was handed in. */
const Argon2idLimitForField: Readonly<Record<keyof Argon2idSpec, string>> = {
  ...SpecLimitForField,
  algorithm:         "algorithm is 'argon2id': a deriver of another algorithm extends KeyDeriver, not Argon2idKeyDeriver.",
  memory_kib:        'memory_kib is a whole number of KiB, at least 8 for each lane (parallelism) and at most 1048576 (1 GiB), the most @noble/hashes allocates.',
  iterations:        'iterations is a whole number of passes, at least 1 and below 2^32, the most Argon2 counts.',
  parallelism:       'parallelism is a whole number of lanes, at least 1.',
  salt_bytes:        "salt_bytes is a whole number of bytes, at least 8 (Argon2id's least) and at most 65536 (the most the platform's random source hands out at once).",
  output_bytes:      'output_bytes is 32: the passphraseKey is a 256-bit key.',
}

/** The limit the first of `issues` broke, as `limits` words it, or `whole` when it names no field of theirs. */
const limitBroken = <Spec>(limits: Readonly<Record<keyof Spec, string>>, issues: readonly { readonly path: readonly PropertyKey[] }[], whole: string): string => {
  const field = issues[0]?.path[0]
  return (typeof field === 'string' && Object.hasOwn(limits, field)) ? limits[field as keyof Spec] : whole
}

/**
 * Refuse (kind 'bad_option') a keyDeriverSpec no key deriver may be made with: the floor every
 * KeyDeriver checks as it is made, whatever its algorithm. Its algorithm and label are non-empty
 * text, its salt a whole number of bytes from 1 to 65536, and its label not one safebyok reserves
 * (see {@link ensureSuppliedSpecKept}). It names the field, never quoting what was handed in,
 * and keeps the spec as given: a deriver's own check, run first, says what else it holds.
 *
 * @param candidate - The spec a KeyDeriver is being made with.
 *
 * @example ensureKeyDeriverSpec({ algorithm: 'scrypt', key_deriver_label: 'acme_scrypt_v1', salt_bytes: 16 })  // returns
 * @example ensureKeyDeriverSpec({ algorithm: 'scrypt', key_deriver_label: 'acme_scrypt_v1', salt_bytes: 0 })   // throws 'bad_option', naming salt_bytes
 */
export const ensureKeyDeriverSpec = (candidate: KeyDeriverSpec) => {
  const checked = keyDeriverSpec.safeParse(candidate)
  if (! checked.success) {
    const limit = limitBroken(SpecLimitForField, checked.error.issues, 'It needs every field of a KeyDeriverSpec: algorithm, key_deriver_label and salt_bytes.')
    throw new VaultError('bad_option', `No key deriver can be made with that keyDeriverSpec. ${limit}`)
  }
  ensureSuppliedSpecKept(candidate)
}

/**
 * `candidate` as an Argon2idSpec Argon2id can run, holding only a spec's fields: the check every
 * Argon2idKeyDeriver makes as it is made, `argon2idDeriver`'s and safebyok-fastkey's alike.
 * Refuses (kind 'bad_option') a spec Argon2id cannot run -- a salt under 8 bytes or over
 * 65536, memory under 8 KiB a lane or over 1 GiB, no passes, no lanes, a key other than 32
 * bytes -- and a label safebyok reserves (see {@link ReservedLabelPrefix}) or a supplied spec's
 * label without its parameters, naming the field and never quoting what was handed in. Weak
 * parameters that run are allowed: choosing them is the host's call.
 *
 * @param candidate - A host's Argon2idSpec, as handed to a deriver.
 * @returns The spec, checked, with nothing but its fields.
 *
 * @example
 *   const spec = parseArgon2idSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
 *   // spec.memory_kib === 131_072
 * @example
 *   parseArgon2idSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 })
 *   // throws 'bad_option': Argon2id takes no salt under 8 bytes
 * @example
 *   parseArgon2idSpec({ ...Argon2idWebV1, key_deriver_label: 'argon2id_web_v2' })
 *   // throws 'bad_option': that label is reserved
 */
export const parseArgon2idSpec = (candidate: Argon2idSpec): Argon2idSpec => {
  const checked = argon2idSpec.safeParse(candidate)
  if (! checked.success) {
    const limit = limitBroken(Argon2idLimitForField, checked.error.issues, 'It needs every field of an Argon2idSpec: algorithm, key_deriver_label, memory_kib, iterations, parallelism, salt_bytes and output_bytes.')
    throw new VaultError('bad_option', `Argon2id cannot run that keyDeriverSpec. ${limit}`)
  }
  ensureSuppliedSpecKept(checked.data)
  return checked.data
}

/** The label prefix that marks a deriver made cheap for tests, which no vault of real secrets should use. */
export const TestLabelPrefix = 'test_'

/** What `Vault.make` warns through the logger when the keyDeriver's label begins {@link TestLabelPrefix}. */
export const TestDeriverNotice = "The keyDeriver's label begins test_, the mark of a deriver made cheap for tests: it gives a passphrase next to no protection against guessing. If this vault holds real secrets, open it with argon2idWebV1Deriver, or another vetted Argon2id deriver."
