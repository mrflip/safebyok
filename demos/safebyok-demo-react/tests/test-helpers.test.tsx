// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localVaultDB, memoryStore, type Vault } from 'safebyok'
import { tellKnockKnockJoke } from '../src/lib/anthropic'
import * as TH from './test-helpers'

describe("makeWorld", () => {
  it("renders a component inside a vault for u1, absent until something is stored", async () => {
    TH.makeWorld().renderInVault(<TH.VaultProbe />)
    await TH.expectProbeState('absent')
  })

  it("puts the vault behind the vaultDB it is handed", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const world = TH.makeWorld({ vaultDB })
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    expect(world.vaultDB).to.eq(vaultDB)
    expect(await vaultDB.readVaultProps(TH.scopeOf('u1'))).to.not.be.null
  })

  it("renders no vault for a signed-out page", () => {
    TH.makeWorld().renderInVault(<TH.VaultProbe />, null)
    expect(screen.getByTestId('vault').textContent).to.eq('none')
  })

  it("seeds the vault from another device, so the page finds it filled and locked", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<TH.VaultProbe />)
    await TH.expectProbeState('locked')
    expect(screen.getByTestId('boxes').textContent).to.eq('anthropic_api_key')
  })

  it("closes the vault it seeds through, even when a store is refused", async () => {
    const world = TH.makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    await TH.expectRefusal(world.seed({ '': 'sk-ant-test-not-a-real-key' }), 'bad_label')
    expect(tally.opened).to.eq(1)
    expect(tally.opened - tally.closed).to.eq(0)
  })

  it("opens the same vault from outside the page, in the acme app as scopeOf has it", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const vault = await world.open()
    await vault.unlock(TH.Passphrase)
    expect(await vault.readBox('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    expect(await world.vaultDB.readVaultProps(TH.scopeOf('u1'))).to.not.be.null
  })

  it("opens the vault from outside the page already unlocked, with the tests' passphrase", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    const vault = await world.openUnlocked()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.readBox('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })
})

describe("makeWorld's vaults opened from outside the page", () => {
  // These two run in order: the second looks at what the first one's test-end cleanup did.
  let opened: Vault | null = null

  it("are handed out open, to a test that opens them", async () => {
    opened = await TH.makeWorld().open()
    expect(opened.getSnapshot().state).to.eq('absent')
  })

  it("are closed once that test has ended", async () => {
    if (opened === null) { throw new Error('the test before this one opens a vault') }
    await TH.expectRefusal(opened.unlock(TH.Passphrase), 'vault_closed')
  })
})

describe("answerPassphraseDialog", () => {
  it("unlocks a locked vault through the dialog withUnlockedVault raises", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<TH.VaultProbe />)
    await TH.expectProbeState('locked')
    fireEvent.click(screen.getByRole('button', { name: 'read' }))
    await TH.answerPassphraseDialog()
    await TH.expectProbeState('unlocked')
    await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
  })

  it("types the passphrase it is given, so a wrong one leaves the dialog asking", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<TH.VaultProbe />)
    await TH.expectProbeState('locked')
    fireEvent.click(screen.getByRole('button', { name: 'read' }))
    await TH.answerPassphraseDialog('not the passphrase')
    await screen.findByText(/passphrase/i, { selector: '.gripe' })
    expect(screen.getByTestId('state').textContent).to.eq('locked')
  })
})

describe("fakeAnthropic", () => {
  it("answers with the joke it was given, recording the request and the key it carried", async () => {
    const anthropic = TH.fakeAnthropic(200, 'Banana who? Banana split, gotta run!')
    expect(await tellKnockKnockJoke('sk-ant-fake-key', 'Banana', anthropic.fetchFn)).to.eq('Banana who? Banana split, gotta run!')
    expect(anthropic.seen).to.have.lengthOf(1)
    expect(anthropic.seen[0]?.apiKeyHeader).to.eq('sk-ant-fake-key')
    expect(anthropic.seen[0]?.url).to.include('/v1/messages')
    expect(JSON.stringify(anthropic.seen[0]?.body.messages)).to.include('Banana')
  })

  it("refuses the key as Anthropic would at any status but 200", async () => {
    const anthropic = TH.fakeAnthropic(401)
    const reply = await anthropic.fetchFn('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{"model":"m","messages":[]}' })
    expect(reply.status).to.eq(401)
    expect(await reply.json()).to.have.nested.property('error.type', 'authentication_error')
  })
})

describe("VaultProbe", () => {
  it("unlocks the vault with the tests' passphrase, through its unlock button", async () => {
    const world = TH.makeWorld()
    await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
    world.renderInVault(<TH.VaultProbe />)
    await TH.expectProbeState('locked')
    fireEvent.click(screen.getByRole('button', { name: 'unlock' }))
    await TH.expectProbeState('unlocked')
    expect(screen.getByTestId('vault').textContent).to.eq('open')
  })
})
