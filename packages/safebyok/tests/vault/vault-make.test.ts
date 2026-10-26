import { describe, it, expect, vi, afterEach, expectTypeOf } from 'vitest'
import { LeaseHours, FarFuture, ForeverMillis, MinuteMillis } from '../../src/types'
import { MaxUserIdChars } from '../../src/checks/primitives'
import { VaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { Bank } from '../../src/bank'
import { Lease } from '../../src/lease'
import { type MakeBankOpts, parseStaleMinutes } from '../../src/vault-opts'
import { fromB64 } from '../../src/crypto'
import type { KeyDeriver, CustomKeyDeriver } from '../../src/key-deriver'
import { type VaultLogger } from '../../src/logger'
import { Argon2idWebV1, MaxSaltBytes, TestDeriverNotice } from '../../src/key-deriver-spec'
import * as TH from '../test-helpers'
import { makeWorld, MisfitStores, VaultDBVerbsUsed, uncheckingDeviceDB, HourMillis, vaultWithPasskey, addLaptopPasskey } from './world'

/** `world`'s options for Bank.make, `overrides` in place: its vault's userId and vaultlabel left out, as each vault's draft takes them. */
const bankOptsOf = (world: ReturnType<typeof makeWorld>, overrides?: Partial<TH.BornVaultOpts>): MakeBankOpts => {
  const { userId: _userId, vaultlabel: _vaultlabel, ...bankOpts } = world.optsWith(overrides)
  return bankOpts
}

// == [Making a vault]: Bank.make, bank.ensureVault, options

describe("Bank.make and bank.ensureVault", () => {
  it("births a vault 'novel' against an empty backend, prompting nobody", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('novel')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("refuses a hyphenated applabel or vaultlabel at the door", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ applabel: 'not-a-label' }), 'bad_scope')
    await TH.expectRefusal(world.open({ vaultlabel: 'not-a-label' }), 'bad_scope')
  })

  it("refuses to open without a signed-in user", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ userId: '' }), 'bad_scope')
  })

  it("takes a userId of a hundred characters, and refuses a longer one, naming the bound and never the id", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ userId: 'u'.repeat(MaxUserIdChars) })).to.eq('novel')
    const overlong = `alice@example.com${'u'.repeat(MaxUserIdChars)}`
    const err = await TH.expectRefusal(world.open({ userId: overlong }), 'bad_scope')
    expect(err.message).to.include('at most 100 characters')
    expect(TH.thrownText(err)).to.not.include('alice')
  })

  it("refuses a userId that is not text, as no signed-in user", async () => {
    const world = makeWorld()
    for (const userId of [42, null, undefined, { id: 'u1' }]) {
      await TH.expectRefusal(world.open({ userId: userId as unknown as string }), 'bad_scope')
    }
  })

  it("refuses a call with no bag of options at all", () => {
    for (const opts of [undefined, null, 'acme']) {
      TH.expectSyncRefusal(() => Bank.make(opts as unknown as MakeBankOpts), 'bad_option')
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
    const err = await TH.expectRefusal(world.open({ vaultDB: lookalike as unknown as MakeBankOpts['vaultDB'] }), 'bad_option')
    expect(err.message).to.include('extends the VaultDB class')
  })

  it("hands on storage's damaged_vault as it came, even from a VaultDB that throws before its promise", async () => {
    const world = makeWorld()
    const damaged = new VaultError('damaged_vault', "This vault's stored props did not read back.")
    vi.spyOn(world.vaultDB, 'ensureVault').mockImplementationOnce(() => { throw damaged })
    const err = await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(err).to.eq(damaged)
    vi.restoreAllMocks()
  })

  it("hands on an adapter's corrupt_record as it came, never as damage: that kind is an adapter's wrong answer", async () => {
    const world = makeWorld()
    const wrongAnswer = new VaultError('corrupt_record', 'Storage answered a vault read in a shape this package does not know.')
    vi.spyOn(world.vaultDB, 'ensureVault').mockResolvedValueOnce(TH.bad(wrongAnswer))
    const err = await TH.expectRefusal(world.open(), 'corrupt_record')
    expect(err).to.eq(wrongAnswer)
    vi.restoreAllMocks()
  })

  it("hands on subscribe and getSnapshot alone, bound to their vault, as the class's first example shows", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const { subscribe, getSnapshot } = vault
    const heard = vi.fn()
    const unsubscribe = subscribe(heard)
    await vault.hello()
    await TH.unlock(vault, 'correct horse')
    await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test')
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test')
    expect(await vault.useWhisper('anthropic_api_key', (whisper) => typeof whisper)).to.eq('string')
    await vault.delBox('anthropic_api_key')
    await TH.putWayin(vault, 'correct horse', 'battery staple')
    await TH.putWayin(vault, 'battery staple', await TH.passkeyOf('laptop'))
    await TH.delWayin(vault, 'battery staple')
    await vault.lock()
    expect(getSnapshot().state).to.eq('locked')
    await TH.del(vault, 'battery staple')
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    expect(getSnapshot().state).to.eq('locked')
    expect(heard).toHaveBeenCalled()
    unsubscribe()
  })

  it("takes a store of the host's own that carries every verb, prototype and all", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: Object.create(world.vaultDB) as MakeBankOpts['vaultDB'], deviceDB: uncheckingDeviceDB().deviceDB })).to.eq('novel')
  })
})

describe("Bank.make's options", () => {
  it("throws misuse at once, never as a rejection: a bad label, a missing store", () => {
    const world = makeWorld()
    TH.expectSyncRefusal(() => Bank.make(bankOptsOf(world, { applabel: 'not-a-label' })), 'bad_scope')
    TH.expectSyncRefusal(() => Bank.make(TH.omitting(bankOptsOf(world), 'vaultDB')), 'bad_option')
  })

  it("refuses an option it does not take as 'bad_option', naming it, before storage is touched", () => {
    const world = makeWorld()
    const reads = [vi.spyOn(world.vaultDB, 'getVault'), vi.spyOn(world.vaultDB, 'ensureVault')]
    const err = TH.expectSyncRefusal(() => Bank.make({ ...bankOptsOf(world), leaseHour: 1 } as MakeBankOpts), 'bad_option')
    expect(err.message).to.match(/does not take the option leaseHour: check the spelling/)
    expect(err.message).to.include('leaseHours')
    for (const read of reads) { expect(read).not.toHaveBeenCalled() }
  })

  it("refuses forcePassphraseReentryHours, naming leaseHours", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Bank.make({ ...bankOptsOf(world), forcePassphraseReentryHours: 1 } as MakeBankOpts), 'bad_option')
    expect(err.message).to.include('forcePassphraseReentryHours (called leaseHours now)')
  })

  it("names every option it refuses, and never quotes a value", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Bank.make({ ...bankOptsOf(world), note: 'FAKESECRET', colour: 'FAKESECRET' } as MakeBankOpts), 'bad_option')
    expect(err.message).to.match(/the options note, colour:/)
    expect(TH.thrownText(err)).to.not.include('FAKESECRET')
  })

  it("takes an option given as undefined as one left out", async () => {
    const world = makeWorld()
    const vault = await world.open({ leaseHours: undefined, clock: undefined, logger: undefined })
    expect(vault.leaseMillis).to.eq(LeaseHours * HourMillis)
  })
})
// --

// == [Host environment]: secure context, host's clock, OutOfBoundsReadings

describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses Bank.make over plain http with kind 'insecure_context', before it touches storage", () => {
    vi.stubGlobal('isSecureContext', false)
    const world = makeWorld()
    const reads = [vi.spyOn(world.vaultDB, 'getVault'), vi.spyOn(world.vaultDB, 'ensureVault')]
    const err = TH.expectSyncRefusal(() => Bank.make(bankOptsOf(world)), 'insecure_context')
    expect(err.message).to.match(/https/)
    for (const read of reads) { expect(read).not.toHaveBeenCalled() }
  })

  it("refuses first of all, even a bag of options that is no bag", () => {
    vi.stubGlobal('isSecureContext', false)
    TH.expectSyncRefusal(() => Bank.make(null as unknown as MakeBankOpts), 'insecure_context')
  })

  it("opens in a secure context, and in a runtime with no notion of one (Node)", async () => {
    expect((globalThis as { isSecureContext?: unknown }).isSecureContext).to.be.undefined
    expect(await makeWorld().stateOnOpen()).to.eq('novel')
    vi.stubGlobal('isSecureContext', true)
    expect(await makeWorld().stateOnOpen()).to.eq('novel')
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
    it(`refuses a clock reading ${blurb} at Bank.make, before reading storage`, async () => {
      const world = makeWorld()
      const reads = [vi.spyOn(world.vaultDB, 'getVault'), vi.spyOn(world.vaultDB, 'ensureVault')]
      const err = await TH.expectRefusal(world.open({ clock: { now: () => reading as number } }), 'bad_option')
      expect(err.message).to.match(/epoch milliseconds/)
      for (const read of reads) { expect(read).not.toHaveBeenCalled() }
    })
  }

  it("refuses a clock that is not a Clock", async () => {
    const world = makeWorld()
    for (const nonsense of [{}, { now: 1_792_022_400_000 }, () => 1_792_022_400_000, 'now', null]) {
      await TH.expectRefusal(world.open({ clock: nonsense as unknown as MakeBankOpts['clock'] }), 'bad_option')
    }
  })

  it("takes a reading with a fraction of a millisecond, in bounds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.5 } })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("reads now() off the clock, rounded down to whole milliseconds, the time the lease is judged by, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.5 } })
    expect(vault.now()).to.eq(world.clock.now())
    const box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    world.advance(MinuteMillis)
    expect(vault.now() - box.written_at).to.eq(MinuteMillis)
    const lease = Lease.make(vault, await world.getLease())
    expect(lease.endsBy(vault.now())).to.be.false
    world.advance(vault.leaseMillis)
    expect(lease.endsBy(vault.now())).to.be.true
  })

  it("checks the clock once, at Bank.make: a later reading in seconds is taken as it comes, and checked by nothing", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading /= 1000
    await vault.hello({ staleMinutes: 0 })
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.ensureUnlocked()).to.eq(vault)
  })

  it("lets a clock that throws after the open fail the call that reads it, as the clock's own error", async () => {
    const world = makeWorld()
    let broken = false
    const thrown = new Error('no time today')
    const vault = await world.openUnlocked('pw', { clock: { now: () => { if (broken) { throw thrown } return world.clock.now() } } })
    broken = true
    const err = await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
  })

  it("refuses a clock whose now() throws, at Bank.make, keeping its error as the cause and quoting none of it", async () => {
    const world = makeWorld()
    const thrown = new Error('clock broke near sk-ant-SUPERSECRET')
    const err = await TH.expectRefusal(world.open({ clock: { now: () => { throw thrown } } }), 'bad_option')
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.not.include('SUPERSECRET')
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
    await TH.expectRefusal(TH.unlock(alien, 'pw'), 'unknown_key_deriver')
  })

  it("asks for a keyDeriver outright: there is no default to fall back on", () => {
    expectTypeOf<Pick<MakeBankOpts, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
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
      const stored = await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))
      expect(fromB64(stored?.passphrase?.salt_b64 ?? '')).to.have.lengthOf(saltBytes)
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
    const stored = await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))
    expect(stored?.passphrase?.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("refuses a deriver that hands back anything but 32 key bytes, and sets no passphrase with it", async () => {
    const Outputs = [new Uint8Array(16), new Uint8Array(24), new Uint8Array(64), new Uint8Array(0), 'thirty-two bytes, honest'] as const
    for (const output of Outputs) {
      const world = makeWorld()
      const shortDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(output as Uint8Array) }
      const vault = await world.open({ keyDeriver: shortDeriver })
      await TH.expectRefusal(TH.unlock(vault, 'pw'), 'bad_option')
      expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.deep.include({ gate_epoch: 0, passphrase: null })
      expect(vault.getSnapshot().state).to.eq('novel')
    }
  })

  it("refuses a deriver that hands back 32 zero bytes, a key anyone could rebuild, and sets no passphrase with it", async () => {
    const Zeros = [new Uint8Array(32), new Uint32Array(8), new Uint8Array(new ArrayBuffer(40), 8, 32)] as const
    for (const output of Zeros) {
      const world = makeWorld()
      const zeroDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(output as Uint8Array) }
      const vault = await world.open({ keyDeriver: zeroDeriver })
      const err = await TH.expectRefusal(TH.unlock(vault, 'pw'), 'bad_option')
      expect(err.message).to.match(/zero bytes/)
      expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.deep.include({ gate_epoch: 0, passphrase: null })
    }
  })

  it("refuses zero bytes at unlock too: a deriver that kept its output cannot open a vault", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const zeroDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) }
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: zeroDeriver })
    await TH.expectRefusal(TH.unlock(fresh, 'pw'), 'bad_option')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("refuses unexpected_error for a deriver that throws, a VaultError of misuse or bad news included, keeping nothing of what it threw, nor telling it as bad news, as it heard the passphrase", async () => {
    for (const thrown of [new Error('could not derive pw-the-passphrase'), new VaultError('bad_option', 'pw-the-passphrase is too short to derive from.'), new VaultError('damaged_vault', 'pw-the-passphrase broke the deriver.')]) {
      const world = makeWorld()
      const throwing = { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) }
      const told: unknown[] = []
      const vault = await world.open({ keyDeriver: throwing, onBadNews: (news) => { told.push(news) } })
      const err = await TH.expectRefusal(TH.unlock(vault, 'pw-the-passphrase'), 'unexpected_error')
      expect(err.cause).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('pw-the-passphrase')
      expect(TH.loggedText(world.logged)).to.not.include('pw-the-passphrase')
      expect(vault.getSnapshot().state).to.eq('novel')
      expect(told).to.have.lengthOf(0)
      expect(vault.getSnapshot().trouble).to.be.null
    }
  })

  it("keeps the kind of a condition a deriver raises, for the caller to show or retry, but none of its words", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const unreachable = new VaultError('storage_unavailable', "The key deriver's module could not be loaded: try again shortly.")
    const refusing = { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(unreachable) }
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: refusing })
    const err = await TH.expectRefusal(TH.unlock(fresh, 'pw'), 'storage_unavailable')
    expect(err).to.not.eq(unreachable)
    expect(err.message).to.not.include('module')
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
        expect(await TH.propsOf(world.vaultDB, TH.scopeOf('u1'))).to.be.null
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

    it("warns each time a bank is made, quoting no passphrase", async () => {
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

// == [Bank.make, by the Contract]: Does, Guarantees, Returns, Refuses; the new options

const BadNewOptionCases = [
  [{ staleMinutes: -1 },               'staleMinutes below zero'],
  [{ staleMinutes: 'a while' },        'staleMinutes that are not a number'],
  [{ staleMinutes: NaN },              'staleMinutes that are no number at all'],
  [{ onBadNews: 'tell me' },           'an onBadNews that is no function'],
  [{ onBadNews: { report: () => 1 } }, 'an onBadNews that is an object, not a function'],
] as const

describe("Bank.make, by the Contract", () => {
  for (const [given, blurb] of BadNewOptionCases) {
    it(`validates every option, refusing ${blurb} by throwing 'bad_option', touching nothing (Contract: Bank.make, Does 1)`, () => {
      const world = makeWorld()
      const reads = [vi.spyOn(world.vaultDB, 'getVault'), vi.spyOn(world.vaultDB, 'ensureVault')]
      TH.expectSyncRefusal(() => Bank.make(bankOptsOf(world, given as Partial<MakeBankOpts>)), 'bad_option')
      for (const read of reads) { expect(read).not.toHaveBeenCalled() }
    })
  }

  it("takes staleMinutes of zero, fractions and Infinity, and an onBadNews of null as none (Contract: Bank.make, Does 1)", () => {
    const world = makeWorld()
    for (const staleMinutes of [0, 0.5, 30, Infinity]) { expect(Bank.make(bankOptsOf(world, { staleMinutes })).status).to.eq('made') }
    expect(Bank.make(bankOptsOf(world, { onBadNews: null })).status).to.eq('made')
  })

  it("touches no storage, no device store, no timer and no prompt until a call asks (Contract: Bank.make, Guarantees)", async () => {
    const world = makeWorld()
    const vaultDBCalls = VaultDBVerbsUsed.map((verb) => vi.spyOn(world.vaultDB, verb))
    const deviceDBCalls = (Object.keys(world.deviceDB) as (keyof typeof world.deviceDB)[]).map((verb) => vi.spyOn(world.deviceDB, verb))
    const derivations = vi.spyOn(TH.testDeriver, 'deriveKeyBytes')
    const strengthTests = Object.assign(vi.fn(TH.anyStrengthChecker), { load: vi.fn() })
    vi.useFakeTimers()
    try {
      Bank.make(bankOptsOf(world, { strengthChecker: strengthTests }))
      expect(vi.getTimerCount()).to.eq(0)
    } finally {
      vi.useRealTimers()
    }
    await TH.wakeupAtNextTick()
    for (const called of [...vaultDBCalls, ...deviceDBCalls, derivations, strengthTests, strengthTests.load]) { expect(called).not.toHaveBeenCalled() }
    expect(world.logged).to.have.lengthOf(0)
  })

  it("has the birth read storage once, start the storage watch, and settle (Contract: bank.ensureVault, Guarantees)", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    const bank = Bank.make(bankOptsOf(world))
    expect(tally).to.deep.equal({ opened: 0, closed: 0 })
    const vault = await bank.ensureVault({ userId: 'u1', vaultlabel: 'main' })
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    expect(vault.state).to.eq('novel')
    await vault.hello({ staleMinutes: 0 })
    expect(tally.opened).to.eq(1)
  })

  it("starts the watch once over a store that rings as it is subscribed to, reading what the ring asks for once", async () => {
    const world = makeWorld()
    const subscribe = world.dbStore.subscribe.bind(world.dbStore)
    const ringingAtOnce = { ...world.dbStore, subscribe: (listener: () => void) => {
      listener()
      return subscribe(listener)
    } }
    const vaultDB = localVaultDB({ store: ringingAtOnce })
    const tally = TH.tallyWatches(vaultDB)
    const births = vi.spyOn(vaultDB, 'ensureVault')
    const propsReads = vi.spyOn(vaultDB, 'getVault')
    const vault = await world.open({ vaultDB })
    await TH.aWhile()
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    expect(births).toHaveBeenCalledTimes(1)
    expect(propsReads).toHaveBeenCalledTimes(1)
    expect(vault.state).to.eq('novel')
  })

  it("ends the watch it started when the bank lets the vault go, and only once", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    const vault = await world.open()
    TH.closeVault(vault)
    TH.closeVault(vault)
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("returns the bank synchronously, no promise (Contract: Bank.make, Returns)", () => {
    const world = makeWorld()
    const made: unknown = Bank.make(bankOptsOf(world))
    expect(made).to.be.instanceOf(Bank)
    expect(made).to.not.be.instanceOf(Promise)
    expect(typeof (made as { then?: unknown }).then).to.eq('undefined')
  })

  it("refuses by throwing, and only misuse, fix-the-code refusals: bad_option among them (Contract: Bank.make, Refuses)", () => {
    const world = makeWorld()
    const refusals = [
      TH.expectSyncRefusal(() => Bank.make(TH.omitting(bankOptsOf(world), 'deviceDB')), 'bad_option'),
      TH.expectSyncRefusal(() => Bank.make(bankOptsOf(world, { staleMinutes: -1 })), 'bad_option'),
      TH.expectSyncRefusal(() => Bank.make(bankOptsOf(world, { applabel: 'not-a-label' })), 'bad_scope'),
    ]
    expect(refusals.map((err) => err.family)).to.deep.equal(['misuse', 'misuse', 'misuse'])
  })

  it("reads half a minute as thirty seconds, and Infinity as forever, as parseStaleMinutes's example shows", () => {
    expect(parseStaleMinutes(0.5, 'Bank.make')).to.eq(30_000)
    expect(parseStaleMinutes(Infinity, 'hello')).to.eq(ForeverMillis)
    expect(parseStaleMinutes(undefined, 'hello')).to.eq(5 * MinuteMillis)
  })

  it("has hello read at most once a minute, as StaleMinutes's example shows", async () => {
    const world = makeWorld()
    const bank = Bank.make({ ...bankOptsOf(world), staleMinutes: 1 })   // hello() reads at most once a minute
    const vault = await bank.ensureVault({ userId: 'u1', vaultlabel: 'main' })
    const propsReads = vi.spyOn(world.vaultDB, 'getVault')
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
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const snapshot = vault.getSnapshot()
    expect(vault.snapshot).to.eq(snapshot)
    for (const [field, shown] of Object.entries(snapshot)) {
      expect(vault[field as keyof typeof snapshot], field).to.eq(shown)
    }
    await vault.lock()
    expect(vault.state).to.eq('locked')
  })

  it("reads the live fields in a handler, as the Vault's second example shows", async () => {
    const { world, vault: elsewhere } = await vaultWithPasskey()
    await elsewhere.lock()
    const vault = await world.open()
    const asked: unknown[] = []
    const askForProof = (passkey: unknown) => { asked.push(passkey) }
    if (vault.state === 'locked') { askForProof(vault.passkey) }
    expect(vault.passkey).to.not.be.null
    expect(asked).to.deep.equal([vault.passkey])
  })

  it("lets no host write over a field: each is a getter with no setter, and the snapshot is frozen", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await addLaptopPasskey(vault)
    // Every field the snapshot shows, the scope's among them, and those only the handle has.
    for (const field of [...Object.keys(vault.snapshot), 'snapshot', 'leaseMillis', 'logger', 'keyDeriver']) {
      expect(Reflect.set(vault, field, null), field).to.be.false
    }
    expect(vault.state).to.eq('unlocked')
    const { snapshot } = vault
    for (const part of [snapshot, snapshot.boxes, snapshot.boxes[0], snapshot.passphrase, snapshot.passkey, snapshot.capacity, snapshot.capacity.boxes, snapshot.capacity.bytes]) {
      expect(Object.isFrozen(part)).to.be.true
    }
  })

  it("keeps its own hello, whatever a host writes over the handle's", async () => {
    const world = makeWorld({ leaseHours: 1 })
    const vault = await world.open()
    const helloWrittenOver = vi.fn(() => Promise.resolve(vault))
    Object.defineProperties(vault, { hello: { value: helloWrittenOver } })
    await TH.unlock(vault, 'pw')
    expect(vault.askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(helloWrittenOver).not.toHaveBeenCalled()
  })

  it("reckons capacity from the last read: the boxes against maxBoxes, and the bytes they reserve against what storage holds (Contract: Vault)", async () => {
    const world = makeWorld({ maxBoxes: 3 })
    const vault = await world.openUnlocked('pw')
    const before = vault.capacity
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.putBox({ boxlabel: 'openai' }, 'sk-fake-too')
    expect(vault.capacity.boxes).to.deep.equal({ used: 2, max: 3 })
    expect(vault.capacity.bytes.used).to.be.greaterThan(0)
    expect(vault.capacity.bytes.max).to.eq(before.bytes.max)
    expect(before.boxes).to.deep.equal({ used: 0, max: 3 })
  })

  it("warns that the vault is nearly full, as capacity's example shows", async () => {
    const world = makeWorld({ maxBoxes: 3 })
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.putBox({ boxlabel: 'openai' }, 'sk-fake-too')
    const warnings: string[] = []
    const warn = (said: string) => { warnings.push(said) }
    const { boxes } = vault.capacity; if (boxes.used >= boxes.max - 1) { warn('Your vault is nearly full.') }
    expect(warnings).to.deep.equal(['Your vault is nearly full.'])
  })
})
// --
