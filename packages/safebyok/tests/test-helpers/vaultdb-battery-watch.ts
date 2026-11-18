/** The battery's cases of a watch. */
import { describe, expect, it } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { aWhile, eventually, expectSyncRefusal } from 'safebyok-big/testing'
import type { ThingWatchScope, WorldRecord } from '../../src/shapes/shapes-thing'
import type { ThingNotice, VaultDB } from '../../src/storage/vault-db'
import { childShellCited } from '../../src/shapes/shapes-thing'
import {
  BankStaleTrack, GateStaleTrack, Life0, ThingBank, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'

/** What a watch on `scope` hears: its notices, and its bad news. */
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
      expect(notices[0]).to.deep.equal({ ok: true, act: 'gotlive', val: gateThingOf(), world: null })
      expect(badNews).to.deep.equal([])
    })

    it("hears each of a bank's roots at its birth, with the bank and main gate as world", async () => {
      const vaultDB = await fresh()
      const { notices, badNews } = heardOf(vaultDB)
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => notices.length === 3)
      const world: WorldRecord = { ...bankThingOf(), maingate: gateThingOf() }
      expect(notices.map(({ val }) => val.labelpath)).to.have.members(['bank', 'box', 'gate'])
      expect(notices.map((notice) => notice.world)).to.deep.equal([world, world, world])
      expect(badNews).to.deep.equal([])
    })

    it("hears a box written in a born bank, with the bank and main gate as world", async () => {
      const vaultDB = await bornBank()
      const { notices } = heardOf(vaultDB)
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, childShellCited(Life0)))
      await eventually(() => notices.length === 1)
      await aWhile()
      expect(notices).to.deep.equal([{ ok: true, act: 'gotlive', val: box, world: { ...bankThingOf(), maingate: gateThingOf() } }])
    })

    it("hears nothing of another bank, nor of a refused write", async () => {
      const vaultDB = await withGate()
      const other = heardOf(vaultDB, { ...ThingBank, banklabel: 'other' })
      const own = heardOf(vaultDB)
      await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: OtherRevtok })))
      await aWhile()
      expect([...other.notices, ...own.notices]).to.have.lengthOf(0)
      expect([...other.badNews, ...own.badNews]).to.deep.equal([])
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
      expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['unexpected_error', 'unexpected_error', 'unexpected_error'])
    })

    describe("of what an answer's tracked reports", () => {
      const world: WorldRecord = { ...bankThingOf(), maingate: gateThingOf() }

      it("hears each Thing tracked other than as 'same', with the world, in the tracked bank alone", async () => {
        const vaultDB = await bornBank()
        const own = heardOf(vaultDB)
        const other = heardOf(vaultDB, { ...ThingBank, banklabel: 'other' })
        await vaultDB.tryGetThing({ ...getAskAt('box'), track: GateStaleTrack })
        await eventually(() => own.notices.length === 1)
        await aWhile()
        expect(own.notices).to.deep.equal([{ ok: true, act: 'gotlive', val: gateThingOf(), world }])
        expect(other.notices).to.deep.equal([])
      })

      it("hears of tracked Things to a listing, a refusal and a write", async () => {
        const vaultDB = await bornBank()
        const { notices } = heardOf(vaultDB)
        await vaultDB.tryListThings({ ...listAskAt('box'), track: BankStaleTrack })
        await eventually(() => notices.length === 1)
        expect(notices[0]).to.deep.equal({ ok: true, act: 'gotlive', val: bankThingOf(), world })
        await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), track: BankStaleTrack })
        await eventually(() => notices.length === 2)
        expect(notices[1]).to.deep.equal({ ok: true, act: 'gotlive', val: bankThingOf(), world })
        const next = nextGateOf(gateThingOf())
        await vaultDB.tryWriteThing({ ...replaceAskOf(gateThingOf(), next), track: trackOf() })
        await eventually(() => notices.length >= 3)
        await aWhile()
        const nextNotice: ThingNotice = { ok: true, act: 'gotlive', val: next, world: { ...bankThingOf(), maingate: next } }
        for (const notice of notices.slice(2)) { expect(notice).to.deep.equal(nextNotice) }
      })

      it("hears nothing more where each tracked Thing is 'same', or the ask tracks nothing", async () => {
        const vaultDB = await bornBank()
        const { notices, badNews } = heardOf(vaultDB)
        await vaultDB.tryGetThing({ ...getAskAt('box'), track: trackOf() })
        await vaultDB.tryListThings(listAskAt('box'))
        const rootNext = nextOf(rootBoxOf())
        await vaultDB.tryWriteThing(replaceAskOf(rootBoxOf(), rootNext))
        await eventually(() => notices.length === 1)
        await aWhile()
        expect(notices.map(({ val }) => val.labelpath)).to.deep.equal(['box'])
        expect(badNews).to.deep.equal([])
      })
    })

    it("refuses a scope that is not a bank's", async () => {
      const vaultDB = await fresh()
      expectSyncRefusal(() => vaultDB.watch({ userid: 'u1' } as never, () => undefined, () => undefined), 'bad_record')
    })
  })
}
