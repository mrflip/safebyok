import type { Consts } from 'safebyok-big/internals'
import { Crypto, Throwers, Validator } from 'safebyok-big/internals'
import { BaseThing } from './base-thing'
import type { GateBank, GateDna, GateOpts } from '../shapes/shapes-gateish'
import { type BankStamp, type GateStamp, bankScope, bankStamp, gateStamp } from '../shapes/shapes-stamps'
import { Wayin } from './wayin'
import { type GateThing, type ThingScope, type Wayins, GateThingFormat, gateThing, thingScope } from '../shapes/shapes-thing'

/** One revision of a bank's gate: its passphrase wayin, and its passkey wayin if it has one.
 * A gate verb makes the next revision as a new Gate; this one never changes.
 */
export class Gate extends BaseThing<GateThing, ThingScope, GateStamp> implements GateStamp {
  // == [Props]: #bank, #main, #passkey0

  readonly #bank:     GateBank
  readonly #main:     Wayin
  readonly #passkey0: Wayin | null
  // --

  // == [Getters]: wayins, main, passkey0, scope, stamp, bankStamp

  /** The wayin records, frozen. */
  get wayins(): Wayins { return this.pickle().wayins }

  /** The passphrase wayin. */
  get main(): Wayin { return this.#main }

  /** The passkey wayin, or null if the gate has none. */
  get passkey0(): Wayin | null { return this.#passkey0 }

  /** This gate's scope: its bank's, and its `labelpath`. */
  get scope(): ThingScope { return thingScope.parse(this) }

  /** This gate's stamp, fixed for its life. A wayin's wrapped bankKey is bound to it. */
  get stamp(): GateStamp { return gateStamp.parse(this) }

  /** The stamp of this gate's bank. A wayin's wrapped bankKey is bound to it, and to the gate's own `stamp`. */
  get bankStamp(): BankStamp { return this.#bank.stamp }
  // --

  // == [Construction]: make, constructor, makeRecord

  /** Make the gate of `record`, which must be of `opts.bank`'s scope. */
  static make(record: GateThing, opts: GateOpts): Gate {
    const { record: parsed, opts: checked } = Checks.gateMakeArgs.parse({ record, opts })
    // A gate's life is its own, so only the bank's scope is checked: a gate of another life of the bank passes.
    Validator.checkedConsistent(parsed, bankScope.parse(checked.bank.stamp), { kind: 'record_conflict' })
    return new Gate(parsed, opts)
  }

  private constructor(parsed: GateThing, opts: GateOpts) {
    const main = Wayin.make(parsed.wayins.main)
    const passkey0 = (parsed.wayins.passkey0 === null) ? null : Wayin.make(parsed.wayins.passkey0)
    super({ ...parsed, wayins: wayinsOf({ main, passkey0 }) })
    this.#bank = opts.bank
    this.#main = main
    this.#passkey0 = passkey0
    Object.freeze(this)
  }

  /** The first record of a new main gate, made from `dna`, born at its stamp's `born_at`. */
  static makeRecord(dna: GateDna): GateThing {
    const { wayins, ...stamp } = Checks.makeRecordArgs.parse(dna)
    return gateThing.parse({
      ...stamp, label: stamp.labelpath, fmt: GateThingFormat, revtok: Crypto.randomId(), revseq: 0, am: 'a',
      lifepath: stamp.lifeseq, written_at: stamp.born_at, wayins: wayinsOf(wayins), auth: {}, sigs: {}, meta: {},
    })
  }
  // --

  // == [Guards]: demandPasskeyAddable

  /** Demand that this gate has no passkey wayin yet. */
  demandPasskeyAddable(): void {
    if (this.#passkey0 !== null) { throw Throwers.passkeyAlreadyAdded() }
  }
  // --

  /** Always `'gate'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'gate' { return 'gate' satisfies Consts.Modelkind }
}

// == [Helpers]: wayinsOf

// A Wayin's pickle is typed as either kind; the gate record's parse checks each is the kind its label wants.
/** The frozen records of `wayins`, its passkey0 null for none. */
function wayinsOf({ main, passkey0 }: GateDna['wayins']): Wayins {
  return Object.freeze({ main: main.pickle(), passkey0: passkey0?.pickle() ?? null }) as Wayins
}
// --

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Gate.make}'s and {@link Gate.makeRecord}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => val instanceof Wayin, 'Expected a Wayin')
  return {
    gateMakeArgs:   obj({ record: gateThing, opts: obj({ bank: obj({ stamp: bankStamp }) }) }),
    makeRecordArgs: gateStamp.extend({ wayins: obj({ main: wayin, passkey0: wayin.nullable() }) }),
  }
})
// --
