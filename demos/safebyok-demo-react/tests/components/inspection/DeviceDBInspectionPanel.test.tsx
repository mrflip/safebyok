// @vitest-environment jsdom
// fake-indexeddb installs an indexedDB global before the demo's stores open their shelves.
import 'fake-indexeddb/auto'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { idbDeviceDB } from 'safebyok/idb'
import { DeviceDBInspectionPanel } from '../../../src/components/inspection/DeviceDBInspectionPanel'
import { Applabel, deviceDbInspector, deviceStore } from '../../../src/lib/stores'
import * as TH from '../../test-helpers'

// The panel reads module-level stores, so each test leaves them as it found them: empty.
afterEach(async () => {
  for (const ckey of deviceStore.ckeys()) { deviceStore.erase(ckey) }
  await deviceDbInspector.wipe()
})

describe("DeviceDBInspectionPanel", () => {
  it("shows this device's lease as it lands, its leaseKey a handle", async () => {
    render(<DeviceDBInspectionPanel />)
    const lease = { ...(await TH.leaseOf('u1')), applabel: Applabel }
    await act(() => idbDeviceDB({ dbName: Applabel }).putLease(lease))
    await waitFor(() => { expect(screen.getAllByText('🔑 non-extractable key')).to.have.lengthOf(1) })
    expect(screen.getByText(/«CryptoKey non-extractable handle»/)).to.not.be.null
  })

  it("shows the fake auth's session beside it", () => {
    deviceStore.write('session:safebyok_demo', '{"userId":"user_0123456789abcdef","userlabel":"margo"}')
    render(<DeviceDBInspectionPanel />)
    expect(screen.getByText(/"userlabel":"margo"/)).to.not.be.null
  })

  it("starts from empty shelves, whatever the tests before it wrote", async () => {
    render(<DeviceDBInspectionPanel />)
    // The IndexedDB shelf's rows load after the first render: a read of our own, queued behind
    // the panel's, lets them land first.
    await act(() => deviceDbInspector.rows())
    expect(screen.queryByText(/margo/)).to.be.null
    expect(screen.queryByText('🔑 non-extractable key')).to.be.null
  })
})
