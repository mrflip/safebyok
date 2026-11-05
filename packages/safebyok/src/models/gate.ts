import { Checkers } from '../helpers/validator'
import { decorate, tattoo } from '../helpers/helpers'
import { passkeyHeldAlready } from '../refusals/throwers'
import { type GateProps, type PasskeyWayinRecord, type PassphraseWayinRecord, type VaultStamp, type WayinHeader, FirstGateEpoch, gateProps, vaultStamp } from './models-shapes'
import { Wayin } from './wayin'

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => val instanceof Wayin, 'Expected a Wayin')
  return { gateMakeArgs: obj({ passphraseWayin: wayin, passkeyWayin: wayin.nullable() }) }
})

// == [Gate]: make, demandPasskeyAddable, pickle, toJSON

/** The wayins of a vault's record as of one `gate_epoch`, a read-only view: a change is a vaultDB verb's, and a new `Gate` is read from the record it lands. */
export class Gate {
  declare readonly gate_epoch:       number
  declare readonly passphrase_wayin: PassphraseWayinRecord
  declare readonly passkey_wayin:    PasskeyWayinRecord | null
  declare readonly ppWayin:          Wayin
  declare readonly pkWayin:          Wayin | null
  declare readonly stamp:            VaultStamp

  constructor(stamp: VaultStamp, props: unknown) {
    const checked = vaultStamp.parse(stamp)
    const { gate_epoch, passphrase_wayin, passkey_wayin } = gateProps.parse(props)
    const ppWayin = new Wayin(passphrase_wayin)
    const pkWayin = passkey_wayin === null ? null : new Wayin(passkey_wayin)
    tattoo(this, { gate_epoch, passphrase_wayin: ppWayin.pickle(), passkey_wayin: pkWayin?.pickle() ?? null }, { writable: false })
    decorate<Gate>(this, { ppWayin, pkWayin, stamp: checked })
    Object.freeze(this)
  }

  /** The first gate of the vault `stamp` names, of `gate_epoch` 1. */
  static make(stamp: VaultStamp, passphraseWayin: Wayin, passkeyWayin: Wayin | null): Gate {
    Checks.gateMakeArgs.parse({ passphraseWayin, passkeyWayin })
    return new Gate(stamp, { gate_epoch: FirstGateEpoch, passphrase_wayin: passphraseWayin.pickle(), passkey_wayin: passkeyWayin?.pickle() ?? null })
  }

  /** Demands that this gate hold no passkey: the one check before anyone is asked for one. */
  demandPasskeyAddable(): void {
    if (this.pkWayin !== null) { throw passkeyHeldAlready() }
  }

  pickle(): GateProps {
    const { gate_epoch, passphrase_wayin, passkey_wayin } = this
    return Object.freeze({ gate_epoch, passphrase_wayin, passkey_wayin })
  }

  toJSON(): { gate_epoch: number, passphrase_wayin: WayinHeader, passkey_wayin: WayinHeader | null } {
    return { gate_epoch: this.gate_epoch, passphrase_wayin: this.ppWayin.toJSON(), passkey_wayin: this.pkWayin?.toJSON() ?? null }
  }
}
// --
