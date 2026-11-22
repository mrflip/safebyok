/** Minders of several banks caching in one client makeClient made: VaultMinders in one, their BankMinders in another. */

import { QueryClient } from '@tanstack/query-core'
import { describe, expect, it } from 'vitest'
import { BankMinder } from '../../../src/minding/bank-minder'
import { VaultMinder } from '../../../src/minding/vault-minder'
import { MinderEventFormat } from '../../../src/shapes/shapes-minder'
import type { BankScope } from '../../../src/shapes/shapes-stamps'
import { type ThingScope, Shell } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { fakeBankOf, listenerOf, minderOf, toldOf } from './world'

/** Another user's bank of the same banklabel as {@link TH.ThingBank}. */
const OtherUserBank: BankScope = Object.freeze({ userid: 'u2', banklabel: 'acme' })
/** Another bank of {@link TH.ThingBank}'s user. */
const OtherLabelBank: BankScope = Object.freeze({ userid: 'u1', banklabel: 'beta' })

/** The scope of `labelpath` in `bank`. */
function scopeIn(bank: BankScope, labelpath: string): ThingScope { return { ...bank, labelpath } }

/** The box `boxlabel` under `bank`'s root box. */
function boxIn(bank: BankScope, boxlabel = 'openai') { return TH.boxThingOf(boxlabel, bank) }

/** The ask that births the box `boxlabel` under `bank`'s root box, over its shell. */
function boxBirthAskIn(bank: BankScope, boxlabel = 'openai') {
  return TH.birthAskOf(boxIn(bank, boxlabel), Shell.of(scopeIn(bank, `box/${boxlabel}`), TH.rootBoxOf(bank)))
}

/** `vaultDB` with each of `banks` born, its roots at revision 0, and the box `openai` stored under its root box. */
async function storedBanksOf(vaultDB: MemoryVaultDB, banks: readonly BankScope[]): Promise<MemoryVaultDB> {
  for (const bank of banks) {
    const roots = { bank: TH.bankThingOf(bank), gate: TH.gateThingOf(bank), root: TH.rootBoxOf(bank) }
    await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf({ ...bank, ...roots })))
    await TH.expectGood(vaultDB.tryWriteThing(boxBirthAskIn(bank)))
  }
  return vaultDB
}

/** A started BankMinder of each of `banks` over `vaultDB`, all caching in one client, each having fetched its bank's roots. */
async function sharedBankMindersOf(vaultDB: MemoryVaultDB, banks: readonly BankScope[]): Promise<BankMinder[]> {
  const queryClient = BankMinder.makeClient()
  return await Promise.all(banks.map(async (bank) => {
    const bankMinder = BankMinder.make({ vaultDB, queryClient }, fakeBankOf(bank))
    bankMinder.hello()
    await bankMinder.fetchWorld()
    return bankMinder
  }))
}

/** A started minder of `bank` over `vaultDB`, caching in `queryClient` and reading the root box from `bankMinder`, with a listener heard from after its hello. */
function sharingMinderOf(vaultDB: MemoryVaultDB, bankMinder: BankMinder, queryClient: QueryClient, bank: BankScope) {
  const minder = VaultMinder.make({ vaultDB, bankMinder, queryClient }, fakeBankOf(bank))
  minder.hello()
  const heard = listenerOf()
  minder.listen(heard, MinderEventFormat)
  return { bank, minder, heard, bankMinder }
}

/** Two started minders over one vaultDB with both banks stored, {@link TH.ThingBank}'s and `otherBank`'s, caching in one client, and their BankMinders in another. */
async function sharedWorldOf(otherBank: BankScope) {
  const vaultDB     = await storedBanksOf(new MemoryVaultDB(), [TH.ThingBank, otherBank])
  const [myBankMinder, theirBankMinder] = await sharedBankMindersOf(vaultDB, [TH.ThingBank, otherBank])
  const queryClient = VaultMinder.makeClient()
  const mine        = sharingMinderOf(vaultDB, myBankMinder!, queryClient, TH.ThingBank)
  const theirs      = sharingMinderOf(vaultDB, theirBankMinder!, queryClient, otherBank)
  return { vaultDB, queryClient, mine, theirs }
}

describe("VaultMinder.makeClient", () => {
  it("makes a client each minder made with it caches in, and a client of its own for a minder made without one", async () => {
    const queryClient = VaultMinder.makeClient()
    const vaultDB     = new MemoryVaultDB()
    const bankMinder  = BankMinder.make({ vaultDB }, fakeBankOf())
    expect(VaultMinder.make({ vaultDB, bankMinder, queryClient }, fakeBankOf()).queryClient).to.equal(queryClient)
    const [minder1, minder2] = [await minderOf(vaultDB), await minderOf(vaultDB)]
    const [own1, own2]       = [minder1.queryClient, minder2.queryClient]
    expect(own1).to.not.equal(own2)
    expect([VaultMinder.isClient(own1), VaultMinder.isClient(queryClient)]).to.deep.equal([true, true])
  })

  it("is the only maker of a client make accepts", () => {
    expect(VaultMinder.isClient(new QueryClient())).to.be.false
    const vaultDB = new MemoryVaultDB()
    TH.expectSyncRefusal(() => VaultMinder.make({ vaultDB, bankMinder: BankMinder.make({ vaultDB }, fakeBankOf()), queryClient: new QueryClient() }, fakeBankOf()), 'bad_record')
  })
})

for (const [otherBank, blurb] of [[OtherUserBank, 'two users'], [OtherLabelBank, 'two banks of one user']] as const) {
  describe(`minders of ${blurb} sharing a client`, () => {
    it("each land a get's record in its own bank alone, and tell only their own listeners", async () => {
      const { mine, theirs } = await sharedWorldOf(otherBank)
      expect(await mine.minder.get(TH.BoxScope)).to.deep.equal(boxIn(TH.ThingBank))
      expect(theirs.minder.at(scopeIn(otherBank, 'box/openai'))).to.be.undefined
      expect(toldOf(theirs.heard)).to.deep.equal([])
      expect(await theirs.minder.get(scopeIn(otherBank, 'box/openai'))).to.deep.equal(boxIn(otherBank))
      // A get's record joins its parent's listing as the cache's onSuccess settles it.
      expect(mine.minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
      expect(theirs.minder.listingAt(scopeIn(otherBank, 'box'))).to.deep.equal(['box/openai'])
      expect(toldOf(mine.heard)).to.deep.equal([['box/openai', 'live'], ['listing']])
      expect(toldOf(theirs.heard)).to.deep.equal([['box/openai', 'live'], ['listing']])
    })

    it("each land a list's labelpaths and the soons it brings in its own bank alone", async () => {
      const { mine, theirs } = await sharedWorldOf(otherBank)
      expect(await mine.minder.list('box')).to.deep.equal(['box/openai'])
      expect(mine.minder.soonAt(TH.BoxScope)).to.deep.equal(Thing.sparseOf(boxIn(TH.ThingBank)))
      expect(theirs.minder.soonAt(scopeIn(otherBank, 'box/openai'))).to.be.undefined
      expect(theirs.minder.isListingBareAt(scopeIn(otherBank, 'box'))).to.be.true
      expect(toldOf(theirs.heard)).to.deep.equal([])
      await theirs.minder.list('box')
      expect(theirs.minder.soonAt(scopeIn(otherBank, 'box/openai'))).to.deep.equal(Thing.sparseOf(boxIn(otherBank)))
      expect(toldOf(mine.heard)).to.deep.equal(toldOf(theirs.heard))
    })

    it("each land a write, and what the watch tells of it, in its own bank alone", async () => {
      const { vaultDB, mine, theirs } = await sharedWorldOf(otherBank)
      await mine.minder.write(boxBirthAskIn(TH.ThingBank, 'groq'))
      await TH.wakeupAtNextTick()
      expect(mine.minder.at(scopeIn(TH.ThingBank, 'box/groq'))).to.deep.equal(boxIn(TH.ThingBank, 'groq'))
      expect(toldOf(mine.heard)).to.deep.include(['box/groq', 'live'])
      // Another device's write, which only the watch tells of.
      await TH.expectGood(vaultDB.tryWriteThing(boxBirthAskIn(TH.ThingBank, 'mistral')))
      await TH.eventually(() => toldOf(mine.heard).some(([labelpath]) => labelpath === 'box/mistral'))
      expect(theirs.minder.at(scopeIn(otherBank, 'box/groq'))).to.be.undefined
      expect(theirs.minder.soonAt(scopeIn(otherBank, 'box/mistral'))).to.be.undefined
      expect(theirs.minder.listingAt(scopeIn(otherBank, 'box'))).to.deep.equal([])
      expect(toldOf(theirs.heard)).to.deep.equal([])
    })

    it("have BankMinders sharing a client of their own, each landing only its own bank's main gate, and tell nothing of it", async () => {
      const { vaultDB, mine, theirs } = await sharedWorldOf(otherBank)
      const [gate0, gate1] = [TH.gateThingOf(), TH.nextGateOf(TH.gateThingOf())]
      expect(mine.bankMinder.queryClient).to.equal(theirs.bankMinder.queryClient)
      await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(gate0, gate1)))
      await TH.eventually(() => mine.bankMinder.worldAt()?.gate.revtok === gate1.revtok)
      expect(mine.bankMinder.worldAt()?.gate).to.deep.equal(gate1)
      expect(theirs.bankMinder.worldAt()?.gate).to.deep.equal(TH.gateThingOf(otherBank))
      expect([toldOf(mine.heard), toldOf(theirs.heard)]).to.deep.equal([[], []])
    })

    it("each keep their entries and attachment when the other says goodbye", async () => {
      const { mine, theirs } = await sharedWorldOf(otherBank)
      await mine.minder.get(TH.BoxScope)
      await theirs.minder.get(scopeIn(otherBank, 'box/openai'))
      mine.minder.goodbye()
      expect(theirs.minder.at(scopeIn(otherBank, 'box/openai'))).to.deep.equal(boxIn(otherBank))
      await theirs.minder.write(boxBirthAskIn(otherBank, 'groq'))
      await TH.wakeupAtNextTick()
      expect(theirs.minder.listingAt(scopeIn(otherBank, 'box'))).to.deep.equal(['box/groq', 'box/openai'])
      expect(toldOf(theirs.heard).filter(([, told]) => told === 'removed')).to.deep.equal([])
    })
  })
}

describe("a minder on a shared client, after goodbye", () => {
  it("minds again at a second hello, as does another minder of its bank", async () => {
    const vaultDB     = await storedBanksOf(new MemoryVaultDB(), [TH.ThingBank])
    const [bankMinder] = await sharedBankMindersOf(vaultDB, [TH.ThingBank])
    const queryClient = VaultMinder.makeClient()
    const { minder }  = sharingMinderOf(vaultDB, bankMinder!, queryClient, TH.ThingBank)
    minder.goodbye()
    minder.hello()
    await minder.get(TH.BoxScope)
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
    minder.goodbye()
    const { minder: next } = sharingMinderOf(vaultDB, bankMinder!, queryClient, TH.ThingBank)
    await next.get(TH.BoxScope)
    expect(next.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })
})

describe("a shared client's cache", () => {
  it("settles nothing a fetch lands under a key of a bank no minder is minding", async () => {
    const vaultDB     = await storedBanksOf(new MemoryVaultDB(), [TH.ThingBank, OtherUserBank])
    const [bankMinder, otherBankMinder] = await sharedBankMindersOf(vaultDB, [TH.ThingBank, OtherUserBank])
    const queryClient = VaultMinder.makeClient()
    const mine        = sharingMinderOf(vaultDB, bankMinder!, queryClient, TH.ThingBank)
    sharingMinderOf(vaultDB, otherBankMinder!, queryClient, OtherUserBank).minder.goodbye()
    const queryKey    = VaultMinder.itemQueryKeyOf(scopeIn(OtherUserBank, 'box/openai'))
    const listKey     = VaultMinder.listQueryKeyOf(scopeIn(OtherUserBank, 'box'))
    queryClient.setQueryData(listKey, [])
    await queryClient.query({ queryKey, queryFn: () => boxIn(OtherUserBank) })
    expect(queryClient.getQueryData(listKey)).to.deep.equal([])
    expect(mine.minder.listingAt(TH.RootScope)).to.deep.equal([])
    expect(toldOf(mine.heard)).to.deep.equal([])
  })

  it("tells nothing of a host's own query under the bank's key head", async () => {
    const vaultDB     = await storedBanksOf(new MemoryVaultDB(), [TH.ThingBank])
    const [bankMinder] = await sharedBankMindersOf(vaultDB, [TH.ThingBank])
    const queryClient = VaultMinder.makeClient()
    const mine        = sharingMinderOf(vaultDB, bankMinder!, queryClient, TH.ThingBank)
    await queryClient.query({ queryKey: ['sok', 'u1', 'acme', 'gate'], queryFn: () => ({ revseq: 0 }) })
    expect(toldOf(mine.heard)).to.deep.equal([])
  })

  it("refuses a second minder of a bank at hello while the first is minding", async () => {
    const vaultDB     = await storedBanksOf(new MemoryVaultDB(), [TH.ThingBank])
    const [bankMinder] = await sharedBankMindersOf(vaultDB, [TH.ThingBank])
    const queryClient = VaultMinder.makeClient()
    const mine        = sharingMinderOf(vaultDB, bankMinder!, queryClient, TH.ThingBank)
    const twin        = VaultMinder.make({ vaultDB, bankMinder: bankMinder!, queryClient }, fakeBankOf())
    TH.expectSyncRefusal(() => { twin.hello() }, 'bad_record')
    await mine.minder.get(TH.BoxScope)
    expect(mine.minder.listingAt(TH.RootScope)).to.deep.equal(['box/openai'])
  })
})
