import { inspect } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Box, BoxRecord, type SealBoxProps } from '../src/box'
import { cipherBytes, cipherCtx, makeBoxKey, makeVaultKey, wrapKeyUnder } from '../src/crypto'
import { Lease } from '../src/lease'
import { localVaultDB } from '../src/local-vault-db'
import { valOf } from '../src/outcome'
import { memoryStore } from '../src/string-store'
import { stableJsonify } from '../src/stable-jsonify'
import { BoxSummary, FarFuture, type Stamp, type Whisper } from '../src/types'
import * as TH from './test-helpers'

const OldIso = '2026-10-14T00:00:00.000Z'

const wholeBox = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _boxRegistered, written_at: _boxWritten, ...boxWithoutTimes } = wholeBox
const boxV3 = { ...boxWithoutTimes, format: 'safebyok-box-v3', registered_at: Date.UTC(2026, 9, 14), changed_at: Date.UTC(2026, 9, 14) }
const { sidecar: _sidecar, ...sidecarless } = wholeBox
const boxV4 = { ...sidecarless, format: 'safebyok-box-v4', public_json: '{}' }
const BoxCases = [
  // regular usage:
  [wholeBox,                                               true,   'a whole box, with its sidecar'],
  [{ ...wholeBox, sidecar: {} },                           true,   'a box with an empty sidecar'],
  [{ ...wholeBox, sidecar: { gone: null, list: [1, 'two'] } }, true, 'a sidecar of any JSON values'],
  [{ ...wholeBox, sidecar: { beta: [null, 1.5], alpha: 2 } }, true, 'a sidecar with its keys in any order, as a jsonb column may hand it back'],
  [{ ...wholeBox, boxlabel: 'Ключ API: מפתח' },           true,   'a boxlabel of any text'],
  // refused, as a damaged or foreign record:
  [sidecarless,                                            false,  'a box with no sidecar: one is always written'],
  [{ ...wholeBox, sidecar: { when: new Date() } },         false,  'a sidecar holding what JSON cannot carry'],
  [{ ...wholeBox, sidecar: undefined },                    false,  'a sidecar left undefined'],
  [{ ...wholeBox, sidecar: 'just text' },                  false,  'a sidecar that is no object: text'],
  [{ ...wholeBox, sidecar: null },                         false,  'a sidecar of JSON null'],
  [{ ...wholeBox, sidecar: [{ note: 'work account' }] },   false,  'a sidecar that is an array'],
  [{ ...sidecarless, format: 'safebyok-box-v7', sidecar_json: '{}' }, false, 'a box from before the sidecar was a JSON value, holding sidecar_json'],
  [{ ...wholeBox, note: 'work account' },                  true,   'an unknown field such as the old note is dropped, never kept'],
  [{ ...wholeBox, whisper_codec: 'json_v2' },              false,  'a whisper codec this version does not know'],
  [{ ...wholeBox, whisper_schema_version: 2 },             false,  'a whisper schema version this version does not know'],
  [TH.omitting(wholeBox, 'whisper_codec'),                 false,  'a box missing its whisper codec'],
  [{ ...wholeBox, format: 'safebyok-box-v9' },             false,  'a format this version does not know'],
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

// == [Box]: vaultOf, the model, sealing, extracting

/** The time every box here is sealed at, unless a test says otherwise: what its vault's clock reads. */
const T0 = TH.SliceNow

/** `u1`'s `main` vault, at `vault-tok-u1`, holding a lease around `vaultKey` (a fresh one unless given), its clock reading `at`. */
const vaultOf = async (vaultKey?: CryptoKey, overrides: Partial<TH.VaultSlice> = {}, at = T0): Promise<TH.LeasedSlice> => (
  await TH.leasedSliceOf('u1', vaultKey ?? await makeVaultKey(), { now: () => at, ...overrides })
)

const Secret = 'sk-ant-SUPERSECRET'

/** A box sealed by a second copy of safebyok, loaded afresh beside this one as two versions in one bundle would be: its class is its own. */
const otherCopyBox = async (): Promise<unknown> => {
  vi.resetModules()
  const { Box: OtherBox } = await import('../src/box')
  return await OtherBox.seal(await vaultOf(), { boxlabel: 'anthropic_api_key' }, Secret)
}

/** `whisper` sealed into `u1`'s vault at {@link T0} under a lease on a fresh vaultKey: the box, the vault and the key. */
const sealedOf = async (whisper: Whisper = Secret, props: Partial<SealBoxProps> = {}) => {
  const vaultKey = await makeVaultKey()
  const vault = await vaultOf(vaultKey)
  const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key', ...props }, whisper)
  return { vault, vaultKey, box }
}

/**
 * A box record holding `plainBytes` as its whisper, ciphered and wrapped by hand under the ctx a
 * box's ctx is documented to be: the format, the vault's scope, the vault's token, the purpose,
 * and every visible field, the sidecar as its JSON with keys sorted.
 */
const handSealedOf = async (vault: TH.LeasedSlice, vaultKey: CryptoKey, plainBytes: Uint8Array): Promise<BoxRecord> => {
  const { format, box_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...header } = TH.boxOf('anthropic_api_key', 'hand')
  const ctxFor = (purpose: string) => cipherCtx(format, vault.applabel, vault.user_id, vault.vaultlabel, vault.vault_tok ?? '', purpose, { ...header, sidecar: stableJsonify(header.sidecar)! })
  const boxKey = await makeBoxKey()
  return {
    format,
    ...header,
    box_key_wrapped:  await wrapKeyUnder(vaultKey, boxKey, ctxFor('box_key_wrapped')),
    whisper_ciphered: await cipherBytes(boxKey, plainBytes, ctxFor('whisper_ciphered')),
  }
}

/** The stamp `vault` holds, failing the test where it holds none. */
const stampOf = (vault: TH.LeasedSlice): Stamp => {
  if (vault.stamp === null) { throw new Error('expected the vault to hold a stamp') }
  return vault.stamp
}

afterEach(() => { vi.restoreAllMocks() })

describe("Box.make", () => {
  it("makes a box whose visible fields are its own, read from the record, the sidecar parsed, and the vault's stamp beside them, as the class's example shows (Contract: Box)", async () => {
    const record = TH.boxOf('anthropic_api_key', 'a1', { sidecar: { note: 'work account' } })
    const box = Box.make(await vaultOf(), record)
    expect(TH.shownOf(box)).to.deep.equal({
      boxlabel:      'anthropic_api_key',
      revision_tok:  'rev-a1',
      sidecar:       { note: 'work account' },
      registered_at: record.registered_at,
      written_at:    record.written_at,
      ...TH.scopeOf('u1'),
      vault_tok:     'vault-tok-u1',
      vault_epoch:   1,
      gate_epoch:    1,
    })
    expect(box.baseRevisionTok).to.be.null
  })

  it("is made under the stamp its vault holds, or under the stamp it is handed", async () => {
    const vault = await vaultOf()
    expect(Box.make(vault, TH.boxOf('anthropic_api_key', 'a1')).vault_tok).to.eq('vault-tok-u1')
    const read = Box.make(vault, TH.boxOf('anthropic_api_key', 'a1'), { ...stampOf(vault), vault_tok: 'vault-tok-read', gate_epoch: 4 })
    expect(read).to.include({ vault_tok: 'vault-tok-read', gate_epoch: 4 })
  })

  it("refuses as 'absent_vault' a box of a vault that holds no vault props, when no stamp is handed", async () => {
    const vault = await vaultOf()
    vault.stamp = null
    TH.expectSyncRefusal(() => Box.make(vault, TH.boxOf('anthropic_api_key', 'a1')), 'absent_vault')
  })

  it("refuses a stamp that is no stamp as 'bad_option'", async () => {
    const vault = await vaultOf()
    TH.expectSyncRefusal(() => Box.make(vault, TH.boxOf('anthropic_api_key', 'a1'), { vault_tok: 'vault-tok-u1' } as Stamp), 'bad_option')
  })

  it("gives the record back whole as record, frozen through, the one source of its fields (Contract: Box)", async () => {
    const record = TH.boxOf('anthropic_api_key', 'a1')
    const box = Box.make(await vaultOf(), record)
    expect(box.record).to.deep.equal(record)
    expect(Object.isFrozen(box.record)).to.be.true
    expect(Object.isFrozen(box.record.box_key_wrapped)).to.be.true
    expect(Object.isFrozen(box.record.whisper_ciphered)).to.be.true
  })

  it("shows each visible field and its stamp once in a key list, a spread, JSON and a log line, and nothing else: no ciphertext, format, codec, base or vault, as toJSON's example shows (Contract: Box)", async () => {
    const box = Box.make(await vaultOf(), TH.boxOf('anthropic_api_key', 'a1'))
    const visible = ['boxlabel', 'revision_tok', 'sidecar', 'registered_at', 'written_at', 'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'vault_epoch', 'gate_epoch']
    expect(Object.keys(box)).to.deep.equal(visible)
    expect(Object.keys(TH.jsonOf(box))).to.deep.equal(visible)
    expect(box.toJSON()).to.deep.equal(TH.shownOf(box))
    const told = [JSON.stringify(box), inspect(box)]
    for (const hidden of ['ct-boxkey-a1', 'ct-whisper-a1', 'safebyok-box', 'json_v1', 'whisper_schema_version', 'baseRevisionTok']) {
      for (const text of told) { expect(text).to.not.include(hidden) }
    }
    expect(inspect(box).match(/boxlabel/g)).to.have.lengthOf(1)
  })

  it("freezes the box and its sidecar through: nothing a host is handed can be changed", async () => {
    const box = Box.make(await vaultOf(), TH.boxOf('anthropic_api_key', 'a1', { sidecar: { team: { members: ['ana'] } } }))
    expect(Object.isFrozen(box)).to.be.true
    expect(Reflect.set(box, 'boxlabel', 'other')).to.be.false
    expect(Reflect.set(box, 'vault_tok', 'other')).to.be.false
    const sidecar = box.sidecar as { team: { members: string[] } }
    expect(Object.isFrozen(sidecar.team.members)).to.be.true
    expect(() => { sidecar.team.members.push('mallory') }).to.throw(TypeError)
  })

  it("keeps nothing of the caller's record: a change to it afterwards reaches nothing in the box", async () => {
    const record = structuredClone(TH.boxOf('anthropic_api_key', 'a1'))
    const box = Box.make(await vaultOf(), record)
    record.box_key_wrapped.ciphertext_b64 = 'changed'
    record.revision_tok = 'changed'
    expect(box.record.box_key_wrapped.ciphertext_b64).to.eq('ct-boxkey-a1')
    expect(box.revision_tok).to.eq('rev-a1')
  })

  it("holds, spread, the visible fields a BoxSummary holds but for damaged, and the rest of its stamp (Contract: Box)", async () => {
    const box = Box.make(await vaultOf(), TH.boxOf('anthropic_api_key', 'a1'))
    const { applabel: _applabel, user_id: _userId, vaultlabel: _vaultlabel, vault_epoch: _vaultEpoch, gate_epoch: _gateEpoch, ...summary } = TH.shownOf(box)
    expect(BoxSummary.parse(summary)).to.deep.equal({ ...summary, damaged: false })
    expect(Object.keys(BoxSummary.shape)).to.have.members([...Object.keys(summary), 'damaged'])
  })

  it("makes a box from a record a VaultDB hands back, as its first example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
    valOf(await vaultDB.putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic_api_key', 'a1')))
    const record = valOf(await vaultDB.getBox(TH.scopeOf('u1'), 'anthropic_api_key', TH.inThisVault))
    if (record === null) { throw new Error('expected a box record') }
    const box = Box.make(await vaultOf(), record)
    expect(box.record).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("refuses what is no box record as 'bad_record', quoting none of it, as its second example shows", async () => {
    const vault = await vaultOf()
    const err = TH.expectSyncRefusal(() => Box.make(vault, { boxlabel: 'anthropic_api_key', revision_tok: Secret } as unknown as BoxRecord), 'bad_record')
    expect(err.message).to.not.include(Secret)
    expect(err.cause).to.be.undefined
  })

  it("refuses a Box of another copy of safebyok as 'bad_record', as it refuses anything that is no box record", async () => {
    const theirs = await otherCopyBox()
    expect(theirs).to.not.be.instanceOf(Box)
    const vault = await vaultOf()
    TH.expectSyncRefusal(() => Box.make(vault, theirs as BoxRecord), 'bad_record')
  })
})

describe("Box.seal", () => {
  it("seals a whisper that opens under the vault's lease, the sidecar given, as its first example shows (Contract: Box)", async () => {
    const vault = await vaultOf()
    const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-fake')
    expect(box.sidecar).to.deep.equal({ note: 'work account' })
    expect(box.record.sidecar).to.deep.equal({ note: 'work account' })
    expect(await box.extractWhisper()).to.eq('sk-ant-fake')
  })

  it("stamps the box with the vault as it stood at the seal, the lease's vault_tok among it", async () => {
    const { vault, box } = await sealedOf()
    expect(TH.shownOf(box)).to.deep.include(stampOf(vault))
    expect(box.vault_tok).to.eq(vault.lease?.vault_tok)
  })

  it("ciphers the whisper as its JSON with every object's keys sorted, so it opens with them in order (Contract: Box, whisper_codec)", async () => {
    const { box } = await sealedOf({ zeta: 'sk-fake', alpha: { omega: 1, beta: 2 } })
    expect(box.record.whisper_codec).to.eq('json_v1')
    const opened = await box.extractWhisper() as Record<string, Record<string, number>>
    expect(Object.keys(opened)).to.deep.equal(['alpha', 'zeta'])
    expect(Object.keys(opened['alpha'] ?? {})).to.deep.equal(['beta', 'omega'])
  })

  it("writes the whisper only ciphered: no field of the record holds it in the clear (Contract: vault.putBox, Guarantees)", async () => {
    const { box } = await sealedOf()
    expect(JSON.stringify(box.record)).to.not.include(Secret)
    expect(JSON.stringify(box.record)).to.not.include(btoa(Secret).slice(0, 12))
  })

  it("mints a fresh boxKey for every seal, wrapped under the vaultKey, and drops it (Contract: vault.putBox, Guarantees)", async () => {
    const vaultKey = await makeVaultKey()
    const vault = await vaultOf(vaultKey)
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey')
    const wrapKey = vi.spyOn(crypto.subtle, 'wrapKey')
    const one = await Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret)
    const two = await Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret)
    expect(generateKey).toHaveBeenCalledTimes(2)
    const minted = await Promise.all(generateKey.mock.results.map((result) => result.value as Promise<CryptoKey>))
    expect(wrapKey.mock.calls.map((call) => call[1])).to.deep.equal(minted)
    expect(minted[0]).to.not.equal(minted[1])
    // Wrapped under the vaultKey as the lease unwraps it for the one call: the same AES key, never the handle kept.
    for (const call of wrapKey.mock.calls) { expect(call[2]).to.not.eq(vaultKey) }
    expect(one.revision_tok).to.not.eq(two.revision_tok)
    expect(one.record.whisper_ciphered.ciphertext_b64).to.not.eq(two.record.whisper_ciphered.ciphertext_b64)
    expect(one).to.not.have.property('boxKey')
  })

  it("stamps written_at, and a new box's registered_at, with the time its vault's clock reads", async () => {
    const { box } = await sealedOf()
    expect(box.written_at).to.eq(T0)
    expect(box.registered_at).to.eq(T0)
  })

  it("carries registered_at forward from its base, and names the base's revision as baseRevisionTok, as its second example shows", async () => {
    const { vaultKey, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const later = await vaultOf(vaultKey, {}, T0 + 1000)
    const next = await Box.seal(later, { boxlabel: box.boxlabel, sidecar: box.sidecar, base: box }, 'sk-ant-NEXT')
    expect(next.registered_at).to.eq(T0)
    expect(next.written_at).to.eq(T0 + 1000)
    expect(next.sidecar).to.deep.equal({ note: 'work account' })
    expect(next.revision_tok).to.not.eq(box.revision_tok)
    expect(next.baseRevisionTok).to.eq(box.revision_tok)
  })

  it("seals a sidecar left out as {}, carrying nothing from its base but its revision and registered_at", async () => {
    const { vault, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const next = await Box.seal(vault, { boxlabel: 'anthropic_api_key', base: box }, Secret)
    expect(next.sidecar).to.deep.equal({})
  })

  it("takes a listing's entry as its base, as a whole putBox() does: a revision alone, or with registered_at", async () => {
    const { vault } = await sealedOf()
    const damaged = await Box.seal(vault, { boxlabel: 'anthropic_api_key', base: { revision_tok: 'rev-listed' } }, Secret)
    expect(damaged).to.include({ baseRevisionTok: 'rev-listed', registered_at: T0 })
    const listed = await Box.seal(vault, { boxlabel: 'anthropic_api_key', base: { revision_tok: 'rev-listed', registered_at: T0 - 5 } }, Secret)
    expect(listed.registered_at).to.eq(T0 - 5)
    const fresh = await Box.seal(vault, { boxlabel: 'anthropic_api_key', base: null }, Secret)
    expect(fresh.baseRevisionTok).to.be.null
  })

  const SealRefusals = [
    // fix the code:
    [{ whisper: undefined },                                          'bad_whisper',  'a whisper of undefined'],
    [{ whisper: { apiKey: Secret, when: new Date() } },               'bad_whisper',  'a whisper JSON would flatten, quoting none of it'],
    [{ props: { sidecar: { apiKey: Secret, when: new Date() } } },    'bad_option',   'a sidecar JSON would flatten, quoting none of it'],
    [{ props: { sidcar: { note: Secret } } },                         'bad_option',   'a misspelt prop'],
    [{ props: { base: { revision: Secret } } },                       'bad_option',   'a base that shows no revision_tok'],
    [{ props: { base: { revision_tok: 'r1', registered_at: 'then' } } }, 'bad_option', 'a base whose registered_at is no time'],
    [{ props: { boxlabel: '' } },                                     'bad_label',    'an empty boxlabel'],
  ] as const

  for (const [given, refusalkind, blurb] of SealRefusals) {
    it(`refuses ${blurb} as '${refusalkind}'`, async () => {
      const vault = await vaultOf()
      const args = { whisper: Secret as unknown, props: {}, ...given }
      const sealing = Box.seal(vault, { boxlabel: 'anthropic_api_key', ...args.props } as SealBoxProps, args.whisper as Whisper)
      const err = await TH.expectRefusal(sealing, refusalkind)
      expect(err.message).to.not.include(Secret)
    })
  }

  it("refuses as 'vault_locked' with no lease in hand, or one ended by its vault's clock", async () => {
    const clock = { at: T0 }
    const vault = await TH.leasedSliceOf('u1', await makeVaultKey(), { now: () => clock.at })
    const ending = vault.lease?.ask_passphrase_at ?? 0
    clock.at = ending
    await TH.expectRefusal(Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret), 'vault_locked')
    vault.lease = null
    clock.at = T0
    await TH.expectRefusal(Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret), 'vault_locked')
  })

  it("refuses as 'absent_vault' a seal into a vault that holds no vault props", async () => {
    const vault = await vaultOf()
    vault.stamp = null
    await TH.expectRefusal(Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret), 'absent_vault')
  })

  it("resolves the box as an Outcome's val from trySeal", async () => {
    const vault = await vaultOf()
    const box = await TH.expectGood(Box.trySeal(vault, { boxlabel: 'anthropic_api_key' }, Secret))
    expect(box).to.be.instanceOf(Box)
    await TH.expectBad(Box.trySeal(vault, { boxlabel: '' }, Secret), 'bad_label')
  })
})

describe("box.extractWhisper", () => {
  it("opens to the whisper sealed, as its example shows (Contract: box.extractWhisper, Returns)", async () => {
    const { box } = await sealedOf({ apiKey: Secret, org: 'acme' })
    expect(await box.extractWhisper()).to.deep.equal({ apiKey: Secret, org: 'acme' })
  })

  it("resolves the whisper as an Outcome's val from tryExtractWhisper, as its example shows", async () => {
    const { box } = await sealedOf({ apiKey: Secret, org: 'acme' })
    const { ok, val: whisper } = await box.tryExtractWhisper()
    expect(ok).to.be.true
    expect(whisper).to.deep.equal({ apiKey: Secret, org: 'acme' })
  })

  it("rebuilds boxCtx from the vault's scope, the vault's token and every visible field, unwraps, deciphers and checks (Contract: box.extractWhisper, Does)", async () => {
    const vaultKey = await makeVaultKey()
    const vault = await vaultOf(vaultKey)
    const record = await handSealedOf(vault, vaultKey, new TextEncoder().encode(JSON.stringify(Secret)))
    expect(await Box.make(vault, record).extractWhisper()).to.eq(Secret)
  })

  const Alterations = [
    [{ boxlabel: 'openai_api_key' },                 'moved to another boxlabel'],
    [{ revision_tok: 'rev-replayed' },               'its revision altered'],
    [{ sidecar: { note: 'planted' } },               'its sidecar altered'],
    [{ sidecar: { note: 'a test box', tier: 1 } },    'its sidecar added to'],
    [{ registered_at: T0 - 1 },                      'its registered_at altered'],
    [{ written_at: T0 + 1 },                         'its written_at altered'],
  ] as const

  for (const [altered, blurb] of Alterations) {
    it(`refuses a box ${blurb} in storage as 'damaged_box' (Contract: box.extractWhisper, Guarantees)`, async () => {
      const { vault, box } = await sealedOf()
      await TH.expectBad(Box.make(vault, { ...box.record, ...altered }).tryExtractWhisper(), 'damaged_box')
    })
  }

  it("opens a box whose sidecar storage handed back with its keys reordered, as a jsonb column may: the ctx binds its JSON with keys sorted", async () => {
    const { vault, box } = await sealedOf(Secret, { sidecar: { alpha: 1, beta: { delta: 2, gamma: 3 } } })
    const reordered = { beta: { gamma: 3, delta: 2 }, alpha: 1 }
    expect(await Box.make(vault, { ...box.record, sidecar: reordered }).extractWhisper()).to.eq(Secret)
  })

  const Elsewheres = [
    [{ applabel: 'other_app' },               'another app'],
    [{ user_id: 'u2' },                       'another user'],
    [{ vaultlabel: 'spare' },                 'another vault of the same user'],
    [{ vault_tok: 'vault-tok-reborn' },       'the same vault made anew'],
  ] as const

  for (const [elsewhere, blurb] of Elsewheres) {
    it(`refuses a box moved to ${blurb} as 'damaged_box', even under the same vaultKey (Contract: box.extractWhisper, Guarantees)`, async () => {
      const { vaultKey, box } = await sealedOf()
      const there = await vaultOf(vaultKey, elsewhere)
      await TH.expectBad(Box.make(there, box.record).tryExtractWhisper(), 'damaged_box')
    })
  }

  for (const [moved, refusalkind] of [
    [{ vault_tok: 'vault-tok-reborn' }, 'vault_remade'],
    [{ gate_epoch: 2 },                 'gate_moved'],
  ] as const) {
    it(`refuses as '${refusalkind}' a box made before its vault moved on, opening nothing`, async () => {
      const { vault, box } = await sealedOf()
      vault.stamp = { ...stampOf(vault), ...moved }
      const decipher = vi.spyOn(crypto.subtle, 'decrypt')
      await TH.expectBad(box.tryExtractWhisper(), refusalkind)
      expect(decipher).not.toHaveBeenCalled()
    })
  }

  it("refuses ciphertext swapped in from another box as 'damaged_box' (Contract: box.extractWhisper, Guarantees)", async () => {
    const { vault, box } = await sealedOf()
    const other = await Box.seal(vault, { boxlabel: 'anthropic_api_key' }, 'sk-ant-OTHER')
    await TH.expectBad(Box.make(vault, { ...box.record, whisper_ciphered: other.record.whisper_ciphered }).tryExtractWhisper(), 'damaged_box')
    await TH.expectBad(Box.make(vault, { ...box.record, box_key_wrapped: other.record.box_key_wrapped }).tryExtractWhisper(), 'damaged_box')
  })

  it("refuses a box under a vaultKey the vault does not hold as 'damaged_box' (Contract: box.extractWhisper, Refuses)", async () => {
    const { box } = await sealedOf()
    const another = await vaultOf()
    await TH.expectBad(Box.make(another, box.record).tryExtractWhisper(), 'damaged_box')
    expect(await box.extractWhisper()).to.eq(Secret)
  })

  it("refuses a box that opens to no whisper as 'damaged_box' (Contract: box.extractWhisper, Refuses)", async () => {
    const vaultKey = await makeVaultKey()
    const vault = await vaultOf(vaultKey)
    for (const plain of ['not json', 'null', '']) {
      const record = await handSealedOf(vault, vaultKey, new TextEncoder().encode(plain))
      const err = await TH.expectBad(Box.make(vault, record).tryExtractWhisper(), 'damaged_box')
      expect(err.message).to.include('not a whisper')
    }
  })

  it("hands back nothing partial on a refusal, and names nothing of the box in it (Contract: box.extractWhisper, Guarantees)", async () => {
    const { vault, box } = await sealedOf(Secret, { sidecar: { note: 'sk-ant-SIDECAR' } })
    const outcome = await Box.make(vault, { ...box.record, written_at: T0 + 1 }).tryExtractWhisper()
    expect(outcome).to.not.have.property('val')
    const err = await TH.expectBad(outcome, 'damaged_box')
    for (const quoted of [Secret, 'sk-ant-SIDECAR', 'anthropic_api_key', box.revision_tok, box.record.whisper_ciphered.ciphertext_b64]) {
      expect(err.message).to.not.include(quoted)
    }
    expect(err.cause).to.be.undefined
    expect(err.meta).to.be.undefined
  })

  it("refuses as 'vault_locked' with no lease in hand, or one ended by its vault's clock", async () => {
    const clock = { at: T0 }
    const vault = await TH.leasedSliceOf('u1', await makeVaultKey(), { now: () => clock.at })
    const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret)
    const { lease } = vault
    clock.at = (lease?.ask_passphrase_at ?? 0) - 1
    expect(await box.extractWhisper()).to.eq(Secret)
    clock.at = lease?.ask_passphrase_at ?? 0
    await TH.expectBad(box.tryExtractWhisper(), 'vault_locked')
    vault.lease = null
    clock.at = T0
    await TH.expectBad(box.tryExtractWhisper(), 'vault_locked')
  })

  it("zeroes the whisper's bytes once parsed", async () => {
    const { box } = await sealedOf()
    const deciphering = vi.spyOn(Lease.prototype, 'decipherWith')
    await box.extractWhisper()
    const bytes = await (deciphering.mock.results[0]?.value as Promise<Uint8Array>)
    expect([...bytes].every((byte) => byte === 0)).to.be.true
  })
})
// --
