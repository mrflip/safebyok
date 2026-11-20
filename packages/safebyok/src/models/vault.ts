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

/** One bank's boxes in this tab: the minder that caches them, and the verbs a host writes them and uses their whispers with.
 * Each write seals under the bank's lease, so it needs the bank unlocked, and lands in the minder's cache before it resolves.
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

  /** Make the vault of `bank`'s boxes, with a minder of its own. The minder does nothing until its `hello`. */
  static make(bank: Bank): Vault {
    return new Vault(Checks.bank.parse(bank))
  }

  private constructor(bank: Bank) {
    this.#bank   = bank
    this.#minder = ThingMinder.make({ vaultDB: bank.vaultDB, queryCacheOpts: bank.queryCacheOpts }, bank)
    Object.freeze(this)
  }
  // --

  // == [Writing boxes]: tryPutBoxOnce, putBoxOnce, tryDelBoxOnce, delBoxOnce

  /** Seal and write the box at `cited`'s labelpath, with `patch` applied and `secrets` encrypted, over `cited`. Answers the box as stored.
   * Given a labelpath, it writes over the newest revision this vault's minder has of the box, getting it when nothing is cached.
   * One attempt: a revision other than `cited` stored there refuses `stale_write`, and the minder caches the stored one as the watch tells of it.
   * Over a tombstone or no box, `patch` must give the sidecar; so must it over a sparse box, whether `cited` or the newest the minder caches.
   * A refusal, misuse included, is its bad outcome. Rejects, whether or not the write was made, when the answer carries a record of another bank.
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

  /** {@link tryPutBoxOnce}, throwing its refusal instead of answering it: the box as stored, on success.
   * @example
   *   const box = await vault.putBoxOnce('box/openai', { sidecar: { account: 'work' } }, { whisper })
   */
  async putBoxOnce(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<LiveOf<BoxRecord>> {
    return Outcome.valOf(await this.tryPutBoxOnce(cited, patch, secrets))
  }

  /** Write the tombstone of the box at `labelpath`, over the newest revision this vault's minder has of it. Answers the tombstone as stored.
   * Its car is then `gone`, and its labelpath stays in its parent's listing. A refusal, misuse included, is its bad outcome.
   * Rejects, whether or not the write was made, when the answer carries a record of another bank.
   */
  async tryDelBoxOnce(labelpath: BoxLabelpath): Promise<Outcome.Outcome<TombstoneOf<BoxRecord>>> {
    const sealed = await Outcome.outcomeOf(async () => await this.#bank.tombstoneBox(await this.#newestAt(labelpath)))
    if (! sealed.ok) { return sealed }
    // The ask's modelkind is a box's, which the vaultDB checks what it answers against.
    return await this.#minder.tryWrite(sealed.val) as Outcome.Outcome<TombstoneOf<BoxRecord>>
  }

  /** {@link tryDelBoxOnce}, throwing its refusal instead of answering it: the tombstone as stored, on success. */
  async delBoxOnce(labelpath: BoxLabelpath): Promise<TombstoneOf<BoxRecord>> {
    return Outcome.valOf(await this.tryDelBoxOnce(labelpath))
  }
  // --

  // == [Using whispers]: withWhisper

  /** Call `fn` with the box at `labelpath` unsealed, once the bank is unlocked, and resolve what `fn` resolves.
   * On a locked bank it first waits for the bank to be unlocked, asking the user where need be, as {@link Bank.ensureUnlocked} does, and rejects as that does.
   * `fn` gets the box's newest revision, whole, as the minder gets it: its whisper, its sidecar and its record's fields. A box never stored, or deleted, refuses `absent_box`.
   * It keeps nothing of the unsealed box, and rethrows what `fn` throws as it came: keep the whisper inside `fn`, and return only what is safe to hold.
   * @example
   *   const reply = await vault.withWhisper('box/openai', ({ whisper }) => askModel(whisper['apiKey'], question))
   */
  async withWhisper<ResultT>(labelpath: BoxLabelpath, fn: (box: BoxUnsealed) => Helpers.Awaitable<ResultT>): Promise<ResultT> {
    const scope = this.#scopeAt(labelpath)
    Checks.fn.parse(fn)
    // Asked before the unlock, so the vaultDB answers while the user types, and the get below finds the car timely or shares the fetch.
    this.#minder.refresh(scope, { silenceErrors: true })
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

  /** The newest revision the minder has of the box at `labelpath`: cached, or else got. */
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
