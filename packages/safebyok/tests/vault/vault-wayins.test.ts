import { describe, it, expect, vi } from 'vitest'
import { type PasskeyAnswer, VaultProps, VaultScope } from '../../src/types'
import { VaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { toB64 } from '../../src/crypto'
import * as Ckeys from '../../src/ckeys'
import type { PassphraseVerdict, StrengthChecker } from '../../src/passphrase-strength'
import { zxcvbnStrengthChecker } from '../../src/zxcvbn-strength-checker'
import { PasskeyWayin, PassphraseWayin, Wayin } from '../../src/wayin'
import * as TH from '../test-helpers'
import { makeWorld, storedVaultPropsOf, vaultWithPasskey, SevenDaysMillis, u1VaultPropsCkey, storedWayinOf, addLaptopPasskey, spoilWayin, storedRowOf } from './world'


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

  it("replaces the passphrase, resolving the vault unlocked, and keeps every box readable, as its first example shows (Contract: putWayin, Returns)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.putBox('anthropic', 'sk-fake')
    expect(await vault.putWayin('old passphrase', 'new passphrase')).to.eq(vault)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })  // a new device: no lease
    await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
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

  it("stamps the new passphrase afresh, with this device and this moment, and leaves the passkey as it was (Contract: putWayin, Does 5)", async () => {
    const { world, vault } = await vaultWithPasskey()
    const passkeyBefore = vault.passkey
    world.advance(60_000)
    await vault.putWayin('pw', 'a new passphrase')
    expect(vault.passphrase?.registered_at).to.eq(world.clock.now())
    expect(vault.passphrase?.device_id).to.eq(passkeyBefore?.device_id)
    expect(vault.passkey).to.deep.equal(passkeyBefore)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock(await TH.passkeyOf('laptop'))
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
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
    expect(passphrase).to.deep.equal({ wayinkind: 'passphrase', device_id: passphrase?.device_id, registered_at: Date.parse('2026-10-14T12:00:00Z') })
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
    spoilWayin(world, 'passphrase', { vault_key_epoch: 2 })
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    const err = await TH.expectRefusal(vault.unlock('pw'), 'damaged_wayin')
    expect(err.message).to.include('passkey')
    await TH.expectRefusal(vault.putWayin('pw', 'a new passphrase'), 'damaged_wayin')
    await TH.expectRefusal(vault.putWayin('pw', await TH.passkeyOf('phone')), 'damaged_wayin')
    expect(derivations).not.toHaveBeenCalled()
    await vault.unlock(laptop)
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')
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
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("putWayin with a passkey's answer spends one key derivation, on the proof, and stamps the passkey with this device and this moment (Contract: putWayin, Does 4 and 5)", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.openUnlocked('pw', { keyDeriver })
    derivations.mockClear()
    world.advance(60_000)
    expect(await vault.putWayin('pw', await TH.passkeyOf('laptop'))).to.eq(vault)
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
      wayinkind: 'passkey', device_id: shown?.device_id, registered_at: shown?.registered_at,
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
    expect(await vault.putWayin('pw', phone)).to.eq(vault)
    expect(vault.passkey?.credential_id).to.eq(phone.credentialId)
    expect(storedVaultPropsOf(world)['unlock_epoch']).to.eq(3)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'wrong_passkey')
    await fresh.unlock(phone)
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
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
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')
  })

  it("putWayin with a passkey refuses as stale_write when another device changed the ways in meanwhile, writing nothing (Contract: putWayin, Refuses)", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const realUpdate = world.vaultDB.putVaultProps.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'putVaultProps').mockImplementationOnce(async (vaultProps, expected) => {
      await elsewhere.putWayin('pw', 'pw two')
      return await realUpdate(vaultProps, expected)
    })
    await TH.expectRefusal(vault.putWayin('pw', await TH.passkeyOf('phone')), 'stale_write')
    spied.mockRestore()
    expect(storedWayinOf(world, 'passkey')?.['credential_id']).to.eq(laptop.credentialId)
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

  it("without a strengthChecker, refuses every new passphrase as too weak, creating nothing, and says so once through the logger", async () => {
    const world = makeWorld()
    const vault = await world.open({ strengthChecker: undefined })
    const err = await TH.expectRefusal(vault.unlock('correct horse battery staple'), 'weak_passphrase')
    expect(err.message).to.include("can't accept a new passphrase yet")
    await TH.expectRefusal(vault.unlock('another long passphrase'), 'weak_passphrase')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['error', { call: 'unlock' }]])
    expect(world.logged[0]?.message).to.match(/strengthChecker/)
    expect(world.logged[0]?.message).to.match(/CUSTOMIZATION\.md/)
    expect(TH.loggedText(world.logged)).to.not.include('correct horse')
  })

  it("without a strengthChecker, refuses a new passphrase at putWayin too, while a vault that stands still opens", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const vault = await world.open({ strengthChecker: undefined, deviceDB: memoryDeviceDB() })
    await vault.unlock('pw')
    await TH.expectRefusal(vault.putWayin('pw', 'a long new passphrase'), 'weak_passphrase')
    expect(world.logged.filter((heard) => heard.level === 'error').map((heard) => heard.story)).to.deep.equal([{ call: 'putWayin' }])
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

  it("hands the host's checker the vault's scope frozen, the very one the snapshot holds, so neither can change it for the other", async () => {
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

  it("refuses a strengthChecker that is not a function at Vault.make, with kind 'bad_option'", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ strengthChecker: 12 as unknown as StrengthChecker }), 'bad_option')
  })

  it("refuses at Vault.make the option's old name, naming the new", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ passphraseStrengthTest: TH.anyStrengthChecker } as unknown as Partial<MakeVaultOpts>), 'bad_option')
    expect(err.message).to.include('passphraseStrengthTest (called strengthChecker now)')
  })

  it("refuses with kind 'bad_option' a checker that answers no verdict, creating nothing", async () => {
    const world = makeWorld()
    const misfit = await world.open({ strengthChecker: (() => 'weak') as unknown as StrengthChecker })
    const err = await TH.expectRefusal(misfit.unlock('pw'), 'bad_option')
    expect(err.message).to.match(/strengthChecker/)
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  const Throws = [
    [new Error('the strength service is down: pw'),                      'an Error'],
    [new VaultError('storage_unavailable', 'Could not load: pw'),        'a condition'],
    [new VaultError('bad_option', 'pw is no passphrase I can judge.'),   'a misuse'],
  ] as const

  for (const [thrown, blurb] of Throws) {
    it(`refuses a checker that throws ${blurb} as 'unexpected_error' naming strengthChecker, carrying no kind, meta or cause of the throw, creating nothing`, async () => {
      const world = makeWorld()
      const broken = await world.open({ strengthChecker: () => Promise.reject(thrown) })
      const err = await TH.expectRefusal(broken.unlock('pw'), 'unexpected_error')
      expect(err.message).to.match(/strengthChecker threw/)
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
    const passphrase = Wayin.make(vault, stored.passphrase, stored)
    const passkey = Wayin.make(vault, stored.passkey ?? TH.passkeyWayinOf('none'), stored)
    expect([passphrase.constructor, passkey.constructor]).to.deep.equal([PassphraseWayin, PasskeyWayin])
    const wayins: (PassphraseWayin | PasskeyWayin)[] = [passphrase, passkey]
    const told = wayins.map((wayin) => (wayin.wayinkind === 'passphrase' ? wayin.key_deriver_label : wayin.summary.credential_id))
    expect(told).to.deep.equal([TH.testDeriver.key_deriver_label, laptop.credentialId])
    expect([passphrase.summary, passkey.summary]).to.deep.equal([vault.passphrase, vault.passkey])
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

  it("lends its models its logger, its key deriver and a checked clock, none writable", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.keyDeriver).to.eq(TH.testDeriver)
    expect(vault.logger).to.be.an('object')
    expect(vault.clock.now()).to.eq(world.clock.now())
    world.advance(5)
    expect(vault.clock.now()).to.eq(world.clock.now())
    for (const field of ['logger', 'clock', 'keyDeriver', 'passphrase', 'passkey']) {
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
