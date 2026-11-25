/** The battery's cases of `tracked`: what an answer says of the bank, main gate and root box its ask tracks. */
import { describe, expect, it } from 'vitest'
import { expectBad } from 'safebyok-big/testing'

import {
  BankStaleTrack, GateStaleTrack, RootStaleTrack, bankThingOf, birthAskOf, birthBankAskOf, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'
import { Lifeseq } from '../../src/shapes/primitives'
import { VoidTrack } from '../../src/shapes/shapes-asks'

/** Register the battery's cases of `tracked`. */
export function describeVaultDBTracked({ fresh, bornBank }: VaultDBBatteryWorld): void {
  describe("tracked, beside the world", () => {
    it("is 'same' for each of the bank, main gate and root box stored as the ask tracks them", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: trackOf() })).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same', box: 'same' } })
    })

    it("is the stored Thing where its revseq or lifepath is not the one tracked, the bank without its main gate", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: GateStaleTrack })).to.deep.include({ tracked: { bank: 'same', gate: gateThingOf(), box: 'same' } })
      expect(await vaultDB.tryListThings({ ...listAskAt('box'), track: BankStaleTrack })).to.deep.include({ ok: true, tracked: { bank: bankThingOf(), gate: 'same', box: 'same' } })
      expect(await vaultDB.tryGetThing({ ...getAskAt('gate'), track: RootStaleTrack })).to.deep.include({ tracked: { bank: 'same', gate: 'same', box: rootBoxOf() } })
    })

    it("is read after a write, beside the world", async () => {
      const vaultDB = await bornBank()
      const next = nextGateOf(gateThingOf())
      const answer = await vaultDB.tryWriteThing({ ...replaceAskOf(gateThingOf(), next), track: trackOf() })
      expect(answer).to.deep.include({ ok: true, act: 'replaced', tracked: { bank: 'same', gate: next, box: 'same' } })
      const rootNext = nextOf(rootBoxOf())
      const rootAnswer = await vaultDB.tryWriteThing({ ...replaceAskOf(rootBoxOf(), rootNext), track: trackOf(bankThingOf(), next) })
      expect(rootAnswer).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same', box: rootNext } })
    })

    it("is carried by a refusal", async () => {
      const vaultDB = await bornBank()
      const refusal = await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), track: GateStaleTrack })
      expect(refusal).to.deep.include({ ok: false, act: 'stale', tracked: { bank: 'same', gate: gateThingOf(), box: 'same' } })
    })

    it("is the roots written or found, to a birth", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank({ ...birthBankAskOf(), track: BankStaleTrack })).to.deep.include({ ok: true, act: 'born', tracked: { bank: bankThingOf(), gate: 'same', box: 'same' } })
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: OtherRevtok }), track: trackOf() })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', tracked: { bank: 'same', gate: 'same', box: 'same' } })
    })

    it("is, for each root, 'same' where the ask tracks the void revision and none is stored, or tracks the revision stored, and the stored root whole where it tracks any other", async () => {
      const same  = { bank: 'same', gate: 'same', box: 'same' }
      const whole = { bank: bankThingOf(), gate: gateThingOf(), box: rootBoxOf() }
      const empty = await fresh()
      expect(await empty.tryGetThing({ ...getAskAt('box'), track: VoidTrack })).to.deep.include({ ok: true, act: 'gotvoid', tracked: same })
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: VoidTrack })).to.deep.include({ ok: true, tracked: whole })
      expect(await vaultDB.tryListThings({ ...listAskAt('box'), track: VoidTrack })).to.deep.include({ ok: true, tracked: whole })
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: trackOf() })).to.deep.include({ ok: true, tracked: same })
      const mixed = { bank: VoidTrack.bank, gate: trackOf().gate, box: RootStaleTrack.box }
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: mixed })).to.deep.include({ ok: true, tracked: { bank: bankThingOf(), gate: 'same', box: rootBoxOf() } })
    })

    it("refuses a track that is not the revseq and lifepath of the bank, the main gate and the root box", async () => {
      const vaultDB = await bornBank()
      const { bank, gate, box } = trackOf()
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), track: { bank, gate } } as never), 'bad_record')
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), track: { bank, gate, box, vault: box } } as never), 'bad_record')
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), track: { bank: { ...bank, lifeseq: Lifeseq.ofLifenum(0) }, gate, box } } as never), 'bad_record')
    })
  })
}
