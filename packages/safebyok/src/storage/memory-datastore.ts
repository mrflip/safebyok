/** The datastore in memory: a Map of rows, and one function per verb, each one atomic step that hands back what it observed. */

import { type Errors, Helpers, Outcome, SX } from 'safebyok-big/internals'
import { readTcNow } from './agerank'
import type { Received } from '../shapes/shapes-answers'
import type { GetManifest, WriteManifest } from '../shapes/shapes-manifest'
import { Labelpath, Lifeseq } from '../shapes/primitives'
import type { AnyAsk, BirthBankAsk, BirthPuts, GetAsk, ListAsk, StatsAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import type { VaultStats } from '../shapes/shapes-vault-stats'
import * as ManifestTags from './manifest-tags'
import type { BankFetched, BankRootsFetched, ThingsFetched } from './thing-classifier'
import { vaultStatsOf } from './vault-stats'

/** A watch: the bank it follows, the function called with each change, and the one called with any trouble. */
export type Watcher = { scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: Errors.VaultError) => void }

// It holds only what our code wrote, or what a test planted through `_cheat_things`, and it never throws. A row that fails
// its kind's checks was not damaged here: it is incompatible, a record our code would not write.
/** The datastore of a vaultDB in this tab's memory, gone when the tab closes. It reads no check and no act table: each function hands back clones of the rows it read, and its tags. */
export class MemoryDatastore {
  // == [Props]: #banks, #watchers

  // Each bank's Things, by labelpath, so that a listing reads one bank's. The modelkind at the base of each labelpath keeps the kinds apart.
  readonly #banks = new Map<string, Map<Labelpath, unknown>>()
  readonly #watchers = new Set<Watcher>()
  // --

  // == [Rows]: _cheat_things, ckeyOf, #thingsOf, #rowAt, #ancestorOf, #rootsOf, #bankObservedOf, #notify

  /** For tests: the Things stored in `scope`'s bank, by labelpath, to read or change in place. */
  _cheat_things(scope: ThingWatchScope): Map<Labelpath, unknown> { return this.#thingsOf(scope) } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The ckey of the bank at `scope`, in `#banks`. */
  static ckeyOf({ userid, banklabel }: ThingWatchScope): string { return Helpers.ckeyOf(userid, banklabel) }

  /** The Things of `scope`'s bank, by labelpath. */
  #thingsOf(scope: ThingWatchScope): Map<Labelpath, unknown> {
    const ckey = MemoryDatastore.ckeyOf(scope)
    const things = this.#banks.get(ckey) ?? new Map<Labelpath, unknown>()
    this.#banks.set(ckey, things)
    return things
  }

  /** A copy of the row at `ask`'s scope, or null for none. */
  #rowAt(ask: GetAsk | WriteAsk): unknown { return structuredClone(this.#thingsOf(ask).get(ask.labelpath) ?? null) }

  /** Where `actual` is null, a copy of the nearest row above `ask`'s scope, or null for none; otherwise null, as it is read nowhere else. */
  #ancestorOf(ask: GetAsk | WriteAsk, actual: unknown): unknown {
    if (actual !== null) { return null }
    const things    = this.#thingsOf(ask)
    const abovepath = Labelpath.ancestorsOf(ask.labelpath).find((labelpath) => things.has(labelpath))
    return (abovepath === undefined) ? null : structuredClone(things.get(abovepath))
  }

  /** Copies of the raw roots of `ask`'s bank, each null for none, how they compare with what `ask` tracks, and when they were read. */
  #rootsOf(ask: AnyAsk): BankRootsFetched {
    const things  = this.#thingsOf(ask)
    const fetched = structuredClone({ bank: things.get('bank') ?? null, gate: things.get(Labelpath.MainGate) ?? null, root: things.get(Labelpath.RootBox) ?? null })
    const rows    = { bank: fetched.bank, [Labelpath.MainGate]: fetched.gate, [Labelpath.RootBox]: fetched.root }
    return { ...fetched, tracked: ManifestTags.trackedOf(ask, rows), read_tc: readTcNow() }
  }

  /** The banktok of `ask`'s bank as it now stands, its `tracked` for what `ask` tracks, and when they were read. */
  #bankObservedOf(ask: AnyAsk): Pick<GetManifest, 'banktok' | 'tracked' | 'read_tc'> {
    const { bank, tracked, read_tc } = this.#rootsOf(ask)
    return { banktok: ManifestTags.banktokOf(bank), tracked, read_tc }
  }

  // Each watcher is called on a later microtask, so nothing it does runs inside the write that notified it.
  // The order and timing of an *adapter*'s notifications relative to reads, writes, or other notifications is unspecified, even for datastores that provide assurance.
  /** Notify each watcher of the bank of the raw `row` written at `scope`, with `banktok`. */
  #notify(scope: ThingWatchScope, row: unknown, banktok: unknown): void {
    for (const { scope: watched, receive, onBadNews } of this.#watchers) {
      if ((watched.userid === scope.userid) && (watched.banklabel === scope.banklabel)) {
        queueMicrotask(() => {
          try { receive({ record: structuredClone(row), banktok }) } catch (err) { onBadNews(Outcome.storageRefusalOf(err)) }
        })
      }
    }
  }
  // --

  // == [Verbs]: getThing, writeThing, listThings, birthRoots, getWorld, stats, watch

  /** The Thing at `ask`'s scope, observed in one step. */
  getThing(ask: GetAsk): GetManifest {
    const actual = this.#rowAt(ask)
    return { tags: ManifestTags.getTagsOf(actual), actual, ancestor: this.#ancestorOf(ask, actual), ...this.#bankObservedOf(ask) }
  }

  /** Write `ask.record` where {@link isWritable} allows, and observe the result, in one step. */
  writeThing(ask: WriteAsk): WriteManifest {
    const ante    = this.#rowAt(ask)
    const written = isWritable(ask, ante)
    if (written) { this.#thingsOf(ask).set(ask.labelpath, structuredClone(ask.record)) }
    const actual   = this.#rowAt(ask)
    const manifest = { tags: ManifestTags.writeTagsOf(ask, ante, written), actual, ancestor: this.#ancestorOf(ask, actual), ...this.#bankObservedOf(ask) }
    if (written) { this.#notify(ask, actual, manifest.banktok) }
    return manifest
  }

  /** Copies of the raw parent at `ask`'s scope (null for none) and of each Thing one label under it, with the bank's, in one step.
   * Scaffolding: until thread 2 (manifest_rest), which hands back a manifest.
   */
  listThings(ask: ListAsk): ThingsFetched & BankFetched {
    const things   = this.#thingsOf(ask)
    const under    = `${ask.labelpath}/`
    const children = [...things]
      .filter(([labelpath]) => labelpath.startsWith(under) && (! labelpath.includes('/', under.length)))
      .map(([labelpath, raw]) => ({ labelpath, raw: structuredClone(raw) }))
    const { bank, tracked, read_tc } = this.#rootsOf(ask)
    return { parent: structuredClone(things.get(ask.labelpath) ?? null), children, bank, tracked, read_tc }
  }

  /** Write a new bank's three roots, each put's record, and read them back, in one step.
   * Scaffolding: until thread 2 (manifest_rest), which gives a birth its own predicate. Until then the vaultDB decides, from {@link getWorld}, whether to call it.
   */
  birthRoots(ask: BirthBankAsk, puts: BirthPuts): BankRootsFetched {
    const things = this.#thingsOf(ask)
    for (const { labelpath, record } of puts) { things.set(labelpath, structuredClone(record)) }
    const written = this.#rootsOf(ask)
    for (const row of [written.bank, written.gate, written.root]) { this.#notify(ask, row, ManifestTags.banktokOf(written.bank)) }
    return written
  }

  /** Copies of the raw roots of `ask`'s bank, in one step. Scaffolding: until thread 2 (manifest_rest), which hands back a manifest. */
  getWorld(ask: AnyAsk): BankRootsFetched { return this.#rootsOf(ask) }

  // Memory sets no limit of its own, so each is the cap.
  /** The storage stats of `ask`'s bank, with the bank's raw row, in one step. Scaffolding: until thread 2 (manifest_rest), which hands back a manifest. */
  stats(ask: StatsAsk): BankFetched & { stats: VaultStats } {
    const filed = [...this.#thingsOf(ask)].map(([labelpath, raw]) => ({ labelpath, raw }))
    const { bank, tracked, read_tc } = this.#rootsOf(ask)
    return { bank, tracked, read_tc, stats: vaultStatsOf(filed) }
  }

  /** Watch `scope`'s bank: `receive` is called with each Thing written in it. Returns a function that stops it. */
  watch(scope: ThingWatchScope, receive: Watcher['receive'], onBadNews: Watcher['onBadNews']): () => void {
    const watcher = { scope, receive, onBadNews }
    this.#watchers.add(watcher)
    return () => { this.#watchers.delete(watcher) }
  }
  // --
}

// == [The write's predicate]: isWritable

/** True when the datastore writes `ask.record` over the raw `ante` row, by its own predicate, a copy of `VaultFunctionsSql`'s write functions:
 * - over no row, `INSERT … WHERE (cited.revtok = <the void revtok>) … ON CONFLICT DO NOTHING`, and the ask's `ifAbsent` is `'add'`
 * - over a row, the `UPDATE`'s `WHERE`: `stored.revtok = cited.revtok`, `stored.am = cited.am`, `stored.lifepath = cited.lifepath`,
 *   `stored.revseq = (proposed.revseq - 1)` and `stored.fmt = proposed.fmt`; its `lifeseq_ok` over `stored.lifeseq`, which past the ask's
 *   checks is the stored lifeseq being the cited lifepath's last; its born_at check, `(stored.am <> proposed.am) OR (stored.born_at = proposed.born_at)`; its
 *   lifetok check, `(stored.am <> 'a') OR (stored.lifetok = proposed.lifetok)`, the bank's alone; and its storage policies, the gate's alone
 * - and the flag the ask's TypeScript checked before the SQL ran: `ifPresent` `'repl'` over a live row, `ifAbsent` `'add'` over a tombstone
 */
function isWritable(ask: WriteAsk, ante: unknown): boolean {
  if (ante === null) { return (ask.cited.revtok === SX.VoidRevisionTok) && (ask.ifAbsent === 'add') }
  const isLive        = (ManifestTags.fieldOf(ante, 'am') === 'a')
  const isCited       = (ManifestTags.fieldOf(ante, 'revtok') === ask.cited.revtok) && (ManifestTags.fieldOf(ante, 'am') === ask.cited.am) && (ManifestTags.fieldOf(ante, 'lifepath') === ask.cited.lifepath) && (ManifestTags.fieldOf(ante, 'revseq') === ask.record.revseq - 1)
  const isOfFormat    = (ManifestTags.fieldOf(ante, 'fmt') === ask.record.fmt)
  const isLifeseqOwn  = (ManifestTags.fieldOf(ante, 'lifeseq') === Lifeseq.ofLifepath(ask.cited.lifepath))
  const isFlagged     = isLive ? (ask.ifPresent === 'repl') : (ask.ifAbsent === 'add')
  const isBornAtSame  = (ManifestTags.fieldOf(ante, 'am') !== ask.record.am) || (ManifestTags.fieldOf(ante, 'born_at') === ask.record.born_at)
  const isLifetokSame = (ask.modelkind !== 'bank') || (! isLive) || (ManifestTags.fieldOf(ante, 'lifetok') === ask.record.lifetok)
  const isPolicyMet   = Object.values(ManifestTags.policiesOf(ask, ante)).every((verdict) => verdict?.ok !== false)
  return isCited && isOfFormat && isLifeseqOwn && isFlagged && isBornAtSame && isLifetokSame && isPolicyMet
}
// --
