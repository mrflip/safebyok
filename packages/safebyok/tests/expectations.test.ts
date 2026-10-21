import { describe, expect, it } from 'vitest'
import * as Expectations from '../src/expectations'
import * as TH from './test-helpers'

const VaultProps = TH.vaultPropsOf('u1')
const Box = TH.boxOf('anthropic', 'one')

const VaultPropsCases = [
  // regular usage:
  [VaultProps,                                    { vault_tok: "vault-tok-u1", gate_epoch: 1 },  true,   'the vault props proven against'],
  [VaultProps,                                    { vault_tok: "vault-tok-u1", gate_epoch: 2 },  false,  'an epoch the vault props have not reached'],
  [TH.vaultPropsOf('u1', { gate_epoch: 2 }),      { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'an epoch since moved on'],
  [TH.vaultPropsOf('u1', { vault_tok: 'reborn' }), { vault_tok: "vault-tok-u1", gate_epoch: 1 }, false,  'a vault made anew'],
  // nothing, or damage, standing:
  [undefined,                                     { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'no vault props at all'],
  [null,                                          { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'a null row, as a string store reads none'],
  [{ vault_tok: "vault-tok-u1" },                 { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'a row that shows no epoch'],
  [{ vault_tok: "vault-tok-u1", gate_epoch: "1" },    { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'an epoch stored as text'],
  ["vault-tok-u1",                                { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'a row that is no object'],
] as const

describe("Expectations.vaultPropsMeets", () => {
  for (const [standing, expected, landed, blurb] of VaultPropsCases) {
    it(blurb, () => { expect(Expectations.vaultPropsMeets(standing, expected)).to.eq(landed) })
  }
})

describe("Expectations.vaultMeets", () => {
  it("holds for the vault props at any epoch, and for nothing else", () => {
    expect(Expectations.vaultMeets(VaultProps, { vault_tok: 'vault-tok-u1' })).to.be.true
    expect(Expectations.vaultMeets(TH.vaultPropsOf('u1', { gate_epoch: 9 }), { vault_tok: 'vault-tok-u1' })).to.be.true
    expect(Expectations.vaultMeets(VaultProps, { vault_tok: 'reborn' })).to.be.false
    expect(Expectations.vaultMeets(undefined, { vault_tok: 'vault-tok-u1' })).to.be.false
    expect(Expectations.vaultMeets(null, { vault_tok: 'vault-tok-u1' })).to.be.false
  })

  it("fails vault props too damaged to show an epoch, though they show the vault_tok", () => {
    expect(Expectations.vaultMeets({ vault_tok: 'vault-tok-u1' }, { vault_tok: 'vault-tok-u1' })).to.be.false
    expect(Expectations.vaultMeets({ vault_tok: 'vault-tok-u1', gate_epoch: '1' }, { vault_tok: 'vault-tok-u1' })).to.be.false
  })
})

describe("Expectations.vaultTokMeets", () => {
  it("holds for any standing vault props that name the vault, however damaged the rest of them", () => {
    expect(Expectations.vaultTokMeets(VaultProps, { vault_tok: 'vault-tok-u1' })).to.be.true
    expect(Expectations.vaultTokMeets({ vault_tok: 'vault-tok-u1' }, { vault_tok: 'vault-tok-u1' })).to.be.true
    expect(Expectations.vaultTokMeets({ vault_tok: 'vault-tok-u1', gate_epoch: '1' }, { vault_tok: 'vault-tok-u1' })).to.be.true
  })

  it("fails the props of another vault, props that name none, and none at all", () => {
    expect(Expectations.vaultTokMeets(VaultProps, { vault_tok: 'reborn' })).to.be.false
    expect(Expectations.vaultTokMeets({ gate_epoch: 1 }, { vault_tok: 'vault-tok-u1' })).to.be.false
    expect(Expectations.vaultTokMeets(undefined, { vault_tok: 'vault-tok-u1' })).to.be.false
    expect(Expectations.vaultTokMeets('not vault props', { vault_tok: 'vault-tok-u1' })).to.be.false
  })
})

const BoxCases = [
  // regular usage:
  [VaultProps, undefined,                     null,       null,             'a first write, where no box stands'],
  [VaultProps, Box,                           "rev-one",  null,             'a write over the revision read'],
  [VaultProps, Box,                           "rev-two",  "stale_write",    'a write over a revision never read'],
  [VaultProps, Box,                           null,       "stale_write",    'a first write where a box now stands'],
  [VaultProps, undefined,                     "rev-one",  "stale_write",    'a write over a box since deleted'],
  // the vault props half:
  [undefined,  undefined,                     null,       "vault_mismatch", 'a write into a scope with no vault props'],
  [TH.vaultPropsOf('u1', { vault_tok: 'reborn' }), Box, "rev-one", "vault_mismatch", 'a write sealed for a vault since made anew'],
  // nothing, or damage, standing:
  [{ vault_tok: "vault-tok-u1" },  undefined, null,       "vault_mismatch", 'a vault row that shows no epoch'],
  [{ vault_tok: "vault-tok-u1", gate_epoch: 1 }, undefined, null, null,         'a vault row that shows its id and epoch, and nothing more'],
  [VaultProps, null,                          null,       null,             'a null row reads as no box, as a read does'],
  [VaultProps, { boxlabel: "anthropic" },     "rev-one",  "stale_write",    'a box row that shows no revision'],
] as const

describe("Expectations.boxRefusalOf", () => {
  for (const [standingVaultProps, standingBox, revisionTok, refusalkind, blurb] of BoxCases) {
    it(`${refusalkind ?? 'lands'}: ${blurb}`, () => {
      const refusal = Expectations.boxRefusalOf(standingVaultProps, standingBox, { vault_tok: 'vault-tok-u1', revision_tok: revisionTok })
      expect(refusal?.refusalkind ?? null).to.eq(refusalkind)
    })
  }

  it("refuses a stale write with the box standing as it read it, as its example shows", () => {
    const refusal = Expectations.boxRefusalOf(VaultProps, Box, { vault_tok: 'vault-tok-u1', revision_tok: 'rev-two' })
    expect(refusal?.meta).to.deep.equal({ box_stored: Box })
  })

  it("refuses a stale write over a box since deleted with null standing, not undefined", () => {
    const refusal = Expectations.boxRefusalOf(VaultProps, undefined, { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' })
    expect(refusal?.meta).to.deep.equal({ box_stored: null })
  })

  it("refuses a vault mismatch carrying nothing of the vault props standing", () => {
    const refusal = Expectations.boxRefusalOf(TH.vaultPropsOf('u1', { vault_tok: 'reborn' }), Box, { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' })
    expect(refusal).to.not.have.property('meta')
    expect(TH.thrownText(refusal)).to.not.include('reborn')
  })
})


const DeletionCases = [
  // regular usage:
  [Box,                                     "rev-one",  'deleted',        'the revision the deleting device read'],
  [Box,                                     "rev-two",  'deleted_other',  'a revision written over the one read'],
  [undefined,                               "rev-one",  'absent',         'no box, deleted meanwhile'],
  [null,                                    null,       'absent',         'a null row, as a string store reads none'],
  // a damaged box, listed with no revision:
  [{ boxlabel: "anthropic" },               null,       'deleted',        'a damaged row that holds no revision, as listed'],
  [{ ...Box, revision_tok: "" },            null,       'deleted',        'a damaged row whose revision is empty, which the listing names as none'],
  [{ ...Box, revision_tok: 7 },             null,       'deleted',        'a damaged row whose revision is no text'],
  ["not a box",                             null,       'deleted',        'a row that is no object'],
  [Box,                                     null,       'deleted_other',  'a box written over the damaged one, holding a revision where none was expected'],
  [{ boxlabel: "anthropic" },               "rev-one",  'deleted_other',  'a damaged row where a revision was expected'],
] as const

describe("Expectations.deletionOf", () => {
  for (const [standingBox, revisionTok, outcome, blurb] of DeletionCases) {
    it(`reports ${outcome} for ${blurb}`, () => {
      expect(Expectations.deletionOf(standingBox, { vault_tok: 'vault-tok-u1', revision_tok: revisionTok })).to.deep.equal({ outcome })
    })
  }

  it("reports deleted for a box at its revision, as its example shows", () => {
    expect(Expectations.deletionOf(TH.boxOf('anthropic', 'r7', { revision_tok: 'r7' }), { vault_tok: 'v1', revision_tok: 'r7' })).to.deep.equal({ outcome: 'deleted' })
  })
})
