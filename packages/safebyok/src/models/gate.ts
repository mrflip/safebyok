import * as RefusalFuncs from '../helpers/refusal-funcs'
import { decorate, tattoo } from '../helpers'
import * as CX from '../shapes/scopes'
import type { AttemptCleartexts, Cleartexts, GateProps, GateWorld, PasskeyAddCleartexts, PasskeyWayinRecord, PassphraseCleartexts, PassphraseReplaceCleartexts, PassphraseWayinRecord, ProvingWorld, VaultStamp, WayinHeader } from './models-shapes'
import * as MSX from './models-shapes'
import { NOVEL, PasskeyProving, PassphraseProving, Proving, checkStrength, spendAnswer } from './proving'
import { Wayin } from './wayin'

// == [Gate]: build, novelWayins, attemptProof, demandPasskeyAddable, demandPasskeyRevocable, withPassphraseReplaced, withPasskeyAdded, withPasskeyRevoked, pickle, toJSON

export class Gate {
  declare readonly passphrase_wayin: PassphraseWayinRecord
  declare readonly passkey_wayin:    PasskeyWayinRecord | null
  declare readonly ppWayin:          Wayin
  declare readonly pkWayin:          Wayin | null
  declare readonly stamp:            VaultStamp

  /** The gate of the vault `stamp` names, its wayins as `props` pickles them. */
  constructor(stamp: VaultStamp, props: unknown) {
    const checked = MSX.vaultStamp.parse(stamp)
    const { passphrase_wayin, passkey_wayin } = MSX.gateProps.parse(props)
    const ppWayin = new Wayin(passphrase_wayin)
    const pkWayin = passkey_wayin === null ? null : new Wayin(passkey_wayin)
    tattoo(this, { passphrase_wayin: ppWayin.pickle(), passkey_wayin: pkWayin?.pickle() ?? null }, { writable: false })
    decorate<Gate>(this, { ppWayin, pkWayin, stamp: checked })
    Object.freeze(this)
  }

  /** A novel gate for the vault `stamp` names, its wayins made from `cleartexts`, beside the passphrase proving, which grants the vault its first lease. The host's `strengthChecker` hears the passphrase first: a weak one refuses 'weak_passphrase'. */
  static async build(stamp: VaultStamp, cleartexts: Cleartexts, world: GateWorld): Promise<{ gate: Gate, proving: PassphraseProving }> {
    try {
      const checked = MSX.cleartexts.parse(cleartexts)
      await checkStrength(world.strengthChecker, checked.passphrase, CX.vaultScope.parse(stamp))
      const { proving, passphrase, passkey } = await Gate.#novelWayins(stamp, checked, world)
      return { gate: new Gate(stamp, { passphrase_wayin: passphrase.pickle(), passkey_wayin: passkey?.pickle() ?? null }), proving }
    } finally {
      spendAnswer(cleartexts)
    }
  }

  static async #novelWayins(stamp: VaultStamp, cleartexts: Cleartexts, world: ProvingWorld): Promise<{ proving: PassphraseProving, passphrase: Wayin, passkey: Wayin | null }> {
    const { passphraseProving, passkeyProving } = await Proving.makeProvingPair(stamp, cleartexts, world)
    const passphrase = await passphraseProving.makeWayin(NOVEL)
    const passkey = passkeyProving === null ? null : await passkeyProving.makeWayin(passphraseProving)
    return { proving: passphraseProving, passphrase, passkey }
  }

  /** The proving of this gate's wayin that `cleartexts` open, as {@link Proving.attempt} makes it. */
  attemptProof(cleartexts: AttemptCleartexts, world: ProvingWorld): Promise<Proving> {
    return Proving.attempt(this.stamp, this.pickle(), cleartexts, world)
  }

  /** Refuse 'bad_option' where this gate holds a passkey already: call it before asking the user for one. */
  demandPasskeyAddable(): this {
    if (this.pkWayin !== null) { throw RefusalFuncs.passkeyHeldAlready() }
    return this
  }

  /** Refuse 'absent_wayin' where this gate holds no passkey: call it before asking the user to revoke one. */
  demandPasskeyRevocable(): this {
    if (this.pkWayin === null) { throw RefusalFuncs.noPasskeyToRevoke() }
    return this
  }

  /** The props of the next gate, once `passphrase` proves this one: a passphrase wayin for `nextPassphrase`, sealed from that proving, and the passkey wayin as stored, as the vaultKey does not change. A next passphrase the same as the one handed refuses 'same_passphrase', and one the host's `strengthChecker` finds weak 'weak_passphrase', each before the proof. */
  async withPassphraseReplaced(cleartexts: PassphraseReplaceCleartexts, world: GateWorld): Promise<GateProps> {
    const { passphrase, nextPassphrase } = MSX.passphraseReplaceCleartexts.parse(cleartexts)
    if (passphrase === nextPassphrase) { throw RefusalFuncs.samePassphrase() }
    await checkStrength(world.strengthChecker, nextPassphrase, CX.vaultScope.parse(this.stamp))
    const proved = await this.attemptProof({ passphrase }, world)
    const proving = await PassphraseProving.make(this.stamp, world, nextPassphrase)
    const wayin = await proving.makeWayin(proved)
    return MSX.gateProps.parse({ passphrase_wayin: wayin.pickle(), passkey_wayin: this.passkey_wayin })
  }

  /** The props of the next gate, once `passphrase` proves this one: a passkey wayin for the passkey whose answer is handed in, sealed from that proving; the answer is spent either way (G2). A gate that holds a passkey refuses 'bad_option' before the proof. */
  async withPasskeyAdded(cleartexts: PasskeyAddCleartexts, world: ProvingWorld): Promise<GateProps> {
    try {
      this.demandPasskeyAddable()
      const { passphrase, passkeyAnswer } = MSX.passkeyAddCleartexts.parse(cleartexts)
      const proved = await this.attemptProof({ passphrase }, world)
      const proving = await PasskeyProving.make(this.stamp, world, passkeyAnswer)
      const passkey = await proving.makeWayin(proved)
      return MSX.gateProps.parse({ passphrase_wayin: this.passphrase_wayin, passkey_wayin: passkey.pickle() })
    } finally {
      spendAnswer(cleartexts)
    }
  }

  /** The props of the next gate, once `passphrase` proves this one: the passphrase wayin as stored, and no passkey wayin. A gate without a passkey refuses 'absent_wayin' before the proof. */
  async withPasskeyRevoked(cleartexts: PassphraseCleartexts, world: ProvingWorld): Promise<GateProps> {
    this.demandPasskeyRevocable()
    const { passphrase } = MSX.passphraseCleartexts.parse(cleartexts)
    await this.attemptProof({ passphrase }, world)
    return MSX.gateProps.parse({ passphrase_wayin: this.passphrase_wayin, passkey_wayin: null })
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
