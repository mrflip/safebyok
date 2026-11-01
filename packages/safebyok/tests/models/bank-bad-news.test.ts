import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceRecordOf } from '../../src/devicedb/devicedb'
import { VaultError } from '../../src/errors'
import type { FoundRow } from '../../src/models/models-shapes'
import { type RowSwap, StoreFront } from '../../src/models/store-front'
import type * as Scopepath from '../../src/scopepath'
import * as TH from '../test-helpers'
import { makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()
useBankWorlds()
afterEach(() => { vi.unstubAllGlobals() })

const Main = Object.freeze({ vaultlabel: Dna.vaultlabel })
const Work = Object.freeze({ vaultlabel: 'work' })
const BankScope = Object.freeze({ applabel: Dna.applabel, user_id: Dna.user_id })

const revoked = () => new VaultError('identity_revoked', "Signed out.")
const down    = () => new VaultError('storage_unavailable', "Down.")
const behind  = () => new VaultError('vault_behind', "Behind.")

const throwsLogging = (): never => { throw new Error("Logger trouble.") }
const ThrowingLogger = Object.freeze({ log: throwsLogging, warn: throwsLogging, error: throwsLogging })

/** A vaultDB over rows in a map: `refuses`, once set, answers each `doGetRows` with the refusal it makes of the scopepaths asked, and `trouble` fails every watch live, as a backend signing the user out does. */
class TroubledFront extends StoreFront {
  readonly rows = new Map<string, unknown>()
  readonly watches: { onChange: () => void, onTrouble: (err: unknown) => void, isLive: boolean }[] = []
  refuses: ((scopepaths: readonly string[]) => VaultError) | null = null

  get liveWatches() { return this.watches.filter(({ isLive }) => isLive) }

  trouble(): void {
    for (const { onTrouble } of this.liveWatches) { onTrouble(new Error("Socket closed.")) }
  }

  protected doGetRows(scopepaths: readonly string[]): Promise<readonly unknown[]> {
    if (this.refuses !== null) { return Promise.reject(this.refuses(scopepaths)) }
    return Promise.resolve(scopepaths.map((scopepath) => this.rows.get(scopepath) ?? null))
  }

  protected doSwapRow(scopepath: string, swap: RowSwap): Promise<unknown> {
    const stored = this.rows.get(scopepath) ?? null
    const next = swap(stored)
    if (next === null) { this.rows.delete(scopepath) }
    if (next !== null && next !== undefined) { this.rows.set(scopepath, next) }
    return Promise.resolve(stored)
  }

  protected doFindRows(_prefix: string, isWithin: Scopepath.ScopepathPred): Promise<readonly FoundRow[]> {
    if (this.refuses !== null) { return Promise.reject(this.refuses([])) }
    return Promise.resolve([...this.rows].filter(([scopepath]) => isWithin(scopepath)).map(([scopepath, row]) => ({ scopepath, row })))
  }

  protected override doWatch(_prefix: string, onChange: () => void, onTrouble: (err: unknown) => void): () => void {
    const watch = { onChange, onTrouble, isLive: true }
    this.watches.push(watch)
    return () => { watch.isLive = false }
  }
}

const boxDnaOf = (boxlabel: string) => ({ boxlabel, whisper: { val: { apiKey: 'sk-test-0000' } }, sidecar: {} })

/** A bank over a {@link TroubledFront}, hello'd, with its vault watch live, and the news its `onBadNews` hears, by kind. */
const troubledBank = async () => {
  const front = new TroubledFront()
  const onBadNews = vi.fn()
  const world = makeBankWorld(null, { vaultDB: front, onBadNews })
  await world.bank.hello()
  const heardKinds = (): readonly string[] => onBadNews.mock.calls.map(([news]) => (news as VaultError).refusalkind)
  return { ...world, front, onBadNews, heardKinds }
}

// == [The handler]: left out, given, failing

describe("BankOpts.onBadNews left out", () => {
  it("sends the news to the logger and to the platform's reportError", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const spy = TH.spyLogger()
    const { bank } = makeBankWorld(null, { logger: spy.logger })
    const news = down()
    bank.vaultListing.tellBadNews([news])
    expect(spy.calls).to.have.lengthOf(1)
    expect(spy.calls[0]).to.include({ level: 'warn', err: news })
    expect(spy.calls[0]?.story).to.deep.equal({ call: 'onBadNews' })
    expect(reported).to.deep.equal([news])
  })

  it("reaches the platform where the logger throws", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const { bank } = makeBankWorld(null, { logger: ThrowingLogger })
    const news = down()
    bank.vaultListing.tellBadNews([news])
    expect(reported).to.deep.equal([news])
  })
})

describe("BankOpts.onBadNews given", () => {
  it("is told each piece once, and neither logger nor platform hears it", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const spy = TH.spyLogger()
    const onBadNews = vi.fn()
    const { bank } = makeBankWorld(null, { logger: spy.logger, onBadNews })
    const news = down()
    bank.vaultListing.tellBadNews([news])
    bank.vaultListing.tellBadNews([news])
    await TH.wakeupAtNextTick()
    expect(onBadNews.mock.calls).to.deep.equal([[news]])
    expect(spy.calls).to.deep.equal([])
    expect(reported).to.deep.equal([])
  })

  it.each([
    ['throws', () => { throw new Error("Handler trouble.") }],
    ['rejects', () => Promise.reject(new Error("Handler trouble."))],
  ])("that %s goes to the logger and the platform, and throws nothing into the teller", async (_how, onBadNews) => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const spy = TH.spyLogger()
    const { bank } = makeBankWorld(null, { logger: spy.logger, onBadNews })
    expect(() => { bank.vaultListing.tellBadNews([down()]) }).to.not.throw()
    await TH.eventually(() => reported.length === 1)
    expect((reported[0] as Error).message).to.eq("Handler trouble.")
    expect(spy.calls).to.have.lengthOf(1)
    expect(spy.calls[0]).to.include({ level: 'error', err: reported[0] })
    expect(spy.calls[0]?.story).to.deep.equal({ call: 'onBadNews' })
  })

  it("that throws reaches the platform where the logger throws too", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const { bank } = makeBankWorld(null, { logger: ThrowingLogger, onBadNews: () => { throw new Error("Handler trouble.") } })
    bank.vaultListing.tellBadNews([down()])
    await TH.eventually(() => reported.length === 1)
    expect((reported[0] as Error).message).to.eq("Handler trouble.")
  })

  it("hears what a vault's box listing is told: a box's refused fetch under the box store's watch", async () => {
    const { bank, front, heardKinds } = await troubledBank()
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    await vault.ensureBox(boxDnaOf('anthropic'))
    front.refuses = down
    for (const { onChange } of front.liveWatches.slice(1)) { onChange() }
    await TH.eventually(() => heardKinds().length > 0)
    expect(heardKinds()).to.deep.equal(['storage_unavailable'])
  })
})
// --

// == [Sign-out]: identity_revoked closes the vaults

describe("a sign-out, told as 'identity_revoked' news", () => {
  it("closes the vaults when the vault store's watch fails and each vault's fetch is refused", async () => {
    const { bank, front, deviceDB, heardKinds } = await troubledBank()
    const main = await bank.ensureVault(Main, byPassphrase(Passphrase))
    const work = await bank.ensureVault(Work, byPassphrase(Passphrase))
    front.refuses = revoked
    front.trouble()
    await TH.eventually(() => heardKinds().length > 0)
    expect(heardKinds()).to.deep.equal(['identity_revoked'])
    expect(main.isLocked).to.be.true
    expect(work.isLocked).to.be.true
    expect(bank.snapshot.vaults).to.deep.equal([])
    await TH.eventually(() => deviceDB.tryDelLease.mock.calls.length === 2)
  })

  it("closes the vaults when it comes of a box store's watch alone, and ends that watch", async () => {
    const front = new TroubledFront()
    const onBadNews = vi.fn()
    const { bank } = makeBankWorld(null, { vaultDB: front, onBadNews })
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    await vault.ensureBox(boxDnaOf('anthropic'))
    expect(front.liveWatches).to.have.lengthOf(1)
    front.refuses = revoked
    front.trouble()
    await TH.eventually(() => onBadNews.mock.calls.length > 0)
    expect(vault.isLocked).to.be.true
    expect(bank.vaultOf(Main)).to.be.null
    expect(front.liveWatches).to.deep.equal([])
  })

  it("closes the vaults before the handler is told, so a handler that throws cannot skip it", async () => {
    const seen: boolean[] = []
    const { bank } = makeBankWorld(null, { onBadNews: () => {
      seen.push(bank.snapshot.vaults.length === 0)
      throw new Error("Handler trouble.")
    } })
    await bank.ensureVault(Main, byPassphrase(Passphrase))
    bank.vaultListing.tellBadNews([revoked()])
    await TH.eventually(() => seen.length === 1)
    expect(seen).to.deep.equal([true])
    expect(bank.vaultOf(Main)).to.be.null
  })

  it("closes nothing for any other news", async () => {
    const { bank } = makeBankWorld(null, { onBadNews: vi.fn() })
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    bank.vaultListing.tellBadNews([down()])
    expect(vault.isLocked).to.be.false
    expect(bank.vaultOf(Main)).to.equal(vault)
  })

  it("is not heard by a bank holding no vault: nothing is fetched, nobody told", async () => {
    const { front, onBadNews, bank } = await troubledBank()
    const getRows = vi.spyOn(front as unknown as { doGetRows: () => Promise<unknown> }, 'doGetRows')
    front.refuses = revoked
    front.trouble()
    await TH.aWhile()
    expect(onBadNews).not.toHaveBeenCalled()
    expect(getRows).not.toHaveBeenCalled()
    expect(bank.snapshot.vaults).to.deep.equal([])
  })
})
// --

// == [One hiccup, one piece of news]: a listing's forced refetch

describe("a watch's trouble, as each thing fetches again", () => {
  it("tells one piece for a refusal every vault meets", async () => {
    const { bank, front, heardKinds } = await troubledBank()
    await bank.ensureVault(Main, byPassphrase(Passphrase))
    await bank.ensureVault(Work, byPassphrase(Passphrase))
    front.refuses = down
    front.trouble()
    await TH.eventually(() => heardKinds().length > 0)
    await TH.aWhile()
    expect(heardKinds()).to.deep.equal(['storage_unavailable'])
  })

  it("tells one piece of each kind where the vaults meet different refusals", async () => {
    const { bank, front, heardKinds } = await troubledBank()
    await bank.ensureVault(Main, byPassphrase(Passphrase))
    await bank.ensureVault(Work, byPassphrase(Passphrase))
    front.refuses = (scopepaths) => (scopepaths.some((scopepath) => scopepath.includes(Work.vaultlabel)) ? behind() : down())
    front.trouble()
    await TH.eventually(() => heardKinds().length > 1)
    expect(heardKinds()).to.have.members(['storage_unavailable', 'vault_behind'])
  })

  it("tells a box listing's one piece for a refusal every box meets", async () => {
    const { bank, front, heardKinds } = await troubledBank()
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    await vault.ensureBox(boxDnaOf('anthropic'))
    await vault.ensureBox(boxDnaOf('openai'))
    front.refuses = down
    for (const { onChange } of front.liveWatches.slice(1)) { onChange() }
    await TH.eventually(() => heardKinds().length > 0)
    await TH.aWhile()
    expect(heardKinds()).to.deep.equal(['storage_unavailable'])
  })

  it("tells nothing of a vault locked or a box it holds: fetching needs no unlocked vault", async () => {
    const { bank, front, heardKinds } = await troubledBank()
    const vault = await bank.ensureVault(Main, byPassphrase(Passphrase))
    await vault.ensureBox(boxDnaOf('anthropic'))
    vault.lock()
    for (const { onChange } of front.liveWatches) { onChange() }
    front.trouble()
    await TH.aWhile()
    expect(vault.isLocked).to.be.true
    expect(vault.boxes).to.have.lengthOf(1)
    expect(heardKinds()).to.deep.equal([])
  })
})
// --

// == [The device record written over]: told as bad news

describe("bank.hello() over a damaged device record", () => {
  it("tells the deviceDB's writing over it, once, and goes on to 'ready'", async () => {
    const onBadNews = vi.fn()
    const { bank, advanceDeviceRecord } = makeBankWorld(null, { onBadNews })
    advanceDeviceRecord.mockResolvedValueOnce({ record: deviceRecordOf(BankScope, 'device-1'), wroteOverDamaged: true })
    await bank.hello()
    expect(onBadNews).toHaveBeenCalledOnce()
    const [[news]] = onBadNews.mock.calls as [[VaultError]]
    expect(news).to.be.instanceOf(VaultError)
    expect(news.refusalkind).to.eq('corrupt_record')
    expect(bank.snapshot.lifecycle).to.eq('ready')
  })

  it("tells nothing of a sound one", async () => {
    const onBadNews = vi.fn()
    const { bank } = makeBankWorld(null, { onBadNews })
    await bank.hello()
    expect(onBadNews).not.toHaveBeenCalled()
  })
})
// --
