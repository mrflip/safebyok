import { describe, expect, it } from 'vitest'
import { getDocumentSize } from 'convex/values'
import * as DB from 'safebyok/storage'
import * as TH from '../test-helpers'
import { MaxVaultBoxBytes, MaxVaultBoxes, capacityOf } from '../../src/component/tallies'
import type { Life, Tally } from '../../src/component/tallies'

// The shared VaultDB battery tests the VaultDB contract, and runs against this component through a
// ConvexVaultDB and a fake deployment. These tests cover what is specific to the component: which
// rows a watch and a tidy reach, the tally for each life, the caps on a box put, and Convex's
// per-transaction limits.

type Backend = ReturnType<typeof TH.componentTest>

const api = TH.rootApi
const vault = TH.vaultAt()
const life1: Life = { ...TH.vaultScope, vault_tok: 'life1' }

/** Put `record` in `backend` over the row `ante`, or over none, under the soft cap `maxBoxes` where given. */
const putBoxIn = (backend: Backend, record: DB.BoxRecord, ante: DB.BoxRow | null = null, maxBoxes?: number) => backend.mutation(api.putBox, TH.putBoxArgs(record, ante, maxBoxes))

/** Delete the box row `ante` in `backend`. */
const delBoxIn = (backend: Backend, ante: DB.BoxRow) => backend.mutation(api.delBox, TH.delBoxArgs(ante))

/** True for a box put's answer that refuses `vault_full`. */
const isFull = ({ act }: { act: string }): boolean => act === 'vault_full'

/** Make the box `boxlabel` at `revision_seq`, in life1 unless `extra` says otherwise, with ciphertext `cipherBytes` long. */
const boxOf = (boxlabel: string, { revision_seq = 0, cipherBytes = 3, ...extra }: { revision_seq?: number, cipherBytes?: number, vault_tok?: string, user_id?: string, box_tok?: string } = {}) => (
  TH.boxAt(revision_seq, 'life1', { boxlabel, box_tok: `tok-${boxlabel}`, whisper_ciphered: { cipher_iv_b64: 'aXY', ciphertext_b64: 'c'.repeat(cipherBytes) }, ...extra })
)

/** Make a backend where `record` is u1's live vault, which every box put needs. */
const withVault = async (transactionLimits = false, record = vault): Promise<Backend> => {
  const backend = TH.componentTest(transactionLimits)
  await backend.mutation(api.putVault, TH.putVaultArgs(record))
  return backend
}

/** Read the tally row stored for `life`, or null. */
const keptTally = (backend: Backend, { applabel, user_id, vaultlabel, vault_tok }: Life = life1) => backend.run(async ({ db }): Promise<Tally | null> => {
  const kept = await db.query('safebyok_tallies')
    .withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
    .unique()
  return kept && { all_count: kept.all_count, live_count: kept.live_count, all_size: kept.all_size, live_size: kept.live_size }
})

/** Count and weigh the box rows of `life` directly, as Convex sizes them: every row, tombstones included, and the live rows alone. */
const weighedTally = (backend: Backend, { applabel, user_id, vaultlabel, vault_tok }: Life = life1) => backend.run(async ({ db }): Promise<Tally> => {
  const boxDocs = await db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
    .collect()
  const liveDocs = boxDocs.filter(({ box }) => DB.isLiveRow(box))
  const sizeOf = (docs: typeof boxDocs) => docs.reduce((total, boxDoc) => total + getDocumentSize(boxDoc), 0)
  return { all_count: boxDocs.length, live_count: liveDocs.length, all_size: sizeOf(boxDocs), live_size: sizeOf(liveDocs) }
})

/** List the lives that have a tally row, each as `user_id/vault_tok`. */
const talliedLives = (backend: Backend) => backend.run(async ({ db }) => {
  const tallyDocs = await db.query('safebyok_tallies').collect()
  return tallyDocs.map(({ user_id, vault_tok }) => `${user_id}/${vault_tok}`)
})

/** Insert box rows directly, without tallying them, as a component version that kept no tallies would have left them. */
const plantBoxes = (backend: Backend, boxes: (DB.BoxRecord | DB.BoxTombstone)[]) => backend.run(async ({ db }) => {
  await Promise.all(boxes.map((box) => {
    const { applabel, user_id, vaultlabel, vault_tok, boxlabel } = box
    return db.insert('safebyok_boxes', { applabel, user_id, vaultlabel, vault_tok, boxlabel, box })
  }))
})

/** Overwrite the stored vault row directly, so the previous life ends with its box rows left behind. */
const plantVault = (backend: Backend, vault: DB.VaultRecord) => backend.run(async ({ db }) => {
  const { applabel, user_id, vaultlabel } = vault
  const doc = await db.query('safebyok_vaults').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel)).unique()
  if (doc === null) { throw new Error(`No vault row to plant over for ${user_id}/${vaultlabel}`) }
  await db.patch(doc._id, { vault })
})

/** List the boxlabels of the box rows in `asked`. */
const listedBoxlabels = async (backend: Backend, asked: Life = life1) => {
  const { boxes } = await backend.query(api.listBoxes, { asked })
  return boxes.map(({ boxlabel }) => boxlabel)
}

describe("the component's gets", () => {
  it("return each row exactly as it was put, with none of Convex's fields", async () => {
    const backend = await withVault()
    const box = boxOf('openai')
    await putBoxIn(backend, box)
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
    await putBoxIn(backend, box)
    await backend.mutation(api.putVault, TH.putVaultArgs(other))
    await backend.mutation(api.putVault, TH.putVaultArgs(TH.vaultAt(0, 'lifeU', { user_id: 'u2' })))
    await plantVault(backend, anew)
    expect(await backend.query(api.watchRows, { scope: TH.bankScope })).to.deep.equal({
      vaults: [{ vaultlabel: 'main', vault: anew }, { vaultlabel: 'other', vault: other }],
      boxes:  [{ vaultlabel: 'main', vault_tok: 'life1', boxlabel: 'openai', box }],
    })
    expect(await backend.query(api.watchRows, { scope: TH.vaultScopeOf('other') })).to.deep.equal({ vaults: [{ vaultlabel: 'other', vault: other }], boxes: [] })
  })
})

describe("tidyGone", () => {
  it("removes the box rows and tallies of every ended vault life in the bank, and returns how many box rows remain", async () => {
    const backend = await withVault()
    await putBoxIn(backend, boxOf('anthropic'))
    await putBoxIn(backend, boxOf('openai'))
    await plantVault(backend, TH.vaultAt(1, 'life2'))
    await putBoxIn(backend, boxOf('github', { vault_tok: 'life2' }))
    const theirs = TH.vaultAt(0, 'life1', { user_id: 'u2' })
    await backend.mutation(api.putVault, TH.putVaultArgs(theirs))
    await putBoxIn(backend, boxOf('gemini', { user_id: 'u2' }))
    await plantVault(backend, TH.vaultAt(1, 'life2', { user_id: 'u2' }))
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
      () => putBoxIn(backend, boxOf('anthropic')),
      () => putBoxIn(backend, boxOf('anthropic', { revision_seq: 1, cipherBytes: 5000 }), boxOf('anthropic')),
      () => putBoxIn(backend, boxOf('openai')),
      () => putBoxIn(backend, boxOf('anthropic', { revision_seq: 2 }), boxOf('anthropic', { revision_seq: 1 })),
      () => delBoxIn(backend, boxOf('anthropic', { revision_seq: 2 })),
      () => delBoxIn(backend, boxOf('never')),
    ]
    const counts = []
    for (const step of steps) {
      await step()
      const kept = await keptTally(backend)
      expect(kept).to.deep.equal(await weighedTally(backend))
      counts.push([kept?.all_count, kept?.live_count])
    }
    expect(counts).to.deep.equal([[1, 1], [1, 1], [2, 2], [2, 2], [2, 1], [2, 1]])
  })

  it("follows its live and all figures through a put, a replace, a del, a put over the tombstone, and the vault's deletion", async () => {
    const backend = await withVault()
    const born = boxOf('anthropic')
    const replaced = boxOf('anthropic', { revision_seq: 1, cipherBytes: 5000 })
    const tombstone = TH.boxTombstoneOf(replaced)
    const reborn = boxOf('anthropic', { revision_seq: tombstone.revision_seq + 1, box_tok: 'tok-anthropic2' })
    const figures = async () => {
      const kept = await keptTally(backend)
      expect(kept).to.deep.equal(await weighedTally(backend))
      return kept
    }
    await putBoxIn(backend, born)
    const afterBorn = await figures()
    expect(afterBorn).to.deep.include({ all_count: 1, live_count: 1, live_size: afterBorn?.all_size })
    await putBoxIn(backend, replaced, born)
    const afterReplace = await figures()
    expect(afterReplace).to.deep.include({ all_count: 1, live_count: 1, live_size: afterReplace?.all_size })
    expect((afterReplace?.all_size ?? 0) - (afterBorn?.all_size ?? 0)).to.eq(4997)
    await delBoxIn(backend, replaced)
    const afterDel = await figures()
    expect(afterDel).to.deep.include({ all_count: 1, live_count: 0, live_size: 0 })
    expect(afterDel?.all_size).to.be.above(0)
    await putBoxIn(backend, reborn, tombstone)
    const afterReborn = await figures()
    expect(afterReborn).to.deep.include({ all_count: 1, live_count: 1, live_size: afterReborn?.all_size })
    await backend.mutation(api.delVault, TH.delVaultArgs(vault))
    expect(await keptTally(backend)).to.be.null
  })

  it("stays true across puts and dels running at once", async () => {
    const backend = await withVault()
    const boxes = Array.from({ length: 12 }, (_slot, ii) => boxOf(`box_${String(ii)}`))
    await Promise.all(boxes.map((box) => putBoxIn(backend, box)))
    await Promise.all(boxes.slice(0, 5).map((box) => delBoxIn(backend, box)))
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend)).to.deep.include({ all_count: 12, live_count: 7 })
  })

  it("is removed with its box rows when its vault is deleted, and a new life gets a tally of its own", async () => {
    const backend = await withVault()
    await putBoxIn(backend, boxOf('anthropic'))
    const tombstone = TH.vaultTombstoneOf(vault)
    await backend.mutation(api.delVault, TH.delVaultArgs(vault))
    expect(await talliedLives(backend)).to.deep.equal([])
    expect(await listedBoxlabels(backend)).to.deep.equal([])
    //
    await backend.mutation(api.putVault, TH.putVaultArgs(TH.vaultAt(2, 'life2'), tombstone))
    await putBoxIn(backend, boxOf('openai', { vault_tok: 'life2' }))
    const life2 = { ...life1, vault_tok: 'life2' }
    expect(await keptTally(backend, life2)).to.deep.equal(await weighedTally(backend, life2))
    expect(await keptTally(backend, life2)).to.have.property('all_count', 1)
  })

  it("is kept apart for each vault", async () => {
    const backend = await withVault()
    await backend.mutation(api.putVault, TH.putVaultArgs(TH.vaultAt(0, 'life1', { user_id: 'u2' })))
    await putBoxIn(backend, boxOf('anthropic'))
    await putBoxIn(backend, boxOf('openai'))
    await putBoxIn(backend, boxOf('anthropic', { user_id: 'u2' }))
    const theirs = { ...life1, user_id: 'u2' }
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend, theirs)).to.deep.equal(await weighedTally(backend, theirs))
    expect(await keptTally(backend, theirs)).to.have.property('all_count', 1)
  })

  it("is counted at the next box put, for a life that has none", async () => {
    const backend = await withVault()
    await plantBoxes(backend, [boxOf('anthropic'), boxOf('openai')])
    expect(await keptTally(backend)).to.be.null
    expect(await listedBoxlabels(backend)).to.deep.equal(['anthropic', 'openai'])
    //
    await putBoxIn(backend, boxOf('anthropic', { revision_seq: 1 }), boxOf('anthropic'))
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend)).to.have.property('all_count', 2)
  })

  it("is not counted by a del", async () => {
    const backend = await withVault()
    await plantBoxes(backend, [boxOf('anthropic'), boxOf('openai')])
    await delBoxIn(backend, boxOf('anthropic'))
    expect(await keptTally(backend)).to.be.null
    await putBoxIn(backend, boxOf('github'))
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend)).to.have.property('all_count', 3)
  })
})

describe("putBox's count cap", () => {
  it("refuses a new box past the client's maxBoxes as vault_full, but never a replacement", async () => {
    const backend = await withVault()
    await putBoxIn(backend, boxOf('anthropic'), null, 2)
    await putBoxIn(backend, boxOf('openai'), null, 2)
    const { all_size: used } = await weighedTally(backend)
    const capacity = { boxes: { used: 2, max: 2 }, bytes: { used, max: MaxVaultBoxBytes } }
    expect(await putBoxIn(backend, boxOf('github'), null, 2)).to.deep.include({ ok: false, act: 'vault_full', box: null, capacity })
    const replacement = TH.putBoxArgs(boxOf('anthropic', { revision_seq: 1 }), boxOf('anthropic'), 2)
    expect(await backend.mutation(api.putBox, replacement)).to.deep.include({ ok: true, act: 'replaced' })
  })

  it("refuses a new box past the component's own count limit, whatever cap the client asks for", async () => {
    const backend = await withVault()
    await backend.run(async ({ db }) => { await db.insert('safebyok_tallies', { ...life1, all_count: MaxVaultBoxes, live_count: MaxVaultBoxes, all_size: 1000, live_size: 1000 }) })
    const full = { act: 'vault_full', capacity: { boxes: { used: MaxVaultBoxes, max: MaxVaultBoxes }, bytes: { used: 1000, max: MaxVaultBoxBytes } } }
    expect(await putBoxIn(backend, boxOf('anthropic'), null, 1_000_000)).to.deep.include(full)
    expect(await putBoxIn(backend, boxOf('anthropic'))).to.deep.include(full)
    expect(await putBoxIn(backend, boxOf('anthropic'), null, NaN)).to.deep.include(full)
  })

  it("counts a box's tombstone as a row", async () => {
    const backend = await withVault()
    for (const boxlabel of ['anthropic', 'openai', 'github']) {
      const box = boxOf(boxlabel)
      expect(await putBoxIn(backend, box, null, 3)).to.deep.include({ act: 'born' })
      expect(await delBoxIn(backend, box)).to.deep.include({ act: 'deleted' })
    }
    const { all_size: used } = await weighedTally(backend)
    expect(await putBoxIn(backend, boxOf('gitlab'), null, 3)).to.deep.include({ act: 'vault_full', capacity: { boxes: { used: 3, max: 3 }, bytes: { used, max: MaxVaultBoxBytes } } })
  })

  it("lets a box reborn over its tombstone take the tombstone's row, even in a life at its cap", async () => {
    const backend = await withVault()
    const tombstone = TH.boxTombstoneOf(boxOf('anthropic'))
    await plantBoxes(backend, [tombstone, TH.boxTombstoneOf(boxOf('openai'))])
    const reborn = boxOf('anthropic', { revision_seq: tombstone.revision_seq + 1, box_tok: 'tok-anthropic2' })
    expect(await putBoxIn(backend, reborn, tombstone, 2)).to.deep.include({ act: 'reborn' })
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await keptTally(backend)).to.deep.include({ all_count: 2, live_count: 1 })
  })

  it("frees a life's tombstones only when the vault is deleted", async () => {
    const backend = await withVault()
    await plantBoxes(backend, [TH.boxTombstoneOf(boxOf('anthropic'))])
    expect(await putBoxIn(backend, boxOf('openai'), null, 1)).to.deep.include({ act: 'vault_full' })
    const tombstone = TH.vaultTombstoneOf(vault)
    await backend.mutation(api.delVault, TH.delVaultArgs(vault))
    await backend.mutation(api.putVault, TH.putVaultArgs(TH.vaultAt(2, 'life2'), tombstone))
    expect(await putBoxIn(backend, boxOf('openai', { vault_tok: 'life2' }), null, 1)).to.deep.include({ act: 'born' })
    expect(await backend.mutation(api.tidyGone, { scope: TH.bankScope })).to.deep.equal({ totalCount: 1 })
  })
})

/** Make a backend whose life1 has eight boxes of 900,000 bytes each, just under the byte limit. Also returns the room left. */
const nearlyFull = async () => {
  const backend = await withVault()
  for (let ii = 0; ii < 8; ii++) {
    await putBoxIn(backend, boxOf(`heavy_${String(ii)}`, { cipherBytes: 900_000 }))
  }
  const { all_size: boxBytes } = await weighedTally(backend)
  return { backend, room: MaxVaultBoxBytes - boxBytes }
}

describe("putBox's weight limit", () => {
  it("refuses a new box that would exceed it, and accepts one that fits", async () => {
    const { backend, room } = await nearlyFull()
    const capacity = { boxes: { used: 8, max: MaxVaultBoxes }, bytes: { used: MaxVaultBoxBytes - room, max: MaxVaultBoxBytes } }
    expect(await putBoxIn(backend, boxOf('big', { cipherBytes: room }))).to.deep.include({ ok: false, act: 'vault_full', box: null, capacity })
    expect(await putBoxIn(backend, boxOf('small'))).to.deep.include({ act: 'born' })
  })

  it("lets a replacement reach it exactly but not exceed it", async () => {
    const { backend, room } = await nearlyFull()
    const grown = boxOf('heavy_0', { revision_seq: 1, cipherBytes: 900_000 + room })
    expect(await putBoxIn(backend, grown, boxOf('heavy_0'))).to.deep.include({ act: 'replaced' })
    expect(await keptTally(backend)).to.deep.equal({ all_count: 8, live_count: 8, all_size: MaxVaultBoxBytes, live_size: MaxVaultBoxBytes })
    const overgrown = await putBoxIn(backend, boxOf('heavy_0', { revision_seq: 2, cipherBytes: 900_001 + room }), grown)
    expect(overgrown).to.deep.include({ ok: false, act: 'vault_full', box: grown, presence: 'live' })
    expect(await putBoxIn(backend, boxOf('heavy_0', { revision_seq: 2 }), grown)).to.deep.include({ act: 'replaced' })
  })

  it("lets a life too large to read whole be deleted a box at a time", async () => {
    const backend = await withVault(true)
    // Twenty boxes of 900,000 bytes are more than one transaction may read, so they are planted in four batches, each within the limits.
    const heavies = Array.from({ length: 20 }, (_slot, ii) => boxOf(`heavy_${String(ii).padStart(2, '0')}`, { cipherBytes: 900_000 }))
    for (let batch = 0; batch < 4; batch++) { await plantBoxes(backend, heavies.slice(batch * 5, (batch + 1) * 5)) }
    await expect(backend.query(api.listBoxes, { asked: life1 })).rejects.toThrow(/read/i)
    expect(await putBoxIn(backend, boxOf('anthropic'))).to.deep.include({ act: 'vault_full', capacity: capacityOf(null, MaxVaultBoxes) })
    for (const heavy of heavies) {
      expect(await delBoxIn(backend, heavy)).to.deep.include({ act: 'deleted' })
    }
    expect(await backend.mutation(api.delVault, TH.delVaultArgs(vault))).to.deep.include({ act: 'deleted' })
  })
})

// A Convex transaction may read 16 MiB and write 16,000 documents. Listing and watching read a life
// once. Deleting the vault reads every box row of the life and deletes each. The component
// limits every life to MaxVaultBoxes box rows and MaxVaultBoxBytes of them, so that each of these
// fits in one transaction, even beside a vault row as large as a document may be.

/** List, watch and delete life1's vault, each in one transaction, and return what each found. */
const listWatchDel = async (backend: Backend) => {
  const listed = await listedBoxlabels(backend)
  const { boxes } = await backend.query(api.watchRows, { scope: TH.vaultScope })
  const vaultRow = await backend.query(api.getVault, { scope: TH.vaultScope })
  const { act } = await backend.mutation(api.delVault, TH.delVaultArgs(vaultRow as DB.VaultRecord))
  const { boxes: afterDel } = await backend.query(api.listBoxes, { asked: life1 })
  const liveCount = afterDel.filter(({ box }) => DB.isLiveRow(box)).length
  return { listedCount: listed.length, watchedCount: boxes.length, act, liveCount }
}

/** Make a vault record padded to just under Convex's document size limit. */
const wholeDocumentVault = () => {
  const padding = 1_048_576 - getDocumentSize({ ...TH.vaultScope, vault }) - 64
  const passphrase_wayin = { ...TH.passphraseWayin, key_deriver_label: TH.passphraseWayin.key_deriver_label + 'c'.repeat(padding) }
  return TH.vaultAt(0, 'life1', { gate: { ...vault.gate, passphrase_wayin } })
}

describe("a large vault, within Convex's per-transaction limits", () => {
  it("lists, watches and deletes a life filled to its count limit, refusing one box more but never a replacement", async () => {
    const backend = await withVault(true)
    const boxes = Array.from({ length: MaxVaultBoxes }, (_slot, ii) => boxOf(`b${String(ii).padStart(4, '0')}`))
    await plantBoxes(backend, boxes)
    expect(await putBoxIn(backend, boxOf('one_too_many'))).to.have.nested.property('capacity.boxes.used', MaxVaultBoxes)
    expect(await putBoxIn(backend, boxOf('b0000', { revision_seq: 1 }), boxOf('b0000'))).to.deep.include({ act: 'replaced' })
    expect(await keptTally(backend)).to.deep.equal(await weighedTally(backend))
    expect(await listWatchDel(backend)).to.deep.equal({ listedCount: MaxVaultBoxes, watchedCount: MaxVaultBoxes, act: 'deleted', liveCount: 0 })
  }, 60_000)

  it("lists, watches and deletes a life filled to its count limit with tombstones", async () => {
    const backend = await withVault(true)
    const tombstones = Array.from({ length: MaxVaultBoxes }, (_slot, ii) => TH.boxTombstoneOf(boxOf(`b${String(ii).padStart(4, '0')}`)))
    await plantBoxes(backend, tombstones)
    expect(await putBoxIn(backend, boxOf('one_too_many'))).to.have.nested.property('capacity.boxes.used', MaxVaultBoxes)
    expect(await listWatchDel(backend)).to.deep.equal({ listedCount: MaxVaultBoxes, watchedCount: MaxVaultBoxes, act: 'deleted', liveCount: 0 })
  }, 60_000)

  it("lists, watches and deletes a life filled to its weight limit, beside a vault row of a whole document", async () => {
    const backend = await withVault(true, wholeDocumentVault())
    let filledCount = 0
    for (; filledCount < 200; filledCount++) {
      const answer = await putBoxIn(backend, boxOf(`b${String(filledCount).padStart(39, '0')}`, { cipherBytes: 54_000 }))
      if (isFull(answer)) { break }
    }
    expect(filledCount).to.be.within(100, 199)
    const kept = await keptTally(backend)
    expect(kept).to.deep.equal(await weighedTally(backend))
    expect(kept?.all_size).to.be.within(MaxVaultBoxBytes - 60_000, MaxVaultBoxBytes)
    expect(await listWatchDel(backend)).to.deep.equal({ listedCount: filledCount, watchedCount: filledCount, act: 'deleted', liveCount: 0 })
  }, 60_000)
})
