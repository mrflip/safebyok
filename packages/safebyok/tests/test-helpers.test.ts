/**
 * Tests of every part of `tests/test-helpers/`, as reached through the front door, `TH`. The
 * parts are source for `safebyok/testing`, not tests, so by exception these tests stay in one file
 * named for the door, not a folder: at this length they are easier found whole than split.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Bank, DeviceDB, localVaultDB, memoryDeviceDB, memoryStore, type StringStore } from '../src/index'
import * as FX from '../src/shapes/fields'
import { fromB64, makeVaultKey, toB64 } from '../src/crypto'
import { VaultError } from '../src/errors'
import { type Outcome, bad, good, valOf } from '../src/outcome'
import { Box } from '../src/box'
import type { BoxRecord } from '../src/shapes/box'
import * as BX from '../src/shapes/box'
import { argon2idWebV1Deriver } from '../src/key-deriver'
import { Wayin } from '../src/wayin'
import { PasskeySaltBytes, type VaultDraft, type VaultRecord } from '../src/shapes/vault'
import * as VX from '../src/shapes/vault'
import type { VaultScope } from '../src/shapes/scopes'
import * as CX from '../src/shapes/scopes'
import type { Capacity, VaultRecordExpectation, VaultDelExpectation, BoxGetExpectation, BoxExpectation, BoxDelExpectation, StoredBox, StoredVault } from '../src/shapes/vault-db'
import type { DeviceRecord, LeaseRecord } from '../src/shapes/device'
import * as Refusals from '../src/refusals'
import * as Scopepath from '../src/scopepath'
import * as Expectations from '../src/expectations'
import { VaultDB, type VaultDBOpts, splitStoredBoxes } from '../src/vault-db'
import * as TH from './test-helpers'
import { raceOutcomeOf } from './test-helpers/racing'


// == [Tweaks and timing]: tweakB64, wakeupAtNextTick, aWhile, eventually, changeCounter, liveWatch

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

describe("aWhile", () => {
  it("takes about fifty milliseconds", async () => {
    const began = Date.now()
    await TH.aWhile()
    expect(Date.now() - began).to.be.at.least(40)
  })
})

describe("eventually", () => {
  it("resolves once the check holds, though it did not at first", async () => {
    let ready = false
    setTimeout(() => { ready = true }, 20)
    await TH.eventually(() => ready)
    expect(ready).to.be.true
  })

  it("resolves at once for a check that holds already", async () => {
    let looks = 0
    await TH.eventually(() => { looks += 1; return true })
    expect(looks).to.eq(1)
  })

  it("rejects when the thing never comes to pass", async () => {
    vi.useFakeTimers()
    try {
      const waiting = TH.eventually(() => false)
      const outcome = expect(waiting).rejects.toThrow('never came to pass')
      await vi.advanceTimersByTimeAsync(3000)
      await outcome
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("changeCounter", () => {
  it("counts each call of its listener", () => {
    const { heard, onChange } = TH.changeCounter()
    expect(heard.count).to.eq(0)
    onChange()
    onChange()
    expect(heard.count).to.eq(2)
  })

  it("keeps one count per counter", () => {
    const first = TH.changeCounter()
    const second = TH.changeCounter()
    first.onChange()
    expect(second.heard.count).to.eq(0)
  })
})

/** What a stub's subscribe hands back: an unsubscribe that does nothing. */
const unsubscribeFromNothing = () => undefined

describe("liveWatch", () => {
  it("resolves once the server's opening call has come, the count back at zero, then counts changes", async () => {
    const subscribed: (() => void)[] = []
    const watched = {
      subscribe: (_scope: VaultScope, onChange: () => void) => {
        subscribed.push(onChange)
        queueMicrotask(onChange)
        return unsubscribeFromNothing
      },
    }
    const { heard, unsubscribe } = await TH.liveWatch(watched, TH.scopeOf('u1'))
    expect(heard.count).to.eq(0)
    subscribed[0]?.()
    expect(heard.count).to.eq(1)
    unsubscribe()
  })

  it("unsubscribes before it rejects, when the opening call never comes", async () => {
    const unsubscribe = vi.fn()
    const silent = { subscribe: () => unsubscribe }
    vi.useFakeTimers()
    try {
      const outcome = expect(TH.liveWatch(silent, TH.scopeOf('u1'))).rejects.toThrow('never came to pass')
      await vi.advanceTimersByTimeAsync(3000)
      await outcome
    } finally {
      vi.useRealTimers()
    }
    expect(unsubscribe.mock.calls).to.have.lengthOf(1)
  })
})
// --

// == [Gates and call hooks]: makeLatch, beforeNextCall, holdNextCall, settledVault, tallyWatches

describe("makeLatch", () => {
  it("holds a pass until released, and says when something reached it", async () => {
    const gate = TH.makeLatch()
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
    const gate = TH.makeLatch()
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
    const vaultDB = localVaultDB({ store: memoryStore() })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    TH.beforeNextCall(vaultDB, 'tryPutBox', async () => {
      await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'theirs'))
    })
    await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'mine')), 'stale_write')
    const kept = await TH.expectingGood(vaultDB).tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault)
    expect(kept?.revision_tok).to.eq('rev-theirs')
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

  it("leaves a spy on the prototype showing through afterwards, with no own property in its way", async () => {
    class Shelf { fetchRow(ckey: string) { return Promise.resolve(ckey.length) } }
    const spy = vi.spyOn(Shelf.prototype, 'fetchRow')
    const target = new Shelf()
    TH.beforeNextCall(target, 'fetchRow', () => Promise.resolve())
    expect(await target.fetchRow('one')).to.eq(3)
    expect(Object.hasOwn(target, 'fetchRow')).to.be.false
    spy.mockImplementation(() => Promise.resolve(-1))
    expect(await target.fetchRow('one')).to.eq(-1)
    spy.mockRestore()
  })

  it("puts back an own property of the target's, spy and all", async () => {
    const target = { fetchRow: (ckey: string) => Promise.resolve(ckey.length) }
    const spy = vi.spyOn(target, 'fetchRow')
    TH.beforeNextCall(target, 'fetchRow', () => Promise.resolve())
    await target.fetchRow('one')
    expect(Object.getOwnPropertyDescriptor(target, 'fetchRow')?.value).to.eq(spy)
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

  it("lands a lock in the middle of an unlock, as its @example has it: the unlock refuses at once, nothing unlocked", async () => {
    const opts = TH.memoryVaultOpts()
    const vault = await TH.settledVault(opts)
    const gate = TH.holdNextCall(opts.vaultDB, 'tryGetVault')
    const unlocking = TH.tryUnlock(vault, 'pw')
    await gate.reached
    await vault.lock()
    const unlocked = await unlocking
    gate.release()
    expect(unlocked.ok).to.be.false
    expect(TH.stateOf(vault.snapshot)).to.not.eq('unlocked')
  })
})

describe("holdNextAnswer", () => {
  it("holds the next call's answer once the call has run, until released; a later call goes straight through", async () => {
    const heard: string[] = []
    const target = { fetchRow: (ckey: string) => { heard.push(ckey); return Promise.resolve(ckey) } }
    const gate = TH.holdNextAnswer(target, 'fetchRow')
    let answered = false
    const held = (async () => { const row = await target.fetchRow('held'); answered = true; return row })()
    await gate.reached
    expect(heard).to.deep.equal(['held'])
    expect(await target.fetchRow('later')).to.eq('later')
    expect(answered).to.be.false
    gate.release()
    expect(await held).to.eq('held')
  })

  it("lands a lock's erase after a lease the store has already taken, as its @example has it", async () => {
    const opts = TH.memoryVaultOpts()
    const vault = await TH.settledVault(opts)
    const written = TH.holdNextAnswer(opts.deviceDB, 'tryPutLease')
    const unlocking = TH.tryUnlock(vault, 'pw')
    await written.reached
    await vault.lock()
    written.release()
    await unlocking
    const kept = await opts.deviceDB.tryGetLease(TH.scopeOf('u1'))
    expect(await TH.expectGood(kept)).to.be.null
  })
})

describe("readAfresh", () => {
  it("waits out a read under way and reads again, so a change made while it ran shows, as its @example has it", async () => {
    const opts = TH.memoryVaultOpts()
    const vault = await TH.settledVault(opts)
    await TH.unlock(vault, 'pw')
    const reads = vi.spyOn(opts.vaultDB, 'tryGetVault')
    const underWay = vault.refresh()
    await TH.readAfresh(vault)
    await underWay
    expect(reads).toHaveBeenCalledTimes(2)
  })
})

describe("settledVault", () => {
  it("births a vault in a bank of its own, novel, as its first example shows", async () => {
    const opts = TH.memoryVaultOpts()
    const vault = await TH.settledVault(opts)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
    expect(await TH.vaultRecordIn(opts.vaultDB, TH.scopeOf('u1')), 'born of vaultDB.ensureVault: the vault is stored from birth').to.not.be.null
    expect(TH.bankOf(vault).vaultOf({ user_id: 'u1', vaultlabel: 'main' })).to.eq(vault)
  })

  it("makes a bank of its own each call, so two calls over one deviceDB are two tabs of one device", async () => {
    const opts = TH.memoryVaultOpts()
    const here = await TH.settledVault(opts)
    await TH.unlock(here, 'pw')
    const there = await TH.settledVault(opts)
    expect(TH.bankOf(there)).to.not.eq(TH.bankOf(here))
    expect(there).to.not.eq(here)
    expect(TH.stateOf(there.getSnapshot()), "the other tab takes up this one's lease at birth").to.eq('unlocked')
  })

  it("makes two devices over one vaultDB, each with a device store of its own, as its second example shows", async () => {
    const opts = TH.memoryVaultOpts()
    const here = await TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })
    await TH.unlock(here, 'pw')
    const there = await TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })
    expect(TH.stateOf(there.getSnapshot())).to.eq('locked')
  })

  it("rejects as ensureVault does, and as Bank.make does for misuse", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    vi.spyOn(vaultDB, 'tryEnsureVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    await TH.expectRefusal(TH.settledVault(TH.memoryVaultOpts({ vaultDB })), 'not_permitted')
    await TH.expectRefusal(TH.settledVault(TH.memoryVaultOpts({ applabel: 'not-a-label' })), 'bad_scope')
  })
})

describe("stateOf", () => {
  it("reads novel with no gate, unlocked with ask_passphrase_at set, and locked once it is null, as its example shows", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')
    await TH.unlock(vault, 'pw')
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    await vault.lock()
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
  })
})

describe("bankOf", () => {
  it("answers the bank a vault was born in, which can let it go, as its example shows", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    TH.bankOf(vault).closeVault({ user_id: 'u1', vaultlabel: 'main' })
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_gone')
  })

  it("throws for a vault settledVault did not hand out", async () => {
    const { vaultlabel, ...bankOpts } = TH.memoryVaultOpts()
    const vault = await Bank.make(bankOpts).ensureVault({ vaultlabel })
    expect(() => TH.bankOf(vault)).to.throw(/settledVault/)
  })
})

describe("closeVault", () => {
  it("lets the vault go, every call then refusing 'vault_gone', and leaves the lease for the next vault settled over this deviceDB, as its example shows", async () => {
    const opts = TH.memoryVaultOpts()
    const vault = await TH.settledVault(opts)
    await TH.unlock(vault, 'pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    TH.closeVault(vault)
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_gone')
    expect(await TH.expectingGood(opts.deviceDB).tryGetLease(TH.scopeOf('u1'))).to.not.be.null
    const next = await TH.settledVault(opts)
    expect(TH.stateOf(next.getSnapshot())).to.eq('unlocked')
    expect(await next.getWhisper('anthropic')).to.eq('sk-fake')
  })
})

describe("tallyWatches", () => {
  it("counts the watches opened and closed, each still reaching the adapter", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const tally = TH.tallyWatches(vaultDB)
    const vault = await TH.settledVault(TH.memoryVaultOpts({ vaultDB }))
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    TH.closeVault(vault)
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("counts a watch closed once, so a double close cannot hide another watch's leak", () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const tally = TH.tallyWatches(vaultDB)
    const first = vaultDB.subscribe(TH.scopeOf('u1'), () => undefined)
    vaultDB.subscribe(TH.scopeOf('u1'), () => undefined)
    first()
    first()
    expect(tally).to.deep.equal({ opened: 2, closed: 1 })
  })

  it("shows no leak once a vault is let go, as its @example has it", async () => {
    const opts = TH.memoryVaultOpts()
    const tally = TH.tallyWatches(opts.vaultDB)
    const vault = await TH.settledVault(opts)
    TH.closeVault(vault)
    expect(tally.opened).to.eq(1)
    expect(tally.opened - tally.closed).to.eq(0)
  })

  it("shows no leak once a bank refuses a birth", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    vi.spyOn(vaultDB, 'tryEnsureVault').mockResolvedValue(bad(new VaultError('not_permitted', "That vault belongs to someone else.")))
    const tally = TH.tallyWatches(vaultDB)
    const { vaultlabel, ...bankOpts } = TH.memoryVaultOpts({ vaultDB })
    const bank = Bank.make(bankOpts)
    await TH.expectRefusal(bank.ensureVault({ vaultlabel }), 'not_permitted')
    bank.closeVaults()
    expect(tally.opened - tally.closed).to.eq(0)
  })
})
// --

// == [Turnstile and races]: throughTurnstile, raceEveryWay, loggingDevice

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
// --

// == [Builders and fixtures]: memoryVaultOpts, freshDbName, testDeriver, the fixtures

describe("memoryVaultOpts", () => {
  it("opens u1's main vault in acme over fresh stores, deriving through testDeriver", async () => {
    const opts = TH.memoryVaultOpts()
    expect(opts).to.include({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main', keyDeriver: TH.testDeriver })
    const vault = await TH.settledVault(opts)
    await TH.unlock(vault, 'pw')
    expect(await TH.vaultRecordIn(opts.vaultDB, TH.scopeOf('u1'))).to.not.be.null
    expect(await TH.expectingGood(opts.deviceDB).tryGetLease(TH.scopeOf('u1'))).to.not.be.null
  })

  it("makes new stores for each call, and takes any option in place of its own", () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    expect(TH.memoryVaultOpts().vaultDB).to.not.eq(TH.memoryVaultOpts().vaultDB)
    expect(TH.memoryVaultOpts({ user_id: 'u2', vaultDB })).to.include({ user_id: 'u2', vaultDB })
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
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    await TH.unlock(vault, 'correct horse battery staple')
    await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test-not-a-real-key')
    await vault.lock()
    await TH.unlock(vault, 'correct horse battery staple')
    expect(await vault.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
  })

  it("derives the same bytes from the same passphrase and salt, and others from another", async () => {
    const salt = new Uint8Array(16)
    const once = await TH.testDeriver.deriveKeyBytes('pass', salt)
    expect(await TH.testDeriver.deriveKeyBytes('pass', salt)).to.deep.equal(once)
    expect(await TH.testDeriver.deriveKeyBytes('other', salt)).to.not.deep.equal(once)
  })
})

describe("the fixtures", () => {
  it("fakeCiphered: a shape-valid Ciphered named by its tag, as its first example shows", () => {
    expect(TH.fakeCiphered('a1')).to.deep.equal({ cipher_iv_b64: 'iv-a1', ciphertext_b64: 'ct-a1' })
    expect(FX.ciphered.safeParse(TH.fakeCiphered('a1')).success).to.be.true
  })

  it("fakeCiphered: fills a box's ciphered field without a parse, as its second example shows", () => {
    const box = TH.boxOf('anthropic', 'a1', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET') })
    expect(box.whisper_ciphered).to.deep.equal({ cipher_iv_b64: 'iv-SUPERSECRET', ciphertext_b64: 'ct-SUPERSECRET' })
    expect(BX.boxRecord.safeParse(box).success).to.be.true
  })

  it("scopeOf: the user's main vault in acme, or the one named", () => {
    expect(TH.scopeOf('u1')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
    expect(TH.scopeOf('u1', 'spare')).to.deep.equal({ applabel: 'acme', user_id: 'u1', vaultlabel: 'spare' })
    expect(CX.vaultScope.safeParse(TH.scopeOf('u1', 'spare')).success).to.be.true
  })

  it("vaultSliceOf: the scope, vault token, key deriver, lease length and clock a box, way in or lease reads, as its first example shows", () => {
    const { now, keyDeriver, leaseMillis, ...stamp } = TH.vaultSliceOf('u1')
    expect(now()).to.eq(TH.SliceNow)
    expect([keyDeriver, leaseMillis]).to.deep.equal([TH.testDeriver, 7 * 24 * 60 * 60_000])
    // Its own fields are its stamp alone, as a Vault object's are.
    expect({ ...TH.vaultSliceOf('u1') }).to.deep.equal(stamp)
    expect(stamp).to.deep.equal({ format: 'safebyok-vault-v6', ...TH.scopeOf('u1'), vault_tok: 'vault-tok-u1', registered_at: TH.vaultRecordOf('u1').registered_at })
    const slice = TH.vaultSliceOf('u1', argon2idWebV1Deriver)
    expect(slice.keyDeriver).to.eq(argon2idWebV1Deriver)
    expect(Wayin.make(TH.vaultSliceOf('u1'), TH.passkeyWayinOf('laptop'), { keyDeriver: argon2idWebV1Deriver }).wayinkind).to.eq('passkey')
  })

  it("vaultSliceOf: any field as its overrides say, as its second example shows", () => {
    const later = TH.SliceNow + 1000
    const slice = TH.vaultSliceOf('u1', TH.testDeriver, { now: () => later, vault_tok: 'vault-tok-other' })
    expect(slice.now()).to.eq(later)
    expect(slice.vault_tok).to.eq('vault-tok-other')
  })

  it("deviceRecordOf: a whole device record of the user's main vault, raised as its first example shows", async () => {
    const deviceDB = TH.expectingGood(memoryDeviceDB())
    await deviceDB.tryRaiseDeviceRecord(TH.deviceRecordOf('u1'))
    expect(await deviceDB.tryGetDeviceRecord(TH.scopeOf('u1'))).to.deep.equal({ format: 'safebyok-device-v1', ...TH.scopeOf('u1'), device_id: 'device-one', highest_vault_epoch: 1 })
  })

  it("deviceRecordOf: any field as its overrides say, as its second example shows", () => {
    expect(TH.deviceRecordOf('u1', { highest_vault_epoch: 3 })).to.include({ user_id: 'u1', device_id: 'device-one', highest_vault_epoch: 3 })
  })

  it("cheatGetVaultEpoch: the vault record a Vault object holds but its gate, its epochs among it, what a box made of it now is made under, as its examples show", async () => {
    const opts = TH.memoryVaultOpts()
    const vault = await TH.settledVault(opts)
    await TH.unlock(vault, 'pw')
    const stored = await TH.vaultRecordIn(opts.vaultDB, TH.scopeOf('u1'))
    if (stored === null) { throw new Error('no vault was stored') }
    const { gate: _gate, ...sparse } = stored
    expect(TH.cheatGetVaultEpoch(vault)).to.deep.equal(sparse)
    expect(TH.cheatGetVaultEpoch(vault).gate_epoch).to.eq(1)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const record = valOf(await opts.vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', { vault_tok: vault.vault_tok }))
    if (record === null) { throw new Error('no box was stored') }
    expect(await Box.make(vault, record, TH.cheatGetVaultEpoch(vault)).extractWhisper()).to.eq('sk-fake')
    TH.expectSyncRefusal(() => TH.cheatGetVaultEpoch({} as never), 'bad_option')
  })

  it("leasedSliceOf: a vault slice holding a lease around the vaultKey it is handed, made under its scope and vault token, as its examples show", async () => {
    const vaultKey = await makeVaultKey()
    const vault = await TH.leasedSliceOf('u1', vaultKey)
    expect(vault.madeUnder).to.deep.equal({ format: 'safebyok-vault-v6', ...TH.scopeOf('u1'), vault_tok: 'vault-tok-u1', registered_at: Date.UTC(2026, 9, 14), vault_epoch: 1, gate_epoch: 1 })
    expect(vault.making()).to.deep.equal({ madeUnder: vault.madeUnder, now: TH.SliceNow })
    expect(vault.lease).to.include({ vault_tok: 'vault-tok-u1', gate_epoch: 1 })
    const box = await Box.seal(vault, { boxlabel: 'anthropic' }, 'sk-fake', vault.making())
    expect(await box.extractWhisper()).to.eq('sk-fake')
  })

  it("leasedSliceOf's demand refuses as the vault's does, and its tryLock drops the lease and counts", async () => {
    const vault = await TH.leasedSliceOf('u1', await makeVaultKey(), { vault_tok: 'vault-tok-other' })
    expect(vault.madeUnder.vault_tok).to.eq('vault-tok-other')
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ vault_tok: 'vault-tok-u1' }) }, 'vault_remade')
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ vault_tok: 'vault-tok-other', gate_epoch: 2 }) }, 'gate_moved')
    await TH.expectGood(vault.tryLock())
    expect(vault.locks).to.eq(1)
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ vault_tok: 'vault-tok-other' }, { leaseBound: true }) }, 'vault_locked')
    vault.gone = true
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ vault_tok: 'vault-tok-other' }) }, 'vault_gone')
  })

  it("vaultRecordOf: a shape-valid VaultRecord, with any field overridden", () => {
    expect(VX.vaultRecord.safeParse(TH.vaultRecordOf('u1')).success).to.be.true
    expect(TH.vaultRecordOf('u1', { gate_epoch: 2 })).to.deep.equal({ ...TH.vaultRecordOf('u1'), gate_epoch: 2 })
  })

  it("noBoxYet and thisVault: the expectations u1's vault meets, before its first box and for a deletion", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    await TH.expectingGood(vaultDB).tryDelVault(TH.scopeOf('u1'), TH.thisVault)
    expect(await TH.vaultRecordIn(vaultDB, TH.scopeOf('u1'))).to.be.null
    expect(Object.isFrozen(TH.noBoxYet)).to.be.true
    expect(Object.isFrozen(TH.thisVault)).to.be.true
  })

  it("inThisVault: the expectation a box read in u1's vault meets, and no other vault's, as its example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    expect(await TH.expectingGood(vaultDB).tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault)).to.deep.equal(TH.boxOf('anthropic', 'one'))
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u2'))
    await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u2'), 'anthropic', TH.inThisVault), 'vault_mismatch')
    expect(Object.isFrozen(TH.inThisVault)).to.be.true
  })

  it("deleting: the expectation a deletion of u1's box meets, naming the revision boxOf gave it, as its example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    expect(await TH.expectingGood(vaultDB).tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one'))).to.deep.equal({ outcome: 'deleted' })
    expect(TH.deleting(null)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: null })
  })

  it("passkeyWayinOf: a shape-valid passkey wayin, with any field overridden", () => {
    const vaultRecord = TH.vaultRecordOf('u1', { gate: TH.gateOf('u1', { passkey: TH.passkeyWayinOf('laptop') }) })
    expect(VX.vaultRecord.safeParse(vaultRecord).success).to.be.true
    expect(TH.passkeyWayinOf('laptop')).to.include({ wayinkind: 'passkey', credential_id: 'cred-laptop' })
    expect(TH.passkeyWayinOf('laptop', { credential_id: 'other' }).credential_id).to.eq('other')
  })

  it("passkeyOf: the same passkey and salt answer the same, another salt or passkey otherwise", async () => {
    const laptop = await TH.passkeyOf('laptop')
    expect(laptop.prfBytes).to.have.lengthOf(32)
    expect(fromB64(laptop.prf_salt_b64)).to.have.lengthOf(PasskeySaltBytes)
    expect(new TextDecoder().decode(fromB64(laptop.credential_id))).to.eq('cred-laptop')
    expect(await TH.passkeyOf('laptop')).to.deep.equal(laptop)
    const phone = await TH.passkeyOf('phone')
    const elsewhere = await TH.passkeyOf('laptop', phone.prf_salt_b64)
    expect(elsewhere.credential_id).to.eq(laptop.credential_id)
    expect(elsewhere.prfBytes).to.not.deep.equal(laptop.prfBytes)
    expect(phone.prfBytes).to.not.deep.equal(laptop.prfBytes)
  })

  it("boxOf: a shape-valid BoxRecord, with any field overridden", () => {
    expect(BX.boxRecord.safeParse(TH.boxOf('anthropic_api_key', 'a1')).success).to.be.true
    expect(TH.boxOf('anthropic_api_key', 'a1').revision_tok).to.eq('rev-a1')
    expect(TH.boxOf('anthropic_api_key', 'a1', { sidecar: { note: 'work account' } }).sidecar).to.deep.equal({ note: 'work account' })
  })
})
// --

// == [Logging and refusals]: spyLogger, loggedText, thrownText, leafTexts, shownOf, jsonOf, expectRefusal, omitting

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

  it("is a logger Bank.make takes", async () => {
    const spy = TH.spyLogger()
    const vault = await TH.settledVault(TH.memoryVaultOpts({ logger: spy.logger }))
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
    expect(spy.calls).to.have.lengthOf(0)
  })
})

const quiet = () => { /* kept out of the test output */ }

describe("quietLogger", () => {
  it("swallows log, and says warn and error to the console as the default logger would", () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(quiet)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(quiet)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(quiet)
    TH.quietLogger.log('opened')
    TH.quietLogger.warn('a refresh failed', { call: 'refresh' })
    TH.quietLogger.error('the adapter is broken')
    expect(consoleLog).toHaveBeenCalledTimes(0)
    expect(consoleWarn).toHaveBeenCalledWith('safebyok: a refresh failed', { call: 'refresh' })
    expect(consoleError).toHaveBeenCalledWith('safebyok: the adapter is broken')
  })

  it("swallows the notice of a test_ deriver, as memoryVaultOpts' vault gets it, so its first example prints nothing", async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(quiet)
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
    expect(consoleWarn).toHaveBeenCalledTimes(0)
  })

  it("lets through a warning about anything but the test_ deriver, even in a vault's options", () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(quiet)
    TH.memoryVaultOpts().logger?.warn('something else', { call: 'make' })
    expect(consoleWarn.mock.calls).to.deep.equal([['safebyok: something else', { call: 'make' }]])
  })

  it("is replaced by a spyLogger handed in its place, as its second example has it", async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(quiet)
    const spy = TH.spyLogger()
    await TH.settledVault(TH.memoryVaultOpts({ logger: spy.logger }))
    expect(spy.calls).to.have.lengthOf(0)
    expect(consoleWarn).toHaveBeenCalledTimes(0)
  })
})

describe("loggedText", () => {
  it("holds each message, story and error, down through every cause and own property", () => {
    const spy = TH.spyLogger()
    const deepest = new Error('deepest cause')
    const tagged = Object.assign(new Error('middle', { cause: deepest }), { detail: 'an own property' })
    spy.logger.error('the message', { call: 'make' }, new Error('the error', { cause: tagged }))
    const text = TH.loggedText(spy.calls)
    for (const piece of ['error', 'the message', '"call":"make"', 'the error', 'middle', 'an own property', 'deepest cause']) {
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
    const leaves = TH.leafTexts({ vault_tok: 'vault-tok-u1', wrapped: { ciphertext_b64: 'ct-a1' }, epoch: 7 })
    expect(leaves).to.deep.equal(['vault-tok-u1', 'ct-a1', '7'])
  })

  it("reaches into arrays, and skips what is neither string nor number", () => {
    expect(TH.leafTexts({ tags: ['one', 2], gone: null, kept: true })).to.deep.equal(['one', '2'])
  })

  it("lists every value of a stored record", () => {
    const leaves = TH.leafTexts(TH.vaultRecordOf('u1'))
    expect(leaves).to.include.members(['vault-tok-u1', 'ct-vault-u1', 'iv-vault-u1', String(Date.UTC(2026, 9, 14))])
  })
})

describe("shownOf and jsonOf", () => {
  /** A model of the shape the package's are: a private field, a getter, a method, and two fields of its own. */
  class Shown {
    readonly #hidden = 'never shown'
    readonly label = 'shown'
    readonly count = 2
    get hidden() { return this.#hidden }
    toJSON() { return { label: this.label } }
  }

  it("shownOf: a model's own fields alone, never a private field or a getter, as its example shows", () => {
    const shown = new Shown()
    expect(TH.shownOf(shown)).to.deep.equal({ label: 'shown', count: 2 })
    expect(TH.shownOf(shown)).to.not.have.property('hidden')
  })

  it("jsonOf: what JSON.stringify writes of it, through its toJSON, read back, as its example shows", () => {
    expect(TH.jsonOf(new Shown())).to.deep.equal({ label: 'shown' })
    expect(Object.keys(TH.jsonOf({ two: 2, one: 1 }))).to.deep.equal(['two', 'one'])
  })
})

describe("expectRefusal", () => {
  it("hands back the VaultError of the kind expected", async () => {
    const refusal = new VaultError('vault_locked', 'Unlock the vault first.')
    expect(await TH.expectRefusal(Promise.reject(refusal), 'vault_locked')).to.eq(refusal)
  })

  it("fails the test when the operation resolves, or refuses with anything but a VaultError of the kind", async () => {
    // As a client rebuilds one from a server's JSON: a subclass of Error that names itself, with a kind.
    class LookalikeError extends Error {
      override readonly name = 'VaultError'
      readonly kind = 'vault_locked'
    }
    const NotQuite = [
      [Promise.resolve('fine'),                                     /operation resolved/],
      [Promise.reject(new VaultError('bad_scope', 'Not a label.')),  /kind/],
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
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    const err = await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(err.message).to.be.a('string').and.not.be.empty
  })
})

describe("expectGood", () => {
  it("hands back a good outcome's val, as its example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const scope = TH.scopeOf('u1')
    expect(await TH.expectGood(vaultDB.tryGetVault(scope))).to.be.null
    expect(await TH.expectGood(good('settled'))).to.eq('settled')
  })

  it("fails the test, naming the refusal, on a bad outcome", async () => {
    const refused = Promise.resolve(bad(new VaultError('stale_write', 'Read it again.')))
    await expect(TH.expectGood(refused)).rejects.toThrow(/stale_write Read it again/)
  })
})

describe("expectBad", () => {
  it("hands back the refusal of the kind expected, as its example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    const err = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'vault_mismatch')
    expect(err).to.be.instanceOf(VaultError)
  })

  it("fails the test on a good outcome, a refusal of another kind, or a rejection", async () => {
    const NotQuite = [
      [Promise.resolve(good('fine')),                                        /outcome was good/],
      [Promise.resolve(bad(new VaultError('bad_scope', 'Not a label.'))),    /refusalkind/],
      [Promise.reject(new VaultError('stale_write', 'Thrown, not resolved.')), /Thrown, not resolved/],
    ] as const
    for (const [operation, complaint] of NotQuite) {
      await expect(TH.expectBad(operation, 'stale_write')).rejects.toThrow(complaint)
    }
  })
})

describe("expectingGood", () => {
  it("answers each verb with its good outcome's val, as its example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    expect(await TH.expectingGood(vaultDB).tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault)).to.be.null
    expect(await TH.vaultRecordIn(vaultDB, TH.scopeOf('u1'))).to.deep.equal(TH.vaultRecordOf('u1'))
  })

  it("fails the test, naming the refusal, on a bad outcome, and leaves every other member as it was", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    await expect(TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))).rejects.toThrow(/vault_mismatch/)
    expect(TH.expectingGood(vaultDB).maxBoxes).to.eq(vaultDB.maxBoxes)
    const unsubscribe = TH.expectingGood(vaultDB).subscribe(TH.scopeOf('u1'), () => undefined)
    expect(unsubscribe).to.be.a('function')
    unsubscribe()
  })
})

describe("omitting", () => {
  const opts = TH.memoryVaultOpts()

  it("leaves out the one field named, and keeps the rest", () => {
    const without = TH.omitting(opts, 'keyDeriver')
    expect(without).to.not.have.property('keyDeriver')
    expect(Object.keys(without)).to.have.members(['applabel', 'user_id', 'vaultlabel', 'vaultDB', 'deviceDB', 'strengthChecker', 'requestCleartext', 'logger'])
    expect(opts.keyDeriver).to.eq(TH.testDeriver)
  })

  it("hands an entrypoint a bag short of a required option, with no cast", async () => {
    const err = await TH.expectRefusal(TH.settledVault(TH.omitting(opts, 'keyDeriver')), 'bad_option')
    expect(err.message).to.include('safebyok/browser')
  })
})

describe("raceOutcomeOf", () => {
  it("reads a verb refused with an Error that only names itself a VaultError as no Outcome at all, so a race's verdict fails that adapter", async () => {
    // As a client rebuilds one from a server's JSON: an Error that names itself, with a kind.
    class LookalikeError extends Error {
      override readonly name = 'VaultError'
      readonly refusalkind = 'stale_write'
    }
    const lookalike = new LookalikeError('Another device wrote first.')
    const posing = await raceOutcomeOf(Promise.resolve({ ok: false, err: lookalike }))
    expect(posing.kind).to.eq('landed')
  })
})
// --

// == [perUser]: perUser, HostDeviceDB, servingOnly, counted

/**
 * The smallest honest DeviceDB, as the README's recipe writes a host's own: a subclass over one
 * map, each `do*` method its own step. Given `withheld`, every touch of the map throws that, as a
 * browser's store does when it withholds itself.
 */
class HostDeviceDB extends DeviceDB {
  readonly #rows = new Map<string, unknown>()
  readonly #withheld: Error | undefined

  constructor(withheld?: Error) {
    super()
    this.#withheld = withheld
  }

  protected async doGetLease(leaseScopepath: string) { return await this.#touched(() => this.#rows.get(leaseScopepath)) }
  protected async doPutLease(leaseScopepath: string, record: LeaseRecord) { await this.#touched(() => this.#rows.set(leaseScopepath, record)) }
  protected async doDelLease(leaseScopepath: string) { await this.#touched(() => this.#rows.delete(leaseScopepath)) }
  protected async doGetDeviceRecord(deviceScopepath: string) { return await this.#touched(() => this.#rows.get(deviceScopepath)) }
  protected async doRaiseDeviceRecord(deviceScopepath: string, raisedFrom: (stored: unknown) => DeviceRecord) {
    await this.#touched(() => this.#rows.set(deviceScopepath, raisedFrom(this.#rows.get(deviceScopepath))))
  }
  protected async doDelDeviceRecord(deviceScopepath: string) { await this.#touched(() => this.#rows.delete(deviceScopepath)) }
  protected async doDelAll() { await this.#touched(() => { this.#rows.clear() }) }
  protected async doDelUnparsed(scopepath: string, isSound: (row: unknown) => boolean) {
    await this.#touched(() => { if (! isSound(this.#rows.get(scopepath))) { this.#rows.delete(scopepath) } })
  }

  /** What `touch` does to the map, in one synchronous step, or the throw of a store withheld. */
  #touched<ValT>(touch: () => ValT): Promise<ValT> {
    if (this.#withheld !== undefined) { return Promise.reject(this.#withheld) }
    return Promise.resolve(touch())
  }
}

const hostDeviceDB = (withheld?: Error): DeviceDB => new HostDeviceDB(withheld)

TH.describeDeviceDB('describeDeviceDB, over the smallest honest DeviceDB', () => hostDeviceDB(), () => hostDeviceDB(new DOMException('The operation is insecure.', 'SecurityError')))

/**
 * A server's VaultDB for one signed-in user, over a store every user's vaults share: it refuses
 * any scope naming someone else, as a server's must, so the VaultDB suite reaches it only through
 * `perUser`. A blank or missing `user_id` is no one signed in, as a real server reads it: it
 * refuses everything.
 */
const servingOnly = (signedIn: string | null, store: StringStore): TH.VaultDBVerbs => {
  const shared = localVaultDB({ store })
  const refusalFor = ({ user_id }: { user_id: string }): VaultError | null => (
    signedIn === null || signedIn === '' || user_id !== signedIn ? new VaultError('identity_revoked', "That vault belongs to someone other than the user signed in.") : null
  )
  const permitted = async <ValT>(scope: { user_id: string }, call: () => Promise<Outcome<ValT>>): Promise<Outcome<ValT>> => {
    const refusal = refusalFor(scope)
    return refusal === null ? await call() : bad(refusal)
  }
  return {
    maxRecordBytes:   shared.maxRecordBytes,
    maxVaultBytes:    shared.maxVaultBytes,
    maxBoxes:         shared.maxBoxes,
    maxNameBytes:     shared.maxNameBytes,
    tryGetVault:           (scope) => permitted(scope, () => shared.tryGetVault(scope)),
    tryEnsureVault:        (draft) => permitted(draft, () => shared.tryEnsureVault(draft)),
    tryGetVaultRecords:    (scope) => permitted(scope, () => shared.tryGetVaultRecords(scope)),
    tryEnsureVaultRecords: (draft) => permitted(draft, () => shared.tryEnsureVaultRecords(draft)),
    tryPutVaultRecord:   (vaultRecord, expected) => permitted(vaultRecord, () => shared.tryPutVaultRecord(vaultRecord, expected)),
    tryGetBox:           (scope, boxlabel, expected) => permitted(scope, () => shared.tryGetBox(scope, boxlabel, expected)),
    tryPutBox:           (scope, expected, box) => permitted(scope, () => shared.tryPutBox(scope, expected, box)),
    tryGetCapacity:      (scope) => permitted(scope, () => shared.tryGetCapacity(scope)),
    tryDelBox:           (scope, boxlabel, expected) => permitted(scope, () => shared.tryDelBox(scope, boxlabel, expected)),
    tryDelVault:         (scope, expected) => permitted(scope, () => shared.tryDelVault(scope, expected)),
    tryDelDamagedVault:  (scope) => permitted(scope, () => shared.tryDelDamagedVault(scope)),
    subscribe:        (scope, onChange) => {
      const refusal = refusalFor(scope)
      if (refusal !== null) { throw refusal }
      return shared.subscribe(scope, onChange)
    },
  }
}

TH.describeVaultDB('perUser, over a VaultDB serving one user', () => {
  const store = memoryStore()
  return TH.perUser((user_id) => servingOnly(user_id, store))
}, {
  makeVaultDBFor: () => {
    const store = memoryStore()
    return (user_id) => servingOnly(user_id, store)
  },
})

/** perUser over servingOnly, with the user ids it asked a VaultDB for, in order. */
const counted = () => {
  const store = memoryStore()
  const askedFor: string[] = []
  const vaultDB = TH.perUser((user_id) => { askedFor.push(user_id); return servingOnly(user_id, store) })
  return { vaultDB, askedFor, store }
}

describe("perUser", () => {
  it("sends each verb to the VaultDB of the user its scope or vault record names", async () => {
    const { vaultDB, store } = counted()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u2'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u2'), { vault_tok: 'vault-tok-u2', revision_tok: null }, TH.boxOf('anthropic', 'two'))
    expect(await TH.expectingGood(servingOnly('u2', store)).tryGetBox(TH.scopeOf('u2'), 'anthropic', { vault_tok: 'vault-tok-u2' })).to.deep.equal(TH.boxOf('anthropic', 'two'))
    expect(await TH.boxesOf(vaultDB, TH.scopeOf('u1'))).to.have.lengthOf(0)
  })

  it("sends putVaultRecord, subscribe, delBox and delVault to the user named, too", async () => {
    const { vaultDB, store } = counted()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u2'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u2'), { vault_tok: 'vault-tok-u2', revision_tok: null }, TH.boxOf('anthropic', 'two'))
    await TH.expectingGood(vaultDB).tryPutVaultRecord({ ...TH.vaultRecordOf('u2'), gate_epoch: 2 }, { vault_tok: 'vault-tok-u2', gate_epoch: 1 })
    vaultDB.subscribe(TH.scopeOf('u2'), () => undefined)()
    await TH.expectingGood(vaultDB).tryDelBox(TH.scopeOf('u2'), 'anthropic', { vault_tok: 'vault-tok-u2', revision_tok: 'rev-two' })
    expect(await TH.boxesOf(servingOnly('u2', store), TH.scopeOf('u2'))).to.have.lengthOf(0)
    await TH.expectingGood(vaultDB).tryDelVault(TH.scopeOf('u2'), { vault_tok: 'vault-tok-u2', gate_epoch: 2 })
    expect(await TH.vaultRecordIn(servingOnly('u2', store), TH.scopeOf('u2'))).to.be.null
    expect(await TH.vaultRecordIn(servingOnly('u1', store), TH.scopeOf('u1'))).to.deep.equal(TH.vaultRecordOf('u1'))
  })

  it("refuses a blank user_id as a server does for no one signed in, never as a bad label", async () => {
    const { vaultDB } = counted()
    await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('')), 'identity_revoked')
    await TH.expectBad(vaultDB.tryEnsureVault(TH.gatelessOf('')), 'identity_revoked')
  })

  it("makes each user's VaultDB once, and keeps it", async () => {
    const { vaultDB, askedFor } = counted()
    await TH.vaultRecordIn(vaultDB, TH.scopeOf('u1'))
    await TH.vaultRecordIn(vaultDB, TH.scopeOf('u1', 'spare'))
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    vaultDB.subscribe(TH.scopeOf('u2'), () => undefined)()
    expect(askedFor).to.deep.equal(['anyone', 'u1', 'u2'])
  })

  it("has the limits of the VaultDB it made for anyone", () => {
    const store = memoryStore()
    const limitedBy = (user_id: string): TH.VaultDBVerbs => ({
      ...servingOnly(user_id, store),
      maxRecordBytes: user_id === 'anyone' ? 4096 : 1,
      maxVaultBytes:  user_id === 'anyone' ? 65_536 : 1,
      maxBoxes:       user_id === 'anyone' ? 250 : 1,
    })
    expect(TH.perUser(limitedBy)).to.include({ maxRecordBytes: 4096, maxVaultBytes: 65_536, maxBoxes: 250 })
  })

  it("passes on a refusal from the user's VaultDB", async () => {
    const store = memoryStore()
    const onlyU1 = TH.perUser(() => servingOnly('u1', store))
    await TH.expectBad(onlyU1.tryGetVault(TH.scopeOf('u2')), 'identity_revoked')
  })
})

// ------------------------------------------------- the races, against adapters that do not guard
// --

// == [Unguarded adapters]: RoundTripBackend, Stepping, inOneStep, checkThenWrite, RoundTripOpts, roundTripDevices, checksOver, others

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

/** A write taken apart: its check of what is stored, and the write itself, each on the rows. */
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
type RoundTripOpts = VaultDBOpts & {
  stepping:     Stepping
  maxBoxes?:    number | undefined
  /** Counts the vault in a round trip of its own, before a new box's write: honest, and best effort. */
  countsApart?:     boolean
  /** Lists no more boxes than its limit: a listing cut short. */
  listsToLimit?:    boolean
  /** Reads a vault's props in one round trip and its boxes in the next, so a write may land between. */
  readsApart?:      boolean
  /** Writes a new box into a full vault, then refuses it as full all the same: a refusal that leaves its box behind. */
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
  readonly maxBoxes: number
  readonly maxNameBytes = Infinity
  private readonly backend: RoundTripBackend
  private readonly opts: RoundTripOpts
  private readonly ownListeners = new Set<() => void>()

  constructor(backend: RoundTripBackend, opts: RoundTripOpts) {
    // Quiet unless the test hands it a logger: a spy's, kept out of the test output.
    super({ ...opts, logger: opts.logger ?? TH.spyLogger().logger })
    this.backend = backend
    this.opts = opts
    this.maxBoxes = opts.maxBoxes ?? Infinity
  }

  protected async doGetVault(scope: VaultScope): Promise<StoredVault> {
    if (! this.opts.readsApart) { return await this.backend.atomically((rows) => vaultIn(rows, scope, this.opts.listsToLimit ? this.maxBoxes : Infinity)) }
    const vault = await this.backend.atomically((rows) => rows.get(Scopepath.vault(scope)) ?? null)
    return { vault, ...splitStoredBoxes(await this.backend.atomically((rows) => boxesIn(rows, scope))) }
  }

  // What it hands back is the vault as the step that checked, or that wrote, left it.
  protected async doEnsureVault(draft: VaultDraft): Promise<StoredVault> {
    const vaultScopepath = Scopepath.vault(draft)
    const seen: { vault: StoredVault } = { vault: { vault: null, boxes: [], damagedBoxes: [] } }
    const absent = (rows: Rows) => {
      seen.vault = vaultIn(rows, draft)
      return Expectations.newLifeOf(draft, rows.get(vaultScopepath)) !== null
    }
    const create = (rows: Rows) => {
      rows.set(vaultScopepath, Expectations.newLifeOf(draft, rows.get(vaultScopepath)))
      seen.vault = vaultIn(rows, draft)
    }
    await this.step({ check: absent, write: create })
    return seen.vault
  }

  protected async doPutVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation) {
    const vaultScopepath = Scopepath.vault(vaultRecord)
    // The refusal a miss throws, from the row its check read.
    const missed: { refusal: VaultError | null } = { refusal: null }
    const meets = (rows: Rows) => {
      missed.refusal = Expectations.vaultRecordRefusalOf(rows.get(vaultScopepath), expected)
      return missed.refusal === null
    }
    const stored: { vaultRecord: unknown } = { vaultRecord: null }
    const write = (rows: Rows) => {
      stored.vaultRecord = Expectations.vaultRecordPutOf(vaultRecord, rows.get(vaultScopepath))
      rows.set(vaultScopepath, stored.vaultRecord)
    }
    if (await this.step({ check: meets, write })) { return stored.vaultRecord }
    throw missed.refusal ?? new Error('a write that did not land, with no refusal from its check')
  }

  protected async doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation) {
    const read = await this.backend.atomically((rows) => (vaultIs(rows, scope, expected) ? { box: rows.get(Scopepath.box({ ...scope, boxlabel })) ?? null } : null))
    if (read === null) { throw Refusals.vaultMismatch() }
    return read.box
  }

  protected async doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord) {
    const boxScopepath = Scopepath.box({ ...scope, boxlabel: box.boxlabel })
    const isNew = expected.revision_tok === null
    const full = (rows: Rows) => isNew && boxesIn(rows, scope).length >= this.maxBoxes
    if (this.opts.countsApart && await this.backend.atomically((rows) => full(rows) && vaultIs(rows, scope, expected) && ! rows.has(boxScopepath))) {
      throw await this.backend.atomically((rows) => Refusals.vaultFull(capacityIn(rows, scope, this.maxBoxes)))
    }
    // The refusal a miss throws, from the rows its check read.
    const missed: { refusal: VaultError | null } = { refusal: null }
    const meets = (rows: Rows) => {
      missed.refusal = Expectations.boxRefusalOf(rows.get(Scopepath.vault(scope)), rows.get(boxScopepath), expected)
      if (missed.refusal) { return false }
      if (! this.opts.countsApart && full(rows)) {
        if (this.opts.keepsRefused) { rows.set(boxScopepath, box) }
        throw Refusals.vaultFull(capacityIn(rows, scope, this.maxBoxes))
      }
      return true
    }
    // What it set is what it holds: its rows keep each record as it was handed them.
    if (await this.step({ check: meets, write: (rows) => { rows.set(boxScopepath, box) } })) { return box }
    throw missed.refusal ?? new Error('a write that did not land, with no refusal from its check')
  }

  protected doGetCapacity(scope: VaultScope) { return this.backend.atomically((rows) => capacityIn(rows, scope, this.maxBoxes)) }

  // What it removed is what the doDelBox found stored, in the same step.
  protected async doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation) {
    const boxScopepath = Scopepath.box({ ...scope, boxlabel })
    const removed: { box?: unknown } = {}
    const remove = (rows: Rows) => {
      removed.box = rows.get(boxScopepath)
      rows.delete(boxScopepath)
    }
    return await this.step({ check: (rows) => vaultIs(rows, scope, expected), write: remove }) ? Expectations.deletionOf(removed.box, expected) : null
  }

  protected async doDelVault(scope: VaultScope, expected: VaultDelExpectation) {
    const tombstone: { left: unknown } = { left: null }
    const remove = (rows: Rows) => {
      const isBox = Scopepath.withinVaultScopepathPred(scope)
      for (const ckey of rows.keys()) {
        if (isBox(ckey)) { rows.delete(ckey) }
      }
      rows.set(Scopepath.vault(scope), tombstone.left)
    }
    const meets = (rows: Rows) => {
      tombstone.left = Expectations.tombstoneOf(rows.get(Scopepath.vault(scope)), scope, expected)
      return tombstone.left !== null
    }
    return await this.step({ check: meets, write: remove }) ? tombstone.left : null
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

const vaultIs = (rows: Rows, scope: VaultScope, expected: { vault_tok: string }) => Expectations.vaultMeets(rows.get(Scopepath.vault(scope)), expected)

/** The vault of `scope` in `rows`: its vault record, or null, and its boxes. */
const vaultIn = (rows: Rows, scope: VaultScope, listedUpTo = Infinity): StoredVault => (
  { vault: rows.get(Scopepath.vault(scope)) ?? null, ...splitStoredBoxes(boxesIn(rows, scope).slice(0, listedUpTo)) }
)

const boxesIn = (rows: Rows, scope: VaultScope): StoredBox[] => {
  const prefix = Scopepath.withinVaultScopepathPrefix(scope)
  const isWithinVault = Scopepath.withinVaultScopepathPred(scope)
  return [...rows].filter(([ckey]) => isWithinVault(ckey)).map(([ckey, box]) => ({ boxlabel: ckey.slice(prefix.length), box: box as StoredBox['box'] }))
}

/** How full `scope` is in `rows`: its boxes counted, each weighed as its row's JSON, against `maxBoxes` and no limit on bytes. */
const capacityIn = (rows: Rows, scope: VaultScope, maxBoxes: number): Capacity => {
  const boxes = boxesIn(rows, scope)
  const bytesUsed = boxes.reduce((sum, { box }) => sum + new TextEncoder().encode(JSON.stringify(box)).length, 0)
  return { boxes: { used: boxes.length, max: maxBoxes }, bytes: { used: bytesUsed, max: Infinity } }
}

/**
 * makeDevices for a RoundTripVaultDB: a fresh backend, and devices over it, each with `opts` --
 * its round trips through the race's turnstile, unless `unwired`.
 */
const roundTripDevices = (opts: RoundTripOpts & { overTheWire?: boolean, unwired?: boolean, slowSecond?: boolean }): TH.MakeVaultDBDevices => (turnstile) => {
  const backend = new RoundTripBackend(opts.overTheWire ?? false)
  const reached = opts.unwired ? backend : TH.throughTurnstile(turnstile, backend, ['atomically'])
  let made = 0
  return ({ maxBoxes }) => {
    made += 1
    return new RoundTripVaultDB(reached, { ...opts, maxBoxes, preludes: made === 2 && opts.slowSecond ? 6 : 0 })
  }
}

/** A turnstile no race holds. */
const unheldTurnstile: TH.Turnstile = { pass: () => Promise.resolve() }

/** The battery's options for a RoundTripVaultDB with `opts`: a fresh adapter, a capped one, its devices, and its push. */
const roundTripBattery = (opts: RoundTripOpts & { overTheWire?: boolean, unwired?: boolean, slowSecond?: boolean }) => {
  const makeDevices = roundTripDevices(opts)
  const oneDevice = async (maxBoxes?: number, vaultDBOpts: VaultDBOpts = {}) => (await roundTripDevices({ ...opts, ...vaultDBOpts })(unheldTurnstile))({ maxBoxes })
  const fresh: TH.MakeVaultDB = (vaultDBOpts) => oneDevice(undefined, vaultDBOpts)
  return [fresh, { makeCappedVaultDB: oneDevice, makeDevices, pushes: true }] as const
}

TH.describeVaultDB('an honest adapter making round trips through the turnstile', ...roundTripBattery({ stepping: inOneStep }))
TH.describeVaultDB('an honest adapter that counts a vault apart from its write, as a best effort', ...roundTripBattery({ stepping: inOneStep, countsApart: true }))

/** The races a write whose check and write are apart loses, in some interleaving. */
const SplitLosses = ['rivalEnsures', 'rivalVaultRecordUpdates', 'rivalFirstGates', 'rivalFirstWrites', 'resentFirstWrites', 'rivalReplacements', 'delBeatsReplacement', 'vaultDelBeatsWrite'] as const

/** The battery's checks over a check-then-write adapter whose devices share one lock, a fresh one for each call. */
const lockedChecks = () => checksOver({ stepping: checkThenWriteUnder(sharedLock()), overTheWire: true })

/** A check run as an assertion: it rejects, failing the test, when what it checks does not hold. */
const expectToHold = (check: TH.VaultDBTimingCheck): Promise<void> => check.check()

/** The checks of the battery over an adapter, by handle. */
const checksOver = (opts: RoundTripOpts & { overTheWire?: boolean, unwired?: boolean, slowSecond?: boolean }) => TH.vaultDBTimingChecks(...roundTripBattery(opts))

/** Timers fired before {@link onFakeClock} calls its work hung: far more than any battery's round trips. */
const FakeClockTimerLimit = 100_000

/**
 * What `work` resolves to, run on a fake clock: each timer it sets fires, in the order a real clock
 * would fire it, once nothing else can run. A round trip over the wire costs a turn of the event
 * loop rather than the millisecond or more a real `setTimeout` waits, so a battery of thousands
 * runs in a fraction of a second however loaded the machine is; and a race's watchdog falls due
 * only when nothing else is pending, as when an adapter has hung. Rejects as `work` does, with
 * every timer it left run first.
 */
const onFakeClock = async <ValT>(work: () => Promise<ValT>): Promise<ValT> => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], loopLimit: FakeClockTimerLimit })
  try {
    const [worked, ran] = await Promise.allSettled([work(), vi.runAllTimersAsync()])
    if (ran.status === 'rejected') { throw ran.reason }
    if (worked.status === 'rejected') { throw worked.reason }
    return worked.value
  } finally {
    vi.useRealTimers()
  }
}
// --

// == [Conformance checks]: expectRoundTripsThroughTurnstile, vaultDBTimingChecks, VaultDBContract

describe("expectRoundTripsThroughTurnstile", () => {
  it("passes devices that send every write through the turnstile", async () => {
    await TH.expectRoundTripsThroughTurnstile(roundTripDevices({ stepping: inOneStep }))
  })

  it("fails devices whose writes reach the backend without passing it, naming the first", async () => {
    await expect(TH.expectRoundTripsThroughTurnstile(roundTripDevices({ stepping: inOneStep, unwired: true }))).rejects.toThrow(/^ensureVault reached the backend without passing the turnstile/)
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
    await onFakeClock(async () => {
      for (const handle of SplitLosses) { await expectToHold(checks[handle]) }
    })
  })

  it("lets the writes of different boxes through a check-then-write adapter land, as they should", async () => {
    const checks = checksOver({ stepping: checkThenWrite, overTheWire: true })
    await expectToHold(checks.apartNewBoxes)
    await expectToHold(checks.apartReplaceAndDel)
  })

  it("fails a check-then-write hidden behind a lock its devices share, once the turnstile holds one inside it", async () => {
    await Promise.all([
      expect(lockedChecks().rivalFirstWrites.check()).rejects.toThrow(/held before its round trip 1 while two moved": a device's move did not finish .* share something/),
      expect(lockedChecks().apartNewBoxes.check()).rejects.toThrow(/held before its round trip 1 while two moved": a device's move did not finish/),
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
    await expect(apart.rivalEnsures.check()).rejects.toThrow(/^Under the schedule "made together"/)
  })

  it("fails a vault read whose props and boxes are two round trips apart, once a remaking lands between them", async () => {
    await expect(checksOver({ stepping: inOneStep, readsApart: true, overTheWire: true }).readBesideRemake.check()).rejects.toThrow(/a read showed one vault beside another's boxes/)
  })

  it("passes a vault read in one round trip, whatever lands beside it", async () => {
    await expectToHold(checksOver({ stepping: inOneStep, overTheWire: true }).readBesideRemake)
  })

  it("fails a listing cut short at the limit, once a roomier device has taken the vault past it", async () => {
    await expect(checksOver({ stepping: inOneStep, listsToLimit: true }).pastLimitFromRoomierDevice.check()).rejects.toThrow(/to have the same members/)
  })

  it("fails a crowd for the last place whose refused racers leave their boxes behind", async () => {
    await expect(checksOver({ stepping: inOneStep, keepsRefused: true }).crowdForLastPlace.check()).rejects.toThrow(/^Under the schedule "made together": expected /)
  })

  it("takes a vault past its limit, for real, when racers' counts are apart from their writes", async () => {
    const landedCounts: number[] = []
    await TH.raceEveryWay({
      makeDevices: async (turnstile) => {
        const deviceFor = await roundTripDevices({ stepping: inOneStep, overTheWire: true, countsApart: true })(turnstile)
        return () => deviceFor({ maxBoxes: 3 })
      },
      setup:   async (first) => { await TH.ensureGated(first, TH.vaultRecordOf('u1')); await TH.expectingGood(first).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')) },
      moves:   ['openai', 'mistral', 'gemini', 'cohere'].map((boxlabel) => (racer: TH.VaultDBVerbs) => racer.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf(boxlabel, boxlabel))),
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
      put:       (ckey, text) => { ringNow(); store.put(ckey, text) },
      del:       (ckey) => { ringNow(); store.del(ckey) },
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    }
    const checks = TH.vaultDBTimingChecks(() => localVaultDB({ store: earlyStore }), { pushes: true })
    await expect(checks.pushEachWrite.check()).rejects.toThrow(/no call to onChange read the vault as the write left it/)
  }, 10_000)

  it("fails an unsubscribe that leaves its listener listening, as an adapter overriding subscribe could", async () => {
    // The base class's subscribe ends a watch whatever the adapter's unsubscribe does, so only a
    // VaultDB that replaces it can leak.
    const leaky = () => {
      const vaultDB = localVaultDB({ store: memoryStore() })
      const subscribe: TH.VaultDBVerbs['subscribe'] = (scope, onChange) => { vaultDB.subscribe(scope, onChange); return noDevice }
      return new Proxy(vaultDB, { get: (target, prop): unknown => (prop === 'subscribe' ? subscribe : Reflect.get(target, prop)) })
    }
    const checks = TH.vaultDBTimingChecks(leaky, { pushes: true })
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
  Array.from(markdown.matchAll(BoldLines), ([_match, line = '', title = '']): [string, string] => [line, title.replaceAll(/\s+/gu, ' ')]),
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
// --

// == [Gating helpers]: scriptedRequestCleartext, answering, tryUnlock, unlock, putWayin, delWayin, del

describe("the gating helpers", () => {
  it("answer a bank's gatings as scripted, given scriptedRequestCleartext, as its example shows", async () => {
    const { vaultlabel, requestCleartext: _scripted, ...opts } = TH.memoryVaultOpts()
    const bank = Bank.make({ ...opts, requestCleartext: TH.scriptedRequestCleartext })
    const vault = await bank.ensureVault({ vaultlabel })
    await TH.unlock(vault, 'pw')
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
  })

  it("decline the next gating when answering scripts it so, as answering's example shows", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    TH.answering(vault, (gating) => { gating.decline() })
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')
  })

  it("resolve a wrong passphrase's refusal from tryUnlock, as its example shows", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    await TH.unlock(vault, 'pw')
    await vault.lock()
    const { ok, err } = await TH.tryUnlock(vault, 'wrong')
    expect(ok).to.be.false
    expect(err?.refusalkind).to.eq('wrong_passphrase')
  })

  it("unlock by the passphrase and by a passkey's answer, as unlock's examples show", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    await TH.unlock(vault, 'correct horse battery staple')
    await TH.putWayin(vault, 'correct horse battery staple', await TH.passkeyOf('laptop'))
    await vault.lock()
    await TH.unlock(vault, await TH.passkeyOf('laptop'))
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
  })

  it("put a new passphrase and a passkey, resolving each one's summary, as putWayin's examples show", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    const passphrase = 'pw'
    await TH.unlock(vault, passphrase)
    const summary = await TH.putWayin(vault, passphrase, 'a new passphrase')
    expect(summary).to.deep.equal(vault.snapshot.gate?.passphrase)
    const passkey = await TH.putWayin(vault, 'a new passphrase', await TH.passkeyOf('laptop'))
    expect(passkey).to.deep.equal(vault.snapshot.gate?.passkey)
  })

  it("take the passkey away, and delete the vault, as delWayin's and del's examples show", async () => {
    const vault = await TH.settledVault(TH.memoryVaultOpts())
    const passphrase = 'pw'
    await TH.unlock(vault, passphrase)
    await TH.putWayin(vault, passphrase, await TH.passkeyOf('laptop'))
    await TH.delWayin(vault, passphrase)
    expect(vault.snapshot.gate?.passkey).to.be.null
    await TH.del(vault, passphrase)
    await TH.expectRefusal(vault.hello(), 'vault_gone')
  })
})
// --
