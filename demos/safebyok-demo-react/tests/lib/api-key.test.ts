import { describe, expect, it } from 'vitest'
import { Device, MemoryDeviceDB, type Vault } from 'safebyok-big'
import { MemoryBankDB } from 'safebyok-big/storage'
import { Passphrase, anyStrengthChecker, quietLogger, testDeriver } from 'safebyok-big/testing'
import { ApiKeyVaultlabel, ensureApiKeyBoxExposed, extractApiKey } from '../../src/lib/api-key'

const Boxlabel = 'anthropic_api_key_test'
const FakeApiKey = 'sk-ant-fake-put-key'

/** Make a device on in-memory storage, its bank not yet brought up. Its dialog answers at once with the right passphrase. */
const makeDevice = () => (
  Device.make({
    user_id: 'u1', banklabel: 'acme', gates: ['main'],
    bankDB: new MemoryBankDB(), deviceDB: new MemoryDeviceDB(),
    keyDeriver: testDeriver, strengthChecker: anyStrengthChecker, logger: quietLogger,
    requestCleartext: async (gating) => { await gating.attempt({ passphraseClear: Passphrase }) },
  })
)

/** Build the user's bank, unlocked, and put the vault. */
const makeVault = async (): Promise<Vault> => {
  const bank = await makeDevice().ensureBank()
  return bank.ensureVault({ vaultlabel: ApiKeyVaultlabel })
}

/** Put `whisper` in the `Boxlabel` box of `vault`. */
const putWhisper = async (vault: Vault, whisper: object) => { await vault.putBox({ boxlabel: Boxlabel, whisper }) }

describe("extractApiKey", () => {
  it("returns null for no vault", async () => {
    expect(await extractApiKey(null, Boxlabel)).to.be.null
  })

  it("returns null for a boxlabel with no box", async () => {
    expect(await extractApiKey(await makeVault(), Boxlabel)).to.be.null
  })

  it("returns null for an empty apiKey", async () => {
    const vault = await makeVault()
    await putWhisper(vault, { apiKey: '' })
    expect(await extractApiKey(vault, Boxlabel)).to.be.null
  })

  it("returns null for an apiKey that is not a string", async () => {
    const vault = await makeVault()
    await putWhisper(vault, { apiKey: 42 })
    expect(await extractApiKey(vault, Boxlabel)).to.be.null
  })

  it("returns the put key", async () => {
    const vault = await makeVault()
    await putWhisper(vault, { apiKey: FakeApiKey })
    expect(await extractApiKey(vault, Boxlabel)).to.eq(FakeApiKey)
  })

  it("unlocks a locked bank to return the put key", async () => {
    const vault = await makeVault()
    await putWhisper(vault, { apiKey: FakeApiKey })
    vault.bank.lock()
    expect(await extractApiKey(vault, Boxlabel)).to.eq(FakeApiKey)
  })
})

describe("ensureApiKeyBoxExposed", () => {
  it("builds the bank and the vault and an exposed, empty box where there is none", async () => {
    const box = await ensureApiKeyBoxExposed(makeDevice(), Boxlabel)
    expect(box.snapshot.isExposed).to.be.true
    expect(box.whisper).to.deep.equal({})
  })

  it("exposes the box where one is put, and shows its key", async () => {
    const device = makeDevice()
    const bank = await device.ensureBank()
    const vault = await bank.ensureVault({ vaultlabel: ApiKeyVaultlabel })
    await putWhisper(vault, { apiKey: FakeApiKey })
    bank.lock()
    const box = await ensureApiKeyBoxExposed(device, Boxlabel)
    expect(box.snapshot.isExposed).to.be.true
    expect(box.whisper).to.deep.equal({ apiKey: FakeApiKey })
  })
})
