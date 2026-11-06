import { afterEach, describe, expect, it } from 'vitest'
import { FarFuture, FarPast, ForeverMillis, hasModelkind, isDeviceDB, isVaultDB } from '../../src/helpers/consts'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { boxListingOf, makeModelsWorld } from '../test-helpers/models-world'

describe("FarFuture", () => {
  it("is the microsecond epochalypse: the last millisecond whose epoch microseconds are a safe integer", () => {
    expect(FarFuture).to.eq(Math.floor(Number.MAX_SAFE_INTEGER / 1000))
    expect(Number.isSafeInteger(FarFuture * 1000)).to.be.true
    expect(Number.isSafeInteger((FarFuture + 1) * 1000)).to.be.false
  })

  it("falls in 2255, a valid Date", () => {
    expect(new Date(FarFuture).toISOString()).to.eq('2255-06-05T23:47:34.740Z')
  })
})

describe("ForeverMillis", () => {
  it("runs from FarPast to FarFuture", () => {
    expect(ForeverMillis).to.eq(FarFuture - FarPast)
    expect(FarPast + ForeverMillis).to.eq(FarFuture)
  })
})

describe("FarPast", () => {
  it("is the first instant of 1981", () => {
    expect(FarPast).to.eq(Date.UTC(1981, 0, 1))
    expect(new Date(FarPast).toISOString()).to.eq('1981-01-01T00:00:00.000Z')
  })
})

describe("hasModelkind", () => {
  const mw = makeModelsWorld({ fakeTimers: false })
  afterEach(() => { mw.dispose() })

  it("is true of a model of any kind named, and of nothing else", () => {
    expect(hasModelkind(boxListingOf(mw), 'box_listing')).to.be.true
    expect(hasModelkind(boxListingOf(mw), 'vault_listing', 'box_listing')).to.be.true
    expect(hasModelkind(boxListingOf(mw), 'box')).to.be.false
    expect(hasModelkind({ modelkind: 'box' }, 'box')).to.be.true
    expect(hasModelkind({}, 'box')).to.be.false
    expect(hasModelkind(null, 'box')).to.be.false
    expect(hasModelkind(undefined, 'box')).to.be.false
    expect(hasModelkind('box', 'box')).to.be.false
  })

  it("is no own key of a model, so a spread and Object.keys leave it out", () => {
    expect(Object.keys(boxListingOf(mw))).not.to.include('modelkind')
  })
})

describe("isVaultDB and isDeviceDB", () => {
  it("tell a store by the brand its base class carries, as another copy of safebyok would make it", () => {
    expect(isVaultDB(new MemoryVaultDB())).to.be.true
    expect(isDeviceDB(new MemoryDeviceDB())).to.be.true
    expect(isVaultDB({ [Symbol.for('@safebyok/vaultdb')]: true })).to.be.true
    expect(isDeviceDB({ [Symbol.for('@safebyok/devicedb')]: true })).to.be.true
  })

  it("refuse a duck, the other store, and a copy of a store's own fields, which leaves the brand behind", () => {
    const vaultDB = new MemoryVaultDB()
    expect(isDeviceDB({ tryPeek: () => null, tryCache: () => null, tryVacate: () => null })).to.be.false
    expect(isVaultDB(Object.assign({}, vaultDB))).to.be.false
    expect(isVaultDB(new MemoryDeviceDB())).to.be.false
    expect(isDeviceDB(vaultDB)).to.be.false
    expect(isVaultDB(null)).to.be.false
    expect(isDeviceDB(undefined)).to.be.false
  })
})
