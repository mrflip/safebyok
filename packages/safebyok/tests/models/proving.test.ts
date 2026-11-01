import { runInNewContext } from 'node:vm'
import { describe, expect, it, type Mock, vi } from 'vitest'
import { PasskeySaltBytes } from '../../src/consts'
import { fromB64, randomBytes, toB64 } from '../../src/crypto'
import type { KeyDeriver } from '../../src/key-deriver'
import { type Cleartexts, type ProvingWorld, type StrengthChecker } from '../../src/models/models-shapes'
import { NOVEL, PasskeyProving, PassphraseProving, Proving, checkStrength } from '../../src/models/proving'
import { Wayin } from '../../src/models/wayin'
import * as TH from '../test-helpers'
import { _cheat_vaultKeyBytesOf, cleartextsOf, DeviceId, duckVaultOf, fakeDBFriendOf, isZeroed, passkeyAnswerOf, provingWorldOf, sealStampsOf, T0, TestPassphrase, useFakeClock, WeekMillis, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

const makeProvingPair = async (cleartexts: Cleartexts = cleartextsOf(), world: ProvingWorld = provingWorldOf()) => (
  Proving.makeProvingPair(WorldStamp, cleartexts, world)
)

/** A key deriver scripted to hand back anything at all, to try what a proving makes of it. */
const deriverHanding = (handBack: () => unknown): KeyDeriver => ({
  key_deriver_label: 'test_scripted_v0',
  salt_bytes:        16,
  deriveKeyBytes:    () => Promise.resolve(handBack() as Uint8Array),
})

const passphraseProvingWith = (keyDeriver: KeyDeriver): Promise<PassphraseProving> => (
  PassphraseProving.make(WorldStamp, provingWorldOf({ keyDeriver }), TestPassphrase)
)

/** The PRF bytes the cleartexts carry, or one zero byte where they carry none: zeroed either way once the proving pair is made or refused. */
const prfBytesOf = (handed: unknown): Uint8Array => (
  (handed as { passkeyAnswer?: { prfBytes?: Uint8Array } } | null)?.passkeyAnswer?.prfBytes ?? new Uint8Array(1)
)

/** Cleartexts as a function: what a proof closure once was, and no model verb takes now. */
const proofClosure = () => ({ passphrase: TestPassphrase })

describe("Proving.makeProvingPair(stamp, cleartexts, world): the arguments", () => {
  const ArgsCases = [
    [() => ({ world: TH.omitting(provingWorldOf(), 'keyDeriver') }),      'a world with no keyDeriver'],
    [() => ({ world: TH.omitting(provingWorldOf(), 'clock') }),           'a world with no clock'],
    [() => ({ world: TH.omitting(provingWorldOf(), 'device_id') }),       'a world with no device_id'],
    [() => ({ world: provingWorldOf({ device_id: '' }) }),                'a world with an empty device_id'],
    [() => ({ stamp: { ...WorldStamp, vault_tok: undefined } }),          'a stamp with no vault_tok'],
    [() => ({ stamp: { ...WorldStamp, registered_at: 'yesterday' } }),    'a stamp registered at a time that is no epoch millis'],
    [() => ({ stamp: null }),                                             'no stamp at all'],
  ] as const

  for (const [argsOf, blurb] of ArgsCases) {
    it(`refuses ${blurb} as 'bad_option', before the keyDeriver is asked, spending the passkey answer all the same (G2)`, async () => {
      const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
      const answer = passkeyAnswerOf()
      const { stamp = WorldStamp, world = provingWorldOf({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes } }) } = argsOf() as Record<string, unknown>
      await TH.expectRefusal(Proving.makeProvingPair(stamp as never, cleartextsOf(TestPassphrase, answer), world as ProvingWorld), 'bad_option')
      expect(deriveKeyBytes).not.toHaveBeenCalled()
      expect(isZeroed(answer.prfBytes)).to.be.true
    })
  }
})

describe("Proving.makeProvingPair: the cleartexts", () => {
  it("makes a passphrase proving alone of a passphrase alone", async () => {
    const { passphraseProving, passkeyProving } = await makeProvingPair()
    expect(passphraseProving).to.be.instanceOf(PassphraseProving)
    expect(passkeyProving).to.be.null
  })

  it("makes a passphrase proving alone of passkeyAnswer null", async () => {
    const { passkeyProving } = await makeProvingPair({ passphrase: TestPassphrase, passkeyAnswer: null })
    expect(passkeyProving).to.be.null
  })

  it("makes a passkey proving beside it of a passkey answer, and zeroes that answer's PRF bytes (G2)", async () => {
    const answer = passkeyAnswerOf()
    const { passphraseProving, passkeyProving } = await makeProvingPair(cleartextsOf(TestPassphrase, answer))
    expect(passphraseProving).to.be.instanceOf(PassphraseProving)
    expect(passkeyProving).to.be.instanceOf(PasskeyProving)
    expect(isZeroed(answer.prfBytes)).to.be.true
  })

  const CleartextsCases = [
    [() => ({ passphrase: 42 }),                                                                  'a passphrase that is no string'],
    [() => ({}),                                                                                  'no passphrase'],
    [() => null,                                                                                  'null'],
    [() => proofClosure,                                                                          'a function, as a proof closure once was'],
    [() => ({ passphrase: TestPassphrase, passcode: '1234' }),                                    'a field the user hands in no form'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prfBytes: new Uint8Array(32) }) }),                     'a spent passkey answer, its PRF bytes all zero (G2)'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prfBytes: randomBytes(31) }) }),                        'PRF bytes one short'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: passkeyAnswerOf({ prf_salt_b64: toB64(randomBytes(PasskeySaltBytes - 1)) }) }), 'a passkey salt one byte short'],
    [() => ({ passphrase: TestPassphrase, passkeyAnswer: TH.omitting(passkeyAnswerOf(), 'credential_id') }),                      'a passkey answer with no credential_id'],
  ] as const

  for (const [cleartextsOfCase, blurb] of CleartextsCases) {
    it(`refuses ${blurb} as 'bad_option', zeroing any PRF bytes it carries`, async () => {
      const handed = cleartextsOfCase()
      const err = await TH.expectRefusal(makeProvingPair(handed as never), 'bad_option')
      expect(isZeroed(prfBytesOf(handed))).to.be.true
      expect(TH.thrownText(err)).to.not.include(TestPassphrase)
    })
  }

  it("zeroes the PRF bytes even when the passphrase's keyDeriver throws after the answer passed its check (G2)", async () => {
    const answer = passkeyAnswerOf()
    const world = provingWorldOf({ keyDeriver: deriverHanding(() => { throw new Error('out of memory') }) })
    await TH.expectRefusal(makeProvingPair(cleartextsOf(TestPassphrase, answer), world), 'unexpected_error')
    expect(isZeroed(answer.prfBytes)).to.be.true
  })
})

describe("checkStrength(strengthChecker, passphrase, scope)", () => {
  const Scope = Object.freeze({ applabel: WorldStamp.applabel, user_id: WorldStamp.user_id, vaultlabel: WorldStamp.vaultlabel })

  it("hands the checker the passphrase and the scope, and resolves on a strong verdict", async () => {
    const strengthChecker = vi.fn<StrengthChecker>(() => ({ strong: true }))
    await checkStrength(strengthChecker, TestPassphrase, Scope)
    expect(strengthChecker).toHaveBeenCalledWith(TestPassphrase, Scope)
  })

  it("refuses a weak verdict as 'weak_passphrase', its message the checker's reason", async () => {
    const err = await TH.expectRefusal(checkStrength(() => ({ strong: false, reason: 'Add another word or two.' }), TestPassphrase, Scope), 'weak_passphrase')
    expect(err.message).to.eq('Add another word or two.')
  })

  it("refuses an answer that is no verdict as 'bad_option'", async () => {
    await TH.expectRefusal(checkStrength((() => 'strong') as never, TestPassphrase, Scope), 'bad_option')
  })

  it("replaces what a throwing checker threw with 'unexpected_error', quoting none of it and keeping no cause (G8)", async () => {
    const err = await TH.expectRefusal(checkStrength(() => { throw new Error(`too short: ${TestPassphrase}`) }, TestPassphrase, Scope), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })
})

describe("PassphraseProving.make(stamp, world, passphrase): the keyDeriver", () => {
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

  it("refuses a passphrase that is no string, the number 42, as 'bad_option', before the keyDeriver is asked", async () => {
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes }
    await TH.expectRefusal(PassphraseProving.make(WorldStamp, provingWorldOf({ keyDeriver }), 42 as never), 'bad_option')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
  })
})

/** PRF bytes as a passkey answer from an iframe carries them: a Uint8Array of another realm, which fails `instanceof Uint8Array` here but carries its tag. */
const foreignPrfBytes = (): Uint8Array => runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array

describe("Spending a passkey answer made in another realm (G2)", () => {
  it("is a byte view that fails `instanceof Uint8Array`, as the test assumes", () => {
    expect(foreignPrfBytes() instanceof Uint8Array).to.be.false
  })

  it("makes a passkey proving of an answer whose PRF bytes are another realm's, and zeroes them", async () => {
    const answer = passkeyAnswerOf({ prfBytes: foreignPrfBytes() })
    const { passkeyProving } = await makeProvingPair(cleartextsOf(TestPassphrase, answer))
    expect(passkeyProving).to.be.instanceOf(PasskeyProving)
    expect(isZeroed(answer.prfBytes)).to.be.true
  })

  it("zeroes another realm's PRF bytes when the answer is refused for good, as a salt one byte short is", async () => {
    const answer = passkeyAnswerOf({ prfBytes: foreignPrfBytes(), prf_salt_b64: toB64(randomBytes(PasskeySaltBytes - 1)) })
    await TH.expectRefusal(PasskeyProving.make(WorldStamp, provingWorldOf(), answer), 'bad_option')
    expect(isZeroed(answer.prfBytes)).to.be.true
  })
})

describe("PasskeyProving.make(stamp, world, passkeyAnswer), called directly", () => {
  it("refuses a spent answer, its PRF bytes all zero, as 'bad_option' (G2)", async () => {
    const spent = passkeyAnswerOf({ prfBytes: new Uint8Array(32) })
    await TH.expectRefusal(PasskeyProving.make(WorldStamp, provingWorldOf(), spent), 'bad_option')
  })

  it("refuses a world its check refuses as 'bad_option', zeroing the PRF bytes all the same (G2)", async () => {
    const answer = passkeyAnswerOf()
    const world = TH.omitting(provingWorldOf(), 'device_id')
    await TH.expectRefusal(PasskeyProving.make(WorldStamp, world, answer), 'bad_option')
    expect(isZeroed(answer.prfBytes)).to.be.true
  })

  it("refuses a salt one byte short as 'bad_option', as freshPasskeyAnswer's second example shows, zeroing the PRF bytes all the same (G2)", async () => {
    const answer = passkeyAnswerOf({ prf_salt_b64: toB64(randomBytes(PasskeySaltBytes - 1)) })
    await TH.expectRefusal(PasskeyProving.make(WorldStamp, provingWorldOf(), answer), 'bad_option')
    expect(isZeroed(answer.prfBytes)).to.be.true
  })
})

describe("a proving's header", () => {
  it("of a passphrase proving: the deriver's label, a fresh salt, the world's device_id, and registered_at from the world's clock", async () => {
    const proving = await PassphraseProving.make(WorldStamp, provingWorldOf({ clock: { now: () => T0 + 5 } }), TestPassphrase)
    expect(proving.header).to.deep.include({ wayinkind: 'passphrase', key_deriver_label: 'test_digest_v0', device_id: DeviceId, registered_at: T0 + 5 })
    expect(Object.keys(proving.header)).to.have.members(['wayinkind', 'key_deriver_label', 'salt_b64', 'device_id', 'registered_at'])
    expect(fromB64(proving.header.salt_b64).length).to.eq(TH.testDeriver.salt_bytes)
    expect(Object.isFrozen(proving.header)).to.be.true
  })

  it("of a passkey proving: the answer's credential_id and salt, the world's device_id, and registered_at", async () => {
    const answer = passkeyAnswerOf()
    const { credential_id, prf_salt_b64 } = answer
    const proving = await PasskeyProving.make(WorldStamp, provingWorldOf(), answer)
    expect(proving.header).to.deep.equal({ wayinkind: 'passkey', credential_id, prf_salt_b64, device_id: DeviceId, registered_at: T0 })
  })

  it("draws a fresh salt for each passphrase proving", async () => {
    const { passphraseProving: one } = await makeProvingPair()
    const { passphraseProving: two } = await makeProvingPair()
    expect(one.header.salt_b64).to.not.eq(two.header.salt_b64)
  })
})

describe("proving.makeWayin(source)", () => {
  it("from NOVEL wraps a new vaultKey under the proving's key: a wayin of its header that opens with the passphrase", async () => {
    const { passphraseProving } = await Proving.makeProvingPair(WorldStamp, cleartextsOf(), provingWorldOf())
    const wayin = await passphraseProving.makeWayin(NOVEL)
    expect(wayin).to.be.instanceOf(Wayin)
    expect(wayin.toJSON()).to.deep.equal(passphraseProving.header)
    const vaultKeyBytes = await _cheat_vaultKeyBytesOf(WorldStamp, wayin, { passphrase: TestPassphrase })
    expect(vaultKeyBytes.length).to.eq(32)
  })

  it("from NOVEL makes a wayin that another passphrase does not open", async () => {
    const { passphraseProving } = await Proving.makeProvingPair(WorldStamp, cleartextsOf(), provingWorldOf())
    const wayin = await passphraseProving.makeWayin(NOVEL)
    await expect(_cheat_vaultKeyBytesOf(WorldStamp, wayin, { passphrase: `${TestPassphrase}, misremembered` })).rejects.toThrow()
  })

  it("from another proving wraps that proving's vaultKey: the passphrase and passkey wayins open to the same vaultKey", async () => {
    const answer = passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const { passphraseProving, passkeyProving } = await Proving.makeProvingPair(WorldStamp, cleartextsOf(TestPassphrase, answer), provingWorldOf())
    const passphraseWayin = await passphraseProving.makeWayin(NOVEL)
    const passkeyWayin = await passkeyProving!.makeWayin(passphraseProving)
    expect(passkeyWayin.toJSON()).to.deep.equal(passkeyProving!.header)
    const viaPassphrase = await _cheat_vaultKeyBytesOf(WorldStamp, passphraseWayin, { passphrase: TestPassphrase })
    const viaPasskey = await _cheat_vaultKeyBytesOf(WorldStamp, passkeyWayin, { prfBytes })
    expect(viaPasskey).to.deep.equal(viaPassphrase)
  })

  it("mints a different vaultKey for each NOVEL wayin of different provings", async () => {
    const { passphraseProving: one } = await Proving.makeProvingPair(WorldStamp, cleartextsOf(), provingWorldOf())
    const { passphraseProving: two } = await Proving.makeProvingPair(WorldStamp, cleartextsOf(), provingWorldOf())
    const vaultKeyBytesOne = await _cheat_vaultKeyBytesOf(WorldStamp, await one.makeWayin(NOVEL), { passphrase: TestPassphrase })
    const vaultKeyBytesTwo = await _cheat_vaultKeyBytesOf(WorldStamp, await two.makeWayin(NOVEL), { passphrase: TestPassphrase })
    expect(vaultKeyBytesOne).to.not.deep.equal(vaultKeyBytesTwo)
  })

  it("binds the wayin to its vault: under another vault's stamp it will not open", async () => {
    const { passphraseProving } = await Proving.makeProvingPair(WorldStamp, cleartextsOf(), provingWorldOf())
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
      const { passphraseProving } = await makeProvingPair()
      await TH.expectRefusal(passphraseProving.makeWayin(source as never), 'bad_option')
    })
  }

  it("refuses, as 'unexpected_error', a proving that has made no wayin yet as its source", async () => {
    const answer = passkeyAnswerOf()
    const { passphraseProving, passkeyProving } = await makeProvingPair(cleartextsOf(TestPassphrase, answer))
    await TH.expectRefusal(passkeyProving!.makeWayin(passphraseProving), 'unexpected_error')
  })

  it("refuses a proving of another vault as its source, as 'bad_option': a wayin wraps only its own vault's vaultKey", async () => {
    const { passphraseProving: theirProving } = await Proving.makeProvingPair({ ...WorldStamp, vault_tok: 'vault-tok-other' }, cleartextsOf(), provingWorldOf())
    await theirProving.makeWayin(NOVEL)
    const { passphraseProving: myProving } = await makeProvingPair()
    await TH.expectRefusal(myProving.makeWayin(theirProving), 'bad_option')
  })

  it("refuses a second makeWayin on one proving as 'unexpected_error', so its leases stay under the one vaultKey its first wayin wraps", async () => {
    const { passphraseProving } = await makeProvingPair()
    await passphraseProving.makeWayin(NOVEL)
    const first = await passphraseProving.makeLease(duckVaultOf(), fakeDBFriendOf(), { leaseMillis: WeekMillis })
    await TH.expectRefusal(passphraseProving.makeWayin(NOVEL), 'unexpected_error')
    const second = await passphraseProving.makeLease(duckVaultOf(), fakeDBFriendOf(), { leaseMillis: WeekMillis })
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await first.sealWith(new TextEncoder().encode('{"val":"sk-test-0000"}'), boxKeyStamp, whisperStamp)
    expect(new TextDecoder().decode(await second.unsealWith(sealed, boxKeyStamp, whisperStamp))).to.eq('{"val":"sk-test-0000"}')
  })
})

describe("proving.makeLease(vault, dbfriend, opts)", () => {
  it("refuses, as 'unexpected_error', before the proving has made a wayin, and keeps nothing", async () => {
    const { passphraseProving } = await makeProvingPair()
    const friend = fakeDBFriendOf()
    await TH.expectRefusal(passphraseProving.makeLease(duckVaultOf(), friend, { leaseMillis: WeekMillis }), 'unexpected_error')
    expect(friend.tryPutLease).not.toHaveBeenCalled()
  })

  it("grants and keeps a lease of the proving's vault, in force for leaseMillis", async () => {
    const { passphraseProving } = await makeProvingPair()
    await passphraseProving.makeWayin(NOVEL)
    const friend = fakeDBFriendOf()
    const lease = await passphraseProving.makeLease(duckVaultOf(), friend, { leaseMillis: WeekMillis })
    expect(lease.toJSON()).to.deep.include({ ...WorldStamp, autolock_at: T0 + WeekMillis })
    expect(lease.isInForce).to.be.true
    expect(friend.tryPutLease).toHaveBeenCalledTimes(1)
  })

  it("grants leases over one vaultKey from both provings once both made wayins: what one seals, the other opens", async () => {
    const { passphraseProving, passkeyProving } = await makeProvingPair(cleartextsOf(TestPassphrase, passkeyAnswerOf()))
    await passphraseProving.makeWayin(NOVEL)
    await passkeyProving!.makeWayin(passphraseProving)
    const viaPassphrase = await passphraseProving.makeLease(duckVaultOf(), fakeDBFriendOf(), { leaseMillis: WeekMillis })
    const viaPasskey = await passkeyProving!.makeLease(duckVaultOf(), fakeDBFriendOf(), { leaseMillis: WeekMillis })
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await viaPassphrase.sealWith(new TextEncoder().encode('{"val":"sk-test-5678"}'), boxKeyStamp, whisperStamp)
    expect(new TextDecoder().decode(await viaPasskey.unsealWith(sealed, boxKeyStamp, whisperStamp))).to.eq('{"val":"sk-test-5678"}')
  })

  it("refuses opts its check refuses as 'bad_option'", async () => {
    const { passphraseProving } = await makeProvingPair()
    await passphraseProving.makeWayin(NOVEL)
    await TH.expectRefusal(passphraseProving.makeLease(duckVaultOf(), fakeDBFriendOf(), { leaseMillis: 0 }), 'bad_option')
  })
})

describe("what a proving shows", () => {
  it("Object.keys shows its wayinkind and header alone: no key, no wayin, no stamp", async () => {
    const { passphraseProving, passkeyProving } = await makeProvingPair(cleartextsOf(TestPassphrase, passkeyAnswerOf()))
    await passphraseProving.makeWayin(NOVEL)
    expect(Object.keys(passphraseProving)).to.deep.equal(['wayinkind', 'header'])
    expect(Object.keys(passkeyProving!)).to.deep.equal(['wayinkind', 'header'])
  })

  it("JSON.stringify gives its wayinkind alone", async () => {
    const { passphraseProving, passkeyProving } = await makeProvingPair(cleartextsOf(TestPassphrase, passkeyAnswerOf()))
    expect(JSON.stringify(passphraseProving)).to.eq('{"wayinkind":"passphrase"}')
    expect(JSON.stringify(passkeyProving)).to.eq('{"wayinkind":"passkey"}')
  })

  it("is frozen", async () => {
    const { passphraseProving } = await makeProvingPair()
    expect(Object.isFrozen(passphraseProving)).to.be.true
    expect(() => { (passphraseProving as { wayinkind: string }).wayinkind = 'passkey' }).to.throw(TypeError)
  })
})
