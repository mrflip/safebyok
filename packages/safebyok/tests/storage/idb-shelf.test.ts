/** versionedShelfOf: what it checks of its spec, and the one shelf it keeps for each database. */

// fake-indexeddb installs IndexedDB's globals before the shelf loads: real transactions, with no browser.
import 'fake-indexeddb/auto'
import type { UseStore } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { _cheat_forgetShelf, versionedShelfOf, type VersionedShelfSpec } from '../../src/storage/idb-shelf'
import { inOneStep, rowAt } from '../../src/storage/idb-transaction'

/** A spec over a dbName no other test has touched. */
const specOf = (over: Partial<VersionedShelfSpec> = {}): VersionedShelfSpec => ({
  dbName: `test-${crypto.randomUUID()}`, dbstem: 'device', version: '001-001-001', storename: 'leases', oldnames: [], ...over,
})

describe("versionedShelfOf(spec)", () => {
  it("answers a shelf that files rows in the database named by its stem and version", async () => {
    const spec = specOf()
    const shelf = versionedShelfOf(spec)
    await inOneStep(shelf, 'readwrite', (store) => { store.put({ wrapped: 'one' }, 'key') })
    expect(await inOneStep(shelf, 'readonly', (store) => rowAt(store, 'key'))).to.deep.equal({ wrapped: 'one' })
    const dbs = await indexedDB.databases()
    expect(dbs.map((db) => db.name)).to.include(`${spec.dbName}:device-v001-001-001`)
  })

  it("answers the one shelf for a database, however often it is asked", () => {
    const spec = specOf()
    expect(versionedShelfOf(spec)).to.eq(versionedShelfOf({ ...spec }))
  })

  it("answers a shelf on a connection of its own once the page has forgotten the database's", async () => {
    const spec = specOf()
    const shelf = versionedShelfOf(spec)
    _cheat_forgetShelf(`${spec.dbName}:device-v001-001-001`)
    const fresh = versionedShelfOf(spec)
    const connectionOf = async (made: UseStore): Promise<IDBDatabase> => await inOneStep(made, 'readonly', (store) => store.transaction.db)
    expect(await connectionOf(fresh)).to.not.eq(await connectionOf(shelf))
    await inOneStep(shelf, 'readwrite', (store) => { store.put({ wrapped: 'one' }, 'key') })
    expect(await inOneStep(fresh, 'readonly', (store) => rowAt(store, 'key'))).to.deep.equal({ wrapped: 'one' })
  })

  it("answers a shelf of its own for each dbName, stem and version", () => {
    const spec = specOf()
    const shelf = versionedShelfOf(spec)
    for (const other of [specOf(), { ...spec, dbstem: 'vaults' }, { ...spec, version: '001-001-002' }]) {
      expect(versionedShelfOf(other)).to.not.eq(shelf)
    }
  })

  it("lists the browser's databases for its wipe once for each database, however many stores use it", async () => {
    const spec = specOf()
    const databases = vi.spyOn(indexedDB, 'databases')
    try {
      for (let ii = 0; ii < 3; ii++) { await inOneStep(versionedShelfOf(spec), 'readonly', (store) => rowAt(store, 'key')) }
      expect(databases).toHaveBeenCalledTimes(1)
    } finally {
      databases.mockRestore()
    }
  })

  const RefusedCases = [
    ['an empty dbName',             { dbName: "" }],
    ['an empty dbstem',             { dbstem: "" }],
    ['an empty storename',          { storename: "" }],
    ['a version of one part',       { version: "1" }],
    ['a version not padded',        { version: "1-1-1" }],
    ['a version of four parts',     { version: "001-001-001-001" }],
    ['an empty old name',           { oldnames: [""] }],
    ['old names that are no list',  { oldnames: "device_db" }],
  ] as const

  it.each(RefusedCases)("refuses %s", (_what, over) => {
    expect(() => versionedShelfOf(specOf(over as unknown as Partial<VersionedShelfSpec>))).to.throw(VaultError).with.property('refusalkind', 'bad_option')
  })

  it("refuses a spec that is no bag, and a field it does not take", () => {
    expect(() => versionedShelfOf(null as never)).to.throw(VaultError)
    expect(() => versionedShelfOf({ ...specOf(), extra: 1 } as never)).to.throw(VaultError)
  })
})
