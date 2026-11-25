/** The lease records a deviceDB's tests store: a live lease and a tombstone of {@link WorldScope}'s bank, at the life and revision a test asks for. */
import { Crypto } from 'safebyok-big/internals'
import { fakeCiphered } from 'safebyok-big/testing'
import { type Lifenum, Lifeseq } from '../../src/shapes/primitives'
import type { LiveOf } from '../../src/shapes/shapes-sealers'
import type { Sparse } from '../../src/shapes/shapes-thing'
import { type LeaseRecord, type LeaseTombstone, LeaseFormat } from '../../src/shapes/shapes-stamps'
import { T0, WorldBankStamp, WorldGate, WorldScope, revtokOf } from './models-world'

// == [Lease records]: LeaseGiven, leaseThingOf, liveLeaseRecordOf, leaseTombstoneOf

/** The life and revision of a lease record a test builds, as a lifenum and a revseq. */
export type LeaseGiven = { lifenum?: Lifenum, revseq?: number }

/** The Thing fields of {@link WorldScope}'s lease, at `lifenum` and `revseq`, all but its `am`. */
function leaseThingOf(lifenum: Lifenum, revseq: number): Omit<Sparse<LeaseRecord>, 'am'> {
  const lifeseq = Lifeseq.ofLifenum(lifenum)
  return {
    fmt: LeaseFormat, ...WorldScope, labelpath: 'lease/gate', label: 'gate',
    lifeseq, lifepath: lifeseq, revseq, revtok: revtokOf(`${String(lifenum)}.${String(revseq)}`), born_at: T0, written_at: T0,
  }
}

/** A live lease record of {@link WorldScope}'s bank under {@link WorldGate}, with a fresh leaseKey, at life 0 and revision 0 unless asked; `overrides` replace any field. */
export async function liveLeaseRecordOf({ lifenum = 0, revseq = 0, ...overrides }: LeaseGiven & Partial<LiveOf<LeaseRecord>> = {}): Promise<LiveOf<LeaseRecord>> {
  return {
    bank_lifeseq: WorldBankStamp.lifeseq, bank_born_at: WorldBankStamp.born_at, bank_lifetok: WorldBankStamp.lifetok,
    gate_labelpath: WorldGate.labelpath, gate_lifeseq: WorldGate.lifeseq, gate_revtok: WorldGate.revtok,
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
