import { describe, expect, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { register } from '../src/test'
import * as TH from './test-helpers'

const { BW } = TH
const buildArgs = { ask: BW.bankBuildAskOf() }
const ensureArgs = { ask: BW.bankEnsureAsk }

describe("register", () => {
  it("installs the component under the name a host gave it, and hands back its functions", async () => {
    const backend = defineTestApp({ schema: defineSchema({}) }).defineModules({}).createTest()
    const bankdb = register(backend, 'bankdb')
    await backend.mutation(bankdb.banks.buildBank, buildArgs)
    expect(await backend.query(bankdb.banks.ensureBank, ensureArgs)).to.deep.include({ bank: BW.bankAt() })
  })

  it("serves a host app's re-exported functions, as defineTestApp's component helper", async () => {
    const { api, createTest } = TH.bankHostWith(() => 'u1')
    const backend = createTest()
    await backend.mutation(api.safebyokBank.buildBank, buildArgs)
    expect(await backend.query(api.safebyokBank.ensureBank, ensureArgs)).to.deep.include({ bank: BW.bankAt() })
  })
})
