import { exactOptional } from 'zod'
import { CX, Clock, Crypto, StableJsonify, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type BoxThing, type Sealed, BoxChecks } from '../shapes/shapes-thing'
import type { BoxCleartexts, BoxPublicProps, BoxRecord, BoxTombstone, RevisionOf, SealTags, Sealable, Sealer } from '../shapes/shapes-sealers'
import { type BoxStamp, StampChecks } from '../shapes/shapes-stamps'
import { Lifeseq } from '../shapes/primitives'
import * as Throwers from '../refusals/throwers'

/** The tags of a box's sealed whisper: the whisper as stable JSON, in its first schema. */
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

// A sealer is handed to a lease as the class itself, so the class has statics alone.
/** The record-level operations for the Box model.
 *  Acts as the {@link Sealer} for a box's whisper. Pass the class itself to a lease's `seal` or `unseal`.
 */
export class CoreBox { // eslint-disable-line @typescript-eslint/no-extraneous-class
  // == [What a seal takes]: donorPropsOf, publicPropsOf, secretPropsOf, tombstoneSecrets

  /** The Thing fields and sidecar of `donorProps`, which may be a live box, a tombstone or the shell.
   * Every other field is dropped, including a whisper, sealed or not.
   */
  static donorPropsOf(donorProps: Sealable<BoxRecord>): Sealable<BoxRecord> { return BoxChecks.sealable.parse(donorProps) }

  /** The sidecar, `am` and `written_at` of `publicProps`. Refuses any other field. */
  static publicPropsOf(publicProps: BoxPublicProps): BoxPublicProps { return Checks.boxPublicProps.parse(publicProps) }

  /** The whisper of `secretProps`. Refuses any other field. */
  static secretPropsOf(secretProps: BoxCleartexts): BoxCleartexts { return Checks.boxCleartexts.parse(secretProps) }

  /** The empty whisper a tombstone seals. */
  static readonly tombstoneSecrets: BoxCleartexts = Object.freeze({ whisper: Object.freeze({}) })
  // --

  // == [Revisions]: nextRevisionOf, tombstoneOf

  /** The next live revision after `donorProps`, without its sealed whisper.
   * After a tombstone or the shell, it begins the box's next life.
   * Its sidecar is `publicProps.sidecar`, or else the sidecar of `donorProps`. One of the two must have one.
   * Its `written_at` is `publicProps.written_at`, or now.
   */
  static nextRevisionOf(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps = {}): RevisionOf<BoxRecord, BoxCleartexts> {
    const { sidecar: donorSidecar, ...thing                        } = BoxChecks.sealable.parse(donorProps)
    const { sidecar = donorSidecar, written_at = Clock.nowMillis() } = Checks.boxPublicProps.parse(publicProps)
    if (sidecar === undefined) { throw Throwers.sidecarMissing() }
    const revision = { revtok: Crypto.randomId(), revseq: thing.revseq + 1, written_at, am: 'a', sidecar } as const
    if (thing.am === 'a') {
      return { ...thing, ...revision }
    }
    return { ...thing, ...nextLifeOf(thing), ...revision, born_at: written_at }
  }

  /** The tombstone of the live box `donorProps`, without its sealed whisper.
   * Its `written_at` is `publicProps.written_at`, or now.
   * A tombstone has no sidecar: the sidecar of `donorProps` is dropped, and a sidecar given in `publicProps` refuses.
   */
  static tombstoneOf(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps = {}): RevisionOf<BoxTombstone, BoxCleartexts> {
    const { sidecar: _sidecar, ...thing             } = Checks.liveBoxSealable.parse(donorProps)
    const { sidecar, written_at = Clock.nowMillis() } = Checks.boxPublicProps.parse(publicProps)
    if (sidecar !== undefined) { throw Throwers.tombstoneSidecarGiven() }
    const revision = { revtok: Crypto.randomId(), revseq: thing.revseq + 1, written_at, am: 'x' } as const
    return { ...thing, ...nextLifeOf(thing), ...revision }
  }
  // --

  // == [Sealing]: tags, purposes, stampOf, encode, decode, sealedOf, recordOf

  /** The tags of the sealed whisper. */
  static readonly tags: SealTags = BoxTags

  /** The ctx purposes of the whisper's wrapped boxKey and of its ciphertext. */
  static readonly purposes = Object.freeze({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' })

  /** The {@link BoxStamp} of `record`. Refuses the shell, which has no revision to seal. */
  static stampOf(record: RevisionOf<BoxThing, BoxCleartexts>): BoxStamp { return StampChecks.boxStamp.parse(record) }

  /** The whisper of `cleartexts` as stable JSON, with its keys sorted. */
  static encode(cleartexts: BoxCleartexts): string { return StableJsonify.stableJsonify(Checks.boxCleartexts.parse(cleartexts).whisper) }

  /** The whisper in the JSON `text`. A refusal never quotes the text. */
  static decode(text: string): BoxCleartexts { return { whisper: deserializeWhisper(text) } }

  /** The sealed whisper of `record`, which must carry a box's tags. */
  static sealedOf(record: BoxThing): Sealed {
    const { whisper_sealed } = BoxChecks.record.parse(record)
    if (! Validator.isConsistent(whisper_sealed, BoxTags)) { throw Throwers.undecodedWhisper() }
    return whisper_sealed
  }

  /** `next` with `whisper_sealed` added, checked as a stored box, and frozen. */
  static recordOf(next: RevisionOf<BoxThing, BoxCleartexts>, whisper_sealed: Sealed): BoxThing {
    return Object.freeze(BoxChecks.record.parse({ ...next, whisper_sealed }))
  }
  // --
}
Object.freeze(CoreBox satisfies Sealer<BoxThing, BoxCleartexts>)

// == [Helpers]: nextLifeOf, deserializeWhisper

/** The lifeseq and lifepath of the life after the given box's */
function nextLifeOf({ lifeseq, lifepath }: Pick<BoxThing, 'lifeseq' | 'lifepath'>): Pick<BoxThing, 'lifeseq' | 'lifepath'> {
  const nextLifeseq = Lifeseq.ofLifenum(Lifeseq.lifenumOf(lifeseq) + 1)
  return { lifeseq: nextLifeseq, lifepath: `${lifepath.slice(0, lifepath.lastIndexOf('/') + 1)}${nextLifeseq}` }
}

// What JSON.parse throws is replaced, never kept as a cause: a SyntaxError can quote the text it failed on.
/** The whisper in the JSON `text`, or throw `damaged_whisper` */
function deserializeWhisper(text: string): CX.Whisper {
  let jsonVal: unknown
  try {
    jsonVal = JSON.parse(text)
  } catch {
    throw Throwers.undecodedWhisper()
  }
  const whisperReport = CX.whisper.safeParse(jsonVal)
  if (! whisperReport.success) { throw Throwers.undecodedWhisper() }
  return whisperReport.data
}
// --

// == [Checks]: Checks

/** Checks for what a box's seal takes: a live sealable for a tombstone, and the public and secret props. */
const Checks = Validator.Checkers('bad_record', ({ obj, oneof, epochMillis }) => ({
  liveBoxSealable: BoxChecks.sealable.refine(({ am }) => am === 'a', Phrases.TombstoneOfLiveOnly),
  // Strict, since a misspelt key in either bag would otherwise be dropped without a word.
  boxPublicProps:  obj({ sidecar: exactOptional(CX.sidecar), am: exactOptional(oneof(['a', 'x'])), written_at: exactOptional(epochMillis) }).strict(),
  boxCleartexts:   obj({ whisper: CX.whisper }).strict(),
}))
// --
