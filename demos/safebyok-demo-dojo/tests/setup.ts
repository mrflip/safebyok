// IndexedDB for jsdom, which has none: one fake database for the whole file, emptied and loaded by each test's own steps.
import 'fake-indexeddb/auto'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount what each test rendered. Testing Library only does this automatically when vitest's globals are on, and these
// tests leave them off.
afterEach(cleanup)

// jsdom has no showModal or close. These stand-ins open and close the dialog and focus its first control, nothing more.
class DialogInTests extends HTMLDialogElement {
  override showModal() {
    this.open = true
    this.querySelector<HTMLElement>('button, input:not([hidden])')?.focus()
  }

  override close() { this.open = false }
}
const { showModal, close } = Object.getOwnPropertyDescriptors(DialogInTests.prototype)
Object.defineProperties(HTMLDialogElement.prototype, { showModal, close })

// A findBy or waitFor returns as soon as its condition is true, so a longer timeout costs nothing when the test passes.
configure({ asyncUtilTimeout: 5000 })
