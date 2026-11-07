// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bank } from 'safebyok'
import type { MemoryVaultDB } from 'safebyok/storage'
import { KnockKnockFields } from '../../src/components/KnockKnockFields'
import * as TH from '../test-helpers'

const FakeApiKey = 'sk-ant-fake-knock-key'
const Punchline = 'Banana who? Banana split, gotta run!'

/** The flow beside the vault probe, in a bank for `u1`. */
const renderFlow = () => TH.renderInBank(<><KnockKnockFields /><TH.VaultProbe /></>)

/** The API key field, once a box backs it. */
const apiKeyField = async () => await screen.findByLabelText<HTMLInputElement>('Anthropic API key')

/** Presses Add key, builds the vault through the provider's dialog, and waits for the empty field. */
const addKey = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
  await TH.answerPassphraseDialog()
  await screen.findByRole('button', { name: 'Save' })
  return await apiKeyField()
}

/** Adds the key, types the fake one into its field, and saves it. */
const saveKey = async () => {
  const field = await addKey()
  fireEvent.change(field, { target: { value: FakeApiKey } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved.')
  return field
}

/** Types who's there and knocks, once the flow is ready to. */
const knockAs = async (whosThere: string) => {
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Knock' }).disabled).to.be.false })
  fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: whosThere } })
  fireEvent.click(screen.getByRole('button', { name: 'Knock' }))
}

/** The rows `vaultDB` holds for the box under 'main', by boxlabel. */
const storedBoxRows = (vaultDB: MemoryVaultDB) => {
  const vaultrow = vaultDB._cheat_vaultRowsOf({ applabel: 'acme', user_id: 'u1' }).get('main') as { vault_tok: string }
  return vaultDB._cheat_boxRowsOf({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }, vaultrow.vault_tok)
}

describe("KnockKnockFields", () => {
  it("builds the vault and an empty box on Add key, and shows its field ready to type in", async () => {
    renderFlow()
    expect(screen.getByText('No key saved yet.')).to.not.be.null
    const field = await addKey()
    await TH.expectProbe('present unlocked')
    expect(field.value).to.eq('')
    expect(screen.getByRole('button', { name: 'Save' })).to.not.be.null
  })

  it("saves what was typed, encrypted, never putting it in the page's markup", async () => {
    const { vaultDB } = renderFlow()
    await saveKey()
    expect(document.body.outerHTML).to.not.contain(FakeApiKey)
    const boxrows = storedBoxRows(vaultDB)
    expect([...boxrows.keys()]).to.deep.equal(['anthropic_api_key'])
    expect(JSON.stringify([...boxrows.values()])).to.not.contain(FakeApiKey)
  })

  it("hides the field on Done, and offers to edit the saved key", async () => {
    renderFlow()
    const field = await saveKey()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await screen.findByRole('button', { name: 'Edit key' })
    expect(field.value).to.eq('')
    expect(screen.queryByRole('button', { name: 'Save' })).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Edit key' }))
    await waitFor(() => { expect(field.value).to.eq(FakeApiKey) })
  })

  it("knocks with the saved key, and shows Claude's punchline", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
    await saveKey()
    await knockAs('Banana')
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("asks for the key at a knock before one is saved, sending nothing", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
    await knockAs('Banana')
    await TH.answerPassphraseDialog()
    await screen.findByText('Save your Anthropic API key first.')
    expect(anthropic.seen).to.have.length(0)
  })

  it("asks who's there before it knocks", async () => {
    renderFlow()
    await knockAs('  ')
    expect(await screen.findByText("Say who's there first.")).to.not.be.null
  })

  it("says nothing when the user cancels the dialog, and builds no vault", async () => {
    renderFlow()
    const prompting = vi.spyOn(Bank.prototype, 'ensureVault')
    fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(prompting).toHaveBeenCalled() })
    await act(async () => { await Promise.allSettled(prompting.mock.results.map((result): unknown => result.value)) })
    expect(document.querySelector('.knock-knock .gripe')).to.be.null
    expect(screen.getByRole('button', { name: 'Add key' })).to.not.be.null
    await TH.expectProbe('unborn none')
  })
})
