/** PostgresBankDB on PGlite: the battery every bankDB runs, plus tests of its Postgres-specific behavior. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as DB from 'safebyok-big/storage'
import type { Notice } from 'safebyok-big/storage'
import type { UserID } from 'safebyok-big'
import { PostgresBankDB, bankChannelOf } from '../src/index'
import { PgConnectionLost } from '../src/postgres-bank-db'
import * as Phrases from '../src/phrases'
import type { PostgresListen } from '../src/index'
import * as BH from './bank-helpers'
import * as TH from './test-helpers'

const { BW } = TH

BH.bootDatabaseFirst()

/** A client whose every statement fails with `err`. */
function throwingClient(err: Error) {
  return {
    query:       () => Promise.reject(err),
    transaction: () => Promise.reject(err),
  }
}

/** A client whose every statement answers the one row `row`. */
function answeringClient(row: object) {
  return {
    query:       () => Promise.resolve({ rows: [row] }),
    transaction: () => Promise.reject(new Error('no transaction here')),
  }
}

/** An Error with a driver's `code`. */
function coded(message: string, code: string): Error { return Object.assign(new Error(message), { code }) }

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

/** Watch `scope` on `bankDB` until the test ends. Returns the array that collects its notices. */
function watching(bankDB: PostgresBankDB, scope: DB.WatchScope = BW.vaultScope) {
  const notices: Notice[] = []
  const unwatch = bankDB.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

/** The ask to build the bank of `user_id`, made at the bank's own revision and life. */
function buildAskFor(user_id: UserID) {
  return BW.bankBuildAskOf({ ...BW.bankAt(), user_id }, { ...BW.gateAt(), user_id })
}

/** A bankDB with the bank `bank1` and its vault. */
async function bankDBWithVault(opts?: Parameters<typeof BH.makeBankDB>[0]) {
  const bankDB = await BH.makeBankDB(opts)
  await bankDB.buildBank(BW.bankBuildAskOf())
  await bankDB.putVault(BW.vaultPutAskOf(BW.vaultAt()))
  return bankDB
}

TH.describeBankDBBattery("PostgresBankDB's battery", {
  makeBankDB:            async (opts) => await BH.makeBankDB(opts),
  makeCappedBankDB:      async (maxBoxes) => await BH.makeBankDB({ maxBoxes }),
  makeTwin:              BH.makeTwin,
  _cheat_rowsOf:         () => BH.rowsOf(),
  _cheat_failNextCall:   BH.failNextCall,
  _cheat_writeOtherwise: BH.writeOtherwise,
})

describe("PostgresBankDB's constructor", () => {
  it("refuses a client, listen or maxBoxes it cannot use", async () => {
    const client = TH.flakyClientOf(await BH.database())
    const unusable = [{}, { client: { query: client.query } }, { client, listen: 'yes' }, { client, maxBoxes: -1 }, { client, maxRecordSizeEst: 0 }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new PostgresBankDB(opts as never), 'bad_record') }
  })
})

describe("PostgresBankDB's refusals", () => {
  it("reports a failed statement a retry may mend as storage unavailable, and any other as an unexpected error", async () => {
    const transient = [
      coded('terminating connection due to administrator command', '57P01'), coded('could not serialize access', '40001'),
      coded('too many connections', '53300'), coded('connection failure', '08006'), coded('canceling statement due to lock timeout', '55P03'),
      coded('cannot execute INSERT in a read-only transaction', '25006'), coded('read ECONNRESET', 'ECONNRESET'), new Error('Connection terminated unexpectedly'), new Error('timeout exceeded when trying to connect'),
    ]
    const lasting = [
      coded('relation "safebyok_banks" does not exist', '42P01'), coded('new row violates check constraint', '23514'), coded('raised', 'P0001'),
      coded('channel name too long', '22023'), new TypeError('rows is undefined'), new Error('Connection terminated'), coded('dropped', 'not a code'),
    ]
    for (const err of transient) {
      await TH.expectRefusal(new PostgresBankDB({ client: throwingClient(err) }).getVault(TH.BW.vaultGetAskOf()), 'storage_unavailable')
    }
    for (const err of lasting) {
      await TH.expectRefusal(new PostgresBankDB({ client: throwingClient(err) }).ensureBank(TH.BW.bankEnsureAsk), 'unexpected_error')
    }
  })

  // pg gives these failures no code, so a release that rewords one would turn a lost connection into an unexpected error.
  it("counts as a lost connection only messages the installed pg and pg-pool throw", () => {
    const pgClient = createRequire(import.meta.url).resolve('pg/lib/client.js')
    const pgPool   = createRequire(pgClient).resolve('pg-pool')
    const sources  = [pgClient, pgPool].map((path) => readFileSync(path, 'utf8')).join('\n')
    for (const message of PgConnectionLost) { expect(sources).to.include(message) }
  })

  it("reports a write function that stored nothing where the classifier finds a write as an unexpected error", async () => {
    const bankDB = new PostgresBankDB({ client: answeringClient({ ok: false, bank: null, gate: null }) })
    const { err } = await bankDB.tryBuildBank(TH.BW.bankBuildAskOf())
    expect(DB.isVaultError(err, 'unexpected_error')).to.be.true
    expect(err?.cause).to.deep.include({ message: Phrases.StoredNothing })
  })

  it("keeps a driver error's name, message and code as the cause, and none of the statement's parameters", async () => {
    const bankDB = await BH.makeBankDB()
    BH.failNextCall(bankDB)
    const { err } = await bankDB.tryBuildBank(TH.BW.bankBuildAskOf())
    expect(DB.isVaultError(err, 'storage_unavailable')).to.be.true
    expect(err?.cause).to.deep.include({ message: 'terminating connection due to administrator command', code: '57P01' })
    expect(err?.cause).not.to.have.property('params')
  })
})

describe("PostgresBankDB's watch", () => {
  it("delivers the stored rows for a write too large for a notification", async () => {
    const bankDB = await bankDBWithVault({ maxRecordSizeEst: 20_000 })
    const notices = watching(bankDB)
    const box = BW.boxAt(0, 'bank1', 'life1', { sidecar: { note: 'x'.repeat(9000) } })
    await bankDB.putBox(BW.boxPutAskOf(box))
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'gotlive', val: box, parent: BW.vaultAt() }]) })
  })

  it("delivers a box and its tombstone as stored, each with its vault row", async () => {
    const bankDB = await bankDBWithVault()
    const notices = watching(bankDB)
    const box = BW.boxAt(0, 'bank1', 'life1', { sidecar: { note: 'naïve ✓ "quoted" \\ [1, 2]', nested: { list: [null, true, 0] } } })
    const tombstone = BW.boxTombstoneOf(box)
    await bankDB.putBox(BW.boxPutAskOf(box))
    await bankDB.delBox(BW.boxDelAskOf(box))
    await vi.waitFor(() => {
      expect(notices).to.deep.equal([
        { act: 'gotlive', val: box, parent: BW.vaultAt() },
        { act: 'gotgone', val: tombstone, parent: BW.vaultAt() },
      ])
    })
  })

  it("passes over a notification on its channel that no write of ours made", async () => {
    const bankDB = await BH.makeBankDB()
    await bankDB.buildBank(BW.bankBuildAskOf())
    const notices = watching(bankDB)
    const db = await BH.database()
    await db.query('SELECT pg_notify($1, $2), pg_notify($1, $3), pg_notify($1, $4)', [bankChannelOf(BW.bankScope.user_id), 'not json', '{"banklabel":"acme"}', '[1, 2, 3]'])
    await bankDB.putVault(BW.vaultPutAskOf(BW.vaultAt()))
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'gotlive', val: BW.vaultAt(), parent: BW.bankAt() }]) })
  })

  it("delivers nothing without a listen", async () => {
    await BH.emptyTables()
    const bankDB = new PostgresBankDB({ client: TH.flakyClientOf(await BH.database()) })
    const notices = watching(bankDB)
    await bankDB.buildBank(BW.bankBuildAskOf())
    await bankDB.putVault(BW.vaultPutAskOf(BW.vaultAt()))
    await TH.aWhile()
    expect(notices).to.deep.equal([])
  })
})

const refusingListen: PostgresListen = () => Promise.reject(coded('connect ECONNREFUSED', 'ECONNREFUSED'))

describe("PostgresBankDB's channels", () => {
  it("listens for a watch on its user's channel", async () => {
    const listened: string[] = []
    const stopped: string[] = []
    const listen: PostgresListen = async (channel, onNotify) => {
      listened.push(channel)
      const unlisten = await BH.listen(channel, onNotify)
      return () => { stopped.push(channel); return unlisten() }
    }
    const watcher = await BH.bankDBOver({ listen })
    const unwatch = watcher.watch(BW.bankScope, () => undefined)
    await vi.waitFor(() => { expect(listened).to.deep.equal(['safebyok_u1']) })
    unwatch()
    await vi.waitFor(() => { expect(stopped).to.deep.equal(['safebyok_u1']) })
    expect(bankChannelOf('u1')).to.eq('safebyok_u1')
  })

  it("tells a watch's onBadNews where its listen fails", async () => {
    const watcher = await BH.bankDBOver({ listen: refusingListen })
    const badnews: DB.VaultError[] = []
    const unwatch = watcher.watch(BW.bankScope, () => undefined, (news) => { badnews.push(news) })
    await vi.waitFor(() => { expect(badnews).to.have.lengthOf(1) })
    expect(badnews[0]?.refusalkind).to.eq('storage_unavailable')
    unwatch()
  })

  it("ends a watch, telling its onBadNews, where a notice's fetch fails in a way a retry would not mend", async () => {
    const { listen, onNotifies, stopped } = capturingListen()
    const watcher = new PostgresBankDB({ client: throwingClient(coded('relation "safebyok_banks" does not exist', '42P01')), listen })
    const badnews: DB.VaultError[] = []
    watcher.watch(BW.bankScope, () => undefined, (news) => { badnews.push(news) })
    await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
    const notice = JSON.stringify({ at: { user_id: BW.bankScope.user_id, banklabel: BW.bankScope.banklabel } })
    onNotifies[0]?.(notice)
    onNotifies[0]?.(notice)
    await vi.waitFor(() => { expect(stopped).to.have.lengthOf(1) })
    await TH.aWhile()
    expect(badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
  })

  it("hears a notice told while its listen is still starting", async () => {
    const { listen, stopped } = tellingListen(JSON.stringify({ at: { user_id: BW.bankScope.user_id, banklabel: BW.bankScope.banklabel } }))
    const watcher = new PostgresBankDB({ client: throwingClient(coded('relation "safebyok_banks" does not exist', '42P01')), listen })
    const badnews: DB.VaultError[] = []
    watcher.watch(BW.bankScope, () => undefined, (news) => { badnews.push(news) })
    await vi.waitFor(() => { expect(stopped).to.have.lengthOf(1) })
    expect(badnews).to.have.lengthOf(1)
    expect(badnews[0]?.cause).to.deep.include({ code: '42P01' })
  })

  it("drops a notice whose fetch fails in a way a retry may mend, and keeps watching", async () => {
    const { listen, onNotifies, stopped } = capturingListen()
    const watcher = new PostgresBankDB({ client: throwingClient(coded('terminating connection due to administrator command', '57P01')), listen })
    const badnews: DB.VaultError[] = []
    const unwatch = watcher.watch(BW.bankScope, () => undefined, (news) => { badnews.push(news) })
    await vi.waitFor(() => { expect(onNotifies).to.have.lengthOf(1) })
    onNotifies[0]?.(JSON.stringify({ at: { user_id: BW.bankScope.user_id, banklabel: BW.bankScope.banklabel } }))
    await TH.aWhile()
    expect(badnews).to.deep.equal([])
    expect(stopped).to.deep.equal([])
    unwatch()
  })

  it("refuses a user_id that fails its check", () => {
    for (const user_id of ['', 'a b', 'a/b', '..', 'caf\u{E9}', 7 as never]) {
      TH.expectSyncRefusal(() => bankChannelOf(user_id), 'bad_record')
    }
  })

  it("delivers a write for a user_id with capitals and punctuation", async () => {
    const bankDB = await BH.makeBankDB()
    const user_id = 'Auth0|Ab.C@x.io~:-+%2B'
    // PGlite queues a first LISTEN behind the statements already waiting, so listen on the channel before writing.
    await BH.listen(bankChannelOf(user_id), () => undefined)
    const notices = watching(bankDB, { ...BW.bankScope, user_id })
    const ask = buildAskFor(user_id)
    await bankDB.buildBank(ask)
    await vi.waitFor(() => { expect(notices.map(({ val }) => val)).to.deep.equal([ask.record, ask.gate]) })
  })

  // The channel is 'safebyok_' (9 bytes) plus the user_id, and Postgres rejects a channel name longer than 63 bytes.
  it("refuses each write for a user_id past 54 bytes", async () => {
    const bankDB = await BH.makeBankDB()
    const longest = 'u'.repeat(54)
    await bankDB.buildBank(buildAskFor(longest))
    for (const user_id of ['u'.repeat(55), encodeURIComponent('é'.repeat(9)) + 'u']) {
      const { err } = await bankDB.tryBuildBank(buildAskFor(user_id))
      expect(DB.isVaultError(err, 'unexpected_error')).to.be.true
      expect(err?.cause).to.deep.include({ message: 'channel name too long', code: '22023' })
      expect(await bankDB.ensureBank({ ...BW.bankEnsureAsk, user_id })).to.deep.include({ act: 'gotvoid' })
    }
    expect(await bankDB.ensureBank({ ...BW.bankEnsureAsk, user_id: longest })).to.deep.include({ act: 'gotlive' })
  })

  it("counts a percent-encoded character as three bytes", async () => {
    const bankDB = await BH.makeBankDB()
    const encoded = encodeURIComponent('é'.repeat(9))
    expect(encoded).to.have.lengthOf(54)
    await bankDB.buildBank(buildAskFor(encoded))
  })

  it("refuses a user_id of other characters before Postgres is asked", async () => {
    const bankDB = new PostgresBankDB({ client: throwingClient(new Error('Postgres was asked')) })
    const answer = await bankDB.tryBuildBank(buildAskFor('é'.repeat(9)))
    expect(answer).to.deep.include({ ok: false })
    expect(answer.err?.meta?.fieldnames).to.include('user_id')
  })
})
