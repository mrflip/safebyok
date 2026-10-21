import { describe, it, expect } from 'vitest'
import { memoryStore } from '../src/string-store'
import { localVaultDB } from '../src/local-vault-db'
import { VaultError } from '../src/errors'
import * as Ckeys from '../src/ckeys'
import * as TH from './test-helpers'


// The ckeys u1's main vault is filed under, spelled out rather than computed: they are stored.
const u1VaultPropsCkey = 'vault^acme^u1^main'
const u1BoxCkey = (boxlabel: string) => `box^acme^u1^main^${boxlabel}`

describe("localVaultDB", () => {
  it("resolves a vault never made as a good outcome holding null, as its first example shows", async () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    expect(await vaultDB.getVaultProps({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })

  it("holds a mebibyte in one record, and sets no limit on a vault, in bytes or in boxes, or on a name", () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    expect(vaultDB.maxRecordBytes).to.eq(1_048_576)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxBoxes).to.eq(Infinity)
    expect(vaultDB.maxNameBytes).to.eq(Infinity)
  })

  it("reads rows filed under the ckeys of earlier versions as absent, and leaves them be", async () => {
    const store = memoryStore()
    const earlier = ['vault:acme:u1:main', 'box:acme:u1:main:anthropic', '["vault","acme","u1","main"]', '["box","acme","u1","main","anthropic"]']
    for (const ckey of earlier) {
      store.write(ckey, JSON.stringify(ckey.includes('box') ? TH.boxOf('anthropic', 'one') : TH.vaultPropsOf('u1')))
    }
    const vaultDB = localVaultDB({ store })
    expect(await TH.expectingGood(vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
    expect(await TH.expectingGood(vaultDB).getBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
    expect(await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
    expect(store.ckeys()).to.have.members(earlier)
  })

  it("reads boxes as written today, with a sidecar and with an empty one, and writes them back the same", async () => {
    // A stored vault is a contract: these rows are byte for byte what putBox() writes today.
    const store = memoryStore()
    const emptied = TH.boxOf('openai', 'two', { sidecar: {} })
    const sidecarRow = JSON.stringify(TH.boxOf('anthropic', 'one'))
    const emptiedRow = JSON.stringify(emptied)
    store.write(u1VaultPropsCkey, JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(u1BoxCkey('anthropic'), sidecarRow)
    store.write(u1BoxCkey('openai'), emptiedRow)
    const vaultDB = localVaultDB({ store })
    const summaries = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))
    expect(summaries.map((box) => TH.summaryOf(box)?.sidecar)).to.deep.equal([{ note: 'a test box' }, {}])
    const prev = await TH.expectingGood(vaultDB).getBox(TH.scopeOf('u1'), 'openai')
    expect(prev).to.deep.equal(emptied)
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), { vault_id: 'vault-id-u1', revision_tok: 'rev-two' }, emptied)
    expect(store.read(u1BoxCkey('openai'))).to.eq(emptiedRow)
  })

  it("lists a box written before the sidecar, with a note, as damaged: no earlier record is read", async () => {
    const store = memoryStore()
    const { sidecar: _sidecar, whisper_codec: _codec, whisper_schema_version: _version, ...rest } = TH.boxOf('anthropic', 'one')
    store.write(u1VaultPropsCkey, JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(u1BoxCkey('anthropic'), JSON.stringify({ ...rest, format: 'safebyok-box-v2', note: 'a test box' }))
    const vaultDB = localVaultDB({ store })
    expect(await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: 'rev-one' }])
  })

  it("lists a row that is not JSON as damaged, under the boxlabel it is stored under, beside the sound ones", async () => {
    const store = memoryStore()
    const scope = TH.scopeOf('u1')
    store.write(Ckeys.vaultProps(scope), JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(Ckeys.box(scope, 'openai'), JSON.stringify(TH.boxOf('openai', 'two')))
    store.write(Ckeys.box(scope, 'anthropic'), '{"not": json')
    const listed = await TH.expectGood(localVaultDB({ store }).listBoxes(scope))
    expect(listed[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
    expect(listed[1]).to.include({ boxlabel: 'openai', revision_tok: 'rev-two', damaged: false })
    // Listed, never repaired: the row is still there for forensics.
    expect(store.read(Ckeys.box(scope, 'anthropic'))).to.eq('{"not": json')
  })

  it("deletes a damaged row, JSON or not, holding no revision, as the one a deletion naming none means", async () => {
    const store = memoryStore()
    const scope = TH.scopeOf('u1')
    store.write(Ckeys.vaultProps(scope), JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(Ckeys.box(scope, 'anthropic'), '{"not": json')
    store.write(Ckeys.box(scope, 'openai'), JSON.stringify({ boxlabel: 'openai', revision_tok: '' }))
    const vaultDB = localVaultDB({ store })
    expect(await TH.expectingGood(vaultDB).delBox(scope, 'anthropic', TH.deleting(null))).to.deep.equal({ outcome: 'deleted' })
    expect(await TH.expectingGood(vaultDB).delBox(scope, 'openai', TH.deleting(null))).to.deep.equal({ outcome: 'deleted' })
    expect(await TH.expectingGood(vaultDB).listBoxes(scope)).to.have.lengthOf(0)
  })

  it("deletes a damaged row that holds a revision as another, for a deletion naming none", async () => {
    const store = memoryStore()
    const scope = TH.scopeOf('u1')
    store.write(Ckeys.vaultProps(scope), JSON.stringify(TH.vaultPropsOf('u1')))
    const sidecarless = TH.omitting(TH.boxOf('anthropic', 'one'), 'sidecar')
    store.write(Ckeys.box(scope, 'anthropic'), JSON.stringify(sidecarless))
    const vaultDB = localVaultDB({ store })
    expect(await TH.expectingGood(vaultDB).listBoxes(scope)).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: 'rev-one' }])
    expect(await TH.expectingGood(vaultDB).delBox(scope, 'anthropic', TH.deleting(null))).to.deep.equal({ outcome: 'deleted_other' })
    expect(store.read(Ckeys.box(scope, 'anthropic'))).to.be.null
  })

  it("stores each record as its JSON, under its kind and scope joined on ^", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    expect(store.read(u1VaultPropsCkey)).to.eq(JSON.stringify(TH.vaultPropsOf('u1')))
    expect(store.read(u1BoxCkey('anthropic'))).to.eq(JSON.stringify(TH.boxOf('anthropic', 'one')))
    expect(store.ckeys()).to.have.members([u1VaultPropsCkey, u1BoxCkey('anthropic')])
  })

  it("refuses a mangled row with kind 'corrupt_record', quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    store.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v3","shhh":"SUPERSECRET"}')
    const refusal = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.message).to.not.include('SUPERSECRET')
  })

  it("refuses a row that is not JSON at all, quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    store.write(u1BoxCkey('anthropic'), 'SUPERSECRET{')
    const refusal = await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), 'anthropic'), 'corrupt_record')
    expect(refusal.message).to.match(/did not read back as JSON/)
    expect(refusal.message).to.not.include('SUPERSECRET')
  })

  it("refuses a record that names a scope or label other than the one asked for", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    // u2's vault props smuggled into u1's slot, and a box row moved under another label.
    store.write(u1VaultPropsCkey, JSON.stringify(TH.vaultPropsOf('u2')))
    const elsewhere = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'corrupt_record')
    expect(elsewhere.message).to.match(/different app, user, or vault/)
    store.write(u1BoxCkey('other_box'), JSON.stringify(TH.boxOf('anthropic', 'one')))
    const moved = await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), 'other_box'), 'corrupt_record')
    expect(moved.message).to.match(/different boxlabel/)
  })
})

describe("localVaultDB, as it is made", () => {
  const BadOpts = [
    [undefined,                                          'nothing at all'],
    [{},                                                 'a bag with no store'],
    [{ store: { read: () => null } },                    'a store missing four of its five calls'],
    [{ store: memoryStore(), logger: 'console' },        'a logger that is not a VaultLogger'],
  ] as const

  for (const [opts, blurb] of BadOpts) {
    it(`refuses ${blurb} with kind 'bad_option'`, () => {
      expect(() => localVaultDB(opts as unknown as Parameters<typeof localVaultDB>[0])).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    })
  }

  it("takes a store bare of a bag, by mistake, as no store: kind 'bad_option'", () => {
    expect(() => localVaultDB(memoryStore() as unknown as Parameters<typeof localVaultDB>[0])).to.throw(VaultError, /one bag of options/)
  })

  it("logs a listener that throws through its logger, the write it heard of landed", async () => {
    const spy = TH.spyLogger()
    const vaultDB = localVaultDB({ store: memoryStore(), logger: spy.logger })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener that throws') })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    expect(await TH.expectingGood(vaultDB).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
  })

  it("refuses a write past the store's quota as storage_unavailable, the store's own error its cause, writing nothing", async () => {
    const quota = new Error('The quota has been exceeded.')
    const store = memoryStore()
    const full = { ...store, write: () => { throw quota } }
    const vaultDB = localVaultDB({ store: full })
    const refusal = await TH.expectBad(vaultDB.ensureVaultProps(TH.vaultPropsOf('u1')), 'storage_unavailable')
    expect(refusal.cause).to.eq(quota)
    expect(store.ckeys()).to.have.lengthOf(0)
  })
})
