/** The ctx each wrap and cipher is bound to, byte for byte, and that a stamp with any one field changed will not unseal or unwrap what was bound to it. */

import { describe, expect, it } from 'vitest'
import { Crypto } from 'safebyok-big/internals'
import { BaseBox } from '../../src/models/base-box'
import type { LiveOf } from '../../src/shapes/shapes-sealers'
import type { BoxRecord } from '../../src/shapes/shapes-thing'
import { type LeaseRecord, type LeaseStamp, LeaseFormat } from '../../src/shapes/shapes-stamps'
import { Lifeseq } from '../../src/shapes/primitives'

import * as TH from '../test-helpers'

TH.useFakeClock()

// The literals below are the UTF-8 text of each ctx's JSON: a rename of a stored field moves them on purpose, and nothing else should.

function textBytes(text: string): Uint8Array { return new TextEncoder().encode(text) }

const WhisperText = '{"apiKey":"sk-test-0000"}'

/** The JSON text of {@link TH.WorldBankStamp}, as every ctx under the bank has it first: its keys sorted. */
const BankStampText = `{"banklabel":"acme","born_at":${String(TH.T0)},"lifeseq":"0000000000","lifetok":"${TH.FirstLifetok}","userid":"u1"}`

/** The JSON text of {@link TH.WorldGateStamp}, as each wayin's ctx has it after the bank's. */
const GateStampText = `{"banklabel":"acme","born_at":${String(TH.T0)},"labelpath":"gate","lifeseq":"0000000000","userid":"u1"}`

const BankStampFields = ['userid', 'banklabel', 'lifeseq', 'born_at', 'lifetok'] as const
const GateStampFields = ['userid', 'banklabel', 'labelpath', 'lifeseq', 'born_at'] as const
const LeaseStampFields = ['fmt', 'userid', 'banklabel', 'bank_lifeseq', 'bank_born_at', 'bank_lifetok', 'gate_labelpath', 'gate_lifeseq', 'gate_revtok', 'born_at', 'proved_at', 'wayinkind'] as const
const BoxStampFields = ['userid', 'banklabel', 'labelpath', 'label', 'fmt', 'revtok', 'revseq', 'am', 'lifeseq', 'lifepath', 'born_at', 'written_at'] as const
const SealTagFields = ['codectag', 'schematag'] as const

/** The JSON text of a box's tags, as each ctx of its seal ends with them. */
const BoxTagsText = '{"codectag":"json_v1","schematag":"whisper_v1"}'

/** The usage a bankKey is unwrapped with only to see that a wrap unwraps. */
const CheckUsage = { extractable: false, usage: ['wrapKey'] } as const
/** The usage a part key is unwrapped with. */
const DecipherUsage = { extractable: false, usage: ['decrypt'] } as const

/** `val` changed, its type unchanged: a number one more, a string with a letter added. */
function changed(val: unknown): unknown { return ((typeof val === 'number') ? val + 1 : `${String(val)}x`) }

/** A born bank, a box it sealed, the box's stamp as the seal binds it, and the bankKey, read through a cheat. */
async function sealedWorld() {
  const { bank } = await TH.buildBornBank()
  const box = await bank.device.vault!.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
  return { bank, box, boxStamp: BaseBox.stampOf(box), bankKey: await TH._cheat_bankKeyOf(bank) }
}

/** The whisper text of `box`, unsealed by hand under `bankKey` with the ctx of `bankStamp`, `boxStamp` and `tags` (the box's own by default); rejects with WebCrypto's error when it will not unseal. */
async function unsealByHand(bankKey: CryptoKey, box: LiveOf<BoxRecord>, bankStamp: Crypto.CipherCtxRecord, boxStamp: Crypto.CipherCtxRecord, tags: Crypto.CipherCtxRecord = BaseBox.tags): Promise<string> {
  const { key_wrapped, ciphered } = box.whisper_sealed
  const partKey = await Crypto.unwrapKeyUnder(bankKey, key_wrapped, Crypto.cipherCtx([bankStamp, boxStamp], 'whisper_sealed.key_wrapped', tags), { extractable: false, usage: ['decrypt'] })
  return new TextDecoder().decode(await Crypto.decipherBytes(partKey, ciphered, Crypto.cipherCtx([bankStamp, boxStamp], 'whisper_sealed.ciphered', tags)))
}

/** A lease's record and its stamp, built by a born bank's passphrase proving on a fake bank of {@link TH.WorldBankStamp}. */
async function leaseRecordOf(): Promise<{ record: LiveOf<LeaseRecord>, stamp: LeaseStamp }> {
  const { proving } = await TH.buildBornBank()
  const { lease, record } = await TH._cheat_grantedLease(proving, TH.fakeLeaseGateOf())
  return { record, stamp: lease.stamp }
}

/** Whether a born bank's passphrase wayin unwraps under the ctx of the stamps `bankStamp` and `gateStamp`, built field for field without a check. */
async function passphraseWayinUnwraps(bankStamp: Crypto.CipherCtxRecord, gateStamp: Crypto.CipherCtxRecord): Promise<boolean> {
  const { bank } = await TH.buildBornBank()
  const { bank_key_wayin_wrapped: wrapped, ...header } = bank.gate.wayins.main
  const wayinKey = await Crypto.importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes(TH.TestPassphrase, Crypto.fromB64(header.salt_b64)))
  const ctx = Crypto.cipherCtx([bankStamp, gateStamp], 'bank_key_passphrase_wrapped', header)
  try {
    await Crypto.unwrapKeyUnder(wayinKey, wrapped, ctx, CheckUsage)
    return true
  } catch { return false }
}

describe("each ctx, byte for byte", () => {
  it("encodes a list of stamps, a purpose and a header, each record's keys sorted", () => {
    const ctx = Crypto.cipherCtx([{ bank_tok: 'bid', banklabel: 'acme' }, { written_at: 2, boxlabel: 'anthropic', revision_tok: 'r1' }], 'whisper_ciphered', { wayinkind: 'passkey' })
    expect(new TextDecoder().decode(ctx)).to.eq('[{"bank_tok":"bid","banklabel":"acme"},{"boxlabel":"anthropic","revision_tok":"r1","written_at":2},"whisper_ciphered",{"wayinkind":"passkey"}]')
  })

  it("binds a passphrase wayin's wrap to the bank's stamp, the gate's, the purpose and its whole header", async () => {
    const { bank } = await TH.buildBornBank()
    const wayin = bank.gate.wayins.main
    const ctx = textBytes(`[${BankStampText},${GateStampText},"bank_key_passphrase_wrapped",{"born_at":${String(wayin.born_at)},"device_tok":"${wayin.device_tok}","key_deriver_label":"${wayin.key_deriver_label}","label":"main","salt_b64":"${wayin.salt_b64}","wayinkind":"passphrase"}]`)
    const wayinKey = await Crypto.importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes(TH.TestPassphrase, Crypto.fromB64(wayin.salt_b64)))
    expect(await Crypto.unwrapKeyUnder(wayinKey, wayin.bank_key_wayin_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds a passkey wayin's wrap and its passkeyKey to the bank's stamp, the gate's, the purpose and its whole header", async () => {
    const answer = TH.passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const { bank } = await TH.buildBornBank({ passkeyCleartext: answer })
    const wayin = bank.gate.wayins.passkey0!
    const ctx = textBytes(`[${BankStampText},${GateStampText},"bank_key_passkey_wrapped",{"born_at":${String(wayin.born_at)},"credential_id":"${wayin.credential_id}","device_tok":"${wayin.device_tok}","label":"passkey0","prf_salt_b64":"${wayin.prf_salt_b64}","wayinkind":"passkey"}]`)
    const passkeyKey = await Crypto.deriveWrappingKey(prfBytes, ctx)
    expect(await Crypto.unwrapKeyUnder(passkeyKey, wayin.bank_key_wayin_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds a lease's wrap of the bankKey to the bank's stamp and its own, and nothing of its life, revision or end", async () => {
    const { record } = await leaseRecordOf()
    const leaseText = `{"bank_born_at":${String(TH.T0)},"bank_lifeseq":"0000000000","bank_lifetok":"${TH.FirstLifetok}","banklabel":"acme","born_at":${String(TH.T0)},"fmt":"${LeaseFormat}","gate_labelpath":"gate","gate_lifeseq":"0000000000","gate_revtok":"${TH.WorldGate.revtok}","proved_at":${String(TH.T0)},"userid":"u1","wayinkind":"passphrase"}`
    const ctx = textBytes(`[${BankStampText},${leaseText},"bank_key_lease_wrapped"]`)
    expect(await Crypto.unwrapKeyUnder(record.lease_key, record.bank_key_lease_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds each of a box's two ciphertexts to the bank's stamp, the box's Thing fields, the field's purpose and the box's tags, and nothing of its sidecar", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    function field(fieldname: keyof typeof boxStamp): string { return JSON.stringify(boxStamp[fieldname]) }
    expect(boxStamp).to.not.have.property('sidecar')
    const life0 = Lifeseq.ofLifenum(0)
    const boxText = `{"am":"a","banklabel":"acme","born_at":${String(TH.T0)},"fmt":${field('fmt')},"label":"anthropic_api_key","labelpath":"box/anthropic_api_key","lifepath":"${life0}/${life0}","lifeseq":"${life0}","revseq":0,"revtok":${field('revtok')},"userid":"u1","written_at":${String(TH.T0)}}`
    const { key_wrapped, ciphered } = box.whisper_sealed
    const partKey = await Crypto.unwrapKeyUnder(bankKey, key_wrapped, textBytes(`[${BankStampText},${boxText},"whisper_sealed.key_wrapped",${BoxTagsText}]`), { extractable: false, usage: ['decrypt'] })
    const deciphered = await Crypto.decipherBytes(partKey, ciphered, textBytes(`[${BankStampText},${boxText},"whisper_sealed.ciphered",${BoxTagsText}]`))
    expect(new TextDecoder().decode(deciphered)).to.eq(WhisperText)
  })
})

describe("each ctx binds every field of its stamps", () => {
  it("names every field of a box's stamp below: a field the stamp gains fails here until it is listed", async () => {
    const { boxStamp } = await sealedWorld()
    expect(Object.keys(boxStamp)).to.have.members([...BoxStampFields])
  })

  it("names every field of a lease's stamp below", async () => {
    const { stamp } = await leaseRecordOf()
    expect(Object.keys(stamp)).to.have.members([...LeaseStampFields])
  })

  it("names every field of a bank's and a gate's stamps below", async () => {
    const { bank } = await TH.buildBornBank()
    expect(Object.keys(bank.stamp)).to.have.members([...BankStampFields])
    expect(Object.keys(bank.gate.stamp)).to.have.members([...GateStampFields])
  })

  it("unseals a box by hand under the stamps it was sealed under", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    expect(await unsealByHand(bankKey, box, TH.WorldBankStamp, boxStamp)).to.eq(WhisperText)
  })

  for (const fieldname of BoxStampFields) {
    it(`a box will not unseal under a box stamp with another ${fieldname}`, async () => {
      const { box, boxStamp, bankKey } = await sealedWorld()
      await expect(unsealByHand(bankKey, box, TH.WorldBankStamp, { ...boxStamp, [fieldname]: changed(boxStamp[fieldname]) as string })).rejects.toThrow()
    })
  }

  for (const fieldname of SealTagFields) {
    it(`a box will not unseal under tags with another ${fieldname}`, async () => {
      const { box, boxStamp, bankKey } = await sealedWorld()
      await expect(unsealByHand(bankKey, box, TH.WorldBankStamp, boxStamp, { ...BaseBox.tags, [fieldname]: changed(BaseBox.tags[fieldname]) as string })).rejects.toThrow()
    })
  }

  it("a box will not unseal under its two stamps in the other order: the bank's stamp is the ctx's first part", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    expect(await unsealByHand(bankKey, box, TH.WorldBankStamp, boxStamp)).to.eq(WhisperText)
    await expect(unsealByHand(bankKey, box, boxStamp, TH.WorldBankStamp)).rejects.toThrow()
  })

  it("a box will not unseal under no tags", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    const { key_wrapped } = box.whisper_sealed
    await expect(Crypto.unwrapKeyUnder(bankKey, key_wrapped, Crypto.cipherCtx([TH.WorldBankStamp, boxStamp], 'whisper_sealed.key_wrapped'), DecipherUsage)).rejects.toThrow()
    await expect(Crypto.unwrapKeyUnder(bankKey, key_wrapped, Crypto.cipherCtx([TH.WorldBankStamp, boxStamp], 'whisper_sealed.key_wrapped', BaseBox.tags), DecipherUsage)).resolves.toBeInstanceOf(CryptoKey)
  })

  for (const fieldname of BankStampFields) {
    it(`a box will not unseal under a bank stamp with another ${fieldname}`, async () => {
      const { box, boxStamp, bankKey } = await sealedWorld()
      await expect(unsealByHand(bankKey, box, { ...TH.WorldBankStamp, [fieldname]: changed(TH.WorldBankStamp[fieldname]) as string }, boxStamp)).rejects.toThrow()
    })

    it(`a wayin will not unwrap under a bank stamp with another ${fieldname}`, async () => {
      expect(await passphraseWayinUnwraps(TH.WorldBankStamp, TH.WorldGateStamp)).to.be.true
      expect(await passphraseWayinUnwraps({ ...TH.WorldBankStamp, [fieldname]: changed(TH.WorldBankStamp[fieldname]) as string }, TH.WorldGateStamp)).to.be.false
    })

    it(`a lease will not unwrap under a bank stamp with another ${fieldname}`, async () => {
      const { record: { lease_key, bank_key_lease_wrapped }, stamp } = await leaseRecordOf()
      const ctx = Crypto.cipherCtx([{ ...TH.WorldBankStamp, [fieldname]: changed(TH.WorldBankStamp[fieldname]) as string }, stamp], 'bank_key_lease_wrapped')
      await expect(Crypto.unwrapKeyUnder(lease_key, bank_key_lease_wrapped, ctx, CheckUsage)).rejects.toThrow()
    })
  }

  for (const fieldname of GateStampFields) {
    it(`a wayin will not unwrap under a gate stamp with another ${fieldname}`, async () => {
      expect(await passphraseWayinUnwraps(TH.WorldBankStamp, { ...TH.WorldGateStamp, [fieldname]: changed(TH.WorldGateStamp[fieldname]) as string })).to.be.false
    })
  }

  for (const fieldname of LeaseStampFields) {
    it(`a lease will not unwrap under a lease stamp with another ${fieldname}`, async () => {
      const { record: { lease_key, bank_key_lease_wrapped }, stamp } = await leaseRecordOf()
      const ctx = Crypto.cipherCtx([TH.WorldBankStamp, { ...stamp, [fieldname]: changed(stamp[fieldname]) as string }], 'bank_key_lease_wrapped')
      await expect(Crypto.unwrapKeyUnder(lease_key, bank_key_lease_wrapped, ctx, CheckUsage)).rejects.toThrow()
    })
  }

  it("gives a box's two purposes different ctxs", async () => {
    const { boxStamp } = await sealedWorld()
    const decoder = new TextDecoder()
    const [keyPurpose, cipherPurpose] = [BaseBox.purposes.key, BaseBox.purposes.cipher]
    expect(decoder.decode(Crypto.cipherCtx([TH.WorldBankStamp, boxStamp], keyPurpose, BaseBox.tags))).to.not.eq(decoder.decode(Crypto.cipherCtx([TH.WorldBankStamp, boxStamp], cipherPurpose, BaseBox.tags)))
  })
})
