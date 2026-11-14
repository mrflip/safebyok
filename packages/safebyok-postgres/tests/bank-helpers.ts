/** Bank test helpers: one PGlite per test file holding the bankDB's tables, PostgresBankDBs on it, and direct row access for the bankDB battery. */

import { afterAll, beforeAll, onTestFinished } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import type { BankScope, Boxscope, BX, VaultScope } from 'safebyok-big/storage'
import * as TH from 'safebyok-big/testing'
import { BankFunctionsSql, BankTablesSql, PostgresBankDB, bankChannelOf } from '../src/index'
import type { PostgresBankDBOpts, PostgresListen } from '../src/index'
import { BootMillis, flakyClientOf } from './test-helpers'
import type { FlakyClient } from './test-helpers'

// == [The database]: database, bootDatabaseFirst

const made: { db?: Promise<PGlite> } = {}

/** Return this test file's PGlite with the bankDB's tables and functions created. */
export async function database(): Promise<PGlite> {
  made.db ??= (async () => {
    const db = new PGlite()
    await db.exec(BankTablesSql)
    await db.exec(BankFunctionsSql)
    // Listen on the battery user's channel at boot. PGlite queues a LISTEN behind the statements already waiting,
    // so a write made right after a watch's first LISTEN would be missed.
    await listenOn(db, bankChannelOf(TH.BW.bankScope.user_id))
    return db
  })()
  return await made.db
}

/** Boot this file's PGlite before its first test, and close it after its last. */
export function bootDatabaseFirst(): void {
  beforeAll(async () => { await database() }, BootMillis)
  afterAll(async () => {
    const db = await database()
    await db.close()
  })
}
// --

// == [BankDBs]: listen, bankDBOver, makeBankDB, emptyTables, makeTwin, failNextCall, storeOtherwise

const listenersOf = new Map<string, Set<(text: string) => void>>()

/** Start listening on `channel` the first time it is asked for, and never stop, like the README's recipe. Returns the channel's set of callbacks. */
async function listenOn(db: PGlite, channel: string): Promise<Set<(text: string) => void>> {
  const listeners = listenersOf.get(channel)
  if (listeners !== undefined) { return listeners }
  const fresh = new Set<(text: string) => void>()
  listenersOf.set(channel, fresh)
  // PGlite uses the channel identifier as written, so it must be quoted to keep its case and punctuation. A user_id never contains `"`.
  await db.listen(`"${channel}"`, (text) => { for (const onNotify of fresh) { onNotify(text) } })
  return fresh
}

export const listen: PostgresListen = async (channel, onNotify) => {
  const listeners = listenersOf.get(channel) ?? await listenOn(await database(), channel)
  listeners.add(onNotify)
  return () => listeners.delete(onNotify)
}

const clientsOf = new WeakMap<PostgresBankDB, FlakyClient>()
const optsOf = new WeakMap<PostgresBankDB, BankDBOverOpts>()

type BankDBOverOpts = Omit<PostgresBankDBOpts, 'client'>

/** Make a PostgresBankDB on this file's PGlite, with `listen` wired up. */
export async function bankDBOver(opts: BankDBOverOpts = {}): Promise<PostgresBankDB> {
  const client = flakyClientOf(await database())
  const bankDB = new PostgresBankDB({ listen, ...opts, client })
  clientsOf.set(bankDB, client)
  optsOf.set(bankDB, opts)
  return bankDB
}

/** Empty the tables and make a new bankDB. */
export async function makeBankDB(opts?: BX.AdapterBankDBOpts & { maxBoxes?: number }): Promise<PostgresBankDB> {
  await emptyTables()
  return await bankDBOver(opts)
}

export async function emptyTables(): Promise<void> {
  const db = await database()
  await db.exec('TRUNCATE safebyok_boxes, safebyok_vaults, safebyok_gates, safebyok_banks')
}

/** Make a second bankDB on the same tables with the same opts as `bankDB`, to act as another device. */
export async function makeTwin(bankDB: PostgresBankDB): Promise<PostgresBankDB> { return await bankDBOver(optsOf.get(bankDB)) }

export function failNextCall(bankDB: PostgresBankDB): void { clientsOf.get(bankDB)?.failNext() }

const BankTables = ['safebyok_banks', 'safebyok_gates', 'safebyok_vaults', 'safebyok_boxes']

/** Until the test ends, have every table store a row other than the one each write sends, as a database that alters what it stores would. */
export async function storeOtherwise(): Promise<void> {
  const db = await database()
  const triggers = BankTables.map((table) => `CREATE TRIGGER store_otherwise BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION store_otherwise();`)
  const drops = BankTables.map((table) => `DROP TRIGGER store_otherwise ON ${table};`)
  await db.exec(`
    CREATE FUNCTION store_otherwise() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      NEW.revision_tok := NEW.revision_tok || '${TH.StoredOtherwiseSuffix}';
      RETURN NEW;
    END $$;
    ${triggers.join('\n')}
  `)
  onTestFinished(async () => { await db.exec(`${drops.join('\n')} DROP FUNCTION store_otherwise();`) })
}
// --

// == [Rows]: sql, planting, recordOf, rowsOf

/** Run SQL directly against the PGlite, for the battery's row checks. */
async function sql<RowT>(text: string, params: unknown[]): Promise<RowT[]> {
  const db = await database()
  const { rows } = await db.query<RowT>(text, params)
  return rows
}

/** Run a plant's statements in one transaction, with the foreign keys unchecked: a planted row need not stand under a bank row. */
async function planting(statements: [string, unknown[]][]): Promise<void> {
  const db = await database()
  await db.transaction(async (tx) => {
    await tx.query('SET LOCAL session_replication_role = replica')
    for (const [text, params] of statements) { await tx.query(text, params) }
  })
}

/** The record a table row was stored from: each column a field, a null column left out. */
function recordOf(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, val]) => val !== null))
}

// A bank row is planted by an upsert, never a delete and an insert, so the rows under it stay.
const PlantBankSql = `
  INSERT INTO safebyok_banks
  SELECT * FROM jsonb_populate_record(NULL::safebyok_banks, $3::text::jsonb || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text))
  ON CONFLICT (user_id, banklabel)
  DO UPDATE SET (fmt, am, revision_tok, revision_seq, registered_at, written_at, bank_tok)
    = (EXCLUDED.fmt, EXCLUDED.am, EXCLUDED.revision_tok, EXCLUDED.revision_seq, EXCLUDED.registered_at, EXCLUDED.written_at, EXCLUDED.bank_tok)
`
const UnplantGateSql = 'DELETE FROM safebyok_gates WHERE (user_id, banklabel, gatelabel) = ($1, $2, $3)'
const PlantGateSql = `
  INSERT INTO safebyok_gates
  SELECT * FROM jsonb_populate_record(NULL::safebyok_gates, $4::text::jsonb || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text, 'gatelabel', $3::text))
`
const UnplantVaultSql = 'DELETE FROM safebyok_vaults WHERE (user_id, banklabel, vaultlabel) = ($1, $2, $3)'
const PlantVaultSql = `
  INSERT INTO safebyok_vaults
  SELECT * FROM jsonb_populate_record(NULL::safebyok_vaults, $4::text::jsonb || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text, 'vaultlabel', $3::text))
`
// A box row's life is part of its address. A planted row that names a life of its own is stored under that life, as a store keyed by scope alone would hold it.
const BoxRowSql = `
  jsonb_build_object('bank_tok', $4::text, 'vault_tok', $5::text) || $7::text::jsonb
  || jsonb_build_object('user_id', $1::text, 'banklabel', $2::text, 'vaultlabel', $3::text, 'boxlabel', $6::text)
`
const UnplantBoxSql = `
  DELETE FROM safebyok_boxes AS box
  USING  jsonb_populate_record(NULL::safebyok_boxes, ${BoxRowSql}) AS planted
  WHERE  (box.user_id, box.banklabel, box.vaultlabel, box.bank_tok, box.vault_tok, box.boxlabel)
       = (planted.user_id, planted.banklabel, planted.vaultlabel, planted.bank_tok, planted.vault_tok, planted.boxlabel)
`
const PlantBoxSql = `INSERT INTO safebyok_boxes SELECT * FROM jsonb_populate_record(NULL::safebyok_boxes, ${BoxRowSql})`

/** The tables' rows, past the adapter: plant one, or read what is stored, with SQL of its own.
 * A planted row's address is the scope's, whatever the row names, except a box row's life, and a field with no column is dropped.
 * The tables refuse a row that is no object, one missing a field every row has, and a number field that is no integer.
 */
export function rowsOf(): TH.BankDBRowCheats {
  return {
    plantBankRow: async ({ user_id, banklabel }: BankScope, row: unknown) => {
      await planting([[PlantBankSql, [user_id, banklabel, JSON.stringify(row)]]])
    },
    plantGateRow: async ({ user_id, banklabel, gatelabel }: BankScope & { gatelabel: string }, row: unknown) => {
      const address = [user_id, banklabel, gatelabel]
      await planting([[UnplantGateSql, address], [PlantGateSql, [...address, JSON.stringify(row)]]])
    },
    plantVaultRow: async ({ user_id, banklabel, vaultlabel }: VaultScope, row: unknown) => {
      const address = [user_id, banklabel, vaultlabel]
      await planting([[UnplantVaultSql, address], [PlantVaultSql, [...address, JSON.stringify(row)]]])
    },
    plantBoxRow: async ({ user_id, banklabel, vaultlabel, boxlabel }: Boxscope, bank_tok: string, vault_tok: string, row: unknown) => {
      const params = [user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel, JSON.stringify(row)]
      await planting([[UnplantBoxSql, params], [PlantBoxSql, params]])
    },
    bankRowOf: async ({ user_id, banklabel }: BankScope) => {
      const [found] = await sql<{ row: Record<string, unknown> }>(
        'SELECT to_jsonb(stored) AS row FROM safebyok_banks AS stored WHERE (user_id, banklabel) = ($1, $2)', [user_id, banklabel],
      )
      return (found === undefined) ? null : recordOf(found.row)
    },
    gateRowOf: async ({ user_id, banklabel, gatelabel }: BankScope & { gatelabel: string }) => {
      const [found] = await sql<{ row: Record<string, unknown> }>(
        'SELECT to_jsonb(stored) AS row FROM safebyok_gates AS stored WHERE (user_id, banklabel, gatelabel) = ($1, $2, $3)', [user_id, banklabel, gatelabel],
      )
      return (found === undefined) ? null : recordOf(found.row)
    },
    vaultRowOf: async ({ user_id, banklabel, vaultlabel }: VaultScope) => {
      const [found] = await sql<{ row: Record<string, unknown> }>(
        'SELECT to_jsonb(stored) AS row FROM safebyok_vaults AS stored WHERE (user_id, banklabel, vaultlabel) = ($1, $2, $3)', [user_id, banklabel, vaultlabel],
      )
      return (found === undefined) ? null : recordOf(found.row)
    },
    boxRowsOf: async ({ user_id, banklabel, vaultlabel }: VaultScope, bank_tok: string, vault_tok: string) => {
      const found = await sql<{ boxlabel: string, row: Record<string, unknown> }>(
        'SELECT boxlabel, to_jsonb(stored) AS row FROM safebyok_boxes AS stored WHERE (user_id, banklabel, vaultlabel, bank_tok, vault_tok) = ($1, $2, $3, $4, $5)',
        [user_id, banklabel, vaultlabel, bank_tok, vault_tok],
      )
      return new Map(found.map(({ boxlabel, row }) => [boxlabel, recordOf(row)]))
    },
  }
}
// --
