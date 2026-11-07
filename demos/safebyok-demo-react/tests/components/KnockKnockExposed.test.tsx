// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bank } from 'safebyok'
import type { MemoryVaultDB } from 'safebyok/storage'
import { useBox } from 'safebyok-react'
import { useIsShowing } from '../../src/hooks/useIsShowing'
import { KnockKnockExposed } from '../../src/components/KnockKnockExposed'
import { KnockKnockFields } from '../../src/components/KnockKnockFields'
import * as TH from '../test-helpers'

const FakeApiKey = 'sk-ant-fake-knock-key'
const Punchline = 'Banana who? Banana split, gotta run!'

/** The flow beside the vault probe, in a bank for `u1`. */
const renderFlow = () => TH.renderInBank(<><KnockKnockExposed /><TH.VaultProbe /></>)

/** Shows whether the box under the flow shows its whisper, as `showing` or `hidden`. */
const ShowingProbe = () => <span data-testid="showing">{useIsShowing(useBox('main', 'anthropic_api_key')) ? 'showing' : 'hidden'}</span>

/** The flow with a button that unmounts it, beside the showing probe. */
const Host = () => {
  const [isMounted, setIsMounted] = useState(true)
  return <>{isMounted && <KnockKnockExposed />}<ShowingProbe /><button type="button" onClick={() => { setIsMounted(false) }}>Unmount</button></>
}

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

/** Types Banana for who's there and knocks, once the flow is ready to. */
const knock = async () => {
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Knock' }).disabled).to.be.false })
  fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: 'Banana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Knock' }))
}

/** The rows `vaultDB` holds for the box under 'main', by boxlabel. */
const storedBoxRows = (vaultDB: MemoryVaultDB) => {
  const vaultrow = vaultDB._cheat_vaultRowsOf({ applabel: 'acme', user_id: 'u1' }).get('main') as { vault_tok: string }
  return vaultDB._cheat_boxRowsOf({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }, vaultrow.vault_tok)
}

describe("KnockKnockExposed", () => {
  it("builds the vault and an empty box on Add key, and shows its field ready to type in", async () => {
    renderFlow()
    expect(screen.getByText('No key saved yet.')).to.not.be.null
    const field = await addKey()
    await TH.expectProbe('present unlocked')
    expect(field.value).to.eq('')
  })

  it("keeps the field showing after Add key under StrictMode", async () => {
    TH.renderInBank(<StrictMode><KnockKnockExposed /><TH.VaultProbe /></StrictMode>)
    const field = await addKey()
    fireEvent.change(field, { target: { value: FakeApiKey } })
    expect(field.value).to.eq(FakeApiKey)
  })

  it("saves what was typed, encrypted", async () => {
    const { vaultDB } = renderFlow()
    await saveKey()
    const boxrows = storedBoxRows(vaultDB)
    expect([...boxrows.keys()]).to.deep.equal(['anthropic_api_key'])
    expect(JSON.stringify([...boxrows.values()])).to.not.contain(FakeApiKey)
  })

  it("hides the field on Done, and shows the saved key again on Edit key", async () => {
    renderFlow()
    const field = await saveKey()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await screen.findByRole('button', { name: 'Edit key' })
    expect(field.value).to.eq('')
    fireEvent.click(screen.getByRole('button', { name: 'Edit key' }))
    await waitFor(() => { expect(field.value).to.eq(FakeApiKey) })
  })

  it("drops an unsaved edit on Done", async () => {
    renderFlow()
    const field = await saveKey()
    fireEvent.change(field, { target: { value: 'sk-ant-unsaved-edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await screen.findByRole('button', { name: 'Edit key' })
    expect(screen.queryByText('Saved.')).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'Edit key' }))
    await waitFor(() => { expect(field.value).to.eq(FakeApiKey) })
  })

  it("puts the key away when the flow unmounts", async () => {
    TH.renderInBank(<Host />)
    await saveKey()
    expect(screen.getByTestId('showing').textContent).to.eq('showing')
    fireEvent.click(screen.getByRole('button', { name: 'Unmount' }))
    await waitFor(() => { expect(screen.getByTestId('showing').textContent).to.eq('hidden') })
  })

  it("knocks with the saved key, and shows Claude's punchline", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
    await saveKey()
    await knock()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("knocks with the saved key, not an unsaved edit", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
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
    renderFlow()
    const field = await saveKey()
    fireEvent.change(field, { target: { value: 'sk-ant-unsaved-edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await TH.expectProbe('present locked')
    await knock()
    await TH.answerPassphraseDialog()
    await screen.findByText(Punchline)
    expect(anthropic.seen.map((request) => request.apiKey)).to.deep.equal([FakeApiKey])
  })

  it("asks for the key at a knock before one is saved, sending nothing", async () => {
    const anthropic = TH.fakeAnthropic(200, Punchline)
    vi.stubGlobal('fetch', anthropic.fetchFn)
    renderFlow()
    await knock()
    await screen.findByText('Save your Anthropic API key first.')
    expect(anthropic.seen).to.have.lengthOf(0)
    await TH.expectProbe('unborn none')
  })

  it("says nothing when the user cancels the dialog, and builds no vault", async () => {
    renderFlow()
    const prompting = vi.spyOn(Bank.prototype, 'ensureVault')
    fireEvent.click(await screen.findByRole('button', { name: 'Add key' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(prompting).toHaveBeenCalled() })
    await act(async () => { await Promise.allSettled(prompting.mock.results.map((result): unknown => result.value)) })
    expect(document.querySelector('.knock-knock .gripe')).to.be.null
    await TH.expectProbe('unborn none')
  })

  it("shows the same key in both flows once either one edits", async () => {
    TH.renderInBank(<><KnockKnockFields /><KnockKnockExposed /><TH.VaultProbe /></>)
    const managedFlow = within(await screen.findByRole('region', { name: 'Knock-knock, with managed fields' }))
    fireEvent.click(await managedFlow.findByRole('button', { name: 'Add key' }))
    await TH.answerPassphraseDialog()
    await waitFor(() => { expect(screen.getAllByRole('button', { name: 'Save' })).to.have.lengthOf(2) })
    const [managed, exposed] = screen.getAllByLabelText<HTMLInputElement>('Anthropic API key') as [HTMLInputElement, HTMLInputElement]
    fireEvent.change(exposed, { target: { value: FakeApiKey } })
    await waitFor(() => { expect(managed.value).to.eq(FakeApiKey) })
  })
})
