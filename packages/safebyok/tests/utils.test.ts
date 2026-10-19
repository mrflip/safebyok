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

type Handle = { label: string, vault?: { vault_id: string } }

const decorated = () => utils.decorate<Handle>({ label: 'anthropic' }, { vault: { vault_id: 'v1' } })

describe("decorate", () => {
  it("attaches each entry, readable by name, and hands the object back, as its example shows", () => {
    const handle: Handle = { label: 'anthropic' }
    expect(utils.decorate(handle, { vault: { vault_id: 'v1' } })).to.equal(handle)
    expect(handle.vault).to.deep.equal({ vault_id: 'v1' })
  })

  it("hides what it attaches from keys, a spread and JSON, as its example shows", () => {
    const handle = decorated()
    expect(Object.keys(handle)).to.deep.equal(['label'])
    expect({ ...handle }).to.deep.equal({ label: 'anthropic' })
    expect(JSON.stringify(handle)).to.eq('{"label":"anthropic"}')
  })

  it("keeps an object that refers back to its owner out of a circle when serialized", () => {
    const owner = { label: 'vault' }
    const handle = utils.decorate<{ label: string, owner?: unknown }>({ label: 'box' }, { owner })
    utils.decorate<{ label: string, handle?: unknown }>(owner, { handle })
    expect(JSON.stringify(handle)).to.eq('{"label":"box"}')
  })

  it("lets nothing write over, or delete, what it attached", () => {
    const handle = decorated()
    expect(Reflect.set(handle, 'vault', { vault_id: 'v2' })).to.be.false
    expect(Reflect.deleteProperty(handle, 'vault')).to.be.false
    expect(Reflect.defineProperty(handle, 'vault', { value: null })).to.be.false
    // A module is strict code, where an assignment to a fixed property throws.
    expect(() => { (handle as { vault: unknown }).vault = null }).to.throw(TypeError)
    expect(handle.vault).to.deep.equal({ vault_id: 'v1' })
  })

  it("leaves the object as it was for an empty set of entries", () => {
    const handle: Handle = { label: 'anthropic' }
    utils.decorate(handle, {})
    expect(Object.getOwnPropertyNames(handle)).to.deep.equal(['label'])
  })
})

describe("adorn", () => {
  it("attaches each entry hidden and fixed, and hands back the entries, as its example shows", () => {
    const handle = { label: 'anthropic' }
    const logger = { log: () => undefined }
    const adorned = utils.adorn(handle, { logger })
    expect(adorned.logger).to.equal(logger)
    expect((handle as { logger?: unknown }).logger).to.equal(logger)
    expect({ ...handle }).to.deep.equal({ label: 'anthropic' })
    expect(Reflect.set(handle, 'logger', null)).to.be.false
  })
})
