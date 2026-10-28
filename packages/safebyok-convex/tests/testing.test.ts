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

/** A mutation from a client signed in as no one, which the host refuses as identity_revoked. */
const refusedMutation = (deployment: ReturnType<typeof deploy>) => (
  deployment.client(null).mutation(deployment.api.safebyok.ensureVault, { draft: TH.gatelessOf('u1') })
)
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

const u1 = TH.scopeOf('u1')

describe("fakeDeployment", () => {
  // The fake socket answers the sync protocol as convex 1.47 speaks it. A bump of convex fails
  // here, on purpose: check the fake against the new client's messages, then move this line.
  it("follows the sync protocol of the convex it was written against, 1.47", () => {
    expect(convexVersion).to.match(/^1\.47\./)
  })

  it("answers a ConvexClient's query and mutation, signed in as the subject it was given", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    await client.mutation(deployment.api.safebyok.ensureVault, { draft: TH.gatelessOf('u1') })
    expect(await client.query(deployment.api.safebyok.getVault, { ...u1 })).to.deep.equal({ vault: TH.gatelessOf('u1'), boxes: [] })
  })

  it("connects a client of any other kind that its caller constructs, and closes it with the rest", async () => {
    const deployment = deploy()
    const closed = vi.fn()
    const made = deployment.connectWith('u1', (address, opts) => {
      const inner = new ConvexClient(address, opts)
      return { inner, close: async () => { closed(); await inner.close() } }
    })
    await made.inner.mutation(deployment.api.safebyok.ensureVault, { draft: TH.gatelessOf('u1') })
    expect(await made.inner.query(deployment.api.safebyok.getVault, { ...u1 })).to.deep.equal({ vault: TH.gatelessOf('u1'), boxes: [] })
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

  it("logs quietly by default: a client's log is dropped, and its refused mutation reaches the console as the error it is", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* kept out of the test output */ })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { /* kept out of the test output */ })
    const deployment = deploy()
    const refusal = await TH.convexRefusalOf(refusedMutation(deployment))
    expect(refusal.kind).to.eq('identity_revoked')
    expect(consoleError).toHaveBeenCalledOnce()
    expect(String(consoleError.mock.calls[0]?.[0])).to.match(/\[CONVEX M\(safebyok:ensureVault\)\]/)
    expect(consoleWarn).toHaveBeenCalledTimes(0)
    expect(consoleLog).toHaveBeenCalledTimes(0)
  })

  it("gives every client the logger it was handed, so a test hears the refusal the client would have printed, as its third example shows", async () => {
    const spy = TH.spyLogger()
    const deployment = deploy({ logger: spy.logger })
    const refusal = await TH.convexRefusalOf(refusedMutation(deployment))
    expect(refusal.kind).to.eq('identity_revoked')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
    expect(spy.calls[0]?.message).to.match(/\[CONVEX M\(safebyok:ensureVault\)\]/)
  })

  it("hands the logger on in the options connectWith gives its maker", () => {
    const spy = TH.spyLogger()
    const deployment = deploy({ logger: spy.logger })
    const opts = deployment.connectWith('u1', (_address, given) => ({ given, close: () => Promise.resolve() })).given
    expect(opts.logger).to.not.eq(false)
    expect(opts.logger).to.not.eq(true)
    expect(opts.unsavedChangesWarning).to.eq(false)
  })

  it("calls a logger as its methods, so a logger built as a class keeps its this, and takes one with no verbose line", async () => {
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

  it("says all it hears to the console when handed the console itself", async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* kept out of the test output */ })
    const deployment = deploy({ logger: console })
    const refusal = await TH.convexRefusalOf(refusedMutation(deployment))
    expect(refusal.kind).to.eq('identity_revoked')
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it("refuses a host or options it cannot run, as 'bad_option', quoting none of what it was handed", () => {
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
    await deployment.as('u1').mutation(deployment.api.safebyok.ensureVault, { draft: TH.gatelessOf('u1') })
    expect(await deployment.as('u1').query(deployment.api.safebyok.getVault, { ...u1 })).to.deep.equal({ vault: TH.gatelessOf('u1'), boxes: [] })
    const refusal = await TH.convexRefusalOf(deployment.as(null).query(deployment.api.safebyok.getVault, { ...u1 }))
    expect(refusal.kind).to.eq('identity_revoked')
  })

  it("lists the functions its sockets watch, and pushes a changed result to a watcher after a mutation through any socket", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const heard = vi.fn()
    client.onUpdate(deployment.api.safebyok.watchVault, { ...u1 }, heard)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    await vi.waitFor(() => { expect(heard).toHaveBeenCalledTimes(1) })
    await deployment.client('u1').mutation(deployment.api.safebyok.ensureVault, { draft: TH.gatelessOf('u1') })
    await vi.waitFor(() => { expect(heard.mock.calls.length).to.be.greaterThan(1) })
  })

  it("signs every socket out, so a watched safebyok query is refused", async () => {
    const deployment = deploy()
    const failed = vi.fn()
    deployment.client('u1').onUpdate(deployment.api.safebyok.watchVault, { ...u1 }, () => undefined, failed)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    deployment.signOut()
    await vi.waitFor(() => { expect(failed).toHaveBeenCalled() })
  })
})
