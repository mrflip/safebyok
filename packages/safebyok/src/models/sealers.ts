import type { CX, Crypto } from 'safebyok-big/internals'
import type { BoxThing, Sealed } from '../storage/shapes-thing'

export type { BoxSparse, Sealed } from '../storage/shapes-thing'

// == [The Sealer]: SealTags, SealPurposes, SealedPartsOf, SealedOf, UnsealedOf, Sealer

/** The tags a sealed part carries in the clear, which its seal binds. */
export type SealTags = Pick<Sealed, 'codectag' | 'schematag'>

/** The ctx purposes a sealed part's two ciphertexts are bound to. */
export interface SealPurposes {
  key:    string
  cipher: string
}

/** Each part `CleartextsT` names, sealed, at `<part>_sealed`. */
export type SealedPartsOf<CleartextsT> = { readonly [PartT in keyof CleartextsT & string as `${PartT}_sealed`]: Sealed }

/** `RecordT` with each part `CleartextsT` names sealed, at `<part>_sealed`. A union is mapped member by member. */
export type SealedOf<RecordT, CleartextsT> = RecordT extends unknown ? Omit<RecordT, keyof CleartextsT> & SealedPartsOf<CleartextsT> : never

/** `RecordT` with each `<part>_sealed` that `CleartextsT` names unsealed, at `<part>`. A union is mapped member by member. */
export type UnsealedOf<RecordT, CleartextsT> = RecordT extends unknown
  ? Omit<RecordT, `${keyof CleartextsT & string}_sealed`> & CleartextsT
  : never

/** The interface a lease seals one part of a record through, so the lease itself knows nothing of the record.
 * `NextT` is a revision without its sealed part, `RecordT` the record with it.
 */
export interface Sealer<NextT, RecordT, CleartextsT> {
  /** The stamps the seal of `record` is bound to, after the bank's stamp. A change to any of them refuses the unseal. */
  stampsOf(record: NextT | RecordT): readonly Crypto.CipherCtxRecord[]
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
  /** `next` with `sealed` added, checked. It keeps the type of the revision it was given. */
  recordOf<SubT extends NextT>(next: SubT, sealed: Sealed): SubT & SealedPartsOf<CleartextsT>
}
// --

// == [A box's records]: BoxRecord, BoxTombstone, BoxCleartexts

/** A live box: its Thing fields, its sidecar and its sealed whisper. */
export type BoxRecord = Extract<BoxThing, { am: 'a' }>

/** A deleted box: its Thing fields and a sealed empty whisper, which signs it. */
export type BoxTombstone = Extract<BoxThing, { am: 'x' }>

/** The cleartexts of a box: its whisper. */
export interface BoxCleartexts {
  whisper: CX.Whisper
}
// --
