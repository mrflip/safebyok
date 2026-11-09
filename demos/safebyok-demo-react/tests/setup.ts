// Each test's render is unmounted after it, and with it each provider's bank swept. Testing
// Library unmounts by itself only where vitest's globals are on, which these tests leave off.
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// jsdom has no showModal or close. These open and shut the element and focus its first control, and no more: Tab, Escape
// and the inert page need a browser.
// The tests of tests/lib run with no DOM.
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

// A findBy or waitFor returns the moment its condition has, so its ceiling costs nothing when
// the test passes. What it waits on includes making a vault (its keys, the rows it puts and stows), which on a
// loaded CI machine outlasts the default second; the test's own ceiling (vite.config.ts) is higher.
configure({ asyncUtilTimeout: 5000 })
