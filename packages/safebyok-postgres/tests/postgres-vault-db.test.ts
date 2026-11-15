/** PostgresVaultDB on PGlite: the battery every vaultDB runs, plus what only Postgres can show. */

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ThingScope, lifeseqOf, modelkindOf } from 'safebyok/storage'
import * as VT from 'safebyok/testing'
import { PostgresVaultDB, thingsChannelOf } from '../src/postgres-vault-db'
import type { PostgresListen } from '../src/postgres-bank-db'
import { VaultFunctionsSql } from '../src/vault-functions'
import { VaultTablesSql } from '../src/vault-tables'
import * as TH from './test-helpers'

// PGlite is one connection, so no two statements here ever run at once: the battery cannot race two births, or two
// writes of one row, and the WHERE clauses that settle such a race are proved only for one writer at a time.

// == [The database]: database, listen, vaultDBOver, makeVaultDB, rowsOf

const ThingTables = { bank: 'safebyok_bank_things', gate: 'safebyok_gate_things', box: 'safebyok_box_things' } as const

const made: { db?: Promise<PGlite> } = {}
const onNotifies = new Set<(text: string) => void>()

/** This file's PGlite, with the vaultDB's tables and functions created, listening on the battery user's channel. */
async function database(): Promise<PGlite> {
  made.db ??= (async () => {
    const db = new PGlite()
    await db.exec(VaultTablesSql)
    await db.exec(VaultFunctionsSql)
    // PGlite queues a LISTEN behind the statements already waiting, so it listens once, at boot, before any write.
    // It uses the channel identifier as written, so it is quoted.
    await db.listen(`"${thingsChannelOf(VT.ThingBank.userid)}"`, (text) => { for (const onNotify of onNotifies) { onNotify(text) } })
    return db
  })()
  return await made.db
}

/** Listen on the battery user's channel, already listened to at boot. */
const listen: PostgresListen = (channel, onNotify) => {
  expect(channel).to.eq(thingsChannelOf(VT.ThingBank.userid))
  onNotifies.add(onNotify)
  return () => onNotifies.delete(onNotify)
}

/** A PostgresVaultDB on this file's PGlite, listening, with `opts` laid over it. */
async function vaultDBOver(opts: { doNotifyTracked?: boolean } = {}): Promise<PostgresVaultDB> {
  return new PostgresVaultDB({ client: await database(), listen, ...opts })
}

/** A PostgresVaultDB over empty tables. */
async function makeVaultDB(): Promise<PostgresVaultDB> {
  const db = await database()
  await db.exec(`TRUNCATE ${Object.values(ThingTables).join(', ')}`)
  return await vaultDBOver()
}

/** The table that keeps the Thing at `labelpath`. */
function tableOf(labelpath: string): string { return ThingTables[modelkindOf(labelpath)] }

/** Take away the Thing at a scope. */
async function remove({ userid, banklabel, labelpath }: ThingScope): Promise<void> {
  const db = await database()
  await db.query(`DELETE FROM ${tableOf(labelpath)} WHERE (userid, banklabel, labelpath) = ($1, $2, $3)`, [userid, banklabel, labelpath])
}

/** Plant `raw` as the Thing at `scope`, in place of any stored. */
async function plant(scope: ThingScope, raw: unknown): Promise<void> {
  await remove(scope)
  const db = await database()
  const table = tableOf(scope.labelpath)
  await db.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table}, $1::text::jsonb)`, [JSON.stringify(raw)])
}

/** The backdoor to the stored rows. */
function rowsOf(): VT.VaultDBRowCheats { return { plant, remove } }
// --

beforeAll(async () => { await database() }, TH.BootMillis)
afterAll(async () => {
  const db = await database()
  await db.close()
})

VT.describeVaultDBBattery('PostgresVaultDB', { makeVaultDB, _cheat_rowsOf: rowsOf })

describe("PostgresVaultDB, what only Postgres can show", () => {
  it("answers tracked but tells its watches nothing of it, made with doNotifyTracked: false", async () => {
    await makeVaultDB()
    const vaultDB = await vaultDBOver({ doNotifyTracked: false })
    await VT.expectGood(vaultDB.tryBirthBank(VT.birthBankAskOf()))
    await VT.aWhile()
    const notices: unknown[] = []
    vaultDB.watch(VT.ThingBank, (notice) => { notices.push(notice) }, () => undefined)
    const answer = await vaultDB.tryGetThing({ ...VT.getAskAt('box'), track: VT.BankStaleTrack })
    expect(answer).to.deep.include({ tracked: { bank: VT.bankThingOf(), gate: 'same' } })
    await VT.aWhile()
    expect(notices).to.deep.equal([])
  })

  it("writes over a damaged box the write cites exactly: it compares revisions in the write, not shapes", async () => {
    const vaultDB = await makeVaultDB()
    const box = VT.boxThingOf()
    await rowsOf().plant({ ...VT.ThingBank, labelpath: box.labelpath }, { ...box, whisper_sealed: {} })
    const next = VT.nextOf(box)
    expect(await vaultDB.tryWriteThing(VT.replaceAskOf(box, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
  })

  it("refuses in its write function, called past the adapter, a write citing a revision not stored, and one that skips a life", async () => {
    await makeVaultDB()
    const db = await database()
    const box = VT.boxThingOf()
    await plant({ ...VT.ThingBank, labelpath: box.labelpath }, box)
    const write = 'SELECT ok, thing FROM safebyok_write_box($1::text::jsonb, $2::text::jsonb)'
    const stale = { ...box, revtok: 'rev-other' }
    const skips = VT.nextOf(box, { lifeseq: lifeseqOf(2), lifepath: lifeseqOf(2) })
    for (const [record, cited] of [[VT.nextOf(box), stale], [skips, box]]) {
      const { rows } = await db.query(write, [JSON.stringify(record), JSON.stringify(cited)])
      expect(rows).to.deep.equal([{ ok: false, thing: box }])
    }
  })

  it("refuses a client, listen or opt it cannot use", async () => {
    const client = await database()
    const unusable = [{}, { client: {} }, { client, listen: 'yes' }, { client, doNotifyTracked: 'no' }, { client, pushWorld: true }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new PostgresVaultDB(opts as never), 'bad_option') }
  })
})
