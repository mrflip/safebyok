import { Outcome, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { ThingMinder } from '../minding/thing-minder'
import * as Phrases from '../phrases'
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

  /** {@link tryPutBoxOnce}, throwing its refusal instead of answering it: the box as stored, on success.
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

  /** {@link tryDelBoxOnce}, throwing its refusal instead of answering it: the tombstone as stored, on success. */
  async delBoxOnce(labelpath: BoxLabelpath): Promise<TombstoneOf<BoxRecord>> {
    return Outcome.valOf(await this.tryDelBoxOnce(labelpath))
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
/** The checks of {@link Vault.make}'s argument. */
const Checks = Validator.Checkers('bad_record', ({ custom }) => ({
  bank: custom<Bank>((val) => val instanceof Bank, Phrases.VaultBankExpected),
}))
// --
