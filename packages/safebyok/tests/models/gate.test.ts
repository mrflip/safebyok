import { describe, expect, it, vi } from 'vitest'
import { Gate } from '../../src/models/gate'
import type { GateProps, StrengthChecker } from '../../src/models/models-shapes'
import * as TH from '../test-helpers'
import { _cheat_vaultKeyBytesOf, cleartextsOf, gateWorldOf, isZeroed, passkeyAnswerOf, TestPassphrase, useFakeClock, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

/** The PRF bytes are copied before the build zeroes them, for the backdoor. */
const builtGate = async ({ passkey = false } = {}) => {
  const answer = passkey ? passkeyAnswerOf() : undefined
  const prfBytes = answer && new Uint8Array(answer.prfBytes)
  const { gate } = await Gate.build(WorldStamp, cleartextsOf(TestPassphrase, answer), gateWorldOf())
  return { gate, answer, prfBytes }
}

describe("Gate.build(stamp, cleartexts, world)", () => {
  it("builds a gate of a passphrase wayin alone of a passphrase alone", async () => {
    const { gate } = await builtGate()
    expect(gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(gate.passkey_wayin).to.be.null
  })

  it("builds a gate of a passphrase and a passkey wayin of a passphrase and a passkey answer, zeroing its PRF bytes (G2)", async () => {
    const { gate, answer } = await builtGate({ passkey: true })
    expect(gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(gate.passkey_wayin?.wayinkind).to.eq('passkey')
    expect(gate.passkey_wayin?.credential_id).to.eq(answer!.credential_id)
    expect(isZeroed(answer!.prfBytes)).to.be.true
  })

  it("shows its passkey wayin's header as passkeyHeader, frozen and holding no key, and null when it has no passkey", async () => {
    const { gate, answer } = await builtGate({ passkey: true })
    expect(gate.passkeyHeader).to.deep.equal({ wayinkind: 'passkey', credential_id: answer!.credential_id, prf_salt_b64: answer!.prf_salt_b64, device_id: gate.passkey_wayin?.device_id, registered_at: gate.passkey_wayin?.registered_at })
    expect(Object.isFrozen(gate.passkeyHeader)).to.be.true
    const { gate: bare } = await builtGate()
    expect(bare.passkeyHeader).to.be.null
  })

  it("wraps one new vaultKey in both wayins", async () => {
    const { gate, prfBytes } = await builtGate({ passkey: true })
    const viaPassphrase = await _cheat_vaultKeyBytesOf(WorldStamp, gate.ppWayin, { passphrase: TestPassphrase })
    const viaPasskey = await _cheat_vaultKeyBytesOf(WorldStamp, gate.pkWayin!, { prfBytes: prfBytes! })
    expect(viaPasskey).to.deep.equal(viaPassphrase)
  })

  it("wraps a different vaultKey for each gate built", async () => {
    const one = await builtGate()
    const two = await builtGate()
    const vaultKeyBytesOne = await _cheat_vaultKeyBytesOf(WorldStamp, one.gate.ppWayin, { passphrase: TestPassphrase })
    const vaultKeyBytesTwo = await _cheat_vaultKeyBytesOf(WorldStamp, two.gate.ppWayin, { passphrase: TestPassphrase })
    expect(vaultKeyBytesOne).to.not.deep.equal(vaultKeyBytesTwo)
  })

  it("refuses a world its check refuses as 'bad_option', before the keyDeriver is asked, spending the passkey answer all the same (G2)", async () => {
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const answer = passkeyAnswerOf()
    const world = TH.omitting(gateWorldOf({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes } }), 'device_id')
    await TH.expectRefusal(Gate.build(WorldStamp, cleartextsOf(TestPassphrase, answer), world), 'bad_option')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(isZeroed(answer.prfBytes)).to.be.true
  })

  it("hands the passphrase to the world's strengthChecker for the vault's scope, and refuses a weak one as 'weak_passphrase' before the keyDeriver is asked, leaving the passkey answer unspent (G2)", async () => {
    const strengthChecker = vi.fn<StrengthChecker>(() => ({ strong: false, reason: 'Add another word or two.' }))
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const answer = passkeyAnswerOf()
    const world = gateWorldOf({ strengthChecker, keyDeriver: { ...TH.testDeriver, deriveKeyBytes } })
    const err = await TH.expectRefusal(Gate.build(WorldStamp, cleartextsOf(TestPassphrase, answer), world), 'weak_passphrase')
    expect(err.message).to.eq('Add another word or two.')
    expect(strengthChecker).toHaveBeenCalledWith(TestPassphrase, { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  it("builds with the passkey answer a weak passphrase left unspent, handed in again beside a stronger one, and spends it then (G2)", async () => {
    const answer = passkeyAnswerOf()
    const weak = gateWorldOf({ strengthChecker: () => ({ strong: false, reason: 'Add another word or two.' }) })
    await TH.expectRefusal(Gate.build(WorldStamp, cleartextsOf(TestPassphrase, answer), weak), 'weak_passphrase')
    const { gate } = await Gate.build(WorldStamp, cleartextsOf(TestPassphrase, answer), gateWorldOf())
    expect(gate.passkey_wayin?.credential_id).to.eq(answer.credential_id)
    expect(isZeroed(answer.prfBytes)).to.be.true
  })

  it("refuses cleartexts handed as a function, as a proof closure once was, as 'bad_option'", async () => {
    await TH.expectRefusal(Gate.build(WorldStamp, (() => ({ passphrase: TestPassphrase })) as never, gateWorldOf()), 'bad_option')
  })
})

describe("new Gate(stamp, props): the props check", () => {
  it("makes the same gate again from a gate's pickle", async () => {
    const { gate } = await builtGate({ passkey: true })
    const again = new Gate(WorldStamp, gate.pickle())
    expect(again.pickle()).to.deep.equal(gate.pickle())
    expect(again.toJSON()).to.deep.equal(gate.toJSON())
  })

  const PropsCases = [
    [(props: GateProps) => ({ ...props, passkey_wayin: undefined }),              'no passkey_wayin, where a gate with no passkey says null'],
    [(props: GateProps) => ({ passphrase_wayin: props.passkey_wayin, passkey_wayin: props.passphrase_wayin }), "its two wayins in each other's slot"],
    [(props: GateProps) => ({ ...props, passkey_wayin: props.passphrase_wayin }), 'a passphrase wayin in the passkey slot'],
    [(props: GateProps) => ({ ...props, passphrase_wayin: null }),                'no passphrase wayin'],
    [() => null,                                                                  'null'],
  ] as const

  for (const [propsOf, blurb] of PropsCases) {
    it(`refuses props with ${blurb} as 'bad_record'`, async () => {
      const { gate } = await builtGate({ passkey: true })
      TH.expectSyncRefusal(() => new Gate(WorldStamp, propsOf(gate.pickle())), 'bad_record')
    })
  }

  it("refuses a stamp with no vault_tok as 'bad_option'", async () => {
    const { gate } = await builtGate()
    TH.expectSyncRefusal(() => new Gate(TH.omitting(WorldStamp, 'vault_tok'), gate.pickle()), 'bad_option')
  })

  it("quotes none of refused props in its refusal: no ciphertext", async () => {
    const { gate } = await builtGate({ passkey: true })
    const { passphrase_wayin, passkey_wayin } = gate.pickle()
    const err = TH.expectSyncRefusal(() => new Gate(WorldStamp, { passphrase_wayin: passkey_wayin, passkey_wayin: passphrase_wayin }), 'bad_record')
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

  it("Object.keys shows the two wayin records alone: no Wayin, no stamp", async () => {
    const { gate } = await builtGate({ passkey: true })
    expect(Object.keys(gate)).to.have.members(['passphrase_wayin', 'passkey_wayin'])
  })

  it("is frozen, its wayin records read-only", async () => {
    const { gate } = await builtGate()
    expect(Object.isFrozen(gate)).to.be.true
    expect(() => { (gate as { passkey_wayin: unknown }).passkey_wayin = gate.passphrase_wayin }).to.throw(TypeError)
  })

  it("holds the stamp it was handed, as parsed, hidden", async () => {
    const { gate } = await builtGate()
    expect(gate.stamp).to.deep.equal(WorldStamp)
  })
})
