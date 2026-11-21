import { type Helpers, Outcome, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { ThingMinder } from '../minding/thing-minder'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'
import type { BoxUnsealed } from '../shapes/shapes-bankish'
import type { BoxCleartexts, LiveOf, LivePublicPropsOf, Sealable, TombstoneOf } from '../shapes/shapes-sealers'
import type { BoxLabelpath } from '../shapes/primitives'
import type { ScopeAt } from '../shapes/shapes-minder'
import type { BoxRecord } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'

/** One bank's boxes in this tab: a minder that caches them, and the verbs to write them and use their whispers.
 * Each write seals under the bank's lease, so it needs the bank unlocked. What it writes is cached before it resolves.
 */
export class Vault {
  // == [Props]: #bank, #minder

  readonly #bank:   Bank
  readonly #minder: ThingMinder
  // --

  // == [Getters]: bank, minder

  /** The bank whose boxes this vault carries. */
  get bank(): Bank { return this.#bank }

  /** The minder caching this bank's Things, made with this vault. */
  get minder(): ThingMinder { return this.#minder }
  // --

  // == [Construction]: make, constructor

  /** Make the vault of `bank`'s boxes, with a minder of its own that does nothing until its `hello`.
   * The bank's sweep sweeps the vault too. Refuses a swept bank.
   */
  static make(bank: Bank): Vault {
    const vault = new Vault(Checks.bank.parse(bank))
    bank.hostVault(vault)
    return vault
  }

  private constructor(bank: Bank) {
    this.#bank   = bank
    this.#minder = ThingMinder.make({ vaultDB: bank.vaultDB, queryCacheOpts: bank.queryCacheOpts }, bank)
    Object.freeze(this)
  }
  // --

  // == [Ending]: sweep

  /** Stop this vault's minder and empty its cache ({@link ThingMinder.goodbye}). Never throws. */
  sweep(): this {
    // The watch's stop is the host's vaultDB code: what it throws is news, and the bank's sweep goes on.
    try { this.#minder.goodbye() } catch (err) { this.#bank.tellBadNews([err]) }
    return this
  }
  // --

  // == [Writing boxes]: tryPutBoxOnce, putBoxOnce, tryDelBoxOnce, delBoxOnce

  /** Seal and write the next revision of the box `cited`, applying `patch` and encrypting `secrets`. Resolves an `Outcome` of the stored box.
   * Given a labelpath, it writes over the newest revision the minder has of the box, fetching it when none is cached.
   * It tries once. Where another revision is stored, it refuses `stale_write`, and the minder caches that revision when the watch tells of it.
   * Over a sparse box, a tombstone or no box, `patch` must give the sidecar.
   * Misuse is a bad outcome too. Rejects, whether or not the write was made, when the answer carries a record of another bank.
   * @example
   *   const { ok, val: box, err } = await vault.tryPutBoxOnce('box/openai', { sidecar: { account: 'work' } }, { whisper })
   */
  async tryPutBoxOnce(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<Outcome.Outcome<LiveOf<BoxRecord>>> {
    const sealed = await Outcome.outcomeOf(async () => {
      const donorProps = (typeof cited === 'string') ? await this.#newestAt(cited) : cited
      return await this.#bank.sealBox(donorProps, patch, secrets)
    })
    if (! sealed.ok) { return sealed }
    // The ask's modelkind is a box's, which the vaultDB checks what it answers against.
    return await this.#minder.tryWrite(sealed.val) as Outcome.Outcome<LiveOf<BoxRecord>>
  }

  /** {@link tryPutBoxOnce}, throwing its refusal instead of answering it: the stored box, on success.
   * @example
   *   const box = await vault.putBoxOnce('box/openai', { sidecar: { account: 'work' } }, { whisper })
   */
  async putBoxOnce(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<LiveOf<BoxRecord>> {
    return Outcome.valOf(await this.tryPutBoxOnce(cited, patch, secrets))
  }

  /** Delete the box at `labelpath`, resolving an `Outcome` of its stored tombstone.
   * It writes over the newest revision the minder has of the box, fetching it when none is cached. The box's car is then `gone`,
   * and its labelpath stays in its parent's listing.
   * Misuse is a bad outcome too. Rejects, whether or not the write was made, when the answer carries a record of another bank.
   */
  async tryDelBoxOnce(labelpath: BoxLabelpath): Promise<Outcome.Outcome<TombstoneOf<BoxRecord>>> {
    const sealed = await Outcome.outcomeOf(async () => await this.#bank.tombstoneBox(await this.#newestAt(labelpath)))
    if (! sealed.ok) { return sealed }
    // The ask's modelkind is a box's, which the vaultDB checks what it answers against.
    return await this.#minder.tryWrite(sealed.val) as Outcome.Outcome<TombstoneOf<BoxRecord>>
  }

  /** {@link tryDelBoxOnce}, throwing its refusal instead of answering it: the stored tombstone, on success. */
  async delBoxOnce(labelpath: BoxLabelpath): Promise<TombstoneOf<BoxRecord>> {
    return Outcome.valOf(await this.tryDelBoxOnce(labelpath))
  }
  // --

  // == [Using whispers]: withWhisper

  /** Call `fn` with the box at `labelpath` unsealed, and resolve what `fn` resolves.
   * On a locked bank, it first waits for an `unlock` gating ({@link Bank.ensureUnlocked}), and rejects if that wait is dismissed or the bank ends.
   * `fn` gets the whole box {@link ThingMinder.get} answers: its whisper, its sidecar and its record's fields. A box never stored, or deleted, refuses `absent_box`.
   * Nothing of the unsealed box is retained, and what `fn` throws is rethrown unchanged. Use the whisper only inside `fn`, and return only what is safe to retain.
   * @example
   *   const reply = await vault.withWhisper('box/openai', ({ whisper }) => askModel(whisper['apiKey'], question))
   */
  async withWhisper<ResultT>(labelpath: BoxLabelpath, fn: (box: BoxUnsealed) => Helpers.Awaitable<ResultT>): Promise<ResultT> {
    const scope = this.#scopeAt(labelpath)
    Checks.fn.parse(fn)
    // Asked before the unlock, so the vaultDB answers while the user types, and the get below finds the car timely or shares the fetch.
    this.#minder.backgroundRefresh(scope)
    await this.#bank.ensureUnlocked()
    const car = await this.#minder.get(scope)
    if ((car.liveness === 'gone') || (car.liveness === 'void')) { throw Throwers.boxAbsent({ boxlabel: scope.labelpath }) }
    // A get leaves the car full, unless a sparse record landed while it waited: the unseal then refuses the sparse one.
    return await fn(await this.#bank.unsealBox(car.newest as BoxRecord))
  }
  // --

  // == [Helpers]: #scopeAt, #newestAt

  /** The scope of the box at `labelpath`, in this vault's bank. */
  #scopeAt(labelpath: BoxLabelpath): ScopeAt<BoxLabelpath> {
    return { ...this.#bank.scope, labelpath: BoxChecks.labelpath.parse(labelpath) as BoxLabelpath }
  }

  /** The newest revision the minder has of the box at `labelpath`: the cached one, or else fetched. */
  async #newestAt(labelpath: BoxLabelpath): Promise<Sealable<LiveOf<BoxRecord>>> {
    const scope = this.#scopeAt(labelpath)
    const car   = this.#minder.at(scope) ?? await this.#minder.get(scope)
    return car.newest
  }
  // --
}

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Vault.make}'s argument, and of {@link Vault.withWhisper}'s `fn`. */
const Checks = Validator.Checkers('bad_record', ({ custom, fn }) => ({
  bank: custom<Bank>((val) => val instanceof Bank, Phrases.VaultBankExpected),
  fn:   fn<(box: BoxUnsealed) => unknown>(),
}))
// --
