import { describe, it, expect, vi, afterEach } from 'vitest'
import { type PasskeyAnswer, VaultProps, VaultScope } from '../../src/types'
import { VaultError } from '../../src/errors'
import { type Outcome, bad } from '../../src/outcome'
import { Vault } from '../../src/vault'
import type { Ask } from '../../src/ask'
import { memoryDeviceDB } from '../../src/device-db'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { toB64 } from '../../src/crypto'
import * as Ckeys from '../../src/ckeys'
import { StrongVerdict, type PassphraseVerdict, type StrengthChecker } from '../../src/passphrase-strength'
import { zxcvbnStrengthChecker } from '../../src/zxcvbn-strength-checker'
import { PasskeyWayin, PassphraseWayin, Wayin } from '../../src/wayin'
import * as TH from '../test-helpers'
import { makeWorld, damagedVaultWorld, storedVaultPropsOf, vaultWithPasskey,SevenDaysMillis, u1VaultPropsCkey, storedWayinOf, addLaptopPasskey, spoilWayin, storedRowOf } from './world'


// == [Passphrase]: countingDeriver, putWayin with a passphrase, the passphrase

/** A testDeriver that counts its derivations, for an open that should spend few. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

describe("putWayin, with a new passphrase", () => {
  it("refuses an old or new passphrase that is not text with kind 'bad_option', changing nothing (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await TH.expectRefusal(vault.putWayin(undefined as unknown as string, 'new passphrase'), 'bad_option')
    await TH.expectRefusal(vault.putWayin('old passphrase', 42 as unknown as string), 'bad_option')
    await world.openUnlocked('old passphrase', { deviceDB: memoryDeviceDB() })
  })

  it("replaces the passphrase, resolving the new one as stored, the vault unlocked, and keeps every box readable, as its first example shows (Contract: putWayin, Returns)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.putBox('anthropic', 'sk-fake')
    const put = await vault.putWayin('old passphrase', 'new passphrase')
    expect(put).to.deep.equal(vault.passphrase)
    expect(put).to.deep.equal({ wayinkind: 'passphrase', device_id: storedWayinOf(world, 'passphrase')?.['device_id'], registered_at: storedWayinOf(world, 'passphrase')?.['registered_at'], vault_id: vault.vault_id })
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })  // a new device: no lease
    await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("rewrites no box: each stands byte for byte as it was (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.putBox('anthropic', 'sk-fake')
    const before = storedRowOf(world, 'anthropic')
    await vault.putWayin('old passphrase', 'new passphrase')
    expect(storedRowOf(world, 'anthropic')).to.deep.equal(before)
  })

  it("works on a locked vault: the old passphrase is proof enough", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.lock()
    await vault.putWayin('old passphrase', 'new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a wrong old passphrase is refused and changes nothing (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('the real passphrase')
    await TH.expectRefusal(vault.putWayin('not the passphrase', 'whatever'), 'wrong_passphrase')
    const fresh = await world.openUnlocked('the real passphrase', { deviceDB: memoryDeviceDB() })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("refuses a new passphrase of only whitespace as weak_passphrase, before the checker or any derivation (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const strengthChecker = vi.fn(TH.anyStrengthChecker)
    const vault = await world.open({ keyDeriver, strengthChecker })
    for (const blank of ['', ' '.repeat(3), '\t\n']) {
      const err = await TH.expectRefusal(vault.putWayin('pw', blank), 'weak_passphrase')
      expect(err.message).to.include('empty or only spaces')
    }
    expect(strengthChecker).not.toHaveBeenCalled()
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses on a vault that does not exist yet (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(vault.putWayin('old', 'new'), 'absent_vault')
  })

  it("refuses on a closed handle as vault_closed (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vault.close()
    await TH.expectRefusal(vault.putWayin('pw', 'pw two'), 'vault_closed')
    await TH.expectRefusal(vault.delWayin('pw'), 'vault_closed')
  })

  it("ends every other device's unlock: theirs lapses on the next look (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('old passphrase')
    const thereDeviceDB = memoryDeviceDB()
    const there = await world.openUnlocked('old passphrase', { deviceDB: thereDeviceDB })
    expect(there.getSnapshot().state).to.eq('unlocked')

    await here.putWayin('old passphrase', 'new passphrase')
    expect(storedVaultPropsOf(world)['unlock_epoch']).to.eq(2)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(await TH.expectGood(thereDeviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }))).to.be.null
  })

  it("takes only the standing passphrase as proof: a passkey's answer is refused as bad_option, changing nothing (Contract: putWayin, Guarantees)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const before = storedVaultPropsOf(world)
    const err = await TH.expectRefusal(vault.putWayin(laptop as unknown as string, 'a new passphrase'), 'bad_option')
    expect(err.message).to.include('only the passphrase proves a change')
    expect(err.message).to.not.include(laptop.credentialId)
    expect(storedVaultPropsOf(world)).to.deep.equal(before)
  })

  it("stamps the new passphrase afresh, with this device and this moment (Contract: putWayin, Does 5)", async () => {
    const { world, vault } = await vaultWithPasskey()
    const passkeyBefore = vault.passkey
    world.advance(60_000)
    await vault.putWayin('pw', 'a new passphrase')
    expect(vault.passphrase?.registered_at).to.eq(world.clock.now())
    expect(vault.passphrase?.device_id).to.eq(passkeyBefore?.device_id)
  })

  it("removes the passkey: one passphrase, and a passkey matched to it, which the user adds again under the new passphrase", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.putWayin('pw', 'a new passphrase')
    expect(vault.passkey).to.be.null
    expect(storedWayinOf(world, 'passkey')).to.be.null
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'absent_wayin')
    await TH.expectRefusal(vault.putWayin('pw', laptop), 'wrong_passphrase')
    await vault.putWayin('a new passphrase', laptop)
    await fresh.unlock(laptop)
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("starts the lease again from now, and this device's lease follows, so a reload stays unlocked (Contract: putWayin, Does 7)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('first')
    world.advance(60_000)
    await vault.putWayin('first', 'second')
    expect(vault.askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    const reloaded = await world.open()
    expect(reloaded.getSnapshot().state).to.eq('unlocked')
  })

  it("proves against the vault props as storage holds them now, not as this device last read them (Contract: putWayin, Does 3)", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await there.putWayin('pw', 'pw two')
    await here.putWayin('pw two', 'pw three')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('pw three')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("spends one key derivation on the proof and one on the new passphrase (Contract: putWayin, Does 4 and 5)", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver, deviceDB: memoryDeviceDB() })
    await vault.putWayin('pw', 'pw two')
    expect(derivations).toHaveBeenCalledTimes(2)
  })

  it("two devices changing at once: the second write is stale, and changes nothing (Contract: putWayin, Does 6)", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    // `there` looks at the vault props before `here` writes, and writes after it.
    const realUpdate = world.vaultDB.putVaultProps.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'putVaultProps').mockImplementationOnce(async (vaultProps, expected) => {
      await here.putWayin('pw', 'here pw')
      return await realUpdate(vaultProps, expected)
    })
    await TH.expectRefusal(there.putWayin('pw', 'there pw'), 'stale_write')
    spied.mockRestore()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('there pw'), 'wrong_passphrase')
    await fresh.unlock('here pw')
  })
})

describe("the vault's passphrase", () => {
  it("is made with the vault, stamped with this device and the moment, and shown while locked, with no passkey", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().passphrase).to.be.null
    await vault.unlock('pw')
    await vault.lock()
    const { passphrase, passkey } = vault.getSnapshot()
    expect(passphrase).to.deep.equal({ wayinkind: 'passphrase', device_id: passphrase?.device_id, registered_at: Date.parse('2026-10-14T12:00:00Z'), vault_id: vault.vault_id })
    expect(passphrase?.device_id).to.have.length.greaterThan(0)
    expect(passkey).to.be.null
  })

  it("is tried with one key derivation, however wrong the passphrase", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('none of them'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
  })

  it("a blank passphrase offered as proof is refused as wrong_passphrase at once, deriving nothing (Contract: putWayin, Refuses)", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await vault.unlock('pw')
    await addLaptopPasskey(vault)
    derivations.mockClear()
    await TH.expectRefusal(vault.putWayin(' '.repeat(2), await TH.passkeyOf('phone')), 'wrong_passphrase')
    await TH.expectRefusal(vault.delWayin(''), 'wrong_passphrase')
    await TH.expectRefusal(vault.putWayin('\t', 'pw four'), 'wrong_passphrase')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("stored damaged, is refused as damaged_wayin, deriving nothing, and cannot be changed: only the passkey still opens the vault (Contract: putWayin, Refuses)", async () => {
    const { world, laptop } = await vaultWithPasskey()
    spoilWayin(world, 'passphrase', { salt_b64: 'c2FsdA' })
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    const err = await TH.expectRefusal(vault.unlock('pw'), 'damaged_wayin')
    expect(err.message).to.include('passkey')
    await TH.expectRefusal(vault.putWayin('pw', 'a new passphrase'), 'damaged_wayin')
    await TH.expectRefusal(vault.putWayin('pw', await TH.passkeyOf('phone')), 'damaged_wayin')
    expect(derivations).not.toHaveBeenCalled()
    await vault.unlock(laptop)
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("the backend holds no passphrase, old or new (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('a very memorable passphrase')
    await vault.putWayin('a very memorable passphrase', 'another memorable passphrase')
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('memorable')
  })

  it("vault props in the shape before wayins read as damaged, and are left as they are", async () => {
    const world = makeWorld()
    const { passphrase: _passphrase, passkey: _passkey, ...rest } = TH.vaultPropsOf('u1')
    const oldText = JSON.stringify({ ...rest, format: 'safebyok-vault-v3', key_deriver_label: 'test_digest_v0', passphrase_salt_b64: 'c2FsdA', vault_key_passphrase_wrapped: TH.fakeCiphered('old') })
    const vaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))
    world.dbStore.write(vaultPropsCkey, oldText)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(vaultPropsCkey)).to.eq(oldText)
  })

  it("vault props in the list shape, safebyok-vault-v4, read as damaged, and are left as they are", async () => {
    const world = makeWorld()
    const { passphrase, passkey: _passkey, ...rest } = TH.vaultPropsOf('u1')
    const listed = { ...passphrase, wayin_id: 'wayin-one', wayinlabel: 'passphrase' }
    const oldText = JSON.stringify({ ...rest, format: 'safebyok-vault-v4', wayins: [listed] })
    world.dbStore.write(u1VaultPropsCkey, oldText)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(oldText)
  })
})
// --

// == [Passkey]: the vault's passkey, putWayin with a passkey's answer, delWayin

describe("the vault's passkey", () => {
  it("putWayin with a passkey's answer gives a way in that opens the vault on any device, with no key derivation, as its second example shows", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.passkey?.credential_id).to.eq(laptop.credentialId)
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await fresh.unlock(laptop)
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("putWayin with a passkey's answer spends one key derivation, on the proof, and stamps the passkey with this device and this moment (Contract: putWayin, Does 4 and 5)", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.openUnlocked('pw', { keyDeriver })
    derivations.mockClear()
    world.advance(60_000)
    expect(await vault.putWayin('pw', await TH.passkeyOf('laptop'))).to.deep.equal(vault.passkey)
    expect(derivations).toHaveBeenCalledTimes(1)
    expect(vault.passkey?.registered_at).to.eq(world.clock.now())
    expect(vault.passkey?.device_id).to.eq(vault.passphrase?.device_id)
  })

  it("a locked vault shows its passkey with the credential and salt to ask it with", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    expect(fresh.getSnapshot().state).to.eq('locked')
    const shown = fresh.getSnapshot().passkey
    expect(shown).to.deep.equal({
      wayinkind: 'passkey', device_id: shown?.device_id, registered_at: shown?.registered_at, vault_id: fresh.vault_id,
      credential_id: laptop.credentialId, prf_salt_b64: laptop.prfSaltB64,
    })
    expect(shown?.device_id).to.have.length.greaterThan(0)
  })

  it("an unlock with a passkey grants this device a lease until askPassphraseAt, as a passphrase's does", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const deviceDB = memoryDeviceDB()
    const here = await world.open({ deviceDB })
    await here.unlock(laptop)
    expect(here.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    const reloaded = await world.open({ deviceDB })
    expect(reloaded.getSnapshot().state).to.eq('unlocked')
    world.advance(SevenDaysMillis)
    const later = await world.open({ deviceDB })
    expect(later.getSnapshot().state).to.eq('locked')
  })

  it("an unlock refuses another passkey, a wrong answer, and one over another salt as wrong_passkey, and stays locked", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('stranger')), 'wrong_passkey')
    expect(err.message).to.include("not this vault's")
    await TH.expectRefusal(fresh.unlock({ ...laptop, prfBytes: new Uint8Array(32).fill(7) }), 'wrong_passkey')
    const otherSalt = TH.passkeyWayinOf('any').prf_salt_b64
    await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('laptop', otherSalt)), 'wrong_passkey')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("an unlock with a passkey's answer on a vault with no passkey refuses as absent_wayin, and stays locked", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    expect(fresh.passkey).to.be.null
    const err = await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('laptop')), 'absent_wayin')
    expect(err.message).to.include('Unlock with the passphrase')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("an unlock with a passkey never creates a vault: an absent one refuses as absent_vault", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(vault.unlock(await TH.passkeyOf('laptop')), 'absent_vault')
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
  })

  it("an unlock with a passphrase tries the passphrase alone: one derivation", async () => {
    const { world } = await vaultWithPasskey()
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('not it'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("putWayin takes only the standing passphrase as proof of a new passkey: a passkey's answer is bad_option, a wrong passphrase wrong_passphrase, adding nothing (Contract: putWayin, Guarantees)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const before = storedVaultPropsOf(world)
    const phone = await TH.passkeyOf('phone')
    await TH.expectRefusal(vault.putWayin(laptop as unknown as string, phone), 'bad_option')
    await TH.expectRefusal(vault.putWayin('not the passphrase', phone), 'wrong_passphrase')
    await TH.expectRefusal(vault.putWayin(' '.repeat(3), phone), 'wrong_passphrase')
    expect(storedVaultPropsOf(world)).to.deep.equal(before)
  })

  it("putWayin refuses a malformed passkey's answer as bad_option at its door, deriving nothing and adding nothing (Contract: putWayin, Does 1)", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.openUnlocked('pw', { keyDeriver })
    await addLaptopPasskey(vault)
    derivations.mockClear()
    const phone = await TH.passkeyOf('phone')
    const Malformed = [
      [{ ...phone, prfSaltB64: toB64(new Uint8Array(16)) }, 'a salt of 16 bytes'],
      [{ ...phone, prfSaltB64: 'not base64url!' },          'a salt that is not base64url'],
      [{ ...phone, prfBytes: new Uint8Array(16) },          'an answer of 16 bytes'],
      [{ ...phone, credentialId: '' },                      'no credential'],
      [undefined,                                           'nothing at all'],
      [42,                                                  'a number'],
      [() => phone,                                         'a function that would make one'],
    ] as const
    for (const [answer, blurb] of Malformed) {
      const err = await TH.expectRefusal(vault.putWayin('pw', answer as unknown as PasskeyAnswer), 'bad_option')
      expect(err.message, blurb).to.not.include(phone.credentialId)
    }
    expect(derivations).not.toHaveBeenCalled()
    const laptop = await TH.passkeyOf('laptop')
    expect(vault.passkey?.credential_id).to.eq(laptop.credentialId)
  })

  it("a second passkey replaces the first: the first no longer opens the vault, and the snapshot shows the second", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const phone = await TH.passkeyOf('phone')
    expect(await vault.putWayin('pw', phone)).to.deep.equal(vault.passkey)
    expect(vault.passkey?.credential_id).to.eq(phone.credentialId)
    expect(storedVaultPropsOf(world)['unlock_epoch']).to.eq(3)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'wrong_passkey')
    await fresh.unlock(phone)
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("a passkey stored damaged is refused as damaged_wayin, told as news, and mended by putting the passkey again", async () => {
    const { world, laptop } = await vaultWithPasskey()
    spoilWayin(world, 'passkey', { prf_salt_b64: 'c2FsdA' })
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    expect(vault.trouble?.refusalkind).to.eq('damaged_wayin')
    await TH.expectRefusal(vault.unlock(laptop), 'damaged_wayin')
    await vault.putWayin('pw', laptop)
    await vault.lock()
    await vault.unlock(laptop)
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("putWayin with a passkey refuses as stale_write when another device changed the ways in meanwhile, writing nothing (Contract: putWayin, Refuses)", async () => {
    const { world, vault } = await vaultWithPasskey()
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const realUpdate = world.vaultDB.putVaultProps.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'putVaultProps').mockImplementationOnce(async (vaultProps, expected) => {
      await elsewhere.putWayin('pw', 'pw two')
      return await realUpdate(vaultProps, expected)
    })
    await TH.expectRefusal(vault.putWayin('pw', await TH.passkeyOf('phone')), 'stale_write')
    spied.mockRestore()
    // The other device's new passphrase took the laptop's passkey with it, and the phone's never landed.
    expect(storedWayinOf(world, 'passkey')).to.be.null
  })

  it("a passkey's answer of the wrong shape is refused as misuse wherever it is a proof, never quoting it", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const misshapen = { ...laptop, prfBytes: [...laptop.prfBytes] } as unknown as PasskeyAnswer
    const asProof = misshapen as unknown as string
    const phone = await TH.passkeyOf('phone')
    for (const refused of [vault.unlock(misshapen), vault.putWayin(asProof, 'pw two'), vault.putWayin(asProof, phone), vault.putWayin('pw', misshapen), vault.delWayin(asProof)]) {
      const err = await TH.expectRefusal(refused, 'bad_option')
      expect(err.message).to.not.include(laptop.credentialId)
      expect(err.message).to.not.include(laptop.prfBytes.join(','))
    }
    await TH.expectRefusal(vault.unlock(undefined as unknown as string), 'bad_option')
  })

  it("delWayin takes the passkey away, resolving the vault: it no longer opens the vault, as its example shows (Contract: delWayin, Returns)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    expect(await vault.delWayin('pw')).to.eq(vault)
    expect(vault.passkey).to.be.null
    expect(storedWayinOf(world, 'passkey')).to.be.null
    expect(vault.getSnapshot().state).to.eq('unlocked')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'absent_wayin')
    await fresh.unlock('pw')
  })

  it("delWayin refuses absent_wayin on a vault with no passkey before any derivation, a wrong passphrase, and a passkey's answer as proof, removing nothing (Contract: delWayin, Does 3)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await TH.expectRefusal(vault.delWayin('not the passphrase'), 'wrong_passphrase')
    await TH.expectRefusal(vault.delWayin(laptop as unknown as string), 'bad_option')
    expect(vault.passkey?.credential_id).to.eq(laptop.credentialId)
    await vault.delWayin('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const bare = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    const err = await TH.expectRefusal(bare.delWayin('pw'), 'absent_wayin')
    expect(err.message).to.include('no passkey to remove')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("every change of the passkey moves the epoch: another device locks, and this one stays unlocked (Contract: delWayin, Guarantees)", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await addLaptopPasskey(here)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    await there.unlock(await TH.passkeyOf('laptop'))
    await here.delWayin('pw')
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(storedVaultPropsOf(world)['unlock_epoch']).to.eq(3)
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("the backend holds no passkey's answer, only its credential and salt (Contract: putWayin, Guarantees)", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include(toB64(laptop.prfBytes))
    expect(everything).to.include(laptop.credentialId)
    expect(everything).to.include(laptop.prfSaltB64)
  })

  it("removal is not revocation: a copy of the vault props from before still opens with the removed passkey (Contract: delWayin, Guarantees)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const kept = world.dbStore.read(u1VaultPropsCkey) ?? ''
    await vault.delWayin('pw')
    const copy = makeWorld()
    copy.dbStore.write(u1VaultPropsCkey, kept)
    const thief = await copy.open()
    await thief.unlock(laptop)
    expect(thief.getSnapshot().state).to.eq('unlocked')
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

  it("without a strengthChecker, refuses every new passphrase as too weak, creating nothing, its message pointing the app's makers to CUSTOMIZATION.md", async () => {
    const world = makeWorld()
    const vault = await world.open({ strengthChecker: undefined })
    const err = await TH.expectRefusal(vault.unlock('correct horse battery staple'), 'weak_passphrase')
    expect(err.message).to.include("can't take a new passphrase yet")
    expect(err.message).to.match(/strengthChecker/)
    expect(err.message).to.match(/CUSTOMIZATION\.md/)
    expect(err.message).to.not.include('correct horse')
    await TH.expectRefusal(vault.unlock('another long passphrase'), 'weak_passphrase')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("without a strengthChecker, refuses a new passphrase at putWayin too, while a vault that stands still opens", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const vault = await world.open({ strengthChecker: undefined, deviceDB: memoryDeviceDB() })
    await vault.unlock('pw')
    const err = await TH.expectRefusal(vault.putWayin('pw', 'a long new passphrase'), 'weak_passphrase')
    expect(err.message).to.match(/CUSTOMIZATION\.md/)
    expect(world.logged.filter((heard) => heard.level === 'error')).to.have.lengthOf(0)
  })

  it("with zxcvbnStrengthChecker, refuses a common password, or one made of the vault's own names, creating nothing", async () => {
    const world = makeWorld()
    const vault = await world.open({ strengthChecker: zxcvbnStrengthChecker, applabel: 'skylark', vaultlabel: 'pinecone' })
    const err = await TH.expectRefusal(vault.unlock('password1234'), 'weak_passphrase')
    expect(err.message).to.match(/commonly used password/)
    expect(err.message).to.not.include('password1234')
    await TH.expectRefusal(vault.unlock('skylarkpinecone'), 'weak_passphrase')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    await vault.unlock('correct horse battery staple')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("never runs at unlock: a vault that stands opens with whatever passphrase made it", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const strengthChecker = refusing('pw')
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), strengthChecker })
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
    expect(strengthChecker).not.toHaveBeenCalled()
  })

  it("runs the host's checker on the passphrase a vault is created with, its reason the refusal's message", async () => {
    const world = makeWorld()
    const strengthChecker = refusing('acme acme acme')
    const vault = await world.open({ strengthChecker })
    const err = await TH.expectRefusal(vault.unlock('acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('That one is on every list of guesses: try another.')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    await vault.unlock('pw')
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
    await vault.unlock('pw')
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
    const before = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
    const err = await TH.expectRefusal(vault.putWayin('pw', 'acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('That one is on every list of guesses: try another.')
    expect(derivations).not.toHaveBeenCalled()
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(before)
  })

  it("never puts a passkey's answer to the checker: it judges passphrases alone", async () => {
    const world = makeWorld()
    const strengthChecker = vi.fn(TH.anyStrengthChecker)
    const vault = await world.openUnlocked('pw', { strengthChecker })
    strengthChecker.mockClear()
    await vault.putWayin('pw', await TH.passkeyOf('laptop'))
    expect(strengthChecker).not.toHaveBeenCalled()
  })

  it("awaits a host's checker that answers a promise", async () => {
    const world = makeWorld()
    const vault = await world.open({ strengthChecker: refusingTinyLater })
    await TH.expectRefusal(vault.unlock('pw'), 'weak_passphrase')
    await vault.unlock('pw longer')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("refuses at Vault.make, in its schema's words, a strengthChecker that is not a function, or whose load is not one", () => {
    const world = makeWorld()
    for (const misfit of [12, null, 'zxcvbn', { strong: true }, Object.assign(() => StrongVerdict, { load: 'soon' })]) {
      const err = TH.expectSyncRefusal(() => Vault.make(world.optsWith({ strengthChecker: misfit as unknown as StrengthChecker })), 'bad_option')
      expect(err.message).to.match(/^Vault\.make's strengthChecker: expected a function .* browserOpts\(\)/)
    }
  })

  it("asks the host's checker as vault.checkPassphrase, told the vault's scope, as its first example shows: a blank passphrase weak unheard", async () => {
    const world = makeWorld()
    const checker = refusing('acme acme acme')
    const vault = Vault.make(world.optsWith({ strengthChecker: checker }))
    expect(await vault.checkPassphrase('acme acme acme')).to.deep.equal({ strong: false, reason: 'That one is on every list of guesses: try another.' })
    expect(await vault.checkPassphrase('pw')).to.deep.equal({ strong: true })
    expect(checker.mock.calls).to.deep.equal([['acme acme acme', TH.scopeOf('u1')], ['pw', TH.scopeOf('u1')]])
  })

  it("finds a blank passphrase weak before the checker hears it, as checkPassphrase's second example shows", async () => {
    const world = makeWorld()
    const checker = refusing('acme acme acme')
    const vault = Vault.make(world.optsWith({ strengthChecker: checker }))
    expect(await vault.checkPassphrase(' '.repeat(3))).to.have.property('reason').that.includes("can't be empty")
    expect(checker).not.toHaveBeenCalled()
  })

  it("refuses checkPassphrase anything but text as 'bad_option', as its third example shows, never a TypeError", async () => {
    const world = makeWorld()
    const checker = refusing('acme acme acme')
    const vault = Vault.make(world.optsWith({ strengthChecker: checker }))
    for (const misfit of [42, undefined, null, { passphrase: 'pw' }]) {
      const err = await TH.expectRefusal(vault.checkPassphrase(misfit as unknown as string), 'bad_option')
      expect(err.message).to.match(/checkPassphrase takes the passphrase/)
    }
    expect(checker).not.toHaveBeenCalled()
  })

  it("checks without a hello, and reads nothing", async () => {
    const world = makeWorld()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
    const load = vi.fn(() => Promise.resolve())
    const vault = Vault.make(world.optsWith({ strengthChecker: Object.assign(() => StrongVerdict, { load }) }))
    expect(await vault.checkPassphrase('pw')).to.deep.equal({ strong: true })
    expect(getVaultProps).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    expect(vault.state).to.eq('opening')
  })

  it("runs the checker's load at hello, never at make, beside the read of storage, and again only at a hello that reads afresh", async () => {
    const world = makeWorld()
    const load = vi.fn(() => Promise.resolve())
    const vault = Vault.make(world.optsWith({ strengthChecker: Object.assign(() => StrongVerdict, { load }) }))
    expect(load).not.toHaveBeenCalled()
    await vault.hello()
    expect(load).toHaveBeenCalledTimes(1)
    await vault.hello()
    expect(load).toHaveBeenCalledTimes(1)
    await vault.hello({ staleMinutes: 0 })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("starts the load and the read of storage together, and settles the hello only once both have", async () => {
    const world = makeWorld()
    const gate = TH.makeGate()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
    const vault = Vault.make(world.optsWith({ strengthChecker: Object.assign(() => StrongVerdict, { load: gate.pass }) }))
    const greeting = vault.tryHello()
    await gate.reached
    await TH.wakeupAtNextTick()
    expect(getVaultProps).toHaveBeenCalledOnce()
    expect(vault.state).to.eq('absent')
    expect(await Promise.race([greeting, TH.wakeupAtNextTick()])).to.be.undefined
    gate.release()
    expect(await greeting).to.have.property('ok', true)
  })

  it("fails a hello whose checker's load fails as unexpected_error, what it threw the cause, taking up no lease, and loads again at the next hello", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw')
    first.close()
    const lost = new Error('the word list did not load')
    const load = vi.fn<() => Promise<void>>().mockRejectedValueOnce(lost).mockResolvedValue(undefined)
    const vault = Vault.make(world.optsWith({ strengthChecker: Object.assign(() => StrongVerdict, { load }) }))
    const err = await TH.expectRefusal(vault.hello(), 'unexpected_error')
    expect(err.message).to.match(/strengthChecker's load\(\) failed/)
    expect(err.cause).to.eq(lost)
    expect(vault.state).to.not.eq('unlocked')
    const neverLoads = Object.assign(() => StrongVerdict, { load: () => Promise.reject(lost) })
    await TH.expectRefusal(Vault.make(world.optsWith({ strengthChecker: neverLoads })).unlock('pw'), 'unexpected_error')
    await vault.hello()
    expect(vault.state).to.eq('unlocked')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("refuses a hello as its load failed, though its read of storage failed too", async () => {
    const world = makeWorld()
    const lost = new Error('the word list did not load')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The backend could not be reached.')))
    const vault = Vault.make(world.optsWith({ strengthChecker: Object.assign(() => StrongVerdict, { load: () => Promise.reject(lost) }) }))
    const err = await TH.expectRefusal(vault.hello(), 'unexpected_error')
    expect(err.cause).to.eq(lost)
  })

  it("still tells the bad news its read met when the load's failure refuses the hello", async () => {
    const world = await damagedVaultWorld()
    const told: VaultError[] = []
    const unloadable = Object.assign(() => StrongVerdict, { load: () => Promise.reject(new Error('the word list did not load')) })
    const vault = Vault.make(world.optsWith({ strengthChecker: unloadable, onBadNews: (news) => { told.push(news) } }))
    await TH.expectRefusal(vault.hello(), 'unexpected_error')
    expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_vault'])
    expect(vault.getSnapshot().trouble).to.have.property('refusalkind', 'damaged_vault')
  })

  it("refuses at Vault.make the option's old name, naming the new", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ passphraseStrengthTest: TH.anyStrengthChecker } as unknown as Partial<MakeVaultOpts>), 'bad_option')
    expect(err.message).to.include('passphraseStrengthTest (called strengthChecker now)')
  })

  it("refuses a checker that answers no verdict as 'bad_option', as any refusal, from tryUnlock too, creating nothing and telling no news", async () => {
    const world = makeWorld()
    const told: VaultError[] = []
    const misfit = await world.open({ strengthChecker: (() => 'weak') as unknown as StrengthChecker, onBadNews: (news) => { told.push(news) } })
    const err = await TH.expectBad(misfit.tryUnlock('pw'), 'bad_option')
    expect(err.message).to.match(/strengthChecker handed to Vault\.make answered something other than a verdict/)
    await TH.expectRefusal(misfit.checkPassphrase('pw'), 'bad_option')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    expect(told).to.have.lengthOf(0)
  })

  it("refuses a broken checker from tryPutWayin too, changing nothing stored", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const before = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
    const vault = await world.open({ strengthChecker: () => Promise.reject(new Error('down')), deviceDB: memoryDeviceDB() })
    await TH.expectBad(vault.tryPutWayin('pw', 'a new passphrase'), 'unexpected_error')
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(before)
  })

  it("refuses a broken checker from an ask's attempt, which getProof sees, creating nothing", async () => {
    const world = makeWorld()
    const attempts: Outcome<Vault>[] = []
    const getProof = async (ask: Ask) => {
      attempts.push(await ask.attempt('pw'))
      return 'declined' as const
    }
    const vault = await world.open({ strengthChecker: () => Promise.reject(new Error('down')), getProof })
    await TH.expectBad(vault.tryEnsureLease(), 'vault_locked')
    await TH.expectBad(attempts[0]!, 'unexpected_error')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  const Throws = [
    [new Error('the strength service is down: pw'),                      'an Error'],
    [new VaultError('storage_unavailable', 'Could not load: pw'),        'a condition'],
    [new VaultError('bad_option', 'pw is no passphrase I can judge.'),   'a misuse'],
  ] as const

  for (const [thrown, blurb] of Throws) {
    it(`refuses a checker that throws ${blurb} as 'unexpected_error' naming strengthChecker, from tryUnlock too, carrying no kind, meta or cause of the throw, creating nothing`, async () => {
      const world = makeWorld()
      const broken = await world.open({ strengthChecker: () => Promise.reject(thrown) })
      const err = await TH.expectBad(broken.tryUnlock('pw'), 'unexpected_error')
      expect(err.message).to.match(/strengthChecker handed to Vault\.make threw/)
      expect(err.cause).to.be.undefined
      expect(err.meta).to.be.undefined
      expect(err).to.not.eq(thrown)
      expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    })
  }
})
// --

// == [Ways in as models]: passphrase, passkey, logger, clock, keyDeriver, damaged_wayin news

/** A world whose `u1` vault stands with its passphrase and the passkey `laptop`, the passkey's salt spoiled in storage. */
const damagedWayinWorld = async () => {
  const { world, vault } = await vaultWithPasskey()
  vault.close()
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
  it("shows its passphrase and passkey as their summaries, the snapshot's own, with no salt and no wrapped vaultKey", async () => {
    const { world, vault } = await vaultWithPasskey()
    expect(vault.passphrase).to.eq(vault.getSnapshot().passphrase)
    expect(vault.passkey).to.eq(vault.getSnapshot().passkey)
    expect([vault.passphrase?.wayinkind, vault.passkey?.wayinkind]).to.deep.equal(['passphrase', 'passkey'])
    for (const summary of [vault.passphrase, vault.passkey]) {
      expect(summary).to.not.be.instanceOf(Wayin)
      expect(Object.keys(summary ?? {})).to.not.include.members(['salt_b64', 'vault_key_wayin_wrapped', 'props', 'holder'])
    }
    const fodder = guessFodderOf(world)
    expect(fodder).to.have.lengthOf.at.least(4)
    const shown = [JSON.stringify(vault.getSnapshot()), JSON.stringify([vault.passphrase, vault.passkey])]
    for (const secretish of fodder) {
      expect(shown.some((json) => json.includes(secretish)), secretish).to.be.false
    }
  })

  it("shows no vault props record, on the handle or in its snapshot: their ways in's salts and wraps are the vault's alone", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect('props' in vault.getSnapshot()).to.be.false
    expect(Reflect.get(vault, 'props')).to.be.undefined
    await vault.lock()
    const fodder = guessFodderOf(world)
    expect(fodder.some((secretish) => JSON.stringify(vault.getSnapshot()).includes(secretish))).to.be.false
  })

  it("makes its ways in from the vault props as storage holds them, told apart by wayinkind, as the PassphraseWayin's and PasskeyWayin's examples show", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const stored = VaultProps.parse(storedVaultPropsOf(world))
    const passphrase = Wayin.make(vault, stored.vault_id, stored.passphrase)
    const passkey = Wayin.make(vault, stored.vault_id, stored.passkey ?? TH.passkeyWayinOf('none'))
    expect([passphrase.constructor, passkey.constructor]).to.deep.equal([PassphraseWayin, PasskeyWayin])
    const wayins: (PassphraseWayin | PasskeyWayin)[] = [passphrase, passkey]
    const told = wayins.map((wayin) => (wayin instanceof PassphraseWayin ? wayin.record.key_deriver_label : wayin.credential_id))
    expect(told).to.deep.equal([TH.testDeriver.key_deriver_label, laptop.credentialId])
    expect([TH.shownOf(passphrase), TH.shownOf(passkey)]).to.deep.equal([vault.passphrase, vault.passkey])
  })

  it("keeps the same summaries until the vault props change", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const before = vault.passphrase
    await vault.hello({ staleMinutes: 0 })
    expect(vault.passphrase).to.eq(before)
    await addLaptopPasskey(vault)
    expect(vault.passkey).to.not.be.null
    expect(vault.passphrase).to.deep.equal(before)
  })

  it("has no passphrase and no passkey until a read finds a vault", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.passphrase).to.be.null
    expect(vault.passkey).to.be.null
  })

  it("shows its logger and its key deriver, none writable", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.keyDeriver).to.eq(TH.testDeriver)
    expect(vault.logger).to.be.an('object')
    for (const field of ['logger', 'keyDeriver', 'passphrase', 'passkey']) {
      expect(Reflect.set(vault, field, null), field).to.be.false
    }
  })

  it("tells a way in stored damaged as damaged_wayin news, its summary in meta.wayin_listed, and the read succeeds", async () => {
    const world = await damagedWayinWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews, deviceDB: memoryDeviceDB() })
    expect(vault.state).to.eq('locked')
    expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_wayin'])
    expect(told[0]?.meta?.wayin_listed).to.deep.equal(vault.passkey)
    expect(told[0]?.family).to.eq('bad_news')
    expect(vault.trouble).to.eq(told[0])
    await vault.unlock('pw')
    expect(vault.state).to.eq('unlocked')
  })

  it("tells a damaged way in once, not again at each read that finds it as it was", async () => {
    const world = await damagedWayinWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews })
    await vault.hello({ staleMinutes: 0 })
    await vault.hello({ staleMinutes: 0 })
    expect(told).to.have.lengthOf(1)
    expect(vault.trouble).to.eq(told[0])
  })

  it("clears the trouble once a read finds the damaged way in gone", async () => {
    const world = await damagedWayinWorld()
    const { onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews })
    await vault.delWayin('pw')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.trouble).to.be.null
    expect(vault.passkey).to.be.null
  })

  it("never quotes a passphrase in the news, nor its salt", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a memorable passphrase')
    vault.close()
    spoilWayin(world, 'passphrase', { salt_b64: 'c2FsdA' })
    const { told, onBadNews } = newsKeeper()
    const reopened = await world.open({ onBadNews })
    expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_wayin'])
    expect(told[0]?.meta?.wayin_listed).to.deep.equal(reopened.passphrase)
    const said = JSON.stringify({ message: told[0]?.message, meta: told[0]?.meta })
    expect(said).to.not.include('memorable')
    expect(said).to.not.include('c2FsdA')
  })
})
// --

// == [Refusals at a change]: Changes, each refusal at putWayin and at delWayin, unchanged

/** Each change to the ways in, proven by the passphrase `pw` on a vault that has a passkey to remove. */
const Changes: readonly (readonly [string, (vault: Vault) => Promise<unknown>])[] = [
  ['putWayin(), a new passphrase', (vault) => vault.putWayin('pw', 'pw two')],
  ['putWayin(), a new passkey',    async (vault) => await vault.putWayin('pw', await TH.passkeyOf('phone'))],
  ['delWayin()',                   (vault) => vault.delWayin('pw')],
]

/** The vault props as the backend holds them, as text: what a refused change leaves exactly as it was. */
const storedText = (world: ReturnType<typeof makeWorld>) => world.dbStore.read(u1VaultPropsCkey)

describe("a change to the ways in, refused, changes nothing stored (Contract: putWayin and delWayin, Refuses)", () => {
  afterEach(() => { vi.restoreAllMocks() })

  for (const [callTitle, change] of Changes) {
    it(`${callTitle} refuses absent_vault on a vault that does not exist yet`, async () => {
      const world = makeWorld()
      await TH.expectRefusal(change(await world.open()), 'absent_vault')
      expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    })

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

    it(`${callTitle} refuses stale_write when another device's change lands first, leaving that change standing`, async () => {
      const { world, vault: there } = await vaultWithPasskey()
      const here = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
      let landed: string | null = null
      // `there` proves against the vault props before `here` writes, and writes after it.
      const realPut = world.vaultDB.putVaultProps.bind(world.vaultDB)
      vi.spyOn(world.vaultDB, 'putVaultProps').mockImplementationOnce(async (vaultProps, expected) => {
        await here.putWayin('pw', 'here pw')
        landed = storedText(world)
        return await realPut(vaultProps, expected)
      })
      await TH.expectRefusal(change(there), 'stale_write')
      expect(storedText(world)).to.eq(landed)
    })

    it(`${callTitle} refuses storage_unavailable when the write cannot reach the backend`, async () => {
      const { world, vault } = await vaultWithPasskey()
      const before = storedText(world)
      vi.spyOn(world.vaultDB, 'putVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The backend could not be reached: try again shortly.')))
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

    it(`${callTitle} refuses unexpected_error when the key deriver throws, what it threw the cause and never the message`, async () => {
      const { world } = await vaultWithPasskey()
      const before = storedText(world)
      const thrown = new Error('could not derive from pw')
      const vault = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) } })
      const err = await TH.expectRefusal(change(vault), 'unexpected_error')
      expect(err.cause).to.eq(thrown)
      expect(err.message).to.not.include('could not derive')
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} refuses damaged_vault when the vault props it reads fail their checks`, async () => {
      const { world, vault } = await vaultWithPasskey()
      world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), unlock_epoch: 'one' }))
      const before = storedText(world)
      await TH.expectRefusal(change(vault), 'damaged_vault')
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} refuses newer_format when the vault props it reads are of a form a newer safebyok writes`, async () => {
      const { world, vault } = await vaultWithPasskey()
      world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), format: 'safebyok-vault-v9' }))
      const before = storedText(world)
      await TH.expectRefusal(change(vault), 'newer_format')
      expect(storedText(world)).to.eq(before)
    })

    it(`${callTitle} refuses rolled_back when the vault props it reads are older than this device has seen`, async () => {
      const { world, vault } = await vaultWithPasskey()
      const older = storedText(world) ?? ''
      await vault.putWayin('pw', 'pw newer')
      await vault.putWayin('pw newer', 'pw')
      world.dbStore.write(u1VaultPropsCkey, older)
      await TH.expectRefusal(change(vault), 'rolled_back')
      expect(storedText(world)).to.eq(older)
    })

    it(`${callTitle} refuses identity_revoked when storage says the user signed out, and locks`, async () => {
      const { world, vault } = await vaultWithPasskey()
      const before = storedText(world)
      vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('identity_revoked', 'No one is signed in: sign in, then try again.')))
      await TH.expectRefusal(change(vault), 'identity_revoked')
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(storedText(world)).to.eq(before)
    })
  }

  it("putWayin() throws bad_option when the strengthChecker answers no verdict for the new passphrase", async () => {
    const { world } = await vaultWithPasskey()
    const before = storedText(world)
    const vault = await world.open({ deviceDB: memoryDeviceDB(), strengthChecker: (() => 'weak') as unknown as StrengthChecker })
    const err = await TH.expectRefusal(vault.putWayin('pw', 'pw two'), 'bad_option')
    expect(err.message).to.match(/strengthChecker/)
    expect(storedText(world)).to.eq(before)
  })

  it("putWayin() throws unexpected_error when the strengthChecker throws, carrying nothing of the throw", async () => {
    const { world } = await vaultWithPasskey()
    const before = storedText(world)
    const vault = await world.open({ deviceDB: memoryDeviceDB(), strengthChecker: () => Promise.reject(new Error('could not judge pw two')) })
    const err = await TH.expectRefusal(vault.putWayin('pw', 'pw two'), 'unexpected_error')
    expect(err.message).to.match(/strengthChecker handed to Vault\.make threw/)
    expect(err.cause).to.be.undefined
    expect(storedText(world)).to.eq(before)
  })
})

describe("putWayin and delWayin, as the Contract's lesser lines say", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("a replaced passphrase still opens a copy of the vault props taken before: a change is no revocation (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const kept = storedText(world) ?? ''
    await vault.putWayin('pw', 'pw two')
    const copy = makeWorld()
    copy.dbStore.write(u1VaultPropsCkey, kept)
    const thief = await copy.open()
    await thief.unlock('pw')
    expect(thief.getSnapshot().state).to.eq('unlocked')
  })

  it("a replaced passkey still opens a copy of the vault props taken before (Contract: putWayin, Guarantees)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const kept = storedText(world) ?? ''
    await vault.putWayin('pw', await TH.passkeyOf('phone'))
    const copy = makeWorld()
    copy.dbStore.write(u1VaultPropsCkey, kept)
    const thief = await copy.open()
    await thief.unlock(laptop)
    expect(thief.getSnapshot().state).to.eq('unlocked')
  })

  it("logs no passphrase, old or new, nor a passkey's answer, even when this device cannot keep its lease (Contract: putWayin, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a memorable old passphrase')
    vi.spyOn(world.deviceDB, 'putLease').mockRejectedValue(new Error('device storage is full'))
    const phone = await TH.passkeyOf('phone')
    await vault.putWayin('a memorable old passphrase', 'a memorable new passphrase')
    await vault.putWayin('a memorable new passphrase', phone)
    await TH.expectRefusal(vault.putWayin('not the memorable one', 'a memorable third'), 'wrong_passphrase')
    expect(world.logged).to.have.lengthOf(2)
    const said = TH.loggedText(world.logged)
    expect(said).to.not.include('memorable')
    expect(said).to.not.include(toB64(phone.prfBytes))
  })

  it("refuses a misshapen proof before any read of storage, the only refusal before an await (Contract: putWayin, Does 1)", async () => {
    const { world, vault } = await vaultWithPasskey()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
    const getLease = vi.spyOn(world.deviceDB, 'getLease')
    await TH.expectRefusal(vault.putWayin(42 as unknown as string, 'pw two'), 'bad_option')
    await TH.expectRefusal(vault.putWayin('pw', { credentialId: 'x' } as unknown as PasskeyAnswer), 'bad_option')
    await TH.expectRefusal(vault.delWayin(null as unknown as string), 'bad_option')
    expect(getVaultProps).not.toHaveBeenCalled()
    expect(getLease).not.toHaveBeenCalled()
  })

  it("delWayin proves against the vault props as storage holds them now, not as this device last read them (Contract: delWayin, Does 2)", async () => {
    const { world } = await vaultWithPasskey()
    const here = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB(), deviceDB: memoryDeviceDB() })
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await there.putWayin('pw', 'pw two')
    await there.putWayin('pw two', await TH.passkeyOf('phone'))
    await here.delWayin('pw two')
    expect(storedWayinOf(world, 'passkey')).to.be.null
  })

  it("delWayin spends one key derivation, on the proof (Contract: delWayin, Does 4)", async () => {
    const { world } = await vaultWithPasskey()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver, deviceDB: memoryDeviceDB() })
    await vault.delWayin('pw')
    expect(derivations).toHaveBeenCalledTimes(1)
  })
})
// --
