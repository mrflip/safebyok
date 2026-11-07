import { describe, expect, it, vi } from 'vitest'
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

const Making = TH.PasskeyMaking

const SloppyMakingCases = [
  // the bag itself:
  [undefined,                                                        'no options at all'],
  ["Acme",                                                           'a string in place of the options'],
  [{ ...Making, rpId: "example.com" },                               "a field the options do not take, as askPasskey's rpId"],
  // the relying party and the user:
  [{ ...Making, rp: undefined },                                     'no relying party'],
  [{ ...Making, rp: { name: "" } },                                  'a relying party with a blank name'],
  [{ ...Making, rp: { name: "Acme", id: 42 } },                      'a relying party id that is no string'],
  [{ ...Making, rp: { name: "Acme", domain: "example.com" } },       'a misspelt relying party id'],
  [{ ...Making, user: { name: "u1" } },                              'a user without a displayName'],
  [{ ...Making, user: { ...Making.user, id: "u1" } },                "the host's own user id, which would replace its sign-in passkey"],
  // the timeout:
  [{ ...Making, timeout: "30s" },                                    'a timeout in words'],
  [{ ...Making, timeout: -1 },                                       'a negative timeout'],
  [{ ...Making, timeout: 1.5 },                                      'a fractional timeout'],
] as const

describe("createPasskey's options", () => {
  for (const [given, blurb] of SloppyMakingCases) {
    it(`refuses ${blurb}, before the browser is asked`, async () => {
      const authenticator = TH.installFakeAuthenticator()
      expect(await refusalOf(createPasskey(given as never))).to.include({ refusalkind: 'bad_option', family: 'misuse' })
      expect(authenticator.calls.create).to.have.lengthOf(0)
    })
  }

  it("takes a relying party id and a timeout left undefined as left out", async () => {
    const authenticator = TH.installFakeAuthenticator()
    expect(await createPasskey({ rp: { name: 'Acme', id: undefined }, user: Making.user, timeout: undefined })).to.not.be.null
    expect(authenticator.calls.create[0]?.publicKey).to.not.have.property('timeout')
  })
})

describe("createPasskey", () => {
  it("makes a passkey and hands back its answer over a fresh salt", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const made = await createPasskey(TH.PasskeyMaking)
    expect(made).to.not.be.null
    expect(authenticator.credentialIds()).to.deep.equal([made?.credential_id])
    expect(fromB64(made?.prf_salt_b64 ?? '')).to.have.lengthOf(PasskeySaltBytes)
    expect(made?.prfBytes).to.have.lengthOf(PrfAnswerBytes)
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
    expect(authenticator.calls.get).to.have.lengthOf(1)
    expect(made?.prfBytes.some((byte) => byte !== 0)).to.be.true
  })

  it("refuses, in words a dialog shows, an authenticator without PRF and a browser without WebAuthn", async () => {
    expect(await refusalOf(createPasskey(TH.PasskeyMaking))).to.include({ refusalkind: 'passkey_unavailable', message: Messages.noWebAuthn })
    TH.installFakeAuthenticator({ prf: false })
    expect(await refusalOf(createPasskey(TH.PasskeyMaking))).to.include({ refusalkind: 'passkey_unavailable', message: Messages.noPrf })
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
    expect(failed).to.include({ refusalkind: 'passkey_unavailable', message: Messages.passkeyAskFailed })
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
    expect(authenticator.calls.get).to.have.lengthOf(0)
  })

  it("refuses a passkey stored under a credential id that is not base64url, before the browser is asked", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const asking = askPasskey(headerOf('not base64url!', 'AAAA'))
    expect(await refusalOf(asking)).to.include({ refusalkind: 'bad_record' })
    expect(authenticator.calls.get).to.have.lengthOf(0)
  })

  it("resolves null when the user dismisses the prompt, or has not the passkey at hand", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const made = await createPasskey(TH.PasskeyMaking)
    authenticator.refuseNext('NotAllowedError')
    const [held, absent] = [headerOf(made?.credential_id ?? '', made?.prf_salt_b64 ?? ''), headerOf('AAAAAAAAAAAAAAAAAAAAAA', made?.prf_salt_b64 ?? '')]
    expect(await askPasskey(held)).to.be.null
    expect(await askPasskey(absent)).to.be.null
  })

  it("refuses an answer from a passkey it did not offer, zeroing that answer", async () => {
    TH.installFakeAuthenticator()
    const made = await createPasskey(TH.PasskeyMaking)
    const answer = crypto.getRandomValues(new Uint8Array(PrfAnswerBytes))
    const otherCredential = { type: 'public-key', rawId: new Uint8Array(16).buffer, getClientExtensionResults: () => ({ prf: { results: { first: answer } } }) }
    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(otherCredential as unknown as Credential)
    const asking = askPasskey(headerOf(made?.credential_id ?? '', made?.prf_salt_b64 ?? ''))
    expect(await refusalOf(asking)).to.include({ refusalkind: 'passkey_unavailable', message: Messages.passkeyAskFailed })
    expect(answer.every((byte) => byte === 0)).to.be.true
  })

  it("refuses, in words a dialog shows, in a browser without WebAuthn", async () => {
    const asking = askPasskey(headerOf('AAAA', 'AAAA'))
    expect(await refusalOf(asking)).to.include({ refusalkind: 'passkey_unavailable', message: Messages.noWebAuthn })
  })
})

const SloppyAskingCases = [
  // the header:
  [undefined,                                       {},                        'no header at all'],
  [{ wayinkind: "passkey" },                        {},                        'a passkey header without its credential id or salt'],
  [{ wayinkind: "passkey", credential_id: "AAAA" }, {},                        'a passkey header without its salt'],
  [{ wayinkind: "sms" },                            {},                        'a header of no wayinkind there is'],
  [() => null,                                      {},                        'a function in place of the header'],
  // the options:
  [null,                                            null,                      'null options'],
  [null,                                            { rpid: "example.com" },   'a misspelt rpId'],
  [null,                                            { rpId: "" },              'a blank rpId'],
  [null,                                            { timeout: 0 },            'a timeout of nothing'],
] as const

describe("askPasskey's header and options", () => {
  for (const [header, opts, blurb] of SloppyAskingCases) {
    it(`refuses ${blurb}, before the browser is asked`, async () => {
      const authenticator = TH.installFakeAuthenticator()
      expect(await refusalOf(askPasskey(header as never, opts as never))).to.include({ refusalkind: 'bad_option', family: 'misuse' })
      expect(authenticator.calls.get).to.have.lengthOf(0)
    })
  }

  // No vault the core read holds such a salt: it came from the host.
  it("refuses a salt that is not base64url", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const refused = await refusalOf(askPasskey(headerOf('AAAA', 'not base64url!')))
    expect(refused).to.include({ refusalkind: 'bad_option' })
    expect(refused.message).to.include('prf_salt_b64')
    expect(authenticator.calls.get).to.have.lengthOf(0)
  })

  it("refuses a passphrase header as a vault with no passkey", async () => {
    TH.installFakeAuthenticator()
    const refused = await refusalOf(askPasskey({ wayinkind: 'passphrase', key_deriver_label: 'argon2id' } as never))
    expect(refused).to.include({ refusalkind: 'absent_wayin' })
  })
})

describe("attemptOnce's answer", () => {
  it("refuses an answer without bytes, never calling the attempt", async () => {
    const attempt = vi.fn(() => Promise.resolve(true))
    for (const passkey of [null, {}, { credential_id: 'AAAA', prfBytes: [1, 2, 3] }]) {
      expect(await refusalOf(attemptOnce(passkey as never, attempt))).to.include({ refusalkind: 'bad_option', family: 'misuse' })
    }
    expect(attempt).not.toHaveBeenCalled()
  })

  it("zeroes the answer's bytes when it refuses an attempt that is no function", async () => {
    const passkey = { credential_id: 'AAAA', prf_salt_b64: 'AAAA', prfBytes: crypto.getRandomValues(new Uint8Array(PrfAnswerBytes)) }
    expect(await refusalOf(attemptOnce(passkey, 'attempt' as never))).to.include({ refusalkind: 'bad_option' })
    expect(passkey.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("quotes none of a malformed answer in its refusal", async () => {
    const passkey = { credential_id: 'AAAA', prf_salt_b64: 'AAAA', prfBytes: 'sentinel-not-a-secret' }
    const refused = await refusalOf(attemptOnce(passkey as never, () => Promise.resolve(true)))
    expect(refused.message).to.not.include('sentinel')
    expect(JSON.stringify(refused)).to.not.include('sentinel')
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
  it("opens the vault on another device with the passkey createPasskey made", async () => {
    // createPasskey @example, askPasskey @example
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
