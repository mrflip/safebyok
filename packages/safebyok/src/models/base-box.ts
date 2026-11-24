import { isEmptyObject } from 'es-toolkit'
import { exactOptional } from 'zod'
import { CX, Clock, Crypto, StableJsonify, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import type { BoxRecord, Sealed, ThingScope } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'
import type { BoxCleartexts, BoxPublicProps, LiveOf, RevisionOf, SealTags, Sealable, Sealer, TombstoneOf } from '../shapes/shapes-sealers'
import type { BoxStamp } from '../shapes/shapes-stamps'
import { Lifeseq } from '../shapes/primitives'
import * as Throwers from '../refusals/throwers'
import { type Adoptable, Thing } from './thing'

/** The tags of a box's sealed whisper: the whisper as stable JSON, in its first schema. */
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

// A sealer is handed to a lease as the class itself, so what a seal and an unseal call is static.
/** The record-level operations for the Box model.
 *  Acts as the {@link Sealer} for a box's whisper. Pass the class itself to a lease's `seal` or `unseal`.
 */
export abstract class BaseBox extends Thing<BoxRecord, ThingScope, BoxStamp, Adoptable<BoxRecord>> {
  // == [Kind]: modelkind

  /** A box's modelkind: the guards this class inherits answer for boxes alone. */
  static override readonly modelkind = 'box'
  // --

  // == [A seal's inputs]: donorPropsOf, publicPropsOf, secretPropsOf, tombstoneSecrets

  /** The Thing fields and sidecar of `donorProps`, which may be a live box, a tombstone or the shell.
   * Every other field is dropped, including a whisper, sealed or not.
   */
  static donorPropsOf(donorProps: Sealable<LiveOf<BoxRecord>>): Sealable<LiveOf<BoxRecord>> {
    return BoxChecks.sealable.parse(donorProps)
  }

  /** The sidecar, `am` and `written_at` of `publicProps`. Refuses any other field. */
  static publicPropsOf(publicProps: BoxPublicProps): BoxPublicProps {
    return Checks.boxPublicProps.parse(publicProps)
  }

  /** The whisper of `secretProps`. Refuses any other field. */
  static secretPropsOf(secretProps: BoxCleartexts): BoxCleartexts {
    return Checks.boxCleartexts.parse(secretProps)
  }

  /** The empty whisper a tombstone seals. */
  static readonly tombstoneSecrets: BoxCleartexts = Object.freeze({ whisper: Object.freeze({}) })
  // --

  // == [Revisions]: nextRevisionOf, tombstoneOf

  // would this simplify at all with a call to super and then mixing in the body? #earnest-question

  /** The next live revision after `donorProps`, without its sealed whisper.
   * After a tombstone or the shell, it begins the box's next life.
   * Its sidecar is `publicProps.sidecar`, or else the sidecar of a live `donorProps`. One of the two must have one.
   * Its `written_at` is `publicProps.written_at`, or now.
   */
  static nextRevisionOf(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps = {}): RevisionOf<LiveOf<BoxRecord>, BoxCleartexts> {
    const { sidecar: donorSidecar, ...thing } = BoxChecks.sealable.parse(donorProps)
    // A tombstone's `{}` is not inherited: the next life's sidecar is given, as it is after the shell.
    const heirSidecar = (thing.am === 'a') ? donorSidecar : undefined
    const { sidecar = heirSidecar, written_at = Clock.nowMillis() } = Checks.boxPublicProps.parse(publicProps)
    if (sidecar === undefined) { throw Throwers.sidecarMissing() }
    const revision = { revtok: Crypto.randomId(), revseq: thing.revseq + 1, written_at, am: 'a', sidecar } as const
    if (thing.am === 'a') {
      return { ...thing, ...revision }
    }
    return { ...thing, ...nextLifeOf(thing), ...revision, born_at: written_at }
  }

  /** The tombstone of the live box `donorProps`, without its sealed whisper.
   * Its `written_at` is `publicProps.written_at`, or now.
   * Its sidecar is `{}`, whatever the sidecar of `donorProps`. `publicProps` may give `sidecar: {}`, and any other sidecar refuses.
   * `publicProps` may give `am: 'x'`, a tombstone's own, and `am: 'a'` refuses.
   */
  static tombstoneOf(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps = {}): RevisionOf<TombstoneOf<BoxRecord>, BoxCleartexts> {
    const thing                              = Checks.liveBoxSealable.parse(donorProps)
    const { written_at = Clock.nowMillis() } = Checks.tombstonePublicProps.parse(publicProps)
    const revision = { revtok: Crypto.randomId(), revseq: thing.revseq + 1, written_at, am: 'x', sidecar: {} } as const
    return { ...thing, ...nextLifeOf(thing), ...revision }
  }
  // --

  // == [Sealing]: tags, purposes, stampOf, encode, decode, sealedOf, recordOf

  /** The tags of the sealed whisper. */
  static readonly tags: SealTags = BoxTags

  /** The ctx purposes of the whisper's wrapped boxKey and of its ciphertext. */
  static readonly purposes = Object.freeze({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' })

  /** The {@link BoxStamp} of `record`. Refuses the shell, which has no revision to seal. */
  static stampOf(record: RevisionOf<BoxRecord, BoxCleartexts>): BoxStamp { return BoxChecks.stamp.parse(record) }

  /** The whisper of `cleartexts` as stable JSON, with its keys sorted. */
  static encode(cleartexts: BoxCleartexts): string { return StableJsonify.stableJsonify(Checks.boxCleartexts.parse(cleartexts).whisper) }

  /** The whisper in the JSON `text`. A refusal never quotes the text. */
  static decode(text: string): BoxCleartexts { return { whisper: deserializeWhisper(text) } }

  /** The sealed whisper of `record`, which must carry a box's tags. */
  static sealedOf(record: BoxRecord): Sealed {
    const { whisper_sealed } = BoxChecks.record.parse(record)
    if (! Validator.isConsistent(whisper_sealed, BoxTags)) { throw Throwers.undecodedWhisper() }
    return whisper_sealed
  }

  /** `next` with `whisper_sealed` added, checked as a stored box, and frozen. */
  static recordOf(next: RevisionOf<BoxRecord, BoxCleartexts>, whisper_sealed: Sealed): BoxRecord {
    return Object.freeze(BoxChecks.record.parse({ ...next, whisper_sealed }))
  }
  // --
}
Object.freeze(BaseBox satisfies Sealer<BoxRecord, BoxCleartexts>)

// == [Helpers]: nextLifeOf, deserializeWhisper

// why is this on Box not Thing? #earnest-question

/** The lifeseq and lifepath of the life after the given box's life. */
function nextLifeOf({ lifeseq, lifepath }: Pick<BoxRecord, 'lifeseq' | 'lifepath'>): Pick<BoxRecord, 'lifeseq' | 'lifepath'> {
  const nextLifeseq = Lifeseq.ofLifenum(Lifeseq.lifenumOf(lifeseq) + 1)
  return { lifeseq: nextLifeseq, lifepath: `${lifepath.slice(0, lifepath.lastIndexOf('/') + 1)}${nextLifeseq}` }
}

// What JSON.parse throws is replaced, never made the cause: a SyntaxError can quote the text it failed on.
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

// Why are these here and not in the shapes? #earnest-question

/** Checks for the inputs of a box's seal: a live sealable for a tombstone, the public props of a revision and of a tombstone, and the secret props. */
const Checks = Validator.Checkers('bad_record', ({ obj, lit, oneof, epochMillis }) => ({
  liveBoxSealable:      BoxChecks.sealable.refine(({ am }) => am === 'a', Phrases.TombstoneOfLiveOnly),
  // Strict, since a misspelt key in any of these bags would otherwise be dropped without a word.
  boxPublicProps:       obj({ sidecar: exactOptional(CX.sidecar), am: exactOptional(oneof(['a', 'x'])), written_at: exactOptional(epochMillis) }).strict(),
  // A tombstone's sidecar is always `{}`, and its am `'x'`: each may be given, so long as it is that.
  tombstonePublicProps: obj({
    sidecar:    exactOptional(CX.sidecar.refine(isEmptyObject, Phrases.TombstoneSidecarNotEmpty)),
    am:         exactOptional(lit('x')),
    written_at: exactOptional(epochMillis),
  }).strict(),
  boxCleartexts:        obj({ whisper: CX.whisper }).strict(),
}))
// --
