import { describe, expect, it } from 'vitest'
import * as utils from '../src/utils'
import { mash } from '../src/utils'
import * as TH from './test-helpers'
import * as PX from '../src/shapes/primitives'

const MashCases = [
  // mash @example
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", 'answers the SHA-256 of the text as hex'],
  ["",    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", 'answers the SHA-256 of the empty text'],
  ["é",   "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c", 'hashes the UTF-8 bytes of the text'],
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

  it("answers 64 lowercase hex characters", async () => {
    expect(await mash('ada@example.com')).to.match(/^[0-9a-f]{64}$/)
  })

  it("answers alike for equal text and apart for different text", async () => {
    expect(await mash('ada@example.com')).to.eq(await mash('ada@example.com'))
    expect(await mash('ada@example.com')).to.not.eq(await mash('Ada@example.com'))
  })

  it("answers an id that passes the user_id rule and fails the label rule", async () => {
    const mashed = await mash('ada@example.com')
    expect(PX.user_id.safeParse(mashed).success).to.be.true
    expect(PX.label.safeParse(mashed).success).to.be.false
  })

  it("refuses a value that is not a string", async () => {
    const absurdities: unknown[] = [undefined, null, 42, {}, ['a'], new Uint8Array([1])]
    for (const absurd of absurdities) {
      await TH.expectRefusal(mash(absurd as string), 'bad_option')
    }
  })
})
