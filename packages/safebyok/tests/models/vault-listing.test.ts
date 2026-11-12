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

/** The tombstone a delete elsewhere leaves over `record`, in a life of its own. */
function tombstoneOver(record: VaultRecord) { return { ...omit(record, ['gate']), am: 'x' as const, vault_tok: 'life-gone', revision_seq: record.revision_seq + 1, revision_tok: 'rev-gone' } }

/** A vault of another life, stored at `revision_seq`. */
async function otherLifeAt(revision_seq: number): Promise<VaultRecord> { return { ...await storedVaultRecord(), revision_seq, revision_tok: `rev-other-${String(revision_seq)}` } }

/** Past the forget each end state sets going. */
function forgotten() { return new Promise((yes) => { setTimeout(yes, 0) }) }

/** A born vault deleted, past its forget, and its tombstone as stored. */
async function deleted() {
  const world = await makeBornVault()
  await delTyping(world.vault)
  await forgotten()
  return { ...world, tombstone: SX.vaultTombstone.parse(world.storedNow()) }
}

/** The record of a vault's birth over the row `expected`, as a birth's `listing.put` is handed it. */
async function birthOver(expected: SX.Revision): Promise<VaultRecord> { return { ...await storedVaultRecord(), ...SX.nextRevisionOf(expected, Date.now()) } }

// A tombstone is of a life of its own, so the vault of the life deleted is vacated, and the tombstone's instance takes its slot.
async function expectLandedGone(vault: Vault, { listing, deviceDB }: Pick<Awaited<ReturnType<typeof makeBornVault>>, 'listing' | 'deviceDB'>) {
  await forgotten()
  const gone = listing.at(Dna)
  expect(gone).to.not.eq(vault)
  expect(gone?.vault_tok).to.not.eq(vault.vault_tok)
  expect(gone?.isPresent).to.be.false
  expect(gone?.isLocked).to.be.true
  expect(gone?.isEnabled).to.be.true
  expect(vault.isEnabled).to.be.false
  expect(vault.isLocked).to.be.true
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

  it("makes the record at the revision after the row expected, carrying the gate and its stamp", async () => {
    const { listing, vault } = await makeBornVault()
    const { gate } = vault
    const record = listing.recordOfBirth(gate, { revision_tok: 'rev-gone', revision_seq: 4 })
    expect(record).to.deep.include({ ...gate.stamp, am: 'a', revision_seq: 5, written_at: nowMillis(), gate: gate.pickle() })
    expect(record.revision_tok).to.not.eq('rev-gone')
  })
})

describe("the listing's gate methods", () => {
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

  it("revokePasskey with no passkey stored returns the stored record", async () => {
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

  it("refuses a record of another user", async () => {
    const { listing, vault } = await makeBornVault()
    await TH.expectRefusal(listing.replacePassphrase({ ...vault.fullRecord, user_id: 'someone_else' }, vault.fullRecord.gate.passphrase_wayin))
  })
})

describe("a tombstone over a live vault", () => {
  it("leaves the vault as a local delete would, once a fetch finds it", async () => {
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

  it("forgets the lease cached on this device when the vault is first listed as a tombstone", async () => {
    const { fakeBank, opts, deviceDB, demandStored, restoreRow, listing: born } = makeVaultWorld()
    await buildTyping(born, Dna, byPassphrase(Passphrase))
    restoreRow(tombstoneOver(demandStored()))
    const listing = new VaultListing(fakeBank, opts)
    deviceDB.forget.mockClear()
    await listing.fetch(Dna, { ifAbsent: 'nil' })
    await forgotten()
    expect(listing.at(Dna)?.isPresent).to.be.false
    expect(deviceDB.forget).toHaveBeenCalledOnce()
    listing.goodbye()
  })

  it("reports a refused forget to onLifecycle, not as bad news", async () => {
    const onLifecycle = vi.fn()
    const onBadNews = vi.fn()
    const { fakeBank, opts, deviceDB, demandStored, restoreRow, listing: born } = makeVaultWorld(null, { onLifecycle })
    await buildTyping(born, Dna, byPassphrase(Passphrase))
    const listing = new VaultListing(fakeBank, hearingBadNews(opts, onBadNews))
    const vault = listing.deliverRecord(demandStored())
    const refusal = new VaultError('storage_unavailable', 'the disk is full')
    deviceDB.forget.mockRejectedValueOnce(refusal)
    restoreRow(tombstoneOver(demandStored()))
    await listing.fetch(Dna, { ifAbsent: 'nil' })
    await forgotten()
    expect(vault.isEnabled).to.be.false
    expect(listing.at(Dna)?.isPresent).to.be.false
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal, vault: listing.at(Dna), where: 'tombstone' }))
    expect(onBadNews).not.toHaveBeenCalledWith(refusal)
    listing.goodbye()
  })
})

describe("a box answer carrying a vault row of a later life as its world", () => {
  it("vacates the vault for one of the new life, locked, where the vault was made anew elsewhere", async () => {
    const onBadNews = vi.fn()
    const { fakeBank, opts, demandStored, listing: born } = makeVaultWorld()
    const bornVault = await buildTyping(born, Dna, byPassphrase(Passphrase))
    await bornVault.boxListing.create(BoxDna)
    const listing = new VaultListing(fakeBank, hearingBadNews(opts, onBadNews))
    const vault = listing.deliverRecord(demandStored())
    const boxes = vault.boxListing
    await boxes.hello()
    await delTyping(bornVault)
    const anew = await buildTyping(born, Dna, byPassphrase(Passphrase))
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])), 'vault_reborn')
    expect(vault.isEnabled).to.be.false
    expect(boxes.things).to.deep.equal([])
    const listed = listing.at(Dna)
    expect(listed).to.not.eq(vault)
    expect(listed).to.include({ vault_tok: anew.vault_tok, isPresent: true, isLocked: true })
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("vacates the vault for a deleted one, where the vault was deleted elsewhere", async () => {
    const onBadNews = vi.fn()
    const { fakeBank, opts, demandStored, listing: born } = makeVaultWorld()
    const bornVault = await buildTyping(born, Dna, byPassphrase(Passphrase))
    await bornVault.boxListing.create(BoxDna)
    const listing = new VaultListing(fakeBank, hearingBadNews(opts, onBadNews))
    const vault = listing.deliverRecord(demandStored())
    const boxes = vault.boxListing
    await boxes.hello()
    await delTyping(bornVault)
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])), 'absent_vault')
    expect(vault.isEnabled).to.be.false
    expect(boxes.things).to.deep.equal([])
    expect(listing.at(Dna)).to.not.eq(vault)
    expect(listing.at(Dna)?.isPresent).to.be.false
    expect(onBadNews).not.toHaveBeenCalled()
  })
})

describe("a box method over a vault deleted elsewhere", () => {
  const WorldNow = { maxWorldMillis: 0 }
  const Verbs = [
    ['box.extractWhisper', ({ box }) => box.extractWhisper(WorldNow)],
    ['box.put',           ({ box }) => box.put({ whisper: { apiKey: 'sk-new' }, sidecar: {} }, WorldNow)],
    ['box.del',            ({ box }) => box.del(box.scope, WorldNow)],
    ['vault.getBox',       ({ vault, box }) => vault.getBox(box.boxlabel, { ...WorldNow, maxMillisSinceRefresh: 0 })],
    ['vault.delBox',       ({ vault, box }) => vault.delBox(box.boxlabel, WorldNow)],
  ] as const satisfies readonly (readonly [string, (world: { vault: Vault, box: Box }) => Promise<unknown>])[]

  it.each(Verbs)("%s refuses", async (_verb, call) => {
    const { vault, demandStored, restoreRow } = await makeBornVault()
    const box = await vault.boxListing.create({ ...vault.scope, ...BoxDna })
    await vault.hello()
    restoreRow(tombstoneOver(demandStored()))
    await TH.expectRefusal(call({ vault, box }))
  })
})

describe("vault.delVaultPrompt()", () => {
  it("leaves the vault deleted and locked, its cached lease forgotten", async () => {
    const world = await makeBornVault()
    const boxes = world.vault.boxListing
    await delTyping(world.vault)
    await expectLandedGone(world.vault, world)
    await TH.expectRefusal(boxes.fetch(omit(BoxDna, ['whisper', 'sidecar'])))
    expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
    await TH.expectRefusal(world.vault.ensureTimely(0), 'disabled')
    const gone = await world.listing.at(Dna)?.ensureTimely(0)
    TH.expectSyncRefusal(() => gone?.demandPresent(), 'vault_gone')
  })
})

const DelCases = [
  [false,  'deletes an unlocked vault without showing a dialog'],
  [true,   'deletes a locked vault without showing a dialog'],
] as const

describe("vault.del(vault.scope)", () => {
  for (const [isLocking, blurb] of DelCases) {
    it(blurb, async () => {
      const world = await makeBornVault()
      const dialog = vi.fn()
      world.fakeBank.requestCleartext = dialog
      if (isLocking) { world.vault.lock() }
      expect(await world.vault.del(world.vault.scope)).to.eq(world.vault)
      await expectLandedGone(world.vault, world)
      expect(world.storedNow()).to.include({ am: 'x', revision_seq: 1 })
      expect(dialog).not.toHaveBeenCalled()
    })
  }
})

describe("a newer record of another vault_tok over a live vault", () => {
  it("refuses the old vault's fetch and hydrate", async () => {
    const fetching = await makeBornVault()
    fetching.restoreRow(await otherLifeAt(5))
    await TH.expectRefusal(fetching.vault.fetch())
    const hydrating = await makeBornVault()
    hydrating.restoreRow(await otherLifeAt(5))
    await TH.expectBad(hydrating.vault.tryHydrate({ maxMillisSinceRefresh: 0 }))
  })

  it("replaces the old vault with a new, locked one", async () => {
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

  it("also replaces the old vault when it is a tombstone", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    const tombstone = tombstoneOver(await otherLifeAt(5))
    restoreRow(tombstone)
    await TH.expectRefusal(listing.fetch(Dna))
    expect(listing.at(Dna)?.vault_tok).to.eq(tombstone.vault_tok)
    expect(listing.at(Dna)?.isPresent).to.be.false
    expect(vault.isEnabled).to.be.false
  })
})

describe("an old instance replaced by its own call", () => {
  it("vault.del(vault.scope) refuses and leaves the new vault stored", async () => {
    const { vault, restoreRow, storedNow } = await makeBornVault()
    const other = await otherLifeAt(5)
    restoreRow(other)
    await TH.expectRefusal(vault.fetch())
    await TH.expectRefusal(vault.del(vault.scope))
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

  it("of either vault_tok does not bring back a deleted vault", async () => {
    const { vault, listing, demandStored, restoreRow } = await makeBornVault()
    const born = demandStored()
    await delTyping(vault)
    const gone = listing.at(Dna)
    const tombstone = demandStored()
    expect(gone).to.include({ revision_tok: tombstone.revision_tok, isPresent: false })
    for (const older of [born, await otherLifeAt(0)]) {
      restoreRow(older)
      await TH.expectRefusal(listing.fetch(Dna))
      expect(listing.at(Dna)).to.eq(gone)
      expect(gone?.revision_tok).to.eq(tombstone.revision_tok)
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

  it("listing.at refuses a scope of another user, and returns null for another vault of this user", () => {
    const { listing } = makeVaultWorld()
    TH.expectSyncRefusal(() => listing.at({ ...Dna, user_id: 'another_user' }))
    expect(listing.at({ ...Dna, vaultlabel: 'another_vault' })).to.be.null
  })

  it("Vault.launchBirth refuses a scope of another user without showing a dialog", async () => {
    const { listing, fakeBank, opts } = makeVaultWorld()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, { ...Dna, user_id: 'another_user' }, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses a malformed scope without showing a dialog", async () => {
    const { listing, fakeBank, opts } = makeVaultWorld()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, null as never, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses on a swept listing without showing a dialog", async () => {
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

  it("a birth's listing.put over a tombstone lists a new, locked vault of the record", async () => {
    const { vault, listing, tombstone } = await deleted()
    const record = await birthOver(tombstone)
    const reborn = await listing.put(record, { expected: tombstone, ifAbsent: 'add', ifPresent: 'get' })
    expect(reborn.vault_tok).to.eq(record.vault_tok)
    expect(reborn.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(reborn)
    expect(vault.isEnabled).to.be.false
  })

  it("a birth's listing.put with nothing ever stored is written", async () => {
    const { listing } = makeVaultWorld()
    const record = await birthOver(SX.VoidRevision)
    const born = await listing.put(record, { expected: SX.shellVaultOf(Dna), ifAbsent: 'add', ifPresent: 'get' })
    expect(born.vault_tok).to.eq(record.vault_tok)
  })

  it("a birth's listing.put that loses a race lists the winner's vault, locked", async () => {
    const { listing, tombstone, restoreRow } = await deleted()
    const theirs = await otherLifeAt(2)
    restoreRow(theirs)
    const record = await birthOver(tombstone)
    const won = await listing.put(record, { expected: tombstone, ifAbsent: 'add', ifPresent: 'get' })
    expect(won.vault_tok).to.eq(theirs.vault_tok)
    expect(won.isLocked).to.be.true
    expect(listing.at(Dna)).to.eq(won)
  })

  it("a birth's listing.put refuses over a newer tombstone, and lists nothing of the record", async () => {
    const { listing, tombstone, demandStored, restoreRow } = await deleted()
    const record = await birthOver(tombstone)
    const stored = demandStored()
    restoreRow(tombstoneOver({ ...stored, gate: null as never }))
    await TH.expectBad(listing.tryPut(record, { expected: tombstone, ifAbsent: 'add', ifPresent: 'get' }), 'stale_write')
    expect(listing.at(Dna)).to.include({ isPresent: false, revision_seq: 2 })
    expect(listing.at(Dna)?.vault_tok).to.not.eq(record.vault_tok)
  })
})

describe("the entrypoints, given malformed input", () => {
  it("a birth's listing.put refuses a malformed record, putting nothing", async () => {
    const { listing, storedNow } = makeVaultWorld()
    await TH.expectRefusal(listing.put({ garbage: true } as never, { expected: SX.shellVaultOf(Dna), ifAbsent: 'add', ifPresent: 'get' }))
    expect(storedNow()).to.be.null
  })

  it("listing.del refuses a malformed record", async () => {
    const { listing } = makeVaultWorld()
    await TH.expectRefusal(listing.del(null as never))
  })
})

describe("lock() with a forget that throws synchronously", () => {
  it("locks without throwing, and reports the refused forget to onLifecycle", async () => {
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
  it("refuses a fetch 'damaged_row', leaving the listed vault as it was", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    restoreRow({ garbage: true } as never)
    await TH.expectRefusal(listing.fetch(Dna), 'damaged_row')
    expect(listing.at(Dna)).to.eq(vault)
    expect(vault.isPresent).to.be.true
    expect(vault.isLocked).to.be.false
  })
})

describe("a damaged row met by listing the bank's vaults", () => {
  it("vacates the listed vault and keeps the row in damaged_rows", async () => {
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

  it("notifies its listeners only when damaged_rows changes", async () => {
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

describe("the listing's methods return the vaultDB's answer", () => {
  it("tryList returns the act, with the listed vaults as its val", async () => {
    const { vault, listing } = await makeBornVault()
    const answer = await TH.expectGood(listing.tryList())
    expect(answer).to.deep.equal([vault])
    expect(await listing.tryList()).to.deep.include({ ok: true, act: 'got' })
  })

  it("tryDel returns the del's act, with the vault listed under its tombstone as its val", async () => {
    const { vault, listing } = await makeBornVault()
    vault.lock()
    const answer = await listing.tryDel(vault.sparse)
    expect(answer).to.deep.include({ ok: true, act: 'deleted', val: listing.at(Dna) })
    expect(answer.val).to.include({ isPresent: false })
    expect(answer.val?.vault_tok).to.not.eq(vault.vault_tok)
    expect(vault.isEnabled).to.be.false
  })

  it("tryDel returns a bad answer for a delete naming another vault life, deleting nothing", async () => {
    const { vault, listing, storedNow } = await makeBornVault()
    const before = storedNow()
    const answer = await listing.tryDel({ ...listing.sparseOf(vault), vault_tok: 'another-life' })
    expect(answer).to.deep.include({ ok: false, world: null })
    expect(answer.err?.refusalkind).to.eq('vault_reborn')
    expect(storedNow()).to.deep.equal(before)
  })

  it("get returns a listed vault, and fetches one that is not listed", async () => {
    const { vault, listing } = await makeBornVault()
    expect(await listing.get(Dna)).to.eq(vault)
    const { listing: fresh } = makeVaultWorld(await storedVaultRecord())
    const fetched = await fresh.get(Dna)
    expect(fetched?.vaultlabel).to.eq(Dna.vaultlabel)
  })
})

describe("listing.tryGet", () => {
  it("returns act 'timely' without asking storage when the listed instance is fresh enough", async () => {
    const { vault, listing, opts } = await makeBornVault()
    const tryGetVault = vi.spyOn(opts.vaultDB, 'tryGetVault')
    const answer = await listing.tryGet(Dna, { maxMillisSinceRefresh: Infinity })
    expect(answer).to.deep.include({ ok: true, act: 'timely', val: vault, world: null })
    expect(tryGetVault).not.toHaveBeenCalled()
  })

  it("expects the shell row for a vault not listed, and the listed vault's own row from then on", async () => {
    const { listing, opts } = makeVaultWorld(await storedVaultRecord())
    const tryGetVault = vi.spyOn(opts.vaultDB, 'tryGetVault')
    const vault = await listing.get(Dna, { maxMillisSinceRefresh: 0 })
    await listing.get(Dna, { maxMillisSinceRefresh: 0 })
    expect(tryGetVault.mock.calls.map(([ask]) => ask.expected)).to.deep.equal([SX.shellVaultOf(Dna), vault?.sparse])
  })

  it("returns the vaultDB's own act when it asked storage", async () => {
    const { vault, listing } = await makeBornVault()
    const answer = await listing.tryGet(Dna, { maxMillisSinceRefresh: 0 })
    expect(answer).to.deep.include({ ok: true, act: 'gotlive', val: vault })
  })
})

describe("the gate methods return the vaultDB's answer", () => {
  it("tryRevokePasskey returns the act, with the written record as its val", async () => {
    const { vault, listing, demandStored } = await makeBornVault()
    const ante = demandStored()
    const answer = await listing.tryRevokePasskey(SX.vaultRecord.parse(ante))
    expect(answer.ok).to.be.true
    expect(answer.act).to.be.a('string')
    expect(answer.val).to.deep.include({ vault_tok: vault.vault_tok })
  })

  it("returns a bad answer on a disabled listing, asking storage nothing", async () => {
    const { listing, demandStored, opts } = await makeBornVault()
    const tryRevokePasskey = vi.spyOn(opts.vaultDB, 'tryRevokePasskey')
    listing.sweep()
    const answer = await listing.tryRevokePasskey(SX.vaultRecord.parse(demandStored()))
    expect(answer.err?.refusalkind).to.eq('disabled')
    expect(tryRevokePasskey).not.toHaveBeenCalled()
  })
})

describe("a listing shares one storage call among concurrent requests", () => {
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
