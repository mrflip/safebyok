/** The shapes of a ThingMinder's arguments and options, and their checks. */

import type * as TSQ from '@tanstack/query-core'
import type * as Z from 'zod'
import { exactOptional } from 'zod'
import { Consts, type Errors, Validator } from 'safebyok-big/internals'
import type { Bank } from '../models/bank'
import * as Phrases from '../phrases'
import { thingScope, thingkindVals } from '../storage/shapes-thing'
import { type VaultDB, isVaultDB } from '../storage/vault-db'

// == [Query cache options]: QueryCacheOpts, DefaultQueryCacheOpts, MaxGcTime

/** The TanStack Query options a minder sets as the defaults of its cache entries. */
export interface QueryCacheOpts {
  /** How long a record stays timely, in milliseconds. */
  staleTime:   number
  /** How long an entry no one listens to stays in the cache, in milliseconds. `Infinity` keeps it until `goodbye`. */
  gcTime:      number
  /** TanStack's `networkMode`. `'always'` runs a get even when offline, where it fails. TanStack's own default, `'online'`, waits for the network. */
  networkMode: 'online' | 'always' | 'offlineFirst'
  /** How many times TanStack Query retries a failed get. */
  retry:       number
}

/** The default {@link QueryCacheOpts}: records stay timely an hour, entries stay until `goodbye`, gets run even offline, and none is retried. */
export const DefaultQueryCacheOpts: Readonly<QueryCacheOpts> = Object.freeze({ staleTime: 60 * 60 * 1000, gcTime: Infinity, networkMode: 'always', retry: 0 })

// A timer longer than this fires at once, in every JavaScript runtime, and TanStack Query passes gcTime to one as it is.
/** The longest finite gcTime: 2^31 - 1 milliseconds, about 24.8 days. */
const MaxGcTime = (2 ** 31) - 1
// --

// == [Checks]: queryCacheOpts, thingPins, minderMakeArgs, minderAskOpts, minderGetAskOpts

/** The checks of a {@link QueryCacheOpts}, of what a minder is pinned to, of `ThingMinder.make`'s arguments, and of a read's options. */
export const { queryCacheOpts, thingPins, minderMakeArgs, minderAskOpts, minderGetAskOpts } = Validator.Checkers('bad_option', ({ obj, oneof, custom, fn, uint, lit, union, orDefault }) => {
  const gcTime          = union([uint.max(MaxGcTime, Phrases.GcTimeShape), lit(Infinity)])
  const queryCacheOpts  = obj({
    staleTime:   orDefault(uint, DefaultQueryCacheOpts.staleTime),
    gcTime:      orDefault(gcTime, DefaultQueryCacheOpts.gcTime),
    networkMode: orDefault(oneof(['online', 'always', 'offlineFirst']), DefaultQueryCacheOpts.networkMode),
    retry:       orDefault(uint, DefaultQueryCacheOpts.retry),
  }).strict()
  const thingPins       = thingScope.pick({ userid: true, banklabel: true }).extend({ modelkind: oneof(thingkindVals) })
  // A live object passes whole where these hold of it, since parsing it would hand back a copy, its methods unbound.
  const tsqVerbs        = obj({ query: fn(), setQueryData: fn(), setQueryDefaults: fn(), getQueryCache: fn(), removeQueries: fn() })
  const minderMakeArgs  = obj({
    pins: obj({ modelkind: oneof(thingkindVals) }),
    opts: obj({
      bank:    custom<MinderBank>((val) => Consts.hasModelkind(val, 'bank'), Phrases.BankExpected),
      vaultDB:   custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected),
      tsq:       custom<TSQ.QueryClient>((val) => tsqVerbs.safeParse(val).success, Phrases.QueryClientExpected),
      onBadNews: fn<(news: Errors.VaultError) => void>(),
    }),
  })
  // Each option may be left out, and never given as undefined.
  const minderGetAskOpts = obj({ staleTime: exactOptional(uint) }).strict()
  const minderAskOpts    = minderGetAskOpts.extend({ ifStale: exactOptional(oneof(['get', 'refresh'])) }).strict()
  return { queryCacheOpts, thingPins, minderMakeArgs, minderAskOpts, minderGetAskOpts }
})

/** A get's options: `staleTime` overrides the minder's own. */
export type MinderGetAskOpts = Z.input<typeof minderGetAskOpts>
/** `tryAt`'s options:
 * - `staleTime`          -- overrides the minder's own
 * - `ifStale: 'get'`     -- read the cache alone (default)
 * - `ifStale: 'refresh'` -- also fetch a stale or vacant record in the background
 */
export type MinderAskOpts    = Z.input<typeof minderAskOpts>
/** The part of {@link Bank} a minder uses: its scope, its `queryCacheOpts`, and whether it is enabled. */
export type MinderBank       = Pick<Bank, 'modelkind' | 'userid' | 'banklabel' | 'queryCacheOpts' | 'isEnabled' | 'demandEnabled'>
/** The user, bank and modelkind a minder is pinned to. */
export type ThingPins        = Readonly<Z.infer<typeof thingPins>>
// --
