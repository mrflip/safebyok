// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PsstModal } from '../../src/components/PsstModal'

describe("PsstModal", () => {
  it("shows the whisper and the box it came from", () => {
    render(<PsstModal boxlabel="anthropic_api_key" whisperShown="sk-ant-test-not-a-real-key" onClose={vi.fn()} />)
    expect(screen.getByRole('heading').textContent).to.include('sk-ant-test-not-a-real-key')
    expect(screen.getByText('anthropic_api_key')).to.not.be.null
  })

  it("closes from its button, and from a click on the scrim around it", () => {
    const onClose = vi.fn()
    const { container } = render(<PsstModal boxlabel="anthropic_api_key" whisperShown="sk-ant" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'My lips are sealed' }))
    const scrim = container.querySelector('.modal-scrim')
    if (scrim === null) { throw new Error('the modal lost its scrim') }
    fireEvent.click(scrim)
    expect(onClose).to.have.callCount(2)
  })

  it("stays open for a click inside the dialog itself", () => {
    const onClose = vi.fn()
    render(<PsstModal boxlabel="anthropic_api_key" whisperShown="sk-ant" onClose={onClose} />)
    fireEvent.click(screen.getByRole('heading'))
    expect(onClose).to.not.have.been.called
  })
})
