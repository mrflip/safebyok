import { within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'

// What the Login form keeps and clears after each of its buttons, for Nolo, whose bank is unborn. Each test drives
// the real app, its giver and the core, over the IndexedDB stores (fake-indexeddb) loaded with the fixture. A test records
// what the library does now: a change here is news for the readout table, not a regression by definition.

/** A fresh page with Nolo signed in, and the Login form filled in with Nolo's passphrase: the form's section. */
async function filledLogin(): Promise<HTMLElement> {
  await TH.loadPage('nolo')
  await TH.stageShown('unborn')
  const login = TH.region('Login: create the vault')
  TH.fill(login, { 'Username': 'nolo', 'New passphrase': TH.passphraseOf('nolo'), 'Confirm passphrase': TH.passphraseOf('nolo') })
  await within(login).findByText('Strong enough')
  return login
}

/** The readout of a form whose every field is empty, showing `message` and no refusal. */
function allEmpty(message: string) {
  return { username: 'empty', passphrase: 'empty', confirmation: 'empty', message, refusal: '(none)' }
}

/** The readout of a form whose every field still has its text, showing `message` and `refusal`. */
function allKept(message: string, refusal: string) {
  return { username: 'has text', passphrase: 'has text', confirmation: 'has text', message, refusal }
}

describe("the Login form", () => {
  it('Sign In: creates the vault, and every field is emptied, the username too', async () => {
    expect(await TH.press(await filledLogin(), 'Sign In')).to.deep.equal(allEmpty('Your vault is created.'))
    await TH.stageShown('unlocked')
  })

  it("Weak: refuses weak_passphrase, and every field keeps its text, the username too", async () => {
    expect(await TH.press(await filledLogin(), 'Weak')).to.deep.equal(allKept('That passphrase is too easy to guess.', 'weak_passphrase'))
    await TH.stageShown('unborn')
  })

  it("Exists: refuses gate_made_elsewhere, every field keeps its text, and the page still shows the bank unborn", async () => {
    const reading = await TH.press(await filledLogin(), 'Exists')
    expect(reading).to.deep.include({ username: 'has text', passphrase: 'has text', confirmation: 'has text', refusal: 'gate_made_elsewhere' })
    expect(reading['message']).to.match(/^This vault's passphrase was just set on another device/u)
    await TH.stageShown('unborn')
  })

  it("Failed: refuses storage_unavailable, and every field keeps its text, the username too", async () => {
    expect(await TH.press(await filledLogin(), 'Failed')).to.deep.equal(allKept('The dojo told its vaultDB to refuse this write.', 'storage_unavailable'))
    await TH.stageShown('unborn')
  })

  it('Dismiss: the form is reset, every field emptied, and nothing reaches the library', async () => {
    expect(await TH.press(await filledLogin(), 'Dismiss')).to.deep.equal(allEmpty('(none)'))
    await TH.stageShown('unborn')
  })

  it("Dismiss after a refusal still empties every field", async () => {
    const login = await filledLogin()
    await TH.press(login, 'Failed')
    expect(await TH.press(login, 'Dismiss')).to.deep.equal(allEmpty('(none)'))
  })

  it("Sign In after a refusal creates the vault from the text kept, and empties every field", async () => {
    const login = await filledLogin()
    await TH.press(login, 'Failed')
    expect(await TH.press(login, 'Sign In')).to.deep.equal(allEmpty('Your vault is created.'))
    await TH.stageShown('unlocked')
  })

  it("submits nothing until the confirmation matches the new passphrase", async () => {
    const login = await filledLogin()
    TH.fill(login, { 'Confirm passphrase': 'not the same' })
    expect(within(login).getByRole<HTMLButtonElement>('button', { name: 'Sign In' }).disabled).to.be.true
  })
})
