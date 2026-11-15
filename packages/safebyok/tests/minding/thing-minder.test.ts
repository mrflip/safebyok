import * as TSQ from '@tanstack/query-core'
import { Errors } from 'safebyok-big/internals'
import { describe, expect, it, vi } from 'vitest'
import { DefaultQueryCacheOpts, type MinderBank } from '../../src/minding/shapes-minder'
import { type DeliverableThing, type TSQAnswer, ThingMinder, VoidSentinel } from '../../src/minding/thing-minder'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { GateThing, GetThingAsk } from '../../src/storage/shapes-thing'
import type { GetThingAnswer, ThingNotice } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** The ask that gets the main gate, as a minder takes it. */
const GateAsk: GetThingAsk & { ifAbsent: 'nil' } = { op: 'get', modelkind: 'gate', ...TH.GateScope, ifAbsent: 'nil' }

/** A bank as a minder reads it, enabled until the test says otherwise. */
type FakeBank = Omit<MinderBank, 'isEnabled'> & { isEnabled: boolean }

/** A bank of {@link TH.ThingBank}, enabled, under the default cache options. */
function fakeBankOf(): FakeBank {
  const bank: FakeBank = {
    modelkind: 'bank', userid: TH.ThingBank.userid, banklabel: TH.ThingBank.banklabel, queryCacheOpts: DefaultQueryCacheOpts, isEnabled: true,
    demandEnabled() {
      if (! bank.isEnabled) { throw new Errors.VaultError('disabled', 'the bank is disabled') }
      return bank as never
    },
  }
  return bank
}

/** A vaultDB whose gets read the store at once, and answer only when the test calls `release`. */
class LateVaultDB extends MemoryVaultDB {
  readonly #releases: (() => void)[] = []

  /** True while a get has read the store and waits to answer. */
  get isHolding(): boolean { return this.#releases.length > 0 }

  override async tryGetThing(ask: GetThingAsk): Promise<GetThingAnswer> {
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

/** A minder of gates, what it stands on, and a way to hand it a notice as its watch would. */
interface MinderWorld<VaultDBT extends MemoryVaultDB> {
  vaultDB: VaultDBT
  tsq:     TSQ.QueryClient
  bank:    FakeBank
  minder:  ThingMinder
  receive: (notice: ThingNotice) => void
}

/** A minder of gates over `vaultDB`, made, and started unless `isStarted` is false. */
function minderWorldOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT, { isStarted = true } = {}): MinderWorld<VaultDBT> {
  const tsq      = new TSQ.QueryClient()
  const bank     = fakeBankOf()
  const watching = vi.spyOn(vaultDB as MemoryVaultDB, 'watch')
  const minder   = ThingMinder.make({ modelkind: 'gate' }, { bank, vaultDB, tsq, onBadNews: vi.fn() })
  if (isStarted) { minder.hello() }
  function receive(notice: ThingNotice): void {
    const watched = watching.mock.calls.at(-1)
    if (! watched) { throw new Error('the minder is not watching') }
    watched[1](notice)
  }
  return { vaultDB, tsq, bank, minder, receive }
}

/** A vaultDB holding the main gate at revision `revseq`, and the gate it holds. */
async function storedGateOf(vaultDB: MemoryVaultDB, revseq: number): Promise<GateThing> {
  let gate = TH.gateThingOf()
  await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(gate)))
  for (let ii = 0; ii < revseq; ii++) {
    const next = TH.nextGateOf(gate)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate, next)))
    gate = next
  }
  return gate
}

/** A watch notice of `gate`, as the vaultDB sends one. */
function noticeOf(gate: GateThing): ThingNotice { return { act: (gate.am === 'a') ? 'gotlive' : 'gotgone', val: gate, world: null } }

/** The revtok of what the minder holds for the main gate, or undefined for nothing or the Void Sentinel. */
function revtokAt(minder: ThingMinder): string | undefined {
  const record: DeliverableThing | undefined = minder.at(GateAsk)
  return ((record === undefined) || (record.revseq === VoidSentinel.revseq)) ? undefined : record.revtok
}

/** The act of `answer`, a tryAt's answer. */
function actOf(answer: TSQAnswer): string { return answer.act }

describe("ThingMinder.make", () => {
  const tsq     = new TSQ.QueryClient()
  const vaultDB = new MemoryVaultDB()
  const MakeCases = [
    [{ modelkind: 'vault' }, {},                                                    'refuses a modelkind that is no kind of Thing'],
    [{},                     { bank: { ...TH.ThingBank } },                         'refuses a bank that is no Bank'],
    [{},                     { vaultDB: { tryGetThing: () => 1, watch: () => 1 } }, 'refuses a vaultDB without the brand'],
    [{},                     { tsq: { query: 1 } },                                 'refuses a QueryClient without its methods'],
    [{},                     { onBadNews: undefined },                              'refuses a missing onBadNews'],
  ] as const
  for (const [pinsOver, optsOver, blurb] of MakeCases) {
    it(blurb, () => {
      // @ts-expect-error -- sloppy input is the point
      TH.expectSyncRefusal(() => ThingMinder.make({ modelkind: 'gate', ...pinsOver }, { bank: fakeBankOf(), vaultDB, tsq, onBadNews: vi.fn(), ...optsOver }), 'bad_option')
    })
  }

  it("takes its scope from the bank", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    expect(minder.scope).to.deep.equal(TH.ThingBank)
    expect(minder.pins).to.deep.equal({ ...TH.ThingBank, modelkind: 'gate' })
  })
})

describe("ThingMinder.hello", () => {
  it("sets the bank's cache options as the defaults of the minder's entries", () => {
    const { tsq, minder } = minderWorldOf(new MemoryVaultDB())
    expect(tsq.getQueryDefaults(minder.queryKey(TH.GateScope))).to.include(DefaultQueryCacheOpts)
  })

  it("watches the bank, and hands the watch its onBadNews", () => {
    const vaultDB   = new MemoryVaultDB()
    const watching  = vi.spyOn(vaultDB, 'watch')
    const onBadNews = vi.fn()
    const minder    = ThingMinder.make({ modelkind: 'gate' }, { bank: fakeBankOf(), vaultDB, tsq: new TSQ.QueryClient(), onBadNews })
    minder.hello()
    expect(watching.mock.calls).to.have.lengthOf(1)
    expect(watching.mock.calls[0]?.[0]).to.deep.equal(TH.ThingBank)
    expect(watching.mock.calls[0]?.[2]).to.eq(onBadNews)
  })

  it("refuses disabled where the bank is disabled", () => {
    const { bank, minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    bank.isEnabled = false
    TH.expectSyncRefusal(() => { minder.hello() }, 'disabled')
  })

  it("comes before any read: until then, each refuses disabled", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    await TH.expectBad(minder.tryAt(GateAsk), 'disabled')
    await TH.expectRefusal(minder.get(GateAsk), 'disabled')
  })
})

describe("ThingMinder.goodbye", () => {
  it("removes the minder's entries, stops watching, and refuses later reads", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate0   = await storedGateOf(vaultDB, 0)
    const { tsq, minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    minder.goodbye()
    const entries = tsq.getQueryCache().findAll({ queryKey: minder.keyPrefix })
    expect(entries).to.have.lengthOf(0)
    const gate1 = TH.nextGateOf(gate0)
    await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate0, gate1)))
    await TH.wakeupAtNextTick()
    expect(minder.at(GateAsk)).to.be.undefined
    await TH.expectBad(minder.tryAt(GateAsk), 'disabled')
    await TH.expectRefusal(minder.get(GateAsk), 'disabled')
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
    expect(minder.isStaleAt(GateAsk, 0)).to.be.true
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
    const { minder } = minderWorldOf(new MemoryVaultDB())
    await minder.get(GateAsk)
    expect(minder.tryAt(GateAsk)).to.deep.include({ ok: true, act: 'gotvoid', val: null, isTimely: true })
  })

  it("answers gotgone with a tombstone", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const tombstone = TH.gateThingOf({ am: 'x', revtok: 'rev-1', revseq: 1 })
    receive(noticeOf(tombstone))
    expect(minder.tryAt(GateAsk)).to.deep.include({ ok: true, act: 'gotgone', val: tombstone })
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

  const RefusedAsks = [
    [{ ...GateAsk, userid: 'u2' },            {},                       'refuses bad_option for an ask of another bank'],
    [{ ...GateAsk, ifAbsent: 'fail' },        {},                       "refuses bad_option for an ask that is not ifAbsent: 'nil'"],
    [{ ...GateAsk, labelpath: 'box/openai' }, {},                       'refuses bad_option for a labelpath of another kind'],
    [GateAsk,                                 { staleTime: undefined }, 'refuses bad_option for a staleTime given as undefined'],
    [GateAsk,                                 { ifStale: 'keep' },      'refuses bad_option for an ifStale it does not know'],
  ] as const
  for (const [ask, opts, blurb] of RefusedAsks) {
    it(blurb, async () => {
      const { minder } = minderWorldOf(new MemoryVaultDB())
      // @ts-expect-error -- sloppy input is the point
      await TH.expectBad(minder.tryAt(ask, opts), 'bad_option')
    })
  }

  it("refuses disabled once the bank is disabled", async () => {
    const { bank, minder } = minderWorldOf(new MemoryVaultDB())
    bank.isEnabled = false
    await TH.expectBad(minder.tryAt(GateAsk), 'disabled')
  })
})

describe("ThingMinder.get", () => {
  it("returns the record stored, and reads the cache after", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate    = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    expect(await minder.get(GateAsk)).to.deep.equal(gate)
    expect(await minder.get(GateAsk)).to.deep.equal(gate)
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("returns the Void Sentinel where nothing is stored", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    expect(await minder.get(GateAsk)).to.deep.equal(VoidSentinel)
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
    const vaultDB = new LateVaultDB()
    const { minder } = minderWorldOf(vaultDB)
    const getting = minder.get(GateAsk)
    await TH.eventually(() => vaultDB.isHolding)
    const gate = await storedGateOf(vaultDB, 0)
    await TH.eventually(() => revtokAt(minder) === gate.revtok)
    vaultDB.release()
    expect(await getting).to.deep.equal(gate)
  })

  it("keeps the later record where storage goes back behind it", async () => {
    const vaultDB = new MemoryVaultDB()
    const gate1   = await storedGateOf(vaultDB, 1)
    const { minder } = minderWorldOf(vaultDB)
    await minder.get(GateAsk)
    vaultDB._cheat_things(TH.ThingBank).set(TH.GateScope.labelpath, TH.gateThingOf())
    expect(await minder.get(GateAsk, { staleTime: 0 })).to.deep.equal(gate1)
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
    const vaultDB = new DownVaultDB()
    const { minder } = minderWorldOf(vaultDB)
    const asked = vi.spyOn(vaultDB, 'tryGetThing')
    await TH.expectRefusal(minder.get(GateAsk), 'storage_unavailable')
    expect(asked.mock.calls).to.have.lengthOf(1)
  })

  it("refuses bad_option for an ask of another bank, or a staleTime given as undefined", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    await TH.expectRefusal(minder.get({ ...GateAsk, userid: 'u2' }), 'bad_option')
    // @ts-expect-error -- an explicit undefined is the point
    await TH.expectRefusal(minder.get(GateAsk, { staleTime: undefined }), 'bad_option')
  })
})

describe("ThingMinder.isStaleAt", () => {
  it("is true before any get, false after, and true past staleTime", async () => {
    const { minder } = minderWorldOf(new MemoryVaultDB())
    expect(minder.isStaleAt(GateAsk)).to.be.true
    await minder.get(GateAsk)
    expect(minder.isStaleAt(GateAsk)).to.be.false
    expect(minder.isStaleAt(GateAsk, 0)).to.be.true
  })
})

describe("ThingMinder's watch", () => {
  it("hands the cache each record written", async () => {
    const vaultDB = new MemoryVaultDB()
    const { minder } = minderWorldOf(vaultDB)
    const gate = await storedGateOf(vaultDB, 0)
    await TH.eventually(() => revtokAt(minder) === gate.revtok)
    expect(minder.at(GateAsk)).to.deep.equal(gate)
  })

  it("ignores a notice of another kind of Thing", () => {
    const { tsq, receive } = minderWorldOf(new MemoryVaultDB())
    receive(noticeOf(TH.gateThingOf({ labelpath: 'box/openai' })))
    expect(tsq.getQueryCache().getAll()).to.have.lengthOf(0)
  })

  it("puts a record of a later life after one of a higher revseq", () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    const oldLife = TH.gateThingOf({ lifeseq: '0000000000', lifepath: '0000000000', revtok: 'old-life', revseq: 3 })
    const newLife = TH.gateThingOf({ lifeseq: '0000000001', lifepath: '0000000001', revtok: 'new-life', revseq: 0 })
    receive(noticeOf(oldLife))
    receive(noticeOf(newLife))
    expect(revtokAt(minder)).to.eq('new-life')
    receive(noticeOf(oldLife))
    expect(revtokAt(minder)).to.eq('new-life')
  })

  it("puts any record after the Void Sentinel", async () => {
    const { minder, receive } = minderWorldOf(new MemoryVaultDB())
    await minder.get(GateAsk)
    const gate = TH.gateThingOf()
    receive(noticeOf(gate))
    expect(minder.at(GateAsk)).to.deep.equal(gate)
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
  it("hold each label of a labelpath as a segment of its own", () => {
    const { minder } = minderWorldOf(new MemoryVaultDB(), { isStarted: false })
    expect(minder.queryKey(TH.GateScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'gate', 'get', 'gate'])
    const boxMinder = ThingMinder.make({ modelkind: 'box' }, { bank: fakeBankOf(), vaultDB: new MemoryVaultDB(), tsq: new TSQ.QueryClient(), onBadNews: vi.fn() })
    expect(boxMinder.queryKey(TH.BoxScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', 'get', 'box', 'openai'])
    expect(boxMinder.listingKey(TH.RootScope)).to.deep.equal(['safebyok', 'u1', 'acme', 'box', 'list', 'box'])
  })
})
