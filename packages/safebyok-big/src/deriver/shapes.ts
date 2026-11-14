import type * as Z from 'zod'
import { Checkers } from '../helpers/validator'
import { PassphraseKeySize, PassphraseSaltSize } from '../helpers/consts'
import * as Phrases from '../helpers/phrases'

// == [Bounds]: MaxMemoryKib, MinMemoryKibPerLane, Uint32Bound, ReservedLabelPrefix, TestLabelPrefix

const MaxMemoryKib        = 1_048_576
const MinMemoryKibPerLane = 8
const Uint32Bound         = 2 ** 32

/** Labels starting with this prefix are reserved for the key derivers safebyok supplies. */
export const ReservedLabelPrefix = 'argon2id_web_'

/** Labels starting with this prefix mark a key deriver made cheap for tests. */
export const TestLabelPrefix = 'test_'
// --

// == [The spec]: Argon2idWebV1, SuppliedSpecs, keyDeriverSpec, KeyDeriverSpec

/** The Argon2id settings of the key deriver safebyok supplies. */
export const Argon2idWebV1 = Object.freeze({
  algorithm:         'argon2id',
  key_deriver_label: 'argon2id_web_v1',
  memory_kib:        65_536,
  iterations:        3,
  parallelism:       1,
  salt_size:        PassphraseSaltSize,
  output_size:      PassphraseKeySize,
} as const) satisfies KeyDeriverSpec

/** Every key deriver spec safebyok supplies, whose settings no caller may change. */
export const SuppliedSpecs: readonly KeyDeriverSpec[] = Object.freeze([Argon2idWebV1])

/** The label and Argon2id settings of a key deriver, each within its bounds, a supplied spec's settings kept and a label under {@link ReservedLabelPrefix} refused. */
export const { keyDeriverSpec } = Checkers('bad_option', ({ obj, str, int, lit }) => ({
  keyDeriverSpec: obj({
    algorithm:         lit('argon2id'),
    key_deriver_label: str.min(1),
    memory_kib:        int.gte(MinMemoryKibPerLane).lte(MaxMemoryKib),
    iterations:        int.gte(1).lt(Uint32Bound),
    parallelism:       int.gte(1),
    salt_size:        lit(PassphraseSaltSize),
    output_size:      lit(PassphraseKeySize),
  }, Phrases.KeyDeriverSpecShape)
    .refine((spec) => spec.memory_kib >= MinMemoryKibPerLane * spec.parallelism, { error: Phrases.memoryPerLane(MinMemoryKibPerLane), path: ['memory_kib'] })
    .superRefine((spec, ctx) => {
      const supplied = SuppliedSpecs.find(({ key_deriver_label }) => key_deriver_label === spec.key_deriver_label)
      if (supplied === undefined) {
        if (spec.key_deriver_label.toLowerCase().startsWith(ReservedLabelPrefix)) { ctx.addIssue({ code: 'custom', message: Phrases.reservedDeriverLabel(ReservedLabelPrefix), path: ['key_deriver_label'] }) }
      } else if (Object.entries(supplied).some(([fieldname, val]) => (spec as Readonly<Record<string, unknown>>)[fieldname] !== val)) {
        ctx.addIssue({ code: 'custom', message: Phrases.suppliedSpecChanged(supplied.key_deriver_label), path: ['key_deriver_label'] })
      }
    }),
}))

export type KeyDeriverSpec = Z.infer<typeof keyDeriverSpec>
// --
