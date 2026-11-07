import { describe, expect, it } from 'vitest'
import { PasskeySaltBytes, PrfAnswerBytes, VaultError, type WayinHeader } from 'safebyok'
import { fromB64 } from 'safebyok/utils'
import { Messages } from '../src/messages'
import { askPasskey, attemptOnce, createPasskey, passkeysAvailable } from '../src/passkey'
import * as TH from './test-helpers'

TH.sweepBankWorlds()

/** The passkey header a vault holding the passkey `credential_id` keeps on its gate. */
const headerOf = (credential_id: string, prf_salt_b64: string): WayinHeader => ({
  wayinkind: 'passkey', credential_id, prf_salt_b64, device_id: TH.DeviceId, registered_at: 0,
}) as WayinHeader

/** The refusal `promise` rejects with. */
const refusalOf = async (promise: Promise<unknown>): Promise<VaultError> => {
  try {
    await promise
  } catch (err) {
    expect(err).to.be.instanceOf(VaultError)
    return err as VaultError
  }
  throw new Error('resolved, unrefused')
}

describe("passkeysAvailable", () => {
  it("is false in a browser without WebAuthn, and true with it", () => {
    expect(passkeysAvailable()).to.be.false
    TH.installFakeAuthenticator()
    expect(passkeysAvailable()).to.be.true
  })
})

describe("createPasskey", () => {
  it("makes a passkey and hands back its answer over a fresh salt", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const made = await createPasskey(TH.PasskeyMaking)
    expect(made).to.not.be.null
    expect(authenticator.credentialIds()).to.deep.equal([made?.credential_id])
    expect(fromB64(made?.prf_salt_b64 ?? '')).to.have.length(PasskeySaltBytes)
    expect(made?.prfBytes).to.have.length(PrfAnswerBytes)
    expect(made?.prfBytes.some((byte) => byte !== 0)).to.be.true
  })

  it("zeroes the browser's own copy of the answer once copied, so the answer's bytes are the one copy", async () => {
    const authenticator = TH.installFakeAuthenticator()
    await createPasskey(TH.PasskeyMaking)
    const [handed] = authenticator.answersHanded()
    expect(handed?.every((byte) => byte === 0)).to.be.true
  })

  it("asks for user verification, under a random user handle, with the host's names", async () => {
    const authenticator = TH.installFakeAuthenticator()
    await createPasskey({ ...TH.PasskeyMaking, rp: { name: 'Acme', id: 'example.com' }, timeout: 30_000 })
    await createPasskey(TH.PasskeyMaking)
    const [first, second] = authenticator.calls.create.map((call) => call.publicKey)
    expect(first?.authenticatorSelection?.userVerification).to.equal('required')
    expect(first?.rp).to.deep.equal({ name: 'Acme', id: 'example.com' })
    expect(first?.timeout).to.equal(30_000)
    expect(first?.user).to.include({ name: 'u1 (main vault)', displayName: 'u1' })
    expect(first?.user.id).to.not.deep.equal(second?.user.id)
    expect(second?.rp).to.not.have.property('id')
  })

  it("asks the new passkey again when its authenticator answers only when asked", async () => {
    const authenticator = TH.installFakeAuthenticator({ prfAtCreate: false })
    const made = await createPasskey(TH.PasskeyMaking)
    expect(authenticator.calls.get).to.have.length(1)
    expect(made?.prfBytes.some((byte) => byte !== 0)).to.be.true
  })

  it("refuses, in words a dialog shows, an authenticator without PRF and a browser without WebAuthn", async () => {
    expect(await refusalOf(createPasskey(TH.PasskeyMaking))).to.include({ refusalkind: 'wrong_passkey', message: Messages.noWebAuthn })
    TH.installFakeAuthenticator({ prf: false })
    expect(await refusalOf(createPasskey(TH.PasskeyMaking))).to.include({ refusalkind: 'wrong_passkey', message: Messages.noPrf })
  })

  it("resolves null when the user dismisses the prompt, at either step", async () => {
    const authenticator = TH.installFakeAuthenticator({ prfAtCreate: false })
    authenticator.refuseNext('NotAllowedError')
    expect(await createPasskey(TH.PasskeyMaking)).to.be.null
    const making = createPasskey(TH.PasskeyMaking)
    authenticator.refuseNext('NotAllowedError')
    expect(await making).to.be.null
  })

  it("refuses a relying party the page cannot claim as misuse, and any other browser failure in words a dialog shows", async () => {
    const authenticator = TH.installFakeAuthenticator()
    authenticator.refuseNext('SecurityError')
    expect(await refusalOf(createPasskey(TH.PasskeyMaking))).to.include({ refusalkind: 'bad_option', family: 'misuse' })
    authenticator.refuseNext('UnknownError')
    const failed = await refusalOf(createPasskey(TH.PasskeyMaking))
    expect(failed).to.include({ refusalkind: 'wrong_passkey', message: Messages.passkeyAskFailed })
    expect(failed.cause).to.be.instanceOf(DOMException)
  })
})

describe("askPasskey", () => {
  it("asks the vault's passkey over its own salt, and hands back the answer it gave as made", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const made = await createPasskey(TH.PasskeyMaking)
    const madeBytes = Uint8Array.from(made?.prfBytes ?? [])
    const asked = await askPasskey(headerOf(made?.credential_id ?? '', made?.prf_salt_b64 ?? ''), { rpId: 'example.com' })
    expect(asked).to.include({ credential_id: made?.credential_id, prf_salt_b64: made?.prf_salt_b64 })
    expect(asked?.prfBytes).to.deep.equal(madeBytes)
    const [call] = authenticator.calls.get
    expect(call?.publicKey).to.include({ rpId: 'example.com', userVerification: 'required' })
  })

  it("refuses a vault with no passkey before the browser is asked", async () => {
    const authenticator = TH.installFakeAuthenticator()
    expect(await refusalOf(askPasskey(null))).to.include({ refusalkind: 'absent_wayin', message: Messages.noPasskeyToAsk })
    expect(authenticator.calls.get).to.have.length(0)
  })

  it("refuses a passkey stored under a credential id that is not base64url, before the browser is asked", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const asking = askPasskey(headerOf('not base64url!', 'AAAA'))
    expect(await refusalOf(asking)).to.include({ refusalkind: 'bad_record' })
    expect(authenticator.calls.get).to.have.length(0)
  })

  it("resolves null when the user dismisses the prompt, or has not the passkey at hand", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const made = await createPasskey(TH.PasskeyMaking)
    authenticator.refuseNext('NotAllowedError')
    const [held, absent] = [headerOf(made?.credential_id ?? '', made?.prf_salt_b64 ?? ''), headerOf('AAAAAAAAAAAAAAAAAAAAAA', made?.prf_salt_b64 ?? '')]
    expect(await askPasskey(held)).to.be.null
    expect(await askPasskey(absent)).to.be.null
  })

  it("refuses, in words a dialog shows, in a browser without WebAuthn", async () => {
    const asking = askPasskey(headerOf('AAAA', 'AAAA'))
    expect(await refusalOf(asking)).to.include({ refusalkind: 'wrong_passkey', message: Messages.noWebAuthn })
  })
})

describe("attemptOnce", () => {
  it("zeroes the answer's bytes once its attempt settles, ok or not", async () => {
    TH.installFakeAuthenticator()
    const made = await createPasskey(TH.PasskeyMaking)
    if (made === null) { throw new Error('dismissed') }
    const live = await attemptOnce(made, (passkey) => Promise.resolve(passkey.prfBytes.some((byte) => byte !== 0)))
    expect(live).to.be.true
    expect(made.prfBytes.every((byte) => byte === 0)).to.be.true
    const again = await createPasskey(TH.PasskeyMaking)
    if (again === null) { throw new Error('dismissed') }
    const attempting = attemptOnce(again, () => Promise.reject(new VaultError('wrong_passkey', 'refused')))
    expect(await refusalOf(attempting)).to.include({ refusalkind: 'wrong_passkey' })
    expect(again.prfBytes.every((byte) => byte === 0)).to.be.true
  })
})

describe("a passkey unlock, end to end", () => {
  it("createPasskey's answer adds the vault's passkey, and askPasskey's opens the vault on another device, as their examples show", async () => {
    TH.installFakeAuthenticator()
    const world = TH.makeBankWorld()
    const { vault } = await TH.makeBankWithVault(world)
    await TH.addPasskeyTo(world, vault, await createPasskey(TH.PasskeyMaking))
    const { gating, raising } = await TH.heldGatingOf(world, TH.unlocking)
    const passkeyClear = await askPasskey(gating.passkeyHeader)
    if (passkeyClear === null) { throw new Error('dismissed') }
    expect(await TH.gatingOfKind(gating, 'unlock_vault').attempt({ passkeyClear })).to.include({ ok: true })
    expect(await raising).to.include({ ok: true })
  })

  it("an add_passkey gating takes the passphrase and createPasskey's answer in one attempt", async () => {
    TH.installFakeAuthenticator()
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const { gating, raising } = await TH.heldGatingOf(world, TH.addingPasskey)
    const passkeyClear = await createPasskey(TH.PasskeyMaking)
    if (passkeyClear === null) { throw new Error('dismissed') }
    expect(await TH.gatingOfKind(gating, 'add_passkey').attempt({ passphraseClear: TH.Passphrase, passkeyClear })).to.include({ ok: true })
    expect(await raising).to.include({ ok: true })
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })
})
