import { describe, expect, it } from 'vitest'
import { getDocumentSize } from 'convex/values'
import * as SX from 'safebyok/storage'
import * as TH from '../test-helpers'
import { MaxVaultBoxBytes, MaxVaultBoxes, capacityOf } from '../../src/component/tallies'
import type { Life, Tally } from '../../src/component/tallies'

// The VaultDB contract is the battery's, run over this component through a ConvexVaultDB and a fake
// deployment. What is left here is the component's own: the rows a watch and a tidy reach, the
// tally each life keeps, the caps a box put is held to, and Convex's per-transaction limits.

type Backend = ReturnType<typeof TH.componentTest>

const api = TH.rootApi
const birth = { prior: SX.VoidRevision, ifAbsent: 'add', ifPresent: 'fail' } as const
const vault = TH.vaultAt()
const life1: Life = { ...TH.vaultScope, vault_tok: 'life1' }

/** The options of a put replacing the row `ante`. */
const over = (ante: SX.Revision) => ({ prior: SX.revisionOf(ante), ifAbsent: 'fail', ifPresent: 'repl' }) as const

/** The box `boxlabel` at `revision_seq`, in life1 unless `extra` says otherwise, its whisper's ciphertext `cipherBytes` long. */
const boxOf = (boxlabel: string, { revision_seq = 0, cipherBytes = 3, ...extra }: { revision_seq?: number, cipherBytes?: number, vault_tok?: string, user_id?: string } = {}) => (
  TH.boxAt(revision_seq, 'life1', { boxlabel, box_tok: `tok-${boxlabel}`, whisper_ciphered: { cipher_iv_b64: 'aXY', ciphertext_b64: 'c'.repeat(cipherBytes) }, ...extra })
)

/** A backend holding `record` as u1's vault, live, as every box put needs. */
const withVault = async (transactionLimits = false, record = vault): Promise<Backend> => {
  const backend = TH.componentTest(transactionLimits)
  await backend.mutation(api.putVault, { record, opts: birth })
  return backend
}

/** The tally the component keeps for `life`, or null. */
const keptTally = (backend: Backend, { applabel, user_id, vaultlabel, vault_tok }: Life = life1) => backend.run(async ({ db }): Promise<Tally | null> => {
  const kept = await db.query('safebyok_tallies')
    .withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
    .unique()
  return kept && { box_count: kept.box_count, box_bytes: kept.box_bytes }
})

/** What `life`'s box rows really are: every row, live or tombstoned, counted and weighed as Convex reads it. */
const weighedTally = (backend: Backend, { applabel, user_id, vaultlabel, vault_tok }: Life = life1) => backend.run(async ({ db }): Promise<Tally> => {
  const boxDocs = await db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
    .collect()
  let tally = { box_count: 0, box_bytes: 0 }
  for (const boxDoc of boxDocs) { tally = { box_count: tally.box_count + 1, box_bytes: tally.box_bytes + getDocumentSize(boxDoc) } }
  return tally
})

/** The vault_tok of each life the component keeps a tally for. */
const talliedLives = (backend: Backend) => backend.run(async ({ db }) => {
  const tallyDocs = await db.query('safebyok_tallies').collect()
  return tallyDocs.map(({ user_id, vault_tok }) => `${user_id}/${vault_tok}`)
})

/** Box rows stored straight into their lives, untallied, as a component that kept no tallies left them. */
const plantBoxes = (backend: Backend, boxes: (SX.BoxRecord | SX.BoxTombstone)[]) => backend.run(async ({ db }) => {
  await Promise.all(boxes.map((box) => {
    const { applabel, user_id, vaultlabel, vault_tok, boxlabel } = box
    return db.insert('safebyok_boxes', { applabel, user_id, vaultlabel, vault_tok, boxlabel, box })
  }))
})

/** The box rows `asked` lists, by boxlabel. */
const listedBoxlabels = async (backend: Backend, asked: Life = life1) => {
  const { boxes } = await backend.query(api.listBoxes, { asked })
  return boxes.map(({ boxlabel }) => boxlabel)
}

describe("the component's gets", () => {
  it("answer each row exactly as it was put, with none of Convex's fields", async () => {
    const backend = await withVault()
    const box = boxOf('openai')
    await backend.mutation(api.putBox, { record: box, opts: birth })
    expect(await backend.query(api.getVault, { scope: TH.vaultScope })).to.deep.equal(vault)
    expect(await backend.query(api.listVaults, { scope: TH.bankScope })).to.deep.equal([{ vaultlabel: 'main', vault }])
    expect(await backend.query(api.getBox, { asked: { ...life1, boxlabel: 'openai' } })).to.deep.equal({ vault, box })
    expect(await backend.query(api.listBoxes, { asked: life1 })).to.deep.equal({ vault, boxes: [{ boxlabel: 'openai', box }] })
  })
})

describe("watchRows", () => {
  it("watches every vault of the bank and the box rows of every life, and no one else's", async () => {
    const backend = await withVault()
    const box = boxOf('openai')
    const other = TH.vaultAt(0, 'lifeO', { vaultlabel: 'other' })
    const anew = TH.vaultAt(1, 'life2')
    await backend.mutation(api.putBox, { record: box, opts: birth })
    await backend.mutation(api.putVault, { record: other, opts: birth })
    await backend.mutation(api.putVault, { record: TH.vaultAt(0, 'lifeU', { user_id: 'u2' }), opts: birth })
    await backend.mutation(api.putVault, { record: anew, opts: over(vault) })
    expect(await backend.query(api.watchRows, { scope: TH.bankScope })).to.deep.equal({
      vaults: [{ vaultlabel: 'main', vault: anew }, { vaultlabel: 'other', vault: other }],
      boxes:  [{ vaultlabel: 'main', vault_tok: 'life1', boxlabel: 'openai', box }],
    })
    expect(await backend.query(api.watchRows, { scope: TH.vaultScopeOf('other') })).to.deep.equal({ vaults: [{ vaultlabel: 'other', vault: other }], boxes: [] })
  })
})

describe("tidyGone", () => {
  it("removes the box rows and tallies of every life of the bank that has ended, answering how many box rows remain", async () => {
    const backend = await withVault()
    await backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth })
    await backend.mutation(api.putBox, { record: boxOf('openai'), opts: birth })
    await backend.mutation(api.putVault, { record: TH.vaultAt(1, 'life2'), opts: over(vault) })
    await backend.mutation(api.putBox, { record: boxOf('github', { vault_tok: 'life2' }), opts: birth })
    const theirs = TH.vaultAt(0, 'life1', { user_id: 'u2' })
    await backend.mutation(api.putVault, { record: theirs, opts: birth })
    await backend.mutation(api.putBox, { record: boxOf('gemini', { user_id: 'u2' }), opts: birth })
    await backend.mutation(api.putVault, { record: TH.vaultAt(1, 'life2', { user_id: 'u2' }), opts: over(theirs) })
    expect(await talliedLives(backend)).to.have.members(['u1/life1', 'u1/life2', 'u2/life1'])
    //
    expect(await backend.mutation(api.tidyGone, { scope: TH.bankScope })).to.deep.equal({ totalCount: 1 })
    expect(await listedBoxlabels(backend)).to.deep.equal([])
    expect(await listedBoxlabels(backend, { ...life1, vault_tok: 'life2' })).to.deep.equal(['github'])
    expect(await listedBoxlabels(backend, { ...life1, user_id: 'u2' })).to.deep.equal(['gemini'])
    expect(await talliedLives(backend)).to.have.members(['u1/life2', 'u2/life1'])
  })
})

describe("a life's tally", () => {
  it("stays true across new boxes, replacements and dels", async () => {
    const backend = await withVault()
    const steps = [
      () => backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth }),
      () => backend.mutation(api.putBox, { record: boxOf('anthropic', { revision_seq: 1, cipherBytes: 5000 }), opts: over(boxOf('anthropic')) }),
      () => backend.mutation(api.putBox, { record: boxOf('openai'), opts: birth }),
      () => backend.mutation(api.putBox, { record: boxOf('anthropic', { revision_seq: 2 }), opts: over(boxOf('anthropic', { revision_seq: 1 })) }),
      () => backend.mutation(api.delBox, { tombstone: TH.boxTombstoneOf(boxOf('anthropic', { revision_seq: 2 })), opts: { prior: SX.revisionOf(boxOf('anthropic', { revision_seq: 2 })) } }),
      () => backend.mutation(api.delBox, { tombstone: TH.boxTombstoneOf(boxOf('never')), opts: { prior: SX.revisionOf(boxOf('never')) } }),
    ]
    const counts = []
    for (const step of steps) {
      await step()
      const kept = await keptTally(backend)
      expect(kept).to.deep.equal(await weighedTally(backend))
      counts.push(kept?.box_count)
    }
    expect(counts).to.deep.equal([1, 1, 2, 2, 2, 2])
  })

  it("stays true across puts and dels running at once", async () => {
    const backend = await withVault()
    const boxes = Array.from({ length: 12 }, (_slot, ii) => boxOf(`box_${String(ii)}`))
    await Promise.all(boxes.map((box) => backend.mutation(api.putBox, { record: box, opts: birth })))
    await Promise.all(boxes.slice(0, 5).map((box) => backend.mutation(api.delBox, { tombstone: TH.boxTombstoneOf(box), opts: { prior: SX.revisionOf(box) } })))
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend)).to.have.property('box_count', 12)
  })

  it("goes with its life when the vault is deleted, and a life begun anew keeps one of its own", async () => {
    const backend = await withVault()
    await backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth })
    const tombstone = TH.vaultTombstoneOf(vault)
    await backend.mutation(api.delVault, { tombstone, opts: { prior: SX.revisionOf(vault) } })
    expect(await talliedLives(backend)).to.deep.equal([])
    //
    await backend.mutation(api.putVault, { record: TH.vaultAt(2, 'life2'), opts: { ...birth, prior: SX.revisionOf(tombstone) } })
    await backend.mutation(api.putBox, { record: boxOf('openai', { vault_tok: 'life2' }), opts: birth })
    const life2 = { ...life1, vault_tok: 'life2' }
    expect(await keptTally(backend, life2)).to.deep.equal(await weighedTally(backend, life2))
    expect(await keptTally(backend, life2)).to.have.property('box_count', 1)
  })

  it("is kept apart for each vault", async () => {
    const backend = await withVault()
    await backend.mutation(api.putVault, { record: TH.vaultAt(0, 'life1', { user_id: 'u2' }), opts: birth })
    await backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth })
    await backend.mutation(api.putBox, { record: boxOf('openai'), opts: birth })
    await backend.mutation(api.putBox, { record: boxOf('anthropic', { user_id: 'u2' }), opts: birth })
    const theirs = { ...life1, user_id: 'u2' }
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend, theirs)).to.deep.equal(await weighedTally(backend, theirs))
    expect(await keptTally(backend, theirs)).to.have.property('box_count', 1)
  })

  it("is counted, for a life planted without one, at its next box put, the life reading as ever until then", async () => {
    const backend = await withVault()
    await plantBoxes(backend, [boxOf('anthropic'), boxOf('openai')])
    expect(await keptTally(backend)).to.be.null
    expect(await listedBoxlabels(backend)).to.deep.equal(['anthropic', 'openai'])
    //
    await backend.mutation(api.putBox, { record: boxOf('anthropic', { revision_seq: 1 }), opts: over(boxOf('anthropic')) })
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend)).to.have.property('box_count', 2)
  })

  it("is not counted by a del, which never reads the whole life", async () => {
    const backend = await withVault()
    await plantBoxes(backend, [boxOf('anthropic'), boxOf('openai')])
    await backend.mutation(api.delBox, { tombstone: TH.boxTombstoneOf(boxOf('anthropic')), opts: { prior: SX.revisionOf(boxOf('anthropic')) } })
    expect(await keptTally(backend)).to.be.null
    await backend.mutation(api.putBox, { record: boxOf('github'), opts: birth })
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend)).to.have.property('box_count', 3)
  })
})

describe("putBox's count cap", () => {
  it("holds a life to the client's maxBoxes, answering how full it is, and never refuses a replacement", async () => {
    const backend = await withVault()
    await backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth, maxBoxes: 2 })
    await backend.mutation(api.putBox, { record: boxOf('openai'), opts: birth, maxBoxes: 2 })
    const { box_bytes: used } = await weighedTally(backend)
    expect(await backend.mutation(api.putBox, { record: boxOf('github'), opts: birth, maxBoxes: 2 })).to.deep.equal({ capacity: { boxes: { used: 2, max: 2 }, bytes: { used, max: MaxVaultBoxBytes } } })
    const replacement = { record: boxOf('anthropic', { revision_seq: 1 }), opts: over(boxOf('anthropic')), maxBoxes: 2 }
    expect(await backend.mutation(api.putBox, replacement)).to.deep.include({ landed: true })
  })

  it("holds a life to the component's own count limit, whatever cap the client asks", async () => {
    const backend = await withVault()
    await backend.run(async ({ db }) => { await db.insert('safebyok_tallies', { ...life1, box_count: MaxVaultBoxes, box_bytes: 1000 }) })
    const full = { capacity: { boxes: { used: MaxVaultBoxes, max: MaxVaultBoxes }, bytes: { used: 1000, max: MaxVaultBoxBytes } } }
    expect(await backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth, maxBoxes: 1_000_000 })).to.deep.equal(full)
    expect(await backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth })).to.deep.equal(full)
    expect(await backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth, maxBoxes: NaN })).to.deep.equal(full)
  })

  it("counts a box's tombstone as a row, so putting and deleting under fresh boxlabels fills the life", async () => {
    const backend = await withVault()
    for (const boxlabel of ['anthropic', 'openai', 'github']) {
      const box = boxOf(boxlabel)
      expect(await backend.mutation(api.putBox, { record: box, opts: birth, maxBoxes: 3 })).to.deep.include({ landed: true })
      expect(await backend.mutation(api.delBox, { tombstone: TH.boxTombstoneOf(box), opts: { prior: SX.revisionOf(box) } })).to.deep.include({ landed: true })
    }
    const { box_bytes: used } = await weighedTally(backend)
    expect(await backend.mutation(api.putBox, { record: boxOf('gitlab'), opts: birth, maxBoxes: 3 })).to.deep.equal({ capacity: { boxes: { used: 3, max: 3 }, bytes: { used, max: MaxVaultBoxBytes } } })
  })

  it("lets a box reborn over its tombstone take the tombstone's row, in a life full of them", async () => {
    const backend = await withVault()
    const tombstones = ['anthropic', 'openai'].map((boxlabel) => TH.boxTombstoneOf(boxOf(boxlabel)))
    await plantBoxes(backend, tombstones)
    const reborn = boxOf('anthropic', { revision_seq: tombstones[0]!.revision_seq + 1 })
    expect(await backend.mutation(api.putBox, { record: reborn, opts: { ...birth, prior: SX.revisionOf(tombstones[0]!) }, maxBoxes: 2 })).to.deep.include({ landed: true })
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend)).to.have.property('box_count', 2)
  })

  it("frees a life's tombstones only when the vault is deleted, its next life counted afresh", async () => {
    const backend = await withVault()
    await plantBoxes(backend, [TH.boxTombstoneOf(boxOf('anthropic'))])
    expect(await backend.mutation(api.putBox, { record: boxOf('openai'), opts: birth, maxBoxes: 1 })).to.have.property('capacity')
    const tombstone = TH.vaultTombstoneOf(vault)
    await backend.mutation(api.delVault, { tombstone, opts: { prior: SX.revisionOf(vault) } })
    await backend.mutation(api.putVault, { record: TH.vaultAt(2, 'life2'), opts: { ...birth, prior: SX.revisionOf(tombstone) } })
    expect(await backend.mutation(api.putBox, { record: boxOf('openai', { vault_tok: 'life2' }), opts: birth, maxBoxes: 1 })).to.deep.include({ landed: true })
    expect(await backend.mutation(api.tidyGone, { scope: TH.bankScope })).to.deep.equal({ totalCount: 1 })
  })
})

/** A backend whose life1 holds eight boxes of 900,000 bytes, a little under its weight limit, and the room left. */
const nearlyFull = async () => {
  const backend = await withVault()
  for (let ii = 0; ii < 8; ii++) {
    await backend.mutation(api.putBox, { record: boxOf(`heavy_${String(ii)}`, { cipherBytes: 900_000 }), opts: birth })
  }
  const { box_bytes: boxBytes } = await weighedTally(backend)
  return { backend, room: MaxVaultBoxBytes - boxBytes }
}

describe("putBox's weight limit", () => {
  it("refuses a new box that would take the life past it, answering how full it is, and lets in one that fits", async () => {
    const { backend, room } = await nearlyFull()
    const capacity = { boxes: { used: 8, max: MaxVaultBoxes }, bytes: { used: MaxVaultBoxBytes - room, max: MaxVaultBoxBytes } }
    expect(await backend.mutation(api.putBox, { record: boxOf('big', { cipherBytes: room }), opts: birth })).to.deep.equal({ capacity })
    expect(await backend.mutation(api.putBox, { record: boxOf('small'), opts: birth })).to.deep.include({ landed: true })
  })

  it("lets a replacement grow the life up to it exactly, then refuses one byte more, and lets a lighter one in", async () => {
    const { backend, room } = await nearlyFull()
    const grown = boxOf('heavy_0', { revision_seq: 1, cipherBytes: 900_000 + room })
    const growth = { record: grown, opts: over(boxOf('heavy_0')) }
    expect(await backend.mutation(api.putBox, growth)).to.deep.include({ landed: true })
    expect(await keptTally(backend)).to.deep.equal({ box_count: 8, box_bytes: MaxVaultBoxBytes })
    expect(await backend.mutation(api.putBox, { record: boxOf('heavy_0', { revision_seq: 2, cipherBytes: 900_001 + room }), opts: over(grown) })).to.have.property('capacity')
    expect(await backend.mutation(api.putBox, { record: boxOf('heavy_0', { revision_seq: 2 }), opts: over(grown) })).to.deep.include({ landed: true })
  })

  it("keeps a life too large to read whole deletable, a box at a time, its puts refused as full", async () => {
    const backend = await withVault(true)
    // Twenty of 900,000 bytes, more than one transaction may read: four plants, each within its limits.
    const heavies = Array.from({ length: 20 }, (_slot, ii) => boxOf(`heavy_${String(ii).padStart(2, '0')}`, { cipherBytes: 900_000 }))
    for (let batch = 0; batch < 4; batch++) { await plantBoxes(backend, heavies.slice(batch * 5, (batch + 1) * 5)) }
    await expect(backend.query(api.listBoxes, { asked: life1 })).rejects.toThrow(/read/i)
    expect(await backend.mutation(api.putBox, { record: boxOf('anthropic'), opts: birth })).to.deep.equal({ capacity: capacityOf(null, MaxVaultBoxes) })
    for (const heavy of heavies) {
      expect(await backend.mutation(api.delBox, { tombstone: TH.boxTombstoneOf(heavy), opts: { prior: SX.revisionOf(heavy) } })).to.deep.include({ landed: true })
    }
    expect(await backend.mutation(api.delVault, { tombstone: TH.vaultTombstoneOf(vault), opts: { prior: SX.revisionOf(vault) } })).to.deep.include({ landed: true })
  })
})

// A Convex transaction may read 16 MiB and write 16,000 documents. Listing and watching read a life
// once; deleting the vault reads every box row of the life and writes each live one. The component
// holds every life to MaxVaultBoxes boxes and MaxVaultBoxBytes of box rows so that each of these
// stays one transaction, beside a vault row as heavy as a document may be.

/** What listing, watching and deleting life1's vault find, each one whole transaction over it. */
const listWatchDel = async (backend: Backend) => {
  const listed = await listedBoxlabels(backend)
  const { boxes } = await backend.query(api.watchRows, { scope: TH.vaultScope })
  const vaultRow = await backend.query(api.getVault, { scope: TH.vaultScope })
  const { landed } = await backend.mutation(api.delVault, { tombstone: TH.vaultTombstoneOf(vaultRow as SX.VaultRecord), opts: { prior: SX.revisionOf(vaultRow as SX.VaultRecord) } })
  const { boxes: afterDel } = await backend.query(api.listBoxes, { asked: life1 })
  const liveCount = afterDel.filter(({ box }) => SX.isLiveRow(box)).length
  return { listedCount: listed.length, watchedCount: boxes.length, landed, liveCount }
}

/** A vault record as heavy as a Convex document may be, near enough. */
const wholeDocumentVault = () => {
  const padding = 1_048_576 - getDocumentSize({ ...TH.vaultScope, vault }) - 64
  const passphrase_wayin = { ...TH.passphraseWayin, salt_b64: TH.passphraseWayin.salt_b64 + 'c'.repeat(padding) }
  return TH.vaultAt(0, 'life1', { gate: { ...vault.gate, passphrase_wayin } })
}

describe("a large vault, within Convex's per-transaction limits", () => {
  it("lists, watches and deletes a life filled to its count limit, refusing one box more but never a replacement", async () => {
    const backend = await withVault(true)
    const boxes = Array.from({ length: MaxVaultBoxes }, (_slot, ii) => boxOf(`b${String(ii).padStart(4, '0')}`))
    await plantBoxes(backend, boxes)
    expect(await backend.mutation(api.putBox, { record: boxOf('one_too_many'), opts: birth })).to.have.nested.property('capacity.boxes.used', MaxVaultBoxes)
    const replacement = { record: boxOf('b0000', { revision_seq: 1 }), opts: over(boxOf('b0000')) }
    expect(await backend.mutation(api.putBox, replacement)).to.deep.include({ landed: true })
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await listWatchDel(backend)).to.deep.equal({ listedCount: MaxVaultBoxes, watchedCount: MaxVaultBoxes, landed: true, liveCount: 0 })
  }, 60_000)

  it("lists, watches and deletes a life filled to its count limit with tombstones, refusing one box more", async () => {
    const backend = await withVault(true)
    const tombstones = Array.from({ length: MaxVaultBoxes }, (_slot, ii) => TH.boxTombstoneOf(boxOf(`b${String(ii).padStart(4, '0')}`)))
    await plantBoxes(backend, tombstones)
    expect(await backend.mutation(api.putBox, { record: boxOf('one_too_many'), opts: birth })).to.have.nested.property('capacity.boxes.used', MaxVaultBoxes)
    expect(await listWatchDel(backend)).to.deep.equal({ listedCount: MaxVaultBoxes, watchedCount: MaxVaultBoxes, landed: true, liveCount: 0 })
  }, 60_000)

  it("lists, watches and deletes a life filled to its weight limit, beside a vault row of a whole document", async () => {
    const backend = await withVault(true, wholeDocumentVault())
    let filledCount = 0
    for (; filledCount < 200; filledCount++) {
      const answer = await backend.mutation(api.putBox, { record: boxOf(`b${String(filledCount).padStart(39, '0')}`, { cipherBytes: 54_000 }), opts: birth })
      if ('capacity' in answer) { break }
    }
    expect(filledCount).to.be.within(100, 199)
    const kept = await keptTally(backend)
    expect(kept).to.deep.equal(await weighedTally(backend))
    expect(kept?.box_bytes).to.be.within(MaxVaultBoxBytes - 60_000, MaxVaultBoxBytes)
    expect(await listWatchDel(backend)).to.deep.equal({ listedCount: filledCount, watchedCount: filledCount, landed: true, liveCount: 0 })
  }, 60_000)
})
