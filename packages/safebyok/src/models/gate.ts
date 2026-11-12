import { type Modelkind, hasModelkind } from '../helpers/consts'
import { nowMillis } from '../helpers/clock'
import { Checkers, demandConsistent } from '../helpers/validator'
import { decorate, tattoo } from '../helpers/helpers'
import { passkeyAlreadyAdded } from '../refusals/throwers'
import { type GateRecord, type Wayins, GateFormat, gateRecord } from '../shapes/shapes-bankdb'
import { type BankStamp, type GateStamp, type WayinHeader, bankStamp, gateStamp } from '../shapes/shapes-gateish'
import { VoidRevision, nextRevisionOf } from '../shapes/shapes-storage'
import { Wayin } from './wayin'

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => hasModelkind(val, 'wayin'), 'Expected a Wayin')
  return { gateMakeArgs: obj({ bank: bankStamp, gate: gateStamp, main: wayin, passkey0: wayin.nullable() }) }
})

/** A bank's gate as of one revision of its row, a read-only view: a change is a bankDB verb's, and a new `Gate` is read from the row it puts. */
export class Gate {
  // == [Props]: user_id, banklabel, gatelabel, fmt, revision_tok, revision_seq, registered_at, written_at, am, bank_tok, gate_tok, wayins, auth, sigs, meta, main, passkey0, bankStamp, stamp

  declare readonly user_id:       string
  declare readonly banklabel:     string
  declare readonly gatelabel:     GateRecord['gatelabel']
  declare readonly fmt:           typeof GateFormat
  declare readonly revision_tok:  string
  declare readonly revision_seq:  number
  declare readonly registered_at: number
  declare readonly written_at:    number
  declare readonly am:            'a'
  declare readonly bank_tok:      string
  declare readonly gate_tok:      string
  declare readonly wayins:        Wayins
  declare readonly auth:          GateRecord['auth']
  declare readonly sigs:          GateRecord['sigs']
  declare readonly meta:          GateRecord['meta']
  /** The passphrase wayin. */
  declare readonly main:          Wayin
  /** The passkey wayin, null where the gate has none. */
  declare readonly passkey0:      Wayin | null
  /** The stamp of the bank this gate is of: what each wayin's ctx binds before the gate's own. */
  declare readonly bankStamp:     BankStamp
  /** This gate's stamp, fixed for its life: what each wayin's ctx binds. */
  declare readonly stamp:         GateStamp
  // --

  // == [Construction]: constructor, make

  /** The gate `record` stores, of the bank `bank` stamps: refused 'bad_option' where the record is of another bank or another life of it. */
  constructor(bank: BankStamp, record: GateRecord) {
    const checkedBank = bankStamp.parse(bank)
    const checked = gateRecord.parse(record)
    const { registered_at: _bankBorn, ...bankLife } = checkedBank
    demandConsistent(bankLife, checked, { kind: 'bad_option' })
    const main = new Wayin(checked.wayins.main)
    const passkey0 = checked.wayins.passkey0 === undefined ? null : new Wayin(checked.wayins.passkey0)
    tattoo(this, { ...checked, wayins: wayinsOf(main, passkey0) })
    decorate<Gate>(this, { main, passkey0, bankStamp: checkedBank, stamp: gateStamp.parse(checked) })
    Object.freeze(this)
  }

  /** A gate born with `bank`, under the stamp `gate`, at the first revision of its row: what `buildBank` puts beside the bank row. */
  static make(bank: BankStamp, gate: GateStamp, main: Wayin, passkey0: Wayin | null): Gate {
    const checked = Checks.gateMakeArgs.parse({ bank, gate, main, passkey0 })
    return new Gate(checked.bank, {
      ...checked.gate, fmt: GateFormat, ...nextRevisionOf(VoidRevision, nowMillis()), am: 'a',
      bank_tok: checked.bank.bank_tok, wayins: wayinsOf(checked.main, checked.passkey0), auth: {}, sigs: {}, meta: {},
    })
  }
  // --

  // == [Methods]: pickle, toJSON

  /** This gate as a frozen, plain {@link GateRecord}: the row it was read from. */
  pickle(): GateRecord {
    const { user_id, banklabel, gatelabel, fmt, revision_tok, revision_seq, registered_at, written_at, am, bank_tok, gate_tok, wayins, auth, sigs, meta } = this
    return Object.freeze({ user_id, banklabel, gatelabel, fmt, revision_tok, revision_seq, registered_at, written_at, am, bank_tok, gate_tok, wayins, auth, sigs, meta })
  }

  /** This gate for `JSON.stringify`, showing only each wayin's header. */
  toJSON(): Omit<GateRecord, 'wayins'> & { wayins: { main: WayinHeader, passkey0?: WayinHeader } } {
    const { wayins: _wayins, ...shown } = this.pickle()
    return { ...shown, wayins: { main: this.main.toJSON(), ...(this.passkey0 && { passkey0: this.passkey0.toJSON() }) } }
  }
  // --

  // == [Guards]: demandPasskeyAddable

  /** Demands that this gate have no passkey: the one check before anyone is asked for one. */
  demandPasskeyAddable(): void {
    if (this.passkey0 !== null) { throw passkeyAlreadyAdded() }
  }
  // --

  /** Answers 'gate', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'gate' { return 'gate' satisfies Modelkind }
}

// A Wayin's pickle is typed as either kind; the gate record's parse, in the constructor, checks each is the kind its label wants.
/** The frozen bag of `main`'s record and `passkey0`'s, where there is one. */
function wayinsOf(main: Wayin, passkey0: Wayin | null): Wayins {
  return Object.freeze({ main: main.pickle(), ...(passkey0 && { passkey0: passkey0.pickle() }) }) as Wayins
}
