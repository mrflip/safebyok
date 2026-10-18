// fake-indexeddb installs a Node-side indexedDB global before the adapters load, so the device
// store browserOpts makes is a real IndexedDB one.
import 'fake-indexeddb/auto'
import { fileURLToPath } from 'node:url'
import { Rolldown } from 'tsdown'
import { describe, expect, it } from 'vitest'
import * as Browser from '../src/browser'
import { browserOpts, zxcvbnPassphraseTest } from '../src/browser'
import { VaultError } from '../src/errors'
import { argon2idWebV1Deriver } from '../src/key-deriver'
import { inspectIdbDeviceDB } from '../src/idb'
import { memoryStore } from '../src/string-store'
import { localVaultDB } from '../src/vault-db'
import { openVault } from '../src/vault'
import * as TH from './test-helpers'

describe("browserOpts", () => {
  it("supplies the pinned Argon2id deriver, an IndexedDB device store and the zxcvbn strength test, and nothing else", () => {
    const bag = browserOpts()
    expect(Object.keys(bag)).to.have.members(['keyDeriver', 'deviceDB', 'passphraseStrengthTest'])
    expect(bag.keyDeriver).to.eq(argon2idWebV1Deriver)
    expect(bag.passphraseStrengthTest).to.eq(zxcvbnPassphraseTest)
  })

  it("never supplies the vault store: the backend is every host's own choice", () => {
    expect(browserOpts()).to.not.have.property('vaultDB')
  })

  it("keeps the device store's records in the database it names", async () => {
    const dbName = TH.freshDbName()
    await browserOpts({ dbName }).deviceDB.writeLease(await TH.leaseOf('u1'), TH.NoLocks)
    const rows = await inspectIdbDeviceDB({ dbName }).rows()
    expect(rows.map((row) => row.ckey)).to.deep.equal(['lease^acme^u1^main'])
    expect(await browserOpts().deviceDB.readLease(TH.scopeOf('u1'))).to.be.null
  })

  it("answers the same frozen bag for the same dbName, so a render may call it", () => {
    expect(browserOpts({ dbName: 'acme' })).to.eq(browserOpts({ dbName: 'acme' }))
    expect(browserOpts()).to.eq(browserOpts({ dbName: 'safebyok' }))
    expect(browserOpts({ dbName: 'acme' })).to.not.eq(browserOpts({ dbName: 'other' }))
    expect(Object.isFrozen(browserOpts())).to.be.true
  })

  it("refuses a dbName that is not non-empty text with kind 'bad_option', quoting none of it", () => {
    for (const dbName of ['', 42, null]) {
      expect(() => browserOpts({ dbName } as unknown as { dbName: string }))
        .to.throw(VaultError, /dbName/).with.property('kind', 'bad_option')
    }
  })

  it("spreads into openVault beside the host's vault store", async () => {
    const vault = await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB({ store: memoryStore() }), ...browserOpts({ dbName: TH.freshDbName() }) })
    expect(vault.getSnapshot().state).to.eq('absent')
    vault.close()
  })

  it("yields to a strength test of the host's own, passed after it", async () => {
    const vault = await openVault({ ...browserOpts({ dbName: TH.freshDbName() }), applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB({ store: memoryStore() }), keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest })
    await vault.unlock('pw')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    vault.close()
  })

  it("brings the zxcvbn test to openVault: a common password is refused at create", async () => {
    const vault = await openVault({ ...browserOpts({ dbName: TH.freshDbName() }), applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB({ store: memoryStore() }), keyDeriver: TH.testDeriver })
    await TH.expectRefusal(vault.unlock('password1234'), 'weak_passphrase')
    expect(vault.getSnapshot().state).to.eq('absent')
    vault.close()
  })

  it("yields to a field the host passes after it", async () => {
    const { deviceDB } = browserOpts({ dbName: TH.freshDbName() })
    const opts = { ...browserOpts({ dbName: 'acme' }), applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB({ store: memoryStore() }), deviceDB }
    expect(opts.deviceDB).to.eq(deviceDB)
    const vault = await openVault(opts)
    expect(vault.getSnapshot().state).to.eq('absent')
    vault.close()
  })
})

describe("safebyok/browser", () => {
  it("exports browserOpts, and the zxcvbn strength test and its bounds beside it", () => {
    expect(Object.keys(Browser)).to.have.members(['browserOpts', 'zxcvbnPassphraseTest', 'MinPassphraseChars', 'MinZxcvbnScore'])
  })
})

describe("zxcvbnPassphraseTest, as openVault's passphraseStrengthTest", () => {
  it("refuses a common password at create with kind 'weak_passphrase', and creates the vault with a strong one", async () => {
    const vault = await openVault({ ...TH.memoryVaultOpts(), passphraseStrengthTest: zxcvbnPassphraseTest })
    const err = await TH.expectRefusal(vault.unlock('password1234'), 'weak_passphrase')
    expect(err.message).to.match(/commonly used password/)
    expect(vault.getSnapshot().state).to.eq('absent')
    await vault.unlock('correct horse battery staple')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    vault.close()
  })
})

const browserSource = fileURLToPath(new URL('../src/browser.ts', import.meta.url))

/**
 * The minified JavaScript a bundler ships for an app whose only import from safebyok/browser is
 * `imports`: what the page loads at once (the entry and every chunk it imports), and what it loads
 * only when the code asks for it (each chunk imported dynamically).
 */
const bundleOf = async (imports: string): Promise<{ atOnce: string, onDemand: string }> => {
  const appModule = `export { ${imports} } from ${JSON.stringify(browserSource)}`
  const built = await Rolldown.build({
    input:    'app',
    platform: 'browser',
    write:    false,
    logLevel: 'silent',
    output:   { minify: true },
    plugins:  [{
      name:      'app_module',
      resolveId: (specifier) => (specifier === 'app' ? specifier : null),
      load:      (moduleId) => (moduleId === 'app' ? appModule : null),
    }],
  })
  const chunks = built.output.flatMap((piece) => (piece.type === 'chunk' ? [piece] : []))
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const loadedAtOnce = new Set<string>()
  const follow = (fileName: string) => {
    if (loadedAtOnce.has(fileName)) { return }
    loadedAtOnce.add(fileName)
    const imports = byFileName.get(fileName)?.imports ?? []
    for (const imported of imports) { follow(imported) }
  }
  const entries = chunks.filter((piece) => piece.isEntry)
  for (const chunk of entries) { follow(chunk.fileName) }
  const codeOf = (wanted: boolean) => chunks.filter((chunk) => loadedAtOnce.has(chunk.fileName) === wanted).map((chunk) => chunk.code).join('\n')
  return { atOnce: codeOf(true), onDemand: codeOf(false) }
}

// zxcvbn's own word for a match against its dictionaries, and the compressed common-password list.
const ZxcvbnImplementation = /passwords-common/u

describe("safebyok/browser's tree-shaking", () => {
  it("loads zxcvbn and its dictionary for browserOpts only on demand, never with the page", async () => {
    const { atOnce, onDemand } = await bundleOf('browserOpts')
    expect(atOnce).to.include('safebyok')
    expect(atOnce).to.not.match(ZxcvbnImplementation)
    expect(onDemand).to.match(ZxcvbnImplementation)
  }, 30_000)

  it("loads zxcvbn on demand for an app that imports zxcvbnPassphraseTest alone, too", async () => {
    const { atOnce, onDemand } = await bundleOf('zxcvbnPassphraseTest')
    expect(atOnce).to.not.match(ZxcvbnImplementation)
    expect(onDemand).to.match(ZxcvbnImplementation)
  }, 30_000)
})
