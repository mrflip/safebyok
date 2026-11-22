import { noop } from 'es-toolkit'
import { Errors } from 'safebyok-big/internals'
import { vi } from 'vitest'
import type { DeliverableThing, ListingEvent, MinderEvent, ThingEvent, MinderFriend, QueryCacheOpts, TSQAnswer } from '../../../src/shapes/shapes-minder'
import { VaultMinder } from '../../../src/minding/vault-minder'
import { BankMinder } from '../../../src/minding/bank-minder'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import type { Labelpath, Revtok } from '../../../src/shapes/primitives'
import { type BoxRecord, type ThingRecord, type ThingScope, Shell } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import { type GetAsk, type WriteAsk, getAskOf, listAskOf } from '../../../src/shapes/shapes-asks'
import type { BankScope } from '../../../src/shapes/shapes-stamps'
import type { GetThingAnswer, ThingNotice, WriteThingAnswer } from '../../../src/storage/vault-db'
import * as TH from '../../test-helpers'

/** The get ask a minder sends the vaultDB for the box at `TH.BoxScope`: the bank's, tracking the roots at revision 0. */
export const BoxGetAsk: GetAsk = getAskOf({ ...TH.BoxScope, ifAbsent: 'nil', track: TH.trackOf() })

/** A bank as a minder reads it, {@link TH.ThingBank} unless `scope` names another: its scope, its get and list asks tracking the roots at revision 0, and a spy for its bad news. */
export function fakeBankOf(scope: BankScope = TH.ThingBank) {
  return {
    scope:       { ...scope },
    makeGetAsk:  (args: { labelpath: Labelpath, ifAbsent?: 'nil' | 'fail' }) => getAskOf({ ...args, ...scope, track: TH.trackOf() }),
    makeListAsk: (args: { labelpath: Labelpath, ifAbsent?: 'nil' | 'fail' }) => listAskOf({ ...args, ...scope, track: TH.trackOf() }),
    tellBadNews: vi.fn<(badnews: readonly unknown[]) => void>(),
  } satisfies MinderFriend
}

/** The bad news told to `bank`, a {@link fakeBankOf} bank, each by its refusalkind. */
export function badnewsOf(bank: ReturnType<typeof fakeBankOf>): string[] {
  return bank.tellBadNews.mock.calls.flatMap(([told]) => told.map((news) => (news as Errors.VaultError).refusalkind))
}

/** A vaultDB whose gets read the datastore at once, and answer only when the test calls `release`. */
export class LateVaultDB extends MemoryVaultDB {
  readonly #releases: (() => void)[] = []

  /** True while a get has read the datastore and waits to answer. */
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

/** A BankMinder of `TH.ThingBank`, minding, with its roots at revision 0 unless `isWorldHeard` is false. Its birth is in a vaultDB of its own. */
export async function bankMinderOf({ isWorldHeard = true } = {}): Promise<BankMinder> {
  const bankMinder = BankMinder.make({ vaultDB: new MemoryVaultDB() }, fakeBankOf())
  bankMinder.hello()
  if (isWorldHeard) { await TH.expectGood(bankMinder.tryBirthBank(TH.birthBankAskOf())) }
  return bankMinder
}

/** A minder of `bank` over `vaultDB`, reading the root box from `bankMinder`, one that has the bank's roots by default. */
export async function minderOf(vaultDB: MemoryVaultDB, queryCacheOpts: Partial<QueryCacheOpts> = {}, bank: MinderFriend = fakeBankOf(), bankMinder?: BankMinder): Promise<VaultMinder> {
  return VaultMinder.make({ vaultDB, bankMinder: bankMinder ?? await bankMinderOf(), queryCacheOpts }, bank)
}

/** A bank's minder, what it stands on, and a way to hand its watch a notice. */
export interface MinderWorld<VaultDBT extends MemoryVaultDB> {
  vaultDB:    VaultDBT
  bank:       ReturnType<typeof fakeBankOf>
  bankMinder: BankMinder
  minder:     VaultMinder
  receive:    (notice: ThingNotice) => void
}

/** The minder of a bank over `vaultDB`, made, and started unless `isStarted` is false. Its BankMinder has the bank's world, roots at revision 0, unless `isWorldHeard` is false. */
export async function minderWorldOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT, { isStarted = true, isWorldHeard = true } = {}): Promise<MinderWorld<VaultDBT>> {
  const bank       = fakeBankOf()
  const bankMinder = await bankMinderOf({ isWorldHeard })
  const watching   = vi.spyOn(vaultDB as MemoryVaultDB, 'watch')
  const minder     = await minderOf(vaultDB, {}, bank, bankMinder)
  if (isStarted) { minder.hello() }
  function receive(notice: ThingNotice): void {
    for (const watched of watching.mock.calls) { watched[1](notice) }
  }
  return { vaultDB, bank, bankMinder, minder, receive }
}

/** `vaultDB` with a born bank, its roots at revision 0, which the asks above track. */
export async function bornOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT): Promise<VaultDBT> {
  await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
  return vaultDB
}

/** A vaultDB with a born bank and the box at `TH.BoxScope` under its root box, at revision `revseq`, and that box. */
export async function storedBoxOf(vaultDB: MemoryVaultDB, revseq = 0): Promise<BoxRecord> {
  await bornOf(vaultDB)
  let box = TH.boxThingOf()
  const shell = Shell.of(TH.BoxScope, TH.rootBoxOf())
  await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(box, shell)))
  for (let ii = 0; ii < revseq; ii++) {
    const next = TH.nextOf(box)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(box, next)))
    box = next
  }
  return box
}

/** A watch notice of `record` sparse, as the vaultDB sends one for a large record. */
export function sparseNoticeOf(record: ThingRecord): ThingNotice {
  return noticeOf(Thing.sparseOf(record))
}

/** A watch notice of `thing`, as the vaultDB sends one. */
export function noticeOf(thing: ThingNotice['val']): ThingNotice {
  return { ok: true, act: Thing.isLive(thing) ? 'gotlive' : 'gotgone', val: thing }
}

/** The revtok of the item of the box at `TH.BoxScope`, or undefined for nothing or the void sentinel. */
export function revtokAt(minder: VaultMinder): Revtok | undefined {
  const record: DeliverableThing | undefined = minder.at(TH.BoxScope)
  return ((record === undefined) || Thing.isVoidSentinel(record)) ? undefined : record.revtok
}

/** The act of `answer`, a tryAt's answer. */
export function actOf(answer: TSQAnswer): string { return answer.act }

/** The scope of the box under the root box labelled `boxlabel`. */
export function boxScopeOf(boxlabel: string): ThingScope { return { ...TH.ThingBank, labelpath: `box/${boxlabel}` } }

/** Put `box` in `vaultDB`'s datastore as another device would, telling no watch. */
export function cheatBox(vaultDB: MemoryVaultDB, box: DeliverableThing): void { vaultDB._cheat_things(TH.ThingBank).set(box.labelpath, box) }

/** A listener that records each event it is told. */
export function everyEventListenerOf() { return vi.fn<(event: MinderEvent) => void>() }

/** A listener that records only `success`, `error`, `invalidate` and removal events. */
export function listenerOf() {
  const heard = everyEventListenerOf()
  function listener(event: MinderEvent): void {
    if ((event.type === 'removed') || ['success', 'error', 'invalidate'].includes(event.action?.type ?? '')) { heard(event) }
  }
  return Object.assign(listener, { mock: heard.mock, mockClear: () => heard.mockClear() })
}

/** True when `event` is about a listing's query: neither an item's nor a soon's. */
export function isListingEvent(event: MinderEvent): event is ListingEvent {
  return event.eventkind === 'list'
}

/** What an item's event tells: `'behind'` for its falling behind, `'removed'` for its removal, else whether its record is live, gone or the shell (`'void'`), or undefined for no record. */
export type ToldSort = 'live' | 'gone' | 'void' | 'behind' | 'removed' | undefined

/** A summary of each event `listener` recorded, in order:
 * - an item's    -- `[labelpath, ToldSort]` ({@link ToldSort})
 * - a soon's     -- `['soon', labelpath, revseq]`, with `'removed'` in place of the revseq for its removal
 * - a listing's  -- `['listing']`
 */
export function toldOf(listener: ReturnType<typeof listenerOf>): (readonly [Labelpath, ToldSort] | readonly ['soon', Labelpath, number | 'removed' | undefined] | readonly ['listing'])[] {
  return listener.mock.calls.map(([event]) => {
    if (event.eventkind === 'item') { return [event.labelpath, toldSortOf(event)] as const }
    if (event.eventkind === 'soon') { return ['soon', event.labelpath, (event.type === 'removed') ? 'removed' : event.revseq] as const }
    return ['listing'] as const
  })
}

/** The {@link ToldSort} of `event`, an item's. */
function toldSortOf(event: ThingEvent): ToldSort {
  if (event.type === 'removed')            { return 'removed' }
  if (event.action?.type === 'invalidate') { return 'behind' }
  const record = event.state.data
  if (record === undefined)                { return undefined }
  if (Thing.isVoidSentinel(record))        { return 'void' }
  return Thing.isGone(record) ? 'gone' : 'live'
}

/** The ask that births the box `boxlabel` under the root box, over its shell. */
export function boxBirthAskOf(boxlabel = 'openai'): WriteAsk {
  return TH.birthAskOf(TH.boxThingOf(boxlabel), Shell.of(boxScopeOf(boxlabel), TH.rootBoxOf()))
}

/** A minder that has not started, for a test of its keys. */
export async function minderWithoutStart(): Promise<VaultMinder> {
  const { minder } = await minderWorldOf(new MemoryVaultDB(), { isStarted: false })
  return minder
}
