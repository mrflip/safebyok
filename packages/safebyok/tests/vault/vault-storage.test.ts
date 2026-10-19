import { describe, it, expect, vi } from 'vitest'
import { type VaultProps } from '../../src/types'
import { VaultError, isVaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/vault-db'
import { Vault } from '../../src/vault'
import { type MakeVaultOpts } from '../../src/vault-opts'
import { retireDamagedVault } from '../../src/retire-damaged-vault'
import { setDefaultLogger, DefaultLogger } from '../../src/logger'
import * as TH from '../test-helpers'
import { makeWorld, boxlabelsOf, isU1Box, u1BoxCkey, u1VaultPropsCkey, SevenDaysMillis, uncheckingDeviceDB, storedVaultPropsOf, makeRacingWorld, storedWayinsOf, HourMillis, damagedVaultWorld, storedRowOf, rowsOf } from './world'


describe("scoping", () => {
  it("two users each keep a box by the same label, unseen by the other", async () => {
    const world = makeWorld()
    const one = await world.openUnlocked('pw one', { userId: 'u1' })
    await one.storeBox('anthropic', 'u1-secret')
    const two = await world.open({ userId: 'u2' })
    expect(two.getSnapshot().state).to.eq('absent')
    await two.unlock('pw two')
    await two.storeBox('anthropic', 'u2-secret')
    expect(await one.readBox('anthropic')).to.eq('u1-secret')
    expect(await two.readBox('anthropic')).to.eq('u2-secret')
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
    await vault.storeBox('anthropic', 'sk-fake')
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
    await vault.storeBox('anthropic', 'sk-fake')
    expect(heardCount).to.eq(heardBefore)
  })

  it("hears about lockboxes written through another handle", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.open()
    await there.storeBox('anthropic', 'written elsewhere')
    await vi.waitFor(() => { expect(boxlabelsOf(here)).to.deep.equal(['anthropic']) })
  })
})

describe("what the backend sees", () => {
  it("stores no whisper and no passphrase in the clear, anywhere", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a very memorable passphrase')
    await vault.storeBox('anthropic', 'sk-ant-api03-fake-but-secret', { sidecar: { note: 'sidecars are visible in storage' } })
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('sk-ant-api03-fake-but-secret')
    expect(everything).to.not.include('a very memorable passphrase')
    expect(everything).to.include('sidecars are visible in storage') // the sidecar is visible by design
    expect(everything).to.include('whisper_ciphered')
  })

  it("two stores of the same whisper write different ciphertext: fresh key and iv every time", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('one_box', 'the same whisper')
    await vault.storeBox('two_box', 'the same whisper')
    const [oneRow, twoRow] = world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))
      .map((ckey) => JSON.parse(world.dbStore.read(ckey) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } })
    expect(oneRow?.whisper_ciphered.ciphertext_b64).to.not.eq(twoRow?.whisper_ciphered.ciphertext_b64)
  })
})

/** A lockbox row's visible fields altered in storage, each a field its encryptions bind. */
const SpoiledShells = [
  [(row: Record<string, unknown>) => ({ ...row, sidecar_json: '{"note":"personal account"}' }),         'its sidecar swapped for another'],
  [(row: Record<string, unknown>) => ({ ...row, sidecar_json: '{}' }),                                    'its sidecar emptied'],
  [(row: Record<string, unknown>) => ({ ...row, sidecar_json: '{"note": "work account"}' }),              'its sidecar respaced, the same JSON value written otherwise'],
  [({ registered_at: kept, ...row }: Record<string, unknown>) => ({ ...row, registered_at: (kept as number) - 1 }), 'its registered_at moved'],
  [({ written_at: kept, ...row }: Record<string, unknown>) => ({ ...row, written_at: (kept as number) + 1 }),       'its written_at moved'],
  [(row: Record<string, unknown>) => ({ ...row, revision_tok: 'rev-elsewhere' }),                         'its revision_tok swapped'],
] as const

describe("tampering", () => {
  it("a lockbox with altered ciphertext refuses to open, and is left as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const ckey = world.dbStore.ckeys().find((ckey) => isU1Box(ckey))
    const row = JSON.parse(world.dbStore.read(ckey ?? '') ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(ckey ?? '', JSON.stringify(row))
    const err = await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(err.message).to.not.include('sk-fake')
    expect(world.dbStore.read(ckey ?? '')).to.not.be.null  // preserved for forensics, never auto-deleted
  })

  it("a lockbox row moved under another label refuses to open", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('victim_box', 'sk-fake')
    const fromCkey = world.dbStore.ckeys().find((candidate) => candidate.includes('victim_box'))
    world.dbStore.write(u1BoxCkey('other_box'), world.dbStore.read(fromCkey ?? '') ?? '')
    await TH.expectRefusal(vault.readBox('other_box'), 'damaged_lockbox')
  })

  for (const [spoil, blurb] of SpoiledShells) {
    it(`a lockbox with ${blurb} refuses to open, and is left as it is: its whole visible header is bound`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
      const ckey = world.dbStore.ckeys().find((candidate) => isU1Box(candidate)) ?? ''
      const row = JSON.parse(world.dbStore.read(ckey) ?? '{}') as Record<string, unknown>
      const spoiled = JSON.stringify(spoil(row))
      world.dbStore.write(ckey, spoiled)
      await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
      expect(world.dbStore.read(ckey)).to.eq(spoiled)
    })
  }

  it("vault props whose registered_at was altered open to no passphrase: it is bound into every way in", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { registered_at: number }
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, registered_at: vaultProps.registered_at - 1 }))
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(vault.unlock('pw'), 'wrong_passphrase')
    // The decryption fails as for a typo, so the message names both, and claims neither.
    expect(err.message).to.include('Check for typos')
    expect(err.message).to.include('the stored vault may be damaged')
  })

  it("vault props that do not parse make the open itself refuse as damaged_vault, storage's refusal its cause, deleting nothing", async () => {
    const world = makeWorld()
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v3"}')
    const err = await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(err.message).to.include("can't be opened")
    expect((err.cause as VaultError).kind).to.eq('corrupt_record')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq('{"format":"safebyok-vault-v3"}')
  })

  it("a lockbox that will not open under the vault's own key is called damaged, with the remedy, never quoting its boxlabel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const row = JSON.parse(world.dbStore.read(u1BoxCkey('anthropic')) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify(row))
    const err = await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(err.message).to.include('That lockbox is damaged')
    expect(err.message).to.not.include('anthropic')
    expect(err.message).to.include('remove it')
    await vault.retireBox('anthropic')
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })
})

const drainDown = (): never => { throw new Error('the log drain is down') }

/** A logger whose every call throws, as a broken log drain might. */
const throwingLogger = () => ({ log: drainDown, warn: drainDown, error: drainDown })

/** Every ciphertext, salt and wrapped key the backend holds, as base64url text. */
const storedSecrets = (world: ReturnType<typeof makeWorld>): string[] => {
  const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey) ?? '').join('\n')
  return Array.from(everything.matchAll(/"(?:ciphertext_b64|salt_b64)":"([^"]+)"/g), (hit) => hit[1]!)
}

/** A logger's every call, for a logger that fails: what it throws must break nothing. */
const throwFromLogger = () => { throw new Error('a logger that throws') }

describe("the logger", () => {
  it("hears nothing from a vault going about its business", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
    await vault.readBox('anthropic')
    await vault.changePassphrase('pw', 'pw two')
    await vault.lockSoon(0.01)
    await vault.unlock('pw two')
    await vault.retireBox('anthropic')
    await vault.lock()
    world.advance(SevenDaysMillis * 2)
    await world.open()
    await vault.retire()
    vault.close()
    expect(world.logged).to.have.lengthOf(0)
  })

  it("is the console when the host passes none, each message tagged safebyok", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { logger: undefined, clock: { now: () => reading } })
    reading = NaN
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    try {
      await vault.lockSoon()
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls[0]?.[0])).to.match(/^safebyok: lockSoon\(\) could not read the clock/)
    } finally {
      warn.mockRestore()
    }
  })

  it("is not the vaultDB's: what its storage has nobody to throw to goes to the logger the storage was made with", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.open({ vaultDB })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener of the host that throws') })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(own.calls).to.have.lengthOf(1)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("is not the vaultDB's when the vaultDB was made with none: that one logs to the console, whatever the vault is given", async () => {
    const world = makeWorld()
    const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const vaultDB = localVaultDB({ store: world.dbStore })
    await world.open({ vaultDB })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener of the host that throws') })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(consoleErrors).toHaveBeenCalledOnce()
    expect(world.logged).to.have.lengthOf(0)
    consoleErrors.mockRestore()
  })

  it("is the vaultDB's logger when the host passes the vault none: one given to the storage once hears both", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { vaultDB, logger: undefined, clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(own.calls.map((call) => [call.level, call.story])).to.deep.equal([['warn', { call: 'lockSoon' }]])
    expect(world.logged).to.have.lengthOf(0)
  })

  it("guards the vaultDB's logger too: a VaultDB of the host's own whose logger throws breaks no lock", async () => {
    const world = makeWorld()
    const vaultDB = localVaultDB({ store: world.dbStore })
    // As a subclass overriding the getter would: its logger is the host's to answer.
    Object.defineProperty(vaultDB, 'logger', { value: { log: throwFromLogger, warn: throwFromLogger, error: throwFromLogger } })
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { vaultDB, logger: undefined, clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("refuses a vaultDB whose logger is not one, before reading storage, when the host passes the vault none", async () => {
    const world = makeWorld()
    const vaultDB = localVaultDB({ store: world.dbStore })
    const readVaultProps = vi.spyOn(vaultDB, 'readVaultProps')
    Object.defineProperty(vaultDB, 'logger', { value: { log: () => undefined } })
    const err = await TH.expectRefusal(world.open({ vaultDB, logger: undefined }), 'bad_option')
    expect(err.message).to.match(/log, warn and error functions/)
    expect(readVaultProps).not.toHaveBeenCalled()
  })

  it("takes null as none: the vaultDB's logger", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { vaultDB, logger: null, clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(own.calls.map((call) => call.story)).to.deep.equal([{ call: 'lockSoon' }])
  })

  it("is the default logger, whatever the vaultDB was made with, when the host passes DefaultLogger, as its example shows", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const telemetry = TH.spyLogger()
    setDefaultLogger(telemetry.logger)
    try {
      const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
      let reading = world.clock.now()
      const vault = await world.openUnlocked('pw', { vaultDB, logger: DefaultLogger, clock: { now: () => reading } })
      reading = world.clock.now() / 1000
      await vault.lockSoon()
      expect(telemetry.calls.map((call) => call.story)).to.deep.equal([{ call: 'lockSoon' }])
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
      let reading = world.clock.now()
      const vault = await world.openUnlocked('pw', { vaultDB, logger: undefined, clock: { now: () => reading } })
      reading = world.clock.now() / 1000
      await vault.lockSoon()
      expect(telemetry.calls.map((call) => call.story)).to.deep.equal([{ call: 'lockSoon' }])
    } finally {
      setDefaultLogger(undefined)
    }
  })

  it("is the host's own for the vault, when it passes one, whatever the vaultDB was made with", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { vaultDB, clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(world.logged).to.have.lengthOf(1)
    expect(own.calls).to.have.lengthOf(0)
  })

  it("refuses a logger that is not one, before reading storage", async () => {
    const world = makeWorld()
    const readVaultProps = vi.spyOn(world.vaultDB, 'readVaultProps')
    for (const nonsense of [{}, { log: () => undefined, warn: () => undefined }, 'console']) {
      const err = await TH.expectRefusal(world.open({ logger: nonsense as unknown as MakeVaultOpts['logger'] }), 'bad_option')
      expect(err.message).to.match(/log, warn and error functions/)
    }
    expect(readVaultProps).not.toHaveBeenCalled()
  })

  it("warns when lockSoon() locks at once on a clock gone wrong, the clock's refusal its error", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(world.logged).to.have.lengthOf(1)
    const [heard] = world.logged
    expect(heard?.level).to.eq('warn')
    expect(heard?.story).to.deep.equal({ call: 'lockSoon' })
    expect(heard?.err).to.be.instanceOf(VaultError)
    expect((heard?.err as VaultError).kind).to.eq('bad_option')
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

  it("says nothing of an unreadable lease that could not be erased: hello rejects instead, and says only that", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: 'soon' }))
    const jammed = new Error('the device store is closed')
    vi.spyOn(device.deviceDB, 'eraseLease').mockRejectedValueOnce(jammed)
    const err = await TH.expectRefusal(world.open({ deviceDB: device.deviceDB }), 'storage_unavailable')
    expect(err.cause).to.eq(jammed)
    expect(world.logged.map((heard) => [heard.level, heard.story, heard.err])).to.deep.equal([['warn', { call: 'hello' }, err]])
  })

  it("says nothing of a lease that simply ran out, or that a new passphrase outdated", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    world.advance(SevenDaysMillis + 1)
    expect(await world.stateOnOpen()).to.eq('locked')
    await vault.unlock('pw')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.changePassphrase('pw', 'pw two')
    expect(await world.stateOnOpen()).to.eq('locked')
    expect(world.logged).to.have.lengthOf(0)
  })

  it("warns when a background refresh fails, with the refusal as its error", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v3"}')
    await TH.wakeupAtNextTick()
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.story).to.deep.equal({ call: 'refresh' })
    expect((world.logged[0]?.err as VaultError).kind).to.eq('damaged_vault')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(1)  // the snapshot stands as it was
  })

  it("never breaks a lock, a hello, a refresh or a refused hello when it throws", async () => {
    const world = makeWorld()
    const logger = throwingLogger()
    const device = uncheckingDeviceDB()
    let reading = world.clock.now()
    const clock = { now: () => reading }
    const vault = await world.openUnlocked('pw', { logger, deviceDB: device.deviceDB, clock })
    await vault.storeBox('anthropic', 'sk-fake')
    // a refresh rung in the background, failing
    const row = world.dbStore.read(u1BoxCkey('anthropic')) ?? ''
    world.dbStore.write(u1BoxCkey('anthropic'), '{"not":"a lockbox"}')
    await TH.wakeupAtNextTick()
    world.dbStore.write(u1BoxCkey('anthropic'), row)
    // a lock that cannot time its grace
    reading = NaN
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    reading = world.clock.now()
    // an open that discards an unreadable lease
    await vault.unlock('pw')
    device.spoilRow(() => 'not a record')
    expect(await world.stateOnOpen({ logger, deviceDB: device.deviceDB, clock })).to.eq('locked')
    // a hello refused, which make's own hello tells the logger of
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    await TH.expectRefusal(world.open({ logger }), 'not_permitted')
  })

  it("is never handed a whisper, a passphrase, a ciphertext or a salt, whatever it hears", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    const whisper = 'sk-FAKESECRET-whisper'
    const passphrase = 'FAKESECRET passphrase'
    const reading = world.clock.now()
    let clockBroken = false
    const clock = { now: () => { if (clockBroken) { throw new Error('the host clock broke: battery flat') } return reading } }
    const vault = await world.openUnlocked(passphrase, { deviceDB: device.deviceDB, clock })
    await vault.storeBox('anthropic', whisper, { sidecar: { note: 'FAKESECRET note' } })
    await vault.changePassphrase(passphrase, `${passphrase} two`)
    const secrets = storedSecrets(world)
    // every call site: a lease unreadable, a background refresh refused, a lock
    // without its grace (its error carrying the host clock's as its cause), a hello refused
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: `${passphrase} ${whisper}` }))
    const reopened = await world.open({ deviceDB: device.deviceDB, clock })
    reopened.close()
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), registered_at: whisper }))
    await TH.wakeupAtNextTick()
    clockBroken = true
    await vault.lockSoon()
    clockBroken = false
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    await TH.expectRefusal(world.open(), 'not_permitted')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'warn', 'warn', 'warn'])
    expect((world.logged[2]?.err?.cause as Error).message).to.match(/battery flat/)
    const text = TH.loggedText(world.logged)
    // the walk reached the cause, so its search covers what causes hold
    expect(text).to.include('battery flat')
    expect(text.toLowerCase()).to.not.include('fakesecret')
    expect(secrets.length).to.be.greaterThan(2)
    for (const secret of secrets) { expect(text).to.not.include(secret) }
  })
})

/** A refusal of kind identity_revoked, as an adapter says a user signed out. */
const signedOut = () => new VaultError('identity_revoked', 'No one is signed in, so this vault cannot be reached: sign in, then try again.')

describe("when storage says the user is no longer signed in", () => {
  /** Each vault call that reaches storage, the storage verb it reaches, and the call. */
  const RevokedCallCases: readonly (readonly [string, 'readVaultProps' | 'readBox' | 'updateBox' | 'updateVaultProps', (vault: Vault) => Promise<unknown>])[] = [
    ['readBox()',          'readBox',          (vault) => vault.readBox('anthropic')],
    ['storeBox()',         'updateBox',        (vault) => vault.storeBox('openai', 'sk-fake-two')],
    ['unlock()',           'readVaultProps',   (vault) => vault.unlock('pw one')],
    ['changePassphrase()', 'updateVaultProps', (vault) => vault.changePassphrase('pw one', 'pw two')],
  ]

  for (const [callTitle, verb, call] of RevokedCallCases) {
    it(`locks at once when ${callTitle} meets it, throws the refusal itself, and removes nothing stored`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.storeBox('anthropic', 'sk-fake-one')
      const refusal = signedOut()
      vi.spyOn(world.vaultDB, verb).mockRejectedValueOnce(refusal)
      expect(await TH.expectRefusal(call(vault), 'identity_revoked')).to.eq(refusal)
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(vault.getSnapshot().askPassphraseAt).to.be.null
      expect(await world.readLease()).to.be.null
      await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
      // Signed in again: the passphrase it had still opens it, and the lockbox is still there.
      await vault.unlock('pw one')
      expect(await vault.readBox('anthropic')).to.eq('sk-fake-one')
    })
  }

  it("locks when a background refresh meets it, and tells the logger, having nobody to throw to", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValue(signedOut())
    // Any write rings the store's change bell, and the vault looks.
    world.dbStore.write('elsewhere', '{}')
    await vi.waitFor(() => { expect(vault.getSnapshot().state).to.eq('locked') })
    expect(await world.readLease()).to.be.null
    await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.deep.equal(['log', 'warn']) })
    expect(world.logged[0]).to.deep.include({ level: 'log', story: { call: 'untrustedStorage' } })
    expect(world.logged[0]?.message).to.match(/no longer serves the user/)
  })

  it("calls subscribers with the locked snapshot", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const heard: string[] = []
    vault.subscribe(() => { heard.push(vault.getSnapshot().state) })
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(vault.readBox('anthropic'), 'identity_revoked')
    expect(heard).to.deep.equal(['locked'])
  })

  it("wins over an unlock under way, as lock() does: it throws 'vault_locked' and grants no lease", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(signedOut())
    world.dbStore.write('elsewhere', '{}')
    await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.include('warn') })
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
  })

  it("revokes the lease when it meets the open, which then refuses", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw one')
    first.close()
    expect(await world.readLease()).to.not.be.null
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(world.open(), 'identity_revoked')
    expect(await world.readLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("wins over the lease an open is taking up, when a background refresh meets it meanwhile", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw one')
    first.close()
    const readLease = world.deviceDB.readLease.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'readLease').mockImplementationOnce(async (scope) => {
      const kept = await readLease(scope)
      // The open's own read is past; the next, a background refresh's, meets the sign-out.
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(signedOut())
      world.dbStore.write('elsewhere', '{}')
      await vi.waitFor(async () => { expect(await readLease(scope)).to.be.null })
      return kept
    })
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("takes no option to stay unlocked: Vault.make refuses one, as it refuses any option it does not know", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make(world.optsWith({ whenIdentityRevoked: 'stay' } as Partial<MakeVaultOpts>)), 'bad_option')
    expect(err.message).to.include('whenIdentityRevoked')
  })

  it("locks nothing for not_permitted: the vault's own user, refused one call", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(new VaultError('not_permitted', 'You may not read this vault.'))
    await TH.expectRefusal(vault.readBox('anthropic'), 'not_permitted')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.readLease()).to.not.be.null
  })

  it("locks all the same, and throws the refusal, when the device store will not erase the lease", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const stuck = new Error('the device store is read-only')
    vi.spyOn(world.deviceDB, 'eraseLease').mockRejectedValueOnce(stuck)
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(vault.readBox('anthropic'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('locked')
    // The next call says hello afresh, but this handle takes up no lease the lock could not
    // revoke: that is left for the next page load.
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    expect(await world.readLease()).to.not.be.null
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'untrustedStorage' } })
    expect((world.logged[0]?.err as VaultError).kind).to.eq('storage_unavailable')
    expect(world.logged[0]?.err?.cause).to.eq(stuck)
  })
})

/** This device's mark for `u1`'s vault, as its deviceDB keeps it. */
const markIn = (world: ReturnType<typeof makeWorld>) => world.deviceDB.readMark(TH.scopeOf('u1'))

/** What this world's device mark for `u1`'s vault has seen of it; null with no mark, or none seen. */
const seenIn = async (world: ReturnType<typeof makeWorld>) => {
  const mark = await markIn(world)
  return mark?.seen ?? null
}

describe("the device mark", () => {
  it("is kept from the vault's making: its vault_id, the epoch seen, and an id of its own, which the first way in carries", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const mark = await markIn(world)
    const vaultProps = storedVaultPropsOf(world)
    expect(mark).to.deep.include({ format: 'safebyok-mark-v3', ...TH.scopeOf('u1'), lock_generation: 0 })
    expect(mark?.seen).to.deep.include({ vault_id: vaultProps['vault_id'], unlock_epoch: 1, vault_key_epoch: 1 })
    expect(storedWayinsOf(world)[0]).to.deep.include({ device_id: mark?.seen?.device_id, vault_key_epoch: 1, registered_at: world.clock.now() })
  })

  it("is started under the id the first way in carries, though a refresh the vault's making set off gets there first", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const fetchOrCreateVaultProps = world.vaultDB.fetchOrCreateVaultProps.bind(world.vaultDB)
    // The write rings this handle's own watch, whose refresh runs to its end before the unlock goes on.
    vi.spyOn(world.vaultDB, 'fetchOrCreateVaultProps').mockImplementationOnce(async (...args) => {
      const settled = await fetchOrCreateVaultProps(...args)
      await TH.wakeupAtNextTick()
      return settled
    })
    await vault.unlock('pw')
    const seen = await seenIn(world)
    expect(storedWayinsOf(world)[0]?.['device_id']).to.eq(seen?.device_id)
  })

  it("rises with each newer version of the vault props, its own writes and another device's, and every way in this device adds carries its id", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const { device_id: deviceId } = await seenIn(world) ?? {}
    world.advance(HourMillis)
    await vault.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
    expect(await seenIn(world)).to.deep.include({ device_id: deviceId, unlock_epoch: 2 })
    expect(storedWayinsOf(world)[1]).to.deep.include({ device_id: deviceId, registered_at: world.clock.now() })
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.addPassphrase('pw', 'third phrase', { wayinlabel: 'third' })
    await TH.wakeupAtNextTick()
    expect(await seenIn(world)).to.deep.include({ device_id: deviceId, unlock_epoch: 3 })
    expect(storedWayinsOf(world)[2]?.['device_id']).to.be.a('string').and.not.eq(deviceId)
  })

  it("keeps a way in's device and time when its passphrase changes", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const [before] = storedWayinsOf(world)
    world.advance(HourMillis)
    await vault.changePassphrase('pw', 'pw two')
    const [after] = storedWayinsOf(world)
    expect(after).to.deep.include({ device_id: before?.['device_id'], registered_at: before?.['registered_at'], wayin_id: before?.['wayin_id'] })
    expect(after?.['salt_b64']).to.not.eq(before?.['salt_b64'])
  })

  it("survives lock(), and retire() forgets the vault it has seen, keeping the lock generation it raised", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    expect(await seenIn(world)).to.not.be.null
    await vault.retire()
    expect(await markIn(world)).to.deep.equal(TH.markOf('u1', { seen: null, lock_generation: 2 }))
  })

  it("starts anew, under a new id, for a vault made anew under the scope", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
    const before = await seenIn(world)
    vault.close()
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.retire()
    await elsewhere.unlock('pw anew')
    await world.open()
    const after = await seenIn(world)
    expect(after).to.deep.include({ vault_id: storedVaultPropsOf(world)['vault_id'], unlock_epoch: 1 })
    expect(after?.vault_id).to.not.eq(before?.vault_id)
    expect(after?.device_id).to.not.eq(before?.device_id)
  })

  it("reads a mark naming another scope as none, says so through the logger, and starts again", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const before = await seenIn(world)
    // Every read of the mark at this open hands back u2's: the one before the vault props, and the one after.
    const misfiled = vi.spyOn(world.deviceDB, 'readMark').mockResolvedValue(TH.markOf('u2', { seen: { unlock_epoch: 9 } }))
    await world.open()
    misfiled.mockRestore()
    expect(world.logged.map((call) => call.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('mark')
    const after = await seenIn(world)
    expect(after?.device_id).to.not.eq(before?.device_id)
  })

  it("is said unreadable through the logger as the call that read it: a lock's, not a refresh's", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vi.spyOn(world.deviceDB, 'readMark').mockResolvedValueOnce({ ...TH.markOf('u1'), lock_generation: -1 })
    await vault.lock()
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'lock' }]])
    expect(await markIn(world)).to.deep.include({ lock_generation: 1, seen: null })
  })

  it("is erased by retireDamagedVault, with the vault", async () => {
    const world = await damagedVaultWorld()
    expect(await markIn(world)).to.not.be.null
    await retireDamagedVault(world.optsWith())
    expect(await markIn(world)).to.be.null
  })
})

/**
 * A world whose `u1` vault had a way in, `spare`, removed, and the text of its vault props from
 * before the removal, for storage to hand back.
 */
const rolledBackWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  const spareId = await vault.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
  const older = world.dbStore.read(u1VaultPropsCkey) ?? ''
  await vault.retireWayin('pw', spareId)
  const newer = world.dbStore.read(u1VaultPropsCkey) ?? ''
  return { world, vault, older, newer }
}

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
    await opts.deviceDB.eraseMark({ applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
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
    expect(err.message).to.include('eraseMark')
    expect(err.message).to.not.include('Try again later')
    expect(TH.thrownText(err)).to.not.include((JSON.parse(older) as { vault_id: string }).vault_id)
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(older)
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 3 })
  })

  it("refuses an older copy at unlock, so a removed way in stays removed on this device", async () => {
    const { world, vault, older } = await rolledBackWorld()
    await vault.lock()
    const deaf = await world.open({ vaultDB: world.deafVaultDB() })
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(deaf.unlock('spare phrase'), 'rolled_back')
    expect(deaf.getSnapshot().state).to.eq('locked')
    expect(deaf.getSnapshot().wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase'])
    expect(await world.readLease()).to.be.null
  })

  it("locks on an older copy met by a background refresh, taking nothing from it, and says so through the logger", async () => {
    const { world, vault, older } = await rolledBackWorld()
    const standing = vault.getSnapshot()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().wayins).to.deep.equal(standing.wayins)
    expect(await world.readLease()).to.be.null
    // The next call says hello afresh, and meets the older copy again.
    await TH.expectRefusal(vault.readBox('anthropic'), 'rolled_back')
    expect(world.logged.map((call) => [call.level, call.story, (call.err as VaultError | null | undefined)?.kind]))
      .to.deep.equal([['log', { call: 'untrustedStorage' }, undefined], ['warn', { call: 'refresh' }, 'rolled_back']])
  })

  it("refuses no copy that was the newest when storage handed it back, though another tab of this device raised the mark meanwhile", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const slowVaultDB = world.deafVaultDB()
    const there = await world.open({ vaultDB: slowVaultDB })
    const readVaultProps = slowVaultDB.readVaultProps.bind(slowVaultDB)
    // There's next read is served at epoch 1, and handed back only once here's change has landed.
    vi.spyOn(slowVaultDB, 'readVaultProps').mockImplementationOnce(async (...args) => {
      const served = await readVaultProps(...args)
      await here.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
      return served
    })
    await there.unlock('pw')
    expect(there.getSnapshot().state).to.eq('unlocked')
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2 })
  })

  it("refuses no vault another tab made while this one was making it, though that tab raised the mark meanwhile", async () => {
    const world = makeWorld()
    const there = await world.open()
    const slowVaultDB = world.deafVaultDB()
    const late = await world.open({ vaultDB: slowVaultDB })
    const fetchOrCreateVaultProps = slowVaultDB.fetchOrCreateVaultProps.bind(slowVaultDB)
    // There makes the vault first, so late's write hands back there's vault props at epoch 1, and only
    // after that does there change it, raising the mark this device shares to epoch 2.
    vi.spyOn(slowVaultDB, 'fetchOrCreateVaultProps').mockImplementationOnce(async (...args) => {
      await there.unlock('pw')
      const settled = await fetchOrCreateVaultProps(...args)
      await there.changePassphrase('pw', 'pw two')
      return settled
    })
    await late.unlock('pw')
    expect(late.getSnapshot().state).to.eq('unlocked')
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2 })
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
    expect(reopened.getSnapshot().wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase'])
  })

  it("refuses an older copy at a lower vaultKey epoch as rolled_back, though storage raised its unlock epoch past the one seen", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vault.close()
    const first = storedVaultPropsOf(world) as unknown as VaultProps
    const second: VaultProps = {
      ...first,
      unlock_epoch:    2,
      vault_key_epoch: 2,
      prior_vault_key: { vault_key_epoch: 1, vault_key_wrapped: TH.fakeCiphered('prior') },
      wayins:          first.wayins.map((wayin) => ({ ...wayin, vault_key_epoch: 2 })),
    }
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify(second))
    await world.open()
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2, vault_key_epoch: 2 })
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...first, unlock_epoch: 9 }))
    await TH.expectRefusal(world.open(), 'rolled_back')
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2, vault_key_epoch: 2 })
  })

  it("takes an older copy at the same vaultKey epoch under a raised unlock epoch as it stands, its removed way in opening again", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...(JSON.parse(older) as object), unlock_epoch: 9 }))
    const reopened = await world.open()
    await reopened.unlock('spare phrase')
    expect(reopened.getSnapshot().state).to.eq('unlocked')
  })

  it("is accepted on this device once its mark of the vault is erased, as the README's recipe does", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    const reopened = await openAcceptingRestore(world.optsWith(), () => Promise.resolve(true))
    expect(reopened.getSnapshot().wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase', 'spare'])
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2 })
  })

  it("is still refused by the README's recipe when the host knows of no restore", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(openAcceptingRestore(world.optsWith(), () => Promise.resolve(false)), 'rolled_back')
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 3 })
  })

  it("is not caught on a device that never saw the newer copy, which takes the older as it stands", async () => {
    const { world, older } = await rolledBackWorld()
    world.dbStore.write(u1VaultPropsCkey, older)
    const stranger = await world.open({ deviceDB: memoryDeviceDB() })
    await stranger.unlock('spare phrase')
    expect(stranger.getSnapshot().state).to.eq('unlocked')
  })
})

describe("the vaultKey's epoch", () => {
  it("makes a vault at its first vaultKey, with no prior one", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    expect(storedVaultPropsOf(world)).to.deep.include({ format: 'safebyok-vault-v3', vault_key_epoch: 1 })
    expect(storedVaultPropsOf(world)).to.not.have.property('prior_vault_key')
  })

  it("seals each lockbox under the vault props' vaultKey, its epoch shown in the listing while locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lock()
    expect(storedRowOf(world, 'anthropic')).to.deep.include({ format: 'safebyok-lockbox-v5', vault_key_epoch: 1 })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.vault_key_epoch).to.eq(1)
  })

  it("refuses as damaged_lockbox a lockbox that says it was sealed under another vaultKey, quoting not its boxlabel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), vault_key_epoch: 2 }))
    const err = await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(err.message).to.include('does not hold')
    expect(TH.thrownText(err)).to.not.include('anthropic')
  })

  it("writes nothing from a device still holding a vaultKey since replaced, which has not looked at the vault props since", async () => {
    const world = makeWorld()
    const stale = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const standing = storedVaultPropsOf(world) as unknown as VaultProps
    const replaced: VaultProps = {
      ...standing,
      unlock_epoch:    2,
      vault_key_epoch: 2,
      prior_vault_key: { vault_key_epoch: 1, vault_key_wrapped: TH.fakeCiphered('prior') },
      wayins:          standing.wayins.map((wayin) => ({ ...wayin, vault_key_epoch: 2 })),
    }
    await world.vaultDB.updateVaultProps(replaced, { vault_id: standing.vault_id, unlock_epoch: 1 })
    await TH.expectRefusal(stale.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
  })

  it("opens a vault stored before vaultKey epochs as damaged_vault, which retireDamagedVault clears", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    vault.close()
    const { vault_key_epoch: _epoch, ...older } = storedVaultPropsOf(world)
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...older, format: 'safebyok-vault-v1' }))
    await TH.expectRefusal(world.open(), 'damaged_vault')
    await retireDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("opens a vault stored under the format before wayins, safebyok-vault-v2, as damaged_vault, never newer_format, which retireDamagedVault clears", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), format: 'safebyok-vault-v2' }))
    await TH.expectRefusal(world.open(), 'damaged_vault')
    await retireDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })
})
