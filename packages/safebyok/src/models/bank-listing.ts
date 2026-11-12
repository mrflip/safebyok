/** A device's bank as it has it: the stub listing a Bank is made in, whose row comes with every answer about its gate and vaults. */

import type { Modelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { makeLifeTok } from '../helpers/crypto'
import * as Phrases from '../helpers/phrases'
import type { VaultError } from '../refusals/errors'
import { actRefused, writtenByOwnVerbs } from '../refusals/throwers'
import { type BankStamp, type GateStamp, bankStamp, gateStamp } from '../shapes/shapes-gateish'
import * as SX from '../shapes/shapes-storage'
import { type BankScope, bankScope } from '../shapes/shapes-core'
import * as BX from '../shapes/shapes-bankdb'
import type { BankRecord, BankRow, BankSparse, BoxRow, GateRecord, VaultRow } from '../shapes/shapes-bankdb'
import type { BankSnapshot, Fetched, ListingOpts } from '../shapes/shapes-vaultish'
import { Bank } from './bank'
import type { Device } from './device'
import { Listing } from './listing'

// Nothing in the design extends this listing: there is no `device.banks`. It uses what `Listing` gives, so that the
// bank row is delivered to its Bank, newer judged from older, as a vault's is.
/** One device's bank, by its scope: the device's own, the only one. */
export class BankListing extends Listing<BankScope, BankRecord, BankSparse, BankSnapshot, Bank> {
  // == [Props]: world

  declare readonly world: Device
  // --

  // == [Construction]: constructor, scopeOf, sparseOf, recordOf

  constructor(world: Device, opts: ListingOpts) {
    super(world, opts)
    Object.freeze(this)
  }

  /** The scope of `bankish`, which must be the device's: no listing answers for another's. */
  scopeOf(bankish: unknown):  BankScope  { return bankScope.parseConsistent(bankish, this.world.scope, { message: Phrases.otherScope }) }

  /** Parse `bankish` as a {@link BankSparse}. */
  sparseOf(bankish: unknown): BankSparse { return BX.bankSparse.parse(bankish) }

  /** Parse `bankish` as a {@link BankRecord} of the device's scope. */
  recordOf(bankish: unknown): BankRecord { return BX.bankRecord.parseConsistent(bankish, this.world.scope, { message: Phrases.otherScope }) }
  // --

  // == [A birth]: stampsOfBirth, recordOfBirth, build

  /** A new life's stamps, the bank's and its main gate's, one pair per attempt to build a bank. */
  stampsOfBirth(): { bank: BankStamp, gate: GateStamp } {
    const registered_at = nowMillis()
    return {
      bank: bankStamp.parse({ ...this.world.scope, bank_tok: makeLifeTok(), registered_at }),
      gate: gateStamp.parse({ ...this.world.scope, gatelabel: 'main', gate_tok: makeLifeTok(), registered_at }),
    }
  }

  /** The record of a birth under the stamp `bank`, at the revision after `expected`'s. */
  recordOfBirth(bank: BankStamp, expected: SX.Revision): BankRecord {
    return { ...bank, fmt: BX.BankFormat, ...SX.nextRevisionOf(expected, nowMillis()), am: 'a' }
  }

  // The bankDB answers the gate row put, the bank row put as its parent; under `passed`, the live ones it found.
  /** Store `record` and its main gate `gate` over the bank row `expected`, and answer the bank listed: the one built, or the live one some other device built first. */
  async build(record: BankRecord, gate: GateRecord, expected: BankSparse): Promise<Bank> {
    this.demandEnabled()
    const answer = await this.bankDB.tryBuildBank({ op: 'build', ...this.world.scope, expected, record, gate })
    if (! answer.ok) {
      this.panicIfRevoked(answer.err)
      throw answer.err
    }
    const bank = this.deliverRecord(answer.parent)
    bank.gateListing.deliverRecord(answer.val)
    return bank
  }
  // --

  // == [Defined by the bank listing]: isOneLifePerInstance, demandOfWorld, scopepathOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  // A Bank object is one life of its bank: a bank deleted, or built anew, is a new instance.
  protected get isOneLifePerInstance(): true { return true }

  protected demandOfWorld(): void { /* a device takes a bank of any life */ }

  protected scopepathOf(scope: BankScope): string {
    return ['bank', scope.user_id, scope.banklabel].join('^')
  }

  protected makeThing(central: Fetched<BankRecord, BankSparse>): Bank {
    return new Bank(this.world, this, central, { bankDB: this.bankDB, maxMillisSinceRefresh: this.maxMillisSinceRefresh, bankFriend: this.bankFriend })
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
  /** The bankDB's ensureBank, answering the bank row as its `val`, and no parent. */
  async #doTryEnsure() {
    const answer = await this.bankDB.tryEnsureBank({ op: 'ensure', ...this.world.scope, gates: ['main'] })
    return answer.ok ? { ...answer, val: (answer.act === 'gotvoid') ? null : answer.parent, parent: null } : answer
  }
  // --

  /** Answers 'bank_listing', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'bank_listing' { return 'bank_listing' satisfies Modelkind }
}

// == [Helpers]: stopNoWatch

/** Stops nothing: a stub listing starts no watch. */
function stopNoWatch(): void { /* no watch to stop */ }
// --
