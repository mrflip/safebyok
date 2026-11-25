import { Errors, type Helpers, Outcome } from 'safebyok-big/internals'
import type { Bank } from './bank'
import { BaseBox } from './base-box'
import { Box } from './box'
import { Thing } from './thing'
import type { World } from './world'
import type { VaultTSQ } from '../minding/vault-tsq'
import * as Throwers from '../refusals/throwers'
import type { BoxUnsealed } from '../shapes/shapes-bankish'
import type { BoxCleartexts, BoxPublicProps, BoxTombstonePublicProps, LiveOf, LivePublicPropsOf, Sealable, TombstoneOf } from '../shapes/shapes-sealers'
import type { BoxLabelpath } from '../shapes/primitives'
import { type GetOnceOpts, VaultTSQChecks } from '../shapes/shapes-vault-tsq'
import type { PutOnceArgs } from '../shapes/shapes-vault-minder'
import type { BoxRecord, ScopeAt, ThingScope } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'
import { VaultChecks } from '../shapes/shapes-vault'
import type { VaultMinder } from '../minding/vault-minder'
import type { ThingCar } from '../minding/thing-car'

/** One bank's boxes in this tab: the verbs to seal and write them, and to use their whispers.
 * Each seal is made under the bank's lease, so it needs the bank unlocked. A write answers the record stored.
 */
export class Vault {
  // == [Props]: #world, #vaultTSQ

  /** The bank's world, which holds its Things and its lease. */
  readonly #world:    World
  readonly #vaultTSQ: VaultTSQ
  // --

  // == [Getters]: bank, #bank

  /** The bank whose boxes this vault carries. Refuses `absent_thing` while the bank, its main gate or its root box is not live. */
  get bank(): Bank { return this.#bank }

  /** The world's bank, refusing while it, its main gate or its root box is not live */
  get #bank(): Bank { return this.#world.demandRootsLive() }
  // --

  // == [Construction]: make, constructor

  /** Make the vault of the boxes of `world`'s bank, reading them through `vaultTSQ`, the vault TSQ of the same bank.
   * The world's sweep sweeps the vault too. Refuses a swept world. Its verbs refuse while the bank is not live.
   */
  static make(world: World, vaultTSQ: VaultTSQ): Vault {
    const args = VaultChecks.makeArgs.parse({ world, vaultTSQ })
    const vault = new Vault(args.world, args.vaultTSQ)
    args.world.hostVault(vault)
    return vault
  }

  private constructor(world: World, vaultTSQ: VaultTSQ) {
    this.#world    = world
    this.#vaultTSQ = vaultTSQ
    Object.freeze(this)
  }
  // --

  // == [Ending]: sweep

  /** Stop the vault TSQ hearing of the bank's boxes ({@link VaultTSQ.sweep}). Never throws. */
  sweep(): this {
    this.#vaultTSQ.sweep()
    return this
  }
  // --

  // == [Writing boxes]: tryPutBoxOnce, putBoxOnce, tryDelBoxOnce, delBoxOnce

  /** Seal and write the next revision of the box `cited`, applying `patch` and encrypting `secrets`. Resolves an `Outcome` of the record stored.
   * Given a labelpath, it writes over the newest revision this device has seen of the box, getting the box first where it has seen none.
   * It tries once. Where another revision is stored, it refuses `stale_write`, and the box then holds that revision.
   * Over a sparse box, a tombstone or no box, `patch` must give the sidecar. Misuse is a bad outcome too.
   * @example
   *   const { ok, val: box, err } = await vault.tryPutBoxOnce('box/openai', { sidecar: { account: 'work' } }, { whisper })
   */
  async tryPutBoxOnce(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<Outcome.Outcome<LiveOf<BoxRecord>>> {
    const sealed = await Outcome.outcomeOf(async () => await this.#sealedWriteOf(cited, patch, secrets))
    if (! sealed.ok) { return sealed }
    const answer = await this.#vaultMinder.tryPutOnce(sealed.val)
    if (! answer.ok) { return answer }
    if (! BaseBox.isLive(answer.val)) { return Outcome.bad(Throwers.storageIssue()) }
    return Outcome.good(answer.val)
  }

  /** {@link tryPutBoxOnce}, throwing its refusal instead of answering it: the record stored, on success.
   * @example
   *   const box = await vault.putBoxOnce('box/openai', { sidecar: { account: 'work' } }, { whisper })
   */
  async putBoxOnce(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<LiveOf<BoxRecord>> {
    return Outcome.valOf(await this.tryPutBoxOnce(cited, patch, secrets))
  }

  /** Delete the box at `labelpath`, resolving an `Outcome` of the tombstone stored.
   * It writes over the newest revision this device has seen of the box, getting the box first where it has seen none. Misuse is a bad outcome too.
   */
  async tryDelBoxOnce(labelpath: BoxLabelpath): Promise<Outcome.Outcome<TombstoneOf<BoxRecord>>> {
    const sealed = await Outcome.outcomeOf(async () => await this.#sealedWriteOf(labelpath, { am: 'x' }))
    if (! sealed.ok) { return sealed }
    const answer = await this.#vaultMinder.tryDelOnce(sealed.val)
    if (! answer.ok) { return answer }
    if (! BaseBox.isGone(answer.val)) { return Outcome.bad(Throwers.storageIssue()) }
    return Outcome.good(answer.val)
  }

  /** {@link tryDelBoxOnce}, throwing its refusal instead of answering it: the tombstone stored, on success. */
  async delBoxOnce(labelpath: BoxLabelpath): Promise<TombstoneOf<BoxRecord>> {
    return Outcome.valOf(await this.tryDelBoxOnce(labelpath))
  }
  // --

  // == [Sealing boxes]: sealBox, trySealBox, unsealBox, tryUnsealBox
  // The world's seal and unseal, for this vault's own boxes: the root box's lifeseq begins each box's lifepath. They
  // refuse a locked bank; only withWhisper waits for the unlock.

  /** Seal and return the next revision of the box `donorProps`. Needs the bank unlocked.
   * The revision applies `publicProps`, and encrypts the whisper of `secretProps`. An unknown key in either refuses.
   * Pass `donorProps` as you have it: whole or sparse, sealed or unsealed, a tombstone or the shell. It must be a box of this vault's bank.
   * A whole live box's revision keeps its sidecar unless `publicProps` gives one. Over a sparse box, a tombstone or the shell,
   * `publicProps` must give the sidecar. After a tombstone or the shell, the revision begins the box's next life.
   * Given `am: 'x'` in `publicProps`, it seals the tombstone of the live box instead, whose sealed empty whisper authenticates
   * it, and refuses `secretProps` or any sidecar but `{}`.
   * Its `written_at` is `publicProps.written_at`, or now. Nothing is written.
   * @example
   *   const box = await vault.sealBox(donor, { sidecar: { account: 'work' } }, { whisper })
   */
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxTombstonePublicProps): Promise<TombstoneOf<BoxRecord>>
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secretProps: BoxCleartexts): Promise<LiveOf<BoxRecord>>
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<BoxRecord>
  async sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<BoxRecord> {
    this.#bank.demandEnabled()
    this.#demandOwnBox(donorProps)
    return await this.#world.seal(BaseBox, donorProps, publicProps, secretProps)
  }

  /** {@link sealBox}, resolving an `Outcome` instead of throwing. */
  trySealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxTombstonePublicProps): Promise<Outcome.Outcome<TombstoneOf<BoxRecord>>>
  trySealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secretProps: BoxCleartexts): Promise<Outcome.Outcome<LiveOf<BoxRecord>>>
  trySealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<Outcome.Outcome<BoxRecord>>
  trySealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<Outcome.Outcome<BoxRecord>> {
    return Outcome.outcomeOf(() => this.sealBox(donorProps, publicProps, secretProps))
  }

  /** Unseal `box`, returning it with its whisper in place of the sealed one. Needs the bank unlocked.
   * It authenticates the box, all but its sidecar. For a tombstone, that checks its seal.
   */
  async unsealBox(box: BoxRecord): Promise<BoxUnsealed> {
    this.#bank.demandEnabled()
    this.#demandOwnBox(box)
    return await this.#world.unseal(BaseBox, box)
  }

  /** {@link unsealBox}, resolving an `Outcome` instead of throwing. */
  tryUnsealBox(box: BoxRecord): Promise<Outcome.Outcome<BoxUnsealed>> { return Outcome.outcomeOf(() => this.unsealBox(box)) }
  // --

  // == [Using whispers]: forceTimelyUnlocked, withWhisper, withUnlockedWhisper, #demandReadableBox

  /** Get the box at `labelpath` and wait for the bank to be unlocked, both at once; resolve once the box can be unsealed.
   * The get runs under `opts.staleTime` where given, else only where this device has seen a newer revision than it holds whole.
   * It rejects with the `unlock` gating's refusal where that wait is dismissed or the bank ends ({@link Bank.ensureUnlocked}),
   * else with the get's refusal unchanged, else as {@link withWhisper} would refuse the box: `stale_read` or `absent_box`.
   */
  async forceTimelyUnlocked(labelpath: BoxLabelpath, opts: GetOnceOpts = {}): Promise<void> {
    const scope = this.#scopeAt(labelpath)
    VaultTSQChecks.getOnceOpts.parse(opts)
    // Both settle before either refusal is thrown, so which one rejects never depends on which came first.
    const [unlocked, got] = await Promise.allSettled([this.#bank.ensureUnlocked(), this.#vaultTSQ.getOnce(scope, opts)])
    if (unlocked.status === 'rejected') { throw unlocked.reason }
    if (got.status === 'rejected')      { throw got.reason }
    this.#demandReadableBox(scope)
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
    VaultChecks.fn.parse(fn)
    await this.#bank.ensureUnlocked()
    return await this.withUnlockedWhisper(labelpath, fn)
  }

  /** Call `fn` with the box at `labelpath` unsealed, on an unlocked bank, and resolve what `fn` resolves.
   * It never waits for an `unlock` gating: on a locked bank it refuses `bank_locked`. Call it where the bank shows unlocked, or call {@link withWhisper}.
   * The box is got only where this device has seen a newer revision than it holds whole, or none. A refused get rejects
   * with its refusal, unless it is `storage_unavailable` over a box this device holds, which runs on that box.
   * `fn` gets the whole box, in a revision stored at a moment during the call: its whisper, its sidecar and its record's fields.
   * That box may be behind a revision of the same life heard of since.
   * It refuses `stale_read` where the newest revision heard of is a sparse record of a newer life, and `absent_box` for a box deleted or never stored.
   * Nothing of the unsealed box is retained, and what `fn` throws is rethrown unchanged. Use the whisper only inside `fn`, and return only what is safe to retain.
   * @example
   *   if (vault.bank.isUnlocked) { reply = await vault.withUnlockedWhisper('box/openai', ({ whisper }) => askModel(whisper['apiKey'], question)) }
   */
  async withUnlockedWhisper<ResultT>(labelpath: BoxLabelpath, fn: (box: BoxUnsealed) => Helpers.Awaitable<ResultT>): Promise<ResultT> {
    const scope = this.#scopeAt(labelpath)
    VaultChecks.fn.parse(fn)
    this.#bank.demandEnabled()
    if (this.#bank.isLocked) { throw Throwers.needUnlocked() }
    // Storage out of reach is no news of the box: the page already shows the box this device holds, and so may its whisper.
    // The vault TSQ's get is TanStack's, which rejects: there is no outcome to branch on.
    try {
      await this.#vaultTSQ.getOnce(scope)
    } catch (err) {
      if (! Errors.isVaultError(err, 'storage_unavailable') || (this.#boxCarAt(scope) === undefined)) { throw err }
    }
    return await fn(await this.unsealBox(this.#demandReadableBox(scope)))
  }

  /** The live record the box at `scope` holds, of the newest life heard of, behind within that life or not.
   * Refuses `stale_read` where the box is unknown or known only sparse in its newest life, then `absent_box` where it holds a tombstone or the shell.
   */
  #demandReadableBox(scope: ScopeAt<BoxLabelpath>): LiveOf<BoxRecord> {
    const car = this.#boxCarAt(scope)
    if ((car === undefined) || (car.agekind === 'bare')) { throw Throwers.thingSoonestBare(scope.labelpath) }
    const record = car.thing.pickle()
    if (! BaseBox.isLive(record)) { throw Throwers.boxAbsent({ boxlabel: scope.labelpath }) }
    return record
  }
  // --

  // == [Helpers]: #vaultMinder, #sealedWriteOf, #donorAt, #boxCarAt, #scopeAt, #demandOwnBox

  /** The bank's VaultMinder, which holds its Things and sends its writes */
  get #vaultMinder(): VaultMinder { return this.#world.demandVaultMinder() }

  /** The write of the next revision after `cited`, or after the newest revision seen at a labelpath, applying `publicProps` and sealing `secretProps` */
  async #sealedWriteOf(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<PutOnceArgs<BoxRecord>> {
    const donor = (typeof cited === 'string') ? await this.#donorAt(cited) : cited
    return { cited: Thing.sparseOf(donor), record: await this.sealBox(donor, publicProps, secretProps) }
  }

  // A box whose newest revision is known only sparse is written over that revision, and the patch then gives the sidecar.
  /** The newest revision seen of the box at `labelpath`: the record it holds where that was seen whole, else its citable, the box got first where none is seen */
  async #donorAt(labelpath: BoxLabelpath): Promise<Sealable<LiveOf<BoxRecord>>> {
    const scope = this.#scopeAt(labelpath)
    if (this.#boxCarAt(scope) === undefined) { await this.#vaultTSQ.getOnce(scope) }
    const car = this.#boxCarAt(scope)
    if (car === undefined) { throw Throwers.storageIssue() }
    return (car.agekind === 'here') ? car.thing.pickle() : car.citable
  }

  /** The car of the box at `scope`, or undefined where this device has seen no record of it */
  #boxCarAt(scope: ThingScope): ThingCar<Box> | undefined {
    const car = this.#vaultMinder.carAt(scope)
    return isBoxCar(car) ? car : undefined
  }

  /** The scope of the box at `labelpath`, in this vault's bank. Refuses the root box's labelpath. */
  #scopeAt(labelpath: BoxLabelpath): ScopeAt<BoxLabelpath> {
    return { ...this.#bank.scope, labelpath: VaultChecks.boxLabelpath.parse(labelpath) as BoxLabelpath }
  }

  /** Demand that `box` is a box of this vault's bank, under its current root box. */
  #demandOwnBox(box: unknown): void {
    const { lifepath } = BoxChecks.sealable.parseConsistent(box, this.#bank.scope, { kind: 'record_conflict' })
    if (lifepath.split('/', 1)[0] !== this.#bank.rootBox.lifeseq) { throw Throwers.boxOfOtherRoot() }
  }
  // --
}

/** True of the car of a box */
function isBoxCar(car: ThingCar | undefined): car is ThingCar<Box> { return car?.thing instanceof Box }
