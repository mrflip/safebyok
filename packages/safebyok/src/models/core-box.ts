import { CX, Clock, Crypto, StableJsonify, Throwers, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type BoxSparse, type BoxThing, type Sealed, boxSparse, boxThing, lifeseqOfLifenum, lifenumOfLifeseq } from '../storage/shapes-thing'
import type { BoxCleartexts, BoxRecord, BoxTombstone, SealTags, Sealer } from './sealers'

/** The tags of a box's sealed whisper: the whisper as stable JSON, in its first schema. */
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

/** The checks of what a box's next revision starts from, of a box sealed, and of what it seals. */
const Checks = Validator.Checkers('bad_option', ({ obj }) => ({
  boxPrior:      boxSparse.and(obj({ sidecar: CX.sidecar })),
  liveBoxSparse: boxSparse.refine(({ am }) => am === 'a', Phrases.TombstoneOfLiveOnly),
  boxSparse,
  boxThing,
  boxCleartexts: obj({ whisper: CX.whisper }),
}))

// A sealer is handed to a lease as the class itself, so the class has statics alone.
/** The sealer of a box's whisper, bound to its Thing fields and its tags; its sidecar stays in the clear. Hand the class itself to a lease.
 * It also makes the revisions a lease seals: {@link CoreBox.nextRevisionOf} and {@link CoreBox.tombstoneOf}.
 */
export class CoreBox { // eslint-disable-line @typescript-eslint/no-extraneous-class
  // == [Revisions]: nextRevisionOf, tombstoneOf

  /** The live box next after `prior`, without its sealed whisper.
   * Over a live box it is the next revision; over a tombstone or the shell, the first revision of the next life.
   */
  static nextRevisionOf(prior: BoxSparse & Pick<BoxRecord, 'sidecar'>): Omit<BoxRecord, 'whisper_sealed'> {
    const parsed = Checks.boxPrior.parse(prior)
    const written_at = Clock.nowMillis()
    const revision = { revtok: Crypto.randomId(), revseq: parsed.revseq + 1, written_at }
    if (parsed.am === 'a') { return { ...parsed, ...revision, am: 'a' } }
    return { ...parsed, ...revision, ...nextLifeOf(parsed), am: 'a', born_at: written_at }
  }

  /** The tombstone of the live box `prior`, without its sealed whisper. Refuses a tombstone or the shell. */
  static tombstoneOf(prior: BoxSparse): Omit<BoxTombstone, 'whisper_sealed'> {
    const parsed = Checks.liveBoxSparse.parse(prior)
    return { ...parsed, ...nextLifeOf(parsed), revtok: Crypto.randomId(), revseq: parsed.revseq + 1, am: 'x', written_at: Clock.nowMillis() }
  }
  // --

  // == [Sealing]: tags, purposes, stampsOf, encode, decode, sealedOf, recordOf

  /** The tags of the sealed whisper. */
  static readonly tags: SealTags = BoxTags

  /** The ctx purposes of its wrapped boxKey and of its ciphertext. */
  static readonly purposes = Object.freeze({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' })

  /** The box's Thing fields: all but its sidecar and its sealed whisper. */
  static stampsOf(record: BoxSparse): readonly Crypto.CipherCtxRecord[] { return [Checks.boxSparse.parse(record)] }

  /** The whisper as stable JSON, its keys sorted. */
  static encode(cleartexts: BoxCleartexts): string { return StableJsonify.stableJsonify(Checks.boxCleartexts.parse(cleartexts).whisper) }

  /** The whisper in the JSON `text`; refuses `damaged_whisper`, quoting none of it. */
  static decode(text: string): BoxCleartexts { return { whisper: deserializeWhisper(text) } }

  /** The sealed whisper of `record`; refuses `damaged_whisper` when its tags are not a box's. */
  static sealedOf(record: BoxThing): Sealed {
    const { whisper_sealed } = Checks.boxThing.parse(record)
    if (! Validator.isConsistent(whisper_sealed, BoxTags)) { throw Throwers.undecodedWhisper() }
    return whisper_sealed
  }

  // The parse checks the record, and the spread is handed back: it keeps the type of the revision it was given.
  /** `next` with its sealed whisper, frozen and checked as a box. */
  static recordOf<NextT extends BoxSparse>(next: NextT, whisper_sealed: Sealed): NextT & { readonly whisper_sealed: Sealed } {
    const record = Object.freeze({ ...next, whisper_sealed })
    Checks.boxThing.parse(record)
    return record
  }
  // --
}
Object.freeze(CoreBox satisfies Sealer<BoxSparse, BoxThing, BoxCleartexts>)

// == [Helpers]: nextLifeOf, deserializeWhisper

/** The lifeseq and lifepath of the life after `box`'s */
function nextLifeOf({ lifeseq, lifepath }: Pick<BoxSparse, 'lifeseq' | 'lifepath'>): Pick<BoxSparse, 'lifeseq' | 'lifepath'> {
  const nextLifeseq = lifeseqOfLifenum(lifenumOfLifeseq(lifeseq) + 1)
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
