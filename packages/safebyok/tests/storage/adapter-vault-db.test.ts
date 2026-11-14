import { describe, expect, it } from 'vitest'
import { type EX, Errors } from 'safebyok-big/internals'
import { AnswerNotMade } from '../../src/phrases'
import { AdapterVaultDB } from '../../src/storage/adapter-vault-db'
import type { GetThingAsk, ThingWatchScope, WriteThingAsk } from '../../src/storage/shapes-thing'
import type { Actual, ThingNotice } from '../../src/storage/vault-db'
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

  it("never throws for an ask it cannot look at", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const answer = await vaultDB.tryWriteThing(Booby as never)
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', ask: {} })
    expect(answer.ok ? null : answer.err.message).to.eq(AnswerNotMade)
  })
})

describe("AdapterVaultDB.tryWriteThing(ask), a store that reports oddly", () => {
  it("refuses a good write that reports no Thing as a broken store", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'born', world: null, record: null }))
    await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
  })
})

describe("AdapterVaultDB.watch(scope, onNotice)", () => {
  it("hears a sound Thing, and drops one that fails its checks unheard", () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ok: true, act: 'gotvoid', world: null, record: null }))
    const notices: ThingNotice[] = []
    vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) })
    vaultDB.hear?.({ record: { ...TH.gateThingOf(), wayins: {} }, world: null })
    vaultDB.hear?.({ record: 'not a Thing', world: null })
    vaultDB.hear?.({ record: TH.gateThingOf(), world: null })
    expect(notices).to.deep.equal([{ act: 'gotlive', val: TH.gateThingOf(), world: null }])
  })
})
