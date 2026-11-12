import { afterEach, describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import * as GX from '../../src/shapes/shapes-gateish'
import { LOCKED } from '../../src/helpers/consts'
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
const baseProps = { revision_tok: 'rev-a1', revision_seq: 1, registered_at: T0, written_at: T0, am: 'a', vault_tok: 'vault-tok-u1' }
const scope     = mw.boxscope('anthropic_api_key')

describe("SX.boxRecord and SX.boxSparse", () => {
  describe("SX.boxRecord", () => {
    expectCases(SX.boxRecord, [
      [full,                                            true,  'passes a full record'],
      [{ ...full, sidecar: {} },                        true,  'passes an empty sidecar'],
      [sparse,                                          false, 'refuses a sparse record: it is the full one'],
      [gone,                                            false, 'refuses a tombstone'],
      [{ ...full, extra: 1 },                           false, 'refuses a field it does not accept, being strict'],
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
      const parsed = SX.boxRecord.parse(full)
      expect(parsed).to.deep.equal(full)
      expect(parsed).to.not.eq(full)
    })

    it("passes a Box instance, and returns a plain object of its fields", () => {
      const box = boxListingOf(mw).deliverRecord(full)
      const parsed = SX.boxRecord.parse(box)
      expect(parsed).to.deep.equal(full)
      expect(parsed).to.not.be.instanceOf(Box)
    })

    it("refuses a plain object with a field a Box does not have", () => {
      const box = boxListingOf(mw).deliverRecord(full)
      TH.expectSyncRefusal(() => SX.boxRecord.parse({ ...SX.boxRecord.parse(box), extra: 1 }))
    })

    it("refuses a Box that is not full", () => {
      const box = boxListingOf(mw).deliverRecord(sparse)
      TH.expectSyncRefusal(() => SX.boxRecord.parse(box))
    })

    it("refuses without quoting its input", () => {
      const err = TH.expectSyncRefusal(() => SX.boxRecord.parse({ ...full, sidecar: 'SECRET-SIDECAR', extra: 'SECRET-EXTRA' }))
      expect(err.message).to.not.include('SECRET')
    })
  })

  describe("SX.boxSparse", () => {
    expectCases(SX.boxSparse, [
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
      const parsed = SX.boxSparse.parse(full)
      expect(parsed).to.not.have.any.keys('sidecar', 'box_key_wrapped', 'whisper_ciphered')
      expect(parsed).to.deep.equal(sparse)
    })

    it("keeps the whisper's codec and schema version, so a sparse record can be sealed over as it is", () => {
      const parsed = SX.boxSparse.parse(full)
      expect(parsed.whisper_codec).to.eq('json_v1')
      expect(parsed.whisper_schema_version).to.eq(1)
    })

    it("strips a field it does not accept, where boxRecord refuses it", () => {
      expect(SX.boxSparse.parse({ ...sparse, extra: 1 })).to.deep.equal(sparse)
    })

    it("takes its fields from a Box", () => {
      const box = boxListingOf(mw).deliverRecord(full)
      expect(SX.boxSparse.parse(box)).to.deep.equal(sparse)
    })
  })

  it("use box format 5001", () => {
    expect(SX.BoxFormat).to.eq(5001)
    expect(full.fmt).to.eq(SX.BoxFormat)
  })
})

describe("VX.boxDna", () => {
  const dna = { ...scope, whisper: { apiKey: 'sk-ant-fake' }, sidecar: {} }
  const filled = { ...dna, whisper_codec: 'json_v1', whisper_schema_version: 1 }
  const { box_key_wrapped, whisper_ciphered } = full
  // A dna carries no revision_seq, so the factory's props stop at the rest.
  const { revision_seq: _revision_seq, ...factoryProps } = baseProps

  expectCases(VX.boxDna, [
    // the scope, the whisper and the sidecar, and what a caller may give beside them:
    [dna,                                                   true,  'passes the scope, a whisper and a sidecar'],
    [{ ...dna, whisper: { key: 'sk-ant-fake', orgId: null } }, true, 'passes a whisper that is an object, null inside it'],
    [{ ...dna, sidecar: { account: 'work' } },              true,  'passes a sidecar with a field'],
    [{ ...dna, whisper_codec: undefined },                  true,  'passes optional props given as undefined'],
    [{ ...dna, ...factoryProps, fmt: SX.BoxFormat },       true,  'passes the props the factory controls, each passing its check'],
    // the whisper and the sidecar, each defaulting:
    [scope,                                                 true,  'passes the scope alone'],
    [{ ...scope, whisper: { apiKey: 'sk-ant-fake' } },         true,  'passes a whisper with no sidecar'],
    [{ ...scope, sidecar: {} },                             true,  'passes a sidecar with no whisper'],
    [{ ...dna, whisper: undefined },                        true,  'passes a whisper given as undefined'],
    [{ ...dna, sidecar: undefined },                        true,  'passes a sidecar given as undefined'],
    // the scope refused:
    [{ ...dna, boxlabel: undefined },                       false, 'refuses a dna with no boxlabel'],
    [{ ...dna, boxlabel: 'B' },                             false, 'refuses a boxlabel that is no label'],
    [{ boxlabel: 'anthropic_api_key' },                     false, 'refuses a boxlabel without its vault'],
    [{ whisper: { apiKey: 'sk-ant-fake' }, sidecar: {} },      false, 'refuses a dna with no scope'],
    // the record's own props refused:
    [{ ...dna, sidecar: 'work account' },                   false, 'refuses a sidecar that is no object'],
    [{ ...dna, whisper_codec: 'json_v2' },                  false, 'refuses a codec it does not know'],
    [{ ...dna, whisper_schema_version: 2 },                 false, 'refuses a schema version it does not know'],
    [{ ...dna, box_key_wrapped },                           false, 'refuses a box_key_wrapped, which only the seal makes'],
    [{ ...dna, whisper_ciphered },                          false, 'refuses a whisper_ciphered, which only the seal makes'],
    [{ ...dna, whisper: null },                             false, 'refuses a whisper that is null'],
    [{ ...dna, whisper: new Date(T0) },                     false, 'refuses a whisper JSON would mangle'],
    [{ ...dna, whisper: LOCKED },                           false, 'refuses LOCKED as the whisper'],
    [{ ...dna, whisper: { ...LOCKED } },                    false, 'refuses a copy of LOCKED as the whisper'],
    // the factory's props, given, must pass their checks:
    [{ ...dna, fmt: 8 },                                    false, 'refuses another format'],
    [{ ...dna, am: 'z' },                                   false, 'refuses an am it does not know'],
    [{ ...dna, vault_tok: 7 },                              false, 'refuses a vault_tok that is no string'],
    [{ ...dna, revision_seq: 1 },                           false, 'refuses a revision_seq, which a dna never carries'],
    [{ ...dna, registered_at: 5 },                          false, 'refuses a registered_at that is no epoch'],
    // a bag a person typed:
    [{ ...dna, sidcar: {} },                                false, 'refuses a field it does not accept, being strict'],
    [null,                                                  false, 'refuses null'],
  ])

  it("hands back the whisper and the sidecar given, with the codec and the schema version filled", () => {
    expect(VX.boxDna.parse(dna)).to.deep.equal(filled)
  })

  it("strips the props the factory controls", () => {
    const parsed = VX.boxDna.parse({ ...dna, ...factoryProps, fmt: SX.BoxFormat })
    expect(parsed).to.deep.equal(filled)
    expect(parsed).to.not.have.any.keys('fmt', 'am', 'vault_tok', 'revision_tok', 'registered_at', 'written_at')
  })

  it("fills a default for a prop given as undefined", () => {
    expect(VX.boxDna.parse({ ...dna, whisper_codec: undefined, whisper_schema_version: undefined })).to.deep.equal(filled)
  })

  it("keeps the sidecar given", () => {
    const sidecar = { account: 'work' }
    expect(VX.boxDna.parse({ ...dna, sidecar })).to.deep.equal({ ...filled, sidecar })
  })

  it("names the failing field", () => {
    const err = TH.expectSyncRefusal(() => VX.boxDna.parse({ ...dna, boxlabel: 'B' }))
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
  })

  it("fills a whisper of { val: {} } and a sidecar of {} where left out", () => {
    expect(VX.boxDna.parse(scope)).to.deep.equal({ ...scope, whisper: {}, sidecar: {}, whisper_codec: 'json_v1', whisper_schema_version: 1 })
  })

  it("refuses without quoting its input", () => {
    const err = TH.expectSyncRefusal(() => VX.boxDna.parse({ ...scope, sidecar: 'SECRET-SIDECAR', whisper: null, extra: 'SECRET-EXTRA' }))
    expect(err.message).to.not.include('SECRET')
  })
})

describe("VX.boxDna and VX.boxPatch", () => {
  const whisper = { apiKey: 'sk-ant-fake' }
  const { sidecar: _sidecar, ...sealedless } = full

  describe("boxDna", () => {
    expectCases(VX.boxDna, [
      [{ ...scope, whisper, sidecar: {}, am: 'x', vault_tok: 'tok-u1' },     true,  'passes the props the factory controls'],
      [{ ...scope, whisper, sidecar: {}, revision_seq: 3 },                  false, 'refuses a revision_seq'],
      [{ ...scope, whisper, sidecar: {}, am: 'q' },                          false, 'refuses a factory prop that fails its check'],
    ])

    it("strips the props the factory controls and fills the whisper's codec", () => {
      const given = { ...scope, whisper, sidecar: {}, fmt: SX.BoxFormat, am: 'x', vault_tok: 'tok-u1', revision_tok: 'rev-given', registered_at: T0, written_at: T0 }
      expect(VX.boxDna.parse(given)).to.deep.equal({ ...scope, whisper, sidecar: {}, whisper_codec: 'json_v1', whisper_schema_version: 1 })
    })
  })

  describe("boxPatch", () => {
    expectCases(VX.boxPatch, [
      [{ whisper, sidecar: {} },                                             true,  'passes the whisper and the sidecar alone'],
      [{ ...full, whisper, sidecar: {} },                                    true,  'passes a full record given back with its whisper and a sidecar'],
      [{ ...sparse, whisper, sidecar: {} },                                  true,  'passes a sparse record given back so'],
      [{ ...sealedless, revision_seq: 99, am: 'x', whisper, sidecar: {} },   true,  'passes the factory props, revision_seq among them, whatever they say'],
      [{ whisper },                                                          true,  'passes a whisper alone, the sidecar kept'],
      [{ sidecar: {} },                                                      true,  'passes a sidecar alone, the whisper kept'],
      [{},                                                                   false, 'refuses a patch naming neither'],
      [{ whisper: LOCKED, sidecar: {} },                                     false, 'refuses LOCKED as the whisper'],
      [{ whisper: { ...LOCKED }, sidecar: {} },                              false, 'refuses a copy of LOCKED as the whisper'],
      [{ whisper: null, sidecar: {} },                                       false, 'refuses null as the whisper'],
      [{ whisper, sidecar: 'note' },                                         false, 'refuses a sidecar that fails its check'],
      [{ ...full, revision_seq: 'one', whisper, sidecar: {} },               false, 'refuses a factory prop that fails its check'],
      [{ ...full, boxlabel: 'B', whisper, sidecar: {} },                     false, 'refuses a scope field that fails its check'],
      [{ whisper, sidecar: {}, sidecarr: {} },                               false, 'refuses a field no box record has'],
      [undefined,                                                            false, 'refuses undefined'],
    ])

    it("hands back the whisper, the sidecar, and the scope's fields as given, stripping the rest", () => {
      expect(VX.boxPatch.parse({ ...full, whisper, sidecar: { note: 'new' } })).to.deep.equal({ ...scope, whisper, sidecar: { note: 'new' } })
      expect(VX.boxPatch.parse({ whisper, sidecar: {} })).to.deep.equal({ whisper, sidecar: {}, applabel: undefined, user_id: undefined, vaultlabel: undefined, boxlabel: undefined })
    })

    it("names the failing field, quoting nothing of a whisper or a field's name", () => {
      expect(TH.expectSyncRefusal(() => VX.boxPatch.parse({ whisper: null, sidecar: {} })).meta?.fieldnames).to.deep.equal(['whisper'])
      for (const marked of [{ whisper: { SECRET: undefined }, sidecar: {} }, { whisper: { apiKey: 'SECRET-VAL' }, sidecar: {}, SECRET_FIELD: 1 }]) {
        const err = TH.expectSyncRefusal(() => VX.boxPatch.parse(marked))
        expect(TH.thrownText(err)).to.not.include('SECRET')
        expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      }
    })
  })
})

describe("SX.vaultRecord and SX.vaultSparse", () => {
  const { boxlabel: _boxlabel, ...vaultscope } = scope
  const sparseVault = { ...vaultscope, fmt: SX.VaultFormat, ...baseProps }

  const gate = { gate_epoch: GX.FirstGateEpoch, passphrase_wayin: TH.wayinOf('passphrase'), passkey_wayin: null }

  expectCases(SX.vaultRecord, [
    [{ ...sparseVault, gate },       true,  'passes a record with its gate, a passphrase wayin and no passkey'],
    [{ ...sparseVault, gate: null }, false, 'refuses a record whose gate is null: a vault record is never without one'],
    [sparseVault,                    false, 'refuses a record without its gate'],
    [{ ...sparseVault, gate: { ...gate, gate_epoch: undefined } }, false, 'refuses a gate without its gate_epoch'],
    [{ ...sparseVault, gate: { ...gate, gate_epoch: 0 } },         false, 'refuses gate_epoch 0: the first is 1'],
    [{ ...sparseVault, gate: {} },   false, 'refuses a gate without its wayins'],
  ])

  it("strips the gate from the sparse form", () => {
    expect(SX.vaultSparse.parse({ ...sparseVault, gate })).to.deep.equal(sparseVault)
  })
})
