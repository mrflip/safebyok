import { describe, expect, it } from 'vitest'
import { Errors, SX } from 'safebyok-big/internals'
import { AnswerNotMade } from '../../src/phrases'
import { AdapterVaultDB } from '../../src/storage/adapter-vault-db'
import type { BirthBankActual, GetWorldActual, ListThingsActual, Received, StatsActual } from '../../src/shapes/shapes-answers'
import type { GetManifest, WriteManifest } from '../../src/shapes/shapes-manifest'
import * as ManifestTags from '../../src/storage/manifest-tags'
import type { BirthBankAsk, GetAsk, GetWorldAsk, ListAsk, StatsAsk, ThingWatchScope, WriteAsk } from '../../src/shapes/shapes-asks'
import { StoreLimitCap, StoreLimitFloor, StoreLimitLeastBoxes } from '../../src/shapes/shapes-vault-stats'
import { Thing } from '../../src/models/thing'
import { Shell } from '../../src/shapes/shapes-thing'
import type { VaultEvent, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import * as Throwers from '../../src/refusals/throwers'
import { readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** A concrete adapter whose every step does what the test hands it: throws, or reports what it is given, with the void banktok, each root `'same'` in `tracked` and a `read_tc` made now unless it gives them.
 * A get and a write report what `manifestStep` gives, with no ancestor unless it gives one; the other verbs, what `step` gives.
 */
class ScriptedVaultDB extends AdapterVaultDB {
  receive: ((received: Received) => void) | null = null
  onEnded: (() => void) | null = null
  readonly step: () => object
  readonly manifestStep: () => object

  constructor(step: () => object, manifestStep: () => object = step) {
    super()
    this.step = step
    this.manifestStep = manifestStep
  }

  /** What `step` reports, with the void banktok, each root `'same'` in `tracked` and a `read_tc` made now unless it gives them. */
  #report(step: () => object): unknown { return { banktok: SX.VoidLifeTok, tracked: { bank: 'same', gate: 'same', box: 'same' }, read_tc: readTcNow(), ancestor: null, ...step() } }

  protected doGetThing(_ask: GetAsk): GetManifest { return this.#report(this.manifestStep) as GetManifest }
  protected doWriteThing(_ask: WriteAsk): WriteManifest { return this.#report(this.manifestStep) as WriteManifest }
  protected doListThings(_ask: ListAsk): ListThingsActual { return this.#report(this.step) as ListThingsActual }
  protected doBirthBank(_ask: BirthBankAsk): BirthBankActual { return this.#report(this.step) as BirthBankActual }
  protected doGetWorld(_ask: GetWorldAsk): GetWorldActual { return this.#report(this.step) as GetWorldActual }
  protected doStats(_ask: StatsAsk): StatsActual { return this.#report(this.step) as StatsActual }
  protected override doWatch(_scope: ThingWatchScope, receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void, onEnded: () => void): () => void {
    this.receive = receive
    this.onEnded = onEnded
    return () => { this.receive = null }
  }
}

/** A get's manifest whose actual row is `actual`, null for none, with its tags made from that row. */
function getManifestOf(actual: unknown): object { return { tags: ManifestTags.getTagsOf(actual), actual } }

/** A write's manifest of `ask` over the `ante` row, null for none, with its tags made from that row: the ask's record where `written`, else the ante row. */
function writeManifestOf(ask: WriteAsk, ante: unknown, written: boolean): object { return { tags: ManifestTags.writeTagsOf(ask, ante, written), actual: written ? ask.record : ante } }

/** A live gate at another revision than the one `TH.birthAskOf()` would write: a birth over it is stale. */
const OtherGate = TH.gateThingOf({ revtok: TH.OtherRevtok })

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
  const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
  const notices: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  vaultDB.watch(TH.ThingBank, (event) => { notices.push(event); if (notices.length === 1) { throw new Error('host bug') } }, (news) => { badNews.push(news) })
  vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok })
  vaultDB.receive?.({ record: TH.gateThingOf(), banktok: SX.VoidLifeTok })
  return { notices, badNews }
}

describe("AdapterVaultDB, a step that throws", () => {
  it("answers storage_unavailable for a backend's own error, with the verb and the loggable ask", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ act: 'unclassified_storing', banktok: SX.VoidLifeTok, tracked: 'unread', dbhas: null })
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
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    const answer = await vaultDB.tryWriteThing(Booby as never)
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', ask: {} })
    expect(answer.ok ? null : answer.err.message).to.eq(AnswerNotMade)
  })
})

describe("AdapterVaultDB.tryGetThing(ask), a store that reports oddly", () => {
  it("refuses, as a broken store, a get whose tags are not those of its row", async () => {
    const live = TH.gateThingOf()
    for (const manifest of [{ tags: { presence: 'live' }, actual: null }, { tags: { presence: 'void' }, actual: live }, { tags: { presence: 'gone' }, actual: live }]) {
      const vaultDB = new ScriptedVaultDB(() => manifest)
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("answers gotvoid with the shell as its dbhas where there is no row", async () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    expect(await vaultDB.tryGetThing(TH.getGateAskOf())).to.deep.include({ ok: true, act: 'gotvoid', val: null, dbhas: Shell.of(TH.GateScope) })
  })

  it("refuses, as a broken store, tags of another shape", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ tags: { presence: 'here' }, actual: null }))
    await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
  })
})

describe("AdapterVaultDB.tryWriteThing(ask), a store that reports oddly", () => {
  it("refuses, as a broken store, a write it reports making with no row", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ...writeManifestOf(TH.birthAskOf(), null, true), actual: null }))
    await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
  })

  it("answers the row the datastore reports writing, not the ask's record", async () => {
    const ask     = TH.birthAskOf()
    const written = { ...ask.record, written_at: ask.record.written_at + 1 }
    const vaultDB = new ScriptedVaultDB(() => ({ ...writeManifestOf(ask, null, true), actual: written }))
    expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'born', val: written })
  })
})

describe("AdapterVaultDB.tryStats(ask), a store that reports oddly", () => {
  const Counted = { count: 2, live_count: 1, size: 300 }
  const statsOf = (overrides: object) => ({ box: Counted, gate: Counted, max: { count: StoreLimitCap, size: StoreLimitCap }, ...overrides })

  it("answers the stats a concrete adapter reports", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'got', stats: statsOf({}) }))
    expect(await vaultDB.tryStats(TH.statsAskOf())).to.deep.include({ ok: true, act: 'got', val: statsOf({}) })
  })

  it("answers a limit of exactly two boxes and the floor in bytes", async () => {
    const stats = statsOf({ max: { count: StoreLimitLeastBoxes, size: StoreLimitFloor } })
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'got', stats }))
    expect(await vaultDB.tryStats(TH.statsAskOf())).to.deep.include({ ok: true, val: stats })
  })

  it("refuses, as a broken store, stats with a field missing, a count that is no whole number, or a limit of Infinity, past the cap, or under two boxes or the floor in bytes", async () => {
    for (const stats of [statsOf({ gate: undefined }), statsOf({ box: { ...Counted, size: 1.5 } }), statsOf({ box: { ...Counted, live_count: -1 } }),
      statsOf({ max: { count: Infinity, size: StoreLimitCap } }), statsOf({ max: { count: StoreLimitCap, size: StoreLimitCap + 1 } }),
      statsOf({ max: { count: StoreLimitLeastBoxes - 1, size: StoreLimitCap } }), statsOf({ max: { count: StoreLimitCap, size: StoreLimitFloor - 1 } }),
      statsOf({ extra: 1 })]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'got', stats }))
      await TH.expectBad(vaultDB.tryStats(TH.statsAskOf()), 'storage_issue')
    }
  })
})

describe("AdapterVaultDB, the read_tc of an answer", () => {
  it("answers the read_tc a concrete adapter reports, good or refused, from a get, a write or a birth", async () => {
    const read_tc = readTcNow()
    for (const manifest of [getManifestOf(null), getManifestOf(TH.gateThingOf())]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ...manifest, read_tc }))
      expect(await vaultDB.tryGetThing(TH.getGateAskOf())).to.deep.include({ read_tc })
    }
    const refusing = new ScriptedVaultDB(() => ({ ok: false, act: 'stale', read_tc, record: TH.gateThingOf() }), () => ({ ...writeManifestOf(TH.birthAskOf(), OtherGate, false), read_tc }))
    expect(await refusing.tryWriteThing(TH.birthAskOf())).to.deep.include({ ok: false, act: 'stale', read_tc })
    expect(await refusing.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ read_tc })
  })

  it("refuses, as a broken store, a report from a get, a write, a list or a birth with no read_tc, or one that is no UUID version 7", async () => {
    for (const read_tc of [undefined, crypto.randomUUID(), readTcNow().toUpperCase(), 7]) {
      const getting = new ScriptedVaultDB(() => ({ ...getManifestOf(null), read_tc }))
      const writing = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', read_tc, record: Shell.of(TH.GateScope) }), () => ({ ...writeManifestOf(TH.birthAskOf(), null, true), read_tc }))
      const listing = new ScriptedVaultDB(() => ({ ok: false, act: 'gone', read_tc, parentage: [], deltas: [], damaged_rows: [] }))
      await TH.expectBad(getting.tryGetThing(TH.getGateAskOf()), 'storage_issue')
      await TH.expectBad(writing.tryWriteThing(TH.birthAskOf()), 'storage_issue')
      await TH.expectBad(listing.tryListThings(TH.listAskAt('box')), 'storage_issue')
      await TH.expectBad(writing.tryBirthBank(TH.birthBankAskOf()), 'storage_issue')
    }
  })

  it("answers a listing's read_tc as its Kids value's own", async () => {
    const read_tc = readTcNow()
    const kids    = { modelkind: 'kids', parentpath: 'box', parentlife: TH.rootBoxOf().lifepath, items: {}, gones: {} }
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotlive', read_tc, kids, parentage: [], deltas: [], damaged_rows: [] }))
    expect(await vaultDB.tryListThings(TH.listAskAt('box'))).to.deep.include({ read_tc, val: { ...kids, read_tc } })
  })

  it("refuses, as a broken store, a get whose tracked is no object", async () => {
    for (const report of [{ tracked: undefined }, { tracked: null }, { tracked: 'same' }]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ...getManifestOf(null), ...report }))
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("refuses, as a broken store, a listing whose banktok is no UUID", async () => {
    for (const report of [{ banktok: 'a banktok' }, { banktok: null }]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ok: false, act: 'gone', parentage: [], deltas: [], damaged_rows: [], ...report }))
      await TH.expectBad(vaultDB.tryListThings(TH.listAskAt('box')), 'storage_issue')
    }
  })

  it("answers the void lifetok to a get whose banktok is no lifetok", async () => {
    for (const report of [{ banktok: 'a banktok' }, { banktok: null }, { banktok: undefined }]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ...getManifestOf(null), ...report }))
      expect(await vaultDB.tryGetThing(TH.getGateAskOf())).to.deep.include({ ok: true, banktok: SX.VoidLifeTok })
    }
  })
})

describe("AdapterVaultDB, the banktok of an answer", () => {
  it("answers the banktok a concrete adapter reports, good or refused, from a get, a write, a list or a birth", async () => {
    const refused = { ok: false, act: 'stale', banktok: TH.OtherLifetok, record: TH.gateThingOf() } as const
    const vaultDB = new ScriptedVaultDB(() => refused, () => ({ ...writeManifestOf(TH.birthAskOf(), OtherGate, false), banktok: TH.OtherLifetok }))
    const listing = new ScriptedVaultDB(() => ({ ...refused, parentage: [], deltas: [], damaged_rows: [] }))
    const good    = new ScriptedVaultDB(() => ({ ...getManifestOf(null), banktok: TH.OtherLifetok }))
    const answers = [
      await good.tryGetThing(TH.getGateAskOf()), await vaultDB.tryWriteThing(TH.birthAskOf()), await listing.tryListThings(TH.listAskAt('box')),
      await vaultDB.tryBirthBank(TH.birthBankAskOf()), await good.tryGetThing(TH.getGateAskOf()),
    ]
    expect(answers.map((answer) => answer.banktok)).to.deep.equal(Array.from({ length: 5 }, () => TH.OtherLifetok))
  })

  it("answers the void lifetok as its banktok where a concrete adapter reports it, and where the verb throws", async () => {
    const bankless  = new ScriptedVaultDB(() => getManifestOf(null))
    const throwing  = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answers   = [
      await bankless.tryGetThing(TH.getGateAskOf()), await throwing.tryGetThing(TH.getGateAskOf()), await throwing.tryListThings(TH.listAskAt('box')),
      await throwing.tryBirthBank(TH.birthBankAskOf()),
    ]
    expect(answers.map((answer) => answer.banktok)).to.deep.equal([SX.VoidLifeTok, SX.VoidLifeTok, SX.VoidLifeTok, SX.VoidLifeTok])
  })
})

describe("AdapterVaultDB.watch(scope, onNotice, onBadNews, onEnded)", () => {
  it("hands the watch's onEnded to the concrete adapter", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    let endedCount = 0
    vaultDB.watch(TH.ThingBank, () => undefined, () => undefined, () => { endedCount += 1 })
    vaultDB.onEnded?.()
    expect(endedCount).to.eq(1)
  })

  it("hands the concrete adapter an onEnded that does nothing where the watch has none", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    vaultDB.watch(TH.ThingBank, () => undefined, () => undefined)
    expect(() => vaultDB.onEnded?.()).not.to.throw()
    expect(vaultDB.onEnded).to.be.a('function')
  })

  it("notifies of a sound Thing, and sends one that fails its checks to onBadNews", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: { ...TH.gateThingOf(), wayins: {} }, banktok: SX.VoidLifeTok })
    vaultDB.receive?.({ record: 'not a Thing', banktok: SX.VoidLifeTok })
    vaultDB.receive?.({ record: TH.gateThingOf(), banktok: SX.VoidLifeTok })
    expect(TH.maskedReadTcsOf(events)).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row', 'storage_issue'])
  })

  it("notifies of each change as one notice of its Thing, with the banktok received beside it", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: TH.bankThingOf().lifetok })
    vaultDB.receive?.({ record: TH.boxThingOf('anthropic'), banktok: TH.bankThingOf().lifetok })
    expect(TH.maskedReadTcsOf(events)).to.deep.equal([TH.boxThingOf(), TH.boxThingOf('anthropic')].map((box) => TH.itemEventOf(box, TH.bankThingOf().lifetok)))
    const read_tcs = events.map((event) => event.read_tc)
    expect(read_tcs.toSorted((one, two) => one.localeCompare(two)), 'a later notice is read later').to.deep.equal(read_tcs)
    expect(badNews).to.deep.equal([])
  })

  it("notifies with the bank's lifetok where the bank is the Thing itself, else the banktok received beside it", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    const events: VaultEvent[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, () => undefined)
    const otherLifetok = crypto.randomUUID()
    vaultDB.receive?.({ record: TH.bankThingOf({ lifetok: otherLifetok }), banktok: SX.VoidLifeTok })
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: TH.bankThingOf().lifetok })
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok })
    expect(events.map((event) => event.banktok)).to.deep.equal([otherLifetok, TH.bankThingOf().lifetok, SX.VoidLifeTok])
  })

  it("notifies with the read_tc received beside a Thing, else one made when it arrives", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    const events: VaultEvent[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, () => undefined)
    const told  = readTcNow()
    const early = readTcNow()
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok, read_tc: told })
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok })
    expect(events[0]?.read_tc).to.eq(told)
    const isMadeOnArrival = events[1]!.read_tc > early
    expect(isMadeOnArrival).to.be.true
  })

  it("sends a Thing whose read_tc is no UUID version 7 to onBadNews, as a broken store", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    for (const read_tc of [crypto.randomUUID(), readTcNow().toUpperCase(), 7, null]) {
      vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok, read_tc })
    }
    expect(events).to.deep.equal([])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['storage_issue', 'storage_issue', 'storage_issue', 'storage_issue'])
  })

  it("sends a Thing of another bank to onBadNews, not to onNotice", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: TH.gateThingOf({ banklabel: 'other' }), banktok: SX.VoidLifeTok })
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
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', record: null }))
    TH.expectSyncRefusal(() => vaultDB.watch(TH.ThingBank, () => undefined, undefined as never), 'bad_record')
  })
})

describe("AdapterVaultDB, what a watcher is notified of from a verb's answer", () => {
  it("notifies of nothing an answer carries: a refusal's dbhas, a thrown refusal's, a good write's val, or a listing's parentage and deltas", async () => {
    const parentage = [Thing.sparseOf(TH.rootBoxOf())]
    const deltas    = [Thing.sparseOf(TH.boxThingOf('anthropic')), Thing.sparseOf(TH.boxThingOf('openai'))]
    const kids      = { modelkind: 'kids', parentpath: 'box', parentlife: TH.rootBoxOf().lifepath, items: {}, gones: {} }
    const steps: [() => unknown, () => unknown][] = [
      [() => ({ ok: false, act: 'stale', record: TH.gateThingOf() }), () => writeManifestOf(TH.birthAskOf(), OtherGate, false)],
      [() => ({ ok: true, act: 'born', record: TH.gateThingOf() }), () => writeManifestOf(TH.birthAskOf(), null, true)],
      [() => { throw Throwers.gateIssue(TH.gateThingOf(), "a test") }, () => { throw Throwers.gateIssue(TH.gateThingOf(), "a test") }],
    ]
    for (const [step, manifestStep] of steps) {
      const vaultDB = new ScriptedVaultDB(step as () => object, manifestStep as () => object)
      const noticedRecords = noticedRecordsOver(vaultDB)
      await vaultDB.tryGetThing(TH.getGateAskOf())
      await vaultDB.tryWriteThing(TH.birthAskOf())
      await vaultDB.tryBirthBank(TH.birthBankAskOf())
      await TH.aWhile()
      expect(noticedRecords).to.deep.equal([])
    }
    const listings = [{ ok: true, act: 'gotlive', kids, parentage, deltas, damaged_rows: [] }, { ok: false, act: 'gone', parentage, deltas: [], damaged_rows: [] }]
    for (const listed of listings) {
      const vaultDB = new ScriptedVaultDB(() => listed)
      const noticedRecords = noticedRecordsOver(vaultDB)
      await vaultDB.tryListThings(TH.listAskAt('box'))
      await TH.aWhile()
      expect(noticedRecords).to.deep.equal([])
    }
  })
})
