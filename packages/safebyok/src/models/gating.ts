import type * as Z from 'zod'
import type { Consts } from 'safebyok-big/internals'
import { CX, Crypto, EX, Errors, GX, Helpers, Outcome, Throwers, Validator } from 'safebyok-big/internals'
import { Bank } from './bank'
import { Device } from './device'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from './proving'

// == [Kinds and forms]: gatingkindVals, Gatingkind, GatingSnapshot, CleartextsForGatingkind

/** The kinds of gating: what each asks the user to prove, and for what. */
export const gatingkindVals = ['birth_bank'] as const
export type Gatingkind = typeof gatingkindVals[number]

/** A gating as a host's dialog renders it: its kind, its token and its bank scope. */
export type GatingSnapshot = Omit<GX.GatingSnapshot, 'gatingkind'> & { gatingkind: Gatingkind }

/** What a dialog hands `attempt`, for each kind of gating. */
export interface CleartextsForGatingkind {
  birth_bank: Z.input<typeof GX.bankBuildCleartexts>
}
// --

// == [Given to a gating]: GatingAttempt, RequestCleartext, AskUser

/** An attempt's work: prove the user's cleartexts, then make the change its gating is for. */
export type GatingAttempt = (cleartexts: unknown) => Promise<Bank>

/** The host's dialog: show `gating`, and hand what the user types to `gating.attempt`. */
export type RequestCleartext = (gating: Gating) => unknown

/** The host's `requestCleartext`, guarded: it resolves true once the host's dialog returns, and false if it throws. */
export type AskUser = (gating: Gating) => Promise<boolean>

/** What {@link Gating.make} is given besides its record. */
export interface GatingOpts {
  /** The device the gating opens on. */
  device: Device
  /** The bank the gating is for; null for a `birth_bank` gating, whose bank does not exist yet. */
  bank:    Bank | null
  /** What each attempt runs on the cleartexts it is handed. */
  attempt: GatingAttempt
  /** The host's dialog, guarded, or null to wait for the host's own `attempt` or `dismiss`. */
  askUser: AskUser | null
}

/** What a gating is: its kind. */
export interface GatingRecord<KindT extends Gatingkind = Gatingkind> {
  gatingkind: KindT
}

// Defined here, not with the shapes: they name a model class.
/** The checks of {@link Gating.make}'s arguments. */
const Checks = Validator.Checkers('bad_option', ({ obj, fn, custom, oneof }) => ({
  gatingMakeArgs: obj({
    record: obj({ gatingkind: oneof(gatingkindVals) }),
    opts:   obj({ device: custom<Device>((val) => val instanceof Device, 'Expected a Device'), bank: custom<Bank | null>(), attempt: fn<GatingAttempt>(), askUser: fn<AskUser>().nullable() }),
  }),
}))

/** A request to the user for their passphrase or passkey, to birth, unlock, change or delete a bank.
 * A device has one open at a time. A dialog hands what the user typed to `attempt`, as often as the user corrects it,
 * and closes when `whenConcluded` resolves. The gating keeps no cleartext between attempts.
 */
export class Gating<KindT extends Gatingkind = Gatingkind> {
  // == [Props]: gatingkind, gatingTok, user_id, banklabel, bank, passkeyHeader, #device, #attempt, #askUser, #concluded, #conclude, #outcome, #isAttempting, #isLastAttempt

  declare readonly gatingkind:    KindT
  /** A random token unique to this gating.
   * Key the dialog on it, so that the next gating's form starts empty.
   */
  declare readonly gatingTok:     string
  declare readonly user_id:       string
  declare readonly banklabel:     string
  declare readonly bank:          Bank | null
  /** The header of the gate's passkey wayin at launch, or null for none.
   * The dialog asks for that passkey by its `credential_id` and `prf_salt_b64`.
   */
  declare readonly passkeyHeader: GX.WayinHeader | null

  /** The device this gating is open on, whose strength checker `judgeStrength` asks. */
  readonly #device:    Device
  readonly #attempt:   GatingAttempt
  readonly #askUser:   AskUser | null
  readonly #concluded: Promise<Outcome.Outcome<Bank>>
  #conclude:     (outcome: Outcome.Outcome<Bank>) => void = () => undefined
  #outcome:      Outcome.Outcome<Bank> | null = null
  #isAttempting  = false
  #isLastAttempt = false
  // --

  // == [Getters]: isOpen, whenConcluded, scope, toJSON

  /** True until this gating concludes. */
  get isOpen(): boolean { return this.#outcome === null }

  /** Resolves with the outcome once this gating concludes, and never rejects.
   * Close the dialog when it resolves.
   */
  get whenConcluded(): Promise<Outcome.Outcome<Bank>> { return this.#concluded }

  /** This gating's bank scope. */
  get scope(): CX.BankScope { return CX.bankScope.parse(this) }

  /** This gating's {@link GatingSnapshot}. It never shows a cleartext. */
  toJSON(): GatingSnapshot {
    const { gatingkind, gatingTok } = this
    return { gatingkind, gatingTok, ...this.scope }
  }
  // --

  // == [Construction and launch]: make, constructor, launch, askHost

  /** A gating of `record.gatingkind` on `opts.device`, not yet open: {@link launch} opens it. */
  static make<KindT extends Gatingkind>(record: GatingRecord<KindT>, opts: GatingOpts): Gating<KindT> { return new Gating(record, opts) }

  private constructor(record: GatingRecord<KindT>, opts: GatingOpts) {
    const { opts: { device, bank, attempt, askUser } } = Checks.gatingMakeArgs.parse({ record, opts })
    Helpers.tattoo(this, { gatingkind: record.gatingkind, gatingTok: Crypto.randomId(), user_id: device.user_id, banklabel: device.banklabel })
    Helpers.adorn(this, 'bank', bank)
    Helpers.adorn(this, 'passkeyHeader', bank?.maingate.passkey0?.toJSON() ?? null)
    this.#device    = device
    this.#attempt   = attempt
    this.#askUser   = askUser
    this.#concluded = new Promise((resolve) => { this.#conclude = resolve })
    Object.freeze(this)
  }

  /** Open this gating on its device and hand it to the host's dialog, resolving the bank once an attempt lands.
   * Refuses `already_asking` while another gating is open on the device.
   */
  async launch(): Promise<Bank> {
    // A gating concluded before its launch has nothing to ask: it rejects with its outcome, and never takes the device.
    if (this.#outcome !== null) { return Outcome.valOf(this.#outcome) }
    this.#device.attachGating(this)
    if (this.#askUser !== null) { void this.#askHost(this.#askUser) }
    return Outcome.valOf(await this.#concluded)
  }

  /** Hand this gating to the host's dialog, concluding it if the dialog returns or throws first */
  async #askHost(askUser: AskUser): Promise<void> {
    this.#endAsking((await askUser(this)) ? Throwers.gatingDismissed() : Throwers.requestCleartextThrew())
  }
  // --

  // == [The attempt]: judgeStrength, attempt, refusalOfAttempt, attemptOnce

  /** The strength checker's verdict on `passphraseClear`, for a dialog to show as the user types. */
  async judgeStrength(passphraseClear: string): Promise<GX.PassphraseVerdict> {
    return Proving.judgeStrength(passphraseClear, this.scope, this.#device)
  }

  /** Try what the user typed, resolving the outcome rather than throwing. Await one attempt before the next.
   * A refusal the user can correct, such as `wrong_passphrase`, leaves the gating open for another attempt.
   * Any other outcome concludes it. A passkey answer's PRF bytes are zeroed once handed in, except after a correctable
   * refusal: then hand them in again, or zero them yourself.
   */
  attempt(cleartexts: CleartextsForGatingkind[KindT]): Promise<Outcome.Outcome<Bank>> {
    const refusal = this.#refusalOfAttempt()
    if (refusal !== null) {
      // A cleartext is spent even when refused at the door.
      spendCleartexts(cleartexts)
      return Promise.resolve(Outcome.bad(refusal))
    }
    this.#isAttempting = true
    return this.#attemptOnce(cleartexts)
  }

  /** Why an attempt now would be refused, or null */
  #refusalOfAttempt(): Errors.VaultError | null {
    if (this.#outcome !== null) { return Throwers.gatingConcluded() }
    return this.#isAttempting ? Throwers.attemptInFlight() : null
  }

  /** Run the attempt's work on `cleartexts`, concluding unless the user can correct its refusal */
  async #attemptOnce(cleartexts: CleartextsForGatingkind[KindT]): Promise<Outcome.Outcome<Bank>> {
    const outcome = await Outcome.outcomeOf(() => this.#attempt(cleartexts))
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
  dismiss(): void { this.#endAsking(Throwers.gatingDismissed()) }

  /** Conclude with `refusal`, or, mid-attempt, make that attempt the last */
  #endAsking(refusal: Errors.VaultError): void {
    if (this.#isAttempting) {
      this.#isLastAttempt = true
      return
    }
    this.#concludeOnce(Outcome.bad(refusal))
  }

  /** Conclude with `outcome`, once, and let the device go */
  #concludeOnce(outcome: Outcome.Outcome<Bank>): void {
    if (this.#outcome !== null) { return }
    this.#outcome = outcome
    this.#device.detachGating(this)
    this.#conclude(outcome)
  }
  // --

  /** Always `'gating'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'gating' { return 'gating' satisfies Consts.Modelkind }
}

// == [The attempts]: birthBank

// Each attempt proves the cleartexts, then makes its change. A cleartext goes only to checkedCleartexts and a Proving
// builder, and a proving never leaves the attempt that built it.

/** Birth a bank of `device`'s scope from the user's passphrase and optional passkey, store it, and unlock it.
 * Refuses `gate_made_elsewhere` where a live bank is already stored there.
 */
export async function birthBank(device: Device, cleartexts: unknown): Promise<Bank> {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.bankBuildCleartexts, cleartexts)
  // A birth's stamps are minted here, one pair per attempt.
  const { bankStamp, gateStamp } = Bank.mintStamps(device)
  const passphraseProving = await PassphraseProving.buildNovel(bankStamp, gateStamp, passphraseClear, device)
  const passkeyProving    = passkeyClear ? await PasskeyProving.buildNovel(bankStamp, gateStamp, passkeyClear, device) : null

  const main     = await passphraseProving.buildWayin(NOVEL)
  const passkey0 = await passkeyProving?.buildWayin(passphraseProving) ?? null
  const bankRecord = Bank.makeRecord({ ...bankStamp, maingate: { ...gateStamp, wayins: { main, passkey0 } } })
  const bank = Bank.make(bankRecord, { device })

  try {
    await bank.put({ ifPresent: 'fail' })
  } catch (err) {
    // The user must hear that their passphrase was not set: the bank stored is another's.
    throw (Errors.listedKindOf(err) === 'camped') ? Throwers.gateMadeElsewhere() : err
  }
  return bank.unlockByProving(passphraseProving)
}
// --

// == [An attempt's helpers]: checkedCleartexts, isCorrectable, spendCleartexts

/** `cleartexts`, checked by `checker`.
 * A throw that is not a VaultError, as from a host's getter, is replaced by one that keeps nothing of it.
 */
function checkedCleartexts<CleartextsT>(checker: { parse: (cleartexts: unknown) => CleartextsT }, cleartexts: unknown): CleartextsT {
  try {
    return checker.parse(cleartexts)
  } catch (err) {
    throw Errors.isVaultError(err) ? err : Throwers.cleartextsThrew()
  }
}

/** True when the user can correct `err` and try again */
function isCorrectable(err: Errors.VaultError): boolean { return (EX.correctablekindVals as readonly string[]).includes(err.refusalkind) }

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
