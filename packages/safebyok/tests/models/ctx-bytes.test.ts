/** What each wrap and cipher is bound to, byte for byte, and that a change to any field of a stamp keeps it shut. */

import { describe, expect, it } from 'vitest'
import { BX, Crypto, GX } from 'safebyok-big/internals'
import { BoxWhisperSealer } from '../../src/models/sealers'
import * as TH from '../test-helpers'

TH.useFakeClock()

// The literals below are the UTF-8 text of each ctx's JSON: a rename of a stored field moves them on purpose, and nothing else should.

function textBytes(text: string): Uint8Array { return new TextEncoder().encode(text) }

const WhisperText = '{"apiKey":"sk-test-0000"}'

/** The JSON text of {@link TH.WorldBankStamp}, as every ctx under the bank holds it first: its keys sorted. */
const BankStampText = `{"bank_tok":"bank-tok-u1","banklabel":"acme","registered_at":${String(TH.T0)},"user_id":"u1"}`

/** The JSON text of {@link TH.WorldGateStamp}, as each wayin's ctx holds it after the bank's. */
const GateStampText = `{"banklabel":"acme","gate_tok":"gate-tok-u1","gatelabel":"main","registered_at":${String(TH.T0)},"user_id":"u1"}`

const BankStampFields = ['user_id', 'banklabel', 'bank_tok', 'registered_at'] as const
const GateStampFields = ['user_id', 'banklabel', 'gatelabel', 'gate_tok', 'registered_at'] as const
const LeaseStampFields = ['fmt', ...BankStampFields, 'gatelabel', 'gate_tok', 'gate_revision_tok', 'proved_at', 'wayinkind'] as const
const BoxStampFields = ['user_id', 'banklabel', 'vaultlabel', 'boxlabel', 'fmt', 'bank_tok', 'vault_tok', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'am', 'box_tok', 'whisper_codec', 'whisper_schema_version'] as const

/** What a bankKey is unwrapped as only to see that a wrap opens. */
const CheckUsage = { extractable: false, usage: ['wrapKey'] } as const

/** `val` changed, keeping its type: a number one more, a string with a letter added. */
function changed(val: unknown): unknown { return ((typeof val === 'number') ? val + 1 : `${String(val)}x`) }

/** A born bank, a box it sealed, the box's stamp as the seal binds it, and the bankKey, read through the backdoor. */
async function sealedWorld() {
  const { bank } = await TH.buildBornBank()
  const box = await bank.sealBox(TH.boxAnteOf(), { whisper: TH.Whisper })
  const [boxStamp] = BoxWhisperSealer.stampsOf(box)
  return { bank, box, boxStamp: boxStamp!, bankKey: await TH._cheat_bankKeyOf(bank) }
}

/** The whisper text of `box`, opened by hand under `bankKey` with the ctx of `bankStamp` and `boxStamp`; rejects with WebCrypto's error when it will not open. */
async function openByHand(bankKey: CryptoKey, box: BX.BoxRecord, bankStamp: Crypto.CipherCtxRecord, boxStamp: Crypto.CipherCtxRecord): Promise<string> {
  const boxKey = await Crypto.unwrapKeyUnder(bankKey, box.box_key_wrapped, Crypto.cipherCtx([bankStamp, boxStamp], 'box_key_wrapped'), { extractable: false, usage: ['decrypt'] })
  return new TextDecoder().decode(await Crypto.decipherBytes(boxKey, box.whisper_ciphered, Crypto.cipherCtx([bankStamp, boxStamp], 'whisper_ciphered')))
}

/** A lease's record, built by a born bank's passphrase proving on a fake bank of {@link TH.WorldBankStamp}. */
async function leaseRecordOf(): Promise<GX.LeaseRecord> {
  const { proving } = await TH.buildBornBank()
  const { record } = await TH._cheat_grantedLease(proving, TH.fakeLeaseBankOf())
  return record
}

/** Whether a born bank's passphrase wayin opens under the ctx of the stamps `bankStamp` and `gateStamp`, built field for field without a check. */
async function passphraseWayinOpens(bankStamp: Crypto.CipherCtxRecord, gateStamp: Crypto.CipherCtxRecord): Promise<boolean> {
  const { bank } = await TH.buildBornBank()
  const { bank_key_wayin_wrapped: wrapped, ...header } = bank.maingate.wayins.main
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
    const wayin = bank.maingate.wayins.main
    const ctx = textBytes(`[${BankStampText},${GateStampText},"bank_key_passphrase_wrapped",{"device_tok":"${wayin.device_tok}","key_deriver_label":"${wayin.key_deriver_label}","registered_at":${String(wayin.registered_at)},"salt_b64":"${wayin.salt_b64}","wayinkind":"passphrase","wayinlabel":"main"}]`)
    const wayinKey = await Crypto.importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes(TH.TestPassphrase, Crypto.fromB64(wayin.salt_b64)))
    expect(await Crypto.unwrapKeyUnder(wayinKey, wayin.bank_key_wayin_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds a passkey wayin's wrap and its key to the bank's stamp, the gate's, the purpose and its whole header", async () => {
    const answer = TH.passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const { bank } = await TH.buildBornBank({ passkeyClear: answer })
    const wayin = bank.maingate.wayins.passkey0!
    const ctx = textBytes(`[${BankStampText},${GateStampText},"bank_key_passkey_wrapped",{"credential_id":"${wayin.credential_id}","device_tok":"${wayin.device_tok}","prf_salt_b64":"${wayin.prf_salt_b64}","registered_at":${String(wayin.registered_at)},"wayinkind":"passkey","wayinlabel":"passkey0"}]`)
    const passkeyKey = await Crypto.deriveWrappingKey(prfBytes, ctx)
    expect(await Crypto.unwrapKeyUnder(passkeyKey, wayin.bank_key_wayin_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds a lease's wrap of the bankKey to the bank's stamp and its own", async () => {
    const record = await leaseRecordOf()
    const leaseText = `{"bank_tok":"bank-tok-u1","banklabel":"acme","fmt":${String(GX.LeaseFormat)},"gate_revision_tok":"${TH.WorldGate.revision_tok}","gate_tok":"gate-tok-u1","gatelabel":"main","proved_at":${String(TH.T0)},"registered_at":${String(TH.T0)},"user_id":"u1","wayinkind":"passphrase"}`
    const ctx = textBytes(`[${BankStampText},${leaseText},"bank_key_lease_wrapped"]`)
    expect(await Crypto.unwrapKeyUnder(record.lease_key, record.bank_key_lease_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds each of a box's two seals to the bank's stamp, the box's sparse fields and its own purpose, and nothing of its sidecar", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    function field(fieldname: string): string { return JSON.stringify(boxStamp[fieldname]) }
    expect(boxStamp).to.not.have.property('sidecar')
    const boxText = `{"am":"a","bank_tok":"bank-tok-u1","banklabel":"acme","box_tok":${field('box_tok')},"boxlabel":"anthropic_api_key","fmt":${field('fmt')},"registered_at":${String(TH.T0)},"revision_seq":0,"revision_tok":${field('revision_tok')},"user_id":"u1","vault_tok":"${TH.WorldVaultTok}","vaultlabel":"main","whisper_codec":"json_v1","whisper_schema_version":1,"written_at":${String(TH.T0)}}`
    const boxKey = await Crypto.unwrapKeyUnder(bankKey, box.box_key_wrapped, textBytes(`[${BankStampText},${boxText},"box_key_wrapped"]`), { extractable: false, usage: ['decrypt'] })
    const opened = await Crypto.decipherBytes(boxKey, box.whisper_ciphered, textBytes(`[${BankStampText},${boxText},"whisper_ciphered"]`))
    expect(new TextDecoder().decode(opened)).to.eq(WhisperText)
  })
})

describe("each ctx binds every field of its stamps", () => {
  it("names every field of a box's stamp below: a field the stamp gains fails here until it is listed", async () => {
    const { boxStamp } = await sealedWorld()
    expect(Object.keys(boxStamp)).to.have.members([...BoxStampFields])
  })

  it("names every field of a lease's stamp below", async () => {
    const record = await leaseRecordOf()
    expect(Object.keys(record).filter((fieldname) => (fieldname !== 'lease_key') && (fieldname !== 'bank_key_lease_wrapped'))).to.have.members([...LeaseStampFields])
  })

  it("names every field of a bank's and a gate's stamps below", async () => {
    const { bank } = await TH.buildBornBank()
    expect(Object.keys(bank.stamp)).to.have.members([...BankStampFields])
    expect(Object.keys(bank.maingate.stamp)).to.have.members([...GateStampFields])
  })

  it("opens a box by hand under the stamps it was sealed under", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    expect(await openByHand(bankKey, box, TH.WorldBankStamp, boxStamp)).to.eq(WhisperText)
  })

  for (const fieldname of BoxStampFields) {
    it(`keeps a box shut under a box stamp with another ${fieldname}`, async () => {
      const { box, boxStamp, bankKey } = await sealedWorld()
      await expect(openByHand(bankKey, box, TH.WorldBankStamp, { ...boxStamp, [fieldname]: changed(boxStamp[fieldname]) as string })).rejects.toThrow()
    })
  }

  for (const fieldname of BankStampFields) {
    it(`keeps a box shut under a bank stamp with another ${fieldname}`, async () => {
      const { box, boxStamp, bankKey } = await sealedWorld()
      await expect(openByHand(bankKey, box, { ...TH.WorldBankStamp, [fieldname]: changed(TH.WorldBankStamp[fieldname]) as string }, boxStamp)).rejects.toThrow()
    })

    it(`keeps a wayin shut under a bank stamp with another ${fieldname}`, async () => {
      expect(await passphraseWayinOpens(TH.WorldBankStamp, TH.WorldGateStamp)).to.be.true
      expect(await passphraseWayinOpens({ ...TH.WorldBankStamp, [fieldname]: changed(TH.WorldBankStamp[fieldname]) as string }, TH.WorldGateStamp)).to.be.false
    })

    it(`keeps a lease shut under a bank stamp with another ${fieldname}`, async () => {
      const { lease_key, bank_key_lease_wrapped, ...stamp } = await leaseRecordOf()
      const ctx = Crypto.cipherCtx([{ ...TH.WorldBankStamp, [fieldname]: changed(TH.WorldBankStamp[fieldname]) as string }, stamp], 'bank_key_lease_wrapped')
      await expect(Crypto.unwrapKeyUnder(lease_key, bank_key_lease_wrapped, ctx, CheckUsage)).rejects.toThrow()
    })
  }

  for (const fieldname of GateStampFields) {
    it(`keeps a wayin shut under a gate stamp with another ${fieldname}`, async () => {
      expect(await passphraseWayinOpens(TH.WorldBankStamp, { ...TH.WorldGateStamp, [fieldname]: changed(TH.WorldGateStamp[fieldname]) as string })).to.be.false
    })
  }

  for (const fieldname of LeaseStampFields) {
    it(`keeps a lease shut under a lease stamp with another ${fieldname}`, async () => {
      const { lease_key, bank_key_lease_wrapped, ...stamp } = await leaseRecordOf()
      const ctx = Crypto.cipherCtx([TH.WorldBankStamp, { ...stamp, [fieldname]: changed(stamp[fieldname]) as string }], 'bank_key_lease_wrapped')
      await expect(Crypto.unwrapKeyUnder(lease_key, bank_key_lease_wrapped, ctx, CheckUsage)).rejects.toThrow()
    })
  }

  it("gives a box's two purposes different ctxs", async () => {
    const { boxStamp } = await sealedWorld()
    const decoder = new TextDecoder()
    expect(decoder.decode(Crypto.cipherCtx([TH.WorldBankStamp, boxStamp], 'box_key_wrapped'))).to.not.eq(decoder.decode(Crypto.cipherCtx([TH.WorldBankStamp, boxStamp], 'whisper_ciphered')))
  })
})
