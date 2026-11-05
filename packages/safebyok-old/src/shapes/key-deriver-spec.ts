/** The check of a keyDeriverSpec, kept apart: import it only where a spec is checked, so an app that uses only `argon2idWebV1Deriver` ships no Zod. */

import { MaxSaltBytes, PassphraseKeyBytes } from '../consts'
import * as Phrases from '../phrases'
import { Checker } from '../checks/validator'

/** The fewest salt bytes Argon2id takes: its reference code and `@noble/hashes` refuse fewer. */
const MinArgon2SaltBytes = 8

/** The most memory `@noble/hashes` allocates for one Argon2 derivation, in KiB: 1 GiB. */
const MaxMemoryKib = 1_048_576

/** Argon2's least memory per lane, in KiB. */
const MinMemoryKibPerLane = 8

/** One past the largest 32-bit unsigned integer, Argon2's bound on its counts. */
const Uint32Bound = 2 ** 32

/** A keyDeriverSpec Argon2id can run: a spec's fields alone, each within the bounds Argon2id and `@noble/hashes` keep. Its `parse` refuses 'bad_option', naming the field. */
export const keyDeriverSpec = Checker(({ obj, str, int, lit }) => obj({
  algorithm:         lit('argon2id'),
  key_deriver_label: str.min(1),
  memory_kib:        int.gte(MinMemoryKibPerLane).lte(MaxMemoryKib),
  iterations:        int.gte(1).lt(Uint32Bound),
  parallelism:       int.gte(1),
  salt_bytes:        int.gte(MinArgon2SaltBytes).lte(MaxSaltBytes),
  output_bytes:      lit(PassphraseKeyBytes),
}, Phrases.KeyDeriverSpecShape).refine((spec) => spec.memory_kib >= MinMemoryKibPerLane * spec.parallelism, { error: Phrases.memoryPerLane(MinMemoryKibPerLane), path: ['memory_kib'] }), 'bad_option')
