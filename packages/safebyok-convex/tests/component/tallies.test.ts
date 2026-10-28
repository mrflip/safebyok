import { describe, expect, it } from 'vitest'
import { getDocumentSize } from 'convex/values'
import * as TH from '../test-helpers'
import type { Id } from '../../src/component/_generated/dataModel'
import { MaxVaultBoxBytes, MaxVaultBoxes, capacityOf, refuses, weigh } from '../../src/component/tallies'

const MiB = 1024 * 1024

describe("the limits every vault is held to", () => {
  it("holds at most 8000 boxes, half the documents a Convex transaction may write", () => {
    expect(MaxVaultBoxes).to.eq(8000)
  })

  it("holds at most 7 MiB less 1 KiB of boxes: half the read budget, less a whole document of vault record and room for the tally", () => {
    expect(MaxVaultBoxBytes).to.eq((7 * MiB) - 1024)
  })
})

describe("weigh", () => {
  const row = { ...TH.scopeOf('u1'), ...TH.boxOf('anthropic_api_key', 'a1') }

  it("weighs a stored row as Convex counts the document it reads", async () => {
    const CVX = TH.componentTest()
    const stored = await CVX.run(async (ctx) => {
      const rowId = await ctx.db.insert('safebyok_boxes', row)
      return await ctx.db.get('safebyok_boxes', rowId)
    })
    if (stored === null) { throw new Error('the row was not stored') }
    expect(weigh(stored)).to.eq(getDocumentSize(stored))
  })

  it("weighs a row just inserted, by the _id it was given, as its stored document will weigh", async () => {
    const CVX = TH.componentTest()
    const { rowId, stored } = await CVX.run(async (ctx) => {
      const insertedId = await ctx.db.insert('safebyok_boxes', row)
      return { rowId: insertedId, stored: await ctx.db.get('safebyok_boxes', insertedId) }
    })
    if (stored === null) { throw new Error('the row was not stored') }
    expect(weigh(row, rowId)).to.eq(weigh(stored))
  })

  it("weighs a row not yet stored with Convex's estimate of its _id", () => {
    expect(weigh(row)).to.eq(getDocumentSize(row))
    expect(weigh(row)).to.eq(weigh(row, 'k'.repeat(32) as Id<'safebyok_boxes'>))
  })

  it("weighs a heavier whisper heavier, byte for byte", () => {
    const heavier = { ...row, whisper_ciphered: { cipher_iv_b64: 'iv', ciphertext_b64: 'c'.repeat(1000) } }
    const lighter = { ...row, whisper_ciphered: { cipher_iv_b64: 'iv', ciphertext_b64: 'c'.repeat(10) } }
    expect(weigh(heavier) - weigh(lighter)).to.eq(990)
  })
})

describe("refuses", () => {
  const full = { box_count: MaxVaultBoxes, box_bytes: 4096 }
  const heavy = { box_count: 10, box_bytes: MaxVaultBoxBytes - 100 }

  const RefusalCases = [
    // the @examples:
    [full,  { box_count: 1, box_bytes: 512 },    true,   'refuses a new box in a vault holding its most'],
    [full,  { box_count: 0, box_bytes: 512 },    false,  'never refuses a replacement for count, even in a full vault'],
    // by count:
    [{ box_count: MaxVaultBoxes - 1, box_bytes: 4096 }, { box_count: 1, box_bytes: 512 }, false, 'lets the last box in'],
    [{ box_count: MaxVaultBoxes + 5, box_bytes: 4096 }, { box_count: 0, box_bytes: -512 }, false, 'lets a vault already over its count shrink'],
    // by weight:
    [heavy, { box_count: 1, box_bytes: 100 },    false,  'lets in a new box that fills the vault to its weight exactly'],
    [heavy, { box_count: 1, box_bytes: 101 },    true,   'refuses a new box one byte past the vault weight'],
    [heavy, { box_count: 0, box_bytes: 101 },    true,   'refuses a replacement that grows the vault past its weight'],
    [heavy, { box_count: 0, box_bytes: 99 },     false,  'lets a replacement grow the vault within its weight'],
    [{ box_count: 10, box_bytes: MaxVaultBoxBytes + 5000 }, { box_count: 0, box_bytes: -10 }, false, 'lets a replacement shrink a vault already past its weight'],
    [{ box_count: 10, box_bytes: MaxVaultBoxBytes + 5000 }, { box_count: 0, box_bytes: 0 },   false, 'lets a replacement of the same weight into a vault past its weight'],
    // a vault counted only as far as a limit:
    [null,  { box_count: 1, box_bytes: 512 },    true,   'refuses a new box in a vault past a limit, uncounted'],
    [null,  { box_count: 0, box_bytes: 1 },      true,   'refuses a heavier replacement in a vault past a limit, uncounted'],
    [null,  { box_count: 0, box_bytes: -512 },   false,  'lets a lighter replacement into a vault past a limit, uncounted'],
  ] as const

  for (const [tally, growth, expected, blurb] of RefusalCases) {
    it(blurb, () => { expect(refuses(tally, growth)).to.eq(expected) })
  }
})

describe("capacityOf", () => {
  it("answers a tally against the component's limits, as its example shows", () => {
    expect(capacityOf({ box_count: 12, box_bytes: 48_000 })).to.deep.equal({ boxes: { used: 12, max: 8000 }, bytes: { used: 48_000, max: MaxVaultBoxBytes } })
  })

  it("answers a vault past a limit and left uncounted as full by both, as refuses treats it", () => {
    expect(capacityOf(null)).to.deep.equal({ boxes: { used: MaxVaultBoxes, max: MaxVaultBoxes }, bytes: { used: MaxVaultBoxBytes, max: MaxVaultBoxBytes } })
    expect(refuses(null, { box_count: 1, box_bytes: 0 })).to.be.true
  })
})
