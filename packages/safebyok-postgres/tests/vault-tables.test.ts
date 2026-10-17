import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import * as TH from './test-helpers'
import { BundleColumns, LockboxColumns } from '../src/columns'
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
  await db.exec('TRUNCATE safebyok_lockboxes, safebyok_bundles; DROP TRIGGER IF EXISTS safebyok_lockboxes_capped ON safebyok_lockboxes; DROP FUNCTION IF EXISTS safebyok_lockboxes_capped()')
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
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await db.exec(VaultTablesSql)
    expect(await TH.requestFor(db, 'u1').readBundle(TH.scopeOf('u1'))).to.deep.equal(TH.bundleOf('u1'))
  })

  it("makes a bundle's columns exactly as the adapter writes them, in order, and no more", async () => {
    const db = await TH.database()
    expect(await describedColumns(db, 'safebyok_bundles')).to.deep.equal(BundleColumns.map(([field, kind]) => [field, TypeForKind[kind]]))
  })

  it("makes a lockbox's columns exactly as the adapter writes them, after its vault's scope and vault_id", async () => {
    const db = await TH.database()
    const adapterColumns = [['applabel', 'text'], ['user_id', 'text'], ['vaultlabel', 'text'], ['vault_id', 'text']]
    expect(await describedColumns(db, 'safebyok_lockboxes')).to.deep.equal([
      ...adapterColumns,
      ...LockboxColumns.map(([field, kind]) => [field, TypeForKind[kind]]),
    ])
  })

  it("makes tables and their keys, and no function, trigger or table beyond the two", async () => {
    const db = await tablesOnlyDatabase()
    const { rows: triggers } = await db.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")
    const { rows: functions } = await db.query("SELECT proname FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pronamespace WHERE nspname = 'public'")
    const { rows: tables } = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
    expect(triggers).to.deep.equal([])
    expect(functions).to.deep.equal([])
    expect(tables).to.deep.equal([{ tablename: 'safebyok_bundles' }, { tablename: 'safebyok_lockboxes' }])
  })

  it("keeps every row from a role that is not the tables' owner", async () => {
    const db = await TH.emptyDatabase()
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await db.exec('CREATE ROLE stranger; GRANT SELECT, INSERT ON safebyok_bundles TO stranger')
    try {
      await db.exec('SET ROLE stranger')
      const { rows } = await db.query('SELECT * FROM safebyok_bundles')
      expect(rows).to.have.lengthOf(0)
      await TH.expectRefusal(TH.requestFor(db, 'u2').createBundle(TH.bundleOf('u2')), 'storage_unavailable')
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
    expect(rows).to.deep.equal([{ tgname: 'safebyok_bundles_changed' }, { tgname: 'safebyok_lockboxes_changed' }])
  })

  it("is what push needs: a vault over tables without it never hears another request's write, and works whole", async () => {
    const db = await tablesOnlyDatabase()
    const { heard, unsubscribe } = await TH.liveWatch(TH.requestFor(db, 'u1'), TH.scopeOf('u1'))
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await TH.requestFor(db, 'u1').updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'sk-fake'), { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 })
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(0)
    expect(await TH.requestFor(db, 'u1').listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(1)
    unsubscribe()
  })
})

describe("the README's hard cap, vaya con dios", () => {
  const readme = readFileSync(path.join(import.meta.dirname, '..', 'README.md'), 'utf8')
  const note = /```sql\n([\s\S]*?safebyok_lockboxes_capped[\s\S]*?)```/.exec(readme)?.[1]?.replaceAll(/^ {2}/gm, '')

  it("is in the README as a block of SQL", () => {
    expect(note).to.be.a('string')
  })

  it("refuses the lockbox past its limit, one vault at a time, and lets a vault below it take another", async () => {
    const db = await tablesOnlyDatabase()
    await db.exec(String(note).replaceAll('>= 1000', '>= 2'))
    const vaultDB = TH.requestFor(db, 'u1')
    const u1 = TH.scopeOf('u1')
    const noBoxYet = { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 }
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), vaultlabel: 'other' })
    await vaultDB.updateBox(u1, TH.boxOf('openai', 'sk-fake'), noBoxYet)
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet)
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('mistral', 'sk-fake'), noBoxYet), 'storage_unavailable')
    expect(await vaultDB.listBoxes(u1)).to.have.lengthOf(2)
    await vaultDB.updateBox({ ...u1, vaultlabel: 'other' }, TH.boxOf('mistral', 'sk-fake'), noBoxYet)
    await vaultDB.eraseBox(u1, 'openai', { vault_id: 'vault-id-u1' })
    await vaultDB.updateBox(u1, TH.boxOf('mistral', 'sk-fake'), noBoxYet)
  })
})

describe("VaultChangeChannel", () => {
  it("is the channel a listen hook is handed", () => {
    expect(VaultChangeChannel).to.eq('safebyok_vault_changes')
  })
})
