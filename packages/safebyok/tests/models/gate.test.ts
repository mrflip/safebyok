import { describe, expect, it } from 'vitest'
import { Gate } from '../../src/models/gate'
import { type GateProps, FirstGateEpoch } from '../../src/shapes/shapes-gateish'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { builtGateOf, passkeyAnswerOf, provingWorldOf, TestPassphrase, useFakeClock, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

const builtGate = ({ passkey = false } = {}) => builtGateOf(passkey ? passkeyAnswerOf() : undefined)

describe("Gate.make(stamp, passphraseWayin, passkeyWayin)", () => {
  it("is of the first epoch, holding the wayins handed", async () => {
    const proving = await PassphraseProving.buildNovel(WorldStamp, TestPassphrase, provingWorldOf())
    const wayin = await proving.buildWayin(NOVEL)
    const gate = Gate.make(WorldStamp, wayin, null)
    expect(gate.gate_epoch).to.eq(FirstGateEpoch)
    expect(gate.passphrase_wayin).to.deep.equal(wayin.pickle())
    expect(gate.passkey_wayin).to.be.null
  })

  it("refuses a pickle where it wants a Wayin as 'bad_option'", async () => {
    const { gate } = await builtGate()
    TH.expectSyncRefusal(() => Gate.make(WorldStamp, gate.passphrase_wayin as never, null), 'bad_option')
  })
})

describe("gate.demandPasskeyAddable()", () => {
  it("passes a gate with no passkey and refuses one that holds one as 'bad_option'", async () => {
    const { gate } = await builtGate()
    expect(() => { gate.demandPasskeyAddable() }).to.not.throw()
    const { gate: both } = await builtGate({ passkey: true })
    TH.expectSyncRefusal(() => { both.demandPasskeyAddable() }, 'bad_option')
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
    [(props: GateProps) => ({ ...props, gate_epoch: 0 }),                         'gate_epoch 0'],
    [(props: GateProps) => ({ ...props, gate_epoch: undefined }),                 'no gate_epoch'],
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
    const err = TH.expectSyncRefusal(() => new Gate(WorldStamp, { gate_epoch: FirstGateEpoch, passphrase_wayin: passkey_wayin, passkey_wayin: passphrase_wayin }), 'bad_record')
    expect(TH.thrownText(err)).to.not.include(passphrase_wayin.vault_key_wayin_wrapped.ciphertext_b64)
  })
})

describe("gate.pickle() and gate.toJSON()", () => {
  it("pickle() is its epoch and the two wayin records, frozen", async () => {
    const { gate } = await builtGate({ passkey: true })
    const pickle = gate.pickle()
    expect(Object.keys(pickle)).to.have.members(['gate_epoch', 'passphrase_wayin', 'passkey_wayin'])
    expect(pickle.passphrase_wayin).to.deep.equal(gate.ppWayin.pickle())
    expect(pickle.passkey_wayin).to.deep.equal(gate.pkWayin!.pickle())
    expect(Object.isFrozen(pickle)).to.be.true
    expect(Object.isFrozen(pickle.passphrase_wayin)).to.be.true
  })

  it("toJSON() is its epoch and the two wayins' headers, with no wrapped vaultKey", async () => {
    const { gate } = await builtGate({ passkey: true })
    expect(TH.jsonOf(gate)).to.deep.equal({ gate_epoch: FirstGateEpoch, passphrase_wayin: gate.ppWayin.toJSON(), passkey_wayin: gate.pkWayin!.toJSON() })
    expect(JSON.stringify(gate)).to.not.include('ciphertext_b64')
  })

  it("toJSON() shows passkey_wayin null for a gate with no passkey", async () => {
    const { gate } = await builtGate()
    expect(gate.toJSON().passkey_wayin).to.be.null
  })

  it("Object.keys shows its epoch and the two wayin records alone: no Wayin, no stamp", async () => {
    const { gate } = await builtGate({ passkey: true })
    expect(Object.keys(gate)).to.have.members(['gate_epoch', 'passphrase_wayin', 'passkey_wayin'])
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
