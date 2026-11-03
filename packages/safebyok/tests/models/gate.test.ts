import { describe, expect, it, vi } from 'vitest'
import { PasskeySaltBytes } from '../../src/consts'
import { randomBytes, toB64 } from '../../src/crypto'
import { Gate } from '../../src/models/gate'
import { type GateProps, FirstGateEpoch } from '../../src/models/models-shapes'
import { NOVEL, PasskeyProving, PassphraseProving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { _cheat_vaultKeyBytesOf, isZeroed, passkeyAnswerOf, proofClosureOf, provingWorldOf, TestPassphrase, useFakeClock, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

const findsWeak = () => ({ strong: false as const, reason: 'too short' })

/** The PRF bytes a closure's answer carries, or one zero byte where it carries none: zeroed either way once the gate is built or refused. */
const prfBytesOf = (handed: unknown): Uint8Array => (
  (handed as { passkeyAnswer?: { prfBytes?: Uint8Array } } | null)?.passkeyAnswer?.prfBytes ?? new Uint8Array(1)
)

/** The PRF bytes are copied before the build zeroes them, for the backdoor. */
const builtGate = async ({ passkey = false } = {}) => {
  const answer = passkey ? passkeyAnswerOf() : undefined
  const prfBytes = answer && new Uint8Array(answer.prfBytes)
  const { gate } = await Gate.build(WorldStamp, proofClosureOf(TestPassphrase, answer), provingWorldOf())
  return { gate, answer, prfBytes }
}

describe("Gate.build(stamp, proofClosure, world)", () => {
  it("builds a gate of the first epoch, of a passphrase wayin alone when the closure hands back a passphrase alone", async () => {
    const { gate } = await builtGate()
    expect(gate.gate_epoch).to.eq(FirstGateEpoch)
    expect(gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(gate.passkey_wayin).to.be.null
  })

  it("builds a passphrase wayin alone when the closure hands back passkeyAnswer null", async () => {
    const { gate } = await Gate.build(WorldStamp, () => ({ passphrase: TestPassphrase, passkeyAnswer: null }), provingWorldOf())
    expect(gate.passkey_wayin).to.be.null
  })

  it("answers the passphrase proving beside the gate, holding its wayin", async () => {
    const { gate, proving } = await Gate.build(WorldStamp, proofClosureOf(), provingWorldOf())
    expect(proving).to.be.instanceOf(PassphraseProving)
    expect(proving.header).to.deep.equal(gate.ppWayin.toJSON())
    await TH.expectRefusal(proving.buildWayin(NOVEL), 'unexpected_error')
  })

  it("awaits a closure that answers a promise", async () => {
    const { gate } = await Gate.build(WorldStamp, () => Promise.resolve({ passphrase: TestPassphrase }), provingWorldOf())
    expect(gate.passphrase_wayin.wayinkind).to.eq('passphrase')
  })

  it("builds a gate of a passphrase and a passkey wayin when the closure hands back a passkey answer, zeroing its PRF bytes (G2)", async () => {
    const { gate, answer } = await builtGate({ passkey: true })
    expect(gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(gate.passkey_wayin?.wayinkind).to.eq('passkey')
    expect(gate.passkey_wayin?.credential_id).to.eq(answer!.credential_id)
    expect(isZeroed(answer!.prfBytes)).to.be.true
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

  it("refuses a world its check refuses as 'bad_option', without invoking the closure", async () => {
    const proofClosure = vi.fn(proofClosureOf())
    const world = TH.omitting(provingWorldOf(), 'device_id')
    await TH.expectRefusal(Gate.build(WorldStamp, proofClosure, world), 'bad_option')
    expect(proofClosure).not.toHaveBeenCalled()
  })

  it("refuses a throwing closure as 'unexpected_error', quoting none of what it threw and keeping no cause", async () => {
    const err = await TH.expectRefusal(Gate.build(WorldStamp, () => { throw new Error(TestPassphrase) }, provingWorldOf()), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })

  it("refuses a closure that is no function as 'bad_option'", async () => {
    await TH.expectRefusal(Gate.build(WorldStamp, { passphrase: TestPassphrase } as never, provingWorldOf()), 'bad_option')
  })

  const AnswerCases = [
    [() => ({ passphrase: 42 }),                                                                                                         'a passphrase that is no string'],
    [() => ({}),                                                                                                                         'no passphrase'],
    [() => null,                                                                                                                         'null'],
    [() => ({ passphrase: TestPassphrase, passcode: '1234' }),                                                                           'a field no closure hands back'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prfBytes: new Uint8Array(32) }) }),                           'a spent passkey answer, its PRF bytes all zero (G2)'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prfBytes: randomBytes(31) }) }),                              'PRF bytes one short'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prf_salt_b64: toB64(randomBytes(PasskeySaltBytes - 1)) }) }), 'a passkey salt one byte short'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: TH.omitting(passkeyAnswerOf(), 'credential_id') }),                             'a passkey answer with no credential_id'],
  ] as const

  for (const [answerOf, blurb] of AnswerCases) {
    it(`refuses ${blurb} as 'bad_option', zeroing any PRF bytes it carries`, async () => {
      const handed = answerOf()
      const err = await TH.expectRefusal(Gate.build(WorldStamp, () => handed as never, provingWorldOf()), 'bad_option')
      expect(isZeroed(prfBytesOf(handed))).to.be.true
      expect(TH.thrownText(err)).to.not.include(TestPassphrase)
    })
  }

  it("zeroes the PRF bytes even when the passphrase's keyDeriver throws after the answer passed its check (G2)", async () => {
    const answer = passkeyAnswerOf()
    const keyDeriver = { key_deriver_label: 'test_scripted_v0', salt_bytes: 16, deriveKeyBytes: () => { throw new Error('out of memory') } }
    await TH.expectRefusal(Gate.build(WorldStamp, proofClosureOf(TestPassphrase, answer), provingWorldOf({ keyDeriver })), 'unexpected_error')
    expect(isZeroed(answer.prfBytes)).to.be.true
  })

  it("refuses a passphrase the world finds weak as 'weak_passphrase', zeroing the PRF bytes all the same (G2)", async () => {
    const answer = passkeyAnswerOf()
    await TH.expectRefusal(Gate.build(WorldStamp, proofClosureOf(TestPassphrase, answer), provingWorldOf({ strengthChecker: findsWeak })), 'weak_passphrase')
    expect(isZeroed(answer.prfBytes)).to.be.true
  })
})

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
