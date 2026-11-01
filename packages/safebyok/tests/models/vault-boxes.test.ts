import { describe, expect, it, vi } from 'vitest'
import type { BoxStore } from '../../src/models/box-listing'
import { localStoreFront } from '../../src/models/store-front'
import * as Phrases from '../../src/phrases'
import { memoryStore } from '../../src/string-store'
import * as TH from '../test-helpers'
import { makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase, makeBornVault, makeVaultWorld, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()
useBankWorlds()

const Boxlabel = 'anthropic_api_key'
const whisperOf = (val: string) => ({ val: { apiKey: val } })
const dnaOf = (val = 'sk-test-0000', boxlabel = Boxlabel) => ({ boxlabel, whisper: whisperOf(val), sidecar: {} })

/** A vault born in a world whose box stores spy on `watch` and on the unsubscribe each watch answers. */
const makeWatchedVault = async () => {
  const world = makeVaultWorld()
  const { vaultDB } = world.opts.world
  const unwatch = vi.fn()
  const watch = vi.fn()
  const boxStoreOf = vaultDB.boxStore.bind(vaultDB)
  vi.spyOn(vaultDB, 'boxStore').mockImplementation((scope): BoxStore => {
    const store = boxStoreOf(scope)
    return { ...store, watch: (...args) => { watch(); const stop = store.watch(...args); return () => { unwatch(); stop() } } }
  })
  const vault = await world.listing.ensure(Dna, byPassphrase(Passphrase))
  return { ...world, vault, watch, unwatch }
}

const noWatch = (): void => undefined

/** A vault holding a box deleted, and another session's vault of it that stores 'sk-test-other' just after this vault's next `get` answers, heard by this vault's watch or not as `isPushed` says. */
const makeRebirthRace = async (isPushed: boolean) => {
  const world = makeVaultWorld()
  const { vaultDB } = world.opts.world
  const boxStoreOf = vaultDB.boxStore.bind(vaultDB)
  let afterGet: (() => Promise<unknown>) | null = null
  vi.spyOn(vaultDB, 'boxStore').mockImplementation((scope): BoxStore => {
    const store = boxStoreOf(scope)
    return {
      ...store,
      get:   async (boxscope) => {
        const answer = await store.get(boxscope)
        const landing = afterGet
        afterGet = null
        await landing?.()
        return answer
      },
      watch: (...args) => (isPushed ? store.watch(...args) : noWatch),
    }
  })
  const vault = await world.listing.ensure(Dna, byPassphrase(Passphrase))
  const box = await vault.ensureBox(dnaOf())
  await box.del()
  const theirVault = await world.anotherSession().build(world.demandStored())
  await theirVault.takeUpCachedLease()
  await theirVault.getBox({ boxlabel: Boxlabel })
  afterGet = () => theirVault.ensureBox(dnaOf('sk-test-other'))
  return { vault, box, theirVault }
}

// == [Finding and ensuring]: getBox, makeBox, ensureBox, boxOf, boxes, boxscopeOf

describe("vault.ensureBox(): the box as the vaultDB holds it, made and stored where it holds none", () => {
  it("stores a box of the dna, scoped to the vault and held by it, its whisper unsealed on asking", async () => {
    const { vault } = await makeBornVault()
    const box = await vault.ensureBox(dnaOf())
    expect(box.scope).to.deep.equal({ ...Dna, boxlabel: Boxlabel })
    expect(box).to.include({ isPresent: true, hasStaged: false })
    expect(box.whisper).to.be.null
    expect(await box.getWhisper()).to.deep.equal(whisperOf('sk-test-0000').val)
    expect(vault.boxes).to.deep.equal([box])
    expect(vault.boxOf({ boxlabel: Boxlabel })).to.eq(box)
  })

  it("answers the box stored, its whisper untouched, where one is", async () => {
    const { vault } = await makeBornVault()
    const first = await vault.ensureBox(dnaOf())
    const again = await vault.ensureBox(dnaOf('sk-test-1111'))
    expect(again).to.eq(first)
    expect(again.revision_seq).to.eq(first.revision_seq)
    await again.expose()
    expect(again.whisper).to.deep.equal(whisperOf('sk-test-0000'))
  })

  for (const [isPushed, blurb] of [[true, 'its notice reaching the box first'], [false, "the put's 'stale_write' telling the box"]] as const) {
    it(`answers the box another session stored while a box deleted was coming back, ${blurb}`, async () => {
      const { vault, box, theirVault } = await makeRebirthRace(isPushed)
      expect(await vault.ensureBox(dnaOf('sk-test-1111'))).to.eq(box)
      expect(await box.getWhisper()).to.deep.equal(whisperOf('sk-test-other').val)
      const stored = await theirVault.getBox({ boxlabel: Boxlabel }, { maxMillisSinceRefresh: 0 })
      expect(await stored?.getWhisper()).to.deep.equal(whisperOf('sk-test-other').val)
    })
  }

  it("brings a box deleted back with the dna's whisper, where nothing else is stored", async () => {
    const { vault } = await makeBornVault()
    const box = await vault.ensureBox(dnaOf())
    await box.del()
    expect(await vault.ensureBox(dnaOf('sk-test-1111'))).to.eq(box)
    expect(box.isPresent).to.be.true
    expect(await box.getWhisper()).to.deep.equal(whisperOf('sk-test-1111').val)
  })

  it("refuses 'vault_locked' while the vault is locked, storing nothing", async () => {
    const { vault } = await makeBornVault()
    vault.lock()
    await TH.expectRefusal(vault.ensureBox(dnaOf()), 'vault_locked')
    expect(vault.boxes).to.deep.equal([])
  })

  it("answers the box as an Outcome in its try form", async () => {
    const { vault } = await makeBornVault()
    const box = await TH.expectGood(vault.tryEnsureBox(dnaOf()))
    expect(vault.boxOf({ boxlabel: Boxlabel })).to.eq(box)
    vault.lock()
    await TH.expectBad(vault.tryEnsureBox(dnaOf('sk-test-1111', 'other_key')), 'vault_locked')
  })
})

describe("vault.getBox(): the box as the vaultDB holds it, or null", () => {
  it("answers null where the vaultDB holds no box of the boxlabel, holding none", async () => {
    const { vault } = await makeBornVault()
    expect(await vault.getBox({ boxlabel: Boxlabel })).to.be.null
    expect(await TH.expectGood(vault.tryGetBox({ boxlabel: Boxlabel }))).to.be.null
    expect(vault.boxOf({ boxlabel: Boxlabel })).to.be.null
  })

  it("takes a bag of a boxlabel alone, as BoxBag's example shows", async () => {
    const { vault } = await makeBornVault()
    expect(await vault.getBox({ boxlabel: 'anthropic' })).to.be.null
  })

  it("answers the box another session stored, from the vaultDB", async () => {
    const { vault, anotherSession, demandStored } = await makeBornVault()
    const ours = await vault.ensureBox(dnaOf())
    const theirVault = await anotherSession().build(demandStored())
    expect(theirVault.boxOf({ boxlabel: Boxlabel })).to.be.null
    const theirs = await theirVault.getBox({ boxlabel: Boxlabel })
    expect(theirs).not.to.eq(ours)
    expect(theirs?.box_tok).to.eq(ours.box_tok)
    expect(theirVault.boxOf({ boxlabel: Boxlabel })).to.eq(theirs)
  })
})

describe("vault.makeBox(): a box held and stored nowhere until it is sent", () => {
  it("refuses 'bad_option' a dna whose whisper is no { val }, as ensureBox does, naming the field and holding nothing", async () => {
    const { vault } = await makeBornVault()
    const badDna = { boxlabel: Boxlabel, whisper: {}, sidecar: {} } as never
    for (const refused of [await TH.expectRefusal(vault.makeBox(badDna), 'bad_option'), await TH.expectRefusal(vault.ensureBox(badDna), 'bad_option')]) {
      expect(refused.message).to.contain('whisper')
    }
    expect(vault.boxes).to.deep.equal([])
  })

  it("holds a box of the dna and stores nothing until box.send()", async () => {
    const { vault, anotherSession, demandStored } = await makeBornVault()
    const box = await vault.makeBox(dnaOf())
    expect(vault.boxOf({ boxlabel: Boxlabel })).to.eq(box)
    expect(box).to.include({ hasStaged: true, revision_seq: 0 })
    const theirVault = await anotherSession().build(demandStored())
    expect(await theirVault.getBox({ boxlabel: Boxlabel })).to.be.null
    await box.send({ whisper: whisperOf('sk-test-0000'), sidecar: {} })
    expect(box.hasStaged).to.be.false
    expect(await theirVault.getBox({ boxlabel: Boxlabel })).not.to.be.null
  })

  it("refuses 'bad_option' where the vault already holds a box of the boxlabel, and answers the refusal in its try form", async () => {
    const { vault } = await makeBornVault()
    await vault.ensureBox(dnaOf())
    await TH.expectRefusal(vault.makeBox(dnaOf('sk-test-1111')), 'bad_option')
    await TH.expectBad(vault.tryMakeBox(dnaOf('sk-test-1111')), 'bad_option')
  })
})

describe("vault.boxscopeOf(): the scope of a box of this vault", () => {
  it("fills the vault's scope into a bag of a boxlabel, or of the vault's own scope", async () => {
    const { vault } = await makeBornVault()
    expect(vault.boxscopeOf({ boxlabel: Boxlabel })).to.deep.equal({ ...Dna, boxlabel: Boxlabel })
    expect(vault.boxscopeOf({ ...Dna, boxlabel: Boxlabel })).to.deep.equal({ ...Dna, boxlabel: Boxlabel })
  })

  it("refuses 'bad_scope' a bag naming another vault, and every box verb with it, naming the field", async () => {
    const { vault } = await makeBornVault()
    const err = TH.expectSyncRefusal(() => vault.boxscopeOf({ vaultlabel: 'other', boxlabel: Boxlabel }), 'bad_scope')
    expect(err.message).to.eq(Phrases.boxOfOtherVault(['vaultlabel']))
    TH.expectSyncRefusal(() => vault.boxOf({ user_id: 'u2', boxlabel: Boxlabel }), 'bad_scope')
    await TH.expectRefusal(vault.getBox({ vaultlabel: 'other', boxlabel: Boxlabel }), 'bad_scope')
    await TH.expectRefusal(vault.ensureBox({ ...dnaOf(), applabel: 'other' }), 'bad_scope')
  })

  it("refuses 'bad_scope' a bag without a boxlabel", async () => {
    const { vault } = await makeBornVault()
    TH.expectSyncRefusal(() => vault.boxscopeOf({} as never), 'bad_scope')
  })
})
// --

// == [The snapshot's boxes]

describe("vault.getSnapshot().boxes: the snapshot of each box present", () => {
  it("follows each box as it is made, stored, exposed and disarmed", async () => {
    const { vault } = await makeBornVault()
    expect(vault.getSnapshot().boxes).to.deep.equal([])
    const box = await vault.makeBox(dnaOf())
    expect(vault.getSnapshot().boxes).to.deep.equal([box.getSnapshot()])
    await box.send({ whisper: whisperOf('sk-test-0000'), sidecar: {} })
    expect(vault.getSnapshot().boxes).to.deep.equal([box.getSnapshot()])
    await box.expose()
    expect(vault.getSnapshot().boxes[0]?.exposed).to.be.true
    box.disarm()
    expect(vault.getSnapshot().boxes[0]?.exposed).to.be.false
  })

  it("tells the vault's subscribers of a box changing", async () => {
    const { vault } = await makeBornVault()
    const box = await vault.ensureBox(dnaOf())
    const told = vi.fn()
    vault.subscribe(told)
    await box.expose()
    expect(told).toHaveBeenCalled()
  })

  it("shows a box gone stale exposing the newer revision its own fetch brings in, as nothing overtook it", async () => {
    const { vault, anotherSession, demandStored, advance } = await makeBornVault()
    const ours = await vault.ensureBox(dnaOf())
    vault.goodbyeBoxes()
    const theirVault = await anotherSession().build(demandStored())
    await theirVault.takeUpCachedLease()
    const theirs = await theirVault.getBox({ boxlabel: Boxlabel })
    await theirs?.send({ whisper: whisperOf('sk-test-1111'), sidecar: {} })
    advance((10 * 60_000) + 1)
    await ours.expose()
    expect(ours.whisper).to.deep.equal(whisperOf('sk-test-1111'))
    expect(vault.getSnapshot().boxes[0]?.exposed).to.be.true
  })

  it("carries no whisper", async () => {
    const { vault } = await makeBornVault()
    await vault.ensureBox(dnaOf('sk-test-secret-9999'))
    expect(JSON.stringify(vault.getSnapshot())).not.to.contain('sk-test-secret-9999')
  })
})
// --

// == [Eviction and the watch]

describe("vault.evict(): its boxes go with it", () => {
  it("evicts every box the vault holds, forgetting each whisper exposed, when the bank closes the vault", async () => {
    const { bank } = makeBankWorld()
    const vault = await bank.ensureVault(Dna, byPassphrase(Passphrase))
    const box = await vault.ensureBox(dnaOf())
    await box.expose()
    bank.closeVault(Dna)
    expect(vault.boxes).to.deep.equal([])
    expect(box.getSnapshot().exposed).to.be.false
  })

  it("ends the box watch", async () => {
    const { vault, watch, unwatch } = await makeWatchedVault()
    await vault.ensureBox(dnaOf())
    expect(watch).toHaveBeenCalledOnce()
    vault.evict()
    expect(unwatch).toHaveBeenCalledOnce()
  })
})

describe("vault.helloBoxes() and vault.goodbyeBoxes(): the box watch", () => {
  it("starts once, at the first box verb, and again after a goodbye, keeping the boxes held", async () => {
    const { vault, watch, unwatch } = await makeWatchedVault()
    expect(watch).not.toHaveBeenCalled()
    const box = await vault.ensureBox(dnaOf())
    await vault.getBox({ boxlabel: Boxlabel })
    expect(watch).toHaveBeenCalledOnce()
    vault.goodbyeBoxes()
    expect(unwatch).toHaveBeenCalledOnce()
    expect(vault.boxes).to.deep.equal([box])
    await vault.getBox({ boxlabel: Boxlabel })
    expect(watch).toHaveBeenCalledTimes(2)
  })

  it("ends the watch a hello under way starts, where a goodbye overtakes it", async () => {
    const { vault, watch, unwatch } = await makeWatchedVault()
    const getting = vault.getBox({ boxlabel: Boxlabel })
    vault.goodbyeBoxes()
    await getting
    expect(watch).toHaveBeenCalledOnce()
    expect(unwatch).toHaveBeenCalledOnce()
  })

  it("keeps the watch a newer hello starts, where an older one a goodbye overtook answers after it", async () => {
    const { vault, watch, unwatch } = await makeWatchedVault()
    const older = vault.getBox({ boxlabel: Boxlabel })
    vault.goodbyeBoxes()
    const newer = vault.getBox({ boxlabel: Boxlabel })
    await Promise.all([older, newer])
    expect(watch).toHaveBeenCalledOnce()
    expect(unwatch).not.toHaveBeenCalled()
  })

  it("ends with the vault listing's goodbye", async () => {
    const { vault, listing, unwatch } = await makeWatchedVault()
    await vault.ensureBox(dnaOf())
    listing.goodbye()
    expect(unwatch).toHaveBeenCalledOnce()
  })
})
// --

// == [A StoreFront as the vaultDB]

describe("Bank.make over a StoreFront: the vaultDB a host hands it", () => {
  it("stores a vault and its boxes through the front, and a second vault's boxes apart from the first's", async () => {
    const { bank } = makeBankWorld(null, { vaultDB: localStoreFront({ store: memoryStore() }) })
    const vault = await bank.ensureVault(Dna, byPassphrase(Passphrase))
    const box = await vault.ensureBox(dnaOf())
    await box.expose()
    expect(box.whisper).to.deep.equal(whisperOf('sk-test-0000'))
    const other = await bank.ensureVault({ ...Dna, vaultlabel: 'other' }, byPassphrase(Passphrase))
    expect(await other.getBox({ boxlabel: Boxlabel })).to.be.null
  })
})
// --

// == [The box horizon]: boxRefreshMinutes reaches the boxes

describe("boxRefreshMinutes: how long a box stays timely", () => {
  it("keeps a box timely for the world's boxRefreshMillis, and no longer", async () => {
    const { vault, advance } = await makeBornVault()
    const box = await vault.ensureBox(dnaOf())
    expect(box.isTimely).to.be.true
    advance((10 * 60_000) - 1)
    expect(box.isTimely).to.be.true
    advance(2)
    expect(box.isTimely).to.be.false
  })

  it("reaches each vault's boxes from the bank's option", async () => {
    const { bank, advance } = makeBankWorld(null, { boxRefreshMinutes: 1 })
    const vault = await bank.ensureVault(Dna, byPassphrase(Passphrase))
    const box = await vault.ensureBox(dnaOf())
    advance(60_000 - 1)
    expect(box.isTimely).to.be.true
    advance(2)
    expect(box.isTimely).to.be.false
  })
})
// --
