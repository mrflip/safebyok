import { Checkers } from '../checks/validator'
import { VaultError } from '../errors'
import { decorate, tattoo } from '../helpers'
import * as Phrases from '../phrases'
import { type AttemptClosure, type GateProps, type PasskeyClosure, type PasskeyWayinRecord, type PassphraseClosure, type PassphraseWayinRecord, type ProofClosure, type ProvingWorld, type VaultStamp, type WayinHeader, FirstGateEpoch, attemptCleartexts, cleartexts, gateAttemptArgs, gateBuildArgs, gateProps, passkeyAddArgs, passkeyCleartexts, passkeyRevokeArgs, passphraseCleartexts, passphraseReplaceArgs, vaultStamp } from './models-shapes'
import { NOVEL, PasskeyProving, PassphraseProving, type Proving } from './proving'
import { Wayin } from './wayin'

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ obj, custom }) => {
  const wayin = custom<Wayin>((val) => val instanceof Wayin, 'Expected a Wayin')
  return { gateMakeArgs: obj({ passphraseWayin: wayin, passkeyWayin: wayin.nullable() }) }
})

// == [Gate forms]: GateChange

/** The props of a next gate, and the proving of the gate it follows: what renews a lease under the next epoch. */
export type GateChange = { gate: GateProps, proved: PassphraseProving }
// --

// == [Gate]: make, build, attemptProof, provePassphrase, demandPasskeyAddable, withPassphraseReplaced, withPasskeyAdded, withPasskeyRevoked, pickle, toJSON

/** The wayins of a vault's record as of one `gate_epoch`, a read-only view: a change to them is made and landed elsewhere, and a new `Gate` read from the record that lands. */
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

  /** A first gate for the vault `stamp` names, its wayins made from what `proofClosure` answers, beside the passphrase proving, which grants the vault its first lease. */
  static async build(stamp: VaultStamp, proofClosure: ProofClosure, world: ProvingWorld): Promise<{ gate: Gate, proving: PassphraseProving }> {
    const { stamp: checked } = gateBuildArgs.parse({ stamp, proofClosure, world })
    return hearing(proofClosure, async (handed) => {
      const { passphrase, passkeyAnswer } = cleartexts.parse(handed)
      const proving = await PassphraseProving.buildNovel(checked, passphrase, world)
      const passkeyProving = passkeyAnswer ? await PasskeyProving.buildNovel(checked, passkeyAnswer, world) : null
      const passphraseWayin = await proving.buildWayin(NOVEL)
      const passkeyWayin = passkeyProving === null ? null : await passkeyProving.buildWayin(proving)
      return { gate: this.make(checked, passphraseWayin, passkeyWayin), proving }
    })
  }

  /** The proving of this gate's wayin that what `proofClosure` answers opens: the passphrase's where it hands one, else the passkey's. What it answers refuses as {@link PassphraseProving.buildStored} and {@link PasskeyProving.buildStored} do, and a passkey's answer is spent whatever follows. */
  async attemptProof(proofClosure: AttemptClosure, world: ProvingWorld): Promise<Proving> {
    gateAttemptArgs.parse({ proofClosure, world })
    return await hearing(proofClosure, async (handed) => {
      const { passphrase, passkeyAnswer } = attemptCleartexts.parse(handed)
      if (passphrase !== undefined) { return PassphraseProving.buildStored(this, passphrase, world) }
      return PasskeyProving.buildStored(this, passkeyAnswer!)
    })
  }

  /** Ask the proof through `attemptProof` and answer the proving where it is the passphrase's: a change to the gate is proved by the passphrase alone, so a passkey's answer that opens refuses 'bad_option', spent. */
  async #provePassphrase(proofClosure: AttemptClosure, world: ProvingWorld): Promise<PassphraseProving> {
    const proved = await this.attemptProof(proofClosure, world)
    if (! (proved instanceof PassphraseProving)) { throw changeNeedsPassphrase() }
    return proved
  }

  /** Refuses 'bad_option' where this gate holds a passkey: the one check before anyone is asked for one. */
  demandPasskeyAddable(): void {
    if (this.pkWayin !== null) { throw passkeyHeldAlready() }
  }

  /** The props of the next gate and the proof of this one, once `proofClosure` proves it by its passphrase: a passphrase wayin for the passphrase `passphraseClosure` answers, sealed from that proving, and the passkey wayin as stored, as the vaultKey does not change. */
  async withPassphraseReplaced(proofClosure: AttemptClosure, passphraseClosure: PassphraseClosure, world: ProvingWorld): Promise<GateChange> {
    passphraseReplaceArgs.parse({ proofClosure, passphraseClosure })
    const proved = await this.#provePassphrase(proofClosure, world)
    const proving = await hearing(passphraseClosure, (handed) => PassphraseProving.buildNovel(this.stamp, passphraseCleartexts.parse(handed).passphrase, world))
    const passphrase = await proving.buildWayin(proved)
    return { gate: gateProps.parse({ gate_epoch: this.gate_epoch + 1, passphrase_wayin: passphrase.pickle(), passkey_wayin: this.passkey_wayin }), proved }
  }

  /** The props of the next gate and the proof of this one, once `proofClosure` proves it by its passphrase: a passkey wayin for the passkey whose answer `passkeyClosure` hands in, sealed from that proving. A gate that holds a passkey refuses 'bad_option' before asking anything. */
  async withPasskeyAdded(proofClosure: AttemptClosure, passkeyClosure: PasskeyClosure, world: ProvingWorld): Promise<GateChange> {
    passkeyAddArgs.parse({ proofClosure, passkeyClosure })
    this.demandPasskeyAddable()
    const proved = await this.#provePassphrase(proofClosure, world)
    const proving = await hearing(passkeyClosure, (handed) => PasskeyProving.buildNovel(this.stamp, passkeyCleartexts.parse(handed).passkeyAnswer, world))
    const passkey = await proving.buildWayin(proved)
    return { gate: gateProps.parse({ gate_epoch: this.gate_epoch + 1, passphrase_wayin: this.passphrase_wayin, passkey_wayin: passkey.pickle() }), proved }
  }

  /** The props of the next gate and the proof of this one, once `proofClosure` proves it by its passphrase: the passphrase wayin as stored, and no passkey wayin. A gate without a passkey refuses 'absent_wayin' before asking anything. */
  async withPasskeyRevoked(proofClosure: AttemptClosure, world: ProvingWorld): Promise<GateChange> {
    passkeyRevokeArgs.parse({ proofClosure })
    if (this.pkWayin === null) { throw noPasskeyToRevoke() }
    const proved = await this.#provePassphrase(proofClosure, world)
    return { gate: gateProps.parse({ gate_epoch: this.gate_epoch + 1, passphrase_wayin: this.passphrase_wayin, passkey_wayin: null }), proved }
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

// == [Hearing a closure]: hearing, invokeClosure, spendAnswer

/** What `use` makes of what `closure` answers, which is spent whatever follows (G2). What the closure throws is replaced, not kept as a cause, as it heard the passphrase (G8). */
const hearing = async <ValT>(closure: ProofClosure | AttemptClosure | PassphraseClosure | PasskeyClosure, use: (handed: unknown) => Promise<ValT>): Promise<ValT> => {
  const handed = await invokeClosure(closure)
  try {
    return await use(handed)
  } finally {
    spendAnswer(handed)
  }
}

const invokeClosure = async (closure: ProofClosure | AttemptClosure | PassphraseClosure | PasskeyClosure): Promise<unknown> => {
  try {
    return await closure()
  } catch {
    throw proofClosureThrew()
  }
}

/** Zero a passkey answer's PRF bytes wherever the closure's answer carries them, checked or not: an answer is single-use (G2). */
const spendAnswer = (handed: unknown): void => {
  // The reach-in may meet a getter or a proxy of the host's, which may throw: spending is best effort, and never replaces the refusal or the proving it follows.
  try {
    const prfBytes: unknown = (handed as { passkeyAnswer?: { prfBytes?: unknown } | null } | null)?.passkeyAnswer?.prfBytes
    if (prfBytes instanceof Uint8Array) { prfBytes.fill(0) }
  } catch { /* nothing left to spend */ }
}
// --

// == [Refusals]: changeNeedsPassphrase, passkeyHeldAlready, noPasskeyToRevoke, proofClosureThrew

const changeNeedsPassphrase = (): VaultError => new VaultError('bad_option', Phrases.GateChangeNeedsPassphrase)

const passkeyHeldAlready = (): VaultError => new VaultError('bad_option', Phrases.PasskeyHeldAlready)

const noPasskeyToRevoke = (): VaultError => new VaultError('absent_wayin', Phrases.NoPasskeyToRevoke)

const proofClosureThrew = (): VaultError => new VaultError('unexpected_error', Phrases.ProofClosureThrew)
// --
