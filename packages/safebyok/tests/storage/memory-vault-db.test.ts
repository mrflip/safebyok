/** MemoryVaultDB: the battery every VaultDB runs, and the opts of its own. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
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
  it("refuses opts that lack a hook it needs, before it registers a case", () => {
    expect(() => { TH.describeVaultDBBattery("none", { _cheat_rowsOf: memoryRowsOf } as never) }).to.throw(VaultError)
    expect(() => { TH.describeVaultDBBattery("none", { makeVaultDB: () => new MemoryVaultDB() } as never) }).to.throw(VaultError)
  })
})

describe("MemoryVaultDB's constructor", () => {
  it("refuses a maxBoxes or maxRecordBytes it cannot use", () => {
    for (const opts of [{ maxBoxes: NaN }, { maxBoxes: -1 }, { maxRecordBytes: -1 }]) {
      expect(() => new MemoryVaultDB(opts)).to.throw(VaultError)
    }
  })
})
