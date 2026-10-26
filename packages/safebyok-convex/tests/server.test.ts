import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { SafebyokComponent } from '../src/server'
import * as TH from './test-helpers'

const { api, createTest } = TH.hostWith(TH.bySubject)

const u1 = TH.scopeOf('u1')

/** A CVX where each of `user_ids` has a vault holding vault props and one box, written as that user. */
const seeded = async (user_ids: readonly string[] = ['u1']) => {
  const CVX = createTest()
  for (const user_id of user_ids) {
    const asOwner = CVX.withIdentity({ subject: user_id })
    await asOwner.mutation(api.safebyok.ensureVault, { draft: TH.gatelessOf(user_id) })
    await asOwner.mutation(api.safebyok.putBox, { ...TH.scopeOf(user_id), box: TH.boxOf('anthropic_api_key', 'a1'), expected: { vault_tok: `vault-tok-${user_id}`, revision_tok: null } })
  }
  return CVX
}

type Caller = ReturnType<ReturnType<typeof createTest>['withIdentity']>

/** One call of each of the nine functions, on `user_id`'s vault, as `caller`: each write but ensureVault one that lands on the vault `seeded` leaves. */
const callsOn = (user_id: string): [string, (caller: Caller) => Promise<unknown>][] => {
  const scope = TH.scopeOf(user_id)
  const vault_tok = `vault-tok-${user_id}`
  return [
    ['getVault',         (caller) => caller.query(api.safebyok.getVault, { ...scope })],
    ['ensureVault',      (caller) => caller.mutation(api.safebyok.ensureVault, { draft: TH.gatelessOf(user_id, { vault_tok: 'vault-tok-late' }) })],
    ['putVaultProps',    (caller) => caller.mutation(api.safebyok.putVaultProps, { vaultProps: TH.vaultRecordOf(user_id, { gate_epoch: 2 }), expected: { vault_tok, gate_epoch: 0 } })],
    ['getBox',           (caller) => caller.query(api.safebyok.getBox, { ...scope, boxlabel: 'anthropic_api_key', expected: { vault_tok } })],
    ['putBox',           (caller) => caller.mutation(api.safebyok.putBox, { ...scope, box: TH.boxOf('anthropic_api_key', 'a2'), expected: { vault_tok, revision_tok: 'rev-a1' } })],
    ['getCapacity',      (caller) => caller.query(api.safebyok.getCapacity, { ...scope })],
    ['delBox',           (caller) => caller.mutation(api.safebyok.delBox, { ...scope, boxlabel: 'anthropic_api_key', expected: { vault_tok, revision_tok: 'rev-a1' } })],
    ['delVault',         (caller) => caller.mutation(api.safebyok.delVault, { ...scope, expected: { vault_tok, gate_epoch: 0 } })],
    ['watchVault',       (caller) => caller.query(api.safebyok.watchVault, { ...scope })],
  ]
}

const EveryCall = callsOn('u1')

/** The writes among {@link callsOn}'s calls that change the vault `seeded` leaves, when its own user makes them. */
const LandingWrites: ReadonlySet<string> = new Set(['putVaultProps', 'putBox', 'delBox', 'delVault'])

/** Each of the seven functions that take a scope, called as before the scope's names were flattened into its arguments: `{ scope, ... }`. */
const NestedCalls: [string, (caller: Caller) => Promise<unknown>][] = [
  ['getVault',         (caller) => caller.query(api.safebyok.getVault, { scope: u1 } as never)],
  ['getBox',           (caller) => caller.query(api.safebyok.getBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.inThisVault } as never)],
  ['putBox',           (caller) => caller.mutation(api.safebyok.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a2'), expected: { vault_tok: 'vault-tok-u1', revision_tok: 'rev-a1' } } as never)],
  ['getCapacity',      (caller) => caller.query(api.safebyok.getCapacity, { scope: u1 } as never)],
  ['delBox',           (caller) => caller.mutation(api.safebyok.delBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.deleting('rev-a1') } as never)],
  ['delVault',         (caller) => caller.mutation(api.safebyok.delVault, { scope: u1, expected: { vault_tok: 'vault-tok-u1', gate_epoch: 0 } } as never)],
  ['watchVault',       (caller) => caller.query(api.safebyok.watchVault, { scope: u1 } as never)],
]

describe("SafebyokComponent.api, for the vault's own user", () => {
  for (const [fnName, call] of EveryCall) {
    it(`lets the signed-in owner call ${fnName}`, async () => {
      const CVX = await seeded()
      await expect(call(CVX.withIdentity({ subject: 'u1' }))).resolves.not.toThrow()
    })
  }

  it("hands back what the component holds, exactly", async () => {
    const CVX = await seeded()
    const asU1 = CVX.withIdentity({ subject: 'u1' })
    const listed = await asU1.query(api.safebyok.getVault, { ...u1 })
    expect(listed?.vaultProps).to.deep.equal(TH.gatelessOf('u1'))
    expect(await asU1.query(api.safebyok.getBox, { ...u1, boxlabel: 'anthropic_api_key', expected: TH.inThisVault })).to.deep.equal({ read: true, box_stored: TH.boxOf('anthropic_api_key', 'a1') })
    expect(await asU1.query(api.safebyok.watchVault, { ...u1 })).to.deep.equal({
      vault_tok: 'vault-tok-u1', gate_epoch: 0, boxes: [['anthropic_api_key', 'rev-a1']],
    })
  })

  it("passes on the component's answer to a box it has no room for, as it came, with how full the vault is", async () => {
    const CVX = await seeded()
    const asU1 = CVX.withIdentity({ subject: 'u1' })
    for (let ii = 0; ii < 8; ii++) {
      await asU1.mutation(api.safebyok.putBox, { ...u1, box: TH.heavyBox(`heavy_${String(ii)}`, 900_000), expected: TH.noBoxYet })
    }
    const answer = await asU1.mutation(api.safebyok.putBox, { ...u1, box: TH.heavyBox('one_too_many', 200_000), expected: TH.noBoxYet })
    expect(answer).to.deep.include({ landed: false, refusalkind: 'vault_full' })
    expect(answer).to.have.nested.property('capacity.boxes.used', 9)
    expect(await asU1.query(api.safebyok.getCapacity, { ...u1 })).to.deep.equal((answer as { capacity: unknown }).capacity)
  })

  it("resolves a failed expectation as why it failed, with the box that stands, not as a refusal", async () => {
    const CVX = await seeded()
    const stale = { vault_tok: 'vault-tok-u1', revision_tok: 'rev-a0' }
    const answer = await CVX.withIdentity({ subject: 'u1' }).mutation(api.safebyok.putBox, { ...u1, box: TH.boxOf('anthropic_api_key', 'a2'), expected: stale })
    expect(answer).to.deep.include({ landed: false, refusalkind: 'stale_write' })
    expect(answer).to.have.nested.property('box_stored.revision_tok', 'rev-a1')
    expect(answer).to.have.nested.property('box_stored.whisper_ciphered')
  })

  it("resolves a box write that lands with the box as stored", async () => {
    const CVX = await seeded()
    const over = { vault_tok: 'vault-tok-u1', revision_tok: 'rev-a1' }
    expect(await CVX.withIdentity({ subject: 'u1' }).mutation(api.safebyok.putBox, { ...u1, box: TH.boxOf('anthropic_api_key', 'a2'), expected: over })).to.deep.equal({ landed: true, box_stored: TH.boxOf('anthropic_api_key', 'a2') })
  })
})

describe("SafebyokComponent.api, for anyone else", () => {
  for (const [fnName, call] of EveryCall) {
    it(`refuses ${fnName} as identity_revoked when no one is signed in`, async () => {
      const CVX = await seeded()
      const refusal = await TH.convexRefusalOf(call(CVX))
      expect(refusal.kind).to.eq('identity_revoked')
    })

    it(`refuses ${fnName} as identity_revoked for another signed-in user`, async () => {
      const CVX = await seeded()
      const refusal = await TH.convexRefusalOf(call(CVX.withIdentity({ subject: 'u2' })))
      expect(refusal.kind).to.eq('identity_revoked')
    })
  }

  for (const [fnName, call] of callsOn('u2')) {
    it(`refuses ${fnName} as identity_revoked when its user_id names another user than the one signed in, who has a vault of their own`, async () => {
      const CVX = await seeded(['u1', 'u2'])
      const refusal = await TH.convexRefusalOf(call(CVX.withIdentity({ subject: 'u1' })))
      expect(refusal.kind).to.eq('identity_revoked')
    })
  }

  for (const [fnName, call] of callsOn('u2')) {
    it(`leaves another user's vault as it was after ${fnName} names it`, async () => {
      const CVX = await seeded(['u1', 'u2'])
      await TH.convexRefusalOf(call(CVX.withIdentity({ subject: 'u1' })))
      const left = await CVX.withIdentity({ subject: 'u2' }).query(api.safebyok.getVault, { ...TH.scopeOf('u2') })
      expect(left?.vaultProps).to.deep.equal(TH.gatelessOf('u2'))
      expect(left?.boxes.map((box) => box.revision_tok)).to.deep.equal(['rev-a1'])
    })
  }

  // Were these calls ones that could not land anyway, the vault left as it was would prove nothing.
  for (const [fnName, call] of callsOn('u2')) {
    if (! LandingWrites.has(fnName)) { continue }
    it(`changes the vault when its own user makes the ${fnName} call another user is refused`, async () => {
      const CVX = await seeded(['u1', 'u2'])
      const asU2 = CVX.withIdentity({ subject: 'u2' })
      await call(asU2)
      const after = await asU2.query(api.safebyok.getVault, { ...TH.scopeOf('u2') })
      expect({ vaultProps: after?.vaultProps, revs: after?.boxes.map((box) => box.revision_tok) }).to.not.deep.equal({ vaultProps: TH.gatelessOf('u2'), revs: ['rev-a1'] })
    })
  }

  it("leaves the vault as it was after another user's every attempt", async () => {
    const CVX = await seeded()
    const asU2 = CVX.withIdentity({ subject: 'u2' })
    for (const [, call] of EveryCall) { await TH.convexRefusalOf(call(asU2)) }
    const asU1 = CVX.withIdentity({ subject: 'u1' })
    const left = await asU1.query(api.safebyok.getVault, { ...u1 })
    expect(left?.vaultProps).to.deep.equal(TH.gatelessOf('u1'))
    expect(left?.boxes).to.have.lengthOf(1)
    expect(await asU1.query(api.safebyok.getBox, { ...u1, boxlabel: 'anthropic_api_key', expected: TH.inThisVault })).to.deep.equal({ read: true, box_stored: TH.boxOf('anthropic_api_key', 'a1') })
  })

  it("shows a user only their own vault: their listing holds none of another's boxes", async () => {
    const CVX = await seeded()
    const asU2 = CVX.withIdentity({ subject: 'u2' })
    await asU2.mutation(api.safebyok.ensureVault, { draft: TH.gatelessOf('u2') })
    expect(await asU2.query(api.safebyok.getVault, { ...TH.scopeOf('u2') })).to.deep.equal({ vaultProps: TH.gatelessOf('u2'), boxes: [] })
  })

  it("says what to do, calmly, and names no user in a refusal", async () => {
    const CVX = await seeded()
    const refusals = [
      await TH.convexRefusalOf(CVX.query(api.safebyok.getVault, { ...u1 })),
      await TH.convexRefusalOf(CVX.withIdentity({ subject: 'u2' }).query(api.safebyok.getVault, { ...u1 })),
    ]
    expect(refusals.map((refusal) => refusal.message)).to.deep.equal([
      'No one is signed in, so this vault cannot be reached: sign in, then try again.',
      'This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.',
    ])
  })
})

describe("SafebyokComponent.api, with the host's getUserId", () => {
  const SignedOutCases = [
    [() => Promise.resolve(null),      'treats a null user id as signed out'],
    [() => Promise.resolve(undefined), 'treats an undefined user id as signed out'],
    [() => Promise.resolve(''),        'treats an empty user id as signed out'],
    [() => null,                       'accepts a getUserId that answers synchronously'],
  ] as const

  for (const [getUserId, blurb] of SignedOutCases) {
    it(blurb, async () => {
      const host = TH.hostWith(getUserId)
      const CVX = host.createTest().withIdentity({ subject: 'u1' })
      const refusal = await TH.convexRefusalOf(CVX.query(host.api.safebyok.getVault, { ...u1 }))
      expect(refusal.kind).to.eq('identity_revoked')
    })
  }

  it("passes on a refusal getUserId throws, as GetUserId's second example shows", async () => {
    const host = TH.hostWith(TH.unlessSuspended)
    const CVX = host.createTest()
    await CVX.withIdentity({ subject: 'u1' }).mutation(host.api.safebyok.ensureVault, { draft: TH.gatelessOf('u1') })
    const refusal = await TH.convexRefusalOf(CVX.withIdentity({ subject: 'u1', suspended: true }).query(host.api.safebyok.getVault, { ...u1 }))
    expect(refusal).to.deep.equal({ kind: 'not_permitted', message: 'This account is suspended: its vault is closed to it.' })
  })

  it("lets the host map identities to user ids its own way", async () => {
    const host = TH.hostWith(async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      return identity ? `user|${identity.subject}` : null
    })
    const CVX = host.createTest().withIdentity({ subject: 'u1' })
    await CVX.mutation(host.api.safebyok.ensureVault, { draft: TH.gatelessOf('user|u1') })
    expect(await CVX.query(host.api.safebyok.getVault, { ...TH.scopeOf('user|u1') })).to.deep.equal({ vaultProps: TH.gatelessOf('user|u1'), boxes: [] })
    const refusal = await TH.convexRefusalOf(CVX.query(host.api.safebyok.getVault, { ...u1 }))
    expect(refusal.kind).to.eq('identity_revoked')
  })
})

/** The names of the functions in `fns`, in order. */
const namesOf = (fns: object) => Object.keys(fns).toSorted((left, right) => left.localeCompare(right))

describe("SafebyokComponent.api, at setup", () => {
  const { component } = TH.installedComponent()

  const BadOptsCases = [
    [undefined,                        'no options at all'],
    [null,                             'null for options'],
    [{},                               'a bag without getUserId'],
    [{ getUserID: () => null },        'a misspelt getUserId'],
    [{ getUserId: undefined },         'an undefined getUserId'],
    [{ getUserId: 'u1' },              'a getUserId that is text, not a function'],
    [{ getUserId: { subject: 'u1' } }, 'a getUserId that is an object, not a function'],
  ] as const

  for (const [opts, blurb] of BadOptsCases) {
    it(`refuses ${blurb} with a bad_option that says what to pass`, () => {
      expect(() => component.api(opts as never))
        .to.throw(/\{ getUserId \}, a function that answers who is signed in/)
        .with.property('refusalkind', 'bad_option')
    })
  }

  for (const [forgotten, blurb] of [[undefined, 'undefined'], [null, 'null'], ['safebyok', 'text']] as const) {
    it(`refuses ${blurb} for the component with a bad_option that says how to install it`, () => {
      expect(() => new SafebyokComponent(forgotten as never))
        .to.throw(/app\.use\(safebyok\) in convex\.config\.ts/)
        .with.property('refusalkind', 'bad_option')
    })
  }

  it("builds the same functions whether getUserId is sync or async", () => {
    const fromSync = namesOf(component.api({ getUserId: () => null }))
    expect(fromSync).to.not.be.empty
    expect(namesOf(component.api({ getUserId: () => Promise.resolve('u1') }))).to.deep.equal(fromSync)
  })

  it("calls getUserId as a method of the bag it was handed, so one that leans on this works", async () => {
    const { app, component } = TH.installedComponent()
    const host = app.defineModules({ safebyok: component.api(new SignedInAs('u1')) })
    const CVX = host.createTest()
    await CVX.mutation(host.api.safebyok.ensureVault, { draft: TH.gatelessOf('u1') })
    expect(await CVX.query(host.api.safebyok.getVault, { ...u1 })).to.deep.equal({ vaultProps: TH.gatelessOf('u1'), boxes: [] })
  })
})

/** A getUserId bag whose method answers from the bag itself: it fails if called detached from it. */
class SignedInAs {
  private readonly user_id: string

  constructor(user_id: string) { this.user_id = user_id }

  getUserId() { return this.user_id }
}

describe("SafebyokComponent.api, with the scope nested as it was before the arguments were flattened", () => {
  for (const [fnName, call] of NestedCalls) {
    it(`refuses ${fnName} at Convex's check of its arguments, its own user signed in, as no refusal of safebyok's`, async () => {
      const CVX = await seeded()
      let thrown: unknown = null
      try {
        await call(CVX.withIdentity({ subject: 'u1' }))
      } catch (err) {
        thrown = err
      }
      expect(thrown).to.be.instanceOf(Error).and.not.be.instanceOf(ConvexError)
      expect(String(thrown)).to.include('Validator error: Missing required field `applabel`')
    })
  }

  it("leaves the vault as it was after every call nesting its scope", async () => {
    const CVX = await seeded()
    const asU1 = CVX.withIdentity({ subject: 'u1' })
    for (const [, call] of NestedCalls) { await expect(call(asU1)).rejects.toThrow('Validator error') }
    const left = await asU1.query(api.safebyok.getVault, { ...u1 })
    expect(left?.vaultProps).to.deep.equal(TH.gatelessOf('u1'))
    expect(left?.boxes.map((box) => box.revision_tok)).to.deep.equal(['rev-a1'])
  })
})
