/** The vault listing's slot: what each record does to the vault held under its scope, and the end state a delete lands on. */

import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Box } from '../../src/models/box'
import type { AnyGating, VaultRecord } from '../../src/models/models-shapes'
import { Vault } from '../../src/models/vault'
import { VaultListing } from '../../src/models/vault-listing'
import type { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as VS from '../../src/storage/vault-db-shapes'
import * as TH from '../test-helpers'
import { Dna, Passphrase, byPassphrase, delTyping, makeBornVault, makeVaultWorld, storedVaultRecord, useVaultWorlds, buildTyping } from '../test-helpers/vault-world'

useVaultWorlds()

const BoxDna = { ...Dna, boxlabel: 'anthropic_api_key', whisper: { val: 'sk-test-0000' }, sidecar: {} }

/** The tombstone a delete elsewhere leaves over `record`. */
const tombstoneOver = (record: VaultRecord) => ({ ...omit(record, ['gate']), am: 'x' as const, revision_seq: record.revision_seq + 1, revision_tok: 'rev-gone' })

/** A vault of another life, stored at `revision_seq`. */
const otherLifeAt = async (revision_seq: number): Promise<VaultRecord> => ({ ...await storedVaultRecord(), revision_seq, revision_tok: `rev-other-${String(revision_seq)}` })

/** Past the erase each end state sets going. */
const erased = () => new Promise((yes) => { setTimeout(yes, 0) })

/** A born vault deleted, past its erase, and the revision of its tombstone. */
const deleted = async () => {
  const world = await makeBornVault()
  await delTyping(world.vault)
  await erased()
  return { ...world, tombstone: VS.revisionOf(world.demandStored()) }
}

/** The record of a vault's birth over `prior`, as a birth's `listing.put` is handed it. */
const birthOver = async (prior: VS.Revision): Promise<VaultRecord> => ({ ...await storedVaultRecord(), ...VS.nextRevisionOf(prior, Date.now()) })

const expectLandedGone = async (vault: Vault, { listing, deviceDB }: Pick<Awaited<ReturnType<typeof makeBornVault>>, 'listing' | 'deviceDB'>) => {
  await erased()
  expect(listing.at(Dna)).to.eq(vault)
  expect(vault.isPresent).to.be.false
  expect(vault.isLocked).to.be.true
  expect(vault.isEnabled).to.be.true
  expect(deviceDB.cachedNow()).to.be.null
  expect(listing.snapshot).to.deep.equal([])
}

describe("a tombstone over a live vault", () => {
  it("reaches a local delete's end state when a fetch finds it: locked, row erased, boxes vacated, the vault in its slot", async () => {
    const world = await makeBornVault()
    const { vault, listing, demandStored, restoreRow } = world
    const boxes = vault.boxListing
    const box = await boxes.create(BoxDna)
    restoreRow(tombstoneOver(demandStored()))
    expect(await listing.fetch(Dna, { ifAbsent: 'nil' })).to.be.null
    await expectLandedGone(vault, world)
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])), 'disabled')
    expect(box.isEnabled).to.be.false
    await TH.expectRefusal(listing.fetch(Dna), 'vault_gone')
    expect(vault.boxListing).to.eq(boxes)
  })

  it("tells a refused erase as bad news, not a panic, and the tombstone stands", async () => {
    const onPanic = vi.fn()
    const onBadNews = vi.fn()
    const { opts, deviceDB, demandStored, restoreRow, listing: born } = makeVaultWorld(null, { onPanic })
    await buildTyping(born, Dna, byPassphrase(Passphrase))
    const listing = new VaultListing({ ...opts, onBadNews })
    const vault = await listing.build(demandStored())
    const refusal = new VaultError('storage_blocked', 'the disk is full')
    deviceDB.tryVacate.mockResolvedValueOnce(TH.bad(refusal))
    restoreRow(tombstoneOver(demandStored()))
    await listing.fetch(Dna, { ifAbsent: 'nil' })
    await erased()
    expect(vault.isPresent).to.be.false
    expect(onBadNews).toHaveBeenCalledWith(refusal)
    expect(onPanic).not.toHaveBeenCalled()
    listing.goodbye()
  })
})

describe("a box notice carrying the vault's tombstone as its world", () => {
  it("ends the box listing with no bad news, the vault listing's own watch off", async () => {
    const onBadNews = vi.fn()
    const { opts, demandStored, listing: born } = makeVaultWorld()
    const bornVault = await buildTyping(born, Dna, byPassphrase(Passphrase))
    await bornVault.boxListing.create(BoxDna)
    const listing = new VaultListing({ ...opts, onBadNews })
    const vault = await listing.build(demandStored())
    const boxes = vault.boxListing
    await boxes.hello()
    await delTyping(bornVault)
    await erased()
    expect(vault.isPresent).to.be.false
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])), 'disabled')
    expect(onBadNews).not.toHaveBeenCalled()
  })
})

describe("a box verb over a vault deleted elsewhere", () => {
  const WorldNow = { maxWorldMillis: 0 }
  const Verbs = [
    ['box.extractWhisper', ({ box }) => box.extractWhisper(WorldNow)],
    ['box.put',           ({ box }) => box.put({ whisper: { val: 'sk-new' }, sidecar: {} }, WorldNow)],
    ['box.del',            ({ box }) => box.del(WorldNow)],
    ['vault.getBox',       ({ vault, box }) => vault.getBox(box.boxlabel, { ...WorldNow, maxMillisSinceRefresh: 0 })],
    ['vault.delBox',       ({ vault, box }) => vault.delBox(box.boxlabel, WorldNow)],
  ] as const satisfies readonly (readonly [string, (world: { vault: Vault, box: Box }) => Promise<unknown>])[]

  it.each(Verbs)("%s refuses 'disabled', as the refresh that finds the tombstone vacates the box before the box's guard runs", async (_verb, call) => {
    const { vault, demandStored, restoreRow } = await makeBornVault()
    const box = await vault.boxListing.create({ ...vault.scope, ...BoxDna })
    await vault.hello()
    restoreRow(tombstoneOver(demandStored()))
    await TH.expectRefusal(call({ vault, box }), 'disabled')
  })
})

describe("vault.del()", () => {
  it("lands on that same end state, the tombstone stored", async () => {
    const world = await makeBornVault()
    const boxes = world.vault.boxListing
    await delTyping(world.vault)
    await expectLandedGone(world.vault, world)
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])), 'disabled')
    expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
    await world.vault.ensureTimely(0)
    TH.expectSyncRefusal(() => world.vault.demandEnabled(), 'vault_gone')
  })
})

describe("a newer record of another vault_tok over a live vault", () => {
  it("refuses 'disabled' the old vault's own fetch and hydrate that met it, resolving no vault let go", async () => {
    const fetching = await makeBornVault()
    fetching.restoreRow(await otherLifeAt(5))
    await TH.expectRefusal(fetching.vault.fetch(), 'disabled')
    const hydrating = await makeBornVault()
    hydrating.restoreRow(await otherLifeAt(5))
    await TH.expectBad(hydrating.vault.tryHydrate({ maxMillisSinceRefresh: 0 }), 'disabled')
  })

  it("replaces it: the old vacated and unlisted, its row erased, a new vault in the slot, locked", async () => {
    const { vault, listing, deviceDB, restoreRow } = await makeBornVault()
    const other = await otherLifeAt(5)
    restoreRow(other)
    const rebuilt = await listing.fetch(Dna)
    expect(rebuilt).to.not.eq(vault)
    expect(rebuilt?.vault_tok).to.eq(other.vault_tok)
    expect(rebuilt?.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(rebuilt)
    expect(listing.things).to.deep.equal([rebuilt])
    expect(vault.isEnabled).to.be.false
    await erased()
    expect(deviceDB.cachedNow()).to.be.null
  })

  it("holds a tombstone of another vault_tok the same way, the old vacated", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    const other = await otherLifeAt(5)
    restoreRow(tombstoneOver(other))
    await TH.expectRefusal(listing.fetch(Dna), 'vault_gone')
    expect(listing.at(Dna)?.vault_tok).to.eq(other.vault_tok)
    expect(listing.at(Dna)?.isPresent).to.be.false
    expect(vault.isEnabled).to.be.false
  })
})

describe("an old instance, replaced by the very call it made", () => {
  it("vault.del() refuses 'disabled', and the new life stored stands", async () => {
    const { vault, restoreRow, storedNow } = await makeBornVault()
    const other = await otherLifeAt(5)
    restoreRow(other)
    await TH.expectRefusal(vault.fetch(), 'disabled')
    await TH.expectRefusal(vault.del(), 'disabled')
    expect(storedNow()).to.include({ am: 'a', vault_tok: other.vault_tok, revision_seq: 5 })
    TH.expectSyncRefusal(() => vault.demandDeletable(), 'disabled')
  })
})

describe("an older record", () => {
  it("of another vault_tok loses to a live vault, changing nothing", async () => {
    const { vault, listing, demandStored, restoreRow, storeBehindOurBack } = await makeBornVault()
    storeBehindOurBack(demandStored())
    await listing.fetch(Dna)
    const { revision_seq } = vault
    restoreRow(await otherLifeAt(revision_seq - 1))
    expect(await listing.fetch(Dna)).to.eq(vault)
    expect(vault.revision_seq).to.eq(revision_seq)
    expect(vault.isLocked).to.be.false
  })

  it("loses to a tombstone, of this vault_tok or another: the vault stays gone", async () => {
    const { vault, listing, demandStored, restoreRow } = await makeBornVault()
    const born = demandStored()
    await delTyping(vault)
    const { revision_tok } = vault
    for (const older of [born, await otherLifeAt(0)]) {
      restoreRow(older)
      await TH.expectRefusal(listing.fetch(Dna), 'vault_gone')
      expect(listing.at(Dna)).to.eq(vault)
      expect(vault.revision_tok).to.eq(revision_tok)
    }
  })
})

describe("building over a tombstone", () => {
  it("listing.buildVault replaces the tombstone at the next revision, unlocked under a new vault_tok", async () => {
    const { vault, listing, storedNow } = await deleted()
    const reborn = await buildTyping(listing, Dna, byPassphrase(Passphrase))
    expect(reborn).to.not.eq(vault)
    expect(reborn.vault_tok).to.not.eq(vault.vault_tok)
    expect(reborn.revision_seq).to.eq(2)
    expect(reborn.isLocked).to.be.false
    expect(listing.at(Dna)).to.eq(reborn)
    expect(vault.isEnabled).to.be.false
    expect(storedNow()).to.include({ am: 'a', vault_tok: reborn.vault_tok, revision_seq: 2 })
  })

  it("listing.buildVault refuses 'bad_option' a vault present in the slot, the dialog not shown", async () => {
    const { listing } = await makeBornVault()
    const dialog = vi.fn()
    listing.world.requestCleartext = dialog
    await TH.expectRefusal(listing.buildVault(Dna), 'bad_option')
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses 'bad_option' a vault present in the slot, no gating opened and no KDF run", async () => {
    const keyDeriver = { ...TH.testDeriver }
    const deriveKeyBytes = vi.spyOn(keyDeriver, 'deriveKeyBytes')
    const { listing, storedNow } = await makeBornVault(byPassphrase(Passphrase), { keyDeriver })
    expect(deriveKeyBytes).toHaveBeenCalled()
    deriveKeyBytes.mockClear()
    const before = storedNow()
    const dialog = vi.fn(async (gating: AnyGating) => { await gating.attempt(byPassphrase('a-new-passphrase') as never) })
    listing.world.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, Dna), 'bad_option')
    expect(dialog).not.toHaveBeenCalled()
    expect(listing.openGating).to.be.null
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(storedNow()).to.deep.equal(before)
  })

  it("a vault listing refuses 'bad_scope' to answer for another user, where another vault of this user is plainly not held", () => {
    const { listing } = makeVaultWorld()
    TH.expectSyncRefusal(() => listing.at({ ...Dna, user_id: 'another_user' }), 'bad_scope')
    expect(listing.at({ ...Dna, vaultlabel: 'another_vault' })).to.be.null
  })

  it("Vault.launchBirth refuses 'bad_scope' a scope of another user, nobody asked", async () => {
    const { listing } = makeVaultWorld()
    const dialog = vi.fn()
    listing.world.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, { ...Dna, user_id: 'another_user' }), 'bad_scope')
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses 'bad_option' what is no listing, and 'bad_scope' what is no scope, nobody asked", async () => {
    await TH.expectRefusal(Vault.launchBirth(undefined as never, Dna), 'bad_option')
    const { listing } = makeVaultWorld()
    const dialog = vi.fn()
    listing.world.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, null as never), 'bad_scope')
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses 'disabled' on a swept listing, nobody asked", async () => {
    const { listing } = makeVaultWorld()
    const dialog = vi.fn()
    listing.world.requestCleartext = dialog
    listing.sweep()
    await TH.expectRefusal(Vault.launchBirth(listing, Dna), 'disabled')
    expect(dialog).not.toHaveBeenCalled()
  })

  it("a session that fetched only the tombstone builds over it", async () => {
    const { anotherSession, storedNow } = await deleted()
    const session = anotherSession()
    expect(await session.fetch(Dna, { ifAbsent: 'nil' })).to.be.null
    const reborn = await buildTyping(session, Dna, byPassphrase(Passphrase))
    expect(storedNow()).to.include({ vault_tok: reborn.vault_tok, revision_seq: 2 })
  })

  it("a birth's listing.put, landed: a new vault of the record in the slot, locked", async () => {
    const { vault, listing, tombstone } = await deleted()
    const record = await birthOver(tombstone)
    const reborn = await listing.put(record, { prior: tombstone, ifAbsent: 'add', ifPresent: 'get' })
    expect(reborn.vault_tok).to.eq(record.vault_tok)
    expect(reborn.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(reborn)
    expect(vault.isEnabled).to.be.false
  })

  it("a birth's listing.put, nothing ever stored: lands over never stored", async () => {
    const { listing } = makeVaultWorld()
    const record = await birthOver(VS.VoidRevision)
    const born = await listing.put(record, { prior: VS.VoidRevision, ifAbsent: 'add', ifPresent: 'get' })
    expect(born.vault_tok).to.eq(record.vault_tok)
  })

  it("a birth's listing.put, another won: the vault stored is held and answered, locked, and the record dropped", async () => {
    const { listing, tombstone, restoreRow } = await deleted()
    const theirs = await otherLifeAt(2)
    restoreRow(theirs)
    const record = await birthOver(tombstone)
    const won = await listing.put(record, { prior: tombstone, ifAbsent: 'add', ifPresent: 'get' })
    expect(won.vault_tok).to.eq(theirs.vault_tok)
    expect(won.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(won)
  })

  it("a birth's listing.put, refused: a newer tombstone stored delivers, and nothing of the record is held", async () => {
    const { vault, listing, tombstone, demandStored, restoreRow } = await deleted()
    const record = await birthOver(tombstone)
    const stored = demandStored()
    restoreRow(tombstoneOver({ ...stored, gate: null as never }))
    await TH.expectBad(listing.tryPut(record, { prior: tombstone, ifAbsent: 'add', ifPresent: 'get' }), 'stale_write')
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault.revision_seq).to.eq(2)
  })
})

describe("the entrypoints, handed rubble", () => {
  it("a birth's listing.put refuses a record that is no record, storing nothing", async () => {
    const { listing, storedNow } = makeVaultWorld()
    await TH.expectRefusal(listing.put({ garbage: true } as never, { prior: VS.VoidRevision, ifAbsent: 'add', ifPresent: 'get' }), 'bad_record')
    expect(storedNow()).to.be.null
  })

  it("listing.del refuses a duck that is no record, as its check does", async () => {
    const { listing } = makeVaultWorld()
    await TH.expectRefusal(listing.del(null as never), 'bad_scope')
  })
})

describe("lock() with an erase that throws synchronously", () => {
  it("reads locked, does not throw, and panics", async () => {
    const onPanic = vi.fn()
    const { vault, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { onPanic })
    deviceDB.tryVacate.mockImplementationOnce(() => { throw new Error('the duck is broken') })
    expect(() => vault.lock()).to.not.throw()
    expect(vault.isLocked).to.be.true
    await erased()
    expect(onPanic).toHaveBeenCalledOnce()
  })
})

describe("a damaged row", () => {
  it("refuses a fetch 'damaged_record', and the vault held stands", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    restoreRow({ garbage: true } as never)
    await TH.expectRefusal(listing.fetch(Dna), 'damaged_record')
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault.isPresent).to.be.true
    expect(vault.isLocked).to.be.false
  })

  it("leaves when the customer names its vault row, as damaged_records lists it, past reading and with its peek", async () => {
    const rubble = { garbage: true }
    const { listing, restoreRow, storedNow, demandStored } = makeVaultWorld(await storedVaultRecord())
    const stored = demandStored()
    for (const raw of [rubble, { ...stored, gate: 'chewed' }]) {
      restoreRow(raw as never)
      await listing.del(VS.damagedVaultOf(Dna, raw))
      expect(storedNow()).to.include({ am: 'x' })
    }
  })

  it("leaves when the customer names its box row, its neighbours and vault standing", async () => {
    const { vault, opts, anotherSession, demandStored } = await makeBornVault()
    const vaultDB = opts.vaultDB as MemoryVaultDB
    await vault.boxListing.create(BoxDna)
    const boxrows = vaultDB._cheat_boxRowsOf(Dna, vault.vault_tok)
    const scope = omit(BoxDna, ['whisper', 'sidecar'])
    for (const raw of [{ garbage: true }, { ...boxrows.get(BoxDna.boxlabel) as object, whisper_ciphered: 'chewed' }]) {
      boxrows.set(BoxDna.boxlabel, raw)
      const session = await anotherSession().build(demandStored())
      await session.boxListing.del(VS.damagedBoxOf(scope, vault.vault_tok, raw))
      expect(boxrows.get(BoxDna.boxlabel)).to.include({ am: 'x' })
    }
    expect(vault.isPresent).to.be.true
  })
})
