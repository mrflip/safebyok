import type { Consts } from 'safebyok-big/internals'
import { BX, CX, Clock, GX, Helpers, SX, Throwers, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import { Wayin } from './wayin'

/** What a new gate is made of: its stamp, and its wayins. */
export type GateDna = GX.GateStamp & { wayins: { main: Wayin, passkey0: Wayin | null } }

/** What a gate is given of its bank: its stamp. */
export type GateBank = Pick<Bank, 'stamp'>

/** What {@link Gate.make} is given besides its record. */
export interface GateOpts {
  /** The bank the gate belongs to. */
  bank: GateBank
}

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Gate.make}'s and {@link Gate.makeRecord}'s arguments. */
const Checks = Validator.Checkers('bad_option', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => val instanceof Wayin, 'Expected a Wayin')
  const wayins = obj({ main: wayin, passkey0: wayin.nullable() })
  return {
    gateMakeArgs:   obj({ record: BX.gateRecord, opts: obj({ bank: obj({ stamp: GX.bankStamp }) }) }),
    makeRecordArgs: obj({ bankStamp: GX.bankStamp, dna: obj({ wayins }) }),
  }
})

/** One revision of a bank's gate: its passphrase wayin, and its passkey wayin if it has one.
 * A gate verb makes the next revision as a new Gate; this one never changes.
 */
export class Gate implements GX.GateStamp {
  // == [Props]: user_id, banklabel, gatelabel, gate_tok, registered_at, bank_tok, #bank, #record, #main, #passkey0

  declare readonly user_id:       string
  declare readonly banklabel:     string
  declare readonly gatelabel:     GX.GateStamp['gatelabel']
  /** The token of this gate's life. No gate verb changes it. */
  declare readonly gate_tok:      string
  declare readonly registered_at: number
  /** Which life of its bank this gate belongs to. */
  declare readonly bank_tok:      string

  readonly #bank:     GateBank
  readonly #record:   BX.GateRecord
  readonly #main:     Wayin
  readonly #passkey0: Wayin | null
  // --

  // == [Getters]: revision_tok, revision_seq, written_at, wayins, main, passkey0, scope, stamp, bankStamp

  /** The revision this gate is: every gate verb makes a new one. */
  get revision_tok(): string { return this.#record.revision_tok }

  /** The sequence number of the revision in hand, counting from 0 at its birth. */
  get revision_seq(): number { return this.#record.revision_seq }

  /** When the revision in hand was written, in epoch milliseconds. */
  get written_at(): number { return this.#record.written_at }

  /** The wayin records, frozen. */
  get wayins(): BX.Wayins { return this.#record.wayins }

  /** The passphrase wayin. */
  get main(): Wayin { return this.#main }

  /** The passkey wayin, or null if the gate has none. */
  get passkey0(): Wayin | null { return this.#passkey0 }

  /** This gate's scope: its bank's, and its `gatelabel`. */
  get scope(): CX.GateScope { return CX.gateScope.parse(this) }

  /** This gate's stamp, fixed for its life. A wayin's wrapped bankKey is bound to it. */
  get stamp(): GX.GateStamp { return GX.gateStamp.parse(this) }

  /** The stamp of this gate's bank. A wayin's wrapped bankKey is bound to it, and to the gate's own `stamp`. */
  get bankStamp(): GX.BankStamp { return this.#bank.stamp }
  // --

  // == [Construction]: make, constructor, makeRecord

  /** The gate of `record`, which must be of `opts.bank`. */
  static make(record: BX.GateRecord, opts: GateOpts): Gate { return new Gate(record, opts) }

  private constructor(record: BX.GateRecord, opts: GateOpts) {
    const { record: parsed, opts: checked } = Checks.gateMakeArgs.parse({ record, opts })
    Validator.checkedConsistent({ ...CX.bankScope.parse(parsed), bank_tok: parsed.bank_tok }, checked.bank.stamp, { kind: 'record_conflict' })
    this.#bank = opts.bank
    this.#main = Wayin.make(parsed.wayins.main)
    this.#passkey0 = parsed.wayins.passkey0 === undefined ? null : Wayin.make(parsed.wayins.passkey0)
    this.#record = Object.freeze({ ...parsed, wayins: wayinsOf(this.#main, this.#passkey0) })
    Helpers.tattoo(this, { ...GX.gateStamp.parse(parsed), bank_tok: parsed.bank_tok }, { configurable: false })
    Object.freeze(this)
  }

  /** The first record of a new gate of the bank stamped `bankStamp`, made of `dna`. */
  static makeRecord(bankStamp: GX.BankStamp, dna: GateDna): BX.GateRecord {
    const { bankStamp: checkedBank, dna: { wayins } } = Checks.makeRecordArgs.parse({ bankStamp, dna })
    return BX.gateRecord.parse({
      ...GX.gateStamp.parse(dna), fmt: BX.GateFormat, ...SX.nextRevisionOf(SX.VoidRevision, Clock.nowMillis()), am: 'a',
      bank_tok: checkedBank.bank_tok, wayins: wayinsOf(wayins.main, wayins.passkey0), auth: {}, sigs: {}, meta: {},
    })
  }
  // --

  // == [Methods]: pickle

  /** This gate's row, as a frozen plain {@link BX.GateRecord}. */
  pickle(): BX.GateRecord { return this.#record }
  // --

  // == [Guards]: demandPasskeyAddable

  /** Throw if this gate already has a passkey. */
  demandPasskeyAddable(): void {
    if (this.#passkey0 !== null) { throw Throwers.passkeyAlreadyAdded() }
  }
  // --

  /** Always `'gate'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'gate' { return 'gate' satisfies Consts.Modelkind }
}

// == [Helpers]: wayinsOf

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen wayin records of `main` and, if given, `passkey0`. */
function wayinsOf(main: Wayin, passkey0: Wayin | null): BX.Wayins {
  return Object.freeze({ main: main.pickle(), ...(passkey0 && { passkey0: passkey0.pickle() }) }) as BX.Wayins
}
// --
