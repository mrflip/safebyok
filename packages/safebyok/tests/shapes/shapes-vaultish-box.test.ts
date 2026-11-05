import { afterEach, describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import * as GX from '../../src/shapes/shapes-gateish'
import { LOCKED } from '../../src/helpers/consts'
import * as VX from '../../src/shapes/shapes-vaultish'
import { boxListingOf, fullBoxRecord, makeModelsWorld, sparseBoxRecord, tombstoneBoxRecord, T0 } from '../test-helpers/models-world'
import { holdsCases } from '../test-helpers/cases'
import * as TH from '../test-helpers'

const mw = makeModelsWorld({ fakeTimers: false })
afterEach(() => { mw.dispose() })

const full      = fullBoxRecord()
const sparse    = sparseBoxRecord()
const gone      = tombstoneBoxRecord({ revision_seq: 2 })
const baseProps = { revision_tok: 'rev-a1', revision_seq: 1, registered_at: T0, written_at: T0, am: 'a', vault_tok: 'vault-tok-u1' }
const scope     = mw.boxscope('anthropic_api_key')

describe("VX.boxRecord and VX.boxSparse", () => {
  describe("VX.boxRecord", () => {
    holdsCases(VX.boxRecord, 'bad_record', [
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
      const parsed = VX.boxRecord.parse(full)
      expect(parsed).to.deep.equal(full)
      expect(parsed).to.not.eq(full)
    })

    it("passes a Box instance as a duck, and hands back a pojo of its fields", async () => {
      const box = await boxListingOf(mw).build(full)
      const parsed = VX.boxRecord.parse(box)
      expect(parsed).to.deep.equal(full)
      expect(parsed).to.not.be.instanceOf(Box)
    })

    it("refuses a plain object carrying a field the Box ducks without", async () => {
      const box = await boxListingOf(mw).build(full)
      TH.expectSyncRefusal(() => VX.boxRecord.parse({ ...VX.boxRecord.parse(box), extra: 1 }), 'bad_record')
    })

    it("refuses a Box that is not full, as it ducks as the sparse form", async () => {
      const box = await boxListingOf(mw).build(sparse)
      TH.expectSyncRefusal(() => VX.boxRecord.parse(box), 'bad_record')
    })

    it("refuses without quoting its input", () => {
      const err = TH.expectSyncRefusal(() => VX.boxRecord.parse({ ...full, sidecar: 'SECRET-SIDECAR', extra: 'SECRET-EXTRA' }), 'bad_record')
      expect(err.message).to.not.include('SECRET')
    })
  })

  describe("VX.boxSparse", () => {
    holdsCases(VX.boxSparse, 'bad_record', [
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
      const parsed = VX.boxSparse.parse(full)
      expect(parsed).to.not.have.any.keys('sidecar', 'box_key_wrapped', 'whisper_ciphered')
      expect(parsed).to.deep.equal(sparse)
    })

    it("keeps the whisper's codec and schema version, so a sparse record can be sealed over as it is", () => {
      const parsed = VX.boxSparse.parse(full)
      expect(parsed.whisper_codec).to.eq('json_v1')
      expect(parsed.whisper_schema_version).to.eq(1)
    })

    it("strips a field it does not take, where boxRecord refuses it", () => {
      expect(VX.boxSparse.parse({ ...sparse, extra: 1 })).to.deep.equal(sparse)
    })

    it("takes its fields from a Box, which ducks as its record", async () => {
      const box = await boxListingOf(mw).build(full)
      expect(VX.boxSparse.parse(box)).to.deep.equal(sparse)
    })
  })

  it("name the format of the box the models describe", () => {
    expect(VX.BoxFormat).to.eq(5001)
    expect(full.fmt).to.eq(VX.BoxFormat)
  })
})

describe("VX.whisperHolder", () => {
  holdsCases(VX.whisperHolder, 'bad_option', [
    // a whisper as its val, any JSON a whisper can carry:
    [{ val: 'sk-ant-fake' },                                true,  'passes a string'], // VX.whisperHolder @example 1
    [{ val: { apiKey: 'sk-ant-fake', orgId: null } },       true,  'passes a plain object, null inside it'], // VX.whisperHolder @example 2
    [{ val: ['sk-ant-fake', 7, true, null] },               true,  'passes an array, null inside it'],
    [{ val: 7 },                                            true,  'passes a number'],
    [{ val: false },                                        true,  'passes a boolean'],
    // not given as { val }:
    ['sk-ant-fake',                                         false, 'refuses a bare whisper'], // VX.whisperHolder @example 3
    [null,                                                  false, 'refuses null'],
    [undefined,                                             false, 'refuses undefined'],
    [{},                                                    false, 'refuses an object with no val'],
    [{ value: 'sk-ant-fake' },                              false, 'refuses a whisper under another name'],
    [{ val: 'sk-ant-fake', note: 'work' },                  false, 'refuses a field beside the val'], // VX.whisperHolder @example 5
    [new Map([['val', 'sk-ant-fake']]),                     false, 'refuses a Map'],
    // a val no whisper may be:
    [{ val: null },                                         false, 'refuses a val that is null'], // VX.whisperHolder @example 4
    [{ val: undefined },                                    false, 'refuses a val given as undefined'],
    [{ val: new Date(T0) },                                 false, 'refuses a val JSON would mangle'],
    [{ val: { apiKey: undefined } },                        false, 'refuses a val holding undefined'],
  ])

  it("hands back a frozen copy, never the object it was given, nor the whisper inside it", () => {
    const given = { val: { apiKey: 'sk-ant-fake' } }
    const parsed = VX.whisperHolder.parse(given)
    expect(parsed).to.deep.equal(given)
    expect(parsed).to.not.eq(given)
    expect(parsed.val).to.not.eq(given.val)
    expect(Object.isFrozen(parsed)).to.be.true
    expect(Object.isFrozen(parsed.val)).to.be.true
    given.val.apiKey = 'sk-ant-changed'
    expect(parsed).to.deep.equal({ val: { apiKey: 'sk-ant-fake' } })
  })

  it("names the failing field: val for a val no whisper may be, none for a whisper not given as { val }", () => {
    expect(TH.expectSyncRefusal(() => VX.whisperHolder.parse({ val: null }), 'bad_option').meta?.fieldnames).to.deep.equal(['val'])
    expect(TH.expectSyncRefusal(() => VX.whisperHolder.parse('sk-ant-fake'), 'bad_option').meta?.fieldnames).to.deep.equal([])
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
      const err = TH.expectSyncRefusal(() => VX.whisperHolder.parse(marked), 'bad_option')
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
    }
  })
})

describe("VX.whisperHolder and LOCKED", () => {
  it("refuses LOCKED with a sentence that names it, and a copy of it as no { val }", () => {
    expect(TH.expectSyncRefusal(() => VX.whisperHolder.parse(LOCKED), 'bad_option').message).to.include('LOCKED is not a whisper: unseal or expose one first')
    expect(TH.expectSyncRefusal(() => VX.whisperHolder.parse({ ...LOCKED }), 'bad_option').message).to.not.include('LOCKED')
  })
})

describe("VX.boxDna", () => {
  const dna = { ...scope, whisper: { val: 'sk-ant-fake' }, sidecar: {} }
  const filled = { ...dna, whisper_codec: 'json_v1', whisper_schema_version: 1 }
  const { box_key_wrapped, whisper_ciphered } = full
  // A dna carries no revision_seq, so the factory's props stop at the rest.
  const { revision_seq: _revision_seq, ...factoryProps } = baseProps

  holdsCases(VX.boxDna, 'bad_option', [
    // the scope, the whisper and the sidecar, and what a caller may give beside them:
    [dna,                                                   true,  'passes the scope, a whisper and a sidecar'],
    [{ ...dna, whisper: { val: { key: 'sk-ant-fake', orgId: null } } }, true, 'passes a whisper that is an object, null inside it'],
    [{ ...dna, sidecar: { account: 'work' } },              true,  'passes a sidecar with a field'],
    [{ ...dna, whisper_codec: undefined },                  true,  'passes optional props given as undefined'],
    [{ ...dna, ...factoryProps, fmt: VX.BoxFormat },       true,  'passes the props the factory controls, each passing its check'],
    // the whisper and the sidecar, each defaulting:
    [scope,                                                 true,  'passes the scope alone'],
    [{ ...scope, whisper: { val: 'sk-ant-fake' } },         true,  'passes a whisper with no sidecar'],
    [{ ...scope, sidecar: {} },                             true,  'passes a sidecar with no whisper'],
    [{ ...dna, whisper: undefined },                        true,  'passes a whisper given as undefined'],
    [{ ...dna, sidecar: undefined },                        true,  'passes a sidecar given as undefined'],
    // the scope refused:
    [{ ...dna, boxlabel: undefined },                       false, 'refuses a dna with no boxlabel'],
    [{ ...dna, boxlabel: 'B' },                             false, 'refuses a boxlabel that is no label'], // VX.boxDna @example 6
    [{ boxlabel: 'anthropic_api_key' },                     false, 'refuses a boxlabel without its vault'],
    [{ whisper: { val: 'sk-ant-fake' }, sidecar: {} },      false, 'refuses a dna with no scope'],
    // the record's own props refused:
    [{ ...dna, sidecar: 'work account' },                   false, 'refuses a sidecar that is no object'],
    [{ ...dna, whisper_codec: 'json_v2' },                  false, 'refuses a codec it does not know'],
    [{ ...dna, whisper_schema_version: 2 },                 false, 'refuses a schema version it does not know'],
    [{ ...dna, box_key_wrapped },                           false, 'refuses a box_key_wrapped, which only the seal makes'],
    [{ ...dna, whisper_ciphered },                          false, 'refuses a whisper_ciphered, which only the seal makes'], // VX.boxDna @example 8
    [{ ...dna, whisper: null },                             false, 'refuses a whisper that is null'],
    [{ ...dna, whisper: { val: null } },                    false, 'refuses a whisper whose val is null'],
    [{ ...dna, whisper: { val: new Date(T0) } },            false, 'refuses a whisper JSON would mangle'],
    [{ ...dna, whisper: 'sk-ant-fake' },                    false, 'refuses a bare whisper, not given as { val }'], // VX.boxDna @example 5
    [{ ...dna, whisper: {} },                               false, 'refuses a whisper with no val'],
    [{ ...dna, whisper: { val: 'sk-ant-fake', note: 'x' } }, false, 'refuses a whisper with a field beside its val'],
    // the factory's props, given, must pass their checks:
    [{ ...dna, fmt: 8 },                                    false, 'refuses another format'],
    [{ ...dna, am: 'z' },                                   false, 'refuses an am it does not know'],
    [{ ...dna, vault_tok: 7 },                              false, 'refuses a vault_tok that is no string'],
    [{ ...dna, revision_seq: 1 },                           false, 'refuses a revision_seq, which a dna never carries'], // VX.boxDna @example 7
    [{ ...dna, registered_at: 5 },                          false, 'refuses a registered_at that is no epoch'],
    // a bag a person typed:
    [{ ...dna, sidcar: {} },                                false, 'refuses a field it does not take, being strict'],
    [null,                                                  false, 'refuses null'],
  ])

  // VX.boxDna @example 1
  it("hands back the whisper and the sidecar given, with the codec and the schema version filled", () => {
    expect(VX.boxDna.parse(dna)).to.deep.equal(filled)
  })

  // VX.boxDna @example 2
  it("strips the props the factory controls", () => {
    const parsed = VX.boxDna.parse({ ...dna, ...factoryProps, fmt: VX.BoxFormat })
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
    const err = TH.expectSyncRefusal(() => VX.boxDna.parse({ ...dna, boxlabel: 'B' }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
  })

  it("fills a whisper of { val: {} } and a sidecar of {} where left out", () => {
    expect(VX.boxDna.parse(scope)).to.deep.equal({ ...scope, whisper: { val: {} }, sidecar: {}, whisper_codec: 'json_v1', whisper_schema_version: 1 })
  })

  it("refuses without quoting its input", () => {
    const err = TH.expectSyncRefusal(() => VX.boxDna.parse({ ...scope, sidecar: 'SECRET-SIDECAR', whisper: null, extra: 'SECRET-EXTRA' }), 'bad_option')
    expect(err.message).to.not.include('SECRET')
  })
})

describe("VX.boxDna and VX.boxPatch: the duckish of a box's dna and of its patch", () => {
  const whisper = { val: 'sk-ant-fake' }
  const { sidecar: _sidecar, ...sealedless } = full

  describe("boxDna", () => {
    holdsCases(VX.boxDna, 'bad_option', [
      [{ ...scope, whisper, sidecar: {}, am: 'x', vault_tok: 'tok-u1' },     true,  'passes the props the factory controls'], // VX.boxDna @example 2
      [{ ...scope, whisper, sidecar: {}, revision_seq: 3 },                  false, 'refuses a revision_seq'], // VX.boxDna @example 4
      [{ ...scope, whisper, sidecar: {}, am: 'q' },                          false, 'refuses a factory prop that fails its check'],
    ])

    it("strips the props the factory controls and fills the whisper's codec", () => {
      const given = { ...scope, whisper, sidecar: {}, fmt: VX.BoxFormat, am: 'x', vault_tok: 'tok-u1', revision_tok: 'rev-given', registered_at: T0, written_at: T0 }
      expect(VX.boxDna.parse(given)).to.deep.equal({ ...scope, whisper, sidecar: {}, whisper_codec: 'json_v1', whisper_schema_version: 1 })
    })
  })

  describe("boxPatch", () => {
    holdsCases(VX.boxPatch, 'bad_option', [
      [{ whisper, sidecar: {} },                                             true,  'passes the whisper and the sidecar alone'],
      [{ ...full, whisper, sidecar: {} },                                    true,  'passes a full record given back with its whisper and a sidecar'], // VX.boxPatch @example 6
      [{ ...sparse, whisper, sidecar: {} },                                  true,  'passes a sparse record given back so'],
      [{ ...sealedless, revision_seq: 99, am: 'x', whisper, sidecar: {} },   true,  'passes the factory props, revision_seq among them, whatever they say'],
      [{ whisper },                                                          true,  'passes a whisper alone, the sidecar kept'],
      [{ sidecar: {} },                                                      true,  'passes a sidecar alone, the whisper kept'], // VX.boxPatch @example
      [{},                                                                   false, 'refuses a patch naming neither'], // VX.boxPatch @example
      [{ whisper: LOCKED, sidecar: {} },                                 false, 'refuses LOCKED as the whisper'], // VX.boxPatch @example 7
      [{ whisper: 'sk-ant-fake', sidecar: {} },                              false, 'refuses a bare whisper'],
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
      expect(TH.expectSyncRefusal(() => VX.boxPatch.parse({ whisper: { val: null }, sidecar: {} }), 'bad_option').meta?.fieldnames).to.deep.equal(['whisper.val'])
      for (const marked of [{ whisper: { val: { SECRET: undefined } }, sidecar: {} }, { whisper: { val: 'SECRET-VAL' }, sidecar: {}, SECRET_FIELD: 1 }]) {
        const err = TH.expectSyncRefusal(() => VX.boxPatch.parse(marked), 'bad_option')
        expect(TH.thrownText(err)).to.not.include('SECRET')
        expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      }
    })
  })
})

describe("VX.vaultRecord and VX.vaultSparse: the gate rides in the vault record, and nowhere in the sparse form", () => {
  const { boxlabel: _boxlabel, ...vaultscope } = scope
  const sparseVault = { ...vaultscope, fmt: VX.VaultFormat, ...baseProps }

  const gate = { gate_epoch: GX.FirstGateEpoch, passphrase_wayin: TH.wayinOf('passphrase'), passkey_wayin: null }

  holdsCases(VX.vaultRecord, 'bad_record', [
    [{ ...sparseVault, gate },       true,  'passes a record with its gate, a passphrase wayin and no passkey'],
    [{ ...sparseVault, gate: null }, false, 'refuses a record whose gate is null: a vault record is never without one'],
    [sparseVault,                    false, 'refuses a record without its gate'],
    [{ ...sparseVault, gate: { ...gate, gate_epoch: undefined } }, false, 'refuses a gate without its gate_epoch'],
    [{ ...sparseVault, gate: { ...gate, gate_epoch: 0 } },         false, 'refuses gate_epoch 0: the first is 1'],
    [{ ...sparseVault, gate: {} },   false, 'refuses a gate without its wayins'],
  ])

  it("strips the gate from the sparse form", () => {
    expect(VX.vaultSparse.parse({ ...sparseVault, gate })).to.deep.equal(sparseVault)
  })
})
