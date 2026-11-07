/** A PostgresClient made of a pg Pool, which runs a transaction on one connection it checks out. */

import * as DB from 'safebyok/storage'
import type { PostgresClient, PostgresQueryable } from './postgres-vault-db'

// == [The pool]: PgPool, PgPoolClient, pgPool

/** The part of pg's PoolClient that pgClientOf uses: a connection, handed back with `release`. */
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

/** Rolls back `conn`'s transaction, answering false when even that failed. */
const rollBack = async (conn: PgPoolClient): Promise<boolean> => {
  try {
    await conn.query('ROLLBACK')
    return true
  } catch {
    return false
  }
}

/** The {@link PostgresClient} over a pg Pool: `new PostgresVaultDB({ client: pgClientOf(pool) })`. */
export const pgClientOf = (given: PgPool): PostgresClient => {
  const pool = pgPool.parse(given)
  return {
    query:       async (text, params) => await pool.query(text, params),
    transaction: async (work) => {
      const conn = await pool.connect()
      // A connection whose ROLLBACK failed is in no state to serve the next checkout, so the pool discards it.
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
