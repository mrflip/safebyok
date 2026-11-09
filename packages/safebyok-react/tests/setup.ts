// Each test's render is unmounted after it. Testing Library does this by itself only where
// vitest's globals are on, which these tests leave off.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// jsdom has no showModal or close. These open and shut the element and focus its first control, and no more: Tab, Escape
// and the inert page need a browser.
class DialogInTests extends HTMLDialogElement {
  override showModal() {
    this.open = true
    this.querySelector<HTMLElement>('button, input:not([hidden])')?.focus()
  }

  override close() { this.open = false }
}
const { showModal, close } = Object.getOwnPropertyDescriptors(DialogInTests.prototype)
Object.defineProperties(HTMLDialogElement.prototype, { showModal, close })
