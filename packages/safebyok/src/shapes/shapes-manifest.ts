/** The manifest a datastore hands back from one atomic step of each verb, its tags, and the checks `AdapterVaultDB` reads them through. */

import type * as Z from 'zod'
import { CX, type EX, Validator } from 'safebyok-big/internals'
import type { Labelpath, Lifetok } from './primitives'
import type { BankRecord, BoxRecord, GateRecord, ThingRecord } from './shapes-thing'
import type { TombstoneOf } from './shapes-sealers'
import type { BankRoots, Tracked } from './shapes-asks'
import type { DamagedThing } from './shapes-answers'
import { type ReadTc, SeenChecks } from './shapes-vault-event'
import type { VaultStats } from './shapes-vault-stats'
import { PolicyPhrases } from '../phrases'

// == [Tags]: ManifestChecks, PolicyVerdict, PolicyVerdicts, PolicyPhrase, PolicyTag, Refusaltag, GetTags, WriteTags, RootTags, BirthTags, Presence, RevtokCmp, RevseqCmp, SameCmp, AnteWayins, TrackedRows
// Each tag spells the field it compares. A datastore makes them of the row it judged a write against, the ante row.

/** The checks of what a datastore hands back: its tags, a listing's children, a birth's or a world's roots, a watch's {@link Received}, its `tracked` and its `read_tc`. Each refuses `storage_issue`. */
export const ManifestChecks = Validator.Checkers('storage_issue', ({ obj, arr, lit, str, bool, unk, oneof, discrim, custom }) => {
  const presence       = oneof(['void', 'gone', 'live'])
  const revtokCmp      = oneof(['birth', '=next', 'eq', 'neq'])
  const sameCmp        = oneof(['same', 'changed', 'moot'])
  const policyVerdict  = discrim('ok', [obj({ ok: lit(true) }).strict(), obj({ ok: lit(false), message: oneof(PolicyPhrases) }).strict()])
  const policyVerdicts = obj({ replace_passphrase: policyVerdict.optional(), add_passkey: policyVerdict.optional(), revoke_passkey: policyVerdict.optional() }).strict()
  const rootTags       = obj({
    /** The ante root's liveness: none (`void`), a tombstone (`gone`), or live. */
    presence,
    /** The ante root's revtok against its put's: see {@link RevtokCmp}. */
    revtok_cmp: revtokCmp,
  }).strict()
  return {
    policyVerdict,
    policyVerdicts,
    getTags: obj({
      /** The actual row's liveness: none (`void`), a tombstone (`gone`), or live. */
      presence,
    }).strict(),
    writeTags: obj({
      /** The ante row's liveness: none (`void`), a tombstone (`gone`), or live. */
      presence,
      /** The ante row's revtok against the ask's: see {@link RevtokCmp}. */
      revtok_cmp:  revtokCmp,
      /** The ask's cited revseq against the ante row's: see {@link RevseqCmp}. */
      revseq_cmp:  oneof(['birth', 'eq', 'stale', 'ahead']),
      /** True when the ante row's lifepath is the cited one, or where there is no ante row. */
      lifepath_eq: bool,
      /** A live record over a live ante row: whether it leaves the born_at the same. `'moot'` for any other write. */
      born_at_cmp: sameCmp,
      /** A write of the bank over a live bank: whether it leaves the lifetok the same. `'moot'` for any other write. */
      lifetok_cmp: sameCmp,
      /** One verdict for each storage policy the ask names, and no other: met wherever the ante row is no live gate. */
      policies:    policyVerdicts,
      /** True when the datastore's own predicate wrote the proposed record. */
      written:     bool,
    }).strict(),
    rootTags,
    birthTags: obj({ bank: rootTags, gate: rootTags, root: rootTags, written: bool }).strict(),
    children:  arr(obj({ labelpath: str, raw: unk }).strict()),
    roots:     obj({ bank: unk, gate: unk, root: unk }).strict(),
    /** Pick what a watch's {@link Received} carries beside its record and banktok: the `read_tc` its datastore made, where it made one. */
    received:  obj({ read_tc: SeenChecks.readTc.optional() }),
    tracked:   custom<Readonly<Record<string, unknown>>>(CX.isPlainBag),
    read_tc:   SeenChecks.readTc,
  }
})

/** A storage policy's verdict on one write: met, or the {@link PolicyPhrases} message saying why not. */
export type PolicyVerdict = Readonly<Z.infer<typeof ManifestChecks.policyVerdict>>

/** A verdict for each storage policy a write names. */
export type PolicyVerdicts = Readonly<Z.infer<typeof ManifestChecks.policyVerdicts>>
true satisfies Z.core.util.AssertEqual<keyof PolicyVerdicts, EX.StoragePolicy>

/** The message of a storage policy's refusal: one of {@link PolicyPhrases}. */
export type PolicyPhrase = (typeof PolicyPhrases)[PolicyTag]

/** The name of a storage policy's refusal in {@link PolicyPhrases}. */
export type PolicyTag = keyof typeof PolicyPhrases

/** The name, in phrases.ts, of the phrase a `policied` write is refused with: a changed born_at's, a changed lifetok's, or a storage policy's. */
export type Refusaltag = 'BornAtNotStored' | 'LifetokNotStored' | PolicyTag

/** The tag the get table reads: the actual row's `presence`. */
export type GetTags = Readonly<Z.infer<typeof ManifestChecks.getTags>>

/** The comparisons the put and del tables read, as the datastore made them of the ante row against the ask, and whether it wrote. */
export type WriteTags = Readonly<Z.infer<typeof ManifestChecks.writeTags>>

/** The comparisons a birth's put table reads of one root, as the datastore made them of the ante root against its put. */
export type RootTags = Readonly<Z.infer<typeof ManifestChecks.rootTags>>

/** The {@link RootTags} of each of a birth's three roots, by its key in {@link BankRoots}, and whether the datastore wrote. */
export type BirthTags = Readonly<Z.infer<typeof ManifestChecks.birthTags>>

/** A row's liveness: none (`void`), a tombstone (`gone`), or live. */
export type Presence = WriteTags['presence']

/** The ante row's revtok against the ask's.
 * - `'birth'` -- cited the shell, and there is no ante row
 * - `'=next'` -- the ante row has the revtok this ask would write
 * - `'eq'`    -- cited exactly the ante row's revtok
 * - `'neq'`   -- anything else
 */
export type RevtokCmp = WriteTags['revtok_cmp']

/** The ask's cited revseq against the ante row's.
 * - `'birth'` -- cited the shell
 * - `'eq'`    -- cited exactly the ante row's revseq
 * - `'stale'` -- cited an older revision: a write has intervened
 * - `'ahead'` -- cited a newer revision, or a revision where there is no ante row: an impossible situation
 */
export type RevseqCmp = WriteTags['revseq_cmp']

/** Whether a write leaves a field the same, changes it, or is a write the field's rule does not judge (`'moot'`). */
export type SameCmp = WriteTags['born_at_cmp']

/** The wayins of the ante gate as a datastore read them, each field unchecked: what a storage policy judges. */
export type AnteWayins = Readonly<Record<string, unknown>>

/** The raw bank, main gate and root box a datastore read, each null for none, under its key in a `track`: what `tracked` is made of. */
export type TrackedRows = Readonly<{ bank: unknown, [Labelpath.MainGate]: unknown, [Labelpath.RootBox]: unknown }>
// --

// == [Manifests]: BankObserved, GetManifest, WriteManifest, ListManifest, RootRows, BirthManifest, WorldManifest, StatsManifest, CheckedBankObserved, CheckedManifestRows, CheckedRoots, ListedChild, CheckedGetManifest, CheckedWriteManifest, CheckedListManifest, CheckedBirthManifest, CheckedWorldManifest, CheckedStatsManifest, ScribedGetManifest, ScribedWriteManifest, ScribedListManifest, ScribedBirthManifest, Received
// A datastore hands back a manifest; `AdapterVaultDB` then writes onto it, step by step, until it reads as the answer.
// `notes/vault-adapter-contract.md` is the datastore author's account of each.

/** What every manifest carries of the bank, each read in the step, after any write. */
export interface BankObserved {
  /** The bank row's lifetok, the void lifetok where there is no bank row. */
  banktok: unknown
  /** For each of the bank, main gate and root box, by its key in the ask's `track`: `'same'` where it stands at the revseq and lifepath the ask tracks, else the row, null for none. */
  tracked: unknown
  /** When the step read: `readTcNow()` in the step, or the datastore's own UUID version 7. */
  read_tc: unknown
}

/** What a datastore observed in one atomic step of a get, each row exactly as it stands at the step's last read.
 * The vaultDB writes onto the manifest it is handed, so hand it a new one each step.
 */
export interface GetManifest extends BankObserved {
  /** The get's tags, made of `actual`. */
  tags: GetTags
  /** The row at the ask's scope, null for none. */
  actual: unknown
  /** Where `actual` is null, the nearest row above the scope, live or a tombstone, null for none: it gives the shell's lifepath. Read nowhere else. */
  ancestor: unknown
}

/** What a datastore observed in one atomic step of a write, each row exactly as it stands at the step's last read.
 * The vaultDB writes onto the manifest it is handed, so hand it a new one each step.
 */
export interface WriteManifest extends BankObserved {
  /** The write's tags, made of the ante row, the row the write was judged against, and whether the datastore wrote. */
  tags: WriteTags
  /** The row written where the datastore wrote, else the ante row; null for none. */
  actual: unknown
  /** Where `actual` is null, the nearest row above the scope, live or a tombstone, null for none: it gives the shell's lifepath. Read nowhere else. */
  ancestor: unknown
}

/** What a datastore observed in one atomic step of a listing. */
export interface ListManifest extends BankObserved {
  /** The parent's tags, made of `actual`. */
  tags: GetTags
  /** The parent, the row at the ask's scope, null for none. */
  actual: unknown
  /** Each row one label under the ask's labelpath, as `{ labelpath, raw }`: the labelpath it is stored at, and the row. The vaultDB reads them only where the parent is live, so `[]` serves where it is not. */
  children: unknown
}

/** A bank's three roots as a datastore read them, by its key in {@link BankRoots}. */
export interface RootRows {
  /** The bank row, null for none. */
  bank: unknown
  /** The main gate, null for none. */
  gate: unknown
  /** The root box, null for none. */
  root: unknown
}

/** What a datastore observed in one atomic step of a birth. */
export interface BirthManifest extends BankObserved {
  /** The birth's tags: each root's, made of it before any write, and whether the datastore wrote. */
  tags: BirthTags
  /** The three roots after any write. */
  actual: RootRows
}

/** What a datastore observed in one atomic step of a get of the world. */
export interface WorldManifest extends BankObserved {
  /** The bank's three roots. */
  actual: RootRows
}

/** What a datastore observed in one atomic step of an ask for stats. */
export interface StatsManifest extends BankObserved {
  /** The bank's {@link VaultStats}, raw. */
  stats: unknown
}

/** What a manifest carries of the bank, checked. */
export type CheckedBankObserved = { banktok: Lifetok, tracked: Tracked, read_tc: ReadTc }

/** A get's or a write's rows, each checked once. */
export type CheckedManifestRows = CheckedBankObserved & { actual: ThingRecord | null, ancestor: ThingRecord | null }

/** A bank's three roots, each checked by its kind, null for none. */
export type CheckedRoots = { bank: BankRecord | null, gate: GateRecord | null, root: BoxRecord | null }

/** A listed child that passes its kind's checks, with the labelpath the datastore listed it at. */
export type ListedChild = Readonly<{ labelpath: Labelpath, record: ThingRecord }>

/** A get's manifest, its tags and each row checked. */
export type CheckedGetManifest = CheckedManifestRows & { tags: GetTags }

/** A write's manifest, its tags and each row checked. */
export type CheckedWriteManifest = CheckedManifestRows & { tags: WriteTags }

/** A listing's manifest, its tags and each row checked: its children, where the parent is live, those that pass their kind's checks and, as `damaged_rows`, those that fail. */
export type CheckedListManifest = CheckedBankObserved & { tags: GetTags, actual: ThingRecord | null, children: readonly ListedChild[], damaged_rows: readonly DamagedThing[] }

/** A birth's manifest, its tags and each root checked. */
export type CheckedBirthManifest = CheckedBankObserved & { tags: BirthTags, actual: CheckedRoots }

/** A get of the world's manifest, each root checked. */
export type CheckedWorldManifest = CheckedBankObserved & { actual: CheckedRoots }

/** An ask for stats' manifest, its stats checked. */
export type CheckedStatsManifest = CheckedBankObserved & { stats: VaultStats }

/** A get's checked manifest with the act the get table finds from its tags, and whether it answers good. */
export type ScribedGetManifest = CheckedGetManifest & (
  | { ok: true,  act: 'gotlive', actual: ThingRecord }
  | { ok: true,  act: 'gotgone', actual: TombstoneOf<ThingRecord> }
  | { ok: true,  act: 'gotvoid', actual: null }
  | { ok: false, act: 'gone',    actual: TombstoneOf<ThingRecord> }
  | { ok: false, act: 'void',    actual: null }
)

/** A write's checked manifest with the act the put or del table finds from its tags, and whether it answers good.
 * Where a fixed field or a storage policy forbids the write, the act is `policied`, beside the {@link Refusaltag} of the phrase it is refused with.
 */
export type ScribedWriteManifest = CheckedWriteManifest & (
  | { ok: true,  act: EX.PutAct | EX.DelAct, actual: ThingRecord }
  | { ok: false, act: EX.RefusedAct,         actual: ThingRecord | null }
  | { ok: false, act: 'policied',            actual: ThingRecord | null, refusaltag: Refusaltag }
)

/** A listing's checked manifest with the act its parent's tags find, and whether it answers good. */
export type ScribedListManifest = CheckedListManifest & (
  | { ok: true,  act: 'gotlive', actual: ThingRecord }
  | { ok: false, act: 'gone',    actual: TombstoneOf<ThingRecord> }
  | { ok: false, act: 'void',    actual: null }
)

/** A birth's checked manifest with the act its roots' tags find, and whether it answers good: refused, `refusedroot` names the root whose put refused. */
export type ScribedBirthManifest = CheckedBirthManifest & (
  | { ok: true,  act: 'born' | 'passed', actual: BankRoots }
  | { ok: false, act: EX.RefusedAct,     refusedroot: keyof BankRoots }
)

/** A change a concrete adapter's `doWatch` passes to `receive`.
 * Watchers are notified of the Thing alone, with `banktok`, or the void lifetok where it is no lifetok: a bank that changed is a change of its own.
 */
export interface Received {
  /** The changed Thing, raw. */
  record: unknown
  /** The lifetok of the Thing's bank as the datastore last read it. */
  banktok: unknown
  /** The datastore's raw UUID version 7 of when it read the Thing. A datastore that makes none leaves it out, and the notice is read when it arrives. */
  read_tc?: unknown
}
// --
