import { describe, expect, it } from 'vitest'
import * as BigUtils from 'safebyok-big/utils'
import * as utils from '../src/utils'

describe("the utils entry point", () => {
  it("exports exactly mash, mask and its schedule, the base64url codec and the secret field's attributes", () => {
    expect(Object.keys(utils)).to.have.members(['mash', 'mask', 'MaskSchedule', 'fromB64', 'toB64', 'WhisperFieldAttributes'])
  })

  it("exports the very values safebyok-big/utils defines", () => {
    for (const [exportname, val] of Object.entries(utils)) { expect(BigUtils, exportname).to.have.property(exportname).that.eq(val) }
  })

  it("exports a mash that answers the SHA-256 of the text as unpadded base64url", async () => {
    expect(await utils.mash('abc')).to.eq('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
  })

  it("exports the base64url codec the stored records are written in, unpadded", () => {
    const bytes = new TextEncoder().encode('cred-laptop')
    expect(utils.toB64(bytes)).to.eq('Y3JlZC1sYXB0b3A')
    expect(utils.fromB64(utils.toB64(bytes))).to.deep.eq(bytes)
  })

  it("exports a mask that masks", () => {
    expect(utils.mask('sk-ant-abcd1234')).to.eq('******************34')
  })

  it("exports the schedule mask follows and the attributes of a secret's field", () => {
    expect(utils.MaskSchedule).to.be.frozen
    expect(utils.WhisperFieldAttributes).to.have.property('data-1p-ignore', 'true')
  })
})
