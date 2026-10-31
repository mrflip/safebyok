import { VaultError } from '../errors'
import { decorate, tattoo } from '../helpers'
import * as Phrases from '../phrases'
import { type AttemptClosure, type GateProps, type PasskeyClosure, type PasskeyWayinRecord, type PassphraseClosure, type PassphraseWayinRecord, type ProofClosure, type ProvingWorld, type VaultStamp, type WayinHeader, gateProps, passkeyAddArgs, passkeyRevokeArgs, passphraseReplaceArgs, vaultStamp } from './models-shapes'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from './proving'
import { Wayin } from './wayin'

// == [Gate]: build, novelWayins, attemptProof, withPassphraseReplaced, withPasskeyAdded, withPasskeyRevoked, pickle, toJSON

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

  /** The props of the next gate, once `proofClosure` proves this one: a passphrase wayin for the passphrase `passphraseClosure` answers, sealed from the proving that opened, and the passkey wayin as stored, as the vaultKey does not change. */
  async withPassphraseReplaced(proofClosure: AttemptClosure, passphraseClosure: PassphraseClosure, world: ProvingWorld): Promise<GateProps> {
    passphraseReplaceArgs.parse({ proofClosure, passphraseClosure })
    const proved = await this.attemptProof(proofClosure, world)
    // not yet: the strengthChecker's verdict on the new passphrase, once the world carries one
    const proving = await PassphraseProving.makeFromClosure(this.stamp, passphraseClosure, world)
    const passphrase = await proving.makeWayin(proved)
    return gateProps.parse({ passphrase_wayin: passphrase.pickle(), passkey_wayin: this.passkey_wayin })
  }

  /** The props of the next gate, once `proofClosure` proves this one: a passkey wayin for the passkey whose answer `passkeyClosure` hands in, sealed from the proving that opened. A gate that holds a passkey refuses 'bad_option' before asking anything. */
  async withPasskeyAdded(proofClosure: AttemptClosure, passkeyClosure: PasskeyClosure, world: ProvingWorld): Promise<GateProps> {
    passkeyAddArgs.parse({ proofClosure, passkeyClosure })
    if (this.pkWayin !== null) { throw passkeyHeldAlready() }
    const proved = await this.attemptProof(proofClosure, world)
    const proving = await PasskeyProving.makeFromClosure(this.stamp, passkeyClosure, world)
    const passkey = await proving.makeWayin(proved)
    return gateProps.parse({ passphrase_wayin: this.passphrase_wayin, passkey_wayin: passkey.pickle() })
  }

  /** The props of the next gate, once `proofClosure` proves this one: the passphrase wayin as stored, and no passkey wayin. A gate without a passkey refuses 'absent_wayin' before asking anything. */
  async withPasskeyRevoked(proofClosure: AttemptClosure, world: ProvingWorld): Promise<GateProps> {
    passkeyRevokeArgs.parse({ proofClosure })
    if (this.pkWayin === null) { throw noPasskeyToRevoke() }
    await this.attemptProof(proofClosure, world)
    return gateProps.parse({ passphrase_wayin: this.passphrase_wayin, passkey_wayin: null })
  }

  // not yet: gate_epoch

  pickle(): GateProps {
    const { passphrase_wayin, passkey_wayin } = this
    return Object.freeze({ passphrase_wayin, passkey_wayin })
  }

  toJSON(): { passphrase_wayin: WayinHeader, passkey_wayin: WayinHeader | null } {
    return { passphrase_wayin: this.ppWayin.toJSON(), passkey_wayin: this.pkWayin?.toJSON() ?? null }
  }
}
// --

// == [Refusals]: passkeyHeldAlready, noPasskeyToRevoke

const passkeyHeldAlready = (): VaultError => new VaultError('bad_option', Phrases.PasskeyHeldAlready)

const noPasskeyToRevoke = (): VaultError => new VaultError('absent_wayin', Phrases.NoPasskeyToRevoke)
// --
