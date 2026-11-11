/** MemoryVaultDB: the battery every VaultDB runs, and the opts of its own. */

import { describe, expect, it, vi } from 'vitest'
import { DefaultMaxBoxes, DefaultMaxRecordBytes } from '../../src/helpers/consts'
import { VaultError } from '../../src/refusals/errors'
import { VoidRevision } from '../../src/shapes/shapes-storage'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as TH from '../test-helpers'

/** The calls a MemoryVaultDB makes of its storage, any of which the next may be. */
const StorageCalls = ['doListVaults', 'doGetVault', 'doListBoxes', 'doGetBox', 'doPutVault', 'doPutBox', 'doDelVault', 'doDelBox', 'doTidyGone'] as const

const memoryRowsOf = (vaultDB: MemoryVaultDB): TH.VaultDBRowCheats => ({
  plantVaultRow: (scope, row) => { vaultDB._cheat_vaultRowsOf(scope).set(scope.vaultlabel, row) },
  plantBoxRow:   (scope, vault_tok, row) => { vaultDB._cheat_boxRowsOf(scope, vault_tok).set(scope.boxlabel, row) },
  vaultRowOf:    (scope) => vaultDB._cheat_vaultRowsOf(scope).get(scope.vaultlabel) ?? null,
  boxRowsOf:     (scope, vault_tok) => new Map(vaultDB._cheat_boxRowsOf(scope, vault_tok)),
})

// Memory has no storage to fail, so the next call to it throws as a dropped connection would.
const failNextCall = (vaultDB: MemoryVaultDB): void => {
  type StorageCall = typeof StorageCalls[number]
  const spies = StorageCalls.map((call) => vi.spyOn(vaultDB as unknown as Record<StorageCall, () => unknown>, call))
  const fail = (): never => {
    for (const spy of spies) { spy.mockRestore() }
    throw new Error('socket closed')
  }
  for (const spy of spies) { spy.mockImplementationOnce(fail) }
}

TH.describeVaultDBBattery("MemoryVaultDB", {
  makeVaultDB:         (opts) => new MemoryVaultDB(opts),
  makeCappedVaultDB:   (maxBoxes) => new MemoryVaultDB({ maxBoxes }),
  _cheat_rowsOf:       memoryRowsOf,
  _cheat_failNextCall: failNextCall,
})

describe("describeVaultDBBattery", () => {
  it("refuses opts that lack a hook it needs", () => {
    expect(() => { TH.describeVaultDBBattery("none", { _cheat_rowsOf: memoryRowsOf } as never) }).to.throw(VaultError)
    expect(() => { TH.describeVaultDBBattery("none", { makeVaultDB: () => new MemoryVaultDB() } as never) }).to.throw(VaultError)
  })
})

const putVaultIn = async (vaultDB: MemoryVaultDB): Promise<void> => { await vaultDB.putVault(TH.vaultAt(), { prior: VoidRevision }) }

/** A box record over the default bytes, by its sidecar alone. */
const oversizedBox = () => TH.boxAt(0, 'life1', { sidecar: { memo: 'x'.repeat(DefaultMaxRecordBytes) } })

describe("a VaultDB's default caps", () => {
  it("accepts a vault's hundredth box and refuses the next", async () => {
    const vaultDB = new MemoryVaultDB()
    await putVaultIn(vaultDB)
    for (let nn = 0; nn < DefaultMaxBoxes; nn += 1) { await vaultDB.putBox(TH.boxAt(0, 'life1', { boxlabel: `box_${String(nn)}` }), { prior: VoidRevision }) }
    const refusal = await TH.expectRefusal(vaultDB.putBox(TH.boxAt(0, 'life1', { boxlabel: 'one_too_many' }), { prior: VoidRevision }), 'vault_full')
    expect(refusal.meta?.capacity?.boxes).to.deep.equal({ used: DefaultMaxBoxes, max: 100 })
  })

  it("refuses a box record over the default byte cap", async () => {
    expect(DefaultMaxRecordBytes).to.be.lessThan(8000 * 0.95)
    const vaultDB = new MemoryVaultDB()
    await putVaultIn(vaultDB)
    await TH.expectRefusal(vaultDB.putBox(oversizedBox(), { prior: VoidRevision }), 'box_too_large')
  })

  it("lets a host raise the cap on a record's bytes", async () => {
    const vaultDB = new MemoryVaultDB({ maxRecordBytes: 20_000 })
    await putVaultIn(vaultDB)
    await TH.expectGood(vaultDB.tryPutBox(oversizedBox(), { prior: VoidRevision }))
  })
})

describe("MemoryVaultDB's constructor", () => {
  it("refuses a maxBoxes or maxRecordBytes it cannot use", () => {
    for (const opts of [{ maxBoxes: NaN }, { maxBoxes: -1 }, { maxRecordBytes: -1 }]) {
      expect(() => new MemoryVaultDB(opts)).to.throw(VaultError)
    }
  })
})
