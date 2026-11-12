/** VaultTablesSql: it matches the shipped .sql file, and it creates the expected tables. */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as DB from 'safebyok/storage'
import { VaultFunctionsSql, VaultTablesSql } from '../src/index'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

/** List the columns of `table` from information_schema: each column's name, type and nullability. */
async function columnsOf(table: string): Promise<string[][]> {
  const db = await TH.database()
  const { rows } = await db.query<{ column_name: string, data_type: string, is_nullable: string }>(
    'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [table],
  )
  return rows.map(({ column_name, data_type, is_nullable }) => [column_name, data_type, is_nullable])
}

// The checks are tested by the rows they refuse, in `vault-rows.test.ts`: Postgres rewrites a check's text as it stores it.
/** List the primary-key, unique and foreign-key constraints of `table`, as Postgres defines them. */
async function keysOf(table: string): Promise<string[]> {
  const db = await TH.database()
  const { rows } = await db.query<{ definition: string }>(
    "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = $1::regclass AND contype IN ('p', 'u', 'f')", [table],
  )
  return rows.map(({ definition }) => definition)
}

describe("VaultTablesSql", () => {
  it("is the vault-tables.sql the package ships", () => {
    expect(readFileSync(path.join(import.meta.dirname, '..', 'vault-tables.sql'), 'utf8')).to.equal(VaultTablesSql)
  })

  it("comes with VaultFunctionsSql, which is the vault-functions.sql the package ships and is safe to run again", async () => {
    expect(readFileSync(path.join(import.meta.dirname, '..', 'vault-functions.sql'), 'utf8')).to.equal(VaultFunctionsSql)
    const db = await TH.database()
    await db.exec(VaultFunctionsSql)
  })

  it("is safe to run again, keeping the rows already stored", async () => {
    const vaultDB = await TH.makeVaultDB()
    await vaultDB.putVault({ op: 'put', ...TH.vaultScope, ifAbsent: 'add', ifPresent: 'fail', expected: DB.shellVaultOf(TH.vaultScope), record: TH.vaultAt() })
    const db = await TH.database()
    await db.exec(VaultTablesSql)
    expect(await vaultDB.getVault({ op: 'get', ...TH.vaultScope, ifAbsent: 'fail', expected: TH.vaultAt() })).to.deep.include({ act: 'gotlive', val: TH.vaultAt() })
  })

  it("makes a vaults table keyed by bank and vaultlabel, a column to each field of a vault row, with only the gate nullable", async () => {
    expect(await columnsOf('safebyok_vaults')).to.deep.equal([
      ['user_id', 'text', 'NO'], ['banklabel', 'text', 'NO'], ['vaultlabel', 'text', 'NO'],
      ['fmt', 'integer', 'NO'], ['am', 'text', 'NO'], ['revision_tok', 'text', 'NO'], ['revision_seq', 'integer', 'NO'],
      ['registered_at', 'bigint', 'NO'], ['written_at', 'bigint', 'NO'], ['vault_tok', 'text', 'NO'], ['gate', 'jsonb', 'YES'],
    ])
    expect(await keysOf('safebyok_vaults')).to.deep.equal(['PRIMARY KEY (user_id, banklabel, vaultlabel)'])
  })

  it("makes a boxes table keyed by life and boxlabel, a column to each field of a box row, with only what a tombstone lacks nullable", async () => {
    expect(await columnsOf('safebyok_boxes')).to.deep.equal([
      ['user_id', 'text', 'NO'], ['banklabel', 'text', 'NO'], ['vaultlabel', 'text', 'NO'], ['vault_tok', 'text', 'NO'], ['boxlabel', 'text', 'NO'],
      ['fmt', 'integer', 'NO'], ['am', 'text', 'NO'], ['revision_tok', 'text', 'NO'], ['revision_seq', 'integer', 'NO'],
      ['registered_at', 'bigint', 'NO'], ['written_at', 'bigint', 'NO'], ['box_tok', 'text', 'NO'],
      ['whisper_codec', 'text', 'NO'], ['whisper_schema_version', 'integer', 'NO'],
      ['sidecar', 'jsonb', 'YES'], ['box_key_wrapped', 'jsonb', 'YES'], ['whisper_ciphered', 'jsonb', 'YES'],
    ])
    expect(await keysOf('safebyok_boxes')).to.have.members([
      'PRIMARY KEY (user_id, banklabel, vaultlabel, vault_tok, boxlabel)',
      'FOREIGN KEY (user_id, banklabel, vaultlabel) REFERENCES safebyok_vaults(user_id, banklabel, vaultlabel)',
    ])
  })

  it("has a column for every field of each row the core stores, and no other", async () => {
    const vaultColumns = await columnsOf('safebyok_vaults')
    expect(vaultColumns.map(([columnname]) => columnname)).to.have.members(Object.keys(TH.vaultAt()))
    const boxColumns = await columnsOf('safebyok_boxes')
    expect(boxColumns.map(([columnname]) => columnname)).to.have.members(Object.keys(TH.boxAt()))
  })

  it("turns on row-level security for both tables", async () => {
    const db = await TH.database()
    const { rows } = await db.query<{ relname: string, relrowsecurity: boolean }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('safebyok_vaults', 'safebyok_boxes') ORDER BY relname",
    )
    expect(rows).to.deep.equal([{ relname: 'safebyok_boxes', relrowsecurity: true }, { relname: 'safebyok_vaults', relrowsecurity: true }])
  })
})
