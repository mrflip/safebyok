import type { Modelkind } from '../helpers/consts'
import { VaultError, isVaultError } from '../refusals/errors'
import { randomId } from '../helpers/crypto'
import { adorn, tattoo } from '../helpers/helpers'
import { type Outcome, bad, outcomeOf, valOf } from '../refusals/outcome'
import * as EX from '../shapes/shapes-enums'
import type { Gatingkind } from '../shapes/shapes-enums'
import type { BankScope } from '../shapes/shapes-core'
import * as BX from '../shapes/shapes-bankdb'
import type { BankSparse, GateRecord } from '../shapes/shapes-bankdb'
import * as GX from '../shapes/shapes-gateish'
import type { AnyGating, AskUser, BankForGatingkind, BankGatingkind, CleartextsForGatingkind, GatingSnapshot, ProvingDevice, UnlockByProving, WayinHeader } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import { attemptInFlight, cleartextsThrew, gateMadeElsewhere, gatingDismissed, gatingConcluded, requestCleartextThrew, samePassphrase } from '../refusals/throwers'
import type { Bank } from './bank'
import type { BankListing } from './bank-listing'
import type { Device } from './device'
import { Gate } from './gate'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from './proving'

/** An attempt's work: prove the user's cleartexts, then make the change its gating is for. */
type Act = (cleartexts: unknown) => Promise<Bank>

/** A request to the user for their passphrase or passkey, to build, unlock, change or delete a bank.
 * A device has one open at a time. A dialog hands what the user typed to `attempt`, as often as the user corrects it,
 * and closes when `whenConcluded` resolves. The gating keeps no cleartext between attempts.
 */
export class Gating<KindT extends Gatingkind = Gatingkind> {
  // == [Props]: gatingkind, gatingTok, user_id, banklabel, bank, passkeyHeader, #device, #act, #concluded, #conclude, #outcome, #isAttempting, #isLastAttempt

  declare readonly gatingkind:    KindT
  /** A random token unique to this gating.
   * Key the dialog on it, so that the next gating's form starts empty.
   */
  declare readonly gatingTok:     string
  declare readonly user_id:       string
  declare readonly banklabel:     string
  declare readonly bank:          BankForGatingkind[KindT]
  /** The header of the gate's passkey wayin at launch, or null for none.
   * The dialog asks for that passkey by its `credential_id` and `prf_salt_b64`.
   */
  declare readonly passkeyHeader: WayinHeader | null

  /** The device this gating is open on, whose strength checker `judgeStrength` asks. */
  readonly #device:     Device
  readonly #act:        Act
  readonly #concluded:  Promise<Outcome<Bank>>
  #conclude:      (outcome: Outcome<Bank>) => void = () => undefined
  #outcome:       Outcome<Bank> | null = null
  #isAttempting  = false
  #isLastAttempt = false
  // --

  // == [Getters]: isOpen, whenConcluded, scope, toJSON

  /** True until this gating concludes. */
  get isOpen(): boolean { return this.#outcome === null }

  /** Resolves with the outcome once this gating concludes, and never rejects.
   * Close the dialog when it resolves.
   */
  get whenConcluded(): Promise<Outcome<Bank>> { return this.#concluded }

  get #scope(): BankScope {
    const { user_id, banklabel } = this
    return { user_id, banklabel }
  }

  /** This gating's {@link GatingSnapshot}: its kind, token and bank scope. It never shows a cleartext. */
  toJSON(): GatingSnapshot {
    const { gatingkind, gatingTok } = this
    return { gatingkind, gatingTok, ...this.#scope }
  }
  // --

  // == [Launching]: constructor, launchOn, launchBirth, callGatingByKind, launch, askHost

  private constructor(gatingkind: KindT, device: Device, bank: BankForGatingkind[KindT], act: Act) {
    tattoo(this, { gatingkind, gatingTok: randomId(), ...device.scope })
    adorn(this, 'bank', bank)
    adorn(this, 'passkeyHeader', bank?.maingate.passkey0?.toJSON() ?? null)
    this.#device    = device
    this.#act       = act
    this.#concluded = new Promise((resolve) => { this.#conclude = resolve })
    Object.freeze(this)
  }

  // The package exports Gating as a type only: these take the bank's unlockByProving, which a gating hands a proving.
  /** Ask the user to prove they may make the `gatingkind` change to `bank`, make it, and resolve the bank. */
  static async launchOn(bank: Bank, gatingkind: BankGatingkind, unlockByProving: UnlockByProving, askUser: AskUser | null): Promise<Bank> {
    const checked = GX.gatingLaunchOnArgs.parse({ gatingkind, bank, unlockByProving, askUser })
    const act: Act = (cleartexts) => Gating.#callGatingByKind(checked.gatingkind, checked.bank, cleartexts, checked.unlockByProving)
    const gating = new Gating(checked.gatingkind, checked.bank.device, checked.bank, act)
    return gating.#launch(checked.askUser)
  }

  /** Ask the user for a new bank's passphrase and optional passkey, build the bank over `expected`, and resolve it unlocked.
   * Throws `gate_made_elsewhere` when another device built the bank first: the user's passphrase was not set.
   */
  static async launchBirth(listing: BankListing, expected: BankSparse, unlockByProving: UnlockByProving, askUser: AskUser | null): Promise<Bank> {
    const checked = GX.gatingLaunchBirthArgs.parse({ listing, expected, unlockByProving, askUser })
    const provingDevice = GX.provingDevice.parse(checked.listing.device)
    const act: Act = (cleartexts) => buildBank(checked.listing, provingDevice, checked.expected, cleartexts, checked.unlockByProving)
    const gating = new Gating('build_bank', checked.listing.device, null, act)
    return gating.#launch(checked.askUser)
  }

  static #callGatingByKind(gatingkind: BankGatingkind, bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
    return ActOnBank[gatingkind](bank, cleartexts, unlockByProving)
  }

  async #launch(askUser: AskUser | null): Promise<Bank> {
    this.#device.attachGating(this as unknown as AnyGating)
    if (askUser !== null) { void this.#askHost(askUser) }
    return valOf(await this.#concluded)
  }

  async #askHost(askUser: AskUser): Promise<void> {
    this.#endAsking((await askUser(this as unknown as AnyGating)) ? gatingDismissed() : requestCleartextThrew())
  }
  // --

  // == [The attempt]: judgeStrength, attempt, refusalOfAttempt, attemptOnce

  /** The strength checker's verdict on `passphraseClear`, for a dialog to show as the user types. */
  async judgeStrength(passphraseClear: string): Promise<GX.PassphraseVerdict> {
    return Proving.judgeStrength(GX.passphraseCleartext.parse(passphraseClear), this.#scope, GX.provingDevice.parse(this.#device))
  }

  /** Try what the user typed, resolving the outcome rather than throwing. Await one attempt before the next.
   * A refusal the user can correct, such as `wrong_passphrase`, leaves the gating open for another attempt.
   * Any other outcome concludes it. A passkey answer's PRF bytes are zeroed once handed in, except after a correctable
   * refusal: then hand them in again, or zero them yourself.
   */
  attempt(cleartexts: CleartextsForGatingkind[Gatingkind]): Promise<Outcome<Bank>> {
    const refusal = this.#refusalOfAttempt()
    if (refusal !== null) {
      // A cleartext is spent even when refused at the door.
      spendCleartexts(cleartexts)
      return Promise.resolve(bad(refusal))
    }
    this.#isAttempting = true
    return this.#attemptOnce(cleartexts)
  }

  #refusalOfAttempt(): VaultError | null {
    if (this.#outcome !== null) { return gatingConcluded() }
    return this.#isAttempting ? attemptInFlight() : null
  }

  async #attemptOnce(cleartexts: CleartextsForGatingkind[Gatingkind]): Promise<Outcome<Bank>> {
    const outcome = await outcomeOf(() => this.#act(cleartexts))
    this.#isAttempting = false
    // A correctable refusal, short of the last attempt, leaves the cleartexts unspent for the next.
    if (outcome.ok || (! isCorrectable(outcome.err)) || this.#isLastAttempt) {
      spendCleartexts(cleartexts)
      this.#concludeOnce(outcome)
    }
    return outcome
  }
  // --

  // == [Concluding]: dismiss, endAsking, concludeOnce

  /** Close this gating without a proof.
   * It concludes `dismissed`, or, if an attempt is under way, with that attempt's outcome.
   */
  dismiss(): void { this.#endAsking(gatingDismissed()) }

  /** Conclude with `refusal`, or, mid-attempt, make that attempt the last */
  #endAsking(refusal: VaultError): void {
    if (this.#isAttempting) {
      this.#isLastAttempt = true
      return
    }
    this.#concludeOnce(bad(refusal))
  }

  #concludeOnce(outcome: Outcome<Bank>): void {
    if (this.#outcome !== null) { return }
    this.#outcome = outcome
    this.#device.detachGating()
    this.#conclude(outcome)
  }
  // --

  /** Always `'gating'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'gating' { return 'gating' satisfies Modelkind }
}

// == [The acts]: buildBank, unlockBank, replacePassphrase, addPasskey, revokePasskey, delBank, ActOnBank

// Each act proves the cleartexts, then makes its change. A cleartext goes only to checkedCleartexts and a Proving builder (G1); the
// change hears provings, and comes to the bank's private unlock by unlockByProving (G9).

/** Build a bank over `expected` from the user's passphrase and optional passkey, and unlock it. */
async function buildBank(listing: BankListing, provingDevice: ProvingDevice, expected: BankSparse, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.bankBuildCleartexts, cleartexts)
  // A birth's stamps are minted here, one pair per attempt.
  const { bank, gate }    = listing.stampsOfBirth()
  const passphraseProving = await PassphraseProving.buildNovel(bank, gate, passphraseClear, provingDevice)
  const passkeyProving    = passkeyClear ? await PasskeyProving.buildNovel(bank, gate, passkeyClear, provingDevice) : null

  const passphraseWayin = await passphraseProving.buildWayin(NOVEL)
  const passkeyWayin    = await passkeyProving?.buildWayin(passphraseProving) ?? null
  const gateRecord = Gate.recordOfBirth(bank, gate, passphraseWayin, passkeyWayin)
  const built      = await listing.build(listing.recordOfBirth(bank, expected), gateRecord, expected)

  // The bank stored may be another's, built first: this proving unwraps only its own, and the user must hear that theirs was not set.
  if (built.bank_tok !== bank.bank_tok) { throw gateMadeElsewhere() }
  return unlockByProving(built, passphraseProving)
}

/** Unlock `bank` by the passphrase or the passkey. */
async function unlockBank(bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.bankUnlockCleartexts, cleartexts)
  const gate = await timelyGate(bank)
  const proved = (passphraseClear === undefined)
    ? await PasskeyProving.buildStored(gate, passkeyClear)
    : await PassphraseProving.buildStored(gate, passphraseClear, bank)
  return unlockByProving(bank, proved)
}

// Each gate change grants a lease to the bank citing the gate row it wrote, not a newer one that arrived meanwhile. The
// old lease stays in force for the moments between: the bankKey did not change.

/** Replace the passphrase of `bank`, proved by the current one. */
async function replacePassphrase(bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { antePassphraseClear, nextPassphraseClear } = checkedCleartexts(GX.passphraseReplaceCleartexts, cleartexts)
  if (antePassphraseClear === nextPassphraseClear) { throw samePassphrase() }
  const { ante, gate } = await timelyAnte(bank)
  const anteProving = await PassphraseProving.buildStored(gate, antePassphraseClear, bank)
  const nextProving = await PassphraseProving.buildNovel(bank.stamp, gate.stamp, nextPassphraseClear, bank)

  const nextWayin = await nextProving.buildWayin(anteProving)
  const written   = await bank.gateListing.putGate(ante, { ...ante.wayins, main: BX.passphraseWayin.parse(nextWayin.pickle()) }, { policies: ['replace_passphrase'] })
  return unlockByProving(bank, anteProving, written)
}

/** Add a passkey to `bank`, proved by its passphrase. */
async function addPasskey(bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.passkeyAddCleartexts, cleartexts)
  const { ante, gate } = await timelyAnte(bank)
  gate.demandPasskeyAddable()
  const proved         = await PassphraseProving.buildStored(gate, passphraseClear, bank)
  const passkeyProving = await PasskeyProving.buildNovel(bank.stamp, gate.stamp, passkeyClear, bank)

  const passkeyWayin = await passkeyProving.buildWayin(proved)
  const written      = await bank.gateListing.putGate(ante, { ...ante.wayins, passkey0: BX.passkeyWayin.parse(passkeyWayin.pickle()) }, { policies: ['add_passkey'] })
  return unlockByProving(bank, proved, written)
}

/** Revoke the passkey of `bank`, proved by its passphrase. */
async function revokePasskey(bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { passphraseClear } = checkedCleartexts(GX.passkeyRevokeCleartexts, cleartexts)
  const { ante, gate } = await timelyAnte(bank)
  const proved = await PassphraseProving.buildStored(gate, passphraseClear, bank)

  const written = await bank.gateListing.putGate(ante, { main: ante.wayins.main }, { policies: ['revoke_passkey'] })
  return unlockByProving(bank, proved, written)
}

/** Delete `bank`, proved by its passphrase. */
async function delBank(bank: Bank, cleartexts: unknown): Promise<Bank> {
  const { passphraseClear } = checkedCleartexts(GX.bankDelCleartexts, cleartexts)
  const gate = await timelyGate(bank)
  const ante = bank.sparse
  await PassphraseProving.buildStored(gate, passphraseClear, bank)

  // The lock first: no box unseals under a lease while the tombstone goes out. The delete goes over the bank row the
  // proving's gate came with, and the tombstone delivered vacates the gate and the vaults.
  bank.lock()
  await bank.listing.del(ante)
  return bank
}

const ActOnBank: Record<BankGatingkind, (bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving) => Promise<Bank>> = {
  unlock_bank:        unlockBank,
  replace_passphrase: replacePassphrase,
  add_passkey:        addPasskey,
  revoke_passkey:     revokePasskey,
  del_bank:           delBank,
}
// --

// == [An act's helpers]: timelyGate, timelyAnte, checkedCleartexts, isCorrectable, spendCleartexts

/** The main gate of `bank`, refreshed promptly. Throws unless the bank is enabled and present. */
async function timelyGate(bank: Bank): Promise<Gate> {
  const gate = await bank.maingate.ensureTimely(VX.Promptly); bank.demandEnabled()
  return gate
}

/** The main gate of `bank`, refreshed promptly, and its current record as `ante`: the row a gate change expects to replace. */
async function timelyAnte(bank: Bank): Promise<{ ante: GateRecord, gate: Gate }> {
  const gate = await timelyGate(bank)
  return { ante: gate.pickle(), gate }
}

/** `cleartexts`, checked by `checker`.
 * A throw that is not a VaultError, as from a host's getter, is replaced by one that keeps nothing of it (G8).
 */
function checkedCleartexts<CleartextsT>(checker: { parse: (cleartexts: unknown) => CleartextsT }, cleartexts: unknown): CleartextsT {
  try {
    return checker.parse(cleartexts)
  } catch (err) {
    throw isVaultError(err) ? err : cleartextsThrew()
  }
}

function isCorrectable(err: VaultError): boolean { return (EX.correctablekindVals as readonly string[]).includes(err.refusalkind) }

/** Zero the PRF bytes of the passkey answer in `cleartexts`, if it has one (G2). */
function spendCleartexts(cleartexts: unknown): void {
  // The reach-in may meet a getter or a proxy of the host's, which may throw: spending is best effort, and never replaces the outcome it follows.
  // The cleartexts may be unchecked, as at the door, so nothing about them is assumed. An answer is single-use: once zeroed, a
  // second hand-in is refused by its all-zero bytes.
  try {
    const prfBytes: unknown = (cleartexts as { passkeyClear?: { prfBytes?: unknown } | null } | null)?.passkeyClear?.prfBytes
    // A view, of this realm or another's (an iframe, jsdom): ArrayBuffer.isView reads the internal slot, where instanceof would miss it.
    if (ArrayBuffer.isView(prfBytes)) { new Uint8Array(prfBytes.buffer, prfBytes.byteOffset, prfBytes.byteLength).fill(0) }
    // A bare ArrayBuffer, as WebAuthn hands the PRF output, judged by its tag for the same reason.
    if (Object.prototype.toString.call(prfBytes) === '[object ArrayBuffer]') { new Uint8Array(prfBytes as ArrayBuffer).fill(0) }
  } catch { /* nothing left to spend */ }
}
// --
