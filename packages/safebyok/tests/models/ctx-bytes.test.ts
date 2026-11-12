/** What each wrap and cipher is bound to, byte for byte, and that a change to any field of a stamp keeps it shut. */

import { hex } from '@scure/base'
import { describe, expect, it, vi } from 'vitest'
import { type CipherCtxRecord, cipherCtx, decipherBytes, deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, unwrapKeyUnder } from '../../src/helpers/crypto'
import { Lease } from '../../src/models/lease'
import { wayinCtxOf } from '../../src/models/wayin'
import { type BankStamp, type LeaseRecord, LeaseFormat, passphraseCleartext } from '../../src/shapes/shapes-gateish'
import * as TH from '../test-helpers'
import { GrantedAs, T0, TestPassphrase, WorldBankStamp, WorldGate, WorldGateStamp, WorldVaultStamp, builtGateOf, fakeLeaseFriendOf, passkeyAnswerOf, sealStampOf, useFakeClock } from '../test-helpers/proving-world'
import { makeBornVault, useVaultWorlds } from '../test-helpers/vault-world'

useFakeClock()
useVaultWorlds()

// The literals below are the UTF-8 text of each ctx's JSON: a rename of a stored field moves them on purpose, and nothing else should.

function textBytes(text: string): Uint8Array { return new TextEncoder().encode(text) }

const WhisperText = '{"val":"sk-test-0000"}'

/** The JSON text of {@link WorldBankStamp}, as every ctx under the bank holds it first: its keys sorted. */
const BankStampText = `{"bank_tok":"bank-tok-u1","banklabel":"acme","registered_at":${String(T0)},"user_id":"u1"}`

/** The JSON text of {@link WorldGateStamp}, as each wayin's ctx holds it after the bank's. */
const GateStampText = `{"banklabel":"acme","gate_tok":"gate-tok-u1","gatelabel":"main","registered_at":${String(T0)},"user_id":"u1"}`

const BankStampFields = ['user_id', 'banklabel', 'bank_tok', 'registered_at'] as const
const GateStampFields = ['user_id', 'banklabel', 'gatelabel', 'gate_tok', 'registered_at'] as const
const VaultStampFields = ['user_id', 'banklabel', 'vaultlabel', 'vault_tok', 'registered_at'] as const
const LeaseStampFields = ['fmt', ...BankStampFields, 'gatelabel', 'gate_tok', 'gate_revision_tok', 'proved_at', 'wayinkind'] as const
const BoxStampFields = ['user_id', 'banklabel', 'vaultlabel', 'boxlabel', 'fmt', 'bank_tok', 'vault_tok', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'box_tok', 'whisper_codec', 'whisper_schema_version'] as const

/** The stamps a box hands a seal when no real vault is wanted: {@link WorldVaultStamp}, then a box's. */
const SealStamps = [WorldVaultStamp, sealStampOf('anthropic')] as const

/** A lease of the bank `overrides` moves {@link WorldBankStamp} to, over a vaultKey the test holds, its record cached on the friend. */
async function leaseOver(vaultKey: CryptoKey, overrides: Partial<BankStamp> = {}) {
  const friend = fakeLeaseFriendOf(overrides)
  const lease = await Lease.buildGranted(friend, vaultKey, GrantedAs)
  await lease.cacheAsCacheCan()
  return { lease, record: friend.cached as LeaseRecord }
}

/** The stamps a real vault binds a real box to, as its put hands the lease: the vault's, then the box's. */
async function realBoxStamps(): Promise<readonly [CipherCtxRecord, CipherCtxRecord]> {
  const seal = vi.spyOn(Lease.prototype, 'sealWith')
  const { vault } = await makeBornVault()
  await vault.putBox({ boxlabel: 'anthropic', whisper: { apiKey: 'sk-test-0000' }, sidecar: { label: 'work account' } })
  const [, stamps] = seal.mock.calls.at(-1)!
  seal.mockRestore()
  expect(stamps).to.have.length(2)
  return [stamps[0]!, stamps[1]!]
}

/** Whether a gate's passphrase wayin opens under the ctx of the stamps `bank` and `gateStamp`, built field for field without a check. */
async function passphraseWayinOpens(bank: CipherCtxRecord, gateStamp: CipherCtxRecord): Promise<boolean> {
  const { gate } = await builtGateOf()
  const { vault_key_wayin_wrapped: wrapped, ...header } = gate.wayins.main
  const wayinKey = await importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes(passphraseCleartext.parse(TestPassphrase), fromB64(header.salt_b64)))
  const ctx = cipherCtx([bank, gateStamp], 'vault_key_passphrase_wrapped', header)
  try {
    await unwrapKeyUnder(wayinKey, wrapped, ctx, { extractable: false, usage: ['wrapKey'] })
    return true
  } catch { return false }
}

/** `val` changed, keeping its type: a number one more, a string with a letter added. */
function changed(val: unknown): unknown { return ((typeof val === 'number') ? val + 1 : `${String(val)}x`) }

describe("each ctx, byte for byte", () => {
  it("encodes a list of stamps, a purpose and a header, each record's keys sorted", () => {
    const ctx = cipherCtx([{ vault_tok: 'vid', banklabel: 'acme' }, { written_at: 2, boxlabel: 'anthropic', revision_tok: 'r1' }], 'whisper_ciphered', { wayinkind: 'passkey' })
    expect(new TextDecoder().decode(ctx)).to.eq('[{"banklabel":"acme","vault_tok":"vid"},{"boxlabel":"anthropic","revision_tok":"r1","written_at":2},"whisper_ciphered",{"wayinkind":"passkey"}]')
    expect(hex.encode(ctx)).to.eq('5b7b2262616e6b6c6162656c223a2261636d65222c227661756c745f746f6b223a22766964227d2c7b22626f786c6162656c223a22616e7468726f706963222c227265766973696f6e5f746f6b223a227231222c227772697474656e5f6174223a327d2c22776869737065725f6369706865726564222c7b22776179696e6b696e64223a22706173736b6579227d5d')
  })

  it("binds a passphrase wayin's wrap to the bank's stamp, the gate's, the purpose and its whole header", async () => {
    const { gate } = await builtGateOf()
    const wayin = gate.wayins.main
    const ctx = textBytes(`[${BankStampText},${GateStampText},"vault_key_passphrase_wrapped",{"device_tok":"${wayin.device_tok}","key_deriver_label":"${wayin.key_deriver_label}","registered_at":${String(wayin.registered_at)},"salt_b64":"${wayin.salt_b64}","wayinkind":"passphrase","wayinlabel":"main"}]`)
    const wayinKey = await importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes(passphraseCleartext.parse(TestPassphrase), fromB64(wayin.salt_b64)))
    expect(await unwrapKeyUnder(wayinKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("binds a passkey wayin's wrap and its key to the bank's stamp, the gate's, the purpose and its whole header", async () => {
    const answer = passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const { gate } = await builtGateOf(answer)
    const wayin = gate.wayins.passkey0!
    const ctx = textBytes(`[${BankStampText},${GateStampText},"vault_key_passkey_wrapped",{"credential_id":"${wayin.credential_id}","device_tok":"${wayin.device_tok}","prf_salt_b64":"${wayin.prf_salt_b64}","registered_at":${String(wayin.registered_at)},"wayinkind":"passkey","wayinlabel":"passkey0"}]`)
    const passkeyKey = await deriveWrappingKey(prfBytes, ctx)
    expect(await unwrapKeyUnder(passkeyKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("binds a lease's wrap of the vaultKey to the bank's stamp and its own", async () => {
    const { record } = await leaseOver(await makeVaultKey())
    const leaseText = `{"bank_tok":"bank-tok-u1","banklabel":"acme","fmt":${String(LeaseFormat)},"gate_revision_tok":"${WorldGate.revision_tok}","gate_tok":"gate-tok-u1","gatelabel":"main","proved_at":${String(T0)},"registered_at":${String(T0)},"user_id":"u1","wayinkind":"passphrase"}`
    const ctx = textBytes(`[${BankStampText},${leaseText},"vault_key_lease_wrapped"]`)
    expect(await unwrapKeyUnder(record.lease_key, record.vault_key_lease_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("binds each of a box's two seals to the bank's stamp, the vault's, the box's and its own purpose", async () => {
    const stamps = await realBoxStamps()
    const [vaultStamp, boxStamp] = stamps
    const vaultKey = await makeVaultKey()
    const { lease } = await leaseOver(vaultKey)
    const sealed = await lease.sealWith(WhisperText, stamps)
    function field(fieldname: string): string { return JSON.stringify(boxStamp[fieldname]) }
    expect(boxStamp).to.not.have.property('sidecar')
    const vaultText = `{"banklabel":"acme","registered_at":${JSON.stringify(vaultStamp['registered_at'])},"user_id":"u1","vault_tok":${JSON.stringify(vaultStamp['vault_tok'])},"vaultlabel":"main"}`
    const boxText = `{"am":${field('am')},"bank_tok":${field('bank_tok')},"banklabel":${field('banklabel')},"box_tok":${field('box_tok')},"boxlabel":"anthropic","fmt":${field('fmt')},"registered_at":${field('registered_at')},"revision_seq":${field('revision_seq')},"revision_tok":${field('revision_tok')},"user_id":${field('user_id')},"vault_tok":${field('vault_tok')},"vaultlabel":${field('vaultlabel')},"whisper_codec":"json_v1","whisper_schema_version":1,"written_at":${field('written_at')}}`
    const boxKey = await unwrapKeyUnder(vaultKey, sealed.box_key_wrapped, textBytes(`[${BankStampText},${vaultText},${boxText},"box_key_wrapped"]`), { extractable: false, usage: ['decrypt'] })
    const opened = await decipherBytes(boxKey, sealed.whisper_ciphered, textBytes(`[${BankStampText},${vaultText},${boxText},"whisper_ciphered"]`))
    expect(new TextDecoder().decode(opened)).to.eq(WhisperText)
  })
})

describe("each ctx binds every field of its stamps", () => {
  it("names every field of a real vault's and a real box's stamps below: a field a stamp gains fails here until it is listed", async () => {
    const [vaultStamp, boxStamp] = await realBoxStamps()
    expect(Object.keys(vaultStamp)).to.have.members([...VaultStampFields])
    expect(Object.keys(boxStamp).filter((fieldname) => fieldname !== 'am')).to.have.members([...BoxStampFields])
  })

  it("names every field of a lease's stamp below", async () => {
    const { record } = await leaseOver(await makeVaultKey())
    expect(Object.keys(record).filter((fieldname) => (fieldname !== 'lease_key') && (fieldname !== 'vault_key_lease_wrapped'))).to.have.members([...LeaseStampFields])
  })

  it("names every field of a bank's and a gate's stamps below", () => {
    expect(Object.keys(WorldBankStamp)).to.have.members([...BankStampFields])
    expect(Object.keys(WorldGateStamp)).to.have.members([...GateStampFields])
  })

  for (const fieldname of BoxStampFields) {
    it(`keeps a box shut under a box stamp with another ${fieldname}`, async () => {
      const [vaultStamp, boxStamp] = await realBoxStamps()
      const { lease } = await leaseOver(await makeVaultKey())
      const sealed = await lease.sealWith(WhisperText, [vaultStamp, boxStamp])
      await TH.expectRefusal(lease.unsealWith(sealed, [vaultStamp, { ...boxStamp, [fieldname]: changed(boxStamp[fieldname]) as string }]), 'damaged_whisper')
    })
  }

  for (const fieldname of VaultStampFields) {
    it(`keeps a box shut under a vault stamp with another ${fieldname}`, async () => {
      const [vaultStamp, boxStamp] = SealStamps
      const { lease } = await leaseOver(await makeVaultKey())
      const sealed = await lease.sealWith(WhisperText, SealStamps)
      await TH.expectRefusal(lease.unsealWith(sealed, [{ ...vaultStamp, [fieldname]: changed(vaultStamp[fieldname]) as string }, boxStamp]), 'damaged_whisper')
    })
  }

  for (const fieldname of BankStampFields) {
    it(`keeps a box shut under a lease of the same vaultKey whose bank has another ${fieldname}`, async () => {
      const vaultKey = await makeVaultKey()
      const { lease } = await leaseOver(vaultKey)
      const sealed = await lease.sealWith(WhisperText, SealStamps)
      const { lease: other } = await leaseOver(vaultKey, { [fieldname]: changed(WorldBankStamp[fieldname]) })
      await TH.expectRefusal(other.unsealWith(sealed, SealStamps), 'damaged_whisper')
    })

    it(`keeps a wayin shut under a bank stamp with another ${fieldname}`, async () => {
      expect(await passphraseWayinOpens(WorldBankStamp, WorldGateStamp)).to.be.true
      expect(await passphraseWayinOpens({ ...WorldBankStamp, [fieldname]: changed(WorldBankStamp[fieldname]) as string }, WorldGateStamp)).to.be.false
    })

    it(`keeps a lease shut under a bank stamp with another ${fieldname}`, async () => {
      const { record } = await leaseOver(await makeVaultKey())
      const { lease_key, vault_key_lease_wrapped, ...stamp } = record
      const ctx = cipherCtx([{ ...WorldBankStamp, [fieldname]: changed(WorldBankStamp[fieldname]) as string }, stamp], 'vault_key_lease_wrapped')
      await expect(unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).rejects.toThrow()
    })
  }

  for (const fieldname of GateStampFields) {
    it(`keeps a wayin shut under a gate stamp with another ${fieldname}`, async () => {
      expect(await passphraseWayinOpens(WorldBankStamp, { ...WorldGateStamp, [fieldname]: changed(WorldGateStamp[fieldname]) as string })).to.be.false
    })
  }

  for (const fieldname of LeaseStampFields) {
    it(`keeps a lease shut under a lease stamp with another ${fieldname}`, async () => {
      const { record } = await leaseOver(await makeVaultKey())
      const { lease_key, vault_key_lease_wrapped, ...stamp } = record
      const ctx = cipherCtx([WorldBankStamp, { ...stamp, [fieldname]: changed(stamp[fieldname]) as string }], 'vault_key_lease_wrapped')
      await expect(unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).rejects.toThrow()
    })
  }

  it("gives a box's two purposes different ctxs", () => {
    const stamps = [WorldBankStamp, ...SealStamps]
    expect(hex.encode(cipherCtx(stamps, 'box_key_wrapped'))).to.not.eq(hex.encode(cipherCtx(stamps, 'whisper_ciphered')))
  })

  const BadHeaderCases = [
    [{ wayinkind: 'telepathy' }, 'of an unknown kind'],
    [{ wayinlabel: 'passkey0' }, "under the other kind's wayinlabel"],
    [{ wayinlabel: undefined },  'with no wayinlabel'],
  ] as const

  for (const [altered, blurb] of BadHeaderCases) {
    it(`refuses a wayin header ${blurb} before any ctx is made`, async () => {
      const { gate } = await builtGateOf()
      const { vault_key_wayin_wrapped: _wrapped, ...header } = gate.wayins.main
      TH.expectSyncRefusal(() => wayinCtxOf(WorldBankStamp, WorldGateStamp, { ...header, ...altered } as never), 'bad_record')
    })
  }
})
