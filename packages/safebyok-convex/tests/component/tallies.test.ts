import { describe, expect, it } from 'vitest'
import { getDocumentSize } from 'convex/values'
import * as TH from '../test-helpers'
import type { Id } from '../../src/component/_generated/dataModel'
import { MaxVaultLockboxBytes, MaxVaultLockboxes, refuses, weigh } from '../../src/component/tallies'

const MiB = 1024 * 1024

describe("the limits every vault is held to", () => {
  it("holds at most 8000 lockboxes, half the documents a Convex transaction may write", () => {
    expect(MaxVaultLockboxes).to.eq(8000)
  })

  it("holds at most 7 MiB less 1 KiB of lockboxes: half the read budget, less a whole bundle and room for the tally", () => {
    expect(MaxVaultLockboxBytes).to.eq((7 * MiB) - 1024)
  })
})

describe("weigh", () => {
  const row = { ...TH.scopeOf('u1'), ...TH.boxOf('anthropic_api_key', 'a1') }

  it("weighs a stored row as Convex counts the document it reads", async () => {
    const CVX = TH.componentTest()
    const stored = await CVX.run(async (ctx) => {
      const rowId = await ctx.db.insert('safebyok_lockboxes', row)
      return await ctx.db.get('safebyok_lockboxes', rowId)
    })
    if (stored === null) { throw new Error('the row was not stored') }
    expect(weigh(stored)).to.eq(getDocumentSize(stored))
  })

  it("weighs a row just inserted, by the _id it was given, as its stored document will weigh", async () => {
    const CVX = TH.componentTest()
    const { rowId, stored } = await CVX.run(async (ctx) => {
      const insertedId = await ctx.db.insert('safebyok_lockboxes', row)
      return { rowId: insertedId, stored: await ctx.db.get('safebyok_lockboxes', insertedId) }
    })
    if (stored === null) { throw new Error('the row was not stored') }
    expect(weigh(row, rowId)).to.eq(weigh(stored))
  })

  it("weighs a row not yet stored with Convex's estimate of its _id", () => {
    expect(weigh(row)).to.eq(getDocumentSize(row))
    expect(weigh(row)).to.eq(weigh(row, 'k'.repeat(32) as Id<'safebyok_lockboxes'>))
  })

  it("weighs a heavier whisper heavier, byte for byte", () => {
    const heavier = { ...row, whisper_ciphered: { cipher_iv_b64: 'iv', ciphertext_b64: 'c'.repeat(1000) } }
    const lighter = { ...row, whisper_ciphered: { cipher_iv_b64: 'iv', ciphertext_b64: 'c'.repeat(10) } }
    expect(weigh(heavier) - weigh(lighter)).to.eq(990)
  })
})

describe("refuses", () => {
  const full = { lockbox_count: MaxVaultLockboxes, lockbox_bytes: 4096 }
  const heavy = { lockbox_count: 10, lockbox_bytes: MaxVaultLockboxBytes - 100 }

  const RefusalCases = [
    // the @examples:
    [full,  { lockbox_count: 1, lockbox_bytes: 512 },    true,   'refuses a new lockbox in a vault holding its most'],
    [full,  { lockbox_count: 0, lockbox_bytes: 512 },    false,  'never refuses a replacement for count, even in a full vault'],
    // by count:
    [{ lockbox_count: MaxVaultLockboxes - 1, lockbox_bytes: 4096 }, { lockbox_count: 1, lockbox_bytes: 512 }, false, 'lets the last lockbox in'],
    [{ lockbox_count: MaxVaultLockboxes + 5, lockbox_bytes: 4096 }, { lockbox_count: 0, lockbox_bytes: -512 }, false, 'lets a vault already over its count shrink'],
    // by weight:
    [heavy, { lockbox_count: 1, lockbox_bytes: 100 },    false,  'lets in a new lockbox that fills the vault to its weight exactly'],
    [heavy, { lockbox_count: 1, lockbox_bytes: 101 },    true,   'refuses a new lockbox one byte past the vault weight'],
    [heavy, { lockbox_count: 0, lockbox_bytes: 101 },    true,   'refuses a replacement that grows the vault past its weight'],
    [heavy, { lockbox_count: 0, lockbox_bytes: 99 },     false,  'lets a replacement grow the vault within its weight'],
    [{ lockbox_count: 10, lockbox_bytes: MaxVaultLockboxBytes + 5000 }, { lockbox_count: 0, lockbox_bytes: -10 }, false, 'lets a replacement shrink a vault already past its weight'],
    [{ lockbox_count: 10, lockbox_bytes: MaxVaultLockboxBytes + 5000 }, { lockbox_count: 0, lockbox_bytes: 0 },   false, 'lets a replacement of the same weight into a vault past its weight'],
    // a vault counted only as far as a limit:
    [null,  { lockbox_count: 1, lockbox_bytes: 512 },    true,   'refuses a new lockbox in a vault past a limit, uncounted'],
    [null,  { lockbox_count: 0, lockbox_bytes: 1 },      true,   'refuses a heavier replacement in a vault past a limit, uncounted'],
    [null,  { lockbox_count: 0, lockbox_bytes: -512 },   false,  'lets a lighter replacement into a vault past a limit, uncounted'],
  ] as const

  for (const [tally, growth, expected, blurb] of RefusalCases) {
    it(blurb, () => { expect(refuses(tally, growth)).to.eq(expected) })
  }
})
