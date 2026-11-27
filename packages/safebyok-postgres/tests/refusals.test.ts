/** The refusals PostgresVaultDB makes of what Postgres and its driver throw. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { isVaultError, unexpectedError } from 'safebyok/storage'
import { PgConnectionLost, refusalOf } from '../src/refusals'

/** An Error with a driver's `code`. */
function coded(message: string, code: string): Error { return Object.assign(new Error(message), { code }) }

const TransientCases = [
  [coded('terminating connection due to administrator command', '57P01'),     'a server shutting down'],
  [coded('could not serialize access', '40001'),                              'a serialization failure'],
  [coded('too many connections', '53300'),                                    'a server short of connections'],
  [coded('connection failure', '08006'),                                      'a connection exception'],
  [coded('canceling statement due to lock timeout', '55P03'),                 'a lock not granted in time'],
  [coded('cannot execute INSERT in a read-only transaction', '25006'),        'a write sent to a read-only server'],
  [coded('read ECONNRESET', 'ECONNRESET'),                                    "a socket's system error"],
  [new Error('Connection terminated unexpectedly'),                           "pg's message for a dropped connection"],
  [new Error('timeout exceeded when trying to connect'),                      "pg-pool's message for no connection in time"],
] as const

const LastingCases = [
  [coded('relation "safebyok_box_things" does not exist', '42P01'),           'a missing table'],
  [coded('permission denied for table safebyok_box_things', '42501'),         'a missing privilege'],
  [coded('new row violates check constraint', '23514'),                       'a row the table refuses'],
  [coded('channel name too long', '22023'),                                   'a channel name too long'],
  [new TypeError('rows is undefined'),                                        'an Error with no code'],
  [new Error('Connection terminated'),                                        'a client the host ended itself'],
  [coded('dropped', 'not a code'),                                            'a code that is no SQLSTATE or system error'],
] as const

describe("refusalOf(oplabel, thrown)", () => {
  for (const [thrown, blurb] of TransientCases) {
    it(`refuses storage_unavailable for ${blurb}`, () => {
      expect(refusalOf('getThing', thrown).refusalkind).to.eq('storage_unavailable')
    })
  }

  for (const [thrown, blurb] of LastingCases) {
    it(`refuses storage_issue for ${blurb}`, () => {
      expect(refusalOf('getThing', thrown).refusalkind).to.eq('storage_issue')
    })
  }

  it("names the call in a storage_issue's message", () => {
    expect(refusalOf('writeThing', coded('raised', 'P0001')).message).to.include('writeThing')
  })

  it("returns a VaultError as it is", () => {
    const vaultError = unexpectedError(new Error('already refused'))
    expect(refusalOf('getThing', vaultError)).to.equal(vaultError)
  })

  it("refuses storage_issue for a thrown null, undefined or string", () => {
    for (const thrown of [null, undefined, 'boom']) { expect(isVaultError(refusalOf('getThing', thrown), 'storage_issue'), String(thrown)).to.be.true }
  })

  it("keeps a driver error's message and code as the cause, and none of the statement's parameters", () => {
    for (const thrown of [coded('terminating connection due to administrator command', '57P01'), coded('raised', 'P0001')]) {
      const refusal = refusalOf('getThing', Object.assign(thrown, { params: ['a row'] }))
      expect(refusal.cause).to.deep.include({ message: thrown.message, code: (thrown as Error & { code: string }).code })
      expect(refusal.cause).not.to.have.property('params')
    }
  })

  it("keeps no code that could quote a row", () => {
    const refusal = refusalOf('getThing', coded('raised', 'secret row text'))
    expect(refusal.cause).not.to.have.property('code')
  })

  // pg gives these failures no code, so a release that rewords one would turn a lost connection into a lasting failure.
  it("counts as a lost connection only messages the installed pg and pg-pool throw", () => {
    const pgClient = createRequire(import.meta.url).resolve('pg/lib/client.js')
    const pgPool   = createRequire(pgClient).resolve('pg-pool')
    const sources  = [pgClient, pgPool].map((path) => readFileSync(path, 'utf8')).join('\n')
    for (const message of PgConnectionLost) { expect(sources).to.include(message) }
  })
})
