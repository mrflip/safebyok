import { describe, expect, it, vi } from 'vitest'
import { memoryDeviceDB } from '../../src/devicedb/memory'
import { VaultError } from '../../src/errors'
import type { BankVaultDB } from '../../src/models/bank'
import type { BoxStore } from '../../src/models/box-listing'
import type { AnyGating } from '../../src/models/gating'
import type { VaultRecord } from '../../src/models/models-shapes'
import type { VaultStore } from '../../src/models/vault-listing'
import { bad } from '../../src/outcome'
import type { VaultScope } from '../../src/shapes/scopes'
import * as TH from '../test-helpers'
import { makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()
useBankWorlds()

const Main = Object.freeze({ vaultlabel: Dna.vaultlabel })
const Work = Object.freeze({ vaultlabel: 'work' })

const noWatch = (): void => undefined

/** A vaultDB holding a vault for each vaultlabel, where the vault world's holds one in all; it checks no prior revision, and its box stores are never called. */
const vaultDBByLabel = (): BankVaultDB => ({ vaultStore: vaultStoreByLabel, boxStore: () => unusedBoxStore })

const unusedBoxStore: BoxStore = {
  get:   () => Promise.reject(new Error("Not in these tests.")),
  put:   () => Promise.reject(new Error("Not in these tests.")),
  del:   () => Promise.reject(new Error("Not in these tests.")),
  watch: () => noWatch,
}

const vaultStoreByLabel = (): VaultStore => {
  const stored = new Map<string, VaultRecord>()
  const answerOf = (scope: VaultScope, val: VaultRecord | null) => ({ scope, ok: true as const, val, world: null })
  return {
    get:   (scope) => Promise.resolve(answerOf(scope, stored.get(scope.vaultlabel) ?? null)),
    put:   (record) => {
      stored.set(record.vaultlabel, record)
      return Promise.resolve(answerOf(record, record))
    },
    del:   () => Promise.reject(new Error("Not in these tests.")),
    watch: () => noWatch,
  }
}

// == [Closing a vault]: closeVault, closeVaults

describe("bank.closeVault(bag): the vault locked, its kept lease erased, and evicted", () => {
  it("locks the vault, erases the lease this device keeps, and holds it no more; the next ensureVault gets it anew, locked", async () => {
    const { bank, deviceDB } = makeBankWorld()
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    expect(bank.snapshot.vaults).to.have.lengthOf(1)
    bank.closeVault(Main)
    expect(vault.isLocked).to.be.true
    expect(bank.vaultOf(Main)).to.be.null
    expect(bank.snapshot.vaults).to.deep.equal([])
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const again = await bank.ensureVault(Main)
    expect(again).to.not.equal(vault)
    expect(again.vault_tok).to.eq(vault.vault_tok)
    expect(again.isLocked).to.be.true
  })

  it("declines a gating of the vault still asking the user: its ensureUnlocked refuses 'declined'", async () => {
    const { bank, requestCleartext } = makeBankWorld()
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    vault.lock()
    const asked = { gating: null as AnyGating | null }
    requestCleartext.mockImplementationOnce((gating) => new Promise<void>(() => { asked.gating = gating }))
    const pending = vault.ensureUnlocked()
    await TH.eventually(() => asked.gating !== null)
    bank.closeVault(Main)
    await TH.expectRefusal(pending, 'declined')
    expect(asked.gating?.isOpen).to.be.false
  })

  it("leaves a vault closed as its birth lease is put locked and evicted, and the lock's erase, landing after the put, keeps no lease (G4)", async () => {
    const { bank, deviceDB } = makeBankWorld()
    const put = deviceDB.tryPutLease.getMockImplementation()!
    deviceDB.tryPutLease.mockImplementationOnce(async (record) => {
      bank.closeVault(Main)
      // Two ticks: time enough for an erase nothing holds back to land before the put.
      await TH.wakeupAtNextTick()
      await TH.wakeupAtNextTick()
      return put(record)
    })
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    expect(vault.isLocked).to.be.true
    expect(bank.vaultOf(Main)).to.be.null
    await TH.eventually(() => deviceDB.tryDelLease.mock.calls.length > 0)
    expect(deviceDB.cachedNow()).to.be.null
    expect(deviceDB.tryDelLease.mock.invocationCallOrder.at(-1)).to.be.greaterThan(deviceDB.tryPutLease.mock.invocationCallOrder.at(-1) ?? Infinity)
  })

  it("leaves the vaults the bank holds as they are for a vaultlabel it holds none of, and refuses 'bad_scope' a bag of another user", async () => {
    const deviceDB = memoryDeviceDB()
    const { bank } = makeBankWorld(null, { deviceDB })
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    bank.closeVault(Work)
    expect(bank.vaultOf(Main)).to.equal(vault)
    expect(vault.isLocked).to.be.false
    TH.expectSyncRefusal(() => { bank.closeVault({ vaultlabel: Dna.vaultlabel, user_id: 'u2' }) }, 'bad_scope')
    expect(bank.vaultOf(Main)).to.equal(vault)
    await TH.wakeupAtNextTick()
    expect(await deviceDB.getLease({ ...Dna })).to.not.be.null
  })

  it("erases the lease this device keeps of a vault the bank does not hold, so the next ensureVault gets it locked", async () => {
    const deviceDB = memoryDeviceDB()
    const { bank, makeBank } = makeBankWorld(null, { deviceDB })
    await bank.ensureVault(Main, byPassphrase(Passphrase))
    bank.goodbye()
    const next = makeBank()
    next.closeVault(Main)
    const again = await next.ensureVault(Main)
    expect(again.isLocked).to.be.true
    expect(await deviceDB.getLease({ ...Dna })).to.be.null
  })

  it("tells onBadNews of a refused erase of the lease kept of a vault the bank does not hold", async () => {
    const onBadNews = vi.fn()
    const deviceDB = memoryDeviceDB()
    const { bank } = makeBankWorld(null, { deviceDB, onBadNews })
    const refusal = new VaultError('unexpected_error', "the store is down")
    vi.spyOn(deviceDB, 'tryDelLease').mockResolvedValueOnce(bad(refusal))
    bank.closeVault(Main)
    await TH.eventually(() => onBadNews.mock.calls.length > 0)
    expect(onBadNews).toHaveBeenCalledWith(refusal)
  })

  it("leaves a vault closed while ensureVault stores it locked, no lease put", async () => {
    const { bank, deviceDB, opts: { store } } = makeBankWorld()
    const stored = TH.holdNextAnswer(store, 'put')
    const ensuring = bank.ensureVault(Main, byPassphrase(Passphrase))
    await stored.reached
    bank.closeVault(Main)
    stored.release()
    const vault = await ensuring
    expect(vault.isLocked).to.be.true
    await TH.wakeupAtNextTick()
    expect(deviceDB.tryPutLease).not.toHaveBeenCalled()
    expect(deviceDB.cachedNow()).to.be.null
  })

  it("leaves a vault reopened after a close locked, though the evicted vault's look for its kept lease was in flight (G4)", async () => {
    const deviceDB = memoryDeviceDB()
    const { bank, makeBank } = makeBankWorld(null, { deviceDB })
    await bank.ensureVault(Main, byPassphrase(Passphrase))
    bank.goodbye()
    const next = makeBank()
    const looked = TH.holdNextAnswer(deviceDB, 'tryGetLease')
    const greeting = next.hello()
    await looked.reached
    next.closeVault(Main)
    const reopening = next.ensureVault(Main)
    // Two ticks: time enough for a look nothing holds back to land before the erase.
    await TH.wakeupAtNextTick()
    await TH.wakeupAtNextTick()
    looked.release()
    await greeting
    const again = await reopening
    expect(again.isLocked).to.be.true
    expect(await deviceDB.getLease({ ...Dna })).to.be.null
  })
})

describe("bank.closeVaults(): each vault closed", () => {
  it("locks and evicts every vault the bank holds, erasing each kept lease", async () => {
    const { bank, deviceDB } = makeBankWorld(null, { vaultDB: vaultDBByLabel() })
    const main = await bank.ensureVault(Main, byPassphrase(Passphrase))
    const work = await bank.ensureVault(Work, byPassphrase(Passphrase))
    expect(bank.snapshot.vaults).to.have.lengthOf(2)
    bank.closeVaults()
    expect(main.isLocked).to.be.true
    expect(work.isLocked).to.be.true
    expect(bank.vaultOf(Main)).to.be.null
    expect(bank.vaultOf(Work)).to.be.null
    expect(bank.snapshot.vaults).to.deep.equal([])
    await TH.eventually(() => deviceDB.tryDelLease.mock.calls.length === 2)
  })

  it("does nothing for a bank that holds no vault", () => {
    const { bank, deviceDB } = makeBankWorld()
    bank.closeVaults()
    expect(bank.snapshot.vaults).to.deep.equal([])
    expect(deviceDB.tryDelLease).not.toHaveBeenCalled()
  })
})
// --

// == [Joining an ensureVault]: only a call that hands no cleartexts joins one in flight

describe("bank.ensureVault(bag, cleartexts): a call handing its own cleartexts joins nothing", () => {
  it("runs apart from an ensureVault in flight that asks the user, building of its own cleartexts", async () => {
    const { bank, requestCleartext } = makeBankWorld()
    const asked = { gating: null as AnyGating | null }
    requestCleartext.mockImplementationOnce((gating) => new Promise<void>(() => { asked.gating = gating }))
    const asking = bank.ensureVault(Main)
    await TH.eventually(() => asked.gating !== null)
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    expect(vault.isLocked).to.be.false
    expect(requestCleartext).toHaveBeenCalledOnce()
    asked.gating?.decline()
    await TH.expectRefusal(asking, 'declined')
  })

  it("is joined by a call that hands none: one vault, the user asked nothing", async () => {
    const { bank, requestCleartext } = makeBankWorld()
    const [first, second] = await Promise.all([bank.ensureVault(Main, byPassphrase(Passphrase)), bank.ensureVault(Main)])
    expect(second).to.equal(first)
    expect(requestCleartext).not.toHaveBeenCalled()
  })
})
// --
