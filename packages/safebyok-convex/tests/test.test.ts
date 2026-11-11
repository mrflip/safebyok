import { describe, expect, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { register } from '../src/test'
import * as TH from './test-helpers'

const vault = TH.vaultAt()

describe("register", () => {
  it("installs the component under the name a host gave it, and hands back its functions", async () => {
    const backend = defineTestApp({ schema: defineSchema({}) }).defineModules({}).createTest()
    const vaultdb = register(backend, 'vaultdb')
    await backend.mutation(vaultdb.vaults.putVault, TH.putVaultArgs(vault))
    expect(await backend.query(vaultdb.vaults.getVault, TH.getVaultArgs())).to.deep.equal(vault)
  })

  it("serves a host app's re-exported functions, as defineTestApp's component helper", async () => {
    const { app, component } = TH.installedComponent()
    const { api, createTest } = app.defineModules({ safebyok: component.api({ getUserId: () => 'u1' }) })
    const backend = createTest()
    await backend.mutation(api.safebyok.putVault, TH.putVaultArgs(vault))
    expect(await backend.query(api.safebyok.getVault, TH.getVaultArgs())).to.deep.equal(vault)
  })
})
