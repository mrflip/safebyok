/** Test helpers: a PGlite client whose next statement can be made to fail, and the boot timeout. The bankDB's helpers are `bank-helpers.ts`. */

import type { PGlite } from '@electric-sql/pglite'
import type { PostgresClient } from '../src/index'

// Re-export the core's test helpers, so a test here imports this one module as TH.
export * from 'safebyok-big/testing'

// On a CI runner, PGlite's WebAssembly can take eight seconds or more to compile from cold, longer than a test's default timeout.
export const BootMillis = 60_000

/** A PGlite client whose next statement can be made to fail like a dropped connection. */
export type FlakyClient = PostgresClient & { failNext: () => void }

export function flakyClientOf(db: PGlite): FlakyClient {
  let isFailing = false
  function failure(): Error {
    isFailing = false
    return Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01', params: ['a row'] })
  }
  return {
    query:       async (text, params) => { if (isFailing) { throw failure() } return await db.query(text, params) },
    transaction: async (work) => { if (isFailing) { throw failure() } return await db.transaction(work) },
    failNext:    () => { isFailing = true },
  }
}
