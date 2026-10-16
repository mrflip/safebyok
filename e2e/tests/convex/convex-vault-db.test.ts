// The loops below over `ClientCases` are copies of those in
// `packages/safebyok-convex/tests/convex-vault-db.test.ts`, which run over `ConvexClient` so that
// package's suite stands alone: a change to a looped test is made in both.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConvexError } from 'convex/values'
import { ConvexReactClient } from 'convex/react'
import { VaultError, memoryDeviceDB, openVault } from 'safebyok'
import * as TH from './test-helpers'
import { convexVaultDB } from 'safebyok-convex'
import type { ConvexVaultClient, SafebyokApi } from 'safebyok-convex'
import { fakeDeployment } from 'safebyok-convex/testing'
import type { FakeDeployment } from 'safebyok-convex/testing'

type Deployment = FakeDeployment<ReturnType<typeof TH.hostWith>>

// Every deployment a test makes is closed after it, so no client keeps its socket's timers alive.
const deployments: Deployment[] = []
const deploy = () => {
  const deployment = fakeDeployment(TH.hostWith(TH.bySubject))
  deployments.push(deployment)
  return deployment
}
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

/** A real `ConvexReactClient` on `deployment`, signed in as `subject`, or as no one. */
const connectReact = (deployment: Deployment, subject: string | null) => (
  deployment.connectWith(subject, (address, opts) => new ConvexReactClient(address, opts))
)

/**
 * The clients convexVaultDB accepts that need a framework, each connected to `deployment` and
 * signed in as `subject`. The same tests run over `ConvexClient` in `safebyok-convex` itself.
 */
const ClientCases: [string, (deployment: Deployment, subject: string | null) => ConvexVaultClient][] = [
  ['ConvexReactClient', connectReact],
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

  it("refuses as identity_revoked over a ConvexReactClient that already holds the query's refusal", async () => {
    const deployment = deploy()
    const reactClient = connectReact(deployment, null)
    // The app's own watch of the same query, signed out: the client keeps its refusal, and
    // answers a one-shot query of it from there, synchronously.
    const watched = vi.fn()
    reactClient.watchQuery(deployment.api.safebyok.getBundle, { scope: u1 }).onUpdate(watched)
    await vi.waitFor(() => { expect(watched).toHaveBeenCalled() })
    await TH.expectRefusal(convexVaultDB(reactClient, deployment.api.safebyok).readBundle(u1), 'identity_revoked')
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
})

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

  it("still hears a change when the ConvexReactClient already watches the vault, and so sends no first result", async () => {
    const deployment = deploy()
    const reactClient = connectReact(deployment, 'u1')
    const watched = vi.fn()
    reactClient.watchQuery(deployment.api.safebyok.watchVault, { scope: u1 }).onUpdate(watched)
    await vi.waitFor(() => { expect(watched).toHaveBeenCalled() })

    const here = convexVaultDB(reactClient, deployment.api.safebyok)
    const onChange = vi.fn()
    here.subscribe(u1, onChange)
    await caughtUp(here)
    expect(onChange).not.toHaveBeenCalled()
    await convexVaultDB(deployment.client('u1'), deployment.api.safebyok).createBundle(TH.bundleOf('u1'))
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

describe("a vault over convexVaultDB, on two devices", () => {
  const NewPassphrase = 'a different staple, entirely'
  // Obvious fakes, never real keys.
  const anthropicKey = 'sk-ant-test-not-a-real-key'
  const openaiKey = { apiKey: 'sk-test-not-a-real-key', orgId: null }

  it("is made on one device, written, read on another, re-passphrased, and destroyed, each device hearing the other", async () => {
    const deployment = deploy()
    const laptop = await openOver(deployment.client('u1'), deployment.api.safebyok)
    const phone = await openOver(connectReact(deployment, 'u1'), deployment.api.safebyok)
    expect(laptop.getSnapshot().state).to.eq('absent')

    // The laptop makes the vault and stores a whisper; the phone hears of both.
    await laptop.unlock(TH.RealPassphrase)
    await laptop.store('anthropic_api_key', anthropicKey, { public: { note: 'work account' } })
    await vi.waitFor(() => {
      expect(phone.getSnapshot().state).to.eq('locked')
      expect(phone.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key'])
    })

    // The phone unlocks and reads what the laptop wrote; what the deployment holds is ciphertext.
    await phone.unlock(TH.RealPassphrase)
    expect(await phone.read('anthropic_api_key')).to.deep.equal(anthropicKey)
    const stored = await deployment.as('u1').query(deployment.api.safebyok.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })
    expect(JSON.stringify(stored)).to.not.include(anthropicKey)
    expect(JSON.stringify(stored)).to.not.include(TH.RealPassphrase)

    // The phone stores a second; the laptop hears it and reads it.
    await phone.store('openai_api_key', openaiKey)
    await vi.waitFor(() => {
      expect(laptop.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    })
    expect(await laptop.read('openai_api_key')).to.deep.equal(openaiKey)

    // The laptop changes the passphrase: the phone is locked out of its old unlock, and only the
    // new passphrase opens it again.
    await laptop.changePassphrase(TH.RealPassphrase, NewPassphrase)
    await vi.waitFor(() => { expect(phone.getSnapshot().state).to.eq('locked') })
    await TH.expectRefusal(phone.unlock(TH.RealPassphrase), 'wrong_passphrase')
    await phone.unlock(NewPassphrase)
    expect(await phone.read('anthropic_api_key')).to.deep.equal(anthropicKey)

    // The phone destroys the vault; the laptop hears it gone.
    await phone.destroy()
    await vi.waitFor(() => { expect(laptop.getSnapshot().state).to.eq('absent') })
    laptop.close()
    phone.close()
  })
})
