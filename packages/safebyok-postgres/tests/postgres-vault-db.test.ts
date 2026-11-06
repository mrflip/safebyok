/** PostgresVaultDB over PGlite: the battery every VaultDB runs, and what is Postgres's own. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as SX from 'safebyok/storage'
import type { Notice } from 'safebyok/storage'
import { PostgresVaultDB, VaultChangeChannel } from '../src/index'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

/** A client whose every statement fails with `err`. */
const throwingClient = (err: Error) => ({
  query:       () => Promise.reject(err),
  transaction: () => Promise.reject(err),
})

/** A watch on `vaultDB` at the vault's scope, closed when the test ends, and the notices it has heard so far. */
const watching = (vaultDB: PostgresVaultDB) => {
  const notices: Notice[] = []
  const unwatch = vaultDB.watch(TH.vaultScope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

TH.describeVaultDBBattery("PostgresVaultDB", {
  makeVaultDB:         async (opts) => await TH.makeVaultDB(opts),
  makeCappedVaultDB:   async (maxBoxes) => await TH.makeVaultDB({ maxBoxes }),
  makeTwin:            TH.makeTwin,
  _cheat_rowsOf:       () => TH.rowsOf(),
  _cheat_failNextCall: TH.failNextCall,
})

describe("PostgresVaultDB's constructor", () => {
  it("refuses a client, listen or maxBoxes it cannot use", async () => {
    const client = TH.flakyClientOf(await TH.database())
    const unusable = [{}, { client: { query: client.query } }, { client, listen: 'yes' }, { client, maxBoxes: -1 }, { client, maxRecordBytes: 0 }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new PostgresVaultDB(opts as never), 'bad_option') }
  })
})

describe("PostgresVaultDB's rows", () => {
  it("stores each record whole as jsonb, beside the columns it is found by", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    const box = TH.boxAt()
    await vaultDB.putVault(vault, { prior: SX.VoidRevision })
    await vaultDB.putBox(box, { prior: SX.VoidRevision })
    const db = await TH.database()
    const { rows: vaultrows } = await db.query('SELECT applabel, user_id, vaultlabel, vault FROM safebyok_vaults')
    const { rows: boxrows } = await db.query('SELECT applabel, user_id, vaultlabel, vault_tok, boxlabel, box FROM safebyok_boxes')
    expect(vaultrows).to.deep.equal([{ ...TH.vaultScope, vault }])
    expect(boxrows).to.deep.equal([{ ...TH.boxQuery, box }])
  })
})

describe("PostgresVaultDB's refusals", () => {
  it("refuses a statement that failed for want of a table or a privilege as unexpected, and any other as the storage out of reach", async () => {
    const noTable = Object.assign(new Error('relation "safebyok_vaults" does not exist'), { code: '42P01' })
    const missing = new PostgresVaultDB({ client: throwingClient(noTable) })
    const dropped = new PostgresVaultDB({ client: throwingClient(new Error('Connection terminated unexpectedly')) })
    await TH.expectRefusal(missing.getVault(TH.vaultScope), 'unexpected_error')
    await TH.expectRefusal(missing.putVault(TH.vaultAt(), { prior: SX.VoidRevision }), 'unexpected_error')
    await TH.expectRefusal(dropped.listVaults(TH.bankScope), 'storage_unavailable')
  })

  it("keeps a driver error's name, message and code as the cause, and none of the statement's parameters", async () => {
    const vaultDB = await TH.makeVaultDB()
    TH.failNextCall(vaultDB)
    const { err } = await vaultDB.tryPutBox(TH.boxAt(), { prior: SX.VoidRevision })
    expect(SX.isVaultError(err, 'storage_unavailable')).to.be.true
    expect(err?.cause).to.deep.include({ message: 'terminating connection due to administrator command', code: '57P01' })
    expect(err?.cause).not.to.have.property('params')
  })
})

describe("PostgresVaultDB's watch", () => {
  it("hears a write whose rows will not fit in a notification as the rows then stand", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    await vaultDB.putVault(vault, { prior: SX.VoidRevision })
    const notices = watching(vaultDB)
    const box = TH.boxAt(0, 'life1', { sidecar: { note: 'x'.repeat(9000) } })
    await vaultDB.putBox(box, { prior: SX.VoidRevision })
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'got', val: box, world: vault }]) })
  })

  it("passes over a notification on its channel that no write of ours sent", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    const notices = watching(vaultDB)
    const db = await TH.database()
    await db.query('SELECT pg_notify($1, $2), pg_notify($1, $3)', [VaultChangeChannel, 'not json', '{"applabel":"acme"}'])
    await vaultDB.putVault(vault, { prior: SX.VoidRevision })
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'got', val: vault, world: vault }]) })
  })

  it("hears nothing without a listen", async () => {
    await TH.emptyTables()
    const vaultDB = new PostgresVaultDB({ client: TH.flakyClientOf(await TH.database()) })
    const notices = watching(vaultDB)
    await vaultDB.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    await TH.aWhile()
    expect(notices).to.deep.equal([])
  })
})
