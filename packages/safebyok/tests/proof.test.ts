import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { deriveWrappingKey, fromB64, makeVaultKey, toB64, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import type { KeyDeriver } from '../src/key-deriver'
import { PasskeyProof, PassphraseProof, Proof, checkSaltShape, type ProofVault } from '../src/proof'
import { type StrengthChecker, guardStrengthChecker } from '../src/passphrase-strength'
import type { PasskeyAnswer } from '../src/types'
import { Wayin } from '../src/wayin'
import * as TH from './test-helpers'

/** The slice of a vault every proof here is for: `u1`'s `main` vault, deriving with the test deriver. */
const slice = TH.vaultSliceOf('u1')

/** The slice of a vault deriving with `keyDeriver`. */
const sliceWith = (keyDeriver: KeyDeriver): ProofVault => TH.vaultSliceOf('u1', keyDeriver)

/** A testDeriver that counts its derivations: the deriver, and the spy that counts. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

/** A fresh 16-byte salt, as a passphrase's way in keeps it. */
const saltB64 = toB64(new Uint8Array(16).fill(7))

/** `count` bytes of `filler`, as an array to compare a view's bytes with. */
const bytesOf = (filler: number, count: number): number[] => Array.from({ length: count }, () => filler)

/** True when `wayinKey` wraps a vaultKey that the same derivation, made again, unwraps. */
const wrapsAlike = async (wayinKey: CryptoKey, again: CryptoKey): Promise<boolean> => {
  const ctx = new Uint8Array(1)
  const wrapped = await wrapKeyUnder(wayinKey, await makeVaultKey(), ctx)
  return (await unwrapKeyUnder(again, wrapped, ctx, { extractable: false, usage: ['wrapKey'] })) instanceof CryptoKey
}

// == [Parsing]: Proof.parse, PassphraseProof.parse, PasskeyProof.parse

describe("Proof.parse", () => {
  it("makes a PassphraseProof of text, as its first example shows", () => {
    const proof = Proof.parse(slice, 'correct horse battery staple')
    expect(proof).to.be.instanceOf(PassphraseProof)
    expect(proof.kind).to.eq('passphrase')
  })

  it("makes a PasskeyProof of a passkey's answer, as its second example shows", async () => {
    const answer = await TH.passkeyOf('laptop')
    const proof = Proof.parse(slice, answer)
    expect(proof).to.be.instanceOf(PasskeyProof)
    expect(proof).to.include({ kind: 'passkey', credentialId: answer.credentialId, prfSaltB64: answer.prfSaltB64 })
  })

  it("refuses a passkey's answer short of its fields as bad_option, as its third example shows", () => {
    TH.expectSyncRefusal(() => Proof.parse(slice, { credentialId: 'abc' }), 'bad_option')
  })

  it("takes a blank passphrase as a proof, deriving nothing: its use says what it is refused as", () => {
    const { keyDeriver, derivations } = countingDeriver()
    for (const blank of ['', ' '.repeat(3), '\t\n']) {
      const proof = Proof.parse(sliceWith(keyDeriver), blank)
      expect(proof).to.be.instanceOf(PassphraseProof)
      expect(proof).to.include({ isBlank: true })
    }
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses a misshapen passkey answer as bad_option, quoting none of it (Contract: Proof, Guarantees)", async () => {
    const answer = await TH.passkeyOf('laptop')
    const MisshapenCases = [
      [{ ...answer, prfBytes: [...answer.prfBytes] },          'its bytes an array, not a Uint8Array'],
      [{ ...answer, prfBytes: answer.prfBytes.subarray(1) },   'its bytes one short of 32'],
      [{ ...answer, credentialId: '' },                         'an empty credential'],
      [{ ...answer, prfSaltB64: undefined },                    'no salt'],
      [42,                                                     'a number'],
      [null,                                                   'nothing at all'],
    ] as const
    for (const [given, blurb] of MisshapenCases) {
      const err = TH.expectSyncRefusal(() => Proof.parse(slice, given), 'bad_option')
      expect(err.message, blurb).to.include('credentialId, prfSaltB64, prfBytes')
      expect(JSON.stringify({ message: err.message, cause: err.cause }), blurb).to.not.include(answer.credentialId)
    }
  })

  it("refuses a proof made by another copy of safebyok as bad_option, as it refuses any answer of the wrong shape", async () => {
    vi.resetModules()
    const other = await import('../src/proof')
    const theirs = other.Proof.parse(slice, 'pw')
    expect(theirs).to.not.be.instanceOf(Proof)
    TH.expectSyncRefusal(() => Proof.parse(slice, theirs), 'bad_option')
  })
})

describe("PassphraseProof.parse", () => {
  it("makes a proof of the passphrase typed, as its first example shows", () => {
    const proof = PassphraseProof.parse(slice, 'typed')
    expect(proof.passphrase).to.eq('typed')
    expect(proof.vault).to.eq(slice)
  })

  it("refuses anything but text as bad_option, a passkey's answer among it, as its second example shows", async () => {
    for (const given of [42, null, undefined, await TH.passkeyOf('laptop')]) {
      TH.expectSyncRefusal(() => PassphraseProof.parse(slice, given), 'bad_option')
    }
  })

  it("keeps the passphrase as typed, spaces and all", () => {
    expect(PassphraseProof.parse(slice, '  padded  ').passphrase).to.eq('  padded  ')
    expect(PassphraseProof.parse(slice, '  padded  ').isBlank).to.be.false
  })
})

/** The slice of a vault whose strength checker is `strengthChecker`, held to its contract as a vault holds it. */
const sliceChecking = (strengthChecker: StrengthChecker): ProofVault => ({ ...slice, checkPassphrase: guardStrengthChecker(strengthChecker, TH.scopeOf('u1')) })

describe("passphraseProof.checkStrongEnough", () => {
  it("refuses a passphrase its vault's checker finds weak as weak_passphrase, the reason its message, as its example shows", async () => {
    const proof = PassphraseProof.parse(sliceChecking(() => ({ strong: false, reason: 'Add a few more words.' })), 'short')
    const err = await TH.expectRefusal(proof.checkStrongEnough(), 'weak_passphrase')
    expect(err.message).to.eq('Add a few more words.')
  })

  it("passes a passphrase its vault's checker finds strong, handing the checker the vault's scope", async () => {
    const checker = vi.fn<StrengthChecker>(() => ({ strong: true }))
    await PassphraseProof.parse(sliceChecking(checker), 'correct horse battery staple').checkStrongEnough()
    expect(checker).toHaveBeenCalledWith('correct horse battery staple', TH.scopeOf('u1'))
  })

  it("refuses a blank passphrase as weak_passphrase before its vault's checker hears it", async () => {
    const checker = vi.fn<StrengthChecker>(() => ({ strong: true }))
    for (const blank of ['', ' '.repeat(3), '\t\n']) {
      const err = await TH.expectRefusal(PassphraseProof.parse(sliceChecking(checker), blank).checkStrongEnough(), 'weak_passphrase')
      expect(err.message).to.include("can't be empty")
    }
    expect(checker).not.toHaveBeenCalled()
  })

  it("asks the checker the vault has now: it calls back to its vault, never a checker of its own", async () => {
    const checking = { ...slice, checkPassphrase: guardStrengthChecker(() => ({ strong: true }), TH.scopeOf('u1')) }
    const proof = PassphraseProof.parse(checking, 'pw')
    checking.checkPassphrase = guardStrengthChecker(() => ({ strong: false, reason: 'Not today.' }), TH.scopeOf('u1'))
    await TH.expectRefusal(proof.checkStrongEnough(), 'weak_passphrase')
  })
})

/** Salts no new passkey's way in is sealed over. */
const SaltShapeCases = [
  [toB64(new Uint8Array(16)), 'a salt of 16 bytes, not 32'],
  ["not base64url!",          'a salt that is not base64url'],
] as const

describe("checkSaltShape", () => {
  it("passes an answer over a fresh 32-byte salt, as its first example shows", async () => {
    const answer = await TH.passkeyOf('laptop')
    expect(() => { checkSaltShape(PasskeyProof.parse(slice, answer)) }).to.not.throw()
  })

  it("refuses an answer over a salt too short as bad_option, as its second example shows", async () => {
    const answer = await TH.passkeyOf('laptop', 'c2hvcnQ')
    TH.expectSyncRefusal(() => { checkSaltShape(PasskeyProof.parse(slice, answer)) }, 'bad_option')
  })

  for (const [prfSaltB64, blurb] of SaltShapeCases) {
    it(`refuses an answer over ${blurb} as bad_option, naming createPasskey`, async () => {
      const answer = await TH.passkeyOf('laptop', prfSaltB64)
      expect(() => { checkSaltShape(PasskeyProof.parse(slice, answer)) }).to.throw(/createPasskey/).with.property('refusalkind', 'bad_option')
    })
  }
})

describe("PasskeyProof.parse", () => {
  it("makes a proof of a passkey's answer, as its first example shows", async () => {
    const answer = await TH.passkeyOf('laptop')
    const proof = PasskeyProof.parse(slice, answer)
    expect(proof.prfBytes).to.eq(answer.prfBytes)
  })

  it("refuses an answer whose bytes are an array as bad_option, as its second example shows", async () => {
    const answer = await TH.passkeyOf('laptop')
    TH.expectSyncRefusal(() => PasskeyProof.parse(slice, { ...answer, prfBytes: [...answer.prfBytes] }), 'bad_option')
  })

  it("refuses a passphrase as bad_option: text is no answer", () => {
    TH.expectSyncRefusal(() => PasskeyProof.parse(slice, 'pw'), 'bad_option')
  })
})
// --

// == [The secret kept in]: toJSON, enumerable fields, freezing

describe("a proof's secret", () => {
  it("shows in no JSON: toJSON is the kind alone, as the Proof's second example shows", async () => {
    expect(JSON.stringify(Proof.parse(slice, 'hunter2-hunter2'))).to.eq('{"kind":"passphrase"}')
    const answer = await TH.passkeyOf('laptop')
    expect(JSON.stringify(PasskeyProof.parse(slice, answer))).to.eq('{"kind":"passkey"}')
  })

  it("is not enumerable: Object.keys, a spread and a log line pass a passphrase by", () => {
    const proof = PassphraseProof.parse(slice, 'hunter2-hunter2')
    expect(Object.keys(proof)).to.deep.equal(['kind'])
    const spread = Object.fromEntries(Object.entries(proof))
    expect(JSON.stringify(spread)).to.not.include('hunter2')
    expect(inspect(proof)).to.not.include('hunter2')
  })

  it("is not enumerable: a passkey's answer bytes stay out of keys, a spread and a log line, its credential and salt shown", async () => {
    const answer = await TH.passkeyOf('laptop')
    const proof = PasskeyProof.parse(slice, answer)
    expect(Object.keys(proof)).to.have.members(['kind', 'credentialId', 'prfSaltB64'])
    expect(Object.values(proof)).to.not.include(answer.prfBytes)
    expect(inspect(proof)).to.not.include(String(answer.prfBytes[0]) + ',')
    expect(inspect(proof, { depth: 4 })).to.include(answer.credentialId)
  })

  it("holds the vault, not enumerable, so a proof serializes in no circle", () => {
    const proof = PassphraseProof.parse(slice, 'pw')
    expect(proof.vault).to.eq(slice)
    expect(Object.keys(proof)).to.not.include('vault')
  })

  it("cannot be written over: a proof is frozen", async () => {
    const proof = PassphraseProof.parse(slice, 'pw')
    const passkey = PasskeyProof.parse(slice, await TH.passkeyOf('laptop'))
    expect(Object.isFrozen(proof)).to.be.true
    expect(Object.isFrozen(passkey)).to.be.true
    for (const field of ['passphrase', 'kind', 'vault']) {
      expect(Reflect.set(proof, field, 'other'), field).to.be.false
    }
    expect(Reflect.set(passkey, 'prfBytes', new Uint8Array(32)), 'prfBytes').to.be.false
    expect(proof.passphrase).to.eq('pw')
  })
})
// --

// == [Deriving]: wayinKeyFor, a key deriver's bytes

describe("passphraseProof.wayinKeyFor", () => {
  it("is the key deriver's 32 bytes over the passphrase and the way in's salt, imported non-extractable, as its example shows", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const proof = PassphraseProof.parse(sliceWith(keyDeriver), 'pw')
    const wayinKey = await proof.wayinKeyFor({ salt_b64: saltB64 })
    expect(wayinKey.extractable).to.be.false
    expect(wayinKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
    expect(derivations).toHaveBeenCalledOnce()
    expect(derivations.mock.calls[0]?.[0]).to.eq('pw')
    expect([...derivations.mock.calls[0]?.[1] ?? []]).to.deep.equal([...fromB64(saltB64)])
    expect(await wrapsAlike(wayinKey, await PassphraseProof.parse(slice, 'pw').wayinKeyFor({ salt_b64: saltB64 }))).to.be.true
  })

  it("makes another key of another passphrase, or another salt", async () => {
    const wayinKey = await PassphraseProof.parse(slice, 'pw').wayinKeyFor({ salt_b64: saltB64 })
    await expect(wrapsAlike(wayinKey, await PassphraseProof.parse(slice, 'pW').wayinKeyFor({ salt_b64: saltB64 }))).rejects.toThrow()
    const otherSalt = { salt_b64: toB64(new Uint8Array(16)) }
    await expect(wrapsAlike(wayinKey, await PassphraseProof.parse(slice, 'pw').wayinKeyFor(otherSalt))).rejects.toThrow()
  })

  it("refuses what a key deriver throws as unexpected_error, the throw its cause", async () => {
    const thrown = new Error('the deriver fell over')
    const proof = PassphraseProof.parse(sliceWith({ ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) }), 'pw')
    const err = await TH.expectRefusal(proof.wayinKeyFor({ salt_b64: saltB64 }), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
  })
})

describe("passkeyProof.wayinKeyFor", () => {
  it("is HKDF over the answer with the way in's wayinCtx as its info, non-extractable, as its example shows", async () => {
    const answer: PasskeyAnswer = await TH.passkeyOf('laptop')
    const proof = PasskeyProof.parse(slice, answer)
    const wayin = Wayin.make(slice, TH.vaultPropsOf('u1'), TH.passkeyWayinOf('laptop'))
    const wayinKey = await proof.wayinKeyFor(wayin)
    expect(wayinKey.extractable).to.be.false
    expect(await wrapsAlike(wayinKey, await deriveWrappingKey(answer.prfBytes, wayin.wayinCtx))).to.be.true
    const elsewhere = await deriveWrappingKey(answer.prfBytes, new Uint8Array(1))
    await expect(wrapsAlike(wayinKey, elsewhere)).rejects.toThrow()
  })
})

/** A deriver whose handed-back bytes the test keeps hold of, to look at after the proof is through with them. */
const keepingDeriver = () => {
  const handed: Uint8Array[] = []
  const keyDeriver: KeyDeriver = {
    ...TH.testDeriver,
    deriveKeyBytes: async (passphrase, saltBytes) => {
      const bytes = await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes)
      handed.push(bytes)
      return bytes
    },
  }
  return { keyDeriver, handed }
}

/** The passphraseKey of 'pw' over {@link saltB64}, by `keyDeriver`. */
const keyBy = async (keyDeriver: KeyDeriver) => await PassphraseProof.parse(sliceWith(keyDeriver), 'pw').wayinKeyFor({ salt_b64: saltB64 })

describe("a key deriver's bytes", () => {
  it("are zeroed once they have made the passphraseKey, which still wraps and unwraps", async () => {
    const { keyDeriver, handed } = keepingDeriver()
    const wayinKey = await keyBy(keyDeriver)
    expect(handed).to.have.lengthOf(1)
    expect([...handed[0] ?? []]).to.deep.equal(bytesOf(0, 32))
    // The key made of them still opens what it wrapped: zeroing is after the import.
    expect(await wrapsAlike(wayinKey, await keyBy(TH.testDeriver))).to.be.true
  })

  it("are zeroed after every try when opening, a wrong passphrase's included", async () => {
    const identity = TH.vaultPropsOf('u1')
    const sealed = await Wayin.seal(TH.vaultSliceOf('u1', TH.testDeriver, { now: () => Date.UTC(2026, 9, 15) }), identity, PassphraseProof.parse(slice, 'first'), 'device-one', await makeVaultKey())
    const { keyDeriver, handed } = keepingDeriver()
    const opening = TH.vaultSliceOf('u1', keyDeriver)
    const wayin = Wayin.make(opening, identity, sealed.record)
    await TH.expectBad(wayin.tryOpen(Proof.parse(opening, 'wrong')), 'wrong_passphrase')
    await TH.expectGood(wayin.tryOpen(Proof.parse(opening, 'first')))
    expect(handed).to.have.lengthOf(2)
    for (const bytes of handed) { expect(bytes.every((byte) => byte === 0)).to.be.true }
  })

  it("are zeroed through a view with an offset, touching nothing around it", async () => {
    const backing = new Uint8Array(48).fill(9)
    const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase, saltBytes) => {
      backing.set(await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes), 8)
      return backing.subarray(8, 40)
    } }
    await keyBy(keyDeriver)
    expect([...backing.subarray(8, 40)]).to.deep.equal(bytesOf(0, 32))
    expect([...backing.subarray(0, 8)]).to.deep.equal(bytesOf(9, 8))
    expect([...backing.subarray(40)]).to.deep.equal(bytesOf(9, 8))
  })

  it("are refused as bad_option when they sit in shared memory, saying so and not quoting them", async () => {
    const shared = new Uint8Array(new SharedArrayBuffer(32)).fill(5)
    const err = await TH.expectRefusal(keyBy({ ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(shared) }), 'bad_option')
    expect(err.message).to.include('SharedArrayBuffer')
    expect(err.message).to.not.include('5,5')
  })

  it("are zeroed when refused for their length, as when imported", async () => {
    const long = new Uint8Array(64).fill(5)
    await TH.expectRefusal(keyBy({ ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(long) }), 'bad_option')
    expect([...long]).to.deep.equal(bytesOf(0, 64))
  })

  it("are refused as bad_option when they are 32 zero bytes, a key anyone could rebuild", async () => {
    const err = await TH.expectRefusal(keyBy({ ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) }), 'bad_option')
    expect(err.message).to.include('zero bytes')
  })

  it("are refused as bad_option when they are not 32 bytes of a view at all", async () => {
    for (const handed of [new Uint8Array(31), new Uint8Array(33), 'thirty-two bytes, honest', null, new ArrayBuffer(32)]) {
      await TH.expectRefusal(keyBy({ ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(handed as unknown as Uint8Array) }), 'bad_option')
    }
  })
})
// --
