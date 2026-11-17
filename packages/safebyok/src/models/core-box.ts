import { exactOptional } from 'zod'
import { CX, Clock, Crypto, Errors, StableJsonify, Throwers, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type BoxThing, type Sealed, boxSealable, boxThing, lifeseqOfLifenum, lifenumOfLifeseq } from '../storage/shapes-thing'
import type { BoxCleartexts, BoxPublicProps, BoxRecord, BoxTombstone, RevisionOf, SealTags, Sealable, Sealer } from './sealers'
import { type BoxStamp, boxStamp } from './stamps'

/** The tags of a box's sealed whisper: the whisper as stable JSON, in its first schema. */
const BoxTags: SealTags = Object.freeze({ codectag: 'json_v1', schematag: 'whisper_v1' })

/** The checks of a box's sealable, live or any, of its public and secret props, and of its stored record. */
const Checks = Validator.Checkers('bad_option', ({ obj, oneof, epochMillis }) => ({
  boxSealable,
  liveBoxSealable: boxSealable.refine(({ am }) => am === 'a', Phrases.TombstoneOfLiveOnly),
  boxPublicProps:  obj({ sidecar: exactOptional(CX.sidecar), am: exactOptional(oneof(['a', 'x'])), written_at: exactOptional(epochMillis) }),
  boxThing,
  boxCleartexts:   obj({ whisper: CX.whisper }),
}))

// A sealer is handed to a lease as the class itself, so the class has statics alone.
/** The {@link Sealer} for a box's whisper. Pass the class itself to a lease's `seal` or `unseal`.
 * The whisper unseals only within the revision it was sealed in. The sidecar is unencrypted and outside the seal: storage can change it, and the box still unseals.
 */
export class CoreBox { // eslint-disable-line @typescript-eslint/no-extraneous-class
  // == [What a seal takes]: donorPropsOf, publicPropsOf, secretPropsOf, tombstoneSecrets

  /** The Thing fields and sidecar of `donorProps`, which may be a live box, a tombstone or the shell.
   * Every other field is dropped, including a whisper, sealed or not.
   */
  static donorPropsOf(donorProps: Sealable<BoxRecord>): Sealable<BoxRecord> { return Checks.boxSealable.parse(donorProps) }

  /** The sidecar, `am` and `written_at` of `publicProps`. Any other field is dropped. */
  static publicPropsOf(publicProps: BoxPublicProps): BoxPublicProps { return Checks.boxPublicProps.parse(publicProps) }

  /** The whisper of `secretProps`. Any other field is dropped. */
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
    const { sidecar: donorSidecar, ...thing } = Checks.boxSealable.parse(donorProps)
    const { sidecar = donorSidecar, written_at = Clock.nowMillis() } = Checks.boxPublicProps.parse(publicProps)
    if (sidecar === undefined) { throw new Errors.VaultError('bad_option', Phrases.SidecarMissing) }
    const revision = { revtok: Crypto.randomId(), revseq: thing.revseq + 1, written_at, am: 'a', sidecar } as const
    if (thing.am === 'a') { return { ...thing, ...revision } }
    return { ...thing, ...nextLifeOf(thing), ...revision, born_at: written_at }
  }

  /** The tombstone of the live box `donorProps`, without its sealed whisper.
   * Its `written_at` is `publicProps.written_at`, or now.
   * A tombstone has no sidecar: the sidecar of `donorProps` is dropped, and a sidecar given in `publicProps` refuses.
   */
  static tombstoneOf(donorProps: Sealable<BoxRecord>, publicProps: BoxPublicProps = {}): RevisionOf<BoxTombstone, BoxCleartexts> {
    const { sidecar: _sidecar, ...thing } = Checks.liveBoxSealable.parse(donorProps)
    const { sidecar, written_at = Clock.nowMillis() } = Checks.boxPublicProps.parse(publicProps)
    if (sidecar !== undefined) { throw new Errors.VaultError('bad_option', Phrases.TombstoneSidecarGiven) }
    return { ...thing, ...nextLifeOf(thing), revtok: Crypto.randomId(), revseq: thing.revseq + 1, am: 'x', written_at }
  }
  // --

  // == [Sealing]: tags, purposes, stampOf, encode, decode, sealedOf, recordOf

  /** The tags of the sealed whisper. */
  static readonly tags: SealTags = BoxTags

  /** The ctx purposes of the whisper's wrapped boxKey and of its ciphertext. */
  static readonly purposes = Object.freeze({ key: 'whisper_sealed.key_wrapped', cipher: 'whisper_sealed.ciphered' })

  /** The {@link BoxStamp} of `record`. Refuses the shell, which has no revision to seal. */
  static stampOf(record: RevisionOf<BoxThing, BoxCleartexts>): BoxStamp { return boxStamp.parse(record) }

  /** The whisper of `cleartexts` as stable JSON, with its keys sorted. */
  static encode(cleartexts: BoxCleartexts): string { return StableJsonify.stableJsonify(Checks.boxCleartexts.parse(cleartexts).whisper) }

  /** The whisper in the JSON `text`. A refusal never quotes the text. */
  static decode(text: string): BoxCleartexts { return { whisper: deserializeWhisper(text) } }

  /** The sealed whisper of `record`, which must carry a box's tags. */
  static sealedOf(record: BoxThing): Sealed {
    const { whisper_sealed } = Checks.boxThing.parse(record)
    if (! Validator.isConsistent(whisper_sealed, BoxTags)) { throw Throwers.undecodedWhisper() }
    return whisper_sealed
  }

  /** `next` with `whisper_sealed` added, checked as a stored box, and frozen. */
  static recordOf(next: RevisionOf<BoxThing, BoxCleartexts>, whisper_sealed: Sealed): BoxThing {
    return Object.freeze(Checks.boxThing.parse({ ...next, whisper_sealed }))
  }
  // --
}
Object.freeze(CoreBox satisfies Sealer<BoxThing, BoxCleartexts>)

// == [Helpers]: nextLifeOf, deserializeWhisper

/** The lifeseq and lifepath of the life after the given box's */
function nextLifeOf({ lifeseq, lifepath }: Pick<BoxThing, 'lifeseq' | 'lifepath'>): Pick<BoxThing, 'lifeseq' | 'lifepath'> {
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
