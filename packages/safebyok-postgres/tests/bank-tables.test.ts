/** BankTablesSql: it matches the shipped .sql file, and it creates the expected tables. */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BankFunctionsSql, BankTablesSql } from '../src/index'
import * as BH from './bank-helpers'
import * as TH from './test-helpers'

BH.bootDatabaseFirst()

const { BW } = TH

/** List the columns of `table` from information_schema: each column's name, type and nullability. */
async function columnsOf(table: string): Promise<string[][]> {
  const db = await BH.database()
  const { rows } = await db.query<{ column_name: string, data_type: string, is_nullable: string }>(
    'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [table],
  )
  return rows.map(({ column_name, data_type, is_nullable }) => [column_name, data_type, is_nullable])
}

// The checks are tested by the rows they refuse: Postgres rewrites a check's text as it stores it.
/** List the primary-key, unique and foreign-key constraints of `table`, as Postgres defines them. */
async function keysOf(table: string): Promise<string[]> {
  const db = await BH.database()
  const { rows } = await db.query<{ definition: string }>(
    "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = $1::regclass AND contype IN ('p', 'u', 'f')", [table],
  )
  return rows.map(({ definition }) => definition)
}

const ToBank = 'FOREIGN KEY (user_id, banklabel) REFERENCES safebyok_banks(user_id, banklabel)'

describe("BankTablesSql", () => {
  it("is the bank-tables.sql the package ships", () => {
    expect(readFileSync(path.join(import.meta.dirname, '..', 'bank-tables.sql'), 'utf8')).to.equal(BankTablesSql)
  })

  it("comes with BankFunctionsSql, which is the bank-functions.sql the package ships and is safe to run again", async () => {
    expect(readFileSync(path.join(import.meta.dirname, '..', 'bank-functions.sql'), 'utf8')).to.equal(BankFunctionsSql)
    const db = await BH.database()
    await db.exec(BankFunctionsSql)
  })

  it("is safe to run again, keeping the rows already stored", async () => {
    const bankDB = await BH.makeBankDB()
    await bankDB.buildBank(BW.bankBuildAskOf())
    const db = await BH.database()
    await db.exec(BankTablesSql)
    expect(await bankDB.ensureBank(BW.bankEnsureAsk)).to.deep.include({ act: 'gotlive', parent: BW.bankAt() })
  })

  it("makes a banks table keyed by bank, and a gates, vaults and boxes table each keyed under it, with a foreign key to its bank row", async () => {
    expect(await keysOf('safebyok_banks')).to.deep.equal(['PRIMARY KEY (user_id, banklabel)'])
    expect(await keysOf('safebyok_gates')).to.have.members(['PRIMARY KEY (user_id, banklabel, gatelabel)', ToBank])
    expect(await keysOf('safebyok_vaults')).to.have.members(['PRIMARY KEY (user_id, banklabel, vaultlabel)', ToBank])
    expect(await keysOf('safebyok_boxes')).to.have.members(['PRIMARY KEY (user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel)', ToBank])
  })

  it("has a column for every field of each row the core stores, and no other, with only what a box's tombstone lacks nullable", async () => {
    const rows = { safebyok_banks: BW.bankAt(), safebyok_gates: BW.gateAt(), safebyok_vaults: BW.vaultAt(), safebyok_boxes: BW.boxAt() }
    for (const [table, row] of Object.entries(rows)) {
      const columns = await columnsOf(table)
      expect(columns.map(([columnname]) => columnname), table).to.have.members(Object.keys(row))
      const nullable = columns.filter((column) => column[2] === 'YES').map(([columnname]) => columnname)
      expect(nullable, table).to.deep.equal((table === 'safebyok_boxes') ? ['sidecar', 'box_key_wrapped', 'whisper_ciphered'] : [])
    }
  })

  it("turns on row-level security for each table", async () => {
    const db = await BH.database()
    const { rows } = await db.query<{ relname: string, relrowsecurity: boolean }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'safebyok\\_%' AND relkind = 'r' ORDER BY relname",
    )
    expect(rows).to.deep.equal(['safebyok_banks', 'safebyok_boxes', 'safebyok_gates', 'safebyok_vaults'].map((relname) => ({ relname, relrowsecurity: true })))
  })
})
