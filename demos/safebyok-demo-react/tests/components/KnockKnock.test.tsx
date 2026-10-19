// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Ckeys, localVaultDB, memoryStore } from 'safebyok'
import { KnockKnock, SavedFlashMillis } from '../../src/components/KnockKnock'
import { OutageVaultDB, makeOutage } from '../../src/lib/outage'
import * as TH from '../test-helpers'

/** Anthropic, faked at the global `fetch` the SDK calls: see TH.fakeAnthropic. */
const stubAnthropic = (status: number, jokeText = '') => {
  const anthropic = TH.fakeAnthropic(status, jokeText)
  vi.stubGlobal('fetch', anthropic.fetchFn)
  return anthropic
}

const knockAs = (whosThere: string) => {
  fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: whosThere } })
  fireEvent.click(screen.getByRole('button', { name: new RegExp(String.raw`${whosThere} Who\?`) }))
}

describe("KnockKnock", () => {
  it("won't knock without a key, and says how to add one", async () => {
    TH.makeWorld().renderInVault(<KnockKnock />)
    await screen.findByText(/No Anthropic API key yet/)
    fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: 'Banana' } })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Banana Who\?/ }).disabled).to.be.true
  })

  it("shows nothing while the vault is still opening, never offering to add a key it may hold", async () => {
    const outage = makeOutage()
    outage.setDown(true)
    const vaultDB = new OutageVaultDB(localVaultDB({ store: memoryStore() }), outage)
    const { container } = TH.makeWorld({ vaultDB }).renderInVault(<KnockKnock />)
    await TH.aWhile()
    expect(container.textContent).to.eq('')
    expect(screen.queryByText(/No Anthropic API key yet/)).to.be.null
  })

  it("saves a key into the vault, asking for a new vault's passphrase on the way", async () => {
    const world = TH.makeWorld()
    world.renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'add your key' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: ' sk-ant-test-not-a-real-key ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await TH.answerPassphraseDialog()
    await screen.findByText(/Anthropic key saved/)
    const vault = await world.openUnlocked()
    expect(await vault.readBox('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("flashes 'saved' after a save, then relaxes to when the key was last saved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const world = TH.makeWorld()
      await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
      await world.openUnlocked()
      world.renderInVault(<KnockKnock />)
      fireEvent.click(await screen.findByRole('button', { name: 'replace it' }))
      fireEvent.change(screen.getByLabelText('Anthropic API key'), { target: { value: 'sk-ant-test-not-a-real-key' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
      const said = await screen.findByText(/Anthropic key saved/)
      expect(said.textContent).to.not.match(/\(saved/)
      await act(async () => { await vi.advanceTimersByTimeAsync(SavedFlashMillis) })
      expect(screen.getByText(/Anthropic key in the vault/).textContent).to.match(/\(saved .+\)/)
    } finally {
      vi.useRealTimers()
    }
  })

  it("takes the key in a whisper field, hidden, named for a whisper, its password managers asked away", async () => {
    TH.makeWorld().renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'add your key' }))
    const field = screen.getByLabelText<HTMLInputElement>('Anthropic API key')
    expect(field.type).to.eq('password')
    expect(field.name).to.eq('whisper_text')
    expect(field.dataset['1pIgnore']).to.eq('true')
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(field.type).to.eq('text')
  })

  it("puts the key form away on Cancel, saving nothing, even with the vault unlocked", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    // Unlocked on this device first, so a save would need no passphrase dialog to land.
    await world.openUnlocked()
    world.renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'replace it' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'sk-ant-test-replaced' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await TH.wakeupAtNextTick()
    expect(screen.getByRole('button', { name: 'replace it' })).to.not.be.null
    expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.readBox('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("tells the joke Claude tells, the key going to Anthropic and nowhere on the page", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const anthropic = stubAnthropic(200, 'Banana who? Banana split, gotta run!')
    const { container } = world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    knockAs('Banana')
    await TH.answerPassphraseDialog()
    await screen.findByText('Banana who? Banana split, gotta run!')
    expect(anthropic.seen.map((request) => request.apiKeyHeader)).to.deep.equal(['sk-ant-test-not-a-real-key'])
    expect(container.outerHTML).to.not.include('sk-ant-test-not-a-real-key')
  })

  it("knocks from the keyboard too", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    stubAnthropic(200, 'Olive who? Olive you!')
    world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    const field = screen.getByPlaceholderText('Banana')
    fireEvent.change(field, { target: { value: 'Olive' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await TH.answerPassphraseDialog()
    expect(await screen.findByText('Olive who? Olive you!')).to.not.be.null
  })

  it("says calmly that Anthropic refused the key, quoting none of it", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    stubAnthropic(401)
    const { container } = world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    knockAs('Lettuce')
    await TH.answerPassphraseDialog()
    await screen.findByText(/Anthropic refused that API key/)
    expect(container.outerHTML).to.not.include('sk-ant-test-not-a-real-key')
  })

  it("gripes, rather than calling Anthropic, when the stored key is not text", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: { apiKey: 'sk-ant-test-not-a-real-key' } })
    const anthropic = stubAnthropic(200, 'never told')
    world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    knockAs('Banana')
    await TH.answerPassphraseDialog()
    await screen.findByText(/That joke got lost on the way/)
    expect(anthropic.seen).to.have.lengthOf(0)
  })

  it("tells nothing when the passphrase dialog is dismissed", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const anthropic = stubAnthropic(200, 'never told')
    world.renderInVault(<KnockKnock />)
    await screen.findByText(/Anthropic key in the vault/)
    knockAs('Banana')
    await screen.findByPlaceholderText('vault passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByText(/clearing its throat/)).to.be.null })
    expect(screen.queryByText('never told')).to.be.null
    expect(anthropic.seen).to.have.lengthOf(0)
  })

  it("replaces a key already stored", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'replace it' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'sk-ant-test-replaced' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await TH.answerPassphraseDialog()
    await screen.findByText(/Anthropic key saved/)
    const vault = await world.openUnlocked()
    expect(await vault.readBox('anthropic_api_key')).to.eq('sk-ant-test-replaced')
  })

  it("won't knock with a damaged key, and replaces one that names its revision afresh", async () => {
    const store = memoryStore()
    const world = TH.makeWorld({ vaultDB: localVaultDB({ store }) })
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const ckey = Ckeys.box(TH.scopeOf('u1'), 'anthropic_api_key')
    // A sidecar that is not JSON: damaged, but its record still names its revision.
    const row = JSON.parse(store.read(ckey) ?? '{}') as object
    store.write(ckey, JSON.stringify({ ...row, sidecar_json: '{"note":' }))
    world.renderInVault(<KnockKnock />)
    await screen.findByText(/stored Anthropic key is damaged/)
    fireEvent.change(screen.getByPlaceholderText('Banana'), { target: { value: 'Banana' } })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Banana Who\?/ }).disabled).to.be.true
    fireEvent.keyDown(screen.getByPlaceholderText('Banana'), { key: 'Enter' })
    expect(screen.queryByText(/clearing its throat/)).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'replace it' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'sk-ant-test-replaced' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await TH.answerPassphraseDialog()
    await screen.findByText(/Anthropic key saved/)
    const vault = await world.openUnlocked()
    expect(await vault.readBox('anthropic_api_key')).to.eq('sk-ant-test-replaced')
  })

  it("offers a key damaged beyond naming only for removing, and then for adding anew", async () => {
    const store = memoryStore()
    const world = TH.makeWorld({ vaultDB: localVaultDB({ store }) })
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const ckey = Ckeys.box(TH.scopeOf('u1'), 'anthropic_api_key')
    store.write(ckey, '{"not": json')
    world.renderInVault(<KnockKnock />)
    await screen.findByText(/stored Anthropic key is damaged/)
    expect(screen.queryByRole('button', { name: 'replace it' })).to.be.null
    fireEvent.click(screen.getByRole('button', { name: 'remove it' }))
    await TH.answerPassphraseDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'add your key' }))
    expect(store.read(ckey)).to.be.null
  })

  it("shows a refused save beside the key form: here, a key over the vault's limit", async () => {
    TH.makeWorld().renderInVault(<KnockKnock />)
    fireEvent.click(await screen.findByRole('button', { name: 'add your key' }))
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'k'.repeat(50_000) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await TH.answerPassphraseDialog()
    expect(await screen.findByText(/over this vault's limit/, { selector: '.gripe' })).to.not.be.null
    expect(screen.getByRole('button', { name: 'Save key' })).to.not.be.null
  })
})
