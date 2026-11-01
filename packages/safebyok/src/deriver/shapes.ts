import type * as Z from 'zod'
import { Checkers } from '../checks/validator'
import { MaxSaltBytes, PassphraseKeyBytes } from '../consts'
import * as Phrases from '../phrases'

// == [Bounds]: MinArgon2SaltBytes, MaxMemoryKib, MinMemoryKibPerLane, Uint32Bound, ReservedLabelPrefix, TestLabelPrefix

const MinArgon2SaltBytes  = 8
const MaxMemoryKib        = 1_048_576
const MinMemoryKibPerLane = 8
const Uint32Bound         = 2 ** 32

export const ReservedLabelPrefix = 'argon2id_web_'

export const TestLabelPrefix = 'test_'
// --

// == [The spec]: keyDeriverSpec, KeyDeriverSpec, Argon2idWebV1, SuppliedSpecs

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

export type KeyDeriverSpec = Z.infer<typeof keyDeriverSpec>

export const Argon2idWebV1 = Object.freeze({
  algorithm:         'argon2id',
  key_deriver_label: 'argon2id_web_v1',
  memory_kib:        65_536,
  iterations:        3,
  parallelism:       1,
  salt_bytes:        16,
  output_bytes:      32,
} as const) satisfies KeyDeriverSpec

export const SuppliedSpecs: readonly KeyDeriverSpec[] = Object.freeze([Argon2idWebV1])
// --
