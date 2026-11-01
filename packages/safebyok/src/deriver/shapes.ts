import type * as Z from 'zod'
import { Checkers } from '../checks/validator'
import { MaxSaltBytes, PassphraseKeyBytes } from '../consts'
import * as Phrases from '../phrases'

// == [Bounds]: MinArgon2SaltBytes, MaxMemoryKib, MinMemoryKibPerLane, Uint32Bound, ReservedLabelPrefix, TestLabelPrefix

const MinArgon2SaltBytes  = 8
const MaxMemoryKib        = 1_048_576
const MinMemoryKibPerLane = 8
const Uint32Bound         = 2 ** 32

/** The label prefix safebyok keeps for the specs it supplies: a deriver wears one only if it carries that spec whole. */
export const ReservedLabelPrefix = 'argon2id_web_'

/** The label prefix that marks a deriver made cheap for tests: `Bank.make` warns of one. */
export const TestLabelPrefix = 'test_'
// --

// == [The spec]: keyDeriverSpec, KeyDeriverSpec, Argon2idWebV1, SuppliedSpecs

/** The check of a {@link KeyDeriverSpec}: Argon2id's whole parameter set, within what Argon2id and `@noble/hashes` can run. Its `parse` refuses 'bad_option', naming the field. */
export const { keyDeriverSpec } = Checkers('bad_option', ({ obj, str, int, lit }) => ({
  keyDeriverSpec: obj({
    algorithm:         lit('argon2id'),
    key_deriver_label: str.min(1),
    memory_kib:        int.gte(MinMemoryKibPerLane).lte(MaxMemoryKib),
    iterations:        int.gte(1).lt(Uint32Bound),
    parallelism:       int.gte(1),
    salt_bytes:        int.gte(MinArgon2SaltBytes).lte(MaxSaltBytes),
    output_bytes:      lit(PassphraseKeyBytes),
  }, Phrases.KeyDeriverSpecShape).refine((spec) => spec.memory_kib >= MinMemoryKibPerLane * spec.parallelism, { error: Phrases.memoryPerLane(MinMemoryKibPerLane), path: ['memory_kib'] }),
}))

/** Argon2id's whole parameter set, under the `key_deriver_label` a vault records. */
export type KeyDeriverSpec = Z.infer<typeof keyDeriverSpec>

/** The spec safebyok supplies: Argon2id over 64 MiB, 3 passes, 1 lane, a 16-byte salt. Its label always means these parameters. */
export const Argon2idWebV1 = Object.freeze({
  algorithm:         'argon2id',
  key_deriver_label: 'argon2id_web_v1',
  memory_kib:        65_536,
  iterations:        3,
  parallelism:       1,
  salt_bytes:        16,
  output_bytes:      32,
} as const) satisfies KeyDeriverSpec

/** Every spec safebyok supplies. */
export const SuppliedSpecs: readonly KeyDeriverSpec[] = Object.freeze([Argon2idWebV1])
// --
