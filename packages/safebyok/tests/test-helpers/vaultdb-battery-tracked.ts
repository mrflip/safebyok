/** The battery's cases of `tracked`: what an answer says of the bank and main gate its ask tracks. */
import { describe, expect, it } from 'vitest'
import { expectBad } from 'safebyok-big/testing'
import { lifeseqOf } from '../../src/storage/shapes-thing'
import {
  BankStaleTrack, GateStaleTrack, bankThingOf, birthAskOf, birthBankAskOf, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

/** Register the battery's cases of `tracked`. */
export function describeVaultDBTracked({ fresh, bornBank }: VaultDBBatteryWorld): void {
  describe("tracked, beside the world", () => {
    it("is 'same' for each of the bank and main gate stored as the ask tracks them", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: trackOf() })).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same' } })
    })

    it("is the Thing as stored where its revseq or lifepath is not the one tracked, the bank without its main gate", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: GateStaleTrack })).to.deep.include({ tracked: { bank: 'same', gate: gateThingOf() } })
      expect(await vaultDB.tryListThings({ ...listAskAt('box'), track: BankStaleTrack })).to.deep.include({ ok: true, tracked: { bank: bankThingOf(), gate: 'same' } })
    })

    it("is read after a write, beside the world", async () => {
      const vaultDB = await bornBank()
      const next = nextGateOf(gateThingOf())
      const answer = await vaultDB.tryWriteThing({ ...replaceAskOf(gateThingOf(), next), track: trackOf() })
      expect(answer).to.deep.include({ ok: true, act: 'replaced', tracked: { bank: 'same', gate: next } })
      const rootNext = nextOf(rootBoxOf())
      const rootAnswer = await vaultDB.tryWriteThing({ ...replaceAskOf(rootBoxOf(), rootNext), track: trackOf(bankThingOf(), next) })
      expect(rootAnswer).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same' } })
    })

    it("is carried by a refusal", async () => {
      const vaultDB = await bornBank()
      const refusal = await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: 'rev-other' })), track: GateStaleTrack })
      expect(refusal).to.deep.include({ ok: false, act: 'stale', tracked: { bank: 'same', gate: gateThingOf() } })
    })

    it("is the roots written or found, to a birth", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank({ ...birthBankAskOf(), track: BankStaleTrack })).to.deep.include({ ok: true, act: 'born', tracked: { bank: bankThingOf(), gate: 'same' } })
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: 'rev-other' }), track: trackOf() })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', tracked: { bank: 'same', gate: 'same' } })
    })

    it("is not in the answer to an ask that tracks nothing", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing(getAskAt('box'))).not.to.have.property('tracked')
      expect(await vaultDB.tryListThings(listAskAt('box'))).not.to.have.property('tracked')
    })

    it("refuses a track that is not the bank's and the main gate's revseq and lifepath", async () => {
      const vaultDB = await bornBank()
      const { bank, gate } = trackOf()
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), track: { bank } } as never), 'bad_option')
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), track: { bank, gate, box: gate } } as never), 'bad_option')
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), track: { bank: { ...bank, lifeseq: lifeseqOf(0) }, gate } } as never), 'bad_option')
    })
  })
}
