import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { makeLeaseKey, makeVaultKey } from '../../src/helpers/crypto'
import * as Phrases from '../../src/helpers/phrases'
import { PasskeySaltBytes } from '../../src/helpers/consts'
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

describe("gatingLaunchArgs", () => {
  const friend = { unlockByProof: () => undefined, landGate: () => undefined }
  const scope  = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }

  it("takes a kind, a scope and the friend's two verbs, and refuses a friend short of one", () => {
    expect(GX.gatingLaunchArgs.parse({ gatingkind: 'add_passkey', scope, friend }).gatingkind).to.eq('add_passkey')
    TH.expectSyncRefusal(() => GX.gatingLaunchArgs.parse({ gatingkind: 'add_passkey', scope, friend: { landGate: friend.landGate } }))
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
  it("takes a passkey's answer, its bytes the very ones handed in", async () => {
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
    expect(err.message).to.eq(`prf_salt_b64: ${Phrases.prfSaltNotFresh(PasskeySaltBytes)}`)
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
