import { Mutex } from 'es-toolkit'
import { MinuteMillis } from '../consts'
import { consistent, verifyConsistent } from '../checks/validator'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import type { Clock } from '../shapes/bank-opts'
import type { Boxscope, VaultScope } from '../shapes/scopes'
import type { Box, BoxSnapshot } from './box'
import { type BoxCache, type BoxDna, type BoxWorld, BoxListing } from './box-listing'
import { Gate } from './gate'
import { type AnyGating, type GatingWorld, Gating } from './gating'
import { Lease } from './lease'
import type { AttemptCleartexts, BoxBag, CleartextsForGatingkind, EditOpts, Fetched, GateProps, GatingKind, LeaseDBFriend, LockState, PasskeyAddCleartexts, PassphraseCleartexts, PassphraseReplaceCleartexts, TimelyOpts, VaultRecord, VaultSparse, VaultTrouble } from './models-shapes'
import * as MSX from './models-shapes'
import { spendAnswer, spendAnswerAfter } from './proving'
import { Storable } from './storable'
import type { VaultWorld } from './vault-listing'

// == [Record forms]: DefaultLeaseMillis, DefaultPesterMillis, VaultSnapshot, BoxDnaInVault, VaultPatch, GateStaging, UnkeptBoxCache

/** How long a lease lasts where the world names no `leaseMillis`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * MinuteMillis

/** How often the user is asked for the passphrase where the world names no `pesterMillis`: seven days. */
export const DefaultPesterMillis = 7 * 24 * 60 * MinuteMillis

/** A vault as a host renders it, frozen, and the same object until what it shows changes. It carries no secret material: no whisper, key or cleartext, and of the gate only whether it holds a passkey. */
export type VaultSnapshot = VaultScope & Readonly<{
  vault_tok:     string
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  present:       boolean
  /** False while the vault is held sparse. */
  full:          boolean
  lockState:     LockState
  /** The held lease's; null while the vault is locked. */
  autolock_at:   number | null
  /** Whether the gate holds a passkey; null while the vault is held sparse. */
  hasPasskey:    boolean | null
  /** The snapshot of each box the vault holds present. */
  boxes:         readonly BoxSnapshot[]
  /** When storage last confirmed the record; null until it first has. */
  refreshedAt:   number | null
  trouble:       VaultTrouble | null
}>

/** The snapshot's trouble for a vault whose stored record is damaged. */
const DamagedVaultTrouble: VaultTrouble = Object.freeze({ refusalkind: 'damaged_vault', message: Phrases.VaultStoredDamaged })

/** A box's {@link BoxDna} as its vault's verbs take it: the vault's own scope fields may be left out. */
export type BoxDnaInVault = Omit<BoxDna, keyof VaultScope> & BoxBag

/** A host's patch for `edit` and `send`: any prop of the vault's record, each checked and all ignored, the gate included, so `{}` or `{ ...record }` will do and a patch only moves the revision. `vaultPatch` checks it. */
export type VaultPatch = { [Prop in keyof VaultRecord]?: VaultRecord[Prop] | undefined }

/** The one patch whose gate the vault stages: made only by `Vault.#sendGate`, and never exported, so no host's patch carries a gate. */
class GateStaging {
  /** The record's gate that `Vault.#sendGate`'s caller proved against, the very object: `makeStaged` refuses where the record in hand no longer holds it. */
  readonly ante: GateProps
  readonly gate: GateProps
  constructor(ante: GateProps, gate: GateProps) {
    this.ante = ante
    this.gate = gate
    Object.freeze(this)
  }
}

// GAP: no device cache of a vault's boxes yet; each load starts with none held.
/** The device cache of a vault's boxes, which keeps nothing. */
const UnkeptBoxCache: BoxCache = Object.freeze({ load: () => Promise.resolve([]), save: () => Promise.resolve() })
// --

// == [Vault]

/** A vault as this device holds it: a storable that ducks as its record, and the world its boxes live in.
 * Its `vault_tok` is the life of the vault in its scope, fixed at birth: a draft's is minted
 * here, a received record's is its own, and a record under another `vault_tok` throws
 * 'unexpected_error', a draft's central never stored included. Its record carries its gate, the
 * wayins, and nothing else stores them. Its guards take no lock: its record holds no secret. A
 * vault deleted or damaged is not edited back to life, as a box is: a new life is a new
 * `vault_tok`, so a new instance, built by the listing.
 *
 * It asks the user one thing at a time. A gated verb called while a gating of its kind is
 * launched joins that gating, sharing its outcome; one of another kind waits until it settles.
 */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultPatch, VaultSnapshot> implements BoxWorld {
  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly world:      VaultWorld

  /** Locked until a lease is set; `lock()` sets it again. */
  #isLocked = true

  /** The lease this device holds while the vault is unlocked, null while it is locked. */
  #lease: Lease | null = null

  /** Held by each piece of deviceDB work on the lease, a lock's erase, a grant's put, a look for the lease kept, so each lands in the order begun. */
  readonly #leaseMutex = new Mutex()

  /** Each lock and let-go counts here, so an unlock or a look begun before one takes up no lease after it. */
  #lockSeq = 0

  /** The look for the lease this device keeps in flight, which a look begun meanwhile joins; null once it settles, or a lock or let-go overtakes it. */
  #cachedLookup: Promise<Lease | null> | null = null

  /** The unlock in flight, by cleartexts or by a gating, which an `ensureUnlocked` begun meanwhile joins; null once it settles, or a lock or let-go overtakes it. */
  #unlocking: Promise<Lease> | null = null

  /** Held by the gating of this vault that asks the user, so a gating of another kind waits its turn. */
  readonly #askingMutex = new Mutex()

  /** Each gating launched and not yet settled, by kind, from the moment it waits its turn: a launch of a kind held here joins it. A lock or let-go empties it, so no launch after joins one it ends. */
  readonly #launches = new Map<GatingKind, Promise<void>>()

  /** The gating asking the user, which a lock or let-go declines, and an `ensureUnlocked(cleartexts)` attempts through where it unlocks; null while none asks. */
  #asking: AnyGating | null = null

  #gate: { props: GateProps, gate: Gate } | null = null

  /** The vault's boxes, each listed by boxlabel; its changes remake the vault's snapshot. */
  readonly #boxListing: BoxListing = this.#makeBoxListing()

  /** The box listing's hello, begun by the first box verb and joined by the rest; null until then, and again after `goodbyeBoxes`. */
  #boxesHello: Promise<void> | null = null

  /** Counts each `goodbyeBoxes`, so a hello it overtook ends the watch that hello starts late. */
  #boxesGoodbyes = 0

  // == [Props, as the record has them]: fmt

  get fmt(): number { return this.combined.fmt }
  // --

  // == [The world of its boxes]: clock, lockState, isLocked, ensureTimely, takeWorld

  get clock(): Clock { return this.world.clock }

  lockState(): LockState { return this.#isLocked ? 'locked' : 'unlocked' }

  /** The vault's own lock, not its world's: the bank has none. */
  override get isLocked(): boolean { return this.lockState() === 'locked' }

  /** A box's verb wants its world timely: hydrate the vault by `maxWorldMillis`, the box's horizon for its world. */
  async ensureTimely(opts: TimelyOpts): Promise<void> {
    await this.hydrate({ maxMillisSinceRefresh: opts.maxWorldMillis })
  }

  /** The vault record a box's answer carries, received as any record of this vault is. What `receive` hands back goes nowhere: the box listing takes its world synchronously, where the vault listing delivers asynchronously. The vault saves itself to the device cache as it settles, as at any receive. */
  takeWorld(world: unknown): void {
    this.receive(this.listing.sparseOf(world))
  }
  // --

  // == [The gate]: gate

  // Made on first read, not at settle: the base constructor settles before this class's fields exist.
  /** The Gate of the record in hand, the same while the record's `gate` is the same object, so a record received remakes it. A vault held sparse, or a tombstone, has none in hand and refuses 'bad_option': hydrate first. */
  get gate(): Gate {
    const full = this.demandFullProps()
    if (this.#gate?.props !== full.gate) { this.#gate = { props: full.gate, gate: new Gate(full, full.gate) } }
    return this.#gate.gate
  }
  // --

  // == [Its boxes]: boxes, boxscopeOf, boxOf, getBox, makeBox, ensureBox, helloBoxes, goodbyeBoxes, makeBoxListing, evictBoxes, each host's verb with its try form

  /** The boxes the vault holds, present or not. */
  get boxes(): readonly Box[] { return this.#boxListing.things }

  /** The scope of the box `bag` names; a bag naming another vault refuses 'bad_scope'. */
  boxscopeOf(bag: BoxBag): Boxscope {
    const { boxlabel } = verifyConsistent(MSX.boxBag.parse(bag), this.scope, { kind: 'bad_scope', message: Phrases.boxOfOtherVault })
    return { ...this.scope, boxlabel }
  }

  /** The box `bag` names, as the vault holds it now, or null. Calls nothing. */
  boxOf(bag: BoxBag): Box | null { return this.#boxListing.at(this.boxscopeOf(bag)) }

  /** The box `bag` names, as the vaultDB holds it; null where it holds none, or a tombstone. */
  async getBox(bag: BoxBag, opts: TimelyOpts = {}): Promise<Box | null> {
    const scope = this.boxscopeOf(bag)
    const timely = MSX.timelyOpts.parse(opts)
    await this.helloBoxes()
    return this.#boxListing.fetch(scope, { ...timely, ifAbsent: 'nil' })
  }

  /** The box, or null, as an {@link Outcome}: the non-throwing form of {@link Vault.getBox}. */
  tryGetBox(bag: BoxBag, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.getBox(bag, opts)) }

  /** A box of `dna`, its whisper sealed in with its sidecar, held and stored nowhere until `box.send`; `BoxListing.build` says how it refuses. A box already held under its boxlabel refuses 'bad_option': edit that one. */
  async makeBox(dna: BoxDnaInVault): Promise<Box> {
    const scope = this.boxscopeOf(dna)
    await this.helloBoxes()
    return this.#boxListing.build({ ...dna, ...scope })
  }

  /** The box made, as an {@link Outcome}: the non-throwing form of {@link Vault.makeBox}. */
  tryMakeBox(dna: BoxDnaInVault): Promise<Outcome<Box>> { return outcomeOf(() => this.makeBox(dna)) }

  /** The box `dna` names, as the vaultDB holds it; where it holds none, made of `dna` and stored, as {@link BoxListing.ensure} does. A box stored keeps its whisper and sidecar. */
  async ensureBox(dna: BoxDnaInVault, opts: EditOpts = {}): Promise<Box> {
    const scope = this.boxscopeOf(dna)
    await this.helloBoxes()
    return this.#boxListing.ensure({ ...dna, ...scope }, opts)
  }

  /** The box ensured, as an {@link Outcome}: the non-throwing form of {@link Vault.ensureBox}. */
  tryEnsureBox(dna: BoxDnaInVault, opts: EditOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.ensureBox(dna, opts)) }

  /** Start the box listing's watch, as `Listing.hello` does, once: each box verb calls it first, and a call while one is under way joins it. One refused is begun again by the next call. */
  helloBoxes(): Promise<void> {
    this.#boxesHello ??= this.#helloBoxesOnce()
    return this.#boxesHello
  }

  /** End the box listing's watch, its boxes held as they are, so the next box verb starts it again. */
  goodbyeBoxes(): void {
    this.#boxListing.goodbye()
    this.#boxesHello = null
    this.#boxesGoodbyes += 1
  }

  /** The box listing's hello, for `helloBoxes`. One refused leaves no hello to join, unless a goodbye has already cleared it; one a goodbye overtook, with no hello begun since, ends the watch it started. */
  async #helloBoxesOnce(): Promise<void> {
    const goodbyesAtStart = this.#boxesGoodbyes
    try {
      await this.#boxListing.hello()
    } catch (err) {
      if (this.#boxesGoodbyes === goodbyesAtStart) { this.#boxesHello = null }
      throw err
    }
    if ((this.#boxesGoodbyes !== goodbyesAtStart) && (this.#boxesHello === null)) { this.#boxListing.goodbye() }
  }

  // Called by a field initializer, after Storable's constructor has adorned the world and tattooed the scope.
  #makeBoxListing(): BoxListing {
    const boxListing = new BoxListing({
      world:                 this,
      store:                 this.world.vaultDB.boxStore(this.scope),
      cache:                 UnkeptBoxCache,
      maxMillisSinceRefresh: this.world.boxRefreshMillis,
      onBadNews:             (news) => { this.listing.tellBadNews([news]) },
    })
    boxListing.subscribe(() => { this.settle() })
    return boxListing
  }

  /** End the box watch and evict every box, as `Box.evict` does, forgetting each whisper exposed. */
  #evictBoxes(): void {
    this.goodbyeBoxes()
    for (const box of this.#boxListing.things) { this.#boxListing.evict(box.scope) }
  }
  // --

  // == [Changing the gate]: replacePassphrase, addPasskey, revokePasskey, launchGating, sendGate, each verb with its try form

  /** Replace the passphrase and send, once the passphrase proves the gate: with `cleartexts` where given, else asking the user through a 'replace_passphrase' gating.
   * The passkey stays, and must be revoked separately if unwanted. The vaultKey does not change,
   * so a lease held stays in force. A next passphrase the same as the current one refuses
   * 'same_passphrase', and a weak one 'weak_passphrase'. A record changed elsewhere while the proof
   * ran refuses 'stale_write', storing nothing.
   */
  replacePassphrase(cleartexts?: PassphraseReplaceCleartexts): Promise<this> {
    // A passkey's answer has no place here, but a host may hand one in all the same (G2).
    return spendAnswerAfter(cleartexts, async () => {
      const { cleartexts: checked } = MSX.passphraseReplaceArgs.parse({ cleartexts })
      if (checked !== undefined) { return await this.#replacePassphraseBy(checked) }
      await this.ensureReadyToEdit()
      return await this.#launchGating('replace_passphrase', (handed) => this.#replacePassphraseBy(handed))
    })
  }

  tryReplacePassphrase(cleartexts?: PassphraseReplaceCleartexts): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrase(cleartexts)) }

  async #replacePassphraseBy(cleartexts: PassphraseReplaceCleartexts): Promise<this> {
    await this.ensureReadyToEdit()
    const ante = this.demandFullProps().gate
    return this.#sendGate(ante, await this.gate.withPassphraseReplaced(cleartexts, this.world))
  }

  /** Add a passkey and send, once the passphrase proves the gate: with `cleartexts` where given, else asking the user through an 'add_passkey' gating. The answer is spent unless the passphrase is refused as wrong (G2).
   * A vault with a passkey refuses 'bad_option', asking nothing. The vaultKey does not change, so a
   * lease held stays in force. A record changed elsewhere while the proof ran refuses
   * 'stale_write', storing nothing.
   */
  addPasskey(cleartexts?: PasskeyAddCleartexts): Promise<this> {
    return spendAnswerAfter(cleartexts, async () => {
      const { cleartexts: checked } = MSX.passkeyAddArgs.parse({ cleartexts })
      if (checked !== undefined) { return await this.#addPasskeyBy(checked) }
      await this.ensureReadyToEdit()
      this.gate.demandPasskeyAddable()
      return await this.#launchGating('add_passkey', (handed) => this.#addPasskeyBy(handed))
    })
  }

  tryAddPasskey(cleartexts?: PasskeyAddCleartexts): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskey(cleartexts)) }

  #addPasskeyBy(cleartexts: PasskeyAddCleartexts): Promise<this> {
    return spendAnswerAfter(cleartexts, async () => {
      await this.ensureReadyToEdit()
      const ante = this.demandFullProps().gate
      return await this.#sendGate(ante, await this.gate.withPasskeyAdded(cleartexts, this.world))
    })
  }

  /** Revoke the passkey and send, once the passphrase proves the gate: with `cleartexts` where given, else asking the user through a 'revoke_passkey' gating.
   * A vault without one refuses 'absent_wayin', asking nothing. Removal is not revocation of the
   * vaultKey, which does not change: a lease held stays in force. A record changed elsewhere while
   * the proof ran refuses 'stale_write', storing nothing.
   */
  revokePasskey(cleartexts?: PassphraseCleartexts): Promise<this> {
    // A passkey's answer has no place here, but a host may hand one in all the same (G2).
    return spendAnswerAfter(cleartexts, async () => {
      const { cleartexts: checked } = MSX.passkeyRevokeArgs.parse({ cleartexts })
      if (checked !== undefined) { return await this.#revokePasskeyBy(checked) }
      await this.ensureReadyToEdit()
      this.gate.demandPasskeyRevocable()
      return await this.#launchGating('revoke_passkey', (handed) => this.#revokePasskeyBy(handed))
    })
  }

  tryRevokePasskey(cleartexts?: PassphraseCleartexts): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskey(cleartexts)) }

  async #revokePasskeyBy(cleartexts: PassphraseCleartexts): Promise<this> {
    await this.ensureReadyToEdit()
    const ante = this.demandFullProps().gate
    return this.#sendGate(ante, await this.gate.withPasskeyRevoked(cleartexts, this.world))
  }

  /** Ask the user through a `gatingkind` gating of this vault, each attempt running `run`, and resolve the vault once one succeeds. A gating of the kind launched already is joined, its `run` kept. */
  async #launchGating<KindT extends GatingKind>(gatingkind: KindT, run: (cleartexts: CleartextsForGatingkind[KindT]) => Promise<unknown>): Promise<this> {
    await (this.#launches.get(gatingkind) ?? this.#launchInTurn(gatingkind, run))
    return this
  }

  /** Launch a `gatingkind` gating once the gating asking has settled, held in `#launches` until it settles. */
  #launchInTurn<KindT extends GatingKind>(gatingkind: KindT, run: (cleartexts: CleartextsForGatingkind[KindT]) => Promise<unknown>): Promise<void> {
    // `#askInTurn` awaits before anything else, so the launch is held here before its finally lets it go.
    const launch = this.#askInTurn(gatingkind, run, this.#lockSeq)
    this.#launches.set(gatingkind, launch)
    return launch
  }

  /** Hold the asking turn, `fetch` where the vault is sparse, and ask through `Gating.launch`, the gating held as `#asking` from the moment the host is handed it. A lock or let-go since the launch refuses 'declined'; an unlock finding a lease taken up while it waited asks nothing. */
  async #askInTurn<KindT extends GatingKind>(gatingkind: KindT, run: (cleartexts: CleartextsForGatingkind[KindT]) => Promise<unknown>, lockSeq: number): Promise<void> {
    await this.#askingMutex.acquire()
    try {
      // Fetched in turn: a sparse record received while it waited would leave the gating no gate to read.
      if (! this.isFull) { await this.fetch() }
      // A lock or let-go while it waited or fetched found no gating to decline: it declines this one now.
      if (this.#lockSeq !== lockSeq) { throw RefusalFuncs.lockedWhileAsking() }
      if (gatingkind === 'unlock_vault' && this.#lease?.isInForce === true) { return }
      const { requestCleartext, strengthChecker, logger } = this.world
      // `Gating.launch` hands the host its gating before it first awaits, so no lock lands between the check above and `#asking`.
      const world: GatingWorld = { strengthChecker, logger, requestCleartext: (gating) => {
        this.#asking = gating
        return requestCleartext(gating)
      } }
      await Gating.launch(gatingkind, { scope: this.scope, vault: this, world, run: async (handed) => { await run(handed); return this } })
    } finally {
      this.#asking = null
      // A lock or let-go since it launched has emptied `#launches` already, and its entry for the kind may be a launch begun after.
      if (this.#lockSeq === lockSeq) { this.#launches.delete(gatingkind) }
      this.#askingMutex.release()
    }
  }

  /** Stage `gate` over the record in hand and send it: the vault's one path to a new gate. Where the record's gate is no longer `ante`, the one proved against, it refuses 'stale_write', storing nothing. */
  #sendGate(ante: GateProps, gate: GateProps): Promise<this> {
    return this.send(new GateStaging(ante, gate))
  }
  // --

  // == [Unlocking]: isUnlocked, leaseMillis, autolockMinutes, pesterMinutes, ensureUnlocked, demandLease, takeUpLease, takeUpCachedLease, each host's verb with its try form, unlock, joinUnlocking, attemptThrough, unlockAlone, unlockByGating, unlockByProof, lookUpCached, setLease

  get isUnlocked(): boolean { return ! this.#isLocked }

  /** How long a lease granted this vault lasts: the world's `leaseMillis`, else {@link DefaultLeaseMillis}. */
  get leaseMillis(): number { return this.world.leaseMillis ?? DefaultLeaseMillis }

  /** How long a lease granted this vault lasts, in minutes, as a host's settings show it. */
  get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }

  /** How often the user is asked for the passphrase, in minutes: the world's `pesterMillis`, else {@link DefaultPesterMillis}. */
  get pesterMinutes(): number { return (this.world.pesterMillis ?? DefaultPesterMillis) / MinuteMillis }

  /** The lease in force, unlocking first where there is none: through the lease this device keeps, else the unlock in flight, else `cleartexts`, else by asking the user through an 'unlock_vault' gating. A lease held past its time locks the vault first.
   * A caller that joins an unlock in flight shares its outcome, a refusal included. Where that
   * unlock asks the user through a gating still open, the caller's cleartexts are attempted
   * through it, as the dialog's are: a correctable refusal is the caller's alone, and leaves the
   * gating open. Otherwise cleartexts it handed are spent unused (G2). Every proof is checked
   * against the gate storage holds, fetched first, so a wayin revoked elsewhere unlocks nothing.
   * Wrong cleartexts refuse
   * 'wrong_passphrase' or 'wrong_passkey', leaving unspent a passkey's answer for another passkey
   * or salt; a passkey's answer for a vault with no passkey, 'absent_wayin'; a gating the user
   * declines, or a lock or let-go ends, 'declined'; a lock or let-go that lands while it unlocks
   * otherwise, 'vault_locked'.
   */
  ensureUnlocked(cleartexts?: AttemptCleartexts): Promise<Lease> {
    return spendAnswerAfter(cleartexts, async () => {
      const { cleartexts: checked } = MSX.vaultUnlockArgs.parse({ cleartexts })
      await this.ensureTimely({})
      const held = this.#lease
      if (held?.isInForce) { return held }
      if (held !== null) { this.lock() }
      return await this.#unlock(checked)
    })
  }

  /** The lease in force, as an {@link Outcome}: the non-throwing form of {@link Vault.ensureUnlocked}. */
  tryEnsureUnlocked(cleartexts?: AttemptCleartexts): Promise<Outcome<Lease>> { return outcomeOf(() => this.ensureUnlocked(cleartexts)) }

  /** The lease the vault holds; a locked vault refuses 'vault_locked'. */
  demandLease(): Lease {
    if (this.#isLocked || this.#lease === null) { throw RefusalFuncs.needVaultUnlocked() }
    return this.#lease
  }

  /** Hold `lease` as the vault's lease, letting go any it held: the vault reads unlocked. A lease of another vault, or granted another Vault object, refuses 'bad_option'; one not in force, 'vault_locked'. */
  takeUpLease(lease: Lease): Lease {
    if (lease.vault !== this || ! consistent(MSX.vaultStamp.parse(lease), MSX.vaultStamp.parse(this))) { throw RefusalFuncs.leaseOfOtherHolder() }
    if (! lease.isInForce) { throw RefusalFuncs.leaseNotInForce() }
    return this.#setLease(lease)
  }

  /** The lease taken up, as an {@link Outcome}: the non-throwing form of {@link Vault.takeUpLease}. */
  tryTakeUpLease(lease: Lease): Promise<Outcome<Lease>> { return outcomeOf(() => this.takeUpLease(lease)) }

  /** Take up the lease this device keeps of the vault, where the vault holds none and the one cached is in force; a refused look is told as bad news. */
  takeUpCachedLease(): Promise<Lease | null> {
    if (this.#lease !== null) { return Promise.resolve(null) }
    this.#cachedLookup ??= this.#lookUpCached()
    return this.#cachedLookup
  }

  /** The cached lease taken up, or null, as an {@link Outcome}: the non-throwing form of {@link Vault.takeUpCachedLease}. */
  tryTakeUpCachedLease(): Promise<Outcome<Lease | null>> { return outcomeOf(() => this.takeUpCachedLease()) }

  async #unlock(cleartexts?: AttemptCleartexts): Promise<Lease> {
    const inFlight = this.#unlocking
    if (inFlight !== null) { return this.#joinUnlocking(inFlight, cleartexts) }
    const cached = await this.takeUpCachedLease()
    if (cached !== null) { return cached }
    // A lease taken up meanwhile, through `takeUpLease`, is the answer: the look declined the cached one for it.
    const held = this.#lease
    if (held?.isInForce) { return held }
    // An unlock begun while the look ran is joined, as one in flight before it is.
    const begun = this.#unlocking
    if (begun !== null) { return this.#joinUnlocking(begun, cleartexts) }
    this.#unlocking = this.#unlockAlone(cleartexts)
    return this.#unlocking
  }

  /** Share the outcome of the unlock `inFlight`, attempting `cleartexts` through its gating where it asks the user; else spending a passkey's answer in them at once: never tried, it is not left unspent by another's correctable refusal (G2). */
  #joinUnlocking(inFlight: Promise<Lease>, cleartexts?: AttemptCleartexts): Promise<Lease> {
    const asking = this.#asking
    if (cleartexts !== undefined && asking?.gatingkind === 'unlock_vault' && asking.isOpen) { return this.#attemptThrough(asking, cleartexts, inFlight) }
    spendAnswer(cleartexts)
    return inFlight
  }

  /** Attempt `cleartexts` through the open `gating` of the unlock `inFlight`: a refusal that leaves the gating open is this caller's, and any other outcome settles it, as `inFlight` answers. */
  async #attemptThrough(gating: Gating<'unlock_vault'>, cleartexts: AttemptCleartexts, inFlight: Promise<Lease>): Promise<Lease> {
    const attempted = await gating.tryAttempt(cleartexts)
    if (! attempted.ok && gating.isOpen) { throw attempted.err }
    return await inFlight
  }

  /** The unlock by `cleartexts`, or by a gating where none are handed, as the one in flight: `#unlocking`, cleared once it settles. A lock or let-go after it begins overtakes it. */
  async #unlockAlone(cleartexts?: AttemptCleartexts): Promise<Lease> {
    const lockSeq = this.#lockSeq
    try {
      // The await always yields first, so the finally never runs before `#unlock` has set `#unlocking`.
      return await (cleartexts === undefined ? this.#unlockByGating(lockSeq) : this.#unlockByProof(cleartexts, lockSeq))
    } finally {
      // A lock or let-go since it began has cleared it already, and `#unlocking` may be an unlock begun after.
      if (this.#lockSeq === lockSeq) { this.#unlocking = null }
    }
  }

  /** Ask the user through an 'unlock_vault' gating, each attempt unlocking through `#unlockByProof`, never `ensureUnlocked`, which would join the unlock this is. */
  async #unlockByGating(lockSeq: number): Promise<Lease> {
    await this.#launchGating('unlock_vault', (handed) => this.#unlockByProof(handed, lockSeq))
    return this.demandLease()
  }

  /** Prove `cleartexts` against the gate storage holds, fetched first, and grant a lease, unless a lock or let-go has landed since the unlock began, at `lockSeq`: then refuse 'vault_locked'.
   * A lease already put is evicted. A lock's erase, queued behind the put, removes its record; a let-go leaves it, as it leaves any.
   */
  async #unlockByProof(cleartexts: AttemptCleartexts, lockSeq: number): Promise<Lease> {
    await this.fetch()
    const proving = await this.gate.attemptProof(cleartexts, this.world)
    return this.#withLeaseDB(async () => {
      if (this.#lockSeq !== lockSeq) { throw RefusalFuncs.lockedWhileUnlocking() }
      const lease = await proving.makeLease(this, this.leaseDBFriend(), { leaseMillis: this.leaseMillis })
      if (this.#lockSeq !== lockSeq) {
        lease.evict()
        throw RefusalFuncs.lockedWhileUnlocking()
      }
      return this.#setLease(lease)
    })
  }

  async #lookUpCached(): Promise<Lease | null> {
    const lockSeq = this.#lockSeq
    try {
      // Awaited first, so `#cachedLookup` is set before the finally clears it.
      const cached = await this.#withLeaseDB(() => Lease.tryGet(this, this.leaseDBFriend()))
      if (! cached.ok) {
        this.listing.tellBadNews([cached.err])
        return null
      }
      if (cached.val === null) { return null }
      // Declined, it is evicted: its autolock would otherwise lock the vault at its own `autolock_at`.
      if (! cached.val.isInForce || this.#lease?.isInForce === true || this.#lockSeq !== lockSeq) {
        cached.val.evict()
        return null
      }
      return this.#setLease(cached.val)
    } finally {
      // As for `#unlocking`: a lock or let-go since it began has cleared it, and it may be a look begun after.
      if (this.#lockSeq === lockSeq) { this.#cachedLookup = null }
    }
  }

  /** Hold `lease` as the vault's, the vault reading unlocked, and evict the lease it displaces. */
  #setLease(lease: Lease): Lease {
    const displaced = this.#lease
    this.#lease = lease
    this.#isLocked = false
    // Let go, the displaced lease's autolock neither locks the vault nor erases this lease's record at the old `autolock_at`.
    if (displaced !== null && displaced !== lease) { displaced.evict() }
    this.settle()
    return lease
  }
  // --

  // == [The lease]: leaseDBFriend, lock, tryLock, letLeaseGo, evict, dropLease, leaseChore, withLeaseDB

  /** The deviceDB as this vault's lease reaches it: the world's lease verbs, bound to this vault's scope, so no verb takes one. */
  leaseDBFriend(): LeaseDBFriend {
    const { scope, world: { logger, deviceDB } } = this
    return {
      logger,
      tryGetLease: () => deviceDB.tryGetLease(scope),
      tryPutLease: (record) => deviceDB.tryPutLease(record),
      tryDelLease: () => deviceDB.tryDelLease(scope),
    }
  }

  /** Lock the vault, synchronously, and erase the lease this device keeps, whether or not the vault holds one: the vault reads locked before this returns, and a gating of it asking or waiting its turn is declined; letting the held lease go and the erase are queued as a chore. */
  lock(): void {
    const lease = this.#dropLease()
    const { tryDelLease } = this.leaseDBFriend()
    this.#leaseChore(async () => {
      lease?.evict()
      valOf(await tryDelLease())
    })
    this.settle()
  }

  /** The lock, as an {@link Outcome}: the non-throwing form of {@link Vault.lock}. */
  tryLock(): Promise<Outcome<void>> { return outcomeOf(() => { this.lock() }) }

  /** Let the vault's lease go, the vault reading locked, a gating of it asking or waiting its turn declined, and the lease this device keeps left for the next load: the listing's goodbye, where `lock()` erases. */
  letLeaseGo(): void {
    this.#dropLease()?.evict()
    this.settle()
  }

  /** Evict its boxes, each forgetting its exposed whisper, let the lease go, as {@link letLeaseGo} does, and make no more fetches on schedule, for a vault no listing holds any more. */
  override evict(): void {
    this.#evictBoxes()
    this.letLeaseGo()
    super.evict()
  }

  /** Read locked, decline the gating asking and every launch waiting its turn, leave the unlock and the look in flight for no later call to join, and hand back the lease held, no longer the vault's. */
  #dropLease(): Lease | null {
    this.#isLocked = true
    this.#lockSeq += 1
    const lease = this.#lease
    this.#lease = null
    this.#asking?.declineAtLock()
    this.#asking = null
    this.#launches.clear()
    this.#unlocking = null
    this.#cachedLookup = null
    return lease
  }

  /** Queue deviceDB work on the lease, never awaited by a caller: a refusal is told as bad news. */
  #leaseChore(work: () => Promise<void>): void {
    void outcomeOf(() => this.#withLeaseDB(work)).then((done) => { if (! done.ok) { this.listing.tellBadNews([done.err]) } })
  }

  /** Run `work` once the deviceDB work on the lease begun before it has landed, holding off any begun after. */
  async #withLeaseDB<ValT>(work: () => Promise<ValT>): Promise<ValT> {
    await this.#leaseMutex.acquire()
    try {
      return await work()
    } finally {
      this.#leaseMutex.release()
    }
  }
  // --

  // == [Guards]: ensureReadyToEdit, demandReadyToEdit, demandReadyToDel

  /** What an edit stages keeps the gate of the record in hand, so a vault held sparse fetches its full record first, whatever its age. */
  override async ensureReadyToEdit(opts: TimelyOpts = {}): Promise<this> {
    await super.ensureReadyToEdit(opts)
    if (! this.isFull) { await this.fetch(opts) }
    return this.demandReadyToEdit()
  }

  /** An edit needs the vault present; no lock, as its record holds no secret. */
  override demandReadyToEdit(): this { return this.demandPresent() }

  /** A vault deleted has no life left to delete; a damaged one may be deleted, as `bank.delDamagedVault` did. Not yet: the passphrase's proof the old `vault.del` took. */
  override demandReadyToDel(): this {
    if (this.am === 'x') { throw this.listing.absentRefusal(this.scope) }
    return this
  }
  // --

  // == [Required by Storable]: isFullRecord, isFullPatch, makeStaged, lifeTokPathOf, makeSnapshot

  /** A full vault record is one alive that carries its `gate`; a sparse one or a tombstone is not. */
  protected isFullRecord(fetched: VaultSparse): fetched is VaultRecord {
    return fetched.am === 'a' && 'gate' in fetched
  }

  /** Returns for a full patch of this vault, and refuses any other 'bad_option', naming the field; `edit`, so `send`, calls it first of all, before any guard. Every patch held to `vaultPatch` is full: `{}`, or the props of the vault's record, each checked, and all ignored. A scope field that names another vault refuses, naming it. The gate's own staging, from `#sendGate`, is full too. */
  protected isFullPatch(patch: unknown): asserts patch is VaultPatch {
    if (patch instanceof GateStaging) { return }
    verifyConsistent(MSX.vaultPatch.parse(patch), this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
  }

  /** `makeStagedBase`'s base, the record in hand under its next revision, its `vault_tok` kept, and its gate, but where `#sendGate` stages a new one: a host's patch's props are all ignored. A staged gate proved against another gate than the record's refuses 'stale_write', its `meta` carrying the revisions as `edit`'s own refusal does. No birthday reaches here: `demandReadyToEdit` refuses a vault deleted or damaged, whose new life is a new instance. */
  protected makeStaged(patch: VaultPatch): Promise<VaultRecord> {
    const { base } = this.makeStagedBase()
    const held = this.demandFullProps().gate
    if (! (patch instanceof GateStaging)) { return Promise.resolve({ ...base, gate: held }) }
    if (patch.ante !== held) { throw RefusalFuncs.gateMovedUnderChange({ stored_revision: MSX.revision.parse(this.central), staged_revision: MSX.revision.parse(base) }) }
    return Promise.resolve({ ...base, gate: patch.gate })
  }

  /** A vault's life is its `vault_tok`. */
  protected lifeTokPathOf({ vault_tok }: Fetched<VaultRecord, VaultSparse>): string { return vault_tok }

  /** The frozen {@link VaultSnapshot} of the vault in hand. It builds no Gate, which checks the wayins, so a wayin stored damaged leaves the snapshot whole. */
  protected makeSnapshot(): VaultSnapshot {
    const full = this.isFull
    return Object.freeze({
      ...this.scope,
      vault_tok:     this.vault_tok,
      revision_tok:  this.revision_tok,
      revision_seq:  this.revision_seq,
      registered_at: this.registered_at,
      written_at:    this.written_at,
      present:       this.isPresent,
      full,
      lockState:     this.lockState(),
      autolock_at:   this.#lease?.autolock_at ?? null,
      hasPasskey:    full ? this.demandFullProps().gate.passkey_wayin !== null : null,
      boxes:         this.#boxListing.snapshot,
      refreshedAt:   this.refreshedAt,
      trouble:       this.am === 'd' ? DamagedVaultTrouble : null,
    })
  }
  // --
}
// --
