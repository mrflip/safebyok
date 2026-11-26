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

// == [Tags]: ManifestChecks, PolicyVerdict, PolicyVerdicts, GetTags, WriteTags, RootTags, BirthTags, Presence, RevtokCmp, RevseqCmp, SameCmp
// Each tag spells the field it compares. A datastore makes them of the row it judged a write against, the ante row.

/** The checks of what a datastore hands back: its tags, a listing's children, a birth's or a world's roots, a watch's {@link Received}, its `tracked` and its `read_tc`. Each refuses `storage_issue`. */
export const ManifestChecks = Validator.Checkers('storage_issue', ({ obj, arr, lit, str, bool, unk, oneof, discrim, custom }) => {
  const presence       = oneof(['void', 'gone', 'live'])
  const revtokCmp      = oneof(['birth', '=next', 'eq', 'neq'])
  const sameCmp        = oneof(['same', 'changed', 'moot'])
  const policyVerdict  = discrim('ok', [obj({ ok: lit(true) }).strict(), obj({ ok: lit(false), message: str }).strict()])
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

/** A storage policy's verdict on one write: met, or the message saying why not. */
export type PolicyVerdict = Readonly<Z.infer<typeof ManifestChecks.policyVerdict>>

/** A verdict for each storage policy a write names. */
export type PolicyVerdicts = Readonly<Z.infer<typeof ManifestChecks.policyVerdicts>>
true satisfies Z.core.util.AssertEqual<keyof PolicyVerdicts, EX.StoragePolicy>

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
// --

// == [Manifests]: BankObserved, GetManifest, WriteManifest, ListManifest, RootRows, BirthManifest, WorldManifest, StatsManifest, CheckedBankObserved, CheckedManifestRows, CheckedRoots, ListedChild, CheckedGetManifest, CheckedWriteManifest, CheckedListManifest, CheckedBirthManifest, CheckedWorldManifest, CheckedStatsManifest, ScribedGetManifest, ScribedWriteManifest, ScribedListManifest, ScribedBirthManifest, Received
// A datastore hands back a manifest; `AdapterVaultDB` then writes onto it, step by step, until it reads as the answer.
// `notes/vault-adapter-contract.md` is the datastore author's account of each.

/** What every manifest carries of the bank, each read in the step, after any write:
 * - `banktok`  -- the bank row's lifetok, the void lifetok for none
 * - `tracked`  -- for each of the bank, main gate and root box, `'same'` where it stands at the revseq and lifepath the ask tracks, else the row, null for none
 * - `read_tc`  -- when the step read: `readTcNow()` in the step, or the datastore's own UUID version 7
 */
export type BankObserved = { banktok: unknown, tracked: unknown, read_tc: unknown }

/** What a datastore observed in one atomic step of a get, each row exactly as it stands at the step's last read, beside {@link BankObserved}.
 * - `tags`     -- the get's {@link GetTags}
 * - `actual`   -- the row at the ask's scope, null for none
 * - `ancestor` -- where `actual` is null, the nearest row above the scope, live or a tombstone, null for none: it gives the shell's lifepath. Read nowhere else.
 *
 * The vaultDB writes onto the manifest it is handed, so hand it a new one each step.
 */
export type GetManifest = BankObserved & { tags: GetTags, actual: unknown, ancestor: unknown }

/** What a datastore observed in one atomic step of a write, each row exactly as it stands at the step's last read: as for a {@link GetManifest}, with {@link WriteTags}.
 * `actual` is the row written where the datastore wrote, else the ante row.
 */
export type WriteManifest = BankObserved & { tags: WriteTags, actual: unknown, ancestor: unknown }

/** What a datastore observed in one atomic step of a listing, beside {@link BankObserved}.
 * - `tags`     -- the parent's {@link GetTags}
 * - `actual`   -- the parent, the row at the ask's scope, null for none
 * - `children` -- each row one label under the ask's labelpath, as `{ labelpath, raw }`: the labelpath it is stored at, and the row. The vaultDB reads them only where the parent is live, so `[]` serves where it is not.
 */
export type ListManifest = BankObserved & { tags: GetTags, actual: unknown, children: unknown }

/** A bank's three roots as a datastore read them, each null for none, by its key in {@link BankRoots}. */
export type RootRows = { bank: unknown, gate: unknown, root: unknown }

/** What a datastore observed in one atomic step of a birth, beside {@link BankObserved}.
 * - `tags`   -- the birth's {@link BirthTags}, each root's made of it before any write
 * - `actual` -- the three roots after any write ({@link RootRows})
 */
export type BirthManifest = BankObserved & { tags: BirthTags, actual: RootRows }

/** What a datastore observed in one atomic step of a get of the world: its three roots ({@link RootRows}), beside {@link BankObserved}. */
export type WorldManifest = BankObserved & { actual: RootRows }

/** What a datastore observed in one atomic step of an ask for stats: the bank's raw {@link VaultStats}, beside {@link BankObserved}. */
export type StatsManifest = BankObserved & { stats: unknown }

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

/** A write's checked manifest with the act the put or del table finds from its tags, or `policied` where a fixed field or a storage policy forbids the write, and whether it answers good. */
export type ScribedWriteManifest = CheckedWriteManifest & (
  | { ok: true,  act: EX.PutAct | EX.DelAct,     actual: ThingRecord }
  | { ok: false, act: EX.RefusedAct | 'policied', actual: ThingRecord | null }
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

/** A change a concrete adapter's `doWatch` passes to `receive`: the changed Thing, raw, with the `banktok` of its bank as the datastore last read it.
 * Watchers are notified of the Thing alone, with that banktok, or the void lifetok where it is no lifetok: a bank that changed is a change of its own.
 * `read_tc` is the datastore's raw UUID version 7 of when it read the Thing. A datastore that makes none leaves it out, and the notice is read when it arrives.
 */
export type Received = { record: unknown, banktok: unknown, read_tc?: unknown }
// --
