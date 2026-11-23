import { describe, expect, it } from 'vitest'
import { maskUuid } from '../../src/helpers/mask-uuid'

describe("maskUuid(text)", () => {
  it("keeps a UUID's first ten characters and its last two, with an ellipsis between", () => {
    // maskUuid @example
    expect(maskUuid('0195a3f2-1c4b-7e21-9a3d-5b8c2d4e6f7c')).to.eq('0195a3f2-1…7c')
  })

  it("keeps the case it was given", () => {
    expect(maskUuid('0195A3F2-1C4B-7E21-9A3D-5B8C2D4E6F7C')).to.eq('0195A3F2-1…7C')
  })

  it("masks a random UUID, as crypto.randomUUID makes a revtok or a lifetok, and the nil UUID, a void revtok", () => {
    const uuidText = crypto.randomUUID()
    expect(maskUuid(uuidText)).to.eq(`${uuidText.slice(0, 10)}…${uuidText.slice(-2)}`)
    expect(maskUuid('00000000-0000-0000-0000-000000000000')).to.eq('00000000-0…00')
  })

  it("cuts a text that is no UUID the same way, checking nothing", () => {
    expect(maskUuid('zz95a3f2-1c4b-7e21-9a3d-5b8c2d4e6f7c')).to.eq('zz95a3f2-1…7c')
    expect(maskUuid('0195a3f21c4b7e219a3d5b8c2d4e6f7c')).to.eq('0195a3f21c…7c')
  })

  it("gives back whole a text of twelve characters or fewer", () => {
    expect(maskUuid('')).to.eq('')
    expect(maskUuid('0195a3f2-1c4')).to.eq('0195a3f2-1c4')
  })
})
