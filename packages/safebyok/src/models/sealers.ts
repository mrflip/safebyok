import type { CX, Crypto } from 'safebyok-big/internals'
import type { BoxThing, Sealed, Sparse, ThingRecord } from '../storage/shapes-thing'

export type { Sealed } from '../storage/shapes-thing'

// == [A record's forms]: SealedPartsOf, SealedOf, UnsealedOf, LiveOf, TombstoneOf, RevisionOf, BodyOf, Sealable, PublicPropsOf, LivePublicPropsOf, TombstonePublicProps

/** Each part `CleartextsT` names, sealed, at `<part>_sealed`. */
export type SealedPartsOf<CleartextsT> = { readonly [PartT in keyof CleartextsT & string as `${PartT}_sealed`]: Sealed }

/** `RecordT` with each part `CleartextsT` names sealed, at `<part>_sealed`. A union is mapped member by member. */
export type SealedOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof CleartextsT> & SealedPartsOf<CleartextsT> : never

/** `RecordT` with each `<part>_sealed` that `CleartextsT` names unsealed, at `<part>`. A union is mapped member by member. */
export type UnsealedOf<RecordT, CleartextsT> = RecordT extends unknown
  ? Omit<RecordT, `${keyof CleartextsT & string}_sealed`> & CleartextsT
  : never

/** The live records of `RecordT`. */
export type LiveOf<RecordT> = Exclude<RecordT, { am: 'x' }>

/** The tombstones of `RecordT`. */
export type TombstoneOf<RecordT> = Extract<RecordT, { am: 'x' }>

/** A revision of `RecordT` before its seal: without the sealed parts `CleartextsT` names. A union is mapped member by member. */
export type RevisionOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof SealedPartsOf<CleartextsT>> : never

/** The body of a live `RecordT`: its fields other than its Thing fields and its sealed parts, such as a box's sidecar. */
export type BodyOf<RecordT, CleartextsT> = Omit<LiveOf<RecordT>, keyof ThingRecord | keyof SealedPartsOf<CleartextsT>>

/** What a seal takes the next revision's fields from: a record of `RecordT`'s kind, whole, sparse or unsealed, a tombstone or the shell.
 * The seal keeps its Thing fields and its body, and never its secrets.
 */
export type Sealable<RecordT extends ThingRecord> = Omit<Sparse<RecordT>, 'am'> & Readonly<{ am: ThingRecord['am'] }> & Partial<Omit<LiveOf<RecordT>, keyof ThingRecord>>

/** What a seal takes in the clear: any of the body, which wins over the donor's; `am`; and `written_at`, now when left out. */
export type PublicPropsOf<RecordT, CleartextsT> = Partial<BodyOf<RecordT, CleartextsT>> & Readonly<{ am?: 'a' | 'x', written_at?: number }>

/** What the seal of a live revision takes in the clear: {@link PublicPropsOf}, with `am` live or left out. */
export type LivePublicPropsOf<RecordT, CleartextsT> = Partial<BodyOf<RecordT, CleartextsT>> & Readonly<{ am?: 'a', written_at?: number }>

/** What the seal of a tombstone takes in the clear: `am: 'x'`, and `written_at`, now when left out. */
export type TombstonePublicProps = Readonly<{ am: 'x', written_at?: number }>
// --

// == [The Sealer]: SealTags, SealPurposes, Sealer

/** The tags a sealed part carries in the clear, which its seal binds. */
export type SealTags = Pick<Sealed, 'codectag' | 'schematag'>

/** The ctx purposes a sealed part's two ciphertexts are bound to. */
export interface SealPurposes {
  key:    string
  cipher: string
}

/** The interface a lease seals one part of a record through, so the lease itself knows nothing of the record.
 * `RecordT` is the record as stored, its part sealed; `CleartextsT` is what that part seals. Each member checks what it is given.
 */
export interface Sealer<RecordT extends ThingRecord, CleartextsT> {
  /** The Thing fields and body of `donor`, its other fields dropped. Refuses what is not a record of this kind or its shell. */
  donorPropsOf(donor: unknown): Sealable<RecordT>
  /** The body, `am` and `written_at` of `publicProps`, its other fields dropped. */
  publicPropsOf(publicProps: unknown): PublicPropsOf<RecordT, CleartextsT>
  /** The cleartexts in `secretProps`, its other fields dropped. */
  secretPropsOf(secretProps: unknown): CleartextsT
  /** The live revision next after `donor`, without its sealed part, with `publicProps` laid over it. */
  nextRevisionOf(donor: unknown, publicProps: unknown): RevisionOf<LiveOf<RecordT>, CleartextsT>
  /** The tombstone of the live `donor`, without its sealed part, written at `publicProps.written_at`. Refuses a tombstone or the shell. */
  tombstoneOf(donor: unknown, publicProps: unknown): RevisionOf<TombstoneOf<RecordT>, CleartextsT>
  /** The empty cleartexts a tombstone seals, which sign it. */
  readonly tombstoneSecrets: CleartextsT
  /** The stamp the seal of `record` is bound to, after the bank's. A change to it refuses the unseal. */
  stampOf(record: unknown): Crypto.CipherCtxRecord
  /** The tags each seal carries. */
  readonly tags: SealTags
  /** The ctx purposes of the wrapped key and of the ciphertext. */
  readonly purposes: SealPurposes
  /** `cleartexts` as the text to cipher. */
  encode(cleartexts: CleartextsT): string
  /** The cleartexts in `text`, refusing as damaged when it will not parse or check. */
  decode(text: string): CleartextsT
  /** The sealed part of `record`, refusing as damaged when its tags are not this sealer's. */
  sealedOf(record: RecordT): Sealed
  /** `next` with `sealed` added, checked as a stored record. */
  recordOf(next: unknown, sealed: Sealed): RecordT
}
// --

// == [A box's records]: BoxRecord, BoxTombstone, BoxCleartexts, BoxPublicProps

/** A live box: its Thing fields, its sidecar and its sealed whisper. */
export type BoxRecord = LiveOf<BoxThing>

/** A deleted box: its Thing fields and a sealed empty whisper, which signs it. */
export type BoxTombstone = TombstoneOf<BoxThing>

/** The cleartexts of a box: its whisper. */
export interface BoxCleartexts {
  whisper: CX.Whisper
}

/** What a box's seal takes in the clear: its sidecar, `am` and `written_at`, each optional. */
export type BoxPublicProps = PublicPropsOf<BoxThing, BoxCleartexts>
// --
