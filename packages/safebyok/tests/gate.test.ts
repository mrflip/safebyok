import { describe, expect, it } from 'vitest'
import { Gate } from '../src/gate'
import { PassphraseProving, OutsideGating } from '../src/proving'
import { type GatedVaultRecord, VaultRecord } from '../src/shapes/vault'
import * as TH from './test-helpers'
import { makeWorld, storedVaultRecordOf } from './vault/world'

/** A world holding `u1`'s vault, gated with `pw`, and its stored vault record. */
const gatedWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  return { world, vault, vaultRecord: VaultRecord.parse(storedVaultRecordOf(world)) as GatedVaultRecord }
}

describe("Gate.make", () => {
  it("builds a novel vault's first gate at epoch 1 on no base, as its first example shows", async () => {
    const vault = await makeWorld().open()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw', { gating: OutsideGating })
    const gate = Gate.make(vault, { base: null, ...await proving.sealWayins() })
    expect(gate).to.include({ gate_epoch: 1, base_epoch: 0, vault_tok: vault.vault_tok })
    expect(gate.passkey).to.be.null
  })

  it("builds one epoch past its base, keeping the wayins it is handed, as its second example shows", async () => {
    const { vault, vaultRecord } = await gatedWorld()
    const base = Gate.of(vaultRecord, { keyDeriver: TH.testDeriver })
    const next = Gate.make(vault, { base, passphrase: base.passphrase, passkey: null })
    expect(next).to.include({ gate_epoch: vaultRecord.gate_epoch + 1, base_epoch: vaultRecord.gate_epoch })
    expect(next.passphrase).to.eq(base.passphrase)
  })

  it("refuses wayins of another vault_tok as bad_option", async () => {
    const { vault, vaultRecord } = await gatedWorld()
    const base = Gate.of(vaultRecord, { keyDeriver: TH.testDeriver })
    const stranger = Gate.of({ ...vaultRecord, vault_tok: 'other-tok' }, { keyDeriver: TH.testDeriver })
    TH.expectSyncRefusal(() => Gate.make(vault, { base, passphrase: stranger.passphrase, passkey: null }), 'bad_option')
  })

  it("is frozen", async () => {
    const { vaultRecord } = await gatedWorld()
    expect(Object.isFrozen(Gate.of(vaultRecord, { keyDeriver: TH.testDeriver }))).to.be.true
  })
})

describe("Gate.of", () => {
  it("is the gate a stored vault record holds, of its scope and vault_tok, its base one epoch below, as its example shows", async () => {
    const { vaultRecord } = await gatedWorld()
    const gate = Gate.of(vaultRecord, { keyDeriver: TH.testDeriver })
    expect(gate).to.include({ ...TH.scopeOf('u1'), vault_tok: vaultRecord.vault_tok })
    expect(gate.gate_epoch).to.eq(vaultRecord.gate_epoch)
    expect(gate.base_epoch).to.eq(vaultRecord.gate_epoch - 1)
    expect(gate.record).to.deep.eq(vaultRecord.gate)
  })
})

describe("the demand on a gate", () => {
  it("passes a gate built on the gate in hand, and the gate in hand itself, and refuses gate_moved for one built on another", async () => {
    const { vault, vaultRecord } = await gatedWorld()
    const base = Gate.of(vaultRecord, { keyDeriver: TH.testDeriver })
    vault.demandConsistentWith(base)
    vault.demandConsistentWith(Gate.make(vault, { base, passphrase: base.passphrase, passkey: null }))
    const another = Gate.of({ ...vaultRecord, gate_epoch: vaultRecord.gate_epoch + 5 }, { keyDeriver: TH.testDeriver })
    TH.expectSyncRefusal(() => { vault.demandConsistentWith(Gate.make(vault, { base: another, passphrase: base.passphrase, passkey: null })) }, 'gate_moved')
  })
})
