import { describe, expect, it, vi } from 'vitest'
import { cipherCtx, deriveWrappingKey, makeLockboxKey, makeVaultKey, toB64, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import * as Wayin from '../src/wayin'
import { VaultError } from '../src/errors'
import type { KeyDeriver } from '../src/key-deriver'
import { VaultBundle, type PasskeyWayin, type PasskeyProof, type PassphraseWayin } from '../src/types'
import * as TH from './test-helpers'

const scope = TH.scopeOf('u1')
/** The bundle every wayin here is sealed for: its `vault_id` and `registered_at` are what a wrap binds of it. */
const identity = TH.bundleOf('u1')

/** A testDeriver that counts its derivations: the deriver, and the spy that counts. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

/** What a way in labelled `wayinlabel` is stamped with: its id, the bundle's vaultKey epoch, the device that added it and when. */
const stampOf = (wayinlabel: string): Wayin.WayinStamp => ({
  wayin_id:       `wayin-${wayinlabel}`,
  wayinlabel,
  vault_key_epoch: 1,
  device_id:       'device-one',
  registered_at:   Date.UTC(2026, 9, 15),
})

/** A real passphrase wayin around `vaultKey`, labelled `wayinlabel`. */
const sealed = async (passphrase: string, wayinlabel: string, vaultKey: CryptoKey, keyDeriver: KeyDeriver = TH.testDeriver) => {
  return await Wayin.sealPassphrase(keyDeriver, passphrase, scope, identity, stampOf(wayinlabel), vaultKey)
}

/** A bundle of `wayins`, validated as storage would read it back. */
const bundleWith = (wayins: VaultBundle['wayins']): VaultBundle => VaultBundle.parse(TH.bundleOf('u1', { wayins }))

/** A bundle of `wayins` at its second vaultKey, the first kept as its prior, validated as storage would read it back. */
const secondKeyBundleWith = (wayins: VaultBundle['wayins']): VaultBundle => VaultBundle.parse({ ...TH.rotatedBundleOf('u1'), wayins })

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

describe("Wayin.sealPassphrase", () => {
  it("makes a valid passphrase wayin that names its deriver and a fresh salt", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealed('pw', 'passphrase', vaultKey)
    const two = await sealed('pw', 'home_phrase', vaultKey)
    expect(VaultBundle.safeParse(TH.bundleOf('u1', { wayins: [one, two] })).success).to.be.true
    expect(one).to.include({ wayinkind: 'passphrase', wayin_id: 'wayin-passphrase', wayinlabel: 'passphrase', key_deriver_label: 'test_digest_v0' })
    expect(one).to.include({ vault_key_epoch: 1, device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15) })
    expect(one.salt_b64).to.not.eq(two.salt_b64)
  })

})

describe("Wayin.sealFirstPassphrase", () => {
  it("makes the wayin sealPassphrase would, and hands back a session handle on the vaultKey that cannot be exported", async () => {
    const vaultKey = await makeVaultKey()
    const { wayin, sessionKey } = await Wayin.sealFirstPassphrase(TH.testDeriver, 'pw', scope, identity, stampOf('one'), vaultKey)
    expect(wayin).to.include({ wayinkind: 'passphrase', wayin_id: 'wayin-one', key_deriver_label: 'test_digest_v0' })
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
    const wayin = await sealed('pw', 'passphrase', await makeVaultKey(), keyDeriver)
    expect(handed).to.have.lengthOf(1)
    expect([...handed[0] ?? []]).to.deep.equal(bytesOf(0, 32))
    // The key made of them still opens what it wrapped: zeroing is after the import.
    const opened = await Wayin.openWithPassphrase(TH.testDeriver, 'pw', scope, bundleWith([wayin]))
    expect(opened.wayinId).to.eq('wayin-passphrase')
  })

  it("are zeroed after every try when opening, a wrong passphrase's included", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, handed } = keepingDeriver()
    await expectRefusal(Wayin.openWithPassphrase(keyDeriver, 'neither', scope, bundle), 'wrong_passphrase')
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
    const err = await expectRefusal(Wayin.sealPassphrase(keyDeriver, 'pw', scope, identity, stampOf('one'), await makeVaultKey()), 'bad_option')
    expect(err.message).to.include('SharedArrayBuffer')
    expect(err.message).to.not.include('5,5')
  })

  it("are zeroed when refused for their length, as when imported", async () => {
    const long = new Uint8Array(64).fill(5)
    const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(long) }
    await expectRefusal(Wayin.sealPassphrase(keyDeriver, 'pw', scope, identity, stampOf('one'), await makeVaultKey()), 'bad_option')
    expect([...long]).to.deep.equal(bytesOf(0, 64))
  })

  it("are refused as bad_option when they are not 32 bytes of a view at all", async () => {
    for (const handed of [new Uint8Array(31), new Uint8Array(33), 'thirty-two bytes, honest', null, new ArrayBuffer(32)]) {
      const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(handed as unknown as Uint8Array) }
      await expectRefusal(Wayin.sealPassphrase(keyDeriver, 'pw', scope, identity, stampOf('one'), await makeVaultKey()), 'bad_option')
    }
  })
})

describe("Wayin.openWithPassphrase", () => {
  it("opens the wayin the passphrase belongs to, and says which", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'passphrase', vaultKey), await sealed('second', 'home_phrase', vaultKey)])
    const opened = await Wayin.openWithPassphrase(TH.testDeriver, 'second', scope, bundle)
    expect(opened.wayinId).to.eq('wayin-home_phrase')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
    expect(opened.sessionKey.extractable).to.be.false
  })

  it("tries the wayins in order, one derivation each, and stops at the first that opens", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey), await sealed('third', 'three', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    await Wayin.openWithPassphrase(keyDeriver, 'second', scope, bundle)
    expect(derivations).toHaveBeenCalledTimes(2)
  })

  it("refuses a wrong passphrase only after trying every wayin", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const err = await expectRefusal(Wayin.openWithPassphrase(keyDeriver, 'neither', scope, bundle), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(2)
    expect(err.message).to.not.include('neither')
  })

  it("says how many passphrases another key deriver made went untried, and that opening the vault where it was made may help", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey, alienDeriver), await sealed('third', 'three', vaultKey, alienDeriver)])
    const err = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'second', scope, bundle), 'wrong_passphrase')
    expect(err.message).to.include('2 of this vault\'s passphrases were made with a key deriver this package does not carry')
    expect(err.message).to.include('open the vault where it was made')
    expect(err.message).to.not.include('second')
  })

  it("says it of one passphrase in the singular", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey, alienDeriver)])
    const err = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'second', scope, bundle), 'wrong_passphrase')
    expect(err.message).to.include("One of this vault's passphrases was made with a key deriver this package does not carry, so it was not tried")
  })

  it("says it beside a damaged passphrase too, and says nothing of other derivers when none was passed over", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const damagedToo = bundleWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }, await sealed('third', 'three', vaultKey, alienDeriver)])
    const told = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'nope', scope, damagedToo), 'wrong_passphrase')
    expect(told.message).to.include('stored damaged')
    expect(told.message).to.include('One of this vault')
    const soundOnly = bundleWith([await sealed('first', 'one', vaultKey)])
    const plain = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'nope', scope, soundOnly), 'wrong_passphrase')
    expect(plain.message).to.not.include('key deriver')
  })

  it("aimed at one wayin, derives once, and refuses a passphrase that is another's", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const opened = await Wayin.openWithPassphrase(keyDeriver, 'second', scope, bundle, 'wayin-two')
    expect(opened.wayinId).to.eq('wayin-two')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'first', scope, bundle, 'wayin-two'), 'wrong_passphrase')
  })

  it("refuses an aim at a wayin_id the bundle does not hold", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey)])
    await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'first', scope, bundle, 'wayin-gone'), 'absent_wayin')
  })

  it("refuses as unknown_key_deriver when no wayin it would try was made by this deriver", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey)])
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    await expectRefusal(Wayin.openWithPassphrase(alienDeriver, 'first', scope, bundle), 'unknown_key_deriver')
  })

  // A salt no deriver of its label could have made: each decodes, or not, but never to 16 bytes.
  const DamagedSaltCases = [
    ["c2FsdA",       'a salt of another length, base64url that decodes and so passes the schema'],
    ["not base64!",  'a salt of text that is not base64url'],
    ["aaaaa",        'a salt of base64url letters that decode to no whole bytes'],
  ] as const

  describe("over a wayin stored damaged", () => {
    for (const [saltB64, blurb] of DamagedSaltCases) {
      it(`passes over one with ${blurb}, deriving nothing for it, and opens a sound one`, async () => {
        const vaultKey = await makeVaultKey()
        const bundle = bundleWith([{ ...await sealed('first', 'one', vaultKey), salt_b64: saltB64 }, await sealed('second', 'two', vaultKey)])
        const { keyDeriver, derivations } = countingDeriver()
        const opened = await Wayin.openWithPassphrase(keyDeriver, 'second', scope, bundle)
        expect(opened.wayinId).to.eq('wayin-two')
        expect(derivations).toHaveBeenCalledTimes(1)
      })
    }

    it("refuses as wrong_passphrase, saying a damaged one went untried, when no sound one opens", async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'second', scope, bundle), 'wrong_passphrase')
      expect(err.message).to.include('stored damaged')
    })

    it("refuses as damaged_wayin, deriving nothing, when every one it would try is damaged", async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([{ ...await sealed('first', 'one', vaultKey), salt_b64: 'c2FsdA' }, { ...await sealed('second', 'two', vaultKey), salt_b64: 'aaaaa' }])
      const { keyDeriver, derivations } = countingDeriver()
      const err = await expectRefusal(Wayin.openWithPassphrase(keyDeriver, 'first', scope, bundle), 'damaged_wayin')
      expect(err.message).to.include('Every passphrase')
      expect(derivations).not.toHaveBeenCalled()
    })

    it("refuses as damaged_wayin, not saying every passphrase is damaged, when another deriver made the rest", async () => {
      const vaultKey = await makeVaultKey()
      const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
      const bundle = bundleWith([await sealed('first', 'one', vaultKey, alienDeriver), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'first', scope, bundle), 'damaged_wayin')
      expect(err.message).to.include('a key deriver this package does not carry')
      expect(err.message).to.not.include('Every passphrase of this vault is stored damaged')
    })

    it("passes over, deriving nothing for it, a wayin at another vaultKey epoch than the bundle's, and opens a sound one beside it", async () => {
      const vaultKey = await makeVaultKey()
      const spliced = { ...await sealed('second', 'two', vaultKey), vault_key_epoch: 2 }
      const bundle = bundleWith([spliced, await sealed('first', 'one', vaultKey)])
      const { keyDeriver, derivations } = countingDeriver()
      await expectRefusal(Wayin.openWithPassphrase(keyDeriver, 'second', scope, bundle), 'wrong_passphrase')
      expect(derivations).toHaveBeenCalledTimes(1)
      const opened = await Wayin.openWithPassphrase(TH.testDeriver, 'first', scope, bundle)
      expect(opened.wayinId).to.eq('wayin-one')
    })

    it("refuses as damaged_wayin when every passphrase is at another vaultKey epoch than the bundle's", async () => {
      const vaultKey = await makeVaultKey()
      const bundle = secondKeyBundleWith([await sealed('first', 'one', vaultKey)])
      const err = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'first', scope, bundle), 'damaged_wayin')
      expect(err.message).to.include('Every passphrase')
    })

    it("refuses as damaged_wayin an aim at a damaged one, though a sound one stands beside it", async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'first', scope, bundle, 'wayin-two'), 'damaged_wayin')
      expect(err.message).to.include("That passphrase's way into the vault")
    })
  })

  it("says, refusing a passphrase no wayin opens, that the stored vault may be damaged", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = bundleWith([await sealed('first', 'one', vaultKey)])
    const err = await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'wrong', scope, bundle), 'wrong_passphrase')
    expect(err.message).to.include('Check for typos')
    expect(err.message).to.include('the stored vault may be damaged')
  })

  it("passes over wayins another deriver made, and opens one this deriver did", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const bundle = bundleWith([await sealed('first', 'one', vaultKey, alienDeriver), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const opened = await Wayin.openWithPassphrase(keyDeriver, 'second', scope, bundle)
    expect(opened.wayinId).to.eq('wayin-two')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'first', scope, bundle), 'wrong_passphrase')
  })
})

/** Each of a wayin's public fields altered: every one is in its wrap's ctx. */
const TamperCases: readonly (readonly [Partial<PassphraseWayin>, string])[] = [
  [{ wayin_id: 'wayin-elsewhere' },              'its wayin_id swapped'],
  [{ wayinlabel: 'relabelled' },                 'its wayinlabel swapped'],
  [{ key_deriver_label: 'test_digest_v1' },      'its key_deriver_label swapped, to one the deriver then wears'],
  [{ device_id: 'device-elsewhere' },            'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) },      'its registered_at moved'],
]

describe("a wayin's ctx", () => {
  for (const [altered, blurb] of TamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const vaultKey = await makeVaultKey()
      const bundle = bundleWith([{ ...await sealed('pw', 'passphrase', vaultKey), ...altered }])
      const keyDeriver = { ...TH.testDeriver, key_deriver_label: (bundle.wayins[0] as PassphraseWayin).key_deriver_label }
      await expectRefusal(Wayin.openWithPassphrase(keyDeriver, 'pw', scope, bundle), 'wrong_passphrase')
    })
  }

  it("refuses to open with its vault_key_epoch moved, though the bundle's is moved with it", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = secondKeyBundleWith([{ ...await sealed('pw', 'passphrase', vaultKey), vault_key_epoch: 2 }])
    await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle), 'wrong_passphrase')
  })

  it("refuses to open with its salt swapped for another wayin's", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealed('pw', 'one', vaultKey)
    const two = await sealed('pw', 'two', vaultKey)
    const bundle = bundleWith([{ ...one, salt_b64: two.salt_b64 }])
    await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle), 'wrong_passphrase')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = await sealed('pw', 'passphrase', vaultKey)
    const otherVault = VaultBundle.parse(TH.bundleOf('u1', { vault_id: 'vault-id-other', wayins: [wayin] }))
    await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'pw', scope, otherVault), 'wrong_passphrase')
    await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'pw', TH.scopeOf('u2'), bundleWith([wayin])), 'wrong_passphrase')
  })

  it("refuses to open in a bundle whose registered_at was altered", async () => {
    const wayin = await sealed('pw', 'passphrase', await makeVaultKey())
    const redated = VaultBundle.parse(TH.bundleOf('u1', { registered_at: identity.registered_at + 1, wayins: [wayin] }))
    await expectRefusal(Wayin.openWithPassphrase(TH.testDeriver, 'pw', scope, redated), 'wrong_passphrase')
  })

  it("does not bind the unlock epoch: a wayin opens at any epoch of its vault", async () => {
    const vaultKey = await makeVaultKey()
    const bundle = VaultBundle.parse(TH.bundleOf('u1', { unlock_epoch: 7, wayins: [await sealed('pw', 'passphrase', vaultKey)] }))
    const opened = await Wayin.openWithPassphrase(TH.testDeriver, 'pw', scope, bundle)
    expect(opened.wayinId).to.eq('wayin-passphrase')
  })
})

describe("Wayin.summarize", () => {
  it("gives the method, id, label and the device and time that added it, and nothing of the salt or wrap", async () => {
    const wayin = await sealed('pw', 'passphrase', await makeVaultKey())
    expect(Wayin.summarize(wayin)).to.deep.equal({
      wayinkind: 'passphrase', wayin_id: 'wayin-passphrase', wayinlabel: 'passphrase', device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15),
    })
  })

  it("gives a passkey's credential and salt besides, what a host asks its authenticator with, and not its wrap", () => {
    const wayin = TH.passkeyWayinOf('laptop')
    expect(Wayin.summarize(wayin)).to.deep.equal({
      wayinkind: 'passkey', wayin_id: 'wayin-laptop', wayinlabel: 'laptop', device_id: wayin.device_id, registered_at: wayin.registered_at,
      credential_id: 'cred-laptop', prf_salt_b64: wayin.prf_salt_b64,
    })
  })
})

/** A real passkey wayin around `vaultKey`, labelled `wayinlabel`, for the passkey `passkey` answered. */
const sealedPasskey = async (passkey: PasskeyProof, wayinlabel: string, vaultKey: CryptoKey) => {
  return await Wayin.sealPasskey(passkey, scope, identity, stampOf(wayinlabel), vaultKey)
}

describe("Wayin.sealPasskey", () => {
  it("makes a valid passkey wayin that keeps the credential and its salt, and never the answer", async () => {
    const passkey = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(passkey, 'laptop', await makeVaultKey())
    const bundle = TH.bundleOf('u1', { wayins: [TH.wayinOf('passphrase'), wayin] })
    expect(VaultBundle.safeParse(bundle).success).to.be.true
    expect(wayin).to.include({ wayinkind: 'passkey', wayin_id: 'wayin-laptop', wayinlabel: 'laptop', credential_id: passkey.credentialId, prf_salt_b64: passkey.prfSaltB64 })
    expect(JSON.stringify(wayin)).to.not.include(toB64(passkey.prfBytes))
  })
})

describe("Wayin.openWithPasskey", () => {
  it("opens the wayin of the credential that answered, among passphrases and other passkeys", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const phone = await TH.passkeyOf('phone')
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey), await sealedPasskey(phone, 'phone', vaultKey)])
    const opened = await Wayin.openWithPasskey(phone, scope, bundle)
    expect(opened.wayinId).to.eq('wayin-phone')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
    expect(opened.sessionKey.extractable).to.be.false
    const aimed = await Wayin.openWithPasskey(laptop, scope, bundle, 'wayin-laptop')
    expect(aimed.wayinId).to.eq('wayin-laptop')
  })

  it("refuses as absent_wayin a passkey the vault does not hold, or one aimed at another way in", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey)])
    await expectRefusal(Wayin.openWithPasskey(await TH.passkeyOf('stranger'), scope, bundle), 'absent_wayin')
    await expectRefusal(Wayin.openWithPasskey(laptop, scope, bundle, 'wayin-passphrase'), 'absent_wayin')
  })

  it("refuses as wrong_passkey an answer over another salt, or one that does not open the wayin", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealedPasskey(laptop, 'laptop', vaultKey)])
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    await expectRefusal(Wayin.openWithPasskey(await TH.passkeyOf('laptop', otherSalt), scope, bundle), 'wrong_passkey')
    await expectRefusal(Wayin.openWithPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, scope, bundle), 'wrong_passkey')
  })

  it("refuses as damaged_wayin a wayin whose salt is not base64url of 32 bytes", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', vaultKey)
    for (const prfSaltB64 of ['not base64url!', toB64(new Uint8Array(16))]) {
      const bundle = bundleWith([{ ...wayin, prf_salt_b64: prfSaltB64 }])
      await expectRefusal(Wayin.openWithPasskey({ ...laptop, prfSaltB64 }, scope, bundle), 'damaged_wayin')
    }
  })

  it("refuses as damaged_wayin a wayin at another vaultKey epoch than the bundle's", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const bundle = bundleWith([{ ...wayin, vault_key_epoch: 2 }])
    const err = await expectRefusal(Wayin.openWithPasskey(laptop, scope, bundle), 'damaged_wayin')
    expect(err.message).to.include('stored damaged')
  })

  it("says, refusing an answer for its own salt that does not open it, that the way in may be damaged", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealedPasskey(laptop, 'laptop', await makeVaultKey())])
    const err = await expectRefusal(Wayin.openWithPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, scope, bundle), 'wrong_passkey')
    expect(err.message).to.include('may be damaged')
    expect(err.message).to.include('Unlock with a passphrase')
  })

  it("never refuses with the answer in the error", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const bundle = bundleWith([await sealedPasskey(laptop, 'laptop', await makeVaultKey())])
    const err = await expectRefusal(Wayin.openWithPasskey({ ...laptop, prfBytes: laptop.prfBytes.toReversed() }, scope, bundle), 'wrong_passkey')
    expect(JSON.stringify({ kind: err.kind, message: err.message, cause: err.cause })).to.not.include(toB64(laptop.prfBytes))
  })
})

const PasskeyTamperCases = [
  [{ wayin_id: 'wayin-other' },     'its wayin_id changed'],
  [{ wayinlabel: 'other' },          'its wayinlabel changed'],
  [{ credential_id: 'Y3JlZC1vdGhlcg' }, 'its credential_id swapped, the answer kept'],
  [{ device_id: 'device-elsewhere' },  'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) }, 'its registered_at moved'],
] as const

describe("a passkey wayin's ctx", () => {
  for (const [altered, blurb] of PasskeyTamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const laptop = await TH.passkeyOf('laptop')
      const bundle = bundleWith([{ ...await sealedPasskey(laptop, 'laptop', await makeVaultKey()), ...altered }])
      const answering = { ...laptop, credentialId: (bundle.wayins[0] as PasskeyWayin).credential_id }
      await expectRefusal(Wayin.openWithPasskey(answering, scope, bundle), 'wrong_passkey')
    })
  }

  it("refuses to open with its salt swapped for another, the answer kept", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const bundle = bundleWith([{ ...await sealedPasskey(laptop, 'laptop', await makeVaultKey()), prf_salt_b64: otherSalt }])
    await expectRefusal(Wayin.openWithPasskey({ ...laptop, prfSaltB64: otherSalt }, scope, bundle), 'wrong_passkey')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const otherVault = VaultBundle.parse(TH.bundleOf('u1', { vault_id: 'vault-id-other', wayins: [wayin] }))
    await expectRefusal(Wayin.openWithPasskey(laptop, scope, otherVault), 'wrong_passkey')
    await expectRefusal(Wayin.openWithPasskey(laptop, TH.scopeOf('u2'), bundleWith([wayin])), 'wrong_passkey')
  })

  it("refuses to open in a bundle whose registered_at was altered", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const redated = VaultBundle.parse(TH.bundleOf('u1', { registered_at: identity.registered_at + 1, wayins: [wayin] }))
    await expectRefusal(Wayin.openWithPasskey(laptop, scope, redated), 'wrong_passkey')
  })
})

/** Unwrap `wayin` under the key HKDF makes of `prfBytes` with `info`, its wrap bound to `ctx`. */
const unwrapsUnder = async (wayin: PasskeyWayin, prfBytes: Uint8Array, info: Uint8Array, ctx: Uint8Array) => {
  const passkeyKey = await deriveWrappingKey(prfBytes, info)
  return await unwrapKeyUnder(passkeyKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })
}

describe("a passkey wayin's key", () => {
  it("is HKDF over the answer with the wrap's whole ctx as its info: scope, vault_id, registered_at, purpose and header", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const { vault_key_wayin_wrapped: _wrapped, ...header } = wayin
    const ctx = cipherCtx('safebyok-vault-v3', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header)
    expect(await unwrapsUnder(wayin, laptop.prfBytes, ctx, ctx)).to.be.instanceOf(CryptoKey)
  })

  it("is not the key an info of the purpose and credential alone makes: the vault is in it", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const { vault_key_wayin_wrapped: _wrapped, ...header } = wayin
    const ctx = cipherCtx('safebyok-vault-v3', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header)
    const vaultlessInfo = cipherCtx('safebyok-vault-v3', 'vault_key_passkey_wrapped', laptop.credentialId)
    await expect(unwrapsUnder(wayin, laptop.prfBytes, vaultlessInfo, ctx)).rejects.toThrow()
  })
})

describe("Wayin.open", () => {
  it("opens with a passphrase as openWithPassphrase does, passing over the passkeys", async () => {
    const vaultKey = await makeVaultKey()
    const { keyDeriver, derivations } = countingDeriver()
    const bundle = bundleWith([await sealedPasskey(await TH.passkeyOf('laptop'), 'laptop', vaultKey), await sealed('pw', 'passphrase', vaultKey)])
    const opened = await Wayin.open(keyDeriver, 'pw', scope, bundle)
    expect(opened.wayinId).to.eq('wayin-passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
    await expectRefusal(Wayin.open(keyDeriver, 'pw', scope, bundle, 'wayin-laptop'), 'absent_wayin')
  })

  it("opens with a passkey's answer as openWithPasskey does, with no key derivation", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const { keyDeriver, derivations } = countingDeriver()
    const bundle = bundleWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey)])
    const opened = await Wayin.open(keyDeriver, laptop, scope, bundle)
    expect(opened.wayinId).to.eq('wayin-laptop')
    expect(derivations).not.toHaveBeenCalled()
  })
})
