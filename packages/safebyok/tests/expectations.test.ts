import { describe, expect, it } from 'vitest'
import * as Expectations from '../src/expectations'
import * as TH from './test-helpers'

const Bundle = TH.bundleOf('u1')
const Box = TH.boxOf('anthropic', 'one')

const BundleCases = [
  // regular usage:
  [Bundle,                                        { vault_id: "vault-id-u1", unlock_epoch: 1 },  true,   'the bundle proven against'],
  [Bundle,                                        { vault_id: "vault-id-u1", unlock_epoch: 2 },  false,  'an epoch the bundle has not reached'],
  [TH.bundleOf('u1', { unlock_epoch: 2 }),        { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'an epoch since moved on'],
  [TH.bundleOf('u1', { vault_id: 'reborn' }),     { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a vault made anew'],
  // nothing, or damage, standing:
  [undefined,                                     { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'no bundle at all'],
  [null,                                          { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a null row, as a string store reads none'],
  [{ vault_id: "vault-id-u1" },                   { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a row that shows no epoch'],
  [{ vault_id: "vault-id-u1", unlock_epoch: "1" }, { vault_id: "vault-id-u1", unlock_epoch: 1 }, false, 'an epoch stored as text'],
  ["vault-id-u1",                                 { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a row that is no object'],
] as const

describe("Expectations.bundleMeets", () => {
  for (const [standing, expected, landed, blurb] of BundleCases) {
    it(blurb, () => { expect(Expectations.bundleMeets(standing, expected)).to.eq(landed) })
  }
})

describe("Expectations.vaultMeets", () => {
  it("holds for the vault's bundle at any epoch, and for nothing else", () => {
    expect(Expectations.vaultMeets(Bundle, { vault_id: 'vault-id-u1' })).to.be.true
    expect(Expectations.vaultMeets(TH.bundleOf('u1', { unlock_epoch: 9 }), { vault_id: 'vault-id-u1' })).to.be.true
    expect(Expectations.vaultMeets(Bundle, { vault_id: 'reborn' })).to.be.false
    expect(Expectations.vaultMeets(undefined, { vault_id: 'vault-id-u1' })).to.be.false
    expect(Expectations.vaultMeets(null, { vault_id: 'vault-id-u1' })).to.be.false
  })

  it("fails a bundle too damaged to show an epoch, though it shows the vault_id", () => {
    expect(Expectations.vaultMeets({ vault_id: 'vault-id-u1' }, { vault_id: 'vault-id-u1' })).to.be.false
    expect(Expectations.vaultMeets({ vault_id: 'vault-id-u1', unlock_epoch: '1' }, { vault_id: 'vault-id-u1' })).to.be.false
  })
})

describe("Expectations.vaultIdMeets", () => {
  it("holds for any standing bundle that names the vault, however damaged the rest of it", () => {
    expect(Expectations.vaultIdMeets(Bundle, { vault_id: 'vault-id-u1' })).to.be.true
    expect(Expectations.vaultIdMeets({ vault_id: 'vault-id-u1' }, { vault_id: 'vault-id-u1' })).to.be.true
    expect(Expectations.vaultIdMeets({ vault_id: 'vault-id-u1', unlock_epoch: '1' }, { vault_id: 'vault-id-u1' })).to.be.true
  })

  it("fails a bundle of another vault, a bundle that names none, and none at all", () => {
    expect(Expectations.vaultIdMeets(Bundle, { vault_id: 'reborn' })).to.be.false
    expect(Expectations.vaultIdMeets({ unlock_epoch: 1 }, { vault_id: 'vault-id-u1' })).to.be.false
    expect(Expectations.vaultIdMeets(undefined, { vault_id: 'vault-id-u1' })).to.be.false
    expect(Expectations.vaultIdMeets('not a bundle', { vault_id: 'vault-id-u1' })).to.be.false
  })
})

const LockboxCases = [
  // regular usage:
  [Bundle,     undefined,                     null,       true,   'a first write, where no lockbox stands'],
  [Bundle,     Box,                           "rev-one",  true,   'a write over the revision read'],
  [Bundle,     Box,                           "rev-two",  false,  'a write over a revision never read'],
  [Bundle,     Box,                           null,       false,  'a first write where a lockbox now stands'],
  [Bundle,     undefined,                     "rev-one",  false,  'a write over a lockbox since erased'],
  // the bundle half:
  [undefined,  undefined,                     null,       false,  'a write into a scope with no bundle'],
  [TH.bundleOf('u1', { vault_id: 'reborn' }), Box,  "rev-one",  false,  'a write sealed for a vault since made anew'],
  [TH.rotatedBundleOf('u1'),                  Box,  "rev-one",  false,  'a write sealed under a vaultKey since replaced'],
  [TH.rotatedBundleOf('u1'),                  undefined, null,  false,  'a first write sealed under a vaultKey since replaced'],
  // nothing, or damage, standing:
  [{ vault_id: "vault-id-u1" },  undefined,   null,       false,  'a bundle row that shows no epoch'],
  [{ vault_id: "vault-id-u1", unlock_epoch: 1 }, undefined, null, false, "a bundle row that shows no vaultKey's epoch"],
  [{ ...Bundle, vault_key_epoch: "1" },  undefined,  null,  false,  "a vaultKey's epoch stored as text"],
  [Bundle,     null,                          null,       true,   'a null row reads as no lockbox, as a read does'],
  [Bundle,     { boxlabel: "anthropic" },     "rev-one",  false,  'a lockbox row that shows no revision'],
] as const

describe("Expectations.lockboxMeets", () => {
  for (const [standingBundle, standingBox, revisionId, landed, blurb] of LockboxCases) {
    it(blurb, () => {
      expect(Expectations.lockboxMeets(standingBundle, standingBox, { vault_id: 'vault-id-u1', revision_id: revisionId, vault_key_epoch: 1 })).to.eq(landed)
    })
  }
})

describe("Expectations.lockboxMeets, under a vaultKey replaced", () => {
  it("holds for a write sealed under the vaultKey that stands, over a lockbox sealed under the one before", () => {
    expect(Expectations.lockboxMeets(TH.rotatedBundleOf('u1'), Box, { vault_id: 'vault-id-u1', revision_id: 'rev-one', vault_key_epoch: 2 })).to.be.true
  })

  it("fails a write sealed under a vaultKey the bundle does not stand for yet", () => {
    expect(Expectations.lockboxMeets(Bundle, undefined, { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 2 })).to.be.false
  })
})
