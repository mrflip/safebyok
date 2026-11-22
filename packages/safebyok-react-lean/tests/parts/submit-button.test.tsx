import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SubmitButton } from '../../src/parts'

/** A form whose action waits on `settled`. */
function PendingForm({ settled }: Readonly<{ settled: Promise<void> }>) {
  return <form action={async () => { await settled }}><SubmitButton whilePending="Unlocking…">Unlock</SubmitButton></form>
}

describe("SubmitButton", () => {
  it("is disabled, showing what it says while pending, until the form's action settles", async () => {
    let settle!: () => void
    render(<PendingForm settled={new Promise((resolve) => { settle = resolve })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    const pending = await screen.findByRole<HTMLButtonElement>('button', { name: 'Unlocking…' })
    expect(pending.disabled).to.eq(true)
    settle()
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Unlock' }).disabled).to.eq(false) })
  })

  it("is disabled while the host says so", () => {
    render(<form><SubmitButton disabled>Create vault</SubmitButton></form>)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create vault' }).disabled).to.eq(true)
  })

  it("is disabled, showing what it says while pending, while the host says the form is pending, in a form that is no action", () => {
    const { rerender } = render(<form onSubmit={(event) => { event.preventDefault() }}><SubmitButton isPending whilePending="Saving…">Save</SubmitButton></form>)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saving…' }).disabled).to.eq(true)
    rerender(<form onSubmit={(event) => { event.preventDefault() }}><SubmitButton isPending={false} whilePending="Saving…">Save</SubmitButton></form>)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).to.eq(false)
  })

  it("still follows the form's action while isPending is false, and passes isPending to no attribute of the button", async () => {
    let settle!: () => void
    const settled = new Promise<void>((resolve) => { settle = resolve })
    render(<form action={async () => { await settled }}><SubmitButton isPending={false} whilePending="Working…">Go</SubmitButton></form>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    const pending = await screen.findByRole<HTMLButtonElement>('button', { name: 'Working…' })
    expect(pending.disabled).to.eq(true)
    expect(pending.hasAttribute('ispending')).to.eq(false)
    settle()
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Go' }).disabled).to.eq(false) })
  })
})
