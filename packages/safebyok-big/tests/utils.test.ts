import { describe, expect, it } from 'vitest'
import * as utils from '../src/utils'
import { mash } from '../src/utils'
import * as TH from './test-helpers'
import * as PX from '../src/shapes/primitives'

const MashCases = [
  // mash @example
  ["abc", "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0", 'answers the SHA-256 of the text as unpadded base64url'],
  ["",    "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU", 'answers the SHA-256 of the empty text'],
  ["é",   "SplVfkAzw1Od4utlRyAXytX5VX96BiWgnxw_biumnEw", 'hashes the UTF-8 bytes of the text'],
] as const

describe("the utils entry point", () => {
  it("exports exactly mash, mask, the base64url codec and the secret field's attributes", () => {
    expect(Object.keys(utils)).to.have.members(['mash', 'mask', 'fromB64', 'toB64', 'WhisperFieldAttributes'])
  })

  it("exports the base64url codec the stored records are written in, unpadded", () => {
    expect(utils.toB64(new TextEncoder().encode('cred-laptop'))).to.eq('Y3JlZC1sYXB0b3A')
    expect(new TextDecoder().decode(utils.fromB64('Y3JlZC1sYXB0b3A'))).to.eq('cred-laptop')
  })

  it("exports a codec that refuses text that is not base64url", () => {
    expect(() => utils.fromB64('not base64url!')).to.throw(/Unknown letter/)
  })

  it("exports a mask that masks", () => {
    expect(utils.mask('sk-ant-abcd1234')).to.eq('sk*********1234')
  })
})

describe("mash", () => {
  for (const [text, digest, blurb] of MashCases) {
    it(blurb, async () => { expect(await mash(text)).to.eq(digest) })
  }

  it("returns 43 characters of unpadded base64url", async () => {
    const mashed = await mash('ada@example.com')
    expect(mashed).to.match(/^[\w-]{43}$/)
    expect(utils.fromB64(mashed)).to.have.lengthOf(32)
  })

  it("returns the same hash for equal text and different hashes for different text", async () => {
    expect(await mash('ada@example.com')).to.eq(await mash('ada@example.com'))
    expect(await mash('ada@example.com')).to.not.eq(await mash('Ada@example.com'))
  })

  it("returns an id that passes the user_id rule and fails the label rule", async () => {
    const mashed = await mash('ada@example.com')
    expect(PX.user_id.safeParse(mashed).success).to.be.true
    expect(PX.label.safeParse(mashed).success).to.be.false
  })

  it("refuses a value that is not a string", async () => {
    const absurdities: unknown[] = [undefined, null, 42, {}, ['a'], new Uint8Array([1])]
    for (const absurd of absurdities) {
      await TH.expectRefusal(mash(absurd as string))
    }
  })
})
