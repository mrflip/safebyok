import { afterEach, describe, expect, it } from 'vitest'
import { DeviceDBVersion, FarFuture, FarPast, ForeverMillis, IsGuarded, VaultsDBVersion, brand, brandGuarded, brandOf, hasModelkind, isAdapterVaultDB, isDeviceDB, isGuarded, isVaultDB } from '../../src/helpers/consts'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { VaultDBVerbnames } from '../../src/storage/vault-db'
import { boxListingOf, makeModelsWorld } from '../test-helpers/models-world'

describe("DeviceDBVersion and VaultsDBVersion", () => {
  it("are three zero-padded parts, so that database names sort as their versions do", () => {
    expect(DeviceDBVersion).to.match(/^\d{3}-\d{3}-\d{3}$/)
    expect(VaultsDBVersion).to.match(/^\d{3}-\d{3}-\d{3}$/)
  })
})

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
  it("tell a VaultDB or a DeviceDB by the brand its base class carries, as another copy of safebyok would make it", () => {
    expect(isVaultDB(new MemoryVaultDB())).to.be.true
    expect(isDeviceDB(new MemoryDeviceDB())).to.be.true
    expect(isVaultDB({ [Symbol.for('@safebyok/vaultdb')]: true })).to.be.true
    expect(isDeviceDB({ [Symbol.for('@safebyok/devicedb')]: true })).to.be.true
  })

  it("refuse a duck, the other one, and a copy of a VaultDB's own fields, which leaves the brand behind", () => {
    const vaultDB = new MemoryVaultDB()
    expect(isDeviceDB({ tryPeek: () => null, tryStow: () => null, tryForget: () => null })).to.be.false
    expect(isVaultDB(Object.assign({}, vaultDB))).to.be.false
    expect(isVaultDB(new MemoryDeviceDB())).to.be.false
    expect(isDeviceDB(vaultDB)).to.be.false
    expect(isVaultDB(null)).to.be.false
    expect(isDeviceDB(undefined)).to.be.false
  })
})

describe("isAdapterVaultDB", () => {
  it("tells an AdapterVaultDB from a client of one, which wears only the VaultDB's brand", () => {
    const vaultDB = new MemoryVaultDB()
    const client = { [Symbol.for('@safebyok/vaultdb')]: true }
    expect([isVaultDB(vaultDB), isAdapterVaultDB(vaultDB)]).to.deep.equal([true, true])
    expect([isVaultDB(client), isAdapterVaultDB(client)]).to.deep.equal([true, false])
    expect(isAdapterVaultDB({ [Symbol.for('@safebyok/adaptervaultdb')]: true })).to.be.true
  })

  it("refuses a plain object answering every verb, and a copy of a VaultDB's own fields", () => {
    const vaultDB = new MemoryVaultDB()
    const verbs = Object.fromEntries(VaultDBVerbnames.map((verbname) => [verbname, vaultDB[verbname].bind(vaultDB)]))
    expect([isVaultDB(verbs), isAdapterVaultDB(verbs)]).to.deep.equal([false, false])
    expect(isAdapterVaultDB(Object.assign({}, vaultDB))).to.be.false
    expect(isAdapterVaultDB(new MemoryDeviceDB())).to.be.false
    expect(isAdapterVaultDB(null)).to.be.false
  })
})

describe("brand and brandOf", () => {
  const Mine = Symbol.for('@example/mine')

  it("mark an object with a value its brandOf reads back", () => {
    const marked = brand({ apiKey: 'sk-test-0000' }, Mine)
    expect(brandOf(marked, Mine)).to.be.true
    expect(brandOf(brand({}, Mine, 'blue'), Mine)).to.eq('blue')
    expect(brandOf(brand(() => 3, Mine), Mine)).to.be.true
  })

  it("keep the mark out of keys, spreads and JSON", () => {
    const bag = { apiKey: 'sk-test-0000' }
    const marked = brand(bag, Mine)
    expect(marked).to.eq(bag)
    expect(Reflect.ownKeys({ ...marked })).to.deep.equal(['apiKey'])
    expect(Object.keys(marked)).to.deep.equal(['apiKey'])
    expect(JSON.stringify(marked)).to.eq('{"apiKey":"sk-test-0000"}')
    expect(brandOf({ ...marked }, Mine)).to.be.undefined
  })

  it("keep the first mark through a write or another brand", () => {
    const marked = brand({}, Mine, 'first') as Record<symbol, unknown>
    expect(() => { marked[Mine] = 'second' }).to.throw(TypeError)
    expect(() => brand(marked, Mine, 'second')).to.throw(TypeError)
    expect(brandOf(marked, Mine)).to.eq('first')
  })

  it("read a brand a class's getter wears", () => {
    class Worn { get [Mine](): string { return 'worn' } }
    expect(brandOf(new Worn(), Mine)).to.eq('worn')
  })

  const UnmarkedCases = [
    [null,                    'null'],
    [undefined,               'undefined'],
    [7,                       'a number'],
    ["@example/mine",         "the brand's own description"],
    [Mine,                    'the symbol itself'],
    [{},                      'an unmarked object'],
    [() => 3,                 'an unmarked function'],
  ] as const
  for (const [val, blurb] of UnmarkedCases) {
    it(`find no brand on ${blurb}`, () => {
      expect(brandOf(val, Mine)).to.be.undefined
    })
  }
})

describe("isGuarded", () => {
  it("knows a guarded function or object from any copy of safebyok", () => {
    expect(IsGuarded).to.eq(Symbol.for('@safebyok/guarded'))
    expect(isGuarded(brandGuarded(() => 3))).to.be.true
    expect(isGuarded(brandGuarded({ deriveKeyBytes: () => 3 }))).to.be.true
    const GuardedBrand = Symbol.for('@safebyok/guarded')
    expect(isGuarded(brand(() => 3, GuardedBrand))).to.be.true
  })

  it("refuses what wears no true guard's brand", () => {
    expect(isGuarded(() => 3)).to.be.false
    const guarded = brandGuarded({ deriveKeyBytes: () => 3 })
    expect(isGuarded({ ...guarded })).to.be.false
    expect(isGuarded(brand(() => 3, IsGuarded, 'yes'))).to.be.false
    expect(isGuarded(null)).to.be.false
  })
})
