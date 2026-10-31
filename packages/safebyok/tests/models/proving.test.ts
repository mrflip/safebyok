import { describe, expect, it, type Mock, vi } from 'vitest'
import { PasskeySaltBytes } from '../../src/consts'
import { fromB64, randomBytes, toB64 } from '../../src/crypto'
import type { KeyDeriver } from '../../src/key-deriver'
import { type ProofClosure, type ProvingWorld } from '../../src/models/models-shapes'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from '../../src/models/proving'
import { Wayin } from '../../src/models/wayin'
import * as TH from '../test-helpers'
import { _cheat_vaultKeyBytesOf, asVault, DeviceId, duckVaultOf, fakeDBFriendOf, isZeroed, passkeyAnswerOf, proofClosureOf, provingWorldOf, sealStampsOf, T0, TestPassphrase, useFakeClock, WeekMillis, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()


const provingPairOf = async (proofClosure: ProofClosure = proofClosureOf(), world: ProvingWorld = provingWorldOf()) => (
  Proving.makeProvingPair(asVault(duckVaultOf()), proofClosure, world)
)

/** A key deriver scripted to hand back anything at all, to try what a proving makes of it. */
const deriverHanding = (handBack: () => unknown): KeyDeriver => ({
  key_deriver_label: 'test_scripted_v0',
  salt_bytes:        16,
  deriveKeyBytes:    () => Promise.resolve(handBack() as Uint8Array),
})

const passphraseProvingWith = (keyDeriver: KeyDeriver): Promise<PassphraseProving> => (
  PassphraseProving.make(asVault(duckVaultOf()), provingWorldOf({ keyDeriver }), TestPassphrase)
)

/** The PRF bytes a closure's answer carries, or one zero byte where it carries none: zeroed either way once the proving pair is made or refused. */
const prfBytesOf = (handed: unknown): Uint8Array => (
  (handed as { passkeyAnswer?: { prfBytes?: Uint8Array } } | null)?.passkeyAnswer?.prfBytes ?? new Uint8Array(1)
)

describe("Proving.makeProvingPair(vault, proofClosure, world): the arguments", () => {
  const ArgsCases = [
    [{ world: TH.omitting(provingWorldOf(), 'keyDeriver') },      'a world with no keyDeriver'],
    [{ world: TH.omitting(provingWorldOf(), 'clock') },           'a world with no clock'],
    [{ world: TH.omitting(provingWorldOf(), 'device_id') },       'a world with no device_id'],
    [{ world: provingWorldOf({ device_id: '' }) },                'a world with an empty device_id'],
    [{ vault: { ...duckVaultOf(), vault_tok: undefined } },       'a vault with no vault_tok'],
    [{ vault: { ...duckVaultOf(), registered_at: 'yesterday' } }, 'a vault registered at a time that is no epoch millis'],
    [{ vault: null },                                             'no vault at all'],
  ] as const

  for (const [args, blurb] of ArgsCases) {
    it(`refuses ${blurb} as 'bad_option', before invoking the closure`, async () => {
      const proofClosure = vi.fn(proofClosureOf())
      const { vault = duckVaultOf(), world = provingWorldOf() } = args as Record<string, unknown>
      await TH.expectRefusal(Proving.makeProvingPair(vault as never, proofClosure, world as ProvingWorld), 'bad_option')
      expect(proofClosure).not.toHaveBeenCalled()
    })
  }

  it("refuses a proofClosure that is no function as 'bad_option'", async () => {
    await TH.expectRefusal(provingPairOf({ passphrase: TestPassphrase } as never), 'bad_option')
  })
})

describe("Proving.makeProvingPair: what the closure hands back", () => {
  it("makes a passphrase proving alone when the closure hands back a passphrase alone", async () => {
    const { passphraseProving, passkeyProving } = await provingPairOf()
    expect(passphraseProving).to.be.instanceOf(PassphraseProving)
    expect(passkeyProving).to.be.null
  })

  it("makes a passphrase proving alone when the closure hands back passkeyAnswer null", async () => {
    const { passkeyProving } = await provingPairOf(() => ({ passphrase: TestPassphrase, passkeyAnswer: null }))
    expect(passkeyProving).to.be.null
  })

  it("makes a passkey proving beside it when the closure hands back a passkey answer, and zeroes that answer's PRF bytes (G2)", async () => {
    const answer = passkeyAnswerOf()
    const { passphraseProving, passkeyProving } = await provingPairOf(proofClosureOf(TestPassphrase, answer))
    expect(passphraseProving).to.be.instanceOf(PassphraseProving)
    expect(passkeyProving).to.be.instanceOf(PasskeyProving)
    expect(isZeroed(answer.prfBytes)).to.be.true
  })

  it("awaits a closure that answers a promise", async () => {
    const { passphraseProving } = await provingPairOf(() => Promise.resolve({ passphrase: TestPassphrase }))
    expect(passphraseProving).to.be.instanceOf(PassphraseProving)
  })

  it("replaces what a throwing closure threw with 'unexpected_error', quoting none of it and keeping no cause", async () => {
    const err = await TH.expectRefusal(provingPairOf(() => { throw new Error(`no good: ${TestPassphrase}`) }), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })

  const AnswerCases = [
    [() => ({ passphrase: 42 }),                                                                  'a passphrase that is no string'],
    [() => ({}),                                                                                  'no passphrase'],
    [() => null,                                                                                  'null'],
    [() => ({ passphrase: TestPassphrase, passcode: '1234' }),                                    'a field no closure hands back'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prfBytes: new Uint8Array(32) }) }),                     'a spent passkey answer, its PRF bytes all zero (G2)'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prfBytes: randomBytes(31) }) }),                        'PRF bytes one short'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prf_salt_b64: toB64(randomBytes(PasskeySaltBytes - 1)) }) }), 'a passkey salt one byte short'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: TH.omitting(passkeyAnswerOf(), 'credential_id') }),                      'a passkey answer with no credential_id'],
  ] as const

  for (const [answerOf, blurb] of AnswerCases) {
    it(`refuses ${blurb} as 'bad_option', zeroing any PRF bytes it carries`, async () => {
      const handed = answerOf()
      const err = await TH.expectRefusal(provingPairOf(() => handed as never), 'bad_option')
      expect(isZeroed(prfBytesOf(handed))).to.be.true
      expect(TH.thrownText(err)).to.not.include(TestPassphrase)
    })
  }

  it("zeroes the PRF bytes even when the passphrase's keyDeriver throws after the answer passed its check (G2)", async () => {
    const answer = passkeyAnswerOf()
    const world = provingWorldOf({ keyDeriver: deriverHanding(() => { throw new Error('out of memory') }) })
    await TH.expectRefusal(provingPairOf(proofClosureOf(TestPassphrase, answer), world), 'unexpected_error')
    expect(isZeroed(answer.prfBytes)).to.be.true
  })
})

describe("PassphraseProving.make(vault, world, passphrase): the keyDeriver", () => {
  it("hands the keyDeriver the passphrase and a fresh salt of its salt_bytes, the salt the header carries", async () => {
    const deriveKeyBytes: Mock<KeyDeriver['deriveKeyBytes']> = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const keyDeriver = { ...TH.testDeriver, deriveKeyBytes }
    const proving = await passphraseProvingWith(keyDeriver)
    expect(deriveKeyBytes).toHaveBeenCalledTimes(1)
    const [passphrase, saltBytes] = deriveKeyBytes.mock.calls[0]!
    expect(passphrase).to.eq(TestPassphrase)
    expect(saltBytes).to.deep.equal(fromB64(proving.header.salt_b64))
    expect(saltBytes.length).to.eq(TH.testDeriver.salt_bytes)
  })

  it("zeroes the key bytes the keyDeriver handed back, once imported", async () => {
    const handed = randomBytes(32)
    await passphraseProvingWith(deriverHanding(() => handed))
    expect(isZeroed(handed)).to.be.true
  })

  it("replaces what a throwing keyDeriver threw with 'unexpected_error', quoting none of it and keeping no cause", async () => {
    const err = await TH.expectRefusal(passphraseProvingWith(deriverHanding(() => { throw new Error(`cannot derive ${TestPassphrase}`) })), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })

  const HandedCases = [
    [() => randomBytes(31),                                        'key bytes one short'],
    [() => randomBytes(33),                                        'key bytes one long'],
    [() => new Uint8Array(32),                                     'key bytes all zero'],
    [() => new Uint8Array(new SharedArrayBuffer(32)).fill(7),      'key bytes in shared memory'],
    [() => randomBytes(32).buffer,                                 'an ArrayBuffer, not a view of one'],
    [() => toB64(randomBytes(32)),                                 'key bytes written as text'],
    [() => undefined,                                              'nothing'],
  ] as const

  for (const [handBack, blurb] of HandedCases) {
    it(`refuses ${blurb} as 'bad_option'`, async () => {
      await TH.expectRefusal(passphraseProvingWith(deriverHanding(handBack)), 'bad_option')
    })
  }

  it("zeroes key bytes of the wrong length it refuses", async () => {
    const short = randomBytes(31)
    const long = randomBytes(33)
    await TH.expectRefusal(passphraseProvingWith(deriverHanding(() => short)), 'bad_option')
    await TH.expectRefusal(passphraseProvingWith(deriverHanding(() => long)), 'bad_option')
    expect(isZeroed(short) && isZeroed(long)).to.be.true
  })

  it("takes key bytes handed back as a view into a larger buffer, zeroing that view alone", async () => {
    const buffer = new Uint8Array(48).fill(9)
    buffer.set(randomBytes(32), 8)
    await passphraseProvingWith(deriverHanding(() => buffer.subarray(8, 40)))
    expect(isZeroed(buffer.subarray(8, 40))).to.be.true
    expect([...buffer.subarray(0, 8), ...buffer.subarray(40)].every((byte) => byte === 9)).to.be.true
  })
})

describe("a proving's header", () => {
  it("of a passphrase proving: the deriver's label, a fresh salt, the world's device_id, and registered_at from the world's clock", async () => {
    const proving = await PassphraseProving.make(asVault(duckVaultOf()), provingWorldOf({ clock: { now: () => T0 + 5 } }), TestPassphrase)
    expect(proving.header).to.deep.include({ wayinkind: 'passphrase', key_deriver_label: 'test_digest_v0', device_id: DeviceId, registered_at: T0 + 5 })
    expect(Object.keys(proving.header)).to.have.members(['wayinkind', 'key_deriver_label', 'salt_b64', 'device_id', 'registered_at'])
    expect(fromB64(proving.header.salt_b64).length).to.eq(TH.testDeriver.salt_bytes)
    expect(Object.isFrozen(proving.header)).to.be.true
  })

  it("of a passkey proving: the answer's credential_id and salt, the world's device_id, and registered_at", async () => {
    const answer = passkeyAnswerOf()
    const { credential_id, prf_salt_b64 } = answer
    const proving = await PasskeyProving.make(asVault(duckVaultOf()), provingWorldOf(), answer)
    expect(proving.header).to.deep.equal({ wayinkind: 'passkey', credential_id, prf_salt_b64, device_id: DeviceId, registered_at: T0 })
  })

  it("draws a fresh salt for each passphrase proving", async () => {
    const { passphraseProving: one } = await provingPairOf()
    const { passphraseProving: two } = await provingPairOf()
    expect(one.header.salt_b64).to.not.eq(two.header.salt_b64)
  })
})

describe("proving.makeWayin(source)", () => {
  it("from NOVEL wraps a new vaultKey under the proving's key: a wayin of its header that opens with the passphrase", async () => {
    const vault = duckVaultOf()
    const { passphraseProving } = await Proving.makeProvingPair(asVault(vault), proofClosureOf(), provingWorldOf())
    const wayin = await passphraseProving.makeWayin(NOVEL)
    expect(wayin).to.be.instanceOf(Wayin)
    expect(wayin.toJSON()).to.deep.equal(passphraseProving.header)
    const vaultKeyBytes = await _cheat_vaultKeyBytesOf(vault, wayin, { passphrase: TestPassphrase })
    expect(vaultKeyBytes.length).to.eq(32)
  })

  it("from NOVEL makes a wayin that another passphrase does not open", async () => {
    const vault = duckVaultOf()
    const { passphraseProving } = await Proving.makeProvingPair(asVault(vault), proofClosureOf(), provingWorldOf())
    const wayin = await passphraseProving.makeWayin(NOVEL)
    await expect(_cheat_vaultKeyBytesOf(vault, wayin, { passphrase: `${TestPassphrase}, misremembered` })).rejects.toThrow()
  })

  it("from another proving wraps that proving's vaultKey: the passphrase and passkey wayins open to the same vaultKey", async () => {
    const vault = duckVaultOf()
    const answer = passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const { passphraseProving, passkeyProving } = await Proving.makeProvingPair(asVault(vault), proofClosureOf(TestPassphrase, answer), provingWorldOf())
    const passphraseWayin = await passphraseProving.makeWayin(NOVEL)
    const passkeyWayin = await passkeyProving!.makeWayin(passphraseProving)
    expect(passkeyWayin.toJSON()).to.deep.equal(passkeyProving!.header)
    const viaPassphrase = await _cheat_vaultKeyBytesOf(vault, passphraseWayin, { passphrase: TestPassphrase })
    const viaPasskey = await _cheat_vaultKeyBytesOf(vault, passkeyWayin, { prfBytes })
    expect(viaPasskey).to.deep.equal(viaPassphrase)
  })

  it("mints a different vaultKey for each NOVEL wayin of different provings", async () => {
    const vault = duckVaultOf()
    const { passphraseProving: one } = await Proving.makeProvingPair(asVault(vault), proofClosureOf(), provingWorldOf())
    const { passphraseProving: two } = await Proving.makeProvingPair(asVault(vault), proofClosureOf(), provingWorldOf())
    const vaultKeyBytesOne = await _cheat_vaultKeyBytesOf(vault, await one.makeWayin(NOVEL), { passphrase: TestPassphrase })
    const vaultKeyBytesTwo = await _cheat_vaultKeyBytesOf(vault, await two.makeWayin(NOVEL), { passphrase: TestPassphrase })
    expect(vaultKeyBytesOne).to.not.deep.equal(vaultKeyBytesTwo)
  })

  it("binds the wayin to its vault: under another vault's stamp it will not open", async () => {
    const vault = duckVaultOf()
    const { passphraseProving } = await Proving.makeProvingPair(asVault(vault), proofClosureOf(), provingWorldOf())
    const wayin = await passphraseProving.makeWayin(NOVEL)
    await expect(_cheat_vaultKeyBytesOf({ ...WorldStamp, vault_tok: 'vault-tok-other' }, wayin, { passphrase: TestPassphrase })).rejects.toThrow()
  })

  const SourceCases = [
    ['NOVEL',                     'the string NOVEL'],
    [Symbol('NOVEL'),             'another symbol named NOVEL'],
    [null,                        'null'],
    [{ wayinkind: 'passphrase' }, 'a plain object shaped like a proving'],
  ] as const

  for (const [source, blurb] of SourceCases) {
    it(`refuses ${blurb} as 'bad_option'`, async () => {
      const { passphraseProving } = await provingPairOf()
      await TH.expectRefusal(passphraseProving.makeWayin(source as never), 'bad_option')
    })
  }

  it("refuses, as 'unexpected_error', a proving that has made no wayin yet as its source", async () => {
    const answer = passkeyAnswerOf()
    const { passphraseProving, passkeyProving } = await provingPairOf(proofClosureOf(TestPassphrase, answer))
    await TH.expectRefusal(passkeyProving!.makeWayin(passphraseProving), 'unexpected_error')
  })
})

describe("proving.makeLease(dbfriend, opts)", () => {
  it("refuses, as 'unexpected_error', before the proving has made a wayin, and keeps nothing", async () => {
    const { passphraseProving } = await provingPairOf()
    const friend = fakeDBFriendOf()
    await TH.expectRefusal(passphraseProving.makeLease(friend, { leaseMillis: WeekMillis }), 'unexpected_error')
    expect(friend.tryPutLease).not.toHaveBeenCalled()
  })

  it("grants and keeps a lease of the proving's vault, in force for leaseMillis", async () => {
    const { passphraseProving } = await provingPairOf()
    await passphraseProving.makeWayin(NOVEL)
    const friend = fakeDBFriendOf()
    const lease = await passphraseProving.makeLease(friend, { leaseMillis: WeekMillis })
    expect(lease.toJSON()).to.deep.include({ ...WorldStamp, autolock_at: T0 + WeekMillis })
    expect(lease.isInForce).to.be.true
    expect(friend.tryPutLease).toHaveBeenCalledTimes(1)
  })

  it("grants leases over one vaultKey from both provings once both made wayins: what one seals, the other opens", async () => {
    const { passphraseProving, passkeyProving } = await provingPairOf(proofClosureOf(TestPassphrase, passkeyAnswerOf()))
    await passphraseProving.makeWayin(NOVEL)
    await passkeyProving!.makeWayin(passphraseProving)
    const viaPassphrase = await passphraseProving.makeLease(fakeDBFriendOf(), { leaseMillis: WeekMillis })
    const viaPasskey = await passkeyProving!.makeLease(fakeDBFriendOf(), { leaseMillis: WeekMillis })
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await viaPassphrase.sealWith(new TextEncoder().encode('{"val":"sk-test-5678"}'), boxKeyStamp, whisperStamp)
    expect(new TextDecoder().decode(await viaPasskey.unsealWith(sealed, boxKeyStamp, whisperStamp))).to.eq('{"val":"sk-test-5678"}')
  })

  it("refuses opts its check refuses as 'bad_option'", async () => {
    const { passphraseProving } = await provingPairOf()
    await passphraseProving.makeWayin(NOVEL)
    await TH.expectRefusal(passphraseProving.makeLease(fakeDBFriendOf(), { leaseMillis: 0 }), 'bad_option')
  })
})

describe("what a proving shows", () => {
  it("Object.keys shows its wayinkind and header alone: no key, no wayin, no vault", async () => {
    const { passphraseProving, passkeyProving } = await provingPairOf(proofClosureOf(TestPassphrase, passkeyAnswerOf()))
    await passphraseProving.makeWayin(NOVEL)
    expect(Object.keys(passphraseProving)).to.deep.equal(['wayinkind', 'header'])
    expect(Object.keys(passkeyProving!)).to.deep.equal(['wayinkind', 'header'])
  })

  it("JSON.stringify gives its wayinkind alone", async () => {
    const { passphraseProving, passkeyProving } = await provingPairOf(proofClosureOf(TestPassphrase, passkeyAnswerOf()))
    expect(JSON.stringify(passphraseProving)).to.eq('{"wayinkind":"passphrase"}')
    expect(JSON.stringify(passkeyProving)).to.eq('{"wayinkind":"passkey"}')
  })

  it("is frozen", async () => {
    const { passphraseProving } = await provingPairOf()
    expect(Object.isFrozen(passphraseProving)).to.be.true
    expect(() => { (passphraseProving as { wayinkind: string }).wayinkind = 'passkey' }).to.throw(TypeError)
  })
})
