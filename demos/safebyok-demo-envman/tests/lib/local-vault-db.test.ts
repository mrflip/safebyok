// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageVaultDB } from '../../src/lib/local-vault-db'
import * as TH from '../test-helpers'

/** The stage a fresh device over `vaultDB` finds the world's bank at. */
async function stageFoundOver(vaultDB: LocalStorageVaultDB): Promise<string> {
  const device = TH.makeDevice({}, { vaultDB })
  await device.signin(TH.WorldScope.userid)
  return device.getSnapshot().bank.stage
}

beforeEach(() => { localStorage.clear() })

describe("LocalStorageVaultDB", () => {
  it("finds a bank born before the page reloaded, and its boxes", async () => {
    const { vault } = await TH.buildBornVault({ device: TH.makeDevice({}, { vaultDB: new LocalStorageVaultDB() }) })
    await vault.putBoxOnce('box/openai', { sidecar: { mask: 'sk-…' } }, { whisper: TH.Whisper })
    const device = TH.makeDevice({}, { vaultDB: new LocalStorageVaultDB() })
    await device.signin(TH.WorldScope.userid)
    await device.bank!.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await device.vault!.withWhisper('box/openai', (box) => box.whisper)).to.deep.equal(TH.Whisper)
  })

  it("finds no bank in an empty localStorage", async () => {
    expect(await stageFoundOver(new LocalStorageVaultDB())).to.eq('unborn')
  })

  it("reads a mangled entry as no bank", async () => {
    await TH.buildBornVault({ device: TH.makeDevice({}, { vaultDB: new LocalStorageVaultDB() }) })
    for (const ckey of Object.keys(localStorage)) { localStorage.setItem(ckey, '{ not json') }
    expect(await stageFoundOver(new LocalStorageVaultDB())).to.eq('unborn')
  })

  it("keeps what it saves in the storage it is handed", async () => {
    const storage = new Map<string, string>()
    const handed = {
      get length() { return storage.size },
      key:        (idx: number) => [...storage.keys()][idx] ?? null,
      getItem:    (ckey: string) => storage.get(ckey) ?? null,
      setItem:    (ckey: string, text: string) => { storage.set(ckey, text) },
    } as unknown as Storage
    await TH.buildBornVault({ device: TH.makeDevice({}, { vaultDB: new LocalStorageVaultDB(handed) }) })
    expect(localStorage).to.have.lengthOf(0)
    expect(await stageFoundOver(new LocalStorageVaultDB(handed))).to.eq('locked')
  })
})
