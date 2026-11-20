import { Clock, Crypto, Errors, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { type QueryCacheOpts, MinderChecks } from '../shapes/shapes-minder'
import { Thing } from './thing'
import { BaseBox } from './base-box'
import { Device } from './device'
import { Gate } from './gate'
import { Gating, addPasskey, birthBank, replacePassphrase, revokePasskey, unlockBank } from './gating'
import type { Lease } from './lease'
import type { Proving } from './proving'
import type { BankAskDraft, BankDna, BankMakeRecord, BankOpts, BirthOpts, BoxUnsealed, SealedBoxAsk } from '../shapes/shapes-bankish'
import type { BoxCleartexts, BoxPublicProps, BoxTombstonePublicProps, LiveOf, LivePublicPropsOf, Sealable, ShellOf, TombstoneOf } from '../shapes/shapes-sealers'
import { type BankScope, type BankStamp, type GateStamp, StampChecks } from '../shapes/shapes-stamps'
import { type DeviceTok, Labelpath, Lifeseq } from '../shapes/primitives'
import { type BankRecord, type BoxRecord, type GateRecord, type Modelkind, type ThingRecord, Shell, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks } from '../shapes/shapes-thingkinds'
import { type DelAskDraft, type GetAsk, type ListAsk, type PutAskDraft, type Track, type WriteAsk, delAskOf, getAskOf, listAskOf, putAskOf } from '../shapes/shapes-asks'
import type { VaultDB } from '../storage/vault-db'
import * as Throwers from '../refusals/throwers'

/** The signed-in user's bank on this device: its main gate, its root box, and its lease while unlocked.
 * Boxes are sealed and unsealed under its private lease, and stored in its vaultDB.
 */
export class Bank extends Thing<BankRecord, BankScope, BankStamp> implements BankStamp {
  // == [Props]: #device, #vaultDB, #queryCacheOpts, #maingate, #rootBox, #lease, #endCause

  readonly #device:   Device
  readonly #vaultDB:  VaultDB
  readonly #queryCacheOpts: Readonly<QueryCacheOpts>

  // Replaced where a gate change lands: by the gate it wrote.
  /** The main gate, as this bank last wrote or was made with it. */
  #maingate: Gate

  // Set once more, where the bank's birth lands: from the shell to the root box stored.
  /** The root box: its shell until the bank is born, then its stored record. */
  #rootBox: LiveOf<BoxRecord> | ShellOf<BoxRecord>

  /** The attached lease, null while locked. */
  #lease: Lease | null = null

  /** Why a sweep disabled the bank, or null until then. */
  #endCause: Errors.VaultError | null = null
  // --

  // == [Getters]: device, device_tok, vaultDB, scope, stamp, maingate, rootBox, track, queryCacheOpts

  /** The device this bank is on. */
  get device(): Device { return this.#device }

  /** This device's token, recorded in each wayin the bank builds. */
  get device_tok(): DeviceTok { return this.#device.device_tok }

  /** Where this bank's Things are stored. */
  get vaultDB(): VaultDB { return this.#vaultDB }

  /** This bank's scope: its user and its `banklabel`. */
  get scope(): BankScope { return StampChecks.bankScope.parse(this) }

  /** This bank's {@link BankStamp}, which every ctx under it binds first. */
  get stamp(): BankStamp { return BankChecks.stamp.parse(this) }

  /** The bank's main gate: the wayins a user unlocks with. */
  get maingate(): Gate { return this.#maingate }

  /** The root box: its shell until the bank is born, then its stored record. Every box of this bank is under it. */
  get rootBox(): LiveOf<BoxRecord> | ShellOf<BoxRecord> { return this.#rootBox }

  /** The revseq and lifepath this object holds of the bank, its main gate and its root box, which every ask it makes tracks. */
  get track(): Track {
    return { bank: trackPairOf(this), [Labelpath.MainGate]: trackPairOf(this.#maingate), [Labelpath.RootBox]: trackPairOf(this.#rootBox) }
  }

  /** The defaults this bank's minders set on their TanStack Query cache entries. */
  get queryCacheOpts(): Readonly<QueryCacheOpts> { return this.#queryCacheOpts }
  // --

  // == [Construction]: make, constructor, mintStamps, makeRecord

  /** Make the bank of `record`, with its main gate and root box, on `opts.device`, keeping its boxes in `opts.vaultDB`. */
  static make(record: BankMakeRecord, opts: BankOpts): Bank { return new Bank(record, opts) }

  private constructor(record: BankMakeRecord, opts: BankOpts) {
    const { record: { maingate, rootBox, ...rest }, opts: { device, vaultDB, queryCacheOpts } } = Checks.bankMakeArgs.parse({ record, opts })
    const bankRecord = BankChecks.record.parse(rest)
    Validator.checkedConsistent(StampChecks.bankScope.parse(bankRecord), device.scope, { kind: 'record_conflict' })
    Validator.checkedConsistent(rootBox, { ...StampChecks.bankScope.parse(bankRecord), labelpath: 'box' }, { kind: 'record_conflict' })
    super(bankRecord)
    this.#device = device
    this.#vaultDB = vaultDB
    this.#queryCacheOpts = Object.freeze(queryCacheOpts)
    this.#rootBox = Object.freeze(rootBox)
    this.#maingate = Gate.make(maingate, { bank: this })
    Object.freeze(this)
  }

  /** Fresh stamps for a new bank of `scope` and its main gate, both in their first life. Mint one pair per attempt to birth a bank. */
  static mintStamps(scope: BankScope): { bankStamp: BankStamp, gateStamp: GateStamp } {
    const { userid, banklabel } = StampChecks.bankScope.parse(scope)
    const born_at = Clock.nowMillis()
    return {
      bankStamp: BankChecks.stamp.parse({ userid, banklabel, lifeseq: Lifeseq.ofLifenum(0), born_at }),
      gateStamp: GateChecks.stamp.parse({ userid, banklabel, labelpath: 'gate', lifeseq: Lifeseq.ofLifenum(0), born_at }),
    }
  }

  /** The first record of a new bank, made from `dna`, with its main gate and its root box's shell. The birth seals the root box over the shell. */
  static makeRecord(dna: BankDna): BankMakeRecord {
    const { userid, banklabel, lifeseq, born_at } = BankChecks.stamp.parse(dna)
    const bank = BankChecks.record.parse({
      userid, banklabel, labelpath: 'bank', label: 'bank', fmt: ThingFormat, revtok: Crypto.randomId(), revseq: 0, am: 'a', born_at, written_at: born_at, lifeseq, lifepath: lifeseq,
    })
    const rootBox = BoxChecks.liveOrShell.parse(Shell.of({ userid, banklabel, labelpath: Labelpath.RootBox }))
    return { ...bank, maingate: Gate.makeRecord(dna.maingate), rootBox }
  }
  // --

  // == [Ask builders]: makeGetAsk, makeListAsk, makePutAsk, makeDelAsk, tellBadNews
  // Each fills in this bank's scope and its `track`, and the modelkind and default flags of `getAskOf` and the rest. The
  // track is this object's, which may be stale: the answer's `tracked` says so. Nothing is checked here: the verb does that.

  /** The get ask for the Thing at `ask.labelpath` in this bank. */
  makeGetAsk(ask: BankAskDraft): GetAsk { return getAskOf({ ...ask, ...this.scope, track: this.track }) }

  /** The list ask for the children of the Thing at `ask.labelpath` in this bank. */
  makeListAsk(ask: BankAskDraft): ListAsk { return listAskOf({ ...ask, ...this.scope, track: this.track }) }

  /** The put ask writing `ask.record` over `ask.cited`, in this bank. */
  makePutAsk<RecordT extends ThingRecord>(ask: Omit<PutAskDraft<RecordT>, 'track'>): WriteAsk<RecordT> {
    return { ...putAskOf<RecordT>({ ...ask, track: this.track }), ...this.scope }
  }

  /** The del ask writing the tombstone `ask.record` over `ask.cited`, in this bank. */
  makeDelAsk<RecordT extends ThingRecord>(ask: Omit<DelAskDraft<RecordT>, 'track'>): WriteAsk<RecordT> {
    return { ...delAskOf<RecordT>({ ...ask, track: this.track }), ...this.scope }
  }

  /** Tell the device's `onBadNews` of failures no caller is waiting on ({@link Device.tellBadNews}). Never throws. */
  tellBadNews(badnews: readonly unknown[]): void { this.#device.tellBadNews(badnews) }
  // --

  // == [Methods]: put

  /** Write `ask.record`, this bank's next revision, over `ask.cited`. Resolves the bank's Thing the store reports writing. This Bank object is not updated. */
  async put(ask: PutAskDraft<BankRecord>): Promise<BankRecord> {
    this.demandEnabled()
    const answer = await this.#vaultDB.tryWriteThing({ ...this.makePutAsk(ask), labelpath: 'bank', modelkind: 'bank' })
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the bank's, which the vaultDB checks what it answers against.
    return answer.val as BankRecord
  }
  // --

  // == [Prompts]: launchBirthBankPrompt, launchUnlockBankPrompt, launchReplacePassphrasePrompt, launchAddPasskeyPrompt, launchRevokePasskeyPrompt
  // Each hands its gating's attempt a friend of this bank's private verbs: no public method accepts a proving (G9).

  /** Ask the user for a new passphrase and optional passkey, and birth the bank of `device`'s scope with them. Resolves the bank, unlocked.
   * Call it only where no bank is stored: over one, the attempt refuses `gate_made_elsewhere`.
   */
  static async launchBirthBankPrompt(device: Device): Promise<Bank> {
    const friend = {
      birth: (record: BankMakeRecord, proving: Proving) => Bank.#birth(record, { device, vaultDB: device.vaultDB, proving }),
    }
    const gating = Gating.make({ gatingkind: 'birth_bank' }, {
      device, bank: null, askUser: device.askUser, attempt: (cleartexts) => birthBank(device, cleartexts, friend),
    })
    return gating.launch()
  }

  /** Ask the user for the passphrase or the passkey, and unlock this bank with it. */
  async launchUnlockBankPrompt(): Promise<this> {
    this.demandEnabled()
    const friend = {
      unlockByProving: (proved: Proving) => this.#unlockByProving(proved),
    }
    const gating = Gating.make({ gatingkind: 'unlock_bank' }, {
      device: this.#device, bank: this, askUser: this.#device.askUser, attempt: (cleartexts) => unlockBank(this, cleartexts, friend),
    })
    await gating.launch()
    return this
  }

  /** Ask the user for the current passphrase and a new one, and replace the passphrase. Leaves the bank unlocked.
   * The passkey stays, and the bankKey does not change.
   */
  async launchReplacePassphrasePrompt(): Promise<this> {
    this.demandEnabled()
    const friend = {
      unlockByProving: (proved: Proving) => this.#unlockByProving(proved),
      putGate:         (ask: PutAskDraft<GateRecord>) => this.#putGate(ask),
    }
    const gating = Gating.make({ gatingkind: 'replace_passphrase' }, {
      device: this.#device, bank: this, askUser: this.#device.askUser, attempt: (cleartexts) => replacePassphrase(this, cleartexts, friend),
    })
    await gating.launch()
    return this
  }

  /** Ask the user for the passphrase and a new passkey, and add the passkey. Leaves the bank unlocked.
   * A gate has one passkey at most: this refuses, asking nobody, while it has one.
   */
  async launchAddPasskeyPrompt(): Promise<this> {
    this.demandEnabled()
    this.#maingate.demandPasskeyAddable()
    const friend = {
      unlockByProving: (proved: Proving) => this.#unlockByProving(proved),
      putGate:         (ask: PutAskDraft<GateRecord>) => this.#putGate(ask),
    }
    const gating = Gating.make({ gatingkind: 'add_passkey' }, {
      device: this.#device, bank: this, askUser: this.#device.askUser, attempt: (cleartexts) => addPasskey(this, cleartexts, friend),
    })
    await gating.launch()
    return this
  }

  /** Ask the user for the passphrase, and revoke the passkey. Leaves the bank unlocked.
   * With no passkey, it returns at once and asks nobody. The bankKey does not change.
   */
  async launchRevokePasskeyPrompt(): Promise<this> {
    this.demandEnabled()
    if (this.#maingate.passkey0 === null) { return this }
    const friend = {
      unlockByProving: (proved: Proving) => this.#unlockByProving(proved),
      putGate:         (ask: PutAskDraft<GateRecord>) => this.#putGate(ask),
    }
    const gating = Gating.make({ gatingkind: 'revoke_passkey' }, {
      device: this.#device, bank: this, askUser: this.#device.askUser, attempt: (cleartexts) => revokePasskey(this, cleartexts, friend),
    })
    await gating.launch()
    return this
  }
  // --

  // == [The gatings' private verbs]: birth, unlockByProving, putGate

  /** Write a new bank of `record`, with its main gate and its root box sealed under a lease `opts.proving` builds, and resolve it unlocked under that lease.
   * Refuses `gate_made_elsewhere` if another bank is already stored at its scope.
   */
  static async #birth(record: BankMakeRecord, opts: BirthOpts): Promise<Bank> {
    const { proving, ...bankOpts } = opts
    const bank   = this.make(record, bankOpts)
    bank.demandEnabled()
    const lease  = await proving.buildLease(bank, bank.#maingate)
    const root   = await lease.seal(BaseBox, bank.#rootBox, { sidecar: {} }, { whisper: {} })
    //
    const answer = await bank.#vaultDB.tryBirthBank({ ...bank.scope, op: 'birth', bank: bank.pickle(), gate: bank.#maingate.pickle(), root })
    if (! answer.ok) { lease.evict(); throw answer.err }
    // The user must hear that their passphrase was not set: the bank stored is another's.
    if (answer.val.bank.revtok !== bank.revtok) { lease.evict(); throw Throwers.gateMadeElsewhere() }
    bank.#attachLease(lease)
    bank.#rootBox = Object.freeze(BoxChecks.live.parse(answer.val.root))
    return bank
  }

  /** Unlock this bank under a lease `proved` builds, citing its main gate. */
  async #unlockByProving(proved: Proving): Promise<this> {
    const lease = await proved.buildLease(this, this.#maingate)
    this.#attachLease(lease)
    return this
  }

  /** Write `ask.record`, the main gate's next revision, over `ask.cited`, and hold the gate written as this bank's main gate. Resolves that gate. */
  async #putGate(ask: PutAskDraft<GateRecord>): Promise<Gate> {
    this.demandEnabled()
    const answer = await this.#vaultDB.tryWriteThing({ ...this.makePutAsk(ask), modelkind: 'gate' })
    if (! answer.ok) { throw answer.err }
    // The ask's modelkind is the gate's, which the vaultDB checks what it answers against.
    this.#maingate = Gate.make(answer.val as GateRecord, { bank: this })
    return this.#maingate
  }
  // --

  // == [Unlocking, locking and sweeping]: attachLease, lock, sweep

  /** Attach `lease`, evicting the one it replaces. Once this bank is disabled, it evicts `lease` instead, and refuses. */
  #attachLease(lease: Lease): void {
    if (! this.isEnabled) {
      lease.evict()
      this.demandEnabled()
    }
    this.#lease?.evict()
    this.#lease = lease
  }

  /** Lock the bank: drop its lease and the keys in it. */
  lock(): this {
    this.#lease?.evict()
    this.#lease = null
    return this
  }

  /** Disable this bank for good, and sweep its lease. Never throws. */
  sweep(): this {
    if (this.#endCause !== null) { return this }
    this.#endCause = Throwers.bankSwept()
    this.#lease?.sweep()
    this.#lease = null
    return this
  }
  // --

  // == [Boxes]: sealBox, tombstoneBox, unsealBox

  /** Seal the next revision of the box `donorProps`, with `publicProps` applied and the whisper of `secretProps` encrypted, and return the ask that writes it over `donorProps`. Needs the bank unlocked.
   * The seal checks its arguments (an unknown key in `publicProps` or `secretProps` refuses) and the box it seals, so pass `donorProps` as you have it: whole or sparse, sealed or unsealed, a tombstone or the shell. It must be a box of this bank.
   * A live box's revision keeps its sidecar unless `publicProps` gives one. After a tombstone or the shell, the revision begins the box's next life, and `publicProps` must give its sidecar.
   * Given `am: 'x'` in `publicProps`, it seals the tombstone of the live box instead ({@link tombstoneBox}), returns the del ask, and refuses `secretProps` or any sidecar but `{}`.
   * Its `written_at` is `publicProps.written_at`, or now. The ask cites `donorProps` sparse, and carries nothing of its whisper.
   * @example
   *   const { record } = await bank.sealBox(box, { sidecar: { account: 'work' } }, { whisper })
   */
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxTombstonePublicProps): Promise<SealedBoxAsk<TombstoneOf<BoxRecord>>>
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secretProps: BoxCleartexts): Promise<SealedBoxAsk<LiveOf<BoxRecord>>>
  sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<SealedBoxAsk>
  async sealBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: BoxPublicProps, secretProps?: BoxCleartexts): Promise<SealedBoxAsk> {
    const lease = this.#demandLease()
    this.#demandOwnBox(donorProps)
    const record = await lease.seal(BaseBox, donorProps, publicProps, secretProps)
    const cited  = Thing.sparseOf(donorProps)
    return BaseBox.isTombstone(record) ? this.makeDelAsk<BoxRecord>({ cited, record }) : this.makePutAsk<BoxRecord>({ cited, record })
  }

  /** Seal the tombstone of the live box `donorProps`, and return the del ask that writes it over `donorProps`. Needs the bank unlocked.
   * Its sealed empty whisper authenticates it. Its `written_at` is `publicProps.written_at`, or now.
   */
  tombstoneBox(donorProps: Sealable<LiveOf<BoxRecord>>, publicProps: Partial<BoxTombstonePublicProps> = {}): Promise<SealedBoxAsk<TombstoneOf<BoxRecord>>> {
    return this.sealBox(donorProps, { ...publicProps, am: 'x' })
  }

  /** Unseal `box`, returning it with its whisper in place of the sealed one. Needs the bank unlocked.
   * It authenticates the box, all but its sidecar. For a tombstone, that checks its signature.
   */
  async unsealBox(box: BoxRecord): Promise<BoxUnsealed> {
    const lease = this.#demandLease()
    this.#demandOwnBox(box)
    return lease.unseal(BaseBox, box)
  }
  // --

  // == [Guards]: isEnabled, endCause, isLocked, isUnlocked, demandEnabled, demandOwnBox, demandLease

  /** True until this bank or its device is swept. */
  get isEnabled(): boolean { return this.endCause === null }

  /** The refusal every call on this bank meets once it or its device is swept, or null while it is enabled. */
  get endCause(): Errors.VaultError | null { return this.#endCause ?? this.#device.endCause }

  /** True when no lease is attached to this bank. */
  get isLocked(): boolean { return this.#lease === null }

  /** True when a lease is attached to this bank. */
  get isUnlocked(): boolean { return this.#lease !== null }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    const { endCause } = this
    if (endCause !== null) { throw endCause }
    return this
  }

  /** Demand that `box` is a box of this bank, under its current root box. */
  #demandOwnBox(box: unknown): void {
    const { lifepath } = BoxChecks.sealable.parseConsistent(box, this.scope, { kind: 'record_conflict' })
    if (lifepath.split('/', 1)[0] !== this.#rootBox.lifeseq) { throw Throwers.boxOfOtherRoot() }
  }

  /** The attached lease. Demands that the bank is enabled and unlocked. */
  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw Throwers.needUnlocked() }
    return this.#lease
  }
  // --

  /** Always `'bank'`: this model's {@link Modelkind}. */
  get modelkind(): 'bank' { return 'bank' satisfies Modelkind }

  /** A bank's modelkind: the guards this class inherits answer for banks alone. */
  static override readonly modelkind = 'bank'
}

// == [Helpers]: trackPairOf

/** The revseq and lifepath of a Thing, as a `track` holds them. */
function trackPairOf({ revseq, lifepath }: Pick<ThingRecord, 'revseq' | 'lifepath'>): Track['bank'] { return { revseq, lifepath } }
// --

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Bank.make}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => ({
  // The bank's Thing is strict and refined, so it is checked apart, once the gate and root box are removed.
  bankMakeArgs: obj({
    record: obj({ maingate: GateChecks.record, rootBox: BoxChecks.liveOrShell }).loose(),
    opts:   obj({
      device:         custom<Device>((val) => val instanceof Device, BigPhrases.DeviceExpected),
      vaultDB:        ThingChecks.vaultDBShape,
      queryCacheOpts: MinderChecks.queryCacheOptsOrDefault,
    }),
  }),
}))
// --
