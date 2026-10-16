import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { localVaultDB, memoryStore, openVault, type StringStore } from '../src/index'
import { Ciphered, fromB64, toB64 } from '../src/crypto'
import { VaultError } from '../src/errors'
import { Lockbox, PasskeySaltBytes, VaultBundle, VaultScope, type DeviceMark, type DeviceUnlock } from '../src/types'
import * as Ckeys from '../src/ckeys'
import { VaultDB, type BundleExpectation, type EraseExpectation, type LockboxExpectation, type StoredLockbox } from '../src/vault-db'
import * as TH from './test-helpers'

const TweakCases = [
  // regular usage:
  ["Zm9v",  "am9v",  'swaps the first character for an a'],
  ["am9v",  "bm9v",  'swaps an a for a b, so the text still differs'],
  // edge cases:
  ["QQ",    "aQ",    'bends the shortest text that decodes, one byte'],
] as const

describe("tweakB64", () => {
  for (const [b64, expected, blurb] of TweakCases) {
    it(blurb, () => {
      expect(TH.tweakB64(b64)).to.eq(expected)
    })
  }

  it("never returns what it was given", () => {
    for (const first of 'AaBbZz09-_') {
      expect(TH.tweakB64(`${first}m9v`)).to.not.eq(`${first}m9v`)
    }
  })

  it("keeps the text decodable, to bytes of the same length", () => {
    for (const b64 of ['Zm9v', 'am9v', 'QQ', toB64(new Uint8Array(32).fill(255))]) {
      expect(fromB64(TH.tweakB64(b64))).to.have.lengthOf(fromB64(b64).length)
    }
  })

  it("throws on blank text, which has nothing to bend", () => {
    expect(() => TH.tweakB64('')).to.throw(TypeError, /blank text/)
  })
})

describe("wakeupAtNextTick", () => {
  it("lets a promise already settled, and a timer already due, run first", async () => {
    const heard: string[] = []
    queueMicrotask(() => { heard.push('microtask') })
    setTimeout(() => { heard.push('timer') }, 0)
    await TH.wakeupAtNextTick()
    heard.push('woke')
    expect(heard).to.deep.equal(['microtask', 'timer', 'woke'])
  })
})

describe("makeGate", () => {
  it("holds a pass until released, and says when something reached it", async () => {
    const gate = TH.makeGate()
    const heard: string[] = []
    const passing = (async () => {
      await gate.pass()
      heard.push('passed')
    })()
    await gate.reached
    heard.push('reached')
    await TH.wakeupAtNextTick()
    expect(heard).to.deep.equal(['reached'])
    gate.release()
    await passing
    expect(heard).to.deep.equal(['reached', 'passed'])
  })

  it("stays open once released: a later pass goes straight through", async () => {
    const gate = TH.makeGate()
    gate.release()
    let passes = 0
    await gate.pass()
    passes += 1
    await gate.pass()
    passes += 1
    await gate.reached
    expect(passes).to.eq(2)
  })
})

describe("beforeNextCall", () => {
  it("runs its errand inside the next call only, before the call goes on", async () => {
    const heard: string[] = []
    const target = { fetchRow: (ckey: string) => { heard.push(`fetched ${ckey}`); return Promise.resolve(ckey.length) } }
    TH.beforeNextCall(target, 'fetchRow', () => { heard.push('errand'); return Promise.resolve() })
    expect(await target.fetchRow('one')).to.eq(3)
    expect(await target.fetchRow('three')).to.eq(5)
    expect(heard).to.deep.equal(['errand', 'fetched one', 'fetched three'])
  })

  it("slips another device's write in between a look at storage and the write", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.createBundle(TH.bundleOf('u1'))
    TH.beforeNextCall(vaultDB, 'updateBox', async () => {
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'theirs'), TH.noBoxYet)
    })
    await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'mine'), TH.noBoxYet), 'stale_write')
    const kept = await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')
    expect(kept?.revision_id).to.eq('rev-theirs')
  })
})

describe("beforeNextCall on a method already spied on", () => {
  it("records each call once, the intercepted one included", async () => {
    const heard: string[] = []
    const target = { fetchRow: (ckey: string) => { heard.push(`fetched ${ckey}`); return Promise.resolve(ckey.length) } }
    const spy = vi.spyOn(target, 'fetchRow')
    TH.beforeNextCall(target, 'fetchRow', () => { heard.push('errand'); return Promise.resolve() })
    expect(await target.fetchRow('one')).to.eq(3)
    expect(await target.fetchRow('three')).to.eq(5)
    expect(spy).to.have.callCount(2)
    expect(heard).to.deep.equal(['errand', 'fetched one', 'fetched three'])
  })

  it("goes on through a vi.fn's implementation, for the next call only", async () => {
    const target = { fetchRow: vi.fn((ckey: string) => Promise.resolve(ckey.length)) }
    const heard: string[] = []
    TH.beforeNextCall(target, 'fetchRow', () => { heard.push('errand'); return Promise.resolve() })
    expect(await target.fetchRow('one')).to.eq(3)
    expect(await target.fetchRow('three')).to.eq(5)
    expect(target.fetchRow).to.have.callCount(2)
    expect(heard).to.deep.equal(['errand'])
  })

  it("can be armed again once its call has gone through", async () => {
    const target = { fetchRow: (ckey: string) => Promise.resolve(ckey.length) }
    const spy = vi.spyOn(target, 'fetchRow')
    const heard: string[] = []
    TH.beforeNextCall(target, 'fetchRow', () => { heard.push('first'); return Promise.resolve() })
    await target.fetchRow('one')
    TH.beforeNextCall(target, 'fetchRow', () => { heard.push('second'); return Promise.resolve() })
    await target.fetchRow('one')
    expect(heard).to.deep.equal(['first', 'second'])
    expect(spy).to.have.callCount(2)
  })
})

describe("beforeNextCall armed more than once", () => {
  const Targets = [
    ["a plain method",            () => ({ fetchRow: (ckey: string) => Promise.resolve(ckey.length) })],
    ["a method already spied on", () => { const target = { fetchRow: (ckey: string) => Promise.resolve(ckey.length) }; vi.spyOn(target, 'fetchRow'); return target }],
  ] as const

  for (const [blurb, makeTarget] of Targets) {
    it(`runs one errand per call, in the order armed, on ${blurb}`, async () => {
      const target = makeTarget()
      const heard: string[] = []
      TH.beforeNextCall(target, 'fetchRow', () => { heard.push('first errand'); return Promise.resolve() })
      TH.beforeNextCall(target, 'fetchRow', () => { heard.push('second errand'); return Promise.resolve() })
      await target.fetchRow('a')
      expect(heard).to.deep.equal(['first errand'])
      await target.fetchRow('bb')
      expect(heard).to.deep.equal(['first errand', 'second errand'])
      await target.fetchRow('ccc')
      expect(heard).to.have.lengthOf(2)
    })
  }

  it("holds two calls at their own gates, one per call", async () => {
    const target = { fetchRow: (ckey: string) => Promise.resolve(ckey) }
    const firstGate = TH.holdNextCall(target, 'fetchRow')
    const secondGate = TH.holdNextCall(target, 'fetchRow')
    const first = target.fetchRow('one')
    await firstGate.reached
    const second = target.fetchRow('two')
    await secondGate.reached
    firstGate.release()
    secondGate.release()
    expect(await Promise.all([first, second])).to.deep.equal(['one', 'two'])
    expect(await target.fetchRow('three')).to.eq('three')
  })
})

describe("holdNextCall", () => {
  it("holds the next call at a gate until released; a later call goes straight through", async () => {
    const heard: string[] = []
    const target = { fetchRow: (ckey: string) => { heard.push(ckey); return Promise.resolve(ckey) } }
    const gate = TH.holdNextCall(target, 'fetchRow')
    const held = target.fetchRow('held')
    await gate.reached
    expect(await target.fetchRow('later')).to.eq('later')
    expect(heard).to.deep.equal(['later'])
    gate.release()
    expect(await held).to.eq('held')
    expect(heard).to.deep.equal(['later', 'held'])
  })

  it("lands a lock in the middle of an unlock, as its @example has it", async () => {
    const opts = TH.memoryVaultOpts()
    const vault = await openVault(opts)
    const gate = TH.holdNextCall(opts.vaultDB, 'readBundle')
    const unlocking = TH.expectRefusal(vault.unlock('pw'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.not.eq('unlocked')
  })
})

describe("tallyWatches", () => {
  it("counts the watches opened and closed, each still reaching the adapter", async () => {
    const vaultDB = localVaultDB(memoryStore())
    const tally = TH.tallyWatches(vaultDB)
    const vault = await openVault(TH.memoryVaultOpts({ vaultDB }))
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    vault.close()
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("counts a watch closed once, so a double close cannot hide another watch's leak", () => {
    const vaultDB = localVaultDB(memoryStore())
    const tally = TH.tallyWatches(vaultDB)
    const first = vaultDB.subscribe(TH.scopeOf('u1'), () => undefined)
    vaultDB.subscribe(TH.scopeOf('u1'), () => undefined)
    first()
    first()
    expect(tally).to.deep.equal({ opened: 2, closed: 1 })
  })

  it("shows no leak after a refused open, as its @example has it", async () => {
    const vaultDB = localVaultDB(memoryStore())
    vi.spyOn(vaultDB, 'readBundle').mockRejectedValue(new VaultError('not_permitted', "That vault belongs to someone else."))
    const tally = TH.tallyWatches(vaultDB)
    await TH.expectRefusal(openVault(TH.memoryVaultOpts({ vaultDB })), 'not_permitted')
    expect(tally.opened).to.eq(1)
    expect(tally.opened - tally.closed).to.eq(0)
  })
})

/**
 * A device for the race driver's own tests: each move makes `roundTrips` round trips through the
 * turnstile and logs, by its tag, when each begins and when the move ends.
 */
const loggingDevice = (turnstile: TH.Turnstile, log: string[], roundTrips: number) => async (tag: string) => {
  for (let ii = 1; ii <= roundTrips; ii += 1) {
    await turnstile.pass()
    log.push(`${tag}${String(ii)}`)
    await TH.wakeupAtNextTick()
  }
  log.push(`${tag} done`)
  return tag
}

/** A device that is nothing: for a race whose moves need none. */
const noDevice = () => undefined

describe("throughTurnstile", () => {
  it("passes the turnstile before each listed method, leaving the rest as they were and `this` as the target", async () => {
    const heard: string[] = []
    const turnstile = { pass: () => { heard.push('passed'); return Promise.resolve() } }
    class Client {
      readonly label = 'pool'
      query(text: string) { heard.push(`query ${text} on ${this.label}`); return Promise.resolve(text.length) }
      end() { heard.push(`end ${this.label}`) }
    }
    const client = TH.throughTurnstile(turnstile, new Client(), ['query'])
    expect(await client.query('SELECT 1')).to.eq(8)
    client.end()
    expect(client.label).to.eq('pool')
    expect(heard).to.deep.equal(['passed', 'query SELECT 1 on pool', 'end pool'])
  })
})

describe("raceEveryWay", () => {
  it("runs two moves together, a few turns apart each way round, and held before each of their round trips each way round", async () => {
    const titles = await TH.raceEveryWay({
      makeDevices: (turnstile) => () => loggingDevice(turnstile, [], 2),
      moves:       [(move) => move('one'), (move) => move('two')],
      verdict:     (outcomes) => { expect(outcomes).to.deep.equal([{ kind: 'landed', val: 'one' }, { kind: 'landed', val: 'two' }]) },
    })
    expect(titles).to.deep.equal([
      'made together',
      'two started 1 microtasks after one', 'two started 2 microtasks after one', 'two started 3 microtasks after one',
      'two started 1 ticks after one', 'two started 2 ticks after one',
      'one held before its round trip 1 while two moved', 'one held before its round trip 2 while two moved', 'one held before its round trip 3 while two moved',
      'one started 1 microtasks after two', 'one started 2 microtasks after two', 'one started 3 microtasks after two',
      'one started 1 ticks after two', 'one started 2 ticks after two',
      'two held before its round trip 1 while one moved', 'two held before its round trip 2 while one moved', 'two held before its round trip 3 while one moved',
    ])
  })

  it("fails a move that never finishes under the schedule it hung in, not at the test's own timeout", async () => {
    const hung = TH.raceEveryWay({
      makeDevices: (turnstile) => () => loggingDevice(turnstile, [], 2),
      moves:       [(move) => move('one'), () => new Promise<never>(() => undefined)],
      verdict:     () => undefined,
    })
    await expect(hung).rejects.toThrow(/^Under the schedule "made together": the moves did not finish within 10000 ms/)
  }, 20_000)

  it("holds a move just before its round trip while the other moves to its end, then lets it go", async () => {
    const logs: string[][] = []
    await TH.raceEveryWay({
      makeDevices: (turnstile) => {
        const log: string[] = []
        logs.push(log)
        return () => loggingDevice(turnstile, log, 2)
      },
      moves:   [(move) => move('a'), (move) => move('b')],
      verdict: () => undefined,
    })
    // The runs that held "a" before its round trips 1, 2 and (making only two) 3, after the six that hold nothing.
    expect(logs.slice(6, 9)).to.deep.equal([
      ['b1', 'b2', 'b done', 'a1', 'a2', 'a done'],
      ['a1', 'b1', 'b2', 'b done', 'a2', 'a done'],
      ['a1', 'a2', 'a done', 'b1', 'b2', 'b done'],
    ])
  })

  it("holds each of three or more moves midway in turn, then lets all go together", async () => {
    const logs: string[][] = []
    const titles = await TH.raceEveryWay({
      makeDevices: (turnstile) => {
        const log: string[] = []
        logs.push(log)
        return () => loggingDevice(turnstile, log, 2)
      },
      moves:   [(move) => move('a'), (move) => move('b'), (move) => move('c')],
      verdict: () => undefined,
    })
    expect(titles).to.deep.equal([
      'made together',
      'each held before its round trip 1 in turn, then all let go', 'each held before its round trip 2 in turn, then all let go', 'each held before its round trip 3 in turn, then all let go',
    ])
    // Held before round trip 2, every move has made its first before any makes its second.
    expect(logs[2]?.slice(0, 3)).to.deep.equal(['a1', 'b1', 'c1'])
  })

  it("makes fresh devices for every schedule, the setup first, through the first device", async () => {
    const made: string[] = []
    await TH.raceEveryWay({
      makeDevices: () => {
        made.push('backend')
        return () => ({ note: (word: string) => { made.push(word); return Promise.resolve() } })
      },
      setup:   (first) => first.note('setup'),
      moves:   [(device) => device.note('one'), (device) => device.note('two')],
      verdict: () => undefined,
    })
    expect(made.slice(0, 4)).to.deep.equal(['backend', 'setup', 'one', 'two'])
    // No round trips pass the turnstile, so each hold runs once, the moves one after the other.
    expect(made.filter((word) => word === 'backend')).to.have.lengthOf(13)
  })

  it("names the schedule under which a verdict failed", async () => {
    const race = TH.raceEveryWay({
      makeDevices: (turnstile) => () => loggingDevice(turnstile, [], 1),
      moves:       [(move) => move('one'), (move) => move('two')],
      verdict:     (outcomes) => { expect(outcomes.map((outcome) => outcome.kind)).to.include('stale_write') },
    })
    await expect(race).rejects.toThrow(/^Under the schedule "made together": expected \[ 'landed', 'landed' \] to include 'stale_write'/)
  })

  it("tells a move's refusal by its kind, and anything else thrown as unknown", async () => {
    await TH.raceEveryWay({
      makeDevices: () => noDevice,
      moves:       [() => Promise.reject(new VaultError('stale_write', 'stale')), () => Promise.reject(new Error('nope'))],
      verdict:     (outcomes) => { expect(outcomes.map((outcome) => outcome.kind)).to.deep.equal(['stale_write', 'unknown']) },
    })
  })

  it("fails a race in which one device cannot move while another waits at the turnstile", async () => {
    const race = TH.raceEveryWay({
      makeDevices: (turnstile) => {
        // Every device takes one lock around its round trip, as no two real devices could.
        const lock = sharedLock()
        return () => (tag: string) => lock(async () => {
          await turnstile.pass()
          return tag
        })
      },
      moves:   [(move) => move('one'), (move) => move('two')],
      verdict: () => undefined,
    })
    await expect(race).rejects.toThrow(/^Under the schedule "one held before its round trip 1 while two moved": a device's move did not finish/)
  }, 10_000)

  it("fails a race whose move makes more round trips than it can hold before", async () => {
    const race = TH.raceEveryWay({
      makeDevices: (turnstile) => () => loggingDevice(turnstile, [], 13),
      moves:       [(move) => move('one'), (move) => move('two')],
      verdict:     () => undefined,
    })
    await expect(race).rejects.toThrow(/^A move made more than 12 round trips through the turnstile/)
  })

  it("refuses a race of fewer than two moves", async () => {
    await expect(TH.raceEveryWay({ makeDevices: () => noDevice, moves: [() => Promise.resolve()], verdict: () => undefined })).rejects.toThrow(TypeError)
  })
})

describe("memoryVaultOpts", () => {
  it("opens u1's main vault in acme over fresh stores, deriving through testDeriver", async () => {
    const opts = TH.memoryVaultOpts()
    expect(opts).to.include({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', keyDeriver: TH.testDeriver })
    const vault = await openVault(opts)
    await vault.unlock('pw')
    expect(await opts.vaultDB.readBundle(TH.scopeOf('u1'))).to.not.be.null
    expect(await opts.deviceDB.readUnlock(TH.scopeOf('u1'))).to.not.be.null
  })

  it("makes new stores for each call, and takes any option in place of its own", () => {
    const vaultDB = localVaultDB(memoryStore())
    expect(TH.memoryVaultOpts().vaultDB).to.not.eq(TH.memoryVaultOpts().vaultDB)
    expect(TH.memoryVaultOpts({ userId: 'u2', vaultDB })).to.include({ userId: 'u2', vaultDB })
  })
})

describe("freshDbName", () => {
  it("names a database no other call has named", () => {
    const dbNames = Array.from({ length: 20 }, () => TH.freshDbName())
    expect(new Set(dbNames).size).to.eq(20)
    expect(dbNames[0]).to.match(/^safebyok_test_\w{8}$/)
  })
})

describe("testDeriver", () => {
  it("opens a vault, deterministic in passphrase and salt", async () => {
    const vault = await openVault(TH.memoryVaultOpts())
    await vault.unlock('correct horse battery staple')
    await vault.store('anthropic_api_key', 'sk-ant-test-not-a-real-key')
    await vault.lock()
    await vault.unlock('correct horse battery staple')
    expect(await vault.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("derives the same bytes from the same passphrase and salt, and others from another", async () => {
    const salt = new Uint8Array(16)
    const once = await TH.testDeriver.deriveKeyBytes('pass', salt)
    expect(await TH.testDeriver.deriveKeyBytes('pass', salt)).to.deep.equal(once)
    expect(await TH.testDeriver.deriveKeyBytes('other', salt)).to.not.deep.equal(once)
  })
})

describe("the fixtures", () => {
  it("fakeCiphered: a shape-valid Ciphered named by its tag", () => {
    expect(TH.fakeCiphered('a1')).to.deep.equal({ cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' })
    expect(Ciphered.safeParse(TH.fakeCiphered('a1')).success).to.be.true
  })

  it("scopeOf: the user's main vault in acme, or the one named", () => {
    expect(TH.scopeOf('u1')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
    expect(TH.scopeOf('u1', 'spare')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' })
    expect(VaultScope.safeParse(TH.scopeOf('u1', 'spare')).success).to.be.true
  })

  it("bundleOf: a shape-valid VaultBundle, with any field overridden", () => {
    expect(VaultBundle.safeParse(TH.bundleOf('u1')).success).to.be.true
    expect(TH.bundleOf('u1', { unlock_epoch: 2 })).to.deep.equal({ ...TH.bundleOf('u1'), unlock_epoch: 2 })
  })

  it("noBoxYet and thisVault: the expectations u1's vault meets, before its first box and for an erase", async () => {
    const vaultDB = localVaultDB(memoryStore())
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    await vaultDB.eraseVault(TH.scopeOf('u1'), TH.thisVault)
    expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
    expect(Object.isFrozen(TH.noBoxYet)).to.be.true
    expect(Object.isFrozen(TH.thisVault)).to.be.true
  })

  it("passkeyEnvelopeOf: a shape-valid passkey envelope, with any field overridden", () => {
    const bundle = TH.bundleOf('u1', { unlocks: [TH.envelopeOf('passphrase'), TH.passkeyEnvelopeOf('laptop')] })
    expect(VaultBundle.safeParse(bundle).success).to.be.true
    expect(TH.passkeyEnvelopeOf('laptop')).to.include({ method: 'passkey', unlock_id: 'unlock-laptop', credential_id: 'cred-laptop' })
    expect(TH.passkeyEnvelopeOf('laptop', { credential_id: 'other' }).credential_id).to.eq('other')
  })

  it("passkeyOf: the same passkey and salt answer the same, another salt or passkey otherwise", async () => {
    const laptop = await TH.passkeyOf('laptop')
    expect(laptop.prfBytes).to.have.lengthOf(32)
    expect(fromB64(laptop.prfSaltB64)).to.have.lengthOf(PasskeySaltBytes)
    expect(new TextDecoder().decode(fromB64(laptop.credentialId))).to.eq('cred-laptop')
    expect(await TH.passkeyOf('laptop')).to.deep.equal(laptop)
    const phone = await TH.passkeyOf('phone')
    const elsewhere = await TH.passkeyOf('laptop', phone.prfSaltB64)
    expect(elsewhere.credentialId).to.eq(laptop.credentialId)
    expect(elsewhere.prfBytes).to.not.deep.equal(laptop.prfBytes)
    expect(phone.prfBytes).to.not.deep.equal(laptop.prfBytes)
  })

  it("boxOf: a shape-valid Lockbox, with any field overridden", () => {
    expect(Lockbox.safeParse(TH.boxOf('anthropic_api_key', 'a1')).success).to.be.true
    expect(TH.boxOf('anthropic_api_key', 'a1').revision_id).to.eq('rev-a1')
    expect(TH.boxOf('anthropic_api_key', 'a1', { note: 'work account' }).note).to.eq('work account')
  })
})

describe("spyLogger", () => {
  it("keeps every call it hears, in order, with what it was handed", () => {
    const spy = TH.spyLogger()
    const err = new Error('the storage adapter failed')
    spy.logger.warn('a refresh failed', { call: 'refresh' }, err)
    spy.logger.log()
    expect(spy.calls).to.deep.equal([
      { level: 'warn', message: 'a refresh failed', story: { call: 'refresh' }, err },
      { level: 'log',  message: undefined,          story: undefined,           err: undefined },
    ])
  })

  it("is a logger openVault takes", async () => {
    const spy = TH.spyLogger()
    const vault = await openVault(TH.memoryVaultOpts({ logger: spy.logger }))
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(spy.calls).to.have.lengthOf(0)
  })
})

describe("loggedText", () => {
  it("holds each message, story and error, down through every cause and own property", () => {
    const spy = TH.spyLogger()
    const deepest = new Error('deepest cause')
    const tagged = Object.assign(new Error('middle', { cause: deepest }), { detail: 'an own property' })
    spy.logger.error('the message', { call: 'openVault' }, new Error('the error', { cause: tagged }))
    const text = TH.loggedText(spy.calls)
    for (const piece of ['error', 'the message', '"call":"openVault"', 'the error', 'middle', 'an own property', 'deepest cause']) {
      expect(text).to.include(piece)
    }
  })

  it("ends a cause cycle rather than walking it forever", () => {
    const spy = TH.spyLogger()
    const first = new Error('first')
    const second = new Error('second', { cause: first })
    Object.defineProperty(first, 'cause', { value: second })
    spy.logger.warn('a cycle', undefined, first)
    const text = TH.loggedText(spy.calls)
    expect(text).to.include('first')
    expect(text).to.include('second')
    expect(text).to.include('[cause seen above]')
  })

  it("writes a placeholder for an own property or a story JSON cannot write, and still walks the causes", () => {
    const spy = TH.spyLogger()
    const looped: Record<string, unknown> = {}
    looped['self'] = looped
    const circular = Object.assign(new Error('circular', { cause: new Error('the cause below') }), { looped })
    spy.logger.error('a loop', { looped }, circular)
    const text = TH.loggedText(spy.calls)
    expect(text).to.include('[not JSON]')
    expect(text).to.include('circular')
    expect(text).to.include('the cause below')
  })

  it("puts each call on a line of its own, and is blank for none", () => {
    const spy = TH.spyLogger()
    expect(TH.loggedText(spy.calls)).to.eq('')
    spy.logger.log('one')
    spy.logger.log('two')
    expect(TH.loggedText(spy.calls).split('\n')).to.have.lengthOf(2)
  })
})

describe("thrownText", () => {
  it("holds an error's message, own properties and causes, the way loggedText does", () => {
    const deepest = Object.assign(new Error('deepest cause'), { detail: 'an own property' })
    const text = TH.thrownText(new Error('the error', { cause: deepest }))
    for (const piece of ['the error', 'deepest cause', 'an own property']) {
      expect(text).to.include(piece)
    }
  })

  it("writes something thrown that is no Error as JSON, and nothing for nothing", () => {
    expect(TH.thrownText({ kind: 'odd' })).to.eq('{"kind":"odd"}')
    expect(TH.thrownText(undefined)).to.eq('')
  })
})

describe("leafTexts", () => {
  it("lists every string and number at any depth, as text, and no field name", () => {
    const leaves = TH.leafTexts({ vault_id: 'vault-id-u1', wrapped: { ciphertext_b64: 'ct-a1' }, epoch: 7 })
    expect(leaves).to.deep.equal(['vault-id-u1', 'ct-a1', '7'])
  })

  it("reaches into arrays, and skips what is neither string nor number", () => {
    expect(TH.leafTexts({ tags: ['one', 2], gone: null, kept: true })).to.deep.equal(['one', '2'])
  })

  it("lists every value of a stored record", () => {
    const leaves = TH.leafTexts(TH.bundleOf('u1'))
    expect(leaves).to.include.members(['vault-id-u1', 'ct-bundle-u1', 'iv-bundle-u1', String(Date.UTC(2026, 9, 14))])
  })
})

describe("expectRefusal", () => {
  it("hands back the VaultError of the kind expected", async () => {
    const refusal = new VaultError('vault_locked', 'Unlock the vault first.')
    expect(await TH.expectRefusal(Promise.reject(refusal), 'vault_locked')).to.eq(refusal)
  })

  it("fails the test when the operation resolves, or refuses with anything but a VaultError of the kind", async () => {
    // As another copy's VaultError is: a subclass of Error that names itself, with a kind.
    class LookalikeError extends Error {
      override readonly name = 'VaultError'
      readonly kind = 'vault_locked'
    }
    const NotQuite = [
      [Promise.resolve('fine'),                                     /operation resolved/],
      [Promise.reject(new VaultError('bad_label', 'Not a label.')),  /kind/],
      [Promise.reject(new Error('plain trouble')),                  /instance of VaultError/],
      [Promise.reject(new LookalikeError('Unlock the vault first.')), /instance of VaultError/],
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a host's adapter may reject with anything, and the helper must say so
      [Promise.reject('a bare string'),                             /instance of VaultError/],
    ] as const
    for (const [operation, complaint] of NotQuite) {
      await expect(TH.expectRefusal(operation, 'vault_locked')).rejects.toThrow(complaint)
    }
  })

  it("lets a test look closer at what refused", async () => {
    const vault = await openVault(TH.memoryVaultOpts())
    const err = await TH.expectRefusal(vault.read('anthropic_api_key'), 'vault_locked')
    expect(err.message).to.be.a('string').and.not.be.empty
  })
})

describe("omitting", () => {
  const opts = TH.memoryVaultOpts()

  it("leaves out the one field named, and keeps the rest", () => {
    const without = TH.omitting(opts, 'keyDeriver')
    expect(without).to.not.have.property('keyDeriver')
    expect(Object.keys(without)).to.have.members(['applabel', 'userId', 'vaultlabel', 'vaultDB', 'deviceDB'])
    expect(opts.keyDeriver).to.eq(TH.testDeriver)
  })

  it("hands an entrypoint a bag short of a required option, with no cast", async () => {
    const err = await TH.expectRefusal(openVault(TH.omitting(opts, 'keyDeriver')), 'bad_option')
    expect(err.message).to.include('safebyok/browser')
  })
})

const ckeyOf = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`

TH.describeDeviceDB('describeDeviceDB, over the smallest honest DeviceDB', () => {
  const rows = new Map<string, DeviceUnlock>()
  const marks = new Map<string, DeviceMark>()
  return {
    readUnlock:  (scope) => Promise.resolve(rows.get(ckeyOf(scope)) ?? null),
    writeUnlock: (unlock) => { rows.set(ckeyOf(unlock), unlock); return Promise.resolve() },
    eraseUnlock: (scope) => { rows.delete(ckeyOf(scope)); return Promise.resolve() },
    readMark:    (scope) => Promise.resolve(marks.get(ckeyOf(scope)) ?? null),
    writeMark:   (mark) => { marks.set(ckeyOf(mark), mark); return Promise.resolve() },
    eraseMark:   (scope) => { marks.delete(ckeyOf(scope)); return Promise.resolve() },
    eraseAll:    () => { rows.clear(); marks.clear(); return Promise.resolve() },
  }
})

/**
 * A server's VaultDB for one signed-in user, over a store every user's vaults share: it refuses
 * any scope naming someone else, as a server's must, so the VaultDB suite reaches it only through
 * `perUser`.
 */
const servingOnly = (userId: string | null, store: StringStore): TH.VaultDBVerbs => {
  const shared = localVaultDB(store)
  const permitted = ({ user_id }: { user_id: string }): void => {
    if (user_id !== userId) { throw new VaultError('identity_revoked', "That vault belongs to someone other than the user signed in.") }
  }
  return {
    maxRecordBytes: shared.maxRecordBytes,
    maxVaultBytes:  shared.maxVaultBytes,
    maxLockboxes:   shared.maxLockboxes,
    readBundle:     async (scope, validators) => { permitted(scope); return await shared.readBundle(scope, validators) },
    createBundle:   async (bundle, validators) => { permitted(bundle); return await shared.createBundle(bundle, validators) },
    updateBundle:   async (bundle, expected, validators) => { permitted(bundle); await shared.updateBundle(bundle, expected, validators) },
    readBox:        async (scope, boxlabel, validators) => { permitted(scope); return await shared.readBox(scope, boxlabel, validators) },
    listBoxes:      async (scope, validators) => { permitted(scope); return await shared.listBoxes(scope, validators) },
    updateBox:      async (scope, lockbox, expected, validators) => { permitted(scope); await shared.updateBox(scope, lockbox, expected, validators) },
    eraseBox:       async (scope, boxlabel, expected, validators) => { permitted(scope); await shared.eraseBox(scope, boxlabel, expected, validators) },
    eraseVault:     async (scope, expected, validators) => { permitted(scope); await shared.eraseVault(scope, expected, validators) },
    eraseDamagedVault: async (scope, validators) => { permitted(scope); await shared.eraseDamagedVault(scope, validators) },
    subscribe:      (scope, onChange, validators) => { permitted(scope); return shared.subscribe(scope, onChange, validators) },
  }
}

TH.describeVaultDB('perUser, over a VaultDB serving one user', () => {
  const store = memoryStore()
  return TH.perUser((userId) => servingOnly(userId, store))
}, {
  makeVaultDBFor: () => {
    const store = memoryStore()
    return (userId) => servingOnly(userId, store)
  },
})

/** perUser over servingOnly, with the user ids it asked a VaultDB for, in order. */
const counted = () => {
  const store = memoryStore()
  const askedFor: string[] = []
  const vaultDB = TH.perUser((userId) => { askedFor.push(userId); return servingOnly(userId, store) })
  return { vaultDB, askedFor, store }
}

describe("perUser", () => {
  it("sends each verb to the VaultDB of the user its scope or bundle names", async () => {
    const { vaultDB, store } = counted()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.createBundle(TH.bundleOf('u2'))
    await vaultDB.updateBox(TH.scopeOf('u2'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 })
    expect(await servingOnly('u2', store).readBox(TH.scopeOf('u2'), 'anthropic')).to.deep.equal(TH.boxOf('anthropic', 'two'))
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
  })

  it("sends updateBundle, subscribe, eraseBox and eraseVault to the user named, too", async () => {
    const { vaultDB, store } = counted()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.createBundle(TH.bundleOf('u2'))
    await vaultDB.updateBox(TH.scopeOf('u2'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 })
    await vaultDB.updateBundle({ ...TH.bundleOf('u2'), unlock_epoch: 2 }, { vault_id: 'vault-id-u2', unlock_epoch: 1 })
    vaultDB.subscribe(TH.scopeOf('u2'), () => undefined)()
    await vaultDB.eraseBox(TH.scopeOf('u2'), 'anthropic', { vault_id: 'vault-id-u2' })
    expect(await servingOnly('u2', store).listBoxes(TH.scopeOf('u2'))).to.have.lengthOf(0)
    await vaultDB.eraseVault(TH.scopeOf('u2'), { vault_id: 'vault-id-u2' })
    expect(await servingOnly('u2', store).readBundle(TH.scopeOf('u2'))).to.be.null
    expect(await servingOnly('u1', store).readBundle(TH.scopeOf('u1'))).to.deep.equal(TH.bundleOf('u1'))
  })

  it("makes each user's VaultDB once, and keeps it", async () => {
    const { vaultDB, askedFor } = counted()
    await vaultDB.readBundle(TH.scopeOf('u1'))
    await vaultDB.readBundle(TH.scopeOf('u1', 'spare'))
    await vaultDB.createBundle(TH.bundleOf('u1'))
    vaultDB.subscribe(TH.scopeOf('u2'), () => undefined)()
    expect(askedFor).to.deep.equal(['anyone', 'u1', 'u2'])
  })

  it("has the limits of the VaultDB it made for anyone", () => {
    const store = memoryStore()
    const limitedBy = (userId: string): TH.VaultDBVerbs => ({
      ...servingOnly(userId, store),
      maxRecordBytes: userId === 'anyone' ? 4096 : 1,
      maxVaultBytes:  userId === 'anyone' ? 65_536 : 1,
      maxLockboxes:   userId === 'anyone' ? 250 : 1,
    })
    expect(TH.perUser(limitedBy)).to.include({ maxRecordBytes: 4096, maxVaultBytes: 65_536, maxLockboxes: 250 })
  })

  it("passes on a refusal from the user's VaultDB", async () => {
    const store = memoryStore()
    const onlyU1 = TH.perUser(() => servingOnly('u1', store))
    await TH.expectRefusal(onlyU1.readBundle(TH.scopeOf('u2')), 'identity_revoked')
  })
})

// ------------------------------------------------- the races, against adapters that do not guard

type Rows = Map<string, unknown>

/**
 * A backend in memory reached by round trips: `atomically` runs its work on every row in one step,
 * as one conditional statement or one transaction does, and answers on a later turn -- the next
 * microtask, or over `theWire`, the next tick, as a database across a network does. Every device
 * over it shares its rows and its listeners, and nothing else.
 */
class RoundTripBackend {
  readonly rows: Rows = new Map()
  readonly listeners = new Set<() => void>()
  private readonly overTheWire: boolean

  constructor(overTheWire: boolean) {
    this.overTheWire = overTheWire
  }

  async atomically<ValT>(work: (rows: Rows) => ValT): Promise<ValT> {
    await (this.overTheWire ? TH.wakeupAtNextTick() : Promise.resolve())
    return work(this.rows)
  }
}

/** A write taken apart: its check of what stands, and the write itself, each on the rows. */
type WritePlan = { check: (rows: Rows) => boolean, write: (rows: Rows) => void }

/** How an adapter makes a write's check and the write itself: together, or not. */
type Stepping = (backend: Pick<RoundTripBackend, 'atomically'>, plan: WritePlan) => Promise<boolean>

/** The check and the write in one round trip: atomic, as the contract asks. */
const inOneStep: Stepping = (backend, plan) => backend.atomically((rows) => {
  if (! plan.check(rows)) { return false }
  plan.write(rows)
  return true
})

/** The check in one round trip and the write in the next, so another device's write may land between. */
const checkThenWrite: Stepping = async (backend, plan) => {
  if (! await backend.atomically(plan.check)) { return false }
  await backend.atomically(plan.write)
  return true
}

/** One lock, taken around a whole write: shared by every device in this process, as no two real devices could share one. */
const sharedLock = () => {
  let tail: Promise<unknown> = Promise.resolve()
  return <ValT>(work: () => Promise<ValT>): Promise<ValT> => {
    const turn = afterThen(tail, work)
    tail = endOf(turn)
    return turn
  }
}

/** `work`, once `before` has ended. */
const afterThen = async <ValT>(before: Promise<unknown>, work: () => Promise<ValT>): Promise<ValT> => {
  await before
  return work()
}

/** Resolves once `promise` ends, however it ends: the next turn of a lock waits on this one's end, not its outcome. */
const endOf = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch {
    // ended
  }
}

/** {@link checkThenWrite} under one lock every device here shares: the race hidden in this process, and open between real devices. */
const checkThenWriteUnder = (lock: ReturnType<typeof sharedLock>): Stepping => (backend, plan) => lock(() => checkThenWrite(backend, plan))

/** How a {@link RoundTripVaultDB} is made: its stepping, and the ways it may be wrong beside that. */
type RoundTripOpts = {
  stepping:         Stepping
  maxLockboxes?:    number | undefined
  /** Counts the vault in a round trip of its own, before a new lockbox's write: honest, and best effort. */
  countsApart?:     boolean
  /** Lists no more lockboxes than its limit: a listing cut short. */
  listsToLimit?:    boolean
  /** Writes a new lockbox into a full vault, then refuses it as full all the same: a refusal that leaves its lockbox behind. */
  keepsRefused?:    boolean
  /** Rings only its own subscribers, so no device hears another's writes. */
  ringsOnlyItself?: boolean
  /** Round trips it makes before each write, as a device fetching a session first does. */
  preludes?:        number
  /** Starts each watch with a round trip, as a listen or a subscription over a wire does: `late`, and no more, or `late, calling once live`. */
  watchStarts?:     'late' | 'late, calling once live'
}

/**
 * A VaultDB over a {@link RoundTripBackend}, every write planned as a check and a write and made as
 * its `stepping` says: honest with {@link inOneStep}, and broken in the ways a race test must catch
 * with anything else.
 */
class RoundTripVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes: number
  private readonly backend: RoundTripBackend
  private readonly opts: RoundTripOpts
  private readonly ownListeners = new Set<() => void>()

  constructor(backend: RoundTripBackend, opts: RoundTripOpts) {
    super()
    this.backend = backend
    this.opts = opts
    this.maxLockboxes = opts.maxLockboxes ?? Infinity
  }

  protected doReadBundle(scope: VaultScope) { return this.backend.atomically((rows) => rows.get(Ckeys.bundle(scope)) ?? null) }

  protected async doCreateBundle(bundle: VaultBundle) {
    const ckey = Ckeys.bundle(bundle)
    const created = await this.step({ check: (rows) => ! rows.has(ckey), write: (rows) => { rows.set(ckey, bundle) } })
    return created ? bundle : await this.backend.atomically((rows) => rows.get(ckey))
  }

  protected doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation) {
    const ckey = Ckeys.bundle(bundle)
    const meets = (rows: Rows) => {
      const standing = rows.get(ckey) as VaultBundle | undefined
      return standing?.vault_id === expected.vault_id && standing.unlock_epoch === expected.unlock_epoch
    }
    return this.step({ check: meets, write: (rows) => { rows.set(ckey, bundle) } })
  }

  protected doReadBox(scope: VaultScope, boxlabel: string) { return this.backend.atomically((rows) => rows.get(Ckeys.box(scope, boxlabel)) ?? null) }

  protected async doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    const listed = await this.backend.atomically((rows) => boxesIn(rows, scope))
    return this.opts.listsToLimit ? listed.slice(0, this.maxLockboxes) : listed
  }

  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation) {
    const ckey = Ckeys.box(scope, lockbox.boxlabel)
    const isNew = expected.revision_id === null
    const full = (rows: Rows) => isNew && boxesIn(rows, scope).length >= this.maxLockboxes
    if (this.opts.countsApart && await this.backend.atomically((rows) => full(rows) && vaultIs(rows, scope, expected) && ! rows.has(ckey))) {
      throw vaultFull()
    }
    const meets = (rows: Rows) => {
      const standingRevision = (rows.get(ckey) as Lockbox | undefined)?.revision_id ?? null
      if (! vaultIs(rows, scope, expected) || ! vaultKeyIs(rows, scope, expected) || standingRevision !== expected.revision_id) { return false }
      if (! this.opts.countsApart && full(rows)) {
        if (this.opts.keepsRefused) { rows.set(ckey, lockbox) }
        throw vaultFull()
      }
      return true
    }
    return await this.step({ check: meets, write: (rows) => { rows.set(ckey, lockbox) } })
  }

  protected doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation) {
    return this.step({ check: (rows) => vaultIs(rows, scope, expected), write: (rows) => { rows.delete(Ckeys.box(scope, boxlabel)) } })
  }

  protected doEraseVault(scope: VaultScope, expected: EraseExpectation) {
    const erase = (rows: Rows) => {
      const isBox = Ckeys.isBoxIn(scope)
      for (const ckey of rows.keys()) {
        if (isBox(ckey)) { rows.delete(ckey) }
      }
      rows.delete(Ckeys.bundle(scope))
    }
    return this.step({ check: (rows) => vaultIs(rows, scope, expected), write: erase })
  }

  protected override doSubscribe(_scope: VaultScope, onChange: () => void) {
    const listeners = this.listeners()
    const watch = { ended: false }
    if (this.opts.watchStarts) {
      void this.startWatch(watch, onChange)
    } else {
      listeners.add(onChange)
    }
    return () => {
      watch.ended = true
      listeners.delete(onChange)
    }
  }

  private async startWatch(watch: { ended: boolean }, onChange: () => void) {
    await this.backend.atomically(() => undefined)
    if (watch.ended) { return }
    this.listeners().add(onChange)
    if (this.opts.watchStarts === 'late, calling once live') { onChange() }
  }

  private listeners() { return this.opts.ringsOnlyItself ? this.ownListeners : this.backend.listeners }

  private async step(plan: WritePlan) {
    for (let ii = 0; ii < (this.opts.preludes ?? 0); ii += 1) { await this.backend.atomically(() => undefined) }
    const landed = await this.opts.stepping(this.backend, plan)
    if (landed) {
      for (const listener of this.listeners()) { queueMicrotask(listener) }
    }
    return landed
  }
}

const vaultIs = (rows: Rows, scope: VaultScope, expected: { vault_id: string }) => (rows.get(Ckeys.bundle(scope)) as VaultBundle | undefined)?.vault_id === expected.vault_id
const vaultKeyIs = (rows: Rows, scope: VaultScope, expected: { vault_key_epoch: number }) => (rows.get(Ckeys.bundle(scope)) as VaultBundle | undefined)?.vault_key_epoch === expected.vault_key_epoch

const boxesIn = (rows: Rows, scope: VaultScope): StoredLockbox[] => [...rows]
  .map(([ckey, lockbox]) => ({ boxlabel: Ckeys.isBoxIn(scope)(ckey) ? Ckeys.boxlabelOf(ckey) : null, lockbox }))
  .filter((stored): stored is StoredLockbox => stored.boxlabel !== null)

const vaultFull = () => new VaultError('vault_full', 'This vault is full: erase a lockbox to make room, then try again.')

/**
 * makeDevices for a RoundTripVaultDB: a fresh backend, and devices over it, each with `opts` --
 * its round trips through the race's turnstile, unless `unwired`.
 */
const roundTripDevices = (opts: RoundTripOpts & { overTheWire?: boolean, unwired?: boolean, slowSecond?: boolean }): TH.MakeVaultDBDevices => (turnstile) => {
  const backend = new RoundTripBackend(opts.overTheWire ?? false)
  const reached = opts.unwired ? backend : TH.throughTurnstile(turnstile, backend, ['atomically'])
  let made = 0
  return ({ maxLockboxes }) => {
    made += 1
    return new RoundTripVaultDB(reached, { ...opts, maxLockboxes, preludes: made === 2 && opts.slowSecond ? 6 : 0 })
  }
}

/** A turnstile no race holds. */
const unheldTurnstile: TH.Turnstile = { pass: () => Promise.resolve() }

/** The battery's options for a RoundTripVaultDB with `opts`: a fresh adapter, a capped one, its devices, and its push. */
const roundTripBattery = (opts: RoundTripOpts & { overTheWire?: boolean, unwired?: boolean, slowSecond?: boolean }) => {
  const makeDevices = roundTripDevices(opts)
  const oneDevice = async (maxLockboxes?: number) => (await makeDevices(unheldTurnstile))({ maxLockboxes })
  return [() => oneDevice(), { makeCappedVaultDB: oneDevice, makeDevices, pushes: true }] as const
}

TH.describeVaultDB('an honest adapter making round trips through the turnstile', ...roundTripBattery({ stepping: inOneStep }))
TH.describeVaultDB('an honest adapter that counts a vault apart from its write, as a best effort', ...roundTripBattery({ stepping: inOneStep, countsApart: true }))

/** The races a write whose check and write are apart loses, in some interleaving. */
const SplitLosses = ['rivalCreates', 'rivalBundleUpdates', 'rivalFirstWrites', 'rivalReplacements', 'eraseBeatsReplacement', 'vaultEraseBeatsWrite'] as const

/** The battery's checks over a check-then-write adapter whose devices share one lock, a fresh one for each call. */
const lockedChecks = () => checksOver({ stepping: checkThenWriteUnder(sharedLock()), overTheWire: true })

/** A check run as an assertion: it rejects, failing the test, when what it checks does not hold. */
const expectToHold = (check: TH.VaultDBTimingCheck): Promise<void> => check.check()

/** The checks of the battery over an adapter, by handle. */
const checksOver = (opts: RoundTripOpts & { overTheWire?: boolean, unwired?: boolean, slowSecond?: boolean }) => TH.vaultDBTimingChecks(...roundTripBattery(opts))

describe("expectRoundTripsThroughTurnstile", () => {
  it("passes devices that send every write through the turnstile", async () => {
    await TH.expectRoundTripsThroughTurnstile(roundTripDevices({ stepping: inOneStep }))
  })

  it("fails devices whose writes reach the backend without passing it, naming the first", async () => {
    await expect(TH.expectRoundTripsThroughTurnstile(roundTripDevices({ stepping: inOneStep, unwired: true }))).rejects.toThrow(/^createBundle reached the backend without passing the turnstile/)
  })
})

describe("vaultDBTimingChecks, against adapters that do not guard", () => {
  for (const handle of SplitLosses) {
    it(`fails a check-then-write split by an await in this process, its round trips unheld: ${handle}`, async () => {
      await expect(checksOver({ stepping: checkThenWrite, unwired: true })[handle].check()).rejects.toThrow(/^Under the schedule "[^"]+": expected /)
    })

    it(`fails a check-then-write split across two round trips over a wire: ${handle}`, async () => {
      await expect(checksOver({ stepping: checkThenWrite, overTheWire: true })[handle].check()).rejects.toThrow(/^Under the schedule "[^"]+": expected /)
    })
  }

  for (const handle of SplitLosses) {
    it(`fails a check-then-write whose second device reaches it six round trips late, as only a hold at the turnstile finds: ${handle}`, async () => {
      await expect(checksOver({ stepping: checkThenWrite, overTheWire: true, slowSecond: true })[handle].check()).rejects.toThrow(/^Under the schedule "\w+ held before its round trip \d+ while \w+ moved": expected /)
    })
  }

  it("misses that late device where nothing holds a round trip: what the turnstile is for", async () => {
    const checks = checksOver({ stepping: checkThenWrite, overTheWire: true, slowSecond: true, unwired: true })
    for (const handle of SplitLosses) { await expectToHold(checks[handle]) }
  })

  it("lets the writes of different lockboxes through a check-then-write adapter land, as they should", async () => {
    const checks = checksOver({ stepping: checkThenWrite, overTheWire: true })
    await expectToHold(checks.apartNewLockboxes)
    await expectToHold(checks.apartReplaceAndErase)
  })

  it("fails a check-then-write hidden behind a lock its devices share, once the turnstile holds one inside it", async () => {
    await Promise.all([
      expect(lockedChecks().rivalFirstWrites.check()).rejects.toThrow(/held before its round trip 1 while two moved": a device's move did not finish .* share something/),
      expect(lockedChecks().apartNewLockboxes.check()).rejects.toThrow(/held before its round trip 1 while two moved": a device's move did not finish/),
    ])
  }, 10_000)

  it("is fooled by that lock where nothing holds a round trip: why makeDevices wires the turnstile", async () => {
    const unwiredUnderLock = checksOver({ stepping: checkThenWriteUnder(sharedLock()), overTheWire: true, unwired: true })
    await expectToHold(unwiredUnderLock.rivalFirstWrites)
  })

  it("fails a makeDevices that hands one adapter to both devices, or a backend to each", async () => {
    const backend = new RoundTripBackend(false)
    const oneAdapter = new RoundTripVaultDB(backend, { stepping: inOneStep })
    const theOne = () => oneAdapter
    const shared = TH.vaultDBTimingChecks(theOne, { makeDevices: () => theOne })
    await expect(shared.seenAcrossDevices.check()).rejects.toThrow(/makeDevices made one adapter for both devices/)
    const overItsOwn = () => new RoundTripVaultDB(new RoundTripBackend(false), { stepping: inOneStep })
    const apart = TH.vaultDBTimingChecks(theOne, { makeDevices: () => overItsOwn })
    await expect(apart.seenAcrossDevices.check()).rejects.toThrow()
    await expect(apart.rivalCreates.check()).rejects.toThrow(/^Under the schedule "made together"/)
  })

  it("fails a listing cut short at the limit, once a roomier device has taken the vault past it", async () => {
    await expect(checksOver({ stepping: inOneStep, listsToLimit: true }).pastLimitFromRoomierDevice.check()).rejects.toThrow(/to have the same members/)
  })

  it("fails a crowd for the last place whose refused racers leave their lockboxes behind", async () => {
    await expect(checksOver({ stepping: inOneStep, keepsRefused: true }).crowdForLastPlace.check()).rejects.toThrow(/^Under the schedule "made together": expected /)
  })

  it("takes a vault past its limit, for real, when racers' counts are apart from their writes", async () => {
    const landedCounts: number[] = []
    await TH.raceEveryWay({
      makeDevices: async (turnstile) => {
        const deviceFor = await roundTripDevices({ stepping: inOneStep, overTheWire: true, countsApart: true })(turnstile)
        return () => deviceFor({ maxLockboxes: 3 })
      },
      setup:   async (first) => { await first.createBundle(TH.bundleOf('u1')); await first.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet) },
      moves:   ['openai', 'mistral', 'gemini', 'cohere'].map((boxlabel) => (racer: TH.VaultDBVerbs) => racer.updateBox(TH.scopeOf('u1'), TH.boxOf(boxlabel, boxlabel), TH.noBoxYet)),
      verdict: (outcomes) => { landedCounts.push(outcomes.filter((outcome) => outcome.kind === 'landed').length) },
    })
    // Room for two: held between count and write, all four land; one after another, two.
    expect(Math.max(...landedCounts)).to.eq(4)
    expect(Math.min(...landedCounts)).to.eq(2)
  })

  it("fails an adapter that rings before its write lands, whose reads then miss the write", async () => {
    const store = memoryStore()
    const listeners = new Set<() => void>()
    const ringNow = () => { for (const listener of listeners) { listener() } }
    const earlyStore: StringStore = {
      ...store,
      write:     (ckey, text) => { ringNow(); store.write(ckey, text) },
      erase:     (ckey) => { ringNow(); store.erase(ckey) },
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    }
    const checks = TH.vaultDBTimingChecks(() => localVaultDB(earlyStore), { pushes: true })
    await expect(checks.pushEachWrite.check()).rejects.toThrow(/no call to onChange read the vault as the write left it/)
  }, 10_000)

  it("fails an unsubscribe that leaves its listener listening", async () => {
    const store = memoryStore()
    const leaky: StringStore = { ...store, subscribe: (listener) => { store.subscribe(listener); return noDevice } }
    const checks = TH.vaultDBTimingChecks(() => localVaultDB(leaky), { pushes: true })
    await expect(checks.pushEndsOnUnsubscribe.check()).rejects.toThrow(/an unsubscribed onChange was called/)
  })

  it("fails a watch that starts on its own time and never calls once it is live, missing a write made meanwhile", async () => {
    await expect(checksOver({ stepping: inOneStep, watchStarts: 'late' }).pushFromTheStart.check()).rejects.toThrow(/no call to onChange read the vault as the write left it/)
  })

  it("passes that watch once it calls as it goes live", async () => {
    await expectToHold(checksOver({ stepping: inOneStep, watchStarts: 'late, calling once live' }).pushFromTheStart)
  })

  it("fails a device that never hears another device's writes", async () => {
    const checks = checksOver({ stepping: inOneStep, ringsOnlyItself: true })
    await expectToHold(checks.pushEachWrite)
    await expect(checks.pushFromAnotherDevice.check()).rejects.toThrow(/a watch heard none of 20 writes/)
  }, 10_000)
})

/** Each numbered line of the VaultDB contract as `VAULTDB.md` writes it, in bold: its number, then its title. */
const BoldLines = /\*\*(\d+\.\d+)\. ([^*]+?)\.\*\*/gu

/** Each numbered line of the VaultDB contract in `markdown`, its title by its number. */
const contractLinesIn = (markdown: string): Record<string, string> => Object.fromEntries(
  Array.from(markdown.matchAll(BoldLines), ([, line = '', title = '']): [string, string] => [line, title.replaceAll(/\s+/gu, ' ')]),
)

describe("VaultDBContract", () => {
  it("names every numbered line of VAULTDB.md, by the title it has there, and nothing else", () => {
    const written = contractLinesIn(readFileSync(new URL('../VAULTDB.md', import.meta.url), 'utf8'))
    expect(TH.VaultDBContract).to.deep.equal(written)
  })

  it("titles a line as an adapter's own test of it cites it", () => {
    expect(`postgresVaultDB, 5.5: ${TH.VaultDBContract['5.5']}`).to.eq('postgresVaultDB, 5.5: identity_revoked means the user is gone')
  })
})
