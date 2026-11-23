import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mirrorSecrets } from '../../../src/lib/mirror'
import * as TH from '../../test-helpers'

// What the two Scenarios forms do today, one test for each of the Coach's claims, for Hero, signed in and unlocked. Each
// drives the real app, its giver and the core, over the IndexedDB stores (fake-indexeddb) loaded with the fixture. jsdom
// moves no focus on a click, so a test focuses and blurs as a browser would around each press. A test records what the
// library does now: a change here is news for the table in whiteboard/20261123-dojo/dojo-findings.md, and for the
// checklists in src/components/scenarios/claims.ts.

/** The fixture's password in Hero's box `github`, which the envman form edits. */
const StoredPassword = 'fixture-password-of-hero_at_github'

/** A password typed into the envman form, an obvious fake. */
const TypedPassword = 'made-up-password-1234'

/** An API key typed into the API key form, an obvious fake. */
const TypedApiKey = 'sk-ant-api03-made-up-key-abcdefghijklmnop'

/** How long the vaultDB holds a save here, where a test watches the form meanwhile, in place of the page's six seconds. */
const HoldMs = 400

/** What the mirror shows of a secret input holding nothing. */
const Empty = 'value: (empty) | attribute: (none)'

/** What the mirror shows of a secret input holding `text` in its value, with no value attribute. */
function holding(text: string): string { return `value: "${text}" | attribute: (none)` }

/** The Scenarios tab with Hero signed in and unlocked, the vaultDB holding a save {@link HoldMs} when told to, and the dojo's modules this page loaded. */
async function scenariosTab() {
  await TH.loadPage('hero')
  await TH.unlock(TH.passphraseOf('hero'))
  const dojo = await import('../../../src/lib/dojo')
  dojo.vaultDB.holdMs = HoldMs
  const tab = TH.showTab('Scenarios', 'Scenarios: two forms as a user meets them')
  return { tab, dojo }
}

/** The envman form, its box's username shown, with its two fields. */
async function envmanForm() {
  const { tab, dojo } = await scenariosTab()
  const form = within(tab).getByRole('form', { name: 'Envman' })
  const username = within(form).getByLabelText<HTMLInputElement>('Username')
  const password = within(form).getByLabelText<HTMLInputElement>('Password')
  await waitFor(() => { expect(username.value).to.eq('hero_at_github') })
  return { tab, dojo, form, username, password }
}

/** What the form's mirror shows now, written afresh. */
function readMirror(form: HTMLElement): string {
  mirrorSecrets()
  return within(form).getByLabelText('Mirror').textContent
}

/** Focus `input`, as a click or a Tab into it does. */
function focus(input: HTMLElement): void { act(() => { input.focus() }) }

/** Blur `input`, as a click elsewhere does. */
function blur(input: HTMLElement): void { act(() => { input.blur() }) }

/** Press the quill, wait for the password to show, and type {@link TypedPassword} over it. */
async function edit(form: HTMLElement, password: HTMLInputElement): Promise<void> {
  fireEvent.click(within(form).getByRole('button', { name: 'Edit password' }))
  await waitFor(() => { expect(password.value).to.eq(StoredPassword) })
  fireEvent.change(password, { target: { value: TypedPassword } })
}

/** Press the envman form's Save, as a mouse does: the field focused blurs first. */
function pressSave(form: HTMLElement): void {
  const focused = document.activeElement
  if ((focused instanceof HTMLElement) && form.contains(focused)) { blur(focused) }
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
}

/** Wait for the envman form's log to show one save ended, and none under way. */
async function saveEnded(form: HTMLElement): Promise<void> {
  await waitFor(() => {
    const log = within(form).getByLabelText('Saves')
    expect(log.textContent).to.not.include('saving')
    expect(log.querySelectorAll('time')).to.have.lengthOf(1)
  })
}

/** The box `github` as stored, read through the giver: its password and its sidecar. */
async function storedBox(dojo: Awaited<ReturnType<typeof scenariosTab>>['dojo']) {
  return await dojo.Dojo.withWhisper('github', (whisper, unsealed) => ({ password: String(whisper['password']), sidecar: unsealed.sidecar }))
}

describe("the Scenarios tab", () => {
  it("shows beside each form its checklist, a row for each claim", async () => {
    const { tab } = await scenariosTab()
    const { ApiKeyClaims, EnvmanClaims } = await import('../../../src/components/scenarios/claims')
    for (const [title, claims] of [['Envman claims', EnvmanClaims], ['API key claims', ApiKeyClaims]] as const) {
      const rows = within(within(tab).getByRole('table', { name: title })).getAllByRole('row').slice(1)
      expect(rows.map((row) => row.querySelector('td')?.textContent)).to.deep.equal(claims.map(({ claim }) => claim))
    }
  })
})

describe("the envman form, today", () => {
  it("shows the password masked: an empty password input, its placeholder dots", async () => {
    const { form, password } = await envmanForm()
    expect(password.type).to.eq('password')
    expect(password.placeholder).to.eq('••••••••')
    expect(readMirror(form)).to.eq(Empty)
  })

  it("shows the password, read-only, when the eye is pressed, masks it on a second press, and shows it on any focus as well", async () => {
    const { form, password } = await envmanForm()
    fireEvent.click(within(form).getByRole('button', { name: 'Show password' }))
    await waitFor(() => { expect(readMirror(form)).to.eq(holding(StoredPassword)) })
    expect([password.type, password.readOnly]).to.deep.equal(['text', true])

    fireEvent.click(within(form).getByRole('button', { name: 'Hide password' }))
    expect([password.type, readMirror(form)]).to.deep.equal(['password', Empty])

    focus(password)
    await waitFor(() => { expect(readMirror(form)).to.eq(holding(StoredPassword)) })
    expect(password.type).to.eq('text')
  })

  it("makes the password an edit of its cleartext on a double click", async () => {
    const { form, password } = await envmanForm()
    focus(password)
    await waitFor(() => { expect(password.value).to.eq(StoredPassword) })
    expect(password.readOnly).to.eq(true)
    fireEvent.doubleClick(password)
    expect(password.readOnly).to.eq(false)
    fireEvent.change(password, { target: { value: TypedPassword } })
    expect([password.type, readMirror(form)]).to.deep.equal(['text', holding(TypedPassword)])
  })

  it("makes the password an edit of its cleartext on one press of the quill", async () => {
    const { form, password } = await envmanForm()
    fireEvent.click(within(form).getByRole('button', { name: 'Edit password' }))
    await waitFor(() => { expect(password.value).to.eq(StoredPassword) })
    expect([password.type, password.readOnly, document.activeElement === password]).to.deep.equal(['text', false, true])
  })

  it("masks the password on blur, emptying it unless it was typed into, which stays in its value", async () => {
    const { form, password } = await envmanForm()
    focus(password)
    await waitFor(() => { expect(password.value).to.eq(StoredPassword) })
    blur(password)
    expect([password.type, readMirror(form)]).to.deep.equal(['password', Empty])

    await edit(form, password)
    blur(password)
    expect([password.type, password.placeholder, readMirror(form)]).to.deep.equal(['password', '', holding(TypedPassword)])
  })

  it("writes the password typed when Save is pressed with the field masked", async () => {
    const { form, password, dojo } = await envmanForm()
    await edit(form, password)
    blur(password)
    pressSave(form)
    await saveEnded(form)
    expect(await storedBox(dojo)).to.deep.equal({ password: TypedPassword, sidecar: { username: 'hero_at_github' } })
  })

  it("writes the password typed on Enter in the field, then leaves the field focused, emptied and editable", async () => {
    const { form, password, dojo } = await envmanForm()
    await edit(form, password)
    fireEvent.submit(form)
    await saveEnded(form)
    const box = await storedBox(dojo)
    expect(box.password).to.eq(TypedPassword)
    expect([document.activeElement === password, password.readOnly, password.type, readMirror(form)]).to.deep.equal([true, false, 'password', Empty])
    // A reveal begun would make the field read-only at once, while its text is on its way: the eye begins none.
    fireEvent.click(within(form).getByRole('button', { name: 'Show password' }))
    expect([password.readOnly, password.type, readMirror(form)]).to.deep.equal([false, 'password', Empty])
  })

  it("writes the username and the password with one press of Save", async () => {
    const { form, username, password, dojo } = await envmanForm()
    fireEvent.change(username, { target: { value: 'hero_renamed' } })
    await edit(form, password)
    pressSave(form)
    await saveEnded(form)
    expect(await storedBox(dojo)).to.deep.equal({ password: TypedPassword, sidecar: { username: 'hero_renamed' } })
  })

  it("loses what is typed while a save is held, once it lands, keeping what was saved", async () => {
    const { form, username, password, dojo } = await envmanForm()
    fireEvent.change(username, { target: { value: 'hero_renamed' } })
    await edit(form, password)
    dojo.vaultDB.holdNextWrite()
    pressSave(form)
    await waitFor(() => { expect(within(form).getByLabelText('Saves').textContent).to.include('saving') })
    expect([username.value, password.type, readMirror(form)]).to.deep.equal(['hero_renamed', 'password', holding(TypedPassword)])
    fireEvent.change(username, { target: { value: 'hero_typed_meanwhile' } })
    await saveEnded(form)
    expect([username.value, password.type, password.placeholder, readMirror(form)]).to.deep.equal(['hero_renamed', 'password', '••••••••', Empty])
    expect(await storedBox(dojo)).to.deep.equal({ password: TypedPassword, sidecar: { username: 'hero_renamed' } })
  })

  it("saves the box when the username is left with an edit, where saving on blur is chosen", async () => {
    const { tab, form, username, dojo } = await envmanForm()
    fireEvent.click(within(tab).getByRole('checkbox', { name: /Save when either field loses focus/ }))
    expect(within(form).queryByRole('button', { name: 'Save' })).to.be.null
    focus(username)
    fireEvent.change(username, { target: { value: 'hero_renamed' } })
    blur(username)
    await saveEnded(form)
    expect(await storedBox(dojo)).to.deep.equal({ password: StoredPassword, sidecar: { username: 'hero_renamed' } })
  })

  it("saves the box when the password is left with an edit, and nothing when it is left unchanged, where saving on blur is chosen", async () => {
    const { tab, form, password, dojo } = await envmanForm()
    fireEvent.click(within(tab).getByRole('checkbox', { name: /Save when either field loses focus/ }))
    focus(password)
    await waitFor(() => { expect(password.value).to.eq(StoredPassword) })
    blur(password)
    expect(within(form).getByLabelText('Saves').textContent).to.eq('')

    await edit(form, password)
    blur(password)
    await saveEnded(form)
    const box = await storedBox(dojo)
    expect(box.password).to.eq(TypedPassword)
  })
})

/** The API key form, with its title and key fields. */
async function apiKeyForm() {
  const { tab, dojo } = await scenariosTab()
  const form = within(tab).getByRole('form', { name: 'API key' })
  return { tab, dojo, form, title: within(form).getByLabelText<HTMLInputElement>('Title'), apiKey: within(form).getByLabelText<HTMLInputElement>('API key') }
}

describe("the API key form, today", () => {
  it("takes the title and the key as typed, in plain uncontrolled inputs", async () => {
    const { form, title, apiKey } = await apiKeyForm()
    fireEvent.change(title, { target: { value: 'Anthropic' } })
    fireEvent.change(apiKey, { target: { value: TypedApiKey } })
    expect([title.value, title.getAttribute('value'), readMirror(form)]).to.deep.equal(['Anthropic', null, holding(TypedApiKey)])
  })

  it("makes the key's field a password input", async () => {
    const { apiKey } = await apiKeyForm()
    expect(apiKey.type).to.eq('password')
  })

  it("reveals the key with a button that reads Show, and masks it with Hide", async () => {
    const { form, apiKey } = await apiKeyForm()
    fireEvent.change(apiKey, { target: { value: TypedApiKey } })
    fireEvent.click(within(form).getByRole('button', { name: 'Show' }))
    expect(apiKey.type).to.eq('text')
    fireEvent.click(within(form).getByRole('button', { name: 'Hide' }))
    expect(apiKey.type).to.eq('password')
  })

  it("shows the key masked while it saves, and once stored only by its mask beneath an emptied form", async () => {
    const { tab, form, title, apiKey, dojo } = await apiKeyForm()
    fireEvent.change(title, { target: { value: 'Anthropic' } })
    fireEvent.change(apiKey, { target: { value: TypedApiKey } })
    fireEvent.click(within(form).getByRole('button', { name: 'Show' }))
    dojo.vaultDB.holdNextWrite()
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(within(form).getByLabelText('Result').textContent).to.eq('saving…') })
    expect([apiKey.type, readMirror(form)]).to.deep.equal(['password', holding(TypedApiKey)])

    const stored = within(tab).getByLabelText('Stored key')
    await waitFor(() => { expect(stored.textContent).to.eq('Stored: Anthropic sk-*****************mnop') })
    expect([title.value, apiKey.type, readMirror(form)]).to.deep.equal(['', 'password', Empty])
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await waitFor(() => { expect(stored.textContent).to.eq('Stored: Anthropic sk-*********************') })
  })
})
