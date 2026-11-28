/** The datastore in memory: a table of rows per kind of Thing, and one function per verb, each one atomic step that hands back what it observed. */

import { type Errors, Helpers, Outcome, SX } from 'safebyok-big/internals'
import { readTcNow } from './agerank'
import type { BankObserved, BirthManifest, GetManifest, ListManifest, Received, RootRows, StatsManifest, GetBankManifest, WriteManifest } from '../shapes/shapes-manifest'
import { Labelpath, Lifeseq } from '../shapes/primitives'
import type { TableScope, ThingScope, Thingkind } from '../shapes/shapes-thing'
import type { FiledRaw } from '../shapes/shapes-vault-stats'
import { type AnyAsk, type BirthBankAsk, type BirthPuts, type GetAsk, type GetBankAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type WriteAsk, RootModelkinds, rootScopesOf } from '../shapes/shapes-asks'
import * as ManifestTags from './manifest-tags'
import { vaultStatsOf } from './vault-stats'

/** A watch: the bank it follows, the function called with each change, and the one called with any trouble. */
export type Watcher = { scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: Errors.VaultError) => void }

/** A bank's Things of one kind, by labelpath: what a table has of one bank. */
export type BankRows = Map<Labelpath, unknown>

// Its rows are only what our code wrote, or what a test planted through `_cheat_things`, and it never throws. A row that fails
// its kind's checks was not damaged here: it is incompatible, a record our code would not write.
/** The datastore of a vaultDB in this tab's memory, gone when the tab closes. It reads no check and no act table: each function hands back clones of the rows it read, and its tags. */
export class MemoryDatastore {
  // == [Props]: #tables, #watchers

  // A table per kind of Thing, as Postgres's `safebyok_gate_things` and `safebyok_box_things` and Convex's `gate_things` and `box_things`.
  // Each has every bank's Things of its kind, by bank, then by labelpath, so that a list reads one bank's. A verb picks
  // its table by the kind its ask names.
  readonly #tables: Readonly<Record<Thingkind, Map<string, BankRows>>> = { gate: new Map(), box: new Map() }
  readonly #watchers = new Set<Watcher>()
  // --

  // == [Rows]: _cheat_things, ckeyOf, #rowsOf, #rowAt, #ancestorOf, #rootsOf, #bankObservedOf, #notify

  /** For tests: the Things stored in `scope`'s bank, in each kind's table, to read or change in place. */
  _cheat_things(scope: ThingWatchScope): Readonly<Record<Thingkind, BankRows>> { // eslint-disable-line unicorn/prefer-private-class-fields
    return { gate: this.#rowsOf({ ...scope, modelkind: 'gate' }), box: this.#rowsOf({ ...scope, modelkind: 'box' }) }
  }

  /** The ckey of the bank at `scope`, in each table. */
  static ckeyOf({ userid, banklabel }: ThingWatchScope): string { return Helpers.ckeyOf(userid, banklabel) }

  /** The Things of `scope`'s bank in the table of its modelkind, by labelpath. */
  #rowsOf({ modelkind, ...scope }: TableScope): BankRows {
    const ckey = MemoryDatastore.ckeyOf(scope)
    const bankRecords = this.#tables[modelkind].get(ckey) ?? new Map<Labelpath, unknown>()
    this.#tables[modelkind].set(ckey, bankRecords)
    return bankRecords
  }

  /** A copy of the row at `scope` in the table of its modelkind, or null for none. */
  #rowAt(scope: ThingScope): unknown { return structuredClone(this.#rowsOf(scope).get(scope.labelpath) ?? null) }

  // A Thing's ancestors are of its own kind (a box's are boxes, and a gate has none), so they are in its table.
  /** Where `actual` is null, a copy of the nearest row above `ask`'s scope, or null for none; otherwise null, as it is read nowhere else. */
  #ancestorOf(ask: GetAsk | WriteAsk, actual: unknown): unknown {
    if (actual !== null) { return null }
    const bankRecords = this.#rowsOf(ask)
    const abovepath   = Labelpath.ancestorsOf(ask.labelpath).find((labelpath) => bankRecords.has(labelpath))
    return (abovepath === undefined) ? null : structuredClone(bankRecords.get(abovepath))
  }

  /** Copies of the raw roots of `scope`'s bank, each null for none. */
  #rootsOf(scope: ThingWatchScope): RootRows {
    const scopes = rootScopesOf(scope)
    return { gate: this.#rowAt(scopes.gate), root: this.#rowAt(scopes.root) }
  }

  /** The banktok of `ask`'s bank as it now stands, its `tracked` for what `ask` tracks, and when they were read. */
  #bankObservedOf(ask: AnyAsk): BankObserved {
    const { gate, root } = this.#rootsOf(ask)
    return { banktok: ManifestTags.banktokOf(gate), tracked: ManifestTags.trackedOf(ask, { gate, root }), read_tc: readTcNow() }
  }

  // Each watcher is called on a later microtask, so nothing it does runs inside the write that notified it.
  // The order and timing of an *adapter*'s notifications relative to reads, writes, or other notifications is unspecified, even for datastores that provide assurance.
  /** Notify each watcher of the bank of the raw `actual` written at `scope` in the table of its modelkind, with `banktok`. */
  #notify(scope: TableScope, actual: unknown, banktok: unknown): void {
    for (const { scope: watched, receive, onBadNews } of this.#watchers) {
      if ((watched.userid === scope.userid) && (watched.banklabel === scope.banklabel)) {
        queueMicrotask(() => {
          try { receive({ record: structuredClone(actual), modelkind: scope.modelkind, banktok }) } catch (err) { onBadNews(Outcome.storageRefusalOf(err)) }
        })
      }
    }
  }
  // --

  // == [Verbs]: getThing, writeThing, listThings, birthBank, getBank, stats, watch

  /** The Thing at `ask`'s scope, observed in one step. */
  getThing(ask: GetAsk): GetManifest {
    const actual = this.#rowAt(ask)
    return { tags: ManifestTags.getTagsOf(actual), actual, ancestor: this.#ancestorOf(ask, actual), ...this.#bankObservedOf(ask) }
  }

  /** Write `ask.record` where {@link isWritable} allows, and observe the result, in one step. */
  writeThing(ask: WriteAsk): WriteManifest {
    const prior     = this.#rowAt(ask)
    const isWritten = isWritable(ask, prior)
    if (isWritten) { this.#rowsOf(ask).set(ask.labelpath, structuredClone(ask.record)) }
    const actual   = this.#rowAt(ask)
    const manifest = { tags: ManifestTags.writeTagsOf(ask, prior, isWritten), actual, ancestor: this.#ancestorOf(ask, actual), ...this.#bankObservedOf(ask) }
    if (isWritten) { this.#notify(ask, actual, manifest.banktok) }
    return manifest
  }

  // Like Postgres's, a list reads the children whatever the parent: the vaultDB reads them only under a live one.
  /** The Thing at `ask`'s scope, and each Thing one label under it, observed in one step. */
  listThings(ask: ListAsk): ListManifest {
    const actual   = this.#rowAt(ask)
    const under    = `${ask.labelpath}/`
    const children = [...this.#rowsOf(ask)]
      .filter(([labelpath]) => labelpath.startsWith(under) && (! labelpath.includes('/', under.length)))
      .map(([labelpath, raw]) => ({ labelpath, raw: structuredClone(raw) }))
    return { tags: ManifestTags.getTagsOf(actual), actual, children, ...this.#bankObservedOf(ask) }
  }

  /** Write a new bank's two roots, each put's record, where {@link isBirthWritable} allows, and observe the result, in one step. */
  birthBank(ask: BirthBankAsk, puts: BirthPuts): BirthManifest {
    const prior     = this.#rootsOf(ask)
    const isWritten = isBirthWritable(puts, prior)
    if (isWritten) { for (const put of puts) { this.#rowsOf(put).set(put.labelpath, structuredClone(put.record)) } }
    const actual   = this.#rootsOf(ask)
    const manifest = { tags: ManifestTags.birthTagsOf(puts, prior, isWritten), actual, ...this.#bankObservedOf(ask) }
    if (isWritten) { for (const rootckey of ['gate', 'root'] as const) { this.#notify({ ...ask, modelkind: RootModelkinds[rootckey] }, actual[rootckey], manifest.banktok) } }
    return manifest
  }

  /** The two roots of `ask`'s bank, observed in one step. */
  getBank(ask: GetBankAsk): GetBankManifest { return { actual: this.#rootsOf(ask), ...this.#bankObservedOf(ask) } }

  // Memory sets no limit of its own, so each is the cap.
  /** The storage stats of `ask`'s bank, observed in one step. */
  stats(ask: StatsAsk): StatsManifest {
    const filedOf = (modelkind: Thingkind): FiledRaw[] => [...this.#rowsOf({ ...ask, modelkind })].map(([labelpath, raw]) => ({ labelpath, raw }))
    return { stats: vaultStatsOf({ gate: filedOf('gate'), box: filedOf('box') }), ...this.#bankObservedOf(ask) }
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

// A copy of VaultFunctionsSql's write functions, clause for clause:
// - over no row, `INSERT … WHERE (cited.revtok = <the void revtok>) AND (if_absent = 'add') … ON CONFLICT DO NOTHING`
// - over a row, the `UPDATE`'s `WHERE`: `prior.revtok = cited.revtok`, `prior.am = cited.am`, `prior.lifepath = cited.lifepath`,
//   `prior.revseq = (proposed.revseq - 1)` and `prior.fmt = proposed.fmt`; its flag clause, `if_present = 'repl'` over a live row and
//   `if_absent = 'add'` over a tombstone; its `lifeseq_ok` over `prior.lifeseq`, which past the ask's checks is the prior lifeseq being the
//   cited lifepath's last; its born_at check, `(prior.am <> proposed.am) OR (prior.born_at = proposed.born_at)`; its banktok check,
//   `(prior.am <> 'a') OR (prior.banktok = proposed.banktok)`, the gate's alone; and its `policies_met` over `policies_of`, the gate's alone
/** True when a datastore writes `ask.record` over the raw `prior` row, the row it read in the same step, null for none. */
export function isWritable(ask: WriteAsk, prior: unknown): boolean {
  if (prior === null) { return (ask.cited.revtok === SX.VoidRevisionTok) && (ask.ifAbsent === 'add') }
  const isLive        = (ManifestTags.fieldOf(prior, 'am') === 'a')
  const isCited       = (ManifestTags.fieldOf(prior, 'revtok') === ask.cited.revtok) && (ManifestTags.fieldOf(prior, 'am') === ask.cited.am) && (ManifestTags.fieldOf(prior, 'lifepath') === ask.cited.lifepath) && (ManifestTags.fieldOf(prior, 'revseq') === ask.record.revseq - 1)
  const isOfFormat    = (ManifestTags.fieldOf(prior, 'fmt') === ask.record.fmt)
  const isLifeseqOwn  = (ManifestTags.fieldOf(prior, 'lifeseq') === Lifeseq.ofLifepath(ask.cited.lifepath))
  const isFlagged     = isLive ? (ask.ifPresent === 'repl') : (ask.ifAbsent === 'add')
  const isBornAtSame  = (ManifestTags.fieldOf(prior, 'am') !== ask.record.am) || (ManifestTags.fieldOf(prior, 'born_at') === ask.record.born_at)
  const isBanktokSame = (ask.modelkind !== 'gate') || (! isLive) || (ManifestTags.fieldOf(prior, 'banktok') === ask.record.banktok)
  const isPolicyMet   = Object.values(ManifestTags.policiesOf(ask, prior)).every((verdict) => verdict?.ok !== false)
  return isCited && isOfFormat && isLifeseqOwn && isFlagged && isBornAtSame && isBanktokSame && isPolicyMet
}

// A copy of VaultFunctionsSql's birth_roots, which writes both roots in one statement, each where its write function would.
/** True when a datastore writes a birth's two `puts` over the raw `prior` roots, read in the same step: where {@link isWritable} allows each. */
export function isBirthWritable([gatePut, rootPut]: BirthPuts, prior: RootRows): boolean { return isWritable(gatePut, prior.gate) && isWritable(rootPut, prior.root) }
// --
