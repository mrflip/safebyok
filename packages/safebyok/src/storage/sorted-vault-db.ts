/** `SortedVaultDB`, a vaultDB that wraps another. */

import { type Errors, Validator } from 'safebyok-big/internals'
import type { BirthBankAsk, GetAsk, ListAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import { ThingChecks } from '../shapes/shapes-thing'
import type { VaultEvent } from '../shapes/shapes-vault-event'
import type { BirthBankAnswer, GetThingAnswer, ListThingsAnswer, VaultDB, WriteThingAnswer } from './vault-db'

// == [SortedVaultDB]: SortedVaultDBOpts, SortedVaultDB

/** Options for {@link SortedVaultDB.make}. */
export interface SortedVaultDBOpts {
  /** The vaultDB to wrap. */
  vaultDB: VaultDB
}

// Each verb hands what it is given to the vaultDB it wraps, which checks it, and answers a refusal rather than throwing.
/** A vaultDB that passes each verb and each watch straight through to the vaultDB it wraps. */
export class SortedVaultDB implements VaultDB {
  // == [Props]: #vaultDB

  /** The wrapped vaultDB. */
  readonly #vaultDB: VaultDB
  // --

  // == [Construction]: make, constructor

  /** Wrap `opts.vaultDB`, asking and watching nothing yet. */
  static make(opts: SortedVaultDBOpts): SortedVaultDB { return new SortedVaultDB(opts) }

  private constructor(opts: SortedVaultDBOpts) {
    const { vaultDB } = Checks.sortedVaultDBOpts.parse(opts)
    this.#vaultDB = vaultDB
    Object.freeze(this)
  }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, watch

  /** {@link VaultDB.tryGetThing}, passed to the wrapped vaultDB. */
  async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> { return await this.#vaultDB.tryGetThing(ask) }

  /** {@link VaultDB.tryWriteThing}, passed to the wrapped vaultDB. */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> { return await this.#vaultDB.tryWriteThing(ask) }

  /** {@link VaultDB.tryListThings}, passed to the wrapped vaultDB. */
  async tryListThings(ask: ListAsk): Promise<ListThingsAnswer> { return await this.#vaultDB.tryListThings(ask) }

  /** {@link VaultDB.tryBirthBank}, passed to the wrapped vaultDB. */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> { return await this.#vaultDB.tryBirthBank(ask) }

  /** {@link VaultDB.watch}, passed to the wrapped vaultDB with the caller's own handlers. */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void): () => void { return this.#vaultDB.watch(scope, onNotice, onBadNews) }
  // --
}
// --

// == [Checks]: Checks

/** The check of {@link SortedVaultDB.make}'s options. */
const Checks = Validator.Checkers('bad_record', ({ obj }) => ({
  sortedVaultDBOpts: obj({ vaultDB: ThingChecks.vaultDBShape }),
}))
// --
