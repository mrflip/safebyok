/** The signed-in bank's two roots between page loads, on the root shelf a host hands a device: `localStorage`, say. */

import { type Errors, Outcome } from 'safebyok-big/internals'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import type { Adoptable } from '../models/thing'
import type { RootShelf } from '../shapes/shapes-bankish'
import type { BankScope } from '../shapes/shapes-stamps'
import { type ThingRecord, ThingFormat } from '../shapes/shapes-thing'
import type { ReadTc } from '../shapes/shapes-vault-event'
import { VacantReadTc } from '../storage/agerank'
import type { Bank } from '../models/bank'
import type { VaultMinder } from './vault-minder'

// == [The shelf]: guardRootShelf, peekRoots, stowRoots

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

/** The roots `shelf` keeps of the bank at `scope`, each beside when it was read, unchecked, or none. A value that does not read as today's is removed. */
export function peekRoots(shelf: RootShelf, scope: BankScope): readonly unknown[] {
  const shelved = shelf.getItem(shelfCkeyOf(scope))
  if (shelved === null) { return [] }
  const roots = rootsOfShelved(shelved)
  if (roots === null) { shelf.removeItem(shelfCkeyOf(scope)) }
  return roots ?? []
}

/** Put `bank`'s two roots on `shelf` as those of the bank at `scope`, each beside when it was read, where each is live; otherwise remove what the shelf has of the bank. */
export function stowRoots(shelf: RootShelf, scope: BankScope, bank: Bank): void {
  const { vaultMinder } = bank
  if ((vaultMinder === null) || (! bank.areRootsLive)) {
    shelf.removeItem(shelfCkeyOf(scope))
    return
  }
  const roots: ShelvedRoots = [shelvedRootOf(bank.gate.pickle(), vaultMinder), shelvedRootOf(bank.rootBox, vaultMinder)]
  shelf.setItem(shelfCkeyOf(scope), shelvedOf(roots))
}
// --

// == [The value]: ShelvedRoot, ShelvedRoots, ShelvedVersion, shelvedRootOf, shelvedOf, rootsOfShelved, shelfCkeyOf

/** One root, as the vaultDB has it, beside when it was read. */
type ShelvedRoot = Readonly<{ record: Adoptable<ThingRecord>, read_tc: ReadTc }>

/** The bank's two roots: its gate and its root box. */
type ShelvedRoots = readonly [gate: ShelvedRoot, rootBox: ShelvedRoot]

/** The version a shelved value begins with: a value of any other reads as nothing kept. */
const ShelvedVersion = `roots-tc-${ThingFormat}`

/** The root `record`, beside when `vaultMinder` last read news of it */
function shelvedRootOf(record: Adoptable<ThingRecord>, vaultMinder: VaultMinder): ShelvedRoot {
  return { record, read_tc: vaultMinder.carAt(record)?.read_tc ?? VacantReadTc }
}

/** The text `roots` are shelved as: the version, then each root, its record whole beside its `read_tc`. */
function shelvedOf(roots: ShelvedRoots): string { return JSON.stringify([ShelvedVersion, ...roots]) }

/** The two roots in `shelved`, unchecked, or null where it is no value of version {@link ShelvedVersion}. */
function rootsOfShelved(shelved: string): readonly unknown[] | null {
  let versionAndRoots: unknown
  try {
    versionAndRoots = JSON.parse(shelved)
  } catch {
    return null
  }
  if ((! Array.isArray(versionAndRoots)) || (versionAndRoots.length !== 3) || (versionAndRoots[0] !== ShelvedVersion)) { return null }
  const roots: readonly unknown[] = versionAndRoots.slice(1)
  return roots
}

// The banklabel is a label, with no colon, so the userid after it is all the rest.
/** The shelf's key for the roots of the bank at `scope`. */
function shelfCkeyOf({ userid, banklabel }: BankScope): string { return `safebyok:roots:${banklabel}:${userid}` }
// --
