/** What a proving does today that a guarantee or the spec forbids, pinned as it is until the Coach rules. Each `it` names its source and line. */

import { describe, expect, it, vi } from 'vitest'
import { PasskeySaltBytes } from '../../src/consts'
import { randomBytes, toB64 } from '../../src/crypto'
import type { KeyDeriver } from '../../src/key-deriver'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { _cheat_vaultKeyBytesOf, asVault, duckVaultOf, fakeDBFriendOf, isZeroed, passkeyAnswerOf, proofClosureOf, provingWorldOf, sealStampsOf, TestPassphrase, useFakeClock, WeekMillis } from '../test-helpers/proving-world'

useFakeClock()

const shortSaltB64 = (): string => toB64(randomBytes(PasskeySaltBytes - 1))

describe("PasskeyProving.make, called directly", () => {
  it("notes/guarantees.md:201, 'one handed in again is refused bad_option by its all-zero bytes': it takes a spent answer, its PRF bytes all zero, and makes a proving of it", async () => {
    const spent = passkeyAnswerOf({ prfBytes: new Uint8Array(32) })
    const proving = await PasskeyProving.make(asVault(duckVaultOf()), provingWorldOf(), spent)
    expect(proving).to.be.instanceOf(PasskeyProving)
  })

  it("whiteboard/20261030-newvault/newvault-spec.md:52, 'the PRF bytes are zeroed in a finally whatever happens': a world its check refuses leaves the PRF bytes unzeroed", async () => {
    const answer = passkeyAnswerOf()
    const vault = asVault(duckVaultOf())
    const world = TH.omitting(provingWorldOf(), 'device_id')
    await TH.expectRefusal(PasskeyProving.make(vault, world, answer), 'bad_option')
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  it("whiteboard/20261030-newvault/newvault-spec.md:52, 'the PRF bytes are zeroed in a finally whatever happens': a salt one byte short leaves the PRF bytes unzeroed", async () => {
    const answer = passkeyAnswerOf({ prf_salt_b64: shortSaltB64() })
    const vault = asVault(duckVaultOf())
    await expect(PasskeyProving.make(vault, provingWorldOf(), answer)).rejects.toThrow()
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  it("packages/safebyok/src/shapes/vault.ts:353, 'freshPasskeyAnswer.parse({ ...answer, prf_salt_b64: ... })   // throws bad_option': a salt one byte short, an argument, is refused 'bad_record'", async () => {
    const answer = passkeyAnswerOf({ prf_salt_b64: shortSaltB64() })
    const vault = asVault(duckVaultOf())
    await TH.expectRefusal(PasskeyProving.make(vault, provingWorldOf(), answer), 'bad_record')
  })
})

describe("PassphraseProving.make, called directly", () => {
  it("CLAUDE.md:43, 'Validate at each module entrypoint, every export': it hands the keyDeriver a passphrase it never checked, the number 42", async () => {
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes }
    await PassphraseProving.make(asVault(duckVaultOf()), provingWorldOf({ keyDeriver }), 42 as never)
    expect(deriveKeyBytes.mock.calls[0]?.[0]).to.eq(42)
  })
})

describe("proving.makeWayin", () => {
  it("whiteboard/20261030-newvault/newvault-spec.md:53, 'on a proving, takes the vaultKey that proving unwraps from the wayin it made': it takes a proving of another vault, wrapping that vault's vaultKey into a wayin of this one", async () => {
    const mine = duckVaultOf()
    const theirs = duckVaultOf({ vault_tok: 'vault-tok-other' })
    const { passphraseProving: theirProving } = await Proving.makeProvingPair(asVault(theirs), proofClosureOf(), provingWorldOf())
    const theirWayin = await theirProving.makeWayin(NOVEL)
    const { passphraseProving: myProving } = await Proving.makeProvingPair(asVault(mine), proofClosureOf(), provingWorldOf())
    const myWayin = await myProving.makeWayin(theirProving)
    const theirKey = await _cheat_vaultKeyBytesOf(theirs, theirWayin, { passphrase: TestPassphrase })
    const myKey = await _cheat_vaultKeyBytesOf(mine, myWayin, { passphrase: TestPassphrase })
    expect(myKey).to.deep.equal(theirKey)
  })

  it("whiteboard/20261030-newvault/newvault-spec.md:53, 'on NOVEL ... fabricates a vaultKey': a second makeWayin(NOVEL) on one proving fabricates another, and its leases seal under the newer alone, so what a lease of the first sealed no longer opens", async () => {
    const { passphraseProving } = await Proving.makeProvingPair(asVault(duckVaultOf()), proofClosureOf(), provingWorldOf())
    await passphraseProving.makeWayin(NOVEL)
    const first = await passphraseProving.makeLease(fakeDBFriendOf(), { leaseMillis: WeekMillis })
    await passphraseProving.makeWayin(NOVEL)
    const second = await passphraseProving.makeLease(fakeDBFriendOf(), { leaseMillis: WeekMillis })
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    const sealed = await first.sealWith(new TextEncoder().encode('{"val":"sk-test-0000"}'), boxKeyStamp, whisperStamp)
    await TH.expectRefusal(second.unsealWith(sealed, boxKeyStamp, whisperStamp), 'damaged_box')
  })
})
