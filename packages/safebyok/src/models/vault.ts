import { type Helpers, Outcome, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { BaseBox } from './base-box'
import { Thing } from './thing'
import { VaultMinder } from '../minding/vault-minder'
import * as Phrases from '../phrases'
import * as Throwers from '../refusals/throwers'
import type { BoxUnsealed } from '../shapes/shapes-bankish'
import type { BoxWriteAsk } from '../shapes/shapes-asks'
import type { BoxCleartexts, BoxPublicProps, LiveOf, LivePublicPropsOf, Sealable, TombstoneOf } from '../shapes/shapes-sealers'
import { type BoxLabelpath, Labelpath } from '../shapes/primitives'
import { type MinderGetOpts, type ScopeAt, MinderChecks } from '../shapes/shapes-minder'
import { type BoxRecord, Shell } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'

/** One bank's boxes in this tab: a minder that caches them, and the verbs to write them and use their whispers.
 * Each write seals under the bank's lease, so it needs the bank unlocked. What it writes is cached before it resolves.
 */
export class Vault {
  // == [Props]: #bank, #minder

  readonly #bank:   Bank
  readonly #minder: VaultMinder
  // --

  // == [Getters]: bank, minder

  /** The bank whose boxes this vault carries. */
  get bank(): Bank { return this.#bank }

  /** The minder caching this bank's Things, which the vault reads and writes through. */
  get minder(): VaultMinder { return this.#minder }
  // --

  // == [Construction]: make, constructor

  /** Make the vault of `bank`'s boxes, reading and writing them through `minder`, a minder of the same bank.
   * Its gets refuse until the minder's `hello`. The bank's sweep sweeps the vault too, and so the minder. Refuses a swept bank.
   */
  static make(bank: Bank, minder: VaultMinder): Vault {
    const vault = new Vault(bank, minder)
    bank.hostVault(vault)
    return vault
  }

  private constructor(bank: Bank, minder: VaultMinder) {
    this.#bank   = bank
    this.#minder = minder
    Object.freeze(this)
  }
  // --

  // == [Ending]: sweep

  /** Stop this vault's minder and empty its cache ({@link VaultMinder.goodbye}). Never throws. */
  sweep(): this {
    // The watch's stop is the host's vaultDB code: what it throws is news, and the bank's sweep goes on.
    try { this.#minder.goodbye() } catch (err) { this.#bank.tellBadNews([err]) }
    return this
  }
  // --

  // == [Writing boxes]: tryPutBoxOnce, putBoxOnce, tryDelBoxOnce, delBoxOnce

  /** Seal and write the next revision of the box `cited`, applying `patch` and encrypting `secrets`. Resolves an `Outcome` of the stored box.
   * Given a labelpath, it writes over the soonest record the minder has of the box (its soon, else its item, else its tombstone or shell where the item is null), fetching it when none is cached.
   * It tries once. Where another revision is stored, it refuses `stale_write`, and the minder caches that revision when the watch tells of it.
   * Over a sparse box, a tombstone or no box, `patch` must give the sidecar.
   * Misuse is a bad outcome too. Rejects, whether or not the write was made, when the answer carries a record of another bank.
   * @example
   *   const { ok, val: box, err } = await vault.tryPutBoxOnce('box/openai', { sidecar: { account: 'work' } }, { whisper })
   */
  async tryPutBoxOnce(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<Outcome.Outcome<LiveOf<BoxRecord>>> {
    const sealed = await Outcome.outcomeOf(async () => {
      const donorProps = (typeof cited === 'string') ? await this.#soonestAt(cited) : cited
      return await this.#sealedAsk(donorProps, patch, secrets)
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
   * It writes over the soonest record the minder has of the box (its soon, else its item), fetching it when none is cached. The box's item is then null, and its dead entry has the tombstone.
   * Misuse is a bad outcome too. Rejects, whether or not the write was made, when the answer carries a record of another bank.
   */
  async tryDelBoxOnce(labelpath: BoxLabelpath): Promise<Outcome.Outcome<TombstoneOf<BoxRecord>>> {
    const sealed = await Outcome.outcomeOf(async () => await this.#sealedAsk(await this.#soonestAt(labelpath), { am: 'x' }))
    if (! sealed.ok) { return sealed }
    // The ask's modelkind is a box's, which the vaultDB checks what it answers against.
    return await this.#minder.tryWrite(sealed.val) as Outcome.Outcome<TombstoneOf<BoxRecord>>
  }

  /** {@link tryDelBoxOnce}, throwing its refusal instead of answering it: the stored tombstone, on success. */
  async delBoxOnce(labelpath: BoxLabelpath): Promise<TombstoneOf<BoxRecord>> {
    return Outcome.valOf(await this.tryDelBoxOnce(labelpath))
  }
  // --

  // == [Using whispers]: forceTimelyUnlocked, withWhisper, withUnlockedWhisper, #demandReadableThing

  /** Get the box at `labelpath` and wait for the bank to be unlocked, both at once; resolve once the box can be unsealed.
   * The get runs under `opts.staleTime` where given, else as the minder schedules it.
   * It rejects with the `unlock` gating's refusal where that wait is dismissed or the bank ends ({@link Bank.ensureUnlocked}),
   * else with the get's refusal unchanged, else as {@link withWhisper} would refuse the box: `stale_read` or `absent_box`.
   */
  async forceTimelyUnlocked(labelpath: BoxLabelpath, opts: MinderGetOpts = {}): Promise<void> {
    const scope = this.#scopeAt(labelpath)
    MinderChecks.minderGetOpts.parse(opts)
    // Both settle before either refusal is thrown, so which one rejects never depends on which came first.
    const [unlocked, got] = await Promise.allSettled([this.#bank.ensureUnlocked(), this.#minder.get(scope, opts)])
    if (unlocked.status === 'rejected') { throw unlocked.reason }
    if (got.status === 'rejected')      { throw got.reason }
    this.#demandReadableThing(scope)
  }

  /** Call `fn` with the box at `labelpath` unsealed, and resolve what `fn` resolves.
   * On a locked bank, it first waits for an `unlock` gating, and rejects if that wait is dismissed or the bank ends.
   * Then it gets and unseals the box as {@link withUnlockedWhisper} does, refusing as it refuses.
   * @example
   *   const reply = await vault.withWhisper('box/openai', ({ whisper }) => askModel(whisper['apiKey'], question))
   */
  async withWhisper<ResultT>(labelpath: BoxLabelpath, fn: (box: BoxUnsealed) => Helpers.Awaitable<ResultT>): Promise<ResultT> {
    // Checked before the wait, so a call that would refuse never asks the user to unlock.
    this.#scopeAt(labelpath)
    Checks.fn.parse(fn)
    await this.#bank.ensureUnlocked()
    return await this.withUnlockedWhisper(labelpath, fn)
  }

  /** Call `fn` with the box at `labelpath` unsealed, on an unlocked bank, and resolve what `fn` resolves.
   * It never waits for an `unlock` gating: on a locked bank it refuses `bank_locked`. Call it where the bank shows unlocked, or call {@link withWhisper}.
   * A refused get rejects with its own refusal where nothing at all is cached for the box, and otherwise rejects nothing by itself.
   * `fn` gets the whole box, in a revision stored at a moment during the call: its whisper, its sidecar and its record's fields.
   * That box may be behind a revision of the same life heard of since.
   * It refuses `stale_read` where the newest revision heard of is a sparse record of a newer life, or where only a sparse record
   * of the box is cached, and `absent_box` for a box deleted or never stored.
   * Nothing of the unsealed box is retained, and what `fn` throws is rethrown unchanged. Use the whisper only inside `fn`, and return only what is safe to retain.
   * @example
   *   if (vault.bank.isUnlocked) { reply = await vault.withUnlockedWhisper('box/openai', ({ whisper }) => askModel(whisper['apiKey'], question)) }
   */
  async withUnlockedWhisper<ResultT>(labelpath: BoxLabelpath, fn: (box: BoxUnsealed) => Helpers.Awaitable<ResultT>): Promise<ResultT> {
    const scope = this.#scopeAt(labelpath)
    Checks.fn.parse(fn)
    this.#bank.demandEnabled()
    if (this.#bank.isLocked) { throw Throwers.needUnlocked() }
    const got = await this.#minder.tryGet(scope)
    // A refused get is thrown only where nothing is cached for the box: otherwise the demand judges what this device holds at the last moment.
    if ((! got.ok) && (this.#minder.at(scope) === undefined) && (this.#minder.soonAt(scope) === undefined)) { throw got.err }
    return await fn(await this.#bank.unsealBox(this.#demandReadableThing(scope)))
  }

  // Read in one synchronous step, so the item and the soon are of one moment. A soon beside a null item is newer than
  // the item's tombstone or none, and so of a newer life.
  /** The box `scope`'s item, a live record of the newest life heard of, behind within that life or not.
   * Refuses `stale_read` for no item or a soon of a newer life, then `absent_box` for an item that is null.
   */
  #demandReadableThing(scope: ScopeAt<BoxLabelpath>): BoxRecord {
    const item = this.#minder.at(scope)
    const soon = this.#minder.soonAt(scope)
    if ((item === undefined) || ((soon !== undefined) && ((item === null) || isOfNewerLife(item, soon)))) { throw Throwers.boxSoonestBare(scope.labelpath) }
    if (item === null) { throw Throwers.boxAbsent({ boxlabel: scope.labelpath }) }
    return item
  }
  // --

  // == [Helpers]: #sealedAsk, #scopeAt, #soonestAt

  /** The put ask of `donorProps`'s next revision, or the del ask of its tombstone. */
  async #sealedAsk(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<BoxWriteAsk> {
    const record = await this.#bank.sealBox(donorProps, publicProps, secretProps)
    const cited  = Thing.sparseOf(donorProps)
    return BaseBox.isTombstone(record) ? this.#bank.makeDelAsk<BoxRecord>({ cited, record }) : this.#bank.makePutAsk<BoxRecord>({ cited, record })
  }

  /** The scope of the box at `labelpath`, in this vault's bank. Refuses the root box's labelpath. */
  #scopeAt(labelpath: BoxLabelpath): ScopeAt<BoxLabelpath> {
    return { ...this.#bank.scope, labelpath: Checks.boxLabelpath.parse(labelpath) as BoxLabelpath }
  }

  // The shell of a box is of the root box's life.
  /** The soonest record the minder has of the box at `labelpath`: its soon, else its item, else fetched; where the item is null, its tombstone, else its shell. */
  async #soonestAt(labelpath: BoxLabelpath): Promise<Sealable<LiveOf<BoxRecord>>> {
    const scope   = this.#scopeAt(labelpath)
    const heard   = this.#minder.soonAt(scope) ?? this.#minder.at(scope)
    const soonest = (heard === undefined) ? await this.#minder.get(scope) : heard
    if (soonest !== null) { return soonest }
    return this.#minder.deadAt(scope) ?? Shell.of(scope, this.#bank.rootBox)
  }
  // --
}

// == [Helpers]: isOfNewerLife

/** True when `soon` is of a newer life than `item`. */
function isOfNewerLife(item: Pick<BoxRecord, 'lifepath' | 'revseq'>, soon: Pick<BoxRecord, 'lifepath' | 'revseq'>): boolean {
  return (soon.lifepath !== item.lifepath) && (Thing.cmp(item, soon) > 0)
}
// --

// == [Checks]: Checks

/** The checks of a box's labelpath, never the root box's, and of the `fn` {@link Vault.withWhisper} and {@link Vault.withUnlockedWhisper} call. */
const Checks = Validator.Checkers('bad_record', ({ fn }) => ({
  // The root box is the bank's, minded by its BankMinder: a vault's minder minds only the boxes under it.
  boxLabelpath: BoxChecks.labelpath.refine((given) => given !== Labelpath.RootBox, Phrases.VaultBoxIsRoot),
  fn:           fn<(box: BoxUnsealed) => unknown>(),
}))
// --
