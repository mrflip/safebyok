/** AX: the answers of a vaultDB as they cross a wire, each absent field arriving as null, parse back to the answers its verbs return. */

import { describe, expect, it } from 'vitest'
import * as AX from '../../src/shapes/shapes-answers'
import * as SX from '../../src/shapes/shapes-storage'
import { VaultError } from '../../src/refusals/errors'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { Answer } from '../../src/storage/vault-db-new'
import { bankScope, boxAt, boxscope, boxTombstoneOf, stale, vaultAt, vaultQuery, vaultScope, vaultTombstoneOf } from '../test-helpers/storage-world'

// == [A wire]: crossed

// As a server sends an answer: its refusal as kind, message and the meta that may cross, and every absent field as null.
const crossed = (answer: Answer<unknown, string, unknown>): unknown => {
  const err = answer.ok ? null : {
    refusalkind: answer.err.refusalkind,
    message:     answer.err.message,
    meta:        { capacity: answer.err.meta?.capacity, fieldnames: answer.err.meta?.fieldnames, call: answer.err.meta?.call },
  }
  const sent = { ...answer, val: answer.ok ? answer.val : null, err }
  return JSON.parse(JSON.stringify(sent, (_ckey, field: unknown) => field ?? null)) as unknown
}

/** A store holding the vault and one box, at revision 0. */
const storeWithBox = async (): Promise<MemoryVaultDB> => {
  const vaultDB = new MemoryVaultDB()
  await vaultDB.putVault(vaultAt(), { prior: SX.VoidRevision })
  await vaultDB.putBox(boxAt(), { prior: SX.VoidRevision })
  return vaultDB
}
// --

describe("AX's answer checks", () => {
  it("parse each good answer that crossed back to the answer its verb returned", async () => {
    const vaultDB = await storeWithBox()
    const answers = [
      [AX.listVaultsAnswer, await vaultDB.tryListVaults(bankScope)],
      [AX.getVaultAnswer,   await vaultDB.tryGetVault(vaultScope)],
      [AX.listBoxesAnswer,  await vaultDB.tryListBoxes(vaultQuery)],
      [AX.getBoxAnswer,     await vaultDB.tryGetBox({ ...boxscope, vault_tok: 'life1' })],
      [AX.putBoxAnswer,     await vaultDB.tryPutBox(boxAt(1), { prior: SX.revisionOf(boxAt()) })],
      [AX.delBoxAnswer,     await vaultDB.tryDelBox(boxTombstoneOf(boxAt(1)), { prior: SX.revisionOf(boxAt(1)) })],
      [AX.putVaultAnswer,   await vaultDB.tryPutVault(vaultAt(0, 'life2', { vaultlabel: 'second' }), { prior: SX.VoidRevision })],
      [AX.delVaultAnswer,   await vaultDB.tryDelVault(vaultTombstoneOf(vaultAt()), { prior: SX.revisionOf(vaultAt()) })],
      [AX.tidyGoneAnswer,   await vaultDB.tryTidyGone(bankScope)],
    ] as const
    for (const [check, answer] of answers) {
      expect(answer.ok, answer.ok ? "" : `${answer.act}: ${answer.err.message}`).to.be.true
      expect(check.parse(crossed(answer))).to.deep.equal({ dbhas: null, ...answer })
    }
  })

  it("parses a refusal that crossed to a VaultError of its kind", async () => {
    const vaultDB = await storeWithBox()
    const answer = await vaultDB.tryPutVault(vaultAt(1), { prior: stale })
    expect(answer.ok).to.be.false
    const parsed = AX.putVaultAnswer.parse(crossed(answer))
    expect(parsed.ok).to.be.false
    if (parsed.ok || answer.ok) { return }
    expect(parsed.err).to.be.instanceOf(VaultError)
    expect(parsed.err.refusalkind).to.equal(answer.err.refusalkind)
    expect(parsed.err.message).to.equal(answer.err.message)
    expect(parsed.err.meta).to.deep.include({ act: answer.act, world: answer.world, req_params: answer.req_params })
    expect(parsed.err.cause).to.be.undefined
  })

  it("take a damaged row only under damaged_rows", async () => {
    const vaultDB = await storeWithBox()
    const listed = crossed(await vaultDB.tryListVaults(bankScope)) as { val: { vaults: unknown[], damaged_rows: unknown[] } }
    const damaged = SX.damagedVaultOf({ ...vaultScope, vaultlabel: 'other' }, { vault_tok: 'life1' })
    expect(() => AX.listVaultsAnswer.parse({ ...listed, val: { ...listed.val, damaged_rows: [damaged] } })).not.to.throw()
    expect(() => AX.listVaultsAnswer.parse({ ...listed, val: { ...listed.val, vaults: [...listed.val.vaults, damaged] } })).to.throw(VaultError)
  })

  it("takes a damaged row under the label it is stored under", async () => {
    const vaultDB = await storeWithBox()
    const listed = crossed(await vaultDB.tryListVaults(bankScope)) as { val: { vaults: unknown[], damaged_rows: unknown[] } }
    const misnamed = SX.damagedVaultOf({ ...vaultScope, vaultlabel: 'Not A Label' }, { vault_tok: 'life1' })
    const parsed = AX.listVaultsAnswer.parse({ ...listed, val: { ...listed.val, damaged_rows: [misnamed] } })
    expect(parsed.ok && parsed.val.damaged_rows).to.deep.eq([misnamed])
  })

  it("refuses an answer out of step with its verb's checker", async () => {
    const vaultDB = await storeWithBox()
    const got = crossed(await vaultDB.tryGetVault(vaultScope)) as Record<string, unknown>
    for (const bad of [{ ...got, surplus: 1 }, { ...got, act: 'born' }, { ...got, world: null }]) {
      expect(() => AX.getVaultAnswer.parse(bad)).to.throw(VaultError).with.property('refusalkind', 'unexpected_error')
    }
  })
})
