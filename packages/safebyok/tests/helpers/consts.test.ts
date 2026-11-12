import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeviceDBVersion, FarFuture, FarPast, ForeverMillis, IsGuarded, PackageVersion, brand, brandGuarded, brandOf, hasModelkind, isAdapterBankDB, isBankDB, isDeviceDB, isGuarded } from '../../src/helpers/consts'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { BankDBVerbnames } from '../../src/storage/bank-db'
import { MemoryBankDB } from '../../src/storage/memory-bank-db'
import { boxListingOf, makeModelsWorld } from '../test-helpers/models-world'

describe("DeviceDBVersion", () => {
  it("is three zero-padded parts, so that database names sort as their versions do", () => {
    expect(DeviceDBVersion).to.match(/^\d{3}-\d{3}-\d{3}$/)
  })
})

describe("FarFuture", () => {
  it("is the last millisecond whose epoch microseconds are a safe integer", () => {
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

  it("reads a modelkind that is not an own key of the model", () => {
    expect(Object.keys(boxListingOf(mw))).not.to.include('modelkind')
  })
})

describe("isBankDB and isDeviceDB", () => {
  it("recognize a BankDB or a DeviceDB by its base class's brand, even from another copy of safebyok", () => {
    expect(isBankDB(new MemoryBankDB())).to.be.true
    expect(isDeviceDB(new MemoryDeviceDB())).to.be.true
    expect(isBankDB({ [Symbol.for('@safebyok/bankdb')]: true })).to.be.true
    expect(isDeviceDB({ [Symbol.for('@safebyok/devicedb')]: true })).to.be.true
  })

  it("are false for a look-alike object, the other kind of DB, and a copy of a BankDB's own fields", () => {
    const bankDB = new MemoryBankDB()
    expect(isDeviceDB({ tryPeek: () => null, tryStow: () => null, tryForget: () => null })).to.be.false
    expect(isBankDB(Object.assign({}, bankDB))).to.be.false
    expect(isBankDB(new MemoryDeviceDB())).to.be.false
    expect(isDeviceDB(bankDB)).to.be.false
    expect(isBankDB(null)).to.be.false
    expect(isDeviceDB(undefined)).to.be.false
  })
})

describe("isAdapterBankDB", () => {
  it("is true of an AdapterBankDB and false of a client that has only the BankDB's brand", () => {
    const bankDB = new MemoryBankDB()
    const client = { [Symbol.for('@safebyok/bankdb')]: true }
    expect([isBankDB(bankDB), isAdapterBankDB(bankDB)]).to.deep.equal([true, true])
    expect([isBankDB(client), isAdapterBankDB(client)]).to.deep.equal([true, false])
    expect(isAdapterBankDB({ [Symbol.for('@safebyok/adapterbankdb')]: true })).to.be.true
  })

  it("is false for a plain object with every method, and for a copy of a BankDB's own fields", () => {
    const bankDB = new MemoryBankDB()
    const verbs = Object.fromEntries(BankDBVerbnames.map((verbname) => [verbname, bankDB[verbname].bind(bankDB)]))
    expect([isBankDB(verbs), isAdapterBankDB(verbs)]).to.deep.equal([false, false])
    expect(isAdapterBankDB(Object.assign({}, bankDB))).to.be.false
    expect(isAdapterBankDB(new MemoryDeviceDB())).to.be.false
    expect(isAdapterBankDB(null)).to.be.false
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

  it("read a brand from a class's getter", () => {
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
  it("recognizes a guarded function or object made by any copy of safebyok", () => {
    expect(IsGuarded).to.eq(Symbol.for('@safebyok/guarded'))
    expect(isGuarded(brandGuarded(() => 3))).to.be.true
    expect(isGuarded(brandGuarded({ deriveKeyBytes: () => 3 }))).to.be.true
    const GuardedBrand = Symbol.for('@safebyok/guarded')
    expect(isGuarded(brand(() => 3, GuardedBrand))).to.be.true
  })

  it("is false for anything without a true guard brand", () => {
    expect(isGuarded(() => 3)).to.be.false
    const guarded = brandGuarded({ deriveKeyBytes: () => 3 })
    expect(isGuarded({ ...guarded })).to.be.false
    expect(isGuarded(brand(() => 3, IsGuarded, 'yes'))).to.be.false
    expect(isGuarded(null)).to.be.false
  })
})

describe("PackageVersion", () => {
  it("is the version in package.json", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8')) as { version: string }
    const bumpByHand = `PackageVersion in packages/safebyok/src/helpers/consts.ts is not packages/safebyok/package.json's version, ${manifest.version}: a release bumps it by hand, in the Version PR`
    expect(PackageVersion, bumpByHand).to.eq(manifest.version)
  })
})
