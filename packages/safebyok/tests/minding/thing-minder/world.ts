import { noop } from 'es-toolkit'
import { Errors } from 'safebyok-big/internals'
import { vi } from 'vitest'
import type { DeliverableThing, MinderEvent, MinderFriend, QueryCacheOpts, TSQAnswer, ThingCar } from '../../../src/shapes/shapes-minder'
import { ThingMinder } from '../../../src/minding/thing-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import type { Labelpath, Revtok } from '../../../src/shapes/primitives'
import { type GateRecord, type ThingRecord, type ThingScope, Shell } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import { type GetAsk, type WriteAsk, getAskOf, listAskOf } from '../../../src/shapes/shapes-asks'
import type { GetThingAnswer, ThingNotice, WriteThingAnswer } from '../../../src/storage/vault-db'
import * as TH from '../../test-helpers'

/** The get ask a minder sends the vaultDB for the main gate: the bank's, tracking the roots at revision 0. */
export const GateGetAsk: GetAsk = getAskOf({ ...TH.GateScope, ifAbsent: 'nil', track: TH.trackOf() })

/** A bank as a minder reads it: its scope, its get and list asks tracking the roots at revision 0, and a spy for its bad news. */
export function fakeBankOf() {
  return {
    scope:       { ...TH.ThingBank },
    rootBox:     { ...TH.rootBoxOf(), am: 'a' },
    makeGetAsk:  (args: { labelpath: Labelpath, ifAbsent?: 'nil' | 'fail' }) => getAskOf({ ...args, ...TH.ThingBank, track: TH.trackOf() }),
    makeListAsk: (args: { labelpath: Labelpath, ifAbsent?: 'nil' | 'fail' }) => listAskOf({ ...args, ...TH.ThingBank, track: TH.trackOf() }),
    tellBadNews: vi.fn<(badnews: readonly unknown[]) => void>(),
  } satisfies MinderFriend
}

/** The bad news told to `bank`, a {@link fakeBankOf} bank, each by its refusalkind. */
export function badnewsOf(bank: ReturnType<typeof fakeBankOf>): string[] {
  return bank.tellBadNews.mock.calls.flatMap(([told]) => told.map((news) => (news as Errors.VaultError).refusalkind))
}

/** A vaultDB whose gets read the store at once, and answer only when the test calls `release`. */
export class LateVaultDB extends MemoryVaultDB {
  readonly #releases: (() => void)[] = []

  /** True while a get has read the store and waits to answer. */
  get isHolding(): boolean { return this.#releases.length > 0 }

  override async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> {
    const answer = await super.tryGetThing(ask)
    await new Promise<void>((resolve) => { this.#releases.push(resolve) })
    return answer
  }

  /** Let every get that waits answer what it read. */
  release(): void { for (const resolve of this.#releases.splice(0)) { resolve() } }
}

/** A vaultDB whose watch tells nothing: a test hands the minder each notice itself. */
export class QuietVaultDB extends MemoryVaultDB {
  override watch(): () => void { return noop }
}

/** A quiet vaultDB whose writes, once the test calls `hold`, store at once and answer only when it calls `release`. */
export class LateWriteVaultDB extends QuietVaultDB {
  readonly #releases: (() => void)[] = []
  #isLate = false

  /** True while a write is stored and waits to answer. */
  get isHolding(): boolean { return this.#releases.length > 0 }

  /** Make each later write wait, once stored, for `release`. */
  hold(): void { this.#isLate = true }

  override async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
    const answer = await super.tryWriteThing(ask)
    if (this.#isLate) { await new Promise<void>((resolve) => { this.#releases.push(resolve) }) }
    return answer
  }

  /** Let every write that waits answer. */
  release(): void { for (const resolve of this.#releases.splice(0)) { resolve() } }
}

/** A vaultDB whose datastore cannot be reached. */
export class DownVaultDB extends MemoryVaultDB {
  protected override doGetThing(): never { throw new Error('connection refused') }
}

/** A day, in milliseconds: far past the five minutes after which TanStack Query collects a query by default. */
export const Hours24 = 24 * 60 * 60 * 1000

/** A minder of `bank` over `vaultDB`. */
export function minderOf(vaultDB: MemoryVaultDB, queryCacheOpts: Partial<QueryCacheOpts> = {}, bank: MinderFriend = fakeBankOf()): ThingMinder {
  return ThingMinder.make({ vaultDB, queryCacheOpts }, bank)
}

/** A bank's minder, what it stands on, and a way to hand its watch a notice. */
export interface MinderWorld<VaultDBT extends MemoryVaultDB> {
  vaultDB: VaultDBT
  bank:    ReturnType<typeof fakeBankOf>
  minder:  ThingMinder
  receive: (notice: ThingNotice) => void
}

/** The minder of a bank over `vaultDB`, made, and started unless `isStarted` is false, after which it has heard the root box's notice unless `isRootHeard` is false. */
export function minderWorldOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT, { isStarted = true, isRootHeard = true } = {}): MinderWorld<VaultDBT> {
  const bank     = fakeBankOf()
  const watching = vi.spyOn(vaultDB as MemoryVaultDB, 'watch')
  const minder   = minderOf(vaultDB, {}, bank)
  if (isStarted) { minder.hello() }
  function receive(notice: ThingNotice): void {
    for (const watched of watching.mock.calls) { watched[1](notice) }
  }
  if (isStarted && isRootHeard) { receive(noticeOf(TH.rootBoxOf())) }
  return { vaultDB, bank, minder, receive }
}

/** `vaultDB` with a born bank, its roots at revision 0, which the asks above track. */
export async function bornOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT): Promise<VaultDBT> {
  await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
  return vaultDB
}

/** A vaultDB with a born bank, its main gate at revision `revseq`, and that gate. */
export async function storedGateOf(vaultDB: MemoryVaultDB, revseq: number): Promise<GateRecord> {
  let gate = TH.gateThingOf()
  await bornOf(vaultDB)
  for (let ii = 0; ii < revseq; ii++) {
    const next = TH.nextGateOf(gate)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate, next)))
    gate = next
  }
  return gate
}

/** A vaultDB with a born bank and the box under its root box, and that box. */
export async function storedBoxOf(vaultDB: MemoryVaultDB): Promise<ThingNotice['val']> {
  await bornOf(vaultDB)
  const box   = TH.boxThingOf()
  const shell = Shell.of(TH.BoxScope, TH.rootBoxOf())
  await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(box, shell)))
  return box
}

/** A watch notice of `thing`, as the vaultDB sends one. */
export function noticeOf(thing: ThingNotice['val']): ThingNotice {
  return { ok: true, act: (thing.am === 'a') ? 'gotlive' : 'gotgone', val: thing }
}

/** The revtok of the newest record the minder has for the main gate, or undefined for nothing or the void sentinel. */
export function revtokAt(minder: ThingMinder): Revtok | undefined {
  const record: DeliverableThing | undefined = minder.at(TH.GateScope)?.newest
  return ((record === undefined) || Thing.isVoidSentinel(record)) ? undefined : record.revtok
}

/** The act of `answer`, a tryAt's answer. */
export function actOf(answer: TSQAnswer): string { return answer.act }

/** The scope of the box under the root box labelled `boxlabel`. */
export function boxScopeOf(boxlabel: string): ThingScope { return { ...TH.ThingBank, labelpath: `box/${boxlabel}` } }

/** Put `box` in `vaultDB`'s store as another device would, telling no watch. */
export function cheatBox(vaultDB: MemoryVaultDB, box: DeliverableThing): void { vaultDB._cheat_things(TH.ThingBank).set(box.labelpath, box) }

/** A listener that records each event it is told. */
export function listenerOf() { return vi.fn<(event: MinderEvent) => void>() }

/** The labelpath and the car's liveness of each car `listener` was told of, in order, or `'listing'` for a listing's event. */
export function toldOf(listener: ReturnType<typeof listenerOf>): (readonly [Labelpath, ThingCar<ThingRecord>['liveness'] | undefined] | readonly [string])[] {
  return listener.mock.calls.map(([event]) => (ThingMinder.isThingEvent(event) ? [event.labelpath, event.state.data?.liveness] as const : ['listing'] as const))
}

/** The ask that births the box `boxlabel` under the root box, over its shell. */
export function boxBirthAskOf(boxlabel = 'openai'): WriteAsk {
  return TH.birthAskOf(TH.boxThingOf(boxlabel), Shell.of(boxScopeOf(boxlabel), TH.rootBoxOf()))
}

/** A minder that has not started, for a test of its keys. */
export function minderWithoutStart(): ThingMinder { return minderWorldOf(new MemoryVaultDB(), { isStarted: false }).minder }
