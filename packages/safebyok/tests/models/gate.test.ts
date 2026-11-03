import { describe, expect, it, vi } from 'vitest'
import { randomBytes } from '../../src/crypto'
import { Gate } from '../../src/models/gate'
import { type GateProps, FirstGateEpoch } from '../../src/models/models-shapes'
import { NOVEL, PasskeyProving, PassphraseProving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { builtGateOf, isZeroed, passkeyAnswerOf, proofClosureOf, provingWorldOf, TestPassphrase, useFakeClock, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

/** The PRF bytes are copied, for the backdoor. */
const builtGate = async ({ passkey = false } = {}) => {
  const answer = passkey ? passkeyAnswerOf() : undefined
  const prfBytes = answer && new Uint8Array(answer.prfBytes)
  const { gate } = await builtGateOf(answer)
  return { gate, answer, prfBytes }
}

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

describe("gate.attemptProof(proofClosure, world)", () => {
  it("answers the passphrase's proving where the closure hands a passphrase", async () => {
    const { gate } = await builtGate({ passkey: true })
    const proving = await gate.attemptProof(() => ({ passphrase: TestPassphrase }), provingWorldOf())
    expect(proving).to.be.instanceOf(PassphraseProving)
    expect(proving.gate_epoch).to.eq(gate.gate_epoch)
  })

  it("answers the passkey's proving where the closure hands an answer alone, and spends it (G2)", async () => {
    const { gate, answer, prfBytes } = await builtGate({ passkey: true })
    const handed = { ...answer!, prfBytes: new Uint8Array(prfBytes!) }
    const proving = await gate.attemptProof(() => ({ passkeyAnswer: handed }), provingWorldOf())
    expect(proving).to.be.instanceOf(PasskeyProving)
    expect(isZeroed(handed.prfBytes)).to.be.true
  })

  it("spends the answer of a refused attempt too (G2)", async () => {
    const { gate, answer } = await builtGate({ passkey: true })
    const handed = { ...answer!, prfBytes: randomBytes(32) }
    await TH.expectRefusal(gate.attemptProof(() => ({ passkeyAnswer: handed }), provingWorldOf()), 'wrong_passkey')
    expect(isZeroed(handed.prfBytes)).to.be.true
  })

  const AttemptRefusalCases = [
    [() => ({ passphrase: `${TestPassphrase}, misremembered` }), 'wrong_passphrase', 'a passphrase that does not open it'],
    [() => ({ passkeyAnswer: passkeyAnswerOf() }),               'absent_wayin',     'an answer where the gate holds no passkey'],
    [() => ({}),                                                 'bad_option',       'neither a passphrase nor an answer'],
    [() => { throw new Error(TestPassphrase) },                  'unexpected_error', 'a closure that throws, its message replaced'],
  ] as const

  for (const [proofClosure, refusalkind, blurb] of AttemptRefusalCases) {
    it(`refuses ${blurb} as '${refusalkind}'`, async () => {
      const { gate } = await builtGate()
      const err = await TH.expectRefusal(gate.attemptProof(proofClosure, provingWorldOf()), refusalkind)
      expect(TH.thrownText(err)).to.not.include(TestPassphrase)
    })
  }

  it("refuses a world its check refuses as 'bad_option', without invoking the closure", async () => {
    const { gate } = await builtGate()
    const proofClosure = vi.fn(proofClosureOf())
    await TH.expectRefusal(gate.attemptProof(proofClosure, {} as never), 'bad_option')
    expect(proofClosure).not.toHaveBeenCalled()
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

describe("the next gate's props", () => {
  it("each with* bumps gate_epoch by one", async () => {
    const proofClosure = proofClosureOf()
    const world = provingWorldOf()
    const { gate } = await builtGate()
    const replaced = await gate.withPassphraseReplaced(proofClosure, () => ({ passphrase: `${TestPassphrase} again` }), world)
    expect(replaced.gate.gate_epoch).to.eq(FirstGateEpoch + 1)
    const added = await gate.withPasskeyAdded(proofClosure, () => ({ passkeyAnswer: passkeyAnswerOf() }), world)
    expect(added.gate.gate_epoch).to.eq(FirstGateEpoch + 1)
    const { gate: both } = await builtGate({ passkey: true })
    const revoked = await both.withPasskeyRevoked(proofClosure, world)
    expect(revoked.gate.gate_epoch).to.eq(FirstGateEpoch + 1)
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
