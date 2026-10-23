import { afterEach, describe, expect, it } from 'vitest'
import { PasskeySaltBytes, VaultError, localVaultDB, memoryDeviceDB, memoryStore, type PasskeyAnswer, type PasskeyWayinSummary, type VaultDB } from 'safebyok'
import { fromB64, toB64 } from 'safebyok/utils'
import { askPasskey, createPasskey, passkeysAvailable } from '../src/passkey'
import * as TH from './test-helpers'

const passkeyOpts = { rp: { name: 'Acme' }, user: { name: 'ada@example.com', displayName: 'Ada' } }

/** A new passkey's answer from the fake authenticator; fails the test when it makes none. */
const madePasskey = async () => {
  const answer = await createPasskey(passkeyOpts)
  if (answer === null) { throw new Error('the fake authenticator made no passkey') }
  return answer
}

/** Expect `operation` to reject with a VaultError of `kind`; hands the error back for a closer look. */
const expectRefusal = async (operation: Promise<unknown>, kind: VaultError['refusalkind']): Promise<VaultError> => {
  try {
    await operation
  } catch (err) {
    expect(err).to.be.instanceOf(VaultError)
    expect((err as VaultError).refusalkind).to.eq(kind)
    return err as VaultError
  }
  throw new Error(`expected a VaultError of kind '${kind}', but nothing was thrown`)
}

/** The vault's passkey as its snapshot has it, for `proof`. */
const summaryOf = (proof: PasskeyAnswer): PasskeyWayinSummary => ({
  wayinkind: 'passkey', device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15), vault_tok: 'vault-tok-u1',
  credential_id: proof.credentialId, prf_salt_b64: proof.prfSaltB64,
})

/** A fresh vault in memory, made with the passphrase `pw` and unlocked, and an opener for another device on the same storage. */
const vaultInMemory = async () => {
  const vaultDB: VaultDB = localVaultDB({ store: memoryStore() })
  const open = async () => await TH.settledVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker })
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
  it("makes a passkey and hands back its answer over a fresh salt, for the vault's putWayin", async () => {
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
  it("asks the vault's passkey over its own salt, and hands back its answer", async () => {
    const fake = install()
    const laptop = await createPasskey(passkeyOpts)
    if (laptop === null) { throw new Error('the fake authenticator made no passkey') }
    const answered = await askPasskey(summaryOf(laptop), { rpId: 'acme.example' })
    expect(answered).to.deep.equal(laptop)
    const request = fake.calls.get[0]?.publicKey
    expect(request?.allowCredentials).to.have.lengthOf(1)
    expect(request?.rpId).to.eq('acme.example')
    expect(request?.userVerification).to.eq('required')
    expect(Object.keys(request?.extensions?.prf?.evalByCredential ?? {})).to.deep.equal([laptop.credentialId])
  })

  it("refuses as absent_wayin a vault with no passkey, before the browser is asked", async () => {
    const fake = install()
    await expectRefusal(askPasskey(null), 'absent_wayin')
    expect(fake.calls.get).to.have.lengthOf(0)
  })

  const DamagedCases = [
    ["credential_id", "not base64url!", 'a credential id that is not base64url'],
    ["prf_salt_b64",  "not base64url!", 'a salt that is not base64url'],
    ["prf_salt_b64",  "c2FsdA",         'a salt short of PasskeySaltBytes'],
  ] as const

  for (const [field, val, blurb] of DamagedCases) {
    it(`refuses as damaged_wayin a passkey stored with ${blurb}, before the browser is asked`, async () => {
      const fake = install()
      const damaged = { ...summaryOf(await TH.passkeyOf('laptop')), [field]: val }
      await expectRefusal(askPasskey(damaged), 'damaged_wayin')
      expect(fake.calls.get).to.have.lengthOf(0)
    })
  }

  it("resolves null when the user dismisses the prompt, or has not the passkey at hand", async () => {
    const fake = install()
    const laptop = await createPasskey(passkeyOpts)
    if (laptop === null) { throw new Error('the fake authenticator made no passkey') }
    fake.refuseNext('NotAllowedError')
    expect(await askPasskey(summaryOf(laptop))).to.be.null
    const elsewhere = await TH.passkeyOf('elsewhere')
    expect(await askPasskey(summaryOf(elsewhere))).to.be.null
  })

  it("refuses as passkey_unavailable a passkey that gives no answer, and a browser without WebAuthn", async () => {
    const laptop = await TH.passkeyOf('laptop')
    await expectRefusal(askPasskey(summaryOf(laptop)), 'passkey_unavailable')
    const fake = install({ prf: false })
    await expectRefusal(createPasskey(passkeyOpts), 'passkey_unavailable')
    const [credentialId = ''] = fake.credentialIds()
    const stray = { ...await TH.passkeyOf('stray'), credentialId }
    await expectRefusal(askPasskey(summaryOf(stray)), 'passkey_unavailable')
  })
})

describe("a passkey unlock, end to end", () => {
  it("createPasskey's answer puts the vault's passkey, and askPasskey's opens the vault on another device, as their examples show", async () => {
    install()
    const { vault, open } = await vaultInMemory()
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const answer = await createPasskey(passkeyOpts)
    if (answer !== null) { await vault.putWayin('pw', answer) }
    expect(vault.getSnapshot().passkey?.credential_id).to.eq(answer?.credentialId)

    const elsewhere = await open()
    expect(elsewhere.getSnapshot().state).to.eq('locked')
    const passkey = await askPasskey(elsewhere.getSnapshot().passkey)
    if (passkey !== null) { await elsewhere.unlock(passkey) }
    expect(await elsewhere.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("createPasskey resolves null when the user dismisses its prompt, as its example says, so nothing reaches the vault", async () => {
    const fake = install()
    const { vault } = await vaultInMemory()
    fake.refuseNext('NotAllowedError')
    const answer = await createPasskey(passkeyOpts)
    expect(answer).to.be.null
    if (answer !== null) { await vault.putWayin('pw', answer) }
    expect(vault.getSnapshot().passkey).to.be.null
  })

  it("a passkey added again takes the first's place: askPasskey asks only the new one", async () => {
    const fake = install()
    const { vault, open } = await vaultInMemory()
    await vault.putWayin('pw', await madePasskey())
    const [first = ''] = fake.credentialIds()
    await vault.putWayin('pw', await madePasskey())
    const elsewhere = await open()
    const { passkey } = elsewhere.getSnapshot()
    expect(passkey?.credential_id).to.not.eq(first)
    const asked = await askPasskey(passkey)
    expect(asked?.credentialId).to.eq(passkey?.credential_id)
  })
})
