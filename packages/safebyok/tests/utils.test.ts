import { describe, expect, it } from 'vitest'
import * as utils from '../src/utils'

describe("the utils entry point", () => {
  it("exports exactly mask, the base64url codec, the whisper field's attributes, adorn and decorate", () => {
    expect(Object.keys(utils)).to.have.members(['mask', 'fromB64', 'toB64', 'WhisperFieldAttributes', 'adorn', 'decorate'])
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

describe("adorn", () => {
  it("hands back what it attached, which JSON.stringify then leaves out, as its example shows", () => {
    const vault = { vaultlabel: 'main' }
    const wayin = { wayin_id: 'w1' }
    expect(utils.adorn(wayin, 'vault', vault)).to.eq(vault)
    expect((wayin as { vault?: unknown }).vault).to.eq(vault)
    expect(JSON.stringify(wayin)).to.eq('{"wayin_id":"w1"}')
  })

  it("hides the property from Object.keys and a spread, and keeps it out of a for-in", () => {
    const thing = { seen: 1 }
    utils.adorn(thing, 'hidden', 2)
    const walked: string[] = []
    for (const ckey in thing) { walked.push(ckey) }
    expect(Object.keys(thing)).to.deep.equal(['seen'])
    expect({ ...thing }).to.deep.equal({ seen: 1 })
    expect(walked).to.deep.equal(['seen'])
  })

  it("makes the property read-only: an assignment throws, and the value stands", () => {
    const thing = {}
    utils.adorn(thing, 'vault', 'the vault')
    expect(() => { (thing as { vault: string }).vault = 'another' }).to.throw(TypeError)
    expect((thing as { vault: string }).vault).to.eq('the vault')
  })

  it("leaves the property configurable, so a later adorn stands a double in", () => {
    const thing = {}
    utils.adorn(thing, 'clock', 'real')
    utils.adorn(thing, 'clock', 'double')
    expect((thing as { clock: string }).clock).to.eq('double')
    expect(Object.getOwnPropertyDescriptor(thing, 'clock')).to.deep.equal({ value: 'double', enumerable: false, writable: false, configurable: true })
  })
})

describe("decorate", () => {
  it("attaches every entry hidden, and hands back the object, as its example shows", () => {
    class Model { declare readonly vault: string; declare readonly props: { wayin_id: string }; readonly wayin_id = 'w1' }
    const model = new Model()
    const record = Object.freeze({ wayin_id: 'w1' })
    expect(utils.decorate(model, { vault: 'the vault', props: record })).to.eq(model)
    expect(model.vault).to.eq('the vault')
    expect(model.props).to.eq(record)
    expect(Object.keys(model)).to.deep.equal(['wayin_id'])
    expect(JSON.stringify(model)).to.eq('{"wayin_id":"w1"}')
  })

  it("makes each read-only, as adorn does", () => {
    const thing: { logger?: string } = {}
    utils.decorate(thing, { logger: 'quiet' })
    expect(() => { thing.logger = 'loud' }).to.throw(TypeError)
    expect(thing.logger).to.eq('quiet')
  })

  it("attaches nothing for an empty bag", () => {
    const thing = { seen: 1 }
    utils.decorate(thing, {})
    expect(Object.getOwnPropertyNames(thing)).to.deep.equal(['seen'])
  })
})
