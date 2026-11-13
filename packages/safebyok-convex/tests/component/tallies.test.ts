import { describe, expect, it } from 'vitest'
import { getDocumentSize } from 'convex/values'
import * as TH from '../test-helpers'
import { MaxVaultBoxSize, MaxVaultBoxes, capacityOf, cascadeBudget, growthOf, isSpent, sizeOf, spend, tallyOf, wouldPassLimit } from '../../src/component/tallies'

const { BW } = TH

const MiB = 1024 * 1024

describe("the limits every vault is bound by", () => {
  it("has at most 8000 box rows", () => {
    expect(MaxVaultBoxes).to.eq(8000)
  })

  it("has at most 7 MiB less 1 KiB of boxes", () => {
    expect(MaxVaultBoxSize).to.eq((7 * MiB) - 1024)
  })
})

/** Make a box document whose ciphertext is `ciphertext_b64`. */
function boxDocOf(ciphertext_b64: string) {
  const box = BW.boxAt(0, 'bank1', 'life1', { whisper_ciphered: { cipher_iv_b64: 'aXY', ciphertext_b64 } })
  return { ...BW.vaultScope, bank_tok: box.bank_tok, vault_tok: box.vault_tok, boxlabel: box.boxlabel, box }
}

describe("sizeOf", () => {
  it("weighs a stored box document as Convex counts the document it reads", async () => {
    const backend = TH.componentTest()
    const boxDoc = boxDocOf('Y3Q')
    const stored = await backend.run(async ({ db }) => await db.get('safebyok_boxes', await db.insert('safebyok_boxes', boxDoc)))
    if (stored === null) { throw new Error('the box document was not stored') }
    expect(sizeOf(stored)).to.eq(getDocumentSize(stored))
  })

  it("weighs a box document not yet stored as the stored one will weigh", () => {
    expect(sizeOf(boxDocOf('Y3Q'))).to.eq(getDocumentSize(boxDocOf('Y3Q')))
  })

  it("grows by one for each byte of ciphertext, and is zero for no document", () => {
    const [heavier, lighter] = [boxDocOf('c'.repeat(1000)), boxDocOf('c'.repeat(10))]
    expect(sizeOf(heavier) - sizeOf(lighter)).to.eq(990)
    expect(sizeOf(null)).to.eq(0)
  })
})

/** A tally with these `all_*` figures, its live figures zero: `wouldPassLimit` and `capacityOf` read no live figure. */
function allOf(all_count: number, all_size: number) { return { all_count, live_count: 0, all_size, live_size: 0 } }

describe("tallyOf and growthOf", () => {
  const live = boxDocOf('Y3Q')
  const replaced = boxDocOf('c'.repeat(1000))
  const tombstone = { ...live, box: BW.boxTombstoneOf(live.box) }

  it("tally a live box row in both its live and all figures, a tombstone in its all figures alone, and no row as nothing", () => {
    expect(tallyOf(live)).to.deep.equal({ all_count: 1, live_count: 1, all_size: sizeOf(live), live_size: sizeOf(live) })
    expect(tallyOf(tombstone)).to.deep.equal({ all_count: 1, live_count: 0, all_size: sizeOf(tombstone), live_size: 0 })
    expect(tallyOf(null)).to.deep.equal({ all_count: 0, live_count: 0, all_size: 0, live_size: 0 })
  })

  const GrowthCases = [
    [null,      live,      { all_count: 1, live_count: 1,  all_size: sizeOf(live),                         live_size: sizeOf(live) },                    'a born adds a row to both counts'],
    [live,      replaced,  { all_count: 0, live_count: 0,  all_size: sizeOf(replaced) - sizeOf(live),      live_size: sizeOf(replaced) - sizeOf(live) }, 'a replace changes only the sizes'],
    [replaced,  tombstone, { all_count: 0, live_count: -1, all_size: sizeOf(tombstone) - sizeOf(replaced), live_size: -sizeOf(replaced) },               'a del takes a row from the live count alone'],
    [tombstone, live,      { all_count: 0, live_count: 1,  all_size: sizeOf(live) - sizeOf(tombstone),     live_size: sizeOf(live) },                    'a put over a tombstone adds a row to the live count alone'],
  ] as const

  for (const [anteDoc, boxDoc, expected, blurb] of GrowthCases) {
    it(blurb, () => { expect(growthOf(anteDoc, boxDoc)).to.deep.equal(expected) })
  }
})

describe("wouldPassLimit", () => {
  const full = allOf(MaxVaultBoxes, 4096)
  const heavy = allOf(10, MaxVaultBoxSize - 100)

  const RefusalCases = [
    // by count:
    [full,  allOf(1, 512),    MaxVaultBoxes,  true,   'refuses a new box in a vault at its count limit'],
    [full,  allOf(0, 512),    MaxVaultBoxes,  false,  'never refuses a replacement for count, even in a full vault'],
    [allOf(1, 4096), allOf(1, 512), 2, false, "lets the last box in under the client's cap"],
    [allOf(2, 4096), allOf(1, 512), 2, true,  "refuses a box past the client's cap"],
    [allOf(MaxVaultBoxes + 5, 4096), allOf(0, -512), MaxVaultBoxes, false, 'lets a vault already over its count shrink'],
    // by weight:
    [heavy, allOf(1, 100),    MaxVaultBoxes,  false,  'lets in a new box that fills the vault to its weight exactly'],
    [heavy, allOf(1, 101),    MaxVaultBoxes,  true,   'refuses a new box one byte past the vault weight'],
    [heavy, allOf(0, 101),    MaxVaultBoxes,  true,   'refuses a replacement that grows the vault past its weight'],
    [heavy, allOf(0, 99),     MaxVaultBoxes,  false,  'lets a replacement grow the vault within its weight'],
    [allOf(10, MaxVaultBoxSize + 5000), allOf(0, -10), MaxVaultBoxes, false, 'lets a replacement shrink a vault already past its weight'],
    [allOf(10, MaxVaultBoxSize + 5000), allOf(0, 0),   MaxVaultBoxes, false, 'lets a replacement of the same weight into a vault past its weight'],
    // a vault past a limit, so never fully counted:
    [null,  allOf(1, 512),    MaxVaultBoxes,  true,   'refuses a new box in a vault past a limit, uncounted'],
    [null,  allOf(0, 1),      MaxVaultBoxes,  true,   'refuses a heavier replacement in a vault past a limit, uncounted'],
    [null,  allOf(0, -512),   MaxVaultBoxes,  false,  'lets a lighter replacement into a vault past a limit, uncounted'],
  ] as const

  for (const [tally, growth, maxBoxes, expected, blurb] of RefusalCases) {
    it(blurb, () => { expect(wouldPassLimit(tally, growth, maxBoxes)).to.eq(expected) })
  }
})

describe("capacityOf", () => {
  it("reports a tally against the given box cap and the component's weight limit", () => {
    expect(capacityOf(allOf(12, 48_000), 100)).to.deep.equal({ boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: MaxVaultBoxSize } })
  })

  it("reports an uncounted vault past a limit as full in both boxes and bytes", () => {
    expect(capacityOf(null, MaxVaultBoxes)).to.deep.equal({ boxes: { used: MaxVaultBoxes, max: MaxVaultBoxes }, bytes: { used: MaxVaultBoxSize, max: MaxVaultBoxSize } })
    expect(wouldPassLimit(null, allOf(1, 0), MaxVaultBoxes)).to.be.true
  })
})

describe("a cascade's budget", () => {
  it("is spent once its documents or its bytes run out, and not before", () => {
    const budget = cascadeBudget()
    expect(isSpent(budget)).to.be.false
    spend(budget, budget.size - 1)
    expect(isSpent(budget)).to.be.false
    spend(budget, 1)
    expect(isSpent(budget)).to.be.true
    const crowded = { ...cascadeBudget(), count: 1 }
    spend(crowded, 1)
    expect(isSpent(crowded)).to.be.true
  })
})
