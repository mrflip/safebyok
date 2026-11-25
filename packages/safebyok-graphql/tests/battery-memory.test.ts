/** The battery every vaultDB runs, against a GraphQLVaultDB whose server answers from a MemoryVaultDB. */

import { MemoryVaultDB } from 'safebyok/storage'
import type { GraphQLVaultDB } from '../src/index'
import * as TH from './test-helpers'

const serversOf = new WeakMap<GraphQLVaultDB, MemoryVaultDB>()

/** A GraphQLVaultDB over a fresh MemoryVaultDB. */
function makeVaultDB(): GraphQLVaultDB {
  const memory = new MemoryVaultDB()
  const vaultDB = TH.browserOver(TH.schemaOver(memory))
  serversOf.set(vaultDB, memory)
  return vaultDB
}

/** The MemoryVaultDB behind a GraphQLVaultDB that makeVaultDB made. */
function memoryOf(vaultDB: GraphQLVaultDB): MemoryVaultDB {
  const memory = serversOf.get(vaultDB)
  if (memory === undefined) { throw new Error('This needs a vaultDB makeVaultDB made') }
  return memory
}

TH.describeVaultDBBattery('GraphQLVaultDB over a MemoryVaultDB', {
  makeVaultDB,
  _cheat_rowsOf: (vaultDB) => ({
    plant:  (scope, raw) => { memoryOf(vaultDB)._cheat_things(scope).set(scope.labelpath, structuredClone(raw)) },
    remove: (scope) => { memoryOf(vaultDB)._cheat_things(scope).delete(scope.labelpath) },
  }),
})
