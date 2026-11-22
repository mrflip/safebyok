/** The giver's types and checks: what a host hands it, and how it wraps a host's callback. */

import type { UseQueryOptions } from '@tanstack/react-query'
import { type BankSnapshot, type Banklabel, type BulletproofFailOpts, type DeviceOpts, type VaultDB, Checkers, PendingBank, isVaultDB } from 'safebyok'
import { sanitizeForeignError } from 'safebyok/storage'
import * as Phrases from './phrases-giver'

// == [Types]: GiverBanks, GiverConfig, SignedOutBank, BoxQueryOpts

/** The one bank a giver serves, keyed by its banklabel: `{ knock: { vaultDB } }`. */
export type GiverBanks<BanklabelT extends string = string> = Readonly<Record<BanklabelT, Readonly<{ vaultDB: VaultDB }>>>

/** A giver's config: its one bank and where that is stored, and the options of each device it makes. */
export type GiverConfig<BanklabelT extends string = string> = Readonly<{ banks: GiverBanks<BanklabelT> }> & Readonly<Omit<DeviceOpts, 'vaultDB' | 'deviceDB' | 'queryClient'>>

/** The bank snapshot a giver's hooks show while nobody is signed in. */
export const SignedOutBank: BankSnapshot = Object.freeze({ ...PendingBank, stage: 'signed_out' })

// The rest would configure the minder's own query while a hook observes it: its key, fetch, staleness, cache time, retries,
// structural sharing, initial data or persister.
/** React Query's options for a record hook's query that shape what that one hook shows. The giver sets every other. */
export type BoxQueryOpts<RecordT, SelT> = Pick<UseQueryOptions<RecordT, Error, SelT>, 'select' | 'placeholderData' | 'notifyOnChangeProps'>
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
