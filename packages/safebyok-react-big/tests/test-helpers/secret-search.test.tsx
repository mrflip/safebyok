import { render } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

const Secret = 'correct horse battery staple'

/** An object that holds itself, so a search that does not track what it has seen never ends. */
function cyclicHolding(val: unknown): Record<string, unknown> {
  const outer: Record<string, unknown> = { inner: [{ val }] }
  outer['self'] = outer
  return outer
}

/** A FormData with `val` in its field `passphrase`. */
function formHolding(val: string): FormData {
  const form = new FormData()
  form.append('passphrase', val)
  return form
}

/** A component keeping `held` as its state. */
function Holder({ held }: Readonly<{ held: string }>) {
  const [val] = useState(() => `${held}!`)
  return <p>{val.length}</p>
}

const HoldingCases = [
  // where the text can be:
  [cyclicHolding(Secret),                                      true,   'a string nested in arrays and objects, through a cycle'],
  [cyclicHolding(`it was ${Secret}, I think`),                 true,   'a string that contains the text'],
  [new Map([[Secret, 1]]),                                     true,   'a Map key'],
  [new Map([[1, { val: Secret }]]),                            true,   'a Map value'],
  [new Set([Secret]),                                          true,   'a Set entry'],
  [formHolding(Secret),                                        true,   'a FormData entry'],
  [new Error(`not ${Secret}`),                                 true,   "an Error's message"],
  [new Error('refused', { cause: { val: Secret } }),           true,   "an Error's cause"],
  [Object.defineProperty({}, 'hidden', { value: Secret }),     true,   'a property that is not enumerable'],
  // where it is not:
  [cyclicHolding('correct horse'),                             false,  'a string holding part of the text'],
  [{ get val() { return Secret } },                            false,  'a getter, never called'],
  [{ val: () => Secret },                                      false,  'a function, never called'],
] as const

describe("holdsText", () => {
  for (const [root, expected, blurb] of HoldingCases) {
    it(blurb, () => { expect(TH.holdsText(root, Secret)).to.eq(expected) })
  }
})

describe("reactTreeOf", () => {
  it("reaches a component's hook state", () => {
    const { container } = render(<Holder held={Secret} />)
    expect(TH.holdsText(TH.reactTreeOf(container), `${Secret}!`)).to.eq(true)
  })

  it("holds no text the tree never had", () => {
    const { container } = render(<Holder held="correct horse" />)
    expect(TH.holdsText(TH.reactTreeOf(container), Secret)).to.eq(false)
  })

  it("refuses a container nothing is rendered into", () => {
    expect(() => TH.reactTreeOf(document.createElement('div'))).to.throw('Nothing is rendered')
  })
})
