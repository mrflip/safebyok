/** The signed-in bank's three roots between page loads, on the root shelf a host hands a device: `localStorage`, say. */

import { type Errors, Outcome } from 'safebyok-big/internals'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import type { Adoptable } from '../models/thing'
import type { World } from '../models/world'
import type { RootShelf } from '../shapes/shapes-bankish'
import type { BankScope } from '../shapes/shapes-stamps'
import { type BankRecord, type BoxRecord, type GateRecord, ThingFormat } from '../shapes/shapes-thing'
import { Labelpath } from '../shapes/primitives'

// == [The shelf]: guardRootShelf, peekRoots, stowRoots, isRootLabelpath

/** `shelf`, each method wrapped so that what it throws is told to `onBadNews` as a refusal, and a get that throws answers null. */
export function guardRootShelf(shelf: RootShelf, onBadNews: (news: Errors.VaultError) => void): RootShelf {
  const opts = { ifError: 'tell', transformer: Outcome.storageRefusalOf, onBadNews } as const
  const getItem = bulletproofHandlerOf((ckey: string) => shelf.getItem(ckey), opts)
  return Object.freeze({
    getItem:    (ckey: string) => getItem(ckey) ?? null,
    setItem:    bulletproofHandlerOf((ckey: string, val: string) => { shelf.setItem(ckey, val) }, opts),
    removeItem: bulletproofHandlerOf((ckey: string) => { shelf.removeItem(ckey) }, opts),
  })
}

/** The roots `shelf` keeps of the bank at `scope`, unchecked, or none. A value that does not read as today's is removed. */
export function peekRoots(shelf: RootShelf, scope: BankScope): readonly unknown[] {
  const shelved = shelf.getItem(shelfCkeyOf(scope))
  if (shelved === null) { return [] }
  const roots = rootsOfShelved(shelved)
  if (roots === null) { shelf.removeItem(shelfCkeyOf(scope)) }
  return roots ?? []
}

/** Put `world`'s three roots on `shelf`, as the bank at `scope`'s, where each is live, or remove what it keeps of the bank otherwise. */
export function stowRoots(shelf: RootShelf, scope: BankScope, world: World): void {
  const { bank, gate, rootBox } = world
  if ((bank === null) || (gate === null) || (rootBox === null) || (! world.areRootsLive)) {
    shelf.removeItem(shelfCkeyOf(scope))
    return
  }
  shelf.setItem(shelfCkeyOf(scope), shelvedOf([bank.pickle(), gate.pickle(), rootBox.pickle()]))
}

/** True for the labelpath of one of a bank's three roots. */
export function isRootLabelpath(labelpath: Labelpath): boolean { return RootLabelpaths.includes(labelpath) }
// --

// == [The value]: ShelvedRoots, ShelvedVersion, shelvedOf, rootsOfShelved, shelfCkeyOf, RootLabelpaths

/** The bank's three records, as the vaultDB stores them: the bank, its main gate and its root box. */
type ShelvedRoots = readonly [bank: Adoptable<BankRecord>, gate: Adoptable<GateRecord>, rootBox: Adoptable<BoxRecord>]

/** The version a shelved value begins with: a value of any other reads as nothing kept. */
const ShelvedVersion = `roots-${ThingFormat}`

/** The text `roots` are shelved as: the version, then the three records whole. */
function shelvedOf(roots: ShelvedRoots): string { return JSON.stringify([ShelvedVersion, ...roots]) }

/** The three records in `shelved`, unchecked, or null where it is no value of today's version. */
function rootsOfShelved(shelved: string): readonly unknown[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(shelved)
  } catch {
    return null
  }
  if ((! Array.isArray(parsed)) || (parsed.length !== 4) || (parsed[0] !== ShelvedVersion)) { return null }
  const roots: readonly unknown[] = parsed.slice(1)
  return roots
}

// The banklabel is a label, with no colon, so the userid after it is all the rest.
/** The shelf's key for the roots of the bank at `scope`. */
function shelfCkeyOf({ userid, banklabel }: BankScope): string { return `safebyok:roots:${banklabel}:${userid}` }

/** The labelpaths of a bank's roots, in the order they are shelved. */
const RootLabelpaths: readonly Labelpath[] = Object.freeze(['bank', Labelpath.MainGate, Labelpath.RootBox])
// --
