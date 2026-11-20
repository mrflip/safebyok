import { Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { ThingMinder } from '../minding/thing-minder'
import * as Phrases from '../phrases'
import type { SealedBoxAsk } from '../shapes/shapes-bankish'
import type { BoxCleartexts, LiveOf, LivePublicPropsOf, Sealable, TombstoneOf } from '../shapes/shapes-sealers'
import type { BoxLabelpath } from '../shapes/primitives'
import type { ScopeAt } from '../shapes/shapes-minder'
import type { BoxRecord } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'

/** One bank's boxes in this tab: the minder that caches them, and the verbs a host writes them with.
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

  // == [Writing boxes]: putBoxOnce, delBoxOnce

  /** Seal and write the box at `cited`'s labelpath, with `patch` applied and `secrets` encrypted, over `cited`. Resolves the box as stored.
   * Given a labelpath, it writes over the newest revision this vault's minder has of the box, getting it unless the box is cached whole or deleted.
   * One attempt: a revision other than `cited` stored there refuses `stale_write`, and the minder caches the stored one as the watch tells of it.
   * Over a tombstone or no box, `patch` must give the sidecar; so must it over a sparse `cited`.
   * @example
   *   const box = await vault.putBoxOnce('box/openai', { sidecar: { account: 'work' } }, { whisper })
   */
  async putBoxOnce(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<LiveOf<BoxRecord>> {
    const donorProps = (typeof cited === 'string') ? await this.#newestAt(cited) : cited
    return await this.#writeOnce(await this.#bank.sealBox(donorProps, patch, secrets)) as LiveOf<BoxRecord>
  }

  /** Write the tombstone of the box at `labelpath`, over the newest revision this vault's minder has of it. Resolves the tombstone as stored.
   * Its car is then `gone`, and its labelpath stays in its parent's listing.
   */
  async delBoxOnce(labelpath: BoxLabelpath): Promise<TombstoneOf<BoxRecord>> {
    return await this.#writeOnce(await this.#bank.tombstoneBox(await this.#newestAt(labelpath))) as TombstoneOf<BoxRecord>
  }
  // --

  // == [Helpers]: #scopeAt, #newestAt, #writeOnce

  /** The scope of the box at `labelpath`, in this vault's bank. */
  #scopeAt(labelpath: BoxLabelpath): ScopeAt<BoxLabelpath> {
    return { ...this.#bank.scope, labelpath: BoxChecks.labelpath.parse(labelpath) as BoxLabelpath }
  }

  /** The newest revision the minder has of the box at `labelpath`: cached whole or as a tombstone, or else got. */
  async #newestAt(labelpath: BoxLabelpath): Promise<Sealable<LiveOf<BoxRecord>>> {
    const scope  = this.#scopeAt(labelpath)
    const cached = this.#minder.at(scope)
    const car    = ((cached?.liveness === 'full') || (cached?.liveness === 'gone')) ? cached : await this.#minder.get(scope)
    return car.newest
  }

  /** Write `ask` through the minder, resolving the record stored and throwing its refusal. */
  async #writeOnce(ask: SealedBoxAsk): Promise<BoxRecord> {
    const answer = await this.#minder.tryWrite(ask)
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is a box's, which the vaultDB checks what it answers against.
    return answer.val as BoxRecord
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
