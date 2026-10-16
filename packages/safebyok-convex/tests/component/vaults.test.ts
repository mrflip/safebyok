import { describe, expect, it } from 'vitest'
import { ConvexError, getDocumentSize } from 'convex/values'
import { LockboxSummary, memoryStore } from 'safebyok'
import * as TH from '../test-helpers'
import { MaxVaultLockboxBytes, MaxVaultLockboxes } from '../../src/component/tallies'

const u1 = TH.scopeOf('u1')

/** A fresh backend whose `u1` scope holds a bundle, as every lockbox write needs. */
const withBundle = async () => {
  const t = TH.componentTest()
  await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1') })
  return t
}

/** Every row of both tables, system fields and all: what is really stored. */
const allRows = (t: ReturnType<typeof TH.componentTest>) => t.run(async (ctx) => ({
  bundles:   await ctx.db.query('safebyok_bundles').collect(),
  lockboxes: await ctx.db.query('safebyok_lockboxes').collect(),
}))

describe("getBundle and createBundle", () => {
  it("has no bundle until one is created, then reads it back exactly, with no Convex fields", async () => {
    const t = TH.componentTest()
    expect(await t.query(TH.vaults.getBundle, { scope: u1 })).to.be.null
    expect(await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1') })).to.deep.equal(TH.bundleOf('u1'))
    expect(await t.query(TH.vaults.getBundle, { scope: u1 })).to.deep.equal(TH.bundleOf('u1'))
  })

  it("keeps the bundle that got in first when a second device creates, and returns it", async () => {
    const t = TH.componentTest()
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1') })
    const latecomer = TH.bundleOf('u1', { vault_id: 'vault-id-latecomer' })
    expect(await t.mutation(TH.vaults.createBundle, { bundle: latecomer })).to.deep.equal(TH.bundleOf('u1'))
    const { bundles } = await allRows(t)
    expect(bundles).to.have.lengthOf(1)
  })

  it("settles two creations racing on one bundle: the creation race is closed", async () => {
    const t = TH.componentTest()
    const [first, second] = await Promise.all([
      t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1', { vault_id: 'vault-id-one' }) }),
      t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1', { vault_id: 'vault-id-two' }) }),
    ])
    expect(first.vault_id).to.eq(second.vault_id)
    const { bundles } = await allRows(t)
    expect(bundles).to.have.lengthOf(1)
  })

  it("keeps each user's and each vault's bundle apart", async () => {
    const t = TH.componentTest()
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1') })
    expect(await t.query(TH.vaults.getBundle, { scope: TH.scopeOf('u2') })).to.be.null
    expect(await t.query(TH.vaults.getBundle, { scope: TH.scopeOf('u1', 'spare') })).to.be.null
  })

  it("refuses a bundle Convex's validators do not accept, writing nothing", async () => {
    const t = TH.componentTest()
    const { format: _format, ...formatless } = TH.bundleOf('u1')
    await expect(t.mutation(TH.vaults.createBundle, { bundle: formatless as never })).rejects.toThrow(/format/)
    const { bundles } = await allRows(t)
    expect(bundles).to.have.lengthOf(0)
  })
})

describe("updateBundle", () => {
  const rewrapped = TH.bundleOf('u1', { unlock_epoch: 2, unlocks: [TH.envelopeOf('passphrase', { vault_key_wrapped: { cipher_iv_b64: 'iv-new', ciphertext_b64: 'ct-new' } })] })

  const UpdateCases = [
    // the expectation holds:
    [{ vault_id: 'vault-id-u1', unlock_epoch: 1 },  true,   'lands while the standing bundle has the expected vault_id and epoch'],
    // it fails:
    [{ vault_id: 'vault-id-u1', unlock_epoch: 2 },  false,  'refuses when the unlocks changed since it was read'],
    [{ vault_id: 'vault-id-gone', unlock_epoch: 1 }, false, 'refuses when the vault was made anew since it was read'],
  ] as const

  for (const [expected, landed, blurb] of UpdateCases) {
    it(blurb, async () => {
      const t = await withBundle()
      expect(await t.mutation(TH.vaults.updateBundle, { bundle: rewrapped, expected })).to.eq(landed)
      expect(await t.query(TH.vaults.getBundle, { scope: u1 })).to.deep.equal(landed ? rewrapped : TH.bundleOf('u1'))
    })
  }

  it("refuses when the scope holds no bundle at all, and creates none", async () => {
    const t = TH.componentTest()
    expect(await t.mutation(TH.vaults.updateBundle, { bundle: rewrapped, expected: { vault_id: 'vault-id-u1', unlock_epoch: 1 } })).to.be.false
    expect(await t.query(TH.vaults.getBundle, { scope: u1 })).to.be.null
  })
})

describe("getBox and updateBox", () => {
  it("has no box until one is written, then reads it back exactly, without its scope columns", async () => {
    const t = await withBundle()
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
    expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.be.true
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("stores a lockbox's public bag as the JSON text it was handed, and reads it back so", async () => {
    const t = await withBundle()
    const bagged = TH.boxOf('anthropic_api_key', 'a1', { public_json: TH.publicJsonOf({ note: 'caf\u{E9} "quoted"', tags: [null] }) })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: bagged, expected: TH.noBoxYet })
    const { lockboxes } = await allRows(t)
    const [row] = lockboxes
    expect(row).to.include({ public_json: bagged.public_json })
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(bagged)
  })

  it("replaces a box whose standing revision is the one expected", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    const landed = await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1', vault_key_epoch: 1 } })
    expect(landed).to.be.true
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a2'))
    const { lockboxes } = await allRows(t)
    expect(lockboxes).to.have.lengthOf(1)
  })

  const StaleCases = [
    [{ vault_id: 'vault-id-u1', revision_id: 'rev-a0', vault_key_epoch: 1 },   'refuses a write from a stale read: another revision stands'],
    [{ vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 },       'refuses a "new box" write when a box already stands'],
    [{ vault_id: 'vault-id-gone', revision_id: 'rev-a1', vault_key_epoch: 1 }, 'refuses a box sealed for a vault since made anew'],
  ] as const

  for (const [expected, blurb] of StaleCases) {
    it(blurb, async () => {
      const t = await withBundle()
      await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
      expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a2'), expected })).to.be.false
      expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
    })
  }

  it("refuses to rewrite a box erased since it was read", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault })
    const landed = await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1', vault_key_epoch: 1 } })
    expect(landed).to.be.false
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
  })

  it("refuses any box in a scope that holds no bundle, writing nothing", async () => {
    const t = TH.componentTest()
    expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.be.false
    const { lockboxes } = await allRows(t)
    expect(lockboxes).to.have.lengthOf(0)
  })

  it("keeps the same boxlabel in two users' vaults apart", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u2') })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'mine'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.updateBox, { scope: TH.scopeOf('u2'), lockbox: TH.boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 } })
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'mine'))
  })
})

describe("listBoxSummaries", () => {
  it("lists the vault's boxes in boxlabel order, without ciphered fields, keeping format", async () => {
    const t = await withBundle()
    for (const boxlabel of ['openai_api_key', 'anthropic_api_key']) {
      await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf(boxlabel, boxlabel), expected: TH.noBoxYet })
    }
    const listed = await t.query(TH.vaults.listBoxSummaries, { scope: u1 })
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    const { lockbox_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...shell } = TH.boxOf('anthropic_api_key', 'anthropic_api_key')
    expect(listed[0]).to.deep.equal(shell)
  })

  it("lists only this vault's boxes: not another vault's of the same user, nor another user's", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u2') })
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1', { vaultlabel: 'spare', vault_id: 'vault-id-spare' }) })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'mine'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.updateBox, { scope: TH.scopeOf('u2'), lockbox: TH.boxOf('openai_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 } })
    await t.mutation(TH.vaults.updateBox, { scope: TH.scopeOf('u1', 'spare'), lockbox: TH.boxOf('github_token', 'spare'), expected: { vault_id: 'vault-id-spare', revision_id: null, vault_key_epoch: 1 } })
    const listed = await t.query(TH.vaults.listBoxSummaries, { scope: u1 })
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key'])
  })

  it("keeps a user_id holding a colon from reaching another user's rows", async () => {
    const t = TH.componentTest()
    const colonScope = TH.scopeOf('u1:main')
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1') })
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1:main') })
    await t.mutation(TH.vaults.updateBox, { scope: colonScope, lockbox: TH.boxOf('anthropic_api_key', 'colon'), expected: { vault_id: 'vault-id-u1:main', revision_id: null, vault_key_epoch: 1 } })
    expect(await t.query(TH.vaults.listBoxSummaries, { scope: u1 })).to.deep.equal([])
  })
})

describe("eraseBox", () => {
  it("removes the box whatever revision stands: erase wins over a newer write", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1', vault_key_epoch: 1 } })
    expect(await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault })).to.be.true
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.be.null
  })

  it("is quiet, and lands, when there is no box to remove", async () => {
    const t = await withBundle()
    expect(await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault })).to.be.true
  })

  it("refuses to erase from a vault made anew since it was read, removing nothing", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    expect(await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: { vault_id: 'vault-id-gone' } })).to.be.false
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
  })

  it("refuses when the scope holds no bundle", async () => {
    const t = TH.componentTest()
    expect(await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault })).to.be.false
  })
})

describe("eraseVault", () => {
  it("removes the bundle and every box of the vault, and nothing of any other", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u2') })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.updateBox, { scope: TH.scopeOf('u2'), lockbox: TH.boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 } })
    expect(await t.mutation(TH.vaults.eraseVault, { scope: u1, expected: TH.thisVault })).to.be.true
    const rows = await allRows(t)
    expect(rows.bundles.map((row) => row.user_id)).to.deep.equal(['u2'])
    expect(rows.lockboxes.map((row) => row.user_id)).to.deep.equal(['u2'])
  })

  it("refuses to erase a vault made anew since it was read, removing nothing", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    expect(await t.mutation(TH.vaults.eraseVault, { scope: u1, expected: { vault_id: 'vault-id-gone' } })).to.be.false
    const rows = await allRows(t)
    expect(rows.bundles).to.have.lengthOf(1)
    expect(rows.lockboxes).to.have.lengthOf(1)
  })

  it("refuses when the scope holds no bundle", async () => {
    const t = TH.componentTest()
    expect(await t.mutation(TH.vaults.eraseVault, { scope: u1, expected: TH.thisVault })).to.be.false
  })
})

describe("watchVault", () => {
  it("signs an empty scope with nulls and no boxes", async () => {
    const t = TH.componentTest()
    expect(await t.query(TH.vaults.watchVault, { scope: u1 })).to.deep.equal({ vault_id: null, unlock_epoch: null, boxes: [] })
  })

  it("signs the vault with its bundle's ids and each box's revision, in boxlabel order", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    expect(await t.query(TH.vaults.watchVault, { scope: u1 })).to.deep.equal({
      vault_id:         'vault-id-u1',
      unlock_epoch: 1,
      boxes:            [['anthropic_api_key', 'rev-a1'], ['openai_api_key', 'rev-o1']],
    })
  })

  it("changes with every write that lands in the vault, and not with a write elsewhere", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u2') })
    const signatures = [await t.query(TH.vaults.watchVault, { scope: u1 })]
    const sign = async () => { signatures.push(await t.query(TH.vaults.watchVault, { scope: u1 })) }

    await t.mutation(TH.vaults.updateBox, { scope: TH.scopeOf('u2'), lockbox: TH.boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 } })
    await sign()
    expect(signatures[1]).to.deep.equal(signatures[0])

    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await sign()
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a2'), expected: { vault_id: 'vault-id-u1', revision_id: 'rev-a1', vault_key_epoch: 1 } })
    await sign()
    await t.mutation(TH.vaults.updateBundle, { bundle: TH.bundleOf('u1', { unlock_epoch: 2 }), expected: { vault_id: 'vault-id-u1', unlock_epoch: 1 } })
    await sign()
    await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault })
    await sign()
    await t.mutation(TH.vaults.eraseVault, { scope: u1, expected: TH.thisVault })
    await sign()
    const distinct = new Set(signatures.slice(1).map((signature) => JSON.stringify(signature)))
    expect(distinct.size).to.eq(6)
  })
})

describe("a real vault's records", () => {
  it("round-trip exactly, and still open to the passphrase that sealed them", async () => {
    const real = await TH.realRecords('u1')
    const t = TH.componentTest()
    expect(await t.mutation(TH.vaults.createBundle, { bundle: real.bundle })).to.deep.equal(real.bundle)
    for (const { lockbox } of real.boxes) {
      expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox, expected: { vault_id: real.bundle.vault_id, revision_id: null, vault_key_epoch: 1 } })).to.be.true
    }

    // Read back from Convex, and placed where the core keeps them, they open as before.
    const reread = memoryStore()
    reread.write(real.bundleCkey, JSON.stringify(await t.query(TH.vaults.getBundle, { scope: u1 })))
    for (const { ckey, lockbox } of real.boxes) {
      const stored = await t.query(TH.vaults.getBox, { scope: u1, boxlabel: lockbox.boxlabel })
      expect(stored).to.deep.equal(lockbox)
      reread.write(ckey, JSON.stringify(stored))
    }
    const vault = await TH.openOver(reread)
    await vault.unlock(TH.RealPassphrase)
    for (const [boxlabel, { whisper }] of Object.entries(TH.RealWhispers)) {
      expect(await vault.read(boxlabel)).to.deep.equal(whisper)
    }
    vault.close()
  })

  it("list what the core reads as the summaries it lists", async () => {
    const real = await TH.realRecords('u1')
    const t = TH.componentTest()
    await t.mutation(TH.vaults.createBundle, { bundle: real.bundle })
    for (const { lockbox } of real.boxes) {
      await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox, expected: { vault_id: real.bundle.vault_id, revision_id: null, vault_key_epoch: 1 } })
    }
    const vault = await TH.openOver(memoryStoreHolding(real))
    const listed = await t.query(TH.vaults.listBoxSummaries, { scope: u1 })
    // The core's summary drops `format` and the codec, and parses the public bag's JSON; the
    // listing holds the record's fields as stored.
    const summaries = listed.map(({ format: _format, whisper_codec: _codec, whisper_schema_version: _version, public_json: publicJson, ...shell }) => (
      LockboxSummary.parse({ ...shell, public: JSON.parse(publicJson) as unknown })
    ))
    expect(summaries).to.deep.equal(vault.getSnapshot().boxes)
    vault.close()
  })
})

const memoryStoreHolding = (real: Awaited<ReturnType<typeof TH.realRecords>>) => {
  const store = memoryStore()
  store.write(real.bundleCkey, JSON.stringify(real.bundle))
  for (const { ckey, lockbox } of real.boxes) { store.write(ckey, JSON.stringify(lockbox)) }
  return store
}

// --------------------------------------------------------------------------- the vault's limits

/** The tally the component keeps for `scope`'s vault, or null when it keeps none. */
const keptTally = (t: ReturnType<typeof TH.componentTest>, scope = u1) => t.run(async (ctx) => {
  const bundle = await ctx.db.query('safebyok_bundles')
    .withIndex('by_scope', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
    .unique()
  if (bundle === null) { return null }
  const kept = await ctx.db.query('safebyok_vault_tallies').withIndex('by_bundle', (idx) => idx.eq('bundle_id', bundle._id)).unique()
  return kept && { lockbox_count: kept.lockbox_count, lockbox_bytes: kept.lockbox_bytes }
})

/** What `scope`'s vault really holds: its lockbox rows, counted, and weighed as Convex reads them. */
const weighedTally = (t: ReturnType<typeof TH.componentTest>, scope = u1) => t.run(async (ctx) => {
  const rows = await ctx.db.query('safebyok_lockboxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', scope.user_id).eq('applabel', scope.applabel).eq('vaultlabel', scope.vaultlabel))
    .collect()
  return { lockbox_count: rows.length, lockbox_bytes: rows.reduce((sum, row) => sum + getDocumentSize(row), 0) }
})

/** Lockboxes stored straight into `u1`'s vault, as a component that kept no tallies left them. */
const writeUntallied = (t: ReturnType<typeof TH.componentTest>, lockboxes: ReturnType<typeof TH.boxOf>[]) => t.run(async (ctx) => {
  await Promise.all(lockboxes.map((lockbox) => ctx.db.insert('safebyok_lockboxes', { ...u1, ...lockbox })))
})

/** The refusal's data, when `u1`'s vault refuses `lockbox` with a ConvexError. */
const refusedWrite = (t: ReturnType<typeof TH.componentTest>, lockbox: ReturnType<typeof TH.boxOf>, expected: { vault_id: string, revision_id: string | null, vault_key_epoch: number }) => (
  TH.convexRefusalOf(t.mutation(TH.vaults.updateBox, { scope: u1, lockbox, expected }))
)

const VaultFull = { kind: 'vault_full', message: 'This vault is full: erase a lockbox to make room, then try again.' }

/** The expectation a replacement of the box tagged `tag` carries. */
const over = (tag: string) => ({ vault_id: 'vault-id-u1', revision_id: `rev-${tag}`, vault_key_epoch: 1 })

describe("a vault's tally", () => {
  it("stays true across new lockboxes, replacements and erases", async () => {
    const t = await withBundle()
    const steps = [
      () => t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet }),
      () => t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.heavyBox('anthropic_api_key', 5000, 'a2'), expected: over('a1') }),
      () => t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'o1'), expected: TH.noBoxYet }),
      () => t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a3'), expected: over('a2') }),
      () => t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault }),
      () => t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'never_stored', expected: TH.thisVault }),
    ]
    const counts = []
    for (const step of steps) {
      await step()
      const kept = await keptTally(t)
      expect(kept).to.deep.equal(await weighedTally(t))
      counts.push(kept?.lockbox_count)
    }
    expect(counts).to.deep.equal([1, 1, 2, 2, 1, 1])
  })

  it("stays true across writes and erases running at once", async () => {
    const t = await withBundle()
    const boxlabels = Array.from({ length: 12 }, (_, ii) => `box_${String(ii)}`)
    await Promise.all(boxlabels.map((boxlabel) => t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf(boxlabel, boxlabel), expected: TH.noBoxYet })))
    await Promise.all(boxlabels.slice(0, 5).map((boxlabel) => t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel, expected: TH.thisVault })))
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
    expect(await keptTally(t)).to.have.property('lockbox_count', 7)
  })

  it("goes with its vault when the vault is erased, and a vault made anew keeps one of its own", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.eraseVault, { scope: u1, expected: TH.thisVault })
    expect(await t.run((ctx) => ctx.db.query('safebyok_vault_tallies').collect())).to.deep.equal([])
    //
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1', { vault_id: 'vault-id-anew' }) })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'o1'), expected: { vault_id: 'vault-id-anew', revision_id: null, vault_key_epoch: 1 } })
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
    expect(await keptTally(t)).to.have.property('lockbox_count', 1)
  })

  it("is kept apart for each vault", async () => {
    const t = await withBundle()
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u2') })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'mine'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('openai_api_key', 'mine'), expected: TH.noBoxYet })
    await t.mutation(TH.vaults.updateBox, { scope: TH.scopeOf('u2'), lockbox: TH.boxOf('anthropic_api_key', 'theirs'), expected: { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 } })
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
    expect(await keptTally(t, TH.scopeOf('u2'))).to.deep.equal(await weighedTally(t, TH.scopeOf('u2')))
    expect(await keptTally(t, TH.scopeOf('u2'))).to.have.property('lockbox_count', 1)
  })

  it("is counted, for a vault written before tallies were kept, at its next lockbox write, the vault reading as ever until then", async () => {
    const t = await withBundle()
    await writeUntallied(t, [TH.boxOf('anthropic_api_key', 'a1'), TH.boxOf('openai_api_key', 'o1')])
    expect(await keptTally(t)).to.be.null
    const listed = await t.query(TH.vaults.listBoxSummaries, { scope: u1 })
    expect(listed.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic_api_key', 'openai_api_key'])
    expect(await t.query(TH.vaults.getBox, { scope: u1, boxlabel: 'anthropic_api_key' })).to.deep.equal(TH.boxOf('anthropic_api_key', 'a1'))
    //
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a2'), expected: over('a1') })
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
    expect(await keptTally(t)).to.have.property('lockbox_count', 2)
  })

  it("is not counted by an erase, which never reads the whole vault", async () => {
    const t = await withBundle()
    await writeUntallied(t, [TH.boxOf('anthropic_api_key', 'a1'), TH.boxOf('openai_api_key', 'o1')])
    await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'anthropic_api_key', expected: TH.thisVault })
    expect(await keptTally(t)).to.be.null
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('github_token', 'g1'), expected: TH.noBoxYet })
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
    expect(await keptTally(t)).to.have.property('lockbox_count', 2)
  })
})

/** A backend whose `u1` vault holds eight lockboxes of 900,000 bytes: a little under its limit. */
const nearlyFull = async () => {
  const t = await withBundle()
  for (let ii = 0; ii < 8; ii++) {
    await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.heavyBox(`heavy_${String(ii)}`, 900_000), expected: TH.noBoxYet })
  }
  const { lockbox_bytes: lockboxBytes } = await weighedTally(t)
  return { t, room: MaxVaultLockboxBytes - lockboxBytes }
}

describe("a vault's weight limit", () => {
  it("refuses a new lockbox that would take the vault past it, writing nothing, and says so calmly", async () => {
    const { t, room } = await nearlyFull()
    const ante = { rows: await allRows(t), tally: await keptTally(t) }
    const refusal = await refusedWrite(t, TH.heavyBox('one_too_many', room), TH.noBoxYet)
    expect(refusal).to.deep.equal(VaultFull)
    expect(JSON.stringify(refusal)).to.not.include('one_too_many')
    expect({ rows: await allRows(t), tally: await keptTally(t) }).to.deep.equal(ante)
  })

  it("lets in a new lockbox that fits", async () => {
    const { t } = await nearlyFull()
    expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.be.true
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
  })

  it("lets a replacement grow the vault up to it exactly, then refuses one byte more, and lets a lighter one in", async () => {
    const { t, room } = await nearlyFull()
    const grown = TH.heavyBox('heavy_0', 900_000 + room, 'grown_0')
    expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: grown, expected: over('heavy_0') })).to.be.true
    expect(await keptTally(t)).to.deep.equal({ lockbox_count: 8, lockbox_bytes: MaxVaultLockboxBytes })
    //
    const overgrown = TH.heavyBox('heavy_1', 900_001, 'grown_1')
    expect(await refusedWrite(t, overgrown, over('heavy_1'))).to.deep.equal(VaultFull)
    expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.heavyBox('heavy_1', 800_000, 'shrunk1'), expected: over('heavy_1') })).to.be.true
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
  })

  it("refuses a vault past it nothing that shrinks it, and lets it be erased a lockbox at a time", async () => {
    const t = TH.componentTest(true)
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1') })
    // Nine of 900,000 bytes, written before tallies were kept: past the limit, still readable whole.
    await writeUntallied(t, Array.from({ length: 9 }, (_, ii) => TH.heavyBox(`heavy_${String(ii)}`, 900_000)))
    expect(await refusedWrite(t, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet)).to.deep.equal(VaultFull)
    const overgrown = TH.heavyBox('heavy_0', 900_001, 'grown_0')
    expect(await refusedWrite(t, overgrown, over('heavy_0'))).to.deep.equal(VaultFull)
    expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.heavyBox('heavy_0', 800_000, 'shrunk0'), expected: over('heavy_0') })).to.be.true
    expect(await keptTally(t)).to.be.null
    //
    expect(await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: 'heavy_1', expected: TH.thisVault })).to.be.true
    expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('anthropic_api_key', 'a1'), expected: TH.noBoxYet })).to.be.true
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
  })

  it("keeps a vault already too large to read whole erasable, a lockbox at a time, its writes refused as full", async () => {
    const t = TH.componentTest(true)
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1') })
    // Twenty of 900,000 bytes, more than one transaction may read: four writes, each within its limits.
    for (let batch = 0; batch < 4; batch++) {
      await writeUntallied(t, Array.from({ length: 5 }, (_, ii) => TH.heavyBox(`heavy_${String((batch * 5) + ii)}`, 900_000)))
    }
    await expect(t.query(TH.vaults.listBoxSummaries, { scope: u1 })).rejects.toThrow(/Read too much data/)
    expect(await refusedWrite(t, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet)).to.deep.equal(VaultFull)
    for (let ii = 0; ii < 20; ii++) {
      expect(await t.mutation(TH.vaults.eraseBox, { scope: u1, boxlabel: `heavy_${String(ii)}`, expected: TH.thisVault })).to.be.true
    }
    expect(await t.mutation(TH.vaults.eraseVault, { scope: u1, expected: TH.thisVault })).to.be.true
    const { bundles, lockboxes } = await allRows(t)
    expect({ bundles, lockboxes }).to.deep.equal({ bundles: [], lockboxes: [] })
  })
})

// A Convex transaction may read 16 MiB and 32,000 documents, and write 16,000 documents. Listing
// and signing read the vault once, but erasing it reads every row twice (each delete reads its row
// again). So the component holds every vault to MaxVaultLockboxes lockboxes and
// MaxVaultLockboxBytes bytes of them, whatever its client asks, and convexVaultDB declares half the
// read budget, 8 MiB, as its maxVaultBytes. openVault admits a maxLockboxes only while that many
// lockboxes, each counted at twice maxWhisperBytes plus 2 KiB for its other fields, fit in the
// 8 MiB: at most 101 of the largest default whisper (40444 bytes of JSON, about 54 KB stored),
// and at most 1365 of 2 KiB whispers. The tests below fill a vault to each of those, and to each
// of the component's own limits, with the longest labels, and erase it.

/** A bundle as heavy as a Convex document may be, near enough: the most an erase reads beside the lockboxes. */
const wholeDocumentBundle = () => {
  const bundle = TH.bundleOf('u1')
  const padding = 'a'.repeat(1_048_576 - getDocumentSize(bundle) - 64)
  const envelope = TH.envelopeOf('passphrase', { vault_key_wrapped: TH.fakeCiphered('bundle-u1') })
  return TH.bundleOf('u1', { unlocks: [{ ...envelope, salt_b64: envelope.salt_b64 + padding }] })
}

/**
 * A backend whose `u1` vault holds `count` lockboxes, each a whisper of `whisperBytes` and the
 * heaviest public shell -- or as many as the component lets in before it refuses one as full.
 */
const fillVault = async (count: number, whisperBytes: number, bundle = TH.bundleOf('u1')) => {
  const t = TH.componentTest(true)
  await t.mutation(TH.vaults.createBundle, { bundle })
  const whisperCiphered = { cipher_iv_b64: 'i'.repeat(16), ciphertext_b64: 'c'.repeat(Math.ceil((whisperBytes + 16) * 4 / 3)) }
  const lockboxKeyWrapped = { cipher_iv_b64: 'i'.repeat(16), ciphertext_b64: 'k'.repeat(64) }
  for (let ii = 0; ii < count; ii++) {
    const boxlabel = `b${String(ii).padStart(39, '0')}`
    const lockbox = TH.boxOf(boxlabel, crypto.randomUUID(), { whisper_ciphered: whisperCiphered, lockbox_key_wrapped: lockboxKeyWrapped })
    if (! await landsOrIsFull(t, lockbox)) { return { t, filledCount: ii } }
  }
  return { t, filledCount: count }
}

/** True when `lockbox` lands in `u1`'s vault as a new box, false when the vault refuses it as full. */
const landsOrIsFull = async (t: ReturnType<typeof TH.componentTest>, lockbox: ReturnType<typeof TH.boxOf>) => {
  try {
    return await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox, expected: TH.noBoxYet })
  } catch (err) {
    if (err instanceof ConvexError && (err.data as { kind?: unknown }).kind === 'vault_full') { return false }
    throw err
  }
}

/** What listing, watching and erasing the `u1` vault find: each a whole transaction over it. */
const listWatchErase = async (t: ReturnType<typeof TH.componentTest>) => {
  const listed = await t.query(TH.vaults.listBoxSummaries, { scope: u1 })
  const { boxes } = await t.query(TH.vaults.watchVault, { scope: u1 })
  const erased = await t.mutation(TH.vaults.eraseVault, { scope: u1, expected: TH.thisVault })
  const { lockboxes } = await allRows(t)
  return { listedCount: listed.length, watchedCount: boxes.length, erased, leftCount: lockboxes.length }
}

describe("a large vault, within Convex's per-transaction limits", () => {
  it("lists, signs and erases the 101 of the largest lockboxes the core admits", async () => {
    const { t, filledCount } = await fillVault(101, 40_444)
    expect(filledCount).to.eq(101)
    expect(await listWatchErase(t)).to.deep.equal({ listedCount: 101, watchedCount: 101, erased: true, leftCount: 0 })
  })

  it("lists, signs and erases the 1365 lockboxes of 2 KiB whispers the core admits", async () => {
    const { t, filledCount } = await fillVault(1365, 2048)
    expect(filledCount).to.eq(1365)
    expect(await listWatchErase(t)).to.deep.equal({ listedCount: 1365, watchedCount: 1365, erased: true, leftCount: 0 })
  }, 120_000) // landing 1365 lockboxes, a mutation each, is the work, past vitest's 30 s default under CI's coverage

  it("refuses the largest lockboxes past its weight limit, and erases the vault so filled beside a bundle of a whole document", async () => {
    const { t, filledCount } = await fillVault(200, 40_444, wholeDocumentBundle())
    expect(filledCount).to.be.within(102, 199)
    const kept = await keptTally(t)
    expect(kept).to.deep.equal(await weighedTally(t))
    expect(kept?.lockbox_bytes).to.be.within(MaxVaultLockboxBytes - 60_000, MaxVaultLockboxBytes)
    expect(await listWatchErase(t)).to.deep.equal({ listedCount: filledCount, watchedCount: filledCount, erased: true, leftCount: 0 })
  })

  it("refuses a lockbox past its count limit, never a replacement, and erases the vault so filled", async () => {
    const t = TH.componentTest(true)
    await t.mutation(TH.vaults.createBundle, { bundle: TH.bundleOf('u1') })
    await writeUntallied(t, Array.from({ length: MaxVaultLockboxes }, (_, ii) => TH.boxOf(`b${String(ii).padStart(4, '0')}`, String(ii))))
    expect(await refusedWrite(t, TH.boxOf('one_too_many', 'x'), TH.noBoxYet)).to.deep.equal(VaultFull)
    expect(await t.mutation(TH.vaults.updateBox, { scope: u1, lockbox: TH.boxOf('b0000', 'replaced'), expected: over('0') })).to.be.true
    expect(await keptTally(t)).to.deep.equal(await weighedTally(t))
    expect(await keptTally(t)).to.have.property('lockbox_count', MaxVaultLockboxes)
    expect(await listWatchErase(t)).to.deep.equal({ listedCount: MaxVaultLockboxes, watchedCount: MaxVaultLockboxes, erased: true, leftCount: 0 })
  }, 30_000)
})
