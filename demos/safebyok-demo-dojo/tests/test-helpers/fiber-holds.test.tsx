import { act, render, screen } from '@testing-library/react'
import { startTransition, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fiberHolds } from './fiber-holds'

// The fiber walker, today, against React 19.3: a place React keeps an update that the walker must reach.

/** A made-up secret, an obvious fake. */
const Secret = 'sk-dojo-made-up-held-0001'

describe("fiberHolds, today", () => {
  it("finds a transition's update that an urgent render skipped, before it commits", async () => {
    const gate: { open?: () => void } = {}
    const blocker = new Promise<void>((resolve) => { gate.open = resolve })
    const setters: { setSecret?: (text: string) => void, bump?: () => void } = {}
    function Holder() {
      const [secret, setSecret] = useState('')
      const [count, setCount] = useState(0)
      setters.setSecret = setSecret
      setters.bump = () => { setCount((prior) => prior + 1) }
      return <p data-testid="holder">{secret.length} {count}</p>
    }
    render(<Holder />)
    act(() => { startTransition(async () => { setters.setSecret?.(Secret); await blocker }) })
    act(() => { setters.bump?.() })
    const holder = screen.getByTestId('holder')
    expect(holder.textContent).to.eq('0 1')
    expect(fiberHolds(holder, Secret)).to.eq(true)
    await act(async () => { gate.open?.(); await blocker })
    expect(holder.textContent).to.eq(`${String(Secret.length)} 1`)
  })
})
