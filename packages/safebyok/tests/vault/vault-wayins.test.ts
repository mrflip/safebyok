import { describe, it, expect, vi } from 'vitest'
import { type PasskeyAnswer, VaultProps, VaultScope } from '../../src/types'
import { VaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { toB64 } from '../../src/crypto'
import * as Ckeys from '../../src/ckeys'
import type { PassphraseVerdict, PassphraseStrengthTest } from '../../src/passphrase-strength'
import { zxcvbnPassphraseTest } from '../../src/zxcvbn-passphrase-test'
import { PasskeyWayin, PassphraseWayin, Wayin } from '../../src/wayin'
import * as TH from '../test-helpers'
import { makeWorld, storedVaultPropsOf, vaultWithPasskey, SevenDaysMillis, u1VaultPropsCkey, storedWayinOf, addLaptopPasskey, spoilWayin } from './world'


// == [Passphrase]: countingDeriver, changePassphrase, the passphrase

/** A testDeriver that counts its derivations, for an open that should spend few. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

describe("changePassphrase", () => {
  it("refuses an old or new passphrase that is not text with kind 'bad_option', changing nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await TH.expectRefusal(vault.changePassphrase(undefined as unknown as string, 'new passphrase'), 'bad_option')
    await TH.expectRefusal(vault.changePassphrase('old passphrase', 42 as unknown as string), 'bad_option')
    await world.openUnlocked('old passphrase', { deviceDB: memoryDeviceDB() })
  })

  it("deletes the old passphrase, admits the new, and keeps every box readable, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.putBox('anthropic', 'sk-fake')
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })  // a new device: no lease
    await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
  })

  it("works on a locked vault: the old passphrase is proof enough", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.lock()
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a wrong old passphrase is refused and changes nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('the real passphrase')
    await TH.expectRefusal(vault.changePassphrase('not the passphrase', 'whatever'), 'wrong_passphrase')
    const fresh = await world.openUnlocked('the real passphrase', { deviceDB: memoryDeviceDB() })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a new passphrase of only whitespace is refused outright", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.changePassphrase('pw', ' '.repeat(3)), 'wrong_passphrase')
  })

  it("refuses on a vault that does not exist yet", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(vault.changePassphrase('old', 'new'), 'absent_vault')
  })

  it("ends every other device's unlock: theirs lapses on the next look", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('old passphrase')
    const thereDeviceDB = memoryDeviceDB()
    const there = await world.openUnlocked('old passphrase', { deviceDB: thereDeviceDB })
    expect(there.getSnapshot().state).to.eq('unlocked')

    await here.changePassphrase('old passphrase', 'new passphrase')
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(await TH.expectGood(thereDeviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }))).to.be.null
  })

  it("takes only the standing passphrase as proof: a passkey's answer is refused as bad_option, changing nothing", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const before = storedVaultPropsOf(world)
    const err = await TH.expectRefusal(vault.changePassphrase(laptop as unknown as string, 'a new passphrase'), 'bad_option')
    expect(err.message).to.include('only the passphrase proves a change')
    expect(err.message).to.not.include(laptop.credentialId)
    expect(storedVaultPropsOf(world)).to.deep.equal(before)
  })

  it("stamps the new passphrase afresh, with this device and this moment, and leaves the passkey as it was", async () => {
    const { world, vault } = await vaultWithPasskey()
    const passkeyBefore = vault.passkey
    world.advance(60_000)
    await vault.changePassphrase('pw', 'a new passphrase')
    expect(vault.passphrase?.registered_at).to.eq(world.clock.now())
    expect(vault.passphrase?.device_id).to.eq(passkeyBefore?.device_id)
    expect(vault.passkey).to.deep.equal(passkeyBefore)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock(await TH.passkeyOf('laptop'))
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
  })

  it("starts the lease again from now, and this device's lease follows, so a reload stays unlocked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('first')
    world.advance(60_000)
    await vault.changePassphrase('first', 'second')
    expect(vault.askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    const reloaded = await world.open()
    expect(reloaded.getSnapshot().state).to.eq('unlocked')
  })

  it("two devices changing at once: the second write is stale, and changes nothing", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    // `there` looks at the vault props before `here` writes, and writes after it.
    const realUpdate = world.vaultDB.putVaultProps.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'putVaultProps').mockImplementationOnce(async (vaultProps, expected) => {
      await here.changePassphrase('pw', 'here pw')
      return await realUpdate(vaultProps, expected)
    })
    await TH.expectRefusal(there.changePassphrase('pw', 'there pw'), 'stale_write')
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

  it("a blank passphrase offered as proof is refused at once, deriving nothing", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await vault.unlock('pw')
    await addLaptopPasskey(vault)
    derivations.mockClear()
    await TH.expectRefusal(vault.addPasskey(' '.repeat(2), () => TH.passkeyOf('phone')), 'wrong_passphrase')
    await TH.expectRefusal(vault.delWayin(''), 'wrong_passphrase')
    await TH.expectRefusal(vault.changePassphrase('\t', 'pw four'), 'wrong_passphrase')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("stored damaged, is refused as damaged_wayin, deriving nothing, and cannot be changed: only the passkey still opens the vault", async () => {
    const { world, laptop } = await vaultWithPasskey()
    spoilWayin(world, 'passphrase', { vault_key_epoch: 2 })
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    const err = await TH.expectRefusal(vault.unlock('pw'), 'damaged_wayin')
    expect(err.message).to.include('passkey')
    await TH.expectRefusal(vault.changePassphrase('pw', 'a new passphrase'), 'damaged_wayin')
    expect(derivations).not.toHaveBeenCalled()
    await vault.unlock(laptop)
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')
  })

  it("the backend holds no passphrase, old or new", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('a very memorable passphrase')
    await vault.changePassphrase('a very memorable passphrase', 'another memorable passphrase')
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

// == [Passkey]: answering, the vault's passkey

/** A passkey maker whose authenticator answers `answer`, whatever it is: for a test of what addPasskey refuses. */
const answering = (answer: unknown) => () => Promise.resolve(answer as PasskeyAnswer)

describe("the vault's passkey", () => {
  it("addPasskey gives a way in that opens the vault on any device, with no key derivation, as its example shows", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.passkey?.credential_id).to.eq(laptop.credentialId)
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await fresh.unlock(laptop)
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
    expect(derivations).not.toHaveBeenCalled()
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

  it("addPasskey takes only the standing passphrase as proof: a passkey's answer is bad_option, a wrong passphrase wrong_passphrase, adding nothing", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const before = storedVaultPropsOf(world)
    const makePasskey = vi.fn(() => TH.passkeyOf('phone'))
    await TH.expectRefusal(vault.addPasskey(laptop as unknown as string, makePasskey), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('not the passphrase', makePasskey), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey(' '.repeat(3), makePasskey), 'wrong_passphrase')
    expect(makePasskey).not.toHaveBeenCalled()
    expect(storedVaultPropsOf(world)).to.deep.equal(before)
  })

  it("addPasskey adds nothing, and resolves false, when the passkey's prompt is dismissed", async () => {
    const { world, vault } = await vaultWithPasskey()
    const passkeyThen = vault.passkey
    const vaultPropsThen = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
    expect(await vault.addPasskey('pw', () => Promise.resolve(null))).to.be.false
    expect(vault.passkey).to.eq(passkeyThen)
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(vaultPropsThen)
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("addPasskey throws what its passkey maker throws, adding nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const unavailable = new VaultError('passkey_unavailable', 'No PRF here.')
    const err = await TH.expectRefusal(vault.addPasskey('pw', () => Promise.reject(unavailable)), 'passkey_unavailable')
    expect(err).to.equal(unavailable)
    expect(vault.passkey).to.be.null
  })

  it("addPasskey refuses a malformed answer as bad_option, adding nothing", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const phone = await TH.passkeyOf('phone')
    const shortSalt = toB64(new Uint8Array(16))
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfSaltB64: shortSalt })), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfSaltB64: 'not base64url!' })), 'bad_option')
    const shortAnswer = new Uint8Array(16)
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfBytes: shortAnswer })), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, credentialId: '' })), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(undefined)), 'bad_option')
    expect(vault.passkey?.credential_id).to.eq(laptop.credentialId)
  })

  const NotMakers = [
    [null,                     'nothing at all'],
    ['laptop',                 'a string'],
    [{ credentialId: 'cred' }, "a passkey's answer itself, made before the proof was checked"],
  ] as const

  for (const [notMaker, blurb] of NotMakers) {
    it(`addPasskey refuses, as bad_option, ${blurb} in place of a passkey maker`, async () => {
      const { vault } = await vaultWithPasskey()
      await TH.expectRefusal(vault.addPasskey('pw', notMaker as unknown as () => Promise<PasskeyAnswer>), 'bad_option')
    })
  }

  it("a second passkey replaces the first: the first no longer opens the vault, and the snapshot shows the second", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const phone = await TH.passkeyOf('phone')
    expect(await vault.addPasskey('pw', () => Promise.resolve(phone))).to.be.true
    expect(vault.passkey?.credential_id).to.eq(phone.credentialId)
    expect(storedVaultPropsOf(world)['unlock_epoch']).to.eq(3)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'wrong_passkey')
    await fresh.unlock(phone)
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
  })

  it("a passkey stored damaged is refused as damaged_wayin, told as news, and mended by adding the passkey again", async () => {
    const { world, laptop } = await vaultWithPasskey()
    spoilWayin(world, 'passkey', { prf_salt_b64: 'c2FsdA' })
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    expect(vault.trouble?.refusalkind).to.eq('damaged_wayin')
    await TH.expectRefusal(vault.unlock(laptop), 'damaged_wayin')
    await vault.addPasskey('pw', () => Promise.resolve(laptop))
    await vault.lock()
    await vault.unlock(laptop)
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')
  })

  it("addPasskey refuses as stale_write when another device changed the ways in while the authenticator was asked", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const makePasskey = async () => {
      await elsewhere.changePassphrase('pw', 'pw two')
      return await TH.passkeyOf('phone')
    }
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey), 'stale_write')
    expect(elsewhere.passkey?.credential_id).to.eq(laptop.credentialId)
  })

  it("a passkey's answer of the wrong shape is refused as misuse wherever it is a proof, never quoting it", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const misshapen = { ...laptop, prfBytes: [...laptop.prfBytes] } as unknown as PasskeyAnswer
    const asProof = misshapen as unknown as string
    const makePhone = () => TH.passkeyOf('phone')
    for (const refused of [vault.unlock(misshapen), vault.changePassphrase(asProof, 'pw two'), vault.addPasskey(asProof, makePhone), vault.delWayin(asProof)]) {
      const err = await TH.expectRefusal(refused, 'bad_option')
      expect(err.message).to.not.include(laptop.credentialId)
      expect(err.message).to.not.include(laptop.prfBytes.join(','))
    }
    await TH.expectRefusal(vault.unlock(undefined as unknown as string), 'bad_option')
  })

  it("delWayin takes the passkey away: it no longer opens the vault, as its example shows", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.delWayin('pw')
    expect(vault.passkey).to.be.null
    expect(storedWayinOf(world, 'passkey')).to.be.null
    expect(vault.getSnapshot().state).to.eq('unlocked')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'absent_wayin')
    await fresh.unlock('pw')
  })

  it("delWayin refuses absent_wayin on a vault with no passkey, a wrong passphrase, and a passkey's answer as proof, removing nothing", async () => {
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

  it("every change of the passkey moves the epoch: another device locks, and this one stays unlocked", async () => {
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

  it("the backend holds no passkey's answer, only its credential and salt", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include(toB64(laptop.prfBytes))
    expect(everything).to.include(laptop.credentialId)
    expect(everything).to.include(laptop.prfSaltB64)
  })

  it("removal is not revocation: a copy of the vault props from before still opens with the removed passkey", async () => {
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

/** A passphraseStrengthTest that refuses `weakOne` and admits the rest, counting its calls. */
const refusing = (weakOne: string) => vi.fn((passphrase: string): PassphraseVerdict => (
  passphrase === weakOne ? { strong: false, reason: 'That one is on every list of guesses: try another.' } : { strong: true }
))

/** A passphraseStrengthTest that answers later, refusing a passphrase of two characters or fewer. */
const refusingTinyLater = async (passphrase: string): Promise<PassphraseVerdict> => {
  await Promise.resolve()
  return passphrase.length > 2 ? { strong: true } : { strong: false, reason: 'Found in a breach: pick another.' }
}

describe("a new passphrase's strength", () => {

  it("refuses to open without a passphraseStrengthTest, with kind 'bad_option': the vault has no test of its own", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ passphraseStrengthTest: undefined as unknown as PassphraseStrengthTest }), 'bad_option')
    expect(err.message).to.match(/passphraseStrengthTest is required/)
    expect(err.message).to.match(/browserOpts/)
  })

  it("with zxcvbnPassphraseTest, refuses a common password, or one made of the vault's own names, creating nothing", async () => {
    const world = makeWorld()
    const vault = await world.open({ passphraseStrengthTest: zxcvbnPassphraseTest, applabel: 'skylark', vaultlabel: 'pinecone' })
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
    const strengthTest = refusing('pw')
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), passphraseStrengthTest: strengthTest })
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
    expect(strengthTest).not.toHaveBeenCalled()
  })

  it("runs the host's test on the passphrase a vault is created with, its reason the refusal's message", async () => {
    const world = makeWorld()
    const strengthTest = refusing('acme acme acme')
    const vault = await world.open({ passphraseStrengthTest: strengthTest })
    const err = await TH.expectRefusal(vault.unlock('acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('That one is on every list of guesses: try another.')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    await vault.unlock('pw')
    expect(strengthTest.mock.calls).to.deep.equal([['acme acme acme', TH.scopeOf('u1')], ['pw', TH.scopeOf('u1')]])
  })

  it("hands the host's test the vault's scope frozen, the very one the snapshot holds, so neither can change it for the other", async () => {
    const world = makeWorld()
    const heard: VaultScope[] = []
    const strengthTest = (_passphrase: string, scope: VaultScope): PassphraseVerdict => {
      heard.push(scope)
      return { strong: true }
    }
    const vault = await world.open({ passphraseStrengthTest: strengthTest })
    await vault.unlock('pw')
    expect(Object.isFrozen(heard[0])).to.be.true
    expect(() => { Object.assign(heard[0] ?? {}, { user_id: 'u2' }) }).to.throw(TypeError)
    expect(heard[0]).to.deep.equal(TH.scopeOf('u1'))
    expect(vault.getSnapshot()).to.deep.include(TH.scopeOf('u1'))
  })

  it("refuses a weak passphrase at changePassphrase before any key derivation, changing nothing", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver, passphraseStrengthTest: refusing('acme acme acme') })
    const before = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
    await TH.expectRefusal(vault.changePassphrase('pw', 'acme acme acme'), 'weak_passphrase')
    expect(derivations).not.toHaveBeenCalled()
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(before)
  })

  it("awaits a host's test that answers a promise", async () => {
    const world = makeWorld()
    const vault = await world.open({ passphraseStrengthTest: refusingTinyLater })
    await TH.expectRefusal(vault.unlock('pw'), 'weak_passphrase')
    await vault.unlock('pw longer')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("refuses a passphraseStrengthTest that is not a function at Vault.make, with kind 'bad_option'", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ passphraseStrengthTest: 12 as unknown as MakeVaultOpts['passphraseStrengthTest'] }), 'bad_option')
  })

  it("refuses with kind 'bad_option' a test that answers no verdict, and as 'unexpected_error' one that throws, what it threw the cause, creating nothing", async () => {
    const world = makeWorld()
    const misfit = await world.open({ passphraseStrengthTest: (() => 'weak') as unknown as MakeVaultOpts['passphraseStrengthTest'] })
    await TH.expectRefusal(misfit.unlock('pw'), 'bad_option')
    const thrown = new Error('the strength service is down')
    const broken = await world.open({ passphraseStrengthTest: () => { throw thrown } })
    const err = await TH.expectRefusal(broken.unlock('pw'), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })
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
