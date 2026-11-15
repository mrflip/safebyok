/** The battery's cases of a watch. */
import { describe, expect, it } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { aWhile, eventually, expectBad, expectSyncRefusal } from 'safebyok-big/testing'
import type { ThingWatchScope, WorldRecord } from '../../src/storage/shapes-thing'
import type { ThingNotice, VaultDB } from '../../src/storage/vault-db'
import { childShellCited, lifeseqOf } from '../../src/storage/shapes-thing'
import {
  BankPick, Life0, ThingBank, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, gateThingOf, getAskAt, listAskAt, nextOf, replaceAskOf, rootBoxOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

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
      await vaultDB.tryBirthBank(birthBankAskOf({ world: BankPick }))
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
      await vaultDB.tryWriteThing({ ...birthAskOf(box, childShellCited(Life0)), world: BankPick })
      await eventually(() => notices.length === 1)
      await aWhile()
      expect(notices).to.deep.equal([{ ok: true, act: 'gotlive', val: box, world: { ...bankThingOf(), maingate: gateThingOf() } }])
    })

    it("hears nothing of another bank, nor of a refused write", async () => {
      const vaultDB = await withGate()
      const other = heardOf(vaultDB, { ...ThingBank, banklabel: 'other' })
      const own = heardOf(vaultDB)
      await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: 'rev-other' })))
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
      await vaultDB.tryBirthBank(birthBankAskOf({ world: BankPick }))
      await eventually(() => badNews.length === 3)
      expect(notices).to.have.lengthOf(3)
      expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['unexpected_error', 'unexpected_error', 'unexpected_error'])
    })

    describe("the world push", () => {
      const world: WorldRecord = { ...bankThingOf(), maingate: gateThingOf() }
      const pushed: ThingNotice = { ok: true, act: 'gotlive', val: bankThingOf(), world }

      it("tells each watch of the bank of the world, as a notice of its bank, where an ask picks none", async () => {
        const vaultDB = await bornBank()
        const own = heardOf(vaultDB)
        const other = heardOf(vaultDB, { ...ThingBank, banklabel: 'other' })
        await vaultDB.tryGetThing(getAskAt('box'))
        await eventually(() => own.notices.length === 1)
        await aWhile()
        expect(own.notices).to.deep.equal([pushed])
        expect(other.notices).to.deep.equal([])
      })

      it("tells of the world where the ask's pick differs, to a listing, a refusal and a write", async () => {
        const vaultDB = await bornBank()
        const { notices } = heardOf(vaultDB)
        const stale = { ...BankPick, lifeseq: lifeseqOf(2) }
        await vaultDB.tryListThings({ ...listAskAt('box'), world: stale })
        await eventually(() => notices.length === 1)
        expect(notices[0]).to.deep.equal(pushed)
        await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: 'rev-other' })), world: { ...BankPick, revseq: 1 } })
        await eventually(() => notices.length === 2)
        expect(notices[1]).to.deep.equal(pushed)
        const rootNext = nextOf(rootBoxOf())
        await vaultDB.tryWriteThing({ ...replaceAskOf(rootBoxOf(), rootNext), world: stale })
        await eventually(() => notices.length === 4)
        expect(notices.slice(2)).to.deep.include.members([pushed, { ok: true, act: 'gotlive', val: rootNext, world }])
      })

      it("tells nothing where the ask picks the world, nor where the world is null", async () => {
        const vaultDB = await bornBank()
        const { notices, badNews } = heardOf(vaultDB)
        await vaultDB.tryGetThing({ ...getAskAt('box'), world: BankPick })
        await vaultDB.tryListThings({ ...listAskAt('box'), world: BankPick })
        const lone = await withGate()
        const loneHeard = heardOf(lone)
        await lone.tryGetThing(getAskAt('gate'))
        await aWhile()
        expect([...notices, ...loneHeard.notices]).to.deep.equal([])
        expect([...badNews, ...loneHeard.badNews]).to.deep.equal([])
      })

      it("refuses an ask whose world pick is not a revseq and a lifeseq", async () => {
        const vaultDB = await bornBank()
        await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), world: { revseq: 0 } } as never), 'bad_option')
        await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), world: { ...BankPick, revtok: 'rev-0' } } as never), 'bad_option')
      })
    })

    it("refuses a scope that is not a bank's", async () => {
      const vaultDB = await fresh()
      expectSyncRefusal(() => vaultDB.watch({ userid: 'u1' } as never, () => undefined, () => undefined), 'bad_option')
    })
  })
}
