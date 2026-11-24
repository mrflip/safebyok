/** The battery's cases of a watch. */
import { describe, expect, it } from 'vitest'
import type { Errors } from 'safebyok-big/internals'
import { aWhile, eventually, expectSyncRefusal } from 'safebyok-big/testing'
import type { ThingWatchScope } from '../../src/shapes/shapes-asks'
import type { VaultDB } from '../../src/storage/vault-db'
import type { VaultEvent } from '../../src/shapes/shapes-vault-event'
import { Shell } from '../../src/shapes/shapes-thing'
import {
  BankStaleKnownRoots, GateStaleKnownRoots, Life0, RootStaleKnownRoots, ThingBank, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, boxTombOf, delAskFor, gateThingOf, getAskAt, itemEventOf, listAskAt, maskedReadTcsOf, nextGateOf, replaceAskOf, rootBoxOf,
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
      expect(maskedReadTcsOf(events)).to.deep.equal([itemEventOf(gateThingOf())])
      expect(badNews).to.deep.equal([])
    })

    it("notifies of each of a bank's roots at its birth, one notice each", async () => {
      const vaultDB = await fresh()
      const { events, badNews } = noticesOf(vaultDB)
      await vaultDB.tryBirthBank(birthBankAskOf())
      await eventually(() => events.length === 3)
      await aWhile()
      expect(recordsOf(events)).to.have.deep.members([bankThingOf(), gateThingOf(), rootBoxOf()])
      expect(badNews).to.deep.equal([])
    })

    it("notifies of a box written in a born bank, and of nothing in the bank or main gate, or in another bank", async () => {
      const vaultDB = await bornBank()
      const own = noticesOf(vaultDB)
      const other = noticesOf(vaultDB, { ...ThingBank, banklabel: 'other' })
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0)))
      await eventually(() => own.events.length === 1)
      await aWhile()
      expect(maskedReadTcsOf(own.events)).to.deep.equal([itemEventOf(box, bankThingOf().lifetok)])
      expect([...other.events, ...other.badNews]).to.deep.equal([])
    })

    it("notifies of nothing an answer carries beside a write: a refusal's dbhas, a tombstone got, the tracked roots, or a list's parent and Things listed", async () => {
      const vaultDB = await bornBank()
      const box = boxThingOf()
      await vaultDB.tryWriteThing(birthAskOf(box, Shell.childCited(Life0)))
      await vaultDB.tryWriteThing(delAskFor(box, boxTombOf(box)))
      await aWhile()
      const { events, badNews } = noticesOf(vaultDB)
      const known_roots = { bank: BankStaleKnownRoots.bank, gate: GateStaleKnownRoots.gate, box: RootStaleKnownRoots.box }
      const gate  = gateThingOf()
      const theirs = gateThingOf({ revtok: OtherRevtok })
      expect(await vaultDB.tryWriteThing({ ...birthAskOf(theirs), known_roots })).to.deep.include({ ok: false, dbhas: gate })
      const policied = replaceAskOf(gate, nextGateOf(gate), { policies: ['revoke_passkey'] })
      expect(await vaultDB.tryWriteThing(policied)).to.deep.include({ ok: false, act: 'policied' })
      expect(await vaultDB.tryGetThing({ ...getAskAt(box.labelpath), known_roots })).to.deep.include({ ok: true, act: 'gotgone' })
      expect(await vaultDB.tryListThings({ ...listAskAt('box'), known_roots })).to.deep.include({ ok: true })
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
      await eventually(() => badNews.length === 3)
      expect(events).to.have.lengthOf(3)
      expect(new Set(badNews.map((news) => news.refusalkind))).to.deep.equal(new Set(['unexpected_error']))
    })

    it("refuses a scope that is not a bank's", async () => {
      const vaultDB = await fresh()
      expectSyncRefusal(() => vaultDB.watch({ userid: 'u1' } as never, () => undefined, () => undefined), 'bad_record')
    })
  })
}
