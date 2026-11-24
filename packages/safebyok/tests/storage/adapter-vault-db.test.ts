import { describe, expect, it } from 'vitest'
import { type EX, Errors } from 'safebyok-big/internals'
import { AnswerNotMade } from '../../src/phrases'
import { AdapterVaultDB, type Received } from '../../src/storage/adapter-vault-db'
import type { BirthBankAsk, GetAsk, ListAsk, ThingWatchScope, WriteAsk } from '../../src/shapes/shapes-asks'
import { Thing } from '../../src/models/thing'
import type { Actual, BirthBankActual, ListThingsActual } from '../../src/storage/vault-db'
import type { VaultEvent, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import * as Throwers from '../../src/refusals/throwers'
import * as TH from '../test-helpers'

/** A concrete adapter whose every step does what the test hands it: throws, or reports what it is given. */
class ScriptedVaultDB extends AdapterVaultDB {
  receive: ((received: Received) => void) | null = null
  readonly step: () => Actual<EX.GoodAct>

  constructor(step: () => Actual<EX.GoodAct>) {
    super()
    this.step = step
  }

  protected doGetThing(_ask: GetAsk): Actual<EX.GotAct> { return this.step() as Actual<EX.GotAct> }
  protected doWriteThing(_ask: WriteAsk): Actual<EX.PutAct | EX.DelAct> { return this.step() as Actual<EX.PutAct | EX.DelAct> }
  protected doListThings(_ask: ListAsk): ListThingsActual { return this.step() as unknown as ListThingsActual }
  protected doBirthBank(_ask: BirthBankAsk): BirthBankActual { return this.step() as unknown as BirthBankActual }
  protected override doWatch(_scope: ThingWatchScope, receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void): () => void {
    this.receive = receive
    return () => { this.receive = null }
  }
}

/** The records of the notices a watcher of the test bank gets over `vaultDB`. */
function heardOver(vaultDB: ScriptedVaultDB): VaultItemEvent['record'][] {
  const heard: VaultItemEvent['record'][] = []
  vaultDB.watch(TH.ThingBank, (event) => { if (event.eventkind === 'item') { heard.push(event.record) } }, () => undefined)
  return heard
}

/** A value that throws on any look at it: what a broken backend might throw, or a broken host might ask. */
const Booby = new Proxy({}, { get() { throw new Error('boom') }, getPrototypeOf() { throw new Error('boom') }, has() { throw new Error('boom') } })

/** A watcher whose handler throws on its first notice, after two Things were received; the notices it got and the bad news onBadNews got. */
function watchWithThrowingHandler() {
  const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
  const heard: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  vaultDB.watch(TH.ThingBank, (event) => { heard.push(event); if (heard.length === 1) { throw new Error('host bug') } }, (news) => { badNews.push(news) })
  vaultDB.receive?.({ record: TH.boxThingOf(), world: null })
  vaultDB.receive?.({ record: TH.gateThingOf(), world: null })
  return { heard, badNews }
}

describe("AdapterVaultDB, a step that throws", () => {
  it("answers storage_unavailable for a backend's own error, with the verb and the loggable ask", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ act: 'unclassified_storing', world: null, dbhas: null })
    expect(err.meta).to.deep.include({ oplabel: 'writeThing' })
    expect(answer.ask).to.deep.include(TH.GateScope)
  })

  it("answers a refusal unchanged", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Errors.VaultError('identity_revoked', 'The backend no longer serves this user.') })
    await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'identity_revoked')
  })

  it("never throws, even for a failure it cannot look at", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw Booby }) // eslint-disable-line @typescript-eslint/only-throw-error
    const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'unexpected_error')
    expect(err.message).to.eq(AnswerNotMade)
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' })
  })

  it("answers a listing that throws with no children, no parentage, no deltas, no damaged rows and no read_tc", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryListThings(TH.listAskAt('box'))
    await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', dbhas: null, parentage: [], deltas: [], damaged_rows: [] })
    expect(answer).not.to.have.property('read_tc')
  })

  it("answers a bank's birth that throws with its verb", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(err.meta).to.deep.include({ oplabel: 'birthBank' })
    expect(answer).to.deep.include({ act: 'unclassified_storing', dbhas: null })
    expect(answer.ask).to.deep.include({ op: 'birth', ...TH.ThingBank })
  })

  it("never throws for an ask it cannot look at", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const answer = await vaultDB.tryWriteThing(Booby as never)
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', ask: {} })
    expect(answer.ok ? null : answer.err.message).to.eq(AnswerNotMade)
  })
})

describe("AdapterVaultDB.tryGetThing(ask), a store that reports oddly", () => {
  it("refuses a good get that reports no Thing, other than gotvoid, as a broken store", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotlive', world: null, record: null }))
    await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
  })
})

describe("AdapterVaultDB.tryWriteThing(ask), a store that reports oddly", () => {
  it("refuses a good write that reports no Thing as a broken store", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'born', world: null, record: null }))
    await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
  })
})

describe("AdapterVaultDB.watch(scope, onNotice, onBadNews)", () => {
  it("notifies of a sound Thing, and sends one that fails its checks to onBadNews", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: { ...TH.gateThingOf(), wayins: {} }, world: null })
    vaultDB.receive?.({ record: 'not a Thing', world: null })
    vaultDB.receive?.({ record: TH.gateThingOf(), world: null })
    expect(events).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row', 'storage_issue'])
  })

  it("notifies of a change as one notice of its Thing, and of nothing in the world beside it, sound or not", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: TH.boxThingOf(), world: { ...TH.bankThingOf(), maingate: TH.gateThingOf() } })
    vaultDB.receive?.({ record: TH.boxThingOf('anthropic'), world: { ...TH.bankThingOf(), maingate: TH.gateThingOf({ wayins: {} as never }) } })
    expect(events).to.deep.equal([TH.boxThingOf(), TH.boxThingOf('anthropic')].map((box) => TH.itemEventOf(box)))
    expect(badNews).to.deep.equal([])
  })

  it("sends a Thing of another bank to onBadNews, not to onNotice", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: TH.gateThingOf({ banklabel: 'other' }), world: null })
    expect(events).to.deep.equal([])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['storage_issue'])
  })

  it("sends onBadNews the error a notice handler throws", () => {
    const { badNews } = watchWithThrowingHandler()
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['unexpected_error'])
  })

  it("keeps notifying the handler of later Things after it throws", () => {
    const { heard } = watchWithThrowingHandler()
    expect(heard.map(({ labelpath }) => labelpath)).to.deep.equal(['box/openai', 'gate'])
  })

  it("refuses a watch with no onBadNews", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    TH.expectSyncRefusal(() => vaultDB.watch(TH.ThingBank, () => undefined, undefined as never), 'bad_record')
  })
})

describe("AdapterVaultDB, what a watcher is notified of from a verb's answer", () => {
  it("notifies of a refused get's, write's or birth's dbhas once, before the verb answers", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: false, act: 'stale', world: null, record: TH.gateThingOf() }))
    const heard = heardOver(vaultDB)
    await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(heard).to.deep.equal([TH.gateThingOf()])
    await vaultDB.tryWriteThing(TH.birthAskOf())
    expect(heard).to.have.lengthOf(2)
    await vaultDB.tryBirthBank(TH.birthBankAskOf())
    expect(heard).to.deep.equal([TH.gateThingOf(), TH.gateThingOf(), TH.gateThingOf()])
  })

  it("notifies every watcher of the bank of a dbhas, each with a copy of its own, or sends each one's onBadNews a dbhas that fails its checks", async () => {
    const dbhases: unknown[] = [TH.gateThingOf(), { ...TH.gateThingOf(), revseq: 'nine' }]
    const vaultDB = new ScriptedVaultDB(() => ({ ok: false, act: 'stale', world: null, record: dbhases.shift() }) as never)
    const watches = [1, 2].map(() => {
      const watch = { events: [] as VaultEvent[], badNews: [] as Errors.VaultError[] }
      vaultDB.watch(TH.ThingBank, (event) => { watch.events.push(event) }, (news) => { watch.badNews.push(news) })
      return watch
    })
    const elsewhere: unknown[] = []
    vaultDB.watch({ ...TH.ThingBank, banklabel: 'other' }, (event) => { elsewhere.push(event) }, (news) => { elsewhere.push(news) })
    await vaultDB.tryGetThing(TH.getGateAskOf())
    await vaultDB.tryGetThing(TH.getGateAskOf())
    for (const { events, badNews } of watches) {
      expect(events).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
      expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row'])
    }
    expect((watches[0]!.events[0] as VaultItemEvent).record).not.to.equal((watches[1]!.events[0] as VaultItemEvent).record)
    expect(elsewhere).to.deep.equal([])
  })

  it("notifies of the dbhas a thrown refusal carries once, from a get, a write or a birth", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw Throwers.gateIssue(TH.gateThingOf(), 'a test') })
    const heard = heardOver(vaultDB)
    await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'gate_issue')
    await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'gate_issue')
    await TH.expectBad(vaultDB.tryBirthBank(TH.birthBankAskOf()), 'gate_issue')
    expect(heard).to.deep.equal([TH.gateThingOf(), TH.gateThingOf(), TH.gateThingOf()])
  })

  it("notifies of nothing for a good write's val, a null dbhas, or a throw that carries none, and only of the parentage of a refused listing", async () => {
    const steps: (() => Actual<EX.GoodAct>)[] = [
      () => ({ ok: true, act: 'born', world: null, record: TH.gateThingOf() }),
      () => ({ ok: false, act: 'stale', world: null, record: null }),
      () => { throw new Error('connection reset') },
    ]
    for (const step of steps) {
      const vaultDB = new ScriptedVaultDB(step)
      const heard = heardOver(vaultDB)
      await vaultDB.tryWriteThing(TH.birthAskOf())
      await TH.aWhile()
      expect(heard).to.deep.equal([])
    }
    const parentage = [Thing.sparseOf(TH.rootBoxOf())]
    const listing = new ScriptedVaultDB(() => ({ ok: false, act: 'gone', world: null, parentage, deltas: [], damaged_rows: [] }) as never)
    const heard = heardOver(listing)
    expect(await listing.tryListThings(TH.listAskAt('box'))).to.deep.include({ ok: false, dbhas: [] })
    await TH.aWhile()
    expect(heard).to.deep.equal(parentage)
  })

  it("notifies of a good listing's parentage, then its deltas in labelpath order, before the listing answers", async () => {
    const parentage = [Thing.sparseOf(TH.rootBoxOf())]
    const deltas    = [Thing.sparseOf(TH.boxThingOf('anthropic')), Thing.sparseOf(TH.boxThingOf('openai'))]
    const kids      = { modelkind: 'kids', parentpath: 'box', parentlife: TH.rootBoxOf().lifepath, items: {}, gones: {}, read_tc: '' }
    const vaultDB   = new ScriptedVaultDB(() => ({ ok: true, act: 'gotlive', world: null, kids, parentage, deltas, damaged_rows: [] }) as never)
    const heard     = heardOver(vaultDB)
    await vaultDB.tryListThings(TH.listAskAt('box'))
    expect(heard).to.deep.equal([...parentage, ...deltas])
  })
})
