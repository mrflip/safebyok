import { describe, it, expect, vi } from 'vitest'
import { MaxUnlocks, type PasskeyAnswer, VaultScope, type WayinSummary } from '../../src/types'
import { VaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { toB64 } from '../../src/crypto'
import * as Ckeys from '../../src/ckeys'
import type { PassphraseVerdict, PassphraseStrengthTest } from '../../src/passphrase-strength'
import { zxcvbnPassphraseTest } from '../../src/zxcvbn-passphrase-test'
import { PasskeyWayin, PassphraseWayin, Wayin } from '../../src/wayin'
import * as TH from '../test-helpers'
import { makeWorld, wayinlabelsOf, storedVaultPropsOf, vaultWithPasskey, SevenDaysMillis, u1VaultPropsCkey, storedWayinsOf, addLaptopPasskey } from './world'


// == [Passphrases]: changePassphrase, countingDeriver, several passphrases

describe("changePassphrase", () => {
  it("refuses an old or new passphrase that is not text with kind 'bad_option', changing nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await TH.expectRefusal(vault.changePassphrase(undefined as unknown as string, 'new passphrase'), 'bad_option')
    await TH.expectRefusal(vault.changePassphrase('old passphrase', 42 as unknown as string), 'bad_option')
    await world.openUnlocked('old passphrase', { deviceDB: memoryDeviceDB() })
  })

  it("deletes the old passphrase, admits the new, and keeps every box readable", async () => {
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
    expect(await thereDeviceDB.getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.be.null
  })
})

/** A testDeriver that counts its derivations, for an open that should spend few. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

describe("several passphrases", () => {
  it("a vault is made with one way in, labelled passphrase, listed while locked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().wayins).to.deep.equal([])
    await vault.unlock('pw')
    await vault.lock()
    const [only] = vault.getSnapshot().wayins
    expect(only).to.deep.equal({
      wayinkind: 'passphrase', wayin_id: only?.wayin_id, wayinlabel: 'passphrase', device_id: only?.device_id, registered_at: Date.parse('2026-10-14T12:00:00Z'),
    })
    expect(only?.wayin_id).to.have.length.greaterThan(0)
    expect(only?.device_id).to.have.length.greaterThan(0)
  })

  it("addPassphrase gives another way in: either passphrase opens the vault, on any device", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first passphrase')
    await vault.putBox('anthropic', 'sk-fake')
    const wayinId = await vault.addPassphrase('first passphrase', 'second passphrase', { wayinlabel: 'written_down' })
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'written_down'])
    expect(vault.getSnapshot().wayins[1]?.wayin_id).to.eq(wayinId)

    for (const passphrase of ['first passphrase', 'second passphrase']) {
      const fresh = await world.open({ deviceDB: memoryDeviceDB() })
      await fresh.unlock(passphrase)
      expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
    }
  })

  it("an unlock aimed at one passphrase derives once, and refuses another's passphrase", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first passphrase')
    const wayinId = await vault.addPassphrase('first passphrase', 'second passphrase', { wayinlabel: 'written_down' })
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('first passphrase', { wayinId }), 'wrong_passphrase')
    await fresh.unlock('second passphrase', { wayinId })
    expect(derivations).toHaveBeenCalledTimes(2)
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("an unlock not aimed tries each passphrase in turn: a wrong one costs a derivation apiece", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.addPassphrase('pw one', 'pw two', { wayinlabel: 'two' })
    await vault.addPassphrase('pw one', 'pw three', { wayinlabel: 'three' })
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('none of them'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(3)
  })

  it("an unlock aimed at a wayin_id the vault does not hold is refused as absent_wayin", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.lock()
    await TH.expectRefusal(vault.unlock('pw', { wayinId: 'wayin-gone' }), 'absent_wayin')
    await TH.expectRefusal(vault.unlock('pw', { wayinId: 42 as unknown as string }), 'bad_option')
  })

  it("an unlock aimed at a vault deleted elsewhere is refused as absent_wayin, and creates nothing", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    await here.lock()
    const wayinId = here.getSnapshot().wayins[0]?.wayin_id
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.del()
    await TH.expectRefusal(here.unlock('pw', { wayinId }), 'absent_wayin')
    expect(here.getSnapshot().state).to.eq('absent')
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
  })

  it("addPassphrase wants a passphrase the vault opens with as proof, even while unlocked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const err = await TH.expectRefusal(vault.addPassphrase('not the passphrase', 'sneaky', { wayinlabel: 'sneaky' }), 'wrong_passphrase')
    expect(err.message).to.not.include('sneaky')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
  })

  it("addPassphrase refuses a blank passphrase, a bad or taken label, and a vault at MaxUnlocks", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await TH.expectRefusal(vault.addPassphrase('pw', ' '.repeat(3), { wayinlabel: 'blank' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: 'Not A Label' }), 'bad_label')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', undefined as unknown as { wayinlabel: string }), 'bad_label')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: 'passphrase' }), 'bad_label')
    for (let ii = 1; ii < MaxUnlocks; ii += 1) {
      await vault.addPassphrase('pw', `pw ${String(ii)}`, { wayinlabel: `phrase${String(ii)}` })
    }
    expect(vault.getSnapshot().wayins).to.have.lengthOf(MaxUnlocks)
    await TH.expectRefusal(vault.addPassphrase('pw', 'one too many', { wayinlabel: 'extra' }), 'too_many_wayins')
  })

  it("a blank passphrase offered as proof is refused at once, deriving nothing", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await vault.unlock('pw')
    const wayinId = await vault.addPassphrase('pw', 'pw two', { wayinlabel: 'two' })
    derivations.mockClear()
    await TH.expectRefusal(vault.addPassphrase(' '.repeat(2), 'pw three', { wayinlabel: 'three' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.delWayin('', wayinId), 'wrong_passphrase')
    await TH.expectRefusal(vault.changePassphrase('\t', 'pw four'), 'wrong_passphrase')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("a refusal for what addPassphrase asks costs no key derivation", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await vault.unlock('pw')
    derivations.mockClear()
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: 'passphrase' }), 'bad_label')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("changePassphrase changes the passphrase it was given, and leaves the others standing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    const before = vault.getSnapshot().wayins
    await vault.changePassphrase('second', 'second, renewed')
    expect(vault.getSnapshot().wayins).to.deep.equal(before)   // same ids, same labels

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('second'), 'wrong_passphrase')
    await fresh.unlock('second, renewed')
    await fresh.lock()
    await fresh.unlock('first')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("changePassphrase aimed at one passphrase refuses another's", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    const wayinId = await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    await TH.expectRefusal(vault.changePassphrase('first', 'whatever', { wayinId }), 'wrong_passphrase')
    await vault.changePassphrase('second', 'renewed', { wayinId })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('renewed', { wayinId })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("delWayin takes one way in away, proven by any passphrase still standing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    const wayinId = await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    await vault.putBox('anthropic', 'sk-fake')
    await vault.delWayin('second', wayinId)    // the one going is proof enough
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
    expect(vault.getSnapshot().state).to.eq('unlocked')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('second'), 'wrong_passphrase')
    await fresh.unlock('first')
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
  })

  it("delWayin never removes the last way in, nor one that is not there", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const [only] = vault.getSnapshot().wayins
    await TH.expectRefusal(vault.delWayin('pw', only?.wayin_id ?? ''), 'last_wayin')
    await TH.expectRefusal(vault.delWayin('pw', 'wayin-gone'), 'absent_wayin')
    await TH.expectRefusal(vault.delWayin('pw', ''), 'bad_option')
    expect(vault.getSnapshot().wayins).to.have.lengthOf(1)
  })

  it("delWayin wants a passphrase the vault opens with, and removes nothing on a wrong one", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    const wayinId = await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    await TH.expectRefusal(vault.delWayin('neither', wayinId), 'wrong_passphrase')
    expect(vault.getSnapshot().wayins).to.have.lengthOf(2)
  })

  it("every change to the ways in moves the epoch: another device locks, and this one stays unlocked", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('first')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('first')

    const wayinId = await here.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(there.getSnapshot().wayins).to.deep.equal(here.getSnapshot().wayins)
    await there.unlock('second')

    await here.delWayin('first', wayinId)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(storedVaultPropsOf(world)['unlock_epoch']).to.eq(3)
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("this device's lease follows a change, so a reload stays unlocked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    const reloaded = await world.open()
    expect(reloaded.getSnapshot().state).to.eq('unlocked')
  })

  it("two devices adding at once: the second write is stale, and adds nothing", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('pw')
    // `there` looks at the vault props before `here` writes, and writes after it.
    const realUpdate = world.vaultDB.putVaultProps.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'putVaultProps').mockImplementationOnce(async (vaultProps, expected) => {
      await here.addPassphrase('pw', 'here pw', { wayinlabel: 'here' })
      return await realUpdate(vaultProps, expected)
    })
    await TH.expectRefusal(there.addPassphrase('pw', 'there pw', { wayinlabel: 'there' }), 'stale_write')
    spied.mockRestore()
    expect(wayinlabelsOf(there)).to.deep.equal(['passphrase', 'here'])
  })

  it("the backend holds no passphrase, of the first or of any added", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('a very memorable passphrase')
    await vault.addPassphrase('a very memorable passphrase', 'another memorable passphrase', { wayinlabel: 'spare' })
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('memorable')
    expect(everything).to.include('"wayinlabel":"spare"')
  })

  it("vault props in the shape before wayins read as damaged, and are left as they are", async () => {
    const world = makeWorld()
    const { wayins: _wayins, ...rest } = TH.vaultPropsOf('u1')
    const oldText = JSON.stringify({ ...rest, key_deriver_label: 'test_digest_v0', passphrase_salt_b64: 'c2FsdA', vault_key_passphrase_wrapped: TH.fakeCiphered('old') })
    const vaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))
    world.dbStore.write(vaultPropsCkey, oldText)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(vaultPropsCkey)).to.eq(oldText)
  })
})
// --

// == [Passkeys]: answering, passkeys

/** A passkey maker whose authenticator answers `answer`, whatever it is: for a test of what addPasskey refuses. */
const answering = (answer: unknown) => () => Promise.resolve(answer as PasskeyAnswer)

describe("passkeys", () => {
  it("addPasskey gives a way in that opens the vault on any device, with no key derivation", async () => {
    const { world, vault, laptop, wayinId } = await vaultWithPasskey()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await fresh.unlock(laptop)
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
    expect(derivations).not.toHaveBeenCalled()
    await fresh.lock()
    await fresh.unlock(laptop, { wayinId })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a locked vault lists its passkeys with the credential and salt to ask them with", async () => {
    const { world, laptop, wayinId } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    expect(fresh.getSnapshot().state).to.eq('locked')
    const listed = fresh.getSnapshot().wayins[1]
    expect(listed).to.deep.equal({
      wayinkind: 'passkey', wayin_id: wayinId, wayinlabel: 'laptop', device_id: listed?.device_id, registered_at: listed?.registered_at,
      credential_id: laptop.credentialId, prf_salt_b64: laptop.prfSaltB64,
    })
    expect(listed?.device_id).to.have.length.greaterThan(0)
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

  it("an unlock refuses a passkey the vault does not hold, and a wrong answer, and stays locked", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('stranger')), 'absent_wayin')
    await TH.expectRefusal(fresh.unlock({ ...laptop, prfBytes: new Uint8Array(32).fill(7) }), 'wrong_passkey')
    const otherSalt = TH.passkeyWayinOf('any').prf_salt_b64
    await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('laptop', otherSalt)), 'wrong_passkey')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("an unlock with a passkey never creates a vault: an absent one refuses as absent_vault", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(vault.unlock(await TH.passkeyOf('laptop')), 'absent_vault')
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
  })

  it("an unlock with a passphrase passes over the passkeys: one derivation per passphrase", async () => {
    const { world } = await vaultWithPasskey()
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('not it'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("addPasskey takes another passkey's answer as proof, and refuses a wrong proof, adding nothing", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    await vault.addPasskey(laptop, () => TH.passkeyOf('phone'), { wayinlabel: 'phone' })
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop', 'phone'])
    await TH.expectRefusal(vault.addPasskey('not the passphrase', () => TH.passkeyOf('key'), { wayinlabel: 'key' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, () => TH.passkeyOf('key'), { wayinlabel: 'key' }), 'wrong_passkey')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop', 'phone'])
  })

  it("addPasskey makes its passkey only once the proof holds: a refused proof, label or room never asks the authenticator", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const makePasskey = vi.fn(() => TH.passkeyOf('phone'))
    await TH.expectRefusal(vault.addPasskey('not the passphrase', makePasskey, { wayinlabel: 'phone' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey(' '.repeat(3), makePasskey, { wayinlabel: 'phone' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, makePasskey, { wayinlabel: 'phone' }), 'wrong_passkey')
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { wayinlabel: 'laptop' }), 'bad_label')
    for (let ii = 2; ii < MaxUnlocks; ii += 1) {
      await vault.addPasskey('pw', () => TH.passkeyOf(`key${String(ii)}`), { wayinlabel: `key${String(ii)}` })
    }
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { wayinlabel: 'phone' }), 'too_many_wayins')
    expect(makePasskey).not.toHaveBeenCalled()
  })

  it("addPasskey adds nothing, and resolves null, when the passkey's prompt is dismissed", async () => {
    const { world, vault } = await vaultWithPasskey()
    const wayinsThen = vault.getSnapshot().wayins.length
    const vaultPropsThen = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
    expect(await vault.addPasskey('pw', () => Promise.resolve(null), { wayinlabel: 'phone' })).to.be.null
    expect(vault.getSnapshot().wayins).to.have.lengthOf(wayinsThen)
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(vaultPropsThen)
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("addPasskey throws what its passkey maker throws, adding nothing", async () => {
    const { vault } = await vaultWithPasskey()
    const unavailable = new VaultError('passkey_unavailable', 'No PRF here.')
    const err = await TH.expectRefusal(vault.addPasskey('pw', () => Promise.reject(unavailable), { wayinlabel: 'phone' }), 'passkey_unavailable')
    expect(err).to.equal(unavailable)
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("addPasskey refuses a malformed answer, a credential already in the vault, a taken label, and a full vault", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const phone = await TH.passkeyOf('phone')
    const shortSalt = toB64(new Uint8Array(16))
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfSaltB64: shortSalt }), { wayinlabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfSaltB64: 'not base64url!' }), { wayinlabel: 'phone' }), 'bad_option')
    const shortAnswer = new Uint8Array(16)
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfBytes: shortAnswer }), { wayinlabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, credentialId: '' }), { wayinlabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(undefined), { wayinlabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(laptop), { wayinlabel: 'laptop_again' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { wayinlabel: 'laptop' }), 'bad_label')
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { wayinlabel: 'Phone' }), 'bad_label')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
    for (let ii = 2; ii < MaxUnlocks; ii += 1) {
      await vault.addPasskey('pw', () => TH.passkeyOf(`key${String(ii)}`), { wayinlabel: `key${String(ii)}` })
    }
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { wayinlabel: 'phone' }), 'too_many_wayins')
  })

  const NotMakers = [
    [null,                     'nothing at all'],
    ['laptop',                 'a string'],
    [{ credentialId: 'cred' }, "a passkey's answer itself, made before the proof was checked"],
  ] as const

  for (const [notMaker, blurb] of NotMakers) {
    it(`addPasskey refuses, as bad_option, ${blurb} in place of a passkey maker`, async () => {
      const { vault } = await vaultWithPasskey()
      await TH.expectRefusal(vault.addPasskey('pw', notMaker as unknown as () => Promise<PasskeyAnswer>, { wayinlabel: 'phone' }), 'bad_option')
    })
  }

  it("addPasskey refuses as stale_write when another device changed the ways in while the authenticator was asked", async () => {
    const { world, vault } = await vaultWithPasskey()
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.unlock('pw')
    const makePasskey = async () => {
      await elsewhere.addPassphrase('pw', 'pw two', { wayinlabel: 'spare' })
      return await TH.passkeyOf('phone')
    }
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { wayinlabel: 'phone' }), 'stale_write')
    expect(wayinlabelsOf(elsewhere)).to.deep.equal(['passphrase', 'laptop', 'spare'])
  })

  it("a passkey's answer of the wrong shape is refused as misuse wherever it is a proof, never quoting it", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const misshapen = { ...laptop, prfBytes: [...laptop.prfBytes] } as unknown as PasskeyAnswer
    for (const refused of [vault.unlock(misshapen), vault.addPassphrase(misshapen, 'pw two', { wayinlabel: 'two' }), vault.delWayin(misshapen, 'wayin-gone')]) {
      const err = await TH.expectRefusal(refused, 'bad_option')
      expect(err.message).to.not.include(laptop.credentialId)
      expect(err.message).to.not.include(laptop.prfBytes.join(','))
    }
    await TH.expectRefusal(vault.unlock(undefined as unknown as string), 'bad_option')
  })

  it("a passkey sets a new passphrase for a user who forgot theirs: add one, remove the old", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.lock()
    const forgotten = vault.getSnapshot().wayins[0]?.wayin_id ?? ''
    await vault.addPassphrase(laptop, 'a new passphrase', { wayinlabel: 'new_phrase' })
    await vault.delWayin(laptop, forgotten)
    expect(wayinlabelsOf(vault)).to.deep.equal(['laptop', 'new_phrase'])
    expect(vault.getSnapshot().state).to.eq('unlocked')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('pw'), 'wrong_passphrase')
    await fresh.unlock('a new passphrase')
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
  })

  it("changePassphrase takes a passkey's answer as proof, and changes the vault's one passphrase", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.lock()
    const [passphraseWay] = vault.getSnapshot().wayins
    await vault.changePassphrase(laptop, 'a new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
    // The passphrase's way in is the same one, as a changed passphrase's is.
    expect(vault.getSnapshot().wayins[0]?.wayin_id).to.eq(passphraseWay?.wayin_id)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('pw'), 'wrong_passphrase')
    await fresh.unlock('a new passphrase')
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
  })

  it("changePassphrase with a passkey among several passphrases changes the one wayinId names, and refuses to guess", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const spareId = await vault.addPassphrase('pw', 'spare pw', { wayinlabel: 'spare' })
    const firstId = vault.getSnapshot().wayins[0]?.wayin_id ?? ''
    await TH.expectRefusal(vault.changePassphrase(laptop, 'new pw'), 'bad_option')
    await vault.changePassphrase(laptop, 'new pw', { wayinId: spareId })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('spare pw'), 'wrong_passphrase')
    await fresh.unlock('new pw')
    await fresh.lock()
    await fresh.unlock('pw', { wayinId: firstId })
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop', 'spare'])
  })

  it("changePassphrase with a passkey refuses a wayinId that is not one of the vault's passphrases, and a passkey that does not open it", async () => {
    const { world, vault, laptop, wayinId } = await vaultWithPasskey()
    await TH.expectRefusal(vault.changePassphrase(laptop, 'new pw', { wayinId }), 'absent_wayin')
    await TH.expectRefusal(vault.changePassphrase(laptop, 'new pw', { wayinId: 'wayin-gone' }), 'absent_wayin')
    const stranger = await TH.passkeyOf('stranger')
    await TH.expectRefusal(vault.changePassphrase(stranger, 'new pw'), 'absent_wayin')
    const wrongAnswer = { ...laptop, prfBytes: new Uint8Array(32).fill(7) }
    await TH.expectRefusal(vault.changePassphrase(wrongAnswer, 'new pw'), 'wrong_passkey')
    // Nothing changed through any of it: the old passphrase still opens the vault.
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('pw')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("changePassphrase with a passkey mends a passphrase stored at another vault_key_epoch: the new one opens", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { wayins: Record<string, unknown>[] }
    const wayins = vaultProps.wayins.map((wayin, ii) => (ii === 0 ? { ...wayin, vault_key_epoch: 2 } : wayin))
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, wayins }))
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(vault.unlock('pw'), 'damaged_wayin')
    await vault.changePassphrase(laptop, 'a new passphrase')
    expect(storedWayinsOf(world)[0]).to.deep.include({ vault_key_epoch: 1 })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('a new passphrase')
    expect(await fresh.getBox('anthropic')).to.eq('sk-fake')
  })

  it("changePassphrase with a passkey refuses a blank new passphrase and a misshapen answer, quoting neither", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    await TH.expectRefusal(vault.changePassphrase(laptop, ' '.repeat(3)), 'wrong_passphrase')
    await TH.expectRefusal(vault.changePassphrase(laptop, 42 as unknown as string), 'bad_option')
    const misshapen = { ...laptop, prfBytes: [...laptop.prfBytes] } as unknown as PasskeyAnswer
    const err = await TH.expectRefusal(vault.changePassphrase(misshapen, 'new pw'), 'bad_option')
    expect(err.message).to.not.include(laptop.prfBytes.join(','))
  })

  it("changePassphrase with a passphrase of a vault that has a passkey still aims at the way in that opened, and refuses a passkey's wayin_id", async () => {
    const { vault, wayinId } = await vaultWithPasskey()
    await TH.expectRefusal(vault.changePassphrase('pw', 'new pw', { wayinId }), 'absent_wayin')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("delWayin takes a passkey away: it no longer opens the vault", async () => {
    const { world, vault, laptop, wayinId } = await vaultWithPasskey()
    await vault.delWayin('pw', wayinId)
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'absent_wayin')
  })

  it("delWayin never removes the last passphrase, though passkeys remain", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const passphraseId = vault.getSnapshot().wayins[0]?.wayin_id ?? ''
    await TH.expectRefusal(vault.delWayin(laptop, passphraseId), 'last_wayin')
    await TH.expectRefusal(vault.delWayin('pw', passphraseId), 'last_wayin')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("every change of a passkey moves the epoch: another device locks, and this one stays unlocked", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('pw')
    const wayinId = await addLaptopPasskey(here)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    await there.unlock(await TH.passkeyOf('laptop'))
    await here.delWayin('pw', wayinId)
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
    const { world, vault, laptop, wayinId } = await vaultWithPasskey()
    const kept = world.dbStore.read(Ckeys.vaultProps(TH.scopeOf('u1'))) ?? ''
    await vault.delWayin('pw', wayinId)
    const copy = makeWorld()
    copy.dbStore.write(Ckeys.vaultProps(TH.scopeOf('u1')), kept)
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

  it("refuses a weak passphrase at addPassphrase and changePassphrase before any key derivation, changing nothing", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver, passphraseStrengthTest: refusing('acme acme acme') })
    const before = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
    await TH.expectRefusal(vault.addPassphrase('pw', 'acme acme acme', { wayinlabel: 'spare' }), 'weak_passphrase')
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

// == [Ways in as models]: wayins, props, logger, clock, keyDeriver, damaged_wayin news

/** A world whose `u1` vault stands with a passphrase and a second one, the second's salt spoiled in storage. */
const damagedWayinWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.addPassphrase('pw', 'spare passphrase', { wayinlabel: 'spare' })
  vault.close()
  const stored = storedVaultPropsOf(world)
  const [first, second] = storedWayinsOf(world)
  world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...stored, wayins: [first, { ...second, salt_b64: 'c2FsdA' }] }))
  return world
}

/** The wayinkind of each of `wayins`, as a host's function taking summaries reads them. */
const kindsOf = (wayins: readonly WayinSummary[]) => wayins.map((wayin) => wayin.wayinkind)

/** An onBadNews that keeps what it is told. */
const newsKeeper = () => {
  const told: VaultError[] = []
  return { told, onBadNews: (news: VaultError) => { told.push(news) } }
}

describe("the vault's ways in, as models (Contract: Vault, Wayin)", () => {
  it("lists each way in as a Wayin made from the vault props, its summary what the snapshot lists", async () => {
    const { vault } = await vaultWithPasskey()
    expect(vault.wayins.map((wayin) => wayin.constructor)).to.deep.equal([PassphraseWayin, PasskeyWayin])
    expect(vault.wayins.every((wayin) => wayin instanceof Wayin && wayin.vault === vault)).to.be.true
    expect(vault.wayins.map((wayin) => wayin.summary)).to.deep.equal(vault.getSnapshot().wayins)
    expect(vault.wayins.map((wayin) => wayin.props)).to.deep.equal(vault.props?.wayins)
  })

  it("lists ways in a host tells apart by wayinkind and hands on as summaries, as the Wayin's, PassphraseWayin's and PasskeyWayin's examples show", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    expect(kindsOf(vault.wayins)).to.deep.equal(['passphrase', 'passkey'])
    expect(vault.wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase', 'laptop'])
    const told = vault.wayins.map((wayin) => (wayin.wayinkind === 'passphrase' ? wayin.key_deriver_label : wayin.credential_id))
    expect(told).to.deep.equal([TH.testDeriver.key_deriver_label, laptop.credentialId])
  })

  it("hands each way in the props it shows as its holder, frozen, never the record it works from", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const holder = vault.wayins[0]?.holder ?? {}
    expect(holder).to.eq(vault.props)
    expect(Object.isFrozen(holder)).to.be.true
    expect(Reflect.set(holder, 'vault_id', 'another')).to.be.false
    expect(Object.isFrozen(vault.props?.wayins)).to.be.true
    await vault.lock()
    await vault.unlock('pw')
    expect(vault.state).to.eq('unlocked')
  })

  it("keeps the same Wayins until the vault props change", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const before = vault.wayins
    await vault.hello({ staleMinutes: 0 })
    expect(vault.wayins).to.eq(before)
    await vault.addPassphrase('pw', 'spare passphrase', { wayinlabel: 'spare' })
    expect(vault.wayins).to.not.eq(before)
    expect(vault.wayins).to.have.lengthOf(2)
  })

  it("has no ways in, and no props, until a read finds a vault", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.wayins).to.deep.equal([])
    expect(vault.props).to.be.null
  })

  it("shows the vault props as storage holds them, one frozen record (Contract: Vault)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.props).to.deep.equal(storedVaultPropsOf(world))
    expect(Object.isFrozen(vault.props)).to.be.true
    expect(vault.props).to.eq(vault.getSnapshot().props)
  })

  it("lends its models its logger, its key deriver and a checked clock, none writable", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.keyDeriver).to.eq(TH.testDeriver)
    expect(vault.logger).to.be.an('object')
    expect(vault.clock.now()).to.eq(world.clock.now())
    world.advance(5)
    expect(vault.clock.now()).to.eq(world.clock.now())
    for (const field of ['logger', 'clock', 'keyDeriver']) {
      expect(Reflect.set(vault, field, null), field).to.be.false
    }
  })

  it("tells a way in stored damaged as damaged_wayin news, its summary in meta.wayin_listed, and the read succeeds", async () => {
    const world = await damagedWayinWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews, deviceDB: memoryDeviceDB() })
    expect(vault.state).to.eq('locked')
    expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_wayin'])
    expect(told[0]?.meta?.wayin_listed).to.deep.equal(vault.wayins[1]?.summary)
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
    const spoiled = vault.wayins[1]?.wayin_id ?? ''
    await vault.delWayin('pw', spoiled)
    await vault.hello({ staleMinutes: 0 })
    expect(vault.trouble).to.be.null
    expect(vault.wayins).to.have.lengthOf(1)
  })

  it("never quotes a passphrase in the news, nor its salt", async () => {
    const world = await damagedWayinWorld()
    const { told, onBadNews } = newsKeeper()
    await world.open({ onBadNews })
    const said = JSON.stringify({ message: told[0]?.message, meta: told[0]?.meta })
    expect(said).to.not.include('spare passphrase')
    expect(said).to.not.include('c2FsdA')
  })
})
// --
