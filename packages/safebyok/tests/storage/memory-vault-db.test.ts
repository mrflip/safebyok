import { describe, expect, it } from 'vitest'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { type GateThing, ShellMeta, lifeseqOf } from '../../src/storage/shapes-thing'
import type { ThingNotice } from '../../src/storage/vault-db'
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

  it("refuses an ask for a kind it does not store yet", async () => {
    await TH.expectBad(new MemoryVaultDB().tryGetThing({ ...TH.getGateAskOf(), labelpath: 'bank/main' }), 'bad_option')
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

  it("takes an expected gate of no more than its meta", async () => {
    const stored = TH.gateThingOf()
    const vaultDB = await vaultDBWith(stored)
    const { revtok, revseq, am, lifeseq, lifepath, born_at } = stored
    const answer = await vaultDB.tryWriteThing(TH.replaceAskOf({ revtok, revseq, am, lifeseq, lifepath, born_at }, TH.nextGateOf(stored)))
    expect(answer).to.deep.include({ ok: true, act: 'replaced' })
  })

  it("passes the live gate back, writing nothing, under ifPresent 'get' when it expected another", async () => {
    const stored = TH.gateThingOf()
    const vaultDB = await vaultDBWith(stored)
    const answer = await vaultDB.tryWriteThing({ ...TH.birthAskOf(TH.gateThingOf({ revtok: 'rev-other' })), ifPresent: 'get' })
    expect(answer).to.deep.include({ ok: true, act: 'passed', val: stored })
  })

  it("logs the ask's meta, never its wayins", async () => {
    const answer = await new MemoryVaultDB().tryWriteThing(TH.birthAskOf())
    expect(answer.ask).to.deep.include({ op: 'write', ...TH.GateScope })
    expect(JSON.stringify(answer.ask)).to.not.include(TH.BW.mainWayin.salt_b64)
  })
})

describe("MemoryVaultDB.tryWriteThing(ask), refused by the act tables", () => {
  const stored = TH.gateThingOf()
  const next   = TH.nextGateOf(stored)
  const later  = TH.nextGateOf(next)
  const lifeseq2 = lifeseqOf(2)
  const otherLife = { lifeseq: lifeseq2, lifepath: `/${lifeseq2}` }
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
    const expected = { ...stored, wayins: { main: TH.BW.otherMainWayin } }
    const ask = TH.replaceAskOf(expected, TH.nextGateOf(stored, { wayins: { main: TH.BW.otherMainWayin } }), { policies: ['replace_passphrase'] })
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
      vaultDB._cheat_things().set(MemoryVaultDB.ckeyOf(TH.GateScope), raw)
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

describe("ShellMeta", () => {
  it("is the frozen void sentinel at life and revision -1", () => {
    expect(Object.isFrozen(ShellMeta)).to.be.true
    expect(ShellMeta).to.deep.include({ revseq: -1, lifeseq: '-1', lifepath: '/-1', am: 'x' })
  })
})
