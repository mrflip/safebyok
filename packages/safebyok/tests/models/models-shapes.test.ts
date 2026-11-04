import { afterEach, describe, expect, it } from 'vitest'
import { VaultError } from '../../src/errors'
import { Box } from '../../src/models/box'
import * as MSX from '../../src/models/models-shapes'
import * as VS from '../../src/storage/vault-db-shapes'
import { boxListingOf, fullBoxRecord, makeModelsWorld, sparseBoxRecord, tombstoneBoxRecord, T0 } from '../test-helpers/models-world'
import * as TH from '../test-helpers'

const mw = makeModelsWorld({ fakeTimers: false })
afterEach(() => { mw.dispose() })

const full      = fullBoxRecord()
const sparse    = sparseBoxRecord()
const gone      = tombstoneBoxRecord({ revision_seq: 2 })
const ouch      = tombstoneBoxRecord({ revision_seq: 2 }, 'd')
const revision  = { revision_tok: 'rev-a1', revision_seq: 1 }
const baseProps = { revision_tok: 'rev-a1', revision_seq: 1, registered_at: T0, written_at: T0, am: 'a', vault_tok: 'vault-tok-u1' }
const scope     = mw.boxscope('anthropic_api_key')

/** Whether a bag of cases `parse`s: each row is an input, whether it passes, and a sentence about it. */
type Case = readonly [input: unknown, passes: boolean, blurb: string]

/** The refusalkind `attempt` throws, or 'passes' where it throws nothing. Anything thrown but a VaultError is rethrown. */
const verdictOf = (attempt: () => unknown): string => {
  try {
    attempt()
    return 'passes'
  } catch (err) {
    if (err instanceof VaultError) { return err.refusalkind }
    throw err
  }
}

/** A check held to its table of cases: each passes, or refuses `kind`. */
const holdsCases = (check: { parse: (val: unknown) => unknown }, kind: VaultError['refusalkind'], cases: readonly Case[]): void => {
  for (const [input, passes, blurb] of cases) {
    it(blurb, () => { expect(verdictOf(() => check.parse(input))).to.eq(passes ? 'passes' : kind) })
  }
}

describe("MSX.amVals, MSX.tombstoneAmVals and the checks of what the base knows of a record", () => {
  it("name alive, damaged and gone, a tombstone's am being never alive", () => {
    expect(MSX.amVals).to.deep.equal(['a', 'd', 'x'])
    expect(MSX.tombstoneAmVals).to.deep.equal(['d', 'x'])
  })

  describe("MSX.am", () => {
    holdsCases(MSX.am, 'bad_record', [
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

  describe("MSX.revision", () => {
    holdsCases(MSX.revision, 'bad_record', [
      // good:
      [revision,                                   true,  'passes a tok and a seq'],
      [{ ...revision, revision_seq: MSX.VoidRevisionSeq }, true, 'passes the seq of a central never stored'],
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
      expect(MSX.revision.parse({ ...revision, am: 'a', extra: 1 })).to.deep.equal(revision)
    })
  })

  describe("MSX.times", () => {
    holdsCases(MSX.times, 'bad_record', [
      [{ registered_at: T0, written_at: T0 },       true,  'passes two epoch milliseconds'],
      [{ registered_at: T0 },                       false, 'refuses a missing written_at'],
      [{ registered_at: 5, written_at: T0 },        false, 'refuses a small number, seconds or a count'],
      [{ registered_at: T0, written_at: T0 + 0.5 }, false, 'refuses a fraction of a millisecond'],
      [{ registered_at: new Date(T0), written_at: T0 }, false, 'refuses a Date'],
      [{ registered_at: String(T0), written_at: T0 }, false, 'refuses a string'],
    ])
  })

  describe("MSX.liveness and MSX.vaulted", () => {
    holdsCases(MSX.liveness, 'bad_record', [
      [{ am: 'a' },  true,  'passes liveness with an am'],
      [{},           false, 'refuses liveness without an am'],
    ])
    holdsCases(MSX.vaulted, 'bad_record', [
      [{ vault_tok: 'vault-tok-u1' }, true,  'passes a vault_tok'],
      [{ vault_tok: '' },             false, 'refuses an empty vault_tok'],
      [{},                            false, 'refuses a missing vault_tok'],
    ])
  })

  describe("MSX.sparseBase", () => {
    holdsCases(MSX.sparseBase, 'bad_record', [
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

    it("takes the six props from a record and strips the rest, as its example shows", () => {
      expect(MSX.sparseBase.parse(full)).to.deep.equal(baseProps)
    })

    it("takes the six props from a box, which ducks as its record", async () => {
      const box = await boxListingOf(mw).build(full)
      expect(MSX.sparseBase.parse(box)).to.deep.equal(baseProps)
    })

    it("refuses without quoting its input", () => {
      const err = TH.expectSyncRefusal(() => MSX.sparseBase.parse({ ...baseProps, vault_tok: 'SECRET-TOK', am: 'SECRET-AM' }), 'bad_record')
      expect(err.message).to.not.include('SECRET')
    })
  })

  describe("MSX.tombstone", () => {
    holdsCases(MSX.tombstone, 'bad_record', [
      [gone,   true,  'passes a deletion tombstone'],
      [ouch,   true,  'passes a damaged one\'s tombstone'],
      [sparse, false, 'refuses an alive sparse record'],
      [full,   false, 'refuses an alive full record'],
    ])
  })

  describe("MSX.isTombstone and MSX.VoidRevisionSeq", () => {
    it("tells a damaged or gone record from an alive one, whatever its form", () => {
      expect(MSX.isTombstone(gone)).to.be.true
      expect(MSX.isTombstone(ouch)).to.be.true
      expect(MSX.isTombstone(sparse)).to.be.false
      expect(MSX.isTombstone(full)).to.be.false
    })

    it("marks a central never stored with a seq below any a store puts", () => {
      expect(MSX.VoidRevisionSeq).to.be.lessThan(0)
    })

    it("passes the void row a sentinel makes, its zero toks and its 2008 date, as a tombstone of its kind", () => {
      const scope = { applabel: 'testapp', user_id: 'u1', vaultlabel: 'default', boxlabel: 'anthropic_api_key' }
      const sentinel = VS.sentinelBoxOf(scope, 'vault-tok-1')
      expect(VS.boxTombstone.parse(sentinel)).to.deep.include({ ...VS.VoidRevision, box_tok: VS.VoidLifeTok, registered_at: VS.VoidTime, written_at: VS.VoidTime, am: 'x' })
      expect(new Date(VS.VoidTime).toISOString()).to.eq('2008-08-08T08:08:08.777Z')
      expect(VS.VoidRevisionTok).to.eq('00000000-0000-0000-0000-000000000000')
      expect(VS.VoidLifeTok).to.eq('00000000-0000-0000-0000-000000000000')
    })
  })
})

describe("The checks of what reconciling passes", () => {
  const checkSet = (check: { parse: (val: unknown) => unknown }, goods: readonly string[], bads: readonly unknown[]): void => {
    for (const val of goods) { it(`passes '${val}'`, () => { expect(check.parse(val)).to.eq(val) }) }
    for (const val of bads) { it(`refuses ${JSON.stringify(val)} as 'unexpected_error'`, () => { TH.expectSyncRefusal(() => check.parse(val), 'unexpected_error') }) }
  }

  describe("MSX.recordShape", () => { checkSet(MSX.recordShape, MSX.recordShapeVals, ['empty', null, 'older']) })
  describe("MSX.age",         () => { checkSet(MSX.age, MSX.ageVals, ['skip', null, 'fill']) })
  describe("MSX.centralPolicy", () => { checkSet(MSX.centralPolicy, MSX.centralPolicyVals, ['edit', 'del', null]) })

  it("list the kinds of the table", () => {
    expect(MSX.centralPolicyVals).to.deep.equal(['older', 'same', 'fill', 'adopt', 'gone'])
    expect(MSX.recordShapeVals).to.deep.equal(['sparse', 'full', 'gone'])
    expect(MSX.ageVals).to.deep.equal(['older', 'same', 'newer'])
  })

  describe("MSX.reconciled", () => {
    holdsCases(MSX.reconciled, 'unexpected_error', [
      [{ central: sparse, policy: 'same' },  true,  'passes a central and the policy that chose it'],
      [{ central: gone,   policy: 'gone' },  true,  'passes a tombstone central'],
      [{ central: sparse },                  false, 'refuses a missing policy'],
      [{ policy: 'same' },                   false, 'refuses a missing central'],
      [{ central: sparse, policy: 'edit' },  false, 'refuses a policy that is no row of reconcileCentral'],
    ])
  })

  describe("MSX.settled", () => {
    holdsCases(MSX.settled, 'unexpected_error', [
      [{ badnews: [] },                                       true,  'passes no bad news'],
      [{ badnews: [new VaultError('stale_write', 'x')] },     true,  'passes bad news of VaultErrors'],
      [{ badnews: [new Error('plain')] },                     false, 'refuses bad news that is no VaultError'],
      [{},                                                    false, 'refuses a missing badnews'],
    ])
  })
})

describe("MSX.boxRecord and MSX.boxSparse", () => {
  describe("MSX.boxRecord", () => {
    holdsCases(MSX.boxRecord, 'bad_record', [
      [full,                                            true,  'passes a full record'],
      [{ ...full, sidecar: {} },                        true,  'passes an empty sidecar'],
      [sparse,                                          false, 'refuses a sparse record: it is the full one'],
      [gone,                                            false, 'refuses a tombstone'],
      [{ ...full, extra: 1 },                           false, 'refuses a field it does not take, being strict'],
      [{ ...full, fmt: 8 },                             false, 'refuses another format'],
      [{ ...full, sidecar: undefined },                 false, 'refuses a missing sidecar'],
      [{ ...full, sidecar: 'work account' },            false, 'refuses a sidecar that is no object'],
      [{ ...full, box_key_wrapped: undefined },         false, 'refuses a missing box_key_wrapped'],
      [{ ...full, whisper_ciphered: { cipher_iv_b64: 'iv' } }, false, 'refuses a whisper_ciphered missing its ciphertext'],
      [{ ...full, whisper_codec: 'json_v2' },           false, 'refuses a codec it does not know'],
      [{ ...full, whisper_schema_version: 2 },          false, 'refuses a schema version it does not know'],
      [{ ...full, boxlabel: 'B' },                      false, 'refuses a boxlabel that is no label'],
    ])

    it("hands back a plain copy of a full record", () => {
      const parsed = MSX.boxRecord.parse(full)
      expect(parsed).to.deep.equal(full)
      expect(parsed).to.not.eq(full)
    })

    it("passes a Box instance as a duck, and hands back a pojo of its fields", async () => {
      const box = await boxListingOf(mw).build(full)
      const parsed = MSX.boxRecord.parse(box)
      expect(parsed).to.deep.equal(full)
      expect(parsed).to.not.be.instanceOf(Box)
    })

    it("refuses a plain object carrying a field the Box ducks without", async () => {
      const box = await boxListingOf(mw).build(full)
      TH.expectSyncRefusal(() => MSX.boxRecord.parse({ ...MSX.boxRecord.parse(box), extra: 1 }), 'bad_record')
    })

    it("refuses a Box that is not full, as it ducks as the sparse form", async () => {
      const box = await boxListingOf(mw).build(sparse)
      TH.expectSyncRefusal(() => MSX.boxRecord.parse(box), 'bad_record')
    })

    it("refuses without quoting its input", () => {
      const err = TH.expectSyncRefusal(() => MSX.boxRecord.parse({ ...full, sidecar: 'SECRET-SIDECAR', extra: 'SECRET-EXTRA' }), 'bad_record')
      expect(err.message).to.not.include('SECRET')
    })
  })

  describe("MSX.boxSparse", () => {
    holdsCases(MSX.boxSparse, 'bad_record', [
      [sparse,                                  true,  'passes a sparse record'],
      [full,                                    true,  'passes a full record, stripping what is not sparse'],
      [gone,                                    true,  'passes a tombstone'],
      [{ ...sparse, whisper_codec: undefined }, false, 'refuses a record with no whisper_codec'],
      [{ ...sparse, whisper_schema_version: undefined }, false, 'refuses a record with no whisper_schema_version'],
      [{ ...sparse, fmt: 8 },                   false, 'refuses another format'],
      [{ ...sparse, boxlabel: 'B' },            false, 'refuses a boxlabel that is no label'],
      [{ ...sparse, vault_tok: undefined },     false, 'refuses a missing vault_tok'],
    ])

    it("strips the sidecar and the sealed parts, which only the full record carries", () => {
      const parsed = MSX.boxSparse.parse(full)
      expect(parsed).to.not.have.any.keys('sidecar', 'box_key_wrapped', 'whisper_ciphered')
      expect(parsed).to.deep.equal(sparse)
    })

    it("keeps the whisper's codec and schema version, so a sparse record can be sealed over as it is", () => {
      const parsed = MSX.boxSparse.parse(full)
      expect(parsed.whisper_codec).to.eq('json_v1')
      expect(parsed.whisper_schema_version).to.eq(1)
    })

    it("strips a field it does not take, where boxRecord refuses it", () => {
      expect(MSX.boxSparse.parse({ ...sparse, extra: 1 })).to.deep.equal(sparse)
    })

    it("takes its fields from a Box, which ducks as its record", async () => {
      const box = await boxListingOf(mw).build(full)
      expect(MSX.boxSparse.parse(box)).to.deep.equal(sparse)
    })
  })

  it("name the format of the box the models describe", () => {
    expect(MSX.BoxFormat).to.eq(5001)
    expect(full.fmt).to.eq(MSX.BoxFormat)
  })
})

describe("The checks of options", () => {
  describe("MSX.horizonMillis", () => {
    holdsCases(MSX.horizonMillis, 'bad_option', [
      [0,         true,  'passes zero: nothing is timely'],
      [60_000,    true,  'passes a span of milliseconds'],
      [0.5,       true,  'passes a fraction of a millisecond'],
      [Infinity,  true,  'passes Infinity, for never'],
      [-1,        false, 'refuses a negative span'],
      [-Infinity, false, 'refuses minus Infinity'],
      [NaN,       false, 'refuses NaN'],
      ["60000",   false, 'refuses text'],
      [null,      false, 'refuses null'],
    ])
  })

  describe("MSX.timelyOpts and MSX.sendOpts", () => {
    holdsCases(MSX.timelyOpts, 'bad_option', [
      [{},                                          true,  'passes no options'],
      [{ maxMillisSinceRefresh: 0, maxWorldMillis: Infinity }, true, 'passes both horizons'],
      [{ maxMillisSinceRefresh: undefined },        true,  'passes a horizon left undefined'],
      [{ maxMillisSinceRefresh: -1 },               false, 'refuses a negative record horizon'],
      [{ maxWorldMillis: '5' },                     false, 'refuses a world horizon that is text'],
      [{ maxWorldMillis: NaN },                     false, 'refuses a world horizon that is NaN'],
    ])
    holdsCases(MSX.sendOpts, 'bad_option', [
      [{ maxWorldMillis: 5 },                       true,  'passes the horizons'],
      [{},                                          true,  'passes no options'],
      [{ maxWorldMillis: -1 },                      false, 'refuses a negative horizon, as timelyOpts does'],
    ])

    it("take their fields from the bag given and strip the rest", () => {
      expect(MSX.timelyOpts.parse({ maxWorldMillis: 5, reseal: true })).to.deep.equal({ maxWorldMillis: 5 })
      expect(MSX.sendOpts.parse({ maxWorldMillis: 5, reseal: true })).to.deep.equal({ maxWorldMillis: 5 })
    })

    it("name the failing field", () => {
      const err = TH.expectSyncRefusal(() => MSX.timelyOpts.parse({ maxMillisSinceRefresh: -1 }), 'bad_option')
      expect(err.meta?.fieldnames).to.deep.equal(['maxMillisSinceRefresh'])
    })
  })

  describe("MSX.storableOpts", () => {
    holdsCases(MSX.storableOpts, 'bad_option', [
      [{ maxMillisSinceRefresh: 60_000 },                    true,  'passes the horizon alone'],
      [{},                                                   false, 'refuses a missing horizon'],
      [{ maxMillisSinceRefresh: -5 },                        false, 'refuses a negative horizon'],
    ])

    it("strips a field it does not take", () => {
      expect(MSX.storableOpts.parse({ maxMillisSinceRefresh: 5, extra: 1 })).to.deep.equal({ maxMillisSinceRefresh: 5 })
    })
  })
})

describe("The checks of the world and the listing", () => {
  describe("MSX.lockState", () => {
    holdsCases(MSX.lockState, 'unexpected_error', [
      ["unlocked", true,  'passes unlocked'],
      ["locked",   true,  'passes locked'],
      ["LOCKED",   false, 'refuses another spelling: a world that answers it is a bug'],
      [true,       false, 'refuses a boolean'],
      [undefined,  false, 'refuses undefined'],
    ])
  })

  describe("MSX.world", () => {
    holdsCases(MSX.world, 'bad_option', [
      [{ clock: { now: () => T0 } },  true,  'passes a world carrying a clock'],
      [mw.world,                      true,  'passes the test world'],
      [{ clock: {} },                 false, 'refuses a clock without now'],
      [{},                            false, 'refuses a world without a clock'],
      [null,                          false, 'refuses null'],
    ])

    it("takes the clock from whatever carries it and strips the rest", () => {
      const parsed = MSX.world.parse(mw.world)
      expect(Object.keys(parsed)).to.deep.equal(['clock'])
      expect(parsed.clock.now()).to.eq(T0)
    })
  })

  describe("MSX.isListing and MSX.IsListing", () => {
    it("tell a listing from anything else, by its tag", () => {
      expect(MSX.isListing(boxListingOf(mw))).to.be.true
      expect(MSX.isListing({ [MSX.IsListing]: true })).to.be.true
      expect(MSX.isListing({ [MSX.IsListing]: 1 })).to.be.false
      expect(MSX.isListing({})).to.be.false
      expect(MSX.isListing(null)).to.be.false
      expect(MSX.isListing(undefined)).to.be.false
      expect(MSX.isListing('listing')).to.be.false
    })
  })

  describe("MSX.listingOpts", () => {
    const opts = { world: mw.world, vaultDB: mw.vaultDB, maxMillisSinceRefresh: 1000, onBadNews: mw.onBadNews }
    holdsCases(MSX.listingOpts, 'bad_option', [
      [opts,                                                     true,  'passes the test world and vaultDB'],
      [{ ...opts, onBadNews: undefined },                        true,  'passes no onBadNews'],
      [{ ...opts, maxMillisSinceRefresh: Infinity },             true,  'passes a horizon of Infinity'],
      [{ ...opts, world: undefined },                            false, 'refuses a missing world'],
      [{ ...opts, world: { ...mw.world, takeWorld: undefined } }, false, 'refuses a world that cannot takeWorld'],
      [{ ...opts, world: { ...mw.world, ensureTimely: 5 } },     false, 'refuses a world whose ensureTimely is no function'],
      [{ ...opts, world: { ...mw.world, lockState: undefined } }, false, 'refuses a world with no lockState'],
      [{ ...opts, world: { ...mw.world, clock: {} } },           false, 'refuses a world with no clock'],
      [{ ...opts, vaultDB: { tryPutBox: () => null } },          false, 'refuses a vaultDB with no tryGetBox'],
      [{ ...opts, maxMillisSinceRefresh: -1 },                   false, 'refuses a negative horizon'],
      [{ ...opts, maxMillisSinceRefresh: undefined },            false, 'refuses a missing horizon'],
      [{ ...opts, onBadNews: 'tell me' },                        false, 'refuses an onBadNews that is no function'],
      [{ ...opts, extra: 1 },                                    false, 'refuses an option it does not take, being strict'],
    ])

    it("names the failing field", () => {
      const err = TH.expectSyncRefusal(() => MSX.listingOpts.parse({ ...opts, maxMillisSinceRefresh: -1 }), 'bad_option')
      expect(err.meta?.fieldnames).to.deep.equal(['maxMillisSinceRefresh'])
    })
  })

  describe("MSX.storableArgs", () => {
    const listing = boxListingOf(mw)
    const args = { world: mw.world, listing, central: sparse, opts: { maxMillisSinceRefresh: 1000 } }
    holdsCases(MSX.storableArgs, 'bad_option', [
      [args,                                           true,  'passes a world, a listing, a central and the options'],
      [{ ...args, central: gone },                     true,  'passes a tombstone'],
      [{ ...args, central: null },                     false, 'refuses a null central'],
      [{ ...args, central: { am: 'a' } },              false, 'refuses a central that fails sparseBase'],
      [{ ...args, listing: {} },                       false, 'refuses a listing that answers to no IsListing'],
      [{ ...args, listing: undefined },                false, 'refuses a missing listing'],
      [{ ...args, world: {} },                         false, 'refuses a world with no clock'],
      [{ ...args, opts: {} },                          false, 'refuses options with no horizon'],
      [{ ...args, opts: { maxMillisSinceRefresh: -1 } }, false, 'refuses a negative horizon'],
      [{ ...args, extra: 1 },                          false, 'refuses an argument it does not take, being strict'],
    ])

    it("names the failing field", () => {
      const err = TH.expectSyncRefusal(() => MSX.storableArgs.parse({ ...args, listing: {} }), 'bad_option')
      expect(err.meta?.fieldnames).to.deep.equal(['listing'])
    })
  })
})

describe("MSX.boxDna", () => {
  const dna = { ...scope, whisper: { val: 'sk-ant-fake' }, sidecar: {} }
  const filled = { ...dna, whisper_codec: 'json_v1', whisper_schema_version: 1 }
  const { box_key_wrapped, whisper_ciphered } = full
  // A dna carries no revision_seq, so the factory's props stop at the rest.
  const { revision_seq: _revision_seq, ...factoryProps } = baseProps

  holdsCases(MSX.boxDna, 'bad_option', [
    // the scope, the whisper and the sidecar, and what a caller may give beside them:
    [dna,                                                   true,  'passes the scope, a whisper and a sidecar'],
    [{ ...dna, whisper: { val: { key: 'sk-ant-fake', orgId: null } } }, true, 'passes a whisper that is an object, null inside it'],
    [{ ...dna, sidecar: { account: 'work' } },              true,  'passes a sidecar with a field'],
    [{ ...dna, whisper_codec: undefined },                  true,  'passes optional props given as undefined'],
    [{ ...dna, ...factoryProps, fmt: MSX.BoxFormat },       true,  'passes the props the factory controls, each passing its check'],
    // the whisper and the sidecar, both required:
    [scope,                                                 false, 'refuses the scope alone'],
    [{ ...scope, whisper: { val: 'sk-ant-fake' } },         false, 'refuses a whisper with no sidecar, as its third example shows'],
    [{ ...scope, sidecar: {} },                             false, 'refuses a sidecar with no whisper, as its fourth example shows'],
    [{ ...dna, whisper: undefined },                        false, 'refuses a whisper given as undefined'],
    [{ ...dna, sidecar: undefined },                        false, 'refuses a sidecar given as undefined'],
    // the scope refused:
    [{ ...dna, boxlabel: undefined },                       false, 'refuses a dna with no boxlabel'],
    [{ ...dna, boxlabel: 'B' },                             false, 'refuses a boxlabel that is no label, as its sixth example shows'],
    [{ boxlabel: 'anthropic_api_key' },                     false, 'refuses a boxlabel without its vault'],
    // the record's own props refused:
    [{ ...dna, sidecar: 'work account' },                   false, 'refuses a sidecar that is no object'],
    [{ ...dna, whisper_codec: 'json_v2' },                  false, 'refuses a codec it does not know'],
    [{ ...dna, whisper_schema_version: 2 },                 false, 'refuses a schema version it does not know'],
    [{ ...dna, box_key_wrapped },                           false, 'refuses a box_key_wrapped, which only the seal makes'],
    [{ ...dna, whisper_ciphered },                          false, 'refuses a whisper_ciphered, which only the seal makes, as its eighth example shows'],
    [{ ...dna, whisper: null },                             false, 'refuses a whisper that is null'],
    [{ ...dna, whisper: { val: null } },                    false, 'refuses a whisper whose val is null'],
    [{ ...dna, whisper: { val: new Date(T0) } },            false, 'refuses a whisper JSON would mangle'],
    [{ ...dna, whisper: 'sk-ant-fake' },                    false, 'refuses a bare whisper, not given as { val }, as its fifth example shows'],
    [{ ...dna, whisper: {} },                               false, 'refuses a whisper with no val'],
    [{ ...dna, whisper: { val: 'sk-ant-fake', note: 'x' } }, false, 'refuses a whisper with a field beside its val'],
    // the factory's props, given, must pass their checks:
    [{ ...dna, fmt: 8 },                                    false, 'refuses another format'],
    [{ ...dna, am: 'z' },                                   false, 'refuses an am it does not know'],
    [{ ...dna, vault_tok: 7 },                              false, 'refuses a vault_tok that is no string'],
    [{ ...dna, revision_seq: 1 },                           false, 'refuses a revision_seq, which a dna never carries, as its seventh example shows'],
    [{ ...dna, registered_at: 5 },                          false, 'refuses a registered_at that is no epoch'],
    // a bag a person typed:
    [{ ...dna, sidcar: {} },                                false, 'refuses a field it does not take, being strict'],
    [null,                                                  false, 'refuses null'],
  ])

  it("hands back the whisper and the sidecar given, with the codec and the schema version filled, as its first example shows", () => {
    expect(MSX.boxDna.parse(dna)).to.deep.equal(filled)
  })

  it("strips the props the factory controls, as its second example shows", () => {
    const parsed = MSX.boxDna.parse({ ...dna, ...factoryProps, fmt: MSX.BoxFormat })
    expect(parsed).to.deep.equal(filled)
    expect(parsed).to.not.have.any.keys('fmt', 'am', 'vault_tok', 'revision_tok', 'registered_at', 'written_at')
  })

  it("fills a default for a prop given as undefined", () => {
    expect(MSX.boxDna.parse({ ...dna, whisper_codec: undefined, whisper_schema_version: undefined })).to.deep.equal(filled)
  })

  it("keeps the sidecar given", () => {
    const sidecar = { account: 'work' }
    expect(MSX.boxDna.parse({ ...dna, sidecar })).to.deep.equal({ ...filled, sidecar })
  })

  it("names the failing field", () => {
    const err = TH.expectSyncRefusal(() => MSX.boxDna.parse({ ...dna, boxlabel: 'B' }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
  })

  it("names the missing sidecar, and the missing whisper, as its third and fourth examples show", () => {
    expect(TH.expectSyncRefusal(() => MSX.boxDna.parse({ ...scope, whisper: { val: 'sk-ant-fake' } }), 'bad_option').meta?.fieldnames).to.deep.equal(['sidecar'])
    expect(TH.expectSyncRefusal(() => MSX.boxDna.parse({ ...scope, sidecar: {} }), 'bad_option').meta?.fieldnames).to.deep.equal(['whisper'])
  })

  it("refuses without quoting its input", () => {
    const err = TH.expectSyncRefusal(() => MSX.boxDna.parse({ ...scope, sidecar: 'SECRET-SIDECAR', whisper: null, extra: 'SECRET-EXTRA' }), 'bad_option')
    expect(err.message).to.not.include('SECRET')
  })
})

describe("MSX.ifAbsentVals, MSX.ifAbsent and MSX.fetchOpts", () => {
  holdsCases(MSX.ifAbsent, 'bad_option', [
    ["fail",     true,  'passes fail'],
    ["nil",      true,  'passes nil'],
    ["create",   false, 'refuses create, which fetch does not offer'],
    [undefined,  false, 'refuses undefined: the default is applied by the caller, not the check'],
  ])

  holdsCases(MSX.fetchOpts, 'bad_option', [
    [{},                                                true,  'passes no options'],
    [{ ifAbsent: 'nil' },                               true,  'passes ifAbsent nil'],
    [{ ifAbsent: undefined },                           true,  'passes ifAbsent undefined, as a caller spreading options may leave it'],
    [{ ifAbsent: 'fail', maxMillisSinceRefresh: 5 },    true,  'passes ifAbsent beside the timely options'],
    [{ ifAbsent: 'replace' },                           false, 'refuses an ifAbsent that is not one of the two'],
    [{ maxMillisSinceRefresh: -1 },                     false, 'refuses a negative horizon, as timelyOpts does'],
  ])

  it("keeps ifAbsent and the timely options and strips the rest", () => {
    expect(MSX.fetchOpts.parse({ ifAbsent: 'nil', maxWorldMillis: 5, reseal: true })).to.deep.equal({ ifAbsent: 'nil', maxWorldMillis: 5 })
  })
})

describe("MSX.ifPresentVals, MSX.ifPresent and MSX.sendOpts", () => {
  it("name the three policies", () => {
    expect(MSX.ifPresentVals).to.deep.equal(['repl', 'fail', 'get'])
  })

  holdsCases(MSX.ifPresent, 'bad_option', [
    ["repl",     true,  'passes repl'],
    ["fail",     true,  'passes fail'],
    ["get",      true,  'passes get'],
    ["replace",  false, 'refuses replace, which it does not spell'],
    [undefined,  false, 'refuses undefined: sendOpts makes it optional, not the check'],
  ])

  holdsCases(MSX.sendOpts, 'bad_option', [
    [{},                                                true,  'passes no options'],
    [{ ifPresent: 'repl' },                             true,  'passes ifPresent repl'],
    [{ ifPresent: undefined },                          true,  'passes ifPresent undefined'],
    [{ ifPresent: 'repl', maxWorldMillis: 5 },          true,  'passes ifPresent beside the timely options'],
    [{ ifPresent: 'replace' },                          false, 'refuses an ifPresent it does not offer'],
    [{ maxMillisSinceRefresh: -1, ifPresent: 'repl' },  false, 'refuses a negative horizon, as timelyOpts does'],
  ])

  it("keeps ifPresent and the timely options and strips the rest", () => {
    expect(MSX.sendOpts.parse({ ifPresent: 'repl', maxWorldMillis: 5, ifAbsent: 'nil', reseal: true })).to.deep.equal({ ifPresent: 'repl', maxWorldMillis: 5 })
  })

  it("name the failing field", () => {
    const err = TH.expectSyncRefusal(() => MSX.sendOpts.parse({ ifPresent: 'fetch' }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['ifPresent'])
  })
})

describe("MSX.whisperHolder", () => {
  holdsCases(MSX.whisperHolder, 'bad_option', [
    // a whisper as its val, any JSON a whisper can carry:
    [{ val: 'sk-ant-fake' },                                true,  'passes a string, as its first example shows'],
    [{ val: { apiKey: 'sk-ant-fake', orgId: null } },       true,  'passes a plain object, null inside it, as its second example shows'],
    [{ val: ['sk-ant-fake', 7, true, null] },               true,  'passes an array, null inside it'],
    [{ val: 7 },                                            true,  'passes a number'],
    [{ val: false },                                        true,  'passes a boolean'],
    // not given as { val }:
    ['sk-ant-fake',                                         false, 'refuses a bare whisper, as its third example shows'],
    [null,                                                  false, 'refuses null'],
    [undefined,                                             false, 'refuses undefined'],
    [{},                                                    false, 'refuses an object with no val'],
    [{ value: 'sk-ant-fake' },                              false, 'refuses a whisper under another name'],
    [{ val: 'sk-ant-fake', note: 'work' },                  false, 'refuses a field beside the val, as its fifth example shows'],
    [new Map([['val', 'sk-ant-fake']]),                     false, 'refuses a Map'],
    // a val no whisper may be:
    [{ val: null },                                         false, 'refuses a val that is null, as its fourth example shows'],
    [{ val: undefined },                                    false, 'refuses a val given as undefined'],
    [{ val: new Date(T0) },                                 false, 'refuses a val JSON would mangle'],
    [{ val: { apiKey: undefined } },                        false, 'refuses a val holding undefined'],
  ])

  it("hands back a frozen copy, never the object it was given, nor the whisper inside it", () => {
    const given = { val: { apiKey: 'sk-ant-fake' } }
    const parsed = MSX.whisperHolder.parse(given)
    expect(parsed).to.deep.equal(given)
    expect(parsed).to.not.eq(given)
    expect(parsed.val).to.not.eq(given.val)
    expect(Object.isFrozen(parsed)).to.be.true
    expect(Object.isFrozen(parsed.val)).to.be.true
    given.val.apiKey = 'sk-ant-changed'
    expect(parsed).to.deep.equal({ val: { apiKey: 'sk-ant-fake' } })
  })

  it("names the failing field: val for a val no whisper may be, none for a whisper not given as { val }", () => {
    expect(TH.expectSyncRefusal(() => MSX.whisperHolder.parse({ val: null }), 'bad_option').meta?.fieldnames).to.deep.equal(['val'])
    expect(TH.expectSyncRefusal(() => MSX.whisperHolder.parse('sk-ant-fake'), 'bad_option').meta?.fieldnames).to.deep.equal([])
  })

  it("quotes nothing of what it was handed, a val's secret or a field's name, in its message, meta, cause or stack", () => {
    const Marked = [
      'SECRET-BARE',
      { val: { apiKey: 'SECRET-VAL', when: new Date(T0) } },
      { val: ['SECRET-VAL', undefined] },
      { val: { SECRET_KEY: undefined } },
      { val: 'SECRET-VAL', SECRET_FIELD: 'SECRET-EXTRA' },
      { SECRET_FIELD: 'SECRET-VAL' },
    ]
    for (const marked of Marked) {
      const err = TH.expectSyncRefusal(() => MSX.whisperHolder.parse(marked), 'bad_option')
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
    }
  })
})

describe("MSX.whisperHolder and LOCKED", () => {
  it("refuses LOCKED as 'bad_option' with a sentence that names it, and a copy of it as no { val }", () => {
    expect(TH.expectSyncRefusal(() => MSX.whisperHolder.parse(MSX.LOCKED), 'bad_option').message).to.include('LOCKED is not a whisper: unseal or expose one first')
    expect(TH.expectSyncRefusal(() => MSX.whisperHolder.parse({ ...MSX.LOCKED }), 'bad_option').message).to.not.include('LOCKED')
  })
})

describe("MSX.boxDna and MSX.boxPatch: the duckish of a box's dna and of its patch", () => {
  const whisper = { val: 'sk-ant-fake' }
  const { sidecar: _sidecar, ...sealedless } = full

  describe("boxDna", () => {
    holdsCases(MSX.boxDna, 'bad_option', [
      [{ ...scope, whisper, sidecar: {} },                                   true,  'passes the scope, whisper and sidecar, as its first example shows'],
      [{ ...scope, whisper, sidecar: {}, am: 'x', vault_tok: 'tok-u1' },     true,  'passes the props the factory controls, as its second example shows'],
      [{ ...scope, whisper },                                                false, 'refuses a dna with no sidecar, as its third example shows'],
      [{ ...scope, whisper, sidecar: {}, revision_seq: 3 },                  false, 'refuses a revision_seq, as its fourth example shows'],
      [{ ...scope, whisper, sidecar: {}, whisper_ciphered: full.whisper_ciphered }, false, 'refuses a sealed part, as its fifth example shows'],
      [{ ...scope, whisper, sidecar: {}, am: 'q' },                          false, 'refuses a factory prop that fails its check'],
      [{ whisper, sidecar: {} },                                             false, 'refuses a dna with no scope'],
    ])

    it("strips the props the factory controls and fills the whisper's codec", () => {
      const given = { ...scope, whisper, sidecar: {}, fmt: MSX.BoxFormat, am: 'x', vault_tok: 'tok-u1', revision_tok: 'rev-given', registered_at: T0, written_at: T0 }
      expect(MSX.boxDna.parse(given)).to.deep.equal({ ...scope, whisper, sidecar: {}, whisper_codec: 'json_v1', whisper_schema_version: 1 })
    })
  })

  describe("boxPut", () => {
    holdsCases(MSX.boxPut, 'bad_option', [
      [{ boxlabel: scope.boxlabel, whisper },                                true,  'passes a boxlabel and a whisper, as its example shows'],
      [{ boxlabel: scope.boxlabel, sidecar: {} },                            true,  'passes a boxlabel and a sidecar'],
      [{ ...full, whisper, sidecar: {} },                                    true,  'passes a full record given back with both halves'],
      [{ whisper, sidecar: {} },                                             false, 'refuses a patch with no boxlabel'],
      [{ boxlabel: scope.boxlabel },                                         false, 'refuses a boxlabel naming neither half'],
      [{ boxlabel: '', whisper },                                            false, 'refuses an empty boxlabel'],
      [{ boxlabel: scope.boxlabel, whisper, sidecarr: {} },                  false, 'refuses a field no box record has'],
    ])
  })

  describe("boxPatch", () => {
    holdsCases(MSX.boxPatch, 'bad_option', [
      [{ whisper, sidecar: {} },                                             true,  'passes the whisper and the sidecar alone'],
      [{ ...full, whisper, sidecar: {} },                                    true,  'passes a full record given back with its whisper and a sidecar, as its sixth example shows'],
      [{ ...sparse, whisper, sidecar: {} },                                  true,  'passes a sparse record given back so'],
      [{ ...sealedless, revision_seq: 99, am: 'x', whisper, sidecar: {} },   true,  'passes the factory props, revision_seq among them, whatever they say'],
      [{ whisper },                                                          true,  'passes a whisper alone, the sidecar kept'],
      [{ sidecar: {} },                                                      true,  'passes a sidecar alone, the whisper kept, as its example shows'],
      [{},                                                                   false, 'refuses a patch naming neither, as its example shows'],
      [{ whisper: MSX.LOCKED, sidecar: {} },                                 false, 'refuses LOCKED as the whisper, as its seventh example shows'],
      [{ whisper: 'sk-ant-fake', sidecar: {} },                              false, 'refuses a bare whisper'],
      [{ whisper, sidecar: 'note' },                                         false, 'refuses a sidecar that fails its check'],
      [{ ...full, revision_seq: 'one', whisper, sidecar: {} },               false, 'refuses a factory prop that fails its check'],
      [{ ...full, boxlabel: 'B', whisper, sidecar: {} },                     false, 'refuses a scope field that fails its check'],
      [{ whisper, sidecar: {}, sidecarr: {} },                               false, 'refuses a field no box record has'],
      [undefined,                                                            false, 'refuses undefined'],
    ])

    it("hands back the whisper, the sidecar, and the scope's fields as given, stripping the rest", () => {
      expect(MSX.boxPatch.parse({ ...full, whisper, sidecar: { note: 'new' } })).to.deep.equal({ ...scope, whisper, sidecar: { note: 'new' } })
      expect(MSX.boxPatch.parse({ whisper, sidecar: {} })).to.deep.equal({ whisper, sidecar: {}, applabel: undefined, user_id: undefined, vaultlabel: undefined, boxlabel: undefined })
    })

    it("names the failing field, quoting nothing of a whisper or a field's name", () => {
      expect(TH.expectSyncRefusal(() => MSX.boxPatch.parse({ whisper: { val: null }, sidecar: {} }), 'bad_option').meta?.fieldnames).to.deep.equal(['whisper.val'])
      for (const marked of [{ whisper: { val: { SECRET: undefined } }, sidecar: {} }, { whisper: { val: 'SECRET-VAL' }, sidecar: {}, SECRET_FIELD: 1 }]) {
        const err = TH.expectSyncRefusal(() => MSX.boxPatch.parse(marked), 'bad_option')
        expect(TH.thrownText(err)).to.not.include('SECRET')
        expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      }
    })
  })
})

describe("MSX.vaultRecord and MSX.vaultSparse: the gate rides in the vault record, and nowhere in the sparse form", () => {
  const { boxlabel: _boxlabel, ...vaultscope } = scope
  const sparseVault = { ...vaultscope, fmt: MSX.VaultFormat, ...baseProps }

  const gate = { gate_epoch: MSX.FirstGateEpoch, passphrase_wayin: TH.wayinOf('passphrase'), passkey_wayin: null }

  holdsCases(MSX.vaultRecord, 'bad_record', [
    [{ ...sparseVault, gate },       true,  'passes a record with its gate, a passphrase wayin and no passkey'],
    [{ ...sparseVault, gate: null }, false, 'refuses a record whose gate is null: a vault record is never without one'],
    [sparseVault,                    false, 'refuses a record without its gate'],
    [{ ...sparseVault, gate: { ...gate, gate_epoch: undefined } }, false, 'refuses a gate without its gate_epoch'],
    [{ ...sparseVault, gate: { ...gate, gate_epoch: 0 } },         false, 'refuses gate_epoch 0: the first is 1'],
    [{ ...sparseVault, gate: {} },   false, 'refuses a gate without its wayins'],
  ])

  it("strips the gate from the sparse form", () => {
    expect(MSX.vaultSparse.parse({ ...sparseVault, gate })).to.deep.equal(sparseVault)
  })
})
