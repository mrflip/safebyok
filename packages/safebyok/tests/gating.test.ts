import { describe, it, expect, vi } from 'vitest'
import type { Gating, RequestCleartext } from '../src/gating'
import { type RefusalKind, VaultError } from '../src/errors'
import { type Outcome, bad } from '../src/outcome'
import { memoryDeviceDB } from '../src/device-db'
import type { StrengthChecker } from '../src/passphrase-strength'
import type { KeyDeriver } from '../src/key-deriver'
import { heldLeaseOf } from '../src/held-lease'
import type { Vault } from '../src/vault'
import * as TH from './test-helpers'
import { makeWorld, makeRacingWorld, vaultWithPasskey, storedVaultPropsOf } from './vault/world'

// == [Helpers]: World, lockedVaultIn, weakIsWeak

type World = ReturnType<typeof makeWorld>

/** `world`'s `u1` vault made with `pw`, holding one box, and a Vault object on it born locked under `overrides`. */
const lockedVaultIn = async (world: World, overrides: Partial<TH.BornVaultOpts>) => {
  const maker = await world.openUnlocked('pw')
  await maker.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
  await maker.lock()
  TH.closeVault(maker)
  return await world.open(overrides)
}

/** A strength checker that finds `weak` weak, and every other passphrase strong. */
const weakIsWeak: StrengthChecker = (passphrase) => (passphrase === 'weak' ? { strong: false, reason: 'Too easy to guess.' } : { strong: true })
// --

// == [Each kind]: a happy path per gatingkind

describe("a gating, kind by kind", () => {
  it("initialize_gate sets a novel vault's first passphrase, at gate_epoch 1, and unlocks it", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'initialize_gate')
    expect(await TH.expectGood(gating.attempt('pw'))).to.eq(vault)
    expect(await TH.expectGood(ensuring)).to.eq(vault)
    expect(vault.state).to.eq('unlocked')
    expect(vault.passphrase).to.not.be.null
    expect(vault.passkey).to.be.null
    expect(storedVaultPropsOf(world)).to.include({ gate_epoch: 1 })
  })

  it("initialize_gate sets a passkey beside the first passphrase when given one, and the passkey unlocks it later", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const putting = vault.tryPutWayin('passkey')
    const gating = TH.asKind(await dialog.asked(), 'initialize_gate')
    await TH.expectGood(gating.attempt('pw', await TH.passkeyOf('laptop')))
    await TH.expectGood(putting)
    expect(vault.passphrase).to.not.be.null
    expect(vault.passkey).to.not.be.null
    await vault.lock()
    const unlocking = vault.tryEnsureUnlocked()
    const unlock = TH.asKind(await dialog.asked(1), 'unlock_vault')
    await TH.expectGood(unlock.attemptPasskey(await TH.passkeyOf('laptop')))
    await TH.expectGood(unlocking)
    expect(vault.state).to.eq('unlocked')
  })

  it("unlock_vault unlocks by the passphrase, as TH.heldDialog's example shows", async () => {
    const world = makeWorld()
    await lockedVaultIn(world, {})
    const dialog = TH.heldDialog()
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'unlock_vault')
    expect(await TH.expectGood(gating.attemptPassphrase('pw'))).to.eq(vault)
    expect(await TH.expectGood(ensuring)).to.eq(vault)
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("unlock_vault unlocks by the passkey's answer", async () => {
    const { world, vault: maker } = await vaultWithPasskey()
    await maker.lock()
    TH.closeVault(maker)
    const dialog = TH.heldDialog()
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const reading = vault.getWhisper('anthropic')
    const gating = TH.asKind(await dialog.asked(), 'unlock_vault')
    await TH.expectGood(gating.attemptPasskey(await TH.passkeyOf('laptop')))
    expect(await reading).to.eq('sk-fake')
  })

  it("change_passphrase replaces the passphrase, moving the gate epoch up by one: the old one no longer opens it, the new one does, the gating narrowed as TH.asKind's example shows", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(world, { requestCleartext: dialog.requestCleartext })
    const before = vault.gate_epoch
    const putting = vault.tryPutWayin('passphrase')
    const gating = TH.asKind(await dialog.asked(), 'change_passphrase')
    await TH.expectGood(gating.attempt('pw', 'pw two'))
    expect(await TH.expectGood(putting)).to.eq(vault)
    expect(vault.gate_epoch).to.eq(before + 1)
    expect(vault.state).to.eq('unlocked')
    await vault.lock()
    const unlocking = vault.tryEnsureUnlocked()
    const unlock = TH.asKind(await dialog.asked(1), 'unlock_vault')
    await TH.expectBad(unlock.attemptPassphrase('pw'), 'wrong_passphrase')
    await TH.expectGood(unlock.attemptPassphrase('pw two'))
    await TH.expectGood(unlocking)
  })

  it("put_passkey adds a passkey, proven by the passphrase", async () => {
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(makeWorld(), { requestCleartext: dialog.requestCleartext })
    const putting = vault.tryPutWayin('passkey')
    const gating = TH.asKind(await dialog.asked(), 'put_passkey')
    await TH.expectGood(gating.attempt('pw', await TH.passkeyOf('laptop')))
    await TH.expectGood(putting)
    expect(vault.passkey).to.not.be.null
    expect(vault.state).to.eq('unlocked')
  })

  it("del_passkey removes the passkey, proven by the passphrase", async () => {
    const { world, vault: maker } = await vaultWithPasskey()
    TH.closeVault(maker)
    const dialog = TH.heldDialog()
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const removing = vault.tryDelWayin('passkey')
    const gating = TH.asKind(await dialog.asked(), 'del_passkey')
    await TH.expectGood(gating.attempt('pw'))
    await TH.expectGood(removing)
    expect(vault.passkey).to.be.null
    expect(storedVaultPropsOf(world)).to.include({ passkey: null })
  })

  it("del_vault deletes the vault, proven by the passphrase, settling with success, and then the vault locks and goes", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(world, { requestCleartext: dialog.requestCleartext })
    const deleting = vault.tryDel()
    const gating = TH.asKind(await dialog.asked(), 'del_vault')
    await TH.expectGood(gating.attempt('pw'))
    await TH.expectGood(deleting)
    expect(storedVaultPropsOf(world)).to.include({ format: 'safebyok-tombstone-v1' })
    expect(heldLeaseOf(vault)).to.be.null
    expect(await world.getLease()).to.be.null
    await TH.expectRefusal(vault.hello(), 'vault_gone')
  })
})
// --

// == [Correctable]: the four refusals that leave the gating open

describe("an attempt the user can correct", () => {
  /** Each correctable refusal: the call that raises its gating, the attempt that meets it, and the one that then succeeds. */
  const Correctables: readonly (readonly [
    RefusalKind,
    (vault: Vault) => Promise<Outcome<Vault>>,
    (gating: Gating) => Promise<Outcome<Vault>>,
    (gating: Gating) => Promise<Outcome<Vault>>,
    string,
  ])[] = [
    ['wrong_passphrase', (vault) => vault.tryEnsureUnlocked(), (gating) => TH.asKind(gating, 'unlock_vault').attemptPassphrase('pw typo'), (gating) => TH.asKind(gating, 'unlock_vault').attemptPassphrase('pw'), 'a typo in the passphrase'],
    ['wrong_passkey', (vault) => vault.tryEnsureUnlocked(), async (gating) => await TH.asKind(gating, 'unlock_vault').attemptPasskey({ ...await TH.passkeyOf('laptop'), prfBytes: new Uint8Array(32).fill(7) }), async (gating) => await TH.asKind(gating, 'unlock_vault').attemptPasskey(await TH.passkeyOf('laptop')), "another passkey's answer"],
    ['weak_passphrase', (vault) => vault.tryPutWayin('passphrase'), (gating) => TH.asKind(gating, 'change_passphrase').attempt('pw', 'weak'), (gating) => TH.asKind(gating, 'change_passphrase').attempt('pw', 'pw two'), 'a new passphrase the checker finds weak'],
    ['same_passphrase', (vault) => vault.tryPutWayin('passphrase'), (gating) => TH.asKind(gating, 'change_passphrase').attempt('pw', 'pw'), (gating) => TH.asKind(gating, 'change_passphrase').attempt('pw', 'pw two'), 'the same passphrase again'],
  ]

  for (const [refusalkind, raise, mistake, rightOne, blurb] of Correctables) {
    it(`refuses ${refusalkind} for ${blurb}, leaving the gating open: the next attempt with the right one succeeds, and the call resolves`, async () => {
      const { world, vault: maker } = await vaultWithPasskey()
      await maker.lock()
      TH.closeVault(maker)
      const dialog = TH.heldDialog()
      const vault = await world.open({ requestCleartext: dialog.requestCleartext, strengthChecker: weakIsWeak })
      const calling = raise(vault)
      const gating = await dialog.asked()
      await TH.expectBad(mistake(gating), refusalkind)
      await TH.expectGood(rightOne(gating))
      expect(await TH.expectGood(calling)).to.eq(vault)
      expect(dialog.requestCleartext).toHaveBeenCalledOnce()
    })
  }

  it("refuses bad_option for a malformed argument, leaving the gating open", async () => {
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(makeWorld(), { requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'unlock_vault')
    await TH.expectBad(gating.attemptPassphrase(42 as unknown as string), 'bad_option')
    await TH.expectGood(gating.attemptPassphrase('pw'))
    await TH.expectGood(ensuring)
  })
})
// --

// == [Attempts]: one at a time, none after the gating settled, the stale-state settle

describe("a gating's attempts", () => {
  it("refuses a second attempt while one runs as attempt_in_flight, trying nothing: the first goes on", async () => {
    const world = makeRacingWorld()
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(world, { requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'unlock_vault')
    const deriving = world.holdNextDerive()
    const first = gating.attemptPassphrase('pw')
    await deriving.reached
    await TH.expectBad(gating.attemptPassphrase('pw'), 'attempt_in_flight')
    deriving.release()
    await TH.expectGood(first)
    await TH.expectGood(ensuring)
  })

  it("refuses an attempt after the gating settled as gating_landed, trying nothing", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(world, { requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'unlock_vault')
    await TH.expectGood(gating.attemptPassphrase('pw'))
    await TH.expectGood(ensuring)
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await TH.expectBad(gating.attemptPassphrase('pw'), 'gating_landed')
    expect(reads).not.toHaveBeenCalled()
  })

  it("settles an initialize_gate as gate_made_elsewhere when another device set the vault's first passphrase while the user typed: nothing is written, and the next call asks to unlock", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await world.open({ vaultDB: world.deafVaultDB(), requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'initialize_gate')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(elsewhere, 'pw there')
    const writes = vi.spyOn(world.vaultDB, 'putVaultProps')
    await TH.expectBad(gating.attempt('pw here'), 'gate_made_elsewhere')
    await TH.expectBad(ensuring, 'gate_made_elsewhere')
    expect(writes).not.toHaveBeenCalled()
    await TH.expectBad(gating.attempt('pw here'), 'gating_landed')
    const again = vault.tryEnsureUnlocked()
    const unlock = TH.asKind(await dialog.asked(1), 'unlock_vault')
    await TH.expectGood(unlock.attemptPassphrase('pw there'))
    await TH.expectGood(again)
  })
})
// --

// == [Chain failures]: a step of the chain failing settles the gating with its refusal

describe("a step of an attempt's chain failing", () => {
  const ChainFailures: readonly (readonly [RefusalKind, (world: World, keyDeriver: KeyDeriver) => Partial<TH.BornVaultOpts>, 'unlock' | 'change', string])[] = [
    ['unexpected_error', (_world, keyDeriver) => {
      vi.spyOn(keyDeriver, 'deriveKeyBytes').mockRejectedValueOnce(new Error('out of memory deriving pw'))
      return {}
    }, 'unlock', 'the key deriver throwing'],
    ['stale_write', (world) => {
      vi.spyOn(world.vaultDB, 'putVaultProps').mockResolvedValueOnce(bad(new VaultError('stale_write', 'The vault props changed in storage.')))
      return {}
    }, 'change', 'putVaultProps refusing stale_write'],
    ['storage_unavailable', (world) => {
      vi.spyOn(world.deviceDB, 'putLease').mockRejectedValueOnce(new Error('device storage is full'))
      return {}
    }, 'unlock', 'putLease failing'],
    ['unexpected_error', () => ({ strengthChecker: () => { throw new Error('checker broke on pw two') } }), 'change', 'the strength checker throwing'],
  ]

  for (const [refusalkind, inject, flavor, blurb] of ChainFailures) {
    it(`settles the gating with ${refusalkind} for ${blurb}: the waiting call refuses it, and a later attempt gating_landed`, async () => {
      const keyDeriver: KeyDeriver = { ...TH.testDeriver }
      const world = makeWorld({ keyDeriver })
      const dialog = TH.heldDialog()
      const maker = await world.openUnlocked('pw')
      await maker.lock()
      TH.closeVault(maker)
      const vault = await world.open({ requestCleartext: dialog.requestCleartext, ...inject(world, keyDeriver) })
      const calling = flavor === 'unlock' ? vault.tryEnsureUnlocked() : vault.tryPutWayin('passphrase')
      const gating = await dialog.asked()
      const attempt = () => (flavor === 'unlock' ? TH.asKind(gating, 'unlock_vault').attemptPassphrase('pw') : TH.asKind(gating, 'change_passphrase').attempt('pw', 'pw two'))
      const err = await TH.expectBad(attempt(), refusalkind)
      expect(err.message).to.not.include('pw')
      await TH.expectBad(calling, refusalkind)
      await TH.expectBad(attempt(), 'gating_landed')
      expect(vault.state).to.eq('locked')
    })
  }
})
// --

// == [Landing]: a lock or a decline landing mid-chain

describe("a lock or a decline landing during an attempt", () => {
  it("leaves a write that landed and then a lock with the picture at the new gate, the attempt refusing gating_landed, and no lease in memory or on the device", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(world, { requestCleartext: dialog.requestCleartext })
    const before = vault.gate_epoch
    const putting = vault.tryPutWayin('passphrase')
    const gating = TH.asKind(await dialog.asked(), 'change_passphrase')
    const writing = TH.holdNextAnswer(world.vaultDB, 'putVaultProps')
    const attempting = gating.attempt('pw', 'pw two')
    await writing.reached
    await vault.lock()
    await TH.expectBad(putting, 'vault_locked')
    writing.release()
    await TH.expectBad(attempting, 'gating_landed')
    expect(vault.gate_epoch).to.eq(before + 1)
    expect(storedVaultPropsOf(world)).to.include({ gate_epoch: before + 1 })
    expect(vault.state).to.eq('locked')
    expect(heldLeaseOf(vault)).to.be.null
    expect(await world.getLease()).to.be.null
  })

  for (const [landing, blurb] of [
    [async (vault: Vault) => { await vault.lock() }, 'lock()'],
    [(_vault: Vault, gating: Gating) => { gating.decline(); return Promise.resolve() }, 'decline()'],
  ] as const) {
    it(`refuses the attempt gating_landed for a ${blurb} landing while grantLease writes the lease, holding no lease in memory`, async () => {
      const world = makeRacingWorld()
      const dialog = TH.heldDialog()
      const vault = await lockedVaultIn(world, { requestCleartext: dialog.requestCleartext })
      const ensuring = vault.tryEnsureUnlocked()
      const gating = TH.asKind(await dialog.asked(), 'unlock_vault')
      const leasing = world.holdNextLease()
      const attempting = gating.attemptPassphrase('pw')
      await leasing.reached
      await landing(vault, gating)
      leasing.release()
      await TH.expectBad(attempting, 'gating_landed')
      await TH.expectBad(ensuring, 'vault_locked')
      expect(vault.state).to.eq('locked')
      expect(heldLeaseOf(vault)).to.be.null
    })
  }
})
// --

// == [Joins]: which calls share a gating, and which wait one out

describe("joining a gating, by kind", () => {
  it("has two ensureUnlocked() calls share one gating", async () => {
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(makeWorld(), { requestCleartext: dialog.requestCleartext })
    const first = vault.tryEnsureUnlocked()
    const second = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'unlock_vault')
    await TH.expectGood(gating.attemptPassphrase('pw'))
    await TH.expectGood(first)
    await TH.expectGood(second)
    expect(dialog.requestCleartext).toHaveBeenCalledOnce()
  })

  it("has putWayin('passkey') wait out an unlock_vault gating standing, then raise its own put_passkey", async () => {
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(makeWorld(), { requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const unlock = TH.asKind(await dialog.asked(), 'unlock_vault')
    const putting = vault.tryPutWayin('passkey')
    await TH.wakeupAtNextTick()
    expect(dialog.requestCleartext).toHaveBeenCalledOnce()
    await TH.expectGood(unlock.attemptPassphrase('pw'))
    await TH.expectGood(ensuring)
    const put = TH.asKind(await dialog.asked(1), 'put_passkey')
    await TH.expectGood(put.attempt('pw', await TH.passkeyOf('laptop')))
    await TH.expectGood(putting)
    expect(vault.passkey).to.not.be.null
  })

  it("has ensureUnlocked() join a put_passkey gating standing, unlocked by its attempt", async () => {
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(makeWorld(), { requestCleartext: dialog.requestCleartext })
    const putting = vault.tryPutWayin('passkey')
    const put = TH.asKind(await dialog.asked(), 'put_passkey')
    const ensuring = vault.tryEnsureUnlocked()
    await TH.wakeupAtNextTick()
    await TH.expectGood(put.attempt('pw', await TH.passkeyOf('laptop')))
    await TH.expectGood(putting)
    await TH.expectGood(ensuring)
    expect(dialog.requestCleartext).toHaveBeenCalledOnce()
    expect(vault.state).to.eq('unlocked')
  })

  it("has del() wait out an unlock_vault gating standing, then raise its own del_vault", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(world, { requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const unlock = TH.asKind(await dialog.asked(), 'unlock_vault')
    const deleting = vault.tryDel()
    await TH.wakeupAtNextTick()
    expect(dialog.requestCleartext).toHaveBeenCalledOnce()
    await TH.expectGood(unlock.attemptPassphrase('pw'))
    await TH.expectGood(ensuring)
    const del = TH.asKind(await dialog.asked(1), 'del_vault')
    await TH.expectGood(del.attempt('pw'))
    await TH.expectGood(deleting)
    expect(storedVaultPropsOf(world)).to.include({ format: 'safebyok-tombstone-v1' })
  })
})
// --

// == [Pantry]: an unlock's gating consults this device's store first

describe("an unlock's consult of this device's store", () => {
  it("takes up another tab's lease without calling requestCleartext", async () => {
    const world = makeWorld()
    const requestCleartext = vi.fn<RequestCleartext>()
    const vault = await lockedVaultIn(world, { requestCleartext })
    const otherTab = await world.open()
    await TH.unlock(otherTab, 'pw')
    expect(vault.state).to.eq('locked')
    expect(await vault.ensureUnlocked()).to.eq(vault)
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(vault.state).to.eq('unlocked')
    expect(vault.askPassphraseAt).to.eq(otherTab.askPassphraseAt)
  })

  it("takes nothing up when a lock() lands during the consult, and refuses vault_locked without asking", async () => {
    const world = makeWorld()
    const requestCleartext = vi.fn<RequestCleartext>()
    const vault = await lockedVaultIn(world, { requestCleartext })
    const otherTab = await world.open()
    await TH.unlock(otherTab, 'pw')
    const reading = TH.holdNextAnswer(world.deviceDB, 'getLease')
    const ensuring = vault.tryEnsureUnlocked()
    await reading.reached
    await vault.lock()
    reading.release()
    await TH.expectBad(ensuring, 'vault_locked')
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(vault.state).to.eq('locked')
    expect(heldLeaseOf(vault)).to.be.null
  })
})
// --

// == [Helpers' own]: TH.asKind refusing another kind

describe("TH.asKind", () => {
  it("throws, naming both kinds, for a gating of another kind", async () => {
    const dialog = TH.heldDialog()
    const vault = await lockedVaultIn(makeWorld(), { requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await dialog.asked()
    expect(() => TH.asKind(gating, 'del_vault')).to.throw('Expected a del_vault gating, but was handed unlock_vault.')
    dialog.close()
    await TH.expectBad(ensuring, 'vault_locked')
  })
})
// --
