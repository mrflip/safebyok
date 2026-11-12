// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bank } from 'safebyok'
import type { MemoryBankDB } from 'safebyok/storage'
import { useBox } from 'safebyok-react'
import { ApiKeyVaultlabel, DomApiKeyBoxlabel } from '../../src/lib/saved-api-key'
import { KnockKnockDom } from '../../src/components/KnockKnockDom'
import * as TH from '../test-helpers'

const FakeApiKey = 'sk-ant-fake-knock-key'
const Punchline = 'Banana who? Banana split, gotta run!'

/** Render the flow beside the vault probe, in a bank for `u1`. */
const renderFlow = () => TH.renderInBank(<><KnockKnockDom /><TH.VaultProbe /></>)

/** A button that veils the flow's box. The page itself offers no way to veil. */
const BoxVeiler = () => {
  const box = useBox(ApiKeyVaultlabel, DomApiKeyBoxlabel)
  return <button type="button" onClick={() => { box?.veil() }}>Veil</button>
}

/** Find the API key field, which appears once the box exists. */
const apiKeyField = async () => await screen.findByLabelText<HTMLInputElement>('Anthropic API key')

/** Press Add key, build the vault through the provider's dialog, and wait for the empty field. */
const addKey = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
  await TH.answerPassphraseDialog()
  await screen.findByRole('button', { name: 'Save' })
  return await apiKeyField()
}

/** Add a key box, type the fake key into its field, and save it. */
const saveKey = async () => {
  const field = await addKey()
  fireEvent.change(field, { target: { value: FakeApiKey } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved.')
  return field
}

/** Wait until the flow is ready, then type `whosThere` and knock. */
const knockAs = async (whosThere: string) => {
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Knock' }).disabled).to.be.false })
  fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: whosThere } })
  fireEvent.click(screen.getByRole('button', { name: 'Knock' }))
}

/** The box rows `bankDB` has stored for the 'main' vault, by boxlabel. */
const storedBoxRows = (bankDB: MemoryBankDB) => {
  const { bank, vaultrows } = bankDB._cheat_shelfOf({ user_id: 'u1', banklabel: 'acme' })
  const { bank_tok } = bank as { bank_tok: string }
  const { vault_tok } = vaultrows.get('main') as { vault_tok: string }
  return bankDB._cheat_boxRowsOf({ user_id: 'u1', banklabel: 'acme', vaultlabel: 'main' }, bank_tok, vault_tok)
}

describe("KnockKnockDom", () => {
  it("builds the vault and an empty box on Add key, and shows its field ready to type in", async () => {
    await renderFlow()
    expect(screen.getByText('No key saved yet.')).to.not.be.null
    const field = await addKey()
    await TH.expectProbe('present unlocked')
    expect(field.value).to.eq('')
    expect(screen.getByRole('button', { name: 'Save' })).to.not.be.null
  })

  it("keeps the field showing after Add key under StrictMode", async () => {
    await TH.renderInBank(<StrictMode><KnockKnockDom /><TH.VaultProbe /></StrictMode>)
    const field = await addKey()
    fireEvent.change(field, { target: { value: FakeApiKey } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved.')).to.not.be.null
  })

  it("saves what was typed, encrypted, never putting it in the page's markup", async () => {
    const { bankDB } = await renderFlow()
    await saveKey()
    expect(document.body.outerHTML).to.not.contain(FakeApiKey)
    const boxrows = storedBoxRows(bankDB)
    expect([...boxrows.keys()]).to.deep.equal([DomApiKeyBoxlabel])
    expect(JSON.stringify([...boxrows.values()])).to.not.contain(FakeApiKey)
  })

  it("hides the field on Done, and offers to edit the saved key", async () => {
    await renderFlow()
    const field = await saveKey()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await screen.findByRole('button', { name: 'Edit key' })
    expect(field.value).to.eq('')
    expect(screen.queryByRole('button', { name: 'Save' })).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Edit key' }))
    await waitFor(() => { expect(field.value).to.eq(FakeApiKey) })
  })

  it("clears Saved. on Done", async () => {
    await renderFlow()
    const field = await saveKey()
    fireEvent.change(field, { target: { value: 'sk-ant-unsaved-edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await screen.findByRole('button', { name: 'Edit key' })
    expect(screen.queryByText('Saved.')).to.be.null
  })

  it("knocks with the saved key, and shows Claude's punchline", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await renderFlow()
    await saveKey()
    await knockAs('Banana')
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("knocks with the saved key after an unsaved edit and a lock", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await renderFlow()
    const field = await saveKey()
    fireEvent.change(field, { target: { value: 'sk-ant-unsaved-edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    await knockAs('Banana')
    await TH.answerPassphraseDialog()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("knocks with the saved key while the box is veiled", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await TH.renderInBank(<><KnockKnockDom /><BoxVeiler /><TH.VaultProbe /></>)
    await saveKey()
    fireEvent.click(screen.getByRole('button', { name: 'Veil' }))
    await screen.findByRole('button', { name: 'Edit key' })
    await knockAs('Banana')
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("leaves a hidden field hidden at a knock", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await renderFlow()
    const field = await saveKey()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await screen.findByRole('button', { name: 'Edit key' })
    await knockAs('Banana')
    await screen.findByText(Punchline)
    expect(field.value).to.eq('')
    expect(screen.queryByRole('button', { name: 'Save' })).to.be.null
  })

  it("asks for the key at a knock before one is saved, sending nothing", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await renderFlow()
    await knockAs('Banana')
    await screen.findByText('Save your Anthropic API key first.')
    expect(anthropic.seen).to.have.lengthOf(0)
    await TH.expectProbe('unborn none')
  })

  it("asks who's there before it knocks", async () => {
    await renderFlow()
    await knockAs('  ')
    expect(await screen.findByText("Say who's there first.")).to.not.be.null
  })

  it("says nothing when the user cancels the dialog, and builds no vault", async () => {
    await renderFlow()
    const ensureUnlockedSpy = vi.spyOn(Bank.prototype, 'ensureUnlocked')
    fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(ensureUnlockedSpy).toHaveBeenCalled() })
    await act(async () => { await Promise.allSettled(ensureUnlockedSpy.mock.results.map((result): unknown => result.value)) })
    expect(document.querySelector('.knock-knock .gripe')).to.be.null
    expect(screen.getByRole('button', { name: 'Add key' })).to.not.be.null
    await TH.expectProbe('unborn none')
  })
})
