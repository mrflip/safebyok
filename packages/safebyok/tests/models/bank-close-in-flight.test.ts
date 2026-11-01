import { describe, expect, it, vi } from 'vitest'
import { memoryDeviceDB } from '../../src/devicedb/memory'
import { VaultError } from '../../src/errors'
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

// == [closeVaults, on a vault not yet held]: it lands as closeVault does

describe("bank.closeVaults() landing on a stored vault not yet held", () => {
  it("leaves the vault an ensureVault's fetch was finding locked and held, its lease erased", async () => {
    const { makeBank, deviceDB, opts: { store } } = await keptVaultWorld()
    const next = makeBank()
    const got = TH.holdNextAnswer(store, 'get')
    const ensuring = next.ensureVault(Main)
    await got.reached
    next.closeVaults()
    got.release()
    const vault = await ensuring
    expect(vault.isLocked).to.be.true
    expect(next.vaultOf(Main)).to.equal(vault)
    expect(await deviceDB.getLease({ ...Dna })).to.be.null
  })

  it("leaves the vault a hello's cache load revives locked and held, its lease erased", async () => {
    const { makeBank, deviceDB } = await keptVaultWorld()
    const held = holdCacheLoad(deviceDB)
    const next = makeBank()
    const greeting = next.hello()
    await held.reached
    next.closeVaults()
    held.release()
    await greeting
    expect(next.vaultOf(Main)?.isLocked).to.be.true
    expect(await deviceDB.getLease({ ...Dna })).to.be.null
  })

  it("reaches a hello still keeping the device record", async () => {
    const { makeBank, deviceDB } = await keptVaultWorld()
    const next = makeBank()
    const advanced = TH.holdNextAnswer(deviceDB, 'advanceDeviceRecord')
    const greeting = next.hello()
    await advanced.reached
    next.closeVaults()
    advanced.release()
    await greeting
    expect(next.vaultOf(Main)?.isLocked).to.be.true
    expect(await deviceDB.getLease({ ...Dna })).to.be.null
  })

  it("leaves a vault reopened since the close as it was: unlocked, its lease kept", async () => {
    const { makeBank, deviceDB } = await keptVaultWorld()
    const held = holdCacheLoad(deviceDB)
    const next = makeBank()
    const greeting = next.hello()
    await held.reached
    next.closeVaults()
    const reopened = await next.ensureVault(Main)
    expect(reopened.isLocked).to.be.false
    held.release()
    await greeting
    expect(next.vaultOf(Main)).to.equal(reopened)
    expect(reopened.isLocked).to.be.false
    expect(await deviceDB.getLease({ ...Dna })).to.not.be.null
  })

  it("does so for a sign-out heard during that fetch", async () => {
    const { makeBank, deviceDB, opts: { store } } = await keptVaultWorld()
    const next = makeBank()
    const got = TH.holdNextAnswer(store, 'get')
    const ensuring = next.ensureVault(Main)
    await got.reached
    next.vaultListing.tellBadNews([new VaultError('identity_revoked', "Signed out.")])
    got.release()
    const vault = await ensuring
    expect(vault.isLocked).to.be.true
    expect(next.vaultOf(Main)).to.equal(vault)
    expect(await deviceDB.getLease({ ...Dna })).to.be.null
  })

  it("takes up a kept lease as ever where the fetch began after the close", async () => {
    const { makeBank } = await keptVaultWorld()
    const next = makeBank()
    next.closeVaults()
    const vault = await next.ensureVault(Main)
    expect(vault.isLocked).to.be.false
  })
})
// --

