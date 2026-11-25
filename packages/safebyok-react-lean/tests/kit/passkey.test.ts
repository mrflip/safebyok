import { describe, expect, it, vi } from 'vitest'
import { PasskeySaltSize, PrfAnswerSize, VaultError, fromB64, type WayinHeader } from 'safebyok'
import { askPasskey, createPasskey, passkeysAvailable } from '../../src/kit/passkey'
import { KitPhrases } from '../../src/kit/phrases-kit'
import * as TH from '../test-helpers'

/** The passkey header that a vault with the passkey `credential_id` has on its gate. */
function headerOf(credential_id: string, prf_salt_b64: string): WayinHeader {
  return { wayinkind: 'passkey', label: 'passkey0', credential_id, prf_salt_b64, devicetok: TH.Devicetok, born_at: 0 } as WayinHeader
}

/** The refusal that `promise` rejects with. */
async function refusalOf(promise: Promise<unknown>): Promise<VaultError> {
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
  [{ ...Making, rpId: "example.com" },                               "a field the options do not accept, as askPasskey's rpId"],
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
      expect(await refusalOf(createPasskey(given as never))).to.include({ refusalkind: 'bad_record', family: 'misuse' })
      expect(authenticator.calls.create).to.have.lengthOf(0)
    })
  }

  it("treats an undefined relying party id or timeout as omitted", async () => {
    const authenticator = TH.installFakeAuthenticator()
    expect(await createPasskey({ rp: { name: 'Acme', id: undefined }, user: Making.user, timeout: undefined })).to.not.be.null
    expect(authenticator.calls.create[0]?.publicKey).to.not.have.property('timeout')
  })
})

describe("createPasskey", () => {
  it("makes a passkey and hands back its answer over a fresh salt", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const made = await createPasskey(Making)
    expect(made).to.not.be.null
    expect(authenticator.credentialIds()).to.deep.equal([made?.credential_id])
    expect(fromB64(made?.prf_salt_b64 ?? '')).to.have.lengthOf(PasskeySaltSize)
    expect(made?.prfBytes).to.have.lengthOf(PrfAnswerSize)
    expect(made?.prfBytes.some((byte) => byte !== 0)).to.be.true
  })

  it("zeroes the browser's own copy of the answer once it is copied", async () => {
    const authenticator = TH.installFakeAuthenticator()
    await createPasskey(Making)
    const [handed] = authenticator.answersHanded()
    expect(handed?.every((byte) => byte === 0)).to.be.true
  })

  it("asks for user verification, under a random user handle, with the host's names", async () => {
    const authenticator = TH.installFakeAuthenticator()
    await createPasskey({ ...Making, rp: { name: 'Acme', id: 'example.com' }, timeout: 30_000 })
    await createPasskey(Making)
    const [first, second] = authenticator.calls.create.map((call) => call.publicKey)
    expect(first?.authenticatorSelection?.userVerification).to.eq('required')
    expect(first?.rp).to.deep.equal({ name: 'Acme', id: 'example.com' })
    expect(first?.timeout).to.eq(30_000)
    expect(first?.user).to.include({ name: 'u1 (main vault)', displayName: 'u1' })
    expect(first?.user.id).to.not.deep.equal(second?.user.id)
    expect(second?.rp).to.not.have.property('id')
  })

  it("asks the new passkey a second time when its authenticator gives no answer at creation", async () => {
    const authenticator = TH.installFakeAuthenticator({ prfAtCreate: false })
    const made = await createPasskey(Making)
    expect(authenticator.calls.get).to.have.lengthOf(1)
    expect(made?.prfBytes.some((byte) => byte !== 0)).to.be.true
  })

  it("refuses, in words a form shows, an authenticator without PRF and a browser without WebAuthn", async () => {
    expect(await refusalOf(createPasskey(Making))).to.include({ refusalkind: 'passkey_unavailable', message: KitPhrases.noWebAuthn })
    TH.installFakeAuthenticator({ prf: false })
    expect(await refusalOf(createPasskey(Making))).to.include({ refusalkind: 'passkey_unavailable', message: KitPhrases.noPrf })
  })

  it("resolves null when the user dismisses the prompt, at either step", async () => {
    const authenticator = TH.installFakeAuthenticator({ prfAtCreate: false })
    authenticator.refuseNext('NotAllowedError')
    expect(await createPasskey(Making)).to.be.null
    const making = createPasskey(Making)
    authenticator.refuseNext('NotAllowedError')
    expect(await making).to.be.null
  })

  it("refuses a relying party the page cannot claim as misuse, and any other browser failure in words a form shows", async () => {
    const authenticator = TH.installFakeAuthenticator()
    authenticator.refuseNext('SecurityError')
    expect(await refusalOf(createPasskey(Making))).to.include({ refusalkind: 'bad_record', family: 'misuse' })
    authenticator.refuseNext('UnknownError')
    const failed = await refusalOf(createPasskey(Making))
    expect(failed).to.include({ refusalkind: 'passkey_unavailable', message: KitPhrases.passkeyAskFailed })
    expect(failed.cause).to.be.instanceOf(DOMException)
  })
})

describe("askPasskey", () => {
  it("asks the vault's passkey with its stored salt, and returns the same answer it gave when made", async () => {
    // askPasskey @example
    const authenticator = TH.installFakeAuthenticator()
    const made = await createPasskey(Making)
    const madeBytes = Uint8Array.from(made?.prfBytes ?? [])
    const asked = await askPasskey(headerOf(made?.credential_id ?? '', made?.prf_salt_b64 ?? ''), { rpId: 'example.com' })
    expect(asked).to.include({ credential_id: made?.credential_id, prf_salt_b64: made?.prf_salt_b64 })
    expect(asked?.prfBytes).to.deep.equal(madeBytes)
    const [call] = authenticator.calls.get
    expect(call?.publicKey).to.include({ rpId: 'example.com', userVerification: 'required' })
  })

  it("refuses a vault with no passkey before the browser is asked", async () => {
    const authenticator = TH.installFakeAuthenticator()
    expect(await refusalOf(askPasskey(null))).to.include({ refusalkind: 'absent_wayin', message: KitPhrases.noPasskeyToAsk })
    expect(authenticator.calls.get).to.have.lengthOf(0)
  })

  it("refuses a passkey stored under a credential id that is not base64url, before the browser is asked", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const passkeyHeader = headerOf('not base64url!', 'AAAA')
    expect(await refusalOf(askPasskey(passkeyHeader))).to.include({ refusalkind: 'bad_record' })
    expect(authenticator.calls.get).to.have.lengthOf(0)
  })

  it("resolves null when the user dismisses the prompt or does not have the passkey", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const made = await createPasskey(Making)
    authenticator.refuseNext('NotAllowedError')
    const [stored, absent] = [headerOf(made?.credential_id ?? '', made?.prf_salt_b64 ?? ''), headerOf('AAAAAAAAAAAAAAAAAAAAAA', made?.prf_salt_b64 ?? '')]
    expect(await askPasskey(stored)).to.be.null
    expect(await askPasskey(absent)).to.be.null
  })

  it("refuses an answer from a passkey it did not offer, zeroing that answer", async () => {
    TH.installFakeAuthenticator()
    const made = await createPasskey(Making)
    const answer = crypto.getRandomValues(new Uint8Array(PrfAnswerSize))
    const otherCredential = { type: 'public-key', rawId: new Uint8Array(16).buffer, getClientExtensionResults: () => ({ prf: { results: { first: answer } } }) }
    vi.spyOn(navigator.credentials, 'get').mockResolvedValue(otherCredential as unknown as Credential)
    const asking = askPasskey(headerOf(made?.credential_id ?? '', made?.prf_salt_b64 ?? ''))
    expect(await refusalOf(asking)).to.include({ refusalkind: 'passkey_unavailable', message: KitPhrases.passkeyAskFailed })
    expect(answer.every((byte) => byte === 0)).to.be.true
  })

  it("refuses, in words a form shows, in a browser without WebAuthn", async () => {
    const passkeyHeader = headerOf('AAAA', 'AAAA')
    expect(await refusalOf(askPasskey(passkeyHeader))).to.include({ refusalkind: 'passkey_unavailable', message: KitPhrases.noWebAuthn })
  })
})

const SloppyAskingCases = [
  // the header:
  [undefined,                                       {},                        'no header at all'],
  [{ wayinkind: "passkey" },                        {},                        'a passkey header without its credential id or salt'],
  [{ wayinkind: "passkey", credential_id: "AAAA" }, {},                        'a passkey header without its salt'],
  [{ wayinkind: "sms" },                            {},                        'a header with an unknown wayinkind'],
  [() => null,                                      {},                        'a function in place of the header'],
  // the options:
  [null,                                            null,                      'null options'],
  [null,                                            { rpid: "example.com" },   'a misspelt rpId'],
  [null,                                            { rpId: "" },              'a blank rpId'],
  [null,                                            { timeout: 0 },            'a timeout of zero'],
] as const

describe("askPasskey's header and options", () => {
  for (const [header, opts, blurb] of SloppyAskingCases) {
    it(`refuses ${blurb}, before the browser is asked`, async () => {
      const authenticator = TH.installFakeAuthenticator()
      expect(await refusalOf(askPasskey(header as never, opts as never))).to.include({ refusalkind: 'bad_record', family: 'misuse' })
      expect(authenticator.calls.get).to.have.lengthOf(0)
    })
  }

  // The core never reads a vault with a salt like this, so a header that has one came from the host.
  it("refuses a salt that is not base64url", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const refused = await refusalOf(askPasskey(headerOf('AAAA', 'not base64url!')))
    expect(refused).to.include({ refusalkind: 'bad_record' })
    expect(refused.message).to.include('prf_salt_b64')
    expect(authenticator.calls.get).to.have.lengthOf(0)
  })

  it("refuses a passphrase header like a vault with no passkey", async () => {
    TH.installFakeAuthenticator()
    expect(await refusalOf(askPasskey({ wayinkind: 'passphrase', key_deriver_label: 'argon2id' } as never))).to.include({ refusalkind: 'absent_wayin' })
  })
})
