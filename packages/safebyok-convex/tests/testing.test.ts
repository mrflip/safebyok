import { afterEach, describe, expect, it, vi } from 'vitest'
import { version as convexVersion } from 'convex'
import { ConvexClient } from 'convex/browser'
import * as TH from './test-helpers'
import { fakeDeployment } from '../src/testing'

const deployments: ReturnType<typeof fakeDeployment>[] = []
const deploy = () => {
  const deployment = fakeDeployment(TH.hostWith(TH.bySubject))
  deployments.push(deployment)
  return deployment
}
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

const u1 = TH.scopeOf('u1')

describe("fakeDeployment", () => {
  // The fake socket answers the sync protocol as convex 1.46 speaks it. A bump of convex fails
  // here, on purpose: check the fake against the new client's messages, then move this line.
  it("follows the sync protocol of the convex it was written against, 1.46", () => {
    expect(convexVersion).to.match(/^1\.46\./)
  })

  it("answers a ConvexClient's query and mutation, signed in as the subject it was given", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    await client.mutation(deployment.api.safebyok.ensureVaultProps, { vaultProps: TH.vaultPropsOf('u1') })
    expect(await client.query(deployment.api.safebyok.getVaultProps, { scope: u1 })).to.deep.equal(TH.vaultPropsOf('u1'))
  })

  it("connects a client of any other kind that its caller constructs, and closes it with the rest", async () => {
    const deployment = deploy()
    const closed = vi.fn()
    const made = deployment.connectWith('u1', (address, opts) => {
      const inner = new ConvexClient(address, opts)
      return { inner, close: async () => { closed(); await inner.close() } }
    })
    await made.inner.mutation(deployment.api.safebyok.ensureVaultProps, { vaultProps: TH.vaultPropsOf('u1') })
    expect(await made.inner.query(deployment.api.safebyok.getVaultProps, { scope: u1 })).to.deep.equal(TH.vaultPropsOf('u1'))
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

  it("runs the backend directly as a subject, or as no one, to arrange or inspect what is stored", async () => {
    const deployment = deploy()
    await deployment.as('u1').mutation(deployment.api.safebyok.ensureVaultProps, { vaultProps: TH.vaultPropsOf('u1') })
    expect(await deployment.as('u1').query(deployment.api.safebyok.getVaultProps, { scope: u1 })).to.deep.equal(TH.vaultPropsOf('u1'))
    const refusal = await TH.convexRefusalOf(deployment.as(null).query(deployment.api.safebyok.getVaultProps, { scope: u1 }))
    expect(refusal.kind).to.eq('identity_revoked')
  })

  it("lists the functions its sockets watch, and pushes a changed result to a watcher after a mutation through any socket", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const heard = vi.fn()
    client.onUpdate(deployment.api.safebyok.watchVault, { scope: u1 }, heard)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    await vi.waitFor(() => { expect(heard).toHaveBeenCalledTimes(1) })
    await deployment.client('u1').mutation(deployment.api.safebyok.ensureVaultProps, { vaultProps: TH.vaultPropsOf('u1') })
    await vi.waitFor(() => { expect(heard.mock.calls.length).to.be.greaterThan(1) })
  })

  it("signs every socket out, so a watched safebyok query is refused", async () => {
    const deployment = deploy()
    const failed = vi.fn()
    deployment.client('u1').onUpdate(deployment.api.safebyok.watchVault, { scope: u1 }, () => undefined, failed)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    deployment.signOut()
    await vi.waitFor(() => { expect(failed).toHaveBeenCalled() })
  })
})
