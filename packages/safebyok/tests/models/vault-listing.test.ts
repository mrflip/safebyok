/** The vault listing's slot: what each record does to the vault listed under its scope, and the end state a delete lands on. */

import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { nowMillis } from '../../src/helpers/clock'
import { VaultError } from '../../src/refusals/errors'
import type { Box } from '../../src/models/box'
import * as SX from '../../src/shapes/shapes-storage'
import type { AnyGating } from '../../src/shapes/shapes-gateish'
import type { VaultRecord } from '../../src/shapes/shapes-storage'
import { Vault } from '../../src/models/vault'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { Dna, Passphrase, byPassphrase, delTyping, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, storedVaultRecord, useVaultWorlds, buildTyping, hearingBadNews } from '../test-helpers/vault-world'

useVaultWorlds()

const BoxDna = { ...Dna, boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' }, sidecar: {} }

/** The tombstone a delete elsewhere leaves over `record`. */
const tombstoneOver = (record: VaultRecord) => ({ ...omit(record, ['gate']), am: 'x' as const, revision_seq: record.revision_seq + 1, revision_tok: 'rev-gone' })

/** A vault of another life, stored at `revision_seq`. */
const otherLifeAt = async (revision_seq: number): Promise<VaultRecord> => ({ ...await storedVaultRecord(), revision_seq, revision_tok: `rev-other-${String(revision_seq)}` })

/** Past the forget each end state sets going. */
const forgotten = () => new Promise((yes) => { setTimeout(yes, 0) })

/** A born vault deleted, past its forget, and the revision of its tombstone. */
const deleted = async () => {
  const world = await makeBornVault()
  await delTyping(world.vault)
  await forgotten()
  return { ...world, tombstone: SX.revisionOf(world.demandStored()) }
}

/** The record of a vault's birth over `prior`, as a birth's `listing.put` is handed it. */
const birthOver = async (prior: SX.Revision): Promise<VaultRecord> => ({ ...await storedVaultRecord(), ...SX.nextRevisionOf(prior, Date.now()) })

const expectLandedGone = async (vault: Vault, { listing, deviceDB }: Pick<Awaited<ReturnType<typeof makeBornVault>>, 'listing' | 'deviceDB'>) => {
  await forgotten()
  expect(listing.at(Dna)).to.eq(vault)
  expect(vault.isPresent).to.be.false
  expect(vault.isLocked).to.be.true
  expect(vault.isEnabled).to.be.true
  expect(deviceDB.cachedNow()).to.be.null
  expect(listing.snapshot).to.deep.equal([])
}

describe("listing.stampOfBirth and listing.recordOfBirth", () => {
  it("stamps each attempt with a new life under the scope, at the time now", async () => {
    const { listing } = await makeBornVault()
    const stamp = listing.stampOfBirth(Dna)
    expect(stamp).to.include({ ...Dna, registered_at: nowMillis() })
    expect(stamp.vault_tok).to.not.eq(listing.stampOfBirth(Dna).vault_tok)
  })

  it("makes the record at the revision after prior, carrying the gate and its stamp", async () => {
    const { listing, vault } = await makeBornVault()
    const { gate } = vault
    const record = listing.recordOfBirth(gate, { revision_tok: 'rev-gone', revision_seq: 4 })
    expect(record).to.deep.include({ ...gate.stamp, am: 'a', revision_seq: 5, written_at: nowMillis(), gate: gate.pickle() })
    expect(record.revision_tok).to.not.eq('rev-gone')
  })
})

describe("listing's gate verbs: the record each sends the vaultDB", () => {
  const MovedDevice = '00000000-0000-4000-8000-0000000000d2'

  it("replacePassphrase sends the next revision with the new wayin and the epoch one up", async () => {
    const { listing, vault, opts: { vaultDB } } = await makeBornVault()
    const ante = vault.fullRecord
    const passphrase_wayin = { ...ante.gate.passphrase_wayin, device_id: MovedDevice }
    const replacing = vi.spyOn(vaultDB, 'tryReplacePassphrase')
    const stored = await listing.replacePassphrase(ante, passphrase_wayin)
    const [record, opts] = replacing.mock.calls[0]!
    expect(record).to.deep.include({ registered_at: ante.registered_at, revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate: { ...ante.gate, gate_epoch: ante.gate.gate_epoch + 1, passphrase_wayin } })
    expect(record.revision_tok).to.not.eq(ante.revision_tok)
    expect(opts).to.deep.equal({ prior: SX.revisionOf(ante) })
    expect(stored).to.deep.equal(record)
  })

  it("addPasskey sends the next revision with the passkey and the epoch one up", async () => {
    const { listing, vault, opts: { vaultDB } } = await makeBornVault()
    const ante = vault.fullRecord
    const adding = vi.spyOn(vaultDB, 'tryAddPasskey')
    const stored = await listing.addPasskey(ante, TH.passkeyWayin)
    const [record, opts] = adding.mock.calls[0]!
    expect(record).to.deep.include({ revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate: { ...ante.gate, gate_epoch: ante.gate.gate_epoch + 1, passkey_wayin: TH.passkeyWayin } })
    expect(opts).to.deep.equal({ prior: SX.revisionOf(ante) })
    expect(stored).to.deep.equal(record)
  })

  it("revokePasskey sends the next revision with no passkey and the epoch one up", async () => {
    const { listing, vault, opts: { vaultDB } } = await makeBornVaultWithPasskey()
    const ante = vault.fullRecord
    const revoking = vi.spyOn(vaultDB, 'tryRevokePasskey')
    const stored = await listing.revokePasskey(ante)
    const [record, opts] = revoking.mock.calls[0]!
    expect(record).to.deep.include({ revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate: { ...ante.gate, gate_epoch: ante.gate.gate_epoch + 1, passkey_wayin: null } })
    expect(opts).to.deep.equal({ prior: SX.revisionOf(ante) })
    expect(stored).to.deep.equal(record)
  })

  it("revokePasskey over no passkey answers the record stored", async () => {
    const { listing, vault } = await makeBornVault()
    const ante = vault.fullRecord
    expect(await listing.revokePasskey(ante)).to.deep.equal(ante)
    expect(vault.revision_seq).to.eq(ante.revision_seq)
  })

  it("refuses an answer that is not the record it sent", async () => {
    const { listing, vault, opts: { vaultDB } } = await makeBornVault()
    const commit = vaultDB.tryAddPasskey.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryAddPasskey').mockImplementationOnce(async (record, opts) => {
      const answer = await commit(record, opts)
      return answer.ok ? { ...answer, val: { ...answer.val, revision_tok: 'rev-of-another' } } : answer
    })
    await TH.expectRefusal(listing.addPasskey(vault.fullRecord, TH.passkeyWayin), 'storage_issue')
  })

  it("refuses an ante of another bank", async () => {
    const { listing, vault } = await makeBornVault()
    await TH.expectRefusal(listing.replacePassphrase({ ...vault.fullRecord, user_id: 'someone_else' }, vault.fullRecord.gate.passphrase_wayin))
  })
})

describe("a tombstone over a live vault", () => {
  it("reaches a local delete's end state when a fetch finds it: locked, row forgotten, boxes vacated, the vault in its slot", async () => {
    const world = await makeBornVault()
    const { vault, listing, demandStored, restoreRow } = world
    const boxes = vault.boxListing
    const box = await boxes.create(BoxDna)
    restoreRow(tombstoneOver(demandStored()))
    expect(await listing.fetch(Dna, { ifAbsent: 'nil' })).to.be.null
    await expectLandedGone(vault, world)
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])))
    expect(box.isEnabled).to.be.false
    await TH.expectRefusal(listing.fetch(Dna))
    expect(vault.boxListing).to.eq(boxes)
  })

  it("announces a refused forget at its tombstone, not as bad news, and the tombstone stands", async () => {
    const onLifecycle = vi.fn()
    const onBadNews = vi.fn()
    const { fakeBank, opts, deviceDB, demandStored, restoreRow, listing: born } = makeVaultWorld(null, { onLifecycle })
    await buildTyping(born, Dna, byPassphrase(Passphrase))
    const listing = new VaultListing(fakeBank, hearingBadNews(opts, onBadNews))
    const vault = await listing.build(demandStored())
    const refusal = new VaultError('storage_unavailable', 'the disk is full')
    deviceDB.forget.mockRejectedValueOnce(refusal)
    restoreRow(tombstoneOver(demandStored()))
    await listing.fetch(Dna, { ifAbsent: 'nil' })
    await forgotten()
    expect(vault.isPresent).to.be.false
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal, vault, where: 'tombstone' }))
    expect(onBadNews).not.toHaveBeenCalledWith(refusal)
    listing.goodbye()
  })
})

describe("a box notice carrying the vault's tombstone as its world", () => {
  it("ends the box listing with no bad news, the vault listing's own watch off", async () => {
    const onBadNews = vi.fn()
    const { fakeBank, opts, demandStored, listing: born } = makeVaultWorld()
    const bornVault = await buildTyping(born, Dna, byPassphrase(Passphrase))
    await bornVault.boxListing.create(BoxDna)
    const listing = new VaultListing(fakeBank, hearingBadNews(opts, onBadNews))
    const vault = await listing.build(demandStored())
    const boxes = vault.boxListing
    await boxes.hello()
    await delTyping(bornVault)
    await forgotten()
    expect(vault.isPresent).to.be.false
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])))
    expect(onBadNews).not.toHaveBeenCalled()
  })
})

describe("a box verb over a vault deleted elsewhere", () => {
  const WorldNow = { maxWorldMillis: 0 }
  const Verbs = [
    ['box.extractWhisper', ({ box }) => box.extractWhisper(WorldNow)],
    ['box.put',           ({ box }) => box.put({ whisper: { apiKey: 'sk-new' }, sidecar: {} }, WorldNow)],
    ['box.del',            ({ box }) => box.del(WorldNow)],
    ['vault.getBox',       ({ vault, box }) => vault.getBox(box.boxlabel, { ...WorldNow, maxMillisSinceRefresh: 0 })],
    ['vault.delBox',       ({ vault, box }) => vault.delBox(box.boxlabel, WorldNow)],
  ] as const satisfies readonly (readonly [string, (world: { vault: Vault, box: Box }) => Promise<unknown>])[]

  it.each(Verbs)("%s refuses, as the refresh that finds the tombstone vacates the box before the box's guard runs", async (_verb, call) => {
    const { vault, demandStored, restoreRow } = await makeBornVault()
    const box = await vault.boxListing.create({ ...vault.scope, ...BoxDna })
    await vault.hello()
    restoreRow(tombstoneOver(demandStored()))
    await TH.expectRefusal(call({ vault, box }))
  })
})

describe("vault.delVaultPrompt()", () => {
  it("lands on that same end state, the tombstone stored", async () => {
    const world = await makeBornVault()
    const boxes = world.vault.boxListing
    await delTyping(world.vault)
    await expectLandedGone(world.vault, world)
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])))
    expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
    await world.vault.ensureTimely(0)
    TH.expectSyncRefusal(() => world.vault.demandPresent())
  })
})

const DelCases = [
  [false,  'deletes an unlocked vault with no prompt, landing on that same end state'],
  [true,   'deletes a locked vault with no prompt, landing on that same end state'],
] as const

describe("vault.del()", () => {
  for (const [isLocking, blurb] of DelCases) {
    it(blurb, async () => {
      const world = await makeBornVault()
      const dialog = vi.fn()
      world.fakeBank.requestCleartext = dialog
      if (isLocking) { world.vault.lock() }
      expect(await world.vault.del()).to.eq(world.vault)
      await expectLandedGone(world.vault, world)
      expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
      expect(dialog).not.toHaveBeenCalled()
    })
  }
})

describe("a newer record of another vault_tok over a live vault", () => {
  it("refuses the old vault's own fetch and hydrate that met it, resolving no vault let go", async () => {
    const fetching = await makeBornVault()
    fetching.restoreRow(await otherLifeAt(5))
    await TH.expectRefusal(fetching.vault.fetch())
    const hydrating = await makeBornVault()
    hydrating.restoreRow(await otherLifeAt(5))
    await TH.expectBad(hydrating.vault.tryHydrate({ maxMillisSinceRefresh: 0 }))
  })

  it("replaces it: the old vacated and delisted, its row forgotten, a new vault in the slot, locked", async () => {
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
    await forgotten()
    expect(deviceDB.cachedNow()).to.be.null
  })

  it("has a tombstone of another vault_tok the same way, the old vacated", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    const other = await otherLifeAt(5)
    restoreRow(tombstoneOver(other))
    await TH.expectRefusal(listing.fetch(Dna))
    expect(listing.at(Dna)?.vault_tok).to.eq(other.vault_tok)
    expect(listing.at(Dna)?.isPresent).to.be.false
    expect(vault.isEnabled).to.be.false
  })
})

describe("an old instance, replaced by the very call it made", () => {
  it("vault.del() refuses, and the new life stored stands", async () => {
    const { vault, restoreRow, storedNow } = await makeBornVault()
    const other = await otherLifeAt(5)
    restoreRow(other)
    await TH.expectRefusal(vault.fetch())
    await TH.expectRefusal(vault.del())
    expect(storedNow()).to.include({ am: 'a', vault_tok: other.vault_tok, revision_seq: 5 })
    TH.expectSyncRefusal(() => vault.demandDeletable())
  })
})

describe("an older record", () => {
  it("of another vault_tok loses to a live vault, changing nothing", async () => {
    const { vault, listing, demandStored, restoreRow, putBehindOurBack } = await makeBornVault()
    putBehindOurBack(demandStored())
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
      await TH.expectRefusal(listing.fetch(Dna))
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

  it("listing.buildVault refuses a vault present in the slot, the dialog not shown", async () => {
    const { listing, fakeBank } = await makeBornVault()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(listing.buildVault(Dna))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses a vault present in the slot, no gating opened and no KDF run", async () => {
    const keyDeriver = { ...TH.testDeriver }
    const deriveKeyBytes = vi.spyOn(keyDeriver, 'deriveKeyBytes')
    const { listing, fakeBank, opts, storedNow } = await makeBornVault(byPassphrase(Passphrase), { keyDeriver })
    expect(deriveKeyBytes).toHaveBeenCalled()
    deriveKeyBytes.mockClear()
    const before = storedNow()
    const dialog = vi.fn(async (gating: AnyGating) => { await gating.attempt(byPassphrase('a-new-passphrase')) })
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, Dna, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
    expect(listing.openGating).to.be.null
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(storedNow()).to.deep.equal(before)
  })

  it("a vault listing refuses to answer for another user, where another vault of this user is plainly not listed", () => {
    const { listing } = makeVaultWorld()
    TH.expectSyncRefusal(() => listing.at({ ...Dna, user_id: 'another_user' }))
    expect(listing.at({ ...Dna, vaultlabel: 'another_vault' })).to.be.null
  })

  it("Vault.launchBirth refuses a scope of another user, nobody asked", async () => {
    const { listing, fakeBank, opts } = makeVaultWorld()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, { ...Dna, user_id: 'another_user' }, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses what is no scope, nobody asked", async () => {
    const { listing, fakeBank, opts } = makeVaultWorld()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, null as never, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses on a swept listing, nobody asked", async () => {
    const { listing, fakeBank, opts } = makeVaultWorld()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    listing.sweep()
    await TH.expectRefusal(Vault.launchBirth(listing, Dna, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("a session that fetched only the tombstone builds over it", async () => {
    const { anotherSession, storedNow } = await deleted()
    const session = anotherSession()
    expect(await session.fetch(Dna, { ifAbsent: 'nil' })).to.be.null
    const reborn = await buildTyping(session, Dna, byPassphrase(Passphrase))
    expect(storedNow()).to.include({ vault_tok: reborn.vault_tok, revision_seq: 2 })
  })

  it("a birth's listing.put, written: a new vault of the record in the slot, locked", async () => {
    const { vault, listing, tombstone } = await deleted()
    const record = await birthOver(tombstone)
    const reborn = await listing.put(record, { prior: tombstone, ifAbsent: 'add', ifPresent: 'get' })
    expect(reborn.vault_tok).to.eq(record.vault_tok)
    expect(reborn.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(reborn)
    expect(vault.isEnabled).to.be.false
  })

  it("a birth's listing.put, nothing ever stored: written over never stored", async () => {
    const { listing } = makeVaultWorld()
    const record = await birthOver(SX.VoidRevision)
    const born = await listing.put(record, { prior: SX.VoidRevision, ifAbsent: 'add', ifPresent: 'get' })
    expect(born.vault_tok).to.eq(record.vault_tok)
  })

  it("a birth's listing.put, another won: the vault stored is listed and answered, locked, and the record dropped", async () => {
    const { listing, tombstone, restoreRow } = await deleted()
    const theirs = await otherLifeAt(2)
    restoreRow(theirs)
    const record = await birthOver(tombstone)
    const won = await listing.put(record, { prior: tombstone, ifAbsent: 'add', ifPresent: 'get' })
    expect(won.vault_tok).to.eq(theirs.vault_tok)
    expect(won.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(won)
  })

  it("a birth's listing.put, refused: a newer tombstone stored delivers, and nothing of the record is listed", async () => {
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
  it("a birth's listing.put refuses a record that is no record, putting nothing", async () => {
    const { listing, storedNow } = makeVaultWorld()
    await TH.expectRefusal(listing.put({ garbage: true } as never, { prior: SX.VoidRevision, ifAbsent: 'add', ifPresent: 'get' }))
    expect(storedNow()).to.be.null
  })

  it("listing.del refuses a duck that is no record", async () => {
    const { listing } = makeVaultWorld()
    await TH.expectRefusal(listing.del(null as never))
  })
})

describe("lock() with an forget that throws synchronously", () => {
  it("reports locked, does not throw, and announces the refused forget", async () => {
    const onLifecycle = vi.fn()
    const { vault, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { onLifecycle })
    deviceDB.forget.mockImplementationOnce(() => { throw new Error('the duck is broken') })
    expect(() => vault.lock()).to.not.throw()
    expect(vault.isLocked).to.be.true
    await forgotten()
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'lease_revoke_failed', vault, where: 'lock' }))
  })
})

describe("a damaged row", () => {
  it("refuses a fetch 'damaged_row', and the vault listed stands", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    restoreRow({ garbage: true } as never)
    await TH.expectRefusal(listing.fetch(Dna), 'damaged_row')
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault.isPresent).to.be.true
    expect(vault.isLocked).to.be.false
  })
})

describe("a damaged row met by listing the bank's vaults", () => {
  it("vacates the vault listed in its slot, keeps the row in damaged_rows, and tells it as bad news", async () => {
    const { vault, listing, restoreRow, badnews } = await makeBornVault()
    restoreRow({ garbage: true } as never)
    await listing.list()
    expect(listing.damaged_rows).to.deep.equal([{ ...omit(Dna, []), am: 'd' }])
    expect(listing.at(Dna)).to.be.null
    expect(vault.isEnabled).to.be.false
    expect(badnews.map((news) => news.refusalkind)).to.include('damaged_row')
  })

  it("clears damaged_rows at the next listing that finds none", async () => {
    const { listing, restoreRow, demandStored } = await makeBornVault()
    const stored = demandStored()
    restoreRow({ garbage: true } as never)
    await listing.list()
    restoreRow(stored)
    await listing.list()
    expect(listing.damaged_rows).to.deep.equal([])
  })

  it("tells its listeners when damaged_rows changes, and not when a listing finds the same", async () => {
    const { listing, restoreRow, demandStored } = await makeBornVault()
    const stored = demandStored()
    restoreRow({ garbage: true } as never)
    await listing.list()
    const listener = vi.fn()
    listing.subscribe(listener)
    await listing.list()
    expect(listener).not.toHaveBeenCalled()
    restoreRow(tombstoneOver(stored))
    await listing.list()
    expect(listing.snapshot).to.deep.equal([])
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe("the listing's verbs answer the vaultDB's own answer", () => {
  it("tryList answers the act, with the vaults listed as its val", async () => {
    const { vault, listing } = await makeBornVault()
    const answer = await TH.expectGood(listing.tryList())
    expect(answer).to.deep.equal([vault])
    expect(await listing.tryList()).to.deep.include({ ok: true, act: 'got' })
  })

  it("tryDel answers the del's act, with the vault deleted as its val", async () => {
    const { vault, listing } = await makeBornVault()
    vault.lock()
    const answer = await listing.tryDel(vault.sparse)
    expect(answer).to.deep.include({ ok: true, val: vault })
    expect(answer.act).to.be.a('string')
    expect(vault.isPresent).to.be.false
  })

  it("tryDel answers a delete naming another life than the vault listed as bad, deleting nothing", async () => {
    const { vault, listing, storedNow } = await makeBornVault()
    const before = storedNow()
    const answer = await listing.tryDel({ ...listing.sparseOf(vault), vault_tok: 'another-life' })
    expect(answer).to.deep.include({ ok: false, world: null })
    expect(answer.err?.refusalkind).to.eq('vault_mismatch')
    expect(storedNow()).to.deep.equal(before)
  })

  it("get answers the vault listed, and fetches one that is not", async () => {
    const { vault, listing } = await makeBornVault()
    expect(await listing.get(Dna)).to.eq(vault)
    const { listing: fresh } = makeVaultWorld(await storedVaultRecord())
    const fetched = await fresh.get(Dna)
    expect(fetched?.vaultlabel).to.eq(Dna.vaultlabel)
  })
})

describe("listing.tryGet: the act says where the instance came from", () => {
  it("answers 'timely', with no world, where the instance listed is fresh enough, and asks storage nothing", async () => {
    const { vault, listing, opts } = await makeBornVault()
    const tryGetVault = vi.spyOn(opts.vaultDB, 'tryGetVault')
    const answer = await listing.tryGet(Dna, { maxMillisSinceRefresh: Infinity })
    expect(answer).to.deep.include({ ok: true, act: 'timely', val: vault, world: null })
    expect(tryGetVault).not.toHaveBeenCalled()
  })

  it("answers the vaultDB's own act where it asked storage", async () => {
    const { vault, listing } = await makeBornVault()
    const answer = await listing.tryGet(Dna, { maxMillisSinceRefresh: 0 })
    expect(answer).to.deep.include({ ok: true, act: 'got', val: vault })
  })
})

describe("the gate verbs answer the vaultDB's own answer", () => {
  it("tryRevokePasskey answers the act, with the record written as its val", async () => {
    const { vault, listing, demandStored } = await makeBornVault()
    const ante = demandStored()
    const answer = await listing.tryRevokePasskey(SX.vaultRecord.parse(ante))
    expect(answer.ok).to.be.true
    expect(answer.act).to.be.a('string')
    expect(answer.val).to.deep.include({ vault_tok: vault.vault_tok })
  })

  it("answers a disabled listing as bad, asking storage nothing", async () => {
    const { listing, demandStored, opts } = await makeBornVault()
    const tryRevokePasskey = vi.spyOn(opts.vaultDB, 'tryRevokePasskey')
    listing.sweep()
    const answer = await listing.tryRevokePasskey(SX.vaultRecord.parse(demandStored()))
    expect(answer.err?.refusalkind).to.eq('disabled')
    expect(tryRevokePasskey).not.toHaveBeenCalled()
  })
})

describe("a listing asks storage once for what callers ask at once", () => {
  it("joins fetches of one slot made while one runs, the instance's own among them, into one get", async () => {
    const { vault, listing, opts } = await makeBornVault()
    const tryGetVault = vi.spyOn(opts.vaultDB, 'tryGetVault')
    const [fetched, refetched, own] = await Promise.all([listing.fetch(Dna), listing.fetch(Dna), vault.fetch()])
    expect([fetched, refetched, own]).to.deep.equal([vault, vault, vault])
    expect(tryGetVault).toHaveBeenCalledOnce()
  })

  it("joins two gets of a stale box into one get of its row", async () => {
    const { vault, opts } = await makeBornVault()
    await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryGetBox = vi.spyOn(opts.vaultDB, 'tryGetBox')
    const stale = { maxMillisSinceRefresh: 0 }
    const [one, two] = await Promise.all([vault.getBox('anthropic_api_key', stale), vault.getBox('anthropic_api_key', stale)])
    expect(one).to.eq(two)
    expect(tryGetBox).toHaveBeenCalledOnce()
  })

  it("starts a fresh get for a fetch asked once the last has settled", async () => {
    const { listing, opts } = await makeBornVault()
    const tryGetVault = vi.spyOn(opts.vaultDB, 'tryGetVault')
    await listing.fetch(Dna)
    await listing.fetch(Dna)
    expect(tryGetVault).toHaveBeenCalledTimes(2)
  })

  it("joins lists made while one runs into one listing", async () => {
    const { listing, opts } = await makeBornVault()
    const tryListVaults = vi.spyOn(opts.vaultDB, 'tryListVaults')
    await Promise.all([listing.list(), listing.list()])
    expect(tryListVaults).toHaveBeenCalledOnce()
  })
})
