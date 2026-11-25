/** PostgresVaultDB on PGlite: the battery every vaultDB runs, plus what only Postgres can show. */

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type ThingScope, type Thingkind, type VaultError, Labelpath, Lifeseq, ThingFormat, VoidLifeTok, VoidTrack, readAtOf } from 'safebyok/storage'
import * as VT from 'safebyok/testing'
import * as Phrases from '../src/phrases'
import { PostgresVaultDB, thingsChannelOf } from '../src/postgres-vault-db'
import type { PostgresListen } from '../src/postgres-bank-db'
import { TableVersion, VaultFunctionNames, VaultFunctionsSql } from '../src/vault-functions'
import { GetThingSql } from '../src/vault-queries'
import { VaultTablesSql } from '../src/vault-tables'
import * as TH from './test-helpers'

// PGlite is one connection, so no two statements here ever run at once: the battery cannot race two births, or two
// writes of one row, and the WHERE clauses that settle such a race are proved only for one writer at a time.

// == [The database]: database, listen, vaultDBOver, makeVaultDB, rowsOf

const ThingTables = { bank: 'safebyok_bank_things', gate: 'safebyok_gate_things', box: 'safebyok_box_things' } as const satisfies Record<Thingkind, string>

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

/** A PostgresVaultDB on this file's PGlite, listening. */
async function vaultDBOver(): Promise<PostgresVaultDB> {
  return new PostgresVaultDB({ client: await database(), listen })
}

/** A PostgresVaultDB over empty tables. */
async function makeVaultDB(): Promise<PostgresVaultDB> {
  const db = await database()
  await db.exec(`TRUNCATE ${Object.values(ThingTables).join(', ')}`)
  return await vaultDBOver()
}

/** The table that keeps the Thing at `labelpath`. */
function tableOf(labelpath: string): string { return ThingTables[Labelpath.modelkindOf(labelpath)] }

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

// == [Fakes]: coded, throwingClient, answeringClient, capturingListen, tellingListen, BareNotice

/** An Error with a driver's `code`. */
function coded(message: string, code: string): Error { return Object.assign(new Error(message), { code }) }

/** A client whose every statement fails with `err`. */
function throwingClient(err: Error) { return { query: () => Promise.reject(err) } }

/** A client whose every statement answers the one row `row`. */
function answeringClient(row: object) { return { query: () => Promise.resolve({ rows: [row] }) } }

/** A listen that hands each watch's notify handler to `onNotifies`, and counts its unlistens in `stopped`. */
function capturingListen() {
  const onNotifies: ((text: string) => void)[] = []
  const stopped: string[] = []
  const listen: PostgresListen = (channel, onNotify) => {
    onNotifies.push(onNotify)
    return () => { stopped.push(channel) }
  }
  return { listen, onNotifies, stopped }
}

/** A listen that tells each watch `text` before it has started listening, and counts its unlistens in `stopped`. */
function tellingListen(text: string) {
  const stopped: string[] = []
  const listen: PostgresListen = (channel, onNotify) => {
    onNotify(text)
    return () => { stopped.push(channel) }
  }
  return { listen, stopped }
}

/** A notice of the root box in the battery's bank that carries neither the Thing nor its bank row. */
const BareNotice = JSON.stringify({ at: { userid: VT.ThingBank.userid, banklabel: VT.ThingBank.banklabel, labelpath: VT.getAskAt('box').labelpath } })
// --

beforeAll(async () => { await database() }, TH.BootMillis)
afterAll(async () => {
  const db = await database()
  await db.close()
})

VT.describeVaultDBBattery('PostgresVaultDB', { makeVaultDB, _cheat_rowsOf: rowsOf })

describe("PostgresVaultDB, what only Postgres can show", () => {
  it("reports, called past the adapter, the verdict of each check of the gate stored that refused its write", async () => {
    await makeVaultDB()
    const db = await database()
    const gate = VT.gateThingOf()
    await plant(VT.GateScope, gate)
    const write = `SELECT ok, born_at_ok, policies_ok FROM ${VaultFunctionNames.write_gate}($1::text::jsonb, $2::text::jsonb, $3::text[])`
    const moved = VT.nextGateOf(gate, { born_at: gate.born_at + 1 })
    const added = VT.nextGateOf(gate)
    const cases = [[moved, [], { ok: false, born_at_ok: false, policies_ok: true }], [added, ['add_passkey'], { ok: false, born_at_ok: true, policies_ok: false }]] as const
    for (const [record, policies, verdicts] of cases) {
      const { rows } = await db.query(write, [JSON.stringify(record), JSON.stringify(gate), policies])
      expect(rows).to.deep.equal([verdicts])
    }
  })

  it("reports, called past the adapter, the verdict of the bank's lifetok check that refused its write", async () => {
    await makeVaultDB()
    const db = await database()
    const bank = VT.bankThingOf()
    await plant(VT.BankScope, bank)
    const write = `SELECT ok, born_at_ok, lifetok_ok FROM ${VaultFunctionNames.write_bank}($1::text::jsonb, $2::text::jsonb)`
    const { rows } = await db.query(write, [JSON.stringify(VT.nextOf(bank, { lifetok: VT.OtherLifetok })), JSON.stringify(bank)])
    expect(rows).to.deep.equal([{ ok: false, born_at_ok: true, lifetok_ok: false }])
  })

  it("refuses in its write function, called past the adapter, a write citing a revision not stored, and one that skips a life", async () => {
    await makeVaultDB()
    const db = await database()
    const box = VT.boxThingOf()
    await plant({ ...VT.ThingBank, labelpath: box.labelpath }, box)
    const write = `SELECT ok, thing FROM ${VaultFunctionNames.write_box}($1::text::jsonb, $2::text::jsonb)`
    const stale = { ...box, revtok: VT.OtherRevtok }
    const skips = VT.nextOf(box, { lifeseq: Lifeseq.ofLifenum(2), lifepath: Lifeseq.ofLifenum(2) })
    for (const [record, cited] of [[VT.nextOf(box), stale], [skips, box]]) {
      const { rows } = await db.query(write, [JSON.stringify(record), JSON.stringify(cited)])
      expect(rows).to.deep.equal([{ ok: false, thing: box }])
    }
  })

  // A labelpath is at most two deep, so only a root is ever above a scope the adapter asks for: these call the statement past it.
  it("reports, called past the adapter, the Thing stored above a scope with the longest labelpath that, with a '/', begins the scope's", async () => {
    await makeVaultDB()
    const db = await database()
    await plant(VT.RootScope, VT.rootBoxOf())
    await plant({ ...VT.ThingBank, labelpath: 'box/aa' }, VT.boxThingOf('aa'))
    const ancestorAt = async (labelpath: string) => {
      const { rows } = await db.query<{ ancestor: { labelpath: string } | null }>(GetThingSql.box, [VT.ThingBank.userid, VT.ThingBank.banklabel, labelpath, null])
      return rows[0]?.ancestor?.labelpath ?? null
    }
    expect(await ancestorAt('box/aa/bb')).to.eq('box/aa')
    expect(await ancestorAt('box/aab/cc')).to.eq('box')
    expect(await ancestorAt('box/aa')).to.eq('box')
    expect(await ancestorAt('box')).to.eq(null)
  })

  it("reads a '%' or '_' in a labelpath above a scope as itself, never as a wildcard", async () => {
    await makeVaultDB()
    const db = await database()
    await plant(VT.RootScope, VT.rootBoxOf())
    for (const label of ['a_', 'a%']) { await plant({ ...VT.ThingBank, labelpath: `box/${label}` }, VT.boxThingOf(label)) }
    const { rows } = await db.query<{ ancestor: { labelpath: string } }>(GetThingSql.box, [VT.ThingBank.userid, VT.ThingBank.banklabel, 'box/ab/cc', null])
    expect(rows[0]?.ancestor.labelpath).to.eq('box')
  })

  it("keeps no box tombstone whose sidecar is not {}", async () => {
    await makeVaultDB()
    const tomb = VT.boxTombOf(VT.boxThingOf())
    const scope = { ...VT.ThingBank, labelpath: tomb.labelpath }
    await plant(scope, tomb)
    await expect(plant(scope, { ...tomb, sidecar: { account: 'home' } })).rejects.toThrow('check constraint')
  })

  it("names each function it creates for the version of its tables and its revision", async () => {
    const db = await database()
    const { rows } = await db.query<{ proname: string }>("SELECT DISTINCT proname FROM pg_proc WHERE proname LIKE 'safebyok\\_%'")
    expect(new Set(rows.map((row) => row.proname))).to.deep.equal(new Set(Object.values(VaultFunctionNames)))
    expect(TableVersion).to.equal(ThingFormat)
    expect(VaultFunctionNames.write_box).to.equal('safebyok_a010501_r000_write_box')
  })

  it("keeps its tables and writing functions from every role but their owner", async () => {
    const db = await database()
    const { rows: tables } = await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'safebyok\\_%' AND relkind = 'r' ORDER BY relname")
    expect(tables).to.deep.equal(['safebyok_bank_things', 'safebyok_box_things', 'safebyok_gate_things'].map((relname) => ({ relname, relrowsecurity: true })))
    const { write_bank, write_gate, write_box, birth_roots, tell_thing } = VaultFunctionNames
    const writers = [`${write_bank}(jsonb, jsonb)`, `${write_gate}(jsonb, jsonb, text[])`, `${write_box}(jsonb, jsonb)`, `${birth_roots}(jsonb, jsonb, jsonb)`, `${tell_thing}(jsonb, jsonb)`]
    const { rows: grants } = await db.query("SELECT bool_or(has_function_privilege('public', writer, 'EXECUTE')) AS any FROM unnest($1::text[]) AS writer", [writers])
    expect(grants).to.deep.equal([{ any: false }])
  })

  it("reports a birth whose function stored nothing, though the classifier finds a write, as an unexpected error", async () => {
    const vaultDB = new PostgresVaultDB({ client: answeringClient({ ok: false, bank: null, gate: null, root: null, tracked: null }) })
    const answer  = await vaultDB.tryBirthBank(VT.birthBankAskOf())
    expect(answer).to.have.nested.property('err.refusalkind', 'unexpected_error')
    expect(answer).to.have.nested.property('err.cause.message', Phrases.StoredNothing)
  })

  it("ends a watch, telling its onBadNews, where a notice's fetch fails in a way a retry would not mend", async () => {
    const { listen, onNotifies, stopped } = capturingListen()
    const vaultDB = new PostgresVaultDB({ client: throwingClient(coded('relation "safebyok_box_things" does not exist', '42P01')), listen })
    const badnews: VaultError[] = []
    vaultDB.watch(VT.ThingBank, () => undefined, (news) => { badnews.push(news) })
    await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
    onNotifies[0]?.(BareNotice)
    onNotifies[0]?.(BareNotice)
    await vi.waitFor(() => { expect(stopped).to.have.lengthOf(1) })
    await VT.aWhile()
    expect(badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
  })

  it("hears a notice told while its listen is still starting", async () => {
    const { listen, stopped } = tellingListen(BareNotice)
    const vaultDB = new PostgresVaultDB({ client: throwingClient(coded('relation "safebyok_box_things" does not exist', '42P01')), listen })
    const badnews: VaultError[] = []
    vaultDB.watch(VT.ThingBank, () => undefined, (news) => { badnews.push(news) })
    await vi.waitFor(() => { expect(stopped).to.have.lengthOf(1) })
    expect(badnews).to.have.lengthOf(1)
    expect(badnews[0]?.cause).to.deep.include({ code: '42P01' })
  })

  it("drops a notice whose fetch fails in a way a retry may mend, and keeps watching", async () => {
    const { listen, onNotifies, stopped } = capturingListen()
    const vaultDB = new PostgresVaultDB({ client: throwingClient(coded('terminating connection due to administrator command', '57P01')), listen })
    const badnews: VaultError[] = []
    const unwatch = vaultDB.watch(VT.ThingBank, () => undefined, (news) => { badnews.push(news) })
    await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
    onNotifies[0]?.(BareNotice)
    await VT.aWhile()
    expect(badnews).to.deep.equal([])
    expect(stopped).to.deep.equal([])
    unwatch()
  })

  it("dates each read by the database's clock, each later read in a session later than the one before", async () => {
    const vaultDB = await makeVaultDB()
    const db      = await database()
    const { rows } = await db.query<{ millis: number }>('SELECT (extract(epoch FROM clock_timestamp()) * 1000)::float8 AS millis')
    const first   = await vaultDB.tryGetThing(VT.getAskAt('box'))
    const second  = await vaultDB.tryGetThing(VT.getAskAt('box'))
    // A read_tc compares as text in the order it was made.
    const isLater = second.read_tc > first.read_tc
    expect(isLater).to.be.true
    expect(readAtOf(first.read_tc)).to.be.closeTo(rows[0]!.millis, 1000)
  })

  it("answers with the read_tc of the row Postgres returns", async () => {
    const read_tc = '01a211fc-16bf-7000-83c6-d6e7d25156a2'
    const vaultDB = new PostgresVaultDB({ client: answeringClient({ bank: null, gate: null, root: null, tracked: { bank: null, gate: null, box: null }, read_tc }) })
    const answer  = await vaultDB.tryGetWorld({ ...VT.ThingBank, op: 'getworld', track: VoidTrack, banktok: VoidLifeTok })
    expect(answer.read_tc).to.eq(read_tc)
  })

  it("refuses a client, listen or opt it cannot use", async () => {
    const client = await database()
    const unusable = [{}, { client: {} }, { client, listen: 'yes' }, { client, pushWorld: true }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new PostgresVaultDB(opts as never), 'bad_record') }
  })
})
