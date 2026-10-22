import { describe, expect, it } from 'vitest'
import { getDocumentSize } from 'convex/values'
import { BoxSummary, memoryStore } from 'safebyok'
import type { GatedVaultProps } from 'safebyok'
import * as TH from '../test-helpers'
import { MaxVaultBoxBytes, MaxVaultBoxes, capacityOf } from '../../src/component/tallies'

const u1 = TH.scopeOf('u1')

/** A fresh CVX whose `u1` scope holds vault props, as every box write needs. */
const withVaultProps = async () => {
  const CVX = TH.componentTest()
  await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u1'))
  return CVX
}

/** Every row of both tables, system fields and all: what is really stored. */
const allRows = (CVX: ReturnType<typeof TH.componentTest>) => CVX.run(async (ctx) => ({
  vaults: await ctx.db.query('safebyok_vaults').collect(),
  boxes:  await ctx.db.query('safebyok_boxes').collect(),
}))

// The verbs' contract -- lines 1.1 to 3.8 of VAULTDB.md -- is the battery's, run over this
// component through convexVaultDB and a fake deployment. What is left here is the component's
// own: what it strips, what its validators refuse, and the checks a client never lets reach it.

describe("getVaultProps and ensureVaultProps", () => {
  it("has no vault props until some are created, then reads them back exactly, with no Convex fields", async () => {
    const CVX = TH.componentTest()
    expect(await TH.propsIn(CVX, u1)).to.be.null
    expect(await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u1'))).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(await TH.propsIn(CVX, u1)).to.deep.equal(TH.vaultPropsOf('u1'))
  })

  it("refuses vault props Convex's validators do not accept, writing nothing", async () => {
    const CVX = TH.componentTest()
    const { format: _format, ...formatless } = TH.vaultPropsOf('u1')
    await expect(CVX.mutation(TH.vaults.putVaultProps, { vaultProps: formatless as never, expected: { vault_tok: 'vault-tok-u1', gate_epoch: 0 } })).rejects.toThrow(/format/)
    const { vaults } = await allRows(CVX)
    expect(vaults).to.have.lengthOf(0)
  })
})

describe("getVault and ensureVault", () => {
  it("has no vault until one is ensured, then reads its props and its boxes, without their ciphered fields or Convex's, from one query", async () => {
    const CVX = TH.componentTest()
    expect(await CVX.query(TH.vaults.getVault, { scope: u1 })).to.be.null
    expect(await CVX.mutation(TH.vaults.ensureVault, { draft: TH.gatelessOf('u1') })).to.deep.equal({ vaultProps: TH.gatelessOf('u1'), boxes: [] })
    await CVX.mutation(TH.vaults.putVaultProps, { vaultProps: TH.vaultPropsOf('u1'), expected: { vault_tok: 'vault-tok-u1', gate_epoch: 0 } })
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    const { box_key_wrapped: _boxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = TH.boxOf('anthropic_api_key', 'a1')
    expect(await CVX.query(TH.vaults.getVault, { scope: u1 })).to.deep.equal({ vaultProps: TH.vaultPropsOf('u1'), boxes: [listed] })
    expect(await CVX.mutation(TH.vaults.ensureVault, { draft: TH.gatelessOf('u1', { vault_tok: 'vault-tok-late' }) })).to.deep.equal({ vaultProps: TH.vaultPropsOf('u1'), boxes: [listed] })
  })

  it("refuses a draft with a way in, which Convex's validators do not accept, writing nothing", async () => {
    const CVX = TH.componentTest()
    await expect(CVX.mutation(TH.vaults.ensureVault, { draft: TH.vaultPropsOf('u1') as never })).rejects.toThrow(/Validator error/)
    const { vaults } = await allRows(CVX)
    expect(vaults).to.have.lengthOf(0)
  })
})

describe("putVaultProps", () => {
  const ThisVaultAtOne = { vault_tok: 'vault-tok-u1', gate_epoch: 1 }
  const rewrapped = TH.vaultPropsOf('u1', { gate_epoch: 2, passphrase: TH.wayinOf('passphrase', { vault_key_wayin_wrapped: { cipher_iv_b64: 'iv-new', ciphertext_b64: 'ct-new' } }) })

  it("lands vault props that keep the vault_tok and move gate_epoch forward", async () => {
    const CVX = await withVaultProps()
    const answer = await CVX.mutation(TH.vaults.putVaultProps, { vaultProps: rewrapped, expected: ThisVaultAtOne })
    expect(answer, 'the vault props as stored, their vault_epoch moved up by one').to.deep.equal({ landed: true, vault_props_stored: { ...rewrapped, vault_epoch: 2 } })
    expect(await TH.propsIn(CVX, u1)).to.deep.equal({ ...rewrapped, vault_epoch: 2 })
  })

  it("answers a miss with the vault props standing, from the same transaction, or null where none stand, as PutVaultPropsAnswer's second example shows", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.putVaultProps, { vaultProps: rewrapped, expected: ThisVaultAtOne })
    const late = TH.vaultPropsOf('u1', { gate_epoch: 2 })
    expect(await CVX.mutation(TH.vaults.putVaultProps, { vaultProps: late, expected: ThisVaultAtOne })).to.deep.equal({ landed: false, vault_props_stored: { ...rewrapped, vault_epoch: 2 } })
    const empty = TH.componentTest()
    expect(await empty.mutation(TH.vaults.putVaultProps, { vaultProps: late, expected: ThisVaultAtOne })).to.deep.equal({ landed: false, vault_props_stored: null })
  })

  // The core never sends either -- its VaultDB refuses the first, and its vault moves the epoch on
  // with every update -- so each is a client of another version's, or of none.
  const UnmovedCases = [
    [{ ...rewrapped, vault_tok: 'vault-tok-other' }, 'refuses vault props naming another vault than the one they replace'],
    [{ ...rewrapped, gate_epoch: 1 },               'refuses vault props that keep the standing gate_epoch'],
  ] as const

  for (const [vaultProps, blurb] of UnmovedCases) {
    it(`${blurb}, writing nothing`, async () => {
      const CVX = await withVaultProps()
      expect(await CVX.mutation(TH.vaults.putVaultProps, { vaultProps, expected: ThisVaultAtOne })).to.deep.equal({ landed: false, vault_props_stored: TH.vaultPropsOf('u1') })
      expect(await TH.propsIn(CVX, u1)).to.deep.equal(TH.vaultPropsOf('u1'))
    })
  }
})

describe("getBox and putBox", () => {
  it("has no box until one is written, then reads it back exactly, without its scope columns, answering as PutBoxAnswer's first example shows", async () => {
    const CVX = await withVaultProps()
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.deep.equal({ landed: true, box_stored: TH.boxOf('anthropic_api_key', 'a1') })
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("resolves a write whose box expectation failed as stale_write, with the box standing as a read returns it, writing nothing, as PutBoxAnswer's second example shows", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a2'), expected: TH.noBoxYet })).to.deep.equal({ landed: false, refusalkind: 'stale_write', box_stored: TH.boxOf('anthropic_api_key', 'a1') })
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('openai_api_key', 'o1'), expected: { ...TH.noBoxYet, revision_tok: 'rev-gone' } })).to.deep.equal({ landed: false, refusalkind: 'stale_write', box_stored: null })
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("resolves a write whose vault props are not the ones expected as vault_mismatch, carrying nothing of them, writing nothing, as PutBoxAnswer's third example shows", async () => {
    const CVX = await withVaultProps()
    const answer = await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: { ...TH.noBoxYet, vault_tok: 'vault-tok-gone' } })
    expect(answer).to.deep.equal({ landed: false, refusalkind: 'vault_mismatch' })
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
  })

  it("stores a box's sidecar as the JSON value it was handed, and reads it back so", async () => {
    const CVX = await withVaultProps()
    const withSidecar = TH.boxOf('anthropic_api_key', 'a1', { sidecar: { note: 'caf\u{E9} "quoted"', tags: [null] } })
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: withSidecar, expected: TH.noBoxYet })
    const { boxes } = await allRows(CVX)
    const [row] = boxes
    expect(row?.sidecar).to.deep.equal(withSidecar.sidecar)
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(withSidecar)
  })
})

describe("delBox", () => {
  it("resolves what it removed -- the revision named, another, or none -- and null, removing nothing, in another vault", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet })
    expect(await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: { vault_tok: 'vault-tok-gone', revision_tok: 'rev-a1' } })).to.be.null
    expect(await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.deleting('rev-a1') })).to.deep.equal({ outcome: 'deleted' })
    expect(await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'openai_api_key', expected: TH.deleting(null) })).to.deep.equal({ outcome: 'deleted_other' })
    expect(await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'openai_api_key', expected: TH.deleting('rev-o1') })).to.deep.equal({ outcome: 'absent' })
    const { boxes } = await allRows(CVX)
    expect(boxes).to.have.lengthOf(0)
  })

  it("resolves deleted for a box holding an empty revision, which the client lists with none, when it names none", async () => {
    const CVX = await withVaultProps()
    await CVX.run(async (ctx) => { await ctx.db.insert('safebyok_boxes', { ...u1, ...TH.boxOf('anthropic_api_key', 'a1'), revision_tok: '' }) })
    expect(await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.deleting(null) })).to.deep.equal({ outcome: 'deleted' })
    const { boxes } = await allRows(CVX)
    expect(boxes).to.have.lengthOf(0)
  })
})

describe("listBoxSummaries", () => {
  it("lists the vault's boxes in boxlabel order, without ciphered fields, keeping format", async () => {
    const CVX = await withVaultProps()
    for (const boxlabel of ['openai_api_key', 'anthropic_api_key']) {
      await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf(boxlabel, boxlabel), expected: TH.noBoxYet })
    }
    const listed = await TH.boxesIn(CVX, u1)
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    const { box_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...shell } = TH.boxOf('anthropic_api_key', 'anthropic_api_key')
    expect(listed[0]).to.deep.equal(shell)
  })
})

describe("delVault and the tombstone", () => {
  it("moves the vault row to a tombstone row, boxes and all, answering the tombstone, and replaces it with the new life, the counter carried on", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    const tombstone = await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: TH.thisVault })
    expect(tombstone).to.deep.equal({ format: 'safebyok-tombstone-v1', ...u1, vault_epoch: 2 })
    const left = await CVX.run(async (ctx) => ({
      vaults:     await ctx.db.query('safebyok_vaults').collect(),
      boxes:      await ctx.db.query('safebyok_boxes').collect(),
      tombstones: await ctx.db.query('safebyok_vault_tombstones').collect(),
    }))
    expect([left.vaults, left.boxes, left.tombstones.map(({ _id, _creationTime, ...row }) => row)]).to.deep.equal([[], [], [tombstone]])
    expect(await CVX.query(TH.vaults.getVault, { scope: u1 })).to.be.null
    const reborn = await CVX.mutation(TH.vaults.ensureVault, { draft: TH.gatelessOf('u1', { vault_tok: 'vault-tok-reborn' }) })
    expect(reborn.vaultProps).to.deep.equal(TH.gatelessOf('u1', { vault_tok: 'vault-tok-reborn', vault_epoch: 2 }))
    expect(await CVX.run((ctx) => ctx.db.query('safebyok_vault_tombstones').collect())).to.deep.equal([])
  })

  it("answers null, removing nothing, for a gate_epoch since changed, a vault made anew, a tombstone, and none, and expects the vault_tok alone for a null gate_epoch", async () => {
    const CVX = await withVaultProps()
    expect(await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: { vault_tok: 'vault-tok-u1', gate_epoch: 2 } })).to.be.null
    expect(await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: { vault_tok: 'vault-tok-gone', gate_epoch: 1 } })).to.be.null
    expect(await TH.propsIn(CVX, u1)).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: { vault_tok: 'vault-tok-u1', gate_epoch: null } })).to.deep.include({ vault_epoch: 2 })
    expect(await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: { vault_tok: 'vault-tok-u1', gate_epoch: null } }), 'a tombstone meets nothing').to.be.null
  })
})

describe("watchVault", () => {
  it("signs an empty scope with nulls and no boxes", async () => {
    const CVX = TH.componentTest()
    expect(await CVX.query(TH.vaults.watchVault, { scope: u1 })).to.deep.equal({ vault_tok: null, gate_epoch: null, boxes: [] })
  })

  it("signs the vault with its vault props' token and epoch and each box's revision, in boxlabel order", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    expect(await CVX.query(TH.vaults.watchVault, { scope: u1 })).to.deep.equal({
      vault_tok:  'vault-tok-u1',
      gate_epoch: 1,
      boxes:      [['anthropic_api_key', 'rev-a1'], ['openai_api_key', 'rev-o1']],
    })
  })

  it("changes with every write that lands in the vault, and not with a write elsewhere", async () => {
    const CVX = await withVaultProps()
    await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u2'))
    const signatures = [await CVX.query(TH.vaults.watchVault, { scope: u1 })]
    const sign = async () => { signatures.push(await CVX.query(TH.vaults.watchVault, { scope: u1 })) }

    await CVX.mutation(TH.vaults.putBox, { scope: TH.scopeOf('u2'), box: TH.boxOf('anthropic_api_key', 'theirs'), expected: { vault_tok: 'vault-tok-u2', revision_tok: null } })
    await sign()
    expect(signatures[1]).to.deep.equal(signatures[0])

    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await sign()
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a2'), expected: { vault_tok: 'vault-tok-u1', revision_tok: 'rev-a1' } })
    await sign()
    await CVX.mutation(TH.vaults.putVaultProps, { vaultProps: TH.vaultPropsOf('u1', { gate_epoch: 2 }), expected: { vault_tok: 'vault-tok-u1', gate_epoch: 1 } })
    await sign()
    await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.deleting('rev-a2') })
    await sign()
    await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: { vault_tok: 'vault-tok-u1', gate_epoch: 2 } })
    await sign()
    const distinct = new Set(signatures.slice(1).map((signature) => JSON.stringify(signature)))
    expect(distinct.size).to.eq(6)
  })
})

describe("a real vault's records", () => {
  it("round-trip exactly, and still open to the passphrase that sealed them", async () => {
    const real = await TH.realRecords('u1')
    const CVX = TH.componentTest()
    expect(await TH.ensureGatedIn(CVX, real.vaultProps as GatedVaultProps)).to.deep.equal(real.vaultProps)
    for (const { box } of real.boxes) {
      expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box, expected: { vault_tok: real.vaultProps.vault_tok, revision_tok: null } })).to.deep.equal({ landed: true, box_stored: box })
    }

    // Read back from Convex, and placed where the core keeps them, they open as before.
    const reread = memoryStore()
    reread.write(real.vaultPropsCkey, JSON.stringify(await TH.propsIn(CVX, u1)))
    for (const { ckey, box } of real.boxes) {
      const stored = await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: box.boxlabel })
      expect(stored).to.deep.equal(box)
      reread.write(ckey, JSON.stringify(stored))
    }
    const vault = await TH.openOver(reread)
    await vault.unlock(TH.RealPassphrase)
    for (const [boxlabel, { whisper }] of Object.entries(TH.RealWhispers)) {
      expect(await vault.getWhisper(boxlabel)).to.deep.equal(whisper)
    }
    vault.close()
  })

  it("list what the core reads as the summaries it lists", async () => {
    const real = await TH.realRecords('u1')
    const CVX = TH.componentTest()
    await TH.ensureGatedIn(CVX, real.vaultProps as GatedVaultProps)
    for (const { box } of real.boxes) {
      await CVX.mutation(TH.vaults.putBox, { scope: u1, box, expected: { vault_tok: real.vaultProps.vault_tok, revision_tok: null } })
    }
    const vault = await TH.openOver(memoryStoreHolding(real))
    const listed = await TH.boxesIn(CVX, u1)
    // The core's summary drops `format` and the codec, and names the vault props it was listed
    // beside; the listing holds the record's fields as stored.
    const summaries = listed.map(({ format: _format, whisper_codec: _codec, whisper_schema_version: _version, ...shell }) => (
      BoxSummary.parse({ ...shell, vault_tok: real.vaultProps.vault_tok })
    ))
    expect(summaries).to.deep.equal(vault.getSnapshot().boxes)
    vault.close()
  })
})

const memoryStoreHolding = (real: Awaited<ReturnType<typeof TH.realRecords>>) => {
  const store = memoryStore()
  store.write(real.vaultPropsCkey, JSON.stringify(real.vaultProps))
  for (const { ckey, box } of real.boxes) { store.write(ckey, JSON.stringify(box)) }
  return store
}

// --------------------------------------------------------------------------- the vault's limits

/** The tally the component keeps for `scope`'s vault, or null when it keeps none. */
const keptTally = (CVX: ReturnType<typeof TH.componentTest>, scope = u1) => CVX.run(async (ctx) => {
  const vaultProps = await ctx.db.query('safebyok_vaults')
    .withIndex('by_scope', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
    .unique()
  if (vaultProps === null) { return null }
  const kept = await ctx.db.query('safebyok_vault_tallies').withIndex('by_vault_row', (idx) => idx.eq('vault_row_id', vaultProps._id)).unique()
  return kept && { box_count: kept.box_count, box_bytes: kept.box_bytes }
})

/** What `scope`'s vault really holds: its box rows, counted, and weighed as Convex reads them. */
const weighedTally = (CVX: ReturnType<typeof TH.componentTest>, scope = u1) => CVX.run(async (ctx) => {
  const rows = await ctx.db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
    .collect()
  return { box_count: rows.length, box_bytes: rows.reduce((sum, row) => sum + getDocumentSize(row), 0) }
})

/** Boxes stored straight into `u1`'s vault, as a component that kept no tallies left them. */
const writeUntallied = (CVX: ReturnType<typeof TH.componentTest>, boxes: ReturnType<typeof TH.boxOf>[]) => CVX.run(async (ctx) => {
  await Promise.all(boxes.map((box) => ctx.db.insert('safebyok_boxes', { ...u1, ...box })))
})

/** What `u1`'s vault answers a write of `box` over `expected`. */
const answeredWrite = (CVX: ReturnType<typeof TH.componentTest>, box: ReturnType<typeof TH.boxOf>, expected: { vault_tok: string, revision_tok: string | null }) => (
  CVX.mutation(TH.vaults.putBox, { scope: u1, box, expected })
)

/** What a write the vault has no room for answers, but for the capacity it carries. */
const VaultFull = { landed: false, refusalkind: 'vault_full' }

/** The expectation a replacement of the box tagged `tag` carries. */
const over = (tag: string) => ({ vault_tok: 'vault-tok-u1', revision_tok: `rev-${tag}` })

describe("a vault's tally", () => {
  it("stays true across new boxes, replacements and deletes", async () => {
    const CVX = await withVaultProps()
    const steps = [
      () => CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet }),
      () => CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.heavyBox('anthropic_api_key', 5000, 'a2'), expected: over('a1') }),
      () => CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet }),
      () => CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a3'), expected: over('a2') }),
      () => CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.deleting('rev-a3') }),
      () => CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'never_stored', expected: TH.deleting(null) }),
    ]
    const counts = []
    for (const step of steps) {
      await step()
      const kept = await keptTally(CVX)
      expect(kept).to.deep.equal(await weighedTally(CVX))
      counts.push(kept?.box_count)
    }
    expect(counts).to.deep.equal([1, 1, 2, 2, 1, 1])
  })

  it("stays true across writes and deletes running at once", async () => {
    const CVX = await withVaultProps()
    const boxlabels = Array.from({ length: 12 }, (_, ii) => `box_${String(ii)}`)
    await Promise.all(boxlabels.map((boxlabel) => CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf(boxlabel, boxlabel), expected: TH.noBoxYet })))
    await Promise.all(boxlabels.slice(0, 5).map((boxlabel) => CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel, expected: TH.deleting(`rev-${boxlabel}`) })))
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('box_count', 7)
  })

  it("goes with its vault when the vault is deleted, and a vault made anew keeps one of its own", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: TH.thisVault })
    expect(await CVX.run((ctx) => ctx.db.query('safebyok_vault_tallies').collect())).to.deep.equal([])
    //
    await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u1', { vault_tok: 'vault-tok-anew' }))
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('openai_api_key', 'o1'), expected: { vault_tok: 'vault-tok-anew', revision_tok: null } })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('box_count', 1)
  })

  it("is kept apart for each vault", async () => {
    const CVX = await withVaultProps()
    await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u2'))
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'mine'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('openai_api_key', 'mine'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.putBox, { scope: TH.scopeOf('u2'), box: TH.boxOf('anthropic_api_key', 'theirs'), expected: { vault_tok: 'vault-tok-u2', revision_tok: null } })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX, TH.scopeOf('u2'))).to.deep.equal(await weighedTally(CVX, TH.scopeOf('u2')))
    expect(await keptTally(CVX, TH.scopeOf('u2'))).to.have.property('box_count', 1)
  })

  it("is counted, for a vault written before tallies were kept, at its next box write, the vault reading as ever until then", async () => {
    const CVX = await withVaultProps()
    await writeUntallied(CVX, [TH.boxOf('anthropic_api_key', 'a1'), TH.boxOf('openai_api_key', 'o1')])
    expect(await keptTally(CVX)).to.be.null
    const listed = await TH.boxesIn(CVX, u1)
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
    //
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a2'), expected: over('a1') })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('box_count', 2)
  })

  it("is not counted by a delete, which never reads the whole vault", async () => {
    const CVX = await withVaultProps()
    await writeUntallied(CVX, [TH.boxOf('anthropic_api_key', 'a1'), TH.boxOf('openai_api_key', 'o1')])
    await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.deleting('rev-a1') })
    expect(await keptTally(CVX)).to.be.null
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('github_token', 'g1'), expected: TH.noBoxYet })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('box_count', 2)
  })
})

/** A CVX whose `u1` vault holds eight boxes of 900,000 bytes: a little under its limit. */
const nearlyFull = async () => {
  const CVX = await withVaultProps()
  for (let ii = 0; ii < 8; ii++) {
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.heavyBox(`heavy_${String(ii)}`, 900_000), expected: TH.noBoxYet })
  }
  const { box_bytes: boxBytes } = await weighedTally(CVX)
  return { CVX, room: MaxVaultBoxBytes - boxBytes }
}

describe("getCapacity", () => {
  it("answers nothing used for a scope that holds no vault, against the component's limits", async () => {
    const CVX = TH.componentTest()
    expect(await CVX.query(TH.vaults.getCapacity, { scope: u1 })).to.deep.equal({ boxes: { used: 0, max: MaxVaultBoxes }, bytes: { used: 0, max: MaxVaultBoxBytes } })
  })

  it("answers the vault's tally, kept in step with its writes and deletes", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet })
    expect(await CVX.query(TH.vaults.getCapacity, { scope: u1 })).to.deep.equal(capacityOf(await weighedTally(CVX)))
  })

  it("counts afresh a vault with no tally yet, and answers one past a limit, uncounted, as full", async () => {
    const CVX = TH.componentTest(true)
    await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u1'))
    await writeUntallied(CVX, [TH.boxOf('anthropic_api_key', 'a1')])
    expect(await CVX.query(TH.vaults.getCapacity, { scope: u1 })).to.deep.equal(capacityOf(await weighedTally(CVX)))
    await writeUntallied(CVX, Array.from({ length: 9 }, (_, ii) => TH.heavyBox(`heavy_${String(ii)}`, 900_000)))
    expect(await CVX.query(TH.vaults.getCapacity, { scope: u1 })).to.deep.equal(capacityOf(null))
  })
})

describe("a vault's weight limit", () => {
  it("refuses a new box that would take the vault past it, writing nothing, and says how full the vault is, as its tally stood, as PutBoxAnswer's fourth example shows", async () => {
    const { CVX, room } = await nearlyFull()
    const ante = { rows: await allRows(CVX), tally: await keptTally(CVX) }
    const answer = await answeredWrite(CVX, TH.heavyBox('one_too_many', room), TH.noBoxYet)
    expect(answer).to.deep.equal({ ...VaultFull, capacity: capacityOf(ante.tally) })
    expect(answer).to.have.nested.property('capacity.bytes.max', MaxVaultBoxBytes)
    expect(JSON.stringify(answer)).to.not.include('one_too_many')
    expect({ rows: await allRows(CVX), tally: await keptTally(CVX) }).to.deep.equal(ante)
  })

  it("lets in a new box that fits", async () => {
    const { CVX } = await nearlyFull()
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.deep.equal({ landed: true, box_stored: TH.boxOf('anthropic_api_key', 'a1') })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
  })

  it("lets a replacement grow the vault up to it exactly, then refuses one byte more, and lets a lighter one in", async () => {
    const { CVX, room } = await nearlyFull()
    const grown = TH.heavyBox('heavy_0', 900_000 + room, 'grown_0')
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: grown, expected: over('heavy_0') })).to.deep.equal({ landed: true, box_stored: grown })
    expect(await keptTally(CVX)).to.deep.equal({ box_count: 8, box_bytes: MaxVaultBoxBytes })
    //
    const overgrown = TH.heavyBox('heavy_1', 900_001, 'grown_1')
    expect(await answeredWrite(CVX, overgrown, over('heavy_1'))).to.deep.include(VaultFull)
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.heavyBox('heavy_1', 800_000, 'shrunk1'), expected: over('heavy_1') })).to.deep.equal({ landed: true, box_stored: TH.heavyBox('heavy_1', 800_000, 'shrunk1') })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
  })

  it("refuses a vault past it nothing that shrinks it, and lets it be deleted a box at a time", async () => {
    const CVX = TH.componentTest(true)
    await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u1'))
    // Nine of 900,000 bytes, written before tallies were kept: past the limit, still readable whole.
    await writeUntallied(CVX, Array.from({ length: 9 }, (_, ii) => TH.heavyBox(`heavy_${String(ii)}`, 900_000)))
    expect(await answeredWrite(CVX, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet)).to.deep.include(VaultFull)
    const overgrown = TH.heavyBox('heavy_0', 900_001, 'grown_0')
    expect(await answeredWrite(CVX, overgrown, over('heavy_0'))).to.deep.include(VaultFull)
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.heavyBox('heavy_0', 800_000, 'shrunk0'), expected: over('heavy_0') })).to.deep.equal({ landed: true, box_stored: TH.heavyBox('heavy_0', 800_000, 'shrunk0') })
    expect(await keptTally(CVX)).to.be.null
    //
    expect(await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel: 'heavy_1', expected: TH.deleting('rev-heavy_1') })).to.deep.equal({ outcome: 'deleted' })
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.deep.equal({ landed: true, box_stored: TH.boxOf('anthropic_api_key', 'a1') })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
  })

  it("keeps a vault already too large to read whole deletable, a box at a time, its writes refused as full", async () => {
    const CVX = TH.componentTest(true)
    await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u1'))
    // Twenty of 900,000 bytes, more than one transaction may read: four writes, each within its limits.
    for (let batch = 0; batch < 4; batch++) {
      await writeUntallied(CVX, Array.from({ length: 5 }, (_, ii) => TH.heavyBox(`heavy_${String((batch * 5) + ii)}`, 900_000)))
    }
    await expect(CVX.query(TH.vaults.getVault, { scope: u1 })).rejects.toThrow(/Read too much data/)
    expect(await answeredWrite(CVX, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet)).to.deep.include(VaultFull)
    for (let ii = 0; ii < 20; ii++) {
      const boxlabel = `heavy_${String(ii)}`
      expect(await CVX.mutation(TH.vaults.delBox, { scope: u1, boxlabel, expected: TH.deleting(`rev-${boxlabel}`) })).to.deep.equal({ outcome: 'deleted' })
    }
    expect(await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: TH.thisVault })).to.deep.include({ format: 'safebyok-tombstone-v1', vault_epoch: 2 })
    const { vaults, boxes } = await allRows(CVX)
    expect({ vaults, boxes }).to.deep.equal({ vaults: [], boxes: [] })
  })
})

// A Convex transaction may read 16 MiB and 32,000 documents, and write 16,000 documents. Listing
// and signing read the vault once, but deleting it reads every row twice (each delete reads its row
// again). So the component holds every vault to MaxVaultBoxes boxes and
// MaxVaultBoxBytes bytes of them, whatever its client asks, and convexVaultDB declares half the
// read budget, 8 MiB, as its maxVaultBytes. Vault.make admits a maxBoxes only while that many
// boxes, each counted at twice maxWhisperBytes plus 1 KiB for its other fields, fit in the
// 8 MiB: at most 102 of the largest default whisper (40444 bytes of JSON, about 54 KB stored),
// and at most 1638 of 2 KiB whispers. The tests below fill a vault to each of those, and to each
// of the component's own limits, with the longest labels, and delete it.

/** Vault props as heavy as a Convex document may be, near enough: the most a delete reads beside the boxes. */
const wholeDocumentVaultProps = () => {
  const vaultProps = TH.vaultPropsOf('u1')
  const padding = 'a'.repeat(1_048_576 - getDocumentSize(vaultProps) - 64)
  const passphrase = TH.wayinOf('passphrase', { vault_key_wayin_wrapped: TH.fakeCiphered('vault-u1') })
  return TH.vaultPropsOf('u1', { passphrase: { ...passphrase, salt_b64: passphrase.salt_b64 + padding } })
}

/**
 * A CVX whose `u1` vault holds `count` boxes, each a whisper of `whisperBytes` and the
 * heaviest visible fields -- or as many as the component lets in before it refuses one as full.
 */
const fillVault = async (count: number, whisperBytes: number, vaultProps = TH.vaultPropsOf('u1')) => {
  const CVX = TH.componentTest(true)
  await TH.ensureGatedIn(CVX, vaultProps)
  const whisperCiphered = { cipher_iv_b64: 'i'.repeat(16), ciphertext_b64: 'c'.repeat(Math.ceil((whisperBytes + 16) * 4 / 3)) }
  const boxKeyWrapped = { cipher_iv_b64: 'i'.repeat(16), ciphertext_b64: 'k'.repeat(64) }
  for (let ii = 0; ii < count; ii++) {
    const boxlabel = `b${String(ii).padStart(39, '0')}`
    const box = TH.boxOf(boxlabel, crypto.randomUUID(), { whisper_ciphered: whisperCiphered, box_key_wrapped: boxKeyWrapped })
    if (! await landsOrIsFull(CVX, box)) { return { CVX, filledCount: ii } }
  }
  return { CVX, filledCount: count }
}

/** True when `box` lands in `u1`'s vault as a new box, false when the vault refuses it as full. */
const landsOrIsFull = async (CVX: ReturnType<typeof TH.componentTest>, box: ReturnType<typeof TH.boxOf>) => {
  const answer = await CVX.mutation(TH.vaults.putBox, { scope: u1, box, expected: TH.noBoxYet })
  return answer.landed
}

/** What listing, watching and deleting the `u1` vault find: each a whole transaction over it. */
const listWatchDel = async (CVX: ReturnType<typeof TH.componentTest>) => {
  const listed = await TH.boxesIn(CVX, u1)
  const { boxes } = await CVX.query(TH.vaults.watchVault, { scope: u1 })
  const deleted = await CVX.mutation(TH.vaults.delVault, { scope: u1, expected: TH.thisVault }) !== null
  const { boxes: leftBoxes } = await allRows(CVX)
  return { listedCount: listed.length, watchedCount: boxes.length, deleted, leftCount: leftBoxes.length }
}

describe("a large vault, within Convex's per-transaction limits", () => {
  it("lists, signs and deletes the 102 of the largest boxes the core admits", async () => {
    const { CVX, filledCount } = await fillVault(102, 40_444)
    expect(filledCount).to.eq(102)
    expect(await listWatchDel(CVX)).to.deep.equal({ listedCount: 102, watchedCount: 102, deleted: true, leftCount: 0 })
  })

  it("lists, signs and deletes the 1638 boxes of 2 KiB whispers the core admits", async () => {
    const { CVX, filledCount } = await fillVault(1638, 2048)
    expect(filledCount).to.eq(1638)
    expect(await listWatchDel(CVX)).to.deep.equal({ listedCount: 1638, watchedCount: 1638, deleted: true, leftCount: 0 })
  }, 120_000) // landing 1638 boxes, a mutation each, is the work, past vitest's 30 s default under CI's coverage

  it("refuses the largest boxes past its weight limit, and deletes the vault so filled beside vault props of a whole document", async () => {
    const { CVX, filledCount } = await fillVault(200, 40_444, wholeDocumentVaultProps())
    expect(filledCount).to.be.within(102, 199)
    const kept = await keptTally(CVX)
    expect(kept).to.deep.equal(await weighedTally(CVX))
    expect(kept?.box_bytes).to.be.within(MaxVaultBoxBytes - 60_000, MaxVaultBoxBytes)
    expect(await listWatchDel(CVX)).to.deep.equal({ listedCount: filledCount, watchedCount: filledCount, deleted: true, leftCount: 0 })
  })

  it("refuses a box past its count limit, never a replacement, and deletes the vault so filled", async () => {
    const CVX = TH.componentTest(true)
    await TH.ensureGatedIn(CVX, TH.vaultPropsOf('u1'))
    await writeUntallied(CVX, Array.from({ length: MaxVaultBoxes }, (_, ii) => TH.boxOf(`b${String(ii).padStart(4, '0')}`, String(ii))))
    expect(await answeredWrite(CVX, TH.boxOf('one_too_many', 'x'), TH.noBoxYet)).to.deep.include(VaultFull)
    expect(await CVX.mutation(TH.vaults.putBox, { scope: u1, box: TH.boxOf('b0000', 'replaced'), expected: over('0') })).to.deep.equal({ landed: true, box_stored: TH.boxOf('b0000', 'replaced') })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('box_count', MaxVaultBoxes)
    expect(await listWatchDel(CVX)).to.deep.equal({ listedCount: MaxVaultBoxes, watchedCount: MaxVaultBoxes, deleted: true, leftCount: 0 })
  }, 30_000)
})
