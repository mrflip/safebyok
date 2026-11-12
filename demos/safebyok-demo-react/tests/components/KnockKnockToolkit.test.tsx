// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bank } from 'safebyok'
import type { MemoryBankDB } from 'safebyok/storage'
import { useBox } from 'safebyok-react'
import { useIsShowing } from '../../src/hooks/useIsShowing'
import { ApiKeyVaultlabel, ToolkitApiKeyBoxlabel } from '../../src/lib/saved-api-key'
import { KnockKnockToolkit } from '../../src/components/KnockKnockToolkit'
import { KnockKnockDom } from '../../src/components/KnockKnockDom'
import * as TH from '../test-helpers'

const FakeApiKey = 'sk-ant-fake-knock-key'
const Punchline = 'Banana who? Banana split, gotta run!'

/** Render the flow beside the vault probe, in a bank for `u1`. */
const renderFlow = () => TH.renderInBank(<><KnockKnockToolkit /><TH.VaultProbe /></>)

/** A probe that shows whether the flow's box is showing its whisper, as `showing` or `hidden`. */
const ShowingProbe = () => <span data-testid="showing">{useIsShowing(useBox(ApiKeyVaultlabel, ToolkitApiKeyBoxlabel)) ? 'showing' : 'hidden'}</span>

/** The flow with a button that unmounts it, beside the showing probe. */
const Host = () => {
  const [isMounted, setIsMounted] = useState(true)
  return <>{isMounted && <KnockKnockToolkit />}<ShowingProbe /><button type="button" onClick={() => { setIsMounted(false) }}>Unmount</button></>
}

/** Find the API key field, which appears once the box exists. */
const apiKeyField = async () => screen.findByLabelText<HTMLInputElement>('Anthropic API key')

/** Press Add key, build the vault through the provider's dialog, and wait for the empty field. */
const addKey = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
  await TH.answerPassphraseDialog()
  await screen.findByRole('button', { name: 'Save' })
  return apiKeyField()
}

/** Add a key box, type the fake key into its field, and save it. */
const saveKey = async () => {
  const field = await addKey()
  fireEvent.change(field, { target: { value: FakeApiKey } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved.')
  return field
}

/** Wait until the flow is ready, then type Banana for who's there and knock. */
const knock = async () => {
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Knock' }).disabled).to.be.false })
  fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: 'Banana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Knock' }))
}

/** The box rows `bankDB` has stored for the API key's vault, by boxlabel. */
const storedBoxRows = (bankDB: MemoryBankDB) => {
  const { bank, vaultrows } = bankDB._cheat_shelfOf({ user_id: 'u1', banklabel: 'acme' })
  const { bank_tok } = bank as { bank_tok: string }
  const { vault_tok } = vaultrows.get(ApiKeyVaultlabel) as { vault_tok: string }
  return bankDB._cheat_boxRowsOf({ user_id: 'u1', banklabel: 'acme', vaultlabel: ApiKeyVaultlabel }, bank_tok, vault_tok)
}

describe("KnockKnockToolkit", () => {
  it("shows an empty field on Add key", async () => {
    await renderFlow()
    expect(screen.getByText('No key saved yet.')).to.not.be.null
    const field = await addKey()
    await TH.expectProbe('present unlocked')
    expect(field.value).to.eq('')
  })

  it("keeps the field showing after Add key under StrictMode", async () => {
    await TH.renderInBank(<StrictMode><KnockKnockToolkit /><TH.VaultProbe /></StrictMode>)
    const field = await addKey()
    fireEvent.change(field, { target: { value: FakeApiKey } })
    expect(field.value).to.eq(FakeApiKey)
  })

  it("saves what was typed, encrypted", async () => {
    const { bankDB } = await renderFlow()
    await saveKey()
    const boxrows = storedBoxRows(bankDB)
    expect([...boxrows.keys()]).to.deep.equal([ToolkitApiKeyBoxlabel])
    expect(JSON.stringify([...boxrows.values()])).to.not.contain(FakeApiKey)
  })

  it("shows the saved key again on Edit key after Done", async () => {
    await renderFlow()
    const field = await saveKey()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await screen.findByRole('button', { name: 'Edit key' })
    expect(field.value).to.eq('')
    fireEvent.click(screen.getByRole('button', { name: 'Edit key' }))
    await waitFor(() => { expect(field.value).to.eq(FakeApiKey) })
  })

  it("drops an unsaved edit on Done", async () => {
    await renderFlow()
    const field = await saveKey()
    fireEvent.change(field, { target: { value: 'sk-ant-unsaved-edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await screen.findByRole('button', { name: 'Edit key' })
    expect(screen.queryByText('Saved.')).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Edit key' }))
    await waitFor(() => { expect(field.value).to.eq(FakeApiKey) })
  })

  it("puts the key away when the flow unmounts", async () => {
    await TH.renderInBank(<Host />)
    await saveKey()
    expect(screen.getByTestId('showing').textContent).to.eq('showing')
    fireEvent.click(screen.getByRole('button', { name: 'Unmount' }))
    await waitFor(() => { expect(screen.getByTestId('showing').textContent).to.eq('hidden') })
  })

  it("knocks with the saved key", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await renderFlow()
    await saveKey()
    await knock()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("knocks with the saved key, not an unsaved edit", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await renderFlow()
    const field = await saveKey()
    fireEvent.change(field, { target: { value: 'sk-ant-unsaved-edit' } })
    await knock()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
    expect(field.value).to.eq('sk-ant-unsaved-edit')
  })

  it("knocks with the saved key after an unsaved edit and a lock", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await renderFlow()
    const field = await saveKey()
    fireEvent.change(field, { target: { value: 'sk-ant-unsaved-edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    await knock()
    await TH.answerPassphraseDialog()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("asks for the key at a knock before one is saved", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await renderFlow()
    await knock()
    await screen.findByText('Save your Anthropic API key first.')
    expect(anthropic.seen).to.have.lengthOf(0)
    await TH.expectProbe('unborn none')
  })

  it("stays quiet when the user cancels the dialog", async () => {
    await renderFlow()
    const ensureUnlockedSpy = vi.spyOn(Bank.prototype, 'ensureUnlocked')
    fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(ensureUnlockedSpy).toHaveBeenCalled() })
    await act(async () => { await Promise.allSettled(ensureUnlockedSpy.mock.results.map((result): unknown => result.value)) })
    expect(document.querySelector('.knock-knock .gripe')).to.be.null
    await TH.expectProbe('unborn none')
  })

  it("keeps a separate key in each flow", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    await TH.renderInBank(<><KnockKnockDom /><KnockKnockToolkit /><TH.VaultProbe /></>)
    const managedFlow = within(await screen.findByRole('region', { name: 'DOM form' }))
    const exposedFlow = within(await screen.findByRole('region', { name: 'Toolkit form' }))
    fireEvent.click(await managedFlow.findByRole('button', { name: 'Add key' }))
    await TH.answerPassphraseDialog()
    await managedFlow.findByRole('button', { name: 'Save' })
    fireEvent.click(await exposedFlow.findByRole('button', { name: 'Add key' }))
    await exposedFlow.findByRole('button', { name: 'Save' })
    const managed = managedFlow.getByLabelText<HTMLInputElement>('Anthropic API key')
    const exposed = exposedFlow.getByLabelText<HTMLInputElement>('Anthropic API key')
    fireEvent.change(exposed, { target: { value: 'sk-ant-exposed-key' } })
    expect(managed.value).to.eq('')
    fireEvent.change(managed, { target: { value: 'sk-ant-managed-key' } })
    expect(exposed.value).to.eq('sk-ant-exposed-key')
    fireEvent.click(exposedFlow.getByRole('button', { name: 'Save' }))
    await exposedFlow.findByText('Saved.')
    expect(managed.value).to.eq('sk-ant-managed-key')
    fireEvent.click(managedFlow.getByRole('button', { name: 'Save' }))
    await managedFlow.findByText('Saved.')
    for (const flow of [managedFlow, exposedFlow]) {
      await waitFor(() => { expect(flow.getByRole<HTMLButtonElement>('button', { name: 'Knock' }).disabled).to.be.false })
      fireEvent.change(flow.getByPlaceholderText('Banana'), { target: { value: 'Banana' } })
      fireEvent.click(flow.getByRole('button', { name: 'Knock' }))
      await waitFor(() => { expect(anthropic.seen).to.have.lengthOf(flow === managedFlow ? 1 : 2) })
    }
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal(['sk-ant-managed-key', 'sk-ant-exposed-key'])
  })
})
