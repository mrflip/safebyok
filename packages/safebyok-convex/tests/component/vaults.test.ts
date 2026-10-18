import { describe, expect, it } from 'vitest'
import { ConvexError, getDocumentSize } from 'convex/values'
import { LockboxSummary, memoryStore } from 'safebyok'
import * as TH from '../test-helpers'
import { MaxVaultLockboxBytes, MaxVaultLockboxes } from '../../src/component/tallies'

const u1 = TH.scopeOf('u1')

/** A fresh CVX whose `u1` scope holds vault props, as every lockbox write needs. */
const withVaultProps = async () => {
  const CVX = TH.componentTest()
  await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: TH.vaultPropsOf('u1') })
  return CVX
}

/** Every row of both tables, system fields and all: what is really stored. */
const allRows = (CVX: ReturnType<typeof TH.componentTest>) => CVX.run(async (ctx) => ({
  vaults:    await ctx.db.query('safebyok_vaults').collect(),
  lockboxes: await ctx.db.query('safebyok_lockboxes').collect(),
}))

// The verbs' contract -- lines 1.1 to 3.8 of VAULTDB.md -- is the battery's, run over this
// component through convexVaultDB and a fake deployment. What is left here is the component's
// own: what it strips, what its validators refuse, and the checks a client never lets reach it.

describe("getVaultProps and fetchOrCreateVaultProps", () => {
  it("has no vault props until some are created, then reads them back exactly, with no Convex fields", async () => {
    const CVX = TH.componentTest()
    expect(await CVX.query(TH.vaults.getVaultProps, { scope: u1 })).to.be.null
    expect(await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: TH.vaultPropsOf('u1') })).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(await CVX.query(TH.vaults.getVaultProps, { scope: u1 })).to.deep.equal(TH.vaultPropsOf('u1'))
  })

  it("refuses vault props Convex's validators do not accept, writing nothing", async () => {
    const CVX = TH.componentTest()
    const { format: _format, ...formatless } = TH.vaultPropsOf('u1')
    await expect(CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: formatless as never })).rejects.toThrow(/format/)
    const { vaults } = await allRows(CVX)
    expect(vaults).to.have.lengthOf(0)
  })
})

describe("updateVaultProps", () => {
  const ThisVaultAtOne = { vault_id: 'vault-id-u1', unlock_epoch: 1 }
  const rewrapped = TH.vaultPropsOf('u1', { unlock_epoch: 2, wayins: [TH.wayinOf('passphrase', { vault_key_wayin_wrapped: { cipher_iv_b64: 'iv-new', ciphertext_b64: 'ct-new' } })] })

  it("lands vault props that keep the vault_id and move unlock_epoch forward", async () => {
    const CVX = await withVaultProps()
    expect(await CVX.mutation(TH.vaults.updateVaultProps, { vaultProps: rewrapped, expected: ThisVaultAtOne })).to.be.true
    expect(await CVX.query(TH.vaults.getVaultProps, { scope: u1 })).to.deep.equal(rewrapped)
  })

  // The core never sends either -- its VaultDB refuses the first, and its vault moves the epoch on
  // with every update -- so each is a client of another version's, or of none.
  const UnmovedCases = [
    [{ ...rewrapped, vault_id: 'vault-id-other' }, 'refuses vault props naming another vault than the one they replace'],
    [{ ...rewrapped, unlock_epoch: 1 },             'refuses vault props that keep the standing unlock_epoch'],
  ] as const

  for (const [vaultProps, blurb] of UnmovedCases) {
    it(`${blurb}, writing nothing`, async () => {
      const CVX = await withVaultProps()
      expect(await CVX.mutation(TH.vaults.updateVaultProps, { vaultProps, expected: ThisVaultAtOne })).to.be.false
      expect(await CVX.query(TH.vaults.getVaultProps, { scope: u1 })).to.deep.equal(TH.vaultPropsOf('u1'))
    })
  }
})

describe("getBox and updateBox", () => {
  it("has no box until one is written, then reads it back exactly, without its scope columns", async () => {
    const CVX = await withVaultProps()
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
    expect(await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.be.true
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("stores a lockbox's sidecar as the JSON text it was handed, and reads it back so", async () => {
    const CVX = await withVaultProps()
    const withSidecar = TH.boxOf('anthropic_api_key', 'a1', { sidecar_json: TH.sidecarJsonOf({ note: 'caf\u{E9} "quoted"', tags: [null] }) })
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: withSidecar, expected: TH.noBoxYet })
    const { lockboxes } = await allRows(CVX)
    const [row] = lockboxes
    expect(row).to.include({ sidecar_json: withSidecar.sidecar_json })
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(withSidecar)
  })
})

describe("listBoxSummaries", () => {
  it("lists the vault's boxes in boxlabel order, without ciphered fields, keeping format", async () => {
    const CVX = await withVaultProps()
    for (const boxlabel of ['openai_api_key', 'anthropic_api_key']) {
      await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf(boxlabel, boxlabel), expected: TH.noBoxYet })
    }
    const listed = await CVX.query(TH.vaults.listBoxSummaries, { scope: u1 })
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    const { lockbox_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...shell } = TH.boxOf('anthropic_api_key', 'anthropic_api_key')
    expect(listed[0]).to.deep.equal(shell)
  })
})

describe("watchVault", () => {
  it("signs an empty scope with nulls and no boxes", async () => {
    const CVX = TH.componentTest()
    expect(await CVX.query(TH.vaults.watchVault, { scope: u1 })).to.deep.equal({ vault_id: null, unlock_epoch: null, boxes: [] })
  })

  it("signs the vault with its vault props' ids and each box's revision, in boxlabel order", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    expect(await CVX.query(TH.vaults.watchVault, { scope: u1 })).to.deep.equal({
      vault_id:         'vault-id-u1',
      unlock_epoch: 1,
      boxes:            [['anthropic_api_key', 'rev-a1'], ['openai_api_key', 'rev-o1']],
    })
  })

  it("changes with every write that lands in the vault, and not with a write elsewhere", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: TH.vaultPropsOf('u2') })
    const signatures = [await CVX.query(TH.vaults.watchVault, { scope: u1 })]
    const sign = async () => { signatures.push(await CVX.query(TH.vaults.watchVault, { scope: u1 })) }

    await CVX.mutation(TH.vaults.updateBox, { scope: TH.scopeOf('u2'), lockbox: TH.boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_tok: null, vault_key_epoch: 1 } })
    await sign()
    expect(signatures[1]).to.deep.equal(signatures[0])

    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await sign()
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_tok: 'rev-a1', vault_key_epoch: 1 } })
    await sign()
    await CVX.mutation(TH.vaults.updateVaultProps, { vaultProps: TH.vaultPropsOf('u1', { unlock_epoch: 2 }), expected: { vault_id: 'vault-id-u1', unlock_epoch: 1 } })
    await sign()
    await CVX.mutation(TH.vaults.retireBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault })
    await sign()
    await CVX.mutation(TH.vaults.retireVault, { scope: u1, expected: TH.thisVault })
    await sign()
    const distinct = new Set(signatures.slice(1).map((signature) => JSON.stringify(signature)))
    expect(distinct.size).to.eq(6)
  })
})

describe("a real vault's records", () => {
  it("round-trip exactly, and still open to the passphrase that sealed them", async () => {
    const real = await TH.realRecords('u1')
    const CVX = TH.componentTest()
    expect(await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: real.vaultProps })).to.deep.equal(real.vaultProps)
    for (const { lockbox } of real.boxes) {
      expect(await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox, expected: { vault_id: real.vaultProps.vault_id, revision_tok: null, vault_key_epoch: 1 } })).to.be.true
    }

    // Read back from Convex, and placed where the core keeps them, they open as before.
    const reread = memoryStore()
    reread.write(real.vaultPropsCkey, JSON.stringify(await CVX.query(TH.vaults.getVaultProps, { scope: u1 })))
    for (const { ckey, lockbox } of real.boxes) {
      const stored = await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: lockbox.boxlabel })
      expect(stored).to.deep.equal(lockbox)
      reread.write(ckey, JSON.stringify(stored))
    }
    const vault = await TH.openOver(reread)
    await vault.unlock(TH.RealPassphrase)
    for (const [boxlabel, { whisper }] of Object.entries(TH.RealWhispers)) {
      expect(await vault.readBox(boxlabel)).to.deep.equal(whisper)
    }
    vault.close()
  })

  it("list what the core reads as the summaries it lists", async () => {
    const real = await TH.realRecords('u1')
    const CVX = TH.componentTest()
    await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: real.vaultProps })
    for (const { lockbox } of real.boxes) {
      await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox, expected: { vault_id: real.vaultProps.vault_id, revision_tok: null, vault_key_epoch: 1 } })
    }
    const vault = await TH.openOver(memoryStoreHolding(real))
    const listed = await CVX.query(TH.vaults.listBoxSummaries, { scope: u1 })
    // The core's summary drops `format` and the codec, and parses the sidecar's JSON; the
    // listing holds the record's fields as stored.
    const summaries = listed.map(({ format: _format, whisper_codec: _codec, whisper_schema_version: _version, sidecar_json: sidecarJson, ...shell }) => (
      LockboxSummary.parse({ ...shell, sidecar: JSON.parse(sidecarJson) as unknown })
    ))
    expect(summaries).to.deep.equal(vault.getSnapshot().boxes)
    vault.close()
  })
})

const memoryStoreHolding = (real: Awaited<ReturnType<typeof TH.realRecords>>) => {
  const store = memoryStore()
  store.write(real.vaultPropsCkey, JSON.stringify(real.vaultProps))
  for (const { ckey, lockbox } of real.boxes) { store.write(ckey, JSON.stringify(lockbox)) }
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
  return kept && { lockbox_count: kept.lockbox_count, lockbox_bytes: kept.lockbox_bytes }
})

/** What `scope`'s vault really holds: its lockbox rows, counted, and weighed as Convex reads them. */
const weighedTally = (CVX: ReturnType<typeof TH.componentTest>, scope = u1) => CVX.run(async (ctx) => {
  const rows = await ctx.db.query('safebyok_lockboxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
    .collect()
  return { lockbox_count: rows.length, lockbox_bytes: rows.reduce((sum, row) => sum + getDocumentSize(row), 0) }
})

/** Lockboxes stored straight into `u1`'s vault, as a component that kept no tallies left them. */
const writeUntallied = (CVX: ReturnType<typeof TH.componentTest>, lockboxes: ReturnType<typeof TH.boxOf>[]) => CVX.run(async (ctx) => {
  await Promise.all(lockboxes.map((lockbox) => ctx.db.insert('safebyok_lockboxes', { ...u1, ...lockbox })))
})

/** The refusal's data, when `u1`'s vault refuses `lockbox` with a ConvexError. */
const refusedWrite = (CVX: ReturnType<typeof TH.componentTest>, lockbox: ReturnType<typeof TH.boxOf>, expected: { vault_id: string, revision_tok: string | null, vault_key_epoch: number }) => (
  TH.convexRefusalOf(CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox, expected }))
)

const VaultFull = { kind: 'vault_full', message: 'This vault is full: remove a lockbox to make room, then try again.' }

/** The expectation a replacement of the box tagged `tag` carries. */
const over = (tag: string) => ({ vault_id: 'vault-id-u1', revision_tok: `rev-${tag}`, vault_key_epoch: 1 })

describe("a vault's tally", () => {
  it("stays true across new lockboxes, replacements and retires", async () => {
    const CVX = await withVaultProps()
    const steps = [
      () => CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet }),
      () => CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.heavyBox('anthropic_api_key', 5000, 'a2'), expected: over('a1') }),
      () => CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet }),
      () => CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a3'), expected: over('a2') }),
      () => CVX.mutation(TH.vaults.retireBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault }),
      () => CVX.mutation(TH.vaults.retireBox, { scope: u1, boxlabel: 'never_stored', expected: TH.thisVault }),
    ]
    const counts = []
    for (const step of steps) {
      await step()
      const kept = await keptTally(CVX)
      expect(kept).to.deep.equal(await weighedTally(CVX))
      counts.push(kept?.lockbox_count)
    }
    expect(counts).to.deep.equal([1, 1, 2, 2, 1, 1])
  })

  it("stays true across writes and retires running at once", async () => {
    const CVX = await withVaultProps()
    const boxlabels = Array.from({ length: 12 }, (_, ii) => `box_${String(ii)}`)
    await Promise.all(boxlabels.map((boxlabel) => CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf(boxlabel, boxlabel), expected: TH.noBoxYet })))
    await Promise.all(boxlabels.slice(0, 5).map((boxlabel) => CVX.mutation(TH.vaults.retireBox, { scope: u1, boxlabel, expected: TH.thisVault })))
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('lockbox_count', 7)
  })

  it("goes with its vault when the vault is retired, and a vault made anew keeps one of its own", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.retireVault, { scope: u1, expected: TH.thisVault })
    expect(await CVX.run((ctx) => ctx.db.query('safebyok_vault_tallies').collect())).to.deep.equal([])
    //
    await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: TH.vaultPropsOf('u1', { vault_id: 'vault-id-anew' }) })
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'o1'), expected: { vault_id: 'vault-id-anew', revision_tok: null, vault_key_epoch: 1 } })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('lockbox_count', 1)
  })

  it("is kept apart for each vault", async () => {
    const CVX = await withVaultProps()
    await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: TH.vaultPropsOf('u2') })
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'mine'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'mine'), expected: TH.noBoxYet })
    await CVX.mutation(TH.vaults.updateBox, { scope: TH.scopeOf('u2'), lockbox: TH.boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_tok: null, vault_key_epoch: 1 } })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX, TH.scopeOf('u2'))).to.deep.equal(await weighedTally(CVX, TH.scopeOf('u2')))
    expect(await keptTally(CVX, TH.scopeOf('u2'))).to.have.property('lockbox_count', 1)
  })

  it("is counted, for a vault written before tallies were kept, at its next lockbox write, the vault reading as ever until then", async () => {
    const CVX = await withVaultProps()
    await writeUntallied(CVX, [TH.boxOf('anthropic_api_key', 'a1'), TH.boxOf('openai_api_key', 'o1')])
    expect(await keptTally(CVX)).to.be.null
    const listed = await CVX.query(TH.vaults.listBoxSummaries, { scope: u1 })
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    expect(await CVX.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
    //
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a2'), expected: over('a1') })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('lockbox_count', 2)
  })

  it("is not counted by a retire, which never reads the whole vault", async () => {
    const CVX = await withVaultProps()
    await writeUntallied(CVX, [TH.boxOf('anthropic_api_key', 'a1'), TH.boxOf('openai_api_key', 'o1')])
    await CVX.mutation(TH.vaults.retireBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault })
    expect(await keptTally(CVX)).to.be.null
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('github_token', 'g1'), expected: TH.noBoxYet })
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('lockbox_count', 2)
  })
})

/** A CVX whose `u1` vault holds eight lockboxes of 900,000 bytes: a little under its limit. */
const nearlyFull = async () => {
  const CVX = await withVaultProps()
  for (let ii = 0; ii < 8; ii++) {
    await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.heavyBox(`heavy_${String(ii)}`, 900_000), expected: TH.noBoxYet })
  }
  const { lockbox_bytes: lockboxBytes } = await weighedTally(CVX)
  return { CVX, room: MaxVaultLockboxBytes - lockboxBytes }
}

describe("a vault's weight limit", () => {
  it("refuses a new lockbox that would take the vault past it, writing nothing, and says so calmly", async () => {
    const { CVX, room } = await nearlyFull()
    const ante = { rows: await allRows(CVX), tally: await keptTally(CVX) }
    const refusal = await refusedWrite(CVX, TH.heavyBox('one_too_many', room), TH.noBoxYet)
    expect(refusal).to.deep.equal(VaultFull)
    expect(JSON.stringify(refusal)).to.not.include('one_too_many')
    expect({ rows: await allRows(CVX), tally: await keptTally(CVX) }).to.deep.equal(ante)
  })

  it("lets in a new lockbox that fits", async () => {
    const { CVX } = await nearlyFull()
    expect(await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.be.true
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
  })

  it("lets a replacement grow the vault up to it exactly, then refuses one byte more, and lets a lighter one in", async () => {
    const { CVX, room } = await nearlyFull()
    const grown = TH.heavyBox('heavy_0', 900_000 + room, 'grown_0')
    expect(await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: grown, expected: over('heavy_0') })).to.be.true
    expect(await keptTally(CVX)).to.deep.equal({ lockbox_count: 8, lockbox_bytes: MaxVaultLockboxBytes })
    //
    const overgrown = TH.heavyBox('heavy_1', 900_001, 'grown_1')
    expect(await refusedWrite(CVX, overgrown, over('heavy_1'))).to.deep.equal(VaultFull)
    expect(await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.heavyBox('heavy_1', 800_000, 'shrunk1'), expected: over('heavy_1') })).to.be.true
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
  })

  it("refuses a vault past it nothing that shrinks it, and lets it be retired a lockbox at a time", async () => {
    const CVX = TH.componentTest(true)
    await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: TH.vaultPropsOf('u1') })
    // Nine of 900,000 bytes, written before tallies were kept: past the limit, still readable whole.
    await writeUntallied(CVX, Array.from({ length: 9 }, (_, ii) => TH.heavyBox(`heavy_${String(ii)}`, 900_000)))
    expect(await refusedWrite(CVX, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet)).to.deep.equal(VaultFull)
    const overgrown = TH.heavyBox('heavy_0', 900_001, 'grown_0')
    expect(await refusedWrite(CVX, overgrown, over('heavy_0'))).to.deep.equal(VaultFull)
    expect(await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.heavyBox('heavy_0', 800_000, 'shrunk0'), expected: over('heavy_0') })).to.be.true
    expect(await keptTally(CVX)).to.be.null
    //
    expect(await CVX.mutation(TH.vaults.retireBox, { scope: u1, boxlabel: 'heavy_1', expected: TH.thisVault })).to.be.true
    expect(await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.be.true
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
  })

  it("keeps a vault already too large to read whole retirable, a lockbox at a time, its writes refused as full", async () => {
    const CVX = TH.componentTest(true)
    await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: TH.vaultPropsOf('u1') })
    // Twenty of 900,000 bytes, more than one transaction may read: four writes, each within its limits.
    for (let batch = 0; batch < 4; batch++) {
      await writeUntallied(CVX, Array.from({ length: 5 }, (_, ii) => TH.heavyBox(`heavy_${String((batch * 5) + ii)}`, 900_000)))
    }
    await expect(CVX.query(TH.vaults.listBoxSummaries, { scope: u1 })).rejects.toThrow(/Read too much data/)
    expect(await refusedWrite(CVX, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet)).to.deep.equal(VaultFull)
    for (let ii = 0; ii < 20; ii++) {
      expect(await CVX.mutation(TH.vaults.retireBox, { scope: u1, boxlabel: `heavy_${String(ii)}`, expected: TH.thisVault })).to.be.true
    }
    expect(await CVX.mutation(TH.vaults.retireVault, { scope: u1, expected: TH.thisVault })).to.be.true
    const { vaults, lockboxes } = await allRows(CVX)
    expect({ vaults, lockboxes }).to.deep.equal({ vaults: [], lockboxes: [] })
  })
})

// A Convex transaction may read 16 MiB and 32,000 documents, and write 16,000 documents. Listing
// and signing read the vault once, but retiring it reads every row twice (each delete reads its row
// again). So the component holds every vault to MaxVaultLockboxes lockboxes and
// MaxVaultLockboxBytes bytes of them, whatever its client asks, and convexVaultDB declares half the
// read budget, 8 MiB, as its maxVaultBytes. Vault.make admits a maxLockboxes only while that many
// lockboxes, each counted at twice maxWhisperBytes plus 1 KiB for its other fields, fit in the
// 8 MiB: at most 102 of the largest default whisper (40444 bytes of JSON, about 54 KB stored),
// and at most 1638 of 2 KiB whispers. The tests below fill a vault to each of those, and to each
// of the component's own limits, with the longest labels, and retire it.

/** Vault props as heavy as a Convex document may be, near enough: the most a retire reads beside the lockboxes. */
const wholeDocumentVaultProps = () => {
  const vaultProps = TH.vaultPropsOf('u1')
  const padding = 'a'.repeat(1_048_576 - getDocumentSize(vaultProps) - 64)
  const wayin = TH.wayinOf('passphrase', { vault_key_wayin_wrapped: TH.fakeCiphered('vault-u1') })
  return TH.vaultPropsOf('u1', { wayins: [{ ...wayin, salt_b64: wayin.salt_b64 + padding }] })
}

/**
 * A CVX whose `u1` vault holds `count` lockboxes, each a whisper of `whisperBytes` and the
 * heaviest public shell -- or as many as the component lets in before it refuses one as full.
 */
const fillVault = async (count: number, whisperBytes: number, vaultProps = TH.vaultPropsOf('u1')) => {
  const CVX = TH.componentTest(true)
  await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps })
  const whisperCiphered = { cipher_iv_b64: 'i'.repeat(16), ciphertext_b64: 'c'.repeat(Math.ceil((whisperBytes + 16) * 4 / 3)) }
  const lockboxKeyWrapped = { cipher_iv_b64: 'i'.repeat(16), ciphertext_b64: 'k'.repeat(64) }
  for (let ii = 0; ii < count; ii++) {
    const boxlabel = `b${String(ii).padStart(39, '0')}`
    const lockbox = TH.boxOf(boxlabel, crypto.randomUUID(), { whisper_ciphered: whisperCiphered, lockbox_key_wrapped: lockboxKeyWrapped })
    if (! await landsOrIsFull(CVX, lockbox)) { return { CVX, filledCount: ii } }
  }
  return { CVX, filledCount: count }
}

/** True when `lockbox` lands in `u1`'s vault as a new box, false when the vault refuses it as full. */
const landsOrIsFull = async (CVX: ReturnType<typeof TH.componentTest>, lockbox: ReturnType<typeof TH.boxOf>) => {
  try {
    return await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox, expected: TH.noBoxYet })
  } catch (err) {
    if (err instanceof ConvexError && (err.data as { kind?: unknown }).kind === 'vault_full') { return false }
    throw err
  }
}

/** What listing, watching and retiring the `u1` vault find: each a whole transaction over it. */
const listWatchRetire = async (CVX: ReturnType<typeof TH.componentTest>) => {
  const listed = await CVX.query(TH.vaults.listBoxSummaries, { scope: u1 })
  const { boxes } = await CVX.query(TH.vaults.watchVault, { scope: u1 })
  const retired = await CVX.mutation(TH.vaults.retireVault, { scope: u1, expected: TH.thisVault })
  const { lockboxes } = await allRows(CVX)
  return { listedCount: listed.length, watchedCount: boxes.length, retired, leftCount: lockboxes.length }
}

describe("a large vault, within Convex's per-transaction limits", () => {
  it("lists, signs and retires the 102 of the largest lockboxes the core admits", async () => {
    const { CVX, filledCount } = await fillVault(102, 40_444)
    expect(filledCount).to.eq(102)
    expect(await listWatchRetire(CVX)).to.deep.equal({ listedCount: 102, watchedCount: 102, retired: true, leftCount: 0 })
  })

  it("lists, signs and retires the 1638 lockboxes of 2 KiB whispers the core admits", async () => {
    const { CVX, filledCount } = await fillVault(1638, 2048)
    expect(filledCount).to.eq(1638)
    expect(await listWatchRetire(CVX)).to.deep.equal({ listedCount: 1638, watchedCount: 1638, retired: true, leftCount: 0 })
  }, 120_000) // landing 1638 lockboxes, a mutation each, is the work, past vitest's 30 s default under CI's coverage

  it("refuses the largest lockboxes past its weight limit, and retires the vault so filled beside vault props of a whole document", async () => {
    const { CVX, filledCount } = await fillVault(200, 40_444, wholeDocumentVaultProps())
    expect(filledCount).to.be.within(102, 199)
    const kept = await keptTally(CVX)
    expect(kept).to.deep.equal(await weighedTally(CVX))
    expect(kept?.lockbox_bytes).to.be.within(MaxVaultLockboxBytes - 60_000, MaxVaultLockboxBytes)
    expect(await listWatchRetire(CVX)).to.deep.equal({ listedCount: filledCount, watchedCount: filledCount, retired: true, leftCount: 0 })
  })

  it("refuses a lockbox past its count limit, never a replacement, and retires the vault so filled", async () => {
    const CVX = TH.componentTest(true)
    await CVX.mutation(TH.vaults.fetchOrCreateVaultProps, { vaultProps: TH.vaultPropsOf('u1') })
    await writeUntallied(CVX, Array.from({ length: MaxVaultLockboxes }, (_, ii) => TH.boxOf(`b${String(ii).padStart(4, '0')}`, String(ii))))
    expect(await refusedWrite(CVX, TH.boxOf('one_too_many', 'x'), TH.noBoxYet)).to.deep.equal(VaultFull)
    expect(await CVX.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('b0000', 'replaced'), expected: over('0') })).to.be.true
    expect(await keptTally(CVX)).to.deep.equal(await weighedTally(CVX))
    expect(await keptTally(CVX)).to.have.property('lockbox_count', MaxVaultLockboxes)
    expect(await listWatchRetire(CVX)).to.deep.equal({ listedCount: MaxVaultLockboxes, watchedCount: MaxVaultLockboxes, retired: true, leftCount: 0 })
  }, 30_000)
})
