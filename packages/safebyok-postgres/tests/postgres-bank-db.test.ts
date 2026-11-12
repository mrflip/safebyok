/** PostgresBankDB on PGlite: the battery every bankDB runs, plus tests of its Postgres-specific behavior. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as DB from 'safebyok/storage'
import type { Notice } from 'safebyok/storage'
import { PostgresBankDB, bankChannelOf } from '../src/index'
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

/** Watch `scope` on `bankDB` until the test ends. Returns the array that collects its notices. */
function watching(bankDB: PostgresBankDB, scope: DB.WatchScope = BW.vaultScope) {
  const notices: Notice[] = []
  const unwatch = bankDB.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

/** The ask to build the bank of `user_id`, made at the bank's own revision and life. */
function buildAskFor(user_id: string) {
  return BW.bankBuildAskOf({ ...BW.bankAt(), user_id }, { ...BW.gateAt(), user_id })
}

/** A bankDB holding the bank `bank1` and its vault. */
async function bankDBWithVault(opts?: Parameters<typeof BH.makeBankDB>[0]) {
  const bankDB = await BH.makeBankDB(opts)
  await bankDB.buildBank(BW.bankBuildAskOf())
  await bankDB.putVault(BW.vaultPutAskOf(BW.vaultAt()))
  return bankDB
}

TH.describeBankDBBattery("PostgresBankDB's battery", {
  makeBankDB:          async (opts) => await BH.makeBankDB(opts),
  makeCappedBankDB:    async (maxBoxes) => await BH.makeBankDB({ maxBoxes }),
  makeTwin:            BH.makeTwin,
  _cheat_rowsOf:       () => BH.rowsOf(),
  _cheat_failNextCall: BH.failNextCall,
})

describe("PostgresBankDB's constructor", () => {
  it("refuses a client, listen or maxBoxes it cannot use", async () => {
    const client = TH.flakyClientOf(await BH.database())
    const unusable = [{}, { client: { query: client.query } }, { client, listen: 'yes' }, { client, maxBoxes: -1 }, { client, maxRecordSizeEst: 0 }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new PostgresBankDB(opts as never), 'bad_option') }
  })
})

describe("PostgresBankDB's refusals", () => {
  it("reports a missing table or privilege as an unexpected error, and any other failed statement as storage unavailable", async () => {
    const noTable = Object.assign(new Error('relation "safebyok_banks" does not exist'), { code: '42P01' })
    const missing = new PostgresBankDB({ client: throwingClient(noTable) })
    const dropped = new PostgresBankDB({ client: throwingClient(new Error('Connection terminated unexpectedly')) })
    await TH.expectRefusal(missing.ensureBank(TH.BW.bankEnsureAsk), 'unexpected_error')
    await TH.expectRefusal(missing.buildBank(TH.BW.bankBuildAskOf()), 'unexpected_error')
    await TH.expectRefusal(dropped.getVault(TH.BW.vaultGetAskOf()), 'storage_unavailable')
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

  it("passes over a notification on its channel that no write of ours sent", async () => {
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

const refusingListen: PostgresListen = () => Promise.reject(new Error('connection refused'))

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

  it("refuses a user_id that fails its check", () => {
    for (const user_id of ['', 'a b', 'a/b', '..', 'caf\u{E9}', 7 as never]) {
      TH.expectSyncRefusal(() => bankChannelOf(user_id), 'bad_option')
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
      expect(DB.isVaultError(err, 'storage_unavailable')).to.be.true
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
