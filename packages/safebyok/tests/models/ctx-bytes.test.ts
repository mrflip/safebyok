/** What each wrap and cipher is bound to, byte for byte, and that a change to any field of a stamp keeps it shut. */

import { hex } from '@scure/base'
import { describe, expect, it, vi } from 'vitest'
import { type CipherCtxRecord, cipherBytes, cipherCtx, decipherBytes, deriveWrappingKey, fromB64, importWrappingKeyBytes, makeBoxKey, makeVaultKey, unwrapKeyUnder } from '../../src/helpers/crypto'
import { Lease } from '../../src/models/lease'
import { wayinCtxOf } from '../../src/models/wayin'
import { type LeaseRecord, LeaseFormat, passphraseCleartext } from '../../src/shapes/shapes-gateish'
import * as TH from '../test-helpers'
import { GrantedAs, T0, TestPassphrase, WorldStamp, builtGateOf, fakeLeaseFriendOf, passkeyAnswerOf, useFakeClock } from '../test-helpers/proving-world'
import { makeBornVault, useVaultWorlds } from '../test-helpers/vault-world'

useFakeClock()
useVaultWorlds()

// The literals below are the UTF-8 text of each ctx's JSON: a rename of a stored field moves them on purpose, and nothing else should.

function textBytes(text: string): Uint8Array { return new TextEncoder().encode(text) }

const WhisperText = '{"val":"sk-test-0000"}'

/** The JSON text of {@link WorldStamp}, as every ctx under the vault holds it: its keys sorted. */
const VaultStampText = `{"banklabel":"acme","registered_at":${String(T0)},"user_id":"u1","vault_tok":"vault-tok-u1","vaultlabel":"main"}`

const VaultStampFields = ['user_id', 'banklabel', 'vaultlabel', 'vault_tok', 'registered_at'] as const
const LeaseStampFields = ['fmt', ...VaultStampFields, 'gate_epoch', 'proved_at', 'wayinkind'] as const
const BoxStampFields = ['user_id', 'banklabel', 'vaultlabel', 'boxlabel', 'fmt', 'vault_tok', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'box_tok', 'whisper_codec', 'whisper_schema_version'] as const

/** A lease of `stamp`'s vault over a vaultKey the test holds, its record cached on the friend. */
async function leaseOver(vaultKey: CryptoKey, overrides: Partial<typeof WorldStamp> = {}) {
  const friend = fakeLeaseFriendOf(overrides)
  const lease = await Lease.buildGranted(friend, vaultKey, GrantedAs)
  await lease.cacheAsCacheCan()
  return { lease, record: friend.cached as LeaseRecord }
}

/** The stamp a real vault binds a real box to, as its put hands the lease. */
async function realBoxStamp(): Promise<CipherCtxRecord> {
  const seal = vi.spyOn(Lease.prototype, 'sealWith')
  const { vault } = await makeBornVault()
  await vault.putBox({ boxlabel: 'anthropic', whisper: { apiKey: 'sk-test-0000' }, sidecar: { label: 'work account' } })
  const [, stamp] = seal.mock.calls.at(-1)!
  seal.mockRestore()
  return stamp
}

/** `val` changed, keeping its type: a number one more, a string with a letter added. */
function changed(val: unknown): unknown { return ((typeof val === 'number') ? val + 1 : `${String(val)}x`) }

describe("each ctx, byte for byte", () => {
  it("encodes a list of stamps, a purpose and a header, each record's keys sorted", () => {
    const ctx = cipherCtx([{ vault_tok: 'vid', banklabel: 'acme' }, { written_at: 2, boxlabel: 'anthropic', revision_tok: 'r1' }], 'whisper_ciphered', { wayinkind: 'passkey' })
    expect(new TextDecoder().decode(ctx)).to.eq('[{"banklabel":"acme","vault_tok":"vid"},{"boxlabel":"anthropic","revision_tok":"r1","written_at":2},"whisper_ciphered",{"wayinkind":"passkey"}]')
    expect(hex.encode(ctx)).to.eq('5b7b2262616e6b6c6162656c223a2261636d65222c227661756c745f746f6b223a22766964227d2c7b22626f786c6162656c223a22616e7468726f706963222c227265766973696f6e5f746f6b223a227231222c227772697474656e5f6174223a327d2c22776869737065725f6369706865726564222c7b22776179696e6b696e64223a22706173736b6579227d5d')
  })

  it("binds a passphrase wayin's wrap to the vault's stamp, the purpose and its whole header", async () => {
    const { gate } = await builtGateOf()
    const wayin = gate.pickle().passphrase_wayin
    const ctx = textBytes(`[${VaultStampText},"vault_key_passphrase_wrapped",{"device_id":"${wayin.device_id}","key_deriver_label":"${wayin.key_deriver_label}","registered_at":${String(wayin.registered_at)},"salt_b64":"${wayin.salt_b64}","wayinkind":"passphrase"}]`)
    const wayinKey = await importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes(passphraseCleartext.parse(TestPassphrase), fromB64(wayin.salt_b64)))
    expect(await unwrapKeyUnder(wayinKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("binds a passkey wayin's wrap and its key to the vault's stamp, the purpose and its whole header", async () => {
    const answer = passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const { gate } = await builtGateOf(answer)
    const wayin = gate.pickle().passkey_wayin!
    const ctx = textBytes(`[${VaultStampText},"vault_key_passkey_wrapped",{"credential_id":"${wayin.credential_id}","device_id":"${wayin.device_id}","prf_salt_b64":"${wayin.prf_salt_b64}","registered_at":${String(wayin.registered_at)},"wayinkind":"passkey"}]`)
    const passkeyKey = await deriveWrappingKey(prfBytes, ctx)
    expect(await unwrapKeyUnder(passkeyKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("binds a lease's wrap of the vaultKey to the vault's stamp and its own", async () => {
    const { record } = await leaseOver(await makeVaultKey())
    const leaseText = `{"banklabel":"acme","fmt":${String(LeaseFormat)},"gate_epoch":${String(GrantedAs.gate_epoch)},"proved_at":${String(T0)},"registered_at":${String(T0)},"user_id":"u1","vault_tok":"vault-tok-u1","vaultlabel":"main","wayinkind":"passphrase"}`
    const ctx = textBytes(`[${VaultStampText},${leaseText},"vault_key_lease_wrapped"]`)
    expect(await unwrapKeyUnder(record.lease_key, record.vault_key_lease_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
  })

  it("binds each of a box's two seals to the vault's stamp, the box's stamp and its own purpose", async () => {
    const stamp = await realBoxStamp()
    const vaultKey = await makeVaultKey()
    const { lease } = await leaseOver(vaultKey)
    const sealed = await lease.sealWith(WhisperText, stamp)
    function field(fieldname: string): string { return JSON.stringify(stamp[fieldname]) }
    expect(stamp).to.not.have.property('sidecar')
    const boxText = `{"am":${field('am')},"banklabel":${field('banklabel')},"box_tok":${field('box_tok')},"boxlabel":"anthropic","fmt":${field('fmt')},"registered_at":${field('registered_at')},"revision_seq":${field('revision_seq')},"revision_tok":${field('revision_tok')},"user_id":${field('user_id')},"vault_tok":${field('vault_tok')},"vaultlabel":${field('vaultlabel')},"whisper_codec":"json_v1","whisper_schema_version":1,"written_at":${field('written_at')}}`
    const boxKey = await unwrapKeyUnder(vaultKey, sealed.box_key_wrapped, textBytes(`[${VaultStampText},${boxText},"box_key_wrapped"]`), { extractable: false, usage: ['decrypt'] })
    const opened = await decipherBytes(boxKey, sealed.whisper_ciphered, textBytes(`[${VaultStampText},${boxText},"whisper_ciphered"]`))
    expect(new TextDecoder().decode(opened)).to.eq(WhisperText)
  })
})

describe("each ctx binds every field of its stamps", () => {
  it("names every field of a real box's stamp below: a field a stamp gains fails here until it is listed", async () => {
    expect(Object.keys(await realBoxStamp()).filter((fieldname) => fieldname !== 'am')).to.have.members([...BoxStampFields])
  })

  it("names every field of a lease's stamp below", async () => {
    const { record } = await leaseOver(await makeVaultKey())
    expect(Object.keys(record).filter((fieldname) => (fieldname !== 'lease_key') && (fieldname !== 'vault_key_lease_wrapped'))).to.have.members([...LeaseStampFields])
  })

  for (const fieldname of BoxStampFields) {
    it(`keeps a box shut under a box stamp with another ${fieldname}`, async () => {
      const stamp = await realBoxStamp()
      const { lease } = await leaseOver(await makeVaultKey())
      const sealed = await lease.sealWith(WhisperText, stamp)
      await TH.expectRefusal(lease.unsealWith(sealed, { ...stamp, [fieldname]: changed(stamp[fieldname]) as string }), 'damaged_whisper')
    })
  }

  for (const fieldname of VaultStampFields) {
    it(`keeps a box shut under a lease of the same vaultKey whose vault has another ${fieldname}`, async () => {
      const stamp = await realBoxStamp()
      const vaultKey = await makeVaultKey()
      const { lease } = await leaseOver(vaultKey)
      const sealed = await lease.sealWith(WhisperText, stamp)
      const { lease: other } = await leaseOver(vaultKey, { [fieldname]: changed(WorldStamp[fieldname]) })
      await TH.expectRefusal(other.unsealWith(sealed, stamp), 'damaged_whisper')
    })

    it(`keeps a wayin shut under a vault stamp with another ${fieldname}`, async () => {
      const { gate } = await builtGateOf()
      const { vault_key_wayin_wrapped: _wrapped, ...header } = gate.pickle().passphrase_wayin
      await expectSealedApart(wayinCtxOf(WorldStamp, header), wayinCtxOf({ ...WorldStamp, [fieldname]: changed(WorldStamp[fieldname]) }, header))
    })
  }

  for (const fieldname of LeaseStampFields) {
    it(`keeps a lease shut under a lease stamp with another ${fieldname}`, async () => {
      const { record } = await leaseOver(await makeVaultKey())
      const { lease_key, vault_key_lease_wrapped, ...stamp } = record
      const ctx = cipherCtx([WorldStamp, { ...stamp, [fieldname]: changed(stamp[fieldname]) as string }], 'vault_key_lease_wrapped')
      await expect(unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).rejects.toThrow()
    })
  }

  for (const fieldname of VaultStampFields) {
    it(`keeps a lease shut under a vault stamp with another ${fieldname}`, async () => {
      const { record } = await leaseOver(await makeVaultKey())
      const { lease_key, vault_key_lease_wrapped, ...stamp } = record
      const ctx = cipherCtx([{ ...WorldStamp, [fieldname]: changed(WorldStamp[fieldname]) }, stamp], 'vault_key_lease_wrapped')
      await expect(unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).rejects.toThrow()
    })
  }

  it("gives a box's two purposes different ctxs", () => {
    const stamp = { boxlabel: 'anthropic' }
    expect(hex.encode(cipherCtx([WorldStamp, stamp], 'box_key_wrapped'))).to.not.eq(hex.encode(cipherCtx([WorldStamp, stamp], 'whisper_ciphered')))
  })

  it("refuses a wayin header of an unknown kind before any ctx is made", async () => {
    const { gate } = await builtGateOf()
    const { vault_key_wayin_wrapped: _wrapped, ...header } = gate.pickle().passphrase_wayin
    TH.expectSyncRefusal(() => wayinCtxOf(WorldStamp, { ...header, wayinkind: 'telepathy' } as never), 'bad_record')
  })
})

/** Fails unless what is sealed under `ctx` will not open under `other`. */
async function expectSealedApart(ctx: Uint8Array, other: Uint8Array): Promise<void> {
  const cipherKey = await makeBoxKey()
  const sealed = await cipherBytes(cipherKey, textBytes('sk-test-0000'), ctx)
  expect(new TextDecoder().decode(await decipherBytes(cipherKey, sealed, ctx))).to.eq('sk-test-0000')
  await expect(decipherBytes(cipherKey, sealed, other)).rejects.toThrow()
}
