import { describe, expect, it, vi } from 'vitest'
import { Gate } from '../../src/models/gate'
import type { GateProps } from '../../src/models/models-shapes'
import * as TH from '../test-helpers'
import { _cheat_vaultKeyBytesOf, asVault, duckVaultOf, passkeyAnswerOf, proofClosureOf, provingWorldOf, TestPassphrase, useFakeClock, WorldStamp, isZeroed } from '../test-helpers/proving-world'

useFakeClock()


/** The PRF bytes are copied before the build zeroes them, for the backdoor. */
const builtGate = async ({ passkey = false } = {}) => {
  const vault = duckVaultOf()
  const answer = passkey ? passkeyAnswerOf() : undefined
  const prfBytes = answer && new Uint8Array(answer.prfBytes)
  const gate = await Gate.build(asVault(vault), proofClosureOf(TestPassphrase, answer), provingWorldOf())
  return { vault, gate, answer, prfBytes }
}

describe("Gate.build(vault, proofClosure, world)", () => {
  it("builds a gate of a passphrase wayin alone when the closure hands back a passphrase alone", async () => {
    const { gate } = await builtGate()
    expect(gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(gate.passkey_wayin).to.be.null
  })

  it("builds a gate of a passphrase and a passkey wayin when the closure hands back a passkey answer, zeroing its PRF bytes (G2)", async () => {
    const { gate, answer } = await builtGate({ passkey: true })
    expect(gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(gate.passkey_wayin?.wayinkind).to.eq('passkey')
    expect(gate.passkey_wayin?.credential_id).to.eq(answer!.credential_id)
    expect(isZeroed(answer!.prfBytes)).to.be.true
  })

  it("wraps one new vaultKey in both wayins", async () => {
    const { vault, gate, prfBytes } = await builtGate({ passkey: true })
    const viaPassphrase = await _cheat_vaultKeyBytesOf(vault, gate.ppWayin, { passphrase: TestPassphrase })
    const viaPasskey = await _cheat_vaultKeyBytesOf(vault, gate.pkWayin!, { prfBytes: prfBytes! })
    expect(viaPasskey).to.deep.equal(viaPassphrase)
  })

  it("wraps a different vaultKey for each gate built", async () => {
    const one = await builtGate()
    const two = await builtGate()
    const vaultKeyBytesOne = await _cheat_vaultKeyBytesOf(one.vault, one.gate.ppWayin, { passphrase: TestPassphrase })
    const vaultKeyBytesTwo = await _cheat_vaultKeyBytesOf(two.vault, two.gate.ppWayin, { passphrase: TestPassphrase })
    expect(vaultKeyBytesOne).to.not.deep.equal(vaultKeyBytesTwo)
  })

  it("refuses a world its check refuses as 'bad_option', without invoking the closure", async () => {
    const proofClosure = vi.fn(proofClosureOf())
    const vault = asVault(duckVaultOf())
    const world = TH.omitting(provingWorldOf(), 'device_id')
    await TH.expectRefusal(Gate.build(vault, proofClosure, world), 'bad_option')
    expect(proofClosure).not.toHaveBeenCalled()
  })

  it("refuses a throwing closure as 'unexpected_error', quoting none of what it threw", async () => {
    const vault = asVault(duckVaultOf())
    const err = await TH.expectRefusal(Gate.build(vault, () => { throw new Error(TestPassphrase) }, provingWorldOf()), 'unexpected_error')
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })
})

describe("new Gate(vault, props): the props check", () => {
  it("makes the same gate again from a gate's pickle", async () => {
    const { vault, gate } = await builtGate({ passkey: true })
    const again = new Gate(asVault(vault), gate.pickle())
    expect(again.pickle()).to.deep.equal(gate.pickle())
    expect(again.toJSON()).to.deep.equal(gate.toJSON())
  })

  const PropsCases = [
    [(props: GateProps) => ({ ...props, passkey_wayin: undefined }),                               'no passkey_wayin, where a gate with no passkey says null'],
    [(props: GateProps) => ({ passphrase_wayin: props.passkey_wayin, passkey_wayin: props.passphrase_wayin }), "its two wayins in each other's slot"],
    [(props: GateProps) => ({ ...props, passkey_wayin: props.passphrase_wayin }),                 'a passphrase wayin in the passkey slot'],
    [(props: GateProps) => ({ ...props, passphrase_wayin: null }),                                'no passphrase wayin'],
    [() => null,                                                                                                 'null'],
  ] as const

  for (const [propsOf, blurb] of PropsCases) {
    it(`refuses props with ${blurb} as 'bad_record'`, async () => {
      const { vault, gate } = await builtGate({ passkey: true })
      TH.expectSyncRefusal(() => new Gate(asVault(vault), propsOf(gate.pickle())), 'bad_record')
    })
  }

  it("refuses a vault with no stamp as 'bad_option'", async () => {
    const { gate } = await builtGate()
    TH.expectSyncRefusal(() => new Gate(asVault({ ...duckVaultOf(), vault_tok: undefined } as never), gate.pickle()), 'bad_option')
  })

  it("quotes none of refused props in its refusal: no ciphertext", async () => {
    const { vault, gate } = await builtGate({ passkey: true })
    const { passphrase_wayin, passkey_wayin } = gate.pickle()
    const err = TH.expectSyncRefusal(() => new Gate(asVault(vault), { passphrase_wayin: passkey_wayin, passkey_wayin: passphrase_wayin }), 'bad_record')
    expect(TH.thrownText(err)).to.not.include(passphrase_wayin.vault_key_wayin_wrapped.ciphertext_b64)
  })
})

describe("gate.pickle() and gate.toJSON()", () => {
  it("pickle() is the two wayin records, frozen", async () => {
    const { gate } = await builtGate({ passkey: true })
    const pickle = gate.pickle()
    expect(Object.keys(pickle)).to.have.members(['passphrase_wayin', 'passkey_wayin'])
    expect(pickle.passphrase_wayin).to.deep.equal(gate.ppWayin.pickle())
    expect(pickle.passkey_wayin).to.deep.equal(gate.pkWayin!.pickle())
    expect(Object.isFrozen(pickle)).to.be.true
    expect(Object.isFrozen(pickle.passphrase_wayin)).to.be.true
  })

  it("toJSON() is the two wayins' headers, with no wrapped vaultKey", async () => {
    const { gate } = await builtGate({ passkey: true })
    expect(TH.jsonOf(gate)).to.deep.equal({ passphrase_wayin: gate.ppWayin.toJSON(), passkey_wayin: gate.pkWayin!.toJSON() })
    expect(JSON.stringify(gate)).to.not.include('ciphertext_b64')
  })

  it("toJSON() shows passkey_wayin null for a gate with no passkey", async () => {
    const { gate } = await builtGate()
    expect(gate.toJSON().passkey_wayin).to.be.null
  })

  it("Object.keys shows the two wayin records alone: no Wayin, no vault", async () => {
    const { gate } = await builtGate({ passkey: true })
    expect(Object.keys(gate)).to.have.members(['passphrase_wayin', 'passkey_wayin'])
  })

  it("is frozen, its wayin records read-only", async () => {
    const { gate } = await builtGate()
    expect(Object.isFrozen(gate)).to.be.true
    expect(() => { (gate as { passkey_wayin: unknown }).passkey_wayin = gate.passphrase_wayin }).to.throw(TypeError)
  })

  it("holds the vault it was handed, hidden", async () => {
    const { vault, gate } = await builtGate()
    expect(gate.vault).to.equal(vault)
    expect(gate.vault).to.deep.include(WorldStamp)
  })
})
