import { afterEach, describe, expect, it, vi } from 'vitest'
import { Box, BoxRecord, type BoxVaultProps } from '../src/box'
import { cipherBytes, cipherCtx, makeBoxKey, makeVaultKey, wrapKeyUnder } from '../src/crypto'
import { localVaultDB } from '../src/local-vault-db'
import { valOf } from '../src/outcome'
import { memoryStore } from '../src/string-store'
import { FarFuture, type Whisper } from '../src/types'
import * as TH from './test-helpers'

const OldIso = '2026-10-14T00:00:00.000Z'

const wholeBox = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _boxRegistered, written_at: _boxWritten, ...boxWithoutTimes } = wholeBox
const boxV3 = { ...boxWithoutTimes, format: 'safebyok-box-v3', registered_at: Date.UTC(2026, 9, 14), changed_at: Date.UTC(2026, 9, 14) }
const { sidecar_json: _sidecarJson, ...sidecarless } = wholeBox
const boxV4 = { ...sidecarless, format: 'safebyok-box-v4', public_json: '{}' }
const BoxCases = [
  // regular usage:
  [wholeBox,                                               true,   'a whole box, with its sidecar'],
  [{ ...wholeBox, sidecar_json: '{}' },                    true,   'a box with an empty sidecar'],
  [{ ...wholeBox, sidecar_json: '"just text"' },           true,   'a sidecar of any JSON, not only an object'],
  [{ ...wholeBox, sidecar_json: '{"a":2,"b":[null,1.5]}' }, true,  'a sidecar as the vault writes it: keys sorted, no spacing'],
  [{ ...wholeBox, boxlabel: 'Ключ API: מפתח' },           true,   'a boxlabel of any text'],
  // refused, as a damaged or foreign record:
  [sidecarless,                                            false,  'a box with no sidecar: one is always written'],
  [{ ...wholeBox, sidecar_json: '{"note":' },              false,  'a sidecar that is not JSON'],
  [{ ...wholeBox, sidecar_json: '{"b":1, "a":2}' },        false,  'a sidecar respaced and reordered: not the text the vault writes'],
  [{ ...wholeBox, sidecar_json: '{"b":1,"a":2}' },         false,  'a sidecar with its keys out of order'],
  [{ ...wholeBox, sidecar_json: '1.0' },                   false,  'a number written otherwise than JSON writes it'],
  [{ ...wholeBox, sidecar_json: `${'['.repeat(200_000)}${']'.repeat(200_000)}` }, false, 'a sidecar nested too deep to serialize again, refused calmly'],
  [{ ...wholeBox, sidecar_json: { note: 'work' } },        false,  'a sidecar stored as an object rather than its JSON'],
  [{ ...wholeBox, note: 'work account' },                  true,   'an unknown field such as the old note is dropped, never kept'],
  [{ ...wholeBox, whisper_codec: 'json_v2' },              false,  'a whisper codec this version does not know'],
  [{ ...wholeBox, whisper_schema_version: 2 },             false,  'a whisper schema version this version does not know'],
  [TH.omitting(wholeBox, 'whisper_codec'),                 false,  'a box missing its whisper codec'],
  [{ ...wholeBox, format: 'safebyok-box-v8' },             false,  'a format this version does not know'],
  [{ ...wholeBox, format: 'safebyok-box-v6', vault_key_epoch: 1 }, false, 'a box from before the vaultKey epoch went'],
  [{ ...wholeBox, format: 'safebyok-box-v2' },             false,  'a box from before the sidecar'],
  [boxV3,                                                  false,  'a box from before written_at, holding changed_at'],
  [boxV4,                                                  false,  'a box from before the sidecar was named, holding public_json'],
  [{ ...wholeBox, written_at: FarFuture + 1 },             false,  'a written_at past FarFuture'],
  [{ ...wholeBox, registered_at: Infinity },               false,  'a registered_at that never comes'],
  [{ ...wholeBox, written_at: null },                      false,  'a null written_at'],
  [{ ...wholeBox, registered_at: Date.UTC(2026, 9, 14) + 0.5 }, false, 'a registered_at with a fraction of a millisecond'],
  [boxWithoutTimes,                                        false,  'a box missing its times'],
  [{ ...boxWithoutTimes, created_at: OldIso, updated_at: OldIso }, false, 'a box from before its times were named registered_at and changed_at'],
] as const

describe("BoxRecord", () => {
  for (const [candidate, expected, blurb] of BoxCases) {
    it(blurb, () => { expect(BoxRecord.safeParse(candidate).success).to.eq(expected) })
  }

  it("keeps none of a field it does not know, such as the note a box once had", () => {
    expect(BoxRecord.parse({ ...wholeBox, note: 'work account' })).to.deep.equal(wholeBox)
  })

  it("tells a row that is no box from one that is, as its example shows", () => {
    expect(BoxRecord.safeParse(TH.vaultPropsOf('u1')).success).to.be.false
    expect(BoxRecord.safeParse(wholeBox).success).to.be.true
  })
})

// == [Box]: boxVaultPropsOf, the model, sealing, opening

/** The time every box here is sealed at, unless a test says otherwise. */
const T0 = Date.UTC(2026, 9, 19, 12)

/** The vault props a box lies under, as far as a box reads them: `u1`'s `main` vault. */
const boxVaultPropsOf = (overrides: Partial<BoxVaultProps> = {}): BoxVaultProps => ({
  applabel:        'acme',
  user_id:         'u1',
  vaultlabel:      'main',
  vault_id:        'vault-id-u1',
  ...overrides,
})

const Secret = 'sk-ant-SUPERSECRET'

/** A box sealed by a second copy of safebyok, loaded afresh beside this one as two versions in one bundle would be: its class is its own. */
const otherCopyBox = async (): Promise<unknown> => {
  vi.resetModules()
  const other = await import('../src/box')
  return await other.Box.seal(boxVaultPropsOf(), T0, 'anthropic_api_key', Secret, await makeVaultKey())
}

/** `boxlabel` sealed for `u1`'s vault props at {@link T0} under a fresh vaultKey, the key and the props beside it. */
const sealedOf = async (whisper: Whisper = Secret, opts?: Parameters<typeof Box.seal>[5]) => {
  const vaultProps = boxVaultPropsOf()
  const vaultKey = await makeVaultKey()
  const box = await Box.seal(vaultProps, T0, 'anthropic_api_key', whisper, vaultKey, opts)
  return { vaultProps, vaultKey, box }
}

/**
 * A box record holding `plainBytes` as its whisper, ciphered and wrapped by hand under the ctx a
 * box's ctx is documented to be: the format, the scope, the vault's id, the purpose, and every
 * visible field.
 */
const handSealedOf = async (vaultProps: BoxVaultProps, vaultKey: CryptoKey, plainBytes: Uint8Array): Promise<BoxRecord> => {
  const { format, box_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...header } = TH.boxOf('anthropic_api_key', 'hand')
  const ctxFor = (purpose: string) => cipherCtx(format, vaultProps.applabel, vaultProps.user_id, vaultProps.vaultlabel, vaultProps.vault_id, purpose, header)
  const boxKey = await makeBoxKey()
  return {
    format,
    ...header,
    box_key_wrapped:  await wrapKeyUnder(vaultKey, boxKey, ctxFor('box_key_wrapped')),
    whisper_ciphered: await cipherBytes(boxKey, plainBytes, ctxFor('whisper_ciphered')),
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe("Box.make", () => {
  it("makes a box whose every stored field is a field of its own, the sidecar parsed, as the class's example shows (Contract: Box)", () => {
    const record = TH.boxOf('anthropic_api_key', 'a1', { sidecar_json: TH.sidecarJsonOf({ note: 'work account' }) })
    const box = Box.make(boxVaultPropsOf(), record)
    const { sidecar_json: _sidecarJson, ...rest } = record
    for (const [field, val] of Object.entries(rest)) {
      expect(box[field as keyof typeof rest], field).to.deep.equal(val)
    }
    expect(box.boxlabel).to.eq('anthropic_api_key')
    expect(box.sidecar).to.deep.equal({ note: 'work account' })
    expect(box).to.not.have.property('sidecar_json')
  })

  it("gives the record back as props, frozen, and serializes as it, as toJSON's example shows (Contract: Box)", () => {
    const record = TH.boxOf('anthropic_api_key', 'a1')
    const box = Box.make(boxVaultPropsOf(), record)
    expect(box.props).to.deep.equal(record)
    expect(Object.isFrozen(box.props)).to.be.true
    expect(Object.isFrozen(box.props.box_key_wrapped)).to.be.true
    expect(Object.isFrozen(box.props.whisper_ciphered)).to.be.true
    expect(box.toJSON()).to.equal(box.props)
    const serialized = JSON.stringify(box)
    expect(JSON.parse(serialized)).to.deep.equal(box.props)
  })

  it("holds its vault props frozen, a copy of their five fields alone, where no key list, spread or JSON sees them (Contract: Box)", () => {
    const vaultProps = TH.vaultPropsOf('u1')
    const box = Box.make(vaultProps, TH.boxOf('anthropic_api_key', 'a1'))
    expect(box.vaultProps).to.deep.equal(boxVaultPropsOf())
    expect(Object.isFrozen(box.vaultProps)).to.be.true
    expect(Object.keys(box)).to.not.include.members(['vaultProps', 'props', 'summary'])
    expect(Object.fromEntries(Object.entries(box))).to.not.have.property('vaultProps')
    expect(JSON.stringify(box)).to.not.include('vault-id-u1')
    expect(Reflect.set(box, 'vaultProps', boxVaultPropsOf({ vault_id: 'vault-id-other' }))).to.be.false
  })

  it("shows its stored fields once in a log line, and its vault props not at all", () => {
    const box = Box.make(boxVaultPropsOf(), TH.boxOf('anthropic_api_key', 'a1'))
    expect(Object.keys(box)).to.have.members([
      'format', 'boxlabel', 'revision_tok', 'whisper_codec', 'whisper_schema_version',
      'sidecar', 'registered_at', 'written_at', 'box_key_wrapped', 'whisper_ciphered',
    ])
  })

  it("freezes the box, its sidecar through and its summary: nothing a host is handed can be changed", () => {
    const box = Box.make(boxVaultPropsOf(), TH.boxOf('anthropic_api_key', 'a1', { sidecar_json: TH.sidecarJsonOf({ team: { members: ['ana'] } }) }))
    expect(Object.isFrozen(box)).to.be.true
    expect(Reflect.set(box, 'boxlabel', 'other')).to.be.false
    const sidecar = box.sidecar as { team: { members: string[] } }
    expect(Object.isFrozen(sidecar.team.members)).to.be.true
    expect(() => { sidecar.team.members.push('mallory') }).to.throw(TypeError)
    expect(Object.isFrozen(box.summary)).to.be.true
    expect(box.summary.sidecar).to.equal(box.sidecar)
  })

  it("keeps nothing of the caller's record: a change to it afterwards reaches nothing in the box", () => {
    const record = structuredClone(TH.boxOf('anthropic_api_key', 'a1'))
    const box = Box.make(boxVaultPropsOf(), record)
    record.box_key_wrapped.ciphertext_b64 = 'changed'
    record.revision_tok = 'changed'
    expect(box.props.box_key_wrapped.ciphertext_b64).to.eq('ct-boxkey-a1')
    expect(box.revision_tok).to.eq('rev-a1')
  })

  it("lists its visible fields as its summary, damaged false, no ciphertext: what vault.boxes lists (Contract: Box)", () => {
    const box = Box.make(boxVaultPropsOf(), TH.boxOf('anthropic_api_key', 'a1'))
    expect(box.summary).to.deep.equal({
      boxlabel: 'anthropic_api_key', revision_tok: 'rev-a1', sidecar: { note: 'a test box' },
      registered_at: Date.UTC(2026, 9, 14), written_at: Date.UTC(2026, 9, 14), damaged: false,
    })
  })

  it("makes a box from a record a VaultDB hands back, as its first example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    valOf(await vaultDB.ensureVaultProps(TH.vaultPropsOf('u1')))
    valOf(await vaultDB.putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic_api_key', 'a1')))
    const record = valOf(await vaultDB.getBox(TH.scopeOf('u1'), 'anthropic_api_key'))
    const box = Box.make(boxVaultPropsOf(), record!)
    expect(box.props).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("refuses what is no box record as 'bad_record', quoting none of it, as its second example shows", () => {
    const err = TH.expectSyncRefusal(() => Box.make(boxVaultPropsOf(), { boxlabel: 'anthropic_api_key', revision_tok: Secret } as unknown as BoxRecord), 'bad_record')
    expect(err.message).to.not.include(Secret)
    expect(err.cause).to.be.undefined
  })

  it("refuses a Box of another copy of safebyok as 'bad_record', as it refuses anything that is no box record", async () => {
    const theirs = await otherCopyBox()
    expect(theirs).to.not.be.instanceOf(Box)
    TH.expectSyncRefusal(() => Box.make(boxVaultPropsOf(), theirs as BoxRecord), 'bad_record')
  })

  it("refuses missing vault props, or props missing their scope or vault id, as 'bad_option'", () => {
    const record = TH.boxOf('anthropic_api_key', 'a1')
    for (const given of [undefined, TH.scopeOf('u1'), { vault_id: 'vault-id-u1' }, boxVaultPropsOf({ vault_id: null } as unknown as BoxVaultProps)]) {
      TH.expectSyncRefusal(() => Box.make(given as unknown as BoxVaultProps, record), 'bad_option')
    }
  })
})

describe("Box.seal", () => {
  it("seals a whisper that opens under the vaultKey it was sealed with, the sidecar given, as its first example shows (Contract: Box)", async () => {
    const { vaultKey, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    expect(box.sidecar).to.deep.equal({ note: 'work account' })
    expect(box.props.sidecar_json).to.eq('{"note":"work account"}')
    expect(await box.open(vaultKey)).to.eq(Secret)
  })

  it("ciphers the whisper as its JSON with every object's keys sorted, so it opens with them in order (Contract: Box, whisper_codec)", async () => {
    const { vaultKey, box } = await sealedOf({ zeta: 'sk-fake', alpha: { omega: 1, beta: 2 } })
    expect(box.whisper_codec).to.eq('json_v1')
    const opened = await box.open(vaultKey) as Record<string, Record<string, number>>
    expect(Object.keys(opened)).to.deep.equal(['alpha', 'zeta'])
    expect(Object.keys(opened['alpha'] ?? {})).to.deep.equal(['beta', 'omega'])
  })

  it("writes the whisper only ciphered: no field of the record holds it in the clear (Contract: vault.putBox, Guarantees)", async () => {
    const { box } = await sealedOf()
    expect(JSON.stringify(box.props)).to.not.include(Secret)
    expect(JSON.stringify(box.props)).to.not.include(btoa(Secret).slice(0, 12))
  })

  it("mints a fresh boxKey for every seal, wrapped under the vaultKey, and drops it (Contract: vault.putBox, Guarantees)", async () => {
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey')
    const wrapKey = vi.spyOn(crypto.subtle, 'wrapKey')
    const vaultKey = await makeVaultKey()
    generateKey.mockClear()
    const one = await Box.seal(boxVaultPropsOf(), T0, 'anthropic_api_key', Secret, vaultKey)
    const two = await Box.seal(boxVaultPropsOf(), T0, 'anthropic_api_key', Secret, vaultKey)
    expect(generateKey).toHaveBeenCalledTimes(2)
    const minted = await Promise.all(generateKey.mock.results.map((result) => result.value as Promise<CryptoKey>))
    expect(wrapKey.mock.calls.map((call) => call[1])).to.deep.equal(minted)
    expect(minted[0]).to.not.equal(minted[1])
    expect(wrapKey.mock.calls.map((call) => call[2])).to.deep.equal([vaultKey, vaultKey])
    expect(one.revision_tok).to.not.eq(two.revision_tok)
    expect(one.whisper_ciphered.ciphertext_b64).to.not.eq(two.whisper_ciphered.ciphertext_b64)
    expect(one).to.not.have.property('boxKey')
  })

  it("stamps written_at, and a new box's registered_at, with the time it is handed", async () => {
    const { box } = await sealedOf()
    expect(box.written_at).to.eq(T0)
    expect(box.registered_at).to.eq(T0)
  })

  it("carries registered_at and the sidecar forward from the box it replaces, as its second example shows", async () => {
    const { vaultProps, vaultKey, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const next = await Box.seal(vaultProps, T0 + 1000, 'anthropic_api_key', 'sk-ant-NEXT', vaultKey, { over: box })
    expect(next.registered_at).to.eq(T0)
    expect(next.written_at).to.eq(T0 + 1000)
    expect(next.sidecar).to.deep.equal({ note: 'work account' })
    expect(next.revision_tok).to.not.eq(box.revision_tok)
  })

  it("lets a sidecar given win over the replaced box's, {} emptying it", async () => {
    const { vaultProps, vaultKey, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const emptied = await Box.seal(vaultProps, T0, 'anthropic_api_key', Secret, vaultKey, { over: box, sidecar: {} })
    expect(emptied.sidecar).to.deep.equal({})
  })

  it("carries nothing forward from a box it replaces that will not open: nothing vouches for its fields", async () => {
    const { vaultProps, vaultKey, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const planted = Box.make(vaultProps, { ...box.props, sidecar_json: '{"note":"planted"}', registered_at: T0 - 1000 })
    const next = await Box.seal(vaultProps, T0 + 1000, 'anthropic_api_key', Secret, vaultKey, { over: planted })
    expect(next.sidecar).to.deep.equal({})
    expect(next.registered_at).to.eq(T0 + 1000)
  })

  const SealRefusals = [
    // fix the code:
    [{ whisper: undefined },                                        'bad_whisper',  'a whisper of undefined'],
    [{ whisper: { apiKey: Secret, when: new Date() } },             'bad_whisper',  'a whisper JSON would flatten, quoting none of it'],
    [{ opts: { sidecar: { apiKey: Secret, when: new Date() } } },   'bad_option',   'a sidecar JSON would flatten, quoting none of it'],
    [{ opts: { sidcar: { note: Secret } } },                        'bad_option',   'a misspelt option'],
    [{ vaultKey: Secret },                                          'bad_option',   'a vaultKey that is no CryptoKey'],
    [{ opts: { over: TH.boxOf('anthropic_api_key', 'a1') } },       'bad_option',   'an over that is a record rather than a box'],
    [{ boxlabel: '' },                                              'bad_label',    'an empty boxlabel'],
    [{ vaultProps: { vault_id: 'vault-id-u1' } }, 'bad_option', 'vault props missing their scope'],
    [{ vaultProps: TH.scopeOf('u1') },                              'bad_option',   'vault props missing their vault id'],
    [{ now: T0 / 1000 },                                            'bad_option',   'a now in epoch seconds'],
    [{ now: T0 + 0.5 },                                             'bad_option',   'a now with a fraction of a millisecond'],
  ] as const

  for (const [given, refusalkind, blurb] of SealRefusals) {
    it(`refuses ${blurb} as '${refusalkind}'`, async () => {
      const vaultKey = await makeVaultKey()
      const args = { vaultProps: boxVaultPropsOf(), now: T0, boxlabel: 'anthropic_api_key', whisper: Secret, vaultKey, opts: undefined, ...given }
      const sealing = Box.seal(args.vaultProps as BoxVaultProps, args.now, args.boxlabel, args.whisper as Whisper, args.vaultKey as CryptoKey, args.opts as Parameters<typeof Box.seal>[5])
      const err = await TH.expectRefusal(sealing, refusalkind)
      expect(err.message).to.not.include(Secret)
    })
  }

  it("refuses an over under another boxlabel as 'bad_option': it is not the box this one replaces", async () => {
    const { vaultProps, vaultKey, box } = await sealedOf()
    await TH.expectRefusal(Box.seal(vaultProps, T0, 'openai_api_key', Secret, vaultKey, { over: box }), 'bad_option')
  })

  it("refuses an over that is a Box of another copy of safebyok as 'bad_option': it is no Box of this one", async () => {
    const over = await otherCopyBox()
    await TH.expectRefusal(Box.seal(boxVaultPropsOf(), T0, 'anthropic_api_key', Secret, await makeVaultKey(), { over: over as Box }), 'bad_option')
  })
})

describe("box.tryOpen", () => {
  it("opens to the whisper sealed, as its example shows (Contract: box.tryOpen, Returns)", async () => {
    const { vaultKey, box } = await sealedOf({ apiKey: Secret, org: 'acme' })
    const { ok, val: whisper } = await box.tryOpen(vaultKey)
    expect(ok).to.be.true
    expect(whisper).to.deep.equal({ apiKey: Secret, org: 'acme' })
  })

  it("rebuilds boxCtx from the scope, the vault's id and every visible field, unwraps, deciphers and checks (Contract: box.tryOpen, Does)", async () => {
    const vaultProps = boxVaultPropsOf()
    const vaultKey = await makeVaultKey()
    const record = await handSealedOf(vaultProps, vaultKey, new TextEncoder().encode(JSON.stringify(Secret)))
    expect(await Box.make(vaultProps, record).open(vaultKey)).to.eq(Secret)
  })

  it("seals and opens under the vault props passed in, a whole VaultProps among them, and keeps them hidden", async () => {
    const vaultProps = TH.vaultPropsOf('u1')
    const vaultKey = await makeVaultKey()
    const box = await Box.seal(vaultProps, T0, 'anthropic_api_key', Secret, vaultKey)
    expect(box.vaultProps).to.deep.equal(boxVaultPropsOf())
    expect(Object.keys(box)).to.not.include('vaultProps')
    expect(await Box.make(vaultProps, box.props).open(vaultKey)).to.eq(Secret)
    const reborn = TH.vaultPropsOf('u1', { vault_id: 'vault-id-reborn' })
    await TH.expectBad(Box.make(reborn, box.props).tryOpen(vaultKey), 'damaged_box')
  })

  const Alterations = [
    [{ boxlabel: 'openai_api_key' },                 'moved to another boxlabel'],
    [{ revision_tok: 'rev-replayed' },               'its revision altered'],
    [{ sidecar_json: '{"note":"planted"}' },         'its sidecar altered'],
    [{ registered_at: T0 - 1 },                      'its registered_at altered'],
    [{ written_at: T0 + 1 },                         'its written_at altered'],
  ] as const

  for (const [altered, blurb] of Alterations) {
    it(`refuses a box ${blurb} in storage as 'damaged_box' (Contract: box.tryOpen, Guarantees)`, async () => {
      const { vaultProps, vaultKey, box } = await sealedOf()
      await TH.expectBad(Box.make(vaultProps, { ...box.props, ...altered }).tryOpen(vaultKey), 'damaged_box')
    })
  }

  const Elsewheres = [
    [{ applabel: 'other_app' },          'another app'],
    [{ user_id: 'u2' },                  'another user'],
    [{ vaultlabel: 'spare' },            'another vault of the same user'],
    [{ vault_id: 'vault-id-reborn' },    'the same vault made anew'],
  ] as const

  for (const [elsewhere, blurb] of Elsewheres) {
    it(`refuses a box moved to ${blurb} as 'damaged_box', even under the same vaultKey (Contract: box.tryOpen, Guarantees)`, async () => {
      const { vaultKey, box } = await sealedOf()
      await TH.expectBad(Box.make(boxVaultPropsOf(elsewhere), box.props).tryOpen(vaultKey), 'damaged_box')
    })
  }

  it("refuses ciphertext swapped in from another box as 'damaged_box' (Contract: box.tryOpen, Guarantees)", async () => {
    const { vaultProps, vaultKey, box } = await sealedOf()
    const other = await Box.seal(vaultProps, T0, 'anthropic_api_key', 'sk-ant-OTHER', vaultKey)
    await TH.expectBad(Box.make(vaultProps, { ...box.props, whisper_ciphered: other.whisper_ciphered }).tryOpen(vaultKey), 'damaged_box')
    await TH.expectBad(Box.make(vaultProps, { ...box.props, box_key_wrapped: other.box_key_wrapped }).tryOpen(vaultKey), 'damaged_box')
  })

  it("refuses a box under a vaultKey the vault does not hold as 'damaged_box' (Contract: box.tryOpen, Refuses)", async () => {
    const { vaultKey, box } = await sealedOf()
    await TH.expectBad(box.tryOpen(await makeVaultKey()), 'damaged_box')
    expect(await box.open(vaultKey)).to.eq(Secret)
  })

  it("refuses a box that opens to no whisper as 'damaged_box' (Contract: box.tryOpen, Refuses)", async () => {
    const vaultProps = boxVaultPropsOf()
    const vaultKey = await makeVaultKey()
    for (const plain of ['not json', 'null', '']) {
      const record = await handSealedOf(vaultProps, vaultKey, new TextEncoder().encode(plain))
      const err = await TH.expectBad(Box.make(vaultProps, record).tryOpen(vaultKey), 'damaged_box')
      expect(err.message).to.include('not a whisper')
    }
  })

  it("hands back nothing partial on a refusal, and names nothing of the box in it (Contract: box.tryOpen, Guarantees)", async () => {
    const { vaultProps, vaultKey, box } = await sealedOf(Secret, { sidecar: { note: 'sk-ant-SIDECAR' } })
    const outcome = await Box.make(vaultProps, { ...box.props, written_at: T0 + 1 }).tryOpen(vaultKey)
    expect(outcome).to.not.have.property('val')
    const err = await TH.expectBad(outcome, 'damaged_box')
    for (const quoted of [Secret, 'sk-ant-SIDECAR', 'anthropic_api_key', box.revision_tok, box.whisper_ciphered.ciphertext_b64]) {
      expect(err.message).to.not.include(quoted)
    }
    expect(err.cause).to.be.undefined
    expect(err.meta).to.be.undefined
  })

  it("refuses a vaultKey that is no CryptoKey as 'bad_option'", async () => {
    const { box } = await sealedOf()
    await TH.expectBad(box.tryOpen('not a key' as unknown as CryptoKey), 'bad_option')
  })
})

describe("box.open", () => {
  it("opens to the whisper, as its example shows", async () => {
    const { vaultKey, box } = await sealedOf()
    expect(await box.open(vaultKey)).to.eq(Secret)
  })

  it("throws what tryOpen refuses with", async () => {
    const { vaultKey, box } = await sealedOf()
    await TH.expectRefusal(Box.make(boxVaultPropsOf({ vault_id: 'vault-id-reborn' }), box.props).open(vaultKey), 'damaged_box')
  })
})
// --
