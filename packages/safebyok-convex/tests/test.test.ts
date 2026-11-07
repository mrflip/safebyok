import { describe, expect, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import * as DB from 'safebyok/storage'
import { register } from '../src/test'
import * as TH from './test-helpers'

const vault = TH.vaultAt()
const birth = { prior: DB.VoidRevision, ifAbsent: 'add', ifPresent: 'fail' } as const

describe("register", () => {
  it("installs the component under the name a host gave it, and hands back its functions", async () => {
    const backend = defineTestApp({ schema: defineSchema({}) }).defineModules({}).createTest()
    const vaultstore = register(backend, 'vaultstore')
    await backend.mutation(vaultstore.vaults.putVault, { record: vault, opts: birth })
    expect(await backend.query(vaultstore.vaults.getVault, { scope: TH.vaultScope })).to.deep.equal(vault)
  })

  it("serves a host app's re-exported functions, as defineTestApp's component helper", async () => {
    const { app, component } = TH.installedComponent()
    const { api, createTest } = app.defineModules({ safebyok: component.api({ getUserId: () => 'u1' }) })
    const backend = createTest()
    await backend.mutation(api.safebyok.putVault, { record: vault, opts: birth })
    expect(await backend.query(api.safebyok.getVault, { scope: TH.vaultScope })).to.deep.equal(vault)
  })
})
