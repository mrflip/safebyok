import { describe, expect, it } from 'vitest'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { type BoxThing, type GateThing, type Thing, ShellCited, childShellCited, lifeseqOf, sparseOf } from '../../src/storage/shapes-thing'
import { classifyListThings } from '../../src/storage/thing-classifier'
import type { ThingNotice } from '../../src/storage/vault-db'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'

/** A vaultDB holding the main gate as `stored`, written there by a birth. */
async function vaultDBWith(stored: GateThing = TH.gateThingOf()): Promise<MemoryVaultDB> {
  const vaultDB = new MemoryVaultDB()
  await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(stored)))
  return vaultDB
}

describe("MemoryVaultDB.tryGetThing(ask)", () => {
  it("answers gotvoid, with no Thing, where none is stored", async () => {
    const answer = await new MemoryVaultDB().tryGetThing(TH.getGateAskOf('nil'))
    expect(answer).to.deep.include({ ok: true, act: 'gotvoid', val: null, world: null })
  })

  it("refuses where none is stored and ifAbsent is 'fail'", async () => {
    const answer = await new MemoryVaultDB().tryGetThing(TH.getGateAskOf('fail'))
    expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null })
  })

  it("answers gotlive with the Thing stored", async () => {
    const vaultDB = await vaultDBWith()
    const answer = await vaultDB.tryGetThing(TH.getGateAskOf())
    expect(answer).to.deep.include({ ok: true, act: 'gotlive', val: TH.gateThingOf() })
  })

  it("answers with a copy, which the caller can change without changing the store", async () => {
    const vaultDB = await vaultDBWith()
    const val = await TH.expectGood(vaultDB.tryGetThing(TH.getGateAskOf())) as { auth: { planted?: boolean } }
    val.auth.planted = true
    const again = await TH.expectGood(vaultDB.tryGetThing(TH.getGateAskOf()))
    expect(again).to.deep.equal(TH.gateThingOf())
  })

  it("refuses an ask for a labelpath of no kind of Thing", async () => {
    await TH.expectBad(new MemoryVaultDB().tryGetThing({ ...TH.getGateAskOf(), labelpath: 'vault/main' }), 'bad_option')
  })

  it("refuses, never throws, for an ask that is not one", async () => {
    await TH.expectBad(new MemoryVaultDB().tryGetThing(null as never), 'bad_option')
  })
})

describe("MemoryVaultDB.tryWriteThing(ask), the plain path", () => {
  it("births the main gate over the shell, answering with the Thing written", async () => {
    const vaultDB = new MemoryVaultDB()
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf())
    expect(answer).to.deep.include({ ok: true, act: 'born', val: TH.gateThingOf(), world: null })
    const got = await TH.expectGood(vaultDB.tryGetThing(TH.getGateAskOf()))
    expect(got).to.deep.equal(TH.gateThingOf())
  })

  it("replaces the live gate it expects", async () => {
    const stored = TH.gateThingOf()
    const vaultDB = await vaultDBWith(stored)
    const next = TH.nextGateOf(stored)
    const answer = await vaultDB.tryWriteThing(TH.replaceAskOf(stored, next))
    expect(answer).to.deep.include({ ok: true, act: 'replaced', val: next })
  })

  it("takes a citation of no more than ThingCited names", async () => {
    const stored = TH.gateThingOf()
    const vaultDB = await vaultDBWith(stored)
    const { revtok, revseq, am, lifepath } = stored
    const answer = await vaultDB.tryWriteThing(TH.replaceAskOf({ revtok, revseq, am, lifepath }, TH.nextGateOf(stored)))
    expect(answer).to.deep.include({ ok: true, act: 'replaced' })
  })

  it("passes the live gate back, writing nothing, under ifPresent 'get' when it expected another", async () => {
    const stored = TH.gateThingOf()
    const vaultDB = await vaultDBWith(stored)
    const answer = await vaultDB.tryWriteThing({ ...TH.birthAskOf(TH.gateThingOf({ revtok: 'rev-other' })), ifPresent: 'get' })
    expect(answer).to.deep.include({ ok: true, act: 'passed', val: stored })
  })

  it("logs what the ask cites, never its wayins", async () => {
    const answer = await new MemoryVaultDB().tryWriteThing(TH.birthAskOf())
    expect(answer.ask).to.deep.include({ op: 'put', modelkind: 'gate', ...TH.GateScope })
    expect(JSON.stringify(answer.ask)).to.not.include(TH.BW.mainWayin.salt_b64)
  })
})

describe("MemoryVaultDB.tryWriteThing(ask), refused by the act tables", () => {
  const stored = TH.gateThingOf()
  const next   = TH.nextGateOf(stored)
  const later  = TH.nextGateOf(next)
  const lifeseq2 = lifeseqOf(2)
  const otherLife = { lifeseq: lifeseq2, lifepath: lifeseq2 }
  const ActCases = [
    // the store moved on:
    ["stale",  TH.replaceAskOf(stored, TH.nextGateOf(stored, { revtok: 'rev-1b' })), 'expects a revision the store has moved past'],
    ["retcon", TH.replaceAskOf(stored, next),                                         'resends a write that already landed'],
    ["forked", TH.replaceAskOf({ ...next, revtok: 'rev-fork' }, TH.nextGateOf(next)), 'expects the revseq stored under another revtok'],
    // the caller is ahead of the store, or confused:
    ["ahead",  TH.replaceAskOf(later, TH.nextGateOf(later)),                         'expects a revision the store has not reached'],
    ["clash",  TH.replaceAskOf({ ...next, ...otherLife }, { ...TH.nextGateOf(next), ...otherLife }), 'expects the revtok stored in another life'],
    ["camped", { ...TH.replaceAskOf(next, TH.nextGateOf(next)), ifPresent: 'fail' as const }, 'finds the live gate it expects under ifPresent fail'],
    ["stale",  TH.birthAskOf(TH.gateThingOf({ revtok: 'rev-other' })),               'births a gate over a live one'],
  ] as const

  for (const [act, ask, blurb] of ActCases) {
    it(blurb, async () => {
      const vaultDB = await vaultDBWith(stored)
      await TH.expectGood(vaultDB.tryWriteThing(TH.replaceAskOf(stored, next)))
      const answer = await vaultDB.tryWriteThing(ask)
      expect(answer).to.deep.include({ ok: false, act, dbhas: next })
    })
  }

  it("refuses a replacement that moves the stored born_at", async () => {
    const vaultDB = await vaultDBWith(stored)
    const answer = await vaultDB.tryWriteThing(TH.replaceAskOf(stored, TH.nextGateOf(stored, { born_at: TH.T0 + 1 })))
    const err = await TH.expectBad(Promise.resolve(answer), 'bad_record')
    expect(err.message).to.include(Phrases.BornAtNotStored)
    expect(answer).to.deep.include({ dbhas: stored })
  })

  it("refuses a write over nothing under ifAbsent 'fail'", async () => {
    const answer = await new MemoryVaultDB().tryWriteThing({ ...TH.birthAskOf(), ifAbsent: 'fail' })
    expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null })
  })

  it("carries what it refused, loggable, on its refusal", async () => {
    const vaultDB = await vaultDBWith(stored)
    const answer = await vaultDB.tryWriteThing(TH.birthAskOf(TH.gateThingOf({ revtok: 'rev-other' })))
    const err = await TH.expectBad(Promise.resolve(answer), 'stale_write')
    expect(err.meta).to.deep.include({ oplabel: 'writeThing', act: 'stale' })
    expect(JSON.stringify(err.meta)).to.not.include(TH.BW.mainWayin.salt_b64)
  })
})

describe("MemoryVaultDB.tryWriteThing(ask), under a storage policy", () => {
  const stored = TH.gateThingOf()

  it("replaces the passphrase wayin the gating proved against", async () => {
    const vaultDB = await vaultDBWith(stored)
    const ask = TH.replaceAskOf(stored, TH.nextGateOf(stored, { wayins: { main: TH.BW.otherMainWayin } }), { policies: ['replace_passphrase'] })
    expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'replaced' })
  })

  it("refuses to replace a passphrase wayin other than the one proved against", async () => {
    const vaultDB = await vaultDBWith(stored)
    const cited = { ...stored, wayins: { main: TH.BW.otherMainWayin } }
    const ask = TH.replaceAskOf(cited, TH.nextGateOf(stored, { wayins: { main: TH.BW.otherMainWayin } }), { policies: ['replace_passphrase'] })
    const answer = await vaultDB.tryWriteThing(ask)
    await TH.expectBad(Promise.resolve(answer), 'gate_issue')
    expect(answer).to.deep.include({ dbhas: stored })
  })

  it("adds a passkey wayin to a gate that has none", async () => {
    const vaultDB = await vaultDBWith(stored)
    const ask = TH.replaceAskOf(stored, TH.nextGateOf(stored, { wayins: TH.WithPasskey }), { policies: ['add_passkey'] })
    expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'replaced' })
  })

  it("refuses to revoke a passkey wayin from a gate that has none", async () => {
    const vaultDB = await vaultDBWith(stored)
    const ask = TH.replaceAskOf(stored, TH.nextGateOf(stored), { policies: ['revoke_passkey'] })
    await TH.expectBad(vaultDB.tryWriteThing(ask), 'gate_issue')
  })

  it("applies no policy to a birth", async () => {
    const ask = { ...TH.birthAskOf(), options: { policies: ['revoke_passkey' as const] } }
    expect(await new MemoryVaultDB().tryWriteThing(ask)).to.deep.include({ ok: true, act: 'born' })
  })
})

describe("MemoryVaultDB, a Thing stored that fails its checks", () => {
  const StoredCases = [
    ["damaged_row",   { ...TH.gateThingOf(), wayins: {} },                    'refuses a damaged gate as damaged'],
    ["damaged_row",   { ...TH.gateThingOf(), note: 'hi' },                    'refuses a gate with a field this version does not know'],
    ["storage_issue", { ...TH.gateThingOf(), banklabel: 'other' },            'refuses a gate filed at another scope as a broken store'],
    ["storage_issue", 'not a Thing',                                          'refuses a Thing that is not an object as a broken store'],
  ] as const

  for (const [refusalkind, raw, blurb] of StoredCases) {
    it(blurb, async () => {
      const vaultDB = new MemoryVaultDB()
      vaultDB._cheat_things(TH.ThingBank).set('gate', raw)
      await TH.expectBad(vaultDB.tryGetThing(TH.getGateAskOf()), refusalkind)
      await TH.expectBad(vaultDB.tryWriteThing(TH.birthAskOf()), refusalkind)
    })
  }
})

describe("MemoryVaultDB.watch(scope, onNotice)", () => {
  it("hears each Thing written in the bank, after the write", async () => {
    const vaultDB = new MemoryVaultDB()
    const notices: ThingNotice[] = []
    vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) })
    await vaultDB.tryWriteThing(TH.birthAskOf())
    await TH.eventually(() => notices.length === 1)
    expect(notices[0]).to.deep.equal({ act: 'gotlive', val: TH.gateThingOf(), world: null })
  })

  it("hears nothing of another bank, nor of a refused write", async () => {
    const vaultDB = await vaultDBWith()
    const notices: ThingNotice[] = []
    vaultDB.watch({ ...TH.ThingBank, banklabel: 'other' }, (notice) => { notices.push(notice) })
    vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) })
    await vaultDB.tryWriteThing(TH.birthAskOf(TH.gateThingOf({ revtok: 'rev-other' })))
    await TH.aWhile()
    expect(notices).to.have.lengthOf(0)
  })

  it("hears nothing once stopped", async () => {
    const vaultDB = new MemoryVaultDB()
    const notices: ThingNotice[] = []
    const stop = vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) })
    stop()
    await vaultDB.tryWriteThing(TH.birthAskOf())
    await TH.aWhile()
    expect(notices).to.have.lengthOf(0)
  })

  it("refuses a scope that is not a bank's", () => {
    TH.expectSyncRefusal(() => new MemoryVaultDB().watch({ userid: 'u1' } as never, () => undefined), 'bad_option')
  })
})

/** A vaultDB holding a bank born with its three roots. */
async function bornBank(): Promise<MemoryVaultDB> {
  const vaultDB = new MemoryVaultDB()
  await TH.expectGood(vaultDB.tryBirthBank(TH.birthBankAskOf()))
  return vaultDB
}

/** Write `thing` into `vaultDB`, born under its parent's life at `parentLifepath`. */
async function bornUnder(vaultDB: MemoryVaultDB, thing: Thing, parentLifepath: string): Promise<void> {
  const ask = TH.birthAskOf(thing, childShellCited(parentLifepath))
  await TH.expectGood(vaultDB.tryWriteThing(ask))
}

/** Write each of `boxes` into `vaultDB`, born under the root box's life 0, and return them. */
async function boxesBorn(vaultDB: MemoryVaultDB, ...boxes: BoxThing[]): Promise<BoxThing[]> {
  for (const box of boxes) { await bornUnder(vaultDB, box, TH.Life0) }
  return boxes
}

/** The children `vaultDB` lists under the Thing at `labelpath`, or throw. */
async function listedAt(vaultDB: MemoryVaultDB, labelpath: string): Promise<unknown> {
  const ask = TH.listAskAt(labelpath)
  return TH.expectGood(vaultDB.tryListThings(ask))
}

/** The Thing `vaultDB` holds at `labelpath`, or throw. */
async function gotAt(vaultDB: MemoryVaultDB, labelpath: string): Promise<unknown> {
  const ask = TH.getAskAt(labelpath)
  return TH.expectGood(vaultDB.tryGetThing(ask))
}

describe("MemoryVaultDB.tryWriteThing(ask), a box", () => {
  const box  = TH.boxThingOf()
  const tomb = TH.boxTombOf(box)

  it("births a box under its parent's life, deletes it, and gives it a new life", async () => {
    const vaultDB = new MemoryVaultDB()
    const birth   = TH.birthAskOf(box, childShellCited(TH.Life0))
    expect(await vaultDB.tryWriteThing(birth)).to.deep.include({ ok: true, act: 'born', val: box })
    expect(await vaultDB.tryWriteThing(TH.delAskFor(box, tomb))).to.deep.include({ ok: true, act: 'deleted', val: tomb })
    expect(await vaultDB.tryGetThing(TH.getAskAt(box.labelpath))).to.deep.include({ ok: true, act: 'gotgone', val: tomb })
    const reborn = TH.boxRebornOf(tomb)
    expect(await vaultDB.tryWriteThing(TH.replaceAskOf(tomb, reborn))).to.deep.include({ ok: false, act: 'gone' })
    expect(await vaultDB.tryWriteThing(TH.birthAskOf(reborn, tomb))).to.deep.include({ ok: true, act: 'reborn', val: reborn })
  })

  it("refuses a del resent after it landed, and a del of nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    await boxesBorn(vaultDB, box)
    await TH.expectGood(vaultDB.tryWriteThing(TH.delAskFor(box, tomb)))
    expect(await vaultDB.tryWriteThing(TH.delAskFor(box, tomb))).to.deep.include({ ok: false, act: 'retcon', dbhas: tomb })
    expect(await new MemoryVaultDB().tryWriteThing(TH.delAskFor(box, tomb))).to.deep.include({ ok: false, dbhas: null })
  })

  it("answers dubdel to a del citing a tombstone", async () => {
    const vaultDB = new MemoryVaultDB()
    const answer  = await vaultDB.tryWriteThing(TH.delAskFor(tomb, TH.nextOf(tomb)))
    expect(answer).to.deep.include({ ok: false, act: 'dubdel' })
    await TH.expectBad(answer, 'absent_vault')
  })

  it("refuses a storage policy on a box's put", async () => {
    const vaultDB = new MemoryVaultDB()
    await boxesBorn(vaultDB, box)
    const ask = TH.replaceAskOf(box, TH.nextOf(box), { policies: ['add_passkey'] })
    await TH.expectBad(vaultDB.tryWriteThing(ask), 'bad_option')
  })

  it("keeps the kinds apart: a gate's ask names no box", async () => {
    const ask = { ...TH.birthAskOf(box, childShellCited(TH.Life0)), modelkind: 'gate' }
    await TH.expectBad(new MemoryVaultDB().tryWriteThing(ask as never), 'bad_option')
  })
})

describe("MemoryVaultDB.tryListThings(ask)", () => {
  it("lists the parent's children, sparse, in labelpath order, tombstones among them, with the parent beside", async () => {
    const vaultDB = await bornBank()
    const [zz, aa, mm] = await boxesBorn(vaultDB, TH.boxThingOf('zz'), TH.boxThingOf('aa'), TH.boxThingOf('mm'))
    const mmGone = TH.boxTombOf(mm!)
    await TH.expectGood(vaultDB.tryWriteThing(TH.delAskFor(mm!, mmGone)))
    const answer = await vaultDB.tryListThings(TH.listAskAt('box'))
    expect(answer).to.deep.include({ ok: true, act: 'gotlive', parent: sparseOf(TH.rootBoxOf()), damaged_rows: [] })
    expect(answer.ok && answer.val).to.deep.equal([aa, mmGone, zz].map((box) => sparseOf(box!)))
  })

  it("lists children alone, never their children", async () => {
    const vaultDB = await bornBank()
    const [aa] = await boxesBorn(vaultDB, TH.boxThingOf('aa'))
    const deep = TH.boxThingOf('deep', { labelpath: 'box/aa/deep', lifepath: `${TH.Life0}/${TH.Life0}/${TH.Life0}` })
    await bornUnder(vaultDB, deep, aa!.lifepath)
    expect(await listedAt(vaultDB, 'box')).to.deep.equal([sparseOf(aa!)])
    expect(await listedAt(vaultDB, 'box/aa')).to.deep.equal([sparseOf(deep)])
  })

  it("leaves out the children of the parent's earlier lives", async () => {
    const vaultDB = await bornBank()
    const [aa] = await boxesBorn(vaultDB, TH.boxThingOf('aa'))
    const kidAt = (label: string, lifepath: string): BoxThing => TH.boxThingOf(label, { labelpath: `box/aa/${label}`, lifepath: `${lifepath}/${TH.Life0}` })
    await bornUnder(vaultDB, kidAt('old', aa!.lifepath), aa!.lifepath)
    const aaGone = TH.boxTombOf(aa!)
    const aaAgain = TH.boxRebornOf(aaGone)
    await TH.expectGood(vaultDB.tryWriteThing(TH.delAskFor(aa!, aaGone)))
    await TH.expectGood(vaultDB.tryWriteThing(TH.birthAskOf(aaAgain, aaGone)))
    const fresh = kidAt('fresh', aaAgain.lifepath)
    await bornUnder(vaultDB, fresh, aaAgain.lifepath)
    expect(await listedAt(vaultDB, 'box/aa')).to.deep.equal([sparseOf(fresh)])
  })

  it("names each child that fails its checks as a damaged row, and lists the rest", async () => {
    const vaultDB = await bornBank()
    const [aa] = await boxesBorn(vaultDB, TH.boxThingOf('aa'))
    vaultDB._cheat_things(TH.ThingBank).set('box/bad', { ...TH.boxThingOf('bad'), whisper_sealed: {} })
    const answer = await vaultDB.tryListThings(TH.listAskAt('box'))
    expect(answer).to.deep.include({ ok: true, damaged_rows: [{ ...TH.ThingBank, labelpath: 'box/bad', am: 'd' }] })
    expect(answer.ok && answer.val).to.deep.equal([sparseOf(aa!)])
  })

  it("answers no children, and the parent, for a parent gone or void under ifAbsent 'nil', reading no child", async () => {
    const vaultDB = await bornBank()
    const [aa] = await boxesBorn(vaultDB, TH.boxThingOf('aa'))
    const aaGone = TH.boxTombOf(aa!)
    await TH.expectGood(vaultDB.tryWriteThing(TH.delAskFor(aa!, aaGone)))
    vaultDB._cheat_things(TH.ThingBank).set('box/aa/bad', { junk: true })
    expect(await vaultDB.tryListThings(TH.listAskAt('box/aa', 'nil'))).to.deep.include({ ok: true, act: 'gotgone', val: [], parent: sparseOf(aaGone), damaged_rows: [] })
    expect(await vaultDB.tryListThings(TH.listAskAt('box/zz', 'nil'))).to.deep.include({ ok: true, act: 'gotvoid', val: [], parent: null })
  })

  it("refuses a parent gone or void under ifAbsent 'fail', with no children as dbhas, reading no child", async () => {
    const vaultDB = await bornBank()
    const [aa] = await boxesBorn(vaultDB, TH.boxThingOf('aa'))
    const aaGone = TH.boxTombOf(aa!)
    await TH.expectGood(vaultDB.tryWriteThing(TH.delAskFor(aa!, aaGone)))
    vaultDB._cheat_things(TH.ThingBank).set('box/aa/bad', { junk: true })
    expect(await vaultDB.tryListThings(TH.listAskAt('box/aa'))).to.deep.include({ ok: false, act: 'gone', dbhas: [], parent: sparseOf(aaGone), damaged_rows: [] })
    const voidAnswer = await vaultDB.tryListThings(TH.listAskAt('box/zz'))
    await TH.expectBad(Promise.resolve(voidAnswer), 'absent_vault')
    expect(voidAnswer).to.deep.include({ ok: false, act: 'void', dbhas: [], parent: null, damaged_rows: [] })
  })

  it("lists a bank's further gates under its main gate", async () => {
    const vaultDB = await bornBank()
    const second = TH.gateThingOf({ labelpath: 'gate/second', label: 'second', lifepath: `${TH.Life0}/${TH.Life0}` })
    await bornUnder(vaultDB, second, TH.Life0)
    expect(await listedAt(vaultDB, 'gate')).to.deep.equal([sparseOf(second)])
  })

  it("refuses a child filed at another scope as a broken store", async () => {
    const vaultDB = await bornBank()
    vaultDB._cheat_things(TH.ThingBank).set('box/aa', TH.boxThingOf('zz'))
    await TH.expectBad(vaultDB.tryListThings(TH.listAskAt('box')), 'storage_issue')
  })

  it("refuses, as a broken store, a child a store fetched from outside the parent", () => {
    const child = { labelpath: 'box/aa/deep', raw: TH.boxThingOf('deep') }
    TH.expectSyncRefusal(() => classifyListThings(TH.listAskAt('box'), { parent: TH.rootBoxOf(), children: [child] }), 'storage_issue')
  })
})

describe("MemoryVaultDB.tryBirthBank(ask)", () => {
  it("writes the bank, its main gate and its root box, answering with them, and is heard of each", async () => {
    const vaultDB = new MemoryVaultDB()
    const notices: ThingNotice[] = []
    vaultDB.watch(TH.ThingBank, (notice) => { notices.push(notice) })
    const roots = { bank: TH.bankThingOf(), gate: TH.gateThingOf(), root: TH.rootBoxOf() }
    expect(await vaultDB.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: true, act: 'born', val: roots })
    expect(await gotAt(vaultDB, 'bank')).to.deep.equal(roots.bank)
    expect(await gotAt(vaultDB, 'gate')).to.deep.equal(roots.gate)
    expect(await gotAt(vaultDB, 'box')).to.deep.equal(roots.root)
    await TH.eventually(() => notices.length === 3)
  })

  it("passes the roots stored back, writing nothing, where the bank is live", async () => {
    const vaultDB = await bornBank()
    const other = TH.birthBankAskOf({ bank: TH.bankThingOf({ revtok: 'rev-other' }), gate: TH.gateThingOf({ revtok: 'rev-other' }) })
    const roots = { bank: TH.bankThingOf(), gate: TH.gateThingOf(), root: TH.rootBoxOf() }
    expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', val: roots })
  })

  it("answers retcon to the birth already stored, by the put table", async () => {
    const vaultDB = await bornBank()
    expect(await vaultDB.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: false, act: 'retcon', dbhas: TH.bankThingOf() })
  })

  it("refuses a live bank stored without its main gate as a broken store", async () => {
    const vaultDB = await bornBank()
    vaultDB._cheat_things(TH.ThingBank).delete('gate')
    const other = TH.birthBankAskOf({ bank: TH.bankThingOf({ revtok: 'rev-other' }) })
    await TH.expectBad(vaultDB.tryBirthBank(other), 'storage_issue')
  })

  it("refuses over a bank's tombstone, writing nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    const life1 = lifeseqOf(1)
    const bankGone = TH.nextOf(TH.bankThingOf(), { am: 'x', lifeseq: life1, lifepath: life1 })
    vaultDB._cheat_things(TH.ThingBank).set('bank', bankGone)
    expect(await vaultDB.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', dbhas: bankGone })
    expect(await vaultDB.tryGetThing(TH.getGateAskOf())).to.deep.include({ ok: true, act: 'gotvoid' })
  })

  it("refuses over a main gate stored with no bank, writing nothing", async () => {
    const stored  = TH.gateThingOf({ revtok: 'rev-other' })
    const vaultDB = await vaultDBWith(stored)
    expect(await vaultDB.tryBirthBank(TH.birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', dbhas: stored })
    expect(await vaultDB.tryGetThing(TH.getAskAt('bank'))).to.deep.include({ ok: true, act: 'gotvoid' })
  })

  it("refuses an ask whose roots fail their checks, writing nothing", async () => {
    const vaultDB = new MemoryVaultDB()
    const ask = TH.birthBankAskOf({ root: TH.boxThingOf() })
    await TH.expectBad(vaultDB.tryBirthBank(ask), 'bad_record')
    expect(vaultDB._cheat_things(TH.ThingBank).size).to.eq(0)
  })
})

describe("MemoryVaultDB's ask builders", () => {
  it("build asks its verbs take", async () => {
    const vaultDB = await bornBank()
    const box = TH.boxThingOf()
    const putAsk = vaultDB.putAsk({ cited: childShellCited(TH.Life0), record: box })
    expect(await vaultDB.tryWriteThing(putAsk)).to.deep.include({ ok: true, act: 'born' })
    expect(await vaultDB.tryGetThing(vaultDB.getAsk(box))).to.deep.include({ ok: true, act: 'gotlive', val: box })
    const delAsk = vaultDB.delAsk({ cited: box, record: TH.boxTombOf(box) })
    expect(await vaultDB.tryWriteThing(delAsk)).to.deep.include({ ok: true, act: 'deleted' })
    expect(await vaultDB.tryListThings(vaultDB.listAsk(TH.RootScope))).to.deep.include({ ok: true, val: [sparseOf(TH.boxTombOf(box))] })
  })

  it("leave every refusal to the verb, which answers it", async () => {
    const vaultDB = new MemoryVaultDB()
    const junk    = vaultDB.putAsk({ cited: ShellCited, record: { revtok: 'rev-0' } } as never)
    await TH.expectBad(vaultDB.tryWriteThing(junk), 'bad_option')
    await TH.expectBad(vaultDB.tryGetThing(vaultDB.getAsk(null as never)), 'bad_option')
  })
})
