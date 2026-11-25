import { describe, expect, it } from 'vitest'
import { type EX, Errors, SX } from 'safebyok-big/internals'
import { AnswerNotMade } from '../../src/phrases'
import { AdapterVaultDB } from '../../src/storage/adapter-vault-db'
import type { Actual, BirthBankActual, GetWorldActual, GotActual, ListThingsActual, Received } from '../../src/shapes/shapes-answers'
import type { BirthBankAsk, GetAsk, GetWorldAsk, ListAsk, ThingWatchScope, WriteAsk } from '../../src/shapes/shapes-asks'
import { Thing } from '../../src/models/thing'
import { Shell } from '../../src/shapes/shapes-thing'
import type { VaultEvent, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import * as Throwers from '../../src/refusals/throwers'
import { readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** A concrete adapter whose every step does what the test hands it: throws, or reports what it is given, with each root `'same'` in `tracked` and a `read_tc` made now unless it gives them. */
class ScriptedVaultDB extends AdapterVaultDB {
  receive: ((received: Received) => void) | null = null
  readonly step: () => object

  constructor(step: () => object) {
    super()
    this.step = step
  }

  /** What the step reports, with each root `'same'` in `tracked` and a `read_tc` made now unless it gives them. */
  #report(): unknown { return { tracked: { bank: 'same', gate: 'same', box: 'same' }, read_tc: readTcNow(), ...this.step() } }

  protected doGetThing(_ask: GetAsk): GotActual { return this.#report() as GotActual }
  protected doWriteThing(_ask: WriteAsk): Actual<EX.PutAct | EX.DelAct> { return this.#report() as Actual<EX.PutAct | EX.DelAct> }
  protected doListThings(_ask: ListAsk): ListThingsActual { return this.#report() as ListThingsActual }
  protected doBirthBank(_ask: BirthBankAsk): BirthBankActual { return this.#report() as BirthBankActual }
  protected doGetWorld(_ask: GetWorldAsk): GetWorldActual { return this.#report() as GetWorldActual }
  protected override doWatch(_scope: ThingWatchScope, receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void): () => void {
    this.receive = receive
    return () => { this.receive = null }
  }
}

/** The records of the notices a watcher of the test bank gets over `vaultDB`. */
function noticedRecordsOver(vaultDB: ScriptedVaultDB): VaultItemEvent['val'][] {
  const noticedRecords: VaultItemEvent['val'][] = []
  vaultDB.watch(TH.ThingBank, (event) => { if (event.eventkind === 'item') { noticedRecords.push(event.val) } }, () => undefined)
  return noticedRecords
}

/** A value that throws on any look at it: what a broken backend might throw, or a broken host might ask. */
const Booby = new Proxy({}, { get() { throw new Error('boom') }, getPrototypeOf() { throw new Error('boom') }, has() { throw new Error('boom') } })

/** A watcher whose handler throws on its first notice, after two Things were received; the notices it got and the bad news onBadNews got. */
function watchWithThrowingHandler() {
  const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
  const notices: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  vaultDB.watch(TH.ThingBank, (event) => { notices.push(event); if (notices.length === 1) { throw new Error('host bug') } }, (news) => { badNews.push(news) })
  vaultDB.receive?.({ record: TH.boxThingOf(), world: null })
  vaultDB.receive?.({ record: TH.gateThingOf(), world: null })
  return { notices, badNews }
}

describe("AdapterVaultDB, a step that throws", () => {
  it("answers storage_unavailable for a backend's own error, with the verb and the loggable ask", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ act: 'unclassified_storing', world: null, banktok: SX.VoidLifeTok, tracked: 'unread', dbhas: null })
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

  it("answers a listing that throws with no children, no parentage, no deltas, no damaged rows, and a read_tc of when it was refused", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryListThings(TH.listAskAt('box'))
    await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', dbhas: null, parentage: [], deltas: [], damaged_rows: [] })
    expect(answer.read_tc).to.match(TH.ReadTcPattern)
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
  it("refuses a good get that reports no record, gotvoid's void sentinel included, as a broken store", async () => {
    for (const act of ['gotlive', 'gotgone', 'gotvoid'] as const) {
      const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act, world: null, record: null }))
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("answers gotvoid with the void sentinel a concrete adapter reports as its dbhas", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: Shell.of(TH.GateScope) }))
    expect(await vaultDB.tryGetThing(TH.getGateAskOf())).to.deep.include({ ok: true, act: 'gotvoid', val: null, dbhas: Shell.of(TH.GateScope) })
  })
})

describe("AdapterVaultDB.tryWriteThing(ask), a store that reports oddly", () => {
  it("refuses a good write that reports no Thing as a broken store", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'born', world: null, record: null }))
    await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
  })
})

describe("AdapterVaultDB, the read_tc of an answer", () => {
  it("answers the read_tc a concrete adapter reports, good or refused, from a get, a write or a birth", async () => {
    const read_tc = readTcNow()
    const reports = [{ ok: true, act: 'gotvoid', world: null, read_tc, record: Shell.of(TH.GateScope) }, { ok: false, act: 'stale', world: null, read_tc, record: TH.gateThingOf() }] as const
    for (const report of reports) {
      const vaultDB = new ScriptedVaultDB(() => report)
      expect(await vaultDB.tryGetThing(TH.getGateAskOf())).to.deep.include({ read_tc })
    }
    const refusing = new ScriptedVaultDB(() => reports[1])
    expect(await refusing.tryWriteThing(TH.birthAskOf())).to.deep.include({ read_tc })
    expect(await refusing.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ read_tc })
  })

  it("refuses, as a broken store, a report from a get, a write, a list or a birth with no read_tc, or one that is no UUID version 7", async () => {
    for (const read_tc of [undefined, crypto.randomUUID(), readTcNow().toUpperCase(), 7]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, read_tc, record: Shell.of(TH.GateScope) }))
      const listing = new ScriptedVaultDB(() => ({ ok: false, act: 'gone', world: null, read_tc, parentage: [], deltas: [], damaged_rows: [] }))
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
      await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
      await TH.expectBad(listing.tryListThings(TH.listAskAt('box')), 'storage_issue')
      await TH.expectBad(vaultDB.tryBirthBank(TH.birthBankAskOf()), 'storage_issue')
    }
  })

  it("answers a listing's read_tc as its Kids value's own", async () => {
    const read_tc = readTcNow()
    const kids    = { modelkind: 'kids', parentpath: 'box', parentlife: TH.rootBoxOf().lifepath, items: {}, gones: {} }
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotlive', world: null, read_tc, kids, parentage: [], deltas: [], damaged_rows: [] }))
    expect(await vaultDB.tryListThings(TH.listAskAt('box'))).to.deep.include({ read_tc, val: { ...kids, read_tc } })
  })

  it("refuses, as a broken store, a report whose world is neither null nor an object, or whose tracked is no object", async () => {
    for (const report of [{ world: 'a world' }, { tracked: undefined }, { tracked: null }, { tracked: 'same' }]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: Shell.of(TH.GateScope), ...report }))
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })
})

describe("AdapterVaultDB, the banktok of an answer", () => {
  it("answers the lifetok of the bank in the world a concrete adapter reports, good or refused, from a get, a write, a list or a birth", async () => {
    const world   = { ...TH.bankThingOf(), lifetok: TH.OtherLifetok, maingate: TH.gateThingOf() }
    const refused = { ok: false, act: 'stale', world, record: TH.gateThingOf() } as const
    const vaultDB = new ScriptedVaultDB(() => refused)
    const listing = new ScriptedVaultDB(() => ({ ...refused, parentage: [], deltas: [], damaged_rows: [] }))
    const good    = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world, record: Shell.of(TH.GateScope) }))
    const answers = [
      await vaultDB.tryGetThing(TH.getGateAskOf()), await vaultDB.tryWriteThing(TH.birthAskOf()), await listing.tryListThings(TH.listAskAt('box')),
      await vaultDB.tryBirthBank(TH.birthBankAskOf()), await good.tryGetThing(TH.getGateAskOf()),
    ]
    expect(answers.map((answer) => answer.banktok)).to.deep.equal(Array.from({ length: 5 }, () => TH.OtherLifetok))
  })

  it("answers the void lifetok as its banktok where a concrete adapter reports no world, and where the verb throws", async () => {
    const worldless = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: Shell.of(TH.GateScope) }))
    const throwing  = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answers   = [
      await worldless.tryGetThing(TH.getGateAskOf()), await throwing.tryGetThing(TH.getGateAskOf()), await throwing.tryListThings(TH.listAskAt('box')),
      await throwing.tryBirthBank(TH.birthBankAskOf()),
    ]
    expect(answers.map((answer) => answer.banktok)).to.deep.equal([SX.VoidLifeTok, SX.VoidLifeTok, SX.VoidLifeTok, SX.VoidLifeTok])
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
    expect(TH.maskedReadTcsOf(events)).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row', 'storage_issue'])
  })

  it("notifies of a change as one notice of its Thing, and of nothing in the world beside it, sound or not", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: TH.boxThingOf(), world: { ...TH.bankThingOf(), maingate: TH.gateThingOf() } })
    vaultDB.receive?.({ record: TH.boxThingOf('anthropic'), world: { ...TH.bankThingOf(), maingate: TH.gateThingOf({ wayins: {} as never }) } })
    expect(TH.maskedReadTcsOf(events)).to.deep.equal([TH.boxThingOf(), TH.boxThingOf('anthropic')].map((box) => TH.itemEventOf(box, TH.bankThingOf().lifetok)))
    const read_tcs = events.map((event) => event.read_tc)
    expect(read_tcs.toSorted((one, two) => one.localeCompare(two)), 'a later notice is read later').to.deep.equal(read_tcs)
    expect(badNews).to.deep.equal([])
  })

  it("notifies with the bank's lifetok where the bank is the Thing itself or beside it, and the void lifetok where neither is", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const events: VaultEvent[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, () => undefined)
    const otherLifetok = crypto.randomUUID()
    vaultDB.receive?.({ record: TH.bankThingOf({ lifetok: otherLifetok }), world: null })
    vaultDB.receive?.({ record: TH.boxThingOf(), world: { ...TH.bankThingOf(), maingate: TH.gateThingOf() } })
    vaultDB.receive?.({ record: TH.boxThingOf(), world: null })
    expect(events.map((event) => event.banktok)).to.deep.equal([otherLifetok, TH.bankThingOf().lifetok, SX.VoidLifeTok])
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
    const { notices } = watchWithThrowingHandler()
    expect(notices.map(({ labelpath }) => labelpath)).to.deep.equal(['box/openai', 'gate'])
  })

  it("refuses a watch with no onBadNews", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    TH.expectSyncRefusal(() => vaultDB.watch(TH.ThingBank, () => undefined, undefined as never), 'bad_record')
  })
})

describe("AdapterVaultDB, what a watcher is notified of from a verb's answer", () => {
  it("notifies of nothing an answer carries: a refusal's dbhas, a thrown refusal's, a good write's val, or a listing's parentage and deltas", async () => {
    const parentage = [Thing.sparseOf(TH.rootBoxOf())]
    const deltas    = [Thing.sparseOf(TH.boxThingOf('anthropic')), Thing.sparseOf(TH.boxThingOf('openai'))]
    const kids      = { modelkind: 'kids', parentpath: 'box', parentlife: TH.rootBoxOf().lifepath, items: {}, gones: {} }
    const steps: (() => unknown)[] = [
      () => ({ ok: false, act: 'stale', world: null, record: TH.gateThingOf() }),
      () => ({ ok: true, act: 'born', world: null, record: TH.gateThingOf() }),
      () => { throw Throwers.gateIssue(TH.gateThingOf(), 'a test') },
    ]
    for (const step of steps) {
      const vaultDB = new ScriptedVaultDB(step as () => object)
      const noticedRecords = noticedRecordsOver(vaultDB)
      await vaultDB.tryGetThing(TH.getGateAskOf())
      await vaultDB.tryWriteThing(TH.birthAskOf())
      await vaultDB.tryBirthBank(TH.birthBankAskOf())
      await TH.aWhile()
      expect(noticedRecords).to.deep.equal([])
    }
    const listings = [{ ok: true, act: 'gotlive', world: null, kids, parentage, deltas, damaged_rows: [] }, { ok: false, act: 'gone', world: null, parentage, deltas: [], damaged_rows: [] }]
    for (const listed of listings) {
      const vaultDB = new ScriptedVaultDB(() => listed)
      const noticedRecords = noticedRecordsOver(vaultDB)
      await vaultDB.tryListThings(TH.listAskAt('box'))
      await TH.aWhile()
      expect(noticedRecords).to.deep.equal([])
    }
  })
})
