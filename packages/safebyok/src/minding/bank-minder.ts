/** `BankMinder`, which minds the world of each bank this device hears of in a TanStack Query cache of its own. */

import * as TSQ from '@tanstack/query-core'
import { deepFreeze } from 'es-toolkit'
import { ReportError, Validator } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import { type BankRecord, type BoxRecord, type GateRecord, ThingChecks } from '../shapes/shapes-thing'
import { type BankScope, type BankStamp, StampChecks } from '../shapes/shapes-stamps'
import { type BankRoots, type BirthBankAsk, type WorldRecord, type WriteAsk, getAskOf } from '../shapes/shapes-asks'
import { type DeliverableThing, FixedQueryCacheOpts } from '../shapes/shapes-minder'
import type { BirthBankAnswer, VaultDB, WriteThingAnswer } from '../storage/vault-db'
import { Thing } from '../models/thing'
import { bankKeyHeadOf } from './minder-keys'
import { newerThingOf } from './newer-thing'
import * as Throwers from '../refusals/throwers'

/** This device's cache of the world of each bank it hears of, for any number of users: the bank, its main gate and its root box.
 * A bank's world is landed from the vaultDB's answers and notices, never fetched by its key, and found by the bank's scope.
 * It needs no user to exist, and nothing in it ends with a VaultMinder's `goodbye`.
 *
 * ## Invariants
 * - A bank has one world cached at most: the world of the life last landed whole. A world of another life replaces it
 *   whole, and a late answer from an earlier life lands as such a world.
 * - A world is first cached whole, its three roots read in one step: the answer to {@link fetchWorld} or a birth, or a
 *   notice of the root box with its bank's world.
 * - Within a life, each root never goes back: a record lands only where it is newer than the one cached. A record of a
 *   life with no world cached lands nowhere, and neither does a sparse record.
 * - It caches only what the vaultDB answered or notified, and asks the vaultDB nothing but in {@link fetchWorld} and the
 *   writes made through it.
 */
export class BankMinder {
  // == [Props]: #tsq

  readonly #tsq: TSQ.QueryClient
  // --

  // == [Construction]: make, constructor, #makeTSQ

  /** Make a minder of banks' worlds, its cache empty. */
  static make(): BankMinder { return new BankMinder() }

  private constructor() {
    this.#tsq = this.#makeTSQ()
    Object.freeze(this)
  }

  // A world is never fetched by its key, so it never goes stale; under skipToken TanStack never fetches it.
  /** The QueryClient whose cache has the worlds, its query defaults set. */
  #makeTSQ(): TSQ.QueryClient {
    const tsq = new TSQ.QueryClient()
    tsq.setQueryDefaults([KeyHead], { ...FixedQueryCacheOpts, staleTime: Infinity, queryFn: TSQ.skipToken, structuralSharing: newerRootsOf })
    return tsq
  }
  // --

  // == [Reading]: worldAt, fetchWorld, subscribe

  /** The world of `scoped`'s bank as last heard of, or undefined for none. Never asks the vaultDB. */
  worldAt(scoped: BankScope): BankRoots | undefined {
    const [entry] = this.#tsq.getQueriesData<BankRoots>({ queryKey: worldKeyHeadOf(Checks.bankScope.parse(scoped)) })
    return entry?.[1]
  }

  /** Fetch the world of `scoped`'s bank from `vaultDB`, and cache it: the bank's three roots, or null where none is stored.
   * Refuses where a root is stored without the others, or damaged beside them.
   */
  async fetchWorld(vaultDB: VaultDB, scoped: BankScope): Promise<BankRoots | null> {
    const { vaultDB: checkedVaultDB, scope } = Checks.fetchWorldArgs.parse({ vaultDB, scope: scoped })
    // A get of the root box answers it, and the bank and main gate as its world, all three read in one step.
    const answer = await checkedVaultDB.tryGetThing(getAskOf({ ...scope, labelpath: Labelpath.RootBox, ifAbsent: 'nil' }))
    if (! answer.ok) { throw answer.err }
    if ((answer.world === null) && (answer.act === 'gotvoid')) { return null }
    if ((answer.world === null) || (answer.act === 'gotvoid')) { throw Throwers.bankRootsMissing() }
    this.#landWorld(answer.world, answer.val as BoxRecord)
    return this.worldAt(scope) ?? null
  }

  /** Call `listener` after each change to a world in the cache, and return the function that stops it.
   * The listener is called with no argument: read the world again. What it throws is reported to the platform.
   */
  subscribe(listener: () => void): () => void {
    Checks.listener.parse(listener)
    return this.#tsq.getQueryCache().subscribe((tsqEvent) => {
      if (! isWorldChange(tsqEvent)) { return }
      try {
        listener()
      } catch (err) {
        ReportError.reportToPlatform(err)
      }
    })
  }
  // --

  // == [Writing]: tryWrite, tryBirthBank

  /** Write `ask` through `vaultDB`, and return its answer, a refusal included.
   * The world the answer reports is cached before it answers, so a write of the bank or its main gate shows there at once.
   */
  async tryWrite(vaultDB: VaultDB, ask: WriteAsk): Promise<WriteThingAnswer> {
    const answer = await Checks.vaultDB.parse(vaultDB).tryWriteThing(ask)
    if (answer.world !== null) { this.#landWorld(answer.world) }
    if (answer.ok) { this.sendToTSQ(answer.val) }
    return answer
  }

  /** Birth a bank through `vaultDB`, and return its answer, a refusal included.
   * The three roots it answers, written or found stored, are cached before it answers as the bank's world.
   */
  async tryBirthBank(vaultDB: VaultDB, ask: BirthBankAsk): Promise<BirthBankAnswer> {
    const answer = await Checks.vaultDB.parse(vaultDB).tryBirthBank(ask)
    if (answer.ok) { this.#landWorld({ ...answer.val.bank, maingate: answer.val.gate }, answer.val.root) }
    return answer
  }
  // --

  // == [Landing]: sendToTSQ, #landWorld, #landRoot

  /** Cache `record` in the world of its bank, where it is the bank, its main gate or its root box, whole, and newer than the one cached.
   * A record of a life with no world cached lands nowhere: a new life's world lands whole.
   */
  sendToTSQ(record: DeliverableThing): void {
    Checks.record.parse(record)
    if (Thing.isSparse(record) || Thing.isVoidSentinel(record)) { return }
    if (record.labelpath === 'bank') {
      const worldKey = worldQueryKeyOf(record as BankRecord)
      const prior    = this.#tsq.getQueryData<BankRoots>(worldKey)
      if (prior !== undefined) { this.#tsq.setQueryData<BankRoots>(worldKey, { ...prior, bank: deepFreeze(record as BankRecord) }) }
      return
    }
    if (record.labelpath === Labelpath.MainGate) { this.#landRoot(record, { gate: record as GateRecord }) }
    if (record.labelpath === Labelpath.RootBox)  { this.#landRoot(record, { root: record as BoxRecord }) }
  }

  // A world of another life replaces every world of its bank: nothing compares the two lives. A world of the life cached
  // lands root by root, each through newerRootsOf, so none goes back.
  /** Cache `world`, and `root` where in hand, as the world of its bank's life. A world of a life not cached lands only with its root box. */
  #landWorld(world: WorldRecord, root?: BoxRecord): void {
    const { maingate, ...bank } = world
    const worldKey = worldQueryKeyOf(bank)
    const prior    = this.#tsq.getQueryData<BankRoots>(worldKey)
    const landedRoot = root ?? prior?.root
    if (landedRoot === undefined) { return }
    if (prior === undefined) { this.#tsq.removeQueries({ queryKey: worldKeyHeadOf(bank) }) }
    this.#tsq.setQueryData<BankRoots>(worldKey, deepFreeze({ bank, gate: maingate, root: landedRoot }))
  }

  // A main gate's or root box's record names no life of its bank, so it lands in the world found by the bank's scope.
  /** Cache `roots`, the main gate or the root box `record` is, in the world of `record`'s bank, where one is cached. */
  #landRoot(record: DeliverableThing, roots: Partial<BankRoots>): void {
    const [entry] = this.#tsq.getQueriesData<BankRoots>({ queryKey: worldKeyHeadOf(record) })
    if (entry?.[1] === undefined) { return }
    this.#tsq.setQueryData<BankRoots>(entry[0], { ...entry[1], ...deepFreeze(roots) })
  }
  // --

  // == [Keys]: worldQueryKeyOf

  // A key is the bank's three segments, 'world', then the bank's lifeseq and lifetok: one key for each life of the bank,
  // which its birth and its delete each change. Its head without the life finds the world of the bank, whatever its life.
  /** The query key a BankMinder caches the world of `bank`'s life under. */
  static worldQueryKeyOf(bank: BankStamp): TSQ.QueryKey {
    return worldQueryKeyOf(Checks.bankStamp.parse(bank))
  }
  // --
}

// == [Helpers]: KeyHead, Worldkind, worldKeyHeadOf, worldQueryKeyOf, newerRootsOf, isWorldChange

/** The segment every query key a minder makes starts with. */
const KeyHead = 'sok'

/** The entrykind segment of a world's query key. */
const Worldkind = 'world'

/** The part of a world's query key that every life of `scope`'s bank has in common. */
function worldKeyHeadOf(scope: BankScope): TSQ.QueryKey { return [...bankKeyHeadOf(scope), Worldkind] }

/** The query key the world of `bank`'s life is cached under. */
function worldQueryKeyOf(bank: Pick<BankStamp, 'userid' | 'banklabel' | 'lifeseq' | 'lifetok'>): TSQ.QueryKey {
  return [...worldKeyHeadOf(bank), bank.lifeseq, bank.lifetok]
}

/** TanStack's structural sharing for a world: the newer of each root in `prior` and `next`, frozen; `prior` itself where `next` brings none newer. */
const newerRootsOf = (prior: unknown, next: unknown): unknown => {
  const nextRoots = next as BankRoots
  if (prior === undefined) { return nextRoots }
  const priorRoots = prior as BankRoots
  const landed = {
    bank: newerThingOf(priorRoots.bank, nextRoots.bank) as BankRecord,
    gate: newerThingOf(priorRoots.gate, nextRoots.gate) as GateRecord,
    root: newerThingOf(priorRoots.root, nextRoots.root) as BoxRecord,
  }
  const isPrior = (landed.bank === priorRoots.bank) && (landed.gate === priorRoots.gate) && (landed.root === priorRoots.root)
  return isPrior ? priorRoots : Object.freeze(landed)
}

/** True for a cache event that changes what a world holds: a record landing, or a world removed. */
function isWorldChange(tsqEvent: TSQ.QueryCacheNotifyEvent): boolean {
  return (tsqEvent.type === 'removed') || ((tsqEvent.type === 'updated') && (tsqEvent.action.type === 'success'))
}
// --

// == [Checks]: Checks

/** The checks of a BankMinder's arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, fn, custom }) => ({
  bankScope:      StampChecks.bankScope,
  bankStamp:      StampChecks.bankStamp,
  vaultDB:        ThingChecks.vaultDBShape,
  fetchWorldArgs: obj({ vaultDB: ThingChecks.vaultDBShape, scope: StampChecks.bankScope }),
  listener:       fn<() => void>(),
  // A record passes through as it is, so that the record cached is the one given.
  record:         custom<DeliverableThing>((val) => ThingChecks.scopedCited.safeParse(val).success),
}))
// --
