// @vitest-environment node
// The `23503` the postgres README maps to `stale_write`: a lockbox whose vault is retired after the
// insert's statement began. PGlite cannot raise it between two statements; here one device's
// insert is held at its foreign key check by another's uncommitted delete of the vault row, and
// meets the foreign key's own verdict when that delete commits.
import { expect, it } from 'vitest'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()
const u1 = TH.scopeOf('u1')

TH.describeOnPostgres('foreign key', "postgresVaultDB's first write, over a real Postgres", () => {
  // The insert's own count sees the vault standing, so only the foreign key's `23503` can refuse it here.
  it("refuses as stale_write a lockbox whose vault another connection retired while its insert waited on the foreign key, and stores nothing", async () => {
    const db = getDb()
    await db.empty()
    const device = TH.deviceOver(db, undefined, {})('u1')
    await TH.filled(device, [])
    const eraser = await db.client()
    await eraser.query('BEGIN')
    await eraser.query("DELETE FROM safebyok_vaults WHERE user_id = 'u1'")

    const write = TH.expectRefusal(device.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), TH.noBoxYet), 'stale_write')
    await TH.untilStatementBlocked(db, TH.FirstWriteStatement)
    await eraser.query('COMMIT')
    await write

    expect(await device.readVaultProps(u1)).to.be.null
    expect(await TH.lockboxesStanding(db)).to.eq(0)
  })

  it("lands the lockbox when the delete is rolled back instead: the foreign key is read against the vault row that stands", async () => {
    const db = getDb()
    await db.empty()
    const device = TH.deviceOver(db, undefined, {})('u1')
    await TH.filled(device, [])
    const eraser = await db.client()
    await eraser.query('BEGIN')
    await eraser.query("DELETE FROM safebyok_vaults WHERE user_id = 'u1'")

    const write = device.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), TH.noBoxYet)
    await TH.untilStatementBlocked(db, TH.FirstWriteStatement)
    await eraser.query('ROLLBACK')
    await write

    expect(await device.readBox(u1, 'anthropic')).to.not.be.null
  })
})
