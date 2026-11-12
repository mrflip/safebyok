/** The bank listing: a stub listing of the device's one bank, whose row comes with every answer about its gate and vaults. */

import type { Modelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { makeLifeTok } from '../helpers/crypto'
import * as Phrases from '../helpers/phrases'
import type { VaultError } from '../refusals/errors'
import { actRefused, writtenByOwnVerbs } from '../refusals/throwers'
import { type AskUser, type BankStamp, type GateStamp, bankStamp, gateStamp } from '../shapes/shapes-gateish'
import * as SX from '../shapes/shapes-storage'
import { type BankScope, bankScope } from '../shapes/shapes-core'
import * as BX from '../shapes/shapes-bankdb'
import type { BankRecord, BankRow, BankSparse, BankTombstone, BoxRow, GateRecord, VaultRow } from '../shapes/shapes-bankdb'
import * as VX from '../shapes/shapes-vaultish'
import type { BankListingOpts, BankSnapshot, Fetched } from '../shapes/shapes-vaultish'
import { Bank } from './bank'
import type { Device } from './device'
import { Listing } from './listing'

// Nothing in the design extends this listing: there is no `device.banks`. It uses what `Listing` gives, so that the
// bank row is delivered to its Bank, newer judged from older, as a vault's is. Its one slot is the device's bank: a Bank
// that has ended stays listed, and the device makes another listing for the next one.
/** The device's one bank, listed at the device's scope. */
export class BankListing extends Listing<BankScope, BankRecord, BankSparse, BankSnapshot, Bank> {
  // == [Props]: #askUser

  /** The host's dialog, guarded, handed to each bank made here; null if the host gave none. */
  readonly #askUser: AskUser | null
  // --

  // == [Construction]: constructor, scopeOf, sparseOf, recordOf

  /** The listing of `device`'s bank. */
  constructor(device: Device, opts: BankListingOpts) {
    const { askUser, ...listingOpts } = VX.bankListingOpts.parse(opts)
    super(device, listingOpts)
    this.#askUser = askUser
    Object.freeze(this)
  }

  /** The scope of `bankish`, which must be the device's. */
  scopeOf(bankish: unknown):  BankScope  { return bankScope.parseConsistent(bankish, this.device.scope, { message: Phrases.otherScope }) }

  /** Parse `bankish` as a {@link BankSparse}. */
  sparseOf(bankish: unknown): BankSparse { return BX.bankSparse.parse(bankish) }

  /** Parse `bankish` as a {@link BankRecord} of the device's scope. */
  recordOf(bankish: unknown): BankRecord { return BX.bankRecord.parseConsistent(bankish, this.device.scope, { message: Phrases.otherScope }) }
  // --

  // == [A birth and a death]: stampsOfBirth, recordOfBirth, build, delBank

  /** Fresh stamps for a new bank and its main gate. Make one pair per attempt to build a bank. */
  stampsOfBirth(): { bank: BankStamp, gate: GateStamp } {
    const registered_at = nowMillis()
    return {
      bank: bankStamp.parse({ ...this.device.scope, bank_tok: makeLifeTok(), registered_at }),
      gate: gateStamp.parse({ ...this.device.scope, gatelabel: 'main', gate_tok: makeLifeTok(), registered_at }),
    }
  }

  /** A new live bank record under the stamp `bank`, at the revision after `expected`. */
  recordOfBirth(bank: BankStamp, expected: SX.Revision): BankRecord {
    return { ...bank, fmt: BX.BankFormat, ...SX.nextRevisionOf(expected, nowMillis()), am: 'a' }
  }

  // The bankDB answers the gate row put, the bank row put as its parent; under `passed`, the live ones it found.
  /** Put `record` and its main gate `gate` over the bank row `expected`, and return the listed bank.
   * Where another device built a live bank first, nothing is put, and that bank is returned.
   */
  async build(record: BankRecord, gate: GateRecord, expected: BankSparse): Promise<Bank> {
    this.demandEnabled()
    const answer = await this.bankDB.tryBuildBank({ op: 'build', ...this.device.scope, expected, record, gate })
    if (! answer.ok) {
      this.panicIfRevoked(answer.err)
      throw answer.err
    }
    const bank = this.deliverRecord(answer.parent)
    bank.gateListing.deliverRecord(answer.val)
    return bank
  }

  /** Delete the live bank at `ante`'s revision, with its gate, vaults and boxes, and return the listed bank, now tombstoned. */
  async delBank(ante: BankSparse): Promise<Bank | null> {
    const expected = this.sparseOf(ante)
    this.demandEnabled()
    const record: BankTombstone = { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), am: 'x', bank_tok: makeLifeTok() }
    const answer = await this.bankDB.tryDelBank({ op: 'del', ...this.device.scope, expected, record })
    return this.deliverAnswer(answer, record)
  }
  // --

  // == [Defined by the bank listing]: isEnabled, demandEnabled, receiveParent, demandOfWorld, scopepathOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** Whether this listing answers: its device does. */
  get isEnabled(): boolean { return this.device.isEnabled }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    this.device.demandEnabled()
    return this
  }

  protected receiveParent(): void { /* no row sits above a bank */ }

  protected demandOfWorld(): void { /* a device takes a bank of any life */ }

  protected scopepathOf(scope: BankScope): string {
    return ['bank', scope.user_id, scope.banklabel].join('^')
  }

  protected makeThing(central: Fetched<BankRecord, BankSparse>): Bank {
    return new Bank(this, central, { bankDB: this.bankDB, maxMillisSinceRefresh: this.maxMillisSinceRefresh, askUser: this.#askUser })
  }

  protected nothingStoredError(): VaultError { return actRefused('vault', 'bank_void') }

  protected async doTryList() {
    const answer = await this.#doTryEnsure()
    return answer.ok ? { ...answer, act: (answer.val === null) ? 'gotvoid' : 'got', val: { listed: (answer.val === null) ? [] : [answer.val], damaged_rows: [] } } as const : answer
  }

  // A bank row that fails its checks refuses its ensureBank: no listing sets one aside.
  protected damagedStoredError(): VaultError { return actRefused('vault', 'bank_void') }

  protected doTryGet() { return this.#doTryEnsure() }

  protected doTryPut(): never { throw writtenByOwnVerbs() }

  protected tombstoneOver(): never { throw writtenByOwnVerbs() }

  protected doTryDel(): never { throw writtenByOwnVerbs() }

  // The bank's watch is its vault listing's: no listing of its own starts one.
  protected watchRows(): () => void { return stopNoWatch }

  protected isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is BankRow { return ! (('gatelabel' in row) || ('vaultlabel' in row)) }
  // --

  // == [Helpers]: doTryEnsure

  // A bank has no row above it. Its tombstone is a row stored, and no row at all is `gotvoid`.
  /** The bankDB's ensureBank, with the bank row as its `val` (null for none) and no parent. */
  async #doTryEnsure() {
    const answer = await this.bankDB.tryEnsureBank({ op: 'ensure', ...this.device.scope, gates: ['main'] })
    return answer.ok ? { ...answer, val: (answer.act === 'gotvoid') ? null : answer.parent, parent: null } : answer
  }
  // --

  /** Always `'bank_listing'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'bank_listing' { return 'bank_listing' satisfies Modelkind }
}

// == [Helpers]: stopNoWatch

/** Stops nothing: a stub listing starts no watch. */
function stopNoWatch(): void { /* no watch to stop */ }
// --
