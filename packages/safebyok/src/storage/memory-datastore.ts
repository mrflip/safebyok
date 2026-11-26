/** The datastore in memory: a Map of rows, and one function per verb, each one atomic step that hands back what it observed. */

import { type Errors, Helpers, Outcome, SX } from 'safebyok-big/internals'
import { readTcNow } from './agerank'
import type { BankObserved, BirthManifest, GetManifest, ListManifest, Received, RootRows, StatsManifest, WorldManifest, WriteManifest } from '../shapes/shapes-manifest'
import { Labelpath, Lifeseq } from '../shapes/primitives'
import type { ThingScope } from '../shapes/shapes-thing'
import { type AnyAsk, type BirthBankAsk, type BirthPuts, type GetAsk, type GetWorldAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type WriteAsk, RootLabelpaths } from '../shapes/shapes-asks'
import * as ManifestTags from './manifest-tags'
import { vaultStatsOf } from './vault-stats'

/** A watch: the bank it follows, the function called with each change, and the one called with any trouble. */
export type Watcher = { scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: Errors.VaultError) => void }

// Its rows are only what our code wrote, or what a test planted through `_cheat_things`, and it never throws. A row that fails
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

  /** A copy of the row at `scope`, or null for none. */
  #rowAt(scope: ThingScope): unknown { return structuredClone(this.#thingsOf(scope).get(scope.labelpath) ?? null) }

  /** Where `actual` is null, a copy of the nearest row above `ask`'s scope, or null for none; otherwise null, as it is read nowhere else. */
  #ancestorOf(ask: GetAsk | WriteAsk, actual: unknown): unknown {
    if (actual !== null) { return null }
    const things    = this.#thingsOf(ask)
    const abovepath = Labelpath.ancestorsOf(ask.labelpath).find((labelpath) => things.has(labelpath))
    return (abovepath === undefined) ? null : structuredClone(things.get(abovepath))
  }

  /** Copies of the raw roots of `scope`'s bank, each null for none. */
  #rootsOf(scope: ThingWatchScope): RootRows {
    const { userid, banklabel } = scope
    return {
      bank: this.#rowAt({ userid, banklabel, labelpath: RootLabelpaths.bank }),
      gate: this.#rowAt({ userid, banklabel, labelpath: RootLabelpaths.gate }),
      root: this.#rowAt({ userid, banklabel, labelpath: RootLabelpaths.root }),
    }
  }

  /** The banktok of `ask`'s bank as it now stands, its `tracked` for what `ask` tracks, and when they were read. */
  #bankObservedOf(ask: AnyAsk): BankObserved {
    const { bank, gate, root } = this.#rootsOf(ask)
    return { banktok: ManifestTags.banktokOf(bank), tracked: ManifestTags.trackedOf(ask, { bank, [Labelpath.MainGate]: gate, [Labelpath.RootBox]: root }), read_tc: readTcNow() }
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

  // == [Verbs]: getThing, writeThing, listThings, birthBank, getWorld, stats, watch

  /** The Thing at `ask`'s scope, observed in one step. */
  getThing(ask: GetAsk): GetManifest {
    const actual = this.#rowAt(ask)
    return { tags: ManifestTags.getTagsOf(actual), actual, ancestor: this.#ancestorOf(ask, actual), ...this.#bankObservedOf(ask) }
  }

  /** Write `ask.record` where {@link isWritable} allows, and observe the result, in one step. */
  writeThing(ask: WriteAsk): WriteManifest {
    const ante    = this.#rowAt(ask)
    const isWritten = isWritable(ask, ante)
    if (isWritten) { this.#thingsOf(ask).set(ask.labelpath, structuredClone(ask.record)) }
    const actual   = this.#rowAt(ask)
    const manifest = { tags: ManifestTags.writeTagsOf(ask, ante, isWritten), actual, ancestor: this.#ancestorOf(ask, actual), ...this.#bankObservedOf(ask) }
    if (isWritten) { this.#notify(ask, actual, manifest.banktok) }
    return manifest
  }

  // Like Postgres's, the listing reads the children whatever the parent: the vaultDB reads them only under a live one.
  /** The Thing at `ask`'s scope, and each Thing one label under it, observed in one step. */
  listThings(ask: ListAsk): ListManifest {
    const actual   = this.#rowAt(ask)
    const under    = `${ask.labelpath}/`
    const children = [...this.#thingsOf(ask)]
      .filter(([labelpath]) => labelpath.startsWith(under) && (! labelpath.includes('/', under.length)))
      .map(([labelpath, raw]) => ({ labelpath, raw: structuredClone(raw) }))
    return { tags: ManifestTags.getTagsOf(actual), actual, children, ...this.#bankObservedOf(ask) }
  }

  /** Write a new bank's three roots, each put's record, where {@link isBirthWritable} allows, and observe the result, in one step. */
  birthBank(ask: BirthBankAsk, puts: BirthPuts): BirthManifest {
    const ante    = this.#rootsOf(ask)
    const isWritten = isBirthWritable(ante)
    if (isWritten) { for (const { labelpath, record } of puts) { this.#thingsOf(ask).set(labelpath, structuredClone(record)) } }
    const actual   = this.#rootsOf(ask)
    const manifest = { tags: ManifestTags.birthTagsOf(puts, ante, isWritten), actual, ...this.#bankObservedOf(ask) }
    if (isWritten) { for (const row of [actual.bank, actual.gate, actual.root]) { this.#notify(ask, row, manifest.banktok) } }
    return manifest
  }

  /** The three roots of `ask`'s bank, observed in one step. */
  getWorld(ask: GetWorldAsk): WorldManifest { return { actual: this.#rootsOf(ask), ...this.#bankObservedOf(ask) } }

  // Memory sets no limit of its own, so each is the cap.
  /** The storage stats of `ask`'s bank, observed in one step. */
  stats(ask: StatsAsk): StatsManifest {
    const filed = [...this.#thingsOf(ask)].map(([labelpath, raw]) => ({ labelpath, raw }))
    return { stats: vaultStatsOf(filed), ...this.#bankObservedOf(ask) }
  }

  /** Watch `scope`'s bank: `receive` is called with each Thing written in it. Returns a function that stops it. */
  watch(scope: ThingWatchScope, receive: Watcher['receive'], onBadNews: Watcher['onBadNews']): () => void {
    const watcher = { scope, receive, onBadNews }
    this.#watchers.add(watcher)
    return () => { this.#watchers.delete(watcher) }
  }
  // --
}

// == [The write's predicates]: isWritable, isBirthWritable

/** True when the datastore writes `ask.record` over the raw `ante` row, by its own predicate, a copy of `VaultFunctionsSql`'s write functions:
 * - over no row, `INSERT … WHERE (cited.revtok = <the void revtok>) AND (if_absent = 'add') … ON CONFLICT DO NOTHING`
 * - over a row, the `UPDATE`'s `WHERE`: `ante.revtok = cited.revtok`, `ante.am = cited.am`, `ante.lifepath = cited.lifepath`,
 *   `ante.revseq = (proposed.revseq - 1)` and `ante.fmt = proposed.fmt`; its flag clause, `if_present = 'repl'` over a live row and
 *   `if_absent = 'add'` over a tombstone; its `lifeseq_ok` over `ante.lifeseq`, which past the ask's checks is the ante lifeseq being the
 *   cited lifepath's last; its born_at check, `(ante.am <> proposed.am) OR (ante.born_at = proposed.born_at)`; its lifetok check,
 *   `(ante.am <> 'a') OR (ante.lifetok = proposed.lifetok)`, the bank's alone; and its `policies_met` over `policies_of`, the gate's alone
 */
export function isWritable(ask: WriteAsk, ante: unknown): boolean {
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

/** True when the datastore writes a birth's three roots over the raw `ante` roots, by its own predicate, a copy of `VaultFunctionsSql`'s `birth_roots`: where none of the three is stored. */
export function isBirthWritable(ante: RootRows): boolean { return (ante.bank === null) && (ante.gate === null) && (ante.root === null) }
// --
