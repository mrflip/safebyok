/** The battery's cases of a watch. */
import { describe, expect, it } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { aWhile, eventually, expectSyncRefusal } from 'safebyok-big/testing'
import type { ThingWatchScope } from '../../src/shapes/shapes-asks'
import type { VaultDB } from '../../src/storage/vault-db'
import type { VaultEvent } from '../../src/shapes/shapes-vault-event'
import { Shell } from '../../src/shapes/shapes-thing'
import {
  GateStaleTrack, Life0, RootStaleTrack, ThingBank, birthAskOf, birthBankAskOf, boxThingOf, boxTombOf, delAskFor, gateThingOf, getAskAt, itemEventOf, listAskAt, maskedReadTcsOf, nextGateOf, replaceAskOf, rootBoxOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'

/** The notices and the bad news a watcher of `scope` gets. */
function noticesOf(vaultDB: VaultDB, scope: ThingWatchScope = ThingBank): { events: VaultEvent[], badNews: Errors.VaultError[], stop: () => void } {
  const events: VaultEvent[] = []
  const badNews: Errors.VaultError[] = []
  const stop = vaultDB.watch(scope, (event) => { events.push(event) }, (news) => { badNews.push(news) })
  return { events, badNews, stop }
}

/** The records `events` carry. */
function recordsOf(events: readonly VaultEvent[]): unknown[] {
  return events.map((event) => ((event.eventkind === 'item') ? event.val : event))
}

/** Register the battery's cases of a raw vaultDB's watch: it notifies what its datastore reports changing, and nothing an answer carries. */
export function describeVaultDBWatch({ fresh, bornBank }: VaultDBBatteryWorld): void {
  describe("watch(scope, onNotice, onBadNews)", () => {
    it("notifies of each Thing written in the bank, after the write, read when it arrives", async () => {
      const vaultDB = await fresh()
      const { events, badNews } = noticesOf(vaultDB)
      await vaultDB.tryWriteThing(birthAskOf())
      await eventually(() => events.length === 1)
      await aWhile()
      expect(maskedReadTcsOf(events)).to.deep.equal([itemEventOf(gateThingOf(), gateThingOf().banktok)])
      expect(badNews).to.deep.equal([])
    })

    it("notifies of each of a bank's roots at its birth, one notice each", async () => {
      const vaultDB = await fresh()
      const { events, badNews } = noticesOf(vaultDB)
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => events.length === 2)
      await aWhile()
      expect(recordsOf(events)).to.have.deep.members([gateThingOf(), rootBoxOf()])
      expect(badNews).to.deep.equal([])
    })

    it("notifies of the gate and the root box of a bank labelled box at its birth, both at box, each of its own kind", async () => {
      const vaultDB   = await fresh()
      const banklabel = 'box'
      const gate      = gateThingOf({ banklabel, labelpath: banklabel, label: banklabel })
      const root      = rootBoxOf({ banklabel })
      const { events, badNews } = noticesOf(vaultDB, { ...ThingBank, banklabel })
      await vaultDB.tryBirthBank(birthBankAskOf({ banklabel, gate, root }))
      await eventually(() => events.length === 2)
      await aWhile()
      expect(events.map((event) => [event.modelkind, event.labelpath])).to.have.deep.members([['gate', 'box'], ['box', 'box']])
      expect(recordsOf(events)).to.have.deep.members([gate, root])
      expect(badNews).to.deep.equal([])
    })

    it("notifies of a box written in a born bank, and of nothing at its roots, or in another bank", async () => {
      const vaultDB = await bornBank()
      const own = noticesOf(vaultDB)
      const other = noticesOf(vaultDB, { ...ThingBank, banklabel: 'other' })
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0)))
      await eventually(() => own.events.length === 1)
      await aWhile()
      expect(maskedReadTcsOf(own.events)).to.deep.equal([itemEventOf(box, gateThingOf().banktok)])
      expect([...other.events, ...other.badNews]).to.deep.equal([])
    })

    it("notifies of nothing an answer carries beside a write: a refusal's dbhas, a tombstone got, the tracked roots, or a list's parent and Things listed", async () => {
      const vaultDB = await bornBank()
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0)))
      await vaultDB.tryWriteThing(delAskFor(box, boxTombOf(box)))
      await aWhile()
      const { events, badNews } = noticesOf(vaultDB)
      const track = { gate: GateStaleTrack.gate, root: RootStaleTrack.root }
      const gate  = gateThingOf()
      const theirs = gateThingOf({ revtok: OtherRevtok })
      expect(await vaultDB.tryWriteThing({ ...birthAskOf(theirs), track })).to.deep.include({ ok: false, dbhas: gate })
      const policied = replaceAskOf(gate, nextGateOf(gate), { policies: ['revoke_passkey'] })
      expect(await vaultDB.tryWriteThing(policied)).to.deep.include({ ok: false, act: 'policied' })
      expect(await vaultDB.tryGetThing({ ...getAskAt('box', box.labelpath), track })).to.deep.include({ ok: true, act: 'gotgone' })
      expect(await vaultDB.tryListThings({ ...listAskAt('box', 'box'), track })).to.deep.include({ ok: true })
      await aWhile()
      expect(events).to.deep.equal([])
      expect(badNews).to.deep.equal([])
    })

    it("notifies of nothing once stopped", async () => {
      const vaultDB = await fresh()
      const { events, badNews, stop } = noticesOf(vaultDB)
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
      await eventually(() => badNews.length === 2)
      expect(events).to.have.lengthOf(2)
      expect(new Set(badNews.map((news) => news.refusalkind))).to.deep.equal(new Set(['unexpected_error']))
    })

    it("refuses a scope that is not a bank's", async () => {
      const vaultDB = await fresh()
      expectSyncRefusal(() => vaultDB.watch({ userid: 'u1' } as never, () => undefined, () => undefined), 'bad_record')
    })
  })
}
