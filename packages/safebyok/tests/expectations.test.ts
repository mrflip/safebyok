import { describe, expect, it } from 'vitest'
import * as Expectations from '../src/expectations'
import * as TH from './test-helpers'

const VaultProps = TH.vaultPropsOf('u1')
const Box = TH.boxOf('anthropic', 'one')

const VaultPropsCases = [
  // regular usage:
  [VaultProps,                                    { vault_id: "vault-id-u1", unlock_epoch: 1 },  true,   'the vault props proven against'],
  [VaultProps,                                    { vault_id: "vault-id-u1", unlock_epoch: 2 },  false,  'an epoch the vault props have not reached'],
  [TH.vaultPropsOf('u1', { unlock_epoch: 2 }),    { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'an epoch since moved on'],
  [TH.vaultPropsOf('u1', { vault_id: 'reborn' }), { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a vault made anew'],
  // nothing, or damage, standing:
  [undefined,                                     { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'no vault props at all'],
  [null,                                          { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a null row, as a string store reads none'],
  [{ vault_id: "vault-id-u1" },                   { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a row that shows no epoch'],
  [{ vault_id: "vault-id-u1", unlock_epoch: "1" },    { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'an epoch stored as text'],
  ["vault-id-u1",                                 { vault_id: "vault-id-u1", unlock_epoch: 1 },  false,  'a row that is no object'],
] as const

describe("Expectations.vaultPropsMeets", () => {
  for (const [standing, expected, landed, blurb] of VaultPropsCases) {
    it(blurb, () => { expect(Expectations.vaultPropsMeets(standing, expected)).to.eq(landed) })
  }
})

describe("Expectations.vaultMeets", () => {
  it("holds for the vault props at any epoch, and for nothing else", () => {
    expect(Expectations.vaultMeets(VaultProps, { vault_id: 'vault-id-u1' })).to.be.true
    expect(Expectations.vaultMeets(TH.vaultPropsOf('u1', { unlock_epoch: 9 }), { vault_id: 'vault-id-u1' })).to.be.true
    expect(Expectations.vaultMeets(VaultProps, { vault_id: 'reborn' })).to.be.false
    expect(Expectations.vaultMeets(undefined, { vault_id: 'vault-id-u1' })).to.be.false
    expect(Expectations.vaultMeets(null, { vault_id: 'vault-id-u1' })).to.be.false
  })

  it("fails vault props too damaged to show an epoch, though they show the vault_id", () => {
    expect(Expectations.vaultMeets({ vault_id: 'vault-id-u1' }, { vault_id: 'vault-id-u1' })).to.be.false
    expect(Expectations.vaultMeets({ vault_id: 'vault-id-u1', unlock_epoch: '1' }, { vault_id: 'vault-id-u1' })).to.be.false
  })
})

describe("Expectations.vaultIdMeets", () => {
  it("holds for any standing vault props that name the vault, however damaged the rest of them", () => {
    expect(Expectations.vaultIdMeets(VaultProps, { vault_id: 'vault-id-u1' })).to.be.true
    expect(Expectations.vaultIdMeets({ vault_id: 'vault-id-u1' }, { vault_id: 'vault-id-u1' })).to.be.true
    expect(Expectations.vaultIdMeets({ vault_id: 'vault-id-u1', unlock_epoch: '1' }, { vault_id: 'vault-id-u1' })).to.be.true
  })

  it("fails the props of another vault, props that name none, and none at all", () => {
    expect(Expectations.vaultIdMeets(VaultProps, { vault_id: 'reborn' })).to.be.false
    expect(Expectations.vaultIdMeets({ unlock_epoch: 1 }, { vault_id: 'vault-id-u1' })).to.be.false
    expect(Expectations.vaultIdMeets(undefined, { vault_id: 'vault-id-u1' })).to.be.false
    expect(Expectations.vaultIdMeets('not vault props', { vault_id: 'vault-id-u1' })).to.be.false
  })
})

const BoxCases = [
  // regular usage:
  [VaultProps, undefined,                     null,       true,   'a first write, where no box stands'],
  [VaultProps, Box,                           "rev-one",  true,   'a write over the revision read'],
  [VaultProps, Box,                           "rev-two",  false,  'a write over a revision never read'],
  [VaultProps, Box,                           null,       false,  'a first write where a box now stands'],
  [VaultProps, undefined,                     "rev-one",  false,  'a write over a box since retired'],
  // the vault props half:
  [undefined,  undefined,                     null,       false,  'a write into a scope with no vault props'],
  [TH.vaultPropsOf('u1', { vault_id: 'reborn' }), Box, "rev-one",  false,  'a write sealed for a vault since made anew'],
  [TH.vaultPropsAtEpochOf('u1', 2),          Box,  "rev-one",  false,  "a write sealed under another vaultKey epoch than the vault props'"],
  [TH.vaultPropsAtEpochOf('u1', 2),          undefined, null,  false,  "a first write sealed under another vaultKey epoch than the vault props'"],
  // nothing, or damage, standing:
  [{ vault_id: "vault-id-u1" },  undefined,   null,       false,  'a vault row that shows no epoch'],
  [{ vault_id: "vault-id-u1", unlock_epoch: 1 }, undefined, null, false, "a vault row that shows no vaultKey's epoch"],
  [{ ...VaultProps, vault_key_epoch: "1" }, undefined,  null,  false,  "a vaultKey's epoch stored as text"],
  [VaultProps, null,                          null,       true,   'a null row reads as no box, as a read does'],
  [VaultProps, { boxlabel: "anthropic" },     "rev-one",  false,  'a box row that shows no revision'],
] as const

describe("Expectations.boxMeets", () => {
  for (const [standingVaultProps, standingBox, revisionTok, landed, blurb] of BoxCases) {
    it(blurb, () => {
      expect(Expectations.boxMeets(standingVaultProps, standingBox, { vault_id: 'vault-id-u1', revision_tok: revisionTok, vault_key_epoch: 1 })).to.eq(landed)
    })
  }
})

describe("Expectations.boxMeets, across vaultKey epochs", () => {
  it("holds for a write sealed under the vault props' vaultKey epoch, over a box sealed under another", () => {
    expect(Expectations.boxMeets(TH.vaultPropsAtEpochOf('u1', 2), Box, { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 2 })).to.be.true
  })

  it("fails a write sealed under a vaultKey epoch the vault props do not stand for", () => {
    expect(Expectations.boxMeets(VaultProps, undefined, { vault_id: 'vault-id-u1', revision_tok: null, vault_key_epoch: 2 })).to.be.false
  })
})

const DeletionCases = [
  // regular usage:
  [Box,                                     "rev-one",  'deleted',        'the revision the retiring device read'],
  [Box,                                     "rev-two",  'deleted_other',  'a revision written over the one read'],
  [undefined,                               "rev-one",  'absent',         'no box, retired meanwhile'],
  [null,                                    null,       'absent',         'a null row, as a string store reads none'],
  // a damaged box, listed with no revision:
  [{ boxlabel: "anthropic" },               null,       'deleted',        'a damaged row that holds no revision, as listed'],
  [{ ...Box, revision_tok: "" },            null,       'deleted',        'a damaged row whose revision is empty, which the listing names as none'],
  [{ ...Box, revision_tok: 7 },             null,       'deleted',        'a damaged row whose revision is no text'],
  ["not a box",                         null,       'deleted',        'a row that is no object'],
  [Box,                                     null,       'deleted_other',  'a box written over the damaged one, holding a revision where none was expected'],
  [{ boxlabel: "anthropic" },               "rev-one",  'deleted_other',  'a damaged row where a revision was expected'],
] as const

describe("Expectations.deletionOf", () => {
  for (const [standingBox, revisionTok, outcome, blurb] of DeletionCases) {
    it(`reports ${outcome} for ${blurb}`, () => {
      expect(Expectations.deletionOf(standingBox, { vault_id: 'vault-id-u1', revision_tok: revisionTok })).to.deep.equal({ outcome })
    })
  }

  it("reports retired for a box at its revision, as its example shows", () => {
    expect(Expectations.deletionOf(TH.boxOf('anthropic', 'r7', { revision_tok: 'r7' }), { vault_id: 'v1', revision_tok: 'r7' })).to.deep.equal({ outcome: 'deleted' })
  })
})
