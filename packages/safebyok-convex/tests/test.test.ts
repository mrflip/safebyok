import { describe, expect, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { register } from '../src/test'
import * as TH from './test-helpers'

const birthArgs = { ask: TH.birthBankAskOf() }
const bankArgs = { ask: TH.getBankAskOf() }

describe("register", () => {
  it("installs the component under the name a host gave it, and hands back its functions", async () => {
    const backend = defineTestApp({ schema: defineSchema({}) }).defineModules({}).createTest()
    const vaultdb = register(backend, 'vaultdb')
    await backend.mutation(vaultdb.things.birthBank, birthArgs)
    expect(await backend.query(vaultdb.things.getBank, bankArgs)).to.deep.nested.include({ 'actual.gate': TH.gateThingOf() })
  })

  it("serves a host app's re-exported functions, as defineTestApp's component helper", async () => {
    // register @example
    const { api, createTest } = TH.vaultHostWith(() => 'u1')
    const backend = createTest()
    await backend.mutation(api.safebyokVault.birthBank, birthArgs)
    expect(await backend.query(api.safebyokVault.getBank, bankArgs)).to.deep.nested.include({ 'actual.gate': TH.gateThingOf() })
  })
})
