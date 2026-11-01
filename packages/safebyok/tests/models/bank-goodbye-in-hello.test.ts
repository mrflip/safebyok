import { describe, expect, it, vi } from 'vitest'
import { memoryDeviceDB } from '../../src/devicedb/memory'
import * as TH from '../test-helpers'
import { makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()
useBankWorlds()

const Main = Object.freeze({ vaultlabel: Dna.vaultlabel })

/** A world over a `memoryDeviceDB` where a first bank has stored a vault and kept its lease, then said goodbye: the world's `makeBank` makes the next session's bank. */
const keptVaultWorld = async () => {
  const deviceDB = memoryDeviceDB()
  const world = makeBankWorld(null, { deviceDB })
  await world.bank.ensureVault(Main, byPassphrase(Passphrase))
  world.bank.goodbye()
  return { ...world, deviceDB }
}

/** Hold the load of the device cache `deviceDB` hands the next bank made, at a latch. */
const holdCacheLoad = (deviceDB: ReturnType<typeof memoryDeviceDB>) => {
  const latch = TH.makeLatch()
  const cacheOf = deviceDB.vaultCache.bind(deviceDB)
  vi.spyOn(deviceDB, 'vaultCache').mockImplementationOnce((scope, onBadNews) => {
    const cache = cacheOf(scope, onBadNews)
    return { ...cache, load: async () => {
      const copies = await cache.load()
      await latch.pass()
      return copies
    } }
  })
  return latch
}

/** A bank whose vault store's `watch` is a spy, answering the `unwatch` spy. */
const watchedBank = () => {
  const world = makeBankWorld()
  const unwatch = vi.fn()
  const watch = vi.spyOn(world.opts.store, 'watch').mockReturnValue(unwatch)
  return { ...world, watch, unwatch }
}

// == [goodbye during hello]: the watch it would start ends, once

describe("bank.goodbye() during bank.hello()", () => {
  it("ends the watch a hello keeping the device record goes on to start", async () => {
    const { bank, bankOpts, watch, unwatch } = watchedBank()
    const advanced = TH.holdNextAnswer(bankOpts.deviceDB, 'advanceDeviceRecord')
    const greeting = bank.hello()
    await advanced.reached
    bank.goodbye()
    advanced.release()
    await greeting
    expect(watch).toHaveBeenCalledOnce()
    expect(unwatch).toHaveBeenCalledOnce()
  })

  it("ends the watch a hello in its cache load goes on to start", async () => {
    const { bank, opts, watch, unwatch } = watchedBank()
    const loaded = TH.holdNextAnswer(opts.cache, 'load')
    const greeting = bank.hello()
    await loaded.reached
    bank.goodbye()
    loaded.release()
    await greeting
    expect(watch).toHaveBeenCalledOnce()
    expect(unwatch).toHaveBeenCalledOnce()
  })

  it("lets go the lease that hello goes on to look up: the vault reads locked, the lease stays kept", async () => {
    const { makeBank, deviceDB } = await keptVaultWorld()
    const held = holdCacheLoad(deviceDB)
    const next = makeBank()
    const greeting = next.hello()
    await held.reached
    next.goodbye()
    held.release()
    await greeting
    expect(next.vaultOf(Main)?.isLocked).to.be.true
    expect(await deviceDB.getLease({ ...Dna })).to.not.be.null
  })

  it("has the next hello begin anew, whose watch outlives the overtaken hello's landing", async () => {
    const { bank, bankOpts, watch, unwatch } = watchedBank()
    const advanced = TH.holdNextAnswer(bankOpts.deviceDB, 'advanceDeviceRecord')
    const overtaken = bank.hello()
    await advanced.reached
    bank.goodbye()
    const newer = bank.hello()
    expect(newer).to.not.equal(overtaken)
    await newer
    advanced.release()
    await overtaken
    expect(watch).toHaveBeenCalledOnce()
    expect(unwatch).not.toHaveBeenCalled()
  })

  it("keeps a newer hello joinable when the overtaken one lands first", async () => {
    const { bank, bankOpts, opts } = watchedBank()
    const advanced = TH.holdNextAnswer(bankOpts.deviceDB, 'advanceDeviceRecord')
    const overtaken = bank.hello()
    await advanced.reached
    bank.goodbye()
    const loaded = TH.holdNextAnswer(opts.cache, 'load')
    const newer = bank.hello()
    await loaded.reached
    advanced.release()
    await overtaken
    expect(bank.hello()).to.equal(newer)
    loaded.release()
    await newer
    expect(bank.hello()).to.not.equal(newer)
  })
})
// --

