import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Fixture } from '../../src/lib/fixture'
import { vaultRowsNow } from '../../src/lib/stores'
import * as TH from '../test-helpers'

describe('Reset', () => {
  it('signs out, and on the reloaded page both stores hold the fixture again', async () => {
    await TH.loadPage('nolo')
    await TH.stageShown('unborn')
    const login = TH.region('Login: create the vault')
    TH.fill(login, { 'New passphrase': TH.passphraseOf('nolo'), 'Confirm passphrase': TH.passphraseOf('nolo') })
    await within(login).findByText('Strong enough')
    await TH.press(login, 'Sign In')
    expect(await vaultRowsNow()).to.have.length(Fixture.vault.length + 3)

    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(reload).toHaveBeenCalledOnce()
    await TH.reloadPage()

    expect(await vaultRowsNow()).to.deep.equal(Fixture.vault)
    expect(screen.getByText('Nobody is signed in.')).to.exist
    const inspect = TH.showTab('Inspect', 'Inspect')
    await within(inspect).findByText('-- Bank (2) --')
    expect(within(inspect).getAllByText('-- Box (4) --')).to.have.length(1)
  })
})
