import { describe, expect, it } from 'vitest'
import * as Expectations from '../src/expectations'
import * as TH from './test-helpers'

const VaultRecord = TH.vaultRecordOf('u1')
const Box = TH.boxOf('anthropic', 'one')

const VaultRecordCases = [
  // regular usage:
  [VaultRecord,                                    { vault_tok: "vault-tok-u1", gate_epoch: 1 },  true,   'the vault record proven against'],
  [VaultRecord,                                    { vault_tok: "vault-tok-u1", gate_epoch: 2 },  false,  'an epoch the vault record has not reached'],
  [TH.vaultRecordOf('u1', { gate_epoch: 2 }),      { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'an epoch since moved on'],
  [TH.vaultRecordOf('u1', { vault_tok: 'reborn' }), { vault_tok: "vault-tok-u1", gate_epoch: 1 }, false,  'a vault made anew'],
  // nothing, or damage, standing:
  [undefined,                                     { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'no vault record at all'],
  [null,                                          { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'a null row, as a string store reads none'],
  [{ vault_tok: "vault-tok-u1" },                 { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'a row that shows no epoch'],
  [{ vault_tok: "vault-tok-u1", gate_epoch: "1" },    { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'an epoch stored as text'],
  ["vault-tok-u1",                                { vault_tok: "vault-tok-u1", gate_epoch: 1 },  false,  'a row that is no object'],
] as const

describe("Expectations.vaultRecordMeets", () => {
  for (const [standing, expected, landed, blurb] of VaultRecordCases) {
    it(blurb, () => { expect(Expectations.vaultRecordMeets(standing, expected)).to.eq(landed) })
  }
})

describe("Expectations.vaultRecordRefusalOf", () => {
  it("lets an update land over the vault record it expects, as its example asks before writing", () => {
    expect(Expectations.vaultRecordRefusalOf(TH.vaultRecordOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 1 })).to.be.null
    expect(Expectations.vaultRecordRefusalOf(TH.gatelessOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 0 })).to.be.null
  })

  it("refuses as stale_write, carrying what stands, vault record at another epoch or of another vault, or none", () => {
    const Misses = [TH.vaultRecordOf('u1', { gate_epoch: 2 }), TH.vaultRecordOf('u1', { vault_tok: 'vault-tok-new' }), { gate_epoch: 'garbled' }]
    for (const standing of Misses) {
      const refusal = Expectations.vaultRecordRefusalOf(standing, { vault_tok: 'vault-tok-u1', gate_epoch: 1 })
      expect(refusal?.refusalkind).to.eq('stale_write')
      expect(refusal?.meta).to.deep.equal({ vault_stored: standing })
    }
    for (const none of [null, undefined]) {
      expect(Expectations.vaultRecordRefusalOf(none, { vault_tok: 'vault-tok-u1', gate_epoch: 1 })?.meta).to.deep.equal({ vault_stored: null })
    }
  })
})

describe("Expectations.vaultMeets", () => {
  it("holds for the vault record at any epoch, and for nothing else", () => {
    expect(Expectations.vaultMeets(VaultRecord, { vault_tok: 'vault-tok-u1' })).to.be.true
    expect(Expectations.vaultMeets(TH.vaultRecordOf('u1', { gate_epoch: 9 }), { vault_tok: 'vault-tok-u1' })).to.be.true
    expect(Expectations.vaultMeets(VaultRecord, { vault_tok: 'reborn' })).to.be.false
    expect(Expectations.vaultMeets(undefined, { vault_tok: 'vault-tok-u1' })).to.be.false
    expect(Expectations.vaultMeets(null, { vault_tok: 'vault-tok-u1' })).to.be.false
  })

  it("fails a vault record too damaged to show an epoch, though it shows the vault_tok", () => {
    expect(Expectations.vaultMeets({ vault_tok: 'vault-tok-u1' }, { vault_tok: 'vault-tok-u1' })).to.be.false
    expect(Expectations.vaultMeets({ vault_tok: 'vault-tok-u1', gate_epoch: '1' }, { vault_tok: 'vault-tok-u1' })).to.be.false
  })
})

const VaultTombstone = { format: 'safebyok-tombstone-v1', ...TH.scopeOf('u1'), vault_epoch: 2 } as const
const scope = TH.scopeOf('u1')

describe("Expectations.isTombstone", () => {
  it("holds for a row of the tombstone's format, however damaged the rest of it, and for no vault record", () => {
    expect(Expectations.isTombstone(VaultTombstone)).to.be.true
    expect(Expectations.isTombstone({ format: 'safebyok-tombstone-v1' })).to.be.true
    expect(Expectations.isTombstone(VaultRecord)).to.be.false
    expect(Expectations.isTombstone(null)).to.be.false
    expect(Expectations.isTombstone('safebyok-tombstone-v1')).to.be.false
  })
})

describe("Expectations, over a tombstone", () => {
  it("fails every comparison a write makes: it holds no vault_tok, so a stale writer never finds the vault standing", () => {
    expect(Expectations.vaultRecordMeets(VaultTombstone, { vault_tok: 'vault-tok-u1', gate_epoch: 1 })).to.be.false
    expect(Expectations.vaultMeets(VaultTombstone, { vault_tok: 'vault-tok-u1' })).to.be.false
    expect(Expectations.boxRefusalOf(VaultTombstone, undefined, { vault_tok: 'vault-tok-u1', revision_tok: null })?.refusalkind).to.eq('vault_mismatch')
  })

  it("is no vault record to a refused update, which names none standing", () => {
    expect(Expectations.vaultRecordRefusalOf(VaultTombstone, { vault_tok: 'vault-tok-u1', gate_epoch: 1 })?.meta).to.deep.equal({ vault_stored: null })
  })
})

describe("Expectations.vaultRecordPutOf", () => {
  it("stores the vault record with the counter the standing one shows plus one, whatever the writer sent, as its example shows", () => {
    const next = TH.vaultRecordOf('u1', { gate_epoch: 2, vault_epoch: 99 })
    expect(Expectations.vaultRecordPutOf(next, TH.vaultRecordOf('u1', { vault_epoch: 4 }))).to.deep.equal({ ...next, vault_epoch: 5 })
  })

  it("counts from zero over a vault record that shows no counter, a damaged one", () => {
    expect(Expectations.vaultRecordPutOf(TH.vaultRecordOf('u1'), { vault_tok: 'vault-tok-u1', vault_epoch: 'x' }).vault_epoch).to.eq(1)
  })
})

describe("Expectations.newLifeOf", () => {
  const draft = TH.gatelessOf('u1', { vault_tok: 'vault-tok-fresh' })

  it("is the draft where nothing stands", () => {
    expect(Expectations.newLifeOf(draft, null)).to.eq(draft)
    expect(Expectations.newLifeOf(draft, undefined)).to.eq(draft)
  })

  it("is the draft with the counter carried on from a tombstone", () => {
    expect(Expectations.newLifeOf(draft, VaultTombstone)).to.deep.equal({ ...draft, vault_epoch: 2 })
  })

  it("is nothing where a vault stands, gated or not, damaged or not: it stores nothing", () => {
    expect(Expectations.newLifeOf(draft, VaultRecord)).to.be.null
    expect(Expectations.newLifeOf(draft, TH.gatelessOf('u1'))).to.be.null
    expect(Expectations.newLifeOf(draft, 'not vault record')).to.be.null
  })
})

describe("Expectations.tombstoneOf", () => {
  const gate1 = { vault_tok: 'vault-tok-u1', gate_epoch: 1 }

  it("leaves a tombstone of the vault that stands at the gate expected: the scope and the counter plus one", () => {
    expect(Expectations.tombstoneOf(VaultRecord, scope, gate1)).to.deep.equal({ ...VaultTombstone, vault_epoch: 2 })
    expect(Expectations.tombstoneOf(TH.vaultRecordOf('u1', { gate_epoch: 3, vault_epoch: 7 }), scope, { vault_tok: 'vault-tok-u1', gate_epoch: 3 })).to.deep.include({ vault_epoch: 8 })
  })

  it("misses a vault since made anew, none, a record that names no vault, and a gate since changed", () => {
    expect(Expectations.tombstoneOf(VaultRecord, scope, { vault_tok: 'reborn', gate_epoch: 1 })).to.be.null
    expect(Expectations.tombstoneOf(VaultRecord, scope, { vault_tok: 'vault-tok-u1', gate_epoch: 0 })).to.be.null
    expect(Expectations.tombstoneOf(TH.vaultRecordOf('u1', { gate_epoch: 2 }), scope, gate1)).to.be.null
    expect(Expectations.tombstoneOf(undefined, scope, gate1)).to.be.null
    expect(Expectations.tombstoneOf(null, scope, gate1)).to.be.null
    expect(Expectations.tombstoneOf({ gate_epoch: 1 }, scope, gate1)).to.be.null
  })

  it("expects the vault_tok alone for a null gate_epoch, however damaged the rest of the vault record, and counts from zero", () => {
    const damaged = { vault_tok: 'vault-tok-u1', gate_epoch: 'one', vault_epoch: 'x' }
    expect(Expectations.tombstoneOf(damaged, scope, { vault_tok: 'vault-tok-u1', gate_epoch: null })).to.deep.equal({ ...VaultTombstone, vault_epoch: 1 })
    expect(Expectations.tombstoneOf(damaged, scope, { vault_tok: 'reborn', gate_epoch: null })).to.be.null
  })

  it("misses a tombstone, for any expectation: a vault already deleted is refused as stale, as when nothing stands", () => {
    expect(Expectations.tombstoneOf(VaultTombstone, scope, gate1)).to.be.null
    expect(Expectations.tombstoneOf(VaultTombstone, scope, { vault_tok: 'vault-tok-u1', gate_epoch: null })).to.be.null
  })
})

const BoxCases = [
  // regular usage:
  [VaultRecord, undefined,                     null,       null,             'a first write, where no box stands'],
  [VaultRecord, Box,                           "rev-one",  null,             'a write over the revision read'],
  [VaultRecord, Box,                           "rev-two",  "stale_write",    'a write over a revision never read'],
  [VaultRecord, Box,                           null,       "stale_write",    'a first write where a box now stands'],
  [VaultRecord, undefined,                     "rev-one",  "stale_write",    'a write over a box since deleted'],
  // the vault record half:
  [undefined,  undefined,                     null,       "vault_mismatch", 'a write into a scope with no vault record'],
  [TH.vaultRecordOf('u1', { vault_tok: 'reborn' }), Box, "rev-one", "vault_mismatch", 'a write sealed for a vault since made anew'],
  // nothing, or damage, standing:
  [{ vault_tok: "vault-tok-u1" },  undefined, null,       "vault_mismatch", 'a vault row that shows no epoch'],
  [{ vault_tok: "vault-tok-u1", gate_epoch: 1 }, undefined, null, null,         'a vault row that shows its token and epoch, and nothing more'],
  [VaultRecord, null,                          null,       null,             'a null row reads as no box, as a read does'],
  [VaultRecord, { boxlabel: "anthropic" },     "rev-one",  "stale_write",    'a box row that shows no revision'],
] as const

describe("Expectations.boxRefusalOf", () => {
  for (const [standingVaultRecord, standingBox, revisionTok, refusalkind, blurb] of BoxCases) {
    it(`${refusalkind ?? 'lands'}: ${blurb}`, () => {
      const refusal = Expectations.boxRefusalOf(standingVaultRecord, standingBox, { vault_tok: 'vault-tok-u1', revision_tok: revisionTok })
      expect(refusal?.refusalkind ?? null).to.eq(refusalkind)
    })
  }

  it("refuses a stale write with the box standing as it read it, as its example shows", () => {
    const refusal = Expectations.boxRefusalOf(VaultRecord, Box, { vault_tok: 'vault-tok-u1', revision_tok: 'rev-two' })
    expect(refusal?.meta).to.deep.equal({ box_stored: Box })
  })

  it("refuses a stale write over a box since deleted with null standing, not undefined", () => {
    const refusal = Expectations.boxRefusalOf(VaultRecord, undefined, { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' })
    expect(refusal?.meta).to.deep.equal({ box_stored: null })
  })

  it("refuses a vault mismatch carrying nothing of the vault record standing", () => {
    const refusal = Expectations.boxRefusalOf(TH.vaultRecordOf('u1', { vault_tok: 'reborn' }), Box, { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' })
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
