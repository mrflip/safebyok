import { decorate, tattoo } from '../helpers'
import { type AttemptClosure, type GateProps, type PasskeyWayinRecord, type PassphraseWayinRecord, type ProofClosure, type ProvingWorld, type VaultStamp, type WayinHeader, gateProps, vaultStamp } from './models-shapes'
import { NOVEL, type PassphraseProving, Proving } from './proving'
import { Wayin } from './wayin'

// == [Gate]: build, novelWayins, attemptProof, pickle, toJSON

export class Gate {
  declare readonly passphrase_wayin: PassphraseWayinRecord
  declare readonly passkey_wayin:    PasskeyWayinRecord | null
  declare readonly ppWayin:          Wayin
  declare readonly pkWayin:          Wayin | null
  declare readonly stamp:            VaultStamp

  /** The gate of the vault `stamp` names, its wayins as `props` pickles them. */
  constructor(stamp: VaultStamp, props: unknown) {
    const checked = vaultStamp.parse(stamp)
    const { passphrase_wayin, passkey_wayin } = gateProps.parse(props)
    const ppWayin = new Wayin(passphrase_wayin)
    const pkWayin = passkey_wayin === null ? null : new Wayin(passkey_wayin)
    tattoo(this, { passphrase_wayin: ppWayin.pickle(), passkey_wayin: pkWayin?.pickle() ?? null }, { writable: false })
    decorate<Gate>(this, { ppWayin, pkWayin, stamp: checked })
    Object.freeze(this)
  }

  /** A novel gate for the vault `stamp` names, its wayins made from what `proofClosure` answers, beside the passphrase proving, which grants the vault its first lease. */
  static async build(stamp: VaultStamp, proofClosure: ProofClosure, world: ProvingWorld): Promise<{ gate: Gate, proving: PassphraseProving }> {
    const { proving, passphrase, passkey } = await Gate.#novelWayins(stamp, proofClosure, world)
    return { gate: new Gate(stamp, { passphrase_wayin: passphrase.pickle(), passkey_wayin: passkey?.pickle() ?? null }), proving }
  }

  static async #novelWayins(stamp: VaultStamp, proofClosure: ProofClosure, world: ProvingWorld): Promise<{ proving: PassphraseProving, passphrase: Wayin, passkey: Wayin | null }> {
    const { passphraseProving, passkeyProving } = await Proving.makeProvingPair(stamp, proofClosure, world)
    const passphrase = await passphraseProving.makeWayin(NOVEL)
    const passkey = passkeyProving === null ? null : await passkeyProving.makeWayin(passphraseProving)
    return { proving: passphraseProving, passphrase, passkey }
  }

  /** The proving of this gate's wayin that what `proofClosure` answers opens, as {@link Proving.attempt} makes it. */
  attemptProof(proofClosure: AttemptClosure, world: ProvingWorld): Promise<Proving> {
    return Proving.attempt(this.stamp, this.pickle(), proofClosure, world)
  }

  // not yet: revokePasskey, replacePassphrase, addPasskey, gate_epoch

  pickle(): GateProps {
    const { passphrase_wayin, passkey_wayin } = this
    return Object.freeze({ passphrase_wayin, passkey_wayin })
  }

  toJSON(): { passphrase_wayin: WayinHeader, passkey_wayin: WayinHeader | null } {
    return { passphrase_wayin: this.ppWayin.toJSON(), passkey_wayin: this.pkWayin?.toJSON() ?? null }
  }
}
// --
