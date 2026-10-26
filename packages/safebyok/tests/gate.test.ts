import { describe, expect, it } from 'vitest'
import { Gate } from '../src/gate'
import { PassphraseProving, StandingGating } from '../src/proving'
import { GatedVaultProps } from '../src/types/types'
import * as TH from './test-helpers'
import { makeWorld, storedVaultPropsOf } from './vault/world'

/** A world holding `u1`'s vault, gated with `pw`, and its stored props. */
const gatedWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  return { world, vault, props: GatedVaultProps.parse(storedVaultPropsOf(world)) }
}

describe("Gate.make", () => {
  it("builds a novel vault's first gate at epoch 1 on no base, as its first example shows", async () => {
    const vault = await makeWorld().open()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw', { gating: StandingGating })
    const gate = Gate.make(vault, { base: null, ...await proving.sealWayins() })
    expect(gate).to.include({ gate_epoch: 1, base_epoch: 0, vault_tok: vault.vault_tok })
    expect(gate.passkey).to.be.null
  })

  it("builds one epoch past its base, keeping the wayins it is handed, as its second example shows", async () => {
    const { vault, props } = await gatedWorld()
    const base = Gate.of(vault, props)
    const next = Gate.make(vault, { base, passphrase: base.passphrase, passkey: null })
    expect(next).to.include({ gate_epoch: props.gate_epoch + 1, base_epoch: props.gate_epoch })
    expect(next.passphrase).to.eq(base.passphrase)
  })

  it("refuses wayins of another vault_tok as bad_option", async () => {
    const { vault, props } = await gatedWorld()
    const base = Gate.of(vault, props)
    const stranger = Gate.of(vault, { ...props, vault_tok: 'other-tok' })
    TH.expectSyncRefusal(() => Gate.make(vault, { base, passphrase: stranger.passphrase, passkey: null }), 'bad_option')
  })

  it("is frozen", async () => {
    const { vault, props } = await gatedWorld()
    expect(Object.isFrozen(Gate.of(vault, props))).to.be.true
  })
})

describe("Gate.of", () => {
  it("is the gate stored vault props hold, its base one epoch below, as its example shows", async () => {
    const { vault, props } = await gatedWorld()
    const gate = Gate.of(vault, props)
    expect(gate.gate_epoch).to.eq(props.gate_epoch)
    expect(gate.base_epoch).to.eq(props.gate_epoch - 1)
    expect(gate.storedFields).to.deep.eq({ gate_epoch: props.gate_epoch, passphrase: props.passphrase, passkey: props.passkey })
  })
})

describe("the demand on a gate", () => {
  it("passes a gate built on the gate in hand, and the gate in hand itself, and refuses gate_moved for one built on another", async () => {
    const { vault, props } = await gatedWorld()
    const base = Gate.of(vault, props)
    vault.demandConsistentWith(base)
    vault.demandConsistentWith(Gate.make(vault, { base, passphrase: base.passphrase, passkey: null }))
    const another = Gate.of(vault, { ...props, gate_epoch: props.gate_epoch + 5 })
    TH.expectSyncRefusal(() => { vault.demandConsistentWith(Gate.make(vault, { base: another, passphrase: base.passphrase, passkey: null })) }, 'gate_moved')
  })
})
