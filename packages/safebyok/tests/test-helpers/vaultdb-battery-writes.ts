/** The battery's cases of tryGetThing and tryWriteThing, over the bank, the main gate and the boxes. */
import { describe, expect, it } from 'vitest'
import { expectBad, expectGood } from 'safebyok-big/testing'
import * as Phrases from '../../src/phrases'
import { Shell } from '../../src/shapes/shapes-thing'
import { Thing } from '../../src/models/thing'
import { delAskOf, getAskOf, listAskOf, putAskOf } from '../../src/shapes/shapes-asks'
import {
  BankScope, GateScope, Life0, MainWayin, OtherMainWayin, Passkey0Wayin, RootScope, ThingBank, WithPasskey, bankThingOf, birthAskOf, boxRebornOf, boxThingOf, boxTombOf,
  delAskFor, gateThingOf, getAskAt, getGateAskOf, nextGateOf, nextOf, replaceAskOf, rootBoxOf,
} from './vaultdb-world'
import { FirstRevtok, OtherLifetok, OtherRevtok, T0, revtokOf } from './models-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { Lifeseq } from '../../src/shapes/primitives'

/** Register the battery's cases of a Thing's get and write. */
export function describeVaultDBWrites({ fresh, bornBank, withGate, boxesBorn, gotAt, rowsOf }: VaultDBBatteryWorld): void {
  describe("tryGetThing(ask)", () => {
    it("answers gotvoid, with no Thing, where none is stored", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryGetThing(getGateAskOf('nil'))
      expect(answer).to.deep.include({ ok: true, act: 'gotvoid', val: null, world: null })
    })

    it("refuses where none is stored and ifAbsent is 'fail'", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryGetThing(getGateAskOf('fail'))
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null })
    })

    it("answers gotlive with the Thing stored", async () => {
      const vaultDB = await withGate()
      expect(await vaultDB.tryGetThing(getGateAskOf())).to.deep.include({ ok: true, act: 'gotlive', val: gateThingOf() })
    })

    it("refuses an ask for a labelpath of no kind of Thing, or past its kind's depth", async () => {
      const vaultDB = await fresh()
      await expectBad(vaultDB.tryGetThing({ ...getGateAskOf(), labelpath: 'vault/main' }), 'bad_record')
      await expectBad(vaultDB.tryGetThing(getAskAt('gate/a/b')), 'bad_record')
      await expectBad(vaultDB.tryGetThing(getAskAt('box/aa/deep')), 'bad_record')
    })

    it("refuses, never throws, for an ask that is not one", async () => {
      const vaultDB = await fresh()
      await expectBad(vaultDB.tryGetThing(null as never), 'bad_record')
    })
  })

  describe("tryWriteThing(ask), the plain path", () => {
    it("births the main gate over the shell, answering with the Thing written", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryWriteThing(birthAskOf())).to.deep.include({ ok: true, act: 'born', val: gateThingOf(), world: null })
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(gateThingOf())
    })

    it("replaces the live gate it expects", async () => {
      const stored = gateThingOf()
      const next = nextGateOf(stored)
      const vaultDB = await withGate(stored)
      expect(await vaultDB.tryWriteThing(replaceAskOf(stored, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(next)
    })

    it("accepts a citation of no more than ThingCited names", async () => {
      const stored = gateThingOf()
      const vaultDB = await withGate(stored)
      const { revtok, revseq, am, lifepath } = stored
      const answer = await vaultDB.tryWriteThing(replaceAskOf({ revtok, revseq, am, lifepath }, nextGateOf(stored)))
      expect(answer).to.deep.include({ ok: true, act: 'replaced' })
    })

    it("passes the live gate back, writing nothing, under ifPresent 'get' when it expected another", async () => {
      const stored = gateThingOf()
      const vaultDB = await withGate(stored)
      const answer = await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), ifPresent: 'get' })
      expect(answer).to.deep.include({ ok: true, act: 'passed', val: stored })
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(stored)
    })

    it("logs what the ask cites, never its wayins", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryWriteThing(birthAskOf())
      expect(answer.ask).to.deep.include({ op: 'put', modelkind: 'gate', ...GateScope })
      expect(JSON.stringify(answer.ask)).to.not.include(MainWayin.salt_b64)
    })
  })

  describe("tryWriteThing(ask), refused by the act tables", () => {
    const stored = gateThingOf()
    const next   = nextGateOf(stored)
    const later  = nextGateOf(next)
    const lifeseq2 = Lifeseq.ofLifenum(2)
    const otherLife = { lifeseq: lifeseq2, lifepath: lifeseq2 }
    const ActCases = [
      // the datastore moved on:
      ["stale",  replaceAskOf(stored, nextGateOf(stored, { revtok: revtokOf('1b') })), 'expects a revision the store has moved past'],
      ["retcon", replaceAskOf(stored, next),                                      'resends a write that already landed'],
      ["forked", replaceAskOf({ ...next, revtok: revtokOf('fork') }, nextGateOf(next)), 'expects the revseq stored under another revtok'],
      // the caller is ahead of the datastore, or confused:
      ["ahead",  replaceAskOf(later, nextGateOf(later)),                          'expects a revision the store has not reached'],
      ["clash",  replaceAskOf({ ...next, ...otherLife }, { ...nextGateOf(next), ...otherLife }), 'expects the revtok stored in another life'],
      ["camped", { ...replaceAskOf(next, nextGateOf(next)), ifPresent: 'fail' as const }, 'finds the live gate it expects under ifPresent fail'],
      ["stale",  birthAskOf(gateThingOf({ revtok: OtherRevtok })),               'births a gate over a live one'],
    ] as const

    for (const [act, ask, blurb] of ActCases) {
      it(blurb, async () => {
        const vaultDB = await withGate(stored)
        await expectGood(vaultDB.tryWriteThing(replaceAskOf(stored, next)))
        expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: false, act, dbhas: next })
        expect(await gotAt(vaultDB, 'gate')).to.deep.equal(next)
      })
    }

    it("refuses a replacement that moves the stored born_at", async () => {
      const vaultDB = await withGate(stored)
      const answer = await vaultDB.tryWriteThing(replaceAskOf(stored, nextGateOf(stored, { born_at: T0 + 1 })))
      const err = await expectBad(Promise.resolve(answer), 'bad_record')
      expect(err.message).to.include(Phrases.BornAtNotStored)
      expect(answer).to.deep.include({ act: 'policied', dbhas: stored })
    })

    it("refuses a write over nothing under ifAbsent 'fail'", async () => {
      const vaultDB = await fresh()
      const answer = await vaultDB.tryWriteThing({ ...birthAskOf(), ifAbsent: 'fail' })
      expect(answer).to.deep.include({ ok: false, act: 'void', dbhas: null })
    })

    it("refuses the main gate's deletion, writing nothing", async () => {
      const vaultDB = await withGate(stored)
      const life1 = Lifeseq.ofLifenum(1)
      const gone = nextOf(stored, { am: 'x', lifeseq: life1, lifepath: life1 })
      await expectBad(vaultDB.tryWriteThing(delAskFor(stored, gone)), 'bad_record')
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(stored)
    })

    it("carries what it refused, loggable, on its refusal", async () => {
      const vaultDB = await withGate(stored)
      const answer = await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: OtherRevtok })))
      const err = await expectBad(Promise.resolve(answer), 'stale_write')
      expect(err.meta).to.deep.include({ oplabel: 'writeThing', act: 'stale' })
      expect(JSON.stringify(err.meta)).to.not.include(MainWayin.salt_b64)
    })
  })

  describe("tryWriteThing(ask), under a storage policy", () => {
    const stored = gateThingOf()
    const otherMain = { main: OtherMainWayin, passkey0: null }

    it("replaces the passphrase wayin the gating proved against", async () => {
      const vaultDB = await withGate(stored)
      const ask = replaceAskOf(stored, nextGateOf(stored, { wayins: otherMain }), { policies: ['replace_passphrase'] })
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'replaced' })
    })

    it("refuses to replace a passphrase wayin other than the one proved against", async () => {
      const vaultDB = await withGate(stored)
      const ask = replaceAskOf({ ...stored, wayins: otherMain }, nextGateOf(stored, { wayins: otherMain }), { policies: ['replace_passphrase'] })
      const answer = await vaultDB.tryWriteThing(ask)
      await expectBad(Promise.resolve(answer), 'gate_issue')
      expect(answer).to.deep.include({ act: 'policied', dbhas: stored })
    })

    it("refuses a passphrase replacement that changes the passkey wayin too", async () => {
      const vaultDB = await withGate(stored)
      const ask = replaceAskOf(stored, nextGateOf(stored, { wayins: { ...WithPasskey, main: OtherMainWayin } }), { policies: ['replace_passphrase'] })
      await expectBad(vaultDB.tryWriteThing(ask), 'gate_issue')
    })

    it("adds a passkey wayin to a gate that has none, and revokes it", async () => {
      const vaultDB = await withGate(stored)
      const added = nextGateOf(stored, { wayins: WithPasskey })
      expect(await vaultDB.tryWriteThing(replaceAskOf(stored, added, { policies: ['add_passkey'] }))).to.deep.include({ ok: true, act: 'replaced' })
      const revoked = nextGateOf(added, { wayins: stored.wayins })
      expect(await vaultDB.tryWriteThing(replaceAskOf(added, revoked, { policies: ['revoke_passkey'] }))).to.deep.include({ ok: true, act: 'replaced' })
    })

    it("refuses to add a passkey wayin to a gate that has one", async () => {
      const vaultDB = await withGate(gateThingOf({ wayins: WithPasskey }))
      const withOne = gateThingOf({ wayins: WithPasskey })
      const ask = replaceAskOf(withOne, nextGateOf(withOne, { wayins: { ...WithPasskey, passkey0: { ...Passkey0Wayin, credential_id: 'other-credential' } } }), { policies: ['add_passkey'] })
      await expectBad(vaultDB.tryWriteThing(ask), 'gate_issue')
    })

    it("refuses to revoke a passkey wayin from a gate that has none", async () => {
      const vaultDB = await withGate(stored)
      const ask = replaceAskOf(stored, nextGateOf(stored), { policies: ['revoke_passkey'] })
      await expectBad(vaultDB.tryWriteThing(ask), 'gate_issue')
    })

    it("checks no policy on a birth", async () => {
      const ask = { ...birthAskOf(), options: { policies: ['revoke_passkey' as const] } }
      const vaultDB = await fresh()
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'born' })
    })
  })

  describe("tryWriteThing(ask), the bank", () => {
    const stored = bankThingOf()
    const life1  = Lifeseq.ofLifenum(1)
    const life2  = Lifeseq.ofLifenum(2)
    const gone   = nextOf(stored, { am: 'x', lifeseq: life1, lifepath: life1 })

    it("replaces and deletes a live bank, keeping its lifetok", async () => {
      const vaultDB = await bornBank()
      const next = nextOf(stored)
      expect(await vaultDB.tryWriteThing(replaceAskOf(stored, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
      const tomb = nextOf(next, { am: 'x', lifeseq: life1, lifepath: life1 })
      expect(await vaultDB.tryWriteThing(delAskFor(next, tomb))).to.deep.include({ ok: true, act: 'deleted', val: tomb })
    })

    const LifetokCases = [
      ['a replacement',  replaceAskOf(stored, nextOf(stored, { lifetok: OtherLifetok }))],
      ['a deletion',     delAskFor(stored, { ...gone, lifetok: OtherLifetok })],
    ] as const

    for (const [blurb, ask] of LifetokCases) {
      it(`refuses ${blurb} that changes the live bank's lifetok, leaving it stored`, async () => {
        const vaultDB = await bornBank()
        const answer = await vaultDB.tryWriteThing(ask)
        const err = await expectBad(Promise.resolve(answer), 'bad_record')
        expect(err.message).to.include(Phrases.LifetokNotStored)
        expect(answer).to.deep.include({ act: 'policied', dbhas: stored })
        expect(await gotAt(vaultDB, 'bank')).to.deep.equal(stored)
      })
    }

    it("carries a bank damaged outside its lifetok forward, under a put that keeps the lifetok", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(BankScope, { ...stored, auth: { stray: true } })
      const next = nextOf(stored)
      expect(await vaultDB.tryWriteThing(replaceAskOf(stored, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
      expect(await gotAt(vaultDB, 'bank')).to.deep.equal(next)
    })

    it("rebirths the bank over a tombstone whose lifetok is malformed", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(BankScope, { ...gone, lifetok: 'not-a-uuid' })
      const reborn = nextOf(gone, { am: 'a', lifeseq: life2, lifepath: life2, born_at: gone.written_at + 1 })
      const ask = putAskOf({ cited: gone, record: reborn, ifAbsent: 'add' })
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'reborn', val: reborn })
    })

    it("rebirths the bank over its tombstone with another lifetok", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(BankScope, gone)
      const reborn = nextOf(gone, { am: 'a', lifeseq: life2, lifepath: life2, born_at: gone.written_at + 1, lifetok: OtherLifetok })
      const ask = putAskOf({ cited: gone, record: reborn, ifAbsent: 'add' })
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'reborn', val: reborn })
    })
  })

  describe("a Thing stored that fails its checks", () => {
    // Which refusal a write over a damaged Thing meets is unspecified: see tryWriteThing.
    it("refuses a damaged gate as damaged to a get, and refuses a write over it", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), wayins: { main: {}, passkey0: null } })
      await expectBad(vaultDB.tryGetThing(getGateAskOf()), 'damaged_row')
      expect(await vaultDB.tryWriteThing(birthAskOf())).to.deep.include({ ok: false })
    })

    it("carries a gate damaged outside its wayins forward, under the storage policy it meets", async () => {
      const vaultDB = await fresh()
      const stored = gateThingOf()
      await rowsOf(vaultDB).plant(GateScope, { ...stored, auth: { stray: true } })
      const next = nextGateOf(stored, { wayins: { main: OtherMainWayin, passkey0: null } })
      const ask  = replaceAskOf(stored, next, { policies: ['replace_passphrase'] })
      expect(await vaultDB.tryWriteThing(ask)).to.deep.include({ ok: true, act: 'replaced', val: next })
      expect(await gotAt(vaultDB, 'gate')).to.deep.equal(next)
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
      expect(await vaultDB.tryGetThing(getAskAt(box.labelpath))).to.deep.include({ ok: true, act: 'gotgone', val: tomb })
      const reborn = boxRebornOf(tomb)
      expect(await vaultDB.tryWriteThing(replaceAskOf(tomb, reborn))).to.deep.include({ ok: false, act: 'gone' })
      expect(await vaultDB.tryWriteThing(birthAskOf(reborn, tomb))).to.deep.include({ ok: true, act: 'reborn', val: reborn })
      expect(await vaultDB.tryGetThing(getAskAt(box.labelpath))).to.deep.include({ ok: true, act: 'gotlive', val: reborn })
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
      expect(await empty.tryWriteThing(delAskFor(box, tomb))).to.deep.include({ ok: false, dbhas: null })
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

    it("refuses a damaged box as damaged, to a get", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: box.labelpath }, { ...box, whisper_sealed: {} })
      await expectBad(vaultDB.tryGetThing(getAskAt(box.labelpath)), 'damaged_row')
    })

    it("carries a box damaged in its body forward, under a write that cites it exactly", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant({ ...ThingBank, labelpath: box.labelpath }, { ...box, whisper_sealed: {} })
      const next = nextOf(box)
      expect(await vaultDB.tryWriteThing(replaceAskOf(box, next))).to.deep.include({ ok: true, act: 'replaced', val: next })
      expect(await gotAt(vaultDB, box.labelpath)).to.deep.equal(next)
    })
  })

  describe("the ask builders of safebyok/storage", () => {
    it("build asks its verbs accept", async () => {
      const vaultDB = await bornBank()
      const box = boxThingOf()
      const putAsk = putAskOf({ cited: Shell.childCited(Life0), record: box })
      expect(await vaultDB.tryWriteThing(putAsk)).to.deep.include({ ok: true, act: 'born' })
      expect(await vaultDB.tryGetThing(getAskOf(box))).to.deep.include({ ok: true, act: 'gotlive', val: box })
      const delAsk = delAskOf({ cited: box, record: boxTombOf(box) })
      expect(await vaultDB.tryWriteThing(delAsk)).to.deep.include({ ok: true, act: 'deleted' })
      expect(await vaultDB.tryListThings(listAskOf(RootScope))).to.deep.include({ ok: true, val: [Thing.sparseOf(boxTombOf(box))] })
    })

    it("leave every refusal to the verb, which answers it", async () => {
      const vaultDB = await fresh()
      await expectBad(vaultDB.tryWriteThing(putAskOf({ cited: Shell.Cited, record: { revtok: FirstRevtok } } as never)), 'bad_record')
      await expectBad(vaultDB.tryGetThing(getAskOf(null as never)), 'bad_record')
    })
  })
}
