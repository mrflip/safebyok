import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import type { RequestCleartext } from 'safebyok'
import { BankProvider } from '../../src/provider/bank-provider'
import { DevBoxInspector } from '../../src/devmode'
import * as TH from '../test-helpers'

TH.sweepBankWorlds()

/** An obvious fake whisper, as stored. */
const StoredKey = 'sk-ant-fake-stored'

/** A requestCleartext that types the test's passphrase into every dialog. */
const typingPassphrase: RequestCleartext = async (gating) => { await gating.attempt(TH.byPassphrase(TH.Passphrase)) }

/** The inspector open on `anthropic`, under a provider on its own device, the vault holding that box with its apiKey {@link StoredKey}. */
const renderOverBox = async (boxlabel = 'anthropic') => {
  const { world, vault } = await TH.makeBankWithVault()
  await vault.putBox({ boxlabel: 'anthropic', whisper: { apiKey: StoredKey } }, { ifAbsent: 'add' })
  render(
    <StrictMode>
      <BankProvider {...TH.providerPropsOf(world, { requestCleartext: typingPassphrase })}><DevBoxInspector defaultBoxlabel={boxlabel} /></BankProvider>
    </StrictMode>,
  )
  // `vault present` comes before the vault's own hello has listed its boxes, and the status says `box not listed` until then:
  // the boxlabel suggestions name a box once listed, whichever boxlabel the inspector is open on.
  await waitFor(() => { expect(status()).to.match(/^vault present/) })
  await waitFor(() => { expect(document.querySelector('datalist option[value="anthropic"]')).not.to.eq(null) })
  return { world, vault }
}

const status = () => screen.getByTestId('dev-box-status').textContent
const click = (buttonname: string) => { fireEvent.click(screen.getByRole('button', { name: buttonname })) }
/** The block that shows the whisper under `caption`. */
const whisperBlock = (caption: string) => within(screen.getByText(caption).parentElement!)
const lastCall = () => screen.getByRole('status').textContent
/** Clicks ensureUnlocked, and waits for the vault to say it is unlocked. */
const unlocking = async () => {
  click('ensureUnlocked')
  await waitFor(() => { expect(status()).to.include(', unlocked;') })
}

describe("DevBoxInspector", () => {
  it("asks for nothing and shows nothing of the whisper until a button is clicked", async () => {
    await renderOverBox()
    expect(status()).to.eq('vault present, locked; box revision 0, not exposed; not showing')
    expect(whisperBlock('box.whisper').getByText('unexposed')).to.exist
    expect(document.body.textContent).not.to.include(StoredKey)
  })

  it("exposes from its button, keeping the whisper masked until its own Show", async () => {
    await renderOverBox()
    await unlocking()
    click('expose')
    await waitFor(() => { expect(status()).to.eq('vault present, unlocked; box revision 0, exposed; showing') })
    expect(document.body.textContent).not.to.include(StoredKey)
    fireEvent.click(whisperBlock('box.whisper').getByRole('button', { name: 'Show' }))
    expect(whisperBlock('box.whisper').getByText(/sk-ant-fake-stored/)).to.exist
    click('veil')
    await waitFor(() => { expect(whisperBlock('box.whisper').getByText('veiled')).to.exist })
    expect(document.body.textContent).not.to.include(StoredKey)
  })

  it("forgets the whisper it extracted when the vault locks", async () => {
    await renderOverBox()
    await unlocking()
    click('extractWhisper')
    await waitFor(() => { expect(whisperBlock('extracted').getByRole('button', { name: 'Show' })).to.exist })
    expect(document.body.textContent).not.to.include(StoredKey)
    click('lock')
    await waitFor(() => { expect(whisperBlock('extracted').getByText('none extracted')).to.exist })
  })

  it("puts a box new to the vault, then deletes it", async () => {
    await renderOverBox('fresh')
    expect(screen.getByRole('button', { name: 'expose' })).to.have.property('disabled', true)
    await unlocking()
    click('putBox (empty)')
    await waitFor(() => { expect(status()).to.include('box revision 0') })
    click('delBox')
    await waitFor(() => { expect(status()).to.include('box not listed') })
  })

  it("puts the text typed under the fieldname given", async () => {
    const { vault } = await renderOverBox('typed')
    await unlocking()
    fireEvent.change(screen.getByLabelText('Whisper text'), { target: { value: 'sk-typed' } })
    click('putBox (typed)')
    await waitFor(() => { expect(status()).to.include('box revision 0') })
    await vault.ensureUnlocked()
    const box = await vault.fetchBox('typed')
    expect(await box?.extractWhisper()).to.deep.equal({ apiKey: 'sk-typed' })
  })

  it("shows a refusal by its kind", async () => {
    await renderOverBox()
    click('unveil')
    await waitFor(() => { expect(lastCall()).to.match(/^unveil refused:bad_option: /) })
  })

  it("offers a hint, not its buttons, for a label the core refuses", async () => {
    await renderOverBox()
    fireEvent.change(screen.getByLabelText('boxlabel'), { target: { value: 'not a label!' } })
    expect(screen.queryByRole('button', { name: 'expose' })).to.be.null
    expect(screen.getByText(/^Name a vault and a box/)).to.exist
  })
})
