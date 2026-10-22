// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Ckeys, VaultError, localVaultDB, memoryStore } from 'safebyok'
import { VaultDashboard } from '../../src/components/VaultDashboard'
import { OutageVaultDB, makeOutage } from '../../src/lib/outage'
import * as TH from '../test-helpers'

/** The ckey of `u1`'s `openai_api_key` box, for planting damage in storage. */
const openaiCkey = Ckeys.box(TH.scopeOf('u1'), 'openai_api_key')

/** The box form's fields, by their labels. */
const fillForm = (fields: { boxlabel?: string, whisper?: string, note?: string }) => {
  if (fields.boxlabel !== undefined) { fireEvent.change(screen.getByLabelText(/^label/), { target: { value: fields.boxlabel } }) }
  if (fields.whisper !== undefined) { fireEvent.change(screen.getByLabelText(/^whisper/), { target: { value: fields.whisper } }) }
  if (fields.note !== undefined) { fireEvent.change(screen.getByLabelText(/^note/), { target: { value: fields.note } }) }
}

/** The table row of `boxlabel`'s box. */
const rowOf = (boxlabel: string): HTMLElement => {
  const row = screen.getByText(boxlabel).closest('tr')
  if (row === null) { throw new Error(`no row holds ${boxlabel}`) }
  return row
}

describe("VaultDashboard, opening", () => {
  it("says it is opening until the vault is there, then that it holds no boxes", async () => {
    TH.makeWorld().renderInVault(<VaultDashboard />)
    expect(screen.getByText('Opening vault…')).to.not.be.null
    await screen.findByText(/No boxes yet/)
    expect(screen.getByText('no vault yet')).to.not.be.null
  })

  it("shows storage it cannot reach in place, and opens once Retry finds it back", async () => {
    const outage = makeOutage()
    outage.setDown(true)
    const vaultDB = new OutageVaultDB(localVaultDB({ store: memoryStore() }), outage)
    TH.makeWorld({ vaultDB }).renderInVault(<VaultDashboard />)
    await screen.findByText(/Can't reach your vault/)
    outage.setDown(false)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/No boxes yet/)).to.not.be.null
  })

  it("says a browser that withholds storage won't keep the vault, and offers no Retry", async () => {
    const world = TH.makeWorld()
    vi.spyOn(world.deviceDB, 'getDeviceRecord').mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))
    world.renderInVault(<VaultDashboard />)
    await screen.findByText(/won't let the app keep your vault/)
    expect(screen.queryByRole('button', { name: 'Retry' })).to.be.null
  })

  it("says a damaged vault record can't be opened, and offers no Retry", async () => {
    const world = TH.makeWorld()
    vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValue(TH.bad(new VaultError('damaged_vault', "This vault's stored props failed their checks.")))
    world.renderInVault(<VaultDashboard />)
    await screen.findByText(/stored record is damaged/)
    expect(screen.queryByRole('button', { name: 'Retry' })).to.be.null
  })
})

/** A world whose `u1` vault has had its stored props spoiled, over a store the test can read. */
const damagedWorld = async () => {
  const store = memoryStore()
  const world = TH.makeWorld({ vaultDB: localVaultDB({ store }) })
  await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
  const vaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))
  const vaultProps = JSON.parse(store.read(vaultPropsCkey) ?? 'null') as object
  store.write(vaultPropsCkey, JSON.stringify({ ...vaultProps, gate_epoch: 'one' }))
  return { store, world }
}

describe("VaultDashboard, a vault stored damaged", () => {
  it("deletes it and opens a fresh one, once the user confirms", async () => {
    const { store, world } = await damagedWorld()
    const confirming = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    world.renderInVault(<VaultDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove and start over' }))
    expect(confirming).toHaveBeenCalledWith("Remove this vault and start over? Every box in it is lost for good.")
    expect(store.ckeys()).to.have.lengthOf(2)
    confirming.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove and start over' }))
    expect(await screen.findByText(/No boxes yet/)).to.not.be.null
    expect(store.ckeys(), 'a tombstone in the place of the vault props').to.deep.equal(['vault^acme^u1^main'])
  })

  it("says why deleting it failed, and keeps offering it", async () => {
    const { world } = await damagedWorld()
    vi.spyOn(world.vaultDB, 'delDamagedVault').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'The vault storage could not be reached: try again shortly.')))
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    world.renderInVault(<VaultDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove and start over' }))
    await screen.findByText(/could not be reached/)
    fireEvent.click(screen.getByRole('button', { name: 'Remove and start over' }))
    expect(await screen.findByText(/No boxes yet/)).to.not.be.null
  })
})

describe("VaultDashboard, its boxes", () => {
  it("adds a box, asking for a new vault's passphrase on the way", async () => {
    const world = TH.makeWorld()
    world.renderInVault(<VaultDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a box' }))
    fillForm({ boxlabel: ' anthropic_api_key ', whisper: 'sk-ant-test-not-a-real-key', note: ' work account ' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await TH.answerPassphraseDialog()
    await screen.findByText('anthropic_api_key')
    expect(within(rowOf('anthropic_api_key')).getByText('work account')).to.not.be.null
    expect(within(rowOf('anthropic_api_key')).queryByText('sk-ant-test-not-a-real-key')).to.be.null
    const vault = await world.openUnlocked()
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("keeps a whisper typed as JSON its type", async () => {
    const world = TH.makeWorld()
    world.renderInVault(<VaultDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a box' }))
    fillForm({ boxlabel: 'openai_api_key', whisper: '{"apiKey":"sk-test-not-a-real-key","orgId":null}' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await TH.answerPassphraseDialog()
    await screen.findByText('openai_api_key')
    const vault = await world.openUnlocked()
    expect(await vault.getWhisper('openai_api_key')).to.deep.equal({ apiKey: 'sk-test-not-a-real-key', orgId: null })
  })

  it("shows a refused store in the form, asking for no passphrase first, and keeps the form open", async () => {
    TH.makeWorld().renderInVault(<VaultDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a box' }))
    fillForm({ boxlabel: 'not a label', whisper: 'sk-ant-test-not-a-real-key' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/label/i, { selector: '.gripe' })).to.not.be.null
    expect(screen.queryByRole('dialog')).to.be.null
    expect(screen.getByRole('button', { name: 'Save' })).to.not.be.null
  })

  it("puts the form away on Cancel", async () => {
    TH.makeWorld().renderInVault(<VaultDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a box' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Save' })).to.be.null
  })

  it("views a whisper once unlocked, and hides it again", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<VaultDashboard />)
    await screen.findByText('🔒 locked')
    fireEvent.click(within(rowOf('anthropic_api_key')).getByRole('button', { name: 'view' }))
    await TH.answerPassphraseDialog()
    await screen.findByText('sk-ant-test-not-a-real-key')
    fireEvent.click(within(rowOf('anthropic_api_key')).getByRole('button', { name: 'hide' }))
    expect(screen.queryByText('sk-ant-test-not-a-real-key')).to.be.null
  })

  it("views nothing when the passphrase dialog is dismissed", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<VaultDashboard />)
    await screen.findByText('🔒 locked')
    fireEvent.click(within(rowOf('anthropic_api_key')).getByRole('button', { name: 'view' }))
    await screen.findByPlaceholderText('vault passphrase')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
    expect(screen.queryByText('sk-ant-test-not-a-real-key')).to.be.null
    expect(within(rowOf('anthropic_api_key')).getByRole('button', { name: 'view' })).to.not.be.null
  })

  it("edits a box in place, its boxlabel fixed and its whisper and note filled in", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: { apiKey: 'sk-ant-test-not-a-real-key' } })
    world.renderInVault(<VaultDashboard />)
    await screen.findByText('🔒 locked')
    fireEvent.click(within(rowOf('anthropic_api_key')).getByRole('button', { name: 'edit' }))
    await TH.answerPassphraseDialog()
    await screen.findByText('Edit anthropic_api_key')
    expect(screen.getByLabelText<HTMLInputElement>(/^label/).disabled).to.be.true
    expect(screen.getByLabelText<HTMLTextAreaElement>(/^whisper/).value).to.eq('{\n  "apiKey": "sk-ant-test-not-a-real-key"\n}')
    fillForm({ whisper: 'sk-ant-test-replaced', note: 'rotated' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(within(rowOf('anthropic_api_key')).queryByText('rotated')).to.not.be.null })
    const vault = await world.openUnlocked()
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-replaced')
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ sidecar: { note: 'rotated' } })
  })

  it("keeps a box's note when a new whisper is stored over it with the note left blank", async () => {
    const world = TH.makeWorld()
    world.renderInVault(<VaultDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a box' }))
    fillForm({ boxlabel: 'anthropic_api_key', whisper: 'sk-ant-test-not-a-real-key', note: 'work account' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await TH.answerPassphraseDialog()
    await screen.findByText('anthropic_api_key')
    fireEvent.click(screen.getByRole('button', { name: 'Add a box' }))
    fillForm({ boxlabel: 'anthropic_api_key', whisper: 'sk-ant-test-replaced', note: ' '.repeat(3) })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Save' })).to.be.null })
    expect(within(rowOf('anthropic_api_key')).getByText('work account')).to.not.be.null
    const vault = await world.openUnlocked()
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-replaced')
  })

  it("removes a box once the user confirms, and keeps it when they don't", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key', openai_api_key: 'sk-test-not-a-real-key' })
    world.renderInVault(<VaultDashboard />)
    await screen.findByText('🔒 locked')
    const confirming = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    fireEvent.click(within(rowOf('openai_api_key')).getByRole('button', { name: 'remove' }))
    expect(confirming).toHaveBeenCalledWith("Remove the box 'openai_api_key'?")
    confirming.mockReturnValue(true)
    fireEvent.click(within(rowOf('openai_api_key')).getByRole('button', { name: 'remove' }))
    await TH.answerPassphraseDialog()
    await waitFor(() => { expect(screen.queryByText('openai_api_key')).to.be.null })
    expect(screen.getByText('anthropic_api_key')).to.not.be.null
  })

  it("removes a box deleted elsewhere while it asked for the passphrase as removed, quietly", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key', openai_api_key: 'sk-test-not-a-real-key' })
    world.renderInVault(<VaultDashboard />)
    await screen.findByText('🔒 locked')
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(within(rowOf('openai_api_key')).getByRole('button', { name: 'remove' }))
    await screen.findByPlaceholderText('vault passphrase')
    const elsewhere = await world.openUnlocked()
    await elsewhere.delBox('openai_api_key')
    await TH.answerPassphraseDialog()
    await waitFor(() => { expect(screen.queryByText('openai_api_key')).to.be.null })
    await screen.findByText(/🔓 unlocked until/)
    expect(screen.getByText('anthropic_api_key')).to.not.be.null
  })

  it("marks a damaged box as such, offering only to remove it", async () => {
    const store = memoryStore()
    const world = TH.makeWorld({ vaultDB: localVaultDB({ store }) })
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key', openai_api_key: 'sk-test-not-a-real-key' })
    store.write(openaiCkey, '{"not": json')
    world.renderInVault(<VaultDashboard />)
    await screen.findByText(/damaged: its stored record can't be read/)
    const damagedRow = rowOf('openai_api_key')
    expect(within(damagedRow).queryByRole('button', { name: 'view' })).to.be.null
    expect(within(damagedRow).queryByRole('button', { name: 'use' })).to.be.null
    // Not JSON, it names no revision, so nothing can be stored over it until it is removed.
    expect(within(damagedRow).queryByRole('button', { name: 'replace' })).to.be.null
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    fireEvent.click(within(damagedRow).getByRole('button', { name: 'remove' }))
    await TH.answerPassphraseDialog()
    await waitFor(() => { expect(screen.queryByText('openai_api_key')).to.be.null })
    expect(store.read(openaiCkey)).to.be.null
    expect(screen.getByText('anthropic_api_key')).to.not.be.null
  })

  it("replaces a damaged box that names its revision with a fresh whisper", async () => {
    const store = memoryStore()
    const world = TH.makeWorld({ vaultDB: localVaultDB({ store }) })
    await world.seed({ openai_api_key: 'sk-test-not-a-real-key' })
    // A record with no sidecar: damaged, but its record still names its revision.
    const row = JSON.parse(store.read(openaiCkey) ?? '{}') as object
    store.write(openaiCkey, JSON.stringify({ ...row, sidecar: undefined }))
    world.renderInVault(<VaultDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'replace' }))
    expect(screen.getByLabelText<HTMLInputElement>(/^label/).disabled).to.be.true
    fillForm({ whisper: 'sk-test-replaced' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await TH.answerPassphraseDialog()
    await screen.findByRole('button', { name: 'view' })
    const vault = await world.openUnlocked()
    expect(await vault.getWhisper('openai_api_key')).to.eq('sk-test-replaced')
  })

  it("uses a whisper by whispering it back in the Psst dialog", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<VaultDashboard />)
    await screen.findByText('🔒 locked')
    fireEvent.click(within(rowOf('anthropic_api_key')).getByRole('button', { name: 'use' }))
    await TH.answerPassphraseDialog()
    await screen.findByText('sk-ant-test-not-a-real-key')
    fireEvent.click(screen.getByRole('button', { name: 'My lips are sealed' }))
    expect(screen.queryByText('sk-ant-test-not-a-real-key')).to.be.null
  })
})

describe("VaultDashboard, its lock", () => {
  it("says how long it stays unlocked, and locks on demand", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<VaultDashboard />)
    await screen.findByText('🔒 locked')
    fireEvent.click(within(rowOf('anthropic_api_key')).getByRole('button', { name: 'view' }))
    await TH.answerPassphraseDialog()
    const chip = await screen.findByText(/unlocked until/)
    expect(chip.textContent).to.match(/^🔓 unlocked until /)
    // The read finishes first: a lock landing while it is under way would refuse it, as it should.
    await screen.findByText('sk-ant-test-not-a-real-key')
    fireEvent.click(screen.getByRole('button', { name: 'lock now' }))
    await screen.findByText('🔒 locked')
  })
})
