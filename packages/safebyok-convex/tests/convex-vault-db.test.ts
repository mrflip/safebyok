// The loops below over `ClientCases` have copies in `e2e/tests/convex/convex-vault-db.test.ts`, which
// run over `ConvexReactClient` (this package lists no framework): a change to a looped test is
// made in both.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { anyApi } from 'convex/server'
import { ConvexError } from 'convex/values'
import { VaultError, memoryDeviceDB, openVault } from 'safebyok'
import * as TH from './test-helpers'
import { convexVaultDB } from '../src/index'
import { MaxVaultLockboxes } from '../src/component/tallies'
import type { ConvexVaultClient, SafebyokApi } from '../src/index'
import type { GetUserId } from '../src/server'
import { fakeDeployment } from '../src/testing'
import type { FakeDeployment } from '../src/testing'

type Deployment = FakeDeployment<ReturnType<typeof TH.hostWith>>

// Every deployment a test makes is closed after it, so no client keeps its socket's timers alive.
const deployments: Deployment[] = []
const deploy = (getUserId: GetUserId = TH.bySubject) => {
  const deployment = fakeDeployment(TH.hostWith(getUserId))
  deployments.push(deployment)
  return deployment
}
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

/**
 * The clients convexVaultDB accepts that need no framework, each connected to `deployment` and
 * signed in as `subject`. `ConvexReactClient` is run in `e2e/`, which holds React.
 */
const ClientCases: [string, (deployment: Deployment, subject: string | null) => ConvexVaultClient][] = [
  ['ConvexClient', (deployment, subject) => deployment.client(subject)],
]

/**
 * Devices over a fresh deployment, each with clients of its own whose queries and mutations pass
 * the race's turnstile. The fake deployment runs one call at a time, as Convex's serializable
 * transactions let a mutation behave; its limit is its own, so `maxLockboxes` asks nothing of it.
 */
const devicesOver = (connect: (deployment: Deployment, subject: string | null) => ConvexVaultClient): TH.MakeVaultDBDevices => (turnstile) => {
  const deployment = deploy()
  return () => TH.perUser((userId) => convexVaultDB(TH.throughTurnstile(turnstile, connect(deployment, userId), ['query', 'mutation']), deployment.api.safebyok))
}

for (const [clientTitle, connect] of ClientCases) {
  TH.describeVaultDB(`convexVaultDB over a ${clientTitle}`, () => {
    const deployment = deploy()
    return TH.perUser((userId) => convexVaultDB(connect(deployment, userId === '' ? null : userId), deployment.api.safebyok))
  }, {
    comparesVaultKeyEpoch: false,
    makeVaultDBFor: () => {
      const deployment = deploy()
      return (userId) => convexVaultDB(connect(deployment, userId), deployment.api.safebyok)
    },
    makeDevices: devicesOver(connect),
    pushes:      true,
  })

  describe(`convexVaultDB's devices over a ${clientTitle}, for the battery's races`, () => {
    it("send every write's mutation through the race's turnstile", async () => {
      await TH.expectRoundTripsThroughTurnstile(devicesOver(connect))
    })
  })
}

const u1 = TH.scopeOf('u1')

describe("convexVaultDB, as it is made", () => {
  it("holds at most Convex's document limit in one record", () => {
    const deployment = deploy()
    expect(convexVaultDB(deployment.client('u1'), deployment.api.safebyok).maxRecordBytes).to.eq(1_048_576)
  })

  it("holds at most half of what one Convex function may read in one vault, since erasing reads it twice", () => {
    const deployment = deploy()
    expect(convexVaultDB(deployment.client('u1'), deployment.api.safebyok).maxVaultBytes).to.eq(8 * 1024 * 1024)
  })

  it("declares the component's own limit on lockboxes, which the component enforces", () => {
    const deployment = deploy()
    expect(convexVaultDB(deployment.client('u1'), deployment.api.safebyok).maxLockboxes).to.eq(MaxVaultLockboxes)
    expect(MaxVaultLockboxes).to.eq(8000)
  })

  const NotClientCases = [
    [null,                                     'refuses null for a client'],
    [{},                                       'refuses an object with no Convex calls'],
    [{ query: () => null, mutation: () => null }, 'refuses a client that cannot watch a query'],
  ] as const

  for (const [notClient, blurb] of NotClientCases) {
    it(blurb, () => {
      const deployment = deploy()
      expect(() => convexVaultDB(notClient as unknown as ConvexVaultClient, deployment.api.safebyok)).to.throw(VaultError, /needs a Convex client/)
    })
  }

  it("refuses the whole generated api, where it wants api.safebyok", () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    // A host's generated `api` answers any property, as anyApi does.
    expect(() => convexVaultDB(client, anyApi as unknown as SafebyokApi)).to.throw(VaultError, /api\.safebyok/)
    expect(() => convexVaultDB(client, {} as SafebyokApi)).to.throw(VaultError, /api\.safebyok/)
    expect(convexVaultDB(client, anyApi['safebyok'] as unknown as SafebyokApi).maxRecordBytes).to.eq(1_048_576)
  })
})

/** `vaultDB`'s `u1` vault, made and filled with eight lockboxes of 900,000 bytes: a little under the component's limit. */
const nearlyFull = async (vaultDB: ReturnType<typeof convexVaultDB>) => {
  await vaultDB.createBundle(TH.bundleOf('u1'))
  for (let ii = 0; ii < 8; ii++) {
    await vaultDB.updateBox(u1, TH.heavyBox(`heavy_${String(ii)}`, 900_000), TH.noBoxYet)
  }
}

describe("convexVaultDB, refusing", () => {
  /** One call of each verb that reaches the deployment, on `u1`'s vault. */
  const EveryVerb: [string, (vaultDB: ReturnType<typeof convexVaultDB>) => Promise<unknown>][] = [
    ['readBundle',   (vaultDB) => vaultDB.readBundle(u1)],
    ['createBundle', (vaultDB) => vaultDB.createBundle(TH.bundleOf('u1'))],
    ['updateBundle', (vaultDB) => vaultDB.updateBundle(TH.bundleOf('u1', { unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 })],
    ['readBox',      (vaultDB) => vaultDB.readBox(u1, 'anthropic_api_key')],
    ['listBoxes',    (vaultDB) => vaultDB.listBoxes(u1)],
    ['updateBox',    (vaultDB) => vaultDB.updateBox(u1, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet)],
    ['eraseBox',     (vaultDB) => vaultDB.eraseBox(u1, 'anthropic_api_key', TH.thisVault)],
    ['eraseVault',   (vaultDB) => vaultDB.eraseVault(u1, TH.thisVault)],
  ]

  for (const [clientTitle, connect] of ClientCases) {
    for (const [verb, call] of EveryVerb) {
      it(`refuses ${verb} over a ${clientTitle} as identity_revoked when no one is signed in`, async () => {
        const deployment = deploy()
        const vaultDB = convexVaultDB(connect(deployment, null), deployment.api.safebyok)
        const refusal = await TH.expectRefusal(call(vaultDB), 'identity_revoked')
        expect(refusal).to.be.instanceOf(VaultError)
        expect(refusal.message).to.eq('No one is signed in, so this vault cannot be reached: sign in, then try again.')
        expect(refusal.cause).to.be.instanceOf(ConvexError)
      })

      it(`refuses ${verb} over a ${clientTitle} as identity_revoked for another user's vault`, async () => {
        const deployment = deploy()
        const vaultDB = convexVaultDB(connect(deployment, 'u2'), deployment.api.safebyok)
        const refusal = await TH.expectRefusal(call(vaultDB), 'identity_revoked')
        expect(refusal.message).to.eq('This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.')
      })
    }
  }

  it("leaves another user's vault as it was, after their every refused attempt", async () => {
    const deployment = deploy()
    const owner = convexVaultDB(deployment.client('u1'), deployment.api.safebyok)
    await owner.createBundle(TH.bundleOf('u1'))
    const intruder = convexVaultDB(deployment.client('u2'), deployment.api.safebyok)
    for (const [, call] of EveryVerb) { await TH.expectRefusal(call(intruder), 'identity_revoked') }
    expect(await owner.readBundle(u1)).to.deep.equal(TH.bundleOf('u1'))
    expect(await owner.listBoxes(u1)).to.deep.equal([])
  })

  it("lists a lockbox the component holds but safebyok would never write as damaged, under its boxlabel", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const vaultDB = convexVaultDB(client, deployment.api.safebyok)
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('openai', 'two'), TH.noBoxYet)
    // Past the adapter's own checks, straight to the component, which bounds no time's form.
    const lockbox = { ...TH.boxOf('anthropic', 'one'), changed_at: Date.UTC(2026, 9, 14) + 0.5 }
    await client.mutation(deployment.api.safebyok.updateBox, { scope: u1, lockbox, expected: TH.noBoxYet })
    const listed = await vaultDB.listBoxes(u1)
    expect(listed.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['anthropic', true], ['openai', false]])
    await vaultDB.eraseBox(u1, 'anthropic', { vault_id: 'vault-id-u1' })
    expect(await vaultDB.listBoxes(u1)).to.have.lengthOf(1)
  })

  for (const [clientTitle, connect] of ClientCases) {
    it(`refuses a lockbox the component has no room for over a ${clientTitle} as vault_full`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      await nearlyFull(vaultDB)
      const refusal = await TH.expectRefusal(vaultDB.updateBox(u1, TH.heavyBox('one_too_many', 200_000), TH.noBoxYet), 'vault_full')
      expect(refusal.message).to.eq('This vault is full: erase a lockbox to make room, then try again.')
      expect(refusal.cause).to.be.instanceOf(ConvexError)
      const listed = await vaultDB.listBoxes(u1)
      expect(listed.map((summary) => summary.boxlabel)).to.not.include('one_too_many')
    })
  }

  it("has a vault's store() refuse as vault_full a lockbox the component has no room for, under the vault's own maxLockboxes", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const vault = await openOver(client, deployment.api.safebyok)
    await vault.unlock(TH.RealPassphrase)
    // Lockboxes the vault never opens, leaving less room than one whisper of 40,000 bytes takes.
    const vaultDB = convexVaultDB(client, deployment.api.safebyok)
    const bundle = await vaultDB.readBundle(u1)
    const vaultId = bundle?.vault_id ?? ''
    for (const [ii, bytes] of [...Array.from({ length: 8 }, () => 900_000), 120_000].entries()) {
      await vaultDB.updateBox(u1, TH.heavyBox(`heavy_${String(ii)}`, bytes), { vault_id: vaultId, revision_id: null, vault_key_epoch: 1 })
    }
    const refusal = await TH.expectRefusal(vault.store('anthropic_api_key', 'x'.repeat(40_000)), 'vault_full')
    expect(refusal.message).to.eq('This vault is full: erase a lockbox to make room, then try again.')
    expect(vault.getSnapshot().boxes.map((box) => box.boxlabel)).to.not.include('anthropic_api_key')
    vault.close()
  })

  it("makes any other failure storage_unavailable, carrying nothing of Convex's error", async () => {
    const deployment = deploy(() => { throw new Error('the auth provider is down') })
    const refusal = await TH.expectRefusal(convexVaultDB(deployment.client('u1'), deployment.api.safebyok).readBundle(u1), 'storage_unavailable')
    expect(refusal.cause).to.be.undefined
    expect(refusal.message).to.include("your Convex deployment's logs, or, for trouble before the call left, the browser console")
    expect(TH.thrownText(refusal)).to.not.include('the auth provider is down')
  })
})

describe("a record the deployment refused", () => {
  // Distinctive values throughout, so that finding one in what is thrown means it was quoted.
  const subject = 'user_quotable'
  const scope = { applabel: 'quotable_app', user_id: subject, vaultlabel: 'quotable_vault' }
  const quotableKey = { vault_key_epoch: 52_874, prior_vault_key: { vault_key_epoch: 52_873, vault_key_wrapped: TH.fakeCiphered('prior_quotable') } }
  const quotableUnlocks = [TH.envelopeOf('quotable_phrase', { vault_key_epoch: 52_874, device_id: 'device_quotable', registered_at: Date.UTC(2026, 8, 17) })]
  const standing = TH.bundleOf(subject, { ...scope, ...quotableKey, unlock_epoch: 52_871, unlocks: quotableUnlocks })
  const nextBundle = { ...standing, unlock_epoch: 52_872, vault_key_passphrase_wrapped: TH.fakeCiphered('rewrapped_quotable') }
  const lockbox = TH.boxOf('quotable_box', 'quotable_rev', { public_json: TH.publicJsonOf({ note: 'a quotable bag' }), vault_key_epoch: 52_874 })
  // The whisper's codec and schema version are the same in every lockbox, so nothing to quote.
  const { whisper_codec: _codec, whisper_schema_version: _version, ...quotableBox } = lockbox

  const RefusedWrites: [string, unknown, (vaultDB: ReturnType<typeof convexVaultDB>) => Promise<unknown>][] = [
    ['updateBundle', nextBundle, (vaultDB) => vaultDB.updateBundle(nextBundle, { vault_id: standing.vault_id, unlock_epoch: 52_871 })],
    ['updateBox',    quotableBox, (vaultDB) => vaultDB.updateBox(scope, lockbox, { vault_id: standing.vault_id, revision_id: null, vault_key_epoch: 52_874 })],
  ]

  for (const [verb, record, write] of RefusedWrites) {
    it(`is quoted nowhere in what ${verb} throws: message, properties or causes`, async () => {
      const deployment = deploy()
      const client = deployment.client(subject)
      await convexVaultDB(client, deployment.api.safebyok).createBundle(standing)
      // The core strips a field it does not know, so this one strays in on the wire, past it,
      // where Convex's validator refuses the call. convex-test's validator names the field; a
      // dev deployment's quotes the arguments too (notes/security.md). The refusal carries none of it.
      const straying: ConvexVaultClient = {
        query:    client.query.bind(client),
        onUpdate: client.onUpdate.bind(client),
        mutation: (mutationRef, args) => client.mutation(mutationRef, { ...args, stray_field: 'x' }),
      }
      const vaultDB = convexVaultDB(straying, deployment.api.safebyok)
      const refusal = await TH.expectRefusal(write(vaultDB), 'storage_unavailable')
      expect(refusal.cause).to.be.undefined
      const thrown = TH.thrownText(refusal)
      expect(thrown).to.not.include('stray_field')
      const quotables = TH.leafTexts({ scope, record })
      for (const leaf of quotables) {
        expect(thrown).to.not.include(leaf)
      }
      expect(await vaultDB.readBundle(scope)).to.deep.equal(standing)
      expect(await vaultDB.readBox(scope, 'quotable_box')).to.be.null
    })
  }

  it("is quoted nowhere in what updateBox throws when Convex's validator quotes the refused argument", async () => {
    const deployment = deploy()
    const client = deployment.client(subject)
    await convexVaultDB(client, deployment.api.safebyok).createBundle(standing)
    const expected = { vault_id: standing.vault_id, revision_id: null, vault_key_epoch: lockbox.vault_key_epoch }
    const quotedArgs = misbagged({ scope, lockbox, expected })
    await expect(client.mutation(deployment.api.safebyok.updateBox, quotedArgs)).rejects.toThrow('quoted_by_convex')
    const quoting: ConvexVaultClient = {
      query:    client.query.bind(client),
      onUpdate: client.onUpdate.bind(client),
      mutation: (mutationRef, args) => client.mutation(mutationRef, misbagged(args)),
    }
    const vaultDB = convexVaultDB(quoting, deployment.api.safebyok)
    const refusal = await TH.expectRefusal(vaultDB.updateBox(scope, lockbox, expected), 'storage_unavailable')
    expect(refusal.cause).to.be.undefined
    expect(TH.thrownText(refusal)).to.not.include('quoted_by_convex')
    expect(await vaultDB.readBox(scope, 'quotable_box')).to.be.null
  })
})

/** `args` with its lockbox's public bag not text, past the core's checks: convex-test's validator quotes it. */
const misbagged = <ArgsT extends object>(args: ArgsT): ArgsT => ({ ...args, lockbox: { ...(args as { lockbox?: object }).lockbox, public_json: ['quoted_by_convex'] } })

/** Resolves once every message already sent to `vaultDB`'s client has arrived: one round trip behind them. */
const caughtUp = async (vaultDB: ReturnType<typeof convexVaultDB>) => { await vaultDB.readBundle(u1) }

/**
 * A watch of `u1`'s vault through `vaultDB`, once its first result has come in: its `onChange`,
 * how often that had been called by then (`heardBefore`), and its `unsubscribe`.
 */
const settledWatch = async (vaultDB: ReturnType<typeof convexVaultDB>) => {
  const onChange = vi.fn()
  const unsubscribe = vaultDB.subscribe(u1, onChange)
  await vi.waitFor(() => { expect(onChange).toHaveBeenCalled() })
  return { onChange, unsubscribe, heardBefore: onChange.mock.calls.length }
}

describe("convexVaultDB.subscribe", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`calls onChange over a ${clientTitle} when another device writes to the vault`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const there = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const watch = await settledWatch(here)
      await there.createBundle(TH.bundleOf('u1'))
      await vi.waitFor(() => { expect(watch.onChange.mock.calls.length).to.be.greaterThan(watch.heardBefore) })
    })

    it(`hears nothing over a ${clientTitle} once unsubscribed`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const there = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const watch = await settledWatch(here)
      watch.unsubscribe()
      const heardBefore = watch.onChange.mock.calls.length
      await there.createBundle(TH.bundleOf('u1'))
      await caughtUp(here)
      expect(watch.onChange.mock.calls.length).to.eq(heardBefore)
    })

    it(`hears nothing over a ${clientTitle} of another vault's writes`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const watch = await settledWatch(here)
      await here.createBundle({ ...TH.bundleOf('u1'), vaultlabel: 'work' })
      await caughtUp(here)
      expect(watch.onChange.mock.calls.length).to.eq(watch.heardBefore)
    })

    it(`unsubscribes once over a ${clientTitle}, however often it is called, leaving another watch of the vault be`, async () => {
      const deployment = deploy()
      const client = connect(deployment, 'u1')
      const alongside = await settledWatch(convexVaultDB(client, deployment.api.safebyok))
      const unsubscribe = convexVaultDB(client, deployment.api.safebyok).subscribe(u1, () => undefined)
      unsubscribe()
      unsubscribe()
      const heardBefore = alongside.onChange.mock.calls.length
      await convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok).createBundle(TH.bundleOf('u1'))
      await vi.waitFor(() => { expect(alongside.onChange.mock.calls.length).to.be.greaterThan(heardBefore) })
    })

    it(`calls onChange over a ${clientTitle} when a sign-out fails its watch, so the vault looks again`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      await here.createBundle(TH.bundleOf('u1'))
      const watch = await settledWatch(here)
      deployment.signOut()
      await vi.waitFor(() => { expect(watch.onChange.mock.calls.length).to.be.greaterThan(watch.heardBefore) })
      await TH.expectRefusal(here.readBundle(u1), 'identity_revoked')
    })

    it(`subscribes calmly over a ${clientTitle} while signed out, and throws nothing later`, async () => {
      const deployment = deploy()
      const here = convexVaultDB(connect(deployment, null), deployment.api.safebyok)
      const unsubscribe = here.subscribe(u1, () => undefined)
      // The refused watch arrives with the next round trip; an error thrown from inside the
      // client's socket would fail this test as unhandled.
      await TH.expectRefusal(here.readBundle(u1), 'identity_revoked')
      unsubscribe()
    })
  }

  it("calls onChange for the first result too: the vault's first read may have missed a write", async () => {
    const deployment = deploy()
    const here = convexVaultDB(deployment.client('u1'), deployment.api.safebyok)
    const onChange = vi.fn()
    here.subscribe(u1, onChange)
    await vi.waitFor(() => { expect(onChange).toHaveBeenCalledTimes(1) })
  })
})

/** The README's example: a vault opened over the app's own Convex client. */
const openOver = (client: ConvexVaultClient, api: SafebyokApi) => openVault(TH.memoryVaultOpts({ vaultDB: convexVaultDB(client, api) }))

describe("a vault over convexVaultDB, opened before sign-in", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`is refused as identity_revoked over a ${clientTitle}, leaving no watch live on the deployment`, async () => {
      const deployment = deploy()
      await TH.expectRefusal(openOver(connect(deployment, null), deployment.api.safebyok), 'identity_revoked')
      await vi.waitFor(() => { expect(deployment.watching()).to.deep.equal([]) })
    })
  }
})

describe("a vault over convexVaultDB, when its user signs out", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`locks over a ${clientTitle} while idle, forgetting its remembered unlock, and erases nothing`, async () => {
      const deployment = deploy()
      const spy = TH.spyLogger()
      const deviceDB = memoryDeviceDB()
      const vaultDB = convexVaultDB(connect(deployment, 'u1'), deployment.api.safebyok)
      const vault = await openVault(TH.memoryVaultOpts({ vaultDB, deviceDB, logger: spy.logger }))
      await vault.unlock(TH.RealPassphrase)
      await vault.store('anthropic_api_key', 'sk-ant-test-not-a-real-key')
      deployment.signOut()
      await vi.waitFor(() => { expect(vault.getSnapshot().state).to.eq('locked') })
      expect(await deviceDB.readUnlock(u1)).to.be.null
      await TH.expectRefusal(vault.read('anthropic_api_key'), 'vault_locked')
      await TH.expectRefusal(vault.unlock(TH.RealPassphrase), 'identity_revoked')
      expect(spy.calls.map((heard) => heard.level)).to.include('log')
      expect(await deployment.as('u1').query(deployment.api.safebyok.listBoxSummaries, { scope: u1 })).to.have.lengthOf(1)
      vault.close()
    })
  }
})
