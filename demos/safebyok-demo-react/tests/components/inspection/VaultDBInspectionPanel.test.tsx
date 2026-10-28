// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultDBInspectionPanel } from '../../../src/components/inspection/VaultDBInspectionPanel'
import { dbStore, outage, vaultDB, vaultDbInspector } from '../../../src/lib/stores'
import * as TH from '../../test-helpers'

// The panel reads module-level stores, so each test leaves them as it found them: empty.
afterEach(async () => {
  outage.setDown(false)
  for (const scopepath of dbStore.scopepaths()) { dbStore.erase(scopepath) }
  await vaultDbInspector.wipe()
})

describe("VaultDBInspectionPanel", () => {
  it("shows the backend's vault rows as they land, ciphertext marked as such", async () => {
    render(<VaultDBInspectionPanel />)
    await act(() => TH.ensureGated(vaultDB, TH.vaultRecordOf('u1')))
    await waitFor(() => { expect(screen.getAllByText('🔐 ciphertext')).to.have.lengthOf(1) })
    expect(screen.getByText(/ct-vault-u1/)).to.not.be.null
  })

  it("shows the fake auth's account rows beside them", () => {
    dbStore.write('account:safebyok_demo:margo', '{"user_id":"user_0123456789abcdef","userlabel":"margo"}')
    render(<VaultDBInspectionPanel />)
    expect(screen.getByText(/"userlabel":"margo"/)).to.not.be.null
  })

  it("takes the pretend backend down from its switch, and brings it back", () => {
    render(<VaultDBInspectionPanel />)
    const outageSwitch = screen.getByRole('checkbox')
    fireEvent.click(outageSwitch)
    expect(outage.isDown()).to.be.true
    expect((outageSwitch as HTMLInputElement).checked).to.be.true
    fireEvent.click(outageSwitch)
    expect(outage.isDown()).to.be.false
  })

  it("starts from empty shelves, whatever the tests before it wrote", async () => {
    render(<VaultDBInspectionPanel />)
    // The IndexedDB shelf's rows load after the first render: a read of our own, queued behind
    // the panel's, lets them land first.
    await act(() => vaultDbInspector.rows())
    expect(screen.queryByText(/margo/)).to.be.null
    expect(screen.queryByText('🔐 ciphertext')).to.be.null
  })
})
