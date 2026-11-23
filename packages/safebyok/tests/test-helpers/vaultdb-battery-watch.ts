/** The battery's cases of a watch. */
import { describe, expect, it } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { aWhile, eventually, expectSyncRefusal } from 'safebyok-big/testing'
import type { ThingWatchScope } from '../../src/shapes/shapes-asks'
import type { ThingNotice, VaultDB } from '../../src/storage/vault-db'
import { Shell } from '../../src/shapes/shapes-thing'
import { Thing } from '../../src/models/thing'
import {
  BankStaleTrack, GateStaleTrack, Life0, RootStaleTrack, ThingBank, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, boxTombOf, delAskFor, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'

/** The notices and the bad news a watch on `scope` hears. */
function heardOf(vaultDB: VaultDB, scope: ThingWatchScope = ThingBank): { notices: ThingNotice[], badNews: Errors.VaultError[], stop: () => void } {
  const notices: ThingNotice[] = []
  const badNews: Errors.VaultError[] = []
  const stop = vaultDB.watch(scope, (notice) => { notices.push(notice) }, (news) => { badNews.push(news) })
  return { notices, badNews, stop }
}

/** Register the battery's cases of a watch. */
export function describeVaultDBWatch({ fresh, bornBank, withGate }: VaultDBBatteryWorld): void {
  describe("watch(scope, onNotice, onBadNews)", () => {
    it("hears each Thing written in the bank, after the write", async () => {
      const vaultDB = await fresh()
      const { notices, badNews } = heardOf(vaultDB)
      await vaultDB.tryWriteThing(birthAskOf())
      await eventually(() => notices.length === 1)
      await aWhile()
      expect(notices).to.deep.equal([{ ok: true, act: 'gotlive', val: gateThingOf() }])
      expect(badNews).to.deep.equal([])
    })

    it("hears each of a bank's roots at its birth, one notice each", async () => {
      const vaultDB = await fresh()
      const { notices, badNews } = heardOf(vaultDB)
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => notices.length === 3)
      await aWhile()
      expect(notices.map(({ val }) => val)).to.have.deep.members([bankThingOf(), gateThingOf(), rootBoxOf()])
      expect(badNews).to.deep.equal([])
    })

    it("hears a box written in a born bank, and nothing of the bank or main gate", async () => {
      const vaultDB = await bornBank()
      const { notices } = heardOf(vaultDB)
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0)))
      await eventually(() => notices.length === 1)
      await aWhile()
      expect(notices).to.deep.equal([{ ok: true, act: 'gotlive', val: box }])
    })

    it("hears the dbhas of a refused write alone, and nothing in another bank", async () => {
      const vaultDB = await withGate()
      const other = heardOf(vaultDB, { ...ThingBank, banklabel: 'other' })
      const own = heardOf(vaultDB)
      await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: OtherRevtok })))
      expect(own.notices).to.deep.equal([{ ok: true, act: 'gotlive', val: gateThingOf() }])
      await aWhile()
      expect(own.notices).to.have.lengthOf(1)
      expect(other.notices).to.deep.equal([])
      expect([...other.badNews, ...own.badNews]).to.deep.equal([])
    })

    it("hears the tombstone a get answers as its dbhas, before the answer, and nothing of a live Thing got", async () => {
      const vaultDB = await bornBank()
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0)))
      const tomb = boxTombOf(box)
      await vaultDB.tryWriteThing(delAskFor(box, tomb))
      await aWhile()
      const { notices, badNews } = heardOf(vaultDB)
      expect(await vaultDB.tryGetThing(getAskAt('box'))).to.deep.include({ ok: true, act: 'gotlive' })
      expect(await vaultDB.tryGetThing(getAskAt(box.labelpath))).to.deep.include({ ok: true, act: 'gotgone', dbhas: tomb })
      expect(notices).to.deep.equal([{ ok: true, act: 'gotgone', val: tomb }])
      await aWhile()
      expect(notices).to.have.lengthOf(1)
      expect(badNews).to.deep.equal([])
    })

    it("hears the dbhas a thrown refusal carries, once", async () => {
      const vaultDB = await withGate()
      const { notices, badNews } = heardOf(vaultDB)
      const gate = gateThingOf()
      const answer = await vaultDB.tryWriteThing(replaceAskOf(gate, nextGateOf(gate), { policies: ['revoke_passkey'] }))
      expect(answer).to.deep.include({ ok: false, act: 'policied', dbhas: gate })
      expect(notices.map(({ val }) => val)).to.deep.equal([gate])
      await aWhile()
      expect(notices).to.have.lengthOf(1)
      expect(badNews).to.deep.equal([])
    })

    it("hears nothing once stopped", async () => {
      const vaultDB = await fresh()
      const { notices, badNews, stop } = heardOf(vaultDB)
      stop()
      await vaultDB.tryWriteThing(birthAskOf())
      await aWhile()
      expect(notices).to.have.lengthOf(0)
      expect(badNews).to.deep.equal([])
    })

    it("tells onBadNews of a notice handler that throws, and hears on", async () => {
      const vaultDB = await fresh()
      const badNews: Errors.VaultError[] = []
      const notices: ThingNotice[] = []
      vaultDB.watch(ThingBank, (notice) => { notices.push(notice); throw new Error('host bug') }, (news) => { badNews.push(news) })
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => badNews.length === 3)
      expect(notices).to.have.lengthOf(3)
      expect(new Set(badNews.map((news) => news.refusalkind))).to.deep.equal(new Set(['unexpected_error']))
    })

    describe("of what an answer's tracked reports", () => {
      it("hears each Thing tracked other than as 'same', alone and before the verb answers, in the tracked bank alone", async () => {
        const vaultDB = await bornBank()
        const own = heardOf(vaultDB)
        const other = heardOf(vaultDB, { ...ThingBank, banklabel: 'other' })
        await vaultDB.tryGetThing({ ...getAskAt('box'), track: GateStaleTrack })
        expect(own.notices.map(({ val }) => val)).to.deep.equal([gateThingOf()])
        await aWhile()
        expect(own.notices).to.have.lengthOf(1)
        expect(other.notices).to.deep.equal([])
      })

      it("hears of tracked Things to a listing, a refusal and a write", async () => {
        const vaultDB = await bornBank()
        const { notices } = heardOf(vaultDB)
        await vaultDB.tryListThings({ ...listAskAt('box'), track: BankStaleTrack })
        expect(notices.map(({ val }) => val)).to.deep.equal([bankThingOf(), Thing.sparseOf(rootBoxOf())])
        await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), track: BankStaleTrack })
        expect(notices.slice(2).map(({ val }) => val)).to.deep.equal([bankThingOf(), gateThingOf()])
        const next = nextGateOf(gateThingOf())
        await vaultDB.tryWriteThing({ ...replaceAskOf(gateThingOf(), next), track: trackOf() })
        await eventually(() => notices.length === 6)
        await aWhile()
        expect(notices.slice(4).map(({ val }) => val)).to.deep.equal([next, next])
      })

      it("hears a refused write's changed bank, main gate and root box, then its dbhas, in that order", async () => {
        const vaultDB = await bornBank()
        const { notices, badNews } = heardOf(vaultDB)
        const track = { bank: BankStaleTrack.bank, gate: GateStaleTrack.gate, box: RootStaleTrack.box }
        await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), track })
        expect(notices.map(({ val }) => val)).to.deep.equal([bankThingOf(), gateThingOf(), rootBoxOf(), gateThingOf()])
        await aWhile()
        expect(notices).to.have.lengthOf(4)
        expect(badNews).to.deep.equal([])
      })

      it("hears a good listing's changed bank, then its parent, then each Thing listed, sparse and in labelpath order, before the listing answers", async () => {
        const vaultDB = await bornBank()
        const boxes   = [boxThingOf('openai'), boxThingOf('anthropic')]
        for (const box of boxes) { await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0))) }
        await aWhile()
        const { notices, badNews } = heardOf(vaultDB)
        await vaultDB.tryListThings({ ...listAskAt('box'), track: BankStaleTrack })
        expect(notices.map(({ val }) => val)).to.deep.equal([bankThingOf(), Thing.sparseOf(rootBoxOf()), Thing.sparseOf(boxes[1]!), Thing.sparseOf(boxes[0]!)])
        await aWhile()
        expect(notices).to.have.lengthOf(4)
        expect(badNews).to.deep.equal([])
      })

      it("hears nothing more where each tracked Thing is 'same', or the ask tracks nothing", async () => {
        const vaultDB = await bornBank()
        const { notices, badNews } = heardOf(vaultDB)
        await vaultDB.tryGetThing({ ...getAskAt('box'), track: trackOf() })
        await vaultDB.tryListThings(listAskAt('box'))
        const rootNext = nextOf(rootBoxOf())
        await vaultDB.tryWriteThing(replaceAskOf(rootBoxOf(), rootNext))
        await eventually(() => notices.length === 2)
        await aWhile()
        expect(notices.map(({ val }) => val)).to.deep.equal([Thing.sparseOf(rootBoxOf()), rootNext])
        expect(badNews).to.deep.equal([])
      })
    })

    it("refuses a scope that is not a bank's", async () => {
      const vaultDB = await fresh()
      expectSyncRefusal(() => vaultDB.watch({ userid: 'u1' } as never, () => undefined, () => undefined), 'bad_record')
    })
  })
}
