import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bank, DefaultPesterMillis, DefaultRefreshMillis } from '../../src/models/bank'
import { DefaultLeaseMillis } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { testDeriver } from '../test-helpers/builders'
import { Dna, T0, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()
useBankWorlds()

afterEach(() => { vi.unstubAllGlobals() })

describe("Bank's construction: its options, its clock and the secure context", () => {
  it("takes its scope, device_id and defaults from its options, and the clock handed as _cheat_clock", () => {
    const { bank } = makeBankWorld()
    expect(bank.scope).to.deep.equal({ applabel: Dna.applabel, user_id: Dna.user_id })
    expect(bank.device_id).to.eq('device-1')
    expect(bank.clock.now()).to.eq(T0)
    expect(bank.leaseMillis).to.eq(DefaultLeaseMillis)
    expect(bank.pesterMillis).to.eq(DefaultPesterMillis)
    expect(bank.boxRefreshMillis).to.eq(DefaultRefreshMillis)
    expect(Object.isFrozen(bank)).to.be.true
  })

  it("reads the wall clock where no _cheat_clock is handed, and minutes from its options", () => {
    const { bankOpts } = makeBankWorld(null, { autolockMinutes: 3, pesterMinutes: 60 })
    const bank = Bank.make(bankOpts)
    expect(bank.autolockMinutes).to.eq(3)
    expect(bank.pesterMinutes).to.eq(60)
    expect(Math.abs(bank.clock.now() - Date.now())).to.be.below(1000)
    bank.goodbye()
  })

  it("refuses 'bad_option' options missing a vaultDB verb, a deviceDB without vaultCache, or a _cheat_clock that is no clock", () => {
    const { bankOpts, opts } = makeBankWorld()
    TH.expectSyncRefusal(() => new Bank({ ...bankOpts, vaultDB: TH.omitting(opts.store, 'watch') }), 'bad_option')
    TH.expectSyncRefusal(() => new Bank({ ...bankOpts, deviceDB: TH.omitting(bankOpts.deviceDB, 'vaultCache') }), 'bad_option')
    TH.expectSyncRefusal(() => new Bank(bankOpts, { now: 3 } as never), 'bad_option')
  })

  it("refuses 'insecure_context' outside a secure context", () => {
    const { bankOpts } = makeBankWorld()
    vi.stubGlobal('isSecureContext', false)
    TH.expectSyncRefusal(() => Bank.make(bankOpts), 'insecure_context')
  })
})

describe("Bank.hello and the bank's lifecycle", () => {
  it("reads 'starting' until hello, then 'ready', warming the vault listing from the device's cache", async () => {
    const record = await storedVaultRecord()
    const { bankOpts, opts, listing } = makeBankWorld()
    const copy = { ...listing.sparseOf(record), central: record, staged: null }
    const { bank } = makeBankWorld(record, { deviceDB: { ...bankOpts.deviceDB, vaultCache: () => ({ ...opts.cache, load: () => Promise.resolve([copy]) }) } })
    expect(bank.snapshot.lifecycle).to.eq('starting')
    expect(bank.snapshot.vaults).to.have.lengthOf(0)
    await bank.hello()
    expect(bank.snapshot.lifecycle).to.eq('ready')
    expect(bank.snapshot.vaults).to.have.lengthOf(1)
    expect(bank.vaultOf({ vaultlabel: Dna.vaultlabel })?.vault_tok).to.eq(record.vault_tok)
  })

  it("awaits the key deriver's load bare: a load that fails refuses with its own error, the bank reads 'refused', and tryHello's Outcome carries it", async () => {
    const trouble = new Error('the wasm would not load')
    const load = vi.fn().mockRejectedValueOnce(trouble).mockRejectedValueOnce(trouble).mockResolvedValue(undefined)
    const { bank } = makeBankWorld(null, { keyDeriver: { ...testDeriver, load } })
    await expect(bank.hello()).rejects.toBe(trouble)
    expect(bank.snapshot.lifecycle).to.eq('refused')
    const answer = await bank.tryHello()
    expect(answer.ok ? null : answer.err.refusalkind).to.eq('unexpected_error')
    expect(answer.ok ? null : answer.err.cause).to.equal(trouble)
    expect(bank.snapshot).to.include({ lifecycle: 'refused' })
    await bank.hello()
    expect(bank.snapshot.lifecycle).to.eq('ready')
  })

  it("joins a hello in flight, loading the deriver once, and stays 'ready' through another", async () => {
    const load = vi.fn(() => Promise.resolve())
    const { bank } = makeBankWorld(null, { keyDeriver: { ...testDeriver, load } })
    const seen: string[] = []
    bank.subscribe(() => { seen.push(bank.snapshot.lifecycle) })
    await Promise.all([bank.hello(), bank.hello()])
    expect(load).toHaveBeenCalledOnce()
    await bank.hello()
    expect(load).toHaveBeenCalledTimes(2)
    expect(seen.filter((lifecycle) => lifecycle !== 'ready')).to.have.lengthOf(0)
    expect(bank.snapshot.lifecycle).to.eq('ready')
  })
})

describe("Bank's snapshot and subscription", () => {
  it("keeps the snapshot's identity until something changes, then tells each listener, and an unsubscribed one no more", async () => {
    const { bank } = makeBankWorld()
    const before = bank.getSnapshot()
    expect(bank.getSnapshot()).to.equal(before)
    expect(Object.isFrozen(before)).to.be.true
    const listener = vi.fn()
    const unsubscribe = bank.subscribe(listener)
    await bank.hello()
    expect(listener).toHaveBeenCalled()
    expect(bank.getSnapshot()).to.not.equal(before)
    const ready = bank.getSnapshot()
    expect(bank.toJSON()).to.equal(ready)
    unsubscribe()
    listener.mockClear()
    await bank.ensureVault({ vaultlabel: Dna.vaultlabel })
    expect(listener).not.toHaveBeenCalled()
    expect(bank.getSnapshot().vaults).to.have.lengthOf(1)
    expect(bank.getSnapshot()).to.include({ lifecycle: 'ready', device_id: 'device-1', ...bank.scope })
  })

  it("calls every listener though one throws", async () => {
    const { bank } = makeBankWorld()
    const after = vi.fn()
    bank.subscribe(() => { throw new Error('a listener of the host') })
    bank.subscribe(after)
    await bank.hello()
    expect(after).toHaveBeenCalled()
  })

  it("refuses 'bad_option' a listener that is no function", () => {
    const { bank } = makeBankWorld()
    TH.expectSyncRefusal(() => bank.subscribe('not a function' as never), 'bad_option')
  })
})
