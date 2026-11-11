import { describe, expect, it } from 'vitest'
import { adorn, decorate, nextMicrotask, tattoo, tattooProp } from '../../src/helpers/helpers'

type Handle = { label: string, vault?: { vault_tok: string } }

function decorated() { return decorate<Handle>({ label: 'anthropic' }, { vault: { vault_tok: 'v1' } }) }

describe("adorn", () => {
  it("attaches the value under its name, hidden, and hands the value back", () => {
    const handle = { label: 'anthropic' }
    const vault = { vault_tok: 'v1' }
    expect(adorn(handle, 'vault', vault)).to.equal(vault)
    expect((handle as { vault?: unknown }).vault).to.equal(vault)
    expect(Object.keys(handle)).to.deep.equal(['label'])
    expect(JSON.stringify(handle)).to.eq('{"label":"anthropic"}')
  })

  // adorn @example
  it("lets a getter cache its value on the first read", () => {
    let workedOut = 0
    class Labelled {
      readonly label = 'anthropic'
      get ctx(): string {
        workedOut += 1
        return adorn(this, 'ctx', `ctx-of-${this.label}`)
      }
    }
    const handle = new Labelled()
    expect(handle.ctx).to.eq('ctx-of-anthropic')
    expect(handle.ctx).to.eq('ctx-of-anthropic')
    expect(workedOut).to.eq(1)
    expect(Object.keys(handle)).to.deep.equal(['label'])
  })
})

describe("decorate", () => {
  it("attaches each entry, readable by name, and hands the object back", () => {
    const handle: Handle = { label: 'anthropic' }
    expect(decorate(handle, { vault: { vault_tok: 'v1' } })).to.equal(handle)
    expect(handle.vault).to.deep.equal({ vault_tok: 'v1' })
  })

  it("hides what it attaches from keys, a spread and JSON", () => {
    const handle = decorated()
    expect(Object.keys(handle)).to.deep.equal(['label'])
    expect({ ...handle }).to.deep.equal({ label: 'anthropic' })
    expect(JSON.stringify(handle)).to.eq('{"label":"anthropic"}')
  })

  it("keeps an object that refers back to its owner out of a circle when serialized", () => {
    const owner = { label: 'vault' }
    const handle = decorate<{ label: string, owner?: unknown }>({ label: 'box' }, { owner })
    decorate<{ label: string, handle?: unknown }>(owner, { handle })
    expect(JSON.stringify(handle)).to.eq('{"label":"box"}')
  })

  it("leaves what it attached writable and configurable, still hidden once written", () => {
    const handle = decorated()
    expect(Reflect.set(handle, 'vault', { vault_tok: 'v2' })).to.be.true
    expect(handle.vault).to.deep.equal({ vault_tok: 'v2' })
    expect(Object.keys(handle)).to.deep.equal(['label'])
    expect(Reflect.deleteProperty(handle, 'vault')).to.be.true
    expect(handle.vault).to.be.undefined
  })

  it("leaves what it attached frozen once the object is frozen", () => {
    const handle = Object.freeze(decorated())
    expect(Reflect.set(handle, 'vault', { vault_tok: 'v2' })).to.be.false
    expect(Reflect.deleteProperty(handle, 'vault')).to.be.false
    expect(handle.vault).to.deep.equal({ vault_tok: 'v1' })
  })

  it("leaves the object as it was for an empty set of entries", () => {
    const handle: Handle = { label: 'anthropic' }
    decorate(handle, {})
    expect(Object.getOwnPropertyNames(handle)).to.deep.equal(['label'])
  })
})

describe("tattoo", () => {
  it("attaches each entry as an enumerable own prop, found by keys, a spread and JSON, and hands the entries back", () => {
    const handle = { label: 'anthropic' }
    const shown = { vault_tok: 'v1', revision_seq: 3 }
    expect(tattoo(handle, shown)).to.equal(shown)
    expect(Object.keys(handle)).to.deep.equal(['label', 'vault_tok', 'revision_seq'])
    expect({ ...handle }).to.deep.equal({ label: 'anthropic', vault_tok: 'v1', revision_seq: 3 })
    expect(JSON.stringify(handle)).to.eq('{"label":"anthropic","vault_tok":"v1","revision_seq":3}')
  })

  it("leaves what it attached readonly and configurable unless told otherwise", () => {
    const handle = {}
    tattoo(handle, { vault_tok: 'v1' })
    expect(Object.getOwnPropertyDescriptor(handle, 'vault_tok')).to.include({ enumerable: true, writable: false, configurable: true })
  })

  it("throws on assigning to a readonly prop", () => {
    const handle: { vault_tok?: string } = {}
    tattoo(handle, { vault_tok: 'v1' })
    expect(() => { handle.vault_tok = 'v2' }).to.throw(TypeError)
    adorn(handle, 'vault_tok', 'v2')
    expect(handle.vault_tok).to.eq('v2')
  })

  // tattoo @example
  it("fixes for good what it attaches with configurable false", () => {
    const handle = {}
    tattoo(handle, { vault_tok: 'v1' }, { configurable: false })
    expect(Reflect.set(handle, 'vault_tok', 'v2')).to.be.false
    expect(Reflect.deleteProperty(handle, 'vault_tok')).to.be.false
    expect(() => adorn(handle, 'vault_tok', 'v2')).to.throw(TypeError)
    expect(handle).to.deep.equal({ vault_tok: 'v1' })
  })

  it("leaves a prop writable but not configurable assignable, never removable", () => {
    const handle = {}
    tattoo(handle, { revision_seq: 1 }, { writable: true, configurable: false })
    expect(Reflect.set(handle, 'revision_seq', 2)).to.be.true
    expect(Reflect.deleteProperty(handle, 'revision_seq')).to.be.false
    expect(handle).to.deep.equal({ revision_seq: 2 })
  })
})

describe("tattooProp", () => {
  it("attaches one value as an enumerable own prop and hands it back", () => {
    const handle = { label: 'anthropic' }
    expect(tattooProp(handle, 'vault_tok', 'v1')).to.eq('v1')
    expect(Object.keys(handle)).to.deep.equal(['label', 'vault_tok'])
    expect(Reflect.set(handle, 'vault_tok', 'v2')).to.be.false
    expect(Object.getOwnPropertyDescriptor(handle, 'vault_tok')).to.include({ value: 'v1', enumerable: true, writable: false, configurable: true })
  })

  it("leaves a prop assignable only when told writable", () => {
    const handle = {}
    tattooProp(handle, 'revision_seq', 1, { writable: true })
    expect(Reflect.set(handle, 'revision_seq', 2)).to.be.true
    expect(handle).to.deep.equal({ revision_seq: 2 })
  })
})

describe("nextMicrotask", () => {
  it("resolves once every microtask queued before it has run", async () => {
    const heard: string[] = []
    queueMicrotask(() => { heard.push('queued before') })
    await nextMicrotask()
    heard.push('after')
    expect(heard).to.deep.equal(['queued before', 'after'])
  })

  it("resolves before a task queued ahead of it runs", async () => {
    const heard: string[] = []
    setTimeout(() => { heard.push('task') }, 0)
    await nextMicrotask()
    expect(heard).to.deep.equal([])
  })
})
