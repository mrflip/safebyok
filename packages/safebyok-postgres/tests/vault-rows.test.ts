/** The rows in their tables on PGlite: a record is answered as it was stored, each field is in a column of its own, and the tables hold only rows their columns can. */

import { beforeEach, describe, expect, it } from 'vitest'
import { BoxLivesSql, GetBoxWithVaultSql, GetVaultSql, ListBoxesWithVaultSql, ListVaultsSql } from '../src/vault-queries'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

const VaultAddress = [TH.vaultScope.applabel, TH.vaultScope.user_id, TH.vaultScope.vaultlabel]
const LifeAddress  = [...VaultAddress, 'life1']
const BoxAddress   = [...LifeAddress, TH.boxscope.boxlabel]

// A null inside a jsonb column is part of the record: the passkey_wayin of a gate with no passkey, or whatever a host's sidecar has.
const vault          = TH.vaultAt(0)
const passkeyVault   = TH.vaultAt(1, 'life1', { gate: { gate_epoch: 2, passphrase_wayin: TH.passphraseWayin, passkey_wayin: TH.passkeyWayin } })
const vaultTombstone = TH.vaultTombstoneOf(passkeyVault)
const box            = TH.boxAt(0, 'life1', { sidecar: { note: null, tags: ['work', null], nested: { deep: null, count: 2 } } })
const boxTombstone   = TH.boxTombstoneOf(box)
const secondBox      = TH.boxAt(0, 'life1', TH.boxscopeOf('anthropic'))

async function rowsFrom<RowT>(text: string, params: unknown[] = []): Promise<RowT[]> {
  const db = await TH.database()
  const { rows } = await db.query<RowT>(text, params)
  return rows
}

async function storedVault(): Promise<unknown> {
  const [row] = await rowsFrom<{ vault: unknown }>(GetVaultSql, VaultAddress)
  return row?.vault ?? null
}

async function storedBox(): Promise<unknown> {
  const [row] = await rowsFrom<{ box: unknown }>(GetBoxWithVaultSql, BoxAddress)
  return row?.box ?? null
}

// A row is stored here as it is, whatever is stored already: PostgresVaultDB itself stores only through its functions, which test the row first.
const StoreVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $1::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel)
  DO UPDATE SET
    fmt = EXCLUDED.fmt, am = EXCLUDED.am, revision_tok = EXCLUDED.revision_tok, revision_seq = EXCLUDED.revision_seq,
    registered_at = EXCLUDED.registered_at, written_at = EXCLUDED.written_at, vault_tok = EXCLUDED.vault_tok, gate = EXCLUDED.gate
`
const StoreBoxSql = `
  INSERT INTO safebyok_boxes
  SELECT * FROM jsonb_populate_record(NULL::safebyok_boxes, $1::text::jsonb)
  ON CONFLICT (applabel, user_id, vaultlabel, vault_tok, boxlabel)
  DO UPDATE SET
    fmt = EXCLUDED.fmt, am = EXCLUDED.am, revision_tok = EXCLUDED.revision_tok, revision_seq = EXCLUDED.revision_seq,
    registered_at = EXCLUDED.registered_at, written_at = EXCLUDED.written_at, box_tok = EXCLUDED.box_tok,
    whisper_codec = EXCLUDED.whisper_codec, whisper_schema_version = EXCLUDED.whisper_schema_version,
    sidecar = EXCLUDED.sidecar, box_key_wrapped = EXCLUDED.box_key_wrapped, whisper_ciphered = EXCLUDED.whisper_ciphered
`

async function storeVault(record: unknown): Promise<void> { await rowsFrom(StoreVaultSql, [JSON.stringify(record)]) }

async function storeBox(record: unknown): Promise<void> { await rowsFrom(StoreBoxSql, [JSON.stringify(record)]) }

/** The SQLSTATE Postgres refuses `storing` with, or null where it stores. */
async function refusalCodeOf(storing: () => unknown): Promise<string | null> {
  try {
    await storing()
    return null
  } catch (err) { return (err as { code: string }).code }
}

/** The SQLSTATE the vaults table refuses the planting of `row` with, or null where it is planted. */
async function vaultRefusalOf(row: unknown): Promise<string | null> {
  return await refusalCodeOf(() => TH.rowsOf().plantVaultRow(TH.vaultScope, row))
}

beforeEach(async () => { await TH.emptyTables() })

describe("a record stored in its table", () => {
  it("is answered as it was stored: a live vault with a null in its gate, one with a passkey, and a vault tombstone", async () => {
    for (const record of [vault, passkeyVault, vaultTombstone]) {
      await storeVault(record)
      expect(await storedVault()).to.deep.equal(record)
      expect(await TH.rowsOf().vaultRowOf(TH.vaultScope)).to.deep.equal(record)
    }
  })

  it("is answered as it was stored: a live box with nulls in its sidecar, and a box tombstone", async () => {
    await storeVault(vault)
    for (const record of [box, boxTombstone]) {
      await storeBox(record)
      expect(await storedBox()).to.deep.equal(record)
      const boxrows = await TH.rowsOf().boxRowsOf(TH.vaultScope, 'life1')
      expect(boxrows.get(TH.boxscope.boxlabel)).to.deep.equal(record)
    }
  })

  it("is answered with each time a number", async () => {
    await storeVault(vault)
    expect(await storedVault()).to.include({ registered_at: TH.vaultAt().registered_at, written_at: TH.vaultAt().written_at, revision_seq: 0, fmt: vault.fmt })
  })

  it("is the same record from every statement that answers a row", async () => {
    await storeVault(vault)
    await storeBox(box)
    const { boxlabel } = TH.boxscope
    expect(await rowsFrom(ListVaultsSql, VaultAddress.slice(0, 2))).to.deep.equal([{ vaultlabel: 'main', vault }])
    expect(await rowsFrom(GetVaultSql, VaultAddress)).to.deep.equal([{ vault }])
    expect(await rowsFrom(GetBoxWithVaultSql, BoxAddress)).to.deep.equal([{ world: vault, box }])
    expect(await rowsFrom(ListBoxesWithVaultSql, LifeAddress)).to.deep.equal([{ world: vault, boxes: [{ boxlabel, box }] }])
  })

  it("is answered as null or an empty list where no row is stored", async () => {
    expect(await rowsFrom(GetVaultSql, VaultAddress)).to.deep.equal([])
    expect(await rowsFrom(GetBoxWithVaultSql, BoxAddress)).to.deep.equal([{ world: null, box: null }])
    expect(await rowsFrom(ListBoxesWithVaultSql, LifeAddress)).to.deep.equal([{ world: null, boxes: [] }])
  })
})

describe("the columns of a row", () => {
  it("each hold one field of a live vault", async () => {
    await storeVault(vault)
    const columns = 'applabel, user_id, vaultlabel, fmt, am, revision_tok, revision_seq, registered_at::text AS registered_at, written_at::text AS written_at, vault_tok, gate'
    expect(await rowsFrom(`SELECT ${columns} FROM safebyok_vaults`)).to.deep.equal([
      { ...vault, registered_at: String(vault.registered_at), written_at: String(vault.written_at) },
    ])
  })

  it("each hold one field of a live box", async () => {
    await storeVault(vault)
    await storeBox(box)
    const columns = `applabel, user_id, vaultlabel, vault_tok, boxlabel, fmt, am, revision_tok, revision_seq, registered_at::text AS registered_at, written_at::text AS written_at,
      box_tok, whisper_codec, whisper_schema_version, sidecar, box_key_wrapped, whisper_ciphered`
    expect(await rowsFrom(`SELECT ${columns} FROM safebyok_boxes`)).to.deep.equal([
      { ...box, registered_at: String(box.registered_at), written_at: String(box.written_at) },
    ])
  })

  it("are left null by a tombstone stored over a live row, where the tombstone has no such field", async () => {
    await storeVault(passkeyVault)
    await storeBox(box)
    await storeBox(boxTombstone)
    await storeVault(vaultTombstone)
    expect(await rowsFrom('SELECT am, revision_tok, revision_seq, gate FROM safebyok_vaults')).to.deep.equal([
      { am: 'x', revision_tok: vaultTombstone.revision_tok, revision_seq: vaultTombstone.revision_seq, gate: null },
    ])
    expect(await rowsFrom('SELECT am, revision_tok, revision_seq, sidecar, box_key_wrapped, whisper_ciphered FROM safebyok_boxes')).to.deep.equal([
      { am: 'x', revision_tok: boxTombstone.revision_tok, revision_seq: boxTombstone.revision_seq, sidecar: null, box_key_wrapped: null, whisper_ciphered: null },
    ])
  })

  it("count a vault life's box rows whatever their am", async () => {
    await storeVault(vault)
    await storeBox(box)
    await storeBox(TH.boxTombstoneOf(secondBox))
    expect(await rowsFrom(BoxLivesSql, VaultAddress.slice(0, 2))).to.deep.equal([{ vaultlabel: 'main', vault_tok: 'life1', boxcount: 2 }])
  })
})

describe("what the tables hold of a row that fails its checks", () => {
  it("refuse a row that is no object, one missing a field every row has, and a number field that is no integer", async () => {
    expect(await vaultRefusalOf('rubble')).to.equal('22023')
    expect(await vaultRefusalOf({ garbage: true })).to.equal('23502')
    expect(await vaultRefusalOf({ ...vault, revision_seq: 'seven' })).to.equal('22P02')
    expect(await vaultRefusalOf({ ...vault, written_at: 1.5 })).to.equal('22P02')
    expect(await storedVault()).to.be.null
  })

  it("drop a field that has no column, and file a row at the address it is stored at, whatever address it names", async () => {
    await TH.rowsOf().plantVaultRow(TH.vaultScope, { ...vault, smuggled: 'field', user_id: 'u2' })
    expect(await storedVault()).to.deep.equal(vault)
    await TH.rowsOf().plantBoxRow(TH.boxscope, 'life1', { ...box, smuggled: 'field', vault_tok: 'life2', boxlabel: 'other' })
    expect(await storedBox()).to.deep.equal(box)
  })

  it("hold a row of a later fmt", async () => {
    const laterVault = { ...vault, fmt: vault.fmt + 1 }
    await TH.rowsOf().plantVaultRow(TH.vaultScope, laterVault)
    expect(await storedVault()).to.deep.equal(laterVault)
    const laterBox = { ...box, fmt: box.fmt + 1 }
    await TH.rowsOf().plantBoxRow(TH.boxscope, 'life1', laterBox)
    expect(await storedBox()).to.deep.equal(laterBox)
  })

  // 23514 is check_violation.
  it("refuse an am that is not 'a' or 'x', a garbled jsonb field, and a tombstone with a live row's fields or a live row without them", async () => {
    const { gate } = vault
    const vaultFlaws = [
      { ...vault, am: 'q' }, { ...vault, gate: 'rubble' }, { ...vault, gate: { ...gate, gate_epoch: 'one' } }, { ...vault, gate: { ...gate, passphrase_wayin: 'rubble' } },
      { ...vault, gate: { gate_epoch: 1, passphrase_wayin: gate.passphrase_wayin } }, { ...vault, am: 'x' }, { ...vaultTombstone, am: 'a' },
    ]
    for (const flawed of vaultFlaws) { expect(await vaultRefusalOf(flawed)).to.eq('23514') }
    expect(await storedVault()).to.be.null

    await TH.rowsOf().plantVaultRow(TH.vaultScope, vault)
    const boxFlaws = [
      { ...box, am: 'q' }, { ...box, whisper_ciphered: 'garbled' }, { ...box, box_key_wrapped: { cipher_iv_b64: 'aXY' } }, { ...box, sidecar: ['a', 'list'] },
      { ...box, am: 'x' }, { ...boxTombstone, am: 'a' },
    ]
    for (const flawed of boxFlaws) {
      expect(await refusalCodeOf(() => TH.rowsOf().plantBoxRow(TH.boxscope, 'life1', flawed))).to.eq('23514')
    }
    expect(await storedBox()).to.be.null
  })
})

describe("a box row's foreign key to its vault row", () => {
  it("refuses a box row at a scope where no vault row is stored", async () => {
    expect(await refusalCodeOf(() => storeBox(box))).to.equal('23503')
    expect(await refusalCodeOf(() => TH.rowsOf().plantBoxRow(TH.boxscope, 'life1', box))).to.equal('23503')
  })

  it("holds a box row of another life than the vault row's, and keeps it when the vault's vault_tok changes", async () => {
    await storeVault(TH.vaultAt(0, 'life2'))
    await storeBox(box)
    expect(await storedBox()).to.deep.equal(box)
    await storeVault(TH.vaultAt(1, 'life3'))
    expect(await storedBox()).to.deep.equal(box)
  })

  it("refuses a DELETE of a vault row while it has box rows", async () => {
    await storeVault(vault)
    await storeBox(box)
    expect(await refusalCodeOf(() => rowsFrom('DELETE FROM safebyok_vaults WHERE applabel = $1 AND user_id = $2 AND vaultlabel = $3', VaultAddress))).to.equal('23503')
    expect(await storedVault()).to.deep.equal(vault)
  })
})
