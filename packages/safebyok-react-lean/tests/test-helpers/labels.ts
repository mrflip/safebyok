/** Checks that a form's field is named by a label a user can see. */

import { screen } from '@testing-library/react'
import { expect } from 'vitest'

/** Assert that a visible `<label>` reading `text` names a field, and that any `aria-label` on the field says the same: answers the field. */
export function expectVisiblyLabelled(text: string): HTMLInputElement {
  const label = screen.getByText<HTMLLabelElement>(text, { selector: 'label' })
  const field = screen.getByLabelText<HTMLInputElement>(text)
  expect(field.id).to.eq(label.htmlFor)
  expect(field.getAttribute('aria-label') ?? text).to.eq(text)
  return field
}
