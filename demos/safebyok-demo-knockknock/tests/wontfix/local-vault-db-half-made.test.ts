// @vitest-environment jsdom
// A demonstration of a row in notes/wontfix.md (STYLE.md, *Tests*): it asserts the behaviour the row leaves as it is.
// It injects one fault: the browser refusing `localStorage.setItem` once, between the memory vaultDB's write and the save.
// Nothing reaches that window otherwise, which is why the test has to force the refusal.
//
// A real datastore commits a write whole or not at all, and the store is the only copy. An IndexedDB write runs in a
// readwrite transaction: a quota error aborts it, nothing is written, and the adapter resolves only on the
// transaction's complete. A server's database runs the write in one transaction, rolls back on failure, and answers
// only after COMMIT. The core's cache is updated from the store's answer, so memory never runs ahead of the store.
// This stand-in keeps two copies, its memory and localStorage, with no transaction between them.
//
// If it fails, the behaviour has changed: invert it into a promise, move it beside tests/lib/local-vault-db.test.ts, and delete the row.
/** The row "A localStorage save the browser refuses leaves the demo's memory vaultDB ahead of what a reload finds". */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageVaultDB } from '../../src/lib/local-vault-db'
import * as TH from '../test-helpers'

const RowChanged = `notes/wontfix.md, "A localStorage save the browser refuses leaves the demo's memory vaultDB ahead of what a reload finds": the behaviour has changed. Invert this test, move it, and delete the row`

/** The whisper of `box/anthropic` that a fresh device over `vaultDB` reads, once unlocked. */
async function whisperFoundOver(vaultDB: LocalStorageVaultDB): Promise<unknown> {
  const device = TH.makeDevice({}, { vaultDB })
  await device.hello()
  await device.bank!.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
  return await device.vault!.withWhisper('box/anthropic', (box) => box.whisper)
}

beforeEach(() => { localStorage.clear() })

describe("wontfix: a localStorage save the browser refuses", () => {
  it("refuses the put storage_unavailable, while the tab's memory keeps the write and a reload finds the revision before it", async () => {
    const vaultDB = new LocalStorageVaultDB()
    const { vault } = await TH.buildBornVault({ device: TH.makeDevice({}, { vaultDB }) })
    const firstWhisper = { apiKey: 'sk-ant-first' }
    const nextWhisper = { apiKey: 'sk-ant-next' }
    const box = await vault.putBoxOnce('box/anthropic', { sidecar: { mask: 'first' } }, { whisper: firstWhisper })

    // The one injection: a full localStorage refuses the save that follows the memory write.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError') })
    const put = await vault.tryPutBoxOnce(box, { sidecar: { mask: 'next' } }, { whisper: nextWhisper })

    expect(put.ok, RowChanged).to.eq(false)
    expect(put.err, RowChanged).to.have.property('refusalkind', 'storage_unavailable')
    expect(await whisperFoundOver(vaultDB), RowChanged).to.deep.equal(nextWhisper)
    expect(await whisperFoundOver(new LocalStorageVaultDB()), RowChanged).to.deep.equal(firstWhisper)
  })
})
