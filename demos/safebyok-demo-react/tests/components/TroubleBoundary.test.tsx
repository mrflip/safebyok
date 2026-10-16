// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TroubleBoundary } from '../../src/components/TroubleBoundary'

/** A child that throws while rendering, as misuse thrown by the provider does. */
const Broken = (): never => { throw new Error('a bad label') }

describe("TroubleBoundary", () => {
  it("shows its children while nothing throws", () => {
    render(<TroubleBoundary><p>the page</p></TroubleBoundary>)
    expect(screen.queryByText('the page')).to.not.be.null
  })

  it("shows a calm word and a way to start again in place of a page that threw, quoting nothing of the error", () => {
    vi.spyOn(console, 'error').mockImplementation(() => { /* React reports what a boundary caught */ })
    const reload = vi.fn()
    render(<TroubleBoundary onReload={reload}><Broken /></TroubleBoundary>)
    expect(screen.getByRole('alert').textContent).to.match(/Your vault is safe: reload the page to try again/)
    expect(screen.queryByText(/a bad label/)).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
