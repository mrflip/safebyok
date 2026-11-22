// A demonstration of a row in notes/wontfix.md (STYLE.md, *Tests*): it asserts the behaviour the row leaves as it is.
// It mocks and injects nothing; a cast at `useSuspenseQuery` is for the types alone. To reopen the row, bring something this test does not already show.
// If it fails, the behaviour has changed: invert it into a promise, move it beside useBank's tests, and delete the row.
/** The row "A stage change that reveals a suspending subtree shows its fallback". */
import { type UseSuspenseQueryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Suspense, useLayoutEffect } from 'react'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it } from 'vitest'
import type { BoxSelected, BoxShown } from '../../src/giver/react-giver'
import * as TH from '../test-helpers'

const RowChanged = 'notes/wontfix.md, "A stage change that reveals a suspending subtree shows its fallback": the behaviour has changed. Invert this test, move it, and delete the row'

describe("wontfix: a stage switch that shows a suspending subtree once unlocked", () => {
  it("renders the subtree's fallback when the bank unlocks", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    let fallbacksShown = 0
    // Counted on commit, not render: a transition renders a fallback it then keeps off the page.
    function Fallback() {
      useLayoutEffect(() => { fallbacksShown += 1 }, [])
      return <p>Loading the box</p>
    }
    function BoxReader() {
      const sok = world.SOK.useQueryOptions()
      const options = sok.acme.box(TH.JokesPath)
      // The cast is for the types alone: `queryFn` is a `skipToken` only until the bank is up, and this renders once it is.
      const { data: box } = useSuspenseQuery(options as UseSuspenseQueryOptions<BoxShown, Error, BoxSelected>, sok.acme.client)
      return <p>{`The box is for ${box?.sidecar['service'] as string}`}</p>
    }
    function StageSwitch() {
      const stage = world.Bank.useBank((snap) => snap.stage)
      if (stage !== 'unlocked') { return <p>{`The stage is ${stage}`}</p> }
      return <BoxReader />
    }
    // The boundary sits above the switch, so the locked screen is content already shown: a transition would keep it, where a new boundary shows its fallback regardless.
    render(TH.providerTreeOf(world, <Suspense fallback={<Fallback />}><StageSwitch /></Suspense>, { userid: TH.ProviderUser }))
    const device = await waitFor(() => world._cheat_device())
    await act(() => device.hello())
    await screen.findByText('The stage is locked')
    expect(fallbacksShown).to.eq(0)
    await act(() => device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase }))
    await screen.findByText('The box is for jokes')
    expect(fallbacksShown, RowChanged).to.be.greaterThan(0)
  })
})
