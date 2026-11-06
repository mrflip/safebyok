import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { get, promisifyRequest, set } from 'idb-keyval'
import { inOneTransaction, settle, shelfOf } from '../src/shelf'
import * as TH from './test-helpers'

describe("shelfOf", () => {
  it("answers one shelf per database, kept in '<dbName>:vault_db'", async () => {
    const dbName = TH.freshDbName()
    expect(shelfOf(dbName)).to.eq(shelfOf(dbName))
    await set('ckey', 'row', shelfOf(dbName))
    const databases = await indexedDB.databases()
    expect(databases.map((database) => database.name)).to.include(`${dbName}:vault_db`)
  })
})

describe("settle", () => {
  it("resolves with a request's result", async () => {
    const shelf = shelfOf(TH.freshDbName())
    await set('ckey', 'row', shelf)
    expect(await shelf('readonly', (store) => settle<unknown>(store.get('ckey')))).to.eq('row')
  })

  it("rejects with the browser's own error when it gave one", async () => {
    const shelf = shelfOf(TH.freshDbName())
    await set('ckey', 'row', shelf)
    const refused = shelf('readwrite', (store) => settle(store.add('again', 'ckey')))
    await expect(refused).rejects.toMatchObject({ name: 'ConstraintError' })
  })

  it("rejects a transaction with the error of its request that failed, not the transaction's null", async () => {
    const shelf = shelfOf(TH.freshDbName())
    await set('ckey', 'row', shelf)
    const refused = inOneTransaction(shelf, (store) => {
      store.add('again', 'ckey')
      return Promise.resolve(true)
    })
    await expect(refused).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await get('ckey', shelf)).to.eq('row')
  })

  // The base class makes a null cause an Error that says so (Refusals' never-null rule).
  it("rejects with the browser's null, as it came, when the browser gave no error", async () => {
    const request = Object.assign(new EventTarget(), { error: null }) as unknown as IDBRequest
    const settled = settle(request)
    request.onerror?.(new Event('error'))
    let rejection: unknown = 'not rejected'
    try {
      await settled
    } catch (err) {
      rejection = err
    }
    expect(rejection).to.be.null
  })
})

describe("inOneTransaction", () => {
  it("resolves with what its work resolves with, once its writes have committed", async () => {
    const shelf = shelfOf(TH.freshDbName())
    const outcome = await inOneTransaction(shelf, async (store) => {
      const stored: unknown = await promisifyRequest<unknown>(store.get('ckey'))
      store.put('written', 'ckey')
      return stored ?? 'nothing'
    })
    expect(outcome).to.eq('nothing')
    expect(await get('ckey', shelf)).to.eq('written')
  })

  it("keeps none of its writes when its work fails after asking for them", async () => {
    const shelf = shelfOf(TH.freshDbName())
    await set('ckey', 'before', shelf)
    const failing = inOneTransaction(shelf, async (store) => {
      store.put('after', 'ckey')
      await promisifyRequest(store.get('ckey'))
      throw new Error('the work failed')
    })
    await expect(failing).rejects.toThrow('the work failed')
    expect(await get('ckey', shelf)).to.eq('before')
  })

  it("rejects, keeping nothing, when a request in it fails", async () => {
    const shelf = shelfOf(TH.freshDbName())
    const failing = inOneTransaction(shelf, async (store) => {
      store.put('one', 'first')
      await promisifyRequest(store.add('two', 'first'))
      return 'never'
    })
    await expect(failing).rejects.toThrow()
    expect(await get('first', shelf)).to.be.undefined
  })

  it("runs two transactions over one shelf one after the other, never interleaved", async () => {
    const shelf = shelfOf(TH.freshDbName())
    await set('count', 0, shelf)
    const increment = () => inOneTransaction(shelf, async (store) => {
      const count = await promisifyRequest(store.get('count')) as number
      store.put(count + 1, 'count')
    })
    await Promise.all([increment(), increment(), increment()])
    expect(await get('count', shelf)).to.eq(3)
  })
})
