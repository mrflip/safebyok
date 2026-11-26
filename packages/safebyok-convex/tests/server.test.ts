/** SafebyokVaultComponent: each of the host's functions serves the user its call names, and no one else. */

import { describe, expect, it } from 'vitest'
import { type Userid, Shell } from 'safebyok/storage'
import { SafebyokVaultComponent } from '../src/server'
import * as TH from './test-helpers'

const { api, createTest } = TH.vaultHostWith(TH.bySubject)
const fns = api.safebyokVault

type Backend = ReturnType<typeof createTest>
type Caller = ReturnType<Backend['withIdentity']>

/** Make a backend where u1 has a bank, written as u1. */
async function seeded(): Promise<Backend> {
  const backend = createTest()
  await backend.withIdentity({ subject: 'u1' }).mutation(fns.birthBank, { ask: TH.birthBankAskOf() })
  return backend
}

/** One call to each of the host's functions, each naming u1. */
const EveryCall: [string, (caller: Caller) => Promise<unknown>][] = [
  ['getThing',    (caller) => caller.query(fns.getThing, { ask: TH.getGateAskOf() })],
  ['writeThing',  (caller) => caller.mutation(fns.writeThing, { ask: TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)) })],
  ['listThings',  (caller) => caller.query(fns.listThings, { ask: TH.listAskAt('box') })],
  ['birthBank',   (caller) => caller.mutation(fns.birthBank, { ask: TH.birthBankAskOf() })],
  ['getWorld',    (caller) => caller.query(fns.getWorld, { ask: TH.getWorldAskOf() })],
  ['stats',       (caller) => caller.query(fns.stats, { ask: TH.statsAskOf() })],
  ['watchThings', (caller) => caller.query(fns.watchThings, { scope: TH.ThingBank, cursor: 0n })],
]

/** Every Thing u1 has stored, as the component itself reports it. */
async function storedIn(backend: Backend) {
  return await backend.withIdentity({ subject: 'u1' }).query(fns.watchThings, { scope: TH.ThingBank, cursor: 0n })
}

describe("SafebyokVaultComponent.api, for the user a call names", () => {
  for (const [fnname, call] of EveryCall) {
    it(`serves ${fnname}`, async () => {
      // SafebyokVaultComponent @example
      // GetUserId @example
      const backend = await seeded()
      await expect(call(backend.withIdentity({ subject: 'u1' }))).resolves.not.toThrow()
    })
  }

  it("hands back the component's answers as they came", async () => {
    const backend = await seeded()
    const fetched = await backend.withIdentity({ subject: 'u1' }).query(fns.getThing, { ask: TH.getGateAskOf() })
    expect(fetched).to.deep.include({ thing: TH.gateThingOf(), bank: TH.bankThingOf() })
  })
})

describe("SafebyokVaultComponent.api, for an ask naming another user", () => {
  it("refuses it as identity_revoked, before the core's checker sees it", async () => {
    const backend = await seeded()
    const before = await storedIn(backend)
    const asOwner = backend.withIdentity({ subject: 'u1' })
    const theirs = { ...TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0)), userid: 'u2' }
    expect(await TH.convexRefusalOf(asOwner.mutation(fns.writeThing, { ask: theirs }))).to.deep.equal({ kind: 'identity_revoked' })
    const misfit = { ...theirs, record: { ...theirs.record, revseq: 5 } }
    expect(await TH.convexRefusalOf(asOwner.mutation(fns.writeThing, { ask: misfit }))).to.deep.equal({ kind: 'identity_revoked' })
    expect(await storedIn(backend)).to.deep.equal(before)
  })
})

describe("SafebyokVaultComponent.api, for anyone else", () => {
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
    const refusal = await TH.convexRefusalOf(backend.withIdentity({ subject: 'u2' }).query(fns.getThing, { ask: TH.getGateAskOf() }))
    expect(refusal).to.deep.equal({ kind: 'identity_revoked' })
  })
})

describe("SafebyokVaultComponent.api, with the host's getUserId", () => {
  const SignedOutCases = [
    [() => Promise.resolve(null),      'treats a null userid as no one'],
    [() => Promise.resolve(undefined), 'treats an undefined userid as no one'],
    [() => Promise.resolve(''),        'treats an empty userid as no one'],
    [() => null,                       'accepts a getUserId that answers synchronously'],
  ] as const

  for (const [getUserId, blurb] of SignedOutCases) {
    it(blurb, async () => {
      const host = TH.vaultHostWith(getUserId)
      const caller = host.createTest().withIdentity({ subject: 'u1' })
      const refusal = await TH.convexRefusalOf(caller.query(host.api.safebyokVault.getThing, { ask: TH.getGateAskOf() }))
      expect(refusal).to.deep.equal({ kind: 'identity_revoked' })
    })
  }

  it("lets the host map identities to userids its own way", async () => {
    const host = TH.vaultHostWith(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      return identity ? `user|${identity.subject}` : null
    })
    const caller = host.createTest().withIdentity({ subject: 'u1' })
    const ask = TH.getWorldAskOf()
    expect(await caller.query(host.api.safebyokVault.getWorld, { ask: { ...ask, userid: 'user|u1' } })).to.deep.include({ bank: null })
    const refusal = await TH.convexRefusalOf(caller.query(host.api.safebyokVault.getWorld, { ask }))
    expect(refusal).to.deep.equal({ kind: 'identity_revoked' })
  })

  it("calls getUserId as a method, keeping its this", async () => {
    const { app, component } = TH.installedVaultComponent()
    const host = app.defineModules({ safebyokVault: component.api(new SignedInAs('u1')) })
    expect(await host.createTest().query(host.api.safebyokVault.getWorld, { ask: TH.getWorldAskOf() })).to.deep.include({ bank: null })
  })
})

describe("SafebyokVaultComponent, at setup", () => {
  const { component } = TH.installedVaultComponent()

  const BadOptsCases = [
    [undefined,                        'no options at all'],
    [{},                               'a bag without getUserId'],
    [{ getUserID: () => null },        'a misspelt getUserId'],
    [{ getUserId: 'u1' },              'a getUserId that is text, not a function'],
  ] as const

  for (const [opts, blurb] of BadOptsCases) {
    it(`refuses ${blurb}, saying what to pass`, () => {
      const refusal = TH.expectSyncRefusal(() => component.api(opts as never), 'bad_record')
      expect(refusal.message).to.include('{ getUserId }')
    })
  }

  for (const [forgotten, blurb] of [[undefined, 'undefined'], [null, 'null'], ['safebyok', 'text']] as const) {
    it(`refuses ${blurb} for the component, saying how to install it`, () => {
      const refusal = TH.expectSyncRefusal(() => new SafebyokVaultComponent(forgotten as never), 'bad_record')
      expect(refusal.message).to.include('app.use(safebyok)')
    })
  }
})

/** An options object whose `getUserId` reads from `this`, so it fails if called detached from the object. */
class SignedInAs {
  readonly #userid: Userid

  constructor(userid: Userid) { this.#userid = userid }

  getUserId() { return this.#userid }
}
