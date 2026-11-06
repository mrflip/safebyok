import { describe, expect, it } from 'vitest'
import { mash } from '../src/utils'
import * as TH from './test-helpers'
import * as PX from '../src/shapes/primitives'

describe("mash", () => {
  // mash @example
  it("answers the SHA-256 of the text as hex", async () => {
    expect(await mash('abc')).to.eq('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it("answers the SHA-256 of the empty text", async () => {
    expect(await mash('')).to.eq('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it("hashes the UTF-8 bytes of the text", async () => {
    expect(await mash('é')).to.eq('4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c')
  })

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
