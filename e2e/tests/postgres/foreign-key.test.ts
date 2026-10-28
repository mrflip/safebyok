// @vitest-environment node
// The `23503` the postgres README maps to `vault_mismatch`: a box whose vault is deleted after the
// insert's statement began. PGlite cannot raise it between two statements; here one device's
// insert is held at its foreign key check by another's uncommitted delete of the vault row, and
// meets the foreign key's own verdict when that delete commits.
import { expect, it } from 'vitest'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()
const u1 = TH.scopeOf('u1')

TH.describeOnPostgres('foreign key', "postgresVaultDB's first write, over a real Postgres", () => {
  // The insert's own count sees the vault still stored, so only the foreign key's `23503` can refuse it here.
  it("refuses as vault_mismatch a box whose vault another connection deleted while its insert waited on the foreign key, and stores nothing", async () => {
    const db = getDb()
    await db.empty()
    const device = TH.deviceOver(db, undefined, {})('u1')
    await TH.filled(device, [])
    const eraser = await db.client()
    await eraser.query('BEGIN')
    await eraser.query("DELETE FROM safebyok_vaults WHERE user_id = 'u1'")

    const write = TH.expectBad(device.tryPutBox(u1, TH.noBoxYet, TH.boxOf('anthropic', 'sk-fake')), 'vault_mismatch')
    await TH.untilBlockedBy(db, eraser)
    await eraser.query('COMMIT')
    await write

    expect(await TH.vaultRecordIn(device, u1)).to.be.null
    expect(await TH.boxesStored(db)).to.eq(0)
  })

  it("lands the box when the delete is rolled back instead: the foreign key is read against the vault row as last committed", async () => {
    const db = getDb()
    await db.empty()
    const device = TH.deviceOver(db, undefined, {})('u1')
    await TH.filled(device, [])
    const eraser = await db.client()
    await eraser.query('BEGIN')
    await eraser.query("DELETE FROM safebyok_vaults WHERE user_id = 'u1'")

    const write = device.tryPutBox(u1, TH.noBoxYet, TH.boxOf('anthropic', 'sk-fake'))
    await TH.untilBlockedBy(db, eraser)
    await eraser.query('ROLLBACK')
    await TH.expectGood(write)

    expect(await TH.expectingGood(device).tryGetBox(u1, 'anthropic', TH.inThisVault)).to.not.be.null
  })
})
