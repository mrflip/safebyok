// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bank } from 'safebyok'
import { useBox } from 'safebyok-react'
import type { MemoryVaultDB } from 'safebyok/storage'
import { ApiKeyVaultlabel, WidgetApiKeyBoxlabel } from '../../src/lib/saved-api-key'
import { KnockKnockWidget } from '../../src/components/KnockKnockWidget'
import * as TH from '../test-helpers'

const FakeApiKey = 'sk-ant-fake-knock-key'
const Punchline = 'Banana who? Banana split, gotta run!'

/** Render the flow beside the vault probe, in a bank for `u1`. */
const renderFlow = () => TH.renderInBank(<><KnockKnockWidget /><TH.VaultProbe /></>)

/** A probe that shows whether the flow's box is `exposed` or `sealed`. An absent box shows as `sealed`. */
const ExposureProbe = () => {
  const box = useBox(ApiKeyVaultlabel, WidgetApiKeyBoxlabel)
  const isExposed = box?.snapshot.isExposed ?? false
  return <span data-testid="exposure">{isExposed ? 'exposed' : 'sealed'}</span>
}

/** Find the API key field, which is present even before a key is saved. */
const apiKeyField = async () => screen.findByLabelText<HTMLInputElement>('Anthropic API key')

/** Wait until the flow is ready, then type `apiKey` into the field and press Save. */
const typeAndSave = async (apiKey: string) => {
  const field = await apiKeyField()
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).to.be.false })
  fireEvent.change(field, { target: { value: apiKey } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  return field
}

/** Type and save the fake key, answer the passphrase dialog that the first Save opens, and wait for "Saved." */
const saveKey = async () => {
  const field = await typeAndSave(FakeApiKey)
  await TH.answerPassphraseDialog()
  await screen.findByText('Saved.')
  return field
}

/** Wait until the flow is ready, then type Banana for who's there and knock. */
const knock = async () => {
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Knock' }).disabled).to.be.false })
  fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: 'Banana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Knock' }))
}

/** The box rows `vaultDB` has stored for the API key's vault, by boxlabel. */
const storedBoxRows = (vaultDB: MemoryVaultDB) => {
  const vaultrow = vaultDB._cheat_vaultRowsOf({ user_id: 'u1', banklabel: 'acme' }).get(ApiKeyVaultlabel) as { vault_tok: string }
  return vaultDB._cheat_boxRowsOf({ user_id: 'u1', banklabel: 'acme', vaultlabel: ApiKeyVaultlabel }, vaultrow.vault_tok)
}

describe("KnockKnockWidget", () => {
  it("shows no key saved before any Save", async () => {
    renderFlow()
    const field = await apiKeyField()
    expect(field.value).to.eq('')
    expect(screen.getByText('No key saved yet.')).to.not.be.null
  })

  it("saves what was typed, encrypted, in a box of its own", async () => {
    const { vaultDB } = renderFlow()
    await saveKey()
    const boxrows = storedBoxRows(vaultDB)
    expect([...boxrows.keys()]).to.deep.equal([WidgetApiKeyBoxlabel])
    expect(JSON.stringify([...boxrows.values()])).to.not.contain(FakeApiKey)
  })

  it("clears the field after Save", async () => {
    renderFlow()
    const field = await saveKey()
    expect(field.value).to.eq('')
  })

  it("says a key is saved once one is", async () => {
    renderFlow()
    await saveKey()
    expect(screen.queryByText('No key saved yet.')).to.be.null
  })

  it("saves under StrictMode", async () => {
    TH.renderInBank(<StrictMode><KnockKnockWidget /><TH.VaultProbe /></StrictMode>)
    await saveKey()
    await TH.expectProbe('present unlocked')
  })

  it("asks for a key on a Save with nothing typed", async () => {
    renderFlow()
    await apiKeyField()
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).to.be.false })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Type your key first.')
    await TH.expectProbe('unborn none')
  })

  it("replaces the saved key at a second Save", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
    await saveKey()
    await typeAndSave('sk-ant-second-key')
    await waitFor(() => { expect(screen.getByText('Saved.')).to.not.be.null })
    await knock()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal(['sk-ant-second-key'])
  })

  it("knocks with the saved key", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
    await saveKey()
    await knock()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("knocks with the saved key after a lock", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
    await saveKey()
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    await knock()
    await TH.answerPassphraseDialog()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("never exposes the key", async () => {
    TH.renderInBank(<><KnockKnockWidget /><ExposureProbe /></>)
    await saveKey()
    await waitFor(() => { expect(screen.getByTestId('exposure').textContent).to.eq('sealed') })
  })

  it("asks for the key at a knock before one is saved", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
    await knock()
    await screen.findByText('Save your Anthropic API key first.')
    expect(anthropic.seen).to.have.lengthOf(0)
    await TH.expectProbe('unborn none')
  })

  it("stays quiet when the user cancels the dialog", async () => {
    renderFlow()
    const ensureVaultSpy = vi.spyOn(Bank.prototype, 'ensureVault')
    const field = await typeAndSave(FakeApiKey)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(ensureVaultSpy).toHaveBeenCalled() })
    await act(async () => { await Promise.allSettled(ensureVaultSpy.mock.results.map((result): unknown => result.value)) })
    expect(document.querySelector('.knock-knock .gripe')).to.be.null
    expect(field.value).to.eq(FakeApiKey)
    await TH.expectProbe('unborn none')
  })
})
