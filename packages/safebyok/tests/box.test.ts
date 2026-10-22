import { inspect } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Box, BoxRecord } from '../src/box'
import { cipherBytes, cipherCtx, makeBoxKey, makeVaultKey, wrapKeyUnder } from '../src/crypto'
import { Lease } from '../src/lease'
import { localVaultDB } from '../src/local-vault-db'
import { valOf } from '../src/outcome'
import { memoryStore } from '../src/string-store'
import { stableJsonify } from '../src/stable-jsonify'
import { BoxSummary, FarFuture, type Whisper } from '../src/types'
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

// == [Box]: vaultOf, leaseOf, the model, sealing, opening

/** The time every box here is sealed at, unless a test says otherwise: what its vault's clock reads. */
const T0 = TH.SliceNow

/** The vault a box here is of: `u1`'s `main` vault, holding the vault props `vault-tok-u1`, its clock reading `at`. */
const vaultOf = (overrides: Partial<TH.VaultSlice> = {}, at = T0): TH.VaultSlice => TH.vaultSliceOf('u1', TH.testDeriver, { now: () => at, ...overrides })

/** A lease on `vault`, opened around `vaultKey`, granted under the vault props `vaultTok` at gate epoch 1. */
const leaseOf = async (vaultKey: CryptoKey, vaultTok = 'vault-tok-u1', vault: TH.VaultSlice = vaultOf()): Promise<Lease> => (
  await Lease.grant(vault, { vault_tok: vaultTok, gate_epoch: 1 }, { transientKey: vaultKey, sessionKey: vaultKey })
)

/** A lease on a fresh vaultKey whose vault's clock reads what `clock.at` holds, {@link T0} until a test moves it. */
const movingLease = async () => {
  const clock = { at: T0 }
  const lease = await leaseOf(await makeVaultKey(), 'vault-tok-u1', TH.vaultSliceOf('u1', TH.testDeriver, { now: () => clock.at }))
  return { lease, clock }
}

const Secret = 'sk-ant-SUPERSECRET'

/** A box sealed by a second copy of safebyok, loaded afresh beside this one as two versions in one bundle would be: its class is its own. */
const otherCopyBox = async (): Promise<unknown> => {
  vi.resetModules()
  const { Box: OtherBox } = await import('../src/box')
  const { Lease: OtherLease } = await import('../src/lease')
  const vaultKey = await makeVaultKey()
  const lease = await OtherLease.grant(vaultOf(), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }, { transientKey: vaultKey, sessionKey: vaultKey })
  return await OtherBox.seal(vaultOf(), lease, 'anthropic_api_key', Secret)
}

/** `whisper` sealed into `u1`'s vault at {@link T0} under a lease on a fresh vaultKey: the box, the vault, the key and the lease. */
const sealedOf = async (whisper: Whisper = Secret, opts?: Parameters<typeof Box.seal>[4]) => {
  const vault = vaultOf()
  const vaultKey = await makeVaultKey()
  const lease = await leaseOf(vaultKey)
  const box = await Box.seal(vault, lease, 'anthropic_api_key', whisper, opts)
  return { vault, vaultKey, lease, box }
}

/**
 * A box record holding `plainBytes` as its whisper, ciphered and wrapped by hand under the ctx a
 * box's ctx is documented to be: the format, the vault's scope, the vault props' token, the
 * purpose, and every visible field, the sidecar as its JSON with keys sorted.
 */
const handSealedOf = async (vault: TH.VaultSlice, vaultKey: CryptoKey, plainBytes: Uint8Array): Promise<BoxRecord> => {
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

afterEach(() => { vi.restoreAllMocks() })

describe("Box.make", () => {
  it("makes a box whose visible fields are its own, read from the record, the sidecar parsed, and the vault props' token beside them, as the class's example shows (Contract: Box)", () => {
    const record = TH.boxOf('anthropic_api_key', 'a1', { sidecar: { note: 'work account' } })
    const box = Box.make(vaultOf(), record)
    expect(TH.shownOf(box)).to.deep.equal({
      boxlabel:      'anthropic_api_key',
      revision_tok:  'rev-a1',
      sidecar:       { note: 'work account' },
      registered_at: record.registered_at,
      written_at:    record.written_at,
      vault_tok:     'vault-tok-u1',
    })
  })

  it("lies under the vault props its vault holds, or under the vault token it is handed", () => {
    expect(Box.make(vaultOf({ vault_tok: 'vault-tok-now' }), TH.boxOf('anthropic_api_key', 'a1')).vault_tok).to.eq('vault-tok-now')
    expect(Box.make(vaultOf(), TH.boxOf('anthropic_api_key', 'a1'), 'vault-tok-read').vault_tok).to.eq('vault-tok-read')
  })

  it("refuses as 'absent_vault' a box of a vault that holds no vault props, when no vault token is handed", () => {
    TH.expectSyncRefusal(() => Box.make(vaultOf({ vault_tok: null }), TH.boxOf('anthropic_api_key', 'a1')), 'absent_vault')
  })

  it("gives the record back whole as record, frozen through, the one source of its fields (Contract: Box)", () => {
    const record = TH.boxOf('anthropic_api_key', 'a1')
    const box = Box.make(vaultOf(), record)
    expect(box.record).to.deep.equal(record)
    expect(Object.isFrozen(box.record)).to.be.true
    expect(Object.isFrozen(box.record.box_key_wrapped)).to.be.true
    expect(Object.isFrozen(box.record.whisper_ciphered)).to.be.true
  })

  it("shows each visible field once in a key list, a spread, JSON and a log line, and nothing else: no ciphertext, format, codec or vault, as toJSON's example shows (Contract: Box)", () => {
    const box = Box.make(vaultOf(), TH.boxOf('anthropic_api_key', 'a1'))
    const visible = ['boxlabel', 'revision_tok', 'sidecar', 'registered_at', 'written_at', 'vault_tok']
    expect(Object.keys(box)).to.deep.equal(visible)
    expect(Object.keys(TH.jsonOf(box))).to.deep.equal(visible)
    expect(box.toJSON()).to.deep.equal(TH.shownOf(box))
    const told = [JSON.stringify(box), inspect(box)]
    for (const hidden of ['ct-boxkey-a1', 'ct-whisper-a1', 'safebyok-box', 'json_v1', 'acme', 'whisper_schema_version']) {
      for (const text of told) { expect(text).to.not.include(hidden) }
    }
    expect(inspect(box).match(/boxlabel/g)).to.have.lengthOf(1)
  })

  it("freezes the box and its sidecar through: nothing a host is handed can be changed", () => {
    const box = Box.make(vaultOf(), TH.boxOf('anthropic_api_key', 'a1', { sidecar: { team: { members: ['ana'] } } }))
    expect(Object.isFrozen(box)).to.be.true
    expect(Reflect.set(box, 'boxlabel', 'other')).to.be.false
    expect(Reflect.set(box, 'vault_tok', 'other')).to.be.false
    const sidecar = box.sidecar as { team: { members: string[] } }
    expect(Object.isFrozen(sidecar.team.members)).to.be.true
    expect(() => { sidecar.team.members.push('mallory') }).to.throw(TypeError)
  })

  it("keeps nothing of the caller's record: a change to it afterwards reaches nothing in the box", () => {
    const record = structuredClone(TH.boxOf('anthropic_api_key', 'a1'))
    const box = Box.make(vaultOf(), record)
    record.box_key_wrapped.ciphertext_b64 = 'changed'
    record.revision_tok = 'changed'
    expect(box.record.box_key_wrapped.ciphertext_b64).to.eq('ct-boxkey-a1')
    expect(box.revision_tok).to.eq('rev-a1')
  })

  it("holds, spread, the visible fields a BoxSummary holds but for damaged: what vault.boxes lists (Contract: Box)", () => {
    const box = Box.make(vaultOf(), TH.boxOf('anthropic_api_key', 'a1'))
    expect(BoxSummary.parse(TH.shownOf(box))).to.deep.equal({ ...TH.shownOf(box), damaged: false })
    expect(Object.keys(BoxSummary.shape)).to.have.members([...Object.keys(box), 'damaged'])
  })

  it("makes a box from a record a VaultDB hands back, as its first example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    await TH.ensureGated(vaultDB, TH.vaultPropsOf('u1'))
    valOf(await vaultDB.putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic_api_key', 'a1')))
    const record = valOf(await vaultDB.getBox(TH.scopeOf('u1'), 'anthropic_api_key', TH.inThisVault))
    const box = Box.make(vaultOf(), record!)
    expect(box.record).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("refuses what is no box record as 'bad_record', quoting none of it, as its second example shows", () => {
    const err = TH.expectSyncRefusal(() => Box.make(vaultOf(), { boxlabel: 'anthropic_api_key', revision_tok: Secret } as unknown as BoxRecord), 'bad_record')
    expect(err.message).to.not.include(Secret)
    expect(err.cause).to.be.undefined
  })

  it("refuses a Box of another copy of safebyok as 'bad_record', as it refuses anything that is no box record", async () => {
    const theirs = await otherCopyBox()
    expect(theirs).to.not.be.instanceOf(Box)
    TH.expectSyncRefusal(() => Box.make(vaultOf(), theirs as BoxRecord), 'bad_record')
  })
})

describe("Box.seal", () => {
  it("seals a whisper that opens under the lease it was sealed with, the sidecar given, as its first example shows (Contract: Box)", async () => {
    const { lease, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    expect(box.sidecar).to.deep.equal({ note: 'work account' })
    expect(box.record.sidecar).to.deep.equal({ note: 'work account' })
    expect(await box.open(lease)).to.eq(Secret)
  })

  it("lays the box under the lease's vault props, whatever its vault holds: the vault it names is the one whose key sealed it", async () => {
    const vaultKey = await makeVaultKey()
    const box = await Box.seal(vaultOf({ vault_tok: 'vault-tok-other' }), await leaseOf(vaultKey, 'vault-tok-leased'), 'anthropic_api_key', Secret)
    expect(box.vault_tok).to.eq('vault-tok-leased')
  })

  it("ciphers the whisper as its JSON with every object's keys sorted, so it opens with them in order (Contract: Box, whisper_codec)", async () => {
    const { lease, box } = await sealedOf({ zeta: 'sk-fake', alpha: { omega: 1, beta: 2 } })
    expect(box.record.whisper_codec).to.eq('json_v1')
    const opened = await box.open(lease) as Record<string, Record<string, number>>
    expect(Object.keys(opened)).to.deep.equal(['alpha', 'zeta'])
    expect(Object.keys(opened['alpha'] ?? {})).to.deep.equal(['beta', 'omega'])
  })

  it("writes the whisper only ciphered: no field of the record holds it in the clear (Contract: vault.putBox, Guarantees)", async () => {
    const { box } = await sealedOf()
    expect(JSON.stringify(box.record)).to.not.include(Secret)
    expect(JSON.stringify(box.record)).to.not.include(btoa(Secret).slice(0, 12))
  })

  it("mints a fresh boxKey for every seal, wrapped under the lease's vaultKey, and drops it (Contract: vault.putBox, Guarantees)", async () => {
    const vaultKey = await makeVaultKey()
    const lease = await leaseOf(vaultKey)
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey')
    const wrapKey = vi.spyOn(crypto.subtle, 'wrapKey')
    const one = await Box.seal(vaultOf(), lease, 'anthropic_api_key', Secret)
    const two = await Box.seal(vaultOf(), lease, 'anthropic_api_key', Secret)
    expect(generateKey).toHaveBeenCalledTimes(2)
    const minted = await Promise.all(generateKey.mock.results.map((result) => result.value as Promise<CryptoKey>))
    expect(wrapKey.mock.calls.map((call) => call[1])).to.deep.equal(minted)
    expect(minted[0]).to.not.equal(minted[1])
    expect(wrapKey.mock.calls.map((call) => call[2])).to.deep.equal([vaultKey, vaultKey])
    expect(one.revision_tok).to.not.eq(two.revision_tok)
    expect(one.record.whisper_ciphered.ciphertext_b64).to.not.eq(two.record.whisper_ciphered.ciphertext_b64)
    expect(one).to.not.have.property('boxKey')
  })

  it("stamps written_at, and a new box's registered_at, with the time its vault's clock reads", async () => {
    const { box } = await sealedOf()
    expect(box.written_at).to.eq(T0)
    expect(box.registered_at).to.eq(T0)
  })

  it("carries registered_at and the sidecar forward from the box it replaces, as its second example shows", async () => {
    const { lease, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const next = await Box.seal(vaultOf({}, T0 + 1000), lease, 'anthropic_api_key', 'sk-ant-NEXT', { over: box })
    expect(next.registered_at).to.eq(T0)
    expect(next.written_at).to.eq(T0 + 1000)
    expect(next.sidecar).to.deep.equal({ note: 'work account' })
    expect(next.revision_tok).to.not.eq(box.revision_tok)
  })

  it("lets a sidecar given win over the replaced box's, {} emptying it", async () => {
    const { vault, lease, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const emptied = await Box.seal(vault, lease, 'anthropic_api_key', Secret, { over: box, sidecar: {} })
    expect(emptied.sidecar).to.deep.equal({})
  })

  it("carries nothing forward from a box it replaces that will not open: nothing vouches for its fields", async () => {
    const { vault, lease, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const planted = Box.make(vault, { ...box.record, sidecar: { note: 'planted' }, registered_at: T0 - 1000 })
    const next = await Box.seal(vaultOf({}, T0 + 1000), lease, 'anthropic_api_key', Secret, { over: planted })
    expect(next.sidecar).to.deep.equal({})
    expect(next.registered_at).to.eq(T0 + 1000)
  })

  const SealRefusals = [
    // fix the code:
    [{ whisper: undefined },                                        'bad_whisper',  'a whisper of undefined'],
    [{ whisper: { apiKey: Secret, when: new Date() } },             'bad_whisper',  'a whisper JSON would flatten, quoting none of it'],
    [{ opts: { sidecar: { apiKey: Secret, when: new Date() } } },   'bad_option',   'a sidecar JSON would flatten, quoting none of it'],
    [{ opts: { sidcar: { note: Secret } } },                        'bad_option',   'a misspelt option'],
    [{ lease: Secret },                                             'bad_option',   'a lease that is no Lease'],
    [{ opts: { over: TH.boxOf('anthropic_api_key', 'a1') } },       'bad_option',   'an over that is a record rather than a box'],
    [{ boxlabel: '' },                                              'bad_label',    'an empty boxlabel'],
  ] as const

  for (const [given, refusalkind, blurb] of SealRefusals) {
    it(`refuses ${blurb} as '${refusalkind}'`, async () => {
      const lease = await leaseOf(await makeVaultKey())
      const args = { boxlabel: 'anthropic_api_key', whisper: Secret, lease, opts: undefined, ...given }
      const sealing = Box.seal(vaultOf(), args.lease as Lease, args.boxlabel, args.whisper as Whisper, args.opts as Parameters<typeof Box.seal>[4])
      const err = await TH.expectRefusal(sealing, refusalkind)
      expect(err.message).to.not.include(Secret)
    })
  }

  it("refuses an over under another boxlabel as 'bad_option': it is not the box this one replaces", async () => {
    const { vault, lease, box } = await sealedOf()
    await TH.expectRefusal(Box.seal(vault, lease, 'openai_api_key', Secret, { over: box }), 'bad_option')
  })

  it("refuses an over that is a Box of another copy of safebyok as 'bad_option': it is no Box of this one", async () => {
    const over = await otherCopyBox()
    const lease = await leaseOf(await makeVaultKey())
    await TH.expectRefusal(Box.seal(vaultOf(), lease, 'anthropic_api_key', Secret, { over: over as Box }), 'bad_option')
  })

  it("refuses as 'vault_locked' an over of another vault than the lease: the vault was deleted and made anew since it was read", async () => {
    const { vault, vaultKey, box } = await sealedOf()
    const reborn = await leaseOf(vaultKey, 'vault-tok-reborn')
    await TH.expectRefusal(Box.seal(vault, reborn, 'anthropic_api_key', Secret, { over: box }), 'vault_locked')
  })

  it("refuses as 'vault_locked' a lease not opened, or ended by its vault's clock", async () => {
    const { lease, clock } = await movingLease()
    const stored = Lease.make(vaultOf(), lease.record)
    await TH.expectRefusal(Box.seal(vaultOf(), stored, 'anthropic_api_key', Secret), 'vault_locked')
    clock.at = lease.ask_passphrase_at
    await TH.expectRefusal(Box.seal(vaultOf(), lease, 'anthropic_api_key', Secret), 'vault_locked')
  })
})

describe("box.tryOpen", () => {
  it("opens to the whisper sealed, as its example shows (Contract: box.tryOpen, Returns)", async () => {
    const { lease, box } = await sealedOf({ apiKey: Secret, org: 'acme' })
    const { ok, val: whisper } = await box.tryOpen(lease)
    expect(ok).to.be.true
    expect(whisper).to.deep.equal({ apiKey: Secret, org: 'acme' })
  })

  it("rebuilds boxCtx from the vault's scope, the vault props' token and every visible field, unwraps, deciphers and checks (Contract: box.tryOpen, Does)", async () => {
    const vault = vaultOf()
    const vaultKey = await makeVaultKey()
    const record = await handSealedOf(vault, vaultKey, new TextEncoder().encode(JSON.stringify(Secret)))
    expect(await Box.make(vault, record).open(await leaseOf(vaultKey))).to.eq(Secret)
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
    it(`refuses a box ${blurb} in storage as 'damaged_box' (Contract: box.tryOpen, Guarantees)`, async () => {
      const { vault, lease, box } = await sealedOf()
      await TH.expectBad(Box.make(vault, { ...box.record, ...altered }).tryOpen(lease), 'damaged_box')
    })
  }

  it("opens a box whose sidecar storage handed back with its keys reordered, as a jsonb column may: the ctx binds its JSON with keys sorted", async () => {
    const { vault, lease, box } = await sealedOf(Secret, { sidecar: { alpha: 1, beta: { delta: 2, gamma: 3 } } })
    const reordered = { beta: { gamma: 3, delta: 2 }, alpha: 1 }
    expect(await Box.make(vault, { ...box.record, sidecar: reordered }).open(lease)).to.eq(Secret)
  })

  const Elsewheres = [
    [{ applabel: 'other_app' },          'another app'],
    [{ user_id: 'u2' },                  'another user'],
    [{ vaultlabel: 'spare' },            'another vault of the same user'],
  ] as const

  for (const [elsewhere, blurb] of Elsewheres) {
    it(`refuses a box moved to ${blurb} as 'damaged_box', even under the same vaultKey (Contract: box.tryOpen, Guarantees)`, async () => {
      const { lease, box } = await sealedOf()
      await TH.expectBad(Box.make(vaultOf(elsewhere), box.record).tryOpen(lease), 'damaged_box')
    })
  }

  it("refuses a box moved to the same vault made anew as 'damaged_box', even under the same vaultKey (Contract: box.tryOpen, Guarantees)", async () => {
    const { vault, vaultKey, box } = await sealedOf()
    await TH.expectBad(Box.make(vault, box.record, 'vault-tok-reborn').tryOpen(await leaseOf(vaultKey, 'vault-tok-reborn')), 'damaged_box')
  })

  it("refuses as 'vault_locked' a lease of another vault than the box lies in: the vault was deleted and made anew since the box was read", async () => {
    const { vaultKey, box } = await sealedOf()
    const err = await TH.expectBad(box.tryOpen(await leaseOf(vaultKey, 'vault-tok-reborn')), 'vault_locked')
    expect(err.message).to.match(/another vault/)
  })

  it("refuses ciphertext swapped in from another box as 'damaged_box' (Contract: box.tryOpen, Guarantees)", async () => {
    const { vault, lease, box } = await sealedOf()
    const other = await Box.seal(vault, lease, 'anthropic_api_key', 'sk-ant-OTHER')
    await TH.expectBad(Box.make(vault, { ...box.record, whisper_ciphered: other.record.whisper_ciphered }).tryOpen(lease), 'damaged_box')
    await TH.expectBad(Box.make(vault, { ...box.record, box_key_wrapped: other.record.box_key_wrapped }).tryOpen(lease), 'damaged_box')
  })

  it("refuses a box under a vaultKey the vault does not hold as 'damaged_box' (Contract: box.tryOpen, Refuses)", async () => {
    const { lease, box } = await sealedOf()
    const another = await leaseOf(await makeVaultKey())
    await TH.expectBad(box.tryOpen(another), 'damaged_box')
    expect(await box.open(lease)).to.eq(Secret)
  })

  it("refuses a box that opens to no whisper as 'damaged_box' (Contract: box.tryOpen, Refuses)", async () => {
    const vault = vaultOf()
    const vaultKey = await makeVaultKey()
    for (const plain of ['not json', 'null', '']) {
      const record = await handSealedOf(vault, vaultKey, new TextEncoder().encode(plain))
      const err = await TH.expectBad(Box.make(vault, record).tryOpen(await leaseOf(vaultKey)), 'damaged_box')
      expect(err.message).to.include('not a whisper')
    }
  })

  it("hands back nothing partial on a refusal, and names nothing of the box in it (Contract: box.tryOpen, Guarantees)", async () => {
    const { vault, lease, box } = await sealedOf(Secret, { sidecar: { note: 'sk-ant-SIDECAR' } })
    const outcome = await Box.make(vault, { ...box.record, written_at: T0 + 1 }).tryOpen(lease)
    expect(outcome).to.not.have.property('val')
    const err = await TH.expectBad(outcome, 'damaged_box')
    for (const quoted of [Secret, 'sk-ant-SIDECAR', 'anthropic_api_key', box.revision_tok, box.record.whisper_ciphered.ciphertext_b64]) {
      expect(err.message).to.not.include(quoted)
    }
    expect(err.cause).to.be.undefined
    expect(err.meta).to.be.undefined
  })

  it("refuses a lease that is no Lease as 'bad_option'", async () => {
    const { box } = await sealedOf()
    await TH.expectBad(box.tryOpen('not a lease' as unknown as Lease), 'bad_option')
  })

  it("refuses as 'vault_locked' a lease not opened, or ended by its vault's clock", async () => {
    const { lease, clock } = await movingLease()
    const box = await Box.seal(vaultOf(), lease, 'anthropic_api_key', Secret)
    const stored = Lease.make(vaultOf(), lease.record)
    await TH.expectBad(box.tryOpen(stored), 'vault_locked')
    clock.at = lease.ask_passphrase_at - 1
    expect(await box.open(lease)).to.eq(Secret)
    clock.at = lease.ask_passphrase_at
    await TH.expectBad(box.tryOpen(lease), 'vault_locked')
  })
})

describe("box.open", () => {
  it("opens to the whisper, as its example shows", async () => {
    const { lease, box } = await sealedOf()
    expect(await box.open(lease)).to.eq(Secret)
  })

  it("throws what tryOpen refuses with", async () => {
    const { vault, lease, box } = await sealedOf()
    await TH.expectRefusal(Box.make(vault, { ...box.record, written_at: T0 + 1 }).open(lease), 'damaged_box')
  })
})
// --
