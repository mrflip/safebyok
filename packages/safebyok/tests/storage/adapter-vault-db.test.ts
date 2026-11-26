import { describe, expect, it } from 'vitest'
import { Errors, SX } from 'safebyok-big/internals'
import * as Phrases from '../../src/phrases'
import { AdapterVaultDB } from '../../src/storage/adapter-vault-db'
import type { BirthManifest, GetManifest, ListManifest, Received, RootRows, StatsManifest, WorldManifest, WriteManifest } from '../../src/shapes/shapes-manifest'
import * as ManifestTags from '../../src/storage/manifest-tags'
import { type BirthBankAsk, type GetAsk, type GetWorldAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type WriteAsk, birthPutsOf } from '../../src/shapes/shapes-asks'
import { StoreLimitCap, StoreLimitFloor, StoreLimitLeastBoxes } from '../../src/shapes/shapes-vault-stats'
import { Shell } from '../../src/shapes/shapes-thing'
import type { VaultEvent, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import * as Throwers from '../../src/refusals/throwers'
import { readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** A concrete adapter whose every step does what the test hands it: throws, or reports the manifest `step` gives, with each root `'same'` in `tracked`,
 * a `read_tc` made now, no ancestor and, unless `isBanktokless`, the void banktok, unless it gives them.
 */
class ScriptedVaultDB extends AdapterVaultDB {
  receive: ((received: Received) => void) | null = null
  onEnded: (() => void) | null = null
  readonly step: () => object
  readonly isBanktokless: boolean

  constructor(step: () => object, isBanktokless = false) {
    super()
    this.step = step
    this.isBanktokless = isBanktokless
  }

  /** What `step` reports, with the defaults above unless it gives them. */
  #report(): unknown {
    const banktok = this.isBanktokless ? {} : { banktok: SX.VoidLifeTok }
    return { ...banktok, tracked: { bank: 'same', gate: 'same', box: 'same' }, read_tc: readTcNow(), ancestor: null, ...this.step() }
  }

  protected doGetThing(_ask: GetAsk): GetManifest { return this.#report() as GetManifest }
  protected doWriteThing(_ask: WriteAsk): WriteManifest { return this.#report() as WriteManifest }
  protected doListThings(_ask: ListAsk): ListManifest { return this.#report() as ListManifest }
  protected doBirthBank(_ask: BirthBankAsk): BirthManifest { return this.#report() as BirthManifest }
  protected doGetWorld(_ask: GetWorldAsk): WorldManifest { return this.#report() as WorldManifest }
  protected doStats(_ask: StatsAsk): StatsManifest { return this.#report() as StatsManifest }
  protected override doWatch(_scope: ThingWatchScope, receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void, onEnded: () => void): () => void {
    this.receive = receive
    this.onEnded = onEnded
    return () => { this.receive = null }
  }
}

/** A get's manifest whose actual row is `actual`, null for none, with its tags made from that row. */
function getManifestOf(actual: unknown): object { return { tags: ManifestTags.getTagsOf(actual), actual } }

/** A write's manifest of `ask` over the `ante` row, null for none, with its tags made from that row: the ask's record where `written`, else the ante row. */
function writeManifestOf(ask: WriteAsk, ante: unknown, written: boolean): object { return { tags: ManifestTags.writeTagsOf(ask, ante, written), actual: written ? ask.record : ante } }

/** A listing's manifest whose parent is `actual`, null for none, with its tags made from that row, and `children`, each at its own labelpath. */
function listManifestOf(actual: unknown, children: readonly { labelpath: string }[] = []): object {
  return { tags: ManifestTags.getTagsOf(actual), actual, children: children.map((child) => ({ labelpath: child.labelpath, raw: child })) }
}

/** No root stored. */
const NoRoots: RootRows = { bank: null, gate: null, root: null }

/** A birth's manifest of `ask` over the `ante` roots, with its tags made from them: the ask's records where `written`, else the ante roots. */
function birthManifestOf(ask: BirthBankAsk, ante: RootRows, written: boolean): object {
  return { tags: ManifestTags.birthTagsOf(birthPutsOf(ask), ante, written), actual: written ? { bank: ask.bank, gate: ask.gate, root: ask.root } : ante }
}

/** The three roots `TH.birthBankAskOf()` writes. */
function bornRootsOf(): RootRows { const { bank, gate, root } = TH.birthBankAskOf(); return { bank, gate, root } }

/** A live gate at another revision than the one `TH.birthAskOf()` would write: a birth over it is stale. */
const OtherGate = TH.gateThingOf({ revtok: TH.OtherRevtok })

/** The records of the notices a watcher of the test bank gets over `vaultDB`. */
function noticedRecordsOver(vaultDB: ScriptedVaultDB): VaultItemEvent['val'][] {
  const noticedRecords: VaultItemEvent['val'][] = []
  vaultDB.watch(TH.ThingBank, (event) => { if (event.eventkind === 'item') { noticedRecords.push(event.val) } }, () => undefined)
  return noticedRecords
}

/** A step that throws a refusal carrying a row as its dbhas. */
function thrower(): never {
  const gate = TH.gateThingOf()
  throw Throwers.taggedRefusal(TH.replaceAskOf(gate, TH.nextOf(gate)), { act: 'policied', actual: gate, refusaltag: 'ProvedWayinMoved' })
}

/** A value that throws on any look at it: what a broken backend might throw, or a broken host might ask. */
const Booby = new Proxy({}, { get() { throw new Error('boom') }, getPrototypeOf() { throw new Error('boom') }, has() { throw new Error('boom') } })

/** A watcher whose handler throws on its first notice, after two Things were received; the notices it got and the bad news onBadNews got. */
function watchWithThrowingHandler() {
  const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
  const notices: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  vaultDB.watch(TH.ThingBank, (event) => { notices.push(event); if (notices.length === 1) { throw new Error('host bug') } }, (news) => { badNews.push(news) })
  vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok })
  vaultDB.receive?.({ record: TH.gateThingOf(), banktok: SX.VoidLifeTok })
  return { notices, badNews }
}

describe("AdapterVaultDB, a step that throws", () => {
  it("answers storage_unavailable for a backend's own error, with the verb and the loggable ask", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ act: 'unclassified_storing', banktok: SX.VoidLifeTok, tracked: 'unread', dbhas: null })
    expect(err.meta).to.deep.include({ oplabel: 'writeThing' })
    expect(answer.ask).to.deep.include(TH.GateScope)
  })

  it("answers a refusal unchanged", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Errors.VaultError('identity_revoked', 'The backend no longer serves this user.') })
    await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'identity_revoked')
  })

  it("never throws, even for a failure it cannot look at", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw Booby }) // eslint-disable-line @typescript-eslint/only-throw-error
    const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'unexpected_error')
    expect(err.message).to.eq(Phrases.AnswerNotMade)
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing' })
  })

  it("answers a listing that throws with no children, no parentage, no deltas, no damaged rows, and a read_tc of when it was refused", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryListThings(TH.listAskAt('box'))
    await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', dbhas: null, parentage: [], deltas: [], damaged_rows: [] })
    expect(answer.read_tc).to.match(TH.ReadTcPattern)
  })

  it("answers a bank's birth that throws with its verb", async () => {
    const vaultDB = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answer = await vaultDB.tryBirthBank(TH.birthBankAskOf())
    const err = await TH.expectBad(Promise.resolve(answer), 'storage_unavailable')
    expect(err.meta).to.deep.include({ oplabel: 'birthBank' })
    expect(answer).to.deep.include({ act: 'unclassified_storing', dbhas: null })
    expect(answer.ask).to.deep.include({ op: 'birth', ...TH.ThingBank })
  })

  it("never throws for an ask it cannot look at", async () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    const answer = await vaultDB.tryWriteThing(Booby as never)
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', ask: {} })
    expect(answer.ok ? null : answer.err.message).to.eq(Phrases.AnswerNotMade)
  })
})

describe("AdapterVaultDB.tryGetThing(ask), a store that reports oddly", () => {
  it("refuses, as a broken store, a get whose tags are not those of its row", async () => {
    const live = TH.gateThingOf()
    for (const manifest of [{ tags: { presence: 'live' }, actual: null }, { tags: { presence: 'void' }, actual: live }, { tags: { presence: 'gone' }, actual: live }]) {
      const vaultDB = new ScriptedVaultDB(() => manifest)
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("answers gotvoid with the shell as its dbhas where there is no row", async () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    expect(await vaultDB.tryGetThing(TH.getGateAskOf())).to.deep.include({ ok: true, act: 'gotvoid', val: null, dbhas: Shell.of(TH.GateScope) })
  })

  it("refuses, as a broken store, tags of another shape", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ tags: { presence: 'here' }, actual: null }))
    await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
  })
})

describe("AdapterVaultDB.tryWriteThing(ask), a store that reports oddly", () => {
  it("refuses, as a broken store, a storage policy's verdict whose refusal is not a tag of PolicyPhrases", async () => {
    const gate     = TH.gateThingOf()
    const ask      = TH.replaceAskOf(gate, TH.nextGateOf(gate), { policies: ['add_passkey'] })
    const manifest = { tags: ManifestTags.writeTagsOf(ask, gate, false), actual: gate }
    for (const verdict of [{ ok: false, refusaltag: 'PasskeyGone' }, { ok: false, message: Phrases.PolicyPhrases.PasskeyStored }]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ...manifest, tags: { ...manifest.tags, policies: { add_passkey: verdict } } }))
      await TH.expectBad(vaultDB.tryWriteThing(ask), 'storage_issue')
    }
  })

  it("refuses, as a broken store, a write it reports making with no row", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ...writeManifestOf(TH.birthAskOf(), null, true), actual: null }))
    await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
  })

  it("answers the row the datastore reports writing, not the ask's record", async () => {
    const ask     = TH.birthAskOf()
    const written = { ...ask.record, written_at: ask.record.written_at + 1 }
    const vaultDB = new ScriptedVaultDB(() => ({ ...writeManifestOf(ask, null, true), actual: written }))
    expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'born', val: written })
  })
})

describe("AdapterVaultDB.tryListThings(ask), a store that reports oddly", () => {
  it("lists each child of the parent's life, sorted by labelpath, as damaged each that fails its kind's checks, and leaves out a child of an earlier life", async () => {
    const earlier = TH.boxThingOf('aaa', { lifepath: `${TH.lifepathPlus(TH.Life0, 1)}/${TH.Life0}` })
    const damaged = { ...TH.boxThingOf('bad'), whisper_sealed: 'not sealed' }
    const vaultDB = new ScriptedVaultDB(() => listManifestOf(TH.rootBoxOf(), [TH.boxThingOf('openai'), earlier, damaged, TH.boxThingOf('anthropic')]))
    const answer  = await vaultDB.tryListThings(TH.listAskAt('box'))
    expect(answer.ok).to.equal(true)
    expect(answer.deltas.map(({ labelpath }) => labelpath)).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(answer.damaged_rows.map(({ labelpath }) => labelpath)).to.deep.equal(['box/bad'])
  })

  it("reads no child under a parent that is not live", async () => {
    const vaultDB = new ScriptedVaultDB(() => listManifestOf(TH.boxTombOf(TH.rootBoxOf()), [TH.boxThingOf('openai'), { labelpath: 'box/aa/deep' }]))
    expect(await vaultDB.tryListThings(TH.listAskAt('box'))).to.deep.include({ ok: false, act: 'gone', parentage: [], deltas: [], damaged_rows: [] })
  })

  it("refuses, as a broken store, a child reported more than one label under the parent, or a child whose record is at another labelpath than reported", async () => {
    const deep  = TH.boxThingOf('aa', { labelpath: 'box/aa/deep' })
    const moved = { labelpath: 'box/anthropic', raw: TH.boxThingOf('openai') }
    for (const children of [[{ labelpath: deep.labelpath, raw: deep }], [moved]]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ...listManifestOf(TH.rootBoxOf()), children }))
      await TH.expectBad(vaultDB.tryListThings(TH.listAskAt('box')), 'storage_issue')
    }
  })

  it("refuses, as a broken store, a listing whose tags are not those of its parent", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ ...listManifestOf(TH.rootBoxOf()), tags: { presence: 'gone' } }))
    await TH.expectBad(vaultDB.tryListThings(TH.listAskAt('box')), 'storage_issue')
  })
})

describe("AdapterVaultDB.tryBirthBank(ask), a store that reports oddly", () => {
  it("answers a birth the datastore reports writing with the roots it wrote, and one over a live bank with the roots stored", async () => {
    const born = new ScriptedVaultDB(() => birthManifestOf(TH.birthBankAskOf(), NoRoots, true))
    expect(await born.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: true, act: 'born', val: bornRootsOf() })
    const stored  = { bank: TH.bankThingOf({ revtok: TH.OtherRevtok }), gate: OtherGate, root: TH.rootBoxOf({ revtok: TH.OtherRevtok }) }
    const passing = new ScriptedVaultDB(() => birthManifestOf(TH.birthBankAskOf(), stored, false))
    expect(await passing.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: true, act: 'passed', val: stored })
  })

  it("refuses, as a broken store, a birth it reports writing with a root missing, or unwritten over a live bank with a root missing", async () => {
    const written  = { ...birthManifestOf(TH.birthBankAskOf(), NoRoots, true), actual: { ...bornRootsOf(), root: null } }
    const unrooted = birthManifestOf(TH.birthBankAskOf(), { bank: TH.bankThingOf({ revtok: TH.OtherRevtok }), gate: null, root: null }, false)
    for (const manifest of [written, unrooted]) {
      const vaultDB = new ScriptedVaultDB(() => manifest)
      await TH.expectBad(vaultDB.tryBirthBank(TH.birthBankAskOf()), 'storage_issue')
    }
  })

  it("refuses, as a broken store, a birth whose tags are not those of its roots, or that it reports writing where the act is no write", async () => {
    const otherTags = { ...birthManifestOf(TH.birthBankAskOf(), { ...NoRoots, gate: OtherGate }, false), actual: NoRoots }
    const wroteOver = { ...birthManifestOf(TH.birthBankAskOf(), { ...NoRoots, gate: OtherGate }, false), tags: ManifestTags.birthTagsOf(birthPutsOf(TH.birthBankAskOf()), { ...NoRoots, gate: OtherGate }, true) }
    for (const manifest of [otherTags, wroteOver]) {
      const vaultDB = new ScriptedVaultDB(() => manifest)
      await TH.expectBad(vaultDB.tryBirthBank(TH.birthBankAskOf()), 'storage_issue')
    }
  })
})

describe("AdapterVaultDB.tryGetWorld(ask), a store that reports oddly", () => {
  it("answers each root stored, and the shell of each that is not", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ actual: { ...NoRoots, gate: TH.gateThingOf() } }))
    const answer  = await vaultDB.tryGetWorld(TH.getWorldAskOf())
    expect(answer).to.deep.include({ ok: true, act: 'got', val: { bank: Shell.of(TH.BankScope), gate: TH.gateThingOf(), root: Shell.of(TH.RootScope) } })
  })

  it("refuses, as a broken store, a root at another address, and as a damaged row one that fails its kind's checks", async () => {
    const elsewhere = new ScriptedVaultDB(() => ({ actual: { ...NoRoots, gate: { ...TH.gateThingOf(), banklabel: 'other' } } }))
    await TH.expectBad(elsewhere.tryGetWorld(TH.getWorldAskOf()), 'storage_issue')
    const damaged = new ScriptedVaultDB(() => ({ actual: { ...NoRoots, gate: { ...TH.gateThingOf(), wayins: 'none' } } }))
    await TH.expectBad(damaged.tryGetWorld(TH.getWorldAskOf()), 'damaged_row')
  })
})

describe("AdapterVaultDB.tryStats(ask), a store that reports oddly", () => {
  const Counted = { count: 2, live_count: 1, size: 300 }
  const statsOf = (overrides: object) => ({ box: Counted, gate: Counted, max: { count: StoreLimitCap, size: StoreLimitCap }, ...overrides })

  it("answers the stats a concrete adapter reports", async () => {
    const vaultDB = new ScriptedVaultDB(() => ({ stats: statsOf({}) }))
    expect(await vaultDB.tryStats(TH.statsAskOf())).to.deep.include({ ok: true, act: 'got', val: statsOf({}) })
  })

  it("answers a limit of exactly two boxes and the floor in bytes", async () => {
    const stats = statsOf({ max: { count: StoreLimitLeastBoxes, size: StoreLimitFloor } })
    const vaultDB = new ScriptedVaultDB(() => ({ stats }))
    expect(await vaultDB.tryStats(TH.statsAskOf())).to.deep.include({ ok: true, val: stats })
  })

  it("refuses, as a broken store, stats with a field missing, a count that is no whole number, or a limit of Infinity, past the cap, or under two boxes or the floor in bytes", async () => {
    for (const stats of [statsOf({ gate: undefined }), statsOf({ box: { ...Counted, size: 1.5 } }), statsOf({ box: { ...Counted, live_count: -1 } }),
      statsOf({ max: { count: Infinity, size: StoreLimitCap } }), statsOf({ max: { count: StoreLimitCap, size: StoreLimitCap + 1 } }),
      statsOf({ max: { count: StoreLimitLeastBoxes - 1, size: StoreLimitCap } }), statsOf({ max: { count: StoreLimitCap, size: StoreLimitFloor - 1 } }),
      statsOf({ extra: 1 })]) {
      const vaultDB = new ScriptedVaultDB(() => ({ stats }))
      await TH.expectBad(vaultDB.tryStats(TH.statsAskOf()), 'storage_issue')
    }
  })
})

describe("AdapterVaultDB, the read_tc of an answer", () => {
  it("answers the read_tc a concrete adapter reports, good or refused, from a get, a write or a birth", async () => {
    const read_tc = readTcNow()
    for (const manifest of [getManifestOf(null), getManifestOf(TH.gateThingOf())]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ...manifest, read_tc }))
      expect(await vaultDB.tryGetThing(TH.getGateAskOf())).to.deep.include({ read_tc })
    }
    const writing = new ScriptedVaultDB(() => ({ ...writeManifestOf(TH.birthAskOf(), OtherGate, false), read_tc }))
    const birthing = new ScriptedVaultDB(() => ({ ...birthManifestOf(TH.birthBankAskOf(), { ...NoRoots, gate: OtherGate }, false), read_tc }))
    expect(await writing.tryWriteThing(TH.birthAskOf())).to.deep.include({ ok: false, act: 'stale', read_tc })
    expect(await birthing.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', read_tc })
  })

  it("refuses, as a broken store, a report from a get, a write, a list or a birth with no read_tc, or one that is no UUID version 7", async () => {
    for (const read_tc of [undefined, crypto.randomUUID(), readTcNow().toUpperCase(), 7]) {
      const getting  = new ScriptedVaultDB(() => ({ ...getManifestOf(null), read_tc }))
      const writing  = new ScriptedVaultDB(() => ({ ...writeManifestOf(TH.birthAskOf(), null, true), read_tc }))
      const listing  = new ScriptedVaultDB(() => ({ ...listManifestOf(null), read_tc }))
      const birthing = new ScriptedVaultDB(() => ({ ...birthManifestOf(TH.birthBankAskOf(), NoRoots, true), read_tc }))
      await TH.expectBad(getting.tryGetThing(TH.getGateAskOf()), 'storage_issue')
      await TH.expectBad(writing.tryWriteThing(TH.birthAskOf()), 'storage_issue')
      await TH.expectBad(listing.tryListThings(TH.listAskAt('box')), 'storage_issue')
      await TH.expectBad(birthing.tryBirthBank(TH.birthBankAskOf()), 'storage_issue')
    }
  })

  it("answers a listing's read_tc as its Kids value's own", async () => {
    const read_tc = readTcNow()
    const kids    = { modelkind: 'kids', parentpath: 'box', parentlife: TH.rootBoxOf().lifepath, items: {}, gones: {} }
    const vaultDB = new ScriptedVaultDB(() => ({ ...listManifestOf(TH.rootBoxOf()), read_tc }))
    expect(await vaultDB.tryListThings(TH.listAskAt('box'))).to.deep.include({ read_tc, val: { ...kids, read_tc } })
  })

  it("refuses, as a broken store, a get whose tracked is no object", async () => {
    for (const report of [{ tracked: undefined }, { tracked: null }, { tracked: 'same' }]) {
      const vaultDB = new ScriptedVaultDB(() => ({ ...getManifestOf(null), ...report }))
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    }
  })

  it("answers the void lifetok to a get, a listing, a birth or a get of the world whose banktok is no lifetok", async () => {
    for (const report of [{ banktok: 'a banktok' }, { banktok: null }, { banktok: undefined }]) {
      const answers = [
        await new ScriptedVaultDB(() => ({ ...getManifestOf(null), ...report })).tryGetThing(TH.getGateAskOf()),
        await new ScriptedVaultDB(() => ({ ...listManifestOf(TH.rootBoxOf()), ...report })).tryListThings(TH.listAskAt('box')),
        await new ScriptedVaultDB(() => ({ ...birthManifestOf(TH.birthBankAskOf(), NoRoots, true), ...report })).tryBirthBank(TH.birthBankAskOf()),
        await new ScriptedVaultDB(() => ({ actual: NoRoots, ...report })).tryGetWorld(TH.getWorldAskOf()),
      ]
      expect(answers.map(({ ok, banktok }) => ({ ok, banktok }))).to.deep.equal(Array.from({ length: 4 }, () => ({ ok: true, banktok: SX.VoidLifeTok })))
    }
  })

  it("refuses, as a broken store, a report from a get, a write, a listing, a birth, a get of the world or stats with no banktok", async () => {
    const answers = [
      new ScriptedVaultDB(() => getManifestOf(null), true).tryGetThing(TH.getGateAskOf()),
      new ScriptedVaultDB(() => writeManifestOf(TH.birthAskOf(), null, true), true).tryWriteThing(TH.birthAskOf()),
      new ScriptedVaultDB(() => listManifestOf(TH.rootBoxOf()), true).tryListThings(TH.listAskAt('box')),
      new ScriptedVaultDB(() => birthManifestOf(TH.birthBankAskOf(), NoRoots, true), true).tryBirthBank(TH.birthBankAskOf()),
      new ScriptedVaultDB(() => ({ actual: NoRoots }), true).tryGetWorld(TH.getWorldAskOf()),
      new ScriptedVaultDB(() => ({ stats: {} }), true).tryStats(TH.statsAskOf()),
    ]
    for (const answer of answers) {
      const err = await TH.expectBad(answer, 'storage_issue')
      expect(err.message).to.eq(Phrases.BanktokMissing)
    }
  })
})

describe("AdapterVaultDB, the banktok of an answer", () => {
  it("answers the banktok a concrete adapter reports, good or refused, from a get, a write, a list or a birth", async () => {
    const banktok  = TH.OtherLifetok
    const good     = new ScriptedVaultDB(() => ({ ...getManifestOf(null), banktok }))
    const writing  = new ScriptedVaultDB(() => ({ ...writeManifestOf(TH.birthAskOf(), OtherGate, false), banktok }))
    const listing  = new ScriptedVaultDB(() => ({ ...listManifestOf(TH.boxTombOf(TH.rootBoxOf())), banktok }))
    const birthing = new ScriptedVaultDB(() => ({ ...birthManifestOf(TH.birthBankAskOf(), { ...NoRoots, gate: OtherGate }, false), banktok }))
    const answers  = [
      await good.tryGetThing(TH.getGateAskOf()), await writing.tryWriteThing(TH.birthAskOf()), await listing.tryListThings(TH.listAskAt('box')),
      await birthing.tryBirthBank(TH.birthBankAskOf()), await good.tryGetThing(TH.getGateAskOf()),
    ]
    expect(answers.map((answer) => answer.ok)).to.deep.equal([true, false, false, false, true])
    expect(answers.map((answer) => answer.banktok)).to.deep.equal(Array.from({ length: 5 }, () => TH.OtherLifetok))
  })

  it("answers the void lifetok as its banktok where a concrete adapter reports it, and where the verb throws", async () => {
    const bankless  = new ScriptedVaultDB(() => getManifestOf(null))
    const throwing  = new ScriptedVaultDB(() => { throw new Error('connection reset') })
    const answers   = [
      await bankless.tryGetThing(TH.getGateAskOf()), await throwing.tryGetThing(TH.getGateAskOf()), await throwing.tryListThings(TH.listAskAt('box')),
      await throwing.tryBirthBank(TH.birthBankAskOf()),
    ]
    expect(answers.map((answer) => answer.banktok)).to.deep.equal([SX.VoidLifeTok, SX.VoidLifeTok, SX.VoidLifeTok, SX.VoidLifeTok])
  })
})

describe("AdapterVaultDB.watch(scope, onNotice, onBadNews, onEnded)", () => {
  it("hands the watch's onEnded to the concrete adapter", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    let endedCount = 0
    vaultDB.watch(TH.ThingBank, () => undefined, () => undefined, () => { endedCount += 1 })
    vaultDB.onEnded?.()
    expect(endedCount).to.eq(1)
  })

  it("hands the concrete adapter an onEnded that does nothing where the watch has none", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    vaultDB.watch(TH.ThingBank, () => undefined, () => undefined)
    expect(() => vaultDB.onEnded?.()).not.to.throw()
    expect(vaultDB.onEnded).to.be.a('function')
  })

  it("notifies of a sound Thing, and sends one that fails its checks to onBadNews", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: { ...TH.gateThingOf(), wayins: {} }, banktok: SX.VoidLifeTok })
    vaultDB.receive?.({ record: 'not a Thing', banktok: SX.VoidLifeTok })
    vaultDB.receive?.({ record: TH.gateThingOf(), banktok: SX.VoidLifeTok })
    expect(TH.maskedReadTcsOf(events)).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row', 'storage_issue'])
  })

  it("notifies of each change as one notice of its Thing, with the banktok received beside it", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: TH.bankThingOf().lifetok })
    vaultDB.receive?.({ record: TH.boxThingOf('anthropic'), banktok: TH.bankThingOf().lifetok })
    expect(TH.maskedReadTcsOf(events)).to.deep.equal([TH.boxThingOf(), TH.boxThingOf('anthropic')].map((box) => TH.itemEventOf(box, TH.bankThingOf().lifetok)))
    const read_tcs = events.map((event) => event.read_tc)
    expect(read_tcs.toSorted((one, two) => one.localeCompare(two)), 'a later notice is read later').to.deep.equal(read_tcs)
    expect(badNews).to.deep.equal([])
  })

  it("notifies with the bank's lifetok where the bank is the Thing itself, else the banktok received beside it", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    const events: VaultEvent[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, () => undefined)
    const otherLifetok = crypto.randomUUID()
    vaultDB.receive?.({ record: TH.bankThingOf({ lifetok: otherLifetok }), banktok: SX.VoidLifeTok })
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: TH.bankThingOf().lifetok })
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok })
    expect(events.map((event) => event.banktok)).to.deep.equal([otherLifetok, TH.bankThingOf().lifetok, SX.VoidLifeTok])
  })

  it("notifies with the read_tc received beside a Thing, else one made when it arrives", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    const events: VaultEvent[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, () => undefined)
    const told  = readTcNow()
    const early = readTcNow()
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok, read_tc: told })
    vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok })
    expect(events[0]?.read_tc).to.eq(told)
    const isMadeOnArrival = events[1]!.read_tc > early
    expect(isMadeOnArrival).to.be.true
  })

  it("sends a Thing whose read_tc is no UUID version 7 to onBadNews, as a broken store", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    for (const read_tc of [crypto.randomUUID(), readTcNow().toUpperCase(), 7, null]) {
      vaultDB.receive?.({ record: TH.boxThingOf(), banktok: SX.VoidLifeTok, read_tc })
    }
    expect(events).to.deep.equal([])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['storage_issue', 'storage_issue', 'storage_issue', 'storage_issue'])
  })

  it("sends a Thing of another bank to onBadNews, not to onNotice", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    const events: VaultEvent[] = []
    const badNews: Errors.VaultError[] = []
    vaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, (news) => { badNews.push(news) })
    vaultDB.receive?.({ record: TH.gateThingOf({ banklabel: 'other' }), banktok: SX.VoidLifeTok })
    expect(events).to.deep.equal([])
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['storage_issue'])
  })

  it("sends onBadNews the error a notice handler throws", () => {
    const { badNews } = watchWithThrowingHandler()
    expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['unexpected_error'])
  })

  it("keeps notifying the handler of later Things after it throws", () => {
    const { notices } = watchWithThrowingHandler()
    expect(notices.map(({ labelpath }) => labelpath)).to.deep.equal(['box/openai', 'gate'])
  })

  it("refuses a watch with no onBadNews", () => {
    const vaultDB = new ScriptedVaultDB(() => getManifestOf(null))
    TH.expectSyncRefusal(() => vaultDB.watch(TH.ThingBank, () => undefined, undefined as never), 'bad_record')
  })
})

describe("AdapterVaultDB, what a watcher is notified of from a verb's answer", () => {
  it("notifies of nothing an answer carries: a refusal's dbhas, a thrown refusal's, a good write's or birth's val, or a listing's parentage and deltas", async () => {
    const verbs: [() => object, (vaultDB: ScriptedVaultDB) => Promise<unknown>][] = [
      [() => getManifestOf(TH.gateThingOf()), (vaultDB) => vaultDB.tryGetThing(TH.getGateAskOf())],
      [() => writeManifestOf(TH.birthAskOf(), OtherGate, false), (vaultDB) => vaultDB.tryWriteThing(TH.birthAskOf())],
      [() => writeManifestOf(TH.birthAskOf(), null, true), (vaultDB) => vaultDB.tryWriteThing(TH.birthAskOf())],
      [() => birthManifestOf(TH.birthBankAskOf(), { ...NoRoots, gate: OtherGate }, false), (vaultDB) => vaultDB.tryBirthBank(TH.birthBankAskOf())],
      [() => birthManifestOf(TH.birthBankAskOf(), NoRoots, true), (vaultDB) => vaultDB.tryBirthBank(TH.birthBankAskOf())],
      [() => listManifestOf(TH.rootBoxOf(), [TH.boxThingOf('anthropic'), TH.boxThingOf('openai')]), (vaultDB) => vaultDB.tryListThings(TH.listAskAt('box'))],
      [() => listManifestOf(TH.boxTombOf(TH.rootBoxOf())), (vaultDB) => vaultDB.tryListThings(TH.listAskAt('box'))],
      [thrower, (vaultDB) => vaultDB.tryGetThing(TH.getGateAskOf())],
      [thrower, (vaultDB) => vaultDB.tryBirthBank(TH.birthBankAskOf())],
    ]
    for (const [step, verb] of verbs) {
      const vaultDB = new ScriptedVaultDB(step)
      const noticedRecords = noticedRecordsOver(vaultDB)
      await verb(vaultDB)
      await TH.aWhile()
      expect(noticedRecords).to.deep.equal([])
    }
  })
})
