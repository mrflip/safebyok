// Unmount what each test rendered, which also sweeps each provider's bank. Testing Library only
// does this automatically when vitest's globals are on, and these tests leave them off.
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// jsdom has no showModal or close. These stand-ins open and close the dialog and focus its first control, nothing more:
// Tab, Escape and making the rest of the page inert need a real browser.
// The typeof check is there because the tests in tests/lib run with no DOM.
if (typeof HTMLDialogElement !== 'undefined') {
  class DialogInTests extends HTMLDialogElement {
    override showModal() {
      this.open = true
      this.querySelector<HTMLElement>('button, input:not([hidden])')?.focus()
    }

    override close() { this.open = false }
  }
  const { showModal, close } = Object.getOwnPropertyDescriptors(DialogInTests.prototype)
  Object.defineProperties(HTMLDialogElement.prototype, { showModal, close })
}

// A findBy or waitFor returns as soon as its condition holds, so a longer timeout costs nothing when
// the test passes. Some waits include making a vault (deriving its keys and storing its rows), which can take
// longer than the default one second on a loaded CI machine. The test's own timeout (vite.config.ts) is higher still.
configure({ asyncUtilTimeout: 5000 })
