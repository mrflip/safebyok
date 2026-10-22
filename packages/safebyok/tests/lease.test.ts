import { inspect } from 'node:util'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { BoxFormat, type BoxRecord } from '../src/box'
import { cipherCtx, makeVaultKey, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import { type BoxVisible, Lease, type LeaseStanding, sealLeaseRecord } from '../src/lease'
import { FarFuture, ForeverMillis, MinuteMillis, type LeaseRecord } from '../src/types'
import * as TH from './test-helpers'

const GrantedAt = TH.SliceNow
const HourMillis = 60 * MinuteMillis
const LeaseMillis = 7 * 24 * HourMillis
const Deadline = GrantedAt + LeaseMillis

/** The vault props every lease record here is sealed under: u1's `main` vault, at gate epoch 3. */
const standing: LeaseStanding = { vault_tok: 'vault-tok-u1', gate_epoch: 3 }

/** A slice of u1's `main` vault whose clock reads what `clock.at` holds: GrantedAt, unless a test moves it. */
const vaultAt = (clock?: { at: number }, overrides: Partial<TH.VaultSlice> = {}) => (
  TH.vaultSliceOf('u1', TH.testDeriver, { now: () => clock?.at ?? GrantedAt, ...overrides })
)

/** A lease record sealed for u1 at `GrantedAt` until `Deadline`, and the vaultKey it holds. */
const sealedRecord = async () => {
  const vaultKey = await makeVaultKey()
  const record = await sealLeaseRecord(vaultAt(), standing, vaultKey)
  return { vaultKey, record }
}

/** A vault holding a lease around a fresh vaultKey, granted at `GrantedAt`, its clock reading what `clock.at` holds; the lease, the vault, the key and the clock. */
const leasedVault = async () => {
  const clock = { at: GrantedAt }
  const vaultKey = await makeVaultKey()
  const vault = await TH.leasedSliceOf('u1', vaultKey, { now: () => clock.at })
  const { lease } = vault
  if (lease === null) { throw new Error('expected the vault to hold a lease') }
  return { vault, lease, vaultKey, clock }
}

/** The visible fields of a box in u1's vault: what a lease binds a whisper to. */
const visibleOf = (overrides: Partial<BoxVisible> = {}): BoxVisible => ({
  format:                 BoxFormat,
  boxlabel:               'anthropic_api_key',
  revision_tok:           'revision-one',
  whisper_codec:          'json_v1',
  whisper_schema_version: 1,
  sidecar:                { note: 'work account' },
  registered_at:          GrantedAt,
  written_at:             GrantedAt,
  ...overrides,
})

/** A stand-in for u1's vault, holding a lease of its own: what Lease.make is handed here. */
const standIn = async () => await TH.leasedSliceOf('u1', await makeVaultKey())

const bytesOf = (text: string) => new TextEncoder().encode(text)

describe("sealLeaseRecord", () => {
  it("makes a record whose scope is its vault's, its vault_tok and gate_epoch the vault props', and its deadline leaseMillis from now, as its example shows", async () => {
    const { record } = await sealedRecord()
    expect(record).to.deep.include({ format: 'safebyok-lease-v1', ...TH.scopeOf('u1'), vault_tok: 'vault-tok-u1', gate_epoch: 3, ask_passphrase_at: Deadline })
    expect(record.vault_key_lease_wrapped).to.have.keys(['cipher_iv_b64', 'ciphertext_b64'])
  })

  it("makes its leaseKey non-extractable, so not even this code can export it", async () => {
    const { record } = await sealedRecord()
    expect(record.lease_key).to.be.instanceOf(CryptoKey)
    expect(record.lease_key.extractable).to.be.false
    expect(record.lease_key.usages).to.have.members(['wrapKey', 'unwrapKey'])
    await expect(crypto.subtle.exportKey('raw', record.lease_key)).rejects.toThrow()
  })

  it("makes a fresh leaseKey at each seal", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealLeaseRecord(vaultAt(), standing, vaultKey)
    const two = await sealLeaseRecord(vaultAt(), standing, vaultKey)
    expect(one.lease_key).to.not.eq(two.lease_key)
    expect(one.vault_key_lease_wrapped).to.not.deep.equal(two.vault_key_lease_wrapped)
  })

  it("binds its wrap to the scope, vault_tok, gate_epoch and deadline, under the lease's format and purpose", async () => {
    const { record } = await sealedRecord()
    const leaseCtx = cipherCtx('safebyok-lease-v1', 'acme', 'u1', 'main', 'vault-tok-u1', 3, Deadline, 'vault_key_lease_wrapped')
    const unwrapped = await unwrapKeyUnder(record.lease_key, record.vault_key_lease_wrapped, leaseCtx, { extractable: false, usage: ['wrapKey'] })
    expect(unwrapped).to.be.instanceOf(CryptoKey)
  })

  it("ends at FarFuture for a vault whose leases last until lock(): how leaseHours: Infinity ends", async () => {
    const record = await sealLeaseRecord(vaultAt(undefined, { leaseMillis: ForeverMillis }), standing, await makeVaultKey())
    expect(record.ask_passphrase_at).to.eq(FarFuture)
  })

  for (const [badStanding, blurb] of [
    [{ ...standing, vault_tok: '' },             'vault props with an empty vault_tok'],
    [{ ...standing, gate_epoch: 0 },             'vault props at gate_epoch 0'],
    [TH.omitting(standing, 'gate_epoch'),        'vault props with no gate_epoch'],
  ] as const) {
    it(`throws, as misuse, at ${blurb}: no lease record could hold them`, async () => {
      await expect(sealLeaseRecord(vaultAt(), badStanding as LeaseStanding, await makeVaultKey())).rejects.toThrow(Z.core.$ZodError)
    })
  }

  for (const [at, blurb] of [
    [NaN,              'a clock that reads no number'],
    [GrantedAt + 0.5,  'a clock read with a fraction of a millisecond'],
    [0,                'a clock reading before any lease could be granted'],
  ] as const) {
    it(`throws, as misuse, at ${blurb}: no lease record could hold the deadline`, async () => {
      await expect(sealLeaseRecord(vaultAt({ at }), standing, await makeVaultKey())).rejects.toThrow(Z.core.$ZodError)
    })
  }

  it("takes whole vault props, keeping only their vault_tok and gate_epoch", async () => {
    const whole = TH.vaultPropsOf('u1', { vault_tok: 'vault-tok-u1', gate_epoch: 3 })
    const record = await sealLeaseRecord(vaultAt(), whole, await makeVaultKey())
    expect(record).to.deep.include({ vault_tok: 'vault-tok-u1', gate_epoch: 3 })
    expect(record).to.not.have.property('passphrase')
  })
})

describe("Lease.make", () => {
  it("makes the lease a stored record stands for, unwrapping nothing, as its first example shows", async () => {
    const { record } = await sealedRecord()
    const made = Lease.make(await standIn(), record)
    expect(made.record).to.deep.equal(record)
    expect(made.record.lease_key).to.eq(record.lease_key)
    expect(made.ask_passphrase_at).to.eq(Deadline)
    expect(TH.shownOf(made)).to.deep.equal({ ...TH.scopeOf('u1'), vault_tok: 'vault-tok-u1', gate_epoch: 3, ask_passphrase_at: Deadline })
  })

  it("makes a lease of a damaged wrap all the same: only its first use finds it out", async () => {
    const { record } = await sealedRecord()
    const wrapped = record.vault_key_lease_wrapped
    const made = Lease.make(await standIn(), { ...record, vault_key_lease_wrapped: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } })
    expect(made.vault_tok).to.eq('vault-tok-u1')
  })

  it("keeps its record frozen as record, out of sight, its fields read-only", async () => {
    const { record } = await sealedRecord()
    const made = Lease.make(await standIn(), { ...record })
    expect(Object.isFrozen(made)).to.be.true
    expect(Object.isFrozen(made.record)).to.be.true
    expect(Object.isFrozen(made.record.vault_key_lease_wrapped)).to.be.true
    expect(Reflect.set(made, 'vault_tok', 'other')).to.be.false
  })

  it("shows each visible field once in a key list, JSON and a log line -- which vault it opens and until when -- and neither its leaseKey, its wrap, its format nor the vaultKey", async () => {
    const { record, vaultKey } = await sealedRecord()
    const lease = Lease.make(await standIn(), record)
    const visible = ['applabel', 'user_id', 'vaultlabel', 'vault_tok', 'gate_epoch', 'ask_passphrase_at']
    expect(Object.keys(lease)).to.deep.equal(visible)
    expect(Object.keys(TH.jsonOf(lease))).to.deep.equal(visible)
    expect(lease.toJSON()).to.deep.equal(TH.shownOf(lease))
    const wrapped = lease.record.vault_key_lease_wrapped
    for (const hidden of ['lease_key', 'vault_key_lease_wrapped', 'CryptoKey', 'safebyok-lease', wrapped.ciphertext_b64, wrapped.cipher_iv_b64]) {
      expect(JSON.stringify(lease)).to.not.include(hidden)
      expect(inspect(lease)).to.not.include(hidden)
    }
    expect(inspect(lease).match(/vault_tok/g)).to.have.lengthOf(1)
    const held: unknown[] = [...Object.values(lease) as unknown[], ...Object.values(lease.record) as unknown[]]
    expect(held).to.not.include(vaultKey)
  })

  const MangledCases = [
    // what a device store, or a host's own, might hand back:
    [{ ask_passphrase_at: 'soon' },                'a deadline that is not epoch milliseconds, as its second example shows'],
    [{ lease_key: 'not a key handle' },            'a leaseKey that is no CryptoKey: the record was serialized'],
    [{ format: 'safebyok-lease-v2' },              'a format this version does not write'],
    [{ gate_epoch: 0 },                            'a gate_epoch below one'],
    [{ vault_tok: '' },                            'an empty vault_tok'],
  ] as const

  for (const [spoil, blurb] of MangledCases) {
    it(`refuses ${blurb} as 'corrupt_record'`, async () => {
      const { record } = await sealedRecord()
      const onVault = await standIn()
      const err = TH.expectSyncRefusal(() => Lease.make(onVault, { ...record, ...spoil }), 'corrupt_record')
      expect(err.message).to.not.include('vault-tok-u1')
      expect(err.message).to.not.include(record.vault_key_lease_wrapped.ciphertext_b64)
    })
  }

  it("refuses a record naming another user as 'corrupt_record', as its third example shows: it is another vault's", async () => {
    const { record } = await sealedRecord()
    const onVault = await standIn()
    const err = TH.expectSyncRefusal(() => Lease.make(onVault, { ...record, user_id: 'someone_else' }), 'corrupt_record')
    expect(err.message).to.match(/another app, user or vault/)
    expect(err.message).to.not.include('someone_else')
  })

  it("refuses a lease sealed under another user's vault as 'corrupt_record': no key of it is ever unwrapped here", async () => {
    const theirs = await sealLeaseRecord(vaultAt(undefined, TH.scopeOf('u2')), standing, await makeVaultKey())
    const onVault = await standIn()
    TH.expectSyncRefusal(() => Lease.make(onVault, theirs), 'corrupt_record')
  })

  it("refuses null and a bare string as 'corrupt_record'", async () => {
    const onVault = await standIn()
    TH.expectSyncRefusal(() => Lease.make(onVault, null), 'corrupt_record')
    TH.expectSyncRefusal(() => Lease.make(onVault, 'lease'), 'corrupt_record')
  })
})

describe("lease.cipheredWith and lease.decipherWith", () => {
  it("cipher bytes under a fresh boxKey wrapped under the vaultKey, and decipher them again, bound to the visible fields, as their examples show", async () => {
    const { lease } = await leasedVault()
    const ciphered = await lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
    expect(ciphered).to.have.keys(['box_key_wrapped', 'whisper_ciphered'])
    expect(JSON.stringify(ciphered)).to.not.include('sk-fake')
    const deciphered = await lease.decipherWith(ciphered, visibleOf())
    expect(new TextDecoder().decode(deciphered)).to.eq('"sk-fake"')
  })

  it("wraps the boxKey under the vaultKey, bound to the box's ctx: the scope, the lease's vault_tok, the purpose and every visible field, the sidecar's JSON with keys sorted", async () => {
    const { lease, vaultKey } = await leasedVault()
    const visible = visibleOf({ sidecar: { zeta: 1, alpha: 2 } })
    const ciphered = await lease.cipheredWith(bytesOf('"sk-fake"'), visible)
    const { format, ...header } = visible
    const boxCtx = cipherCtx(format, 'acme', 'u1', 'main', 'vault-tok-u1', 'box_key_wrapped', { ...header, sidecar: '{"alpha":2,"zeta":1}' })
    const boxKey = await unwrapKeyUnder(vaultKey, ciphered.box_key_wrapped, boxCtx, { extractable: false, usage: ['decrypt'] })
    expect(boxKey.usages).to.deep.equal(['decrypt'])
  })

  it("mint a fresh boxKey and cipherIv at every cipher, the same bytes twice included", async () => {
    const { lease } = await leasedVault()
    const one = await lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
    const two = await lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
    expect(two.box_key_wrapped).to.not.deep.equal(one.box_key_wrapped)
    expect(two.whisper_ciphered.ciphertext_b64).to.not.eq(one.whisper_ciphered.ciphertext_b64)
  })

  it("cipher bytes made in another realm, as a jsdom page's or an iframe's are", async () => {
    const { lease } = await leasedVault()
    const foreign = runInNewContext('new Uint8Array([52, 50])') as Uint8Array
    expect(foreign).to.not.be.instanceOf(Uint8Array)
    const ciphered = await lease.cipheredWith(foreign, visibleOf())
    const deciphered = await lease.decipherWith(ciphered, visibleOf())
    expect(new TextDecoder().decode(deciphered)).to.eq('42')
  })

  it("zero the bytes handed to cipheredWith once ciphered", async () => {
    const { lease } = await leasedVault()
    const serialized = bytesOf('"sk-fake"')
    await lease.cipheredWith(serialized, visibleOf())
    expect([...serialized].every((byte) => byte === 0)).to.be.true
  })

  for (const [moved, blurb] of [
    [{ revision_tok: 'revision-two' },        'another revision'],
    [{ boxlabel: 'openai' },                  'another boxlabel'],
    [{ sidecar: { note: 'planted' } },        'a sidecar altered in storage'],
    [{ written_at: GrantedAt + 1 },           'a time altered in storage'],
  ] as const) {
    it(`refuse ciphertext moved to ${blurb} as 'damaged_box', quoting nothing of it`, async () => {
      const { lease } = await leasedVault()
      const ciphered = await lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
      const err = await TH.expectRefusal(lease.decipherWith(ciphered, visibleOf(moved)), 'damaged_box')
      expect(TH.thrownText(err)).to.not.include('sk-fake')
      expect(err.cause).to.be.undefined
    })
  }

  it("refuse 'damaged_box' for a box sealed under another vaultKey", async () => {
    const { lease } = await leasedVault()
    const { lease: another } = await leasedVault()
    const ciphered = await another.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
    await TH.expectRefusal(lease.decipherWith(ciphered, visibleOf()), 'damaged_box')
  })

  it("cipher until the last millisecond before the lease's deadline, then refuse 'vault_locked'", async () => {
    const { lease, clock } = await leasedVault()
    clock.at = Deadline - 1
    const ciphered = await lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
    clock.at = Deadline
    await TH.expectRefusal(lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf()), 'vault_locked')
    await TH.expectRefusal(lease.decipherWith(ciphered, visibleOf()), 'vault_locked')
  })

  it("refuse 'vault_locked' once the vault holds no lease: the demand is lease-bound", async () => {
    const { lease, vault } = await leasedVault()
    vault.lease = null
    await TH.expectRefusal(lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf()), 'vault_locked')
  })

  for (const [moved, refusalkind] of [
    [{ gate_epoch: 2 },              'gate_moved'],
    [{ vault_tok: 'vault-tok-new' }, 'vault_remade'],
  ] as const) {
    it(`refuse '${refusalkind}' once the vault has moved on from the lease's stamp, ciphering nothing`, async () => {
      const { lease, vault } = await leasedVault()
      vault.stamp = vault.stamp === null ? null : { ...vault.stamp, ...moved }
      await TH.expectRefusal(lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf()), refusalkind)
    })
  }

  it("refuse 'vault_locked' after their wait when a lock lands during it, handing nothing back", async () => {
    const { lease, vault } = await leasedVault()
    const ciphering = TH.holdNextCall(crypto.subtle, 'encrypt')
    const sealing = lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
    await ciphering.reached
    vault.lease = null
    ciphering.release()
    await TH.expectRefusal(sealing, 'vault_locked')
  })

  const TamperCases = [
    // what a device store may hand back, which still must not open:
    [(record: LeaseRecord) => Promise.resolve({ ...record, ask_passphrase_at: record.ask_passphrase_at + HourMillis }), 'a deadline moved later where the record is kept'],
    [(record: LeaseRecord) => Promise.resolve({ ...record, vault_key_lease_wrapped: { ...record.vault_key_lease_wrapped, ciphertext_b64: TH.tweakB64(record.vault_key_lease_wrapped.ciphertext_b64) } }), 'a wrap altered where the record is kept'],
    [async (record: LeaseRecord) => {
      const { record: another } = await sealedRecord()
      return { ...record, lease_key: another.lease_key }
    }, "another lease's leaseKey swapped in"],
  ] as const

  for (const [tamper, blurb] of TamperCases) {
    it(`refuse a lease with ${blurb} as 'damaged_lease', quoting nothing of it, and drop it as lock() does`, async () => {
      const { vault, lease } = await leasedVault()
      const tampered = Lease.make(vault, await tamper(lease.record))
      vault.lease = tampered
      const err = await TH.expectRefusal(tampered.cipheredWith(bytesOf('"sk-fake"'), visibleOf()), 'damaged_lease')
      expect(err.message).to.not.include('vault-tok-u1')
      expect(err.cause).to.be.undefined
      expect(vault.locks).to.eq(1)
      expect(vault.lease).to.be.null
    })
  }

  it("refuse 'damaged_lease' for a damaged lease the vault no longer holds without locking: the lease it holds now stands", async () => {
    const { vault, lease } = await leasedVault()
    const wrapped = lease.record.vault_key_lease_wrapped
    const tampered = Lease.make(vault, { ...lease.record, vault_key_lease_wrapped: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } })
    const ciphered = await lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
    await TH.expectRefusal(tampered.decipherWith(ciphered, visibleOf()), 'damaged_lease')
    expect(vault.locks).to.eq(0)
    expect(vault.lease).to.eq(lease)
  })

  it("resolve their answers as an Outcome's val from tryCipheredWith and tryDecipherWith", async () => {
    const { lease } = await leasedVault()
    const ciphered = await TH.expectGood(lease.tryCipheredWith(bytesOf('42'), visibleOf()))
    const bytes = await TH.expectGood(lease.tryDecipherWith(ciphered, visibleOf()))
    expect(new TextDecoder().decode(bytes)).to.eq('42')
    await TH.expectBad(lease.tryDecipherWith(ciphered, visibleOf({ boxlabel: 'openai' })), 'damaged_box')
  })

  it("refuse visible fields that are no box's as 'bad_record', bytes that are no Uint8Array as 'bad_option', and ciphered fields that are no box's as 'bad_record', quoting none of it", async () => {
    const { lease } = await leasedVault()
    const ciphered = await lease.cipheredWith(bytesOf('"sk-fake"'), visibleOf())
    await TH.expectRefusal(lease.cipheredWith(bytesOf('"sk-fake"'), { boxlabel: 'anthropic' } as unknown as BoxVisible), 'bad_record')
    await TH.expectRefusal(lease.cipheredWith('"sk-fake"' as unknown as Uint8Array, visibleOf()), 'bad_option')
    const err = await TH.expectRefusal(lease.decipherWith({ box_key_wrapped: ciphered.box_key_wrapped } as unknown as BoxRecord, visibleOf()), 'bad_record')
    expect(err.message).to.not.include(ciphered.box_key_wrapped.ciphertext_b64)
  })
})

describe("lease.sealProps", () => {
  it("makes the record of the visible fields with the whisper sealed beside them, as its example shows", async () => {
    const { lease } = await leasedVault()
    const record = await lease.sealProps(visibleOf(), { whisper: bytesOf('"sk-fake"') })
    expect(record).to.deep.include(visibleOf())
    expect(record).to.have.keys([...Object.keys(visibleOf()), 'box_key_wrapped', 'whisper_ciphered'])
    const deciphered = await lease.decipherWith(record, visibleOf())
    expect(new TextDecoder().decode(deciphered)).to.eq('"sk-fake"')
  })

  it("resolves the record as an Outcome's val from trySealProps, and refuses as cipheredWith does", async () => {
    const { lease, vault } = await leasedVault()
    await TH.expectGood(lease.trySealProps(visibleOf(), { whisper: bytesOf('1') }))
    vault.lease = null
    await TH.expectBad(lease.trySealProps(visibleOf(), { whisper: bytesOf('1') }), 'vault_locked')
  })

  it("refuses props beside `whisper`, or a whisper that is no bytes, as 'bad_option'", async () => {
    const { lease } = await leasedVault()
    await TH.expectRefusal(lease.sealProps(visibleOf(), { whisper: bytesOf('1'), sidecar: {} } as never), 'bad_option')
    await TH.expectRefusal(lease.sealProps(visibleOf(), { whisper: 'sk-fake' } as never), 'bad_option')
    await TH.expectRefusal(lease.sealProps(visibleOf(), null as never), 'bad_option')
  })

  it("keeps only the visible fields a box record holds, dropping what else it is handed", async () => {
    const { lease } = await leasedVault()
    const record = await lease.sealProps({ ...visibleOf(), note: 'stray' } as BoxVisible, { whisper: bytesOf('1') })
    expect(record).to.not.have.property('note')
  })
})

describe("lease.endsBy", () => {
  it("is true once the lease has ended, as its first example shows", async () => {
    const { lease } = await leasedVault()
    expect(lease.endsBy(GrantedAt)).to.be.false
    expect(lease.endsBy(Deadline - 1)).to.be.false
    expect(lease.endsBy(Deadline)).to.be.true
    expect(lease.endsBy(Deadline + 1)).to.be.true
  })

  it("is true when the lease ends within the hour, as its second example shows", async () => {
    const { lease } = await leasedVault()
    expect(lease.endsBy(Deadline - (2 * HourMillis) + (60 * MinuteMillis))).to.be.false
    expect(lease.endsBy(Deadline - HourMillis + (60 * MinuteMillis))).to.be.true
  })
})

describe("the lease's wrap, by hand", () => {
  it("opens a record wrapped by hand under the ctx a lease is documented to bind: its format, scope, vault_tok, gate_epoch, deadline and purpose", async () => {
    const { vault, vaultKey, lease } = await leasedVault()
    const leaseCtx = cipherCtx('safebyok-lease-v1', 'acme', 'u1', 'main', 'vault-tok-u1', 1, Deadline, 'vault_key_lease_wrapped')
    const byHand = { ...lease.record, vault_key_lease_wrapped: await wrapKeyUnder(lease.record.lease_key, vaultKey, leaseCtx) }
    vault.lease = Lease.make(vault, byHand)
    const ciphered = await vault.lease.cipheredWith(bytesOf('1'), visibleOf())
    expect(ciphered).to.have.keys(['box_key_wrapped', 'whisper_ciphered'])
  })
})
