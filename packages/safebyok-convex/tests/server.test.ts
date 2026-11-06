/** SafebyokComponent: the host's functions serve each call to the user it names, and to no one else. */

import { describe, expect, it } from 'vitest'
import * as SX from 'safebyok/storage'
import { SafebyokComponent } from '../src/server'
import * as TH from './test-helpers'

const { api, createTest } = TH.hostWith(TH.bySubject)

type Backend = ReturnType<typeof createTest>
type Caller = ReturnType<Backend['withIdentity']>

const vault = TH.vaultAt()
const box = TH.boxAt()
const otherBox = TH.boxAt(0, vault.vault_tok, { boxlabel: 'other' })
const birth = { prior: SX.VoidRevision, ifAbsent: 'add', ifPresent: 'fail' } as const
const vaultQuery = { ...TH.vaultScope, vault_tok: vault.vault_tok }

/** A backend where u1 has a vault and one box in it, written as u1. */
const seeded = async (): Promise<Backend> => {
  const backend = createTest()
  const asOwner = backend.withIdentity({ subject: 'u1' })
  await asOwner.mutation(api.safebyok.putVault, { record: vault, opts: birth })
  await asOwner.mutation(api.safebyok.putBox, { record: box, opts: birth })
  return backend
}

/** One call of each of the host's functions, every one naming u1. */
const EveryCall: [string, (caller: Caller) => Promise<unknown>][] = [
  ['listVaults', (caller) => caller.query(api.safebyok.listVaults, { scope: TH.bankScope })],
  ['getVault',   (caller) => caller.query(api.safebyok.getVault, { scope: TH.vaultScope })],
  ['listBoxes',  (caller) => caller.query(api.safebyok.listBoxes, { asked: vaultQuery })],
  ['getBox',     (caller) => caller.query(api.safebyok.getBox, { asked: { ...vaultQuery, boxlabel: box.boxlabel } })],
  ['putVault',   (caller) => caller.mutation(api.safebyok.putVault, { record: vault, opts: birth })],
  ['putBox',     (caller) => caller.mutation(api.safebyok.putBox, { record: otherBox, opts: birth })],
  ['delBox',     (caller) => caller.mutation(api.safebyok.delBox, { tombstone: TH.boxTombstoneOf(box), opts: { prior: SX.revisionOf(box) } })],
  ['delVault',   (caller) => caller.mutation(api.safebyok.delVault, { tombstone: TH.vaultTombstoneOf(vault), opts: { prior: SX.revisionOf(vault) } })],
  ['tidyGone',   (caller) => caller.mutation(api.safebyok.tidyGone, { scope: TH.bankScope })],
  ['watchRows',  (caller) => caller.query(api.safebyok.watchRows, { scope: TH.bankScope })],
]

/** What u1 holds, as the component itself lists it. */
const heldBy = async (backend: Backend) => {
  const asOwner = backend.withIdentity({ subject: 'u1' })
  return await asOwner.query(api.safebyok.watchRows, { scope: TH.bankScope })
}

describe("SafebyokComponent.api, for the user a call names", () => {
  for (const [fnname, call] of EveryCall) {
    it(`serves ${fnname}`, async () => {
      const backend = await seeded()
      await expect(call(backend.withIdentity({ subject: 'u1' }))).resolves.not.toThrow()
    })
  }

  it("hands back the component's answers as they came", async () => {
    const backend = await seeded()
    const asOwner = backend.withIdentity({ subject: 'u1' })
    expect(await asOwner.query(api.safebyok.getVault, { scope: TH.vaultScope })).to.deep.equal(vault)
    expect(await asOwner.query(api.safebyok.getBox, { asked: { ...vaultQuery, boxlabel: box.boxlabel } })).to.deep.equal({ vault, box })
    expect(await asOwner.mutation(api.safebyok.putVault, { record: vault, opts: birth })).to.deep.equal({ landed: false, ante: vault })
  })
})

describe("SafebyokComponent.api, for anyone else", () => {
  for (const [fnname, call] of EveryCall) {
    it(`refuses ${fnname} when no one is signed in`, async () => {
      const backend = await seeded()
      const before = await heldBy(backend)
      expect(await TH.convexRefusalOf(call(backend))).to.deep.equal({ kind: 'identity_revoked' })
      expect(await heldBy(backend)).to.deep.equal(before)
    })

    it(`refuses ${fnname} to a user it does not name`, async () => {
      const backend = await seeded()
      const before = await heldBy(backend)
      const stranger = backend.withIdentity({ subject: 'u2' })
      expect(await TH.convexRefusalOf(call(stranger))).to.deep.equal({ kind: 'identity_revoked' })
      expect(await heldBy(backend)).to.deep.equal(before)
    })
  }

  it("says nothing in a refusal but its kind, so it names no user", async () => {
    const backend = await seeded()
    expect(await TH.convexRefusalOf(backend.withIdentity({ subject: 'u2' }).query(api.safebyok.getVault, { scope: TH.vaultScope }))).to.deep.equal({ kind: 'identity_revoked' })
  })
})

describe("SafebyokComponent.api, with the host's getUserId", () => {
  const SignedOutCases = [
    [() => Promise.resolve(null),      'treats a null user id as no one'],
    [() => Promise.resolve(undefined), 'treats an undefined user id as no one'],
    [() => Promise.resolve(''),        'treats an empty user id as no one'],
    [() => null,                       'takes a getUserId that answers synchronously'],
  ] as const

  for (const [getUserId, blurb] of SignedOutCases) {
    it(blurb, async () => {
      const host = TH.hostWith(getUserId)
      const caller = host.createTest().withIdentity({ subject: 'u1' })
      expect(await TH.convexRefusalOf(caller.query(host.api.safebyok.getVault, { scope: TH.vaultScope }))).to.deep.equal({ kind: 'identity_revoked' })
    })
  }

  it("lets the host map identities to user ids its own way", async () => {
    const host = TH.hostWith(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      return identity ? `user|${identity.subject}` : null
    })
    const caller = host.createTest().withIdentity({ subject: 'u1' })
    expect(await caller.query(host.api.safebyok.getVault, { scope: { ...TH.vaultScope, user_id: 'user|u1' } })).to.be.null
    expect(await TH.convexRefusalOf(caller.query(host.api.safebyok.getVault, { scope: TH.vaultScope }))).to.deep.equal({ kind: 'identity_revoked' })
  })

  it("calls getUserId as a method of the bag it was handed, so one that leans on this works", async () => {
    const { app, component } = TH.installedComponent()
    const host = app.defineModules({ safebyok: component.api(new SignedInAs('u1')) })
    expect(await host.createTest().query(host.api.safebyok.getVault, { scope: TH.vaultScope })).to.be.null
  })
})

describe("SafebyokComponent, at setup", () => {
  const { component } = TH.installedComponent()

  const BadOptsCases = [
    [undefined,                        'no options at all'],
    [{},                               'a bag without getUserId'],
    [{ getUserID: () => null },        'a misspelt getUserId'],
    [{ getUserId: 'u1' },              'a getUserId that is text, not a function'],
  ] as const

  for (const [opts, blurb] of BadOptsCases) {
    it(`refuses ${blurb} with a bad_option that says what to pass`, () => {
      const refusal = TH.expectSyncRefusal(() => component.api(opts as never), 'bad_option')
      expect(refusal.message).to.include('{ getUserId }')
    })
  }

  for (const [forgotten, blurb] of [[undefined, 'undefined'], [null, 'null'], ['safebyok', 'text']] as const) {
    it(`refuses ${blurb} for the component with a bad_option that says how to install it`, () => {
      const refusal = TH.expectSyncRefusal(() => new SafebyokComponent(forgotten as never), 'bad_option')
      expect(refusal.message).to.include('app.use(safebyok)')
    })
  }
})

/** A getUserId bag whose method answers from the bag itself: it fails if called detached from it. */
class SignedInAs {
  readonly #user_id: string

  constructor(user_id: string) { this.#user_id = user_id }

  getUserId() { return this.#user_id }
}
