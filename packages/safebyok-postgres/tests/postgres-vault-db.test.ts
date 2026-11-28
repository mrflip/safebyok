/** PostgresVaultDB on PGlite: the battery every vaultDB runs, plus what only Postgres can show. */

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  type BirthBankAsk, type GateRecord, type ThingScope, type ThingRecord, type Thingkind, type VaultError, type WriteAsk, Lifeseq, ManifestTags, ThingFormat, VoidBanktok, VoidTrack, birthPutsOf, putAskOf, readAtOf,
} from 'safebyok/storage'
import * as VT from 'safebyok/testing'
import { thingsChannelOf } from '../src/notifications'
import { type PostgresListen, PostgresVaultDB, writeParamsOf } from '../src/postgres-vault-db'
import { TableVersion, VaultFunctionNames, VaultFunctionsSql } from '../src/vault-functions'
import { BirthRootsSql, GetThingSql, WriteThingSql } from '../src/vault-queries'
import { VaultTablesSql } from '../src/vault-tables'
import * as TH from './test-helpers'

// PGlite is one connection, so no two statements here ever run at once: the battery cannot race two births, or two
// writes of one row, and the WHERE clauses that settle such a race are proved only for one writer at a time.

// == [The database]: database, listen, vaultDBOver, makeVaultDB, rowsOf

const ThingTables = { gate: 'safebyok_gate_things', box: 'safebyok_box_things' } as const satisfies Record<Thingkind, string>

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

/** Take away the Thing at `scope`. */
async function remove({ userid, banklabel, modelkind, labelpath }: ThingScope): Promise<void> {
  const db = await database()
  await db.query(`DELETE FROM ${ThingTables[modelkind]} WHERE (userid, banklabel, labelpath) = ($1, $2, $3)`, [userid, banklabel, labelpath])
}

/** Plant `raw` as the Thing at `scope`, in place of any stored. */
async function plant(scope: ThingScope, raw: unknown): Promise<void> {
  await remove(scope)
  const db = await database()
  const table = ThingTables[scope.modelkind]
  await db.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table}, $1::text::jsonb)`, [JSON.stringify(raw)])
}

/** The backdoor to the stored rows. */
function rowsOf(): VT.VaultDBRowCheats { return { plant, remove } }
// --

// == [Fakes]: coded, throwingClient, answeringClient, capturingListen, tellingListen, unconnectedListen, watchCalls, MissingTable, BareNotification

/** An Error with a driver's `code`. */
function coded(message: string, code: string): Error { return Object.assign(new Error(message), { code }) }

/** A client whose every statement fails with `err`. */
function throwingClient(err: Error) { return { query: () => Promise.reject(err) } }

/** A client whose every statement answers the one row `row`. */
function answeringClient(row: object) { return { query: () => Promise.resolve({ rows: [row] }) } }

/** A listen that hands each watch's notify handler to `onNotifies`, and counts its unlistens in `stopped`. Its unlisten does `onUnlisten`. */
function capturingListen(onUnlisten: () => unknown = () => undefined) {
  const onNotifies: ((text: string) => void)[] = []
  const stopped: string[] = []
  const listen: PostgresListen = (channel, onNotify) => {
    onNotifies.push(onNotify)
    return () => {
      stopped.push(channel)
      return onUnlisten()
    }
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

/** A listen that cannot connect to the server. */
const unconnectedListen: PostgresListen = () => { throw coded('could not connect to server', '08001') }

/** A watch's calls of its onEnded and onBadNews, in order: `'ended'`, or the bad news's refusalkind. */
function watchCalls() {
  const calls: string[] = []
  const badnews: VaultError[] = []
  const onBadNews = (news: VaultError) => {
    calls.push(news.refusalkind)
    badnews.push(news)
  }
  const onEnded = () => { calls.push('ended') }
  return { calls, badnews, onBadNews, onEnded }
}

/** The failure of a missing table, which a retry would not mend. */
const MissingTable = coded('relation "safebyok_box_things" does not exist', '42P01')

/** A notification of the root box in the battery's bank that carries neither the Thing nor its banktok. */
const BareNotification = JSON.stringify({ at: { userid: VT.ThingBank.userid, banklabel: VT.ThingBank.banklabel, modelkind: 'box', labelpath: VT.RootScope.labelpath } })
// --

beforeAll(async () => { await database() }, TH.BootMillis)
afterAll(async () => {
  const db = await database()
  await db.close()
})

VT.describeVaultDBBattery('PostgresVaultDB', { makeVaultDB, _cheat_rowsOf: rowsOf })

describe("PostgresVaultDB, what only Postgres can show", () => {
  // AdapterVaultDB makes an unwritten write's tags again of its actual row, so the battery proves those; a written write's
  // are made in SQL alone, of the ante row its WHERE pinned, and only this compares them with ManifestTags'.
  it("makes, called past the adapter, the tags ManifestTags makes of the ante row, whether it writes or not", async () => {
    const db   = await database()
    const box  = VT.boxThingOf()
    const tomb = VT.boxTombOf(box)
    const gate = VT.gateThingOf()
    const passkeyGate = VT.gateThingOf({ wayins: VT.WithPasskey })
    const gateTomb = VT.gateTombOf(gate)
    const otherMain = { ...VT.MainOnly, main: VT.OtherMainWayin }
    const cases: [ante: ThingRecord | null, ask: WriteAsk, written: boolean][] = [
      [null, VT.birthAskOf(), true],
      [box,  VT.replaceAskOf(box, VT.nextOf(box)), true],
      [box,  VT.delAskFor(box, tomb), true],
      [tomb, putAskOf({ cited: tomb, record: VT.boxRebornOf(tomb), ...VT.SenderKnows }), true],
      [gate, VT.replaceAskOf(gate, VT.nextGateOf(gate)), true],
      [gate, VT.delAskFor(gate, gateTomb), true],
      [gateTomb, putAskOf<GateRecord>({ cited: gateTomb, record: VT.gateRebornOf(gateTomb, { banktok: VT.OtherBanktok }), ...VT.SenderKnows }), true],
      [gate, VT.replaceAskOf(gate, VT.nextGateOf(gate, { wayins: VT.WithPasskey }), { policies: ['add_passkey'] }), true],
      [passkeyGate, VT.replaceAskOf(passkeyGate, VT.nextGateOf(passkeyGate, { wayins: VT.MainOnly }), { policies: ['revoke_passkey'] }), true],
      [gate, VT.replaceAskOf(gate, VT.nextGateOf(gate, { wayins: otherMain }), { policies: ['replace_passphrase'] }), true],
      [null, VT.replaceAskOf(box, VT.nextOf(box)), false],
      [box,  VT.birthAskOf(box), false],
      [box,  VT.replaceAskOf({ ...box, revtok: VT.OtherRevtok }, VT.nextOf(box)), false],
      [box,  VT.replaceAskOf({ ...box, revseq: box.revseq + 1 }, VT.nextOf(box, { revseq: box.revseq + 2 })), false],
      [box,  putAskOf({ cited: box, record: VT.nextOf(box), ifPresent: 'fail', ...VT.SenderKnows }), false],
      [tomb, VT.delAskFor(tomb, VT.boxTombOf(tomb)), false],
      [gate, VT.replaceAskOf(gate, VT.nextGateOf(gate, { banktok: VT.OtherBanktok })), false],
      [gate, VT.delAskFor(gate, VT.gateTombOf(gate, { banktok: VT.OtherBanktok })), false],
      [gate, VT.replaceAskOf(gate, VT.nextGateOf(gate, { born_at: gate.born_at + 1 })), false],
      [passkeyGate, VT.replaceAskOf(passkeyGate, VT.nextGateOf(passkeyGate), { policies: ['add_passkey'] }), false],
      [gate, VT.replaceAskOf(gate, VT.nextGateOf(gate), { policies: ['add_passkey', 'revoke_passkey'] }), false],
      [gate, VT.replaceAskOf(gate, VT.nextGateOf(gate, { wayins: VT.WithPasskey }), { policies: ['revoke_passkey', 'replace_passphrase'] }), false],
      [gate, VT.replaceAskOf({ ...gate, wayins: otherMain }, VT.nextGateOf(gate, { wayins: otherMain }), { policies: ['replace_passphrase'] }), false],
    ]
    for (const [ante, ask, written] of cases) {
      await makeVaultDB()
      if (ante !== null) { await plant(ask, ante) }
      const { rows } = await db.query<{ tags: unknown }>(WriteThingSql[ask.modelkind], writeParamsOf(ask))
      expect(rows[0]?.tags, `${ask.labelpath} citing ${ask.cited.revtok}`).to.deep.equal(ManifestTags.writeTagsOf(ask, ante, written))
    }
  })

  // A written birth's tags, like a written write's, are made in SQL alone, of the ante roots its puts cite.
  it("makes, called past the adapter, the birth's tags ManifestTags makes of the ante roots, whether it writes or not", async () => {
    const db       = await database()
    const gateTomb = VT.gateTombOf(VT.gateThingOf())
    const rootTomb = VT.boxTombOf(VT.rootBoxOf())
    const cases: [gate: GateRecord | null, root: ThingRecord | null, ask: BirthBankAsk, written: boolean][] = [
      [null,               null,           VT.birthBankAskOf(),                        true],
      [gateTomb,           null,           VT.rebirthBankAskOf(gateTomb, null),        true],
      [gateTomb,           rootTomb,       VT.rebirthBankAskOf(gateTomb, rootTomb),    true],
      [null,               rootTomb,       VT.rebirthBankAskOf(null, rootTomb),        true],
      [gateTomb,           null,           VT.birthBankAskOf(),                        false],
      [gateTomb,           rootTomb,       VT.rebirthBankAskOf(gateTomb, null),        false],
      [VT.gateThingOf(),   VT.rootBoxOf(), VT.birthBankAskOf({ gate: VT.gateThingOf({ revtok: VT.OtherRevtok }) }), false],
    ]
    for (const [gate, root, ask, written] of cases) {
      await makeVaultDB()
      if (gate !== null) { await plant(VT.GateScope, gate) }
      if (root !== null) { await plant(VT.RootScope, root) }
      const puts = birthPutsOf(ask)
      const { rows } = await db.query<{ tags: unknown }>(BirthRootsSql, [...puts.flatMap(({ record, cited }) => [JSON.stringify(record), JSON.stringify(cited)]), JSON.stringify(ask.track)])
      expect(rows[0]?.tags, `over ${gate?.am ?? 'none'} and ${root?.am ?? 'none'}`).to.deep.equal(ManifestTags.birthTagsOf(puts, { gate, root }, written))
    }
  })

  it("refuses in its write function, called past the adapter, a write citing a revision not stored, and one that skips a life", async () => {
    await makeVaultDB()
    const db = await database()
    const box = VT.boxThingOf()
    await plant({ ...VT.ThingBank, modelkind: 'box', labelpath: box.labelpath }, box)
    const write = `SELECT tags->'written' AS written, actual FROM ${VaultFunctionNames.write_box}($1::text::jsonb, $2::text::jsonb, 'add', 'repl')`
    const stale = { ...box, revtok: VT.OtherRevtok }
    const skips = VT.nextOf(box, { lifeseq: Lifeseq.ofLifenum(2), lifepath: Lifeseq.ofLifenum(2) })
    for (const [record, cited] of [[VT.nextOf(box), stale], [skips, box]]) {
      const { rows } = await db.query(write, [JSON.stringify(record), JSON.stringify(cited)])
      expect(rows).to.deep.equal([{ written: false, actual: box }])
    }
  })

  // A labelpath is at most two deep, so only a root is ever above a scope the adapter asks for: these call the statement past it.
  it("reports, called past the adapter, where none is stored at a scope, the Thing stored above it with the longest labelpath that, with a '/', begins the scope's", async () => {
    await makeVaultDB()
    const db = await database()
    await plant(VT.RootScope, VT.rootBoxOf())
    await plant({ ...VT.ThingBank, modelkind: 'box', labelpath: 'box/aa' }, VT.boxThingOf('aa'))
    const ancestorAt = async (labelpath: string) => {
      const { rows } = await db.query<{ ancestor: { labelpath: string } | null }>(GetThingSql.box, [VT.ThingBank.userid, VT.ThingBank.banklabel, labelpath, null])
      return rows[0]?.ancestor?.labelpath ?? null
    }
    expect(await ancestorAt('box/aa/bb')).to.eq('box/aa')
    expect(await ancestorAt('box/aab/cc')).to.eq('box')
    expect(await ancestorAt('box/aa'), 'none where a Thing is stored at the scope').to.be.null
    expect(await ancestorAt('box/ab')).to.eq('box')
    expect(await ancestorAt('box')).to.eq(null)
  })

  it("reads a '%' or '_' in a labelpath above a scope as itself, never as a wildcard", async () => {
    await makeVaultDB()
    const db = await database()
    await plant(VT.RootScope, VT.rootBoxOf())
    for (const label of ['a_', 'a%']) { await plant({ ...VT.ThingBank, modelkind: 'box', labelpath: `box/${label}` }, VT.boxThingOf(label)) }
    const { rows } = await db.query<{ ancestor: { labelpath: string } }>(GetThingSql.box, [VT.ThingBank.userid, VT.ThingBank.banklabel, 'box/ab/cc', null])
    expect(rows[0]?.ancestor.labelpath).to.eq('box')
  })

  it("keeps no box tombstone whose sidecar is not {}", async () => {
    await makeVaultDB()
    const tomb = VT.boxTombOf(VT.boxThingOf())
    const scope = { ...VT.ThingBank, modelkind: 'box', labelpath: tomb.labelpath } as const
    await plant(scope, tomb)
    await expect(plant(scope, { ...tomb, sidecar: { account: 'home' } })).rejects.toThrow('check constraint')
  })

  it("keeps no gate tombstone that keeps a wayin, in either place", async () => {
    await makeVaultDB()
    const gate  = VT.gateThingOf()
    const tomb  = VT.gateTombOf(gate)
    const wayin = gate.wayins.main
    await plant(VT.GateScope, tomb)
    for (const wayins of [{ main: wayin, passkey0: null }, { main: null, passkey0: wayin }]) {
      await expect(plant(VT.GateScope, { ...tomb, wayins })).rejects.toMatchObject({ code: '23514' })
    }
  })

  it("names each function it creates for the version of its tables and its revision", async () => {
    const db = await database()
    const { rows } = await db.query<{ proname: string }>("SELECT DISTINCT proname FROM pg_proc WHERE proname LIKE 'safebyok\\_%'")
    expect(new Set(rows.map((row) => row.proname))).to.deep.equal(new Set(Object.values(VaultFunctionNames)))
    expect(TableVersion).to.equal(ThingFormat)
    expect(VaultFunctionNames.write_box).to.equal('safebyok_a010502_r000_write_box')
  })

  it("keeps its tables and writing functions from every role but their owner", async () => {
    const db = await database()
    const { rows: tables } = await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'safebyok\\_%' AND relkind = 'r' ORDER BY relname")
    expect(tables).to.deep.equal(['safebyok_box_things', 'safebyok_gate_things'].map((relname) => ({ relname, relrowsecurity: true })))
    const { write_gate, write_box, birth_roots, tell_thing } = VaultFunctionNames
    const writers = [`${write_gate}(jsonb, jsonb, text, text, text[])`, `${write_box}(jsonb, jsonb, text, text)`, `${birth_roots}(jsonb, jsonb, jsonb, jsonb)`, `${tell_thing}(jsonb, jsonb)`]
    const { rows: grants } = await db.query("SELECT bool_or(has_function_privilege('public', writer, 'EXECUTE')) AS any FROM unnest($1::text[]) AS writer", [writers])
    expect(grants).to.deep.equal([{ any: false }])
  })

  it("refuses with storage_issue a birth whose statement wrote nothing where its tags find a birth", async () => {
    const unborn  = { presence: 'void', revtok_cmp: 'birth' }
    const vaultDB = new PostgresVaultDB({ client: answeringClient({
      tags: { gate: unborn, root: unborn, written: false }, actual: { gate: null, root: null },
      banktok: VoidBanktok, tracked: { gate: null, root: null }, read_tc: '01a211fc-16bf-7000-83c6-d6e7d25156a2',
    }) })
    const answer  = await vaultDB.tryBirthBank(VT.birthBankAskOf())
    expect(answer).to.have.nested.property('err.refusalkind', 'storage_issue')
  })

  it("refuses a verb with storage_issue where its statement fails in a way a retry would not mend, keeping the driver's code", async () => {
    const vaultDB = new PostgresVaultDB({ client: throwingClient(MissingTable) })
    const answer  = await vaultDB.tryGetThing(VT.getAskAt('box', 'box'))
    expect(answer).to.have.nested.property('err.refusalkind', 'storage_issue')
    expect(answer).to.have.nested.property('err.cause.code', '42P01')
  })

  it("refuses a verb with storage_unavailable where its statement fails in a way a retry may mend", async () => {
    const vaultDB = new PostgresVaultDB({ client: throwingClient(coded('terminating connection due to administrator command', '57P01')) })
    const answer  = await vaultDB.tryWriteThing(VT.birthAskOf())
    expect(answer).to.have.nested.property('err.refusalkind', 'storage_unavailable')
  })

  it("hears nothing, and calls nothing, without a listen", async () => {
    const vaultDB = new PostgresVaultDB({ client: await database() })
    const { calls, onBadNews, onEnded } = watchCalls()
    const notices: unknown[] = []
    const unwatch = vaultDB.watch(VT.ThingBank, (event) => { notices.push(event) }, onBadNews, onEnded)
    await vaultDB.tryWriteThing(VT.birthAskOf())
    await VT.aWhile()
    unwatch()
    expect(notices).to.deep.equal([])
    expect(calls).to.deep.equal([])
  })

  it("ends a watch, calling its onEnded and then its onBadNews, where a notification's fetch fails in a way a retry would not mend", async () => {
    const { listen, onNotifies, stopped } = capturingListen()
    const vaultDB = new PostgresVaultDB({ client: throwingClient(MissingTable), listen })
    const { calls, badnews, onBadNews, onEnded } = watchCalls()
    vaultDB.watch(VT.ThingBank, () => undefined, onBadNews, onEnded)
    await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
    onNotifies[0]?.(BareNotification)
    await vi.waitFor(() => { expect(stopped).to.have.lengthOf(1) })
    expect(calls).to.deep.equal(['ended', 'storage_issue'])
    expect(badnews[0]?.cause).to.deep.include({ code: '42P01' })
  })

  it("calls onEnded once where two notifications' fetches fail together", async () => {
    const { listen, onNotifies, stopped } = capturingListen()
    const vaultDB = new PostgresVaultDB({ client: throwingClient(MissingTable), listen })
    const { calls, onBadNews, onEnded } = watchCalls()
    vaultDB.watch(VT.ThingBank, () => undefined, onBadNews, onEnded)
    await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
    onNotifies[0]?.(BareNotification)
    onNotifies[0]?.(BareNotification)
    await VT.aWhile()
    expect(calls).to.deep.equal(['ended', 'storage_issue'])
    expect(stopped).to.have.lengthOf(1)
  })

  it("unlistens once where its holder stops a watch a failed fetch has ended", async () => {
    const { listen, onNotifies, stopped } = capturingListen()
    const vaultDB = new PostgresVaultDB({ client: throwingClient(MissingTable), listen })
    const unwatch = vaultDB.watch(VT.ThingBank, () => undefined, () => undefined)
    await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
    onNotifies[0]?.(BareNotification)
    await vi.waitFor(() => { expect(stopped).to.have.lengthOf(1) })
    unwatch()
    await VT.aWhile()
    expect(stopped).to.have.lengthOf(1)
  })

  it("hears a notice told while its listen is still starting", async () => {
    const { listen, stopped } = tellingListen(BareNotification)
    const vaultDB = new PostgresVaultDB({ client: throwingClient(MissingTable), listen })
    const { calls, onBadNews, onEnded } = watchCalls()
    vaultDB.watch(VT.ThingBank, () => undefined, onBadNews, onEnded)
    await vi.waitFor(() => { expect(stopped).to.have.lengthOf(1) })
    expect(calls).to.deep.equal(['ended', 'storage_issue'])
  })

  it("drops a notification whose fetch fails in a way a retry may mend, and keeps watching", async () => {
    const { listen, onNotifies, stopped } = capturingListen()
    const vaultDB = new PostgresVaultDB({ client: throwingClient(coded('terminating connection due to administrator command', '57P01')), listen })
    const { calls, onBadNews, onEnded } = watchCalls()
    const unwatch = vaultDB.watch(VT.ThingBank, () => undefined, onBadNews, onEnded)
    await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
    onNotifies[0]?.(BareNotification)
    await VT.aWhile()
    expect(calls).to.deep.equal([])
    expect(stopped).to.deep.equal([])
    unwatch()
  })

  it("ends a watch whose listen fails, calling its onEnded after watch returns and then its onBadNews", async () => {
    const vaultDB = new PostgresVaultDB({ client: await database(), listen: unconnectedListen })
    const { calls, onBadNews, onEnded } = watchCalls()
    vaultDB.watch(VT.ThingBank, () => undefined, onBadNews, onEnded)
    expect(calls, 'nothing is called before watch returns').to.deep.equal([])
    await vi.waitFor(() => { expect(calls).to.deep.equal(['ended', 'storage_unavailable']) })
  })

  it("tells onBadNews where the host's unlisten fails at the stop, and does not call onEnded", async () => {
    const unlistenFailures = [() => { throw new Error('UNLISTEN failed') }, () => Promise.reject(new Error('UNLISTEN failed'))]
    for (const onUnlisten of unlistenFailures) {
      const { listen, onNotifies } = capturingListen(onUnlisten)
      const vaultDB = new PostgresVaultDB({ client: await database(), listen })
      const { calls, badnews, onBadNews, onEnded } = watchCalls()
      const unwatch = vaultDB.watch(VT.ThingBank, () => undefined, onBadNews, onEnded)
      await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
      unwatch()
      await vi.waitFor(() => { expect(calls).to.deep.equal(['storage_issue']) })
      expect(badnews[0]?.cause).to.have.property('message', 'UNLISTEN failed')
    }
  })

  it("unlistens a watch stopped before its listen resolves, once it resolves", async () => {
    const stopped: string[] = []
    const startListens: (() => void)[] = []
    const slowListen: PostgresListen = (channel) => new Promise((resolve) => { startListens.push(() => { resolve(() => { stopped.push(channel) }) }) })
    const vaultDB = new PostgresVaultDB({ client: await database(), listen: slowListen })
    const unwatch = vaultDB.watch(VT.ThingBank, () => undefined, () => undefined)
    unwatch()
    await VT.aWhile()
    expect(stopped).to.deep.equal([])
    startListens[0]?.()
    await vi.waitFor(() => { expect(stopped).to.deep.equal([thingsChannelOf(VT.ThingBank.userid)]) })
  })

  it("dates each read in a session by the database's clock, in order", async () => {
    const vaultDB = await makeVaultDB()
    const db      = await database()
    const { rows } = await db.query<{ millis: number }>('SELECT (extract(epoch FROM clock_timestamp()) * 1000)::float8 AS millis')
    const first   = await vaultDB.tryGetThing(VT.getAskAt('box', 'box'))
    const second  = await vaultDB.tryGetThing(VT.getAskAt('box', 'box'))
    // A read_tc compares as text in the order it was made.
    const isLater = second.read_tc > first.read_tc
    expect(isLater).to.be.true
    expect(readAtOf(first.read_tc)).to.be.closeTo(rows[0]!.millis, 1000)
  })

  it("notifies with the read_tc Postgres made for the notice", async () => {
    const vaultDB = await makeVaultDB()
    const notices: string[] = []
    const onNotify = (text: string) => { notices.push(text) }
    onNotifies.add(onNotify)
    onTestFinished(() => { onNotifies.delete(onNotify) })
    const read_tcs: string[] = []
    onTestFinished(vaultDB.watch(VT.ThingBank, (event) => { read_tcs.push(event.read_tc) }, () => undefined))
    await vaultDB.tryWriteThing(VT.birthAskOf())
    await vi.waitFor(() => { expect(read_tcs).to.have.lengthOf(1) })
    expect(notices).to.have.lengthOf(1)
    expect(read_tcs[0]).to.eq((JSON.parse(notices[0]!) as { read_tc: string }).read_tc)
  })

  it("notifies of each root at a birth with its bank's part, the gate's banktok, labelpath, lifepath, revseq and revtok, and none of its wayins", async () => {
    const vaultDB = await makeVaultDB()
    const notices: string[] = []
    const onNotify = (text: string) => { notices.push(text) }
    onNotifies.add(onNotify)
    onTestFinished(() => { onNotifies.delete(onNotify) })
    onTestFinished(vaultDB.watch(VT.ThingBank, () => undefined, () => undefined))
    const ask = VT.birthBankAskOf()
    await VT.expectGood(vaultDB.tryBirthBank(ask))
    await vi.waitFor(() => { expect(notices).to.have.lengthOf(2) })
    const { banktok, labelpath, lifepath, revseq, revtok } = ask.gate
    for (const notice of notices) { expect((JSON.parse(notice) as { bank: unknown }).bank).to.deep.equal({ banktok, labelpath, lifepath, revseq, revtok }) }
  })

  it("answers with the read_tc of the row Postgres returns", async () => {
    const read_tc = '01a211fc-16bf-7000-83c6-d6e7d25156a2'
    const vaultDB = new PostgresVaultDB({ client: answeringClient({ actual: { gate: null, root: null }, banktok: VoidBanktok, tracked: { gate: null, root: null }, read_tc }) })
    const answer  = await vaultDB.tryGetBank({ ...VT.ThingBank, op: 'getbank', track: VoidTrack, banktok: VoidBanktok })
    expect(answer.read_tc).to.eq(read_tc)
  })

  it("refuses a client, listen or opt it cannot use", async () => {
    const client = await database()
    const unusable = [{}, { client: {} }, { client, listen: 'yes' }, { client, pushWorld: true }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new PostgresVaultDB(opts as never), 'bad_record') }
  })
})
