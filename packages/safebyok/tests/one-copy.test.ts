import { describe, expect, it, vi } from 'vitest'
import { Box } from '../src/box'
import { makeVaultKey } from '../src/crypto'
import { VaultError } from '../src/errors'
import { ModelMark, checkOneCopy } from '../src/one-copy'
import { PassphraseProof, Proof } from '../src/proof'
import { Wayin } from '../src/wayin'
import * as TH from './test-helpers'

const vault = { ...TH.vaultSliceOf('u1'), clock: { now: () => Date.UTC(2026, 9, 20) } }
const holder = TH.vaultPropsOf('u1')
const Secret = 'sk-ant-SUPERSECRET'

/**
 * A second copy of safebyok's boxes and proofs, loaded beside the first as a bundle holding two
 * versions would load it: every module evaluated afresh, so every class, `VaultError` among them,
 * is its own.
 */
const secondCopy = async () => {
  vi.resetModules()
  const [boxes, proofs, errors] = await Promise.all([import('../src/box'), import('../src/proof'), import('../src/errors')])
  return { Box: boxes.Box, Proof: proofs.Proof, VaultError: errors.VaultError }
}

/** A box of the second copy, sealed as that copy seals one. */
const otherCopyBox = async () => {
  const other = await secondCopy()
  return await other.Box.seal(vault, 'anthropic_api_key', Secret, holder, await makeVaultKey())
}

describe("a second copy, as these tests load it", () => {
  it("is truly another copy: its classes and its VaultError are its own", async () => {
    const other = await secondCopy()
    expect(other.Box).to.not.eq(Box)
    expect(other.VaultError).to.not.eq(VaultError)
    expect(await otherCopyBox()).to.not.be.instanceOf(Box)
  })
})

describe("checkOneCopy", () => {
  it("refuses a Box of another copy of safebyok as bad_option, naming the double load, as its example shows", async () => {
    const over = await otherCopyBox()
    const err = TH.expectSyncRefusal(() => { checkOneCopy(over, Box, "Box.seal's `over`") }, 'bad_option')
    expect(err.message).to.include("Box.seal's `over` was handed a Box made by another copy of safebyok")
    expect(err.message).to.include('Load safebyok once')
    expect(err.message).to.not.include(Secret)
  })

  it("passes a box of its own copy, and anything that is no model at all, for the caller's own check", async () => {
    const own = await Box.seal(vault, 'anthropic_api_key', Secret, holder, await makeVaultKey())
    for (const given of [own, TH.boxOf('anthropic_api_key', 'a1'), null, undefined, 'text', 7, { constructor: null }]) {
      expect(() => { checkOneCopy(given, Box, 'Box.make') }).to.not.throw()
    }
  })

  it("tells a Proof's kinds by the mark they inherit, so a box is no proof and a proof no box", () => {
    expect(PassphraseProof[ModelMark]).to.eq('Proof')
    expect(Box[ModelMark]).to.eq('Box')
    const proof = PassphraseProof.parse(vault, 'pw')
    expect(() => { checkOneCopy(proof, Box, 'Box.make') }).to.not.throw()
  })

  it("puts the mark on the class alone: no box holds it as a property of its own", async () => {
    const own = await Box.seal(vault, 'anthropic_api_key', Secret, holder, await makeVaultKey())
    expect(Object.getOwnPropertySymbols(own)).to.deep.equal([])
  })
})

describe("a model of another copy, where this copy takes one", () => {
  it("refuses a Box of another copy as Box.seal's `over`, naming the double load", async () => {
    const over = await otherCopyBox()
    const err = await TH.expectRefusal(Box.seal(vault, 'anthropic_api_key', Secret, holder, await makeVaultKey(), { over }), 'bad_option')
    expect(err.message).to.include('another copy of safebyok')
  })

  it("refuses a Box of another copy handed to Box.make as its record, naming the double load", async () => {
    const other = await otherCopyBox()
    const err = TH.expectSyncRefusal(() => Box.make(vault, other as unknown as Parameters<typeof Box.make>[1], holder), 'bad_option')
    expect(err.message).to.include('Box.make was handed a Box made by another copy')
  })

  it("refuses a Box of another copy at Box.make even when its fields read as a box record", () => {
    const theirs = { ...TH.boxOf('anthropic_api_key', 'a1'), constructor: { [ModelMark]: 'Box' } }
    const err = TH.expectSyncRefusal(() => Box.make(vault, theirs, holder), 'bad_option')
    expect(err.message).to.include('Box.make was handed a Box made by another copy')
  })

  it("refuses a Proof of another copy handed in as a proof, naming the double load", async () => {
    const other = await secondCopy()
    const theirs = other.Proof.parse(vault, 'pw')
    const err = TH.expectSyncRefusal(() => Proof.parse(vault, theirs), 'bad_option')
    expect(err.message).to.include('was handed a Proof made by another copy')
  })

  it("refuses a Proof of another copy at wayin.tryOpen and Wayin.seal, naming the double load", async () => {
    const other = await secondCopy()
    const theirs = other.Proof.parse(vault, 'pw') as unknown as PassphraseProof
    const wayin = Wayin.make(vault, holder.passphrase, holder)
    const opened = await TH.expectBad(wayin.tryOpen(theirs), 'bad_option')
    expect(opened.message).to.include('wayin.tryOpen was handed a Proof made by another copy')
    const stamp = { vault_key_epoch: 1, device_id: 'device-one', registered_at: Date.UTC(2026, 9, 20) } as const
    const sealing = await TH.expectRefusal(Wayin.seal(vault, theirs, holder, stamp, await makeVaultKey()), 'bad_option')
    expect(sealing.message).to.include('Wayin.seal was handed a Proof made by another copy')
  })
})
