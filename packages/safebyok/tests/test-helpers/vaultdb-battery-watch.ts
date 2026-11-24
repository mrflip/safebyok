/** The battery's cases of a watch. */
import { describe, expect, it } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { aWhile, eventually, expectSyncRefusal } from 'safebyok-big/testing'
import type { ThingWatchScope } from '../../src/shapes/shapes-asks'
import type { VaultDB } from '../../src/storage/vault-db'
import type { VaultEvent } from '../../src/shapes/shapes-vault-event'
import { Shell } from '../../src/shapes/shapes-thing'
import { Thing } from '../../src/models/thing'
import {
  BankStaleTrack, GateStaleTrack, Life0, RootStaleTrack, ThingBank, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, boxTombOf, delAskFor, gateThingOf, getAskAt, itemEventOf, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'

/** The notices and the bad news a watcher of `scope` gets. */
function heardOf(vaultDB: VaultDB, scope: ThingWatchScope = ThingBank): { events: VaultEvent[], badNews: Errors.VaultError[], stop: () => void } {
  const events: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  const stop = vaultDB.watch(scope, (event) => { events.push(event) }, (news) => { badNews.push(news) })
  return { events, badNews, stop }
}

/** The records `events` carry. */
function recordsOf(events: readonly VaultEvent[]): unknown[] {
  return events.map((event) => ((event.eventkind === 'item') ? event.record : event))
}

/** Register the battery's cases of a watch. */
export function describeVaultDBWatch({ fresh, bornBank, withGate }: VaultDBBatteryWorld): void {
  describe("watch(scope, onNotice, onBadNews)", () => {
    it("notifies of each Thing written in the bank, after the write", async () => {
      const vaultDB = await fresh()
      const { events, badNews } = heardOf(vaultDB)
      await vaultDB.tryWriteThing(birthAskOf())
      await eventually(() => events.length === 1)
      await aWhile()
      expect(events).to.deep.equal([itemEventOf(gateThingOf())])
      expect(badNews).to.deep.equal([])
    })

    it("notifies of each of a bank's roots at its birth, one notice each", async () => {
      const vaultDB = await fresh()
      const { events, badNews } = heardOf(vaultDB)
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => events.length === 3)
      await aWhile()
      expect(recordsOf(events)).to.have.deep.members([bankThingOf(), gateThingOf(), rootBoxOf()])
      expect(badNews).to.deep.equal([])
    })

    it("notifies of a box written in a born bank, and of nothing in the bank or main gate", async () => {
      const vaultDB = await bornBank()
      const { events } = heardOf(vaultDB)
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0)))
      await eventually(() => events.length === 1)
      await aWhile()
      expect(events).to.deep.equal([itemEventOf(box)])
    })

    it("notifies of the dbhas of a refused write alone, and of nothing in another bank", async () => {
      const vaultDB = await withGate()
      const other = heardOf(vaultDB, { ...ThingBank, banklabel: 'other' })
      const own = heardOf(vaultDB)
      await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: OtherRevtok })))
      expect(own.events).to.deep.equal([itemEventOf(gateThingOf())])
      await aWhile()
      expect(own.events).to.have.lengthOf(1)
      expect(other.events).to.deep.equal([])
      expect([...other.badNews, ...own.badNews]).to.deep.equal([])
    })

    it("notifies of the tombstone a get answers as its dbhas, before the answer, and of nothing for a live Thing got", async () => {
      const vaultDB = await bornBank()
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0)))
      const tomb = boxTombOf(box)
      await vaultDB.tryWriteThing(delAskFor(box, tomb))
      await aWhile()
      const { events, badNews } = heardOf(vaultDB)
      expect(await vaultDB.tryGetThing(getAskAt('box'))).to.deep.include({ ok: true, act: 'gotlive' })
      expect(await vaultDB.tryGetThing(getAskAt(box.labelpath))).to.deep.include({ ok: true, act: 'gotgone', dbhas: tomb })
      expect(events).to.deep.equal([itemEventOf(tomb, 'gone')])
      await aWhile()
      expect(events).to.have.lengthOf(1)
      expect(badNews).to.deep.equal([])
    })

    it("notifies of the dbhas a thrown refusal carries, once", async () => {
      const vaultDB = await withGate()
      const { events, badNews } = heardOf(vaultDB)
      const gate = gateThingOf()
      const answer = await vaultDB.tryWriteThing(replaceAskOf(gate, nextGateOf(gate), { policies: ['revoke_passkey'] }))
      expect(answer).to.deep.include({ ok: false, act: 'policied', dbhas: gate })
      expect(recordsOf(events)).to.deep.equal([gate])
      await aWhile()
      expect(events).to.have.lengthOf(1)
      expect(badNews).to.deep.equal([])
    })

    it("notifies of nothing once stopped", async () => {
      const vaultDB = await fresh()
      const { events, badNews, stop } = heardOf(vaultDB)
      stop()
      await vaultDB.tryWriteThing(birthAskOf())
      await aWhile()
      expect(events).to.have.lengthOf(0)
      expect(badNews).to.deep.equal([])
    })

    it("sends onBadNews the error a notice handler throws, and goes on notifying", async () => {
      const vaultDB = await fresh()
      const badNews: Errors.VaultError[] = []
      const events: VaultEvent[] = []
      vaultDB.watch(ThingBank, (event) => { events.push(event); throw new Error('host bug') }, (news) => { badNews.push(news) })
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => badNews.length === 3)
      expect(events).to.have.lengthOf(3)
      expect(new Set(badNews.map((news) => news.refusalkind))).to.deep.equal(new Set(['unexpected_error']))
    })

    describe("of what an answer's tracked reports", () => {
      it("notifies of each Thing tracked other than as 'same', alone and before the verb answers, in the tracked bank alone", async () => {
        const vaultDB = await bornBank()
        const own = heardOf(vaultDB)
        const other = heardOf(vaultDB, { ...ThingBank, banklabel: 'other' })
        await vaultDB.tryGetThing({ ...getAskAt('box'), track: GateStaleTrack })
        expect(recordsOf(own.events)).to.deep.equal([gateThingOf()])
        await aWhile()
        expect(own.events).to.have.lengthOf(1)
        expect(other.events).to.deep.equal([])
      })

      it("notifies of tracked Things for a listing, a refusal and a write", async () => {
        const vaultDB = await bornBank()
        const { events } = heardOf(vaultDB)
        await vaultDB.tryListThings({ ...listAskAt('box'), track: BankStaleTrack })
        expect(recordsOf(events)).to.deep.equal([bankThingOf(), Thing.sparseOf(rootBoxOf())])
        await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), track: BankStaleTrack })
        expect(recordsOf(events.slice(2))).to.deep.equal([bankThingOf(), gateThingOf()])
        const next = nextGateOf(gateThingOf())
        await vaultDB.tryWriteThing({ ...replaceAskOf(gateThingOf(), next), track: trackOf() })
        await eventually(() => events.length === 6)
        await aWhile()
        expect(recordsOf(events.slice(4))).to.deep.equal([next, next])
      })

      it("notifies of a refused write's changed bank, main gate and root box, then its dbhas, in that order", async () => {
        const vaultDB = await bornBank()
        const { events, badNews } = heardOf(vaultDB)
        const track = { bank: BankStaleTrack.bank, gate: GateStaleTrack.gate, box: RootStaleTrack.box }
        await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), track })
        expect(recordsOf(events)).to.deep.equal([bankThingOf(), gateThingOf(), rootBoxOf(), gateThingOf()])
        await aWhile()
        expect(events).to.have.lengthOf(4)
        expect(badNews).to.deep.equal([])
      })

      it("notifies of a good listing's changed bank, then its parent, then each Thing listed, sparse as `soon` and in labelpath order, before the listing answers", async () => {
        const vaultDB = await bornBank()
        const boxes   = [boxThingOf('openai'), boxThingOf('anthropic')]
        for (const box of boxes) { await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0))) }
        await aWhile()
        const { events, badNews } = heardOf(vaultDB)
        await vaultDB.tryListThings({ ...listAskAt('box'), track: BankStaleTrack })
        const listed = [rootBoxOf(), boxes[1]!, boxes[0]!].map((box) => itemEventOf(Thing.sparseOf(box), 'soon'))
        expect(events).to.deep.equal([itemEventOf(bankThingOf()), ...listed])
        await aWhile()
        expect(events).to.have.lengthOf(4)
        expect(badNews).to.deep.equal([])
      })

      it("notifies of nothing more where each tracked Thing is 'same', or the ask tracks nothing", async () => {
        const vaultDB = await bornBank()
        const { events, badNews } = heardOf(vaultDB)
        await vaultDB.tryGetThing({ ...getAskAt('box'), track: trackOf() })
        await vaultDB.tryListThings(listAskAt('box'))
        const rootNext = nextOf(rootBoxOf())
        await vaultDB.tryWriteThing(replaceAskOf(rootBoxOf(), rootNext))
        await eventually(() => events.length === 2)
        await aWhile()
        expect(recordsOf(events)).to.deep.equal([Thing.sparseOf(rootBoxOf()), rootNext])
        expect(badNews).to.deep.equal([])
      })
    })

    it("refuses a scope that is not a bank's", async () => {
      const vaultDB = await fresh()
      expectSyncRefusal(() => vaultDB.watch({ userid: 'u1' } as never, () => undefined, () => undefined), 'bad_record')
    })
  })
}
