/** The lease rows a deviceDB's tests store: a live row and a tombstone of {@link WorldScope}'s bank, at the life and revision a test asks for. */
import { Crypto } from 'safebyok-big/internals'
import { fakeCiphered } from 'safebyok-big/testing'
import { type Lifenum, Lifeseq } from '../../src/shapes/primitives'
import { type LeaseTombstone, type LiveLeaseRow, LeaseFormat } from '../../src/shapes/shapes-stamps'
import { T0, WorldBankStamp, WorldGate, WorldScope, revtokOf } from './models-world'

// == [Lease rows]: LeaseRowGiven, rowCitedOf, liveLeaseRowOf, leaseTombstoneOf

/** The life and revision of a lease row a test builds, as a lifenum and a revseq. */
export type LeaseRowGiven = { lifenum?: Lifenum, revseq?: number }

/** A lease row's own life and revision, and its scope. */
function rowCitedOf(lifenum: Lifenum, revseq: number): Omit<LeaseTombstone, 'am'> {
  const lifeseq = Lifeseq.ofLifenum(lifenum)
  return { fmt: LeaseFormat, ...WorldScope, lifeseq, lifepath: lifeseq, revseq, revtok: revtokOf(`${String(lifenum)}.${String(revseq)}`), written_at: T0 }
}

/** A live lease row of {@link WorldScope}'s bank under {@link WorldGate}, with a fresh leaseKey, at life 0 and revision 0 unless asked; `overrides` replace any field. */
export async function liveLeaseRowOf({ lifenum = 0, revseq = 0, ...overrides }: LeaseRowGiven & Partial<LiveLeaseRow> = {}): Promise<LiveLeaseRow> {
  return {
    bank_lifeseq: WorldBankStamp.lifeseq, bank_born_at: WorldBankStamp.born_at, bank_lifetok: WorldBankStamp.lifetok,
    gate_labelpath: WorldGate.labelpath, gate_lifeseq: WorldGate.lifeseq, gate_revtok: WorldGate.revtok,
    born_at: T0, proved_at: T0, wayinkind: 'passphrase',
    lease_key: await Crypto.makeLeaseKey(), bank_key_lease_wrapped: fakeCiphered('lease'),
    ...rowCitedOf(lifenum, revseq), am: 'a', ends_at: T0 + 3_600_000, gate_revseq: 0,
    ...overrides,
  }
}

/** A tombstone of {@link WorldScope}'s lease row, at life 1 and revision 0 unless asked; `overrides` replace any field. */
export function leaseTombstoneOf({ lifenum = 1, revseq = 0, ...overrides }: LeaseRowGiven & Partial<LeaseTombstone> = {}): LeaseTombstone {
  return { ...rowCitedOf(lifenum, revseq), am: 'x', ...overrides }
}
// --
