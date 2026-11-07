/** VaultTablesSql: the file a migration tool copies, and the tables it makes. */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as DB from 'safebyok/storage'
import { VaultTablesSql } from '../src/index'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

/** Each column of `table` as information_schema describes it: its name, type and nullability. */
const columnsOf = async (table: string): Promise<string[][]> => {
  const db = await TH.database()
  const { rows } = await db.query<{ column_name: string, data_type: string, is_nullable: string }>(
    'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [table],
  )
  return rows.map(({ column_name, data_type, is_nullable }) => [column_name, data_type, is_nullable])
}

/** Each primary, unique, foreign or check key of `table`, as Postgres defines it. */
const keysOf = async (table: string): Promise<string[]> => {
  const db = await TH.database()
  const { rows } = await db.query<{ definition: string }>(
    "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = $1::regclass AND contype IN ('p', 'u', 'f', 'c')", [table],
  )
  return rows.map(({ definition }) => definition)
}

describe("VaultTablesSql", () => {
  it("is the vault-tables.sql the package ships", () => {
    expect(readFileSync(path.join(import.meta.dirname, '..', 'vault-tables.sql'), 'utf8')).to.equal(VaultTablesSql)
  })

  it("is safe to run again, keeping the rows already stored", async () => {
    const vaultDB = await TH.makeVaultDB()
    await vaultDB.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
    const db = await TH.database()
    await db.exec(VaultTablesSql)
    expect(await vaultDB.getVault(TH.vaultScope)).to.deep.include({ act: 'got', val: TH.vaultAt() })
  })

  it("makes a vaults table keyed by bank and vaultlabel, and a boxes table keyed by life and boxlabel, each row a jsonb", async () => {
    expect(await columnsOf('safebyok_vaults')).to.deep.equal([
      ['applabel', 'text', 'NO'], ['user_id', 'text', 'NO'], ['vaultlabel', 'text', 'NO'], ['vault', 'jsonb', 'NO'],
    ])
    expect(await keysOf('safebyok_vaults')).to.deep.equal(['PRIMARY KEY (applabel, user_id, vaultlabel)'])
    expect(await columnsOf('safebyok_boxes')).to.deep.equal([
      ['applabel', 'text', 'NO'], ['user_id', 'text', 'NO'], ['vaultlabel', 'text', 'NO'], ['vault_tok', 'text', 'NO'], ['boxlabel', 'text', 'NO'], ['box', 'jsonb', 'NO'],
    ])
    expect(await keysOf('safebyok_boxes')).to.deep.equal(['PRIMARY KEY (applabel, user_id, vaultlabel, vault_tok, boxlabel)'])
  })

  it("turns on row-level security for both tables", async () => {
    const db = await TH.database()
    const { rows } = await db.query<{ relname: string, relrowsecurity: boolean }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('safebyok_vaults', 'safebyok_boxes') ORDER BY relname",
    )
    expect(rows).to.deep.equal([{ relname: 'safebyok_boxes', relrowsecurity: true }, { relname: 'safebyok_vaults', relrowsecurity: true }])
  })
})
