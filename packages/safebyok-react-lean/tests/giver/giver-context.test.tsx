import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { useGivenBank, useGivenGiver } from '../../src/giver/giver-context'
import * as TH from '../test-helpers'

/** `hook` rendered under the provider of each world in `worlds`, outermost first, or under none. */
function renderUnder<ResultT>(hook: () => ResultT, worlds: readonly TH.ProviderWorld[]) {
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    let tree = children
    for (const world of worlds.toReversed()) { tree = TH.providerTreeOf(world, tree, { userid: null }) }
    return tree
  }
  return renderHook(hook, { wrapper: Wrapper })
}

/** A bank handed as a prop, standing for one of the host's own. */
const PropBank = Object.freeze({ isPropBank: true })

/** A giver handed as a prop, standing for one of the host's own. */
const PropGiver = Object.freeze({ isPropGiver: true })

describe("useGivenBank", () => {
  it("finds the provider's bank when handed none", async () => {
    const world = await TH.buildProviderWorld()
    expect(renderUnder(() => useGivenBank(undefined), [world]).result.current).to.eq(world.Bank)
  })

  it("uses the bank it is handed over the provider's", async () => {
    const world = await TH.buildProviderWorld()
    expect(renderUnder(() => useGivenBank(PropBank), [world]).result.current).to.eq(PropBank)
  })

  it("uses the bank it is handed outside every provider", () => {
    expect(renderUnder(() => useGivenBank(PropBank), []).result.current).to.eq(PropBank)
  })

  it("finds the nearer provider's bank under two", async () => {
    const outer = await TH.buildProviderWorld()
    const inner = await TH.buildProviderWorld()
    expect(renderUnder(() => useGivenBank(undefined), [outer, inner]).result.current).to.eq(inner.Bank)
  })

  it("refuses outside every provider when handed none", () => {
    TH.expectSyncRefusal(() => renderUnder(() => useGivenBank(undefined), []), 'bad_record')
  })
})

describe("useGivenGiver", () => {
  it("finds the provider's giver when handed none", async () => {
    const world = await TH.buildProviderWorld()
    expect(renderUnder(() => useGivenGiver(undefined), [world]).result.current).to.eq(world.SOK)
  })

  it("uses the giver it is handed over the provider's", async () => {
    const world = await TH.buildProviderWorld()
    expect(renderUnder(() => useGivenGiver(PropGiver), [world]).result.current).to.eq(PropGiver)
  })

  it("uses the giver it is handed outside every provider", () => {
    expect(renderUnder(() => useGivenGiver(PropGiver), []).result.current).to.eq(PropGiver)
  })

  it("finds the nearer provider's giver under two", async () => {
    const outer = await TH.buildProviderWorld()
    const inner = await TH.buildProviderWorld()
    expect(renderUnder(() => useGivenGiver(undefined), [outer, inner]).result.current).to.eq(inner.SOK)
  })

  it("refuses outside every provider when handed none", () => {
    TH.expectSyncRefusal(() => renderUnder(() => useGivenGiver(undefined), []), 'bad_record')
  })
})
