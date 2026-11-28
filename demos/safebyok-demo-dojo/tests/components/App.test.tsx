import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Fixture } from '../../src/lib/fixture'
import { cacheRowsNow, vaultRowsNow } from '../../src/lib/stores'
import * as TH from '../test-helpers'

describe('Reset', () => {
  it('signs out, and on the reloaded page both stores hold the fixture again', async () => {
    await TH.loadPage('nolo')
    await TH.stageShown('unborn')
    const login = TH.region('Login: create the vault')
    TH.fill(login, { 'New passphrase': TH.passphraseOf('nolo'), 'Confirm passphrase': TH.passphraseOf('nolo') })
    await within(login).findByText('Strong enough')
    await TH.press(login, 'Sign In')
    expect(await vaultRowsNow()).to.have.length(Fixture.vault.length + 2)

    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(reload).toHaveBeenCalledOnce()
    await TH.reloadPage()

    expect(await vaultRowsNow()).to.deep.equal(Fixture.vault)
    expect(cacheRowsNow()).to.have.deep.members(Fixture.cache)
    expect(screen.getByText('Nobody is signed in.')).to.exist
    const inspect = TH.showTab('Inspect', 'Inspect')
    await within(inspect).findByText('-- Gate (2) --')
    expect(within(inspect).getAllByText('-- Box (4) --')).to.have.length(1)
  })
})

describe("Inspect", () => {
  it("shows the bank TSQ in the TSQ panel, read through the back door, for a user signed in", async () => {
    await TH.loadPage('hero')
    await TH.stageShown('locked')
    const inspect = TH.showTab('Inspect', 'Inspect')
    const tsq = await within(inspect).findByRole('table', { name: /^TSQ:/ })
    await within(tsq).findByText('-- Gate (1) --')
    expect(within(inspect).getByText(/library's back door/)).to.exist
  })

  it("shows the lease in the TSQ panel: none while locked, its loggable once unlocked, and none again after Lock", async () => {
    await TH.loadPage('hero')
    await TH.stageShown('locked')
    const inspect = TH.showTab('Inspect', 'Inspect')
    const tsq = await within(inspect).findByRole('table', { name: /^TSQ:/ })
    await within(tsq).findByText('-- Lease (1) --')
    expect(within(tsq).queryByText('"passphrase"')).to.be.null
    await TH.unlock(TH.passphraseOf('hero'))
    await within(tsq).findByText('"passphrase"', {}, { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    await waitFor(() => { expect(within(tsq).queryByText('"passphrase"')).to.be.null }, { timeout: 3000 })
  })

  it("shows each revtok, banktok and read_tc cut short by maskUuid, and no UUID whole", async () => {
    await TH.loadPage('hero')
    await TH.stageShown('locked')
    const inspect = TH.showTab('Inspect', 'Inspect')
    await within(inspect).findByRole('table', { name: /^TSQ:/ })
    const masked = await within(inspect).findAllByText(/^[\da-f]{8}-[\da-f]…[\da-f]{2}$/u)
    expect(masked.length).to.be.above(0)
    expect(within(inspect).queryAllByText(/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/u)).to.have.lengthOf(0)
  })
})
