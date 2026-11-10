/** pgClientOf: each transaction runs on one connection checked out of a pg Pool. */

import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'
import { pgClientOf } from '../src/index'
import type { PgPool } from '../src/index'

/** A fake pool with one connection. It logs each statement and release, and fails the statements listed in `failing`. */
const poolOf = (failing: string[] = []) => {
  const said: string[] = []
  const runStatement = (text: string) => {
    said.push(text)
    return failing.includes(text) ? Promise.reject(new Error(`${text} failed`)) : Promise.resolve({ rows: [{ text }] })
  }
  const pool: PgPool = {
    query:   runStatement,
    connect: () => Promise.resolve({ query: runStatement, release: (destroy) => { said.push(`release ${String(destroy)}`) } }),
  }
  return { pool, said }
}

describe("pgClientOf", () => {
  it("runs a statement on the pool", async () => {
    const { pool, said } = poolOf()
    expect(await pgClientOf(pool).query('SELECT 1')).to.deep.equal({ rows: [{ text: 'SELECT 1' }] })
    expect(said).to.deep.equal(['SELECT 1'])
  })

  it("commits a transaction whose work resolves, and hands its connection back", async () => {
    const { pool, said } = poolOf()
    expect(await pgClientOf(pool).transaction(async (tx) => await tx.query('SELECT 1'))).to.deep.equal({ rows: [{ text: 'SELECT 1' }] })
    expect(said).to.deep.equal(['BEGIN', 'SELECT 1', 'COMMIT', 'release false'])
  })

  it("rolls back a transaction whose work throws, and throws that", async () => {
    const { pool, said } = poolOf(['SELECT 1'])
    await expect(pgClientOf(pool).transaction(async (tx) => await tx.query('SELECT 1'))).rejects.toThrow('SELECT 1 failed')
    expect(said).to.deep.equal(['BEGIN', 'SELECT 1', 'ROLLBACK', 'release false'])
  })

  it("discards a connection whose rollback failed", async () => {
    const { pool, said } = poolOf(['COMMIT', 'ROLLBACK'])
    await expect(pgClientOf(pool).transaction(() => Promise.resolve('done'))).rejects.toThrow('COMMIT failed')
    expect(said).to.deep.equal(['BEGIN', 'COMMIT', 'ROLLBACK', 'release true'])
  })

  it("refuses what is not a pool", () => {
    for (const notPool of [null, {}, { query: () => null }]) { TH.expectSyncRefusal(() => pgClientOf(notPool as never), 'bad_option') }
  })
})
