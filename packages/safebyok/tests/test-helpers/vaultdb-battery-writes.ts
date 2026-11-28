/** The battery's cases of tryGetThing and tryWriteThing, over the gate and the boxes. */
import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { expectBad, expectGood } from 'safebyok-big/testing'
import * as Phrases from '../../src/phrases'
import { type BoxRecord, type GateRecord, Shell } from '../../src/shapes/shapes-thing'
import { type WriteAsk, delAskOf, getAskOf, listAskOf, putAskOf } from '../../src/shapes/shapes-asks'
import {
  GateScope, Life0, MainOnly, MainWayin, OtherMainWayin, Passkey0Wayin, RootScope, SenderKnows, ThingBank, WithPasskey, birthAskOf, boxRebornOf, boxThingOf, boxTombOf, gateRebornOf, gateTombOf,
  delAskFor, gateThingOf, getAskAt, getGateAskOf, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import { FirstRevtok, OtherBanktok, OtherRevtok, T0, revtokOf } from './models-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { type Labelpath, type Lifepath, Lifeseq } from '../../src/shapes/primitives'

/** The shell of the box at `labelpath` in the test bank, at `lifepath`. */
function shellAt(labelpath: Labelpath, lifepath: Lifepath) { return Shell.of({ ...ThingBank, modelkind: 'box', labelpath, lifepath }) }

/** The ask that puts a box at `labelpath` over the shell under the root box's life 0, refused where none is stored. */
function voidPutAt(labelpath: Labelpath): WriteAsk {
  return { ...birthAskOf(boxThingOf(labelpath.slice('box/'.length)), Shell.childCited(Life0)), ifAbsent: 'fail' }
}

/** The ask that deletes the box at `box/zz` at its revision 0, refused `ahead` where none is stored. */
const ZzAheadDel = delAskFor(boxThingOf('zz'), boxTombOf(boxThingOf('zz')))

/** The shell's lifeseq twice: the lifepath of a shell one under a root, where neither is stored. */
const ShellUnderShell = `${Shell.VoidLifeseq}/${Shell.VoidLifeseq}`

/** Register the battery's cases of a Thing's get and write. */
export function describeVaultDBWrites({ fresh, bornBank, withGate, boxesBorn, gotAt, rowsOf }: VaultDBBatteryWorld): void {
  describe("tryGetThing(ask)", () => {
    it("answers gotvoid, with null and the root's shell as its dbhas, where none is stored at a root", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryGetThing(getGateAskOf('nil'))
      expect(answer).to.deep.include({ ok: true, act: 'gotvoid', val: null, dbhas: Shell.of(GateScope), banktok: SX.VoidLifeTok })
      expect(Shell.of(GateScope)).to.deep.include({ lifepath: Shell.VoidLifeseq })
    })

    it("refuses where none is stored and ifAbsent is 'fail', with the void sentinel as its dbhas", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryGetThing(getGateAskOf('fail'))).to.deep.include({ ok: false, act: 'void', dbhas: Shell.of(GateScope) })
      const born = await bornBank()
      const answer = await born.tryGetThing(getAskAt('box', 'box/zz', 'fail'))
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: shellAt('box/zz', `${Life0}/${Shell.VoidLifeseq}`) })
    })

    it("answers gotvoid under a live parent with the void sentinel under the parent's lifepath", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing(getAskAt('box', 'box/zz'))).to.deep.include({ ok: true, act: 'gotvoid', dbhas: shellAt('box/zz', `${Life0}/${Shell.VoidLifeseq}`) })
    })

    it("answers gotvoid under a parent that is a tombstone with the void sentinel under the tombstone's lifepath", async () => {
      const vaultDB = await bornBank()
      const [root, rootTomb] = [rootBoxOf(), boxTombOf(rootBoxOf())]
      await expectGood(vaultDB.tryWriteThing(delAskFor(root, rootTomb)))
      expect(await vaultDB.tryGetThing(getAskAt('box', 'box/zz'))).to.deep.include({ ok: true, act: 'gotvoid', dbhas: shellAt('box/zz', `${rootTomb.lifepath}/${Shell.VoidLifeseq}`) })
    })

    it("answers gotvoid under a parent not stored with the void sentinel under the shell's lifeseq", async () => {
      const vaultDB = await withGate()
      expect(await vaultDB.tryGetThing(getAskAt('box', 'box/zz'))).to.deep.include({ ok: true, act: 'gotvoid', dbhas: shellAt('box/zz', ShellUnderShell) })
    })

    it("takes as the Thing above a scope only one whose labelpath and a '/' begin the scope's: box/open is none of box/openai's", async () => {
      const vaultDB = await bornBank()
      await boxesBorn(vaultDB, boxThingOf('open'))
      for (const labelpath of ['box/openai', 'box/open_ai']) {
        expect(await vaultDB.tryGetThing(getAskAt('box', labelpath))).to.deep.include({ ok: true, act: 'gotvoid', dbhas: shellAt(labelpath, `${Life0}/${Shell.VoidLifeseq}`) })
      }
    })

    it("answers gotlive with the actual Thing", async () => {
      const vaultDB = await withGate()
      expect(await vaultDB.tryGetThing(getGateAskOf())).to.deep.include({ ok: true, act: 'gotlive', val: gateThingOf() })
    })

    it("refuses an ask for a labelpath of no kind of Thing, or past its kind's depth", async () => {
      const vaultDB = await fresh()
      await expectBad(vaultDB.tryGetThing({ ...getGateAskOf(), labelpath: 'vault/main' }), 'bad_record')
      await expectBad(vaultDB.tryGetThing(getAskAt('gate', `${GateScope.labelpath}/backup`)), 'bad_record')
      await expectBad(vaultDB.tryGetThing(getAskAt('box', 'box/aa/deep')), 'bad_record')
    })

    it("refuses an ask whose labelpath breaks its modelkind's rule: a gate's is its banklabel, a box's `box` or one label under it", async () => {
      const vaultDB = await bornBank()
      await expectBad(vaultDB.tryGetThing(getAskAt('gate', RootScope.labelpath)), 'bad_record')
      await expectBad(vaultDB.tryGetThing(getAskAt('box', GateScope.labelpath)), 'bad_record')
    })

    it("refuses, never throws, for an ask that is not one", async () => {
      const vaultDB = await fresh()
      await expectBad(vaultDB.tryGetThing(null as never), 'bad_record')
    })
  })

  describe("tryWriteThing(ask), the plain path", () => {
    it("births the gate over the shell, answering with the Thing written", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryWriteThing(birthAskOf())).to.deep.include({ ok: true, act: 'born', val: gateThingOf(), banktok: gateThingOf().banktok })
      expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(gateThingOf())
    })

    it("replaces the live gate it expects", async () => {
      const prior = gateThingOf()
      const next = nextGateOf(prior)
      const vaultDB = await withGate(prior)
      expect(await vaultDB.tryWriteThing(replaceAskOf(prior, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
      expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(next)
    })

    it("accepts a citation of no more than ThingCited names", async () => {
      const prior = gateThingOf()
      const vaultDB = await withGate(prior)
      const { revtok, revseq, am, lifepath } = prior
      const answer = await vaultDB.tryWriteThing(replaceAskOf({ revtok, revseq, am, lifepath }, nextGateOf(prior)))
      expect(answer).to.deep.include({ ok: true, act: 'replaced' })
    })

    it("passes the live gate back, writing nothing, under ifPresent 'get' when it expected another", async () => {
      const prior = gateThingOf()
      const vaultDB = await withGate(prior)
      const answer = await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), ifPresent: 'get' })
      expect(answer).to.deep.include({ ok: true, act: 'passed', val: prior })
      expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(prior)
    })

    it("logs what the ask cites, never its wayins", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryWriteThing(birthAskOf())
      expect(answer.ask).to.deep.include({ op: 'put', ...GateScope })
      expect(JSON.stringify(answer.ask)).to.not.include(MainWayin.salt_b64)
    })
  })

  describe("tryWriteThing(ask), refused by the act tables", () => {
    const prior  = gateThingOf()
    const next   = nextGateOf(prior)
    const later  = nextGateOf(next)
    const lifeseq2 = Lifeseq.ofLifenum(2)
    const otherLife = { lifeseq: lifeseq2, lifepath: lifeseq2 }
    const ActCases = [
      // the datastore moved on:
      ["stale",  replaceAskOf(prior, nextGateOf(prior, { revtok: revtokOf('1b') })), 'expects a revision the datastore has moved past'],
      ["retcon", replaceAskOf(prior, next),                                         'resends a write that already landed'],
      ["forked", replaceAskOf({ ...next, revtok: revtokOf('fork') }, nextGateOf(next)), 'expects the prior revseq under another revtok'],
      // the caller is ahead of the datastore, or confused:
      ["ahead",  replaceAskOf(later, nextGateOf(later)),                            'expects a revision the datastore has not reached'],
      ["clash",  replaceAskOf({ ...next, ...otherLife }, { ...nextGateOf(next), ...otherLife }), 'expects the prior revtok in another life'],
      ["camped", { ...replaceAskOf(next, nextGateOf(next)), ifPresent: 'fail' as const }, 'finds the live gate it expects under ifPresent fail'],
      ["stale",  birthAskOf(gateThingOf({ revtok: OtherRevtok })),               'births a gate over a live one'],
    ] as const

    for (const [act, ask, blurb] of ActCases) {
      it(blurb, async () => {
        const vaultDB = await withGate(prior)
        await expectGood(vaultDB.tryWriteThing(replaceAskOf(prior, next)))
        expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: false, act, dbhas: next })
        expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(next)
      })
    }

    it("refuses a replacement that moves the prior born_at", async () => {
      const vaultDB = await withGate(prior)
      const answer = await vaultDB.tryWriteThing(replaceAskOf(prior, nextGateOf(prior, { born_at: T0 + 1 })))
      const err = await expectBad(Promise.resolve(answer), 'bad_record')
      expect(err.message).to.include(Phrases.BornAtMoved)
      expect(answer).to.deep.include({ act: 'policied', dbhas: prior })
    })

    it("refuses a write over nothing under ifAbsent 'fail', and one citing a revision where none is stored, with the root's shell as its dbhas", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryWriteThing({ ...birthAskOf(), ifAbsent: 'fail' })).to.deep.include({ ok: false, act: 'void', dbhas: Shell.of(GateScope) })
      const ahead = replaceAskOf(prior, nextGateOf(prior))
      expect(await vaultDB.tryWriteThing(ahead)).to.deep.include({ ok: false, act: 'ahead', dbhas: Shell.of(GateScope) })
    })

    it("refuses a write over nothing under a live parent with the shell under the parent's lifepath as its dbhas", async () => {
      const vaultDB = await bornBank()
      const shell = shellAt('box/zz', `${Life0}/${Shell.VoidLifeseq}`)
      expect(await vaultDB.tryWriteThing(voidPutAt('box/zz'))).to.deep.include({ ok: false, act: 'void', dbhas: shell })
      expect(await vaultDB.tryWriteThing(ZzAheadDel)).to.deep.include({ ok: false, act: 'ahead', dbhas: shell })
    })

    it("refuses a write over nothing under a parent that is a tombstone with the shell under the tombstone's lifepath as its dbhas", async () => {
      const vaultDB = await bornBank()
      const [root, rootTomb] = [rootBoxOf(), boxTombOf(rootBoxOf())]
      await expectGood(vaultDB.tryWriteThing(delAskFor(root, rootTomb)))
      const shell = shellAt('box/zz', `${rootTomb.lifepath}/${Shell.VoidLifeseq}`)
      expect(await vaultDB.tryWriteThing(voidPutAt('box/zz'))).to.deep.include({ ok: false, act: 'void', dbhas: shell })
      expect(await vaultDB.tryWriteThing(ZzAheadDel)).to.deep.include({ ok: false, act: 'ahead', dbhas: shell })
    })

    it("refuses a write over nothing under a parent not stored with the shell under the shell's lifeseq as its dbhas", async () => {
      const vaultDB = await withGate()
      const shell = shellAt('box/zz', ShellUnderShell)
      expect(await vaultDB.tryWriteThing(voidPutAt('box/zz'))).to.deep.include({ ok: false, act: 'void', dbhas: shell })
      expect(await vaultDB.tryWriteThing(ZzAheadDel)).to.deep.include({ ok: false, act: 'ahead', dbhas: shell })
    })

    it("refuses a write over nothing with the shell under the root box, never under a sibling whose labelpath begins the same", async () => {
      const vaultDB = await bornBank()
      await boxesBorn(vaultDB, boxThingOf('open'))
      for (const labelpath of ['box/openai', 'box/open_ai']) {
        expect(await vaultDB.tryWriteThing(voidPutAt(labelpath))).to.deep.include({ ok: false, act: 'void', dbhas: shellAt(labelpath, `${Life0}/${Shell.VoidLifeseq}`) })
      }
    })

    it("deletes the gate, leaving its tombstone, which keeps its banktok", async () => {
      const vaultDB = await withGate(prior)
      const gone = gateTombOf(prior)
      expect(await vaultDB.tryWriteThing(delAskFor(prior, gone))).to.deep.include({ ok: true, act: 'deleted', val: gone, banktok: prior.banktok })
      expect(await vaultDB.tryGetThing(getGateAskOf())).to.deep.include({ ok: true, act: 'gotgone', dbhas: gone })
    })

    it("carries what it refused, loggable, on its refusal", async () => {
      const vaultDB = await withGate(prior)
      const answer = await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: OtherRevtok })))
      const err = await expectBad(Promise.resolve(answer), 'stale_write')
      expect(err.meta).to.deep.include({ oplabel: 'writeThing', act: 'stale' })
      expect(JSON.stringify(err.meta)).to.not.include(MainWayin.salt_b64)
    })
  })

  describe("tryWriteThing(ask), under a storage policy", () => {
    const prior = gateThingOf()
    const otherMain = { main: OtherMainWayin, passkey0: null }

    it("replaces the passphrase wayin the gating proved against", async () => {
      const vaultDB = await withGate(prior)
      const ask = replaceAskOf(prior, nextGateOf(prior, { wayins: otherMain }), { policies: ['replace_passphrase'] })
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'replaced' })
    })

    it("refuses to replace a passphrase wayin other than the one proved against", async () => {
      const vaultDB = await withGate(prior)
      const ask = replaceAskOf({ ...prior, wayins: otherMain }, nextGateOf(prior, { wayins: otherMain }), { policies: ['replace_passphrase'] })
      const answer = await vaultDB.tryWriteThing(ask)
      await expectBad(Promise.resolve(answer), 'gate_issue')
      expect(answer).to.deep.include({ act: 'policied', dbhas: prior })
    })

    it("refuses a passphrase replacement that changes the passkey wayin too", async () => {
      const vaultDB = await withGate(prior)
      const ask = replaceAskOf(prior, nextGateOf(prior, { wayins: { ...WithPasskey, main: OtherMainWayin } }), { policies: ['replace_passphrase'] })
      await expectBad(vaultDB.tryWriteThing(ask), 'gate_issue')
    })

    it("adds a passkey wayin to a gate that has none, and revokes it", async () => {
      const vaultDB = await withGate(prior)
      const added = nextGateOf(prior, { wayins: WithPasskey })
      expect(await vaultDB.tryWriteThing(replaceAskOf(prior, added, { policies: ['add_passkey'] }))).to.deep.include({ ok: true, act: 'replaced' })
      const revoked = nextGateOf(added, { wayins: MainOnly })
      expect(await vaultDB.tryWriteThing(replaceAskOf(added, revoked, { policies: ['revoke_passkey'] }))).to.deep.include({ ok: true, act: 'replaced' })
    })

    it("refuses to add a passkey wayin to a gate that has one", async () => {
      const vaultDB = await withGate(gateThingOf({ wayins: WithPasskey }))
      const withOne = gateThingOf({ wayins: WithPasskey })
      const ask = replaceAskOf(withOne, nextGateOf(withOne, { wayins: { ...WithPasskey, passkey0: { ...Passkey0Wayin, credential_id: 'other-credential' } } }), { policies: ['add_passkey'] })
      await expectBad(vaultDB.tryWriteThing(ask), 'gate_issue')
    })

    it("refuses to revoke a passkey wayin from a gate that has none", async () => {
      const vaultDB = await withGate(prior)
      const ask = replaceAskOf(prior, nextGateOf(prior), { policies: ['revoke_passkey'] })
      await expectBad(vaultDB.tryWriteThing(ask), 'gate_issue')
    })

    it("checks no policy on a birth", async () => {
      const ask = { ...birthAskOf(), options: { policies: ['revoke_passkey' as const] } }
      const vaultDB = await fresh()
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'born' })
    })
  })

  describe("tryWriteThing(ask), the gate's banktok", () => {
    const prior  = gateThingOf()
    const gone   = gateTombOf(prior)

    it("replaces and deletes a live gate, keeping its banktok, and rebirths it over its tombstone with a new one", async () => {
      const vaultDB = await bornBank()
      const next = nextOf(prior)
      expect(await vaultDB.tryWriteThing(replaceAskOf(prior, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
      const tomb = gateTombOf(next)
      expect(await vaultDB.tryWriteThing(delAskFor(next, tomb))).to.deep.include({ ok: true, act: 'deleted', val: tomb, banktok: prior.banktok })
      const reborn = gateRebornOf(tomb, { banktok: OtherBanktok })
      const ask = putAskOf<GateRecord>({ cited: tomb, record: reborn, ifAbsent: 'add', ...SenderKnows })
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'reborn', val: reborn, banktok: OtherBanktok })
    })

    const BanktokCases = [
      ['a replacement',  replaceAskOf(prior, nextOf(prior, { banktok: OtherBanktok }))],
      ['a deletion',     delAskFor(prior, { ...gone, banktok: OtherBanktok })],
    ] as const

    for (const [blurb, ask] of BanktokCases) {
      it(`refuses ${blurb} that changes the live gate's banktok, leaving it stored`, async () => {
        const vaultDB = await bornBank()
        const answer = await vaultDB.tryWriteThing(ask)
        const err = await expectBad(Promise.resolve(answer), 'bad_record')
        expect(err.message).to.include(Phrases.BanktokMoved)
        expect(answer).to.deep.include({ act: 'policied', dbhas: prior })
        expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(prior)
      })
    }

    // Each of these asks tracks the incompatible row at its revision, so the answer's tracked is 'same' there, and never the incompatible row.
    // A written_at past the far future is a row every datastore's table can hold, and that fails the gate's checks.
    it("carries a gate incompatible outside its banktok forward, under a put that keeps the banktok", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(GateScope, { ...prior, written_at: Number.MAX_SAFE_INTEGER })
      await expectBad(vaultDB.tryGetThing(getAskAt('gate', GateScope.labelpath)), 'incompatible_row')
      const next = nextOf(prior)
      expect(await vaultDB.tryWriteThing({ ...replaceAskOf(prior, next), track: trackOf(prior, Shell.Cited) })).to.deep.include({ ok: true, act: 'replaced', val: next })
      expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(next)
    })

    it("rebirths the gate over a tombstone whose banktok is malformed", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(GateScope, { ...gone, banktok: 'not-a-uuid' })
      const reborn = gateRebornOf(gone)
      const ask = putAskOf<GateRecord>({ cited: gone, record: reborn, ifAbsent: 'add', ...SenderKnows, track: trackOf(gone, Shell.Cited) })
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'reborn', val: reborn })
    })

    it("rebirths the gate over its tombstone with another banktok", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(GateScope, gone)
      const reborn = gateRebornOf(gone, { banktok: OtherBanktok })
      const ask = putAskOf<GateRecord>({ cited: gone, record: reborn, ifAbsent: 'add', ...SenderKnows })
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'reborn', val: reborn })
    })
  })

  describe("a Thing stored that fails its checks", () => {
    // Which refusal a write over an incompatible Thing meets is unspecified: see tryWriteThing.
    it("refuses an incompatible gate as incompatible to a get, and refuses a write over it", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), wayins: { main: {}, passkey0: null } })
      await expectBad(vaultDB.tryGetThing(getGateAskOf()), 'incompatible_row')
      expect(await vaultDB.tryWriteThing(birthAskOf())).to.deep.include({ ok: false })
    })

    it("carries a gate incompatible outside its wayins forward, under the storage policy it meets", async () => {
      const vaultDB = await fresh()
      const prior = gateThingOf()
      await rowsOf(vaultDB).plant(GateScope, { ...prior, auth: { stray: true } })
      const next = nextGateOf(prior, { wayins: { main: OtherMainWayin, passkey0: null } })
      // The ask tracks the incompatible gate at its revision, so the answer's tracked is 'same' there, and never the incompatible row.
      const ask  = { ...replaceAskOf(prior, next, { policies: ['replace_passphrase'] }), track: trackOf(prior, Shell.Cited) }
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'replaced', val: next })
      expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(next)
    })
  })

  describe("tryWriteThing(ask), a box", () => {
    const box  = boxThingOf()
    const tomb = boxTombOf(box)

    it("births a box under its parent's life, deletes it, and gives it a new life", async () => {
      const vaultDB = await fresh()
      const birth = birthAskOf(box, Shell.childCited(Life0))
      expect(await vaultDB.tryWriteThing(birth)).to.deep.include({ ok: true, act: 'born', val: box })
      expect(await vaultDB.tryWriteThing(delAskFor(box, tomb))).to.deep.include({ ok: true, act: 'deleted', val: tomb })
      expect(await vaultDB.tryGetThing(getAskAt('box', box.labelpath))).to.deep.include({ ok: true, act: 'gotgone', val: null, dbhas: tomb })
      const reborn = boxRebornOf(tomb)
      expect(await vaultDB.tryWriteThing(replaceAskOf(tomb, reborn))).to.deep.include({ ok: false, act: 'gone' })
      expect(await vaultDB.tryWriteThing(birthAskOf(reborn, tomb))).to.deep.include({ ok: true, act: 'reborn', val: reborn })
      expect(await vaultDB.tryGetThing(getAskAt('box', box.labelpath))).to.deep.include({ ok: true, act: 'gotlive', val: reborn })
    })

    it("replaces a live box it expects, with its sidecar as sent", async () => {
      const vaultDB = await fresh()
      await boxesBorn(vaultDB, box)
      const next = nextOf(box)
      expect(await vaultDB.tryWriteThing(replaceAskOf(box, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
    })

    it("refuses a del resent after it landed, and a del of nothing", async () => {
      const vaultDB = await fresh()
      await boxesBorn(vaultDB, box)
      await expectGood(vaultDB.tryWriteThing(delAskFor(box, tomb)))
      expect(await vaultDB.tryWriteThing(delAskFor(box, tomb))).to.deep.include({ ok: false, act: 'retcon', dbhas: tomb })
      const empty = await fresh()
      expect(await empty.tryWriteThing(delAskFor(box, tomb))).to.deep.include({ ok: false, act: 'ahead', dbhas: shellAt(box.labelpath, ShellUnderShell) })
    })

    it("answers dubdel to a del citing a tombstone", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryWriteThing(delAskFor(tomb, nextOf(tomb)))
      expect(answer).to.deep.include({ ok: false, act: 'dubdel' })
      await expectBad(answer, 'absent_vault')
    })

    it("births the root box over the shell", async () => {
      const vaultDB = await fresh()
      const ask = birthAskOf(rootBoxOf())
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'born', val: rootBoxOf() })
    })

    it("refuses a box past its kind's depth", async () => {
      const deep = boxThingOf('deep', { labelpath: 'box/aa/deep', lifepath: `${Life0}/${Life0}/${Life0}` })
      const vaultDB = await fresh()
      const ask = birthAskOf(deep, Shell.childCited(`${Life0}/${Life0}`))
      await expectBad(vaultDB.tryWriteThing(ask), 'bad_record')
    })

    it("refuses a storage policy on a box's put", async () => {
      const vaultDB = await fresh()
      await boxesBorn(vaultDB, box)
      const ask = replaceAskOf(box, nextOf(box), { policies: ['add_passkey'] })
      await expectBad(vaultDB.tryWriteThing(ask), 'bad_record')
    })

    it("keeps the kinds apart: a gate's ask names no box", async () => {
      const ask = { ...birthAskOf(box, Shell.childCited(Life0)), modelkind: 'gate' }
      const vaultDB = await fresh()
      await expectBad(vaultDB.tryWriteThing(ask as never), 'bad_record')
    })

    it("refuses an incompatible box as incompatible, to a get", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant({ ...ThingBank, modelkind: 'box', labelpath: box.labelpath }, { ...box, whisper_sealed: {} })
      await expectBad(vaultDB.tryGetThing(getAskAt('box', box.labelpath)), 'incompatible_row')
    })

    it("carries a box incompatible in its body forward, under a write that cites it exactly", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant({ ...ThingBank, modelkind: 'box', labelpath: box.labelpath }, { ...box, whisper_sealed: {} })
      const next = nextOf(box)
      expect(await vaultDB.tryWriteThing(replaceAskOf(box, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
      expect(await gotAt(vaultDB, 'box', box.labelpath)).to.deep.equal(next)
    })
  })

  describe("the records its answers carry", () => {
    it("are deeply frozen, a box's sidecar among them", async () => {
      const vaultDB = await bornBank()
      const [box] = await boxesBorn(vaultDB, boxThingOf('openai', { sidecar: { account: 'work' } }))
      const answer = await vaultDB.tryGetThing(getAskAt('box', box!.labelpath))
      const val = await expectGood(answer) as BoxRecord
      expect(val.sidecar).to.deep.equal({ account: 'work' })
      expect([Object.isFrozen(val), Object.isFrozen(val.sidecar)]).to.deep.equal([true, true])
      const listed = await vaultDB.tryListThings(listAskOf({ ...RootScope, ...SenderKnows }))
      const kids = await expectGood(listed)
      expect([Object.isFrozen(kids.items), Object.isFrozen(listed.deltas[0])]).to.deep.equal([true, true])
    })

    it("never freeze the ask or the record a caller hands a write", async () => {
      const vaultDB = await bornBank()
      const box = boxThingOf('openai', { sidecar: { account: 'work' } })
      const ask = birthAskOf(box, Shell.childCited(Life0))
      const written = await expectGood(vaultDB.tryWriteThing(ask))
      expect([Object.isFrozen(ask), Object.isFrozen(box), Object.isFrozen(box.sidecar)]).to.deep.equal([false, false, false])
      expect(Object.isFrozen(written)).to.be.true
    })
  })

  describe("the ask builders of safebyok/storage", () => {
    it("build asks its verbs accept", async () => {
      const vaultDB = await bornBank()
      const box = boxThingOf()
      const putAsk = putAskOf({ cited: Shell.childCited(Life0), record: box, ...SenderKnows })
      expect(await vaultDB.tryWriteThing(putAsk)).to.deep.include({ ok: true, act: 'born' })
      expect(await vaultDB.tryGetThing(getAskOf({ ...box, ...SenderKnows }))).to.deep.include({ ok: true, act: 'gotlive', val: box })
      const delAsk = delAskOf({ cited: box, record: boxTombOf(box), ...SenderKnows })
      expect(await vaultDB.tryWriteThing(delAsk)).to.deep.include({ ok: true, act: 'deleted' })
      expect(await vaultDB.tryListThings(listAskOf({ ...RootScope, ...SenderKnows }))).to.deep.include({ ok: true, deltas: [boxTombOf(box)] })
    })

    it("leave every refusal to the verb, which answers it", async () => {
      const vaultDB = await fresh()
      await expectBad(vaultDB.tryWriteThing(putAskOf({ cited: Shell.Cited, record: { revtok: FirstRevtok } } as never)), 'bad_record')
      await expectBad(vaultDB.tryGetThing(getAskOf(null as never)), 'bad_record')
    })
  })
}
