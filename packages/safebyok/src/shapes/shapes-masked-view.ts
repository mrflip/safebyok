/** The shapes of what a devtool is shown of a device: its cached rows, each ciphertext masked, and the lease. */

import type * as TSQ from '@tanstack/query-core'
import type { Errors } from 'safebyok-big/internals'
import type { EpochMillis } from './primitives'
import type { LeaseLoggable } from './shapes-stamps'

// == [What a devtool is shown]: MaskedRow, MaskedViewLease, MaskedView, EmptyMaskedView

/** One row of a masked view: what a bank TSQ or vault TSQ caches under one key, with each ciphertext masked. For experimenting: its fields may change without notice. */
export type MaskedRow = Readonly<{
  queryKey:        readonly unknown[]
  status:          TSQ.QueryStatus
  fetchStatus:     TSQ.FetchStatus
  /** When the record or listing under this key was last updated, or 0 for none. */
  dataUpdatedAt:   EpochMillis
  isInvalidated:   boolean
  /** The refusalkind of the last fetch under this key, or null where it did not refuse. */
  lastRefusalkind: Errors.Refusalkind | null
  /** A copy of the record, null or listing cached under this key, or undefined for none, with every `ciphertext_b64` masked: its last 2 characters and its length, as `…yz(64)`.
   * It is no longer a record: nothing unseals or unwraps it.
   */
  val:             unknown
}>

/** The lease a device's bank has, as a devtool is shown it: its loggable and when it ends, or only `active: false` while none is granted. For experimenting: its fields may change without notice. */
export type MaskedViewLease = Readonly<{ active: false }> | (LeaseLoggable & Readonly<{
  active:  true
  /** When it stops unlocking the bank. */
  ends_at: EpochMillis
}>)

/** A device's bank TSQ and vault TSQ, and the lease its bank has, masked for a devtool. For experimenting: its fields may change without notice. */
export type MaskedView = Readonly<{
  bankTSQ:  readonly MaskedRow[]
  vaultTSQ: readonly MaskedRow[]
  lease:    MaskedViewLease
}>

/** The masked view of a device nobody is signed in on: nothing in either TSQ, and no lease. */
export const EmptyMaskedView: MaskedView = Object.freeze({ bankTSQ: Object.freeze([]), vaultTSQ: Object.freeze([]), lease: Object.freeze({ active: false }) })
// --
