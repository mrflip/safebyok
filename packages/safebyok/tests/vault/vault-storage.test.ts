import { describe, it, expect, vi } from 'vitest'
import * as Z from 'zod/mini'
import { VaultError, isVaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { Vault } from '../../src/vault'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { delDamagedVault } from '../../src/del-damaged-vault'
import { setDefaultLogger, DefaultLogger } from '../../src/logger'
import { bad, valOf } from '../../src/outcome'
import { StrongVerdict } from '../../src/passphrase-strength'
import * as TH from '../test-helpers'
import { makeWorld, boxlabelsOf, isU1Box, u1BoxCkey, u1VaultPropsCkey, SevenDaysMillis, uncheckingDeviceDB, storedVaultPropsOf, storedWayinOf, HourMillis, damagedVaultWorld, storedRowOf, rowsOf, rolledBackWorld, addLaptopPasskey } from './world'


// == [Scoping, snapshot, tampering]: scoping, snapshot and subscribers, what the backend sees, SpoiledShells, tampering

describe("scoping", () => {
  it("two users each keep a box by the same label, unseen by the other", async () => {
    const world = makeWorld()
    const one = await world.openUnlocked('pw one', { userId: 'u1' })
    await one.putBox('anthropic', 'u1-secret')
    const two = await world.open({ userId: 'u2' })
    expect(two.getSnapshot().state).to.eq('absent')
    await two.unlock('pw two')
    await two.putBox('anthropic', 'u2-secret')
    expect(await one.getWhisper('anthropic')).to.eq('u1-secret')
    expect(await two.getWhisper('anthropic')).to.eq('u2-secret')
  })

  it("one user's lease opens nothing for another", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { userId: 'u1' })
    expect(await world.stateOnOpen({ userId: 'u2' })).to.eq('absent')
  })
})

describe("the snapshot and its subscribers", () => {
  it("refuses a listener that is not a function as it subscribes, so no later change meets it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(() => vault.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/)
    await vault.unlock('pw')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("keeps its identity until something changes", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const before = vault.getSnapshot()
    expect(vault.getSnapshot()).to.eq(before)
    await vault.putBox('anthropic', 'sk-fake')
    expect(vault.getSnapshot()).to.not.eq(before)
  })

  it("tells listeners when it unlocks and stores, and unsubscribing silences it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    let heardCount = 0
    const unsubscribe = vault.subscribe(() => { heardCount += 1 })
    await vault.unlock('pw')
    expect(heardCount).to.be.greaterThan(0)
    const heardBefore = heardCount
    unsubscribe()
    await vault.putBox('anthropic', 'sk-fake')
    expect(heardCount).to.eq(heardBefore)
  })

  it("hears about boxes written through another handle", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.open()
    await there.putBox('anthropic', 'written elsewhere')
    await vi.waitFor(() => { expect(boxlabelsOf(here)).to.deep.equal(['anthropic']) })
  })
})

describe("what the backend sees", () => {
  it("stores no whisper and no passphrase in the clear, anywhere", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a very memorable passphrase')
    await vault.putBox('anthropic', 'sk-ant-api03-fake-but-secret', { sidecar: { note: 'sidecars are visible in storage' } })
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('sk-ant-api03-fake-but-secret')
    expect(everything).to.not.include('a very memorable passphrase')
    expect(everything).to.include('sidecars are visible in storage') // the sidecar is visible by design
    expect(everything).to.include('whisper_ciphered')
  })

  it("two stores of the same whisper write different ciphertext: fresh key and iv every time", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('one_box', 'the same whisper')
    await vault.putBox('two_box', 'the same whisper')
    const [oneRow, twoRow] = world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))
      .map((ckey) => JSON.parse(world.dbStore.read(ckey) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } })
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
    await vault.putBox('anthropic', 'sk-fake')
    const ckey = world.dbStore.ckeys().find((ckey) => isU1Box(ckey))
    const row = JSON.parse(world.dbStore.read(ckey ?? '') ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(ckey ?? '', JSON.stringify(row))
    const err = await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(err.message).to.not.include('sk-fake')
    expect(world.dbStore.read(ckey ?? '')).to.not.be.null  // preserved for forensics, never auto-deleted
  })

  it("a box row moved under another label refuses to open", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('victim_box', 'sk-fake')
    const fromCkey = world.dbStore.ckeys().find((candidate) => candidate.includes('victim_box'))
    world.dbStore.write(u1BoxCkey('other_box'), world.dbStore.read(fromCkey ?? '') ?? '')
    await TH.expectRefusal(vault.getWhisper('other_box'), 'damaged_box')
  })

  for (const [spoil, blurb] of SpoiledShells) {
    it(`a box with ${blurb} refuses to open, and is left as it is: its whole visible header is bound`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.putBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
      const ckey = world.dbStore.ckeys().find((candidate) => isU1Box(candidate)) ?? ''
      const row = JSON.parse(world.dbStore.read(ckey) ?? '{}') as Record<string, unknown>
      const spoiled = JSON.stringify(spoil(row))
      world.dbStore.write(ckey, spoiled)
      await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
      expect(world.dbStore.read(ckey)).to.eq(spoiled)
    })
  }

  it("vault props whose vault_tok was altered open to no passphrase: it is bound into every way in", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { vault_tok: string }
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, vault_tok: `${vaultProps.vault_tok}-moved` }))
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(vault.unlock('pw'), 'wrong_passphrase')
    // The decryption fails as for a typo, so the message names both, and claims neither.
    expect(err.message).to.include('Check for typos')
    expect(err.message).to.include('the stored vault may be damaged')
  })

  it("vault props that do not parse make the open itself refuse as damaged_vault, Zod's error its cause, deleting nothing", async () => {
    const world = makeWorld()
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v6"}')
    const err = await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(err.message).to.include("can't be opened")
    expect(err.cause).to.be.instanceOf(Z.core.$ZodError)
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq('{"format":"safebyok-vault-v6"}')
  })

  it("a box that will not open under the vault's own key is called damaged, with the remedy, never quoting its boxlabel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    const row = JSON.parse(world.dbStore.read(u1BoxCkey('anthropic')) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify(row))
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
  const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey) ?? '').join('\n')
  return Array.from(everything.matchAll(/"(?:ciphertext_b64|salt_b64)":"([^"]+)"/g), (hit) => hit[1]!)
}

/** A refusal of kind identity_revoked, as an adapter says a user signed out. */
const signedOut = () => new VaultError('identity_revoked', 'No one is signed in, so this vault cannot be reached: sign in, then try again.')

/** Ring `world`'s storage with vault props that do not read: the vault's background refresh fails, and warns. */
const spoilVaultProps = async (world: ReturnType<typeof makeWorld>) => {
  world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v6"}')
  await TH.wakeupAtNextTick()
}

/** A logger's every call, for a logger that fails: what it throws must break nothing. */
const throwFromLogger = () => { throw new Error('a logger that throws') }

describe("the logger", () => {
  it("hears nothing from a vault going about its business", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
    await vault.getWhisper('anthropic')
    await vault.putWayin('pw', 'pw two')
    await vault.lock()
    await vault.unlock('pw two')
    await vault.delBox('anthropic')
    await vault.lock()
    world.advance(SevenDaysMillis * 2)
    await world.open()
    await vault.del()
    vault.close()
    expect(world.logged).to.have.lengthOf(0)
  })

  it("is the console when the host passes none, each message tagged safebyok", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw', { logger: undefined })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    try {
      await spoilVaultProps(world)
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls[0]?.[0])).to.match(/^safebyok: Storage rang with a change the vault could not read/)
    } finally {
      warn.mockRestore()
    }
  })

  it("warns of a ring whose read the strength checker's failed load refused, the refusal its error", async () => {
    const world = makeWorld()
    const lost = new Error('the word list did not load')
    const strengthChecker = Object.assign(() => StrongVerdict, { load: () => Promise.reject(lost) })
    const vault = Vault.make(world.optsWith({ strengthChecker }))
    await TH.expectRefusal(vault.hello(), 'unexpected_error')
    await TH.expectingGood(world.vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.wakeupAtNextTick()
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'refresh' }]])
    expect(world.logged[0]?.message).to.match(/^Storage rang with a change the vault could not read/)
    expect(world.logged[0]?.err?.cause).to.eq(lost)
  })

  it("is not the vaultDB's: what its storage has nobody to throw to goes to the logger the storage was made with", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.open({ vaultDB })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener of the host that throws') })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    expect(own.calls).to.have.lengthOf(1)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("is not the vaultDB's when the vaultDB was made with none: that one logs to the console, whatever the vault is given", async () => {
    const world = makeWorld()
    const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const vaultDB = localVaultDB({ store: world.dbStore })
    await world.open({ vaultDB })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener of the host that throws') })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    expect(consoleErrors).toHaveBeenCalledOnce()
    expect(world.logged).to.have.lengthOf(0)
    consoleErrors.mockRestore()
  })

  it("is the vaultDB's logger when the host passes the vault none: one given to the storage once hears both", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.openUnlocked('pw', { vaultDB, logger: undefined })
    await spoilVaultProps(world)
    expect(own.calls.map((call) => [call.level, call.story])).to.deep.equal([['warn', { call: 'refresh' }]])
    expect(world.logged).to.have.lengthOf(0)
  })

  it("guards the vaultDB's logger too: a VaultDB of the host's own whose logger throws breaks no lock", async () => {
    const world = makeWorld()
    const vaultDB = localVaultDB({ store: world.dbStore })
    // As a subclass overriding the getter would: its logger is the host's to answer.
    Object.defineProperty(vaultDB, 'logger', { value: { log: throwFromLogger, warn: throwFromLogger, error: throwFromLogger } })
    const vault = await world.openUnlocked('pw', { vaultDB, logger: undefined })
    vi.spyOn(vaultDB, 'getBox').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("refuses a vaultDB whose logger is not one, before reading storage, when the host passes the vault none", async () => {
    const world = makeWorld()
    const vaultDB = localVaultDB({ store: world.dbStore })
    const getVaultProps = vi.spyOn(vaultDB, 'getVault')
    Object.defineProperty(vaultDB, 'logger', { value: { log: () => undefined } })
    const err = await TH.expectRefusal(world.open({ vaultDB, logger: undefined }), 'bad_option')
    expect(err.message).to.match(/log, warn and error functions/)
    expect(getVaultProps).not.toHaveBeenCalled()
  })

  it("takes null as none: the vaultDB's logger", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.openUnlocked('pw', { vaultDB, logger: null })
    await spoilVaultProps(world)
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
      await spoilVaultProps(world)
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
      await spoilVaultProps(world)
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
    await spoilVaultProps(world)
    expect(world.logged).to.have.lengthOf(1)
    expect(own.calls).to.have.lengthOf(0)
  })

  it("refuses a logger that is not one, before reading storage", async () => {
    const world = makeWorld()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVault')
    for (const nonsense of [{}, { log: () => undefined, warn: () => undefined }, 'console']) {
      const err = await TH.expectRefusal(world.open({ logger: nonsense as unknown as MakeVaultOpts['logger'] }), 'bad_option')
      expect(err.message).to.match(/log, warn and error functions/)
    }
    expect(getVaultProps).not.toHaveBeenCalled()
  })

  it("warns once when a lease could not be read, telling nothing of the record", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: 'soon' }))
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('locked')
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'hello' }, err: undefined })
    expect(world.logged[0]?.message).to.match(/lease could not be read/)
  })

  it("warns when a lease would not open", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => {
      const wrapped = row['vault_key_lease_wrapped'] as { cipher_iv_b64: string, ciphertext_b64: string }
      return { ...row, vault_key_lease_wrapped: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } }
    })
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('locked')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
  })

  it("warns of an unreadable lease that could not be erased, after the read it failed in, which opens locked", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: 'soon' }))
    const jammed = new Error('the device store is closed')
    vi.spyOn(device.deviceDB, 'delLease').mockRejectedValueOnce(jammed)
    const later = await world.open({ deviceDB: device.deviceDB })
    expect(later.getSnapshot().state).to.eq('locked')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('could not be erased')
    expect((world.logged[0]?.err as VaultError | undefined)?.cause).to.eq(jammed)
  })

  it("says nothing of a lease that simply ran out, or that a new passphrase outdated", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    world.advance(SevenDaysMillis + 1)
    expect(await world.stateOnOpen()).to.eq('locked')
    await vault.unlock('pw')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.putWayin('pw', 'pw two')
    expect(await world.stateOnOpen()).to.eq('locked')
    expect(world.logged).to.have.lengthOf(0)
  })

  it("warns when a background refresh fails, with the refusal as its error", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v6"}')
    await TH.wakeupAtNextTick()
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.story).to.deep.equal({ call: 'refresh' })
    expect((world.logged[0]?.err as VaultError).refusalkind).to.eq('damaged_vault')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(1)  // the snapshot stands as it was
  })

  it("never breaks a lock, a hello, a refresh or a refused hello when it throws", async () => {
    const world = makeWorld()
    const logger = throwingLogger()
    const device = uncheckingDeviceDB()
    const reading = world.clock.now()
    const clock = { now: () => reading }
    const vault = await world.openUnlocked('pw', { logger, deviceDB: device.deviceDB, clock })
    await vault.putBox('anthropic', 'sk-fake')
    // a refresh rung in the background, failing
    const row = world.dbStore.read(u1BoxCkey('anthropic')) ?? ''
    world.dbStore.write(u1BoxCkey('anthropic'), '{"not":"a box"}')
    await TH.wakeupAtNextTick()
    world.dbStore.write(u1BoxCkey('anthropic'), row)
    // a lock for storage that no longer serves the user
    vi.spyOn(world.vaultDB, 'getBox').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('locked')
    // an open that discards an unreadable lease
    await vault.unlock('pw')
    device.spoilRow(() => 'not a record')
    expect(await world.stateOnOpen({ logger, deviceDB: device.deviceDB, clock })).to.eq('locked')
    // a hello refused, which make's own hello tells the logger of
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    await TH.expectRefusal(world.open({ logger }), 'not_permitted')
  })

  it("is never handed a whisper, a passphrase, a ciphertext or a salt, whatever it hears", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    const whisper = 'sk-FAKESECRET-whisper'
    const passphrase = 'FAKESECRET passphrase'
    const vault = await world.openUnlocked(passphrase, { deviceDB: device.deviceDB })
    await vault.putBox('anthropic', whisper, { sidecar: { note: 'FAKESECRET note' } })
    // every call site: a change whose mark could not be kept (its error carrying the device
    // store's as its cause), a lease unreadable, a background refresh refused
    vi.spyOn(device.deviceDB, 'putMark').mockRejectedValueOnce(new Error('the device store broke: disk full'))
    await vault.putWayin(passphrase, `${passphrase} two`)
    const secrets = storedSecrets(world)
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: `${passphrase} ${whisper}` }))
    const reopened = await world.open({ deviceDB: device.deviceDB })
    reopened.close()
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), registered_at: whisper }))
    await TH.wakeupAtNextTick()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    await TH.expectRefusal(world.open(), 'not_permitted')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'warn', 'warn'])
    expect((world.logged[0]?.err?.cause as Error).message).to.match(/disk full/)
    const text = TH.loggedText(world.logged)
    // the walk reached the cause, so its search covers what causes hold
    expect(text).to.include('disk full')
    expect(text.toLowerCase()).to.not.include('fakesecret')
    expect(secrets.length).to.be.greaterThan(2)
    for (const secret of secrets) { expect(text).to.not.include(secret) }
  })
})
// --

// == [Signed out and the device mark]: signedOut, no longer signed in, markIn, seenIn, the device mark

describe("when storage says the user is no longer signed in", () => {
  /** Each vault call that reaches storage, the storage verb it reaches, and the call. */
  const RevokedCallCases: readonly (readonly [string, 'getVault' | 'getBox' | 'putBox' | 'putVaultProps', (vault: Vault) => Promise<unknown>])[] = [
    ['getWhisper()',       'getBox',        (vault) => vault.getWhisper('anthropic')],
    ['putBox()',           'putBox',        (vault) => vault.putBox('openai', 'sk-fake-two')],
    ['hello()',            'getVault',      (vault) => vault.hello({ staleMinutes: 0 })],
    ['putWayin()', 'putVaultProps', (vault) => vault.putWayin('pw one', 'pw two')],
  ]

  for (const [callTitle, verb, call] of RevokedCallCases) {
    it(`locks at once when ${callTitle} meets it, throws the refusal itself, and removes nothing stored`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.putBox('anthropic', 'sk-fake-one')
      const refusal = signedOut()
      vi.spyOn(world.vaultDB, verb).mockResolvedValueOnce(bad(refusal))
      expect(await TH.expectRefusal(call(vault), 'identity_revoked')).to.eq(refusal)
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(vault.getSnapshot().askPassphraseAt).to.be.null
      expect(await world.getLease()).to.be.null
      await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
      // Signed in again: the passphrase it had still opens it, and the box is still there.
      await vault.unlock('pw one')
      expect(await vault.getWhisper('anthropic')).to.eq('sk-fake-one')
    })
  }

  it("locks when a background refresh meets it, and tells the logger, having nobody to throw to", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValue(bad(signedOut()))
    // Any write rings the store's change bell, and the vault looks.
    world.dbStore.write('elsewhere', '{}')
    await vi.waitFor(() => { expect(vault.getSnapshot().state).to.eq('locked') })
    expect(await world.getLease()).to.be.null
    await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.deep.equal(['log', 'warn']) })
    expect(world.logged[0]).to.deep.include({ level: 'log', story: { call: 'untrustedStorage' } })
    expect(world.logged[0]?.message).to.match(/no longer serves the user/)
  })

  it("calls subscribers with the locked snapshot", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const heard: string[] = []
    vault.subscribe(() => { heard.push(vault.getSnapshot().state) })
    vi.spyOn(world.vaultDB, 'getBox').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'identity_revoked')
    // Told locked, then told of the bad news as its trouble: never unlocked again between.
    expect([...new Set(heard)]).to.deep.equal(['locked'])
    expect(vault.trouble?.refusalkind).to.eq('identity_revoked')
  })

  it("revokes the lease when it meets the open, which then refuses", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw one')
    first.close()
    expect(await world.getLease()).to.not.be.null
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(world.open(), 'identity_revoked')
    expect(await world.getLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("takes no option to stay unlocked: Vault.make refuses one, as it refuses any option it does not know", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make(world.optsWith({ whenIdentityRevoked: 'stay' } as Partial<MakeVaultOpts>)), 'bad_option')
    expect(err.message).to.include('whenIdentityRevoked')
  })

  it("locks nothing for not_permitted: the vault's own user, refused one call", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'getBox').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'You may not read this vault.')))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'not_permitted')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })

  it("locks all the same, and throws the refusal, when the device store will not erase the lease", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const stuck = new Error('the device store is read-only')
    vi.spyOn(world.deviceDB, 'delLease').mockRejectedValueOnce(stuck)
    vi.spyOn(world.vaultDB, 'getBox').mockResolvedValueOnce(bad(signedOut()))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.not.be.null
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'untrustedStorage' } })
    expect((world.logged[0]?.err as VaultError).refusalkind).to.eq('storage_unavailable')
    expect(world.logged[0]?.err?.cause).to.eq(stuck)
  })
})

/** This device's mark for `u1`'s vault, as its deviceDB keeps it. */
const markIn = (world: ReturnType<typeof makeWorld>) => TH.expectGood(world.deviceDB.getMark(TH.scopeOf('u1')))

/** What this world's device mark for `u1`'s vault has seen of it; null with no mark, or none seen. */
const seenIn = async (world: ReturnType<typeof makeWorld>) => {
  const mark = await markIn(world)
  return mark?.seen ?? null
}

describe("the device mark", () => {
  it("is kept from the vault's making: its vault_tok, the epoch seen, and an id of its own, which the first way in carries", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const mark = await markIn(world)
    const vaultProps = storedVaultPropsOf(world)
    expect(mark).to.deep.include({ format: 'safebyok-mark-v5', ...TH.scopeOf('u1') })
    expect(mark?.seen).to.deep.include({ vault_tok: vaultProps['vault_tok'], gate_epoch: 1 })
    expect(storedWayinOf(world, 'passphrase')).to.deep.include({ device_id: mark?.seen.device_id, registered_at: world.clock.now() })
  })

  it("is started under the id the first way in carries, though a refresh the vault's making set off gets there first", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const ensureVaultProps = world.vaultDB.ensureVaultProps.bind(world.vaultDB)
    // The write rings this handle's own watch, whose refresh runs to its end before the unlock goes on.
    vi.spyOn(world.vaultDB, 'ensureVaultProps').mockImplementationOnce(async (...args) => {
      const settled = await ensureVaultProps(...args)
      await TH.wakeupAtNextTick()
      return settled
    })
    await vault.unlock('pw')
    const seen = await seenIn(world)
    expect(storedWayinOf(world, 'passphrase')?.['device_id']).to.eq(seen?.device_id)
  })

  it("rises with each newer version of the vault props, its own writes and another device's, and every way in this device adds carries its id", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const { device_id: deviceId } = await seenIn(world) ?? {}
    world.advance(HourMillis)
    await addLaptopPasskey(vault)
    expect(await seenIn(world)).to.deep.include({ device_id: deviceId, gate_epoch: 2 })
    expect(storedWayinOf(world, 'passkey')).to.deep.include({ device_id: deviceId, registered_at: world.clock.now() })
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.putWayin('pw', await TH.passkeyOf('phone'))
    await TH.wakeupAtNextTick()
    expect(await seenIn(world)).to.deep.include({ device_id: deviceId, gate_epoch: 3 })
    expect(storedWayinOf(world, 'passkey')?.['device_id']).to.be.a('string').and.not.eq(deviceId)
  })

  it("stamps a passphrase afresh when it changes: the device that changed it, and the time it did", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const before = storedWayinOf(world, 'passphrase')
    world.advance(HourMillis)
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.putWayin('pw', 'pw two')
    const after = storedWayinOf(world, 'passphrase')
    expect(after).to.deep.include({ registered_at: world.clock.now() })
    expect(after?.['device_id']).to.be.a('string').and.not.eq(before?.['device_id'])
    expect(after?.['salt_b64']).to.not.eq(before?.['salt_b64'])
  })

  it("survives lock(), and del() forgets the vault it has seen", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    expect(await seenIn(world)).to.not.be.null
    await vault.del()
    expect(await markIn(world)).to.be.null
  })

  it("starts anew, under a new id, for a vault made anew under the scope", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await addLaptopPasskey(vault)
    const before = await seenIn(world)
    vault.close()
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.del()
    await elsewhere.unlock('pw anew')
    await world.open()
    const after = await seenIn(world)
    expect(after).to.deep.include({ vault_tok: storedVaultPropsOf(world)['vault_tok'], gate_epoch: 1 })
    expect(after?.vault_tok).to.not.eq(before?.vault_tok)
    expect(after?.device_id).to.not.eq(before?.device_id)
  })

  it("reads a mark naming another scope as none, says so through the logger, and starts again", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const before = await seenIn(world)
    // Every read of the mark at this open hands back u2's: the one before the vault props, and the one after.
    const misfiled = vi.spyOn(world.deviceDB, 'getMark').mockResolvedValue(TH.good(TH.markOf('u2', { seen: { gate_epoch: 9 } })))
    await world.open()
    misfiled.mockRestore()
    expect(world.logged.map((call) => call.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('mark')
    const after = await seenIn(world)
    expect(after?.device_id).to.not.eq(before?.device_id)
  })

  it("is erased by delDamagedVault, with the vault", async () => {
    const world = await damagedVaultWorld()
    expect(await markIn(world)).to.not.be.null
    await delDamagedVault(world.optsWith())
    expect(await markIn(world)).to.be.null
  })
})
// --

// == [Rollback and formats]: openAcceptingRestore, vault props rolled back, older stored formats

/**
 * The README's recipe for a vault whose storage was restored from an older copy on purpose: open
 * it, and on 'rolled_back', when the host knows of the restore, erase this device's mark and open
 * it again; any other refusal goes on up.
 */
const openAcceptingRestore = async (opts: MakeVaultOpts, storageWasRestoredOnPurpose: () => Promise<boolean>): Promise<Vault> => {
  const vault = Vault.make(opts)
  try {
    await vault.hello()
  } catch (err) {
    if (! isVaultError(err, 'rolled_back') || ! await storageWasRestoredOnPurpose()) { throw err }
    valOf(await opts.deviceDB.delMark({ applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel }))
    await vault.hello()
  }
  return vault
}

describe("vault props rolled back", () => {
  it("refuses an older copy at open as rolled_back, writing nothing, and quoting none of it", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    const err = await TH.expectRefusal(world.open(), 'rolled_back')
    expect(err.message).to.include('already seen a newer copy')
    expect(err.message).to.include('delMark')
    expect(err.message).to.not.include('Try again later')
    expect(TH.thrownText(err)).to.not.include((JSON.parse(older) as { vault_tok: string }).vault_tok)
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(older)
    expect(await seenIn(world)).to.deep.include({ gate_epoch: 3 })
  })

  it("refuses an older copy at the next read, and at an unlock after it, so a removed way in stays removed on this device", async () => {
    const { world, vault, older } = await rolledBackWorld()
    await vault.lock()
    const deaf = await world.open({ vaultDB: world.deafVaultDB() })
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(deaf.hello({ staleMinutes: 0 }), 'rolled_back')
    await TH.expectRefusal(deaf.unlock(await TH.passkeyOf('laptop')), 'rolled_back')
    // Nothing of the vault is held until the host accepts the older copy, or storage is mended.
    expect(deaf.getSnapshot().state).to.eq('opening')
    expect(deaf.getSnapshot().passphrase).to.be.null
    expect(deaf.getSnapshot().passkey).to.be.null
    expect(await world.getLease()).to.be.null
  })

  it("locks on an older copy met by a background refresh, taking nothing from it and forgetting the vault props it held, and says so through the logger", async () => {
    const { world, vault, older } = await rolledBackWorld()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('opening')
    expect(vault.getSnapshot().passphrase).to.be.null
    expect(vault.getSnapshot().passkey).to.be.null
    expect(await world.getLease()).to.be.null
    // The next call says hello afresh, and meets the older copy again.
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'rolled_back')
    expect(world.logged.map((call) => [call.level, call.story, (call.err as VaultError | null | undefined)?.refusalkind]))
      .to.deep.equal([['log', { call: 'untrustedStorage' }, undefined], ['warn', { call: 'refresh' }, 'rolled_back']])
  })

  it("refuses no copy that was the newest when storage handed it back, though another tab of this device raised the mark meanwhile", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const slowVaultDB = world.deafVaultDB()
    const there = await world.open({ vaultDB: slowVaultDB })
    const getVault = slowVaultDB.getVault.bind(slowVaultDB)
    // There's next read is served at epoch 1, and handed back only once here's change has landed.
    vi.spyOn(slowVaultDB, 'getVault').mockImplementationOnce(async (...args) => {
      const served = await getVault(...args)
      await addLaptopPasskey(here)
      return served
    })
    await there.hello({ staleMinutes: 0 })
    expect(there.getSnapshot()).to.deep.include({ state: 'unlocked', gate_epoch: 1 })
    expect(await seenIn(world)).to.deep.include({ gate_epoch: 2 })
  })

  it("takes the copy up again once storage hands back the newest", async () => {
    const { world, vault, older, newer } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(world.open(), 'rolled_back')
    world.dbStore.write(u1VaultPropsCkey, newer)
    const reopened = await world.open()
    expect(reopened.getSnapshot().state).to.eq('locked')  // the refused open revoked the lease
    await reopened.unlock('pw')
    expect(reopened.getSnapshot().passphrase).to.not.be.null
    expect(reopened.getSnapshot().passkey).to.be.null
  })

  it("takes an older copy under a raised gate epoch as it stands, its removed way in opening again", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...(JSON.parse(older) as object), gate_epoch: 9 }))
    const reopened = await world.open()
    await reopened.unlock(await TH.passkeyOf('laptop'))
    expect(reopened.getSnapshot().state).to.eq('unlocked')
  })

  it("is accepted on this device once its mark of the vault is erased, as the README's recipe does", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    const reopened = await openAcceptingRestore(world.optsWith(), () => Promise.resolve(true))
    expect(reopened.getSnapshot().passkey?.credential_id).to.eq(storedWayinOf(world, 'passkey')?.['credential_id'])
    expect(await seenIn(world)).to.deep.include({ gate_epoch: 2 })
  })

  it("is accepted on the very handle that refused it, its mark erased and hello said again, as the Vault's class doc says: unlock and a change to the ways in then land", async () => {
    const { world, vault, older } = await rolledBackWorld()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'rolled_back')
    expect(vault.state).to.eq('opening')
    expect(vault.vault_tok).to.be.null
    expect(vault.boxes).to.deep.equal([])
    await TH.expectGood(world.deviceDB.delMark(TH.scopeOf('u1')))
    await vault.hello({ staleMinutes: 0 })
    expect(vault.gate_epoch).to.eq(2)
    expect(vault.passkey?.credential_id).to.eq(storedWayinOf(world, 'passkey')?.['credential_id'])
    await vault.unlock('pw')
    await vault.putWayin('pw', 'pw two')
    expect(vault.gate_epoch).to.eq(3)
    expect(vault.state).to.eq('unlocked')
  })

  it("met by a background read queued behind a hello, leaves the vault opening once that read runs, and is met again by the next hello", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    const late = Vault.make(world.optsWith())
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const saying = late.hello()
    await gate.reached
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.wakeupAtNextTick()
    gate.release()
    await saying
    await TH.wakeupAtNextTick()
    expect(late.state).to.eq('opening')
    await TH.expectRefusal(late.hello(), 'rolled_back')
  })

  it("met while a del() waits on the hello, refuses that del() as rolled_back, deleting nothing and keeping the mark", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    const late = Vault.make(world.optsWith())
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const deleting = late.del()
    await gate.reached
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.wakeupAtNextTick()
    gate.release()
    await TH.expectRefusal(deleting, 'rolled_back')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(older)
    expect(await seenIn(world)).to.deep.include({ gate_epoch: 3 })
  })

  it("is still refused by the README's recipe when the host knows of no restore", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(openAcceptingRestore(world.optsWith(), () => Promise.resolve(false)), 'rolled_back')
    expect(await seenIn(world)).to.deep.include({ gate_epoch: 3 })
  })

  it("is not caught on a device that never saw the newer copy, which takes the older as it stands", async () => {
    const { world, older } = await rolledBackWorld()
    world.dbStore.write(u1VaultPropsCkey, older)
    const stranger = await world.open({ deviceDB: memoryDeviceDB() })
    await stranger.unlock(await TH.passkeyOf('laptop'))
    expect(stranger.getSnapshot().state).to.eq('unlocked')
  })
})

describe("older stored formats", () => {
  it("makes a vault and its boxes in this version's formats", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    expect(storedVaultPropsOf(world)).to.deep.include({ format: 'safebyok-vault-v6' })
    expect(storedVaultPropsOf(world)).to.not.have.property('vault_key_epoch')
    expect(storedRowOf(world, 'anthropic')).to.deep.include({ format: 'safebyok-box-v8' })
    expect(storedRowOf(world, 'anthropic')).to.not.have.property('vault_key_epoch')
  })

  it("lists a box stored with a vaultKey epoch, safebyok-box-v6, as damaged, its revision kept, and putBox() replaces it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, format: 'safebyok-box-v6', vault_key_epoch: 1 }))
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: row['revision_tok'] }])
    await vault.putBox('anthropic', 'sk-fake-again')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake-again')
  })

  const OlderVaultPropsFormats = [
    [{ format: 'safebyok-vault-v1' },                     'the first format, safebyok-vault-v1'],
    [{ format: 'safebyok-vault-v2' },                     'the format before wayins, safebyok-vault-v2'],
    [{ format: 'safebyok-vault-v3' },                     'the format before the prior vaultKey went, safebyok-vault-v3'],
    [{ format: 'safebyok-vault-v5', vault_key_epoch: 1 }, 'the format with a vaultKey epoch, safebyok-vault-v5'],
  ] as const

  for (const [older, blurb] of OlderVaultPropsFormats) {
    it(`opens a vault stored under ${blurb}, as damaged_vault, never newer_format, which delDamagedVault clears`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.putBox('anthropic', 'sk-fake')
      vault.close()
      world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), ...older }))
      await TH.expectRefusal(world.open(), 'damaged_vault')
      await delDamagedVault(world.optsWith())
      expect(rowsOf(world, 'u1')).to.deep.equal([])
    })
  }
})
// --
