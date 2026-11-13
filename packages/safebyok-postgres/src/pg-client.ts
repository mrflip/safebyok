/** A PostgresClient built on a pg Pool. Each transaction runs on one connection checked out of the pool. */

import * as DB from 'safebyok/storage'
import type { PostgresClient, PostgresQueryable } from './postgres-bank-db'

// == [The pool]: PgPool, PgPoolClient, pgPool

/** The part of pg's PoolClient that pgClientOf uses: a connection, returned to the pool with `release`. */
export type PgPoolClient = PostgresQueryable & { release: (destroy?: boolean) => void }

/** The part of pg's Pool that pgClientOf uses. */
export type PgPool = PostgresQueryable & { connect: () => Promise<PgPoolClient> }

const isPgPool = (candidate: unknown): candidate is PgPool => (
  (typeof candidate === 'object') && (candidate !== null)
  && ('query' in candidate) && (typeof candidate.query === 'function')
  && ('connect' in candidate) && (typeof candidate.connect === 'function')
)

const pgPool = DB.Checker(({ custom }) => custom<PgPool>(isPgPool, 'Expected a pg Pool, with query and connect functions'), 'bad_option')
// --

/** Roll back the transaction on `conn`. Returns false if the ROLLBACK itself failed. */
async function rollBack(conn: PgPoolClient): Promise<boolean> {
  try {
    await conn.query('ROLLBACK')
    return true
  } catch {
    return false
  }
}

/** Wrap a pg Pool as a {@link PostgresClient}: `new PostgresBankDB({ client: pgClientOf(pool) })`. */
export function pgClientOf(given: PgPool): PostgresClient {
  const pool = pgPool.parse(given)
  return {
    query:       async (text, params) => await pool.query(text, params),
    transaction: async (work) => {
      const conn = await pool.connect()
      // If ROLLBACK failed, the connection may be unusable, so tell the pool to destroy it instead of reusing it.
      let isBroken = false
      try {
        await conn.query('BEGIN')
        const done = await work(conn)
        await conn.query('COMMIT')
        return done
      } catch (err) {
        isBroken = ! await rollBack(conn)
        throw err
      } finally { conn.release(isBroken) }
    },
  }
}
