import { afterEach, describe, expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as SX from '../../src/shapes/shapes-storage'
import * as VX from '../../src/shapes/shapes-vaultish'
import { boxListingOf, fullBoxRecord, makeModelsWorld, sparseBoxRecord, tombstoneBoxRecord, T0 } from '../test-helpers/models-world'
import { expectCases } from '../test-helpers/cases'
import * as TH from '../test-helpers'

const mw = makeModelsWorld({ fakeTimers: false })
afterEach(() => { mw.dispose() })

const full      = fullBoxRecord()
const sparse    = sparseBoxRecord()
const gone      = tombstoneBoxRecord({ revision_seq: 2 })
const ouch      = tombstoneBoxRecord({ revision_seq: 2 }, 'd')
const revision  = { revision_tok: 'rev-a1', revision_seq: 1 }
const baseProps = { revision_tok: 'rev-a1', revision_seq: 1, registered_at: T0, written_at: T0, am: 'a', vault_tok: 'vault-tok-u1' }

describe("The checks of what the base knows of a record", () => {
  describe("SX.am", () => {
    expectCases(SX.am, [
      // each am:
      ["a",       true,  'passes alive'],
      ["d",       true,  'passes damaged'],
      ["x",       true,  'passes gone'],
      // anything else:
      ["A",       false, 'refuses the wrong case'],
      [null,      false, 'refuses null'],
      [undefined, false, 'refuses undefined'],
      [1,         false, 'refuses a number'],
    ])
  })

  describe("SX.revision", () => {
    expectCases(SX.revision, [
      // good:
      [revision,                                   true,  'passes a tok and a seq'],
      [{ ...revision, revision_seq: SX.VoidRevisionSeq }, true, 'passes the seq of a central never stored'],
      [{ ...revision, am: 'a', extra: 1 },         true,  'passes a bag carrying more, stripping the rest'],
      // bad:
      [{ revision_seq: 1 },                        false, 'refuses a missing tok'],
      [{ ...revision, revision_tok: '' },          false, 'refuses an empty tok'],
      [{ revision_tok: 'rev-a1' },                 false, 'refuses a missing seq'],
      [{ ...revision, revision_seq: 1.5 },         false, 'refuses a seq that is not whole'],
      [{ ...revision, revision_seq: '1' },         false, 'refuses a seq that is text'],
      [null,                                       false, 'refuses null'],
    ])

    it("hands back the two fields and no more", () => {
      expect(SX.revision.parse({ ...revision, am: 'a', extra: 1 })).to.deep.equal(revision)
    })
  })

  describe("SX.times", () => {
    expectCases(SX.times, [
      [{ registered_at: T0, written_at: T0 },       true,  'passes two epoch milliseconds'],
      [{ registered_at: T0 },                       false, 'refuses a missing written_at'],
      [{ registered_at: 5, written_at: T0 },        false, 'refuses a small number, seconds or a count'],
      [{ registered_at: T0, written_at: T0 + 0.5 }, false, 'refuses a fraction of a millisecond'],
      [{ registered_at: new Date(T0), written_at: T0 }, false, 'refuses a Date'],
      [{ registered_at: String(T0), written_at: T0 }, false, 'refuses a string'],
    ])
  })

  describe("VX.liveness and SX.vaulted", () => {
    expectCases(VX.liveness, [
      [{ am: 'a' },  true,  'passes liveness with an am'],
      [{},           false, 'refuses liveness without an am'],
    ])
    expectCases(SX.vaulted, [
      [{ vault_tok: 'vault-tok-u1' }, true,  'passes a vault_tok'],
      [{ vault_tok: '' },             false, 'refuses an empty vault_tok'],
      [{},                            false, 'refuses a missing vault_tok'],
    ])
  })

  describe("SX.sparseBase", () => {
    expectCases(SX.sparseBase, [
      // each form of a record:
      [full,                                  true,  'passes a full record'],
      [sparse,                                true,  'passes a sparse record'],
      [gone,                                  true,  'passes a deletion tombstone'],
      [ouch,                                  true,  'passes a damaged one\'s tombstone'],
      // each part missing:
      [{ ...baseProps, vault_tok: undefined }, false, 'refuses a record with no vault_tok'],
      [{ ...baseProps, am: undefined },        false, 'refuses a record with no am'],
      [{ ...baseProps, written_at: undefined }, false, 'refuses a record with no written_at'],
      [{ ...baseProps, revision_tok: undefined }, false, 'refuses a record with no revision_tok'],
      [{ ...baseProps, am: 'z' },              false, 'refuses an am that is not one'],
      [null,                                   false, 'refuses null'],
      ["rev-a1",                               false, 'refuses text'],
    ])

    it("takes the six props from a record and strips the rest", () => {
      expect(SX.sparseBase.parse(full)).to.deep.equal(baseProps)
    })

    it("takes the six props from a box, which ducks as its record", async () => {
      const box = await boxListingOf(mw).build(full)
      expect(SX.sparseBase.parse(box)).to.deep.equal(baseProps)
    })

    it("refuses without quoting its input", () => {
      const err = TH.expectSyncRefusal(() => SX.sparseBase.parse({ ...baseProps, vault_tok: 'SECRET-TOK', am: 'SECRET-AM' }))
      expect(err.message).to.not.include('SECRET')
    })
  })

  describe("VX.tombstone", () => {
    expectCases(VX.tombstone, [
      [gone,   true,  'passes a deletion tombstone'],
      [ouch,   true,  'passes a damaged one\'s tombstone'],
      [sparse, false, 'refuses an alive sparse record'],
      [full,   false, 'refuses an alive full record'],
    ])
  })

  describe("VX.isTombstone and SX.VoidRevisionSeq", () => {
    it("tells a damaged or gone record from an alive one, whatever its form", () => {
      expect(VX.isTombstone(gone)).to.be.true
      expect(VX.isTombstone(ouch)).to.be.true
      expect(VX.isTombstone(sparse)).to.be.false
      expect(VX.isTombstone(full)).to.be.false
    })

    it("marks a central never stored with a seq below any a VaultDB puts", () => {
      expect(SX.VoidRevisionSeq).to.be.lessThan(0)
    })
  })
})

describe("The checks of what reconciling passes", () => {
  describe("VX.reconciled", () => {
    expectCases(VX.reconciled, [
      [{ central: sparse, policy: 'same' },  true,  'passes a central and the policy that chose it'],
      [{ central: gone,   policy: 'gone' },  true,  'passes a tombstone central'],
      [{ central: sparse },                  false, 'refuses a missing policy'],
      [{ policy: 'same' },                   false, 'refuses a missing central'],
      [{ central: sparse, policy: 'edit' },  false, 'refuses a policy that is no row of reconcileCentral'],
    ])
  })

  describe("VX.aligned", () => {
    expectCases(VX.aligned, [
      [{ badnews: [] },                                       true,  'passes no bad news'],
      [{ badnews: [new VaultError('stale_write', 'x')] },     true,  'passes bad news of VaultErrors'],
      [{ badnews: [new Error('plain')] },                     false, 'refuses bad news that is no VaultError'],
      [{},                                                    false, 'refuses a missing badnews'],
    ])
  })
})
