import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { makeLeaseKey, makeVaultKey } from '../../src/helpers/crypto'
import * as Phrases from '../../src/helpers/phrases'
import { PasskeySaltBytes } from '../../src/helpers/consts'
import { parseLogger } from '../../src/helpers/logger'
import * as GX from '../../src/shapes/shapes-gateish'
import type { PasskeyAnswer } from '../../src/shapes/shapes-gateish'
import * as TH from '../test-helpers'

describe("wayinkind", () => {
  it("takes each kind of wayin, and refuses any other slot", () => {
    expect(GX.wayinkind.safeParse('passkey').success).to.be.true
    expect(GX.wayinkind.parse('passphrase')).to.eq('passphrase')
    TH.expectSyncRefusal(() => GX.wayinkind.parse('hunter2'))
  })
})

describe("guardedLogger", () => {
  const bare = { log: () => undefined, warn: () => undefined, error: () => undefined }

  it("takes a logger parseLogger guarded", () => {
    const guarded = parseLogger(bare)
    expect(GX.guardedLogger.parse(guarded)).to.eq(guarded)
  })

  it("refuses a bare logger", () => {
    TH.expectSyncRefusal(() => GX.guardedLogger.parse(bare), 'bad_option')
  })
})

describe("callGatingByKind", () => {
  const vault = { modelkind: 'vault' }
  const unlockByProof = () => Promise.resolve(vault)

  it("passes a born vault's gating kind, the vault, its unlock and the clears, handing on the vault and clears it was given", () => {
    const clears = { passphraseClear: TH.Passphrase }
    const checked = GX.callGatingByKind.parse({ gatingkind: 'add_passkey', vault, clears, unlockByProof })
    expect(checked.vault).to.eq(vault)
    expect(checked.clears).to.eq(clears)
  })

  it("leaves the clears unread, for the act's own check", () => {
    const clears = new Proxy({}, { get: () => { throw new Error('read') }, ownKeys: () => { throw new Error('read') } })
    expect(GX.callGatingByKind.parse({ gatingkind: 'del_vault', vault, clears, unlockByProof }).clears).to.eq(clears)
  })

  it("refuses a build_vault, a kind it does not know, what is no vault, and an unlock that is no function", () => {
    TH.expectSyncRefusal(() => GX.callGatingByKind.parse({ gatingkind: 'build_vault', vault, clears: {}, unlockByProof }), 'bad_option')
    TH.expectSyncRefusal(() => GX.callGatingByKind.parse({ gatingkind: 'open_sesame', vault, clears: {}, unlockByProof }), 'bad_option')
    TH.expectSyncRefusal(() => GX.callGatingByKind.parse({ gatingkind: 'add_passkey', vault: { modelkind: 'box' }, clears: {}, unlockByProof }), 'bad_option')
    TH.expectSyncRefusal(() => GX.callGatingByKind.parse({ gatingkind: 'add_passkey', vault, clears: {}, unlockByProof: null }), 'bad_option')
  })
})

// == [Proofs]: passkeyAnswer

/** What is no passkey's answer, each refused, and the field the refusal names. */
const misshapenAnswers = (answer: PasskeyAnswer) => [
  [{ ...answer, prfBytes: [...answer.prfBytes] },          'prfBytes',      'its bytes an array, not a Uint8Array'],
  [{ ...answer, prfBytes: answer.prfBytes.subarray(1) },   'prfBytes',      'its bytes one short of 32'],
  [{ ...answer, credential_id: '' },                       'credential_id', 'an empty credential'],
  [{ ...answer, prf_salt_b64: undefined },                 'prf_salt_b64',  'no salt'],
] as const

describe("passkeyAnswer", () => {
  it("accepts a passkey's answer without copying its bytes", async () => {
    const answer = await TH.passkeyOf('laptop')
    const checked = GX.passkeyAnswer.parse(answer)
    expect(checked).to.include({ credential_id: answer.credential_id, prf_salt_b64: answer.prf_salt_b64 })
    expect(checked.prfBytes).to.eq(answer.prfBytes)
  })

  it("takes bytes made in another realm, an iframe's or a test's jsdom, judging them by their tag", async () => {
    const answer = await TH.passkeyOf('laptop')
    const foreign = runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array
    expect(foreign instanceof Uint8Array).to.be.false
    expect(GX.passkeyAnswer.parse({ ...answer, prfBytes: foreign }).prfBytes).to.eq(foreign)
  })

  describe("refuses", () => {
    // passkeyAnswer @example
    it("an answer already used, its bytes zeroed", async () => {
      const answer = await TH.passkeyOf('laptop')
      const err = TH.expectSyncRefusal(() => GX.passkeyAnswer.parse({ ...answer, prfBytes: new Uint8Array(32) }))
      expect(err.message).to.match(/^prfBytes: .*used already/)
    })

    it("what is no answer at all", () => {
      for (const given of ["pw", 42, null, { credential_id: 'abc' }]) {
        TH.expectSyncRefusal(() => GX.passkeyAnswer.parse(given))
      }
    })

    it("a misshapen answer, naming the field and quoting none of it", async () => {
      const answer = await TH.passkeyOf('laptop')
      for (const [given, fieldname, blurb] of misshapenAnswers(answer)) {
        const err = TH.expectSyncRefusal(() => GX.passkeyAnswer.parse(given))
        expect(err.message, blurb).to.match(new RegExp(`^${fieldname}: `))
        expect(JSON.stringify({ message: err.message, cause: err.cause }), blurb).to.not.include(answer.credential_id)
      }
    })
  })
})

describe("freshPasskeyAnswer", () => {
  it("takes a passkey's answer over a fresh salt", async () => {
    const answer = await TH.passkeyOf('laptop')
    expect(GX.freshPasskeyAnswer.parse(answer)).to.include({ credential_id: answer.credential_id, prf_salt_b64: answer.prf_salt_b64 })
  })

  // freshPasskeyAnswer @example
  it("refuses an answer over a salt too short, naming the salt", async () => {
    const answer = await TH.passkeyOf('laptop')
    const err = TH.expectSyncRefusal(() => GX.freshPasskeyAnswer.parse({ ...answer, prf_salt_b64: 'c2hvcnQ' }))
    expect(err.message).to.eq(`prf_salt_b64: ${Phrases.prfSaltShape(PasskeySaltBytes)}`)
  })
})
// --

describe("isLeaseKey", () => {
  it("is true for a leaseKey as makeLeaseKey makes one", async () => {
    expect(GX.isLeaseKey(await makeLeaseKey())).to.be.true
  })

  // isLeaseKey @example
  it("is false for an extractable key", async () => {
    expect(GX.isLeaseKey(await makeVaultKey())).to.be.false
  })
})
