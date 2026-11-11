import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ckeyOf } from 'safebyok/storage'
import { DevDeviceDBInspector } from '../../src/devmode'
import * as TH from '../test-helpers'

TH.sweepBankWorlds()

/** Render the inspector over the deviceDB of a world whose bank built `main`, so the deviceDB has that vault's lease. */
const renderOverLease = async () => {
  const { world } = await TH.makeBankWithVault()
  render(<DevDeviceDBInspector deviceDB={world.deviceDB} />)
  await waitFor(() => { expect(leaseRow('main')).to.exist })
  return { world }
}

/** Return the table row for the lease of the vault named `vaultlabel`. */
const leaseRow = (vaultlabel: string) => screen.getByText(vaultlabel).closest('tr') as HTMLElement
const includingDamaged = () => { fireEvent.click(screen.getByLabelText('Include damaged rows')) }

describe("DevDeviceDBInspector", () => {
  it("lists each lease by the fields listLeases answers", async () => {
    await renderOverLease()
    const cells = within(leaseRow('main')).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells.slice(0, 3)).to.deep.equal(['acme', 'u1', 'main'])
    expect(cells[5]).to.eq('')
  })

  it("names the kind of a raw row's key fields, never their content", async () => {
    await renderOverLease()
    includingDamaged()
    // The caption says listRawLeases as soon as the checkbox is ticked, and the raw rows arrive later.
    await waitFor(() => { expect(within(leaseRow('main')).getByText(/lease_key: <CryptoKey>/)).to.exist })
  })

  it("keeps the caption of the rows shown until the next listing lands", async () => {
    const { world } = await renderOverLease()
    const listing = TH.makePending()
    const listRaw = world.deviceDB.listRawLeases.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'listRawLeases').mockImplementation(async () => { await listing.promise; return listRaw() })
    includingDamaged()
    expect(screen.getByText(/as listLeases answers them/)).to.exist
    listing.resolve(undefined)
    await waitFor(() => { expect(screen.getByText(/as listRawLeases answers them/)).to.exist })
  })

  it("forgets a lease", async () => {
    const { world } = await renderOverLease()
    fireEvent.click(within(leaseRow('main')).getByRole('button', { name: 'forget' }))
    await waitFor(() => { expect(screen.queryByText('main')).to.be.null })
    expect(world.leaseRows()).to.deep.equal([])
  })

  it("lists a damaged row only with damaged rows, and deletes it by forgetRawLease", async () => {
    const { world } = await renderOverLease()
    world.deviceDB._cheat_leaseRows().set(ckeyOf('acme', 'u1', 'mangled'), { scopepath: ['acme', 'u1', 'mangled'], row: { applabel: 'acme', user_id: 'u1', vaultlabel: 'mangled' } })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => { expect(screen.getAllByRole('row')).to.have.lengthOf(2) })
    includingDamaged()
    await waitFor(() => { expect(leaseRow('mangled')).to.exist })
    expect(within(leaseRow('mangled')).queryByRole('button', { name: 'forget' })).to.be.null
    fireEvent.click(within(leaseRow('mangled')).getByRole('button', { name: 'forgetRawLease' }))
    await waitFor(() => { expect(screen.queryByText('mangled')).to.be.null })
  })

  it("shows a damaged row's invalid proved_at as the raw number", async () => {
    const { world } = await renderOverLease()
    world.deviceDB._cheat_leaseRows().set(ckeyOf('acme', 'u1', 'mangled'), { scopepath: ['acme', 'u1', 'mangled'], row: { applabel: 'acme', user_id: 'u1', vaultlabel: 'mangled', proved_at: NaN } })
    includingDamaged()
    await waitFor(() => { expect(leaseRow('mangled')).to.exist })
    expect(within(leaseRow('mangled')).getByText('NaN')).to.exist
  })
})
