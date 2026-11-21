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
})
