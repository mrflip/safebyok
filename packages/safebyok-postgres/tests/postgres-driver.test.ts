/** refusalOf: the VaultError for what a Postgres driver threw. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { isVaultError, unexpectedError } from 'safebyok/storage'
import { PgConnectionLost, refusalOf } from '../src/postgres-driver'

/** An Error with a driver's `code`. */
function coded(message: string, code: string): Error { return Object.assign(new Error(message), { code }) }

describe("refusalOf", () => {
  it("reports a failure a retry may mend as storage unavailable, and any other as an unexpected error", () => {
    const transient = [
      coded('terminating connection due to administrator command', '57P01'), coded('could not serialize access', '40001'),
      coded('too many connections', '53300'), coded('connection failure', '08006'), coded('canceling statement due to lock timeout', '55P03'),
      coded('cannot execute INSERT in a read-only transaction', '25006'), coded('read ECONNRESET', 'ECONNRESET'), new Error('Connection terminated unexpectedly'), new Error('timeout exceeded when trying to connect'),
    ]
    const lasting = [
      coded('relation "safebyok_box_things" does not exist', '42P01'), coded('new row violates check constraint', '23514'), coded('raised', 'P0001'),
      coded('channel name too long', '22023'), new TypeError('rows is undefined'), new Error('Connection terminated'), coded('dropped', 'not a code'),
    ]
    for (const err of transient) { expect(isVaultError(refusalOf(err), 'storage_unavailable'), err.message).to.be.true }
    for (const err of lasting) { expect(isVaultError(refusalOf(err), 'unexpected_error'), err.message).to.be.true }
  })

  it("returns a VaultError as it is, and reports a thrown null, undefined or string as an unexpected error", () => {
    const vaultError = unexpectedError(new Error('already refused'))
    expect(refusalOf(vaultError)).to.equal(vaultError)
    for (const thrown of [null, undefined, 'boom']) { expect(isVaultError(refusalOf(thrown), 'unexpected_error'), String(thrown)).to.be.true }
  })

  // pg gives these failures no code, so a release that rewords one would turn a lost connection into an unexpected error.
  it("counts as a lost connection only messages the installed pg and pg-pool throw", () => {
    const pgClient = createRequire(import.meta.url).resolve('pg/lib/client.js')
    const pgPool   = createRequire(pgClient).resolve('pg-pool')
    const sources  = [pgClient, pgPool].map((path) => readFileSync(path, 'utf8')).join('\n')
    for (const message of PgConnectionLost) { expect(sources).to.include(message) }
  })

  it("keeps a driver error's message and code as the cause, and none of the statement's parameters", () => {
    const thrown = Object.assign(coded('terminating connection due to administrator command', '57P01'), { params: ['a row'] })
    const refusal = refusalOf(thrown)
    expect(refusal.cause).to.deep.include({ message: 'terminating connection due to administrator command', code: '57P01' })
    expect(refusal.cause).not.to.have.property('params')
  })
})
