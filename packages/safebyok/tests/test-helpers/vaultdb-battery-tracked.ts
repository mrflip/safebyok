/** The battery's cases of `tracked`: what an answer says of the gate and root box its ask tracks. */
import { describe, expect, it } from 'vitest'
import { expectBad } from 'safebyok-big/testing'

import {
  GateScope, GateStaleTrack, RootStaleTrack, birthAskOf, birthBankAskOf, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'
import { Lifeseq } from '../../src/shapes/primitives'
import { VoidTrack } from '../../src/shapes/shapes-asks'

/** Register the battery's cases of `tracked`. */
export function describeVaultDBTracked({ fresh, bornBank }: VaultDBBatteryWorld): void {
  describe("tracked, beside the bank's roots", () => {
    it("is 'same' for each of the gate and root box stored as the ask tracks them", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: trackOf() })).to.deep.include({ ok: true, tracked: { gate: 'same', root: 'same' } })
    })

    it("is the actual Thing where its revseq or lifepath is not the one tracked, the one without the other", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: GateStaleTrack })).to.deep.include({ tracked: { gate: gateThingOf(), root: 'same' } })
      expect(await vaultDB.tryListThings({ ...listAskAt('box', 'box'), track: GateStaleTrack })).to.deep.include({ ok: true, tracked: { gate: gateThingOf(), root: 'same' } })
      expect(await vaultDB.tryGetThing({ ...getAskAt('gate', GateScope.labelpath), track: RootStaleTrack })).to.deep.include({ tracked: { gate: 'same', root: rootBoxOf() } })
    })

    it("is read after a write, beside the bank's roots", async () => {
      const vaultDB = await bornBank()
      const next = nextGateOf(gateThingOf())
      const answer = await vaultDB.tryWriteThing({ ...replaceAskOf(gateThingOf(), next), track: trackOf() })
      expect(answer).to.deep.include({ ok: true, act: 'replaced', tracked: { gate: next, root: 'same' } })
      const rootNext = nextOf(rootBoxOf())
      const rootAnswer = await vaultDB.tryWriteThing({ ...replaceAskOf(rootBoxOf(), rootNext), track: trackOf(next) })
      expect(rootAnswer).to.deep.include({ ok: true, tracked: { gate: 'same', root: rootNext } })
    })

    it("is carried by a refusal", async () => {
      const vaultDB = await bornBank()
      const refusal = await vaultDB.tryWriteThing({ ...birthAskOf(gateThingOf({ revtok: OtherRevtok })), track: GateStaleTrack })
      expect(refusal).to.deep.include({ ok: false, act: 'stale', tracked: { gate: gateThingOf(), root: 'same' } })
    })

    it("is the roots written or found, to a birth", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank({ ...birthBankAskOf(), track: GateStaleTrack })).to.deep.include({ ok: true, act: 'born', tracked: { gate: gateThingOf(), root: 'same' } })
      const other = birthBankAskOf({ gate: gateThingOf({ revtok: OtherRevtok }), track: trackOf() })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', tracked: { gate: 'same', root: 'same' } })
    })

    it("is, for each root, 'same' where the ask tracks the void revision and none is stored, or tracks the actual revision, and the actual root whole where it tracks any other", async () => {
      const same  = { gate: 'same', root: 'same' }
      const whole = { gate: gateThingOf(), root: rootBoxOf() }
      const empty = await fresh()
      expect(await empty.tryGetThing({ ...getAskAt('box', 'box'), track: VoidTrack })).to.deep.include({ ok: true, act: 'gotvoid', tracked: same })
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: VoidTrack })).to.deep.include({ ok: true, tracked: whole })
      expect(await vaultDB.tryListThings({ ...listAskAt('box', 'box'), track: VoidTrack })).to.deep.include({ ok: true, tracked: whole })
      expect(await vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: trackOf() })).to.deep.include({ ok: true, tracked: same })
      const mixed = { gate: VoidTrack.gate, root: trackOf().root }
      expect(await vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: mixed })).to.deep.include({ ok: true, tracked: { gate: gateThingOf(), root: 'same' } })
    })

    it("refuses a track that is not the revseq and lifepath of the gate and the root box", async () => {
      const vaultDB = await bornBank()
      const { gate, root } = trackOf()
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: { gate } } as never), 'bad_record')
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: { gate, root, box: root } } as never), 'bad_record')
      await expectBad(vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: { gate: { ...gate, lifeseq: Lifeseq.ofLifenum(0) }, root } } as never), 'bad_record')
    })
  })
}
