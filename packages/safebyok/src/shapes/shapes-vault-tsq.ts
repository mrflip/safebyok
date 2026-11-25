/** The shapes of a VaultTSQ's options and of the query and mutation options it gives a host, with their checks. */

import type * as TSQ from '@tanstack/query-core'
import type * as Z from 'zod'
import { type Errors, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import type { SortedVaultDB } from '../storage/sorted-vault-db'
import { isSortedVaultDB } from './shapes-sorted-vault-db'
import { Labelpath } from './primitives'
import type { BankScope } from './shapes-stamps'
import { type ThingRecord, ThingChecks } from './shapes-thing'

// == [Timers]: MaxTimerHours, MaxTimerMillis

// TanStack Query passes a finite staleTime to a timer unchanged, and a timer longer than 2^31 - 1 milliseconds
// fires at once, in every JavaScript runtime. The bound is a whole number of hours, below that limit.
/** The longest finite staleTime, in hours: 24.5 days. Give `Infinity` for a longer one. */
export const MaxTimerHours = 588

/** The longest finite staleTime, in milliseconds: 24.5 days. Give `Infinity` for a longer one. */
export const MaxTimerMillis = MaxTimerHours * 60 * 60 * 1000
// --

// == [Options]: VaultTSQOpts, ItemQueryOptions, VaultMutationOptions, TsqStaleTime, GetOnceOpts

/** Options for `VaultTSQ.make`. */
export type VaultTSQOpts = Readonly<{
  /** The SortedVaultDB of the bank, whose Things the items are read from. */
  vaultMinder: SortedVaultDB
  /** The client the items and listings are kept in: a host's own, or one made for the bank. */
  queryClient: TSQ.QueryClient
  /** The bank. */
  scope:       BankScope
  /** Hears each refusal no caller waits on: a record the SortedVaultDB refuses, or what the vault TSQ fails to keep. Default: none hears it. */
  onBadNews?:  ((news: Errors.VaultError) => void) | undefined
}>

/** The query key and seed of a box's item, for a host's query of it (`VaultTSQ.itemQueryOptions`). */
export type ItemQueryOptions = Readonly<{
  queryKey:              TSQ.QueryKey
  /** The box's record, or null where none is stored live. Left out where no whole record of its newest life is known. */
  initialData?:          ThingRecord | null
  /** When the newest revision of the box was last read, in epoch milliseconds. Left out with `initialData`. */
  initialDataUpdatedAt?: number
}>

/** The options of a host's mutation (`VaultTSQ.mutationOptionsOf`). */
export type VaultMutationOptions<TData, TVariables> = Readonly<{
  mutationFn:  TSQ.MutationFunction<TData, TVariables>
  networkMode: 'always'
  retry:       false
}>

/** How long an item counts as fresh: milliseconds up to {@link MaxTimerMillis}, or `Infinity` for one that never ages. */
export type TsqStaleTime = Z.input<typeof VaultTSQChecks.tsqStaleTime>

/** The options of `VaultTSQ.getOnce` and `Vault.forceTimelyUnlocked`: `staleTime` ({@link TsqStaleTime}) in place of the item's own, unless it is undefined. */
export type GetOnceOpts = Z.input<typeof VaultTSQChecks.getOnceOpts>
// --

// == [Checks]: VaultTSQChecks, isQueryClient

/** The checks of `VaultTSQ.make`'s arguments, of the scope of a listing it keeps, of a mutationFn, and of a get's options. */
export const VaultTSQChecks = Validator.Checkers('bad_record', ({ obj, custom, fn, uint, lit, union }) => {
  const tsqStaleTime = union([uint.max(MaxTimerMillis, Phrases.StaleTimeShape), lit(Infinity)])
  return {
    makeArgs:     obj({
      vaultMinder: custom<SortedVaultDB>(isSortedVaultDB, Phrases.SortedVaultDBExpected),
      queryClient: custom<TSQ.QueryClient>(isQueryClient, Phrases.QueryClientExpected),
      scope:       ThingChecks.bankScope,
      onBadNews:   fn<(news: Errors.VaultError) => void>().optional(),
    }),
    /** A scope whose children a VaultTSQ lists: a box's. */
    listScope:    ThingChecks.thingScope.refine(({ labelpath }) => Labelpath.isBox(labelpath), Phrases.ListOfBoxes),
    mutationFn:   fn<TSQ.MutationFunction>(),
    tsqStaleTime,
    // Left out, or given as undefined, for no opinion.
    getOnceOpts:  obj({ staleTime: tsqStaleTime.optional() }).strict(),
  }
})

/** The members of a QueryClient a VaultTSQ calls. */
const QueryClientMembernames = ['setQueryDefaults', 'setMutationDefaults', 'setQueryData', 'query', 'invalidateQueries', 'resetQueries'] as const

/** True for an object with a function for each member of a QueryClient a VaultTSQ calls. */
export function isQueryClient(val: unknown): val is TSQ.QueryClient {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return QueryClientMembernames.every((membername) => typeof members[membername] === 'function')
}
// --
