/** PostgresBankDB on PGlite: the battery every bankDB runs, plus tests of its Postgres-specific behavior. */

import { describe, expect, it } from 'vitest'
import * as DB from 'safebyok/storage'
import { PostgresBankDB } from '../src/index'
import * as BH from './bank-helpers'
import * as TH from './test-helpers'

BH.bootDatabaseFirst()

/** A client whose every statement fails with `err`. */
function throwingClient(err: Error) {
  return {
    query:       () => Promise.reject(err),
    transaction: () => Promise.reject(err),
  }
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
