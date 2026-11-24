/** The battery's cases of `tracked`: what an answer says of the bank, main gate and root box its ask tracks. */
import { describe, expect, it } from 'vitest'
import { expectBad } from 'safebyok-big/testing'

import {
  BankStaleKnownRoots, GateStaleKnownRoots, RootStaleKnownRoots, bankThingOf, birthAskOf, birthBankAskOf, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, knownRootsOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'
import { Lifeseq } from '../../src/shapes/primitives'

/** Register the battery's cases of `tracked`. */
export function describeVaultDBTracked({ fresh, bornBank }: VaultDBBatteryWorld): void {
  describe("tracked, beside the world", () => {
    it("is 'same' for each of the bank, main gate and root box stored as the ask tracks them", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), known_roots: knownRootsOf() })).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same', box: 'same' } })
    })

    it("is the stored Thing where its revseq or lifepath is not the one tracked, the bank without its main gate", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), known_roots: GateStaleKnownRoots })).to.deep.include({ tracked: { bank: 'same', gate: gateThingOf(), box: 'same' } })
      expect(await vaultDB.tryListThings({ ...listAskAt('box'), known_roots: BankStaleKnownRoots })).to.deep.include({ ok: true, tracked: { bank: bankThingOf(), gate: 'same', box: 'same' } })
      expect(await vaultDB.tryGetThing({ ...getAskAt('gate'), known_roots: RootStaleKnownRoots })).to.deep.include({ tracked: { bank: 'same', gate: 'same', box: rootBoxOf() } })
    })

    it("is read after a write, beside the world", async () => {
      const vaultDB = await bornBank()
      const next = nextGateOf(gateThingOf())
      const answer = await vaultDB.tryWriteThing({ ...replaceAskOf(gateThingOf(), next), known_roots: knownRootsOf() })
      expect(answer).to.deep.include({ ok: true, act: 'replaced', tracked: { bank: 'same', gate: next, box: 'same' } })
      const rootNext = nextOf(rootBoxOf())
      const rootAnswer = await vaultDB.tryWriteThing({ ...replaceAskOf(rootBoxOf(), rootNext), known_roots: knownRootsOf(bankThingOf(), next) })
      expect(rootAnswer).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same', box: rootNext } })
    })

    it("is carried by a refusal", async () => {
      const vaultDB = await bornBank()
      const refusal = await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), known_roots: GateStaleKnownRoots })
      expect(refusal).to.deep.include({ ok: false, act: 'stale', tracked: { bank: 'same', gate: gateThingOf(), box: 'same' } })
    })

    it("is the roots written or found, to a birth", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank({ ...birthBankAskOf(), known_roots: BankStaleKnownRoots })).to.deep.include({ ok: true, act: 'born', tracked: { bank: bankThingOf(), gate: 'same', box: 'same' } })
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: OtherRevtok }), known_roots: knownRootsOf() })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', tracked: { bank: 'same', gate: 'same', box: 'same' } })
    })

    it("is not in the answer to an ask that tracks nothing", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing(getAskAt('box'))).not.to.have.property('tracked')
      expect(await vaultDB.tryListThings(listAskAt('box'))).not.to.have.property('tracked')
    })

    it("refuses known_roots that are not the revseq and lifepath of the bank, the main gate and the root box", async () => {
      const vaultDB = await bornBank()
      const { bank, gate, box } = knownRootsOf()
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), known_roots: { bank, gate } } as never), 'bad_record')
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), known_roots: { bank, gate, box, vault: box } } as never), 'bad_record')
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box'), known_roots: { bank: { ...bank, lifeseq: Lifeseq.ofLifenum(0) }, gate, box } } as never), 'bad_record')
    })
  })
}
