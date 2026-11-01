/** A bank's vaults as this device holds them: the vault listing, and what it is given to reach the vaultDB, the device cache and the bank. */

import { Mutex } from 'es-toolkit'
import { makeLifeTok } from '../crypto'
import { VaultError } from '../errors'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { outcomeOf, valOf } from '../outcome'
import { type BankScope, type VaultScope, vaultScope } from '../shapes/scopes'
import { type VaultLogger, asError } from '../logger'
import * as Phrases from '../phrases'
import type { BoxStore } from './box-listing'
import { Listing } from './listing'
import { Gate } from './gate'
import { type PassphraseProving, spendAnswerAfter } from './proving'
import type { GatingWorld } from './gating'
import { type Cache, type Dna, type Fetched, type FetchOpts, type LeaseDeviceDB, type LeaseGrantOpts, type ListingOpts, type ListingWorld, type Cleartexts, type GateWorld, type Revision, type Store, type Times, type VaultRecord, type VaultSparse, VaultFormat, vaultRecord, vaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import { type VaultSnapshot, UnlockAtBirth, Vault, WithLeaseDB } from './vault'

// == [Given to a vault listing]: BoxVaultDB, VaultWorld, VaultStore, VaultCache, VaultDna, VaultListingOpts

/** The vaultDB as a vault's boxes reach it: the store of one vault's boxes. A `StoreFront` is one. */
export type BoxVaultDB = { boxStore(scope: VaultScope): BoxStore }

/** The bank, as far as its vaults need it: a {@link ListingWorld}, and what a vault's gate, lease, gatings and box listing need of it, as `vaultListingOpts` checks it. Its lease verbs take the vault's scope; `vault.leaseDBFriend()` binds it. */
export type VaultWorld = ListingWorld & GateWorld & GatingWorld & {
  scope:            BankScope
  logger:           VaultLogger
  leaseMillis?:     LeaseGrantOpts['leaseMillis']
  pesterMillis?:    number
  deviceDB:         LeaseDeviceDB
  vaultDB:          BoxVaultDB
  /** Each box listing's `maxMillisSinceRefresh`. */
  boxRefreshMillis: number
}

/** The vaultDB's vault verbs, as this listing calls them. */
export type VaultStore = Store<VaultScope, VaultRecord, VaultSparse>

export type VaultCache = Cache<VaultRecord, VaultSparse>

/** The dna of a vault: its scope. Anything else it carries is ignored: the gate of a vault ensured is the one built from its cleartexts. */
export type VaultDna = Dna<VaultScope, VaultRecord>

export type VaultListingOpts = ListingOpts<VaultScope, VaultRecord, VaultSparse> & { world: VaultWorld }
// --

// == [VaultListing]

/** One bank's vaults, by vaultlabel. A vault is born only as stored, through `ensure`; `build` takes a record alone. */
export class VaultListing extends Listing<VaultScope, VaultRecord, VaultSparse, VaultSnapshot, Vault> {
  declare readonly world: VaultWorld

  /** By scopepath, the mutex that every Vault object of the scope, and `close`, queue deviceDB work on the lease behind: it outlives an instance evicted, so one born after waits for what the evicted one queued. */
  readonly #leaseMutexes = new Map<string, Mutex>()

  /** By scopepath, how many closes have landed, so an `ensure` whose scope was closed while it stored grants no lease. */
  readonly #closeSeqs = new Map<string, number>()

  /** How many `closeAll`s have landed, so a vault a fetch or hello then holds takes up no lease. */
  #closeAllSeq = 0

  constructor(opts: VaultListingOpts) {
    super(opts)
    MSX.vaultListingOpts.parse(opts)
    Object.freeze(this)
  }

  /** Build a vault of `dna` gated by `cleartexts`, put it, and hold the vault as stored: unlocked under a lease its passphrase proving grants, where the put lands; where another device stored a vault under the scope first, that vault, as it stands.
   * Nothing is held before storage takes the vault, so cleartexts refused hold nothing. A `close` of the scope while it stores, or a lock or let-go of the vault before its lease is taken up, leaves it locked, no lease kept. A passkey's answer among them is spent unless refused as correctable, as a weak passphrase is (G2).
   */
  ensure(dna: VaultDna, cleartexts: Cleartexts): Promise<Vault> {
    return spendAnswerAfter(cleartexts, async () => {
      const scope = this.scopeOf(dna)
      const closeSeq = this.#closeSeqOf(scope)
      const { draft, proving } = await this.#buildDraft(this.stampDna(scope), cleartexts)
      const vault = await this.putDraft(draft)
      if (vault.vault_tok === draft.vault_tok && this.#closeSeqOf(scope) === closeSeq) { await vault[UnlockAtBirth](proving) }
      return vault
    })
  }

  /** The vault under `scope` as storage now holds it, as the base's `fetch` says; a vault this fetch gave birth to first takes up the lease this device keeps of it, as {@link Vault.takeUpCachedLease} does, so it is answered unlocked where one is kept. */
  override async fetch(scope: VaultScope, opts: FetchOpts = {}): Promise<Vault | null> {
    const held = this.at(scope)
    const closeAllSeq = this.#closeAllSeq
    const vault = await super.fetch(scope, opts)
    if (vault !== null && vault !== held) { await this.#takeUpKeptLease(vault, closeAllSeq) }
    return vault
  }

  /** Take up each vault's cached lease, as {@link Vault.takeUpCachedLease} does, once the base's `hello` has revived and hydrated them; where a `closeAll` has landed since `closeAllSeqAtStart`, a {@link closeAllSeq} read earlier, a locked vault erases its lease instead. */
  override async hello(closeAllSeqAtStart: number = this.#closeAllSeq): Promise<void> {
    await super.hello()
    await Promise.all(this.things.map((vault) => this.#takeUpKeptLease(vault, closeAllSeqAtStart)))
  }

  /** How many {@link closeAll}s have landed: read it where a hello begins, before anything it awaits, and hand it to {@link hello}. */
  get closeAllSeq(): number { return this.#closeAllSeq }

  /** Lock the vault under `scope`, as `vault.lock()` does, and evict it; where none is held, erase the lease this device keeps of the scope all the same, so no vault of it taken up later finds one. A refused erase is told as bad news. */
  close(scope: VaultScope): void {
    const checked = this.scopeOf(scope)
    const scopepath = this.scopepathOf(checked)
    this.#closeSeqs.set(scopepath, this.#closeSeqOf(checked) + 1)
    const held = this.at(checked)
    if (held !== null) {
      held.lock()
      this.evict(checked)
      return
    }
    const { deviceDB } = this.world
    void outcomeOf(() => this[WithLeaseDB](checked, async () => { valOf(await deviceDB.tryDelLease(checked)) }))
      .then((done) => { if (! done.ok) { this.tellBadNews([done.err]) } })
  }

  /** {@link close} every vault held, and leave a vault that a fetch or hello in flight then holds locked, its lease erased. */
  closeAll(): void {
    this.#closeAllSeq += 1
    for (const vault of this.things) { this.close(vault.scope) }
  }

  /** Run `work` once the deviceDB work on the lease of `scope` begun before it has landed, by any Vault object of the scope or by `close`, holding off any begun after. */
  async [WithLeaseDB]<ValT>(scope: VaultScope, work: () => Promise<ValT>): Promise<ValT> {
    const scopepath = this.scopepathOf(scope)
    const mutex = this.#leaseMutexes.get(scopepath) ?? new Mutex()
    this.#leaseMutexes.set(scopepath, mutex)
    await mutex.acquire()
    try {
      return await work()
    } finally {
      mutex.release()
    }
  }

  /** End the watch and each vault's watch of its boxes, and let every vault's lease go, leaving the lease this device keeps for the next load; erasing it is `vault.lock()`'s. */
  override goodbye(): void {
    super.goodbye()
    for (const vault of this.things) {
      vault.goodbyeBoxes()
      vault.letLeaseGo()
    }
  }

  // == [Defined by the vault listing]

  protected vaultTokOfWorld(): null { return null }

  /** A vault just held takes up the lease this device keeps, unless a `closeAll` has landed since: then a locked one erases it, and one unlocked was unlocked since the close, and stays. */
  async #takeUpKeptLease(vault: Vault, closeAllSeqAtStart: number): Promise<void> {
    if (this.#closeAllSeq === closeAllSeqAtStart) {
      await vault.takeUpCachedLease()
      return
    }
    if (vault.isLocked) { vault.lock() }
  }

  /** A failed `onBadNews` goes to the logger as well: a platform with no `reportError` would lose it. */
  protected override badNewsHandlerFailed(err: unknown): void {
    this.world.logger.error(Phrases.BadNewsHandlerFailed, { call: 'onBadNews' }, asError(err))
    super.badNewsHandlerFailed(err)
  }

  #closeSeqOf(scope: VaultScope): number { return this.#closeSeqs.get(this.scopepathOf(scope)) ?? 0 }

  protected scopepathOf(scope: VaultScope): string {
    return ['vault', scope.applabel, scope.user_id, scope.vaultlabel].join('^')
  }

  scopeOf(duck: unknown):  VaultScope  { return vaultScope.parse(duck) }

  sparseOf(duck: unknown): VaultSparse { return vaultSparse.parse(duck) }

  recordOf(duck: unknown): VaultRecord { return vaultRecord.parse(duck) }

  /** The novel record of a vault, the stamped dna under a `vault_tok` fresh from {@link makeLifeTok}, and the proving of the gate {@link Gate.build} makes of it from `cleartexts`. */
  async #buildDraft(dna: Dna<VaultScope, VaultRecord> & Revision & Times, cleartexts?: Cleartexts): Promise<{ draft: VaultRecord, proving: PassphraseProving }> {
    const checked = MSX.vaultBuildArgs.parse({ cleartexts })
    const sparse: VaultSparse = { ...dna, fmt: VaultFormat, am: 'a', vault_tok: makeLifeTok() }
    const { gate, proving } = await Gate.build(MSX.vaultStamp.parse(sparse), checked.cleartexts, this.world)
    return { draft: { ...sparse, gate: gate.pickle() }, proving }
  }

  protected makeThing(central: Fetched<VaultRecord, VaultSparse>, staged: Fetched<VaultRecord, VaultSparse>, cache: Cache<VaultRecord, VaultSparse>): Vault {
    return new Vault(this.world, this, cache, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
  }

  absentRefusal(scope: VaultScope): VaultError {
    return RefusalFuncs.vaultAbsent(scope.vaultlabel)
  }

  /** The record `meta.vault_stored` carries, where it is a record of these forms; else null. */
  protected storedInStaleRefusal(err: VaultError): Fetched<VaultRecord, VaultSparse> | null {
    const stored: unknown = err.meta?.vault_stored
    const full = vaultRecord.safeParse(stored)
    return full.success ? full.data : null
  }
  // --
}
// --
