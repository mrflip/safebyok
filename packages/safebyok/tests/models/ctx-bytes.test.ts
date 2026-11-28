/** The ctx each wrap and cipher is bound to, byte for byte, and that a stamp with any one field changed will not unseal or unwrap what was bound to it. */

import { describe, expect, it } from 'vitest'
import { Crypto } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import { BaseBox } from '../../src/models/base-box'
import { wayinCtxOf } from '../../src/models/wayin'
import type { LiveOf } from '../../src/shapes/shapes-sealers'
import type { BoxRecord } from '../../src/shapes/shapes-thing'
import { type GateLife, type LeaseRecord, type LeaseStamp, LeaseFormat } from '../../src/shapes/shapes-stamps'
import type { WayinRecord } from '../../src/shapes/shapes-wayin'
import { Lifeseq } from '../../src/shapes/primitives'

import * as TH from '../test-helpers'

TH.useFakeClock()

// The literals below are the UTF-8 text of each ctx's JSON: a rename of a stored field moves them on purpose, and nothing else should.

function textBytes(text: string): Uint8Array { return new TextEncoder().encode(text) }
function textOf(bytes: Uint8Array): string { return new TextDecoder().decode(bytes) }

const WhisperText = '{"apiKey":"sk-test-0000"}'
const Life0 = Lifeseq.ofLifenum(0)

/** The JSON text of the stamp of the wayin `label` of {@link TH.WorldGateLife}'s gate, as its ctx has it first: its keys sorted. */
function wayinStampText(label: string): string {
  return `{"banklabel":"acme","banktok":"${TH.FirstBanktok}","born_at":${String(TH.T0)},"label":"${label}","labelpath":"acme","lifepath":"${Life0}","modelkind":"wayin","userid":"u1"}`
}

const ThingStampFields = ['modelkind', 'userid', 'banklabel', 'labelpath', 'banktok', 'fmt', 'am', 'lifepath', 'revtok', 'revseq', 'born_at', 'written_at'] as const
const WayinStampFields = ['modelkind', 'userid', 'banklabel', 'labelpath', 'lifepath', 'born_at', 'label', 'banktok'] as const
const PassphraseHeaderFields = ['wayinkind', 'key_deriver_label', 'salt_b64', 'devicetok', 'born_at'] as const
const LeaseStampFields = ['modelkind', 'userid', 'banklabel', 'banktok', 'gate_labelpath', 'gate_lifepath', 'gate_born_at', 'gate_revtok', 'fmt', 'born_at', 'proved_at', 'wayinkind'] as const
const BankLifeFields = ['userid', 'banklabel', 'lifeseq', 'born_at', 'banktok'] as const
const SealTagFields = ['codectag', 'schematag'] as const

/** The JSON text of a box's tags, as each ctx of its seal ends with them. */
const BoxTagsText = '{"codectag":"json_v1","schematag":"whisper_v1"}'

/** The usage a bankKey is unwrapped with only to see that a wrap unwraps. */
const CheckUsage = { extractable: false, usage: ['wrapKey'] } as const
/** The usage a part key is unwrapped with. */
const DecipherUsage = { extractable: false, usage: ['decrypt'] } as const

/** `val` changed, its type unchanged: a number one more, a string with a letter added. */
function changed(val: unknown): unknown { return ((typeof val === 'number') ? val + 1 : `${String(val)}x`) }

/** `record` with its field `fieldname` {@link changed}. */
function withChanged<RecordT extends object>(record: RecordT, fieldname: keyof RecordT): RecordT { return { ...record, [fieldname]: changed(record[fieldname]) } }

/** The record a ctx lists first, read back from its bytes. */
function firstPartOf(ctx: Uint8Array): Crypto.CipherCtxRecord { return (JSON.parse(textOf(ctx)) as [Crypto.CipherCtxRecord])[0] }

/** A born bank, a box it sealed, the box's stamp as the seal binds it, and the bankKey, read through a cheat. */
async function sealedWorld() {
  const { bank } = await TH.buildBornBank()
  const box = await bank.device.vault!.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
  return { bank, box, boxStamp: BaseBox.stampOf(box), bankKey: await TH._cheat_bankKeyOf(bank) }
}

/** The whisper text of `box`, unsealed by hand under `bankKey` with the ctx of `boxStamp` and `tags` (the box's own by default); rejects with WebCrypto's error when it will not unseal. */
async function unsealByHand(bankKey: CryptoKey, box: LiveOf<BoxRecord>, boxStamp: Crypto.CipherCtxRecord, tags: Crypto.CipherCtxRecord = BaseBox.tags): Promise<string> {
  const { key_wrapped, ciphered } = box.whisper_sealed
  const partKey = await Crypto.unwrapKeyUnder(bankKey, key_wrapped, Crypto.cipherCtx(boxStamp, BaseBox.purposes.key, tags), DecipherUsage)
  return textOf(await Crypto.decipherBytes(partKey, ciphered, Crypto.cipherCtx(boxStamp, BaseBox.purposes.cipher, tags)))
}

/** A lease's record and its stamp, built by a born bank's passphrase proving on a fake gate of {@link TH.WorldGateLife}. */
async function leaseRecordOf(): Promise<{ record: LiveOf<LeaseRecord>, stamp: LeaseStamp }> {
  const { proving } = await TH.buildBornBank()
  const { lease, record } = await TH._cheat_grantedLease(proving, TH.fakeLeaseGateOf())
  return { record, stamp: lease.stamp }
}

/** Whether `record`'s wrapped bankKey unwraps under its leaseKey with the ctx of `stamp`. */
async function leaseUnwraps({ lease_key, bank_key_lease_wrapped }: LiveOf<LeaseRecord>, stamp: Crypto.CipherCtxRecord): Promise<boolean> {
  try {
    await Crypto.unwrapKeyUnder(lease_key, bank_key_lease_wrapped, Crypto.cipherCtx(stamp, 'bank_key_lease_wrapped'), CheckUsage)
    return true
  } catch { return false }
}

/** A born bank's passphrase wayin: its stamp as its ctx binds it, its header without its label, and its wrapped bankKey. */
async function passphraseWayin() {
  const { bank } = await TH.buildBornBank()
  const { bank_key_wayin_wrapped: wrapped, label, ...header } = bank.gate.wayins.main
  const stamp = firstPartOf(wayinCtxOf(bank.gate.life, { ...header, label }))
  return { stamp, header, wrapped }
}

/** Whether `wrapped`, a passphrase wayin's, unwraps by {@link TH.TestPassphrase} under the ctx of `stamp` and `header`, built field for field without a check. */
async function passphraseWayinUnwraps(wrapped: WayinRecord['bank_key_wayin_wrapped'], stamp: Crypto.CipherCtxRecord, header: Crypto.CipherCtxRecord & { salt_b64: string }, saltB64 = header.salt_b64): Promise<boolean> {
  const wayinKey = await Crypto.importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes(TH.TestPassphrase, Crypto.fromB64(saltB64)))
  try {
    await Crypto.unwrapKeyUnder(wayinKey, wrapped, Crypto.cipherCtx(stamp, 'bank_key_passphrase_wrapped', header), CheckUsage)
    return true
  } catch { return false }
}

describe("each ctx, byte for byte", () => {
  it("encodes one stamp, a purpose and a header, each record's keys sorted", () => {
    const ctx = Crypto.cipherCtx({ written_at: 2, labelpath: 'box/anthropic', revtok: 'r1' }, 'whisper_sealed.ciphered', { wayinkind: 'passkey' })
    expect(textOf(ctx)).to.eq('[{"labelpath":"box/anthropic","revtok":"r1","written_at":2},"whisper_sealed.ciphered",{"wayinkind":"passkey"}]')
  })

  it("binds a passphrase wayin's wrap to its stamp, the purpose and its header but its label", async () => {
    const { bank } = await TH.buildBornBank()
    const wayin = bank.gate.wayins.main
    const ctx = textBytes(`[${wayinStampText('main')},"bank_key_passphrase_wrapped",{"born_at":${String(wayin.born_at)},"devicetok":"${wayin.devicetok}","key_deriver_label":"${wayin.key_deriver_label}","salt_b64":"${wayin.salt_b64}","wayinkind":"passphrase"}]`)
    expect(textOf(wayinCtxOf(bank.gate.life, wayin))).to.eq(textOf(ctx))
    const wayinKey = await Crypto.importWrappingKeyBytes(await TH.testDeriver.deriveKeyBytes(TH.TestPassphrase, Crypto.fromB64(wayin.salt_b64)))
    expect(await Crypto.unwrapKeyUnder(wayinKey, wayin.bank_key_wayin_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds a passkey wayin's wrap, and the HKDF info of its passkeyKey, to its stamp, the purpose and its header but its label", async () => {
    const answer = TH.passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const { bank } = await TH.buildBornBank({ passkeyCleartext: answer })
    const wayin = bank.gate.wayins.passkey0!
    const ctx = textBytes(`[${wayinStampText('passkey0')},"bank_key_passkey_wrapped",{"born_at":${String(wayin.born_at)},"credential_id":"${wayin.credential_id}","devicetok":"${wayin.devicetok}","prf_salt_b64":"${wayin.prf_salt_b64}","wayinkind":"passkey"}]`)
    expect(textOf(wayinCtxOf(bank.gate.life, wayin))).to.eq(textOf(ctx))
    const passkeyKey = await Crypto.deriveWrappingKey(prfBytes, ctx)
    expect(await Crypto.unwrapKeyUnder(passkeyKey, wayin.bank_key_wayin_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds a lease's wrap of the bankKey to its stamp, its gate's life and revtok among it, and nothing of its own revision or end", async () => {
    const { record } = await leaseRecordOf()
    const leaseText = `{"banklabel":"acme","banktok":"${TH.FirstBanktok}","born_at":${String(TH.T0)},"fmt":"${LeaseFormat}","gate_born_at":${String(TH.T0)},"gate_labelpath":"acme","gate_lifepath":"${Life0}","gate_revtok":"${TH.WorldGate.revtok}","modelkind":"lease","proved_at":${String(TH.T0)},"userid":"u1","wayinkind":"passphrase"}`
    const ctx = textBytes(`[${leaseText},"bank_key_lease_wrapped"]`)
    expect(await Crypto.unwrapKeyUnder(record.lease_key, record.bank_key_lease_wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds each of a box's two ciphertexts to the box's stamp, the field's purpose and the box's tags, and nothing of its sidecar", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    function field(fieldname: keyof typeof boxStamp): string { return JSON.stringify(boxStamp[fieldname]) }
    expect(boxStamp).to.not.have.property('sidecar')
    const boxText = `{"am":"a","banklabel":"acme","banktok":"${TH.FirstBanktok}","born_at":${String(TH.T0)},"fmt":${field('fmt')},"labelpath":"box/anthropic_api_key","lifepath":"${Life0}/${Life0}","modelkind":"box","revseq":0,"revtok":${field('revtok')},"userid":"u1","written_at":${String(TH.T0)}}`
    const { key_wrapped, ciphered } = box.whisper_sealed
    const partKey = await Crypto.unwrapKeyUnder(bankKey, key_wrapped, textBytes(`[${boxText},"whisper_sealed.key_wrapped",${BoxTagsText}]`), DecipherUsage)
    const deciphered = await Crypto.decipherBytes(partKey, ciphered, textBytes(`[${boxText},"whisper_sealed.ciphered",${BoxTagsText}]`))
    expect(textOf(deciphered)).to.eq(WhisperText)
  })
})

describe("each stamp's fields", () => {
  it("names every field of a box's stamp: a field the stamp gains fails here until it is listed", async () => {
    const { boxStamp } = await sealedWorld()
    expect(Object.keys(boxStamp)).to.have.members([...ThingStampFields])
  })

  it("names every field of a gate's stamp, the same as a box's", async () => {
    const { bank } = await TH.buildBornBank()
    expect(Object.keys(bank.gate.stamp)).to.have.members([...ThingStampFields])
  })

  it("names every field of a wayin's stamp", async () => {
    const { stamp } = await passphraseWayin()
    expect(Object.keys(stamp)).to.have.members([...WayinStampFields])
  })

  it("names every field of a lease's stamp", async () => {
    const { stamp } = await leaseRecordOf()
    expect(Object.keys(stamp)).to.have.members([...LeaseStampFields])
  })

  it("names every field of a bank's life, which no ctx binds by itself", async () => {
    const { bank } = await TH.buildBornBank()
    expect(Object.keys(bank.life)).to.have.members([...BankLifeFields])
  })
})

describe("each ctx binds every field of its stamp", () => {
  it("unseals a box by hand under the stamp it was sealed under", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    expect(await unsealByHand(bankKey, box, boxStamp)).to.eq(WhisperText)
  })

  for (const fieldname of ThingStampFields) {
    it(`a box will not unseal under a stamp with another ${fieldname}`, async () => {
      const { box, boxStamp, bankKey } = await sealedWorld()
      await expect(unsealByHand(bankKey, box, withChanged(boxStamp, fieldname))).rejects.toThrow()
    })
  }

  for (const fieldname of SealTagFields) {
    it(`a box will not unseal under tags with another ${fieldname}`, async () => {
      const { box, boxStamp, bankKey } = await sealedWorld()
      await expect(unsealByHand(bankKey, box, boxStamp, withChanged(BaseBox.tags, fieldname))).rejects.toThrow()
    })
  }

  it("a box will not unseal under no tags", async () => {
    const { box, boxStamp, bankKey } = await sealedWorld()
    const { key_wrapped } = box.whisper_sealed
    await expect(Crypto.unwrapKeyUnder(bankKey, key_wrapped, Crypto.cipherCtx(boxStamp, BaseBox.purposes.key), DecipherUsage)).rejects.toThrow()
    await expect(Crypto.unwrapKeyUnder(bankKey, key_wrapped, Crypto.cipherCtx(boxStamp, BaseBox.purposes.key, BaseBox.tags), DecipherUsage)).resolves.to.be.instanceOf(CryptoKey)
  })

  it("gives a box's two purposes different ctxs", async () => {
    const { boxStamp } = await sealedWorld()
    expect(textOf(Crypto.cipherCtx(boxStamp, BaseBox.purposes.key, BaseBox.tags))).to.not.eq(textOf(Crypto.cipherCtx(boxStamp, BaseBox.purposes.cipher, BaseBox.tags)))
  })

  it("unwraps a wayin by hand under the stamp and header it was wrapped under", async () => {
    const { stamp, header, wrapped } = await passphraseWayin()
    expect(await passphraseWayinUnwraps(wrapped, stamp, header)).to.be.true
  })

  for (const fieldname of WayinStampFields) {
    it(`a wayin will not unwrap under a stamp with another ${fieldname}`, async () => {
      const { stamp, header, wrapped } = await passphraseWayin()
      expect(await passphraseWayinUnwraps(wrapped, withChanged(stamp, fieldname), header)).to.be.false
    })
  }

  for (const fieldname of PassphraseHeaderFields) {
    it(`a wayin will not unwrap under a header with another ${fieldname}, its key derived as before`, async () => {
      const { stamp, header, wrapped } = await passphraseWayin()
      expect(await passphraseWayinUnwraps(wrapped, stamp, withChanged(header, fieldname), header.salt_b64)).to.be.false
    })
  }

  it("a wayin will not unwrap under its header with its label put back", async () => {
    const { stamp, header, wrapped } = await passphraseWayin()
    expect(await passphraseWayinUnwraps(wrapped, stamp, { ...header, label: 'main' })).to.be.false
  })

  it("unwraps a lease by hand under the stamp it was wrapped under", async () => {
    const { record, stamp } = await leaseRecordOf()
    expect(await leaseUnwraps(record, stamp)).to.be.true
  })

  for (const fieldname of LeaseStampFields) {
    it(`a lease will not unwrap under a stamp with another ${fieldname}`, async () => {
      const { record, stamp } = await leaseRecordOf()
      expect(await leaseUnwraps(record, withChanged(stamp, fieldname))).to.be.false
    })
  }
})

/** A born bank's box, passphrase wayin and lease, then the bank's next life, born by `Bank.birth` on another device over the tombstones of its two roots. */
async function twoLives() {
  const { device, bank, gateRecord, proving } = await TH.buildBornBank()
  const box = await device.vault!.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
  const { lease, record: leaseRecord } = await TH._cheat_grantedLease(proving, TH.fakeLeaseGateOf(), bank.gate.stamp)
  const [life, main, bankKey, root] = [bank.gate.life, bank.gate.main, await TH._cheat_bankKeyOf(bank), bank.rootBox]
  const [gateGone, rootGone] = [TH.gateTombOf(gateRecord), TH.boxTombOf(root)]
  await TH.expectGood(device.vaultDB.tryWriteThing(TH.delAskFor(gateRecord, gateGone)))
  await TH.expectGood(device.vaultDB.tryWriteThing(TH.delAskFor(root, rootGone)))
  const next = TH.makeDevice({ userid: null }, { vaultDB: device.vaultDB })
  await next.signin(TH.WorldScope.userid)
  const reborn = await Bank.birth(next, { passphraseCleartext: TH.TestPassphrase })
  return { box, boxStamp: BaseBox.stampOf(box), lease, leaseRecord, life, main, bankKey, reborn }
}

/** `life` with only its banktok taken from `other`. */
function withBanktokOf(life: GateLife, other: GateLife): GateLife { return { ...life, banktok: other.banktok } }


describe("a bank's next life", () => {
  it("is born after the tombstones, with the next lifeseq and a new banktok", async () => {
    const { life, reborn } = await twoLives()
    expect(reborn.gate.life).to.deep.include({ lifepath: Lifeseq.ofLifenum(2) })
    expect(reborn.gate.life.banktok).to.not.eq(life.banktok)
  })

  it("will not unwrap a wayin of the life before under its gate's life, nor under the old life with only the banktok moved", async () => {
    const { life, main, reborn } = await twoLives()
    const secret = { passphrase: TH.TestPassphrase }
    await expect(TH._cheat_bankKeyBytesOf(life, main, secret)).resolves.to.be.instanceOf(Uint8Array)
    await expect(TH._cheat_bankKeyBytesOf(reborn.gate.life, main, secret)).rejects.toThrow()
    await expect(TH._cheat_bankKeyBytesOf(withBanktokOf(life, reborn.gate.life), main, secret)).rejects.toThrow()
  })

  it("will not unwrap a lease of the life before under the stamp its gate's next life grants, nor with only the banktok moved", async () => {
    const { lease, leaseRecord, reborn } = await twoLives()
    const { banktok, lifepath, born_at, revtok } = reborn.gate.stamp
    expect(await leaseUnwraps(leaseRecord, lease.stamp)).to.be.true
    expect(await leaseUnwraps(leaseRecord, { ...lease.stamp, banktok, gate_lifepath: lifepath, gate_born_at: born_at, gate_revtok: revtok })).to.be.false
    expect(await leaseUnwraps(leaseRecord, { ...lease.stamp, banktok })).to.be.false
  })

  it("will not unseal a box of the life before under its stamp in the next life, nor with only the banktok moved, nor under the next life's bankKey", async () => {
    const { box, boxStamp, bankKey, reborn } = await twoLives()
    const { banktok } = reborn.gate.life
    expect(await unsealByHand(bankKey, box, boxStamp)).to.eq(WhisperText)
    await expect(unsealByHand(bankKey, box, { ...boxStamp, banktok, lifepath: `${reborn.rootBox.lifeseq}/${Life0}` })).rejects.toThrow()
    await expect(unsealByHand(bankKey, box, { ...boxStamp, banktok })).rejects.toThrow()
    await expect(unsealByHand(await TH._cheat_bankKeyOf(reborn), box, boxStamp)).rejects.toThrow()
  })
})
