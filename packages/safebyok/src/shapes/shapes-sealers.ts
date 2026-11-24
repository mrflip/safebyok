/** The forms of a sealed record, the `Sealer` a lease seals and unseals with, and a box's records. */

import { isEmptyObject } from 'es-toolkit'
import { exactOptional } from 'zod'
import { CX, type Crypto, type SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import type { EpochMillis, VoidLifeseq } from './primitives'
import type { BoxRecord, BoxSparse, Sealed, Sparse, ThingRecord } from './shapes-thing'

export type { Sealed } from './shapes-thing'

// == [A record's forms]: SealedPartsOf, SealedOf, UnsealedOf, LiveOf, TombstoneOf, SparseOf, ShellOf, RevisionOf, BodyOf, Sealable, PublicPropsOf, LivePublicPropsOf, TombstonePublicProps

/** A {@link Sealed} field at `<part>_sealed` for each part that `CleartextsT` names. */
export type SealedPartsOf<CleartextsT> = { readonly [PartT in keyof CleartextsT & string as `${PartT}_sealed`]: Sealed }

/** `RecordT` with each part that `CleartextsT` names replaced by its sealed form, at `<part>_sealed`. A union is mapped member by member. */
export type SealedOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof CleartextsT> & SealedPartsOf<CleartextsT> : never

/** `RecordT` with each `<part>_sealed` that `CleartextsT` names replaced by its cleartext, at `<part>`. A union is mapped member by member. */
export type UnsealedOf<RecordT, CleartextsT> = RecordT extends unknown
  ? Omit<RecordT, `${keyof CleartextsT & string}_sealed`> & CleartextsT
  : never

/** The live records of `RecordT`. */
export type LiveOf<RecordT> = RecordT & Readonly<{ am: 'a' }>

/** The tombstones of `RecordT`. */
export type TombstoneOf<RecordT> = RecordT & Readonly<{ am: 'x' }>

/** The sparse form of `RecordT`: a live box without its body ({@link BoxSparse}), and none for a bank or a gate. */
export type SparseOf<RecordT> = RecordT extends BoxRecord ? BoxSparse : never

/** The shell of `RecordT`: the void record, without a body, that its first revision is sealed over and cites.
 * Its revision is the void one: revseq -1, and the void revtok and lifeseq.
 */
export type ShellOf<RecordT extends Sparse<ThingRecord>> = Sparse<TombstoneOf<RecordT>> & Readonly<{
  revtok:  typeof SX.VoidRevisionTok
  revseq:  typeof SX.VoidRevisionSeq
  lifeseq: typeof VoidLifeseq
}>

/** A revision of `RecordT` before it is sealed, without the sealed parts that `CleartextsT` names. A union is mapped member by member. */
export type RevisionOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof SealedPartsOf<CleartextsT>> : never

/** The body of a live `RecordT`: its fields other than its Thing fields and its sealed parts, such as a box's sidecar. */
export type BodyOf<RecordT, CleartextsT> = Omit<LiveOf<RecordT>, keyof Sparse<ThingRecord> | keyof SealedPartsOf<CleartextsT>>

// A body field may be undefined, as it is in the shell and in a live box's sparse form, so that a Thing is sealable as it stands.
/** The record of `RecordT`'s kind that a seal makes the next revision from: whole, sparse or unsealed, live, a tombstone or the shell.
 * The seal carries over its Thing fields and its body, and never its secrets.
 */
export type Sealable<RecordT extends Sparse<ThingRecord>> = Omit<Sparse<RecordT>, 'am'> & Readonly<{ am: Sparse<ThingRecord>['am'] }> & {
  [FieldT in Exclude<keyof LiveOf<RecordT>, keyof Sparse<ThingRecord>>]?: LiveOf<RecordT>[FieldT] | undefined
}

/** A seal's public props: the fields it is given that are not secret, each optional.
 * - the body's fields -- replace those of the sealable
 * - `am`              -- `'a'` for a live revision (default), or `'x'` for a tombstone
 * - `written_at`      -- the revision's time (default: now)
 */
export type PublicPropsOf<RecordT, CleartextsT> = Partial<BodyOf<RecordT, CleartextsT>> & Readonly<{ am?: 'a' | 'x', written_at?: EpochMillis }>

/** {@link PublicPropsOf} for a live revision: `am` is `'a'` or left out. */
export type LivePublicPropsOf<RecordT, CleartextsT> = Partial<BodyOf<RecordT, CleartextsT>> & Readonly<{ am?: 'a', written_at?: EpochMillis }>

/** The public props of a tombstone's seal: `am: 'x'`, and `written_at` (default: now). */
export type TombstonePublicProps = Readonly<{ am: 'x', written_at?: EpochMillis }>
// --

// == [The Sealer]: SealTags, SealPurposes, Sealer

/** The tags of a sealed part, stored unencrypted and bound into its seal. */
export type SealTags = Pick<Sealed, 'codectag' | 'schematag'>

/** The ctx purposes a sealed part's two ciphertexts are bound to. */
export interface SealPurposes {
  key:    string
  cipher: string
}

/** The interface through which a lease seals and unseals one part of a record.
 * `RecordT` is the stored record, with its part sealed. `CleartextsT` is the part's cleartexts.
 * Each member must check what it is given: the lease passes its caller's arguments on unchecked.
 */
export interface Sealer<RecordT extends Sparse<ThingRecord>, CleartextsT> {
  /** The Thing fields and body of `donorProps`, with every other field dropped. Refuses anything but a record of this kind or its shell. */
  donorPropsOf(donorProps: unknown): Sealable<RecordT>
  /** The body, `am` and `written_at` of `publicProps`. Refuses any other field. */
  publicPropsOf(publicProps: unknown): PublicPropsOf<RecordT, CleartextsT>
  /** The cleartexts in `secretProps`. Refuses any other field. */
  secretPropsOf(secretProps: unknown): CleartextsT
  /** The next live revision after `donorProps`, updated by `publicProps`, without its sealed part. */
  nextRevisionOf(donorProps: unknown, publicProps: unknown): RevisionOf<LiveOf<RecordT>, CleartextsT>
  /** The tombstone of the live `donorProps`, without its sealed part. Refuses a tombstone or the shell.
   * Its `written_at` is `publicProps.written_at`, or now.
   */
  tombstoneOf(donorProps: unknown, publicProps: unknown): RevisionOf<TombstoneOf<RecordT>, CleartextsT>
  /** The empty cleartexts a tombstone seals. Their seal authenticates the tombstone. */
  readonly tombstoneSecrets: CleartextsT
  /** The stamp of `record` that its seal is bound to, after the bank's. Any change to it makes the unseal refuse. */
  stampOf(record: unknown): Crypto.CipherCtxRecord
  /** The tags each seal carries. */
  readonly tags: SealTags
  /** The ctx purposes of the wrapped key and of the ciphertext. */
  readonly purposes: SealPurposes
  /** `cleartexts` as the text to cipher. */
  encode(cleartexts: CleartextsT): string
  /** The cleartexts in `text`. Refuses as damaged when the text does not parse or check. A refusal must not quote `text`, which contains cleartext. */
  decode(text: string): CleartextsT
  /** The sealed part of `record`. Refuses as damaged when its tags are not this sealer's. */
  sealedOf(record: RecordT): Sealed
  /** `next` with `sealed` added, checked as a stored record. */
  recordOf(next: unknown, sealed: Sealed): RecordT
}
// --

// == [A box's records]: SealerChecks, BoxCleartexts, BoxPublicProps, BoxTombstonePublicProps

// Strict, since a misspelt key in any of these bags would otherwise be dropped without a word.
/** The checks of what a box's seal is given beside its sealable: the public props of a revision and of a tombstone, and the cleartexts. */
export const SealerChecks = Validator.Checkers('bad_record', ({ obj, lit, oneof, epochMillis }) => ({
  boxPublicProps:          obj({ sidecar: exactOptional(CX.sidecar), am: exactOptional(oneof(['a', 'x'])), written_at: exactOptional(epochMillis) }).strict(),
  // A tombstone's sidecar is always `{}`, and its am `'x'`: each may be given, so long as it is that.
  boxTombstonePublicProps: obj({
    sidecar:    exactOptional(CX.sidecar.refine(isEmptyObject, Phrases.TombstoneSidecarNotEmpty)),
    am:         exactOptional(lit('x')),
    written_at: exactOptional(epochMillis),
  }).strict(),
  boxCleartexts:           obj({ whisper: CX.whisper }).strict(),
}))

/** The cleartexts of a box: its whisper. */
export interface BoxCleartexts {
  whisper: CX.Whisper
}

/** The public props of a box's seal ({@link PublicPropsOf}): its sidecar, `am` and `written_at`, each optional. */
export type BoxPublicProps = PublicPropsOf<BoxRecord, BoxCleartexts>

/** The public props of a box tombstone's seal ({@link TombstonePublicProps}): its sidecar may be given too, as `{}`, a tombstone's own. */
export type BoxTombstonePublicProps = TombstonePublicProps & Readonly<{ sidecar?: Record<string, never> }>
// --
