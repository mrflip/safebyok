/** The `SortedVaultDB` class: a vaultDB over another. */

import { type Errors, Validator } from 'safebyok-big/internals'
import type { BirthBankAsk, GetAsk, ListAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import { ThingChecks } from '../shapes/shapes-thing'
import type { VaultEvent } from '../shapes/shapes-vault-event'
import type { BirthBankAnswer, GetThingAnswer, ListThingsAnswer, VaultDB, WriteThingAnswer } from './vault-db'

// == [SortedVaultDB]: SortedVaultDBOpts, SortedVaultDB

/** The options a {@link SortedVaultDB} is made with. */
export interface SortedVaultDBOpts {
  /** The vaultDB it asks. */
  vaultDB: VaultDB
}

// Each verb hands what it is given to the vaultDB it wraps, which checks it, and answers a refusal rather than throwing.
/** A vaultDB that asks another: each verb answers as that vaultDB answers, and its watch tells what that vaultDB's watch tells. */
export class SortedVaultDB implements VaultDB {
  // == [Props]: #vaultDB

  /** The vaultDB it asks. */
  readonly #vaultDB: VaultDB
  // --

  // == [Construction]: make, constructor

  /** A vaultDB over `opts.vaultDB`. It asks nothing and watches nothing until it is called. */
  static make(opts: SortedVaultDBOpts): SortedVaultDB { return new SortedVaultDB(opts) }

  private constructor(opts: SortedVaultDBOpts) {
    const { vaultDB } = Checks.sortedVaultDBOpts.parse(opts)
    this.#vaultDB = vaultDB
    Object.freeze(this)
  }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, watch

  /** The Thing at `ask`'s scope, as the wrapped vaultDB answers ({@link VaultDB.tryGetThing}). */
  async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> { return await this.#vaultDB.tryGetThing(ask) }

  /** Write `ask.record` over the Thing `ask.cited`, as the wrapped vaultDB answers ({@link VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> { return await this.#vaultDB.tryWriteThing(ask) }

  /** The children of the Thing at `ask`'s scope, as the wrapped vaultDB answers ({@link VaultDB.tryListThings}). */
  async tryListThings(ask: ListAsk): Promise<ListThingsAnswer> { return await this.#vaultDB.tryListThings(ask) }

  /** Write a new bank's three roots, or answer the roots already stored, as the wrapped vaultDB answers ({@link VaultDB.tryBirthBank}). */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> { return await this.#vaultDB.tryBirthBank(ask) }

  /** Watch a bank's Things through the wrapped vaultDB's watch, returning the function that stops it ({@link VaultDB.watch}). */
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
