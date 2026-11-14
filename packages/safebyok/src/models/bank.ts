import type { Consts } from 'safebyok-big/internals'
import { BX, CX, Clock, Crypto, Errors, GX, Helpers, SX, Throwers, Validator } from 'safebyok-big/internals'
import { Device } from './device'
import { Gate, type GateDna } from './gate'
import type { Lease } from './lease'
import { Proving } from './proving'
import { type BoxAnte, type BoxCleartexts, BoxWhisperSealer } from './sealers'
import { PutNotBuilt } from '../phrases'

/** A bank's record: its row, with its main gate's record, of the same life, as `maingate`. */
export type BankRecord = BX.BankRecord & { maingate: BX.GateRecord }

/** What a new bank is made of: its stamp, and its main gate's dna. */
export type BankDna = GX.BankStamp & { maingate: GateDna }

/** A box unsealed: its record without the sealed fields, and its whisper. */
export type BoxUnsealed = Omit<BX.BoxRecord, 'box_key_wrapped' | 'whisper_ciphered'> & BoxCleartexts

/** How {@link Bank.put} meets a live bank already stored at its scope: `'fail'` refuses `camped`. */
export interface BankPutOpts {
  ifPresent: 'fail'
}

/** What {@link Bank.make} is given besides its record. */
export interface BankOpts {
  /** The device the bank is on, which must be of the bank's scope. */
  device: Device
}

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Bank.make}'s arguments, and of the proving an unlock is given. */
const Checks = Validator.Checkers('bad_option', ({ obj, custom }) => ({
  bankMakeArgs: obj({ record: BX.bankRecord, maingate: BX.gateRecord, opts: obj({ device: custom<Device>((val) => val instanceof Device, 'Expected a Device') }) }),
  proving:      custom<Proving>((val) => val instanceof Proving, 'Expected a Proving'),
}))

/** The signed-in user's bank on this device: its main gate, and its lease while unlocked.
 * Boxes are sealed and unsealed under the lease, which the bank keeps private.
 */
export class Bank implements GX.BankStamp {
  // == [Props]: user_id, banklabel, bank_tok, registered_at, #device, #record, #maingate, #lease

  /** The user's id; with `banklabel`, this bank's scope. */
  declare readonly user_id:       string
  declare readonly banklabel:     string
  /** This bank's life token: a bank built again has another. */
  declare readonly bank_tok:      string
  declare readonly registered_at: number

  readonly #device:   Device
  readonly #record:   BX.BankRecord
  readonly #maingate: Gate

  /** The lease attached to this bank; null means locked. */
  #lease: Lease | null = null
  // --

  // == [Getters]: device, device_tok, scope, stamp, maingate, revision_tok, revision_seq, written_at

  /** The device this bank is on. */
  get device(): Device { return this.#device }

  /** The token of this device's row, which each wayin it builds records. */
  get device_tok(): string { return this.#device.device_tok }

  /** This bank's scope: its user and its `banklabel`. */
  get scope(): CX.BankScope { return CX.bankScope.parse(this) }

  /** This bank's {@link GX.BankStamp}, which every ctx under it binds first. */
  get stamp(): GX.BankStamp { return GX.bankStamp.parse(this) }

  /** The bank's main gate: the wayins a user unlocks with. */
  get maingate(): Gate { return this.#maingate }

  /** The revision of the bank row in hand. */
  get revision_tok(): string { return this.#record.revision_tok }

  /** The sequence number of the revision in hand, counting from 0 at its birth. */
  get revision_seq(): number { return this.#record.revision_seq }

  /** When the revision in hand was written, in epoch milliseconds. */
  get written_at(): number { return this.#record.written_at }
  // --

  // == [Construction]: make, constructor, mintStamps, makeRecord

  /** The bank of `record`, with its main gate, on `opts.device`. */
  static make(record: BankRecord, opts: BankOpts): Bank { return new Bank(record, opts) }

  private constructor({ maingate: gaterecord, ...bankrecord }: BankRecord, { device }: BankOpts) {
    const { record: parsed, maingate } = Checks.bankMakeArgs.parse({ record: bankrecord, maingate: gaterecord, opts: { device } })
    Validator.checkedConsistent(CX.bankScope.parse(parsed), device.scope, { kind: 'record_conflict' })
    this.#device = device
    this.#record = Object.freeze(parsed)
    Helpers.tattoo(this, GX.bankStamp.parse(parsed), { configurable: false })
    this.#maingate = Gate.make(maingate, { bank: this })
    Object.freeze(this)
  }

  /** Fresh stamps for a new bank of `scope` and its main gate. Mint one pair per attempt to birth a bank. */
  static mintStamps(scope: CX.BankScope): { bankStamp: GX.BankStamp, gateStamp: GX.GateStamp } {
    const { user_id, banklabel } = CX.bankScope.parse(scope)
    const registered_at = Clock.nowMillis()
    return {
      bankStamp: GX.bankStamp.parse({ user_id, banklabel, bank_tok: Crypto.makeLifeTok(), registered_at }),
      gateStamp: GX.gateStamp.parse({ user_id, banklabel, gatelabel: 'main', gate_tok: Crypto.makeLifeTok(), registered_at }),
    }
  }

  /** The first record of a new bank and its main gate, made of `dna`. */
  static makeRecord(dna: BankDna): BankRecord {
    const { maingate, ...stampish } = dna
    const bankStamp = GX.bankStamp.parse(stampish)
    const record = BX.bankRecord.parse({ ...bankStamp, fmt: BX.BankFormat, ...SX.nextRevisionOf(SX.VoidRevision, Clock.nowMillis()), am: 'a' })
    return { ...record, maingate: Gate.makeRecord(bankStamp, maingate) }
  }
  // --

  // == [Methods]: pickle, put

  /** This bank's row, as a frozen plain {@link BX.BankRecord}. */
  pickle(): BX.BankRecord { return this.#record }

  // Storing is the layer above's: the bank's VaultDB is not built in this one. A test stubs this.
  /** Store this bank and its main gate. Refuses `camped` where a live bank is stored at its scope. */
  put(_opts: BankPutOpts): Promise<this> { return Promise.reject(new Errors.VaultError('unexpected_error', PutNotBuilt)) }
  // --

  // == [Unlocking and locking]: unlockByProving, attachLease, lock

  /** Unlock this bank with `proved`, a proving of its gate, built in the gating attempt underway.
   * The lease cites `cited`, by default the main gate in hand.
   */
  async unlockByProving(proved: Proving, cited: GX.CitedGate = this.maingate): Promise<this> {
    this.demandEnabled()
    const lease = await Checks.proving.parse(proved).buildLease(this, cited)
    this.#attachLease(lease)
    return this
  }

  /** Attach `lease`, evicting the one it replaces */
  #attachLease(lease: Lease): void {
    this.#lease?.evict()
    this.#lease = lease
  }

  /** Lock the bank: drop its lease and the keys in it. */
  lock(): this {
    this.#lease?.evict()
    this.#lease = null
    return this
  }
  // --

  // == [Boxes]: sealBox, unsealBox

  /** The next revision of `ante`, its whisper sealed under this bank's key. Needs the bank unlocked.
   * Over a tombstone, the box starts a new life.
   */
  async sealBox(ante: BoxAnte, cleartexts: BoxCleartexts): Promise<BX.BoxRecord> {
    return this.#demandLease().seal(BoxWhisperSealer, ante, cleartexts)
  }

  /** `box` with its whisper unsealed, and its sealed fields left out. Needs the bank unlocked. */
  async unsealBox(box: BX.BoxRecord): Promise<BoxUnsealed> {
    const parsed = BX.boxRecord.parse(box)
    const { whisper } = await this.#demandLease().unseal(BoxWhisperSealer, parsed)
    const { box_key_wrapped: _keyWrapped, whisper_ciphered: _ciphered, ...unsealed } = parsed
    return { ...unsealed, whisper }
  }
  // --

  // == [Guards]: isEnabled, isLocked, isUnlocked, demandEnabled, demandLease

  /** True while this bank's device is enabled. */
  get isEnabled(): boolean { return this.#device.isEnabled }

  /** True when no lease is attached to this bank. */
  get isLocked(): boolean { return this.#lease === null }

  /** True when a lease is attached to this bank. */
  get isUnlocked(): boolean { return this.#lease !== null }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    this.#device.demandEnabled()
    return this
  }

  /** The attached lease, or throw while locked */
  #demandLease(): Lease {
    this.demandEnabled()
    if (this.#lease === null) { throw Throwers.needUnlocked() }
    return this.#lease
  }
  // --

  /** Always `'bank'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'bank' { return 'bank' satisfies Consts.Modelkind }
}
