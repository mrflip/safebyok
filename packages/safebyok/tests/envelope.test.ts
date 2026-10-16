import { describe, expect, it, vi } from 'vitest'
import { cipherBinding, deriveWrappingKey, makeLockboxKey, makeVaultKey, toB64, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import * as Envelope from '../src/envelope'
import { VaultError } from '../src/errors'
import type { KeyDeriver } from '../src/key-deriver'
import { VaultBundle, type PasskeyEnvelope, type PasskeyProof, type PassphraseEnvelope, type UnlockEnvelope } from '../src/types'
import * as TH from './test-helpers'

const scope = TH.scopeOf('u1')
/** The bundle every envelope here is sealed for: its `vault_id` and `registered_at` are what a wrap binds of it. */
const identity = TH.bundleOf('u1')

/** A testDeriver that counts its derivations: the deriver, and the spy that counts. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

/** What a way in labelled `unlocklabel` is stamped with: its id, the bundle's vaultKey epoch, the device that added it and when. */
const stampOf = (unlocklabel: string): Envelope.EnvelopeStamp => ({
  unlock_id:       `unlock-${unlocklabel}`,
  unlocklabel,
  vault_key_epoch: 1,
  device_id:       'device-one',
  registered_at:   Date.UTC(2026, 9, 15),
})

/** A real passphrase envelope around `vaultKey`, labelled `unlocklabel`. */
const sealed = async (passphrase: string, unlocklabel: string, vaultKey: CryptoKey, keyDeriver: KeyDeriver = TH.testDeriver) => {
  return await Envelope.sealPassphrase(keyDeriver, passphrase, scope, identity, stampOf(unlocklabel), vaultKey)
}

/** A bundle of `unlocks`, validated as storage would read it back. */
const bundleWith = (unlocks: UnlockEnvelope[]): VaultBundle => VaultBundle.parse(TH.bundleOf('u1', { unlocks }))

/** A bundle of `unlocks` at its second vaultKey, the first kept as its prior, validated as storage would read it back. */
const secondKeyBundleWith = (unlocks: UnlockEnvelope[]): VaultBundle => VaultBundle.parse({ ...TH.rotatedBundleOf('u1'), unlocks })

/** Expect `operation` to reject with a VaultError of `kind`. */
const expectRefusal = async (operation: Promise<unknown>, kind: VaultError['kind']): Promise<VaultError> => {
  try {
    await operation
  } catch (err) {
    expect(err).to.be.instanceOf(VaultError)
    expect((err as VaultError).kind).to.eq(kind)
    return err as VaultError
  }
  throw new Error(`expected a VaultError of kind '${kind}', but nothing was thrown`)
}

/** The vaultKey's raw bytes, to compare two handles on it. */
const rawOf = async (vaultKey: CryptoKey) => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey)))

describe("Envelope.sealPassphrase", () => {
  it("makes a valid passphrase envelope that names its deriver and a fresh salt", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealed('pw', 'passphrase', vaultKey)
    const two = await sealed('pw', 'home_phrase', vaultKey)
    expect(VaultBundle.safeParse(TH.bundleOf('u1', { unlocks: [one, two] })).success).to.be.true
    expect(one).to.include({ method: 'passphrase', unlock_id: 'unlock-passphrase', unlocklabel: 'passphrase', key_deriver_label: 'test_digest_v0' })
    expect(one).to.include({ vault_key_epoch: 1, device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15) })
    expect(one.salt_b64).to.not.eq(two.salt_b64)
  })

})

describe("Envelope.sealFirstPassphrase", () => {
  it("makes the envelope sealPassphrase would, and hands back a session handle on the vaultKey that cannot be exported", async () => {
    const vaultKey = await makeVaultKey()
    const { envelope, sessionKey } = await Envelope.sealFirstPassphrase(TH.testDeriver, 'pw', scope, identity, stampOf('one'), vaultKey)
    expect(envelope).to.include({ method: 'passphrase', unlock_id: 'unlock-one', key_deriver_label: 'test_digest_v0' })
    expect(sessionKey.extractable).to.be.false
    expect(sessionKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
    // The handle is the vaultKey: what the vaultKey wraps, it unwraps.
    const lockboxKey = await makeLockboxKey()
    const wrapped = await wrapKeyUnder(vaultKey, lockboxKey, new Uint8Array(1))
    const unwrapped = await unwrapKeyUnder(sessionKey, wrapped, new Uint8Array(1), { extractable: true, usage: ['encrypt', 'decrypt'] })
    expect(await rawOf(unwrapped)).to.eq(await rawOf(lockboxKey))
  })
})

/** A deriver whose handed-back bytes the test keeps hold of, to look at after the vault is through with them. */
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

/** `count` bytes of `filler`, as an array to compare a view's bytes with. */
const bytesOf = (filler: number, count: number): number[] => Array.from({ length: count }, () => filler)

describe("a key deriver's bytes", () => {
  it("are zeroed once they have made the passphraseKey, when sealing", async () => {
    const { keyDeriver, handed } = keepingDeriver()
    const envelope = await sealed('pw', 'passphrase', await makeVaultKey(), keyDeriver)
    expect(handed).to.have.lengthOf(1)
    expect([...handed[0] ?? []]).to.deep.equal(bytesOf(0, 32))
    // The key made of them still opens what it wrapped: zeroing is after the import.
    const opened = await Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, bundleWith([envelope]))
    expect(opened.unlockId).to.eq('unlock-passphrase')
  })

  it("are zeroed after every try when opening, a wrong passphrase's included", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, handed } = keepingDeriver()
    await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'neither', scope, bundle), 'wrong_passphrase')
    expect(handed).to.have.lengthOf(2)
    for (const bytes of handed) { expect(bytes.every((byte) => byte === 0)).to.be.true }
  })

  it("are zeroed through a view with an offset, touching nothing around it", async () => {
    const backing = new Uint8Array(48).fill(9)
    const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase, saltBytes) => {
      backing.set(await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes), 8)
      return backing.subarray(8, 40)
    } }
    await sealed('pw', 'passphrase', await makeVaultKey(), keyDeriver)
    expect([...backing.subarray(8, 40)]).to.deep.equal(bytesOf(0, 32))
    expect([...backing.subarray(0, 8)]).to.deep.equal(bytesOf(9, 8))
    expect([...backing.subarray(40)]).to.deep.equal(bytesOf(9, 8))
  })

  it("are refused as bad_option when they sit in shared memory, saying so and not quoting them", async () => {
    const shared = new Uint8Array(new SharedArrayBuffer(32)).fill(5)
    const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(shared) }
    const err = await expectRefusal(Envelope.sealPassphrase(keyDeriver, 'pw', scope, identity, stampOf('one'), await makeVaultKey()), 'bad_option')
    expect(err.message).to.include('SharedArrayBuffer')
    expect(err.message).to.not.include('5,5')
  })

  it("are zeroed when refused for their length, as when imported", async () => {
    const long = new Uint8Array(64).fill(5)
    const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(long) }
    await expectRefusal(Envelope.sealPassphrase(keyDeriver, 'pw', scope, identity, stampOf('one'), await makeVaultKey()), 'bad_option')
    expect([...long]).to.deep.equal(bytesOf(0, 64))
  })

  it("are refused as bad_option when they are not 32 bytes of a view at all", async () => {
    for (const handed of [new Uint8Array(31), new Uint8Array(33), 'thirty-two bytes, honest', null, new ArrayBuffer(32)]) {
      const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(handed as unknown as Uint8Array) }
      await expectRefusal(Envelope.sealPassphrase(keyDeriver, 'pw', scope, identity, stampOf('one'), await makeVaultKey()), 'bad_option')
    }
  })
})

describe("Envelope.openWithPassphrase", () => {
  it("opens the envelope the passphrase belongs to, and says which", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'passphrase', vaultKey), await sealed('second', 'home_phrase', vaultKey)])
    const opened = await Envelope.openWithPassphrase(TH.testDeriver, 'second', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-home_phrase')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
    expect(opened.sessionKey.extractable).to.be.false
  })

  it("tries the envelopes in order, one derivation each, and stops at the first that opens", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey), await sealed('third', 'three', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    await Envelope.openWithPassphrase(keyDeriver, 'second', scope, bundle)
    expect(derivations).toHaveBeenCalledTimes(2)
  })

  it("refuses a wrong passphrase only after trying every envelope", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const err = await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'neither', scope, bundle), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(2)
    expect(err.message).to.not.include('neither')
  })

  it("says how many passphrases another key deriver made went untried, and that opening the vault where it was made may help", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey, alienDeriver), await sealed('third', 'three', vaultKey, alienDeriver)])
    const err = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'second', scope, bundle), 'wrong_passphrase')
    expect(err.message).to.include('2 of this vault\'s passphrases were made with a key deriver this package does not carry')
    expect(err.message).to.include('open the vault where it was made')
    expect(err.message).to.not.include('second')
  })

  it("says it of one passphrase in the singular", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey, alienDeriver)])
    const err = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'second', scope, bundle), 'wrong_passphrase')
    expect(err.message).to.include("One of this vault's passphrases was made with a key deriver this package does not carry, so it was not tried")
  })

  it("says it beside a damaged passphrase too, and says nothing of other derivers when none was passed over", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const damagedToo = bundleWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }, await sealed('third', 'three', vaultKey, alienDeriver)])
    const told = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'nope', scope, damagedToo), 'wrong_passphrase')
    expect(told.message).to.include('stored damaged')
    expect(told.message).to.include('One of this vault')
    const soundOnly = bundleWith([await sealed('first', 'one', vaultKey)])
    const plain = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'nope', scope, soundOnly), 'wrong_passphrase')
    expect(plain.message).to.not.include('key deriver')
  })

  it("aimed at one envelope, derives once, and refuses a passphrase that is another's", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const opened = await Envelope.openWithPassphrase(keyDeriver, 'second', scope, bundle, 'unlock-two')
    expect(opened.unlockId).to.eq('unlock-two')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle, 'unlock-two'), 'wrong_passphrase')
  })

  it("refuses an aim at an unlock_id the bundle does not hold", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey)])
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle, 'unlock-gone'), 'absent_unlock')
  })

  it("refuses as unknown_key_deriver when no envelope it would try was made by this deriver", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey)])
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    await expectRefusal(Envelope.openWithPassphrase(alienDeriver, 'first', scope, bundle), 'unknown_key_deriver')
  })

  // A salt no deriver of its label could have made: each decodes, or not, but never to 16 bytes.
  const DamagedSaltCases = [
    ["c2FsdA",       'a salt of another length, base64url that decodes and so passes the schema'],
    ["not base64!",  'a salt of text that is not base64url'],
    ["aaaaa",        'a salt of base64url letters that decode to no whole bytes'],
  ] as const

  describe("over an envelope stored damaged", () => {
    for (const [saltB64, blurb] of DamagedSaltCases) {
      it(`passes over one with ${blurb}, deriving nothing for it, and opens a sound one`, async () => {
        const vaultKey = await makeVaultKey()
        const bundle = bundleWith([{ ...await sealed('first', 'one', vaultKey), salt_b64: saltB64 }, await sealed('second', 'two', vaultKey)])
        const { keyDeriver, derivations } = countingDeriver()
        const opened = await Envelope.openWithPassphrase(keyDeriver, 'second', scope, bundle)
        expect(opened.unlockId).to.eq('unlock-two')
        expect(derivations).toHaveBeenCalledTimes(1)
      })
    }

    it("refuses as wrong_passphrase, saying a damaged one went untried, when no sound one opens", async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'second', scope, bundle), 'wrong_passphrase')
      expect(err.message).to.include('stored damaged')
    })

    it("refuses as damaged_unlock, deriving nothing, when every one it would try is damaged", async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([{ ...await sealed('first', 'one', vaultKey), salt_b64: 'c2FsdA' }, { ...await sealed('second', 'two', vaultKey), salt_b64: 'aaaaa' }])
      const { keyDeriver, derivations } = countingDeriver()
      const err = await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'first', scope, bundle), 'damaged_unlock')
      expect(err.message).to.include('Every passphrase')
      expect(derivations).not.toHaveBeenCalled()
    })

    it("refuses as damaged_unlock, not saying every passphrase is damaged, when another deriver made the rest", async () => {
      const vaultKey = await makeVaultKey()
      const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
      const bundle = bundleWith([await sealed('first', 'one', vaultKey, alienDeriver), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle), 'damaged_unlock')
      expect(err.message).to.include('a key deriver this package does not carry')
      expect(err.message).to.not.include('Every passphrase of this vault is stored damaged')
    })

    it("passes over, deriving nothing for it, an envelope at another vaultKey epoch than the bundle's, and opens a sound one beside it", async () => {
      const vaultKey = await makeVaultKey()
      const spliced = { ...await sealed('second', 'two', vaultKey), vault_key_epoch: 2 }
      const bundle = bundleWith([spliced, await sealed('first', 'one', vaultKey)])
      const { keyDeriver, derivations } = countingDeriver()
      await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'second', scope, bundle), 'wrong_passphrase')
      expect(derivations).toHaveBeenCalledTimes(1)
      const opened = await Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle)
      expect(opened.unlockId).to.eq('unlock-one')
    })

    it("refuses as damaged_unlock when every passphrase is at another vaultKey epoch than the bundle's", async () => {
      const vaultKey = await makeVaultKey()
      const bundle = secondKeyBundleWith([await sealed('first', 'one', vaultKey)])
      const err = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle), 'damaged_unlock')
      expect(err.message).to.include('Every passphrase')
    })

    it("refuses as damaged_unlock an aim at a damaged one, though a sound one stands beside it", async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle, 'unlock-two'), 'damaged_unlock')
      expect(err.message).to.include("That passphrase's way into the vault")
    })
  })

  it("says, refusing a passphrase no envelope opens, that the stored vault may be damaged", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey)])
    const err = await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'wrong', scope, bundle), 'wrong_passphrase')
    expect(err.message).to.include('Check for typos')
    expect(err.message).to.include('the stored vault may be damaged')
  })

  it("passes over envelopes another deriver made, and opens one this deriver did", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const bundle = bundleWith([await sealed('first', 'one', vaultKey, alienDeriver), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const opened = await Envelope.openWithPassphrase(keyDeriver, 'second', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-two')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'first', scope, bundle), 'wrong_passphrase')
  })
})

/** Each of an envelope's public fields altered: every one is in its wrap's binding. */
const TamperCases: readonly (readonly [Partial<PassphraseEnvelope>, string])[] = [
  [{ unlock_id: 'unlock-elsewhere' },            'its unlock_id swapped'],
  [{ unlocklabel: 'relabelled' },                'its unlocklabel swapped'],
  [{ key_deriver_label: 'test_digest_v1' },      'its key_deriver_label swapped, to one the deriver then wears'],
  [{ device_id: 'device-elsewhere' },            'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) },      'its registered_at moved'],
]

describe("an envelope's binding", () => {
  for (const [altered, blurb] of TamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([{ ...await sealed('pw', 'passphrase', vaultKey), ...altered }])
      const keyDeriver = { ...TH.testDeriver, key_deriver_label: (bundle.unlocks[0] as PassphraseEnvelope).key_deriver_label }
      await expectRefusal(Envelope.openWithPassphrase(keyDeriver, 'pw', scope, bundle), 'wrong_passphrase')
    })
  }

  it("refuses to open with its vault_key_epoch moved, though the bundle's is moved with it", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = secondKeyBundleWith([{ ...await sealed('pw', 'passphrase', vaultKey), vault_key_epoch: 2 }])
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle), 'wrong_passphrase')
  })

  it("refuses to open with its salt swapped for another envelope's", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealed('pw', 'one', vaultKey)
    const two = await sealed('pw', 'two', vaultKey)
    const bundle = bundleWith([{ ...one, salt_b64: two.salt_b64 }])
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle), 'wrong_passphrase')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const vaultKey = await makeVaultKey()
    const envelope = await sealed('pw', 'passphrase', vaultKey)
    const otherVault = VaultBundle.parse(TH.bundleOf('u1', { vault_id: 'vault-id-other', unlocks: [envelope] }))
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, otherVault), 'wrong_passphrase')
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', TH.scopeOf('u2'), bundleWith([envelope])), 'wrong_passphrase')
  })

  it("refuses to open in a bundle whose registered_at was altered", async () => {
    const envelope = await sealed('pw', 'passphrase', await makeVaultKey())
    const redated = VaultBundle.parse(TH.bundleOf('u1', { registered_at: identity.registered_at + 1, unlocks: [envelope] }))
    await expectRefusal(Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, redated), 'wrong_passphrase')
  })

  it("does not bind the unlock epoch: an envelope opens at any epoch of its vault", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = VaultBundle.parse(TH.bundleOf('u1', { unlock_epoch: 7, unlocks: [await sealed('pw', 'passphrase', vaultKey)] }))
    const opened = await Envelope.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-passphrase')
  })
})

describe("Envelope.summarize", () => {
  it("gives the method, id, label and the device and time that added it, and nothing of the salt or wrap", async () => {
    const envelope = await sealed('pw', 'passphrase', await makeVaultKey())
    expect(Envelope.summarize(envelope)).to.deep.equal({
      method: 'passphrase', unlock_id: 'unlock-passphrase', unlocklabel: 'passphrase', device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15),
    })
  })

  it("gives a passkey's credential and salt besides, what a host asks its authenticator with, and not its wrap", () => {
    const envelope = TH.passkeyEnvelopeOf('laptop')
    expect(Envelope.summarize(envelope)).to.deep.equal({
      method: 'passkey', unlock_id: 'unlock-laptop', unlocklabel: 'laptop', device_id: envelope.device_id, registered_at: envelope.registered_at,
      credential_id: 'cred-laptop', prf_salt_b64: envelope.prf_salt_b64,
    })
  })
})

/** A real passkey envelope around `vaultKey`, labelled `unlocklabel`, for the passkey `passkey` answered. */
const sealedPasskey = async (passkey: PasskeyProof, unlocklabel: string, vaultKey: CryptoKey) => {
  return await Envelope.sealPasskey(passkey, scope, identity, stampOf(unlocklabel), vaultKey)
}

describe("Envelope.sealPasskey", () => {
  it("makes a valid passkey envelope that keeps the credential and its salt, and never the answer", async () => {
    const passkey = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(passkey, 'laptop', await makeVaultKey())
    const bundle = TH.bundleOf('u1', { unlocks: [TH.envelopeOf('passphrase'), envelope] })
    expect(VaultBundle.safeParse(bundle).success).to.be.true
    expect(envelope).to.include({ method: 'passkey', unlock_id: 'unlock-laptop', unlocklabel: 'laptop', credential_id: passkey.credentialId, prf_salt_b64: passkey.prfSaltB64 })
    expect(JSON.stringify(envelope)).to.not.include(toB64(passkey.prfBytes))
  })
})

describe("Envelope.openWithPasskey", () => {
  it("opens the envelope of the credential that answered, among passphrases and other passkeys", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const phone = await TH.passkeyOf('phone')
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey), await sealedPasskey(phone, 'phone', vaultKey)])
    const opened = await Envelope.openWithPasskey(phone, scope, bundle)
    expect(opened.unlockId).to.eq('unlock-phone')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
    expect(opened.sessionKey.extractable).to.be.false
    const aimed = await Envelope.openWithPasskey(laptop, scope, bundle, 'unlock-laptop')
    expect(aimed.unlockId).to.eq('unlock-laptop')
  })

  it("refuses as absent_unlock a passkey the vault does not hold, or one aimed at another way in", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey)])
    await expectRefusal(Envelope.openWithPasskey(await TH.passkeyOf('stranger'), scope, bundle), 'absent_unlock')
    await expectRefusal(Envelope.openWithPasskey(laptop, scope, bundle, 'unlock-passphrase'), 'absent_unlock')
  })

  it("refuses as wrong_passkey an answer over another salt, or one that does not open the envelope", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealedPasskey(laptop, 'laptop', vaultKey)])
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    await expectRefusal(Envelope.openWithPasskey(await TH.passkeyOf('laptop', otherSalt), scope, bundle), 'wrong_passkey')
    await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, scope, bundle), 'wrong_passkey')
  })

  it("refuses as damaged_unlock an envelope whose salt is not base64url of 32 bytes", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', vaultKey)
    for (const prfSaltB64 of ['not base64url!', toB64(new Uint8Array(16))]) {
      const bundle = bundleWith([{ ...envelope, prf_salt_b64: prfSaltB64 }])
      await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfSaltB64 }, scope, bundle), 'damaged_unlock')
    }
  })

  it("refuses as damaged_unlock an envelope at another vaultKey epoch than the bundle's", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const bundle = bundleWith([{ ...envelope, vault_key_epoch: 2 }])
    const err = await expectRefusal(Envelope.openWithPasskey(laptop, scope, bundle), 'damaged_unlock')
    expect(err.message).to.include('stored damaged')
  })

  it("says, refusing an answer for its own salt that does not open it, that the way in may be damaged", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealedPasskey(laptop, 'laptop', await makeVaultKey())])
    const err = await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, scope, bundle), 'wrong_passkey')
    expect(err.message).to.include('may be damaged')
    expect(err.message).to.include('Unlock with a passphrase')
  })

  it("never refuses with the answer in the error", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealedPasskey(laptop, 'laptop', await makeVaultKey())])
    const err = await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfBytes: laptop.prfBytes.toReversed() }, scope, bundle), 'wrong_passkey')
    expect(JSON.stringify({ kind: err.kind, message: err.message, cause: err.cause })).to.not.include(toB64(laptop.prfBytes))
  })
})

const PasskeyTamperCases = [
  [{ unlock_id: 'unlock-other' },     'its unlock_id changed'],
  [{ unlocklabel: 'other' },          'its unlocklabel changed'],
  [{ credential_id: 'Y3JlZC1vdGhlcg' }, 'its credential_id swapped, the answer kept'],
  [{ device_id: 'device-elsewhere' },  'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) }, 'its registered_at moved'],
] as const

describe("a passkey envelope's binding", () => {
  for (const [altered, blurb] of PasskeyTamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const laptop = await TH.passkeyOf('laptop')
      const bundle = bundleWith([{ ...await sealedPasskey(laptop, 'laptop', await makeVaultKey()), ...altered }])
      const answering = { ...laptop, credentialId: (bundle.unlocks[0] as PasskeyEnvelope).credential_id }
      await expectRefusal(Envelope.openWithPasskey(answering, scope, bundle), 'wrong_passkey')
    })
  }

  it("refuses to open with its salt swapped for another, the answer kept", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const bundle = bundleWith([{ ...await sealedPasskey(laptop, 'laptop', await makeVaultKey()), prf_salt_b64: otherSalt }])
    await expectRefusal(Envelope.openWithPasskey({ ...laptop, prfSaltB64: otherSalt }, scope, bundle), 'wrong_passkey')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const otherVault = VaultBundle.parse(TH.bundleOf('u1', { vault_id: 'vault-id-other', unlocks: [envelope] }))
    await expectRefusal(Envelope.openWithPasskey(laptop, scope, otherVault), 'wrong_passkey')
    await expectRefusal(Envelope.openWithPasskey(laptop, TH.scopeOf('u2'), bundleWith([envelope])), 'wrong_passkey')
  })

  it("refuses to open in a bundle whose registered_at was altered", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const redated = VaultBundle.parse(TH.bundleOf('u1', { registered_at: identity.registered_at + 1, unlocks: [envelope] }))
    await expectRefusal(Envelope.openWithPasskey(laptop, scope, redated), 'wrong_passkey')
  })
})

/** Unwrap `envelope` under the key HKDF makes of `prfBytes` with `info`, its wrap bound to `binding`. */
const unwrapsUnder = async (envelope: PasskeyEnvelope, prfBytes: Uint8Array, info: Uint8Array, binding: Uint8Array) => {
  const passkeyKey = await deriveWrappingKey(prfBytes, info)
  return await unwrapKeyUnder(passkeyKey, envelope.vault_key_wrapped, binding, { extractable: false, usage: ['wrapKey'] })
}

describe("a passkey envelope's key", () => {
  it("is HKDF over the answer with the wrap's whole binding as its info: scope, vault_id, registered_at, purpose and header", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const { vault_key_wrapped: _wrapped, ...header } = envelope
    const binding = cipherBinding('safebyok-vault-v2', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header)
    expect(await unwrapsUnder(envelope, laptop.prfBytes, binding, binding)).to.be.instanceOf(CryptoKey)
  })

  it("is not the key an info of the purpose and credential alone makes: the vault is in it", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const envelope = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const { vault_key_wrapped: _wrapped, ...header } = envelope
    const binding = cipherBinding('safebyok-vault-v2', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header)
    const vaultlessInfo = cipherBinding('safebyok-vault-v2', 'vault_key_passkey_wrapped', laptop.credentialId)
    await expect(unwrapsUnder(envelope, laptop.prfBytes, vaultlessInfo, binding)).rejects.toThrow()
  })
})

describe("Envelope.open", () => {
  it("opens with a passphrase as openWithPassphrase does, passing over the passkeys", async () => {
    const vaultKey = await makeVaultKey()
    const { keyDeriver, derivations } = countingDeriver()
    const bundle = bundleWith([await sealedPasskey(await TH.passkeyOf('laptop'), 'laptop', vaultKey), await sealed('pw', 'passphrase', vaultKey)])
    const opened = await Envelope.open(keyDeriver, 'pw', scope, bundle)
    expect(opened.unlockId).to.eq('unlock-passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Envelope.open(keyDeriver, 'pw', scope, bundle, 'unlock-laptop'), 'absent_unlock')
  })

  it("opens with a passkey's answer as openWithPasskey does, with no key derivation", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const { keyDeriver, derivations } = countingDeriver()
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey)])
    const opened = await Envelope.open(keyDeriver, laptop, scope, bundle)
    expect(opened.unlockId).to.eq('unlock-laptop')
    expect(derivations).not.toHaveBeenCalled()
  })
})
