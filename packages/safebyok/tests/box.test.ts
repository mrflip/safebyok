import { inspect } from 'node:util'
import { omit } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Box, type SealBoxProps, boxSparseOf } from '../src/box'
import { BoxDamaged, BoxRecord, BoxSparse, BoxStamp } from '../src/shapes/box'
import { cipherBytes, cipherCtx, makeBoxKey, makeVaultKey, wrapKeyUnder } from '../src/crypto'
import { Lease } from '../src/lease'
import { VaultError } from '../src/errors'
import { localVaultDB } from '../src/local-vault-db'
import { type Outcome, valOf } from '../src/outcome'
import { memoryStore } from '../src/string-store'
import { stableJsonify } from '../src/stable-jsonify'
import type { Whisper } from '../src/shapes/box'
import type { VaultSparse } from '../src/shapes/vault'
import { box_key_wrapped, whisper_ciphered } from '../src/shapes/fields'
import { FarFuture } from '../src/consts'
import * as CX from '../src/shapes/scopes'
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
  // refused, as a damaged or foreign record:
  [{ ...wholeBox, boxlabel: 'Ключ API: מפתח' },           false,  'a boxlabel that is no label, as a damaged record'],
  [sidecarless,                                            false,  'a box with no sidecar: one is always written'],
  [{ ...wholeBox, sidecar: { when: new Date() } },         false,  'a sidecar holding what JSON cannot carry'],
  [{ ...wholeBox, sidecar: undefined },                    false,  'a sidecar left undefined'],
  [{ ...wholeBox, sidecar: 'just text' },                  false,  'a sidecar that is no object: text'],
  [{ ...wholeBox, sidecar: null },                         false,  'a sidecar of JSON null'],
  [{ ...wholeBox, sidecar: [{ note: 'work account' }] },   false,  'a sidecar that is an array'],
  [{ ...sidecarless, format: 'safebyok-box-v7', sidecar_json: '{}' }, false, 'a box from before the sidecar was a JSON value, holding sidecar_json'],
  [{ ...wholeBox, note: 'work account' },                  false,  'an unknown field such as the old note, as damage: a stored record is strict'],
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

  it("refuses a field it does not know, such as the note a box once had, as 'bad_record', counting it and never naming it", () => {
    const err = TH.expectSyncRefusal(() => BoxRecord.parse({ ...wholeBox, note: 'work account' }), 'bad_record')
    expect(err.message).to.match(/^There is a field it does not take \(its name is not repeated\): it takes only format, boxlabel, /)
    expect(err.message).to.not.include('note')
  })

  it("tells a row that is no box from one that is, as its example shows", () => {
    expect(BoxRecord.safeParse(TH.vaultRecordOf('u1')).success).to.be.false
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

/** The box `record` makes in `vault`, made under what the vault shows: `Box.make` as a vault calls it. */
const boxIn = (vault: TH.LeasedSlice, record: BoxRecord): Box => Box.make(vault, record, vault.madeUnder)

/** A box sealed by a second copy of safebyok, loaded afresh beside this one as two versions in one bundle would be: its class is its own. */
const otherCopyBox = async (): Promise<unknown> => {
  vi.resetModules()
  const { Box: OtherBox } = await import('../src/box')
  const { registerLeaseGetter: otherRegister } = await import('../src/held-lease')
  // Each copy reads a vault's lease through its own registry: the other copy's vault registers there too.
  const vault = await vaultOf()
  otherRegister(vault, () => vault.lease)
  return await OtherBox.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making())
}

/** `whisper` sealed into `u1`'s vault at {@link T0} under a lease on a fresh vaultKey: the box, the vault and the key. */
const sealedOf = async (whisper: Whisper = Secret, props: Partial<SealBoxProps> = {}) => {
  const vaultKey = await makeVaultKey()
  const vault = await vaultOf(vaultKey)
  const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key', ...props }, whisper, vault.making())
  return { vault, vaultKey, box }
}

/**
 * A box record holding `plainBytes` as its whisper, ciphered and wrapped by hand under the ctx a
 * box's ctx is documented to be: the vault's stamp but for its format, the box's own stamp (every
 * field but the two ciphered ones, the sidecar as its JSON with keys sorted, and the vault's
 * token), and the purpose.
 */
const handSealedOf = async (vault: TH.LeasedSlice, vaultKey: CryptoKey, plainBytes: Uint8Array): Promise<BoxRecord> => {
  const { format, box_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...header } = TH.boxOf('anthropic_api_key', 'hand')
  const { applabel, user_id, vaultlabel, vault_tok, registered_at } = vault
  const vaultStamp = { applabel, user_id, vaultlabel, vault_tok, registered_at }
  const ctxFor = (purpose: string) => cipherCtx([vaultStamp, { format, ...header, vault_tok, sidecar: stableJsonify(header.sidecar)! }], purpose)
  const boxKey = await makeBoxKey()
  return {
    format,
    ...header,
    box_key_wrapped:  box_key_wrapped.parse(await wrapKeyUnder(vaultKey, boxKey, ctxFor('box_key_wrapped'))),
    whisper_ciphered: whisper_ciphered.parse(await cipherBytes(boxKey, plainBytes, ctxFor('whisper_ciphered'))),
  }
}

/** What `box` holds of the vault it was made under, read field by field: the vault's scope, the `vault_tok`, and both epochs. */
const madeUnderOf = (box: Box): Omit<VaultSparse, 'format' | 'registered_at'> => {
  const { applabel, user_id, vaultlabel, vault_tok, vault_epoch, gate_epoch } = box
  return { applabel, user_id, vaultlabel, vault_tok, vault_epoch, gate_epoch }
}

/** The own fields of every box `TH.boxOf('anthropic_api_key', 'a1')` makes in `u1`'s vault, in order: its scope, what it was made under, then its sparse fields. */
const OwnFields = ['applabel', 'user_id', 'vaultlabel', 'vault_tok', 'vault_epoch', 'gate_epoch', 'format', 'boxlabel', 'revision_tok', 'whisper_codec', 'whisper_schema_version', 'sidecar', 'registered_at', 'written_at']

afterEach(() => { vi.restoreAllMocks() })

describe("BoxSparse", () => {
  it("is every field of the box record but its two ciphered ones, as its example shows, taken from a whole record, and refuses one missing a field", () => {
    const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = TH.boxOf('anthropic_api_key', 'a1')
    expect(BoxSparse.parse(listed)).to.deep.equal(listed)
    expect(Object.keys(BoxSparse.shape)).to.have.members(Object.keys(listed))
    expect(BoxSparse.parse(TH.boxOf('anthropic_api_key', 'a1')), 'taken from the record, its ciphertext left out').to.not.have.any.keys('box_key_wrapped', 'whisper_ciphered')
    expect(BoxSparse.safeParse(TH.omitting(listed, 'sidecar')).success).to.be.false
  })
})

describe("BoxDamaged", () => {
  it("is a damaged box's boxlabel, revision and damage, as its example lists one, and nothing else", () => {
    const damaged = { boxlabel: 'anthropic', revision_tok: null, damage: 'newer_format' } as const
    expect(BoxDamaged.parse(damaged)).to.deep.equal(damaged)
    expect(BoxDamaged.safeParse({ ...damaged, revision_tok: 'rev-one', damage: 'damaged' }).success).to.be.true
    expect(BoxDamaged.safeParse({ ...damaged, damage: 'broken' }).success, 'a damage no version names').to.be.false
    expect(BoxDamaged.safeParse({ ...damaged, boxlabel: 'Anthropic' }).success, 'a boxlabel that is no label').to.be.false
    expect(BoxDamaged.safeParse({ ...damaged, revision_tok: '' }).success, 'an empty revision').to.be.false
    expect(BoxDamaged.safeParse({ ...damaged, sidecar: {} }).success, 'a field a damaged box never holds').to.be.false
  })
})

describe("boxSparseOf", () => {
  it("lists a record's sparse fields, frozen through, its sidecar the record's own, as its example shows", () => {
    const record = TH.boxOf('anthropic_api_key', 'a1')
    const sparse = boxSparseOf(record)
    expect(sparse).to.deep.equal(omit(record, ['box_key_wrapped', 'whisper_ciphered']))
    expect(sparse.sidecar).to.eq(record.sidecar)
    expect(() => { (sparse.sidecar as { note: string }).note = 'changed' }).to.throw(TypeError)
  })
})

describe("BoxStamp", () => {
  it("is every field of the box record but its two ciphered ones, and the vault_tok of its vault, as its example shows", () => {
    const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...visible } = TH.boxOf('anthropic_api_key', 'a1')
    const stamp = BoxStamp.parse({ ...visible, vault_tok: 'vault-tok-u1' })
    expect(Object.keys(stamp)).to.have.members([...Object.keys(visible), 'vault_tok'])
    expect(BoxStamp.safeParse(visible).success, 'a stamp names its vault').to.be.false
    expect(BoxStamp.safeParse({ ...TH.boxOf('anthropic_api_key', 'a1'), vault_tok: 'vault-tok-u1' }).success, 'a stamp holds no ciphertext').to.be.false
  })
})

describe("Box.make", () => {
  it("makes a box whose fields are its own: its scope, what it was made under, and its record's sparse fields, the sidecar parsed, as the class's example shows (Contract: Box)", async () => {
    const record = TH.boxOf('anthropic_api_key', 'a1', { sidecar: { note: 'work account' } })
    const box = boxIn(await vaultOf(), record)
    expect(TH.shownOf(box)).to.deep.equal({
      ...TH.scopeOf('u1'),
      vault_tok:              'vault-tok-u1',
      vault_epoch:            1,
      gate_epoch:             1,
      format:                 'safebyok-box-v8',
      boxlabel:               'anthropic_api_key',
      revision_tok:           'rev-a1',
      whisper_codec:          'json_v1',
      whisper_schema_version: 1,
      sidecar:                { note: 'work account' },
      registered_at:          record.registered_at,
      written_at:             record.written_at,
    })
    expect(box.baseRevisionTok).to.be.null
  })

  it("is made under what it is handed, as its first example shows: the vault_tok a read expected, and the epochs the vault showed", async () => {
    const vault = await vaultOf()
    expect(Box.make(vault, TH.boxOf('anthropic_api_key', 'a1'), vault.madeUnder).vault_tok).to.eq('vault-tok-u1')
    const read = Box.make(vault, TH.boxOf('anthropic_api_key', 'a1'), { ...vault.madeUnder, vault_tok: 'vault-tok-read', gate_epoch: 4 })
    expect(read).to.include({ vault_tok: 'vault-tok-read', gate_epoch: 4 })
  })

  it("refuses a null madeUnder as 'bad_option': a vault always shows what it made a box under", async () => {
    const vault = await vaultOf()
    TH.expectSyncRefusal(() => Box.make(vault, TH.boxOf('anthropic_api_key', 'a1'), null as unknown as VaultSparse), 'bad_option')
  })

  it("refuses a madeUnder missing its scope or epochs as 'bad_option'", async () => {
    const vault = await vaultOf()
    TH.expectSyncRefusal(() => Box.make(vault, TH.boxOf('anthropic_api_key', 'a1'), { vault_tok: 'vault-tok-u1' } as VaultSparse), 'bad_option')
  })

  it("gives the record back whole as record, frozen through, the one source of its fields (Contract: Box)", async () => {
    const record = TH.boxOf('anthropic_api_key', 'a1')
    const box = boxIn(await vaultOf(), record)
    expect(box.record).to.deep.equal(record)
    expect(Object.isFrozen(box.record)).to.be.true
    expect(Object.isFrozen(box.record.box_key_wrapped)).to.be.true
    expect(Object.isFrozen(box.record.whisper_ciphered)).to.be.true
  })

  it("shows each own field once in a key list, a spread, JSON and a log line, and nothing secret: no ciphertext, base or vault, as the class's example shows (Contract: Box)", async () => {
    const box = boxIn(await vaultOf(), TH.boxOf('anthropic_api_key', 'a1'))
    expect(Object.keys(box)).to.deep.equal(OwnFields)
    expect(Object.keys(TH.jsonOf(box))).to.deep.equal(OwnFields)
    expect(TH.jsonOf(box)).to.deep.equal(TH.shownOf(box))
    const told = [JSON.stringify(box), inspect(box)]
    for (const hidden of ['ct-boxkey-a1', 'ct-whisper-a1', 'box_key_wrapped', 'whisper_ciphered', 'baseRevisionTok', 'leaseMillis', 'tryLock']) {
      for (const text of told) { expect(text).to.not.include(hidden) }
    }
    expect(inspect(box).match(/boxlabel/g)).to.have.lengthOf(1)
  })

  it("holds what it was made under as its own fields, frozen with the rest: the vault's scope, vault_tok and epochs, for its demand to judge", async () => {
    const vault = await vaultOf()
    const box = Box.make(vault, TH.boxOf('anthropic_api_key', 'a1'), vault.madeUnder)
    const kept = madeUnderOf(box)
    expect(kept).to.deep.equal(omit(vault.madeUnder, ['format', 'registered_at']))
    for (const ckey of Object.keys(kept)) {
      expect(Object.getOwnPropertyDescriptor(box, ckey)).to.include({ enumerable: true, writable: false, configurable: false })
    }
  })

  it("freezes the box and its sidecar through: nothing a host is handed can be changed", async () => {
    const box = boxIn(await vaultOf(), TH.boxOf('anthropic_api_key', 'a1', { sidecar: { team: { members: ['ana'] } } }))
    expect(Object.isFrozen(box)).to.be.true
    expect(Reflect.set(box, 'boxlabel', 'other')).to.be.false
    expect(Reflect.set(box, 'vault_tok', 'other')).to.be.false
    const sidecar = box.sidecar as { team: { members: string[] } }
    expect(Object.isFrozen(sidecar.team.members)).to.be.true
    expect(() => { sidecar.team.members.push('mallory') }).to.throw(TypeError)
  })

  it("keeps nothing of the caller's record: a change to it afterwards reaches nothing in the box", async () => {
    const record = structuredClone(TH.boxOf('anthropic_api_key', 'a1'))
    const box = boxIn(await vaultOf(), record)
    record.box_key_wrapped.ciphertext_b64 = 'changed'
    record.revision_tok = 'changed'
    expect(box.record.box_key_wrapped.ciphertext_b64).to.eq('ct-boxkey-a1')
    expect(box.revision_tok).to.eq('rev-a1')
  })

  it("holds, spread, every field its BoxSparse holds, and its Boxscope: it passes for both (Contract: Box)", async () => {
    const box = boxIn(await vaultOf(), TH.boxOf('anthropic_api_key', 'a1'))
    expect(TH.shownOf(box)).to.deep.include(boxSparseOf(box.record))
    expect(BoxSparse.strip().parse(box)).to.deep.equal(boxSparseOf(box.record))
    expect(CX.boxscope.parse(box)).to.deep.equal({ ...TH.scopeOf('u1'), boxlabel: 'anthropic_api_key' })
  })

  it("makes a box from a record a VaultDB hands back, as its first example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    valOf(await vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic_api_key', 'a1')))
    const record = valOf(await vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic_api_key', TH.inThisVault))
    if (record === null) { throw new Error('expected a box record') }
    const box = boxIn(await vaultOf(), record)
    expect(box.record).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("refuses what is no box record as 'bad_record', quoting none of it, as its second example shows", async () => {
    const vault = await vaultOf()
    const err = TH.expectSyncRefusal(() => Box.make(vault, { boxlabel: 'anthropic_api_key', revision_tok: Secret } as unknown as BoxRecord, vault.madeUnder), 'bad_record')
    expect(err.message).to.not.include(Secret)
    expect(err.cause).to.be.undefined
  })

  it("refuses a Box of another copy of safebyok as 'bad_record', as it refuses anything that is no box record", async () => {
    const theirs = await otherCopyBox()
    expect(theirs).to.not.be.instanceOf(Box)
    const vault = await vaultOf()
    TH.expectSyncRefusal(() => Box.make(vault, theirs as BoxRecord, vault.madeUnder), 'bad_record')
  })
})

describe("Box.seal", () => {
  it("seals a whisper that opens under the vault's lease, the sidecar given, as its first example shows (Contract: Box)", async () => {
    const vault = await vaultOf()
    const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-fake', vault.making())
    expect(box.sidecar).to.deep.equal({ note: 'work account' })
    expect(box.record.sidecar).to.deep.equal({ note: 'work account' })
    expect(await box.extractWhisper()).to.eq('sk-ant-fake')
  })

  it("stamps the box with the vault as it was at the seal, the lease's vault_tok among it", async () => {
    const { vault, box } = await sealedOf()
    expect(madeUnderOf(box)).to.deep.equal(omit(vault.madeUnder, ['format', 'registered_at']))
    expect(box.vault_tok).to.eq(vault.lease?.vault_tok)
  })

  it("demands madeUnder consistent with the vault it seals in, so a box is never made under another vault, or ahead of it", async () => {
    const vault = await vaultOf()
    const sealUnder = (madeUnder: object) => Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, { madeUnder: madeUnder as never, now: vault.now() })
    await TH.expectRefusal(sealUnder({ ...vault.madeUnder, applabel: 'elsewhere', vaultlabel: 'other' }), 'vault_remade')
    await TH.expectRefusal(sealUnder({ ...vault.madeUnder, vault_tok: 'vault-tok-other' }), 'vault_remade')
    await TH.expectRefusal(sealUnder({ ...vault.madeUnder, vault_epoch: vault.madeUnder.vault_epoch + 7 }), 'gate_moved')
    await TH.expectRefusal(sealUnder({ ...vault.madeUnder, gate_epoch: vault.madeUnder.gate_epoch + 1 }), 'gate_moved')
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
    const one = await Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making())
    const two = await Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making())
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

  it("refuses 'crypto_failed' when WebCrypto fails the cipher, keeping only the error's name (Contract: vault.putBox, Guarantees)", async () => {
    const vault = await vaultOf()
    vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValueOnce(new DOMException('The operation failed for an operation-specific reason', 'OperationError'))
    const err = await TH.expectRefusal(Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making()), 'crypto_failed')
    expect(err.cause).to.be.undefined
    expect(err.message).to.match(/WebCrypto threw OperationError\.$/)
    expect(TH.thrownText(err)).to.not.include(Secret)
  })

  it("stamps written_at, and a new box's registered_at, with the time its vault's clock reads", async () => {
    const { box } = await sealedOf()
    expect(box.written_at).to.eq(T0)
    expect(box.registered_at).to.eq(T0)
  })

  it("carries registered_at forward from its base, and names the base's revision as baseRevisionTok, as its second example shows", async () => {
    const { vaultKey, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const later = await vaultOf(vaultKey, {}, T0 + 1000)
    const next = await Box.seal(later, { boxlabel: box.boxlabel, sidecar: box.sidecar, base: box }, 'sk-ant-NEXT', later.making())
    expect(next.registered_at).to.eq(T0)
    expect(next.written_at).to.eq(T0 + 1000)
    expect(next.sidecar).to.deep.equal({ note: 'work account' })
    expect(next.revision_tok).to.not.eq(box.revision_tok)
    expect(next.baseRevisionTok).to.eq(box.revision_tok)
  })

  it("seals a sidecar left out as {}, carrying nothing from its base but its revision and registered_at", async () => {
    const { vault, box } = await sealedOf(Secret, { sidecar: { note: 'work account' } })
    const next = await Box.seal(vault, { boxlabel: 'anthropic_api_key', base: box }, Secret, vault.making())
    expect(next.sidecar).to.deep.equal({})
  })

  it("takes a listing's entry as its base, as a whole putBox() does: a revision alone, or with registered_at", async () => {
    const { vault } = await sealedOf()
    const damaged = await Box.seal(vault, { boxlabel: 'anthropic_api_key', base: { revision_tok: 'rev-listed' } }, Secret, vault.making())
    expect(damaged).to.include({ baseRevisionTok: 'rev-listed', registered_at: T0 })
    const listed = await Box.seal(vault, { boxlabel: 'anthropic_api_key', base: { revision_tok: 'rev-listed', registered_at: T0 - 5 } }, Secret, vault.making())
    expect(listed.registered_at).to.eq(T0 - 5)
    const fresh = await Box.seal(vault, { boxlabel: 'anthropic_api_key', base: null }, Secret, vault.making())
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
    [{ props: { boxlabel: '' } },                                     'bad_option',   'an empty boxlabel, as SealBoxProps refuses any prop amiss'],
  ] as const

  it("names the prop it refused, quoting none of it", async () => {
    const vault = await vaultOf()
    const err = await TH.expectRefusal(Box.seal(vault, { boxlabel: 'anthropic_api_key', base: { revision_tok: 'r1', registered_at: 'then' } } as unknown as SealBoxProps, Secret, vault.making()), 'bad_option')
    expect(err.message).to.match(/^base\.registered_at: /)
  })

  for (const [given, refusalkind, blurb] of SealRefusals) {
    it(`refuses ${blurb} as '${refusalkind}'`, async () => {
      const vault = await vaultOf()
      const args = { whisper: Secret as unknown, props: {}, ...given }
      const sealing = Box.seal(vault, { boxlabel: 'anthropic_api_key', ...args.props } as SealBoxProps, args.whisper as Whisper, vault.making())
      const err = await TH.expectRefusal(sealing, refusalkind)
      expect(err.message).to.not.include(Secret)
    })
  }

  it("refuses as 'vault_locked' with no lease in hand, or one ended by its vault's clock", async () => {
    const clock = { at: T0 }
    const vault = await TH.leasedSliceOf('u1', await makeVaultKey(), { now: () => clock.at })
    const ending = vault.lease?.ask_passphrase_at ?? 0
    clock.at = ending
    await TH.expectRefusal(Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making()), 'vault_locked')
    vault.lease = null
    clock.at = T0
    await TH.expectRefusal(Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making()), 'vault_locked')
  })

  it("refuses as 'vault_gone' a seal into a vault let go", async () => {
    const vault = await vaultOf()
    vault.gone = true
    await TH.expectRefusal(Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making()), 'vault_gone')
  })

  it("resolves the box as an Outcome's val from trySeal", async () => {
    const vault = await vaultOf()
    const box = await TH.expectGood(Box.trySeal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making()))
    expect(box).to.be.instanceOf(Box)
    await TH.expectBad(Box.trySeal(vault, { boxlabel: '' }, Secret, vault.making()), 'bad_option')
  })

  it("refuses as 'vault_locked' a seal by another copy of safebyok into a vault this copy holds: that copy reads no lease of it", async () => {
    const vault = await vaultOf()
    vi.resetModules()
    const { Box: OtherBox } = await import('../src/box')
    // The refusal is the other copy's VaultError, no instance of this one's: its kind is what holds.
    const sealed = await OtherBox.trySeal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making())
    expect(sealed.ok ? null : sealed.err.refusalkind).to.eq('vault_locked')
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
    expect(await Box.make(vault, record, vault.madeUnder).extractWhisper()).to.eq(Secret)
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
      await TH.expectBad(Box.make(vault, { ...box.record, ...altered }, vault.madeUnder).tryExtractWhisper(), 'damaged_box')
    })
  }

  it("opens a box whose sidecar storage handed back with its keys reordered, as a jsonb column may: the ctx binds its JSON with keys sorted", async () => {
    const { vault, box } = await sealedOf(Secret, { sidecar: { alpha: 1, beta: { delta: 2, gamma: 3 } } })
    const reordered = { beta: { gamma: 3, delta: 2 }, alpha: 1 }
    expect(await Box.make(vault, { ...box.record, sidecar: reordered }, vault.madeUnder).extractWhisper()).to.eq(Secret)
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
      await TH.expectBad(Box.make(there, box.record, there.madeUnder).tryExtractWhisper(), 'damaged_box')
    })
  }

  for (const [moved, refusalkind] of [
    [{ vault_tok: 'vault-tok-reborn' }, 'vault_remade'],
    [{ gate_epoch: 2 },                 'gate_moved'],
  ] as const) {
    it(`refuses as '${refusalkind}' a box made before its vault moved on, opening nothing`, async () => {
      const { vault, box } = await sealedOf()
      vault.madeUnder = { ...vault.madeUnder, ...moved }
      const decipher = vi.spyOn(crypto.subtle, 'decrypt')
      await TH.expectBad(box.tryExtractWhisper(), refusalkind)
      expect(decipher).not.toHaveBeenCalled()
    })
  }

  it("refuses ciphertext swapped in from another box as 'damaged_box' (Contract: box.extractWhisper, Guarantees)", async () => {
    const { vault, box } = await sealedOf()
    const other = await Box.seal(vault, { boxlabel: 'anthropic_api_key' }, 'sk-ant-OTHER', vault.making())
    await TH.expectBad(Box.make(vault, { ...box.record, whisper_ciphered: other.record.whisper_ciphered }, vault.madeUnder).tryExtractWhisper(), 'damaged_box')
    await TH.expectBad(Box.make(vault, { ...box.record, box_key_wrapped: other.record.box_key_wrapped }, vault.madeUnder).tryExtractWhisper(), 'damaged_box')
  })

  it("refuses a box under a vaultKey the vault does not hold as 'damaged_box' (Contract: box.extractWhisper, Refuses)", async () => {
    const { box } = await sealedOf()
    const another = await vaultOf()
    await TH.expectBad(Box.make(another, box.record, another.madeUnder).tryExtractWhisper(), 'damaged_box')
    expect(await box.extractWhisper()).to.eq(Secret)
  })

  it("refuses a box that opens to no whisper as 'damaged_box' (Contract: box.extractWhisper, Refuses)", async () => {
    const vaultKey = await makeVaultKey()
    const vault = await vaultOf(vaultKey)
    for (const plain of ['not json', 'null', '']) {
      const record = await handSealedOf(vault, vaultKey, new TextEncoder().encode(plain))
      const err = await TH.expectBad(Box.make(vault, record, vault.madeUnder).tryExtractWhisper(), 'damaged_box')
      expect(err.message).to.include('not a whisper')
    }
  })

  it("hands back nothing partial on a refusal, and names nothing of the box in it (Contract: box.extractWhisper, Guarantees)", async () => {
    const { vault, box } = await sealedOf(Secret, { sidecar: { note: 'sk-ant-SIDECAR' } })
    const outcome = await Box.make(vault, { ...box.record, written_at: T0 + 1 }, vault.madeUnder).tryExtractWhisper()
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
    const box = await Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making())
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
    const deciphering = vi.spyOn(Lease.prototype, 'tryDecipherWith')
    await box.extractWhisper()
    const bytes = await TH.expectGood(deciphering.mock.results[0]?.value as Promise<Outcome<Uint8Array>>)
    expect([...bytes].every((byte) => byte === 0)).to.be.true
  })
})

describe("the Box try pairs, met by a bug", () => {
  const Pairs: readonly [verb: string, throwing: (vault: TH.LeasedSlice, box: Box) => Promise<unknown>, trying: (vault: TH.LeasedSlice, box: Box) => Promise<Outcome<unknown>>][] = [
    ['Box.seal',           (vault) => Box.seal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making()),  (vault) => Box.trySeal(vault, { boxlabel: 'anthropic_api_key' }, Secret, vault.making())],
    ['box.extractWhisper', (_vault, box) => box.extractWhisper(),                                                  (_vault, box) => box.tryExtractWhisper()],
  ]

  for (const [verb, throwing, trying] of Pairs) {
    it(`${verb} throws a bug met inside as 'unexpected_error', the throw its cause, and its try form resolves it as a bad Outcome of that kind`, async () => {
      const { vault, box } = await sealedOf()
      const bug = new TypeError('the demand is broken')
      vault.demandConsistentWith = () => { throw bug }
      const thrown = await TH.expectRefusal(throwing(vault, box), 'unexpected_error')
      expect(thrown.cause).to.eq(bug)
      const resolved = await TH.expectBad(trying(vault, box), 'unexpected_error')
      expect(resolved.cause).to.eq(bug)
    })

    it(`${verb} passes a VaultError thrown inside through with its kind kept, from both forms`, async () => {
      const { vault, box } = await sealedOf()
      const refusal = new VaultError('not_permitted', 'This test says no.')
      vault.demandConsistentWith = () => { throw refusal }
      expect(await TH.expectRefusal(throwing(vault, box), 'not_permitted')).to.eq(refusal)
      expect(await TH.expectBad(trying(vault, box), 'not_permitted')).to.eq(refusal)
    })
  }
})
// --
