import { describe, expect, it } from 'vitest'
import { getDocumentSize } from 'convex/values'
import * as TH from '../test-helpers'
import { MaxVaultBoxBytes, MaxVaultBoxes, capacityOf, refuses, weigh } from '../../src/component/tallies'

const MiB = 1024 * 1024

describe("the limits every vault is held to", () => {
  it("holds at most 8000 box rows, half the documents a Convex transaction may write", () => {
    expect(MaxVaultBoxes).to.eq(8000)
  })

  it("holds at most 7 MiB less 1 KiB of boxes: half the read budget, less a whole document of vault row and room for the tally", () => {
    expect(MaxVaultBoxBytes).to.eq((7 * MiB) - 1024)
  })
})

/** A box document whose whisper's ciphertext is `ciphertext_b64`. */
const boxDocOf = (ciphertext_b64: string) => {
  const box = TH.boxAt(0, 'life1', { whisper_ciphered: { cipher_iv_b64: 'aXY', ciphertext_b64 } })
  return { ...TH.vaultScope, vault_tok: box.vault_tok, boxlabel: box.boxlabel, box }
}

describe("weigh", () => {
  it("weighs a stored box document as Convex counts the document it reads", async () => {
    const backend = TH.componentTest()
    const boxDoc = boxDocOf('Y3Q')
    const stored = await backend.run(async ({ db }) => await db.get('safebyok_boxes', await db.insert('safebyok_boxes', boxDoc)))
    if (stored === null) { throw new Error('the box document was not stored') }
    expect(weigh(stored)).to.eq(getDocumentSize(stored))
  })

  it("weighs a box document not yet stored as the stored one will weigh", () => {
    expect(weigh(boxDocOf('Y3Q'))).to.eq(getDocumentSize(boxDocOf('Y3Q')))
  })

  it("weighs a heavier whisper heavier, byte for byte, and nothing as nothing", () => {
    const [heavier, lighter] = [boxDocOf('c'.repeat(1000)), boxDocOf('c'.repeat(10))]
    expect(weigh(heavier) - weigh(lighter)).to.eq(990)
    expect(weigh(null)).to.eq(0)
  })
})

describe("refuses", () => {
  const full = { box_count: MaxVaultBoxes, box_bytes: 4096 }
  const heavy = { box_count: 10, box_bytes: MaxVaultBoxBytes - 100 }

  const RefusalCases = [
    // by count:
    [full,  { box_count: 1, box_bytes: 512 },    MaxVaultBoxes,  true,   'refuses a new box in a vault holding its most'],
    [full,  { box_count: 0, box_bytes: 512 },    MaxVaultBoxes,  false,  'never refuses a replacement for count, even in a full vault'],
    [{ box_count: 1, box_bytes: 4096 }, { box_count: 1, box_bytes: 512 }, 2, false, "lets the last box in under the client's cap"],
    [{ box_count: 2, box_bytes: 4096 }, { box_count: 1, box_bytes: 512 }, 2, true,  "refuses a box past the client's cap"],
    [{ box_count: MaxVaultBoxes + 5, box_bytes: 4096 }, { box_count: 0, box_bytes: -512 }, MaxVaultBoxes, false, 'lets a vault already over its count shrink'],
    // by weight:
    [heavy, { box_count: 1, box_bytes: 100 },    MaxVaultBoxes,  false,  'lets in a new box that fills the vault to its weight exactly'],
    [heavy, { box_count: 1, box_bytes: 101 },    MaxVaultBoxes,  true,   'refuses a new box one byte past the vault weight'],
    [heavy, { box_count: 0, box_bytes: 101 },    MaxVaultBoxes,  true,   'refuses a replacement that grows the vault past its weight'],
    [heavy, { box_count: 0, box_bytes: 99 },     MaxVaultBoxes,  false,  'lets a replacement grow the vault within its weight'],
    [{ box_count: 10, box_bytes: MaxVaultBoxBytes + 5000 }, { box_count: 0, box_bytes: -10 }, MaxVaultBoxes, false, 'lets a replacement shrink a vault already past its weight'],
    [{ box_count: 10, box_bytes: MaxVaultBoxBytes + 5000 }, { box_count: 0, box_bytes: 0 },   MaxVaultBoxes, false, 'lets a replacement of the same weight into a vault past its weight'],
    // a vault counted only as far as a limit:
    [null,  { box_count: 1, box_bytes: 512 },    MaxVaultBoxes,  true,   'refuses a new box in a vault past a limit, uncounted'],
    [null,  { box_count: 0, box_bytes: 1 },      MaxVaultBoxes,  true,   'refuses a heavier replacement in a vault past a limit, uncounted'],
    [null,  { box_count: 0, box_bytes: -512 },   MaxVaultBoxes,  false,  'lets a lighter replacement into a vault past a limit, uncounted'],
  ] as const

  for (const [tally, growth, maxBoxes, expected, blurb] of RefusalCases) {
    it(blurb, () => { expect(refuses(tally, growth, maxBoxes)).to.eq(expected) })
  }
})

describe("capacityOf", () => {
  it("answers a tally against the cap it is held to and the component's weight limit", () => {
    expect(capacityOf({ box_count: 12, box_bytes: 48_000 }, 100)).to.deep.equal({ boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: MaxVaultBoxBytes } })
  })

  it("answers a vault past a limit and left uncounted as full by both, as refuses treats it", () => {
    expect(capacityOf(null, MaxVaultBoxes)).to.deep.equal({ boxes: { used: MaxVaultBoxes, max: MaxVaultBoxes }, bytes: { used: MaxVaultBoxBytes, max: MaxVaultBoxBytes } })
    expect(refuses(null, { box_count: 1, box_bytes: 0 }, MaxVaultBoxes)).to.be.true
  })
})
