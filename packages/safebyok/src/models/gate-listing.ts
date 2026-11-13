/** The gate listing: a stub listing of a bank's one gate, whose row comes with the bank's. */

import { noop } from 'es-toolkit'
import { nowMillis } from '../helpers/clock'
import { makeLifeTok } from '../helpers/crypto'
import { type Modelkind, UNANSWERED } from '../helpers/consts'
import * as Phrases from '../helpers/phrases'
import type { VaultError } from '../refusals/errors'
import { valOf } from '../refusals/outcome'
import { mainGateMissing, rowOfOtherLife, writtenByOwnVerbs } from '../refusals/throwers'
import { type GateScope, gateScope } from '../shapes/shapes-core'
import * as BX from '../shapes/shapes-bankdb'
import type { BankRow, BoxRow, GateRecord, GateSparse, VaultRow, Wayins } from '../shapes/shapes-bankdb'
import * as SX from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import type { DelTombstone, Fetched, GateSnapshot, ListingOpts, ThingAnswer } from '../shapes/shapes-vaultish'
import { type GateAnswer, answerWithVal, refusedAnswerOf } from '../storage/bank-db'
import type { Bank } from './bank'
import { Gate } from './gate'
import { Listing } from './listing'

// Nothing in the design extends this listing: there is no `bank.gates`. It uses what `Listing` gives, so that the gate
// row is delivered to its Gate, newer judged from older, as a vault's is.
/** One bank's gate, by gatelabel: `main`, the only one. */
export class GateListing extends Listing<GateScope, GateRecord, GateSparse, GateSnapshot, Gate> {
  // == [Props]: bank

  /** The bank whose gate this is. */
  readonly bank: Bank
  // --

  // == [Construction]: constructor, scopeOf, sparseOf, recordOf

  /** The listing of `bank`'s gate. */
  constructor(bank: Bank, opts: ListingOpts) {
    const checked = VX.listedUnder.bank.parse(bank)
    super(checked.device, opts)
    this.bank = checked
    Object.freeze(this)
  }

  /** The scope of `gateish`, which must be in this bank. */
  scopeOf(gateish: unknown):  GateScope  { return gateScope.parseConsistent(gateish, this.bank.scope, { message: Phrases.otherScope }) }

  /** Parse `gateish` as a {@link GateSparse}. */
  sparseOf(gateish: unknown): GateSparse { return BX.gateSparse.parse(gateish) }

  /** Parse `gateish` as a {@link GateRecord} of this bank. */
  recordOf(gateish: unknown): GateRecord { return BX.gateRecord.parseConsistent(gateish, this.bank.scope, { message: Phrases.otherScope }) }
  // --

  // == [The gate verbs]: replacePassphrase, addPasskey, revokePasskey, each with its try form
  // Each puts the next revision of the gate at `ante`, under the same gate_tok and bank_tok, with `ante` as the row it expects.
  // The val is the record the verb wrote: the gate listed may have a newer one by the time the answer is delivered.

  /** Replace the passphrase wayin of the gate at `ante` with `main`, and return the stored record.
   * Locks nothing: the bankKey is unchanged.
   */
  async replacePassphrase(ante: GateRecord, main: Wayins['main']): Promise<GateRecord> { return valOf(await this.tryReplacePassphrase(ante, main)) }

  /** Non-throwing form of {@link replacePassphrase}: the bankDB's answer.
   * Chute: tryReplacePassphrase → bankDB.tryReplacePassphrase → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryReplacePassphrase(ante: GateRecord, main: Wayins['main']): Promise<ThingAnswer<GateRecord>> {
    let answer: GateAnswer | typeof UNANSWERED = UNANSWERED
    try {
      const expected = this.recordOf(ante)
      this.demandEnabled()
      const record: GateRecord = { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), wayins: { ...expected.wayins, main } }
      answer = await this.bankDB.tryReplacePassphrase({ op: 'put', ...this.scopeOf(record), bank_tok: record.bank_tok, expected, record })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** Add `passkey0` as the passkey wayin of the gate at `ante`, and return the stored record. */
  async addPasskey(ante: GateRecord, passkey0: NonNullable<Wayins['passkey0']>): Promise<GateRecord> { return valOf(await this.tryAddPasskey(ante, passkey0)) }

  /** Non-throwing form of {@link addPasskey}: the bankDB's answer.
   * Chute: tryAddPasskey → bankDB.tryAddPasskey → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryAddPasskey(ante: GateRecord, passkey0: NonNullable<Wayins['passkey0']>): Promise<ThingAnswer<GateRecord>> {
    let answer: GateAnswer | typeof UNANSWERED = UNANSWERED
    try {
      const expected = this.recordOf(ante)
      this.demandEnabled()
      const record: GateRecord = { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), wayins: { ...expected.wayins, passkey0 } }
      answer = await this.bankDB.tryAddPasskey({ op: 'put', ...this.scopeOf(record), bank_tok: record.bank_tok, expected, record })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }

  /** Remove the passkey wayin of the gate at `ante`, and return the stored record. */
  async revokePasskey(ante: GateRecord): Promise<GateRecord> { return valOf(await this.tryRevokePasskey(ante)) }

  /** Non-throwing form of {@link revokePasskey}: the bankDB's answer.
   * Chute: tryRevokePasskey → bankDB.tryRevokePasskey → deliverAnswer → answerDeliveringOf → recordDeliveringOf → doDeliverRecord → thing.receiveRecord
   */
  async tryRevokePasskey(ante: GateRecord): Promise<ThingAnswer<GateRecord>> {
    let answer: GateAnswer | typeof UNANSWERED = UNANSWERED
    try {
      const expected = this.recordOf(ante)
      this.demandEnabled()
      const record: GateRecord = { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), wayins: { main: expected.wayins.main } }
      answer = await this.bankDB.tryRevokePasskey({ op: 'put', ...this.scopeOf(record), bank_tok: record.bank_tok, expected, record })
      this.deliverAnswer(answer, record)
      return answerWithVal(answer, valOf(answer))
    } catch (err) { return refusedAnswerOf(err, answer) }
  }
  // --

  // == [Defined by the gate listing]: isEnabled, receiveParent, demandOfLife, scopepathOf, labelOf, makeThing, nothingStoredError, doTryList, damagedStoredError, doTryGet, doTryPut, tombstoneOver, doTryDel, watchRows, isOwnRow

  /** Whether this listing answers: its bank does. */
  get isEnabled(): boolean { return this.bank.isEnabled }

  protected receiveParent(parent: unknown): void { this.bank.receiveParent(parent) }

  protected demandOfLife(record: Fetched<GateRecord, GateSparse>): void {
    if (record.bank_tok !== this.bank.bank_tok) { throw rowOfOtherLife(record, 'bank_tok') }
  }

  protected scopepathOf(scope: GateScope): string {
    return ['gate', scope.user_id, scope.banklabel, scope.gatelabel].join('^')
  }

  protected labelOf({ gatelabel }: GateScope): string { return gatelabel }

  protected makeThing(central: Fetched<GateRecord, GateSparse>): Gate { return new Gate(this, central) }

  protected nothingStoredError(): VaultError { return mainGateMissing(this.bank.sparse) }

  // ensureBank answers the bank's main gate row with it, the bank row as its parent.
  protected async doTryList() {
    const answer = await this.bankDB.tryEnsureBank({ op: 'ensure', ...this.bank.scope, gates: ['main'] })
    if (! answer.ok) { return answer }
    const listed = (answer.val === null) ? [] : [answer.val.gates.main]
    return { ...answer, act: (answer.val === null) ? 'gotvoid' : 'got', val: { listed, damaged_rows: [] } } as const
  }

  // A gate row that fails its checks refuses its bank's ensureBank: no listing sets one aside.
  protected damagedStoredError(): VaultError { return mainGateMissing(this.bank.sparse) }

  protected async doTryGet() {
    const answer = await this.bankDB.tryEnsureBank({ op: 'ensure', ...this.bank.scope, gates: ['main'] })
    return answer.ok ? { ...answer, val: answer.val?.gates.main ?? null } : answer
  }

  protected doTryPut(): never { throw writtenByOwnVerbs() }

  protected tombstoneOver(expected: GateSparse): DelTombstone<GateSparse> {
    return { ...expected, ...SX.nextRevisionOf(expected, nowMillis()), am: 'x', gate_tok: makeLifeTok() }
  }

  // No bankDB verb deletes a gate alone: it goes with its bank.
  protected doTryDel(): never { throw writtenByOwnVerbs() }

  // The bank's watch hears the gate row: no listing of its own starts one.
  protected watchRows(): () => void { return noop }

  protected isOwnRow(row: BankRow | GateRecord | VaultRow | BoxRow): row is GateRecord { return 'gatelabel' in row }
  // --

  /** Always `'gate_listing'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'gate_listing' { return 'gate_listing' satisfies Modelkind }
}
