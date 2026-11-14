// fake-indexeddb installs IndexedDB's globals before the DeviceDB loads, for the banks browserOpts makes.
import 'fake-indexeddb/auto'
import { argon2idAsync } from '@noble/hashes/argon2.js'
import { describe, expect, it } from 'vitest'
import { Argon2idWebV1, IdbDeviceDB, PassphraseSaltSize, makeArgon2idDeriver, argon2idWebV1Deriver, browserOpts, parseKeyDeriverSpec, zxcvbnStrengthChecker } from '../src/browser'
import * as Front from '../src/index'
import * as Phrases from '../src/helpers/phrases'
import * as TH from './test-helpers'

TH.useBankWorlds()

/** A host's own strength checker, which finds every passphrase weak. */
const mine = () => ({ strong: false, reason: 'Mine says no.' }) as const

/** A fresh dbName, which no other test has touched. */
function freshDbName(): string { return `test-${crypto.randomUUID()}` }

describe("makeArgon2idDeriver and the reserved labels", () => {
  it("refuses a label of the reserved namespace that safebyok does not supply, however well-formed the spec", () => {
    const err = TH.expectSyncRefusal(() => makeArgon2idDeriver({ ...CheapSpec, key_deriver_label: 'argon2id_web_v2' }), 'bad_option')
    expect(err.message).to.match(/reserved/u)
  })
})

const CheapSpec = {
  algorithm:         'argon2id',
  key_deriver_label: 'cheap_argon2id_v0',
  memory_kib:        8,
  iterations:        1,
  parallelism:       1,
  salt_size:        16,
  output_size:      32,
} as const

const salt = new Uint8Array(16).fill(7)

// One derivation at full strength (64 MiB, three passes) in pure JS takes 3-4 s on a CI runner under coverage, past vitest's 5 s default when the runner is busy.
const FullStrengthDeriveMillis = 30_000

// Argon2id's own test vector, from its reference implementation (phc-winner-argon2's test.c: version 0x13, 2 passes,
// 64 MiB, one lane, "password" and "somesalt"). Its salt is 8 bytes, under the 16 a keyDeriverSpec asks, so noble is asked directly.
describe("Argon2id's reference test vector", () => {
  it("is what noble derives, the library makeArgon2idDeriver runs on", { timeout: FullStrengthDeriveMillis }, async () => {
    const derived = await argon2idAsync('password', new TextEncoder().encode('somesalt'), { m: 65_536, t: 2, p: 1, dkLen: 32 }) // eslint-disable-line id-length -- noble's option names
    expect(Buffer.from(derived).toString('hex')).to.eq('09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7')
  })

  it("has a salt too short for a keyDeriverSpec", () => {
    expect(() => parseKeyDeriverSpec({ ...CheapSpec, salt_size: 8 })).to.throw(/salt_size/u)
  })
})

// The value was taken from @noble/hashes' argon2idAsync called directly (and agrees with hash-wasm's argon2id), over the spec's
// 65_536 KiB, 3 passes, 1 lane and 32 bytes, for this passphrase and salt; safebyok-fastkey's tests check its wasm deriver against it too.
describe("a saved Argon2id value", () => {
  it("is what argon2idWebV1Deriver derives for one fixed passphrase and salt, at the spec's cost", { timeout: FullStrengthDeriveMillis }, async () => {
    const saltBytes = Uint8Array.from({ length: 16 }, (_unused, ii) => ((ii * 37) + 11) % 256)
    const derived = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    expect(Buffer.from(derived).toString('hex')).to.eq('efb4ef4c091ec9dacc4f1284c439742b414394599ffe4bbefc4dc300e4a4301b')
  })
})

describe("safebyok-big/browser", () => {
  it("derives a 32-byte key under the argon2id_web_v1 label with argon2idWebV1Deriver", { timeout: FullStrengthDeriveMillis }, async () => {
    expect(argon2idWebV1Deriver.key_deriver_label).to.eq('argon2id_web_v1')
    const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('a short passphrase', salt)
    expect(keyBytes).to.have.lengthOf(32)
  })

  it("is deterministic in passphrase and salt with makeArgon2idDeriver", async () => {
    const deriver = makeArgon2idDeriver(CheapSpec)
    const first = await deriver.deriveKeyBytes('a short passphrase', salt)
    expect(first).to.have.lengthOf(32)
    expect(await deriver.deriveKeyBytes('a short passphrase', salt)).to.deep.eq(first)
  })

  it("derives other bytes for another passphrase with makeArgon2idDeriver", async () => {
    const deriver = makeArgon2idDeriver(CheapSpec)
    const first = await deriver.deriveKeyBytes('a short passphrase', salt)
    expect(await deriver.deriveKeyBytes('another passphrase', salt)).to.not.deep.eq(first)
  })

  it("exports the supplied spec and its parser for other derivers", () => {
    expect(argon2idWebV1Deriver).to.include({ ...Argon2idWebV1 })
    expect(parseKeyDeriverSpec(CheapSpec)).to.deep.equal(CheapSpec)
    expect(() => parseKeyDeriverSpec({ ...Argon2idWebV1, iterations: 4 })).to.throw(/argon2id_web_v1/u)
    expect(PassphraseSaltSize).to.eq(Argon2idWebV1.salt_size)
  })

  it("refuses a spec under a reserved label that safebyok does not supply, whatever its case", () => {
    for (const key_deriver_label of ['argon2id_web_v2', 'ARGON2ID_WEB_V2']) {
      const err = TH.expectSyncRefusal(() => parseKeyDeriverSpec({ ...CheapSpec, key_deriver_label }), 'bad_option')
      expect(err.message).to.include('argon2id_web_')
    }
  })

  it("is not on the front door", () => {
    for (const exportname of ['argon2idWebV1Deriver', 'makeArgon2idDeriver', 'idbDeviceDB', 'zxcvbnStrengthChecker', 'browserOpts']) {
      expect(Front).to.not.have.property(exportname)
    }
  })
})

describe("browserOpts", () => {
  it("returns frozen options with the Argon2id deriver, an IndexedDB DeviceDB and the zxcvbn checker", () => {
    const bag = browserOpts({ dbName: freshDbName() })
    expect(Object.isFrozen(bag)).to.be.true
    expect(bag).to.have.all.keys('keyDeriver', 'deviceDB', 'strengthChecker')
    expect(bag.keyDeriver).to.eq(argon2idWebV1Deriver)
    expect(bag.deviceDB).to.be.an.instanceOf(IdbDeviceDB)
    expect(bag.strengthChecker).to.eq(zxcvbnStrengthChecker)
  })

  it("returns the same object for the same dbName", () => {
    const dbName = freshDbName()
    expect(browserOpts({ dbName })).to.eq(browserOpts({ dbName }))
    expect(browserOpts()).to.eq(browserOpts({}))
    expect(browserOpts()).to.not.eq(browserOpts({ dbName: 'safebyok' }))
  })

  it("returns a separate DeviceDB for each dbName, sharing the deriver and checker", () => {
    const [one, other] = [browserOpts({ dbName: freshDbName() }), browserOpts({ dbName: freshDbName() })]
    expect(one.deviceDB).to.not.eq(other.deviceDB)
    expect(one.keyDeriver).to.eq(other.keyDeriver)
    expect(one.strengthChecker).to.eq(other.strengthChecker)
  })

  it("refuses a dbName that is not non-empty text, and an option it does not accept", () => {
    TH.expectSyncRefusal(() => browserOpts({ dbName: '' }), 'bad_option')
    TH.expectSyncRefusal(() => browserOpts({ dbName: 3 } as never), 'bad_option')
    TH.expectSyncRefusal(() => browserOpts({ dbname: 'acme' } as never), 'bad_option')
    TH.expectSyncRefusal(() => browserOpts('acme' as never), 'bad_option')
  })

  it("makes a bank whose vault is created under the zxcvbn checker and kept in IndexedDB", async () => {
    const { bank, vault } = await TH.makeBankWithVault(TH.makeBankWorld(), { ...browserOpts({ dbName: freshDbName() }), keyDeriver: TH.testDeriver })
    expect(bank.isUnlocked).to.be.true
    expect(await bank.strengthChecker('password1234', vault.scope)).to.deep.equal({ strong: false, reason: Phrases.PassphraseGuessable })
    expect(await bank.deviceDB.listLeases()).to.have.lengthOf(1)
  })

  it("gives way to a field passed after the spread", async () => {
    const bank = await TH.makeBankWorld().bankOn({ ...browserOpts({ dbName: freshDbName() }), keyDeriver: TH.testDeriver, strengthChecker: mine })
    expect(await bank.strengthChecker('mauve lantern quietly orbits', TH.scopeOf('u1'))).to.deep.equal({ strong: false, reason: 'Mine says no.' })
  })
})
