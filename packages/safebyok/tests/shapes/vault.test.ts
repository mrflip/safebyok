import { omit } from 'es-toolkit'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { type GatedVaultRecord, GateRecord, GateSparse, PasskeyWayinSparse, PassphraseWayinSparse, type VaultDraft, VaultFormat, type VaultMadeUnder, VaultRecord, VaultSparse, VaultStamp, VaultTombstone, gateSparseOf, isGated, vaultSparseOf } from '../../src/shapes/vault'
import * as TH from '../test-helpers'

/** An ISO time, as records stored them before every time became epoch milliseconds. */
const OldIso = '2026-10-14T00:00:00.000Z'
const { registered_at: _recordTime, ...recordWithoutTime } = TH.vaultRecordOf('u1')
const { gate: _gate, ...recordWithoutGate } = TH.vaultRecordOf('u1')
const { gate_epoch: _epoch, ...recordWithoutEpoch } = TH.vaultRecordOf('u1')
/** The three fields the vault record held its one passphrase in, before it was a way in. */
const WayinFieldsOfOld = {
  key_deriver_label:            'test_digest_v0',
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- base64 of the literal text 'saltsaltsaltsalt': a fake salt (which is public material anyway), not a credential
  passphrase_salt_b64:          'c2FsdHNhbHRzYWx0c2FsdA',
  vault_key_passphrase_wrapped: TH.fakeCiphered('old'),
}
/** A vault record as this format stored it before its gate was nested: the two wayins flat beside the vault's own fields. */
const flatOf = (record: GatedVaultRecord) => ({ ...omit(record, ['gate']), passphrase: record.gate.passphrase, passkey: record.gate.passkey })

// == [VaultRecord]: the record, the gate, the rule across them, earlier shapes

const VaultRecordCases = [
  // regular usage:
  [TH.vaultRecordOf('u1'),                                         true,   'a whole gated vault record'],
  [TH.gatelessOf('u1'),                                            true,   'a novel vault record: gate_epoch 0, and no gate'],
  // refused, as a damaged or foreign record:
  [{ ...TH.vaultRecordOf('u1'), format: 'safebyok-vault-v7' },     false,  'a format this version does not know'],
  [flatOf(TH.vaultRecordOf('u1')),                                 false,  'a record from before its gate was nested, the wayins flat beside its fields'],
  [{ ...omit(TH.gatelessOf('u1'), ['gate']), passphrase: null, passkey: null }, false, 'a novel record from before its gate was nested, its two slots null, never read as a novel vault'],
  [{ ...TH.vaultRecordOf('u1'), format: 'safebyok-vault-v5', vault_key_epoch: 1 }, false, 'v5 vault record, which carried a vaultKey epoch'],
  [{ ...recordWithoutGate, format: 'safebyok-vault-v4', wayins: [{ ...TH.wayinOf('passphrase'), wayin_id: 'wayin-passphrase', wayinlabel: 'passphrase' }] }, false, 'v4 vault record, its ways in a list'],
  [{ ...TH.vaultRecordOf('u1'), format: 'safebyok-vault-v3' },     false,  'vault record from before the prior vaultKey went'],
  [{ ...TH.vaultRecordOf('u1'), gate_epoch: 0 },                   false,  'a gate at gate_epoch 0'],
  [{ ...TH.gatelessOf('u1'), gate_epoch: 1 },                      false,  'no gate at a later gate_epoch: a gate that lost its ways in'],
  [{ ...TH.vaultRecordOf('u1'), gate_epoch: 1.5 },                 false,  'an epoch that is no whole number'],
  [{ ...TH.gatelessOf('u1'), gate_epoch: -1 },                     false,  'a gate_epoch below 0'],
  [{ ...TH.vaultRecordOf('u1'), vault_tok: '' },                   false,  'an empty vault_tok'],
  [TH.vaultRecordOf('u'.repeat(101)),                              false,  'a user_id over a hundred characters'],
  [{ ...TH.vaultRecordOf('u1'), vaultlabel: null },                false,  'a vaultlabel that is not text'],
  [{ ...TH.vaultRecordOf('u1'), registered_at: 1_792_022_400 },    false,  'a registered_at in epoch seconds'],
  [{ ...TH.vaultRecordOf('u1'), registered_at: Infinity },         false,  'a registered_at that never comes'],
  [{ ...TH.vaultRecordOf('u1'), registered_at: OldIso },           false,  'a registered_at as an ISO string'],
  [recordWithoutTime,                                              false,  'a record missing its registered_at'],
  [recordWithoutGate,                                              false,  'a record that leaves out its gate, rather than saying null'],
  [recordWithoutEpoch,                                             false,  'a record missing its gate_epoch'],
  [{ ...recordWithoutTime, created_at: OldIso, updated_at: OldIso }, false, 'a record from before its time was named registered_at'],
  [{ ...recordWithoutGate, ...WayinFieldsOfOld },                  false,  'vault record from before its passphrase was a way in'],
  [{ ...recordWithoutEpoch, passphrase_epoch: 1 },                 false,  'vault record from before its epoch was named gate_epoch'],
  [{ ...TH.vaultRecordOf('u1'), format: 'safebyok-vault-v1' },     false,  'vault record from before vaultKey epochs'],
  [{ ...TH.vaultRecordOf('u1'), note: 'hello' },                   false,  'a field this version does not know'],
] as const

describe("VaultRecord", () => {
  for (const [candidate, expected, blurb] of VaultRecordCases) {
    it(blurb, () => { expect(VaultRecord.safeParse(candidate).success).to.eq(expected) })
  }

  it("names the field it refuses, where the union of gated and gateless shapes it replaces named none", () => {
    const err = TH.expectSyncRefusal(() => VaultRecord.parse({ ...TH.vaultRecordOf('u1'), vault_tok: '' }), 'bad_record')
    expect(err.message).to.include('vault_tok')
  })

  it("refuses a gate_epoch that disagrees with the gate by naming gate_epoch, saying what the rule is", () => {
    const err = TH.expectSyncRefusal(() => VaultRecord.parse({ ...TH.gatelessOf('u1'), gate_epoch: 3 }), 'bad_record')
    expect(err.message).to.include('gate_epoch').and.include('exactly when its gate is null')
  })

  it("holds both examples its doc block shows: a novel record and a gated one", () => {
    expect(VaultRecord.parse(TH.gatelessOf('u1')).gate).to.be.null
    expect(VaultRecord.parse(TH.vaultRecordOf('u1', { vault_epoch: 3, gate_epoch: 2 })).gate?.passkey).to.be.null
  })
})

const GateCases = [
  // regular usage:
  [{ passkey: null },                                                      true,   'a passphrase and no passkey'],
  [{ passkey: TH.passkeyWayinOf('laptop') },                               true,   'a passphrase and a passkey'],
  // refused, as a damaged or foreign record:
  [{ passphrase: null },                                                   false,  'no passphrase at all'],
  [{ passkey: [TH.passkeyWayinOf('laptop'), TH.passkeyWayinOf('phone')] }, false,  'a list of passkeys where there is room for one'],
  [{ passphrase: TH.passkeyWayinOf('laptop') },                            false,  'a passkey in the passphrase slot'],
  [{ passkey: TH.wayinOf('passphrase') },                                  false,  'a passphrase in the passkey slot'],
  [{ passphrase: TH.wayinOf('passphrase', { wayinkind: 'fingerprint' as never }) }, false, 'a wayinkind this version does not know'],
  [{ passphrase: TH.wayinOf('passphrase', { wayinkind: 'passkey' as never }) },     false, "a passphrase's fields under the passkey wayinkind"],
  [{ passkey: TH.passkeyWayinOf('laptop', { credential_id: '' }) },        false,  'a passkey with an empty credential_id'],
  [{ passkey: TH.passkeyWayinOf('laptop', { prf_salt_b64: '' as never }) },         false,  'a passkey with an empty salt'],
  [{ passphrase: TH.wayinOf('passphrase', { salt_b64: '' as never }) },             false,  'an empty salt'],
  [{ passphrase: TH.wayinOf('passphrase', { device_id: '' }) },            false,  'an empty device_id'],
  [{ passphrase: TH.wayinOf('passphrase', { vault_key_wayin_wrapped: { cipher_iv_b64: 'iv' } as never }) }, false, 'a passphrase missing its ciphertext'],
  [{ passkey: TH.passkeyWayinOf('laptop', { registered_at: 1_792_022_400 }) }, false, 'a registered_at in epoch seconds'],
  [{ gate_epoch: 1 },                                                      false,  'a gate holding its epoch, which rides beside it in the vault record'],
] as const

describe("GateRecord, as a vault record's gate", () => {
  for (const [changes, expected, blurb] of GateCases) {
    it(blurb, () => {
      const gate = { ...TH.gateOf('u1'), ...changes }
      expect(GateRecord.safeParse(gate).success).to.eq(expected)
      expect(VaultRecord.safeParse(TH.vaultRecordOf('u1', { gate: gate as never })).success).to.eq(expected)
    })
  }

  it("refuses a gate with no passkey field: a gate without one says so with null", () => {
    const { passkey: _passkey, ...gateWithoutPasskey } = TH.gateOf('u1')
    expect(GateRecord.safeParse(gateWithoutPasskey).success).to.be.false
  })
})
// --

// == [Shapes]: VaultSparse, VaultStamp, VaultTombstone, GateSparse, PassphraseWayinSparse, PasskeyWayinSparse

describe("the vault record's shapes", () => {
  const record = TH.vaultRecordOf('u1', { gate: TH.gateOf('u1', { passkey: TH.passkeyWayinOf('laptop') }) })

  it("makes VaultSparse the record without its gate, as its example shows", () => {
    const sparse = VaultSparse.parse(omit(record, ['gate']))
    expect(Object.keys(sparse)).to.have.members(['format', 'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'registered_at', 'vault_epoch', 'gate_epoch'])
    expect(VaultSparse.safeParse(record).success).to.be.false
  })

  it("makes VaultStamp the six fields fixed for the vault's life, never an epoch, as its example shows", () => {
    const stamp = VaultStamp.parse(omit(record, ['gate', 'vault_epoch', 'gate_epoch']))
    expect(Object.keys(stamp)).to.have.members(['format', 'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'registered_at'])
  })

  it("makes VaultTombstone the format, the scope and a vault_epoch of 1 or more, as its example shows", () => {
    const tombstone = { format: 'safebyok-tombstone-v1', ...TH.scopeOf('u1'), vault_epoch: 4 }
    expect(VaultTombstone.parse(tombstone)).to.deep.equal(tombstone)
    expect(VaultTombstone.safeParse({ ...tombstone, vault_epoch: 0 }).success).to.be.false
    expect(VaultTombstone.safeParse({ ...tombstone, vault_tok: 'vault-tok-u1' }).success).to.be.false
  })

  it("keeps a passphrase's salt, key deriver and wrap out of its sparse shape, and a passkey's wrap out of its", () => {
    const { passphrase, passkey } = record.gate
    const passphraseSparse = PassphraseWayinSparse.parse(omit(passphrase, ['salt_b64', 'key_deriver_label', 'vault_key_wayin_wrapped']))
    expect(Object.keys(passphraseSparse)).to.have.members(['wayinkind', 'device_id', 'registered_at'])
    expect(PassphraseWayinSparse.safeParse(omit(passphrase, ['vault_key_wayin_wrapped'])).success).to.be.false
    const passkeySparse = PasskeyWayinSparse.parse(omit(passkey ?? TH.passkeyWayinOf('laptop'), ['vault_key_wayin_wrapped']))
    expect(Object.keys(passkeySparse)).to.have.members(['wayinkind', 'credential_id', 'prf_salt_b64', 'device_id', 'registered_at'])
  })

  it("nests each wayin's sparse shape in GateSparse, as the gate nests its wayins", () => {
    const sparse = {
      passphrase: omit(record.gate.passphrase, ['salt_b64', 'key_deriver_label', 'vault_key_wayin_wrapped']),
      passkey:    omit(record.gate.passkey ?? TH.passkeyWayinOf('laptop'), ['vault_key_wayin_wrapped']),
    }
    expect(GateSparse.parse(sparse)).to.deep.equal(sparse)
    expect(GateSparse.safeParse({ ...sparse, passkey: null }).success).to.be.true
    expect(GateSparse.safeParse(record.gate).success).to.be.false
  })
})
// --

// == [isGated]

describe("isGated", () => {
  it("is true for a gated vault record and false for a novel one, as its example tells them apart", () => {
    expect(isGated(TH.vaultRecordOf('u1'))).to.be.true
    expect(isGated(TH.gatelessOf('u1'))).to.be.false
  })

  it("names the format every vault record carries", () => {
    expect(TH.vaultRecordOf('u1').format).to.eq(VaultFormat)
  })
})
// --

// == [vaultSparseOf, and the named record types]

describe("vaultSparseOf", () => {
  it("is the record without its gate, frozen, as its example shows", () => {
    const record = TH.vaultRecordOf('u1')
    const sparse = vaultSparseOf(record)
    expect(sparse.gate_epoch).to.eq(record.gate_epoch)
    expect(sparse).to.not.have.property('gate')
    expect(sparse).to.deep.equal(VaultSparse.parse(omit(record, ['gate'])))
    expect(Object.isFrozen(sparse)).to.be.true
  })
})

describe("gateSparseOf", () => {
  it("is the gate with each wayin's sparse shape, frozen through, with no salt, key deriver label or wrap, as its example shows", () => {
    const gate = TH.gateOf('u1', { passkey: TH.passkeyWayinOf('laptop') })
    const sparse = gateSparseOf(gate)
    expect(sparse.passphrase).to.deep.equal({ wayinkind: 'passphrase', device_id: gate.passphrase.device_id, registered_at: gate.passphrase.registered_at })
    expect(sparse).to.deep.equal(GateSparse.parse(sparse))
    const laptop = TH.passkeyWayinOf('laptop')
    expect(sparse.passkey).to.deep.equal(PasskeyWayinSparse.parse(omit(laptop, ['vault_key_wayin_wrapped'])))
    for (const part of [sparse, sparse.passphrase, sparse.passkey]) {
      expect(Object.isFrozen(part)).to.be.true
    }
  })

  it("shows a gate with no passkey as a null passkey", () => {
    const sparse = gateSparseOf(TH.gateOf('u1'))
    expect(sparse.passkey).to.be.null
    expect(Object.keys(sparse.passphrase)).to.have.members(['wayinkind', 'device_id', 'registered_at'])
  })
})

describe("the named vault record types", () => {
  it("names a gated record GatedVaultRecord, and a novel draft VaultDraft, as its example shows", () => {
    expectTypeOf(TH.vaultRecordOf('u1')).toExtend<GatedVaultRecord>()
    expectTypeOf(TH.gatelessOf('u1')).toExtend<VaultDraft>()
    expect(VaultRecord.safeParse(TH.gatelessOf('u1')).success).to.be.true
  })

  it("takes a vault_tok and whichever of the scope and epochs a thing carries as VaultMadeUnder, as its example shows, a box's own format and times beside them", () => {
    expectTypeOf({ vault_tok: 'vault-tok-u1', gate_epoch: 1 }).toExtend<VaultMadeUnder>()
    expectTypeOf({ format: 'safebyok-box-v8', vault_tok: 'vault-tok-u1', registered_at: 1 }).toExtend<VaultMadeUnder>()
    expectTypeOf({ gate_epoch: 1 }).not.toExtend<VaultMadeUnder>()
  })
})
// --
