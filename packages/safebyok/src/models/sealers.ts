import { CX, Clock, Crypto, StableJsonify, Throwers, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type BoxSparse, type BoxThing, type Sealed, boxSparse, boxThing, lifeseqOf, seqOfLifeseq } from '../storage/shapes-thing'

export type { BoxSparse, Sealed } from '../storage/shapes-thing'

// == [The Sealer]: sealerkindVals, Sealerkind, SealTags, SealPurposes, SealedOf, UnsealedOf, Sealer, SealerKinds

/** The kinds of sealer: the sealer of kind `K` is the export `K` below. */
export const sealerkindVals = ['BoxWhisper', 'BoxTombstone'] as const satisfies readonly (keyof SealerKinds)[]
/** A kind of sealer, one of {@link sealerkindVals}. */
export type Sealerkind = typeof sealerkindVals[number]

/** The tags a sealed part carries in the clear, which its seal binds. */
export type SealTags = Pick<Sealed, 'codectag' | 'schematag'>

/** The ctx purposes a sealed part's two ciphertexts are bound to. */
export interface SealPurposes {
  key:    string
  cipher: string
}

/** `RecordT` with each part `CleartextsT` names sealed, at `<part>_sealed`. A union is mapped member by member. */
export type SealedOf<RecordT, CleartextsT> = RecordT extends unknown
  ? Omit<RecordT, keyof CleartextsT> & { readonly [PartT in keyof CleartextsT & string as `${PartT}_sealed`]: Sealed }
  : never

/** `RecordT` with each `<part>_sealed` that `CleartextsT` names unsealed, at `<part>`. A union is mapped member by member. */
export type UnsealedOf<RecordT, CleartextsT> = RecordT extends unknown
  ? Omit<RecordT, `${keyof CleartextsT & string}_sealed`> & CleartextsT
  : never

/** The interface a lease seals one part of a record through, so the lease itself knows nothing of the record.
 * `PriorT` is the revision sealed after, `NextT` the next revision without its sealed part, `RecordT` the record with it.
 */
export interface Sealer<PriorT, NextT, RecordT, CleartextsT> {
  /** The next revision after `prior`, still without its sealed part. */
  nextRevisionOf(prior: PriorT): NextT
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
  /** `next` with `sealed` added, checked. */
  recordOf(next: NextT, sealed: Sealed): RecordT
}

/** The types of the sealer of each kind. */
export interface SealerKinds {
  BoxWhisper:   Sealer<BoxSparse & Pick<BoxRecord, 'sidecar'>, Omit<BoxRecord, 'whisper_sealed'>, BoxRecord, BoxCleartexts>
  BoxTombstone: Sealer<BoxSparse, Omit<BoxTombstone, 'whisper_sealed'>, BoxTombstone, BoxCleartexts>
}
// --

// == [A box's whisper]: BoxRecord, BoxTombstone, BoxCleartexts, BoxWhisper

/** A live box: its Thing fields, its sidecar and its sealed whisper. */
export type BoxRecord = Extract<BoxThing, { am: 'a' }>

/** A deleted box: its Thing fields and a sealed empty whisper, which signs it. */
export type BoxTombstone = Extract<BoxThing, { am: 'x' }>

/** The cleartexts of a box: its whisper. */
export interface BoxCleartexts {
  whisper: CX.Whisper
}

/** The tags of a box's sealed whisper: the whisper as stable JSON, in its first schema. */
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

/** The checks of what a box's seal starts from, of a box sealed, and of what it seals. */
const Checks = Validator.Checkers('bad_option', ({ obj }) => ({
  boxPrior:      boxSparse.and(obj({ sidecar: CX.sidecar })),
  liveBoxSparse: boxSparse.refine(({ am }) => am === 'a', Phrases.TombstoneOfLiveOnly),
  boxSparse,
  boxThing,
  boxCleartexts: obj({ whisper: CX.whisper }),
}))

/** Seals a box's whisper, bound to its Thing fields and its tags. Its sidecar stays in the clear.
 * Over a live box it makes the next revision. Over a tombstone or the shell, it makes the first revision of the next life.
 */
export const BoxWhisper = Object.freeze({
  nextRevisionOf: boxWhisperOf,

  stampsOf(record: BoxSparse): readonly Crypto.CipherCtxRecord[] { return [Checks.boxSparse.parse(record)] },

  tags: BoxTags,

  purposes: Object.freeze({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' }),

  encode(cleartexts: BoxCleartexts): string { return StableJsonify.stableJsonify(Checks.boxCleartexts.parse(cleartexts).whisper) },

  decode(text: string): BoxCleartexts { return { whisper: deserializeWhisper(text) } },

  sealedOf(record: BoxThing): Sealed {
    const { whisper_sealed } = Checks.boxThing.parse(record)
    if (! Validator.isConsistent(whisper_sealed, BoxTags)) { throw Throwers.undecodedWhisper() }
    return whisper_sealed
  },

  // The parse checks the record, and the spread is handed back: it keeps the type of the revision it was given.
  recordOf<NextT extends BoxSparse>(next: NextT, whisper_sealed: Sealed): NextT & { readonly whisper_sealed: Sealed } {
    const record = Object.freeze({ ...next, whisper_sealed })
    Checks.boxThing.parse(record)
    return record
  },
}) satisfies SealerKinds['BoxWhisper']

/** Seals the empty whisper that signs a box's tombstone. It makes the tombstone of a live box, and refuses a tombstone or the shell. */
export const BoxTombstone: SealerKinds['BoxTombstone'] = Object.freeze({ ...BoxWhisper, nextRevisionOf: boxTombstoneOf })
// --

// == [Helpers]: boxWhisperOf, boxTombstoneOf, nextLifeOf, deserializeWhisper

/** The live box next after `prior`, without its sealed whisper */
function boxWhisperOf(prior: BoxSparse & Pick<BoxRecord, 'sidecar'>): Omit<BoxRecord, 'whisper_sealed'> {
  const parsed = Checks.boxPrior.parse(prior)
  const written_at = Clock.nowMillis()
  const revision = { revtok: Crypto.randomId(), revseq: parsed.revseq + 1, written_at }
  if (parsed.am === 'a') { return { ...parsed, ...revision, am: 'a' } }
  return { ...parsed, ...revision, ...nextLifeOf(parsed), am: 'a', born_at: written_at }
}

/** The tombstone of the live box `prior`, without its sealed whisper */
function boxTombstoneOf(prior: BoxSparse): Omit<BoxTombstone, 'whisper_sealed'> {
  const parsed = Checks.liveBoxSparse.parse(prior)
  return { ...parsed, ...nextLifeOf(parsed), revtok: Crypto.randomId(), revseq: parsed.revseq + 1, am: 'x', written_at: Clock.nowMillis() }
}

/** The lifeseq and lifepath of the life after `box`'s */
function nextLifeOf({ lifeseq, lifepath }: Pick<BoxSparse, 'lifeseq' | 'lifepath'>): Pick<BoxSparse, 'lifeseq' | 'lifepath'> {
  const nextLifeseq = lifeseqOf(seqOfLifeseq(lifeseq) + 1)
  return { lifeseq: nextLifeseq, lifepath: `${lifepath.slice(0, lifepath.lastIndexOf('/') + 1)}${nextLifeseq}` }
}

// What JSON.parse throws is replaced, never kept as a cause: a SyntaxError can quote the text it failed on.
/** The whisper in the JSON `text`, or throw `damaged_whisper` */
function deserializeWhisper(text: string): CX.Whisper {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw Throwers.undecodedWhisper()
  }
  const checked = CX.whisper.safeParse(parsed)
  if (! checked.success) { throw Throwers.undecodedWhisper() }
  return checked.data
}
// --
