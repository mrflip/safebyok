/** The giver's types and checks: what it asks of a Device and of a started bank object, and the events it reads. */

import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import {
  type Banklabel, type BirthCleartexts, type DeviceSnapshot, type Gating, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts, type PassphraseReplaceCleartexts, type PassphraseVerdict,
  type UnlockCleartexts, type Userid, Checkers,
} from 'safebyok'

// == [Types]: RecordFields, GiverEvent, GiverBank, GiverDevice, BoxQueryOpts

/** The field every box record has, live, a tombstone or the shell, whatever else a host's record type carries. */
export type RecordFields = Readonly<{ am: string }>

/** The fields the giver reads of a minder's event about a box's item or its soon. A minder's `ThingEvent` or `SoonEvent` of a box has them all. */
export type GiverEvent = Readonly<{
  /** Whether the event is of the box's item or of its soon. */
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

/** The calls the giver makes of a started bank object: its boxes' records, its form verbs' gatings, and the dismissal of the awaited `unlock` gating. */
export interface GiverBank<RecordT> {
  /** The whole record, tombstone or shell of the box at `labelpath`: at once from an item the bank's minder has timely, else asked of the vaultDB. An unborn bank answers the shell without asking. */
  getBoxRecord(labelpath: string): Promise<RecordT>
  /** True when the bank's minder has heard of a revision of the box at `labelpath` newer than its item. False for a labelpath that is not a box's. */
  isBoxRecordBehind(labelpath: string): boolean
  /** Call `listener` with each event of the bank's minder about a box's item or soon. Returns the function that stops it. */
  listenBoxRecords(listener: (event: GiverEvent) => void): () => void
  /** The gating that births this bank, unborn until now, with the user's new passphrase and optional passkey, leaving it unlocked. */
  birthGating(cleartexts: BirthCleartexts): Gating
  /** The gating that unlocks this bank by its passphrase or its passkey. */
  unlockGating(cleartexts: UnlockCleartexts): Gating
  /** The gating that replaces the passphrase, proved by the current passphrase or the passkey, leaving the bank unlocked. */
  replacePassphraseGating(cleartexts: PassphraseReplaceCleartexts): Gating
  /** The gating that adds a passkey, proved by the passphrase, leaving the bank unlocked. */
  addPasskeyGating(cleartexts: PasskeyAddCleartexts): Gating
  /** The gating that revokes the passkey, proved by the passphrase or the passkey, leaving the bank unlocked. */
  revokePasskeyGating(cleartexts: PasskeyRevokeCleartexts): Gating
  /** Dismiss the awaited `unlock` gating: every call waiting for this bank to be unlocked rejects `dismissed`, and the bank stays locked. */
  dismissUnlock(): void
}

/** The members the giver needs of a Device: its scope, its snapshot and subscribe, its strength checker, and its bank object. */
export interface GiverDevice<RecordT> {
  readonly userid:      Userid
  readonly banklabel:   Banklabel
  /** Returns the same snapshot until something in it changes. Safe to pass unbound. */
  readonly getSnapshot: () => DeviceSnapshot
  /** Subscribes a listener to the snapshot, and returns its unsubscribe. Safe to pass unbound. */
  readonly subscribe:   (listener: () => void) => () => void
  /** The strength checker's verdict on a new passphrase. */
  judgeStrength(passphrase: string): Promise<PassphraseVerdict>
  /** The bank object, started once. */
  ensureBank(): Promise<GiverBank<RecordT>>
  /** Call `starter` with each bank object started now or later, and the function `starter` returns when that bank object ends. Returns the function that stops it. */
  onBankStart(starter: (bank: GiverBank<RecordT>) => () => void): () => void
}

/** React Query's options for a box's query, less the key and the fetch. Each one given replaces the giver's default. */
export type BoxQueryOpts<RecordT, SelT> = Omit<UseQueryOptions<RecordT, Error, SelT>, 'queryKey' | 'queryFn'>
// --

// == [Checks]: Checks, ScopeChecks

/** The checks of what a host hands the giver. */
export const Checks = Checkers('bad_record', ({ obj, fn, str, user_id, label }) => ({
  device:    obj({
    userid:        user_id,
    banklabel:     label,
    getSnapshot:   fn(),
    subscribe:     fn(),
    judgeStrength: fn(),
    ensureBank:    fn(),
    onBankStart:   fn(),
  }),
  labelpath: str.min(1),
}))

/** The check that a banklabel names the Device's bank. */
export const ScopeChecks = Checkers('bad_scope', ({ obj, label }) => ({
  bankScoped: obj({ banklabel: label }),
}))
// --
