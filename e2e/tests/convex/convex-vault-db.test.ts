// The loops below over `ClientCases` are copies of those in
// `packages/safebyok-convex/tests/convex-vault-db.test.ts`, which run over `ConvexClient` so that
// package's suite stands alone: a change to a looped test is made in both.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConvexReactClient } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Bank, VaultError, memoryDeviceDB } from 'safebyok'
import * as TH from './test-helpers'
import { convexVaultDB } from 'safebyok-convex'
import type { ConvexVaultClient, SafebyokApi } from 'safebyok-convex'
import type { GetUserId, SafebyokErrorData } from 'safebyok-convex/server'
import { fakeDeployment } from 'safebyok-convex/testing'
import type { FakeDeployment } from 'safebyok-convex/testing'

type Deployment = FakeDeployment<ReturnType<typeof TH.hostWith>>

// Every deployment a test makes is closed after it, so no client keeps its socket's timers alive.
const deployments: Deployment[] = []
// These tests refuse mutations on purpose, and a client logs each as an error: a spy catches them, so
// the output stays clean.
const deploy = (getUserId: GetUserId = TH.bySubject) => {
  const deployment = fakeDeployment(TH.hostWith(getUserId), { logger: TH.spyLogger().logger })
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
 * transactions let a mutation behave; its limit is its own, so `maxBoxes` asks nothing of it.
 */
const devicesOver = (connect: (deployment: Deployment, subject: string | null) => ConvexVaultClient): TH.MakeVaultDBDevices => (turnstile) => {
  const deployment = deploy()
  return () => TH.perUser((user_id) => convexVaultDB({ client: TH.throughTurnstile(turnstile, connect(deployment, user_id), ['query', 'mutation']), api: deployment.api.safebyok }))
}

for (const [clientTitle, connect] of ClientCases) {
  TH.describeVaultDB(`convexVaultDB over a ${clientTitle}`, (vaultDBOpts) => {
    const deployment = deploy()
    return TH.perUser((user_id) => convexVaultDB({ ...vaultDBOpts, client: connect(deployment, user_id === '' ? null : user_id), api: deployment.api.safebyok }))
  }, {
    makeVaultDBFor: () => {
      const deployment = deploy()
      return (user_id) => convexVaultDB({ client: connect(deployment, user_id), api: deployment.api.safebyok })
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

/** `vaultDB`'s `u1` vault, made and filled with eight boxes of 900,000 bytes: a little under the component's limit. */
const nearlyFull = async (vaultDB: ReturnType<typeof convexVaultDB>) => {
  await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
  for (let ii = 0; ii < 8; ii++) {
    await TH.expectingGood(vaultDB).tryPutBox(u1, TH.noBoxYet, TH.heavyBox(`heavy_${String(ii)}`, 900_000))
  }
}

describe("convexVaultDB, refusing", () => {
  // Every verb's identity_revoked is the battery's line 5.4: these are what Convex's own says.
  for (const [clientTitle, connect] of ClientCases) {
    it(`refuses over a ${clientTitle} as identity_revoked when no one is signed in, saying so, its ConvexError as the cause`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB({ client: connect(deployment, null), api: deployment.api.safebyok })
      const refusal = await TH.expectBad(vaultDB.tryGetVault(u1), 'identity_revoked')
      expect(refusal).to.be.instanceOf(VaultError)
      expect(refusal.message).to.eq('No one is signed in, so this vault cannot be reached: sign in, then try again.')
      expect(refusal.cause).to.be.instanceOf(ConvexError).with.deep.property('data', { kind: 'identity_revoked', message: refusal.message })
    })

    it(`refuses over a ${clientTitle} as identity_revoked for another user's vault, saying so, its ConvexError as the cause`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB({ client: connect(deployment, 'u2'), api: deployment.api.safebyok })
      const refusal = await TH.expectBad(vaultDB.tryPutBox(u1, TH.noBoxYet, TH.boxOf('anthropic_api_key', 'a1')), 'identity_revoked')
      expect(refusal.message).to.eq('This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.')
      expect(refusal.cause).to.be.instanceOf(ConvexError).with.nested.property('data.kind', 'identity_revoked')
    })

    it(`refuses over a ${clientTitle} as not_permitted what the host's getUserId refuses so, its ConvexError as the cause (Contract: VaultDB, What an adapter must do)`, async () => {
      const deployment = deploy(() => { throw new ConvexError<SafebyokErrorData>({ kind: 'not_permitted', message: 'Guests may not keep a vault.' }) })
      const vaultDB = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      const refusal = await TH.expectBad(vaultDB.tryEnsureVault(TH.gatelessOf('u1')), 'not_permitted')
      expect(refusal.message).to.eq('Guests may not keep a vault.')
      expect(refusal.family).to.eq('condition')
      expect(refusal.cause).to.be.instanceOf(ConvexError).with.nested.property('data.kind', 'not_permitted')
    })
  }

  it("refuses as identity_revoked over a ConvexReactClient that already holds the query's refusal", async () => {
    const deployment = deploy()
    const reactClient = connectReact(deployment, null)
    // The app's own watch of the same query, signed out: the client keeps its refusal, and
    // answers a one-shot query of it from there, synchronously.
    const watched = vi.fn()
    reactClient.watchQuery(deployment.api.safebyok.getVault, { ...u1 }).onUpdate(watched)
    await vi.waitFor(() => { expect(watched).toHaveBeenCalled() })
    await TH.expectBad(convexVaultDB({ client: reactClient, api: deployment.api.safebyok }).tryGetVault(u1), 'identity_revoked')
  })

  for (const [clientTitle, connect] of ClientCases) {
    it(`refuses a box the component has no room for over a ${clientTitle} as vault_full, saying how full the vault is`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      await nearlyFull(vaultDB)
      const refusal = await TH.expectBad(vaultDB.tryPutBox(u1, TH.noBoxYet, TH.heavyBox('one_too_many', 200_000)), 'vault_full')
      expect(refusal.message).to.match(/bytes its storage holds of one vault/)
      expect(refusal.meta?.capacity).to.deep.equal(await TH.expectingGood(vaultDB).tryGetCapacity(u1))
      expect(refusal.meta?.capacity?.boxes).to.deep.equal({ used: 8, max: vaultDB.maxBoxes })
      const listed = await TH.boxesOf(vaultDB, u1)
      expect(listed.map((summary) => summary.boxlabel)).to.not.include('one_too_many')
    })
  }
})

/** Resolves once every message already sent to `vaultDB`'s client has arrived: one round trip behind them. */
const caughtUp = async (vaultDB: ReturnType<typeof convexVaultDB>) => { await TH.vaultRecordIn(vaultDB, u1) }

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
      const here = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      const there = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      const watch = await settledWatch(here)
      await TH.ensureGated(there, TH.vaultRecordOf('u1'))
      await vi.waitFor(() => { expect(watch.onChange.mock.calls.length).to.be.greaterThan(watch.heardBefore) })
    })

    it(`hears nothing over a ${clientTitle} of another vault's writes`, async () => {
      const deployment = deploy()
      const here = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      const watch = await settledWatch(here)
      await TH.ensureGated(here, { ...TH.vaultRecordOf('u1'), vaultlabel: 'work' })
      await caughtUp(here)
      expect(watch.onChange.mock.calls.length).to.eq(watch.heardBefore)
    })

    it(`unsubscribes once over a ${clientTitle}, however often it is called, leaving another watch of the vault be`, async () => {
      const deployment = deploy()
      const client = connect(deployment, 'u1')
      const alongside = await settledWatch(convexVaultDB({ client, api: deployment.api.safebyok }))
      const unsubscribe = convexVaultDB({ client, api: deployment.api.safebyok }).subscribe(u1, () => undefined)
      unsubscribe()
      unsubscribe()
      const heardBefore = alongside.onChange.mock.calls.length
      await TH.ensureGated(convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok }), TH.vaultRecordOf('u1'))
      await vi.waitFor(() => { expect(alongside.onChange.mock.calls.length).to.be.greaterThan(heardBefore) })
    })

    it(`calls onChange over a ${clientTitle} when a sign-out fails its watch, so the vault looks again`, async () => {
      const deployment = deploy()
      const spy = TH.spyLogger()
      const here = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok, logger: spy.logger })
      await TH.ensureGated(here, TH.vaultRecordOf('u1'))
      const watch = await settledWatch(here)
      deployment.signOut()
      await vi.waitFor(() => { expect(watch.onChange.mock.calls.length).to.be.greaterThan(watch.heardBefore) })
      await TH.expectBad(here.tryGetVault(u1), 'identity_revoked')
    })

    it(`subscribes calmly over a ${clientTitle} while signed out, and throws nothing later`, async () => {
      const deployment = deploy()
      const spy = TH.spyLogger()
      const here = convexVaultDB({ client: connect(deployment, null), api: deployment.api.safebyok, logger: spy.logger })
      const unsubscribe = here.subscribe(u1, () => undefined)
      // The refused watch arrives with the next round trip; an error thrown from inside the
      // client's socket would fail this test as unhandled.
      await TH.expectBad(here.tryGetVault(u1), 'identity_revoked')
      unsubscribe()
    })
  }

  it("still hears a change when the ConvexReactClient already watches the vault, and so sends no first result", async () => {
    const deployment = deploy()
    const reactClient = connectReact(deployment, 'u1')
    const watched = vi.fn()
    reactClient.watchQuery(deployment.api.safebyok.watchVault, { ...u1 }).onUpdate(watched)
    await vi.waitFor(() => { expect(watched).toHaveBeenCalled() })

    const here = convexVaultDB({ client: reactClient, api: deployment.api.safebyok })
    const onChange = vi.fn()
    here.subscribe(u1, onChange)
    await caughtUp(here)
    expect(onChange).not.toHaveBeenCalled()
    await TH.expectingGood(convexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok })).tryEnsureVault(TH.gatelessOf('u1'))
    await vi.waitFor(() => { expect(onChange).toHaveBeenCalledTimes(1) })
  })
})

/** The README's example: a vault opened over the app's own Convex client. */
const openOver = (client: ConvexVaultClient, api: SafebyokApi) => TH.settledVault(TH.memoryVaultOpts({ vaultDB: convexVaultDB({ client, api }) }))

describe("a vault over convexVaultDB, opened before sign-in", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`is refused as identity_revoked over a ${clientTitle}, its entry refused with no Vault object, and leaves no watch live on the deployment once let go`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB({ client: connect(deployment, null), api: deployment.api.safebyok })
      const { vaultlabel, ...bankOpts } = TH.memoryVaultOpts({ vaultDB })
      const bank = Bank.make(bankOpts)
      await TH.expectRefusal(bank.ensureVault({ vaultlabel }), 'identity_revoked')
      expect(bank.bankVaultOf({ vaultlabel })).to.deep.include({ lifecycle: 'refused' })
      expect(bank.vaultOf({ vaultlabel })).to.be.null
      bank.closeVault({ vaultlabel })
      await vi.waitFor(() => { expect(deployment.watching()).to.deep.equal([]) })
    })
  }
})

describe("a vault over convexVaultDB, when its user signs out", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`locks over a ${clientTitle} while idle, revoking its lease, and deletes nothing`, async () => {
      const deployment = deploy()
      const spy = TH.spyLogger()
      const deviceDB = memoryDeviceDB()
      const vaultDB = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok, logger: spy.logger })
      const vault = await TH.settledVault(TH.memoryVaultOpts({ vaultDB, deviceDB, logger: spy.logger }))
      await TH.unlock(vault, TH.RealPassphrase)
      await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test-not-a-real-key')
      deployment.signOut()
      await vi.waitFor(() => { expect(TH.stateOf(vault.getSnapshot())).to.eq('locked') })
      expect(await TH.expectingGood(deviceDB).tryGetLease(u1)).to.be.null
      // Storage it cannot trust has the vault say hello afresh at its next call, refused as ever.
      await TH.expectRefusal(vault.getWhisper('anthropic_api_key'), 'identity_revoked')
      await TH.expectRefusal(TH.unlock(vault, TH.RealPassphrase), 'identity_revoked')
      expect(spy.calls.map((heard) => heard.level)).to.include('log')
      const stored = await deployment.as('u1').query(deployment.api.safebyok.getVault, { ...u1 })
      expect(stored?.boxes).to.have.lengthOf(1)
      TH.closeVault(vault)
    })
  }
})

describe("a vault over convexVaultDB, on two devices", () => {
  const NewPassphrase = 'a different staple, entirely'
  // Obvious fakes, never real keys.
  const anthropicKey = 'sk-ant-test-not-a-real-key'
  const openaiKey = { apiKey: 'sk-test-not-a-real-key', orgId: null }

  it("is made on one device, written, read on another, re-passphrased, and deleted, each device hearing the other", async () => {
    const deployment = deploy()
    const laptop = await openOver(deployment.client('u1'), deployment.api.safebyok)
    const phone = await openOver(connectReact(deployment, 'u1'), deployment.api.safebyok)
    expect(TH.stateOf(laptop.getSnapshot())).to.eq('novel')

    // The laptop makes the vault and stores a whisper; the phone hears of both.
    await TH.unlock(laptop, TH.RealPassphrase)
    await laptop.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, anthropicKey)
    await vi.waitFor(() => {
      expect(TH.stateOf(phone.getSnapshot())).to.eq('locked')
      expect(phone.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key'])
    })

    // The phone unlocks and reads what the laptop wrote; what the deployment holds is ciphertext.
    await TH.unlock(phone, TH.RealPassphrase)
    expect(await phone.getWhisper('anthropic_api_key')).to.deep.equal(anthropicKey)
    const storedVault = await deployment.as('u1').query(deployment.api.safebyok.getVault, { ...u1 })
    const stored = await deployment.as('u1').query(deployment.api.safebyok.getBox, { ...u1, boxlabel: 'anthropic_api_key', expected: { vault_tok: storedVault!.vault.vault_tok } })
    expect(stored.got).to.be.true
    expect(JSON.stringify(stored)).to.not.include(anthropicKey)
    expect(JSON.stringify(stored)).to.not.include(TH.RealPassphrase)

    // The phone stores a second; the laptop hears it and reads it.
    await phone.putBox({ boxlabel: 'openai_api_key' }, openaiKey)
    await vi.waitFor(() => {
      expect(laptop.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    })
    expect(await laptop.getWhisper('openai_api_key')).to.deep.equal(openaiKey)

    // The laptop changes the passphrase: the phone is locked out of its old unlock, and only the
    // new passphrase opens it again.
    await TH.putWayin(laptop, TH.RealPassphrase, NewPassphrase)
    await vi.waitFor(() => { expect(TH.stateOf(phone.getSnapshot())).to.eq('locked') })
    await TH.expectRefusal(TH.unlock(phone, TH.RealPassphrase), 'wrong_passphrase')
    await TH.unlock(phone, NewPassphrase)
    expect(await phone.getWhisper('anthropic_api_key')).to.deep.equal(anthropicKey)

    // The phone deletes the vault; the laptop hears it gone, and its bank hands out no Vault object for it.
    await TH.del(phone, NewPassphrase)
    await vi.waitFor(() => { expect(TH.bankOf(laptop).bankVaultOf({ vaultlabel: 'main' })).to.have.nested.property('err.refusalkind', 'vault_gone') })
    TH.closeVault(laptop)
    TH.closeVault(phone)
  })
})
