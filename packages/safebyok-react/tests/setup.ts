// Unmount each test's render after the test. Testing Library does this automatically only when
// vitest's globals are on, and these tests leave them off.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// jsdom has no showModal or close. These stand-ins open and close the element and focus its first control, nothing
// more. Tab trapping, Escape and the inert page need a real browser.
class DialogInTests extends HTMLDialogElement {
  override showModal() {
    this.open = true
    this.querySelector<HTMLElement>('button, input:not([hidden])')?.focus()
  }

  override close() { this.open = false }
}
const { showModal, close } = Object.getOwnPropertyDescriptors(DialogInTests.prototype)
Object.defineProperties(HTMLDialogElement.prototype, { showModal, close })
