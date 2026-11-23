import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DebounceCard, WaitMs } from '../../../src/components/practice/DebounceCard'
import { SaveMs } from '../../../src/lib/made-up-service'
import * as World from './world'

// The debounce card alone, today, under fake timers, with es-toolkit's debounce. The service and the save are the
// dojo's stand-ins. A test records what the debounce does now: a change here is news for
// whiteboard/20261123-dojo/dojo-findings.md.

/** The card's example `examplename`. */
function exampleShown(examplename: string): HTMLElement { return World.example(document.body, examplename) }

/** Let `ms` pass on the fake clock, settling what each timer it fires starts. */
async function pass(ms: number): Promise<void> { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

/** What the example `shown` says of its saves. */
function savesOf(shown: HTMLElement): string { return within(shown).getByLabelText('Saves').textContent }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  render(<DebounceCard />)
})

afterEach(() => { vi.useRealTimers() })

describe("the debounce card, today", () => {
  it("a debounced check holds the key until it fires, after the form has been cleared", async () => {
    const shown = exampleShown("Don't: a debounced check as the user types")
    fireEvent.change(within(shown).getByLabelText('API key'), { target: { value: World.ApiKey } })
    fireEvent.click(within(shown).getByRole('button', { name: 'Clear' }))
    await pass(WaitMs - 1)
    expect(within(shown).getByLabelText('Debounced check').textContent).to.eq('')
    await pass(1)
    expect(within(shown).getByLabelText('Debounced check').textContent).to.eq('The check ran with a 24-character key; the field held 0 characters.')
  })

  it("a debounced check fires after its form is gone", async () => {
    const shown = exampleShown("Don't: a debounced check as the user types")
    fireEvent.change(within(shown).getByLabelText('API key'), { target: { value: World.ApiKey } })
    fireEvent.click(within(shown).getByRole('button', { name: 'Remove the form' }))
    expect(within(shown).queryByLabelText('API key')).to.be.null
    await pass(WaitMs)
    expect(within(shown).getByLabelText('Debounced check').textContent).to.eq('The check ran with a 24-character key; the form was gone.')
  })

  it("a debounced submit merges the presses within its wait into one save", async () => {
    const shown = exampleShown("Don't: a debounced submit")
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    await pass(WaitMs / 2)
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    await pass(WaitMs)
    expect(savesOf(shown)).to.eq('Saves started: 1, ended: 0')
  })

  it("a debounced submit pressed again after its wait, while the save is pending, starts a second save", async () => {
    const shown = exampleShown("Don't: a debounced submit")
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    await pass(WaitMs)
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    await pass(WaitMs)
    expect(savesOf(shown)).to.eq('Saves started: 2, ended: 0')
    await pass(SaveMs)
    expect(savesOf(shown)).to.eq('Saves started: 2, ended: 2')
  })

  it("a submit disabled while pending starts one save for two presses", async () => {
    const shown = exampleShown('Do: the submit disabled while pending')
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    fireEvent.click(within(shown).getByRole('button', { name: 'Saving…' }))
    expect(savesOf(shown)).to.eq('Saves started: 1, ended: 0')
    await pass(SaveMs)
    expect(savesOf(shown)).to.eq('Saves started: 1, ended: 1')
    expect(screen.getAllByRole('button', { name: 'Save' })).to.have.lengthOf(2)
  })
})
