import { describe, expect, it } from 'vitest'
import { Ckeys, isVaultError, localVaultDB, memoryStore } from 'safebyok'
import * as TH from 'safebyok/testing'
import { OutageVaultDB, makeOutage } from '../../src/lib/outage'

const scope = TH.scopeOf('u1')
const vaultProps = TH.vaultPropsOf('u1')

/** An OutageVaultDB over a fresh in-memory adapter, with its switch. */
const downOver = () => {
  const outage = makeOutage()
  const vaultDB = new OutageVaultDB(localVaultDB({ store: memoryStore() }), outage)
  return { outage, vaultDB }
}

describe("makeOutage", () => {
  it("starts up, and flips down and back", () => {
    const outage = makeOutage()
    expect(outage.isDown()).to.be.false
    outage.setDown(true)
    expect(outage.isDown()).to.be.true
    outage.setDown(false)
    expect(outage.isDown()).to.be.false
  })

  it("tells its listeners of each flip, and not of a setting that changes nothing", () => {
    const outage = makeOutage()
    let heard = 0
    const unsubscribe = outage.subscribe(() => { heard += 1 })
    outage.setDown(true)
    outage.setDown(true)
    outage.setDown(false)
    expect(heard).to.eq(2)
    unsubscribe()
    outage.setDown(true)
    expect(heard).to.eq(2)
  })
})

// While the switch is up, it is an adapter like any other, and owes the suite every adapter owes.
TH.describeVaultDB('OutageVaultDB, while up', () => new OutageVaultDB(localVaultDB({ store: memoryStore() }), makeOutage()))

describe("OutageVaultDB, while up", () => {
  it("says things through the logger of the adapter it wraps, the very same one", () => {
    const spy = TH.spyLogger()
    const inner = localVaultDB({ store: memoryStore(), logger: spy.logger })
    const vaultDB = new OutageVaultDB(inner, makeOutage())
    expect(vaultDB.logger).to.eq(inner.logger)
    vaultDB.logger.warn("heard by the inner adapter's logger")
    expect(spy.calls.map((heard) => heard.level)).to.deep.equal(['warn'])
  })

  it("lists a box its inner adapter finds damaged as damaged, and the sound ones as they are", async () => {
    const store = memoryStore()
    const vaultDB = new OutageVaultDB(localVaultDB({ store }), makeOutage())
    await TH.expectingGood(vaultDB).ensureVaultProps(vaultProps)
    await TH.expectingGood(vaultDB).putBox(scope, TH.boxOf('openai', 'two'), TH.noBoxYet)
    store.write(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), '{"not": json')
    // missing its whisper: the inner list finds it sound, and only a whole read finds it damaged
    const { whisper_ciphered: _gone, ...whisperless } = TH.boxOf('cohere', 'three')
    store.write(Ckeys.box(TH.scopeOf('u1'), 'cohere'), JSON.stringify(whisperless))
    const listed = await TH.expectingGood(vaultDB).listBoxes(scope)
    expect(listed.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['anthropic', true], ['cohere', true], ['openai', false]])
  })
})

/** An outage-switched adapter over a store holding `u1`'s vault, its props damaged but for their vault_id. */
const damagedOver = async () => {
  const store = memoryStore()
  const outage = makeOutage()
  const vaultDB = new OutageVaultDB(localVaultDB({ store }), outage)
  await TH.expectingGood(vaultDB).ensureVaultProps(vaultProps)
  await TH.expectingGood(vaultDB).putBox(scope, TH.boxOf('openai', 'two'), TH.noBoxYet)
  store.write(Ckeys.vaultProps(scope), JSON.stringify({ ...vaultProps, unlock_epoch: 'one' }))
  return { store, outage, vaultDB }
}

describe("OutageVaultDB, deleting a damaged vault", () => {
  it("hands the delete to its inner adapter, which reads the record as stored", async () => {
    const { store, vaultDB } = await damagedOver()
    await TH.expectBad(vaultDB.getVaultProps(scope), 'corrupt_record')
    await TH.expectingGood(vaultDB).delDamagedVault(scope)
    expect(store.ckeys()).to.deep.equal([])
  })

  it("refuses while the pretend backend is down, deleting nothing", async () => {
    const { store, outage, vaultDB } = await damagedOver()
    outage.setDown(true)
    await TH.expectBad(vaultDB.delDamagedVault(scope), 'storage_unavailable')
    expect(store.ckeys()).to.have.lengthOf(2)
  })
})

// Each refusal is checked against the host's own copy of the package too: the provider branches
// on isVaultError, which goes by class.
describe("OutageVaultDB, while down", () => {
  it("refuses a read as storage_unavailable, as a real adapter whose backend is down", async () => {
    const { outage, vaultDB } = downOver()
    outage.setDown(true)
    expect(await TH.expectBad(vaultDB.getVaultProps(scope), 'storage_unavailable')).to.satisfy(isVaultError)
    expect(await TH.expectBad(vaultDB.listBoxes(scope), 'storage_unavailable')).to.satisfy(isVaultError)
  })

  it("refuses a write, and writes nothing", async () => {
    const { outage, vaultDB } = downOver()
    outage.setDown(true)
    expect(await TH.expectBad(vaultDB.ensureVaultProps(vaultProps), 'storage_unavailable')).to.satisfy(isVaultError)
    outage.setDown(false)
    expect(await TH.expectingGood(vaultDB).getVaultProps(scope)).to.be.null
  })

  it("serves again once the switch is back up", async () => {
    const { outage, vaultDB } = downOver()
    await TH.expectingGood(vaultDB).ensureVaultProps(vaultProps)
    outage.setDown(true)
    expect(await TH.expectBad(vaultDB.getVaultProps(scope), 'storage_unavailable')).to.satisfy(isVaultError)
    outage.setDown(false)
    expect(await TH.expectingGood(vaultDB).getVaultProps(scope)).to.deep.equal(vaultProps)
  })

  it("keeps watching through the outage", async () => {
    const { outage, vaultDB } = downOver()
    let heard = 0
    outage.setDown(true)
    const unsubscribe = vaultDB.subscribe(scope, () => { heard += 1 })
    outage.setDown(false)
    await TH.expectingGood(vaultDB).ensureVaultProps(vaultProps)
    expect(heard).to.be.greaterThan(0)
    unsubscribe()
  })

  it("states its inner adapter's limits as its own", () => {
    const inner = localVaultDB({ store: memoryStore() })
    const vaultDB = new OutageVaultDB(inner, makeOutage())
    expect(vaultDB.maxRecordBytes).to.eq(inner.maxRecordBytes)
    expect(vaultDB.maxVaultBytes).to.eq(inner.maxVaultBytes)
    expect(vaultDB.maxBoxes).to.eq(inner.maxBoxes)
  })
})
