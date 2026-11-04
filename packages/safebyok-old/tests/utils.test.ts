import { describe, expect, it } from 'vitest'
import * as utils from '../src/utils'

describe("the utils entry point", () => {
  it("exports exactly mask, the base64url codec and the whisper field's attributes", () => {
    expect(Object.keys(utils)).to.have.members(['mask', 'fromB64', 'toB64', 'WhisperFieldAttributes'])
  })

  it("exports the base64url codec the stored records are written in, unpadded", () => {
    expect(utils.toB64(new TextEncoder().encode('cred-laptop'))).to.eq('Y3JlZC1sYXB0b3A')
    expect(new TextDecoder().decode(utils.fromB64('Y3JlZC1sYXB0b3A'))).to.eq('cred-laptop')
    expect(() => utils.fromB64('not base64url!')).to.throw(/Unknown letter/)
  })

  it("exports a mask that masks", () => {
    expect(utils.mask('sk-ant-abcd1234')).to.eq('sk*********1234')
  })
})
