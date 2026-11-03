import { verifyConsistent } from '../checks/validator'
import type { CipherCtxRecord } from '../crypto'
import { VaultError } from '../errors'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import { reportToPlatform } from '../report-error'
import type { Clock } from '../shapes/bank-opts'
import type { Boxscope, VaultScope } from '../shapes/scopes'
import * as VS from '../storage/vault-db-shapes'
import { type Box, type BoxPut, noWhisperToKeep } from './box'
import type { BoxListing, BoxWorld } from './box-listing'
import { Gate } from './gate'
import { type ProvingsForGatingkind, Gating } from './gating'
import { Lease } from './lease'
import type { Fetched, FetchOpts, GateProps, LeaseFriend, LockState, SealedWhisper, SendOpts, TimelyOpts, VaultRecord, VaultSparse } from './models-shapes'
import * as MSX from './models-shapes'
import type { Proving } from './proving'
import { Storable } from './storable'
import type { VaultListing, VaultWorld } from './vault-listing'

// == [Record forms]: DefaultLeaseMillis, VaultSnapshot

/** How long a lease lasts where the world names no `leaseMillis`: fourteen days. */
export const DefaultLeaseMillis = 14 * 24 * 60 * 60_000

export type VaultSnapshot = VaultScope & Readonly<{
  vault_tok:     string
  revision_tok:  string
  revision_seq:  number
  registered_at: number
  written_at:    number
  present:       boolean
  lockState:     LockState
}>
// --

// == [Vault]

/** A vault as this device holds it: a storable that ducks as its record, and the world its boxes live in.
 * Its `vault_tok` is the life of the vault in its scope, fixed at birth: a birth's is minted
 * by the listing, a received record's is its own, and a record under another `vault_tok` throws
 * 'unexpected_error'. Its record carries its gate, the wayins, and nothing else stores them. Its
 * guards take no lock: its record holds no secret. A vault deleted is not sent back to life, as a
 * box is: a new life is a new `vault_tok`, so a new instance, created by the listing.
 */
export class Vault extends Storable<VaultScope, VaultRecord, VaultSparse, VaultSnapshot> implements BoxWorld {
  /** The scope, tattooed on by Storable's constructor. */
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly world:      VaultWorld
  declare readonly listing:    VaultListing

  /** The lease this device holds, and null is what locked means. */
  #lease: Lease | null = null

  #friend: LeaseFriend | null = null

  #boxListing: BoxListing | null = null

  #gate: { props: GateProps, gate: Gate } | null = null

  /** Set once a `hello` has listed the boxes. */
  #isGreeted = false

  // == [Props, as the record has them]: fmt

  get fmt(): number { return this.central.fmt }
  // --

  // == [The world of its boxes]: clock, lockState, isLocked, ensureTimely, takeWorld

  get clock(): Clock { return this.world.clock }

  lockState(): LockState { return this.#lease === null ? 'locked' : 'unlocked' }

  /** The vault's own lock, not its world's: the bank has none. */
  override get isLocked(): boolean { return this.lockState() === 'locked' }

  /** This vault, refreshed within `maxMillis`, by default its horizon: as it stands where it is recent, otherwise fetched. A vault found gone refuses 'vault_gone', and a row found damaged 'damaged_record'. */
  async ensureTimely(maxMillis?: number): Promise<this> {
    await this.hydrate({ maxMillisSinceRefresh: maxMillis })
    return this.demandPresent()
  }

  /** The vault row a box's answer carries, received whole, so a gate moved elsewhere arrives with it. */
  takeWorld(world: unknown): void {
    const row = VS.vaultRow.parse(world)
    if (row.vault_tok === this.vault_tok) { this.receive(row) }
  }
  // --

  // == [The gate]: fullRecord, gate

  /** The full record in hand, what a gate change spreads into its params. A vault held sparse, or a tombstone, refuses 'bad_option': hydrate first. */
  get fullRecord(): VaultRecord { return this.demandFullProps() }

  // Made on first read, not at settle: the base constructor settles before this class's fields exist.
  /** The Gate of the record in hand, the same while the record's `gate` is the same object, so a record received remakes it. A vault held sparse, or a tombstone, has none in hand and refuses 'bad_option': hydrate first. */
  get gate(): Gate {
    const full = this.demandFullProps()
    if (this.#gate?.props !== full.gate) { this.#gate = { props: full.gate, gate: new Gate(full, full.gate) } }
    return this.#gate.gate
  }
  // --

  // == [Changing the gate]: replacePassphrase, addPasskey, revokePasskey, delVault, del, each with its try form, landGate

  /** Replace the passphrase through a replace_passphrase gating, answering as {@link Gating.launch}. The passkey stays. A lease held is renewed under the new epoch, unless a lock crossed it, and no other device is locked. A record moved since the attempt read it refuses 'stale_write', storing nothing. */
  async replacePassphrase(): Promise<this> {
    await this.ensureTimely()
    await Gating.launch('replace_passphrase', { listing: this.listing, scope: this.scope, vault: this, run: (provings) => this.#runReplacePassphrase(provings) })
    return this
  }

  tryReplacePassphrase(): Promise<Outcome<this>> { return outcomeOf(() => this.replacePassphrase()) }

  async #runReplacePassphrase({ ante, anteProving, nextProving }: ProvingsForGatingkind['replace_passphrase']): Promise<this> {
    const nextWayin = await nextProving.buildWayin(anteProving)
    return this.#landGate(anteProving, () => this.listing.replacePassphrase({ ...ante, gate: { passphrase_wayin: MSX.passphraseWayinRecord.parse(nextWayin.pickle()) } }))
  }

  /** Add a passkey through an add_passkey gating, as {@link replacePassphrase} does. A passkey held refuses 'bad_option', nobody asked; one added since the ask refuses 'camped' or 'stale_write'. */
  async addPasskey(): Promise<this> {
    await this.ensureTimely(MSX.Promptly)
    this.gate.demandPasskeyAddable()
    await Gating.launch('add_passkey', { listing: this.listing, scope: this.scope, vault: this, run: (provings) => this.#runAddPasskey(provings) })
    return this
  }

  tryAddPasskey(): Promise<Outcome<this>> { return outcomeOf(() => this.addPasskey()) }

  async #runAddPasskey({ ante, proved, passkeyProving }: ProvingsForGatingkind['add_passkey']): Promise<this> {
    const passkeyWayin = await passkeyProving.buildWayin(proved)
    return this.#landGate(proved, () => this.listing.addPasskey({ ...ante, gate: { passkey_wayin: MSX.passkeyWayinRecord.parse(passkeyWayin.pickle()) } }))
  }

  /** Revoke the passkey through a revoke_passkey gating, as {@link replacePassphrase} does. With none held it answers at once, nobody asked. The vaultKey does not change: a device that has it keeps it to its lock. */
  async revokePasskey(): Promise<this> {
    await this.ensureTimely(MSX.Promptly)
    if (this.gate.pkWayin === null) { return this }
    await Gating.launch('revoke_passkey', { listing: this.listing, scope: this.scope, vault: this, run: ({ ante, proved }) => this.#landGate(proved, () => this.listing.revokePasskey({ ...ante, gate: { passkey_wayin: null } })) })
    return this
  }

  tryRevokePasskey(): Promise<Outcome<this>> { return outcomeOf(() => this.revokePasskey()) }

  /** The commit, then a lease under the epoch it landed, whatever record has arrived since. The old lease stays in force for the moments between, safely, as the vaultKey did not change. */
  async #landGate(proved: Proving, commit: () => Promise<VS.VaultRecord>): Promise<this> {
    const heldLease = this.#lease
    const stored = await commit()
    await this.#renewLease(proved, stored.gate.gate_epoch, heldLease)
    return this
  }

  /** Delete this vault through a del_vault gating, answering as {@link Gating.launch}: the vault locked, a tombstone stored, its boxes gone from the vaultDB, nothing of it on this device, and the Vault staying in its slot, tombstoned. A lock does not stop it. A record moved since the attempt read it refuses 'stale_write', the vault left locked. */
  async delVault(): Promise<this> {
    await this.ensureTimely()
    await Gating.launch('del_vault', { listing: this.listing, scope: this.scope, vault: this, run: ({ ante }) => this.#runDelVault(ante) })
    return this
  }

  tryDelVault(): Promise<Outcome<this>> { return outcomeOf(() => this.delVault()) }

  /** The lock first, as it is synchronous and safe: no box opens under a lease while the tombstone goes out. The tombstone's answer, delivered, vacates the boxes. */
  async #runDelVault(ante: VaultRecord): Promise<this> {
    this.lock()
    await this.listing.del(ante)
    return this
  }

  /** As {@link delVault}: a vault's delete takes the passphrase's proof, so the base's has no way past it. */
  override del(): Promise<this> { return this.delVault() }
  // --

  // == [Unlocking]: isUnlocked, ensureUnlocked, tryEnsureUnlocked, unlockByProof, attachCachedLease

  get isUnlocked(): boolean { return this.#lease !== null }

  /** This vault, unlocked: as it stands, else by the lease this device has cached, else by asking the user through an unlock_vault gating, which answers as {@link Gating.launch}. With no dialog in the world, refuses 'vault_locked'. A refused look at the cache is told as bad news, and asks. */
  async ensureUnlocked(): Promise<this> {
    await this.ensureTimely()
    if (this.isUnlocked) { return this }
    if (! this.isFull) { await this.fetch() }
    if (await this.#attachCachedLease()) { return this }
    if (this.world.requestCleartext === undefined) { throw noProofToUnlock() }
    await Gating.launch('unlock_vault', { listing: this.listing, scope: this.scope, vault: this, run: ({ proved }) => this.#unlockByProof(proved) })
    return this
  }

  tryEnsureUnlocked(): Promise<Outcome<this>> { return outcomeOf(() => this.ensureUnlocked()) }

  /** Past the enter key: a lock crossing this is answered by the next `lock()`, as the proof says this user may have the vault unlocked. */
  async #unlockByProof(proved: Proving): Promise<this> {
    const lease = await proved.buildLease(this.leaseFriend())
    await lease.attach()
    return this
  }

  /** True where the lease this device has cached for this gate is now attached. */
  async #attachCachedLease(): Promise<boolean> {
    const peeked = await Lease.tryPeek(this.leaseFriend(), this.gate.gate_epoch)
    if (! peeked.ok) {
      this.listing.tellBadNews([peeked.err])
      return false
    }
    if (peeked.val === null) { return false }
    await peeked.val.attach()
    return true
  }
  // --

  // == [The lease]: leaseFriend, demandReadyToAttach, attachLease, renewLease, dropLease, vacateLease, vacateUnattached, panic, lock

  /** All a lease or a proving hears of this vault: the one friend for its life, which is how an attach knows a lease made for this very instance. */
  leaseFriend(): LeaseFriend {
    this.#friend ??= this.#makeFriend()
    return this.#friend
  }

  #makeFriend(): LeaseFriend {
    const { world: { clock, logger, deviceDB } } = this
    const stamp = MSX.vaultStamp.parse(this)
    const asked = { ...this.scope, vault_tok: this.vault_tok }
    return {
      ...stamp,
      clock,
      logger,
      lock:            () => { this.lock() },
      attachLease:     (lease) => this.#attachLease(lease),
      peekLease:       () => deviceDB.peek(asked),
      tryCacheLease:   (record) => deviceDB.tryCache(record),
      tryUncacheLease: () => deviceDB.tryVacate(asked),
    }
  }

  /** An attach needs the vault enabled and present. */
  demandReadyToAttach(): this { return this.demandEnabled().demandPresent() }

  /** Hold `lease` as the vault's, dropping any it displaces, and cache it. A lease of another holder refuses 'bad_option', left alone, as its row is another's; one out of force refuses 'vault_locked'; on a vault not ready, the lease is vacated and the refusal thrown. A refused cache costs the next session a proof, not this one its lease, so it is told as bad news. */
  async #attachLease(lease: Lease): Promise<void> {
    if (lease.friend !== this.leaseFriend()) { throw leaseOfOtherHolder() }
    if (lease.isForgotten) { throw leaseNotInForce() }
    try {
      this.demandReadyToAttach()
    } catch (err) {
      await this.#vacateUnattached(lease)
      throw err
    }
    // Called before the settle, as a listener may call `lock()`, whose erase must land after this put.
    const caching = lease.tryCache()
    const displaced = this.#lease
    this.#lease = lease
    if (displaced !== null && displaced !== lease) { displaced.evict() }
    this.settle()
    this.#boxListing?.settleThings()
    const cached = await caching
    if (! cached.ok) { this.listing.tellBadNews([cached.err]) }
  }

  /** Attach a new lease under `gate_epoch`, where `heldLease` is still in force: a vault locked at the start stays locked, and a lock crossing the change wins, the new lease vacated. */
  async #renewLease(proved: Proving, gate_epoch: number, heldLease: Lease | null): Promise<void> {
    if (heldLease === null) { return }
    const lease = await proved.buildLease(this.leaseFriend(), gate_epoch)
    if (heldLease.isForgotten) {
      await this.#vacateUnattached(lease)
      return
    }
    await lease.attach()
  }

  #dropLease(): void {
    this.#lease?.evict()
    this.#lease = null
  }

  /** Drop any lease held and erase the row cached. The lease goes first, so an erase that throws leaves none; the erase is called before the first await, so it lands in call order against any cache. Refused, `onRefused` hears it, by default a panic. */
  async #vacateLease(onRefused: (refusal: VaultError) => unknown = (refusal) => this.#panic(refusal)): Promise<void> {
    this.#dropLease()
    const vacating = outcomeOf(async () => { valOf(await this.leaseFriend().tryUncacheLease()) })
    this.settle()
    const vacated = await vacating
    if (! vacated.ok) { await onRefused(vacated.err) }
  }

  /** Drop a lease this vault did not attach, and its row. */
  async #vacateUnattached(lease: Lease): Promise<void> {
    const vacated = await lease.tryVacate()
    if (! vacated.ok) { this.listing.tellBadNews([vacated.err]) }
  }

  /** Tell of a cached lease that survived a lock: the host's `onPanic` hears it, and a rejection goes no further than the platform; with none, the refusal goes to the platform and this vault is vacated. */
  async #panic(refusal: VaultError): Promise<void> {
    const { onPanic } = this.world
    if (onPanic === undefined) {
      reportToPlatform(refusal)
      this.vacate()
      return
    }
    try {
      await onPanic(refusal)
    } catch (err) {
      reportToPlatform(err)
    }
  }

  /** Lock the vault: it reads locked before this returns, its boxes with it, and the row this device has cached is erased. A refused erase is a panic, not a throw. On a vault discarded, a no-op. */
  override lock(): this {
    if (this.isDisabled) { return this }
    void this.#vacateLease()
    this.#boxListing?.lock()
    this.listing.declineGatingAtLock(this)
    return this
  }
  // --

  // == [Seal verbs]: sealStampedString, unsealStampedString, demandLease

  /** `whisperText` sealed under a fresh boxKey under this vault's key, both bound to `stamp`. A locked vault refuses 'vault_locked', as does a lock crossing it; a lease that will not open locks the vault and refuses 'damaged_lease'. */
  async sealStampedString(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    MSX.leaseSealArgs.parse({ whisperText, stamp })
    return this.#demandLease().sealWith(whisperText, stamp)
  }

  /** The text `sealed` holds, bound to `stamp`. It refuses as `sealStampedString` does, and 'damaged_box' where `sealed` will not open. */
  async unsealStampedString(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    MSX.leaseUnsealArgs.parse({ sealed, stamp })
    return this.#demandLease().unsealWith(sealed, stamp)
  }

  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw unlockFirst() }
    return this.#lease
  }
  // --

  // == [Box verbs]: hello, getBox, fetchBox, putBox, delBox, each with its try form, demandReadyForBoxes, ensureReadyForBoxes

  /** Fetch this vault with what its get lists: a timely vault, its boxes held sparse, its damaged rows set aside, and the box listing's watch started. The first box call runs it; a host may run it sooner. A vault found gone refuses 'vault_gone'. */
  async hello(): Promise<this> {
    this.demandEnabled()
    const listed = await this.listing.fetchListed(this)
    this.demandPresent()
    await this.boxListing.hello(listed)
    this.#isGreeted = true
    return this
  }

  tryHello(): Promise<Outcome<this>> { return outcomeOf(() => this.hello()) }

  /** The timely full box under `boxlabel`. Where none is present, `opts.ifAbsent` says: 'fail', the default, refuses 'absent_box'; 'nil' resolves null. A damaged row refuses 'damaged_record'. A vault gone refuses 'vault_gone', and a vault locked, at the start or by the end, 'vault_locked'. */
  async getBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> {
    const { ifAbsent = 'fail', ...timely } = MSX.fetchOpts.parse(opts)
    const scope = this.#boxscopeOf(boxlabel)
    const boxes = await this.#ensureReadyForBoxes()
    const box = await (boxes.at(scope)?.hydrate(timely) ?? boxes.fetch(scope, { ifAbsent: 'nil', maxWorldMillis: timely.maxWorldMillis }))
    this.demandReadyForBoxes()
    if (box?.isPresent === true) { return box }
    if (ifAbsent === 'nil') { return null }
    throw boxes.absentRefusal(scope)
  }

  tryGetBox(boxlabel: string, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.getBox(boxlabel, opts)) }

  /** As {@link getBox}, the box's record fetched whatever its age. */
  fetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Box | null> { return this.getBox(boxlabel, { ...opts, maxMillisSinceRefresh: 0 }) }

  tryFetchBox(boxlabel: string, opts: FetchOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.fetchBox(boxlabel, opts)) }

  /** Seal and store the box `patch` names. With a box listed, a tombstone included, this is its `send`. With none, it is a birth over no record, its sidecar `{}` where left out; a whisper left out fetches first, and refuses 'no_whisper' only where no box is stored. Over a live record, `opts.ifPresent` says, as `send` has it: `get` resolves the box as stored, `patch` discarded. Refuses as `send` does; a vault gone refuses 'vault_gone'. */
  async putBox(patch: BoxPut, opts: SendOpts = {}): Promise<Box> {
    const { whisper, sidecar, ...named } = MSX.boxPut.parse(patch, { advice: Phrases.BoxPatchAdvice })
    const { ifPresent, ...timely } = MSX.sendOpts.parse(opts)
    verifyConsistent(named, this.scope, { kind: 'bad_option', message: Phrases.patchOfOtherScope })
    const scope = this.#boxscopeOf(named.boxlabel)
    const boxes = await this.#ensureReadyForBoxes()
    const held = boxes.at(scope) ?? ((whisper === undefined) ? await boxes.fetch(scope, { ifAbsent: 'nil', maxWorldMillis: timely.maxWorldMillis }) : null)
    if (held !== null) { return held.send({ whisper, sidecar }, opts) }
    if (whisper === undefined) { throw noWhisperToKeep() }
    await this.ensureTimely(timely.maxWorldMillis)
    return boxes.create({ ...scope, whisper, sidecar: sidecar ?? {} }, { ifPresent })
  }

  tryPutBox(patch: BoxPut, opts: SendOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.putBox(patch, opts)) }

  /** Delete the box under `boxlabel`, a damaged row set aside there included: the box in its tombstone, or null for nothing stored. Refuses 'stale_write' where the row moved, delivered first; a vault gone refuses 'vault_gone', and a vault locked 'vault_locked'. */
  async delBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Box | null> {
    const timely = MSX.timelyOpts.parse(opts)
    const scope = this.#boxscopeOf(boxlabel)
    const boxes = await this.#ensureReadyForBoxes()
    const held = boxes.at(scope)
    if (held !== null) { return held.del(timely) }
    await this.ensureTimely(timely.maxWorldMillis)
    return boxes.del(boxes.damagedAt(scope) ?? VS.sentinelBoxOf(scope, this.vault_tok))
  }

  tryDelBox(boxlabel: string, opts: TimelyOpts = {}): Promise<Outcome<Box | null>> { return outcomeOf(() => this.delBox(boxlabel, opts)) }

  /** A box verb needs the vault present and unlocked. */
  demandReadyForBoxes(): this { return this.demandPresent().demandUnlocked() }

  /** The box listing, this vault having said hello, refusing as `demandReadyForBoxes` does at each end. */
  async #ensureReadyForBoxes(): Promise<BoxListing> {
    this.demandReadyForBoxes()
    if (! this.#isGreeted) {
      await this.hello()
      this.demandReadyForBoxes()
    }
    return this.boxListing
  }

  #boxscopeOf(boxlabel: string): Boxscope { return { ...this.scope, boxlabel: MSX.boxlabelArg.parse(boxlabel) } }
  // --

  // == [Children and discards]: boxListing, adopt, sweepContents, vacateContents

  /** The listing of this vault's boxes, made once, on first asking. A vault gone refuses 'vault_gone'. */
  get boxListing(): BoxListing {
    this.demandPresent()
    this.#boxListing ??= this.listing.boxListingOf(this)
    return this.#boxListing
  }

  /** A tombstone taken in is a delete's end state, here or elsewhere: locked, the row cached erased, the boxes vacated, and the vault staying in its slot. A refused erase is bad news, and the tombstone stands. */
  protected override adopt(central: Fetched<VaultRecord, VaultSparse>): void {
    super.adopt(central)
    if (this.isPresent) { return }
    void this.#vacateLease((refusal) => { this.listing.tellBadNews([refusal]) })
    this.#boxListing?.vacate()
  }

  /** The lease dropped, the row cached left for the next session, and the boxes swept. */
  protected override sweepContents(): void {
    this.#dropLease()
    this.#boxListing?.sweep()
    this.listing.declineGatingAtDiscard(this)
  }

  /** Locked, the row cached erased, and the boxes vacated. */
  protected override vacateContents(): void {
    void this.#vacateLease()
    this.#boxListing?.vacate()
    this.listing.declineGatingAtDiscard(this)
  }
  // --

  // == [Required by Storable]: isFullRecord, lifeTokPathOf, makeSnapshot

  /** A full vault record is one alive that carries its `gate`; a sparse one or a tombstone is not. */
  protected isFullRecord(fetched: VaultSparse): fetched is VaultRecord {
    return fetched.am === 'a' && 'gate' in fetched
  }

  /** A vault's life is its `vault_tok`. */
  protected lifeTokPathOf({ vault_tok }: Fetched<VaultRecord, VaultSparse>): string { return vault_tok }

  protected makeSnapshot(): VaultSnapshot {
    return Object.freeze({
      ...this.scope,
      vault_tok:     this.vault_tok,
      revision_tok:  this.revision_tok,
      revision_seq:  this.revision_seq,
      registered_at: this.registered_at,
      written_at:    this.written_at,
      present:       this.isPresent,
      lockState:     this.lockState(),
    })
  }
  // --
}
// --

// == [Refusals]: unlockFirst, noProofToUnlock, leaseOfOtherHolder, leaseNotInForce

const unlockFirst = (): VaultError => new VaultError('vault_locked', Phrases.UnlockFirst)

const noProofToUnlock = (): VaultError => new VaultError('vault_locked', Phrases.NoProofToUnlock)

const leaseOfOtherHolder = (): VaultError => new VaultError('bad_option', Phrases.LeaseOfOtherHolder)

const leaseNotInForce = (): VaultError => new VaultError('vault_locked', Phrases.LeaseNotInForce)
// --
