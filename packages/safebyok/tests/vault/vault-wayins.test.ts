import { describe, it, expect, vi, afterEach } from 'vitest'
import { type PasskeyAnswer, VaultScope } from '../../src/types/types'
import { type GatedVaultRecord, VaultRecord } from '../../src/vault-record'
import { VaultError } from '../../src/errors'
import { type Outcome, bad } from '../../src/outcome'
import { Vault } from '../../src/vault'
import type { Gating, RequestCleartext } from '../../src/gating'
import { memoryDeviceDB } from '../../src/device-db'
import { Bank } from '../../src/bank'
import { toB64 } from '../../src/crypto'
import * as Scopepath from '../../src/scopepath'
import { StrongVerdict, type PassphraseVerdict, type StrengthChecker } from '../../src/passphrase-strength'
import { zxcvbnStrengthChecker } from '../../src/zxcvbn-strength-checker'
import { PasskeyWayin, PassphraseWayin, Wayin } from '../../src/wayin'
import * as TH from '../test-helpers'
import { makeWorld, storedVaultRecordOf, vaultWithPasskey,SevenDaysMillis, u1VaultScopepath, storedWayinOf, addLaptopPasskey, spoilWayin, storedRowOf } from './world'


// == [Passphrase]: countingDeriver, putWayin with a passphrase, the passphrase

/** Everything in the store behind `world`'s vaultDB, as text: what a call that writes nothing leaves exactly as it was. */
const storeDumpOf = (world: ReturnType<typeof makeWorld>): string => JSON.stringify(world.dbStore.scopepaths().map((scopepath) => [scopepath, world.dbStore.read(scopepath)]))

/** `opts` without the vault's names: what Bank.make takes. */
const bankOptsOf = ({ vaultlabel: _vaultlabel, ...bankOpts }: TH.BornVaultOpts) => bankOpts

/** The draft of `u1`'s `main` vault, as a bank takes it. */
const u1Main = { user_id: 'u1', vaultlabel: 'main' } as const

/** A testDeriver that counts its derivations, for an open that should spend few. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

describe("putWayin, with a new passphrase", () => {
  it("refuses an old or new passphrase that is not text with kind 'bad_option', changing nothing (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await TH.expectRefusal(TH.putWayin(vault, undefined as unknown as string, 'new passphrase'), 'bad_option')
    await TH.expectRefusal(TH.putWayin(vault, 'old passphrase', 42 as unknown as string), 'bad_option')
    await world.openUnlocked('old passphrase', { deviceDB: memoryDeviceDB() })
  })

  it("replaces the passphrase, resolving the new one as stored, the vault unlocked, and keeps every box readable, as its first example shows (Contract: putWayin, Returns)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const put = await TH.putWayin(vault, 'old passphrase', 'new passphrase')
    expect(put).to.deep.equal(vault.snapshot.gate?.passphrase)
    expect(put).to.deep.equal({ wayinkind: 'passphrase', device_id: storedWayinOf(world, 'passphrase')?.['device_id'], registered_at: storedWayinOf(world, 'passphrase')?.['registered_at'] })
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })  // a new device: no lease
    await TH.expectRefusal(TH.unlock(fresh, 'old passphrase'), 'wrong_passphrase')
    await TH.unlock(fresh, 'new passphrase')
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("rewrites no box: each stands byte for byte as it was (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const before = storedRowOf(world, 'anthropic')
    await TH.putWayin(vault, 'old passphrase', 'new passphrase')
    expect(storedRowOf(world, 'anthropic')).to.deep.equal(before)
  })

  it("works on a locked vault: the old passphrase is proof enough", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.lock()
    await TH.putWayin(vault, 'old passphrase', 'new passphrase')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
  })

  it("a wrong old passphrase is refused and changes nothing (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('the real passphrase')
    await TH.expectRefusal(TH.putWayin(vault, 'not the passphrase', 'whatever'), 'wrong_passphrase')
    const fresh = await world.openUnlocked('the real passphrase', { deviceDB: memoryDeviceDB() })
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('unlocked')
  })

  it("refuses a new passphrase of only whitespace as weak_passphrase, before the checker or any derivation (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const strengthChecker = vi.fn(TH.anyStrengthChecker)
    const vault = await world.open({ keyDeriver, strengthChecker })
    for (const blank of ['', ' '.repeat(3), '\t\n']) {
      const err = await TH.expectRefusal(TH.putWayin(vault, 'pw', blank), 'weak_passphrase')
      expect(err.message).to.include('empty or only spaces')
    }
    expect(strengthChecker).not.toHaveBeenCalled()
    expect(derivations).not.toHaveBeenCalled()
  })

  it("sets the first passphrase on a novel vault, through initialize_gate, and leaves it unlocked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const gatingkinds: string[] = []
    TH.answering(vault, async (gating) => {
      gatingkinds.push(gating.gatingkind)
      if (gating.gatingkind === 'initialize_gate') { await gating.attempt('first pw') }
    })
    expect(await vault.putWayin('passphrase')).to.eq(vault)
    expect(gatingkinds).to.deep.equal(['initialize_gate'])
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(TH.cheatGetVaultEpoch(vault).gate_epoch).to.eq(1)
    expect(vault.getSnapshot().gate?.passkey).to.be.null
    await world.openUnlocked('first pw', { deviceDB: memoryDeviceDB() })
  })

  it("refuses on a Vault object let go as vault_gone (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    TH.closeVault(vault)
    await TH.expectRefusal(TH.putWayin(vault, 'pw', 'pw two'), 'vault_gone')
    await TH.expectRefusal(TH.delWayin(vault, 'pw'), 'vault_gone')
  })

  it("lands though the vault is deleted elsewhere as storage answers it, but refuses vault_gone: the gone Vault object writes no lease and takes nothing into its picture", async () => {
    const world = makeWorld()
    // Deaf, so only the refresh the test makes finds the vault deleted.
    const deaf = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deaf })
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const leaseBefore = await world.getLease()
    const putLease = vi.spyOn(world.deviceDB, 'putLease')
    const answering = TH.holdNextAnswer(deaf, 'putVaultRecord')
    const putting = TH.tryPutWayin(vault, 'pw', 'pw two')
    await answering.reached
    const shown = vault.getSnapshot()
    await there.refresh()
    // The change stands in storage, its answer held: there proves the deletion with the new passphrase.
    await TH.del(there, 'pw two')
    await TH.expectBad(vault.tryRefresh(), 'vault_gone')
    answering.release()
    await TH.expectBad(putting, 'vault_gone')
    expect(putLease).not.toHaveBeenCalled()
    expect(await world.getLease()).to.deep.equal(leaseBefore)
    expect(vault.getSnapshot().gate).to.eq(shown.gate)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
  })

  it("lands though the bank lets the vault go as the device record is raised after it, but writes no lease, and refuses vault_gone", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const leaseBefore = await world.getLease()
    const putLease = vi.spyOn(world.deviceDB, 'putLease')
    let raising: ReturnType<typeof TH.holdNextCall> | null = null
    // Past the read putWayin makes first, which raises the record too: the raise after its own write.
    TH.beforeNextCall(world.vaultDB, 'putVaultRecord', () => {
      raising = TH.holdNextCall(world.deviceDB, 'raiseDeviceRecord')
      return Promise.resolve()
    })
    const putting = TH.tryPutWayin(vault, 'pw', 'pw two')
    await TH.eventually(() => raising !== null)
    await raising!.reached
    TH.closeVault(vault)
    raising!.release()
    await TH.expectBad(putting, 'vault_gone')
    expect(storedVaultRecordOf(world)['gate_epoch']).to.eq(2)
    expect(putLease).not.toHaveBeenCalled()
    expect(await world.getLease()).to.deep.equal(leaseBefore)
  })

  it("ends every other device's unlock: theirs lapses on the next look (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('old passphrase')
    const thereDeviceDB = memoryDeviceDB()
    const there = await world.openUnlocked('old passphrase', { deviceDB: thereDeviceDB })
    expect(TH.stateOf(there.getSnapshot())).to.eq('unlocked')

    await TH.putWayin(here, 'old passphrase', 'new passphrase')
    expect(storedVaultRecordOf(world)['gate_epoch']).to.eq(2)
    await vi.waitFor(() => { expect(TH.stateOf(there.getSnapshot())).to.eq('locked') })
    // Dropped from memory, erasing nothing; the lease left is outdated, never taken up, and left where it lies.
    const theirLease = () => TH.expectGood(thereDeviceDB.getLease(TH.scopeOf('u1')))
    const outdated = await theirLease()
    expect(outdated).to.not.be.null
    await TH.expectRefusal(there.ensureUnlocked(), 'vault_locked')
    expect(await theirLease()).to.deep.equal(outdated)
  })

  it("takes only the standing passphrase as proof: a passkey's answer is refused as bad_option, changing nothing (Contract: putWayin, Guarantees)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const before = storedVaultRecordOf(world)
    const err = await TH.expectRefusal(TH.putWayin(vault, laptop as unknown as string, 'a new passphrase'), 'bad_option')
    expect(err.message).to.eq('A passphrase is the text the user typed, as a string.')
    expect(err.message).to.not.include(laptop.credential_id)
    expect(storedVaultRecordOf(world)).to.deep.equal(before)
  })

  it("stamps the new passphrase afresh, with this device and this moment (Contract: putWayin, Does 5)", async () => {
    const { world, vault } = await vaultWithPasskey()
    const passkeyBefore = vault.snapshot.gate?.passkey
    world.advance(60_000)
    await TH.putWayin(vault, 'pw', 'a new passphrase')
    expect(vault.snapshot.gate?.passphrase.registered_at).to.eq(world.clock.now())
    expect(vault.snapshot.gate?.passphrase.device_id).to.eq(passkeyBefore?.device_id)
  })

  it("removes the passkey: one passphrase, and a passkey matched to it, which the user adds again under the new passphrase", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await TH.putWayin(vault, 'pw', 'a new passphrase')
    expect(vault.snapshot.gate?.passkey).to.be.null
    expect(storedWayinOf(world, 'passkey')).to.be.null
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(TH.unlock(fresh, laptop), 'absent_wayin')
    await TH.expectRefusal(TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop')), 'wrong_passphrase')
    await TH.putWayin(vault, 'a new passphrase', await TH.passkeyOf('laptop'))
    await TH.unlock(fresh, await TH.passkeyOf('laptop'))
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("starts the lease again from now, and this device's lease follows, so a reload stays unlocked (Contract: putWayin, Does 7)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('first')
    world.advance(60_000)
    await TH.putWayin(vault, 'first', 'second')
    expect(vault.snapshot.ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    const reloaded = await world.open()
    expect(TH.stateOf(reloaded.getSnapshot())).to.eq('unlocked')
  })

  it("proves against the vault record as storage holds it now, not as this device last read it (Contract: putWayin, Does 3)", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await TH.putWayin(there, 'pw', 'pw two')
    await TH.putWayin(here, 'pw two', 'pw three')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(fresh, 'pw three')
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('unlocked')
  })

  it("spends one key derivation on the proof and one on the new passphrase (Contract: putWayin, Does 4 and 5)", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver, deviceDB: memoryDeviceDB() })
    await TH.putWayin(vault, 'pw', 'pw two')
    expect(derivations).toHaveBeenCalledTimes(2)
  })

  it("two devices changing at once: the second write refuses gate_moved once its device heard of the first, and changes nothing (Contract: putWayin, Does 6)", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    // `there` looks at the vault record before `here` writes, and writes after it.
    const realUpdate = world.vaultDB.putVaultRecord.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'putVaultRecord').mockImplementationOnce(async (vaultRecord, expected) => {
      await TH.putWayin(here, 'pw', 'here pw')
      return await realUpdate(vaultRecord, expected)
    })
    await TH.expectRefusal(TH.putWayin(there, 'pw', 'there pw'), 'gate_moved')
    spied.mockRestore()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(TH.unlock(fresh, 'there pw'), 'wrong_passphrase')
    await TH.unlock(fresh, 'here pw')
  })
})

describe("the vault's passphrase", () => {
  it("is made with the vault, stamped with this device and the moment, and shown while locked, with no passkey", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().gate).to.be.null
    await TH.unlock(vault, 'pw')
    await vault.lock()
    const { passphrase, passkey } = vault.getSnapshot().gate ?? {}
    expect(passphrase).to.deep.equal({ wayinkind: 'passphrase', device_id: passphrase?.device_id, registered_at: Date.parse('2026-10-14T12:00:00Z') })
    expect(passphrase?.device_id).to.have.length.greaterThan(0)
    expect(passkey).to.be.null
  })

  it("is tried with one key derivation, however wrong the passphrase", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(TH.unlock(fresh, 'none of them'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
  })

  it("a blank passphrase offered as proof is refused as wrong_passphrase at once, deriving nothing (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await TH.unlock(vault, 'pw')
    await addLaptopPasskey(vault)
    derivations.mockClear()
    await TH.expectRefusal(TH.putWayin(vault, ' '.repeat(2), await TH.passkeyOf('phone')), 'wrong_passphrase')
    await TH.expectRefusal(TH.delWayin(vault, ''), 'wrong_passphrase')
    await TH.expectRefusal(TH.putWayin(vault, '\t', 'pw four'), 'wrong_passphrase')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("stored damaged, is refused as damaged_wayin, deriving nothing, and cannot be changed: only the passkey still opens the vault (Contract: putWayin, Refuses)", async () => {
    const { world, laptop } = await vaultWithPasskey()
    spoilWayin(world, 'passphrase', { salt_b64: 'c2FsdA' })
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    const err = await TH.expectRefusal(TH.unlock(vault, 'pw'), 'damaged_wayin')
    expect(err.message).to.include('passkey')
    await TH.expectRefusal(TH.putWayin(vault, 'pw', 'a new passphrase'), 'damaged_wayin')
    await TH.expectRefusal(TH.putWayin(vault, 'pw', await TH.passkeyOf('phone')), 'damaged_wayin')
    expect(derivations).not.toHaveBeenCalled()
    await TH.unlock(vault, laptop)
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("the backend holds no passphrase, old or new (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.unlock(vault, 'a very memorable passphrase')
    await TH.putWayin(vault, 'a very memorable passphrase', 'another memorable passphrase')
    const everything = world.dbStore.scopepaths().map((scopepath) => world.dbStore.read(scopepath)).join('\n')
    expect(everything).to.not.include('memorable')
  })

  it("vault record in the shape before wayins reads as damaged, and is left as it is", async () => {
    const world = makeWorld()
    const { gate: _gate, ...rest } = TH.vaultRecordOf('u1')
    const oldText = JSON.stringify({ ...rest, format: 'safebyok-vault-v3', key_deriver_label: 'test_digest_v0', passphrase_salt_b64: 'c2FsdA', vault_key_passphrase_wrapped: TH.fakeCiphered('old') })
    const vaultScopepath = Scopepath.vault(TH.scopeOf('u1'))
    world.dbStore.write(vaultScopepath, oldText)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(vaultScopepath)).to.eq(oldText)
  })

  it("vault record in the list shape, safebyok-vault-v4, reads as damaged, and is left as it is", async () => {
    const world = makeWorld()
    const { gate: { passphrase }, ...rest } = TH.vaultRecordOf('u1')
    const listed = { ...passphrase, wayin_id: 'wayin-one', wayinlabel: 'passphrase' }
    const oldText = JSON.stringify({ ...rest, format: 'safebyok-vault-v4', wayins: [listed] })
    world.dbStore.write(u1VaultScopepath, oldText)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(u1VaultScopepath)).to.eq(oldText)
  })
})
// --

// == [Passkey]: the vault's passkey, putWayin with a passkey's answer, delWayin

describe("the vault's passkey", () => {
  it("putWayin with a passkey's answer gives a way in that opens the vault on any device, with no key derivation, as its second example shows", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(vault.snapshot.gate?.passkey?.credential_id).to.eq(laptop.credential_id)
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.unlock(fresh, laptop)
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("putWayin with a passkey's answer spends one key derivation, on the proof, and stamps the passkey with this device and this moment (Contract: putWayin, Does 4 and 5)", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.openUnlocked('pw', { keyDeriver })
    derivations.mockClear()
    world.advance(60_000)
    expect(await TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))).to.deep.equal(vault.snapshot.gate?.passkey)
    expect(derivations).toHaveBeenCalledTimes(1)
    expect(vault.snapshot.gate?.passkey?.registered_at).to.eq(world.clock.now())
    expect(vault.snapshot.gate?.passkey?.device_id).to.eq(vault.snapshot.gate?.passphrase.device_id)
  })

  it("a locked vault shows its passkey with the credential and salt to ask it with", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('locked')
    const shown = fresh.getSnapshot().gate?.passkey
    expect(shown).to.deep.equal({
      wayinkind: 'passkey', device_id: shown?.device_id, registered_at: shown?.registered_at,
      credential_id: laptop.credential_id, prf_salt_b64: laptop.prf_salt_b64,
    })
    expect(shown?.device_id).to.have.length.greaterThan(0)
  })

  it("an unlock with a passkey grants this device a lease until ask_passphrase_at, as a passphrase's does", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const deviceDB = memoryDeviceDB()
    const here = await world.open({ deviceDB })
    await TH.unlock(here, laptop)
    expect(here.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    const reloaded = await world.open({ deviceDB })
    expect(TH.stateOf(reloaded.getSnapshot())).to.eq('unlocked')
    world.advance(SevenDaysMillis)
    const later = await world.open({ deviceDB })
    expect(TH.stateOf(later.getSnapshot())).to.eq('locked')
  })

  it("an unlock refuses another passkey, a wrong answer, and one over another salt as wrong_passkey, and stays locked", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(TH.unlock(fresh, await TH.passkeyOf('stranger')), 'wrong_passkey')
    expect(err.message).to.include("not this vault's")
    await TH.expectRefusal(TH.unlock(fresh, { ...laptop, prfBytes: new Uint8Array(32).fill(7) }), 'wrong_passkey')
    const otherSalt = TH.passkeyWayinOf('any').prf_salt_b64
    await TH.expectRefusal(TH.unlock(fresh, await TH.passkeyOf('laptop', otherSalt)), 'wrong_passkey')
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('locked')
  })

  it("an unlock with a passkey's answer on a vault with no passkey refuses as absent_wayin, and stays locked", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    expect(fresh.snapshot.gate?.passkey).to.be.null
    const err = await TH.expectRefusal(TH.unlock(fresh, await TH.passkeyOf('laptop')), 'absent_wayin')
    expect(err.message).to.include('Unlock with the passphrase')
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('locked')
  })

  it("an unlock with a passkey never gates a vault: a novel one's initialize_gate refuses it as bad_option in place of a passphrase, and stays novel", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const before = storeDumpOf(world)
    const laptop = await TH.passkeyOf('laptop')
    const attempts: Outcome<Vault>[] = []
    TH.answering(vault, async (gating) => {
      if (gating.gatingkind === 'initialize_gate') { attempts.push(await gating.attempt(laptop as unknown as string)) }
    })
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    await TH.expectBad(attempts[0]!, 'bad_option')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
    expect(storeDumpOf(world)).to.eq(before)
  })

  it("refuses putWayin('passkey') on a novel vault absent_vault, asking nothing and writing nothing: the passkey goes beside the first passphrase through ensureUnlocked's initialize_gate", async () => {
    const world = makeWorld()
    const requestCleartext = vi.fn<RequestCleartext>()
    const novel = await world.open({ requestCleartext })
    const writes = vi.spyOn(world.vaultDB, 'putVaultRecord')
    await TH.expectRefusal(novel.putWayin('passkey'), 'absent_vault')
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
    TH.closeVault(novel)
    const vault = await world.open()
    const laptop = await TH.passkeyOf('laptop')
    TH.answering(vault, async (gating) => { await TH.expectGood(TH.asKind(gating, 'initialize_gate').attempt('pw', laptop)) })
    await vault.ensureUnlocked()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(TH.cheatGetVaultEpoch(vault).gate_epoch).to.eq(1)
    expect(vault.snapshot.gate?.passkey?.credential_id).to.eq(laptop.credential_id)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(fresh, await TH.passkeyOf('laptop'))
    await TH.unlock(await world.open({ deviceDB: memoryDeviceDB() }), 'pw')
  })

  it("an unlock with a passphrase tries the passphrase alone: one derivation", async () => {
    const { world } = await vaultWithPasskey()
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(TH.unlock(fresh, 'not it'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
    await TH.unlock(fresh, 'pw')
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('unlocked')
  })

  it("putWayin takes only the standing passphrase as proof of a new passkey: a passkey's answer is bad_option, a wrong passphrase wrong_passphrase, adding nothing (Contract: putWayin, Guarantees)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const before = storedVaultRecordOf(world)
    const phone = await TH.passkeyOf('phone')
    await TH.expectRefusal(TH.putWayin(vault, laptop as unknown as string, phone), 'bad_option')
    await TH.expectRefusal(TH.putWayin(vault, 'not the passphrase', phone), 'wrong_passphrase')
    await TH.expectRefusal(TH.putWayin(vault, ' '.repeat(3), await TH.passkeyOf('phone')), 'wrong_passphrase')
    expect(storedVaultRecordOf(world)).to.deep.equal(before)
  })

  it("putWayin keeps a passkey's answer unspent through a mistyped passphrase, and refuses it as bad_option once used: its bytes were zeroed, and would seal under a key anyone could rebuild", async () => {
    const { world, vault } = await vaultWithPasskey()
    const before = storedVaultRecordOf(world)
    const phone = await TH.passkeyOf('phone')
    await TH.expectRefusal(TH.putWayin(vault, 'not the passphrase', phone), 'wrong_passphrase')
    expect(storedVaultRecordOf(world)).to.deep.equal(before)
    await TH.putWayin(vault, 'pw', phone)
    const put = storedVaultRecordOf(world)
    await TH.expectRefusal(TH.putWayin(vault, 'pw', phone), 'bad_option')
    await vault.lock()
    await TH.expectRefusal(TH.unlock(vault, phone), 'bad_option')
    expect(storedVaultRecordOf(world)).to.deep.equal(put)
  })

  it("putWayin refuses a malformed passkey's answer as bad_option at its door, deriving nothing and adding nothing (Contract: putWayin, Does 1)", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.openUnlocked('pw', { keyDeriver })
    await addLaptopPasskey(vault)
    derivations.mockClear()
    const phone = await TH.passkeyOf('phone')
    const Malformed = [
      [{ ...phone, prf_salt_b64: toB64(new Uint8Array(16)) }, 'a salt of 16 bytes'],
      [{ ...phone, prf_salt_b64: 'not base64url!' },          'a salt that is not base64url'],
      [{ ...phone, prfBytes: new Uint8Array(16) },          'an answer of 16 bytes'],
      [{ ...phone, credential_id: '' },                      'no credential'],
      [undefined,                                           'nothing at all'],
      [42,                                                  'a number'],
      [() => phone,                                         'a function that would make one'],
    ] as const
    for (const [answer, blurb] of Malformed) {
      const err = await TH.expectRefusal(TH.putWayin(vault, 'pw', answer as unknown as PasskeyAnswer), 'bad_option')
      expect(err.message, blurb).to.not.include(phone.credential_id)
    }
    expect(derivations).not.toHaveBeenCalled()
    const laptop = await TH.passkeyOf('laptop')
    expect(vault.snapshot.gate?.passkey?.credential_id).to.eq(laptop.credential_id)
  })

  it("a second passkey replaces the first: the first no longer opens the vault, and the snapshot shows the second", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const phone = await TH.passkeyOf('phone')
    expect(await TH.putWayin(vault, 'pw', phone)).to.deep.equal(vault.snapshot.gate?.passkey)
    expect(vault.snapshot.gate?.passkey?.credential_id).to.eq(phone.credential_id)
    expect(storedVaultRecordOf(world)['gate_epoch']).to.eq(3)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(TH.unlock(fresh, laptop), 'wrong_passkey')
    // Each answer's bytes are zeroed once used: the authenticator answers afresh at each ask.
    await TH.unlock(fresh, await TH.passkeyOf('phone'))
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("a passkey stored damaged is refused as damaged_wayin, told as news, and mended by putting the passkey again", async () => {
    const { world, laptop } = await vaultWithPasskey()
    spoilWayin(world, 'passkey', { prf_salt_b64: 'c2FsdA' })
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    expect(vault.snapshot.trouble?.refusalkind).to.eq('damaged_wayin')
    await TH.expectRefusal(TH.unlock(vault, laptop), 'damaged_wayin')
    await TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))
    await vault.lock()
    await TH.unlock(vault, await TH.passkeyOf('laptop'))
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("putWayin with a passkey refuses as gate_moved when another device changed the ways in meanwhile and this one heard of it, writing nothing (Contract: putWayin, Refuses)", async () => {
    const { world, vault } = await vaultWithPasskey()
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const realUpdate = world.vaultDB.putVaultRecord.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'putVaultRecord').mockImplementationOnce(async (vaultRecord, expected) => {
      await TH.putWayin(elsewhere, 'pw', 'pw two')
      return await realUpdate(vaultRecord, expected)
    })
    await TH.expectRefusal(TH.putWayin(vault, 'pw', await TH.passkeyOf('phone')), 'gate_moved')
    spied.mockRestore()
    // The other device's new passphrase took the laptop's passkey with it, and the phone's never landed.
    expect(storedWayinOf(world, 'passkey')).to.be.null
  })

  it("a passkey's answer of the wrong shape is refused as misuse wherever it is a proof, never quoting it", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const misshapen = { ...laptop, prfBytes: [...laptop.prfBytes] } as unknown as PasskeyAnswer
    const asProof = misshapen as unknown as string
    const phone = await TH.passkeyOf('phone')
    // Locked, so the unlock is tried; each in turn, as each raises a gating of its own.
    await vault.lock()
    for (const refused of [() => TH.unlock(vault, misshapen), () => TH.putWayin(vault, asProof, 'pw two'), () => TH.putWayin(vault, asProof, phone), () => TH.putWayin(vault, 'pw', misshapen), () => TH.delWayin(vault, asProof)]) {
      const err = await TH.expectRefusal(refused(), 'bad_option')
      expect(err.message).to.not.include(laptop.credential_id)
      expect(err.message).to.not.include(laptop.prfBytes.join(','))
    }
    await TH.expectRefusal(TH.unlock(vault, undefined as unknown as string), 'bad_option')
  })

  it("delWayin takes the passkey away, resolving the vault: it no longer opens the vault, as its example shows (Contract: delWayin, Returns)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    expect(await TH.delWayin(vault, 'pw')).to.eq(vault)
    expect(vault.snapshot.gate?.passkey).to.be.null
    expect(storedWayinOf(world, 'passkey')).to.be.null
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(TH.unlock(fresh, laptop), 'absent_wayin')
    await TH.unlock(fresh, 'pw')
  })

  it("delWayin refuses absent_wayin on a vault with no passkey before any derivation, a wrong passphrase, and a passkey's answer as proof, removing nothing (Contract: delWayin, Does 3)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await TH.expectRefusal(TH.delWayin(vault, 'not the passphrase'), 'wrong_passphrase')
    await TH.expectRefusal(TH.delWayin(vault, laptop as unknown as string), 'bad_option')
    expect(vault.snapshot.gate?.passkey?.credential_id).to.eq(laptop.credential_id)
    await TH.delWayin(vault, 'pw')
    const { keyDeriver, derivations } = countingDeriver()
    const bare = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    const err = await TH.expectRefusal(TH.delWayin(bare, 'pw'), 'absent_wayin')
    expect(err.message).to.include('no passkey to remove')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("every change of the passkey moves the epoch: another device locks, and this one stays unlocked (Contract: delWayin, Guarantees)", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await addLaptopPasskey(here)
    await vi.waitFor(() => { expect(TH.stateOf(there.getSnapshot())).to.eq('locked') })
    await TH.unlock(there, await TH.passkeyOf('laptop'))
    await TH.delWayin(here, 'pw')
    await vi.waitFor(() => { expect(TH.stateOf(there.getSnapshot())).to.eq('locked') })
    expect(storedVaultRecordOf(world)['gate_epoch']).to.eq(3)
    expect(TH.stateOf(here.getSnapshot())).to.eq('unlocked')
  })

  it("the backend holds no passkey's answer, only its credential and salt (Contract: putWayin, Guarantees)", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const everything = world.dbStore.scopepaths().map((scopepath) => world.dbStore.read(scopepath)).join('\n')
    expect(everything).to.not.include(toB64(laptop.prfBytes))
    expect(everything).to.include(laptop.credential_id)
    expect(everything).to.include(laptop.prf_salt_b64)
  })

  it("removal is not revocation: a copy of the vault record from before still opens with the removed passkey (Contract: delWayin, Guarantees)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const kept = world.dbStore.read(u1VaultScopepath) ?? ''
    await TH.delWayin(vault, 'pw')
    const copy = makeWorld()
    copy.dbStore.write(u1VaultScopepath, kept)
    const thief = await copy.open()
    await TH.unlock(thief, laptop)
    expect(TH.stateOf(thief.getSnapshot())).to.eq('unlocked')
  })
})
// --

// == [Passphrase strength]: refusing, refusingTinyLater, a new passphrase's strength

/** A strengthChecker that refuses `weakOne` and admits the rest, counting its calls. */
const refusing = (weakOne: string) => vi.fn((passphrase: string): PassphraseVerdict => (
  passphrase === weakOne ? { strong: false, reason: 'That one is on every list of guesses: try another.' } : { strong: true }
))

/** A strengthChecker that answers later, refusing a passphrase of two characters or fewer. */
const refusingTinyLater = async (passphrase: string): Promise<PassphraseVerdict> => {
  await Promise.resolve()
  return passphrase.length > 2 ? { strong: true } : { strong: false, reason: 'Found in a breach: pick another.' }
}

describe("a new passphrase's strength", () => {

  it("without a strengthChecker, refuses every new passphrase as too weak, writing nothing, its message pointing the app's makers to CUSTOMIZATION.md", async () => {
    const world = makeWorld()
    const vault = await world.open({ strengthChecker: undefined })
    const before = storeDumpOf(world)
    const err = await TH.expectRefusal(TH.unlock(vault, 'correct horse battery staple'), 'weak_passphrase')
    expect(err.message).to.include("can't take a new passphrase yet")
    expect(err.message).to.match(/strengthChecker/)
    expect(err.message).to.match(/CUSTOMIZATION\.md/)
    expect(err.message).to.not.include('correct horse')
    await TH.expectRefusal(TH.unlock(vault, 'another long passphrase'), 'weak_passphrase')
    expect(storeDumpOf(world)).to.eq(before)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("without a strengthChecker, refuses a new passphrase at putWayin too, while a vault that stands still opens", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const vault = await world.open({ strengthChecker: undefined, deviceDB: memoryDeviceDB() })
    await TH.unlock(vault, 'pw')
    const err = await TH.expectRefusal(TH.putWayin(vault, 'pw', 'a long new passphrase'), 'weak_passphrase')
    expect(err.message).to.match(/CUSTOMIZATION\.md/)
    expect(world.logged.filter((heard) => heard.level === 'error')).to.have.lengthOf(0)
  })

  it("with zxcvbnStrengthChecker, refuses a common password, or one made of the vault's own names, writing nothing", async () => {
    const world = makeWorld()
    const vault = await world.open({ strengthChecker: zxcvbnStrengthChecker, applabel: 'skylark', vaultlabel: 'pinecone' })
    const before = storeDumpOf(world)
    const err = await TH.expectRefusal(TH.unlock(vault, 'password1234'), 'weak_passphrase')
    expect(err.message).to.match(/commonly used password/)
    expect(err.message).to.not.include('password1234')
    await TH.expectRefusal(TH.unlock(vault, 'skylarkpinecone'), 'weak_passphrase')
    expect(storeDumpOf(world)).to.eq(before)
    await TH.unlock(vault, 'correct horse battery staple')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
  })

  it("never runs at unlock: a vault that stands opens with whatever passphrase made it", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const strengthChecker = refusing('pw')
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), strengthChecker })
    await TH.unlock(fresh, 'pw')
    expect(TH.stateOf(fresh.getSnapshot())).to.eq('unlocked')
    expect(strengthChecker).not.toHaveBeenCalled()
  })

  it("runs the host's checker on the passphrase a vault is created with, its reason the refusal's message", async () => {
    const world = makeWorld()
    const strengthChecker = refusing('acme acme acme')
    const vault = await world.open({ strengthChecker })
    const before = storeDumpOf(world)
    const err = await TH.expectRefusal(TH.unlock(vault, 'acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('That one is on every list of guesses: try another.')
    expect(storeDumpOf(world)).to.eq(before)
    await TH.unlock(vault, 'pw')
    expect(strengthChecker.mock.calls).to.deep.equal([['acme acme acme', TH.scopeOf('u1')], ['pw', TH.scopeOf('u1')]])
  })

  it("hands the host's checker the vault's scope frozen, so the checker can change nothing of the vault's", async () => {
    const world = makeWorld()
    const heard: VaultScope[] = []
    const strengthChecker = (_passphrase: string, scope: VaultScope): PassphraseVerdict => {
      heard.push(scope)
      return { strong: true }
    }
    const vault = await world.open({ strengthChecker })
    await TH.unlock(vault, 'pw')
    expect(Object.isFrozen(heard[0])).to.be.true
    expect(() => { Object.assign(heard[0] ?? {}, { user_id: 'u2' }) }).to.throw(TypeError)
    expect(heard[0]).to.deep.equal(TH.scopeOf('u1'))
    expect(vault.getSnapshot()).to.deep.include(TH.scopeOf('u1'))
  })

  it("refuses a weak passphrase at putWayin before any key derivation, changing nothing (Contract: putWayin, Does 2)", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver, strengthChecker: refusing('acme acme acme') })
    const before = await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))
    const err = await TH.expectRefusal(TH.putWayin(vault, 'pw', 'acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('That one is on every list of guesses: try another.')
    expect(derivations).not.toHaveBeenCalled()
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.deep.equal(before)
  })

  it("never puts a passkey's answer to the checker: it judges passphrases alone", async () => {
    const world = makeWorld()
    const strengthChecker = vi.fn(TH.anyStrengthChecker)
    const vault = await world.openUnlocked('pw', { strengthChecker })
    strengthChecker.mockClear()
    await TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))
    expect(strengthChecker).not.toHaveBeenCalled()
  })

  it("awaits a host's checker that answers a promise", async () => {
    const world = makeWorld()
    const vault = await world.open({ strengthChecker: refusingTinyLater })
    await TH.expectRefusal(TH.unlock(vault, 'pw'), 'weak_passphrase')
    await TH.unlock(vault, 'pw longer')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
  })

  it("refuses at Bank.make, in its schema's words, a strengthChecker that is not a function, or whose load is not one", () => {
    const world = makeWorld()
    for (const misfit of [12, null, 'zxcvbn', { strong: true }, Object.assign(() => StrongVerdict, { load: 'soon' })]) {
      const err = TH.expectSyncRefusal(() => Bank.make(bankOptsOf(world.optsWith({ strengthChecker: misfit as unknown as StrengthChecker }))), 'bad_option')
      expect(err.message).to.match(/^In Bank\.make's options: strengthChecker: expected a function .* browserOpts\(\)/)
    }
  })

  it("asks the host's checker as vault.checkStrength, told the vault's scope: a weak one weak_passphrase, its reason the message", async () => {
    const world = makeWorld()
    const checker = refusing('acme acme acme')
    const vault = await world.open({ strengthChecker: checker })
    const err = await TH.expectRefusal(vault.checkStrength('acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('That one is on every list of guesses: try another.')
    await vault.checkStrength('pw')
    expect(checker.mock.calls).to.deep.equal([['acme acme acme', TH.scopeOf('u1')], ['pw', TH.scopeOf('u1')]])
  })

  it("finds a blank passphrase weak before the checker hears it", async () => {
    const world = makeWorld()
    const checker = refusing('acme acme acme')
    const vault = await world.open({ strengthChecker: checker })
    const err = await TH.expectRefusal(vault.checkStrength(' '.repeat(3)), 'weak_passphrase')
    expect(err.message).to.include("can't be empty")
    expect(checker).not.toHaveBeenCalled()
  })

  it("refuses checkStrength anything but text as 'bad_option', never a TypeError", async () => {
    const world = makeWorld()
    const checker = refusing('acme acme acme')
    const vault = await world.open({ strengthChecker: checker })
    for (const misfit of [42, undefined, null, { passphrase: 'pw' }]) {
      const err = await TH.expectRefusal(vault.checkStrength(misfit as unknown as string), 'bad_option')
      expect(err.message).to.match(/checkStrength takes the passphrase/)
    }
    expect(checker).not.toHaveBeenCalled()
  })

  it("checks without a hello, and reads nothing", async () => {
    const world = makeWorld()
    const load = vi.fn(() => Promise.resolve())
    const vault = await world.open({ strengthChecker: Object.assign(() => StrongVerdict, { load }) })
    const getVault = vi.spyOn(world.vaultDB, 'getVault')
    const ensureVault = vi.spyOn(world.vaultDB, 'ensureVault')
    await vault.checkStrength('pw')
    expect(getVault).not.toHaveBeenCalled()
    expect(ensureVault).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it("runs the checker's load at the bank's hello, never at Bank.make, and never again once it succeeds", async () => {
    const world = makeWorld()
    const load = vi.fn(() => Promise.resolve())
    const strengthChecker = Object.assign(() => StrongVerdict, { load })
    const bank = Bank.make(bankOptsOf(world.optsWith({ strengthChecker })))
    expect(load).not.toHaveBeenCalled()
    const vault = await bank.ensureVault(u1Main)
    expect(load).toHaveBeenCalledTimes(1)
    await vault.hello({ staleMinutes: 0 })
    await bank.ensureVault({ vaultlabel: 'spare' })
    await bank.hello()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("reads storage for a birth only once the checker's load has succeeded", async () => {
    const world = makeWorld()
    const gate = TH.makeLatch()
    const ensureVault = vi.spyOn(world.vaultDB, 'ensureVault')
    const strengthChecker = Object.assign(() => StrongVerdict, { load: gate.pass })
    const bank = Bank.make(bankOptsOf(world.optsWith({ strengthChecker })))
    const birth = bank.tryEnsureVault(u1Main)
    await gate.reached
    await TH.wakeupAtNextTick()
    expect(ensureVault).not.toHaveBeenCalled()
    expect(await Promise.race([birth, TH.wakeupAtNextTick()])).to.be.undefined
    gate.release()
    expect(await birth).to.have.property('ok', true)
    expect(ensureVault).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })

  it("fails a birth whose checker's load fails as unexpected_error, what it threw the cause, bearing nothing, and loads again at the next ask", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw')
    TH.closeVault(first)
    const lost = new Error('the word list did not load')
    const load = vi.fn<() => Promise<void>>().mockRejectedValueOnce(lost).mockResolvedValue(undefined)
    const strengthChecker = Object.assign(() => StrongVerdict, { load })
    const bank = Bank.make(bankOptsOf(world.optsWith({ strengthChecker })))
    const err = await TH.expectRefusal(bank.ensureVault(u1Main), 'unexpected_error')
    expect(err.message).to.match(/strengthChecker's load\(\) failed/)
    expect(err.cause).to.eq(lost)
    expect(bank.snapshot.lifecycle).to.eq('refused')
    const neverLoads = Object.assign(() => StrongVerdict, { load: () => Promise.reject(lost) })
    await TH.expectRefusal(world.open({ strengthChecker: neverLoads }), 'unexpected_error')
    const vault = await bank.ensureVault(u1Main)
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("refuses a birth as its load failed, never reading storage", async () => {
    const world = makeWorld()
    const lost = new Error('the word list did not load')
    const ensureVault = vi.spyOn(world.vaultDB, 'ensureVault')
    const err = await TH.expectRefusal(world.open({ strengthChecker: Object.assign(() => StrongVerdict, { load: () => Promise.reject(lost) }) }), 'unexpected_error')
    expect(err.cause).to.eq(lost)
    expect(ensureVault).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("refuses at Bank.make the option's old name as any option it does not take, naming the options it takes", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ passphraseStrengthTest: TH.anyStrengthChecker } as unknown as Partial<TH.BornVaultOpts>), 'bad_option')
    expect(err.message).to.include('There is a field it does not take').and.include('strengthChecker')
    expect(err.message).to.not.include('passphraseStrengthTest')
  })

  it("refuses a checker that answers no verdict as 'bad_option', as any refusal, from a first unlock too, writing nothing and telling no news", async () => {
    const world = makeWorld()
    const told: VaultError[] = []
    const misfit = await world.open({ strengthChecker: (() => 'weak') as unknown as StrengthChecker, onBadNews: (news) => { told.push(news) } })
    const before = storeDumpOf(world)
    const err = await TH.expectBad(TH.tryUnlock(misfit, 'pw'), 'bad_option')
    expect(err.message).to.match(/strengthChecker handed to Bank\.make answered something other than a verdict/)
    await TH.expectRefusal(misfit.checkStrength('pw'), 'bad_option')
    expect(storeDumpOf(world)).to.eq(before)
    expect(told).to.have.lengthOf(0)
  })

  it("refuses a broken checker from tryPutWayin too, changing nothing stored", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const before = await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))
    const vault = await world.open({ strengthChecker: () => Promise.reject(new Error('down')), deviceDB: memoryDeviceDB() })
    await TH.expectBad(TH.tryPutWayin(vault, 'pw', 'a new passphrase'), 'unexpected_error')
    expect(await TH.vaultRecordIn(world.vaultDB, TH.scopeOf('u1'))).to.deep.equal(before)
  })

  it("refuses a broken checker from a gating's attempt, which requestCleartext sees, and the call that raised it, writing nothing", async () => {
    const world = makeWorld()
    const attempts: Outcome<Vault>[] = []
    const requestCleartext = async (gating: Gating) => {
      if (gating.gatingkind === 'initialize_gate') { attempts.push(await gating.attempt('pw')) }
    }
    const vault = await world.open({ strengthChecker: () => Promise.reject(new Error('down')), requestCleartext })
    const before = storeDumpOf(world)
    await TH.expectBad(vault.tryEnsureUnlocked(), 'unexpected_error')
    await TH.expectBad(attempts[0]!, 'unexpected_error')
    expect(storeDumpOf(world)).to.eq(before)
  })

  const Throws = [
    [new Error('the strength service is down: pw'),                      'an Error'],
    [new VaultError('storage_unavailable', 'Could not load: pw'),        'a condition'],
    [new VaultError('bad_option', 'pw is no passphrase I can judge.'),   'a misuse'],
  ] as const

  for (const [thrown, blurb] of Throws) {
    it(`refuses a checker that throws ${blurb} as 'unexpected_error' naming strengthChecker, from a first unlock too, carrying no kind, meta or cause of the throw, writing nothing`, async () => {
      const world = makeWorld()
      const broken = await world.open({ strengthChecker: () => Promise.reject(thrown) })
      const before = storeDumpOf(world)
      const err = await TH.expectBad(TH.tryUnlock(broken, 'pw'), 'unexpected_error')
      expect(err.message).to.match(/strengthChecker handed to Bank\.make threw/)
      expect(err.cause).to.be.undefined
      expect(err.meta).to.be.undefined
      expect(err.message).to.not.include('meta.')
      expect(err).to.not.eq(thrown)
      expect(storeDumpOf(world)).to.eq(before)
    })
  }
})
// --

// == [Ways in as models]: passphrase, passkey, logger, clock, keyDeriver, damaged_wayin news

/** A world whose `u1` vault stands with its passphrase and the passkey `laptop`, the passkey's salt spoiled in storage. */
const damagedWayinWorld = async () => {
  const { world, vault } = await vaultWithPasskey()
  TH.closeVault(vault)
  spoilWayin(world, 'passkey', { prf_salt_b64: 'c2FsdA' })
  return world
}

/** An onBadNews that keeps what it is told. */
const newsKeeper = () => {
  const told: VaultError[] = []
  return { told, onBadNews: (news: VaultError) => { told.push(news) } }
}

/** Every string a stored way in's salt and wrapped vaultKey hold: what an offline guess at its passphrase starts from. */
const guessFodderOf = (world: ReturnType<typeof makeWorld>): string[] => (['passphrase', 'passkey'] as const).flatMap((wayinkind) => {
  const record = storedWayinOf(world, wayinkind)
  if (record === null) { return [] }
  return [record['salt_b64'], ...Object.values(record['vault_key_wayin_wrapped'] as Record<string, unknown>)].filter((val): val is string => typeof val === 'string')
})

describe("the vault's ways in, as models (Contract: Vault, Wayin)", () => {
  it("shows its passphrase and passkey in its gate, the snapshot's own, with no salt, key deriver label or wrapped vaultKey", async () => {
    const { world, vault } = await vaultWithPasskey()
    expect(vault.snapshot.gate?.passphrase).to.eq(vault.getSnapshot().gate?.passphrase)
    expect(vault.snapshot.gate?.passkey).to.eq(vault.getSnapshot().gate?.passkey)
    expect([vault.snapshot.gate?.passphrase.wayinkind, vault.snapshot.gate?.passkey?.wayinkind]).to.deep.equal(['passphrase', 'passkey'])
    for (const summary of [vault.snapshot.gate?.passphrase, vault.snapshot.gate?.passkey]) {
      expect(summary).to.not.be.instanceOf(Wayin)
      expect(Object.keys(summary ?? {})).to.not.include.members(['salt_b64', 'key_deriver_label', 'vault_key_wayin_wrapped', 'vault_tok'])
    }
    const fodder = guessFodderOf(world)
    expect(fodder).to.have.lengthOf.at.least(4)
    const shown = [JSON.stringify(vault.getSnapshot()), JSON.stringify([vault.snapshot.gate?.passphrase, vault.snapshot.gate?.passkey])]
    for (const secretish of fodder) {
      expect(shown.some((json) => json.includes(secretish)), secretish).to.be.false
    }
  })

  it("shows no vault record, on the handle or in its snapshot: its ways in's salts and wraps are the vault's alone", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect('props' in vault.getSnapshot()).to.be.false
    expect(Reflect.get(vault, 'props')).to.be.undefined
    await vault.lock()
    const fodder = guessFodderOf(world)
    expect(fodder.some((secretish) => JSON.stringify(vault.getSnapshot()).includes(secretish))).to.be.false
  })

  it("makes its ways in from the vault record as storage holds it, told apart by wayinkind, as the PassphraseWayin's and PasskeyWayin's examples show", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const stored = VaultRecord.parse(storedVaultRecordOf(world)) as GatedVaultRecord
    const passphrase = Wayin.make(stored, stored.gate.passphrase, { keyDeriver: TH.testDeriver })
    const passkey = Wayin.make(stored, stored.gate.passkey ?? TH.passkeyWayinOf('none'), { keyDeriver: TH.testDeriver })
    expect([passphrase.constructor, passkey.constructor]).to.deep.equal([PassphraseWayin, PasskeyWayin])
    const wayins: (PassphraseWayin | PasskeyWayin)[] = [passphrase, passkey]
    const told = wayins.map((wayin) => (wayin instanceof PassphraseWayin ? wayin.record.key_deriver_label : wayin.credential_id))
    expect(told).to.deep.equal([TH.testDeriver.key_deriver_label, laptop.credential_id])
    // A way in shows its gate's sparse shape, and the vault_tok its wrap is bound to.
    const { gate } = vault.snapshot
    expect([TH.shownOf(passphrase), TH.shownOf(passkey)]).to.deep.equal([{ ...gate?.passphrase, vault_tok: vault.vault_tok }, { ...gate?.passkey, vault_tok: vault.vault_tok }])
  })

  it("keeps the same gate, and its ways in, until the ways in change", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const before = vault.snapshot.gate
    await vault.hello({ staleMinutes: 0 })
    expect(vault.snapshot.gate).to.eq(before)
    await addLaptopPasskey(vault)
    expect(vault.snapshot.gate).to.not.eq(before)
    expect(vault.snapshot.gate?.passkey).to.not.be.null
    expect(vault.snapshot.gate?.passphrase).to.deep.equal(before?.passphrase)
  })

  it("has no gate, so no passphrase and no passkey, until its first passphrase is set", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.snapshot.gate).to.be.null
  })

  it("shows its logger, and no key deriver, none writable", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault).to.not.have.property('keyDeriver')
    expect(vault.logger).to.be.an('object')
    for (const field of ['logger', 'keyDeriver', 'passphrase', 'passkey']) {
      expect(Reflect.set(vault, field, null), field).to.be.false
    }
  })

  it("tells a way in stored damaged as damaged_wayin news, its summary in meta.wayin_listed, and the read succeeds", async () => {
    const world = await damagedWayinWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews, deviceDB: memoryDeviceDB() })
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_wayin'])
    expect(told[0]?.meta?.wayin_listed).to.deep.equal({ ...vault.snapshot.gate?.passkey, vault_tok: vault.vault_tok })
    expect(told[0]?.family).to.eq('bad_news')
    expect(vault.snapshot.trouble).to.eq(told[0])
    await TH.unlock(vault, 'pw')
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
  })

  it("tells a damaged way in once, not again at each read that finds it as it was", async () => {
    const world = await damagedWayinWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews })
    await vault.hello({ staleMinutes: 0 })
    await vault.hello({ staleMinutes: 0 })
    expect(told).to.have.lengthOf(1)
    expect(vault.snapshot.trouble).to.eq(told[0])
  })

  it("clears the trouble once a read finds the damaged way in gone", async () => {
    const world = await damagedWayinWorld()
    const { onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews })
    await TH.delWayin(vault, 'pw')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.snapshot.trouble).to.be.null
    expect(vault.snapshot.gate?.passkey).to.be.null
  })

  it("never quotes a passphrase in the news, nor its salt", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a memorable passphrase')
    TH.closeVault(vault)
    spoilWayin(world, 'passphrase', { salt_b64: 'c2FsdA' })
    const { told, onBadNews } = newsKeeper()
    const reopened = await world.open({ onBadNews })
    expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_wayin'])
    expect(told[0]?.meta?.wayin_listed).to.deep.equal({ ...reopened.snapshot.gate?.passphrase, vault_tok: reopened.vault_tok })
    const said = JSON.stringify({ message: told[0]?.message, meta: told[0]?.meta })
    expect(said).to.not.include('memorable')
    expect(said).to.not.include('c2FsdA')
  })
})
// --

// == [Refusals at a change]: Changes, each refusal at putWayin and at delWayin, unchanged

/** Each change to the ways in, proven by the passphrase `pw` on a vault that has a passkey to remove. */
const Changes: readonly (readonly [string, (vault: Vault) => Promise<unknown>])[] = [
  ['putWayin(), a new passphrase', (vault) => TH.putWayin(vault, 'pw', 'pw two')],
  ['putWayin(), a new passkey',    async (vault) => await TH.putWayin(vault, 'pw', await TH.passkeyOf('phone'))],
  ['delWayin()',                   (vault) => TH.delWayin(vault, 'pw')],
]

/** The vault record as the backend holds it, as text: what a refused change leaves exactly as it was. */
const storedText = (world: ReturnType<typeof makeWorld>) => world.dbStore.read(u1VaultScopepath)

describe("a change to the ways in, refused, changes nothing stored (Contract: putWayin and delWayin, Refuses)", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("delWayin() refuses absent_wayin on a novel vault, which has no passkey yet, asking nothing and writing nothing", async () => {
    const world = makeWorld()
    const requestCleartext = vi.fn()
    const vault = await world.open({ requestCleartext })
    const before = storeDumpOf(world)
    await TH.expectRefusal(vault.delWayin('passkey'), 'absent_wayin')
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(storeDumpOf(world)).to.eq(before)
  })

  for (const [callTitle, change] of Changes) {

    it(`${callTitle} refuses damaged_wayin when the passphrase is stored damaged, deriving nothing`, async () => {
      const { world } = await vaultWithPasskey()
      spoilWayin(world, 'passphrase', { salt_b64: 'c2FsdA' })
      const before = storedText(world)
      const { keyDeriver, derivations } = countingDeriver()
      const vault = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
      await TH.expectRefusal(change(vault), 'damaged_wayin')
      expect(derivations).not.toHaveBeenCalled()
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} refuses gate_moved when another device's change lands first and this device hears of it, leaving that change standing, and carrying no stored vault record`, async () => {
      const { world, vault: there } = await vaultWithPasskey()
      const here = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
      let landed: string | null = null
      // `there` proves against the vault record before `here` writes, and writes after it.
      const realPut = world.vaultDB.putVaultRecord.bind(world.vaultDB)
      vi.spyOn(world.vaultDB, 'putVaultRecord').mockImplementationOnce(async (vaultRecord, expected) => {
        await TH.putWayin(here, 'pw', 'here pw')
        landed = storedText(world)
        return await realPut(vaultRecord, expected)
      })
      const err = await TH.expectRefusal(change(there), 'gate_moved')
      expect(err.meta).to.be.undefined
      expect(storedText(world)).to.eq(landed)
    })

    it(`${callTitle} refuses storage_unavailable when the write cannot reach the backend`, async () => {
      const { world, vault } = await vaultWithPasskey()
      const before = storedText(world)
      vi.spyOn(world.vaultDB, 'putVaultRecord').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The backend could not be reached: try again shortly.')))
      await TH.expectRefusal(change(vault), 'storage_unavailable')
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} refuses unknown_key_deriver under a key deriver the vault was not made with`, async () => {
      const { world } = await vaultWithPasskey()
      const before = storedText(world)
      const alien = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' } })
      await TH.expectRefusal(change(alien), 'unknown_key_deriver')
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} refuses unexpected_error when the key deriver throws, keeping nothing of what it threw`, async () => {
      const { world } = await vaultWithPasskey()
      const before = storedText(world)
      const thrown = new Error('could not derive from pw')
      const vault = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) } })
      const err = await TH.expectRefusal(change(vault), 'unexpected_error')
      expect(err.cause).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('could not derive')
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} refuses damaged_vault when the vault record it reads fails its checks`, async () => {
      const { world, vault } = await vaultWithPasskey()
      world.dbStore.write(u1VaultScopepath, JSON.stringify({ ...storedVaultRecordOf(world), gate_epoch: 'one' }))
      const before = storedText(world)
      await TH.expectRefusal(change(vault), 'damaged_vault')
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} refuses newer_format when the vault record it reads is of a form a newer safebyok writes`, async () => {
      const { world, vault } = await vaultWithPasskey()
      world.dbStore.write(u1VaultScopepath, JSON.stringify({ ...storedVaultRecordOf(world), format: 'safebyok-vault-v9' }))
      const before = storedText(world)
      await TH.expectRefusal(change(vault), 'newer_format')
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} changes nothing when storage holds a vault record older than the one in hand, and is refused`, async () => {
      const { world, vault } = await vaultWithPasskey()
      const older = storedText(world) ?? ''
      await TH.putWayin(vault, 'pw', 'pw newer')
      await TH.putWayin(vault, 'pw newer', 'pw')
      world.dbStore.write(u1VaultScopepath, older)
      let refused: unknown = null
      try {
        await change(vault)
      } catch (err) {
        refused = err
      }
      // The older copy is refused as behind what this device has seen, or the newer in hand has no passkey to remove.
      expect(refused).to.have.property('refusalkind').that.is.oneOf(['vault_behind', 'absent_wayin'])
      expect(storedText(world)).to.eq(older)
    })

    it(`${callTitle} refuses identity_revoked when storage says the user signed out, and locks`, async () => {
      const { world, vault } = await vaultWithPasskey()
      const before = storedText(world)
      vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('identity_revoked', 'No one is signed in: sign in, then try again.')))
      await TH.expectRefusal(change(vault), 'identity_revoked')
      expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
      expect(storedText(world)).to.eq(before)
    })
  }

  it("putWayin() throws bad_option when the strengthChecker answers no verdict for the new passphrase", async () => {
    const { world } = await vaultWithPasskey()
    const before = storedText(world)
    const vault = await world.open({ deviceDB: memoryDeviceDB(), strengthChecker: (() => 'weak') as unknown as StrengthChecker })
    const err = await TH.expectRefusal(TH.putWayin(vault, 'pw', 'pw two'), 'bad_option')
    expect(err.message).to.match(/strengthChecker/)
    expect(storedText(world)).to.eq(before)
  })

  it("putWayin() throws unexpected_error when the strengthChecker throws, carrying nothing of the throw", async () => {
    const { world } = await vaultWithPasskey()
    const before = storedText(world)
    const vault = await world.open({ deviceDB: memoryDeviceDB(), strengthChecker: () => Promise.reject(new Error('could not judge pw two')) })
    const err = await TH.expectRefusal(TH.putWayin(vault, 'pw', 'pw two'), 'unexpected_error')
    expect(err.message).to.match(/strengthChecker handed to Bank\.make threw/)
    expect(err.cause).to.be.undefined
    expect(storedText(world)).to.eq(before)
  })
})

describe("putWayin and delWayin, as the Contract's lesser lines say", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("a replaced passphrase still opens a copy of the vault record taken before: a change is no revocation (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const kept = storedText(world) ?? ''
    await TH.putWayin(vault, 'pw', 'pw two')
    const copy = makeWorld()
    copy.dbStore.write(u1VaultScopepath, kept)
    const thief = await copy.open()
    await TH.unlock(thief, 'pw')
    expect(TH.stateOf(thief.getSnapshot())).to.eq('unlocked')
  })

  it("a replaced passkey still opens a copy of the vault record taken before (Contract: putWayin, Guarantees)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const kept = storedText(world) ?? ''
    await TH.putWayin(vault, 'pw', await TH.passkeyOf('phone'))
    const copy = makeWorld()
    copy.dbStore.write(u1VaultScopepath, kept)
    const thief = await copy.open()
    await TH.unlock(thief, laptop)
    expect(TH.stateOf(thief.getSnapshot())).to.eq('unlocked')
  })

  it("logs no passphrase, old or new, nor a passkey's answer, even when this device cannot keep its lease (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a memorable old passphrase')
    TH.spyOnDeviceHook(world.deviceDB, 'putLease').mockRejectedValue(new Error('device storage is full'))
    const phone = await TH.passkeyOf('phone')
    await TH.putWayin(vault, 'a memorable old passphrase', 'a memorable new passphrase')
    await TH.putWayin(vault, 'a memorable new passphrase', phone)
    await TH.expectRefusal(TH.putWayin(vault, 'not the memorable one', 'a memorable third'), 'wrong_passphrase')
    expect(world.logged).to.have.lengthOf(2)
    const said = TH.loggedText(world.logged)
    expect(said).to.not.include('memorable')
    expect(said).to.not.include(toB64(phone.prfBytes))
  })

  it("refuses a misshapen proof before any read of storage, the only refusal before an await (Contract: putWayin, Does 1)", async () => {
    const { world, vault } = await vaultWithPasskey()
    const getVaultRecord = vi.spyOn(world.vaultDB, 'getVault')
    const getLease = vi.spyOn(world.deviceDB, 'getLease')
    await TH.expectRefusal(TH.putWayin(vault, 42 as unknown as string, 'pw two'), 'bad_option')
    await TH.expectRefusal(TH.putWayin(vault, 'pw', { credential_id: 'x' } as unknown as PasskeyAnswer), 'bad_option')
    await TH.expectRefusal(TH.delWayin(vault, null as unknown as string), 'bad_option')
    expect(getVaultRecord).not.toHaveBeenCalled()
    expect(getLease).not.toHaveBeenCalled()
  })

  it("delWayin proves against the vault record as storage holds it now, not as this device last read it (Contract: delWayin, Does 2)", async () => {
    const { world } = await vaultWithPasskey()
    const here = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB(), deviceDB: memoryDeviceDB() })
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await TH.putWayin(there, 'pw', 'pw two')
    await TH.putWayin(there, 'pw two', await TH.passkeyOf('phone'))
    await TH.delWayin(here, 'pw two')
    expect(storedWayinOf(world, 'passkey')).to.be.null
  })

  it("delWayin spends one key derivation, on the proof (Contract: delWayin, Does 4)", async () => {
    const { world } = await vaultWithPasskey()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver, deviceDB: memoryDeviceDB() })
    await TH.delWayin(vault, 'pw')
    expect(derivations).toHaveBeenCalledTimes(1)
  })
})
// --

describe("vault.checkStrength", () => {
  it("refuses a weak passphrase as weak_passphrase, the checker's reason its message, as its first example shows", async () => {
    const vault = await makeWorld({ strengthChecker: () => ({ strong: false, reason: 'Too easy to guess.' }) }).open()
    const err = await TH.expectRefusal(vault.checkStrength('chosen'), 'weak_passphrase')
    expect(err.message).to.eq('Too easy to guess.')
  })

  it("resolves for a strong one, as its second example shows", async () => {
    const vault = await makeWorld().open()
    const checked = await vault.tryCheckStrength('correct horse battery staple')
    expect(checked).to.deep.eq({ ok: true, val: undefined })
    await vault.checkStrength('correct horse battery staple')
  })

  it("refuses a blank passphrase as weak_passphrase, and one that is not text as bad_option; tryCheckStrength resolves each as its Outcome, its weak one's message the hint, as its third example shows", async () => {
    const vault = await makeWorld().open()
    const blank = ' '.repeat(3)
    await TH.expectRefusal(vault.checkStrength(blank), 'weak_passphrase')
    await TH.expectRefusal(vault.checkStrength(42 as unknown as string), 'bad_option')
    const weak = await vault.tryCheckStrength(blank)
    expect(weak.err?.refusalkind).to.eq('weak_passphrase')
    expect(weak.err?.message).to.include("can't be empty")
    const strong = await vault.tryCheckStrength('fine passphrase')
    expect(strong.ok).to.be.true
  })
})
