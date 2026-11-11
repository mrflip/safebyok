import { afterEach, describe, expect, it, vi } from 'vitest'
import { version as convexVersion } from 'convex'
import { ConvexClient } from 'convex/browser'
import * as TH from './test-helpers'
import { fakeDeployment } from '../src/testing'
import type { FakeDeploymentOpts } from '../src/testing'

const deployments: ReturnType<typeof fakeDeployment>[] = []
const deploy = (opts?: FakeDeploymentOpts) => {
  const deployment = fakeDeployment(TH.hostWith(TH.bySubject), opts)
  deployments.push(deployment)
  return deployment
}

const vault = TH.vaultAt()
const putVaultArgs = TH.putVaultArgs(vault)
const vaultAsked = { scope: TH.vaultScope }
const watchRowsArgs = { scope: TH.bankScope }

/** Send a mutation from a client signed in as no one, which the host refuses as `identity_revoked`. */
const refusedMutation = (deployment: ReturnType<typeof deploy>) => (
  deployment.client(null).mutation(deployment.api.safebyok.putVault, putVaultArgs)
)
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

describe("fakeDeployment", () => {
  // The fake socket implements the sync protocol of convex 1.49. Upgrading convex fails this test on
  // purpose: check the fake against the new client's messages, then update the version here.
  it("follows the sync protocol of the convex it was written against, 1.49", () => {
    expect(convexVersion).to.match(/^1\.49\./)
  })

  it("serves a ConvexClient's query and mutation, signed in as the subject it was given", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    await client.mutation(deployment.api.safebyok.putVault, putVaultArgs)
    expect(await client.query(deployment.api.safebyok.getVault, vaultAsked)).to.deep.equal(vault)
  })

  it("connects a client of any other kind that its caller constructs, and closes it with the rest", async () => {
    const deployment = deploy()
    const closed = vi.fn()
    const made = deployment.connectWith('u1', (address, opts) => {
      const inner = new ConvexClient(address, opts)
      return { inner, close: async () => { closed(); await inner.close() } }
    })
    await made.inner.mutation(deployment.api.safebyok.putVault, putVaultArgs)
    expect(await made.inner.query(deployment.api.safebyok.getVault, vaultAsked)).to.deep.equal(vault)
    await deployment.close()
    expect(closed).toHaveBeenCalledOnce()
  })

  it("closes its clients once, however often it is closed", async () => {
    const deployment = deploy()
    const closed = vi.fn()
    deployment.connectWith('u1', () => ({ close: () => { closed(); return Promise.resolve() } }))
    await deployment.close()
    await deployment.close()
    expect(closed).toHaveBeenCalledOnce()
  })

  it("by default drops a client's log, and sends its refused mutation to console.error", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* kept out of the test output */ })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { /* kept out of the test output */ })
    const deployment = deploy()
    const refusal = await TH.convexRefusalOf(refusedMutation(deployment))
    expect(refusal.kind).to.eq('identity_revoked')
    expect(consoleError).toHaveBeenCalledOnce()
    expect(String(consoleError.mock.calls[0]?.[0])).to.match(/\[CONVEX M\(safebyok:putVault\)\]/)
    expect(consoleWarn).toHaveBeenCalledTimes(0)
    expect(consoleLog).toHaveBeenCalledTimes(0)
  })

  it("gives every client the logger it was given", async () => {
    const spy = TH.spyLogger()
    const deployment = deploy({ logger: spy.logger })
    const refusal = await TH.convexRefusalOf(refusedMutation(deployment))
    expect(refusal.kind).to.eq('identity_revoked')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
    expect(spy.calls[0]?.message).to.match(/\[CONVEX M\(safebyok:putVault\)\]/)
  })

  it("hands the logger on in the options connectWith gives its maker", () => {
    const spy = TH.spyLogger()
    const deployment = deploy({ logger: spy.logger })
    const opts = deployment.connectWith('u1', (_address, given) => ({ given, close: () => Promise.resolve() })).given
    expect(opts.logger).to.not.eq(false)
    expect(opts.logger).to.not.eq(true)
    expect(opts.unsavedChangesWarning).to.eq(false)
  })

  it("accepts a logger that is a class instance with no verbose method", async () => {
    class Tally {
      heard: string[] = []
      log() { this.heard.push('log') }
      warn() { this.heard.push('warn') }
      error() { this.heard.push('error') }
    }
    const tally = new Tally()
    const deployment = deploy({ logger: tally })
    const refusal = await TH.convexRefusalOf(refusedMutation(deployment))
    expect(refusal.kind).to.eq('identity_revoked')
    expect(tally.heard).to.deep.equal(['error'])
  })

  it("logs to the console when given the console itself", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* kept out of the test output */ })
    const deployment = deploy({ logger: console })
    const refusal = await TH.convexRefusalOf(refusedMutation(deployment))
    expect(refusal.kind).to.eq('identity_revoked')
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it("refuses a host or options it cannot run, quoting none of what it was given", () => {
    const host = TH.hostWith(TH.bySubject)
    const refuse = (attempt: () => unknown) => TH.thrownText(TH.expectSyncRefusal(attempt, 'bad_option'))
    refuse(() => fakeDeployment({ api: host.api } as never))
    refuse(() => fakeDeployment({ createTest: host.createTest } as never))
    refuse(() => fakeDeployment(null as never))
    refuse(() => fakeDeployment(host, { loger: console } as never))
    refuse(() => fakeDeployment(host, { logger: true } as never))
    refuse(() => fakeDeployment(host, { logger: { log: () => undefined, warn: () => undefined } } as never))
    const quoted = refuse(() => fakeDeployment(host, { logger: 'fake-secret-value' } as never))
    expect(quoted).to.not.include('fake-secret-value')
  })

  it("runs the backend directly as a subject, or as no one, to arrange or inspect what is stored", async () => {
    const deployment = deploy()
    await deployment.as('u1').mutation(deployment.api.safebyok.putVault, putVaultArgs)
    expect(await deployment.as('u1').query(deployment.api.safebyok.getVault, vaultAsked)).to.deep.equal(vault)
    const refusal = await TH.convexRefusalOf(deployment.as(null).query(deployment.api.safebyok.getVault, vaultAsked))
    expect(refusal.kind).to.eq('identity_revoked')
  })

  it("lists the functions its sockets watch, and pushes a changed result to a watcher after a mutation through any socket", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const heard = vi.fn()
    client.onUpdate(deployment.api.safebyok.watchRows, watchRowsArgs, heard)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    await vi.waitFor(() => { expect(heard).toHaveBeenCalledTimes(1) })
    await deployment.client('u1').mutation(deployment.api.safebyok.putVault, putVaultArgs)
    await vi.waitFor(() => { expect(heard.mock.calls.length).to.be.greaterThan(1) })
  })

  it("refuses a watched safebyok query once every socket is signed out", async () => {
    const deployment = deploy()
    const failed = vi.fn()
    deployment.client('u1').onUpdate(deployment.api.safebyok.watchRows, watchRowsArgs, () => undefined, failed)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    deployment.signOut()
    await vi.waitFor(() => { expect(failed).toHaveBeenCalled() })
  })
  it("has pushed a backend change to every watcher and cache by the time arrange returns", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const heard = vi.fn()
    client.onUpdate(deployment.api.safebyok.watchRows, watchRowsArgs, heard)
    await vi.waitFor(() => { expect(heard).toHaveBeenCalledTimes(1) })
    expect(await client.query(deployment.api.safebyok.getVault, vaultAsked)).to.be.null
    const answer = await deployment.arrange((backend) => backend.withIdentity({ subject: 'u1' }).mutation(deployment.api.safebyok.putVault, putVaultArgs))
    expect(answer).to.deep.include({ ok: true, act: 'born', vault })
    expect(heard.mock.calls.at(-1)?.[0]).to.deep.include({ vaults: [{ vaultlabel: vault.vaultlabel, vault }] })
    expect(await client.query(deployment.api.safebyok.getVault, vaultAsked)).to.deep.equal(vault)
  })
})
