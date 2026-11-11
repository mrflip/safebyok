/** SafebyokComponent: each of the host's functions serves the user its call names, and no one else. */

import { describe, expect, it } from 'vitest'
import { SafebyokComponent } from '../src/server'
import * as TH from './test-helpers'

const { api, createTest } = TH.hostWith(TH.bySubject)

type Backend = ReturnType<typeof createTest>
type Caller = ReturnType<Backend['withIdentity']>

const vault = TH.vaultAt()
const box = TH.boxAt()
const otherBox = TH.boxAt(0, vault.vault_tok, { boxlabel: 'other' })
const vaultQuery = { ...TH.vaultScope, vault_tok: vault.vault_tok }

/** Make a backend where u1 has a vault with one box, both written as u1. */
async function seeded(): Promise<Backend> {
  const backend = createTest()
  const asOwner = backend.withIdentity({ subject: 'u1' })
  await asOwner.mutation(api.safebyok.putVault, TH.putVaultArgs(vault))
  await asOwner.mutation(api.safebyok.putBox, TH.putBoxArgs(box))
  return backend
}

/** One call to each of the host's functions, each naming u1. */
const EveryCall: [string, (caller: Caller) => Promise<unknown>][] = [
  ['listVaults', (caller) => caller.query(api.safebyok.listVaults, { scope: TH.bankScope })],
  ['getVault',   (caller) => caller.query(api.safebyok.getVault, { scope: TH.vaultScope })],
  ['listBoxes',  (caller) => caller.query(api.safebyok.listBoxes, { asked: vaultQuery })],
  ['getBox',     (caller) => caller.query(api.safebyok.getBox, { asked: { ...vaultQuery, boxlabel: box.boxlabel } })],
  ['putVault',   (caller) => caller.mutation(api.safebyok.putVault, TH.putVaultArgs(vault))],
  ['putBox',     (caller) => caller.mutation(api.safebyok.putBox, TH.putBoxArgs(otherBox))],
  ['delBox',     (caller) => caller.mutation(api.safebyok.delBox, TH.delBoxArgs(box))],
  ['delVault',   (caller) => caller.mutation(api.safebyok.delVault, TH.delVaultArgs(vault))],
  ['tidyGone',   (caller) => caller.mutation(api.safebyok.tidyGone, { scope: TH.bankScope })],
  ['watchRows',  (caller) => caller.query(api.safebyok.watchRows, { scope: TH.bankScope })],
]

/** List what u1 has stored, as the component itself reports it. */
async function storedIn(backend: Backend) {
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
    const next = TH.vaultAt(1)
    expect(await asOwner.mutation(api.safebyok.putVault, TH.putVaultArgs(next, vault))).to.deep.equal({ ok: true, act: 'replaced', world: next, vault: next, presence: 'live' })
  })
})

describe("SafebyokComponent.api, for an ask the core's checker refuses", () => {
  const otherUsers = TH.vaultAt(1, 'life1', { user_id: 'u2' })
  const BadAskCases: [string, (caller: Caller) => Promise<unknown>][] = [
    ['a vault put whose record is not one revision past the row it expects', (caller) => caller.mutation(api.safebyok.putVault, TH.putVaultArgs(TH.vaultAt(2), vault))],
    ["a vault put whose record is at another user's address than the ask names", (caller) => caller.mutation(api.safebyok.putVault, { ask: { ...TH.putVaultArgs(TH.vaultAt(1), vault).ask, record: otherUsers } })],
    ['a box put whose expected row is of another life than the ask names', (caller) => caller.mutation(api.safebyok.putBox, { ask: { ...TH.putBoxArgs(TH.boxAt(1), box).ask, vault_tok: 'life2' } })],
    ['a box del whose tombstone keeps the life token of the row it deletes', (caller) => caller.mutation(api.safebyok.delBox, { ask: { ...TH.delBoxArgs(box).ask, record: { ...TH.boxTombstoneOf(box), box_tok: box.box_tok } } })],
    ['a vault del whose tombstone is not one revision past the row it expects', (caller) => caller.mutation(api.safebyok.delVault, { ask: { ...TH.delVaultArgs(vault).ask, record: { ...TH.vaultTombstoneOf(vault), revision_seq: 5 } } })],
  ]

  for (const [blurb, call] of BadAskCases) {
    it(`refuses ${blurb} as bad_record, and stores nothing`, async () => {
      const backend = await seeded()
      const before = await storedIn(backend)
      const refusal = await TH.convexRefusalOf(call(backend.withIdentity({ subject: 'u1' })))
      expect(refusal).to.have.property('kind', 'bad_record')
      expect(await storedIn(backend)).to.deep.equal(before)
    })
  }

  it("refuses an ask naming another user's user_id as identity_revoked, before its checker sees it", async () => {
    const backend = await seeded()
    const before = await storedIn(backend)
    const theirs = TH.putVaultArgs(TH.vaultAt(0, 'life1', { user_id: 'u2' }))
    expect(await TH.convexRefusalOf(backend.withIdentity({ subject: 'u1' }).mutation(api.safebyok.putVault, theirs))).to.deep.equal({ kind: 'identity_revoked' })
    const misfit = { ask: { ...theirs.ask, record: { ...theirs.ask.record, revision_seq: 5 } } }
    expect(await TH.convexRefusalOf(backend.withIdentity({ subject: 'u1' }).mutation(api.safebyok.putVault, misfit))).to.deep.equal({ kind: 'identity_revoked' })
    expect(await storedIn(backend)).to.deep.equal(before)
  })

  it("carries a refusal the classifier throws inside the component across, with its kind, its sentence and the row it tested", async () => {
    const backend = await seeded()
    const [record] = TH.gateMoveOf({ ...vault, registered_at: vault.registered_at + 5 }, { passkey_wayin: TH.passkeyWayin })
    const ask = { ...TH.putVaultArgs(record, vault).ask, ifAbsent: 'fail', ifPresent: 'repl', gateVerb: 'addPasskey' } as const
    const refusal = await TH.convexRefusalOf(backend.withIdentity({ subject: 'u1' }).mutation(api.safebyok.putVault, { ask }))
    expect(refusal).to.deep.include({ kind: 'gate_issue', world: vault })
    expect(refusal).to.have.property('message').that.is.a('string')
  })
})

describe("SafebyokComponent.api, for anyone else", () => {
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
      const stranger = backend.withIdentity({ subject: 'u2' })
      expect(await TH.convexRefusalOf(call(stranger))).to.deep.equal({ kind: 'identity_revoked' })
      expect(await storedIn(backend)).to.deep.equal(before)
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

  it("calls getUserId as a method, keeping its this", async () => {
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
    it(`refuses ${blurb}, saying what to pass`, () => {
      const refusal = TH.expectSyncRefusal(() => component.api(opts as never), 'bad_option')
      expect(refusal.message).to.include('{ getUserId }')
    })
  }

  for (const [forgotten, blurb] of [[undefined, 'undefined'], [null, 'null'], ['safebyok', 'text']] as const) {
    it(`refuses ${blurb} for the component, saying how to install it`, () => {
      const refusal = TH.expectSyncRefusal(() => new SafebyokComponent(forgotten as never), 'bad_option')
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
