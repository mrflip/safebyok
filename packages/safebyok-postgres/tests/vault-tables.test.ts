import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import * as TH from './test-helpers'
import { VaultPropsColumns, BoxColumns } from '../src/columns'
import { VaultChangeChannel, VaultNotifySql, VaultTablesSql } from '../src/vault-tables'

/** A column as information_schema describes it: its name and its type. */
type DescribedColumn = { column_name: string, data_type: string }

const TypeForKind = { text: 'text', bigint: 'bigint', jsonb: 'jsonb' } as const

const describedColumns = async (db: PGlite, table: string) => {
  const { rows } = await db.query<DescribedColumn>(
    'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
    [table],
  )
  return rows.map((row) => [row.column_name, row.data_type])
}

/** A key as pg_constraint describes it: its name and its definition. */
type DescribedKey = { conname: string, definition: string }

// Primary, unique, foreign and check constraints: every key a table has, and none of the NOT NULLs
// a newer Postgres also lists there.
const describedKeys = async (db: PGlite, table: string) => {
  const { rows } = await db.query<DescribedKey>(
    "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = $1::regclass AND contype IN ('p', 'u', 'f', 'c') ORDER BY conname",
    [table],
  )
  return rows.map((row) => [row.conname, row.definition])
}

TH.bootDatabaseFirst()

/** A PGlite of its own with VaultTablesSql run in it and nothing else, made once per file. */
const tablesOnly: { db?: Promise<PGlite> } = {}
const tablesOnlyDatabase = async (): Promise<PGlite> => {
  tablesOnly.db ??= (async () => {
    const db = new PGlite()
    await db.exec(VaultTablesSql)
    return db
  })()
  const db = await tablesOnly.db
  await db.exec('TRUNCATE safebyok_boxes, safebyok_vaults')
  return db
}
beforeAll(async () => { await tablesOnlyDatabase() }, TH.BootMillis)

describe("VaultTablesSql", () => {
  it("is the package's vault-tables.sql, word for word", () => {
    const shipped = readFileSync(path.join(import.meta.dirname, '..', 'vault-tables.sql'), 'utf8')
    expect(VaultTablesSql).to.eq(shipped)
  })

  it("can be run again over the tables it made, keeping their rows", async () => {
    const db = await TH.emptyDatabase()
    await TH.expectGood(TH.requestFor(db, 'u1').ensureVaultProps(TH.vaultPropsOf('u1')))
    await db.exec(VaultTablesSql)
    expect(await TH.expectingGood(TH.requestFor(db, 'u1')).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(TH.vaultPropsOf('u1'))
  })

  it("makes the vault props' columns exactly as the adapter writes them, in order, and no more", async () => {
    const db = await TH.database()
    expect(await describedColumns(db, 'safebyok_vaults')).to.deep.equal(VaultPropsColumns.map(([field, kind]) => [field, TypeForKind[kind]]))
  })

  it("makes a box's columns exactly as the adapter writes them, after its vault's scope and vault_id", async () => {
    const db = await TH.database()
    const adapterColumns = [['applabel', 'text'], ['user_id', 'text'], ['vaultlabel', 'text'], ['vault_id', 'text']]
    expect(await describedColumns(db, 'safebyok_boxes')).to.deep.equal([
      ...adapterColumns,
      ...BoxColumns.map(([field, kind]) => [field, TypeForKind[kind]]),
    ])
  })

  it("names each key for its table, as Postgres does a key made with the table", async () => {
    const db = await tablesOnlyDatabase()
    expect(await describedKeys(db, 'safebyok_vaults')).to.deep.equal([
      ['safebyok_vaults_applabel_user_id_vaultlabel_vault_id_key', 'UNIQUE (applabel, user_id, vaultlabel, vault_id)'],
      ['safebyok_vaults_pkey',                                     'PRIMARY KEY (applabel, user_id, vaultlabel)'],
    ])
    expect(await describedKeys(db, 'safebyok_boxes')).to.deep.equal([
      ['safebyok_boxes_applabel_user_id_vaultlabel_vault_id_fkey', 'FOREIGN KEY (applabel, user_id, vaultlabel, vault_id) REFERENCES safebyok_vaults(applabel, user_id, vaultlabel, vault_id) ON DELETE CASCADE'],
      ['safebyok_boxes_pkey',                                      'PRIMARY KEY (applabel, user_id, vaultlabel, boxlabel)'],
    ])
  })

  it("holds every column NOT NULL but the vault props' passkey and a box's sidecar, each a SQL null for a JSON null, and defaults none", async () => {
    const db = await tablesOnlyDatabase()
    const { rows } = await db.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('safebyok_vaults', 'safebyok_boxes') AND (is_nullable = 'YES' OR column_default IS NOT NULL)",
    )
    expect(rows).to.have.deep.members([{ table_name: 'safebyok_vaults', column_name: 'passkey' }, { table_name: 'safebyok_boxes', column_name: 'sidecar' }])
  })

  it("never changes the columns of a table already there, so a table of another release's shape stays as it was until the host drops it", async () => {
    const db = await tablesOnlyDatabase()
    const elderColumns = await db.transaction(async (tx) => {
      await tx.exec('CREATE SCHEMA elder; SET LOCAL search_path TO elder')
      await tx.exec('CREATE TABLE safebyok_boxes (applabel text, revision_id text)')
      await tx.exec(VaultTablesSql)
      const { rows } = await tx.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'elder' AND table_name = 'safebyok_boxes' ORDER BY ordinal_position",
      )
      await tx.rollback()
      return rows.map((row) => row.column_name)
    })
    expect(elderColumns).to.deep.equal(['applabel', 'revision_id'])
  })

  it("makes tables and their keys, and no function, trigger or table beyond the two", async () => {
    const db = await tablesOnlyDatabase()
    const { rows: triggers } = await db.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")
    const { rows: functions } = await db.query("SELECT proname FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pronamespace WHERE nspname = 'public'")
    const { rows: tables } = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
    expect(triggers).to.deep.equal([])
    expect(functions).to.deep.equal([])
    expect(tables).to.deep.equal([{ tablename: 'safebyok_boxes' }, { tablename: 'safebyok_vaults' }])
  })

  it("keeps every row from a role that is not the tables' owner", async () => {
    const db = await TH.emptyDatabase()
    await TH.expectGood(TH.requestFor(db, 'u1').ensureVaultProps(TH.vaultPropsOf('u1')))
    await db.exec('CREATE ROLE stranger; GRANT SELECT, INSERT ON safebyok_vaults TO stranger')
    try {
      await db.exec('SET ROLE stranger')
      const { rows } = await db.query('SELECT * FROM safebyok_vaults')
      expect(rows).to.have.lengthOf(0)
      await TH.expectBad(TH.requestFor(db, 'u2').ensureVaultProps(TH.vaultPropsOf('u2')), 'not_permitted')
    } finally {
      await db.exec('RESET ROLE; DROP OWNED BY stranger; DROP ROLE stranger')
    }
  })
})

describe("VaultNotifySql", () => {
  it("is the package's vault-notify.sql, word for word", () => {
    const shipped = readFileSync(path.join(import.meta.dirname, '..', 'vault-notify.sql'), 'utf8')
    expect(VaultNotifySql).to.eq(shipped)
  })

  it("notifies the channel the adapter listens on", () => {
    expect(VaultNotifySql).to.include(`pg_notify('${VaultChangeChannel}'`)
  })

  it("can be run again over the triggers it made", async () => {
    const db = await TH.database()
    await db.exec(VaultNotifySql)
    await db.exec(VaultNotifySql)
    const { rows } = await db.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname")
    expect(rows).to.deep.equal([{ tgname: 'safebyok_boxes_changed' }, { tgname: 'safebyok_vaults_changed' }])
  })

  it("is what push needs: a vault over tables without it never hears another request's write, and works whole", async () => {
    const db = await tablesOnlyDatabase()
    const { heard, unsubscribe } = await TH.liveWatch(TH.requestFor(db, 'u1'), TH.scopeOf('u1'))
    await TH.expectGood(TH.requestFor(db, 'u1').ensureVaultProps(TH.vaultPropsOf('u1')))
    await TH.expectGood(TH.requestFor(db, 'u1').putBox(TH.scopeOf('u1'), { vault_id: 'vault-id-u1', revision_tok: null }, TH.boxOf('anthropic', 'sk-fake')))
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(0)
    expect(await TH.expectingGood(TH.requestFor(db, 'u1')).listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(1)
    unsubscribe()
  })
})

describe("VaultChangeChannel", () => {
  it("is the channel a listen hook is handed", () => {
    expect(VaultChangeChannel).to.eq('safebyok_vault_changes')
  })
})
