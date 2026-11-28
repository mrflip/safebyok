/** The lease records a deviceDB's tests stow, and where: a live lease and a tombstone of {@link WorldScope}'s main gate, at the life and revision a test asks for. */
import { Crypto } from 'safebyok-big/internals'
import { fakeCiphered } from 'safebyok-big/testing'
import { type Lifenum, Lifeseq } from '../../src/shapes/primitives'
import type { LiveOf } from '../../src/shapes/shapes-sealers'
import type { Sparse } from '../../src/shapes/shapes-thing'
import { type LeaseRecord, type LeaseScope, type LeaseTombstone, LeaseFormat, leaseLifepathOf } from '../../src/shapes/shapes-stamps'
import { FirstBanktok, T0, WorldGate, WorldScope, revtokOf } from './models-world'

// == [Lease records]: WorldLeaseScope, LeaseGiven, leaseThingOf, liveLeaseRecordOf, leaseTombstoneOf

/** Where a deviceDB files the lease of {@link WorldScope}'s gate. */
export const WorldLeaseScope: LeaseScope = Object.freeze({ modelkind: 'lease', ...WorldScope, labelpath: `lease/${WorldScope.banklabel}` })

/** The life and revision of a lease record a test builds, as a lifenum and a revseq. */
export type LeaseGiven = { lifenum?: Lifenum, revseq?: number }

/** The Thing fields of {@link WorldScope}'s lease, at `lifenum` and `revseq`, all but its `am`. */
function leaseThingOf(lifenum: Lifenum, revseq: number): Omit<Sparse<LeaseRecord>, 'am'> {
  const lifeseq = Lifeseq.ofLifenum(lifenum)
  return {
    modelkind: 'lease', fmt: LeaseFormat, ...WorldScope, labelpath: `lease/${WorldScope.banklabel}`, label: WorldScope.banklabel, banktok: FirstBanktok,
    lifeseq, lifepath: leaseLifepathOf(lifeseq), revseq, revtok: revtokOf(`${String(lifenum)}.${String(revseq)}`), born_at: T0, written_at: T0,
  }
}

/** A live lease record of {@link WorldScope}'s bank under {@link WorldGate}, with a fresh leaseKey, at life 0 and revision 0 unless asked; `overrides` replace any field. */
export async function liveLeaseRecordOf({ lifenum = 0, revseq = 0, ...overrides }: LeaseGiven & Partial<LiveOf<LeaseRecord>> = {}): Promise<LiveOf<LeaseRecord>> {
  return {
    gate_labelpath: WorldGate.labelpath, gate_lifepath: WorldGate.lifepath, gate_born_at: WorldGate.born_at, gate_revtok: WorldGate.revtok,
    proved_at: T0, wayinkind: 'passphrase',
    lease_key: await Crypto.makeLeaseKey(), bank_key_lease_wrapped: fakeCiphered('lease'),
    ...leaseThingOf(lifenum, revseq), am: 'a', ends_at: T0 + 3_600_000, gate_revseq: 0,
    ...overrides,
  }
}

/** A tombstone of {@link WorldScope}'s lease, at life 1 and revision 0 unless asked; `overrides` replace any field. */
export function leaseTombstoneOf({ lifenum = 1, revseq = 0, ...overrides }: LeaseGiven & Partial<LeaseTombstone> = {}): LeaseTombstone {
  return { ...leaseThingOf(lifenum, revseq), am: 'x', ...overrides }
}
// --
