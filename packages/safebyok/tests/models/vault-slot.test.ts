/** The vault listing's slot: what each record does to the vault held under its scope, and the end state a delete lands on. */

import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import type { VaultRecord } from '../../src/models/models-shapes'
import type { Vault } from '../../src/models/vault'
import { VaultListing } from '../../src/models/vault-listing'
import type { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as VS from '../../src/storage/vault-db-shapes'
import * as TH from '../test-helpers'
import { Dna, Passphrase, byPassphrase, makeBornVault, makeVaultWorld, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

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
  await world.vault.del()
  await erased()
  return { ...world, tombstone: VS.revisionOf(world.demandStored()) }
}

/** The record of a vault's birth over `prior`, as `listing.ensureVault` is handed it. */
const birthOver = async (prior: VS.Revision): Promise<VaultRecord> => ({ ...await storedVaultRecord(), ...VS.nextRevisionOf(prior, Date.now()) })

const expectLandedGone = async (vault: Vault, { listing, deviceDB }: Pick<Awaited<ReturnType<typeof makeBornVault>>, 'listing' | 'deviceDB'>) => {
  await erased()
  expect(listing.at(Dna)).to.eq(vault)
  expect(vault.isPresent).to.be.false
  expect(vault.isLocked).to.be.true
  expect(vault.isDisabled).to.be.false
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
    expect(box.isDisabled).to.be.true
    await TH.expectRefusal(listing.fetch(Dna), 'vault_gone')
    TH.expectSyncRefusal(() => vault.boxListing, 'vault_gone')
  })

  it("tells a refused erase as bad news, not a panic, and the tombstone stands", async () => {
    const onPanic = vi.fn()
    const onBadNews = vi.fn()
    const { opts, deviceDB, demandStored, restoreRow, listing: born } = makeVaultWorld(null, { onPanic })
    await born.create(Dna, byPassphrase(Passphrase))
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

describe("vault.del()", () => {
  it("lands on that same end state, the tombstone stored", async () => {
    const world = await makeBornVault()
    const boxes = world.vault.boxListing
    await world.vault.del()
    await expectLandedGone(world.vault, world)
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])), 'disabled')
    expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
    await TH.expectRefusal(world.vault.ensureTimely(0), 'vault_gone')
  })
})

describe("a newer record of another vault_tok over a live vault", () => {
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
    expect(vault.isDisabled).to.be.true
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
    expect(vault.isDisabled).to.be.true
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
    await vault.del()
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
  it("listing.create replaces the tombstone at the next revision, unlocked under a new vault_tok", async () => {
    const { vault, listing, storedNow } = await deleted()
    const reborn = await listing.create(Dna, byPassphrase(Passphrase))
    expect(reborn).to.not.eq(vault)
    expect(reborn.vault_tok).to.not.eq(vault.vault_tok)
    expect(reborn.revision_seq).to.eq(2)
    expect(reborn.isLocked).to.be.false
    expect(listing.at(Dna)).to.eq(reborn)
    expect(vault.isDisabled).to.be.true
    expect(storedNow()).to.include({ am: 'a', vault_tok: reborn.vault_tok, revision_seq: 2 })
  })

  it("listing.create refuses 'bad_option' a vault present in the slot, asking the closure nothing", async () => {
    const { listing } = await makeBornVault()
    const closure = vi.fn(byPassphrase(Passphrase))
    await TH.expectRefusal(listing.create(Dna, closure), 'bad_option')
    expect(closure).not.toHaveBeenCalled()
  })

  it("a session that fetched only the tombstone creates over it", async () => {
    const { anotherSession, storedNow } = await deleted()
    const session = anotherSession()
    expect(await session.fetch(Dna, { ifAbsent: 'nil' })).to.be.null
    const reborn = await session.create(Dna, byPassphrase(Passphrase))
    expect(storedNow()).to.include({ vault_tok: reborn.vault_tok, revision_seq: 2 })
  })

  it("listing.ensureVault, landed: a new vault of the record in the slot, locked", async () => {
    const { vault, listing, tombstone } = await deleted()
    const record = await birthOver(tombstone)
    const reborn = await listing.ensureVault(record, tombstone)
    expect(reborn.vault_tok).to.eq(record.vault_tok)
    expect(reborn.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(reborn)
    expect(vault.isDisabled).to.be.true
  })

  it("listing.ensureVault, nothing ever stored: lands over never stored", async () => {
    const { listing } = makeVaultWorld()
    const record = await birthOver(VS.NeverStored)
    const born = await listing.ensureVault(record, VS.NeverStored)
    expect(born.vault_tok).to.eq(record.vault_tok)
  })

  it("listing.ensureVault, another won: the vault stored is held and answered, locked, and the record dropped", async () => {
    const { listing, tombstone, restoreRow } = await deleted()
    const theirs = await otherLifeAt(2)
    restoreRow(theirs)
    const record = await birthOver(tombstone)
    const won = await listing.ensureVault(record, tombstone)
    expect(won.vault_tok).to.eq(theirs.vault_tok)
    expect(won.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(won)
  })

  it("listing.ensureVault, refused: a newer tombstone stored delivers, and nothing of the record is held", async () => {
    const { vault, listing, tombstone, demandStored, restoreRow } = await deleted()
    const record = await birthOver(tombstone)
    const stored = demandStored()
    restoreRow(tombstoneOver({ ...stored, gate: null as never }))
    await TH.expectBad(listing.tryEnsureVault(record, tombstone), 'stale_write')
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault.revision_seq).to.eq(2)
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
