/** The giver's types and checks: the events it reads of a minder, and what a host hands it, and how it wraps a host's callback. */

import type { QueryClient, QueryKey, UseQueryOptions } from '@tanstack/react-query'
import { type BankSnapshot, type Banklabel, type BulletproofFailOpts, type DeviceOpts, type KeyDeriver, type Userid, type VaultDB, Checkers, PendingBank, isVaultDB } from 'safebyok'
import { sanitizeForeignError } from 'safebyok/storage'
import * as Phrases from './phrases-giver'

// == [Types]: GiverBanks, GiverConfig, GiverMount, SignedOutBank, GiverEvent, BoxQueryOpts

/** The one bank a giver serves, keyed by its banklabel: `{ knock: { vaultDB } }`. */
export type GiverBanks<BanklabelT extends string = string> = Readonly<Record<BanklabelT, Readonly<{ vaultDB: VaultDB }>>>

/** A giver's config: its one bank and where that is stored, and the options of each device it makes. */
export type GiverConfig<BanklabelT extends string = string> = Readonly<{ banks: GiverBanks<BanklabelT> }> & Readonly<Omit<DeviceOpts, 'vaultDB' | 'deviceDB'>>

/** What a provider hands the giver as it starts a device: the host's QueryClient, and a vaultDB and key deriver that replace the config's. */
export type GiverMount = Readonly<{
  client:      QueryClient
  vaultDB?:    VaultDB | undefined
  keyDeriver?: KeyDeriver | undefined
}>

/** The bank snapshot a giver's hooks show while nobody is signed in. */
export const SignedOutBank: BankSnapshot = Object.freeze({ ...PendingBank, stage: 'signed_out' })

/** The fields the giver reads of a minder's event about the item or soon of a box or the main gate. A minder's `ThingEvent` or `SoonEvent` of either has them all. */
export type GiverEvent = Readonly<{
  /** Whether the event is of the Thing's item or of its soon. */
  eventkind: 'item' | 'soon'
  type:      'added' | 'updated' | 'removed'
  /** What changed the item or soon, or undefined where it was added or removed: `'invalidate'` when the item fell behind a newer revision heard of. */
  action:    Readonly<{ type: string }> | undefined
  /** The key the minder caches the item or soon under. An item's is the host's key for it too. */
  queryKey:  QueryKey
  userid:    Userid
  banklabel: Banklabel
  labelpath: string
  /** `data` is the item's record, or the soon's sparse record. */
  state:     Readonly<{ data: unknown, dataUpdatedAt: number }>
}>

/** React Query's options for a box's query, less the key and the fetch. Each one given replaces the giver's default. */
export type BoxQueryOpts<RecordT, SelT> = Omit<UseQueryOptions<RecordT, Error, SelT>, 'queryKey' | 'queryFn'>
// --

// == [Checks]: ScopeChecks, ConfigChecks, isOneBank, HostCallbackOpts

/** The check that a banklabel names the giver's bank. */
export const ScopeChecks = Checkers('bad_scope', ({ obj, label, banklabel }) => ({
  bankScoped: obj({ banklabel: label }),
  banklabel,
}))

/** The check of a giver's config, which answers its one bank as `[[banklabel, { vaultDB }]]`. */
export const ConfigChecks = Checkers('bad_record', ({ obj, custom }) => ({
  giverConfig: obj({
    banks: custom<GiverBanks>(isOneBank, Phrases.OneBankExpected).transform((banks) => Object.entries(banks) as [[Banklabel, Readonly<{ vaultDB: VaultDB }>]]),
  }),
}))

/** True when `val` names exactly one bank by a valid banklabel, and its vaultDB. */
function isOneBank(val: unknown): boolean {
  if ((typeof val !== 'object') || (val === null)) { return false }
  const entries = Object.entries(val)
  if (entries.length !== 1) { return false }
  const [[banklabel, bank]] = entries as [[string, unknown]]
  return ScopeChecks.banklabel.safeParse(banklabel).success && (typeof bank === 'object') && (bank !== null) && isVaultDB((bank as { vaultDB?: unknown }).vaultDB)
}

/** How the giver wraps a callback a host hands it: what the callback throws is rethrown as an `Error`, the same object where it threw an `Error`. */
export const HostCallbackOpts: BulletproofFailOpts = Object.freeze({ ifError: 'fail', transformer: sanitizeForeignError })
// --
