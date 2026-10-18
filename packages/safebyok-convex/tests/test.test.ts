import { describe, expect, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { SafebyokComponent } from '../src/server'
import { register } from '../src/test'
import * as TH from './test-helpers'

describe("register", () => {
  it("installs the component under the name a host gave it, and hands back its functions", async () => {
    const CVX = defineTestApp({ schema: defineSchema({}) }).defineModules({}).createTest()
    const vaultstore = register(CVX, 'vaultstore')
    await CVX.mutation(vaultstore.vaults.createBundle, { bundle: TH.bundleOf('u1') })
    expect(await CVX.query(vaultstore.vaults.getBundle, { scope: TH.scopeOf('u1') })).to.deep.equal(TH.bundleOf('u1'))
  })

  it("serves a host app's re-exported functions, as defineTestApp's component helper", async () => {
    const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
    const { api, createTest } = app.defineModules({
      safebyok: new SafebyokComponent(app.components.safebyok).api({ getUserId: () => 'u1' }),
    })
    const CVX = createTest()
    await CVX.mutation(api.safebyok.createBundle, { bundle: TH.bundleOf('u1') })
    expect(await CVX.query(api.safebyok.getBundle, { scope: TH.scopeOf('u1') })).to.deep.equal(TH.bundleOf('u1'))
  })
})
