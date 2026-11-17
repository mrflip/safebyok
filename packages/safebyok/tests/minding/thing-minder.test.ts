import * as TSQ from '@tanstack/query-core'
import { Errors } from 'safebyok-big/internals'
import { describe, expect, it, vi } from 'vitest'
import { DefaultQueryCacheOpts, FixedQueryCacheOpts, type MinderFriend, type MinderGetAsk, type QueryCacheOpts } from '../../src/minding/shapes-minder'
import { type DeliverableThing, type TSQAnswer, type TSQGotAnswer, ThingMinder } from '../../src/minding/thing-minder'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { type GateThing, type GetAsk, type ThingScope, type Thingkind, ShellLifeseq, boxSealable, getAskOf, listAskOf, modelkindOf, shellOf, sparseOf } from '../../src/storage/shapes-thing'
import type { GetThingAnswer, ThingNotice } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** The get ask a minder takes for `scope`: the bank's, tracking the roots at revision 0. */
function askOf(scope: ThingScope): MinderGetAsk {
  return { op: 'get', modelkind: modelkindOf(scope.labelpath), ...scope, ifAbsent: 'nil', track: TH.trackOf() }
}

/** The ask that gets the main gate, as a minder takes it. */
const GateAsk = askOf(TH.GateScope)
/** The ask that gets the bank, as a minder takes it. */
const BankAsk = askOf(TH.BankScope)
/** The ask that gets the box under the root box, as a minder takes it. */
const BoxAsk  = askOf(TH.BoxScope)
/** The ask that gets the root box, as a minder takes it. */
const RootAsk = askOf(TH.RootScope)

/** A bank as a minder reads it: its scope, its root box in life 0, its get and list asks tracking the roots at revision 0, and a spy for its bad news. */
function fakeBankOf() {
  return {
    scope:       { ...TH.ThingBank },
    rootBox:     TH.rootBoxOf(),
    makeGetAsk:  (args: { labelpath: string }) => getAskOf({ ...args, ...TH.ThingBank, track: TH.trackOf() }),
    makeListAsk: (args: { labelpath: string }) => listAskOf({ ...args, ...TH.ThingBank, track: TH.trackOf() }),
    tellBadNews: vi.fn<(badnews: readonly unknown[]) => void>(),
  } satisfies MinderFriend
}

/** The bad news told to `bank`, a {@link fakeBankOf} bank, each by its refusalkind. */
function badnewsOf(bank: ReturnType<typeof fakeBankOf>): string[] {
  return bank.tellBadNews.mock.calls.flatMap(([told]) => told.map((news) => (news as Errors.VaultError).refusalkind))
}

/** A vaultDB whose gets read the store at once, and answer only when the test calls `release`. */
class LateVaultDB extends MemoryVaultDB {
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

/** A vaultDB whose datastore cannot be reached. */
class DownVaultDB extends MemoryVaultDB {
  protected override doGetThing(): never { throw new Error('connection refused') }
}

/** A minder of `modelkind` in `bank` over `vaultDB` and `tsq`. */
function minderOf(modelkind: Thingkind, vaultDB: MemoryVaultDB, tsq: TSQ.QueryClient, queryCacheOpts: Partial<QueryCacheOpts> = {}, bank: MinderFriend = fakeBankOf()): ThingMinder {
  return ThingMinder.make({ modelkind }, { vaultDB, tsq, queryCacheOpts }, bank)
}

/** A bank's minders of each kind, each with its own watch, what they stand on, and a way to hand every watch a notice. */
interface MinderWorld<VaultDBT extends MemoryVaultDB> {
  vaultDB:    VaultDBT
  tsq:        TSQ.QueryClient
  bank:       ReturnType<typeof fakeBankOf>
  minder:     ThingMinder
  boxMinder:  ThingMinder
  bankMinder: ThingMinder
  receive:    (notice: ThingNotice) => void
}

/** The minders of a bank over `vaultDB`, made, and started unless `isStarted` is false. `minder` is the gate's. */
function minderWorldOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT, { isStarted = true } = {}): MinderWorld<VaultDBT> {
  const tsq        = new TSQ.QueryClient()
  const bank       = fakeBankOf()
  const watching   = vi.spyOn(vaultDB as MemoryVaultDB, 'watch')
  const minder     = minderOf('gate', vaultDB, tsq, {}, bank)
  const boxMinder  = minderOf('box', vaultDB, tsq, {}, bank)
  const bankMinder = minderOf('bank', vaultDB, tsq, {}, bank)
  if (isStarted) { for (const each of [minder, boxMinder, bankMinder]) { each.hello() } }
  function receive(notice: ThingNotice): void {
    for (const watched of watching.mock.calls) { watched[1](notice) }
  }
  return { vaultDB, tsq, bank, minder, boxMinder, bankMinder, receive }
}

/** `vaultDB`, holding a born bank: its roots at revision 0, the asks above track. */
async function bornOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT): Promise<VaultDBT> {
  await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
  return vaultDB
}

/** A vaultDB holding a born bank with its main gate at revision `revseq`, and the gate it holds. */
async function storedGateOf(vaultDB: MemoryVaultDB, revseq: number): Promise<GateThing> {
  let gate = TH.gateThingOf()
  await bornOf(vaultDB)
  for (let ii = 0; ii < revseq; ii++) {
    const next = TH.nextGateOf(gate)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate, next)))
    gate = next
  }
  return gate
}

/** A vaultDB holding a born bank and the box under its root box, and the box. */
async function storedBoxOf(vaultDB: MemoryVaultDB): Promise<ThingNotice['val']> {
  await bornOf(vaultDB)
  const box   = TH.boxThingOf()
  const shell = shellOf(TH.BoxScope, TH.rootBoxOf())
  await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(box, shell)))
  return box
}

/** A watch notice of `thing`, as the vaultDB sends one, with `world` beside it. */
function noticeOf(thing: ThingNotice['val'], world: ThingNotice['world'] = null): ThingNotice {
  return { ok: true, act: (thing.am === 'a') ? 'gotlive' : 'gotgone', val: thing, world }
}

/** The revtok of what the minder holds for the main gate, or undefined for nothing or the void sentinel. */
function revtokAt(minder: ThingMinder): string | undefined {
  const record: DeliverableThing | undefined = minder.at(GateAsk)
  return ((record === undefined) || (record.revseq === -1)) ? undefined : record.revtok
}

/** The act of `answer`, a tryAt's answer. */
function actOf(answer: TSQAnswer): string { return answer.act }

describe("ThingMinder.make", () => {
  const tsq     = new TSQ.QueryClient()
  const vaultDB = new MemoryVaultDB()
  const { makeGetAsk: _makeGetAsk, ...noAsks } = fakeBankOf()
  const { makeListAsk: _makeListAsk, ...noListAsks } = fakeBankOf()
  const MakeCases = [
    [{ modelkind: 'vault' }, {},                                                    null,                'refuses a modelkind that is no kind of Thing'],
    [{},                     {},                                                    { ...TH.ThingBank }, 'refuses a bank without its scope and root box'],
    [{},                     {},                                                    noAsks,              'refuses a bank that builds no get asks'],
    [{},                     {},                                                    noListAsks,          'refuses a bank that builds no list asks'],
    [{},                     { vaultDB: { tryGetThing: () => 1, watch: () => 1 } }, null,                'refuses a vaultDB without the brand'],
    [{},                     { tsq: { query: 1 } },                                 null,                'refuses a QueryClient without its methods'],
    [{},                     { queryCacheOpts: { networkMode: 'online' } },         null,                'refuses a networkMode, which no host sets'],
    [{},                     { queryCacheOpts: { retry: 3 } },                      null,                'refuses a retry, which no host sets'],
    [{},                     { queryCacheOpts: { staleTime: -1 } },                 null,                'refuses a negative staleTime'],
  ] as const
  for (const [tiesOver, optsOver, bank, blurb] of MakeCases) {
    it(blurb, () => {
      // @ts-expect-error -- sloppy input is the point
      TH.expectSyncRefusal(() => ThingMinder.make({ modelkind: 'gate', ...tiesOver }, { vaultDB, tsq, ...optsOver }, bank ?? fakeBankOf()), 'bad_option')
    })
  }

  it("takes its scope from the bank", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    expect(minder.scope).to.deep.equal(TH.ThingBank)
    expect(minder.ties).to.deep.equal({ ...TH.ThingBank, modelkind: 'gate' })
  })
})

describe("ThingMinder.hello", () => {
  it("sets the cache options, and those no host sets, as the defaults of the minder's entries", () => {
    const { tsq, minder } = minderWorldOf(new MemoryVaultDB())
    expect(tsq.getQueryDefaults(minder.queryKey(TH.GateScope))).to.include({ ...DefaultQueryCacheOpts, ...FixedQueryCacheOpts })
    expect(DefaultQueryCacheOpts.staleTime).to.eq(60 * 60 * 1000)
  })

  it("sets the staleTime the minder was made with", () => {
    const tsq    = new TSQ.QueryClient()
    const minder = minderOf('gate', new MemoryVaultDB(), tsq, { staleTime: 5 })
    minder.hello()
    expect(tsq.getQueryDefaults(minder.queryKey(TH.GateScope))).to.include({ staleTime: 5, gcTime: Infinity, networkMode: 'always', retry: false })
  })

  it("watches the bank from each minder", () => {
    const vaultDB  = new MemoryVaultDB()
    const watching = vi.spyOn(vaultDB, 'watch')
    minderWorldOf(vaultDB)
    expect(watching.mock.calls.map(([scope]) => scope)).to.deep.equal([TH.ThingBank, TH.ThingBank, TH.ThingBank])
  })

  it("opens no second watch when called again", () => {
    const vaultDB  = new MemoryVaultDB()
    const watching = vi.spyOn(vaultDB, 'watch')
    const { bankMinder } = minderWorldOf(vaultDB)
    bankMinder.hello()
    expect(watching.mock.calls).to.have.lengthOf(3)
  })

  it("caches the bank's root box in the box minder, sparse and stale, so that the next get of it fetches it whole", () => {
    const { boxMinder, minder } = minderWorldOf(new MemoryVaultDB())
    expect(boxMinder.at(TH.RootScope)).to.deep.equal(sparseOf(TH.rootBoxOf()))
    expect(boxMinder.isStaleAt(RootAsk)).to.be.true
    expect(minder.at(TH.GateScope)).to.be.undefined
  })

  it("keeps the root box cached past the host's gcTime, which collects the boxes under it, until goodbye", async () => {
    vi.useFakeTimers()
    try {
      const vaultDB   = new MemoryVaultDB()
      await storedBoxOf(vaultDB)
      const tsq       = new TSQ.QueryClient()
      const boxMinder = minderOf('box', vaultDB, tsq, { gcTime: 10 })
      boxMinder.hello()
      await boxMinder.list()
      expect(tsq.getQueryCache().find({ queryKey: boxMinder.queryKey(BoxAsk), exact: true })).to.have.property('gcTime', 10)
      await vi.advanceTimersByTimeAsync(20)
      expect(boxMinder.at(RootAsk)).to.deep.equal(sparseOf(TH.rootBoxOf()))
      expect(boxMinder.at(BoxAsk)).to.be.undefined
      await boxMinder.list()
      expect(boxMinder.at(BoxAsk)).to.deep.equal(sparseOf(TH.boxThingOf()))
      tsq.removeQueries({ queryKey: ['safebyok', 'u1', 'acme', 'box'] })
      expect([boxMinder.at(RootAsk), boxMinder.at(BoxAsk)]).to.deep.equal([undefined, undefined])
      boxMinder.goodbye()
      expect(tsq.getQueryCache().getAll()).to.have.lengthOf(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("comes before any read: until then, each refuses disabled", async () => {
    const { minder, boxMinder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    await TH.expectBad(minder.tryAt(GateAsk), 'disabled')
    await TH.expectRefusal(minder.get(GateAsk), 'disabled')
    await TH.expectRefusal(boxMinder.list(), 'disabled')
  })
})

describe("ThingMinder.goodbye", () => {
  it("removes the minder's entries, stops watching, and refuses later reads", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate0   = await storedGateOf(vaultDB, 0)
    const { tsq, minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    minder.goodbye()
    expect(tsq.getQueryCache().findAll({ queryKey: minder.keyPrefix })).to.have.lengthOf(0)
    const gate1 = TH.nextGateOf(gate0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate0, gate1)))
    await TH.wakeupAtNextTick()
    expect(minder.at(GateAsk)).to.be.undefined
    await TH.expectBad(minder.tryAt(GateAsk), 'disabled')
    await TH.expectRefusal(minder.get(GateAsk), 'disabled')
  })

  it("removes the minder's defaults from the cache", () => {
    const { tsq, minder } = minderWorldOf(new MemoryVaultDB())
    minder.goodbye()
    expect(tsq.getQueryDefaults(minder.queryKey(TH.GateScope))).to.deep.equal({})
  })

  it("refuses a get under way disabled, and caches nothing it answers after", async () => {
    const vaultDB = await bornOf(new LateVaultDB())
    const { tsq, minder } = minderWorldOf(vaultDB)
    const getting = minder.get(GateAsk)
    await TH.eventually(() => vaultDB.isHolding)
    minder.goodbye()
    vaultDB.release()
    await TH.expectRefusal(getting, 'disabled')
    expect(tsq.getQueryCache().findAll({ queryKey: minder.keyPrefix })).to.have.lengthOf(0)
  })

  it("lets hello start the minder again", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    minder.goodbye()
    minder.hello()
    expect(await minder.get(GateAsk)).to.deep.equal(gate)
  })
})

describe("ThingMinder.at", () => {
  it("holds nothing before any get", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    expect(minder.at(GateAsk)).to.be.undefined
  })

  it("holds the record however old it is", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    expect(minder.isStaleAt(GateAsk, { staleTime: 0 })).to.be.true
    expect(minder.at(GateAsk)).to.deep.equal(gate)
  })
})

describe("ThingMinder.tryAt", () => {
  it("answers vacant where the cache holds nothing", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    expect(minder.tryAt(GateAsk)).to.deep.include({ ok: true, act: 'vacant', val: undefined, isTimely: false, refreshedAt: 0, isFetching: false, lastErr: null })
  })

  it("answers gotlive with the record where it is timely", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    expect(minder.tryAt(GateAsk)).to.deep.include({ ok: true, act: 'gotlive', val: gate, isTimely: true, isFetching: false, lastErr: null })
  })

  it("answers untimely, without the record, where it is older than staleTime", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    const answer = minder.tryAt(GateAsk, { staleTime: 0 })
    expect(answer).to.deep.include({ ok: true, act: 'untimely', val: undefined, isTimely: false })
    expect(answer).to.have.property('refreshedAt').above(0)
  })

  it("answers gotvoid, with a null val, where storage holds nothing", async () => {
    const { boxMinder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await boxMinder.get(BoxAsk)
    expect(boxMinder.tryAt(BoxAsk)).to.deep.include({ ok: true, act: 'gotvoid', val: null, isTimely: true })
  })

  it("answers gotgone with a tombstone", () => {
    const { boxMinder, receive } = minderWorldOf(new MemoryVaultDB())
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(boxMinder.tryAt(BoxAsk)).to.deep.include({ ok: true, act: 'gotgone', val: tombstone })
  })

  it("reads the cache alone under ifStale: 'get'", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(minder.tryAt(GateAsk, { ifStale: 'get' })).to.deep.include({ act: 'vacant', isFetching: false })
    await TH.wakeupAtNextTick()
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("fetches a vacant record in the background under ifStale: 'refresh'", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    expect(minder.tryAt(GateAsk, { ifStale: 'refresh' })).to.deep.include({ act: 'vacant', isFetching: true })
    await TH.eventually(() => actOf(minder.tryAt(GateAsk)) === 'gotlive')
    expect(minder.at(GateAsk)).to.deep.equal(gate)
  })

  it("fetches nothing under ifStale: 'refresh' while the record is timely", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(minder.tryAt(GateAsk, { ifStale: 'refresh' })).to.deep.include({ act: 'gotlive', isFetching: false })
    await TH.wakeupAtNextTick()
    expect(asked.mock.calls).to.have.lengthOf(0)
  })

  it("answers a background get's refusal as lastErr", async () => {
    const { minder } = minderWorldOf(new DownVaultDB())
    minder.tryAt(GateAsk, { ifStale: 'refresh' })
    await TH.eventually(() => ('lastErr' in minder.tryAt(GateAsk)) && (minder.tryAt(GateAsk) as { lastErr: unknown }).lastErr !== null)
    const answer = minder.tryAt(GateAsk)
    expect(answer).to.deep.include({ ok: true, act: 'vacant', isFetching: false })
    expect(answer).to.have.nested.property('lastErr.refusalkind', 'storage_unavailable')
  })

  const { track: _track, ...noTrack } = GateAsk
  const RefusedAsks = [
    [{ ...GateAsk, userid: 'u2' },            {},                       'refuses bad_option for an ask of another bank'],
    [{ ...GateAsk, ifAbsent: 'fail' },        {},                       "refuses bad_option for an ask that is not ifAbsent: 'nil'"],
    [{ ...GateAsk, labelpath: 'box/openai' }, {},                       'refuses bad_option for a labelpath of another kind'],
    [noTrack,                                 {},                       'refuses bad_option for an ask that tracks nothing'],
    [{ ...GateAsk, staleTime: 0 },            {},                       'refuses bad_option for an ask that carries an option'],
    [GateAsk,                                 { staleTime: undefined }, 'refuses bad_option for a staleTime given as undefined'],
    [GateAsk,                                 { ifStale: 'keep' },      'refuses bad_option for an ifStale it does not know'],
  ] as const
  for (const [ask, opts, blurb] of RefusedAsks) {
    it(blurb, async () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      await TH.expectBad(minder.tryAt(ask as never, opts as never), 'bad_option')
    })
  }

  it("sends the vaultDB the ask exactly as given", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    minder.tryAt(GateAsk, { ifStale: 'refresh' })
    await TH.eventually(() => asked.mock.calls.length === 1)
    expect(asked.mock.calls).to.deep.equal([[GateAsk]])
  })
})

describe("ThingMinder.get", () => {
  it("refuses bad_option for an ask that tracks nothing, or a staleTime given as undefined", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    const { track: _track, ...noTrack } = GateAsk
    await TH.expectRefusal(minder.get(noTrack as never), 'bad_option')
    // @ts-expect-error -- an explicit undefined is the point
    await TH.expectRefusal(minder.get(GateAsk, { staleTime: undefined }), 'bad_option')
  })

  it("returns the record stored, and reads the cache after", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(await minder.get(GateAsk)).to.deep.equal(gate)
    expect(await minder.get(GateAsk)).to.deep.equal(gate)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("returns, for a box under the root box, its shell under the root box it caches, which the box's birth cites", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { boxMinder } = minderWorldOf(vaultDB)
    const shell = await boxMinder.get(BoxAsk)
    expect(shell).to.deep.equal(shellOf(TH.BoxScope, TH.rootBoxOf()))
    expect(shell).to.deep.include({ ...TH.BoxScope, label: 'openai', revseq: -1, am: 'x', lifepath: `${TH.Life0}/${ShellLifeseq}` })
    expect(boxSealable.safeParse(shell).success).to.be.true
    const birth = TH.birthAskOf(TH.boxThingOf(), shell)
    await TH.expectGood(vaultDB.tryWriteThing(birth))
  })

  it("asks the vaultDB once for two gets under way together", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    const [first, second] = await Promise.all([minder.get(GateAsk), minder.get(GateAsk)])
    expect(first).to.deep.equal(second)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("asks the vaultDB again once the record is older than staleTime", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await minder.get(GateAsk)
    await minder.get(GateAsk, { staleTime: 0 })
    expect(asked.mock.calls).to.have.lengthOf(2)
  })

  it("caches nothing of the world beside the record, and a main gate the ask tracks stale comes to the gate's minder as its own notice", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate1   = await storedGateOf(vaultDB, 1)
    const { minder, bankMinder } = minderWorldOf(vaultDB)
    await TH.wakeupAtNextTick()
    expect(minder.at(TH.GateScope)).to.be.undefined
    expect(await bankMinder.get(BankAsk)).to.have.property('labelpath', 'bank')
    await TH.eventually(() => revtokAt(minder) === gate1.revtok)
    expect(minder.at(TH.GateScope)).to.deep.equal(gate1)
  })

  it("returns a notice that lands during the get over the get's older answer", async () => {
    const vaultDB = new LateVaultDB()
    const gate0   = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const getting = minder.get(GateAsk)
    await TH.eventually(() => vaultDB.isHolding)
    const gate1 = TH.nextGateOf(gate0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate0, gate1)))
    await TH.eventually(() => revtokAt(minder) === gate1.revtok)
    vaultDB.release()
    expect(await getting).to.deep.equal(gate1)
  })

  it("returns a birth that lands during the get over the get's void", async () => {
    const vaultDB = await bornOf(new LateVaultDB())
    const { boxMinder } = minderWorldOf(vaultDB)
    const getting = boxMinder.get(BoxAsk)
    await TH.eventually(() => vaultDB.isHolding)
    const box   = TH.boxThingOf()
    const shell = shellOf(TH.BoxScope, TH.rootBoxOf())
    await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(box, shell)))
    await TH.eventually(() => boxMinder.at(BoxAsk)?.revtok === box.revtok)
    vaultDB.release()
    expect(await getting).to.deep.equal(box)
  })

  // A box, which no ask tracks: a tracked Thing stored is never missing (notes/wontfix.md).
  const BackwardCases = [
    [(vaultDB: MemoryVaultDB, box0: DeliverableThing) => { vaultDB._cheat_things(TH.ThingBank).set(TH.BoxScope.labelpath, box0) }, 'an older revision'],
    [(vaultDB: MemoryVaultDB) => { vaultDB._cheat_things(TH.ThingBank).delete(TH.BoxScope.labelpath) },                            'nothing stored'],
  ] as const
  for (const [goBack, blurb] of BackwardCases) {
    it(`refuses 'stale_read' a get answered with ${blurb}, behind the record cached before it, and keeps that record untimely`, async () => {
      const vaultDB = new MemoryVaultDB()
      const box0    = await storedBoxOf(vaultDB)
      const box1    = TH.nextOf(box0)
      await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(box0, box1)))
      const { boxMinder } = minderWorldOf(vaultDB)
      await boxMinder.get(BoxAsk)
      goBack(vaultDB, box0)
      await TH.expectRefusal(boxMinder.get(BoxAsk, { staleTime: 0 }), 'stale_read')
      expect(boxMinder.at(BoxAsk)).to.deep.equal(box1)
      expect(boxMinder.tryAt(BoxAsk)).to.deep.include({ act: 'untimely', isTimely: false })
      expect(boxMinder.tryAt(BoxAsk)).to.have.nested.property('lastErr.refusalkind', 'stale_read')
      const asked = vi.spyOn(vaultDB, 'tryGetThing')
      await TH.expectRefusal(boxMinder.get(BoxAsk), 'stale_read')
      expect(asked.mock.calls).to.have.lengthOf(1)
    })
  }

  it("makes a notice of a newer record timely again after a stale read", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate1   = await storedGateOf(vaultDB, 1)
    const { minder, receive } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
    await TH.expectRefusal(minder.get(GateAsk, { staleTime: 0 }), 'stale_read')
    const gate2 = TH.nextGateOf(gate1)
    receive(noticeOf(gate2))
    expect(minder.tryAt(GateAsk)).to.deep.include({ act: 'gotlive', val: gate2, isTimely: true })
  })

  it("asks the vaultDB while the browser reports itself offline", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    TSQ.onlineManager.setOnline(false)
    try {
      expect(await minder.get(GateAsk)).to.deep.equal(gate)
    } finally { TSQ.onlineManager.setOnline(true) }
  })

  it("throws the vaultDB's refusal, without trying again", async () => {
    const vaultDB = await bornOf(new DownVaultDB())
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await TH.expectRefusal(minder.get(GateAsk), 'storage_unavailable')
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

})

describe("ThingMinder.list", () => {
  it("lists the boxes under the root box, and caches each sparse and stale", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { boxMinder } = minderWorldOf(vaultDB)
    expect(await boxMinder.list()).to.deep.equal([TH.BoxScope.labelpath])
    expect(boxMinder.at(BoxAsk)).to.deep.equal(sparseOf(box))
    expect(boxMinder.isStaleAt(BoxAsk)).to.be.true
    expect(await boxMinder.get(BoxAsk)).to.deep.equal(box)
  })

  it("leaves a box the cache holds whole as it is, and timely", async () => {
    const vaultDB = new MemoryVaultDB()
    const box     = await storedBoxOf(vaultDB)
    const { boxMinder } = minderWorldOf(vaultDB)
    await boxMinder.get(BoxAsk)
    await boxMinder.list()
    expect(boxMinder.at(BoxAsk)).to.deep.equal(box)
    expect(boxMinder.isStaleAt(BoxAsk)).to.be.false
  })

  it("lists nothing under a root box with no boxes under it", async () => {
    const { boxMinder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    expect(await boxMinder.list()).to.deep.equal([])
  })

  it("sends the bank's list ask, which tracks the roots, and refuses where the bank is not stored", async () => {
    const { boxMinder } = minderWorldOf(new MemoryVaultDB())
    await TH.expectRefusal(boxMinder.list(), 'storage_issue')
  })
})

/** A listener that records each answer it is told. */
function listenerOf() { return vi.fn<(answer: TSQGotAnswer) => void>() }

/** The acts and records `listener` was told, in order. */
function toldOf(listener: ReturnType<typeof listenerOf>): [string, string, DeliverableThing | null | undefined][] {
  return listener.mock.calls.map(([answer]) => [answer.act, answer.ask.labelpath, answer.val])
}

describe("ThingMinder.listen", () => {
  it("tells the answer tryAt would give for each of the minder's own entries, until stopped", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { minder, boxMinder } = minderWorldOf(vaultDB)
    const heard    = listenerOf()
    const unlisten = minder.listen(heard)
    await boxMinder.get(BoxAsk)
    expect(heard.mock.calls).to.have.lengthOf(0)
    const gate = await minder.get(GateAsk)
    expect(toldOf(heard)).to.deep.include(['gotlive', 'gate', gate])
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.include({ ok: true, ask: getAskOf({ ...TH.GateScope, track: TH.trackOf() }), isTimely: true, lastErr: null })
    unlisten()
    heard.mockClear()
    await minder.get(GateAsk, { staleTime: 0 })
    expect(heard.mock.calls).to.have.lengthOf(0)
  })

  it("tells gotvoid with a null val for the shell, and gotgone with a tombstone", async () => {
    const vaultDB = await bornOf(new MemoryVaultDB())
    const { boxMinder, receive } = minderWorldOf(vaultDB)
    const heard = listenerOf()
    boxMinder.listen(heard)
    await boxMinder.get(BoxAsk)
    const tombstone = TH.boxTombOf(TH.boxThingOf())
    receive(noticeOf(tombstone))
    expect(toldOf(heard)).to.deep.equal([['gotvoid', 'box/openai', null], ['gotgone', 'box/openai', tombstone]])
  })

  it("tells nothing while a get waits, then the record it lands", async () => {
    const vaultDB = new LateVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    const heard   = listenerOf()
    minder.listen(heard)
    const getting = minder.get(GateAsk)
    await TH.eventually(() => vaultDB.isHolding)
    expect(heard.mock.calls).to.have.lengthOf(0)
    vaultDB.release()
    await getting
    expect(toldOf(heard).at(-1)).to.deep.equal(['gotlive', 'gate', gate])
  })

  it("tells untimely, without the record, after a refused get, with the refusal as lastErr", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    const heard = listenerOf()
    minder.listen(heard)
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
    await TH.expectRefusal(minder.get(GateAsk, { staleTime: 0 }), 'stale_read')
    expect(toldOf(heard)).to.deep.equal([['untimely', 'gate', undefined]])
    expect(heard.mock.calls[0]?.[0]).to.have.nested.property('lastErr.refusalkind', 'stale_read')
  })

  it("tells vacant once the entry is removed", async () => {
    const vaultDB = new MemoryVaultDB()
    await storedGateOf(vaultDB, 0)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    const heard = listenerOf()
    minder.listen(heard)
    minder.goodbye()
    expect(toldOf(heard)).to.deep.equal([['vacant', 'gate', undefined]])
  })

  it("tells the bank's onBadNews what a listener throws, as unexpected_error, and tells the listeners after it", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 0)
    const { minder, bank } = minderWorldOf(vaultDB)
    const later   = listenerOf()
    minder.listen(() => { throw new Error('listener broke') })
    minder.listen(later)
    await minder.get(GateAsk)
    expect(toldOf(later)).to.deep.include(['gotlive', 'gate', gate])
    expect(badnewsOf(bank)).to.deep.equal(['unexpected_error'])
    expect(bank.tellBadNews.mock.calls[0]?.[0][0]).to.have.nested.property('cause.message', 'listener broke')
  })

  it("refuses a listener that is not a function", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    // @ts-expect-error -- sloppy input is the point
    TH.expectSyncRefusal(() => minder.listen(undefined), 'bad_option')
  })
})

describe("ThingMinder.isStaleAt", () => {
  it("is true before any get, false after, and true past staleTime", async () => {
    const { minder } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    expect(minder.isStaleAt(GateAsk)).to.be.true
    await minder.get(GateAsk)
    expect(minder.isStaleAt(GateAsk)).to.be.false
    expect(minder.isStaleAt(GateAsk, { staleTime: 0 })).to.be.true
  })

  it("refuses bad_option for an ask that tracks nothing, or another bank's", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    const { track: _track, ...noTrack } = GateAsk
    TH.expectSyncRefusal(() => minder.isStaleAt(noTrack as never), 'bad_option')
    TH.expectSyncRefusal(() => minder.isStaleAt({ ...GateAsk, banklabel: 'other' }), 'bad_option')
  })
})

describe("Each minder's watch", () => {
  it("caches each gate written in the gate's minder", async () => {
    const vaultDB = new MemoryVaultDB()
    const { minder } = minderWorldOf(vaultDB)
    const gate = await storedGateOf(vaultDB, 0)
    await TH.eventually(() => revtokAt(minder) === gate.revtok)
    expect(minder.at(GateAsk)).to.deep.equal(gate)
  })

  it("caches the Thing of its own kind that a notice carries, and drops the rest, the world beside it among them", () => {
    const { minder, boxMinder, bankMinder, receive } = minderWorldOf(new MemoryVaultDB())
    const [bank, gate, box] = [TH.bankThingOf(), TH.gateThingOf(), TH.boxThingOf()]
    receive(noticeOf(box, { ...bank, maingate: gate }))
    expect(bankMinder.at(BankAsk)).to.be.undefined
    expect(minder.at(GateAsk)).to.be.undefined
    expect(boxMinder.at(BoxAsk)).to.deep.equal(box)
  })

  it("skips a Thing while its minder is not minding", () => {
    const { tsq, boxMinder, receive } = minderWorldOf(new MemoryVaultDB())
    boxMinder.goodbye()
    receive(noticeOf(TH.boxThingOf()))
    expect(tsq.getQueryCache().findAll({ queryKey: boxMinder.keyPrefix })).to.have.lengthOf(0)
  })

  it("tells its trouble to the bank's onBadNews", () => {
    const vaultDB  = new MemoryVaultDB()
    const watching = vi.spyOn(vaultDB, 'watch')
    const { bank } = minderWorldOf(vaultDB)
    watching.mock.calls[0]?.[2](new Errors.VaultError('damaged_row', 'a row failed its checks'))
    expect(badnewsOf(bank)).to.deep.equal(['damaged_row'])
  })

  it("puts a record of a later life after one of a higher revseq", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const oldLife = TH.gateThingOf({ lifeseq: '0000000000', lifepath: '0000000000', revtok: 'old-life', revseq: 3 })
    const newLife = TH.gateThingOf({ lifeseq: '0000000002', lifepath: '0000000002', revtok: 'new-life', revseq: 0 })
    receive(noticeOf(oldLife))
    receive(noticeOf(newLife))
    expect(revtokAt(minder)).to.eq('new-life')
    receive(noticeOf(oldLife))
    expect(revtokAt(minder)).to.eq('new-life')
  })

  it("puts any record after the shell", async () => {
    const { boxMinder, receive } = minderWorldOf(await bornOf(new MemoryVaultDB()))
    await boxMinder.get(BoxAsk)
    const box = TH.boxThingOf()
    receive(noticeOf(box))
    expect(boxMinder.at(BoxAsk)).to.deep.equal(box)
  })

  it("keeps the unchanged parts of a newer record as they were", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const gate0 = TH.gateThingOf()
    receive(noticeOf(gate0))
    const held0 = minder.at(GateAsk) as GateThing
    const gate1 = structuredClone(TH.nextGateOf(gate0))
    receive(noticeOf(gate1))
    const held1 = minder.at(GateAsk)
    expect(held1).to.have.property('revseq', 1)
    expect(held1).to.have.property('wayins').that.eq(held0.wayins)
  })
})

describe("ThingMinder keys", () => {
  it("hold each label as a segment of its own, then '.' for the Thing itself, so that the root box's key starts no box's", () => {
    const { minder, boxMinder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    expect(minder.queryKey(TH.GateScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'gate', '.'])
    expect(boxMinder.queryKey(TH.RootScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', '.'])
    expect(boxMinder.queryKey(TH.BoxScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', 'openai', '.'])
    expect(boxMinder.keyPrefix).to.deep.equal(['safebyok', 'u1', 'acme', 'box'])
  })
})
