import { describe, it, expect, vi } from 'vitest'
import { VaultError, isVaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import type { Vault } from '../../src/vault'
import { Bank } from '../../src/bank'
import { delDamagedVault } from '../../src/del-damaged-vault'
import { setDefaultLogger, DefaultLogger } from '../../src/logger'
import { bad, valOf } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeWorld, boxlabelsOf, isU1Box, u1BoxScopepath, u1VaultScopepath, SevenDaysMillis, spoilableDeviceDB, storedVaultRecordOf, storedWayinOf, HourMillis, damagedVaultWorld, storedRowOf, rowsOf, rolledBackWorld, addLaptopPasskey } from './world'


// == [Scoping, snapshot, tampering]: scoping, snapshot and subscribers, what the backend sees, SpoiledShells, tampering

describe("scoping", () => {
  it("two users each keep a box by the same label, unseen by the other", async () => {
    const world = makeWorld()
    const one = await world.openUnlocked('pw one', { user_id: 'u1' })
    await one.putBox({ boxlabel: 'anthropic' }, 'u1-secret')
    const two = await world.open({ user_id: 'u2' })
    expect(TH.stateOf(two.getSnapshot())).to.eq('novel')
    await TH.unlock(two, 'pw two')
    await two.putBox({ boxlabel: 'anthropic' }, 'u2-secret')
    expect(await one.getWhisper('anthropic')).to.eq('u1-secret')
    expect(await two.getWhisper('anthropic')).to.eq('u2-secret')
  })

  it("one user's lease opens nothing for another", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { user_id: 'u1' })
    expect(await world.stateOnOpen({ user_id: 'u2' })).to.eq('novel')
  })
})

describe("the snapshot and its subscribers", () => {
  it("refuses a listener that is not a function as it subscribes, so no later change meets it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(() => vault.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /Expected a function/)
    await TH.unlock(vault, 'pw')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
  })

  it("hears out a listener that throws: the call that changed the snapshot resolves, every other listener is told, and what it threw is logged and reported", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const world = makeWorld()
      const vault = await world.open()
      const thrown = new Error('a listener that throws')
      vault.subscribe(() => { throw thrown })
      const heard = vi.fn()
      vault.subscribe(heard)
      await TH.unlock(vault, 'pw')
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
      expect(vault.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
      expect(heard).toHaveBeenCalled()
      expect(reported.length).to.be.greaterThan(0)
      expect(reported.every((err) => err === thrown)).to.be.true
      expect(world.logged.some((call) => call.level === 'error' && call.story?.['call'] === 'subscribe')).to.be.true
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("keeps its identity until something changes", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const before = vault.getSnapshot()
    expect(vault.getSnapshot()).to.eq(before)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(vault.getSnapshot()).to.not.eq(before)
  })

  it("tells listeners when it unlocks and stores, and unsubscribing silences it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    let heardCount = 0
    const unsubscribe = vault.subscribe(() => { heardCount += 1 })
    await TH.unlock(vault, 'pw')
    expect(heardCount).to.be.greaterThan(0)
    const heardBefore = heardCount
    unsubscribe()
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(heardCount).to.eq(heardBefore)
  })

  it("hears about boxes written through another handle", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.open()
    await there.putBox({ boxlabel: 'anthropic' }, 'written elsewhere')
    await vi.waitFor(() => { expect(boxlabelsOf(here)).to.deep.equal(['anthropic']) })
  })
})

describe("what the backend sees", () => {
  it("stores no whisper and no passphrase in the clear, anywhere", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a very memorable passphrase')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'sidecars are visible in storage' } }, 'sk-ant-api03-fake-but-secret')
    const everything = world.dbStore.scopepaths().map((scopepath) => world.dbStore.get(scopepath)).join('\n')
    expect(everything).to.not.include('sk-ant-api03-fake-but-secret')
    expect(everything).to.not.include('a very memorable passphrase')
    expect(everything).to.include('sidecars are visible in storage') // the sidecar is visible by design
    expect(everything).to.include('whisper_ciphered')
  })

  it("two stores of the same whisper write different ciphertext: fresh key and iv every time", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'one_box' }, 'the same whisper')
    await vault.putBox({ boxlabel: 'two_box' }, 'the same whisper')
    const [oneRow, twoRow] = world.dbStore.scopepaths().filter((scopepath) => isU1Box(scopepath))
      .map((ckey) => JSON.parse(world.dbStore.get(ckey) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } })
    expect(oneRow?.whisper_ciphered.ciphertext_b64).to.not.eq(twoRow?.whisper_ciphered.ciphertext_b64)
  })
})

/** A box row's visible fields altered in storage, each a field its encryptions bind. */
const SpoiledShells = [
  [(row: Record<string, unknown>) => ({ ...row, sidecar: { note: 'personal account' } }),               'its sidecar swapped for another'],
  [(row: Record<string, unknown>) => ({ ...row, sidecar: {} }),                                           'its sidecar emptied'],
  [(row: Record<string, unknown>) => ({ ...row, sidecar: { note: ['work account'] } }),                   "its sidecar's note wrapped in a list"],
  [({ registered_at: kept, ...row }: Record<string, unknown>) => ({ ...row, registered_at: (kept as number) - 1 }), 'its registered_at moved'],
  [({ written_at: kept, ...row }: Record<string, unknown>) => ({ ...row, written_at: (kept as number) + 1 }),       'its written_at moved'],
  [(row: Record<string, unknown>) => ({ ...row, revision_tok: 'rev-elsewhere' }),                         'its revision_tok swapped'],
] as const

describe("tampering", () => {
  it("a box with altered ciphertext refuses to open, and is left as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const ckey = world.dbStore.scopepaths().find((scopepath) => isU1Box(scopepath))
    const row = JSON.parse(world.dbStore.get(ckey ?? '') ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.put(ckey ?? '', JSON.stringify(row))
    const err = await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(err.message).to.not.include('sk-fake')
    expect(world.dbStore.get(ckey ?? '')).to.not.be.null  // preserved for forensics, never auto-deleted
  })

  it("a box row moved under another label refuses to open", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'victim_box' }, 'sk-fake')
    const fromCkey = world.dbStore.scopepaths().find((candidate) => candidate.includes('victim_box'))
    world.dbStore.put(u1BoxScopepath('other_box'), world.dbStore.get(fromCkey ?? '') ?? '')
    await TH.expectRefusal(vault.getWhisper('other_box'), 'damaged_box')
  })

  for (const [spoil, blurb] of SpoiledShells) {
    it(`a box with ${blurb} refuses to open, and is left as it is: its whole visible header is bound`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
      const ckey = world.dbStore.scopepaths().find((candidate) => isU1Box(candidate)) ?? ''
      const row = JSON.parse(world.dbStore.get(ckey) ?? '{}') as Record<string, unknown>
      const spoiled = JSON.stringify(spoil(row))
      world.dbStore.put(ckey, spoiled)
      await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
      expect(world.dbStore.get(ckey)).to.eq(spoiled)
    })
  }

  it("vault record whose vault_tok was altered open to no passphrase: it is bound into every way in", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const vaultRecord = JSON.parse(world.dbStore.get(u1VaultScopepath) ?? '{}') as { vault_tok: string }
    world.dbStore.put(u1VaultScopepath, JSON.stringify({ ...vaultRecord, vault_tok: `${vaultRecord.vault_tok}-moved` }))
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(TH.unlock(vault, 'pw'), 'wrong_passphrase')
    // The decryption fails as for a typo, so the message names both, and claims neither.
    expect(err.message).to.include('Check for typos')
    expect(err.message).to.include('the stored vault may be damaged')
  })

  it("a vault record that does not parse makes the open itself refuse as damaged_vault, its check's bad_record its cause, deleting nothing", async () => {
    const world = makeWorld()
    world.dbStore.put(u1VaultScopepath, '{"format":"safebyok-vault-v6"}')
    const err = await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(err.message).to.include("can't be opened")
    expect(isVaultError(err.cause, 'bad_record')).to.be.true
    expect(world.dbStore.get(u1VaultScopepath)).to.eq('{"format":"safebyok-vault-v6"}')
  })

  it("a box that will not open under the vault's own key is called damaged, with the remedy, never quoting its boxlabel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const row = JSON.parse(world.dbStore.get(u1BoxScopepath('anthropic')) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify(row))
    const err = await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(err.message).to.include('so it is damaged')
    expect(err.message).to.not.include('anthropic')
    expect(err.message).to.include('remove it')
    expect(err.message).to.include('hello({ staleMinutes: 0 })')
    await vault.delBox('anthropic')
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })
})
// --

// == [The logger]: drainDown, throwingLogger, storedSecrets, throwFromLogger, the logger

const drainDown = (): never => { throw new Error('the log drain is down') }

/** A logger whose every call throws, as a broken log drain might. */
const throwingLogger = () => ({ log: drainDown, warn: drainDown, error: drainDown })

/** Every ciphertext, salt and wrapped key the backend holds, as base64url text. */
const storedSecrets = (world: ReturnType<typeof makeWorld>): string[] => {
  const everything = world.dbStore.scopepaths().map((scopepath) => world.dbStore.get(scopepath) ?? '').join('\n')
  return Array.from(everything.matchAll(/"(?:ciphertext_b64|salt_b64)":"([^"]+)"/g), (hit) => hit[1]!)
}

/** A refusal of kind identity_revoked, as an adapter says a user signed out. */
const signedOut = () => new VaultError('identity_revoked', 'No one is signed in, so this vault cannot be reached: sign in, then try again.')

/** Ring `world`'s storage with a vault record that does not read: the vault's background refresh fails, and warns. */
const spoilVaultRecord = async (world: ReturnType<typeof makeWorld>) => {
  world.dbStore.put(u1VaultScopepath, '{"format":"safebyok-vault-v6"}')
  await TH.wakeupAtNextTick()
}

/** A logger's every call, for a logger that fails: what it throws must break nothing. */
const throwFromLogger = () => { throw new Error('a logger that throws') }

describe("the logger", () => {
  it("hears nothing from a vault going about its business", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work account' } }, 'sk-fake')
    await vault.getWhisper('anthropic')
    await TH.putWayin(vault, 'pw', 'pw two')
    await vault.lock()
    await TH.unlock(vault, 'pw two')
    await vault.delBox('anthropic')
    await vault.lock()
    world.advance(SevenDaysMillis * 2)
    await world.open()
    await TH.del(vault, 'pw two')
    expect(world.logged).to.have.lengthOf(0)
  })

  it("is the console when the host passes none, each message tagged safebyok", async () => {
    const world = makeWorld()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    try {
      await world.openUnlocked('pw', { logger: undefined })
      warn.mockClear()  // the test_ deriver's notice, said in opening
      await spoilVaultRecord(world)
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls[0]?.[0])).to.match(/^safebyok: Storage rang with a change the vault could not read/)
    } finally {
      warn.mockRestore()
    }
  })

  it("is not the vaultDB's: what its storage has nobody to throw to goes to the logger the storage was made with", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.open({ vaultDB })
    vaultDB.subscribe(TH.scopeOf('u2'), () => { throw new Error('a listener of the host that throws') })
    await TH.expectingGood(vaultDB).tryEnsureVault(TH.gatelessOf('u2'))
    expect(own.calls).to.have.lengthOf(1)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("is not the vaultDB's when the vaultDB was made with none: that one logs to the console, whatever the vault is given", async () => {
    const world = makeWorld()
    const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const vaultDB = localVaultDB({ store: world.dbStore })
    await world.open({ vaultDB })
    vaultDB.subscribe(TH.scopeOf('u2'), () => { throw new Error('a listener of the host that throws') })
    await TH.expectingGood(vaultDB).tryEnsureVault(TH.gatelessOf('u2'))
    expect(consoleErrors).toHaveBeenCalledOnce()
    expect(world.logged).to.have.lengthOf(0)
    consoleErrors.mockRestore()
  })

  it("is the vaultDB's logger when the host passes the vault none: one given to the storage once hears both", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.openUnlocked('pw', { vaultDB, logger: undefined })
    await spoilVaultRecord(world)
    expect(own.calls.map((call) => [call.level, call.story])).to.deep.equal([['warn', { call: 'refresh' }]])
    expect(world.logged).to.have.lengthOf(0)
  })

  it("guards the vaultDB's logger too: a VaultDB of the host's own whose logger throws breaks no lock", async () => {
    const world = makeWorld()
    const vaultDB = localVaultDB({ store: world.dbStore })
    // As a subclass overriding the getter would: its logger is the host's to answer.
    Object.defineProperty(vaultDB, 'logger', { value: { log: throwFromLogger, warn: throwFromLogger, error: throwFromLogger } })
    const vault = await world.openUnlocked('pw', { vaultDB, logger: undefined })
    vi.spyOn(vaultDB, 'tryGetBox').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'identity_revoked')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
  })

  it("refuses a vaultDB whose logger is not one, before reading storage, when the host passes the vault none", async () => {
    const world = makeWorld()
    const vaultDB = localVaultDB({ store: world.dbStore })
    const ensureVault = vi.spyOn(vaultDB, 'tryEnsureVault')
    Object.defineProperty(vaultDB, 'logger', { value: { log: () => undefined } })
    const err = await TH.expectRefusal(world.open({ vaultDB, logger: undefined }), 'bad_option')
    expect(err.message).to.match(/^warn: Expected a function; error: Expected a function$/)
    expect(ensureVault).not.toHaveBeenCalled()
  })

  it("takes null as none: the vaultDB's logger", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.openUnlocked('pw', { vaultDB, logger: null })
    await spoilVaultRecord(world)
    expect(own.calls.map((call) => call.story)).to.deep.equal([{ call: 'refresh' }])
  })

  it("is the default logger, whatever the vaultDB was made with, when the host passes DefaultLogger, as its example shows", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const telemetry = TH.spyLogger()
    setDefaultLogger(telemetry.logger)
    try {
      const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
      await world.openUnlocked('pw', { vaultDB, logger: DefaultLogger })
      await spoilVaultRecord(world)
      expect(telemetry.calls.map((call) => call.story)).to.deep.equal([{ call: 'refresh' }])
      expect(own.calls).to.have.lengthOf(0)
    } finally {
      setDefaultLogger(undefined)
    }
  })

  it("is the app's default, set once, when neither the host nor the vaultDB's factory was given one", async () => {
    const world = makeWorld()
    const telemetry = TH.spyLogger()
    setDefaultLogger(telemetry.logger)
    try {
      const vaultDB = localVaultDB({ store: world.dbStore })
      await world.openUnlocked('pw', { vaultDB, logger: undefined })
      await spoilVaultRecord(world)
      expect(telemetry.calls.map((call) => call.story)).to.deep.equal([{ call: 'refresh' }])
    } finally {
      setDefaultLogger(undefined)
    }
  })

  it("is the host's own for the vault, when it passes one, whatever the vaultDB was made with", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.openUnlocked('pw', { vaultDB })
    await spoilVaultRecord(world)
    expect(world.logged).to.have.lengthOf(1)
    expect(own.calls).to.have.lengthOf(0)
  })

  it("refuses a logger that is not one, before reading storage", async () => {
    const world = makeWorld()
    const ensureVault = vi.spyOn(world.vaultDB, 'tryEnsureVault')
    for (const nonsense of [{}, { log: () => undefined, warn: () => undefined }, 'console']) {
      const err = await TH.expectRefusal(world.open({ logger: nonsense as unknown as TH.BornVaultOpts['logger'] }), 'bad_option')
      expect(err.message).to.match(/^In Bank.make's options: logger(\.\w+)?: Expected a (function|VaultLogger)/)
    }
    expect(ensureVault).not.toHaveBeenCalled()
  })

  it("warns once when a lease could not be read, telling nothing of the record", async () => {
    const world = makeWorld()
    const device = spoilableDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, vaultlabel: 'spare' }))
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('locked')
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'hello' }, err: undefined })
    expect(world.logged[0]?.message).to.match(/lease could not be read/)
  })

  it("takes up a lease whose wrap was altered, unopened, and refuses it 'damaged_lease' at its first use, erasing it and locking", async () => {
    const world = makeWorld()
    const device = spoilableDeviceDB()
    const vault = await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    device.spoilRow((row) => {
      const wrapped = row['vault_key_lease_wrapped'] as { cipher_iv_b64: string, ciphertext_b64: string }
      return { ...row, vault_key_lease_wrapped: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } }
    })
    const reopened = await world.open({ deviceDB: device.deviceDB })
    expect(TH.stateOf(reopened.snapshot)).to.eq('unlocked')
    await TH.expectRefusal(reopened.getWhisper('anthropic'), 'damaged_lease')
    expect(TH.stateOf(reopened.snapshot)).to.eq('locked')
    await TH.wakeupAtNextTick()
    const cached = await device.deviceDB.tryGetLease(TH.scopeOf('u1'))
    expect(valOf(cached)).to.be.null
  })

  it("leaves a lease of another scope where it lies at birth: no erase is tried, and the vault is born locked", async () => {
    const world = makeWorld()
    const device = spoilableDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, vaultlabel: 'spare' }))
    const erasing = vi.spyOn(device.deviceDB, 'tryDelLease')
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('locked')
    expect(erasing).not.toHaveBeenCalled()
    expect(device.rows.size).to.eq(1)
  })

  it("says nothing of a lease that simply ran out, or that a new passphrase outdated", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    world.advance(SevenDaysMillis + 1)
    expect(await world.stateOnOpen()).to.eq('locked')
    await TH.unlock(vault, 'pw')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.putWayin(elsewhere, 'pw', 'pw two')
    expect(await world.stateOnOpen()).to.eq('locked')
    expect(world.logged).to.have.lengthOf(0)
  })

  it("warns when a background refresh fails, with the refusal as its error", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    // That write's bell is answered first: a ring during a read is answered by that read.
    await TH.wakeupAtNextTick()
    world.dbStore.put(u1VaultScopepath, '{"format":"safebyok-vault-v6"}')
    await TH.wakeupAtNextTick()
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.story).to.deep.equal({ call: 'refresh' })
    expect((world.logged[0]?.err as VaultError).refusalkind).to.eq('damaged_vault')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(1)  // the snapshot is as it was
  })

  it("never breaks a lock, a hello, a refresh or a refused hello when it throws", async () => {
    const world = makeWorld()
    const logger = throwingLogger()
    const device = spoilableDeviceDB()
    const reading = world.clock.now()
    const clock = { now: () => reading }
    const vault = await world.openUnlocked('pw', { logger, deviceDB: device.deviceDB, clock })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    // a refresh rung in the background, failing
    const row = world.dbStore.get(u1BoxScopepath('anthropic')) ?? ''
    world.dbStore.put(u1BoxScopepath('anthropic'), '{"not":"a box"}')
    await TH.wakeupAtNextTick()
    world.dbStore.put(u1BoxScopepath('anthropic'), row)
    // a lock for storage that no longer serves the user
    vi.spyOn(world.vaultDB, 'tryGetBox').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'identity_revoked')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    // a birth that warns of an unreadable lease
    await TH.unlock(vault, 'pw')
    device.spoilRow((row) => ({ ...row, user_id: 'u2' }))
    expect(await world.stateOnOpen({ logger, deviceDB: device.deviceDB, clock })).to.eq('locked')
    // a birth refused
    vi.spyOn(world.vaultDB, 'tryEnsureVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    await TH.expectRefusal(world.open({ logger }), 'not_permitted')
  })

  it("is never handed a whisper, a passphrase, a ciphertext or a salt, whatever it hears", async () => {
    const world = makeWorld()
    const device = spoilableDeviceDB()
    const whisper = 'sk-FAKESECRET-whisper'
    const passphrase = 'FAKESECRET passphrase'
    const vault = await world.openUnlocked(passphrase, { deviceDB: device.deviceDB })
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'FAKESECRET note' } }, whisper)
    // every call site: a change whose record could not be raised (the device store's own error
    // kept nowhere, as it may quote the record), a lease that reads but is another scope's, its
    // wrap and all, a background refresh refused
    TH.spyOnDeviceHook(device.deviceDB, 'incrementDeviceRecord').mockRejectedValueOnce(new Error('the device store broke: disk full'))
    await TH.putWayin(vault, passphrase, `${passphrase} two`)
    const secrets = storedSecrets(world)
    device.spoilRow((row) => ({ ...row, user_id: 'u2' }))
    const reopened = await world.open({ deviceDB: device.deviceDB })
    TH.closeVault(reopened)
    world.dbStore.put(u1VaultScopepath, JSON.stringify({ ...storedVaultRecordOf(world), registered_at: whisper }))
    await TH.wakeupAtNextTick()
    vi.spyOn(world.vaultDB, 'tryEnsureVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    await TH.expectRefusal(world.open(), 'not_permitted')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'warn', 'warn'])
    expect((world.logged[0]?.err as VaultError).refusalkind).to.eq('storage_unavailable')
    expect(world.logged[0]?.err?.cause).to.be.undefined
    const text = TH.loggedText(world.logged)
    // the device store's own words reach the logger neither as a cause nor in a message
    expect(text).to.not.include('disk full')
    expect(text.toLowerCase()).to.not.include('fakesecret')
    expect(secrets.length).to.be.greaterThan(2)
    for (const secret of secrets) { expect(text).to.not.include(secret) }
  })
})
// --

// == [Signed out and the device record]: u1Main, bankIn, no longer signed in, recordIn, this device's record of the vault

/** The vault every world here births: `u1`'s `main`. */
const u1Main = { user_id: 'u1', vaultlabel: 'main' } as const

/** A bank of `world`'s options, `overrides` among them, for a test that asks it for a vault itself. */
const bankIn = (world: ReturnType<typeof makeWorld>, overrides?: Partial<TH.BornVaultOpts>) => {
  const { vaultlabel: _vaultlabel, ...bankOpts } = world.optsWith(overrides)
  return Bank.make(bankOpts)
}

describe("when storage says the user is no longer signed in", () => {
  /** Each vault call that reaches storage, the storage verb it reaches, and the call: one per `VaultDB` verb the vault calls. */
  const RevokedCallCases: readonly (readonly [string, 'tryGetVault' | 'tryGetBox' | 'tryPutBox' | 'tryPutVaultRecord' | 'tryDelBox' | 'tryDelVault', (vault: Vault) => Promise<unknown>])[] = [
    ['getWhisper()',       'tryGetBox',          (vault) => vault.getWhisper('anthropic')],
    ['putBox()',           'tryPutBox',          (vault) => vault.putBox({ boxlabel: 'openai' }, 'sk-fake-two')],
    ['delBox()',           'tryDelBox',          (vault) => vault.delBox('anthropic')],
    ['an unlock',          'tryGetVault',        async (vault) => { await vault.lock(); await TH.unlock(vault, 'pw one') }],
    ['putWayin()',         'tryPutVaultRecord',   (vault) => TH.putWayin(vault, 'pw one', 'pw two')],
    ['del()',              'tryDelVault',         (vault) => TH.del(vault, 'pw one')],
  ]

  for (const [callTitle, verb, call] of RevokedCallCases) {
    it(`locks at once when ${callTitle} meets it, throws the refusal itself, and removes nothing stored`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake-one')
      // That write's bell is answered first, so the refusal below is this call's to meet.
      await TH.wakeupAtNextTick()
      const refusal = signedOut()
      vi.spyOn(world.vaultDB, verb).mockResolvedValueOnce(bad(refusal))
      expect(await TH.expectRefusal(call(vault), 'identity_revoked')).to.eq(refusal)
      expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
      expect(vault.getSnapshot().ask_passphrase_at).to.be.null
      expect(await world.getLease()).to.be.null
      // An unlock's waiters hear the lock as it lands, while the read that met the refusal is still
      // unwinding: a call made before it has would share that read, and its refusal.
      await TH.wakeupAtNextTick()
      await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
      // Signed in again: the passphrase it had still opens it, and the box is still there.
      await TH.unlock(vault, 'pw one')
      expect(await vault.getWhisper('anthropic')).to.eq('sk-fake-one')
    })

  }

  /** The calls whose caller awaits the storage verb itself, one per `VaultDB` verb the vault calls: a gating's waiters (putWayin) hear the lock as it lands, before the erase, and are not here. */
  const DirectCallCases: readonly (readonly [string, 'tryGetVault' | 'tryGetBox' | 'tryPutBox' | 'tryDelBox' | 'tryDelVault', (vault: Vault) => Promise<unknown>])[] = [
    ['getWhisper()',       'tryGetBox',          (vault) => vault.getWhisper('anthropic')],
    ['putBox()',           'tryPutBox',          (vault) => vault.putBox({ boxlabel: 'openai' }, 'sk-fake-two')],
    ['delBox()',           'tryDelBox',          (vault) => vault.delBox('anthropic')],
    ['refresh()',          'tryGetVault',        (vault) => vault.refresh()],
    ['del()',              'tryDelVault',         (vault) => TH.del(vault, 'pw one')],
  ]

  for (const [callTitle, verb, call] of DirectCallCases) {
    it(`has locked, and erased this device's lease, before the caller of ${callTitle} hears the refusal`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake-one')
      await TH.wakeupAtNextTick()
      // The erase lands in the device store, and its answer waits at the latch: a caller that heard
      // the refusal while it waited was not made to wait for the erase.
      const erasing = TH.holdNextAnswer(world.deviceDB, 'tryDelLease')
      vi.spyOn(world.vaultDB, verb).mockResolvedValueOnce(bad(signedOut()))
      let heard = false
      const calling = (async () => {
        await TH.expectRefusal(call(vault), 'identity_revoked')
        heard = true
      })()
      await erasing.reached
      expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
      expect(await world.getLease()).to.be.null
      await TH.wakeupAtNextTick()
      await TH.wakeupAtNextTick()
      expect(heard).to.be.false
      erasing.release()
      await calling
    })
  }

  it("locks when a background refresh meets it, and tells the logger, having nobody to throw to", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'tryGetVault').mockResolvedValue(bad(signedOut()))
    // Any write rings the store's change bell, and the vault looks.
    world.dbStore.put('elsewhere', '{}')
    await vi.waitFor(() => { expect(TH.stateOf(vault.getSnapshot())).to.eq('locked') })
    expect(await world.getLease()).to.be.null
    await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.deep.equal(['log', 'warn']) })
    expect(world.logged[0]).to.deep.include({ level: 'log', story: { call: 'untrustedStorage' } })
    expect(world.logged[0]?.message).to.match(/no longer serves the user/)
  })

  it("calls subscribers with the locked snapshot", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const heard: string[] = []
    vault.subscribe(() => { heard.push(TH.stateOf(vault.getSnapshot())) })
    vi.spyOn(world.vaultDB, 'tryGetBox').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'identity_revoked')
    // Told locked, then told of the bad news as its trouble: never unlocked again between.
    expect([...new Set(heard)]).to.deep.equal(['locked'])
    expect(vault.snapshot.trouble?.refusalkind).to.eq('identity_revoked')
  })

  it("revokes the lease when it meets the vault's birth, which then refuses", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw one')
    TH.closeVault(first)
    expect(await world.getLease()).to.not.be.null
    vi.spyOn(world.vaultDB, 'tryEnsureVault').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(world.open(), 'identity_revoked')
    expect(await world.getLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("refuses the birth as storage did, and warns, when the device store will not erase the lease", async () => {
    const world = makeWorld()
    TH.closeVault(await world.openUnlocked('pw one'))
    const stuck = new Error('the device store is read-only')
    TH.spyOnDeviceHook(world.deviceDB, 'delLease').mockRejectedValueOnce(stuck)
    vi.spyOn(world.vaultDB, 'tryEnsureVault').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(world.open(), 'identity_revoked')
    expect(await world.getLease()).to.not.be.null
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'untrustedStorage' }]])
    expect(world.logged[0]?.err?.cause).to.be.undefined
  })

  it("takes no option to stay unlocked: Bank.make refuses one, as it refuses any option it does not know", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => bankIn(world, { whenIdentityRevoked: 'stay' } as Partial<TH.BornVaultOpts>), 'bad_option')
    expect(err.message).to.include('There is a field it does not take')
  })

  it("locks nothing for not_permitted: the vault's own user, refused one call", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'tryGetBox').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'You may not read this vault.')))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'not_permitted')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })

  it("locks all the same, and throws the refusal, when the device store will not erase the lease", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const stuck = new Error('the device store is read-only')
    TH.spyOnDeviceHook(world.deviceDB, 'delLease').mockRejectedValueOnce(stuck)
    vi.spyOn(world.vaultDB, 'tryGetBox').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'identity_revoked')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    expect(await world.getLease()).to.not.be.null
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'untrustedStorage' } })
    expect((world.logged[0]?.err as VaultError).refusalkind).to.eq('storage_unavailable')
    expect(world.logged[0]?.err?.cause).to.be.undefined
  })
})

/** This device's record of `u1`'s vault, as its deviceDB keeps it, or null for none. */
const recordIn = (world: ReturnType<typeof makeWorld>) => TH.expectGood(world.deviceDB.tryGetDeviceRecord(TH.scopeOf('u1')))

/** The highest vault_epoch this device's record of `u1`'s vault holds, or null for no record. */
const recordEpochIn = async (world: ReturnType<typeof makeWorld>) => {
  const record = await recordIn(world)
  return record?.highest_vault_epoch ?? null
}

describe("this device's record of the vault", () => {
  it("is kept from the vault's birth: the scope, the highest vault_epoch seen, and an id of its own, which the first way in carries", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const record = await recordIn(world)
    expect(record).to.deep.include({ format: 'safebyok-device-v1', ...TH.scopeOf('u1'), highest_vault_epoch: storedVaultRecordOf(world)['vault_epoch'] })
    expect(storedWayinOf(world, 'passphrase')).to.deep.include({ device_id: record?.device_id, registered_at: world.clock.now() })
  })

  it("keeps the id the first way in carries, though a refresh the first gate set off gets there first", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const putVaultRecord = world.vaultDB.tryPutVaultRecord.bind(world.vaultDB)
    // The write rings this vault's own watch, whose refresh runs to its end before the unlock goes on.
    vi.spyOn(world.vaultDB, 'tryPutVaultRecord').mockImplementationOnce(async (...args) => {
      const settled = await putVaultRecord(...args)
      await TH.wakeupAtNextTick()
      return settled
    })
    await TH.unlock(vault, 'pw')
    const record = await recordIn(world)
    expect(storedWayinOf(world, 'passphrase')?.['device_id']).to.eq(record?.device_id)
  })

  it("rises with each newer vault_epoch, its own writes' and another device's, and every way in this device adds carries its id", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const { device_id: deviceId } = await recordIn(world) ?? {}
    world.advance(HourMillis)
    await addLaptopPasskey(vault)
    expect(await recordIn(world)).to.deep.include({ device_id: deviceId, highest_vault_epoch: 2 })
    expect(storedWayinOf(world, 'passkey')).to.deep.include({ device_id: deviceId, registered_at: world.clock.now() })
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await TH.putWayin(elsewhere, 'pw', await TH.passkeyOf('phone'))
    await TH.wakeupAtNextTick()
    expect(await recordIn(world)).to.deep.include({ device_id: deviceId, highest_vault_epoch: 3 })
    expect(storedWayinOf(world, 'passkey')?.['device_id']).to.be.a('string').and.not.eq(deviceId)
  })

  it("stamps a passphrase afresh when it changes: the device that changed it, and the time it did", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const before = storedWayinOf(world, 'passphrase')
    world.advance(HourMillis)
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await TH.putWayin(elsewhere, 'pw', 'pw two')
    const after = storedWayinOf(world, 'passphrase')
    expect(after).to.deep.include({ registered_at: world.clock.now() })
    expect(after?.['device_id']).to.be.a('string').and.not.eq(before?.['device_id'])
    expect(after?.['salt_b64']).to.not.eq(before?.['salt_b64'])
  })

  it("survives lock(), and del() raises it to the tombstone's vault_epoch, erasing nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const { device_id: deviceId } = await recordIn(world) ?? {}
    await vault.lock()
    expect(await recordEpochIn(world)).to.eq(1)
    await TH.del(vault, 'pw')
    expect(await recordIn(world)).to.deep.include({ device_id: deviceId, highest_vault_epoch: storedVaultRecordOf(world)['vault_epoch'] })
    expect(await recordEpochIn(world)).to.eq(2)
  })

  it("is one for the scope across the vault's lives: a vault made anew keeps this device's id, its epoch carried on", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await addLaptopPasskey(vault)
    const before = await recordIn(world)
    const formerTok = vault.vault_tok
    TH.closeVault(vault)
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(elsewhere, 'pw')
    const remade = await TH.bankOf(elsewhere).ensureVault(u1Main)
    await TH.unlock(remade, 'pw anew')
    const reborn = await world.open()
    expect(reborn.vault_tok).to.not.eq(formerTok)
    expect(await recordIn(world)).to.deep.include({ device_id: before?.device_id, highest_vault_epoch: storedVaultRecordOf(world)['vault_epoch'] })
    expect(await recordEpochIn(world)).to.eq(4)
  })

  it("reads a record naming another scope as none: the vault is born, its record started again under its own scope", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    // Every read of the record at this birth hands back u2's, and one that has seen far more.
    const misfiled = TH.spyOnDeviceHook(world.deviceDB, 'getDeviceRecord').mockResolvedValue(TH.deviceRecordOf('u2', { highest_vault_epoch: 9 }))
    const vault = await world.open()
    misfiled.mockRestore()
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    expect(await recordIn(world)).to.deep.include({ ...TH.scopeOf('u1'), highest_vault_epoch: 1 })
  })

  it("reads a malformed record, one with no device_id, as none: the vault is born, and its first way in carries a device_id of its own", async () => {
    const world = makeWorld()
    // A device store of the host's own that hands back what it holds unchecked: here, a row that has lost its device_id.
    const malformed = { ...TH.deviceRecordOf('u1', { highest_vault_epoch: 9 }), device_id: undefined }
    const spoiled = TH.spyOnDeviceHook(world.deviceDB, 'getDeviceRecord').mockResolvedValue(malformed)
    const vault = await world.open()
    spoiled.mockRestore()
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')
    await TH.unlock(vault, 'pw')
    const record = await recordIn(world)
    expect(record?.device_id).to.be.a('string').and.not.be.empty
    expect(storedWayinOf(world, 'passphrase')?.['device_id']).to.eq(record?.device_id)
  })

  it("gives way to the record it handed over when the birth's raise resolves none: the first way in carries that record's device_id", async () => {
    const world = makeWorld()
    vi.spyOn(world.deviceDB, 'incrementDeviceRecord').mockResolvedValueOnce(null)
    const vault = await world.open()
    await TH.unlock(vault, 'pw')
    expect(storedWayinOf(world, 'passphrase')?.['device_id']).to.be.a('string').and.not.be.empty
  })

  it("reads a record naming another scope as none at a refresh too: the read is taken, never refused vault_behind", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const misfiled = TH.spyOnDeviceHook(world.deviceDB, 'getDeviceRecord').mockResolvedValue(TH.deviceRecordOf('u2', { highest_vault_epoch: 9 }))
    await vault.hello({ staleMinutes: 0 })
    misfiled.mockRestore()
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    expect(vault.snapshot.trouble).to.be.null
  })

  it("is raised by delDamagedVault to the tombstone's vault_epoch, never erased", async () => {
    const world = await damagedVaultWorld()
    expect(await recordEpochIn(world)).to.eq(1)
    await delDamagedVault(world.optsWith())
    expect(await recordEpochIn(world)).to.eq(storedVaultRecordOf(world)['vault_epoch']).and.to.eq(2)
  })
})
// --

// == [Behind and formats]: ensureAcceptingRestore, vault record behind this device's record, older stored formats

/**
 * clearCachedVault's example, as a host writes it: ask the bank for `u1`'s vault, and on
 * 'vault_behind', when the host knows of a restore, have this device forget the vault and ask
 * again; any other refusal goes on up.
 */
const ensureAcceptingRestore = async (bank: Bank, storageWasRestoredOnPurpose: () => Promise<boolean>): Promise<Vault> => {
  const ensured = await bank.tryEnsureVault(u1Main)
  if (ensured.ok) { return ensured.val }
  if (! isVaultError(ensured.err, 'vault_behind') || ! await storageWasRestoredOnPurpose()) { throw ensured.err }
  await bank.clearCachedVault(u1Main)
  return await bank.ensureVault(u1Main)
}

describe("vault record behind this device's record", () => {
  it("refuses an older copy at birth as vault_behind, writing nothing, quoting none of it, and lowering no record", async () => {
    const { world, vault, older } = await rolledBackWorld()
    TH.closeVault(vault)
    world.dbStore.put(u1VaultScopepath, older)
    const err = await TH.expectRefusal(world.open(), 'vault_behind')
    expect(err.message).to.include('already seen a newer copy')
    expect(err.message).to.include('clearCachedVault')
    expect(err.message).to.not.include('Try again later')
    expect(TH.thrownText(err)).to.not.include((JSON.parse(older) as { vault_tok: string }).vault_tok)
    expect(world.dbStore.get(u1VaultScopepath)).to.eq(older)
    expect(await recordEpochIn(world)).to.eq(3)
  })

  it("refuses an older copy at unlock as vault_behind, the newer in hand kept, so a removed way in stays removed on this device", async () => {
    const { world, vault, older } = await rolledBackWorld()
    await vault.lock()
    const deaf = await world.open({ vaultDB: world.deafVaultDB() })
    world.dbStore.put(u1VaultScopepath, older)
    await TH.expectRefusal(TH.unlock(deaf, await TH.passkeyOf('laptop')), 'vault_behind')
    expect(TH.stateOf(deaf.getSnapshot())).to.eq('locked')
    expect(TH.cheatGetVaultEpoch(deaf).gate_epoch).to.eq(3)
    expect(deaf.getSnapshot().gate?.passkey).to.be.null
    expect(await world.getLease()).to.be.null
  })

  it("refuses an older copy met by a background refresh as vault_behind, taking nothing from it: the newer in hand is kept, the vault locks, and a birth made anew refuses it too", async () => {
    const { world, vault, older } = await rolledBackWorld()
    world.dbStore.put(u1VaultScopepath, older)
    await TH.expectRefusal(vault.refresh(), 'vault_behind')
    expect(TH.cheatGetVaultEpoch(vault).gate_epoch).to.eq(3)
    expect(vault.getSnapshot().gate?.passkey).to.be.null
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    await TH.expectRefusal(world.open(), 'vault_behind')
  })

  it("refuses no copy that was the newest when storage handed it back, though another tab of this device raised the record meanwhile", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    // Locked, so there is born locked, and its unlock reads storage.
    await here.lock()
    const slowVaultDB = world.deafVaultDB()
    const there = await world.open({ vaultDB: slowVaultDB })
    const getVault = slowVaultDB.tryGetVault.bind(slowVaultDB)
    // There's next read is served at epoch 1, and handed back only once here's change has landed.
    vi.spyOn(slowVaultDB, 'tryGetVault').mockImplementationOnce(async (...args) => {
      const served = await getVault(...args)
      await addLaptopPasskey(here)
      return served
    })
    await TH.unlock(there, 'pw')
    expect(TH.stateOf(there.getSnapshot())).to.eq('unlocked')
    expect(await recordEpochIn(world)).to.eq(2)
  })

  it("is taken up again once storage hands back the newest", async () => {
    const { world, vault, older, newer } = await rolledBackWorld()
    TH.closeVault(vault)
    world.dbStore.put(u1VaultScopepath, older)
    await TH.expectRefusal(world.open(), 'vault_behind')
    world.dbStore.put(u1VaultScopepath, newer)
    const reopened = await world.open()
    expect(TH.stateOf(reopened.getSnapshot())).to.eq('locked')  // the refused birth revoked the lease
    await TH.unlock(reopened, 'pw')
    expect(reopened.getSnapshot().gate?.passphrase).to.not.be.null
    expect(reopened.getSnapshot().gate?.passkey).to.be.null
  })

  it("takes an older copy under a raised vault_epoch as it is, its removed way in opening again", async () => {
    const { world, vault, older } = await rolledBackWorld()
    TH.closeVault(vault)
    world.dbStore.put(u1VaultScopepath, JSON.stringify({ ...(JSON.parse(older) as object), vault_epoch: 9 }))
    const reopened = await world.open()
    await TH.unlock(reopened, await TH.passkeyOf('laptop'))
    expect(TH.stateOf(reopened.getSnapshot())).to.eq('unlocked')
  })

  it("is accepted on this device once bank.clearCachedVault() has it forget the vault, as clearCachedVault's example shows", async () => {
    const { world, vault, older } = await rolledBackWorld()
    TH.closeVault(vault)
    world.dbStore.put(u1VaultScopepath, older)
    const reopened = await ensureAcceptingRestore(bankIn(world), () => Promise.resolve(true))
    expect(reopened.getSnapshot().gate?.passkey?.credential_id).to.eq(storedWayinOf(world, 'passkey')?.['credential_id'])
    expect(await recordEpochIn(world)).to.eq(2)
  })

  it("restored under a del(), refuses that del() as vault_behind, deleting nothing, locking, and lowering no record", async () => {
    const { world, vault, older } = await rolledBackWorld()
    world.dbStore.put(u1VaultScopepath, older)
    await TH.wakeupAtNextTick()
    await TH.expectRefusal(TH.del(vault, 'pw'), 'vault_behind')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    expect(world.dbStore.get(u1VaultScopepath)).to.eq(older)
    expect(await recordEpochIn(world)).to.eq(3)
  })

  it("is still refused by clearCachedVault's example when the host knows of no restore", async () => {
    const { world, vault, older } = await rolledBackWorld()
    TH.closeVault(vault)
    world.dbStore.put(u1VaultScopepath, older)
    await TH.expectRefusal(ensureAcceptingRestore(bankIn(world), () => Promise.resolve(false)), 'vault_behind')
    expect(await recordEpochIn(world)).to.eq(3)
  })

  it("is not caught on a device that never saw the newer copy, which takes the older as it is", async () => {
    const { world, older } = await rolledBackWorld()
    world.dbStore.put(u1VaultScopepath, older)
    const stranger = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(stranger, await TH.passkeyOf('laptop'))
    expect(TH.stateOf(stranger.getSnapshot())).to.eq('unlocked')
  })
})

describe("older stored formats", () => {
  it("makes a vault and its boxes in this version's formats", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(storedVaultRecordOf(world)).to.deep.include({ format: 'safebyok-vault-v6' })
    expect(storedVaultRecordOf(world)).to.not.have.property('vault_key_epoch')
    expect(storedRowOf(world, 'anthropic')).to.deep.include({ format: 'safebyok-box-v8' })
    expect(storedRowOf(world, 'anthropic')).to.not.have.property('vault_key_epoch')
  })

  it("lists a box stored with a vaultKey epoch, safebyok-box-v6, as damaged, its revision kept, and putBox() replaces it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...row, format: 'safebyok-box-v6', vault_key_epoch: 1 }))
    await TH.readAfresh(vault)
    expect(vault.getSnapshot().damagedBoxes).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: row['revision_tok'], damage: 'damaged' }])
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake-again')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake-again')
  })

  const OlderVaultRecordFormats = [
    [{ format: 'safebyok-vault-v1' },                     'the first format, safebyok-vault-v1'],
    [{ format: 'safebyok-vault-v2' },                     'the format before wayins, safebyok-vault-v2'],
    [{ format: 'safebyok-vault-v3' },                     'the format before the prior vaultKey went, safebyok-vault-v3'],
    [{ format: 'safebyok-vault-v5', vault_key_epoch: 1 }, 'the format with a vaultKey epoch, safebyok-vault-v5'],
  ] as const

  for (const [older, blurb] of OlderVaultRecordFormats) {
    it(`opens a vault stored under ${blurb}, as damaged_vault, never newer_format, which delDamagedVault clears`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
      TH.closeVault(vault)
      world.dbStore.put(u1VaultScopepath, JSON.stringify({ ...storedVaultRecordOf(world), ...older }))
      await TH.expectRefusal(world.open(), 'damaged_vault')
      await delDamagedVault(world.optsWith())
      expect(rowsOf(world, 'u1'), 'a tombstone in the place of the vault record').to.deep.equal([u1VaultScopepath])
    })
  }
})
// --
