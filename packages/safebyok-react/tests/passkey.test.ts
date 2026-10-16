import { afterEach, describe, expect, it } from 'vitest'
import { PasskeySaltBytes, VaultError, localVaultDB, memoryDeviceDB, memoryStore, openVault, type PasskeyProof, type UnlockSummary, type VaultDB } from 'safebyok'
import { fromB64, toB64 } from 'safebyok/utils'
import { askPasskey, createPasskey, passkeysAvailable } from '../src/passkey'
import * as TH from './test-helpers'

const passkeyOpts = { rp: { name: 'Acme' }, user: { name: 'ada@example.com', displayName: 'Ada' } }

/** Expect `operation` to reject with a VaultError of `kind`; hands the error back for a closer look. */
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

/** A passkey's way in as the snapshot lists it, for `proof`. */
const summaryOf = (proof: PasskeyProof, unlocklabel: string): UnlockSummary => ({
  method: 'passkey', unlock_id: `unlock-${unlocklabel}`, unlocklabel, credential_id: proof.credentialId, prf_salt_b64: proof.prfSaltB64,
})

const passphraseSummary: UnlockSummary = { method: 'passphrase', unlock_id: 'unlock-passphrase', unlocklabel: 'passphrase' }

/** A fresh vault in memory, made with the passphrase `pw` and unlocked, and an opener for another device on the same storage. */
const vaultInMemory = async () => {
  const vaultDB: VaultDB = localVaultDB({ store: memoryStore() })
  const open = async () => await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest })
  const vault = await open()
  await vault.unlock('pw')
  return { vault, open }
}

const install = (opts?: TH.FakeAuthenticatorOpts) => TH.installFakeAuthenticator(opts)
afterEach(TH.uninstallFakeAuthenticator)

describe("passkeysAvailable", () => {
  it("is false in a browser without WebAuthn, and true with it", () => {
    expect(passkeysAvailable()).to.be.false
    install()
    expect(passkeysAvailable()).to.be.true
  })
})

describe("createPasskey", () => {
  it("makes a passkey and hands back its answer over a fresh salt, for the vault's addPasskey", async () => {
    install()
    const passkey = await createPasskey(passkeyOpts)
    expect(passkey).to.not.be.null
    expect(fromB64(passkey?.prfSaltB64 ?? '')).to.have.lengthOf(PasskeySaltBytes)
    expect(passkey?.prfBytes).to.have.lengthOf(32)
    const again = await createPasskey(passkeyOpts)
    expect(again?.prfSaltB64).to.not.eq(passkey?.prfSaltB64)
    expect(again?.credentialId).to.not.eq(passkey?.credentialId)
  })

  it("asks for user verification, under a random user handle, with the host's names", async () => {
    const fake = install()
    await createPasskey({ ...passkeyOpts, rp: { name: 'Acme', id: 'acme.example' }, timeout: 30_000 })
    await createPasskey(passkeyOpts)
    const [first, second] = fake.calls.create.map((call) => call.publicKey)
    expect(first?.authenticatorSelection?.userVerification).to.eq('required')
    expect(first?.rp).to.deep.equal({ name: 'Acme', id: 'acme.example' })
    expect(first?.timeout).to.eq(30_000)
    expect(first?.user).to.include({ name: 'ada@example.com', displayName: 'Ada' })
    expect(toB64(first?.user.id as Uint8Array)).to.not.eq(toB64(second?.user.id as Uint8Array))
    expect(second?.rp).to.deep.equal({ name: 'Acme' })
    expect(second).to.not.have.property('timeout')
  })

  it("asks the new passkey again when its authenticator answers only when asked", async () => {
    const fake = install({ prfAtCreate: false })
    const passkey = await createPasskey(passkeyOpts)
    expect(fake.calls.get).to.have.lengthOf(1)
    expect(fake.calls.get[0]?.publicKey?.userVerification).to.eq('required')
    expect(passkey?.prfBytes).to.have.lengthOf(32)
  })

  it("refuses as passkey_unavailable an authenticator without PRF, and a browser without WebAuthn", async () => {
    await expectRefusal(createPasskey(passkeyOpts), 'passkey_unavailable')
    install({ prf: false })
    await expectRefusal(createPasskey(passkeyOpts), 'passkey_unavailable')
  })

  it("resolves null when the user dismisses the prompt, at either step", async () => {
    const fake = install({ prfAtCreate: false })
    fake.refuseNext('NotAllowedError')
    expect(await createPasskey(passkeyOpts)).to.be.null
    fake.refuseNext('AbortError')
    expect(await createPasskey(passkeyOpts)).to.be.null
  })

  it("refuses a relying party the page cannot claim as bad_option, and any other browser refusal as passkey_unavailable", async () => {
    const fake = install()
    fake.refuseNext('SecurityError')
    await expectRefusal(createPasskey(passkeyOpts), 'bad_option')
    fake.refuseNext('UnknownError')
    const err = await expectRefusal(createPasskey(passkeyOpts), 'passkey_unavailable')
    expect(err.cause).to.be.instanceOf(DOMException)
  })
})

describe("askPasskey", () => {
  it("offers every passkey of the vault, each with its own salt, and hands back the one touched", async () => {
    const fake = install()
    const laptop = await createPasskey(passkeyOpts)
    const phone = await createPasskey(passkeyOpts)
    if (laptop === null || phone === null) { throw new Error('the fake authenticator made no passkey') }
    fake.touch(phone.credentialId)
    const answered = await askPasskey([passphraseSummary, summaryOf(laptop, 'laptop'), summaryOf(phone, 'phone')], { rpId: 'acme.example' })
    expect(answered).to.deep.equal(phone)
    const request = fake.calls.get[0]?.publicKey
    expect(request?.allowCredentials).to.have.lengthOf(2)
    expect(request?.rpId).to.eq('acme.example')
    expect(request?.userVerification).to.eq('required')
    expect(Object.keys(request?.extensions?.prf?.evalByCredential ?? {})).to.have.members([laptop.credentialId, phone.credentialId])
  })

  it("refuses as absent_unlock a vault with no passkey, and as damaged_unlock one whose every passkey is stored damaged", async () => {
    install()
    await expectRefusal(askPasskey([passphraseSummary]), 'absent_unlock')
    const damaged = { ...summaryOf(await TH.passkeyOf('laptop'), 'laptop'), credential_id: 'not base64url!' }
    const saltless = { ...summaryOf(await TH.passkeyOf('phone'), 'phone'), prf_salt_b64: 'not base64url!' }
    const shortSalted = { ...summaryOf(await TH.passkeyOf('tablet'), 'tablet'), prf_salt_b64: 'c2FsdA' }
    await expectRefusal(askPasskey([passphraseSummary, damaged, saltless, shortSalted]), 'damaged_unlock')
  })

  it("leaves out a passkey stored damaged, and asks the others", async () => {
    const fake = install()
    const phone = await createPasskey(passkeyOpts)
    if (phone === null) { throw new Error('the fake authenticator made no passkey') }
    fake.touch(phone.credentialId)
    const damaged = { ...summaryOf(await TH.passkeyOf('laptop'), 'laptop'), credential_id: 'not base64url!' }
    expect(await askPasskey([damaged, summaryOf(phone, 'phone')])).to.deep.equal(phone)
    expect(Object.keys(fake.calls.get[0]?.publicKey?.extensions?.prf?.evalByCredential ?? {})).to.deep.equal([phone.credentialId])
  })

  it("resolves null when the user dismisses the prompt, or has none of the passkeys at hand", async () => {
    const fake = install()
    const laptop = await createPasskey(passkeyOpts)
    if (laptop === null) { throw new Error('the fake authenticator made no passkey') }
    fake.refuseNext('NotAllowedError')
    expect(await askPasskey([summaryOf(laptop, 'laptop')])).to.be.null
    const elsewhere = await TH.passkeyOf('elsewhere')
    expect(await askPasskey([summaryOf(elsewhere, 'elsewhere')])).to.be.null
  })

  it("refuses as passkey_unavailable a passkey that gives no answer, and a browser without WebAuthn", async () => {
    const laptop = await TH.passkeyOf('laptop')
    await expectRefusal(askPasskey([summaryOf(laptop, 'laptop')]), 'passkey_unavailable')
    const fake = install({ prf: false })
    await expectRefusal(createPasskey(passkeyOpts), 'passkey_unavailable')
    const [credentialId = ''] = fake.credentialIds()
    const stray = { ...await TH.passkeyOf('stray'), credentialId }
    await expectRefusal(askPasskey([summaryOf(stray, 'stray')]), 'passkey_unavailable')
  })
})

describe("a passkey unlock, end to end", () => {
  it("createPasskey's answer adds a way in, and askPasskey's opens the vault on another device", async () => {
    install()
    const { vault, open } = await vaultInMemory()
    await vault.store('anthropic', 'sk-fake')
    const unlockId = await vault.addPasskey('pw', () => createPasskey(passkeyOpts), { unlocklabel: 'laptop' })
    if (unlockId === null) { throw new Error('the fake authenticator made no passkey') }

    const elsewhere = await open()
    expect(elsewhere.getSnapshot().state).to.eq('locked')
    const asked = await askPasskey(elsewhere.getSnapshot().unlocks)
    if (asked === null) { throw new Error('the fake authenticator gave no answer') }
    await elsewhere.unlock(asked)
    expect(await elsewhere.read('anthropic')).to.eq('sk-fake')
  })
})
