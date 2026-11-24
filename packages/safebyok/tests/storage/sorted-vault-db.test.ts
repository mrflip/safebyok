import { noop } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { SortedVaultDB } from '../../src/storage/sorted-vault-db'
import type { VaultDB } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** The store in memory each SortedVaultDB the battery makes stands over. */
const InnerOf = new WeakMap<SortedVaultDB, MemoryVaultDB>()

TH.describeVaultDBBattery('SortedVaultDB over a MemoryVaultDB', {
  makeVaultDB: () => {
    const inner = new MemoryVaultDB()
    const vaultDB = SortedVaultDB.make({ vaultDB: inner })
    InnerOf.set(vaultDB, inner)
    return vaultDB
  },
  _cheat_rowsOf: (vaultDB) => {
    const inner = InnerOf.get(vaultDB)!
    return {
      plant:  (scope, raw) => { inner._cheat_things(scope).set(scope.labelpath, structuredClone(raw)) },
      remove: (scope) => { inner._cheat_things(scope).delete(scope.labelpath) },
    }
  },
})

/** A vaultDB whose every verb answers a value of its own name, and whose watch answers `stop`. */
function stubVaultDBOf(stop: () => void) {
  return {
    tryGetThing:   vi.fn<VaultDB['tryGetThing']>(() => Promise.resolve('got' as never)),
    tryWriteThing: vi.fn<VaultDB['tryWriteThing']>(() => Promise.resolve('wrote' as never)),
    tryListThings: vi.fn<VaultDB['tryListThings']>(() => Promise.resolve('listed' as never)),
    tryBirthBank:  vi.fn<VaultDB['tryBirthBank']>(() => Promise.resolve('born' as never)),
    watch:         vi.fn<VaultDB['watch']>(() => stop),
  } satisfies VaultDB
}

describe("SortedVaultDB, what only a wrapper can show", () => {
  it("hands each verb's ask to the vaultDB it wraps, and answers that vaultDB's own answer", async () => {
    const inner = stubVaultDBOf(() => undefined)
    const vaultDB = SortedVaultDB.make({ vaultDB: inner })
    const asks = { get: TH.getGateAskOf(), write: TH.birthAskOf(), list: TH.listAskAt('box'), birth: TH.birthBankAskOf() }
    expect(await vaultDB.tryGetThing(asks.get)).to.equal('got')
    expect(await vaultDB.tryWriteThing(asks.write)).to.equal('wrote')
    expect(await vaultDB.tryListThings(asks.list)).to.equal('listed')
    expect(await vaultDB.tryBirthBank(asks.birth)).to.equal('born')
    expect(inner.tryGetThing.mock.calls[0]![0]).to.equal(asks.get)
    expect(inner.tryWriteThing.mock.calls[0]![0]).to.equal(asks.write)
    expect(inner.tryListThings.mock.calls[0]![0]).to.equal(asks.list)
    expect(inner.tryBirthBank.mock.calls[0]![0]).to.equal(asks.birth)
  })

  it("watches through the vaultDB it wraps, with the caller's own handlers, and answers its stop", () => {
    const stop = vi.fn()
    const inner = stubVaultDBOf(stop)
    const vaultDB = SortedVaultDB.make({ vaultDB: inner })
    const onNotice = vi.fn()
    const onBadNews = vi.fn()
    expect(vaultDB.watch(TH.ThingBank, onNotice, onBadNews)).to.equal(stop)
    expect(inner.watch.mock.calls).to.deep.equal([[TH.ThingBank, onNotice, onBadNews]])
  })

  it("asks nothing and watches nothing when made", () => {
    const inner = stubVaultDBOf(() => undefined)
    SortedVaultDB.make({ vaultDB: inner })
    expect(Object.values(inner).every((verb) => verb.mock.calls.length === 0)).to.equal(true)
  })

  const BadOpts = [
    [undefined,                          'no options'],
    [{},                                 'no vaultDB'],
    [{ vaultDB: { tryGetThing: noop } }, 'a vaultDB missing a verb'],
  ] as const

  for (const [opts, blurb] of BadOpts) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => SortedVaultDB.make(opts as never), 'bad_record')
    })
  }
})
