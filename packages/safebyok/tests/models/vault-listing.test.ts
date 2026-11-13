/** A bank's vault listing: what each row does to the vault listed under its scope, and the end state a delete lands on. */

import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { nowMillis } from '../../src/helpers/clock'
import type { Box } from '../../src/models/box'
import * as SX from '../../src/shapes/shapes-storage'
import * as BX from '../../src/shapes/shapes-bankdb'
import type { VaultRecord } from '../../src/shapes/shapes-bankdb'
import type { Vault } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { Dna, Passphrase, byPassphrase, makeBornVault, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

const BoxDna = { ...Dna, boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' }, sidecar: {} }

/** The tombstone a delete elsewhere leaves over `record`, in a life of its own. */
function tombstoneOver(record: VaultRecord) { return { ...record, am: 'x' as const, vault_tok: 'life-gone', revision_seq: record.revision_seq + 1, revision_tok: 'rev-gone' } }

/** `record` in another life of its vault, stored at `revision_seq`. */
function otherLifeAt(record: VaultRecord, revision_seq: number): VaultRecord { return { ...record, vault_tok: `life-other-${String(revision_seq)}`, revision_seq, revision_tok: `rev-other-${String(revision_seq)}` } }

/** Past the forget each end state sets going. */
function forgotten() { return new Promise((yes) => { setTimeout(yes, 0) }) }

/** A born vault deleted, past its forget, and its tombstone as stored. */
async function deleted() {
  const world = await makeBornVault()
  await world.vault.del(world.vault)
  await forgotten()
  return { ...world, tombstone: BX.vaultTombstone.parse(world.storedNow()) }
}

/** The listing of the next session on `world`'s device: its bank ensured, its vaults listed. */
async function nextListingOf(world: Awaited<ReturnType<typeof makeBornVault>>) {
  const bank = await world.anotherSession()
  return bank.vaultListing
}

/** The vault `listing` lists at {@link Dna}, demanded listed. */
function listedAt(listing: { at: (scope: typeof Dna) => Vault | null }): Vault {
  const vault = listing.at(Dna)
  if (vault === null) { throw new Error('no vault listed') }
  return vault
}

/** The scope of a second vault of the bank, which no session has listed. */
const SecondScope = Object.freeze({ ...Dna, vaultlabel: 'second' })

/** A row for the vault at {@link SecondScope}, laid in `world`'s bankDB behind every session's back. */
function laySecondVaultRow(world: Awaited<ReturnType<typeof makeBornVault>>): VaultRecord {
  const record = { ...world.demandStored(), ...SecondScope, vault_tok: 'life-second' }
  world.bankDB._cheat_shelfOf(Dna).vaultrows.set(SecondScope.vaultlabel, record)
  return record
}

// A tombstone is of a life of its own, which the vault listed takes on: it stands for its scope through its lives.
/** Past its forget, `vault` stands at its scope, out of the list and enabled, as the tombstone of a life after `lived`, the vault_tok it had. */
async function expectLandedGone(vault: Vault, lived: string, { listing }: Pick<Awaited<ReturnType<typeof makeBornVault>>, 'listing'>) {
  await forgotten()
  expect(listing.at(Dna)).to.eq(vault)
  expect(vault.vault_tok).to.not.eq(lived)
  expect(vault).to.include({ isPresent: false, isEnabled: true })
  expect(listing.snapshot).to.deep.equal([])
}

describe("listing.recordOfBirth", () => {
  it("makes the record of the bank's life and a new life of its own, at the revision after the row expected, at the time now", async () => {
    const { bank, listing } = await makeBornVault()
    const record = listing.recordOfBirth(Dna, { revision_tok: 'rev-gone', revision_seq: 4 })
    expect(record).to.deep.include({ ...Dna, am: 'a', bank_tok: bank.bank_tok, revision_seq: 5, registered_at: nowMillis(), written_at: nowMillis() })
    expect(record.revision_tok).to.not.eq('rev-gone')
    expect(record.vault_tok).to.not.eq(listing.recordOfBirth(Dna, SX.VoidRevision).vault_tok)
  })
})

describe("a tombstone over a live vault", () => {
  it("leaves the vault as a local delete would, once a fetch finds it", async () => {
    const world = await makeBornVault()
    const { vault, listing, demandStored, restoreRow } = world
    const boxes = vault.boxListing
    const box = await boxes.create(BoxDna)
    const lived = vault.vault_tok
    restoreRow(tombstoneOver(demandStored()))
    expect(await listing.get(Dna, { maxMillisSinceRefresh: 0, ifAbsent: 'nil' })).to.be.null
    await expectLandedGone(vault, lived, world)
    await TH.expectRefusal(boxes.get(omit(BoxDna, ['whisper', 'sidecar']), { maxMillisSinceRefresh: 0 }), 'disabled')
    expect(box.isEnabled).to.be.false
    await TH.expectRefusal(listing.get(Dna, { maxMillisSinceRefresh: 0 }), 'vault_gone')
    expect(vault.boxListing).to.not.eq(boxes)
    await TH.expectRefusal(vault.boxListing.get(omit(BoxDna, ['whisper', 'sidecar']), { maxMillisSinceRefresh: 0 }), 'absent_vault')
  })

  it("leaves the bank unlocked and its lease cached when the vault is first listed as a tombstone", async () => {
    const { bank, deviceDB, demandStored, restoreRow, listing } = await makeBornVault()
    restoreRow(tombstoneOver(demandStored()))
    deviceDB.forget.mockClear()
    await listing.get(Dna, { maxMillisSinceRefresh: 0, ifAbsent: 'nil' })
    await forgotten()
    expect(listing.at(Dna)?.isPresent).to.be.false
    expect(bank.isUnlocked).to.be.true
    expect(deviceDB.forget).not.toHaveBeenCalled()
  })
})

describe("a box answer carrying a vault row of a later life as its parent", () => {
  it("hands the vault the new life, locked, letting its boxes go, where the vault was made anew elsewhere", async () => {
    const world = await makeBornVault()
    const { bank, vault: bornVault, badnews } = world
    await bornVault.boxListing.create(BoxDna)
    const listing = await nextListingOf(world)
    const vault = listedAt(listing)
    const boxes = vault.boxListing
    await boxes.hello()
    await bornVault.del(bornVault)
    const anew = await bank.ensureVault({ vaultlabel: Dna.vaultlabel })
    await TH.expectRefusal(boxes.get(omit(BoxDna, ['whisper', 'sidecar']), { maxMillisSinceRefresh: 0 }), 'disabled')
    expect(boxes.isEnabled).to.be.false
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault).to.include({ vault_tok: anew.vault_tok, isPresent: true, isEnabled: true })
    expect(vault.bank.isLocked).to.be.true
    expect(vault.boxListing).to.not.eq(boxes)
    expect(badnews).to.deep.equal([])
  })

  it("hands the vault its tombstone, letting its boxes go, where the vault was deleted elsewhere", async () => {
    const world = await makeBornVault()
    const { vault: bornVault, badnews } = world
    await bornVault.boxListing.create(BoxDna)
    const listing = await nextListingOf(world)
    const vault = listedAt(listing)
    const boxes = vault.boxListing
    await boxes.hello()
    await bornVault.del(bornVault)
    await TH.expectRefusal(boxes.get(omit(BoxDna, ['whisper', 'sidecar']), { maxMillisSinceRefresh: 0 }), 'disabled')
    expect(boxes.isEnabled).to.be.false
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault.isPresent).to.be.false
    expect(badnews).to.deep.equal([])
  })
})

describe("a box method over a vault deleted elsewhere", () => {
  const ParentNow = { maxParentMillis: 0 }
  const Verbs = [
    ['box.extractWhisper', ({ box }) => box.extractWhisper(ParentNow)],
    ['box.put',           ({ box }) => box.put({ whisper: { apiKey: 'sk-new' }, sidecar: {} }, ParentNow)],
    ['box.del',            ({ box }) => box.del(box.scope, ParentNow)],
    ['vault.getBox',       ({ vault, box }) => vault.getBox(box.boxlabel, { ...ParentNow, maxMillisSinceRefresh: 0 })],
    ['vault.delBox',       ({ vault, box }) => vault.delBox(box.boxlabel, ParentNow)],
  ] as const satisfies readonly (readonly [string, (world: { vault: Vault, box: Box }) => Promise<unknown>])[]

  it.each(Verbs)("%s refuses", async (_verb, call) => {
    const { vault, demandStored, restoreRow } = await makeBornVault()
    const box = await vault.boxListing.create({ ...vault.scope, ...BoxDna })
    await vault.beginWatch()
    restoreRow(tombstoneOver(demandStored()))
    await TH.expectRefusal(call({ vault, box }))
  })
})

describe("vault.del(vault)", () => {
  it("leaves the vault deleted, and the bank unlocked", async () => {
    const world = await makeBornVault()
    const boxes = world.vault.boxListing
    const lived = world.vault.vault_tok
    await world.vault.del(world.vault)
    await expectLandedGone(world.vault, lived, world)
    await TH.expectRefusal(boxes.get(omit(BoxDna, ['whisper', 'sidecar']), { maxMillisSinceRefresh: 0 }), 'disabled')
    expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
    const gone = await world.vault.ensureTimely(0)
    TH.expectSyncRefusal(() => gone.demandPresent(), 'vault_gone')
    expect(world.bank.isUnlocked).to.be.true
  })

  it("refuses a vault already deleted, as storage does", async () => {
    const world = await makeBornVault()
    await world.vault.del(world.vault)
    const err = await TH.expectRefusal(world.vault.del(world.vault), 'absent_vault')
    expect(err.meta?.act).to.eq('dubdel')
    expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
  })
})

describe("vault.del(vault.scope)", () => {
  it("deletes an unlocked vault without showing a dialog", async () => {
    const world = await makeBornVault()
    const asked = vi.fn()
    world.dialog.requestCleartext = asked
    const lived = world.vault.vault_tok
    expect(await world.vault.del(world.vault.scope)).to.eq(world.vault)
    await expectLandedGone(world.vault, lived, world)
    expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
    expect(asked).not.toHaveBeenCalled()
  })
})

describe("a new life made elsewhere over a deleted vault", () => {
  it("is taken on by the vault's fetch and hydrate", async () => {
    const fetching = await deleted()
    const fetched = otherLifeAt({ ...fetching.vault.toJSON(), am: 'a' }, 2)
    fetching.restoreRow(fetched)
    expect(await fetching.vault.get({ maxMillisSinceRefresh: 0 })).to.eq(fetching.vault)
    expect(fetching.vault).to.include({ isPresent: true, vault_tok: fetched.vault_tok })
    const hydrating = await deleted()
    const hydrated = otherLifeAt({ ...hydrating.vault.toJSON(), am: 'a' }, 2)
    hydrating.restoreRow(hydrated)
    await TH.expectGood(hydrating.vault.tryHydrate({ maxMillisSinceRefresh: 0 }))
    expect(hydrating.vault).to.include({ isPresent: true, vault_tok: hydrated.vault_tok })
    expect(hydrating.listing.snapshot).to.deep.equal([Dna.vaultlabel])
  })
})

describe("a newer record of another vault_tok over a live vault", () => {
  it("is taken on by the vault's fetch and hydrate", async () => {
    const fetching = await makeBornVault()
    const fetched = otherLifeAt(fetching.demandStored(), 5)
    fetching.restoreRow(fetched)
    expect(await fetching.vault.get({ maxMillisSinceRefresh: 0 })).to.eq(fetching.vault)
    expect(fetching.vault.vault_tok).to.eq(fetched.vault_tok)
    const hydrating = await makeBornVault()
    const hydrated = otherLifeAt(hydrating.demandStored(), 5)
    hydrating.restoreRow(hydrated)
    await TH.expectGood(hydrating.vault.tryHydrate({ maxMillisSinceRefresh: 0 }))
    expect(hydrating.vault.vault_tok).to.eq(hydrated.vault_tok)
  })

  it("is taken on by the vault listed, its boxes let go, the bank's lease untouched", async () => {
    const { bank, vault, listing, deviceDB, demandStored, restoreRow } = await makeBornVault()
    const boxes = vault.boxListing
    const other = otherLifeAt(demandStored(), 5)
    restoreRow(other)
    const fetched = await listing.get(Dna, { maxMillisSinceRefresh: 0 })
    expect(fetched).to.eq(vault)
    expect(vault.vault_tok).to.eq(other.vault_tok)
    expect(listing.things).to.deep.equal([vault])
    expect(boxes.isEnabled).to.be.false
    expect(vault.boxListing).to.not.eq(boxes)
    await forgotten()
    expect(bank.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).not.to.be.null
  })

  it("is taken on by the vault listed when it is a tombstone", async () => {
    const { vault, listing, demandStored, restoreRow } = await makeBornVault()
    const tombstone = tombstoneOver(otherLifeAt(demandStored(), 5))
    restoreRow(tombstone)
    await TH.expectRefusal(listing.get(Dna, { maxMillisSinceRefresh: 0 }), 'vault_gone')
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault).to.include({ vault_tok: tombstone.vault_tok, isPresent: false })
  })
})

describe("a delete naming the life a vault had before its fetch found another", () => {
  it("refuses, and leaves the new life stored", async () => {
    const { vault, demandStored, restoreRow, storedNow } = await makeBornVault()
    const ante = vault.sparse
    const other = otherLifeAt(demandStored(), 5)
    restoreRow(other)
    await vault.get({ maxMillisSinceRefresh: 0 })
    await TH.expectRefusal(vault.del(ante), 'stale_write')
    expect(storedNow()).to.include({ am: 'a', vault_tok: other.vault_tok, revision_seq: 5 })
  })
})

describe("an older record", () => {
  it("of another vault_tok loses to a live vault, changing nothing", async () => {
    const { vault, listing, demandStored, restoreRow, putBehindOurBack } = await makeBornVault()
    putBehindOurBack(demandStored())
    await listing.get(Dna, { maxMillisSinceRefresh: 0 })
    const { revision_seq } = vault
    restoreRow(otherLifeAt(demandStored(), revision_seq - 1))
    expect(await listing.get(Dna, { maxMillisSinceRefresh: 0 })).to.eq(vault)
    expect(vault.revision_seq).to.eq(revision_seq)
  })

  it("of either vault_tok does not bring back a deleted vault", async () => {
    const { vault, listing, demandStored, restoreRow } = await makeBornVault()
    const born = demandStored()
    await vault.del(vault)
    const gone = listing.at(Dna)
    const tombstone = demandStored()
    expect(gone).to.include({ revision_tok: tombstone.revision_tok, isPresent: false })
    for (const older of [born, otherLifeAt(born, 0)]) {
      restoreRow(older)
      await TH.expectRefusal(listing.get(Dna, { maxMillisSinceRefresh: 0 }))
      expect(listing.at(Dna)).to.eq(gone)
      expect(gone?.revision_tok).to.eq(tombstone.revision_tok)
    }
  })
})

describe("building over a tombstone", () => {
  it("listing.at refuses a scope of another user, and returns null for another vault of this user", async () => {
    const { listing } = await makeBornVault()
    TH.expectSyncRefusal(() => listing.at({ ...Dna, user_id: 'another_user' }))
    expect(listing.at({ ...Dna, vaultlabel: 'another_vault' })).to.be.null
  })

  it("a birth's listing.put over a tombstone hands the vault listed the record's life", async () => {
    const { vault, listing, tombstone } = await deleted()
    const record = listing.recordOfBirth(Dna, tombstone)
    const reborn = await listing.put(record, { expected: tombstone, ifAbsent: 'add', ifPresent: 'get' })
    expect(reborn).to.eq(vault)
    expect(reborn.vault_tok).to.eq(record.vault_tok)
    expect(listing.at(Dna)).to.eq(reborn)
  })

  it("a birth's listing.put with nothing ever stored is written", async () => {
    const { listing } = await makeBornVault()
    const scope = SecondScope
    const record = listing.recordOfBirth(scope, SX.VoidRevision)
    const born = await listing.put(record, { expected: BX.shellVaultOf(scope), ifAbsent: 'add', ifPresent: 'get' })
    expect(born.vault_tok).to.eq(record.vault_tok)
  })

  it("a birth's listing.put that loses a race lists the winner's vault", async () => {
    const { listing, tombstone, restoreRow, vault } = await deleted()
    const theirs = otherLifeAt({ ...vault.toJSON(), am: 'a' }, 2)
    restoreRow(theirs)
    const record = listing.recordOfBirth(Dna, tombstone)
    const won = await listing.put(record, { expected: tombstone, ifAbsent: 'add', ifPresent: 'get' })
    expect(won.vault_tok).to.eq(theirs.vault_tok)
    expect(listing.at(Dna)).to.eq(won)
  })

  it("a birth's listing.put refuses over a newer tombstone, and lists nothing of the record", async () => {
    const { listing, tombstone, demandStored, restoreRow } = await deleted()
    const record = listing.recordOfBirth(Dna, tombstone)
    const stored = demandStored()
    restoreRow(tombstoneOver(stored))
    await TH.expectBad(listing.tryPut(record, { expected: tombstone, ifAbsent: 'add', ifPresent: 'get' }), 'stale_write')
    expect(listing.at(Dna)).to.include({ isPresent: false, revision_seq: 2 })
    expect(listing.at(Dna)?.vault_tok).to.not.eq(record.vault_tok)
  })
})

describe("the entrypoints, given malformed input", () => {
  it("a birth's listing.put refuses a malformed record, putting nothing", async () => {
    const { listing, bankDB } = await makeBornVault()
    const scope = SecondScope
    await TH.expectRefusal(listing.put({ garbage: true } as never, { expected: BX.shellVaultOf(scope), ifAbsent: 'add', ifPresent: 'get' }))
    expect(bankDB._cheat_shelfOf(Dna).vaultrows.has('second')).to.be.false
  })

  it("listing.del refuses a malformed record", async () => {
    const { listing } = await makeBornVault()
    await TH.expectRefusal(listing.del(null as never))
  })
})

describe("lock() with a forget that throws synchronously", () => {
  it("locks without throwing, and reports the refused forget to onLifecycle", async () => {
    const onLifecycle = vi.fn<(told: { kind: string }) => void>()
    const { bank, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { onLifecycle })
    deviceDB.forget.mockImplementationOnce(() => { throw new Error('the duck is broken') })
    expect(() => bank.lock()).to.not.throw()
    expect(bank.isLocked).to.be.true
    await forgotten()
    expect(onLifecycle.mock.calls.filter(([told]) => told.kind === 'lease_revoke_failed')).to.have.lengthOf(1)
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed', bank, where: 'lock' }))
  })
})

describe("a damaged row", () => {
  it("refuses a fetch 'damaged_row', leaving the listed vault as it was", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    restoreRow({ garbage: true } as never)
    await TH.expectRefusal(listing.get(Dna, { maxMillisSinceRefresh: 0 }), 'damaged_row')
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault.isPresent).to.be.true
    expect(vault.bank.isLocked).to.be.false
  })
})

describe("a damaged row met by listing the bank's vaults", () => {
  it("lets the listed vault go, out of the list, and tells of the row as bad news", async () => {
    const { vault, listing, restoreRow, badnews } = await makeBornVault()
    restoreRow({ garbage: true } as never)
    await listing.list()
    expect(listing.snapshot).to.deep.equal([])
    expect(listing.at(Dna)).to.be.null
    expect(vault.isEnabled).to.be.false
    expect(badnews.map((news) => news.refusalkind)).to.include('damaged_row')
  })

  it("lists another vault at the next listing that finds the row whole", async () => {
    const { vault, listing, restoreRow, demandStored } = await makeBornVault()
    const stored = demandStored()
    restoreRow({ garbage: true } as never)
    await listing.list()
    restoreRow(stored)
    await listing.list()
    expect(listing.snapshot).to.deep.equal([Dna.vaultlabel])
    expect(listing.at(Dna)).to.not.eq(vault)
  })

  it("tells its listeners when its list changes, and only then", async () => {
    const { listing, restoreRow, demandStored } = await makeBornVault()
    const stored = demandStored()
    const listener = vi.fn()
    listing.subscribe(listener)
    restoreRow({ garbage: true } as never)
    await listing.list()
    await listing.list()
    expect(listing.snapshot).to.deep.equal([])
    expect(listener).toHaveBeenCalledOnce()
    restoreRow(tombstoneOver(stored))
    await listing.list()
    expect(listing.snapshot).to.deep.equal([])
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe("the listing's methods return the bankDB's answer", () => {
  it("tryList returns the act, with the listed vaults as its val", async () => {
    const { vault, listing } = await makeBornVault()
    const answer = await TH.expectGood(listing.tryList())
    expect(answer).to.deep.equal([vault])
    expect(await listing.tryList()).to.deep.include({ ok: true, act: 'got' })
  })

  it("tryDel returns the del's act, with the vault listed under its tombstone as its val", async () => {
    const { vault, listing } = await makeBornVault()
    vault.bank.lock()
    const ante = vault.sparse
    const answer = await listing.tryDel(ante)
    expect(answer).to.deep.include({ ok: true, act: 'deleted', val: vault })
    expect(vault).to.include({ isPresent: false })
    expect(vault.vault_tok).to.not.eq(ante.vault_tok)
  })

  it("tryDel returns a bad answer for a delete naming another vault life, deleting nothing", async () => {
    const { vault, listing, storedNow } = await makeBornVault()
    const before = storedNow()
    const answer = await listing.tryDel({ ...listing.sparseOf(vault), vault_tok: 'another-life' })
    expect(answer).to.deep.include({ ok: false, parent: null })
    expect(answer.err?.refusalkind).to.eq('vault_reborn')
    expect(storedNow()).to.deep.equal(before)
  })

  it("get returns a listed vault, and fetches one that is not listed", async () => {
    const world = await makeBornVault()
    const { vault, listing } = world
    expect(await listing.get(Dna)).to.eq(vault)
    const laid = laySecondVaultRow(world)
    const fetched = await listing.get(SecondScope)
    expect(fetched?.vault_tok).to.eq(laid.vault_tok)
  })
})

describe("listing.tryGet", () => {
  it("returns act 'timely' without asking storage when the listed instance is fresh enough", async () => {
    const { vault, listing, bankDB } = await makeBornVault()
    const tryGetVault = vi.spyOn(bankDB, 'tryGetVault')
    const answer = await listing.tryGet(Dna, { maxMillisSinceRefresh: Infinity })
    expect(answer).to.deep.include({ ok: true, act: 'timely', val: vault, parent: null })
    expect(tryGetVault).not.toHaveBeenCalled()
  })

  it("expects the shell row for a vault not listed, and the listed vault's own row from then on", async () => {
    const world = await makeBornVault()
    const { listing, bankDB } = world
    laySecondVaultRow(world)
    const scope = SecondScope
    const tryGetVault = vi.spyOn(bankDB, 'tryGetVault')
    const vault = await listing.get(scope, { maxMillisSinceRefresh: 0 })
    await listing.get(scope, { maxMillisSinceRefresh: 0 })
    expect(tryGetVault.mock.calls.map(([ask]) => ask.expected)).to.deep.equal([BX.shellVaultOf(scope), vault?.sparse])
  })

  it("returns the bankDB's own act when it asked storage", async () => {
    const { vault, listing } = await makeBornVault()
    const answer = await listing.tryGet(Dna, { maxMillisSinceRefresh: 0 })
    expect(answer).to.deep.include({ ok: true, act: 'gotlive', val: vault })
  })
})

describe("a listing shares one storage call among concurrent requests", () => {
  it("joins gets of one scope made while one runs, the instance's own among them, into one get", async () => {
    const { vault, listing, bankDB } = await makeBornVault()
    const tryGetVault = vi.spyOn(bankDB, 'tryGetVault')
    const [fetched, refetched, own] = await Promise.all([listing.get(Dna, { maxMillisSinceRefresh: 0 }), listing.get(Dna, { maxMillisSinceRefresh: 0 }), vault.get({ maxMillisSinceRefresh: 0 })])
    expect([fetched, refetched, own]).to.deep.equal([vault, vault, vault])
    expect(tryGetVault).toHaveBeenCalledOnce()
  })

  it("joins two gets of a stale box into one get of its row", async () => {
    const { vault, bankDB } = await makeBornVault()
    await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryGetBox = vi.spyOn(bankDB, 'tryGetBox')
    const stale = { maxMillisSinceRefresh: 0 }
    const [one, two] = await Promise.all([vault.getBox('anthropic_api_key', stale), vault.getBox('anthropic_api_key', stale)])
    expect(one).to.eq(two)
    expect(tryGetBox).toHaveBeenCalledOnce()
  })

  it("starts a fresh get for a fetch asked once the last has settled", async () => {
    const { listing, bankDB } = await makeBornVault()
    const tryGetVault = vi.spyOn(bankDB, 'tryGetVault')
    await listing.get(Dna, { maxMillisSinceRefresh: 0 })
    await listing.get(Dna, { maxMillisSinceRefresh: 0 })
    expect(tryGetVault).toHaveBeenCalledTimes(2)
  })

  it("joins lists made while one runs into one listing", async () => {
    const { listing, bankDB } = await makeBornVault()
    const tryEnsureBank = vi.spyOn(bankDB, 'tryEnsureBank')
    await Promise.all([listing.list(), listing.list()])
    expect(tryEnsureBank).toHaveBeenCalledOnce()
  })
})
