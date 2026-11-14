/** SafebyokBankComponent: each of the host's functions serves the user its call names, and no one else. */

import { describe, expect, it } from 'vitest'
import { SafebyokBankComponent } from '../src/server'
import * as TH from './test-helpers'

const { BW } = TH
const { api, createTest } = TH.bankHostWith(TH.bySubject)
const fns = api.safebyokBank

type Backend = ReturnType<typeof createTest>
type Caller = ReturnType<Backend['withIdentity']>

const bank = BW.bankAt()
const gate = BW.gateAt()
const vault = BW.vaultAt()
const box = BW.boxAt()
const otherBox = BW.boxAt(0, 'bank1', 'life1', { boxlabel: 'other' })
const withPasskey = { main: BW.mainWayin, passkey0: BW.passkey0Wayin }

/** Make a backend where u1 has a bank, a vault and one box, all written as u1. */
async function seeded(): Promise<Backend> {
  const backend = createTest()
  const asOwner = backend.withIdentity({ subject: 'u1' })
  await asOwner.mutation(fns.buildBank, { ask: BW.bankBuildAskOf() })
  await asOwner.mutation(fns.putVault, { ask: BW.vaultPutAskOf(vault) })
  await asOwner.mutation(fns.putBox, { ask: BW.boxPutAskOf(box) })
  return backend
}

/** One call to each of the host's functions, each naming u1. */
const EveryCall: [string, (caller: Caller) => Promise<unknown>][] = [
  ['ensureBank', (caller) => caller.query(fns.ensureBank, { ask: BW.bankEnsureAsk })],
  ['buildBank',  (caller) => caller.mutation(fns.buildBank, { ask: BW.bankBuildAskOf(BW.bankAt(1, 'bank2'), BW.gateAt(0, 'bank2'), bank) })],
  ['putGate',    (caller) => caller.mutation(fns.putGate, { ask: BW.gatePutAskOf('add_passkey', gate, withPasskey) })],
  ['delBank',    (caller) => caller.mutation(fns.delBank, { ask: BW.bankDelAskOf(bank) })],
  ['getVault',   (caller) => caller.query(fns.getVault, { ask: BW.vaultGetAskOf() })],
  ['putVault',   (caller) => caller.mutation(fns.putVault, { ask: BW.vaultPutAskOf(vault) })],
  ['delVault',   (caller) => caller.mutation(fns.delVault, { ask: BW.vaultDelAskOf(vault) })],
  ['listBoxes',  (caller) => caller.query(fns.listBoxes, { ask: BW.boxListAsk })],
  ['getBox',     (caller) => caller.query(fns.getBox, { ask: BW.boxGetAskOf() })],
  ['putBox',     (caller) => caller.mutation(fns.putBox, { ask: BW.boxPutAskOf(otherBox) })],
  ['delBox',     (caller) => caller.mutation(fns.delBox, { ask: BW.boxDelAskOf(box) })],
  ['tidyGone',   (caller) => caller.mutation(fns.tidyGone, { ask: BW.boxTidyAsk })],
  ['watchRows',  (caller) => caller.query(fns.watchRows, { scope: BW.bankScope })],
]

/** List what u1 has stored, as the component itself reports it. */
async function storedIn(backend: Backend) {
  return await backend.withIdentity({ subject: 'u1' }).query(fns.watchRows, { scope: BW.bankScope })
}

describe("SafebyokBankComponent.api, for the user a call names", () => {
  for (const [fnname, call] of EveryCall) {
    it(`serves ${fnname}`, async () => {
      const backend = await seeded()
      await expect(call(backend.withIdentity({ subject: 'u1' }))).resolves.not.toThrow()
    })
  }

  it("hands back the component's answers as they came", async () => {
    const backend = await seeded()
    const asOwner = backend.withIdentity({ subject: 'u1' })
    expect(await asOwner.query(fns.getBox, { ask: BW.boxGetAskOf() })).to.deep.equal({ parent: vault, box })
  })
})

describe("SafebyokBankComponent.api, for an ask naming another user", () => {
  it("refuses it as identity_revoked, before the core's checker sees it", async () => {
    const backend = await seeded()
    const before = await storedIn(backend)
    const theirs = { ...BW.bankBuildAskOf(), user_id: 'u2' }
    expect(await TH.convexRefusalOf(backend.withIdentity({ subject: 'u1' }).mutation(fns.buildBank, { ask: theirs }))).to.deep.equal({ kind: 'identity_revoked' })
    const misfit = { ...theirs, record: { ...theirs.record, revision_seq: 5 } }
    expect(await TH.convexRefusalOf(backend.withIdentity({ subject: 'u1' }).mutation(fns.buildBank, { ask: misfit }))).to.deep.equal({ kind: 'identity_revoked' })
    expect(await storedIn(backend)).to.deep.equal(before)
  })
})

describe("SafebyokBankComponent.api, for anyone else", () => {
  for (const [fnname, call] of EveryCall) {
    it(`refuses ${fnname} when no one is signed in`, async () => {
      const backend = await seeded()
      const before = await storedIn(backend)
      expect(await TH.convexRefusalOf(call(backend))).to.deep.equal({ kind: 'identity_revoked' })
      expect(await storedIn(backend)).to.deep.equal(before)
    })

    it(`refuses ${fnname} to a user it does not name`, async () => {
      const backend = await seeded()
      const before = await storedIn(backend)
      const refusal = await TH.convexRefusalOf(call(backend.withIdentity({ subject: 'u2' })))
      expect(refusal).to.deep.equal({ kind: 'identity_revoked' })
      expect(await storedIn(backend)).to.deep.equal(before)
    })
  }

  it("says nothing in a refusal but its kind, so it names no user", async () => {
    const backend = await seeded()
    const refusal = await TH.convexRefusalOf(backend.withIdentity({ subject: 'u2' }).query(fns.getVault, { ask: BW.vaultGetAskOf() }))
    expect(refusal).to.deep.equal({ kind: 'identity_revoked' })
  })
})

describe("SafebyokBankComponent.api, with the host's getUserId", () => {
  const SignedOutCases = [
    [() => Promise.resolve(null),      'treats a null user id as no one'],
    [() => Promise.resolve(undefined), 'treats an undefined user id as no one'],
    [() => Promise.resolve(''),        'treats an empty user id as no one'],
    [() => null,                       'takes a getUserId that answers synchronously'],
  ] as const

  for (const [getUserId, blurb] of SignedOutCases) {
    it(blurb, async () => {
      const host = TH.bankHostWith(getUserId)
      const caller = host.createTest().withIdentity({ subject: 'u1' })
      const refusal = await TH.convexRefusalOf(caller.query(host.api.safebyokBank.getVault, { ask: BW.vaultGetAskOf() }))
      expect(refusal).to.deep.equal({ kind: 'identity_revoked' })
    })
  }

  it("lets the host map identities to user ids its own way", async () => {
    const host = TH.bankHostWith(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      return identity ? `user|${identity.subject}` : null
    })
    const caller = host.createTest().withIdentity({ subject: 'u1' })
    const ask = BW.bankEnsureAsk
    expect(await caller.query(host.api.safebyokBank.ensureBank, { ask: { ...ask, user_id: 'user|u1' } })).to.deep.include({ bank: null })
    const refusal = await TH.convexRefusalOf(caller.query(host.api.safebyokBank.ensureBank, { ask }))
    expect(refusal).to.deep.equal({ kind: 'identity_revoked' })
  })

  it("calls getUserId as a method, keeping its this", async () => {
    const { app, component } = TH.installedBankComponent()
    const host = app.defineModules({ safebyokBank: component.api(new SignedInAs('u1')) })
    expect(await host.createTest().query(host.api.safebyokBank.ensureBank, { ask: BW.bankEnsureAsk })).to.deep.include({ bank: null })
  })
})

describe("SafebyokBankComponent, at setup", () => {
  const { component } = TH.installedBankComponent()

  const BadOptsCases = [
    [undefined,                        'no options at all'],
    [{},                               'a bag without getUserId'],
    [{ getUserID: () => null },        'a misspelt getUserId'],
    [{ getUserId: 'u1' },              'a getUserId that is text, not a function'],
  ] as const

  for (const [opts, blurb] of BadOptsCases) {
    it(`refuses ${blurb}, saying what to pass`, () => {
      const refusal = TH.expectSyncRefusal(() => component.api(opts as never), 'bad_option')
      expect(refusal.message).to.include('{ getUserId }')
    })
  }

  for (const [forgotten, blurb] of [[undefined, 'undefined'], [null, 'null'], ['safebyok', 'text']] as const) {
    it(`refuses ${blurb} for the component, saying how to install it`, () => {
      const refusal = TH.expectSyncRefusal(() => new SafebyokBankComponent(forgotten as never), 'bad_option')
      expect(refusal.message).to.include('app.use(safebyok)')
    })
  }
})

/** An options object whose `getUserId` reads from `this`, so it fails if called detached from the object. */
class SignedInAs {
  readonly #user_id: string

  constructor(user_id: string) { this.#user_id = user_id }

  getUserId() { return this.#user_id }
}
