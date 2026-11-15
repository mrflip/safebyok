import { describe, expect, it } from 'vitest'
import { type EX, Errors } from 'safebyok-big/internals'
import { AnswerNotMade } from '../../src/phrases'
import { AdapterVaultDB } from '../../src/storage/adapter-vault-db'
import type { BirthBankAsk, GetThingAsk, ListThingsAsk, ThingWatchScope, WriteThingAsk } from '../../src/storage/shapes-thing'
import type { Actual, BirthBankActual, ListThingsActual, ThingNotice } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

type Hear = (heard: { record: unknown, world: null }) => void

/** A store whose every step does what the test hands it: throws, or reports what it is given. */
class ScriptedVaultDB extends AdapterVaultDB {
  hear: Hear | null = null
  readonly step: () => Actual<EX.GoodAct>

  constructor(step: () => Actual<EX.GoodAct>) {
    super()
    this.step = step
  }

  protected doGetThing(_ask: GetThingAsk): Actual<EX.GotAct> { return this.step() as Actual<EX.GotAct> }
  protected doWriteThing(_ask: WriteThingAsk): Actual<EX.PutAct | EX.DelAct> { return this.step() as Actual<EX.PutAct | EX.DelAct> }
  protected doListThings(_ask: ListThingsAsk): ListThingsActual { return this.step() as unknown as ListThingsActual }
  protected doBirthBank(_ask: BirthBankAsk): BirthBankActual { return this.step() as unknown as BirthBankActual }
  protected override doWatch(_scope: ThingWatchScope, hear: Hear, _onBadNews: (news: Errors.VaultError) => void): () => void {
    this.hear = hear
    return () => { this.hear = null }
  }
}

/** A value that throws on any look at it: what a broken backend might throw, or a broken host might ask. */
const Booby = new Proxy({}, { get() { throw new Error('boom') }, getPrototypeOf() { throw new Error('boom') }, has() { throw new Error('boom') } })

describe("AdapterVaultDB, a step that throws", () => {
  it("answers storage_unavailable for a backend's own error, with the verb and the loggable ask", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ act: 'unclassified_storing', world: null, dbhas: null })
    expect(err.meta).to.deep.include({ oplabel: 'writeThing' })
    expect(answer.ask).to.deep.include(TH.GateScope)
  })

  it("answers a refusal as it is", async () => {
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

  it("answers a listing that throws with no children, no parent and no damaged rows", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryListThings(TH.listAskAt('box'))
    await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', dbhas: null, parent: null, damaged_rows: [] })
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
  it("hears a sound Thing, and tells onBadNews of one that fails its checks", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const notices: ThingNotice[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) }, (news) => { badNews.push(news) })
    vaultDB.hear?.({ record: { ...TH.gateThingOf(), wayins: {} }, world: null })
    vaultDB.hear?.({ record: 'not a Thing', world: null })
    vaultDB.hear?.({ record: TH.gateThingOf(), world: null })
    expect(notices).to.deep.equal([{ ok: true, act: 'gotlive', val: TH.gateThingOf(), world: null }])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row', 'storage_issue'])
  })

  it("tells onBadNews of a Thing of another bank, and does not hear it", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const notices: ThingNotice[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) }, (news) => { badNews.push(news) })
    vaultDB.hear?.({ record: TH.gateThingOf({ banklabel: 'other' }), world: null })
    expect(notices).to.deep.equal([])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['storage_issue'])
  })

  it("refuses a watch with no onBadNews", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    TH.expectSyncRefusal(() => vaultDB.watch(TH.ThingBank, () => undefined, undefined as never), 'bad_option')
  })
})
