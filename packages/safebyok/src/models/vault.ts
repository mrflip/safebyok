import { isEqual } from 'es-toolkit'
import { Clock, Errors, type Helpers, Outcome } from 'safebyok-big/internals'
import type { Bank } from './bank'
import { BaseBox } from './base-box'
import { Box } from './box'
import { Thing } from './thing'
import type { VaultTSQ } from '../minding/vault-tsq'
import * as Throwers from '../refusals/throwers'
import type { BoxUnsealed } from '../shapes/shapes-bankish'
import type { BoxCleartexts, BoxPublicProps, BoxTombstonePublicProps, LiveOf, LivePublicPropsOf, Sealable, TombstoneOf } from '../shapes/shapes-sealers'
import type { BoxLabelpath } from '../shapes/primitives'
import { type GetOnceOpts, VaultTSQChecks } from '../shapes/shapes-vault-tsq'
import type { PutOnceArgs } from '../shapes/shapes-vault-minder'
import type { BoxRecord, ScopeAt, Sparse } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'
import { VaultChecks } from '../shapes/shapes-vault'
import { type ProbeArgs, ProbeChecks, type ProbeLabelpath, type ProbeReport, type ProbeStep, type ProbeStepkind } from '../shapes/shapes-vault-probe'
import type { VaultStats } from '../shapes/shapes-vault-stats'
import type { VaultMinder } from '../minding/vault-minder'
import type { ThingCar } from '../minding/thing-car'

/** The scope of a box of this vault's bank. */
type BoxAt = ScopeAt<BoxLabelpath> & Readonly<{ modelkind: 'box' }>

/** One bank's boxes in this tab: the verbs to seal, put and delete them, to use their whispers, and to probe storage and keys with one.
 * Each seal is made under the bank's lease, so it needs the bank unlocked. A put or a delete answers the actual record.
 */
export class Vault {
  // == [Props]: #bank, #vaultTSQ

  /** The bank: its VaultMinder has the Things, and its lease is attached to it. */
  readonly #bank:    Bank
  readonly #vaultTSQ: VaultTSQ
  // --

  // == [Getters]: bank, #liveBank

  /** The bank whose boxes this vault carries, at whatever stage: the device's bank. */
  get bank(): Bank { return this.#bank }

  /** Demand that the bank's gate and root box are live, and return the bank. */
  get #liveBank(): Bank { return this.#bank.demandRootsLive() }
  // --

  // == [Construction]: make, constructor

  /** Make the vault of the boxes of `bank`, reading them through `vaultTSQ`, the vault TSQ of the same bank.
   * It connects and disconnects with the bank. Refuses a bank that has ended. Its verbs refuse while the bank is not live.
   */
  static make(bank: Bank, vaultTSQ: VaultTSQ): Vault {
    const args = VaultChecks.makeArgs.parse({ bank, vaultTSQ })
    const vault = new Vault(args.bank, args.vaultTSQ)
    args.bank.hostVault(vault)
    return vault
  }

  private constructor(bank: Bank, vaultTSQ: VaultTSQ) {
    this.#bank    = bank
    this.#vaultTSQ = vaultTSQ
    Object.freeze(this)
  }
  // --

  // == [Connecting]: connect, disconnect

  /** Have the vault TSQ hear of the bank's boxes ({@link VaultTSQ.connect}). Never throws. */
  connect(): this {
    this.#vaultTSQ.connect()
    return this
  }

  /** Stop the vault TSQ hearing of the bank's boxes ({@link VaultTSQ.disconnect}). Never throws. */
  disconnect(): this {
    this.#vaultTSQ.disconnect()
    return this
  }
  // --

  // == [Putting and deleting boxes]: tryPutBoxOnce, putBoxOnce, tryDelBoxOnce, delBoxOnce

  /** Seal and put the next revision of the box `cited`, applying `patch` and encrypting `secrets`. Resolves an `Outcome` of the actual record.
   * Given a labelpath, it cites the newest revision this device has seen of the box, getting the box first where it has seen none.
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

  /** {@link tryPutBoxOnce}, throwing its refusal instead of answering it: the actual record, on success.
   * @example
   *   const box = await vault.putBoxOnce('box/openai', { sidecar: { account: 'work' } }, { whisper })
   */
  async putBoxOnce(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<LiveOf<BoxRecord>> {
    return Outcome.valOf(await this.tryPutBoxOnce(cited, patch, secrets))
  }

  /** Delete the box at `labelpath`, resolving an `Outcome` of the actual tombstone.
   * It cites the newest revision this device has seen of the box, getting the box first where it has seen none. Misuse is a bad outcome too.
   */
  async tryDelBoxOnce(labelpath: BoxLabelpath): Promise<Outcome.Outcome<TombstoneOf<BoxRecord>>> {
    const sealed = await Outcome.outcomeOf(async () => await this.#sealedWriteOf(labelpath, { am: 'x' }))
    if (! sealed.ok) { return sealed }
    const answer = await this.#vaultMinder.tryDelOnce(sealed.val)
    if (! answer.ok) { return answer }
    if (! BaseBox.isGone(answer.val)) { return Outcome.bad(Throwers.storageIssue()) }
    return Outcome.good(answer.val)
  }

  /** {@link tryDelBoxOnce}, throwing its refusal instead of answering it: the actual tombstone, on success. */
  async delBoxOnce(labelpath: BoxLabelpath): Promise<TombstoneOf<BoxRecord>> {
    return Outcome.valOf(await this.tryDelBoxOnce(labelpath))
  }
  // --

  // == [Stats]: stats, tryStats

  /** The bank's storage stats, read from the vaultDB once: how many boxes and gates it has, live and in all, their size in bytes, and the datastore's limits.
   * Works on a locked bank. Nothing refuses a write for being over a limit.
   * @example
   *   const { box, gate, max } = await vault.stats()
   *   const isNearlyFull = (box.size + gate.size) > 0.9 * max.size
   */
  stats(): Promise<VaultStats> { return this.#bank.stats() }

  /** {@link stats}, resolving an `Outcome` instead of throwing. */
  tryStats(): Promise<Outcome.Outcome<VaultStats>> { return Outcome.outcomeOf(() => this.stats()) }
  // --

  // == [Sealing boxes]: sealBox, trySealBox, unsealBox, tryUnsealBox
  // The bank's seal and unseal, for this vault's own boxes: the root box's lifeseq begins each box's lifepath. They
  // refuse a locked bank; only withWhisper waits for an `unlock` gating.

  /** Seal and return the next revision of the box `donorProps`. Needs the bank unlocked.
   * The revision applies `publicProps`, and encrypts the whisper of `secretProps`. An unknown field in either refuses.
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
    this.#liveBank.demandEnabled()
    this.#demandOwnBox(donorProps)
    return await this.#bank.seal(BaseBox, donorProps, publicProps, secretProps)
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
    this.#liveBank.demandEnabled()
    this.#demandOwnBox(box)
    return await this.#bank.unseal(BaseBox, box)
  }

  /** {@link unsealBox}, resolving an `Outcome` instead of throwing. */
  tryUnsealBox(box: BoxRecord): Promise<Outcome.Outcome<BoxUnsealed>> { return Outcome.outcomeOf(() => this.unsealBox(box)) }
  // --

  // == [Using whispers]: forceTimelyUnlocked, withWhisper, withUnlockedWhisper, #demandReadableBox

  /** Get the box at `labelpath` and wait for the bank to be unlocked, both at once; resolve once the box can be unsealed.
   * The get runs under `opts.staleTime` where given, else only where this device has seen a newer revision than it has whole, or is not connected.
   * It rejects with the `unlock` gating's refusal where that wait is dismissed or the bank ends ({@link Bank.ensureUnlocked}),
   * else with the get's refusal unchanged, else with `stale_read` where the box is unknown or known only sparse in its newest life, or `absent_box` where it is deleted or never stored.
   */
  async forceTimelyUnlocked(labelpath: BoxLabelpath, opts: GetOnceOpts = {}): Promise<void> {
    const scope = this.#scopeAt(labelpath)
    VaultTSQChecks.getOnceOpts.parse(opts)
    // Both settle before either refusal is thrown, so which one rejects never depends on which came first.
    const [unlocked, got] = await Promise.allSettled([this.#liveBank.ensureUnlocked(), this.#vaultTSQ.getOnce(scope, opts)])
    if (unlocked.status === 'rejected') { throw unlocked.reason }
    if (got.status === 'rejected')      { throw got.reason }
    this.#demandReadableBox(scope)
  }

  /** Call `fn` with the box at `labelpath` unsealed, and resolve what `fn` resolves.
   * On a locked bank, or one whose lease is near its end, it first waits for an `unlock` gating, and rejects if that wait is dismissed or the bank ends.
   * Then it calls {@link withUnlockedWhisper}.
   * @example
   *   const reply = await vault.withWhisper('box/openai', ({ whisper }) => askModel(whisper['apiKey'], question))
   */
  async withWhisper<ResultT>(labelpath: BoxLabelpath, fn: (box: BoxUnsealed) => Helpers.Awaitable<ResultT>): Promise<ResultT> {
    // Checked before the wait, so a call that would refuse never asks the user to unlock.
    this.#scopeAt(labelpath)
    VaultChecks.fn.parse(fn)
    await this.#liveBank.ensureUnlocked()
    return await this.withUnlockedWhisper(labelpath, fn)
  }

  /** Call `fn` with the box at `labelpath` unsealed, on an unlocked bank, and resolve what `fn` resolves.
   * It never waits for an `unlock` gating: on a locked bank it refuses `bank_locked`. Call it where the bank shows unlocked, or call {@link withWhisper}.
   * It gets the box only where this device has none, has seen a newer revision than it has whole, or is not connected. A refused get rejects
   * with its refusal, unless it is `storage_unavailable` over a box this device has, which runs on that box.
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
    this.#liveBank.demandEnabled()
    if (this.#liveBank.isLocked) { throw Throwers.needUnlocked() }
    // Storage out of reach is no news of the box: the page already shows the box this device holds, and so may its whisper.
    // The vault TSQ's get is TanStack's, which rejects: there is no outcome to branch on.
    try {
      await this.#vaultTSQ.getOnce(scope)
    } catch (err) {
      if (! Errors.isVaultError(err, 'storage_unavailable') || (this.#boxCarAt(scope) === undefined)) { throw err }
    }
    return await fn(await this.unsealBox(this.#demandReadableBox(scope)))
  }

  /** Demand that the box at `scope` is live and seen whole in the newest life heard of, and return its record, which may be behind a revision of that life heard of since. */
  #demandReadableBox(scope: BoxAt): LiveOf<BoxRecord> {
    const car = this.#boxCarAt(scope)
    if ((car === undefined) || (car.agekind === 'bare')) { throw Throwers.thingSoonestBare(scope.labelpath) }
    const record = car.thing.pickle()
    if (! BaseBox.isLive(record)) { throw Throwers.boxAbsent({ boxlabel: scope.labelpath }) }
    return record
  }
  // --

  // == [Probing]: probe, tryProbe

  /** Test storage and keys end to end: put a box, get it back from storage, unseal it, check its whisper, and delete it. Needs the bank unlocked.
   * Resolves a report of each step's time in milliseconds, and whether the whisper unsealed was the one put. It never waits for an `unlock` gating.
   * The box at `args.labelpath`, by default {@link ProbeLabelpath}, is written over and then deleted: give a labelpath none of your boxes use.
   * A step's refusal rejects as a refusal of the same kind, its `meta.stepkind` naming the step and the step's refusal its cause.
   * A probe refused after its put leaves its box in storage, for the next probe at that labelpath to write over.
   * Two probes at one labelpath at once may refuse each other's steps.
   * @example
   *   const { whisperMatched, steps } = await vault.probe()
   */
  async probe(args: ProbeArgs = {}): Promise<ProbeReport> {
    const { labelpath, whisper, sidecar } = ProbeChecks.probeArgs.parse(args)
    const scope = this.#scopeAt(labelpath as BoxLabelpath)
    this.#liveBank.demandEnabled()
    if (this.#liveBank.isLocked) { throw Throwers.needUnlocked() }
    const put    = await timeStep('put', () => this.putBoxOnce(scope.labelpath, { sidecar }, { whisper }))
    // The vault TSQ's get may answer from its item even under a staleTime of 0, since storage's clock dates the item: the minder's get always asks storage.
    // Its answer's own record is checked, never the box this device holds, which right after the put is the put's record whatever storage kept.
    const got    = await timeStep('get', async () => {
      const answer = await this.#vaultMinder.tryGetOnce(scope)
      if (! answer.ok) { throw answer.err }
      const isPutsRevision = (answer.val !== null) && (answer.val.revtok === put.val.revtok)
      if (! isPutsRevision) { throw Throwers.probePutNotGot(scope.labelpath) }
      return answer.val as BoxRecord
    })
    const unseal = await timeStep('unseal', async () => {
      const unsealed = await this.unsealBox(got.val)
      return isEqual(unsealed.whisper, whisper)
    })
    const del    = await timeStep('del', () => this.delBoxOnce(scope.labelpath))
    return {
      labelpath:      scope.labelpath,
      whisperMatched: unseal.val,
      steps:          { put: put.step, get: got.step, unseal: unseal.step, del: del.step },
    }
  }

  /** {@link probe}, resolving an `Outcome` instead of throwing. */
  tryProbe(args: ProbeArgs = {}): Promise<Outcome.Outcome<ProbeReport>> { return Outcome.outcomeOf(() => this.probe(args)) }
  // --

  // == [Helpers]: #vaultMinder, #sealedWriteOf, #donorAt, #boxCarAt, #scopeAt, #demandOwnBox

  /** The bank's VaultMinder, which holds its Things and sends its writes */
  get #vaultMinder(): VaultMinder { return this.#bank.demandVaultMinder() }

  /** The put or delete ask for the next revision after `cited`, or after the newest revision seen at a labelpath, applying `publicProps` and sealing `secretProps` */
  async #sealedWriteOf(cited: Sealable<LiveOf<BoxRecord>> | BoxLabelpath, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<PutOnceArgs<BoxRecord>> {
    const donor = (typeof cited === 'string') ? await this.#donorAt(cited) : cited
    return { cited: Thing.sparseOf(donor), record: await this.sealBox(donor, publicProps, secretProps) }
  }

  // A box whose newest revision is known only sparse is written over that revision, and the patch then gives the sidecar.
  /** The newest revision seen of the box at `labelpath`: its record where that was seen whole, else its citable. Where none is seen, it gets the box first */
  async #donorAt(labelpath: BoxLabelpath): Promise<Sealable<LiveOf<BoxRecord>>> {
    const scope = this.#scopeAt(labelpath)
    if (this.#boxCarAt(scope) === undefined) { await this.#vaultTSQ.getOnce(scope) }
    const car = this.#boxCarAt(scope)
    if (car === undefined) { throw Throwers.storageIssue() }
    // A box's car cites a box.
    return (car.agekind === 'here') ? car.thing.pickle() : car.citable as Sparse<BoxRecord>
  }

  /** The car of the box at `scope`, or undefined where this device has seen no record of it */
  #boxCarAt(scope: BoxAt): ThingCar<Box> | undefined {
    const car = this.#vaultMinder.carAt(scope)
    return isBoxCar(car) ? car : undefined
  }

  /** The scope of the box at `labelpath`, in this vault's bank. Refuses the root box's labelpath. */
  #scopeAt(labelpath: BoxLabelpath): BoxAt {
    return { modelkind: 'box', ...this.#liveBank.scope, labelpath: VaultChecks.boxLabelpath.parse(labelpath) as BoxLabelpath }
  }

  /** Demand that `box` is a box of this vault's bank, under its current root box. */
  #demandOwnBox(box: unknown): void {
    const { lifepath } = BoxChecks.sealable.parseConsistent(box, this.#liveBank.scope, { kind: 'record_conflict' })
    if (lifepath.split('/', 1)[0] !== this.#liveBank.rootBox.lifeseq) { throw Throwers.boxOfOtherRoot() }
  }
  // --
}

// == [Helpers]: isBoxCar

/** True of the car of a box */
function isBoxCar(car: ThingCar | undefined): car is ThingCar<Box> { return car?.thing instanceof Box }
// --

// == [Probing helpers]: timeStep

/** Run `fn`, the probe's step `stepkind`, and time it, rethrowing its refusal as the probe's at that step */
async function timeStep<ValT>(stepkind: ProbeStepkind, fn: () => Promise<ValT>): Promise<{ val: ValT, step: ProbeStep }> {
  const startedAt = Clock.nowMillis()
  try {
    const val = await fn()
    return { val, step: { millis: Clock.nowMillis() - startedAt } }
  } catch (err) {
    throw Throwers.probeStepRefused(stepkind, err)
  }
}
// --
