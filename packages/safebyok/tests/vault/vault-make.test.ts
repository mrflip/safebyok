import { describe, it, expect, vi, afterEach, expectTypeOf } from 'vitest'
import { LeaseHours, FarFuture, ForeverMillis, MinuteMillis } from '../../src/types'
import { MaxUserIdChars } from '../../src/validators'
import { VaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { Vault } from '../../src/vault'
import { type MakeVaultOpts, parseStaleMinutes } from '../../src/vault-opts'
import { fromB64 } from '../../src/crypto'
import type { KeyDeriver, CustomKeyDeriver } from '../../src/key-deriver'
import { type VaultLogger } from '../../src/logger'
import { Argon2idWebV1, MaxSaltBytes, TestDeriverNotice } from '../../src/key-deriver-spec'
import * as TH from '../test-helpers'
import { makeWorld, MisfitStores, VaultDBVerbsUsed, uncheckingDeviceDB, HourMillis, isU1Box } from './world'


// == [Making a vault]: Vault.make, options

describe("Vault.make", () => {
  it("settles into 'absent' against an empty backend, prompting nobody", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("refuses a hyphenated applabel or vaultlabel at the door", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ applabel: 'not-a-label' }), 'bad_label')
    await TH.expectRefusal(world.open({ vaultlabel: 'not-a-label' }), 'bad_label')
  })

  it("refuses to open without a signed-in user", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ userId: '' }), 'bad_label')
  })

  it("takes a userId of a hundred characters, and refuses a longer one, naming the bound and never the id", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ userId: 'u'.repeat(MaxUserIdChars) })).to.eq('absent')
    const overlong = `alice@example.com${'u'.repeat(MaxUserIdChars)}`
    const err = await TH.expectRefusal(world.open({ userId: overlong }), 'bad_label')
    expect(err.message).to.include('at most 100 characters')
    expect(TH.thrownText(err)).to.not.include('alice')
  })

  it("refuses a userId that is not text, as no signed-in user", async () => {
    const world = makeWorld()
    for (const userId of [42, null, undefined, { id: 'u1' }]) {
      await TH.expectRefusal(world.open({ userId: userId as unknown as string }), 'bad_label')
    }
  })

  it("refuses a call with no bag of options at all", async () => {
    for (const opts of [undefined, null, 'acme']) {
      await TH.expectRefusal(TH.settledVault(opts as unknown as MakeVaultOpts), 'bad_option')
    }
  })

  for (const ckey of ['vaultDB', 'deviceDB'] as const) {
    it(`refuses a missing ${ckey} with kind 'bad_option'`, async () => {
      const opts = TH.omitting(makeWorld().optsWith(), ckey)
      const err = await TH.expectRefusal(TH.settledVault(opts), 'bad_option')
      expect(err.message).to.include(`${ckey} is not a`)
    })
  }

  for (const [opts, blurb] of MisfitStores) {
    it(`refuses ${blurb} with kind 'bad_option', before it touches storage`, async () => {
      const world = makeWorld()
      const err = await TH.expectRefusal(world.open(opts), 'bad_option')
      expect(err.message).to.match(/vaultDB is not a VaultDB|deviceDB is not a DeviceDB/)
    })
  }

  it("refuses a vaultDB that carries every verb but is no VaultDB, whose checks it would skip", async () => {
    const world = makeWorld()
    const verbs = Object.fromEntries(VaultDBVerbsUsed.map((verb) => [verb, world.vaultDB[verb].bind(world.vaultDB)]))
    const lookalike = { maxRecordBytes: 1024 * 1024, maxVaultBytes: Infinity, maxBoxes: Infinity, delDamagedVault: () => Promise.resolve(), ...verbs }
    const err = await TH.expectRefusal(world.open({ vaultDB: lookalike as unknown as MakeVaultOpts['vaultDB'] }), 'bad_option')
    expect(err.message).to.include('extends the VaultDB class')
  })

  it("says stored vault props refused as corrupt as damaged_vault, even from an adapter that throws before its promise", async () => {
    const world = makeWorld()
    const corrupt = new VaultError('corrupt_record', 'The stored vault props did not read back.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockImplementationOnce(() => { throw corrupt })
    const err = await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(err.cause).to.eq(corrupt)
    vi.restoreAllMocks()
  })

  it("hands on every method alone, bound to its vault, as its examples show", async () => {
    const world = makeWorld()
    const { subscribe, getSnapshot, hello, unlock, putBox, getBox, useBox, delBox, addPassphrase, addPasskey, changePassphrase, delWayin, lock, del, close } = await world.open()
    const heard = vi.fn()
    const unsubscribe = subscribe(heard)
    await hello()
    await unlock('correct horse')
    await putBox('anthropic_api_key', 'sk-ant-test')
    expect(await getBox('anthropic_api_key')).to.eq('sk-ant-test')
    expect(await useBox('anthropic_api_key', (whisper) => typeof whisper)).to.eq('string')
    await delBox('anthropic_api_key')
    const spareId = await addPassphrase('correct horse', 'battery staple', { wayinlabel: 'spare' })
    await changePassphrase('battery staple', 'staple battery', { wayinId: spareId })
    await delWayin('staple battery', spareId)
    expect(await addPasskey('correct horse', () => TH.passkeyOf('laptop'), { wayinlabel: 'laptop' })).to.be.a('string')
    await lock()
    expect(getSnapshot().state).to.eq('locked')
    await del()
    expect(getSnapshot().state).to.eq('absent')
    expect(heard).toHaveBeenCalled()
    unsubscribe()
    close()
  })

  it("takes a store of the host's own that carries every verb, prototype and all", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: Object.create(world.vaultDB) as MakeVaultOpts['vaultDB'], deviceDB: uncheckingDeviceDB().deviceDB })).to.eq('absent')
  })
})

describe("Vault.make's options", () => {
  it("makes the handle at once, still opening, before storage has answered", () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    expect(vault.getSnapshot()).to.deep.include({ state: 'opening', trouble: null, syncing: true })
  })

  it("makes a handle that settles once its hello is awaited, as its first two examples, and the Vault's own, show", async () => {
    const { vaultDB, deviceDB } = makeWorld()
    const vault = Vault.make({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest })
    expect(vault.state).to.eq('opening')
    await vault.hello()
    expect(vault.state).to.eq('absent')
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("throws misuse at once, never as a rejection: a bad label, a missing store", () => {
    const world = makeWorld()
    TH.expectSyncRefusal(() => Vault.make(world.optsWith({ applabel: 'not-a-label' })), 'bad_label')
    TH.expectSyncRefusal(() => Vault.make(TH.omitting(world.optsWith(), 'vaultDB')), 'bad_option')
  })

  it("refuses an option it does not take as 'bad_option', naming it, before storage is touched", () => {
    const world = makeWorld()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), leaseHour: 1 } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.match(/does not take the option leaseHour: check the spelling/)
    expect(err.message).to.include('leaseHours')
    expect(getVaultProps).not.toHaveBeenCalled()
  })

  it("refuses forcePassphraseReentryHours, naming leaseHours, as its third example shows", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), forcePassphraseReentryHours: 1 } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.include('forcePassphraseReentryHours (called leaseHours now)')
  })

  it("names every option it refuses, and never quotes a value", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), note: 'FAKESECRET', colour: 'FAKESECRET' } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.match(/the options note, colour:/)
    expect(TH.thrownText(err)).to.not.include('FAKESECRET')
  })

  it("takes an option given as undefined as one left out", async () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith({ leaseHours: undefined, clock: undefined, logger: undefined }))
    await vault.hello()
    expect(vault.leaseMillis).to.eq(LeaseHours * HourMillis)
  })
})
// --

// == [Host environment]: secure context, host's clock, OutOfBoundsReadings

describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses Vault.make over plain http with kind 'insecure_context', before it touches storage", async () => {
    vi.stubGlobal('isSecureContext', false)
    const world = makeWorld()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
    const err = await TH.expectRefusal(world.open(), 'insecure_context')
    expect(err.message).to.match(/https/)
    expect(getVaultProps).not.toHaveBeenCalled()
  })

  it("refuses first of all, even a bag of options that is no bag", async () => {
    vi.stubGlobal('isSecureContext', false)
    await TH.expectRefusal(TH.settledVault(null as unknown as MakeVaultOpts), 'insecure_context')
  })

  it("opens in a secure context, and in a runtime with no notion of one (Node)", async () => {
    expect((globalThis as { isSecureContext?: unknown }).isSecureContext).to.be.undefined
    expect(await makeWorld().stateOnOpen()).to.eq('absent')
    vi.stubGlobal('isSecureContext', true)
    expect(await makeWorld().stateOnOpen()).to.eq('absent')
  })
})

/** Clock readings outside EpochMillis's bounds, each a unit mistake or no time at all. */
const OutOfBoundsReadings = [
  [Date.parse('2026-10-14T12:00:00Z') / 1000,   'epoch seconds'],
  [Date.parse('2026-10-14T12:00:00Z') * 1000,   'epoch microseconds'],
  [0,                                           'the epoch itself, before 1981'],
  [FarFuture + 1,                               'one millisecond past FarFuture'],
  [Infinity,                                    'Infinity'],
  [NaN,                                         'NaN'],
  ['1792022400000',                             'a number written as text'],
  [new Date('2026-10-14T12:00:00Z'),            'a Date, not its epoch milliseconds'],
] as const

describe("the host's clock", () => {
  for (const [reading, blurb] of OutOfBoundsReadings) {
    it(`refuses a clock reading ${blurb} at Vault.make, before reading storage`, async () => {
      const world = makeWorld()
      const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
      const err = await TH.expectRefusal(world.open({ clock: { now: () => reading as number } }), 'bad_option')
      expect(err.message).to.match(/epoch milliseconds/)
      expect(getVaultProps).not.toHaveBeenCalled()
    })
  }

  it("refuses a clock that is not a Clock", async () => {
    const world = makeWorld()
    for (const nonsense of [{}, { now: 1_792_022_400_000 }, () => 1_792_022_400_000, 'now', null]) {
      await TH.expectRefusal(world.open({ clock: nonsense as unknown as MakeVaultOpts['clock'] }), 'bad_option')
    }
  })

  it("takes a reading with a fraction of a millisecond, in bounds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.5 } })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("is checked at every reading: a clock gone wrong after the open refuses each call that reads it, and unlocks nothing", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    await vault.lock()
    reading /= 1000
    await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("refuses an unlock that would create the vault, writing nothing, when the clock has gone wrong", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.open({ clock: { now: () => reading } })
    reading *= 1000
    await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("still locks when the clock has gone wrong", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = 0
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    reading = world.clock.now()
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
  })

  it("fails closed: a reading gone wrong while unlocked drops the vaultKey before it refuses the clock", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    await vault.putBox('anthropic', 'sk-fake')
    reading = world.clock.now() / 1000
    await TH.expectRefusal(vault.getBox('anthropic'), 'bad_option')
    expect(vault.getSnapshot().state).to.eq('locked')
    reading = world.clock.now()
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
  })

  it("refuses a clock whose now() throws, at Vault.make, keeping its error as the cause and quoting none of it", async () => {
    const world = makeWorld()
    const thrown = new Error('clock broke near sk-ant-SUPERSECRET')
    const err = await TH.expectRefusal(world.open({ clock: { now: () => { throw thrown } } }), 'bad_option')
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.not.include('SUPERSECRET')
  })

  it("refuses, and drops the vaultKey, when now() starts throwing after the open", async () => {
    const world = makeWorld()
    let broken = false
    const clock = { now: () => { if (broken) { throw new Error('no time today') } return world.clock.now() } }
    const vault = await world.openUnlocked('pw', { clock })
    await vault.putBox('anthropic', 'sk-fake')
    broken = true
    const err = await TH.expectRefusal(vault.getBox('anthropic'), 'bad_option')
    expect((err.cause as Error).message).to.eq('no time today')
    broken = false
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
  })

  it("refuses a store when the clock has gone wrong while unlocked", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = Infinity
    await TH.expectRefusal(vault.putBox('anthropic', 'sk-fake'), 'bad_option')
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
  })
})
// --

// == [Key deriver seam]: cheapDerive, handBuilt, hearingEverything, key deriver

/** The testDeriver's derivation, to put in a deriver of another shape. */
const cheapDerive: KeyDeriver['deriveKeyBytes'] = (passphrase, saltBytes) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes)

/** A hand-built Argon2id deriver over the cheap derivation: the whole spec, under a label of its own, then `change`. */
const handBuilt = (change: Record<string, unknown> = {}): KeyDeriver => (
  { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', deriveKeyBytes: cheapDerive, ...change }
)

/** A logger that keeps everything it hears, the notice included, which TH.spyLogger drops. */
const hearingEverything = () => {
  const heard: TH.LoggedCall[] = []
  const hear = (level: keyof VaultLogger) => (message?: string, story?: Record<string, unknown>, err?: Error | null) => { heard.push({ level, message, story, err }) }
  return { heard, logger: { log: hear('log'), warn: hear('warn'), error: hear('error') } }
}

describe("the key deriver seam", () => {
  it("a vault made under one deriver refuses to unlock under another, by label", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const alien = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: alienDeriver })
    await TH.expectRefusal(alien.unlock('pw'), 'unknown_key_deriver')
  })

  it("asks for a keyDeriver outright: there is no default to fall back on", () => {
    expectTypeOf<Pick<MakeVaultOpts, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("refuses to open without a keyDeriver, pointing at the browser's defaults", async () => {
    const opts = TH.omitting(makeWorld().optsWith(), 'keyDeriver')
    const err = await TH.expectRefusal(TH.settledVault(opts), 'bad_option')
    expect(err.message).to.include('keyDeriver')
    expect(err.message).to.include('safebyok/browser')
  })

  it("refuses a keyDeriver that is not one", async () => {
    const world = makeWorld()
    const NotDerivers = [
      null,
      'argon2id_web_v1',
      { key_deriver_label: 'test_digest_v0', salt_bytes: 16 },
      { ...TH.testDeriver, salt_bytes: 0 },
      { ...TH.testDeriver, salt_bytes: 1.5 },
      { ...TH.testDeriver, salt_bytes: MaxSaltBytes + 1 },
      { ...TH.testDeriver, key_deriver_label: '' },
    ]
    for (const notDeriver of NotDerivers) {
      await TH.expectRefusal(world.open({ keyDeriver: notDeriver as unknown as KeyDeriver }), 'bad_option')
    }
  })

  it("allows a foolish salt of one byte, and the longest the platform's random source hands out", async () => {
    for (const saltBytes of [1, MaxSaltBytes]) {
      const world = makeWorld()
      await world.openUnlocked('pw', { keyDeriver: { ...TH.testDeriver, salt_bytes: saltBytes } })
      const stored = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
      const [wayin] = stored?.wayins ?? []
      expect(fromB64(wayin?.wayinkind === 'passphrase' ? wayin.salt_b64 : '')).to.have.lengthOf(saltBytes)
    }
  })

  it("refuses a deriver wearing a supplied spec's label without that spec's parameters", async () => {
    const world = makeWorld()
    const Impostors = [
      { ...TH.testDeriver, key_deriver_label: Argon2idWebV1.key_deriver_label },
      { ...Argon2idWebV1, iterations: 1, deriveKeyBytes: cheapDerive },
      { ...Argon2idWebV1, salt_bytes: 32, deriveKeyBytes: cheapDerive },
    ]
    for (const impostor of Impostors) {
      const err = await TH.expectRefusal(world.open({ keyDeriver: impostor }), 'bad_option')
      expect(err.message).to.include('argon2id_web_v1')
    }
  })

  it("takes a stand-in that carries a supplied spec whole, as a WebAssembly Argon2id would", async () => {
    const world = makeWorld()
    const standIn: KeyDeriver = { ...Argon2idWebV1, deriveKeyBytes: cheapDerive }
    await world.openUnlocked('pw', { keyDeriver: standIn })
    const stored = await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))
    const [wayin] = stored?.wayins ?? []
    expect(wayin?.wayinkind === 'passphrase' && wayin.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("refuses a deriver that hands back anything but 32 key bytes, and makes no vault of it", async () => {
    const Outputs = [new Uint8Array(16), new Uint8Array(24), new Uint8Array(64), new Uint8Array(0), 'thirty-two bytes, honest'] as const
    for (const output of Outputs) {
      const world = makeWorld()
      const shortDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(output as Uint8Array) }
      const vault = await world.open({ keyDeriver: shortDeriver })
      await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
      expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
      expect(vault.getSnapshot().state).to.eq('absent')
    }
  })

  it("refuses a deriver that hands back 32 zero bytes, a key anyone could rebuild, and makes no vault of it", async () => {
    const Zeros = [new Uint8Array(32), new Uint32Array(8), new Uint8Array(new ArrayBuffer(40), 8, 32)] as const
    for (const output of Zeros) {
      const world = makeWorld()
      const zeroDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(output as Uint8Array) }
      const vault = await world.open({ keyDeriver: zeroDeriver })
      const err = await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
      expect(err.message).to.match(/zero bytes/)
      expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    }
  })

  it("refuses zero bytes at unlock too: a deriver that kept its output cannot open a vault", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const zeroDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) }
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: zeroDeriver })
    await TH.expectRefusal(fresh.unlock('pw'), 'bad_option')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("refuses unexpected_error for a deriver that throws, a VaultError of misuse or bad news included: what it threw the cause, never the refusal's message nor bad news, as it heard the passphrase", async () => {
    for (const thrown of [new Error('could not derive pw-the-passphrase'), new VaultError('bad_option', 'pw-the-passphrase is too short to derive from.'), new VaultError('damaged_vault', 'pw-the-passphrase broke the deriver.')]) {
      const world = makeWorld()
      const throwing = { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) }
      const told: unknown[] = []
      const vault = await world.open({ keyDeriver: throwing, onBadNews: (news) => { told.push(news) } })
      const err = await TH.expectRefusal(vault.unlock('pw-the-passphrase'), 'unexpected_error')
      expect(err.cause).to.eq(thrown)
      expect(err.message).to.not.include('pw-the-passphrase')
      expect(vault.getSnapshot().state).to.eq('absent')
      expect(told).to.have.lengthOf(0)
      expect(vault.getSnapshot().trouble).to.be.null
    }
  })

  it("keeps a condition a deriver raises as it came, for the caller to show or retry", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const empty = new VaultError('wrong_passphrase', "A passphrase can't be empty.")
    const refusing = { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(empty) }
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: refusing })
    const err = await TH.expectRefusal(fresh.unlock('pw'), 'wrong_passphrase')
    expect(err).to.eq(empty)
  })

  it("takes a key whose one nonzero byte is its last: only all zeros is refused", async () => {
    const world = makeWorld()
    const lastByteSet = new Uint8Array(32)
    lastByteSet[31] = 1
    const vault = await world.openUnlocked('pw', { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(lastByteSet.slice()) } })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  describe("a deriver that declares Argon2id", () => {
    it("opens, and unlocks, when its spec is one Argon2id can run", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw', { keyDeriver: handBuilt({ salt_bytes: 16 }) })
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    const Unrunnable = [
      [{ salt_bytes: 4 },            'a salt under 8 bytes'],
      [{ memory_kib: 4 },            'memory under 8 KiB a lane'],
      [{ iterations: 0 },            'no passes'],
      [{ parallelism: 0 },           'no lanes'],
      [{ output_bytes: 16 },         'a key other than 32 bytes'],
      [{ memory_kib: undefined },    'a parameter missing'],
    ] as const

    for (const [change, blurb] of Unrunnable) {
      it(`is refused at open as bad_option, not at the first unlock: ${blurb}`, async () => {
        const world = makeWorld()
        const err = await TH.expectRefusal(world.open({ keyDeriver: handBuilt(change) }), 'bad_option')
        expect(err.message).to.include('keyDeriverSpec')
        expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
      })
    }

    it("is refused at open when it wears the supplied label on other parameters", async () => {
      const err = await TH.expectRefusal(makeWorld().open({ keyDeriver: handBuilt({ key_deriver_label: 'argon2id_web_v1', iterations: 2 }) }), 'bad_option')
      expect(err.message).to.include('argon2id_web_v1')
    })
  })

  describe("a deriver of another algorithm, or none declared", () => {
    it("opens and unlocks, declaring an algorithm of its own, with no Argon2id parameters to carry", async () => {
      const scrypt: CustomKeyDeriver = { ...TH.testDeriver, key_deriver_label: 'acme_scrypt_v1', algorithm: 'scrypt' }
      const vault = await makeWorld().openUnlocked('pw', { keyDeriver: scrypt })
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("opens and unlocks, declaring none, as the test deriver does", async () => {
      expect(TH.testDeriver).to.not.have.property('algorithm')
      const vault = await makeWorld().openUnlocked('pw')
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("is refused at open when its algorithm is not text", async () => {
      await TH.expectRefusal(makeWorld().open({ keyDeriver: { ...TH.testDeriver, algorithm: 7 } as unknown as KeyDeriver }), 'bad_option')
    })
  })

  describe("the reserved label namespace", () => {
    const Reserved = [
      ['argon2id_web_v2',     'a spec safebyok may supply later'],
      ['Argon2id_Web_acme',   'the prefix in another case'],
      ['argon2id_web_v1',     'the supplied label, on a deriver carrying no parameters'],
    ] as const

    for (const [label, blurb] of Reserved) {
      it(`is refused at open as bad_option: ${blurb}`, async () => {
        const err = await TH.expectRefusal(makeWorld().open({ keyDeriver: { ...TH.testDeriver, key_deriver_label: label } }), 'bad_option')
        expect(err.message).to.match(/argon2id_web_/u)
      })
    }
  })

  describe("a label that begins test_", () => {
    it("warns once through the logger as the vault opens, and goes on to work", async () => {
      const { heard, logger } = hearingEverything()
      const vault = await makeWorld().openUnlocked('pw', { logger })
      expect(heard).to.deep.equal([{ level: 'warn', message: TestDeriverNotice, story: { call: 'make' }, err: undefined }])
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("warns each time a vault is opened, quoting no passphrase", async () => {
      const { heard, logger } = hearingEverything()
      const world = makeWorld()
      await world.open({ logger })
      await world.open({ logger })
      expect(heard).to.have.lengthOf(2)
      expect(TH.loggedText(heard)).to.not.include('pw ')
    })

    it("says nothing of a label that does not begin test_, or merely holds it", async () => {
      const { heard, logger } = hearingEverything()
      const world = makeWorld()
      await world.open({ logger, keyDeriver: { ...TH.testDeriver, key_deriver_label: 'acme_test_v1' } })
      await world.open({ logger, keyDeriver: { ...TH.testDeriver, key_deriver_label: 'Test_digest' } })
      expect(heard).to.deep.equal([])
    })

    it("is heard by TH.spyLogger as nothing, so a test's own count of what the vault said stands", async () => {
      const world = makeWorld()
      await world.open()
      expect(world.logged).to.deep.equal([])
    })
  })

  it("keeps the keyDeriver it was handed, so one whose method lives on its prototype still derives", async () => {
    class PrototypeDeriver implements CustomKeyDeriver {
      readonly key_deriver_label = TH.testDeriver.key_deriver_label
      readonly salt_bytes = TH.testDeriver.salt_bytes
      readonly #inner = TH.testDeriver
      deriveKeyBytes(passphrase: string, saltBytes: Uint8Array) { return this.#inner.deriveKeyBytes(passphrase, saltBytes) }
    }
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { keyDeriver: new PrototypeDeriver() })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })
})
// --

// == [Vault.make, by the Contract]: Does, Guarantees, Returns, Refuses; the new options

const BadNewOptionCases = [
  [{ staleMinutes: -1 },               'staleMinutes below zero'],
  [{ staleMinutes: 'a while' },        'staleMinutes that are not a number'],
  [{ staleMinutes: NaN },              'staleMinutes that are no number at all'],
  [{ onBadNews: 'tell me' },           'an onBadNews that is no function'],
  [{ onBadNews: { report: () => 1 } }, 'an onBadNews that is an object, not a function'],
] as const

describe("Vault.make, by the Contract", () => {
  for (const [given, blurb] of BadNewOptionCases) {
    it(`validates every option, refusing ${blurb} by throwing 'bad_option', touching nothing (Contract: Vault.make, Does 1)`, () => {
      const world = makeWorld()
      const propsReads = vi.spyOn(world.vaultDB, 'getVaultProps')
      TH.expectSyncRefusal(() => Vault.make(world.optsWith(given as Partial<MakeVaultOpts>)), 'bad_option')
      expect(propsReads).not.toHaveBeenCalled()
    })
  }

  it("takes staleMinutes of zero, fractions and Infinity, and an onBadNews of null as none (Contract: Vault.make, Does 1)", () => {
    const world = makeWorld()
    for (const staleMinutes of [0, 0.5, 30, Infinity]) { expect(Vault.make(world.optsWith({ staleMinutes })).state).to.eq('opening') }
    expect(Vault.make(world.optsWith({ onBadNews: null })).state).to.eq('opening')
  })

  it("returns the instance in state opening, nothing read: no vault, no ways in, no boxes (Contract: Vault.make, Does 2)", () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    expect(vault).to.be.instanceOf(Vault)
    expect(vault.snapshot).to.deep.include({ state: 'opening', vault_id: null, registered_at: null, unlock_epoch: null, vault_key_epoch: null, askPassphraseAt: null, trouble: null, syncing: true })
    expect(vault.wayins).to.have.lengthOf(0)
    expect(vault.boxes).to.have.lengthOf(0)
    expect(vault.capacity.boxes.used).to.eq(0)
  })

  it("touches no storage, no device store, no timer and no prompt until a call asks (Contract: Vault.make, Guarantees)", async () => {
    const world = makeWorld()
    const vaultDBCalls = VaultDBVerbsUsed.map((verb) => vi.spyOn(world.vaultDB, verb))
    const deviceDBCalls = (Object.keys(world.deviceDB) as (keyof typeof world.deviceDB)[]).map((verb) => vi.spyOn(world.deviceDB, verb))
    const derivations = vi.spyOn(TH.testDeriver, 'deriveKeyBytes')
    const strengthTests = vi.fn(TH.anyPassphraseTest)
    vi.useFakeTimers()
    try {
      Vault.make(world.optsWith({ passphraseStrengthTest: strengthTests }))
      expect(vi.getTimerCount()).to.eq(0)
    } finally {
      vi.useRealTimers()
    }
    await TH.wakeupAtNextTick()
    for (const called of [...vaultDBCalls, ...deviceDBCalls, derivations, strengthTests]) { expect(called).not.toHaveBeenCalled() }
    expect(world.logged).to.have.lengthOf(0)
  })

  it("has the first hello read storage, start the storage watch, and settle (Contract: Vault.make, Guarantees)", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    const vault = Vault.make(world.optsWith())
    expect(tally).to.deep.equal({ opened: 0, closed: 0 })
    await vault.hello()
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    expect(vault.state).to.eq('absent')
    await vault.hello({ staleMinutes: 0 })
    expect(tally.opened).to.eq(1)
  })

  it("starts the watch once, and reads once, over a store that rings as it is subscribed to", async () => {
    const world = makeWorld()
    const subscribe = world.dbStore.subscribe.bind(world.dbStore)
    const ringingAtOnce = { ...world.dbStore, subscribe: (listener: () => void) => {
      listener()
      return subscribe(listener)
    } }
    const vaultDB = localVaultDB({ store: ringingAtOnce })
    const tally = TH.tallyWatches(vaultDB)
    const propsReads = vi.spyOn(vaultDB, 'getVaultProps')
    const vault = Vault.make(world.optsWith({ vaultDB }))
    await vault.hello()
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    expect(propsReads).toHaveBeenCalledTimes(1)
    expect(vault.state).to.eq('absent')
  })

  it("has a data call's own first hello read and settle, as the host's would (Contract: Vault.make, Guarantees)", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    const vault = Vault.make(world.optsWith())
    await vault.unlock('pw')
    expect(vault.state).to.eq('unlocked')
    expect(tally.opened).to.eq(1)
  })

  it("closes a handle that never said hello with nothing to undo, its watch never started", () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    Vault.make(world.optsWith()).close()
    expect(tally).to.deep.equal({ opened: 0, closed: 0 })
  })

  it("returns the instance synchronously, no promise (Contract: Vault.make, Returns)", () => {
    const world = makeWorld()
    const made: unknown = Vault.make(world.optsWith())
    expect(made).to.be.instanceOf(Vault)
    expect(made).to.not.be.instanceOf(Promise)
    expect(typeof (made as { then?: unknown }).then).to.eq('undefined')
  })

  it("refuses by throwing, and only misuse, fix-the-code refusals: bad_option among them (Contract: Vault.make, Refuses)", () => {
    const world = makeWorld()
    const refusals = [
      TH.expectSyncRefusal(() => Vault.make(TH.omitting(world.optsWith(), 'deviceDB')), 'bad_option'),
      TH.expectSyncRefusal(() => Vault.make(world.optsWith({ staleMinutes: -1 })), 'bad_option'),
      TH.expectSyncRefusal(() => Vault.make(world.optsWith({ vaultlabel: 'not-a-label' })), 'bad_label'),
    ]
    expect(refusals.map((err) => err.family)).to.deep.equal(['misuse', 'misuse', 'misuse'])
  })

  it("reads half a minute as thirty seconds, and Infinity as forever, as parseStaleMinutes's example shows", () => {
    expect(parseStaleMinutes(0.5, 'Vault.make')).to.eq(30_000)
    expect(parseStaleMinutes(Infinity, 'hello')).to.eq(ForeverMillis)
    expect(parseStaleMinutes(undefined, 'hello')).to.eq(5 * MinuteMillis)
  })

  it("has hello read at most once a minute, as StaleMinutes's example shows", async () => {
    const world = makeWorld()
    const vault = Vault.make({ ...world.optsWith(), staleMinutes: 1 })   // hello() reads at most once a minute
    await vault.hello()
    const propsReads = vi.spyOn(world.vaultDB, 'getVaultProps')
    world.advance(MinuteMillis - 1)
    await vault.hello()
    expect(propsReads).not.toHaveBeenCalled()
    world.advance(1)
    await vault.hello()
    expect(propsReads).toHaveBeenCalledTimes(1)
  })
})
// --

// == [The vault's fields]: fields, snapshot, capacity, the host's writes

describe("the vault's fields, by the Contract", () => {
  it("shows each field as the snapshot holds it, live, in an event handler as in render (Contract: Vault)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    const snapshot = vault.getSnapshot()
    expect(vault.snapshot).to.eq(snapshot)
    for (const [field, shown] of Object.entries(snapshot)) {
      if (field === 'wayins') { continue }
      expect(vault[field as keyof typeof snapshot], field).to.eq(shown)
    }
    expect(vault.wayins.map((wayin) => wayin.summary)).to.deep.equal(snapshot.wayins)
    await vault.lock()
    expect(vault.state).to.eq('locked')
  })

  it("reads the live fields in a handler, as the Vault's second example shows", async () => {
    const world = makeWorld()
    const elsewhere = await world.openUnlocked('pw')
    await elsewhere.lock()
    const vault = await world.open()
    const asked: unknown[] = []
    const askForPassphrase = (wayins: unknown) => { asked.push(wayins) }
    if (vault.state === 'locked') { askForPassphrase(vault.wayins) }
    expect(asked).to.deep.equal([vault.wayins])
  })

  it("lets no host write over a field: each is a getter with no setter, and the snapshot is frozen", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    // Every field the snapshot shows, the scope's among them, and those only the handle has.
    for (const field of [...Object.keys(vault.snapshot), 'snapshot', 'leaseMillis', 'logger', 'clock', 'keyDeriver']) {
      expect(Reflect.set(vault, field, null), field).to.be.false
    }
    expect(vault.state).to.eq('unlocked')
    const { snapshot } = vault
    for (const part of [snapshot, snapshot.boxes, snapshot.boxes[0], snapshot.wayins, snapshot.wayins[0], snapshot.props, snapshot.props?.wayins, snapshot.props?.wayins[0], snapshot.props?.wayins[0]?.vault_key_wayin_wrapped, snapshot.capacity, snapshot.capacity.boxes, snapshot.capacity.bytes]) {
      expect(Object.isFrozen(part)).to.be.true
    }
  })

  it("keeps its own lease length and hello, whatever a host writes over the handle's", async () => {
    const world = makeWorld({ leaseHours: 1 })
    const vault = await world.open()
    const helloWrittenOver = vi.fn(() => Promise.resolve(vault))
    Object.defineProperties(vault, { leaseMillis: { value: 1 }, hello: { value: helloWrittenOver } })
    expect(vault.leaseMillis).to.eq(1)
    await vault.unlock('pw')
    expect(vault.askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    await vault.putBox('anthropic', 'sk-fake')
    expect(helloWrittenOver).not.toHaveBeenCalled()
  })

  it("reckons capacity from the last read: the boxes against maxBoxes, and the bytes they reserve against what storage holds (Contract: Vault)", async () => {
    const world = makeWorld({ maxBoxes: 3 })
    const vault = await world.openUnlocked('pw')
    const before = vault.capacity
    await vault.putBox('anthropic', 'sk-fake')
    await vault.putBox('openai', 'sk-fake-too')
    expect(vault.capacity.boxes).to.deep.equal({ used: 2, max: 3 })
    expect(vault.capacity.bytes.used).to.be.greaterThan(0)
    expect(vault.capacity.bytes.max).to.eq(before.bytes.max)
    expect(before.boxes).to.deep.equal({ used: 0, max: 3 })
  })

  it("warns that the vault is nearly full, as capacity's example shows", async () => {
    const world = makeWorld({ maxBoxes: 3 })
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    await vault.putBox('openai', 'sk-fake-too')
    const warnings: string[] = []
    const warn = (said: string) => { warnings.push(said) }
    const { boxes } = vault.capacity; if (boxes.used >= boxes.max - 1) { warn('Your vault is nearly full.') }
    expect(warnings).to.deep.equal(['Your vault is nearly full.'])
  })
})
// --
