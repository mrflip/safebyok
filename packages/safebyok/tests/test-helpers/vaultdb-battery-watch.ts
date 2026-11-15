/** The battery's cases of a watch. */
import { describe, expect, it } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { aWhile, eventually, expectSyncRefusal } from 'safebyok-big/testing'
import { type ThingWatchScope, bankRecordOf } from '../../src/storage/shapes-thing'
import type { ThingNotice, VaultDB } from '../../src/storage/vault-db'
import { ThingBank, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, gateThingOf, rootBoxOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

/** What a watch on `scope` hears: its notices, and its bad news. */
function heardOf(vaultDB: VaultDB, scope: ThingWatchScope = ThingBank): { notices: ThingNotice[], badNews: Errors.VaultError[], stop: () => void } {
  const notices: ThingNotice[] = []
  const badNews: Errors.VaultError[] = []
  const stop = vaultDB.watch(scope, (notice) => { notices.push(notice) }, (news) => { badNews.push(news) })
  return { notices, badNews, stop }
}

/** Register the battery's cases of a watch. */
export function describeVaultDBWatch({ fresh, bornBank, withGate, boxesBorn }: VaultDBBatteryWorld): void {
  describe("watch(scope, onNotice, onBadNews)", () => {
    it("hears each Thing written in the bank, after the write", async () => {
      const vaultDB = await fresh()
      const { notices, badNews } = heardOf(vaultDB)
      await vaultDB.tryWriteThing(birthAskOf())
      await eventually(() => notices.length === 1)
      expect(notices[0]).to.deep.equal({ ok: true, act: 'gotlive', val: gateThingOf(), world: null })
      expect(badNews).to.deep.equal([])
    })

    it("hears each of a bank's roots at its birth, with the bank as world", async () => {
      const vaultDB = await fresh()
      const { notices, badNews } = heardOf(vaultDB)
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => notices.length === 3)
      const world = bankRecordOf({ bank: bankThingOf(), gate: gateThingOf(), root: rootBoxOf() })
      expect(notices.map(({ val }) => val.labelpath)).to.have.members(['bank', 'box', 'gate'])
      expect(notices.map((notice) => notice.world)).to.deep.equal([world, world, world])
      expect(badNews).to.deep.equal([])
    })

    it("hears a box written in a born bank, with the bank as world", async () => {
      const vaultDB = await bornBank()
      const { notices } = heardOf(vaultDB)
      const [box] = await boxesBorn(vaultDB, boxThingOf())
      await eventually(() => notices.length === 1)
      expect(notices[0]).to.deep.equal({ ok: true, act: 'gotlive', val: box, world: bankRecordOf({ bank: bankThingOf(), gate: gateThingOf(), root: rootBoxOf() }) })
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
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => badNews.length === 3)
      expect(notices).to.have.lengthOf(3)
      expect(badNews.map((news) => news.refusalkind)).to.deep.equal(['unexpected_error', 'unexpected_error', 'unexpected_error'])
    })

    it("refuses a scope that is not a bank's", async () => {
      const vaultDB = await fresh()
      expectSyncRefusal(() => vaultDB.watch({ userid: 'u1' } as never, () => undefined, () => undefined), 'bad_option')
    })
  })
}
