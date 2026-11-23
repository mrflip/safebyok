import { fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as TH from '../../test-helpers'
import * as World from './world'

// The validation card, today, for Hero, signed in and unlocked, over the fixture. A test records what React, zod and the
// library do now: a change here is news for whiteboard/20261123-dojo/dojo-findings.md, not a regression by definition.

/** A key of the wrong shape, an obvious fake. */
const WrongKey = 'sk-wrong-made-up-0001'

/** The validation card's example `examplename`, on a fresh page. */
async function shownExample(examplename: string): Promise<HTMLElement> {
  const tab = await World.practiceTab('hero', true)
  return World.example(World.card(tab, 'Hold the submit until zod passes, and show each message by its field'), examplename)
}

describe("the validation card, today", () => {
  it("holds a submit zod refuses, with each message by its field and the first field focused", async () => {
    const held = await shownExample('Do: check in onSubmit, before the form Action starts')
    TH.fill(held, { 'API key': WrongKey })
    fireEvent.click(within(held).getByRole('button', { name: 'Save' }))
    const nameField = within(held).getByLabelText('Name')
    const apiKey = within(held).getByLabelText<HTMLInputElement>('API key')
    await waitFor(() => { expect(TH.describingTextOf(nameField)).to.eq('Give the key a name.') })
    expect(TH.describingTextOf(apiKey)).to.eq('A dojo key starts with sk-dojo-.')
    expect([nameField.getAttribute('aria-invalid'), apiKey.getAttribute('aria-invalid')]).to.deep.equal(['true', 'true'])
    expect(document.activeElement).to.eq(nameField)
    expect(apiKey.value).to.eq(WrongKey)
    expect(within(held).getByRole('status').textContent).to.eq('')
  })

  it("keeps both fields, and puts neither the key nor any of it in a message or in React's state", async () => {
    const held = await shownExample('Do: check in onSubmit, before the form Action starts')
    TH.fill(held, { 'Name': 'dojo key', 'API key': WrongKey })
    fireEvent.click(within(held).getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(TH.describingTextOf(within(held).getByLabelText('API key'))).to.eq('A dojo key starts with sk-dojo-.') })
    expect([within(held).getByLabelText<HTMLInputElement>('Name').value, within(held).getByLabelText<HTMLInputElement>('API key').value]).to.deep.equal(['dojo key', WrongKey])
    expect(held.textContent).not.to.include('wrong')
    expect(TH.fiberHolds(held, WrongKey)).to.eq(false)
  })

  it("clears a message as its field is mended", async () => {
    const held = await shownExample('Do: check in onSubmit, before the form Action starts')
    TH.fill(held, { 'API key': World.ApiKey })
    fireEvent.click(within(held).getByRole('button', { name: 'Save' }))
    const nameField = within(held).getByLabelText('Name')
    await waitFor(() => { expect(TH.describingTextOf(nameField)).to.eq('Give the key a name.') })
    TH.fill(held, { Name: 'dojo key' })
    expect(TH.describingTextOf(nameField)).to.eq('')
    expect(nameField.getAttribute('aria-invalid')).to.be.null
  })

  it("saves a form that passes through the library's form action, its submit disabled meanwhile, which empties it", async () => {
    const held = await shownExample('Do: check in onSubmit, before the form Action starts')
    TH.fill(held, { 'Name': 'dojo key', 'API key': World.ApiKey })
    fireEvent.click(within(held).getByRole('button', { name: 'Save' }))
    expect(within(held).getByRole('button', { name: 'Saving…' })).to.have.property('disabled', true)
    await waitFor(() => { expect(within(held).getByRole('status').textContent).to.eq('Saved the key.') })
    expect(within(held).getByLabelText<HTMLInputElement>('API key').value).to.eq('')
    expect(TH.fiberHolds(held, World.ApiKey)).to.eq(false)
  })

  it("a check inside the form Action shows its messages by fields React has emptied", async () => {
    const inAction = await shownExample("Don't: check inside the form Action")
    TH.fill(inAction, { 'Name': 'dojo key', 'API key': WrongKey })
    fireEvent.click(within(inAction).getByRole('button', { name: 'Save' }))
    const apiKey = within(inAction).getByLabelText<HTMLInputElement>('API key')
    await waitFor(() => { expect(TH.describingTextOf(apiKey)).to.eq('A dojo key starts with sk-dojo-.') })
    expect([within(inAction).getByLabelText<HTMLInputElement>('Name').value, apiKey.value]).to.deep.equal(['', ''])
  })
})
