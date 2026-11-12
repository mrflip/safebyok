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
import type { AnyGating, AskUser, BankForGatingkind, BankGatingkind, CleartextsForGatingkind, GatingSnapshot, ProvingWorld, UnlockByProving, WayinHeader } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import { attemptInFlight, cleartextsThrew, gateMadeElsewhere, gatingDismissed, gatingConcluded, requestCleartextThrew, samePassphrase } from '../refusals/throwers'
import type { Bank } from './bank'
import type { BankListing } from './bank-listing'
import type { Device } from './device'
import { Gate } from './gate'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from './proving'

/** What an attempt does with the user's cleartexts: prove them, and make the change its gating is for. */
type Act = (cleartexts: unknown) => Promise<Bank>

/** One ask of the user, one open per device. It has the cleartexts only for the length of an attempt, and concludes once: its launcher answers with that outcome. */
export class Gating<KindT extends Gatingkind = Gatingkind> {
  // == [Props]: gatingkind, gatingTok, user_id, banklabel, bank, passkeyHeader, #device, #act, #concluded, #conclude, #outcome, #isAttempting, #isLastAttempt

  declare readonly gatingkind:    KindT
  /** Unique to this gating, for a dialog to key on: the next gating's form starts empty, whatever was typed in this one. */
  declare readonly gatingTok:     string
  declare readonly user_id:       string
  declare readonly banklabel:     string
  declare readonly bank:          BankForGatingkind[KindT]
  /** The header of the passkey wayin in the gate at launch, for the dialog to ask that passkey; null with none. */
  declare readonly passkeyHeader: WayinHeader | null

  /** The device the gating is open on, and the proving world of its acts. */
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

  /** The outcome once concluded, a promise that never rejects: a dialog closes on it, as the package cannot close a host's dialog. */
  get whenConcluded(): Promise<Outcome<Bank>> { return this.#concluded }

  get #scope(): BankScope {
    const { user_id, banklabel } = this
    return { user_id, banklabel }
  }

  /** This gating's {@link GatingSnapshot}: its kind, token and bank scope, never a cleartext. */
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
  /** Ask the user to prove they may make the change `gatingkind` names to `bank`, and answer the bank once it is made. */
  static async launchOn(bank: Bank, gatingkind: BankGatingkind, unlockByProving: UnlockByProving, askUser: AskUser | null): Promise<Bank> {
    const checked = GX.gatingLaunchOnArgs.parse({ gatingkind, bank, unlockByProving, askUser })
    const act: Act = (cleartexts) => Gating.#callGatingByKind(checked.gatingkind, checked.bank, cleartexts, checked.unlockByProving)
    const gating = new Gating(checked.gatingkind, checked.bank.device, checked.bank, act)
    return gating.#launch(checked.askUser)
  }

  /** Ask the user for a new bank's passphrase, build the bank over the row `expected`, and return it unlocked. */
  static async launchBirth(listing: BankListing, expected: BankSparse, unlockByProving: UnlockByProving, askUser: AskUser | null): Promise<Bank> {
    const checked = GX.gatingLaunchBirthArgs.parse({ listing, expected, unlockByProving, askUser })
    const world = GX.provingWorld.parse(checked.listing.device)
    const act: Act = (cleartexts) => buildBank(checked.listing, world, checked.expected, cleartexts, checked.unlockByProving)
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

  /** The verdict on a passphrase, as the user types it. Nothing changes. */
  async judgeStrength(passphraseClear: string): Promise<GX.PassphraseVerdict> {
    return Proving.judgeStrength(GX.passphraseCleartext.parse(passphraseClear), this.#scope, GX.provingWorld.parse(this.#device))
  }

  /** SLOPDOC: The one door for a cleartext: tries what the user typed once, and answers how it went as an Outcome. */
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

  /** End the asking with nothing proved: the gating concludes `dismissed`, or on the outcome of an attempt under way. */
  dismiss(): void { this.#endAsking(gatingDismissed()) }

  /** End the gating. If mid-attempt, let it continue but take no further attempt; otherwise, conclude using the given refusal. */
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

  /** Answers 'gating', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'gating' { return 'gating' satisfies Modelkind }
}

// == [The acts]: buildBank, unlockBank, replacePassphrase, addPasskey, revokePasskey, delBank, ActOnBank

// Each act proves the cleartexts, then makes its change. A cleartext goes only to checkedCleartexts and a Proving builder (G1); the
// change hears provings, and comes to the bank's private unlock by unlockByProving (G9).

/** Build a bank over `expected` using the passphrase and (if given) passkey, each proved in `world`; unlock once built. */
async function buildBank(listing: BankListing, world: ProvingWorld, expected: BankSparse, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.bankBuildCleartexts, cleartexts)
  // A birth's stamps are minted here, one pair per attempt.
  const { bank, gate }    = listing.stampsOfBirth()
  const passphraseProving = await PassphraseProving.buildNovel(bank, gate, passphraseClear, world)
  const passkeyProving    = passkeyClear ? await PasskeyProving.buildNovel(bank, gate, passkeyClear, world) : null

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

/** Replace the passphrase of `bank`, proved by the one it has. */
async function replacePassphrase(bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { antePassphraseClear, nextPassphraseClear } = checkedCleartexts(GX.passphraseReplaceCleartexts, cleartexts)
  if (antePassphraseClear === nextPassphraseClear) { throw samePassphrase() }
  const { ante, gate } = await timelyAnte(bank)
  const anteProving = await PassphraseProving.buildStored(gate, antePassphraseClear, bank)
  const nextProving = await PassphraseProving.buildNovel(bank.stamp, gate.stamp, nextPassphraseClear, bank)

  const nextWayin = await nextProving.buildWayin(anteProving)
  const written   = await bank.gateListing.replacePassphrase(ante, BX.passphraseWayin.parse(nextWayin.pickle()))
  return unlockByProving(bank, anteProving, written)
}

/** Add a passkey to `bank`, proved by its passphrase. */
async function addPasskey(bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.passkeyAddCleartexts, cleartexts)
  const { ante, gate } = await timelyAnte(bank)
  const proved         = await PassphraseProving.buildStored(gate, passphraseClear, bank)
  const passkeyProving = await PasskeyProving.buildNovel(bank.stamp, gate.stamp, passkeyClear, bank)

  const passkeyWayin = await passkeyProving.buildWayin(proved)
  const written      = await bank.gateListing.addPasskey(ante, BX.passkeyWayin.parse(passkeyWayin.pickle()))
  return unlockByProving(bank, proved, written)
}

/** Revoke the passkey of `bank`, proved by its passphrase. */
async function revokePasskey(bank: Bank, cleartexts: unknown, unlockByProving: UnlockByProving): Promise<Bank> {
  const { passphraseClear } = checkedCleartexts(GX.passkeyRevokeCleartexts, cleartexts)
  const { ante, gate } = await timelyAnte(bank)
  const proved = await PassphraseProving.buildStored(gate, passphraseClear, bank)

  const written = await bank.gateListing.revokePasskey(ante)
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
  await bank.listing.delBank(ante)
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

/** The main gate of `bank`, refreshed promptly, the bank enabled and present. */
async function timelyGate(bank: Bank): Promise<Gate> {
  const gate = await bank.maingate.ensureTimely(VX.Promptly); bank.demandPromptable()
  return gate
}

/** The main gate of `bank`, refreshed promptly, and its record as it stands then: what a gate verb expects to find. */
async function timelyAnte(bank: Bank): Promise<{ ante: GateRecord, gate: Gate }> {
  const gate = await timelyGate(bank)
  return { ante: gate.pickle(), gate }
}

/** The cleartexts through their checker. A throw that is not one of this library's is replaced whole, keeping nothing of it (G8). */
function checkedCleartexts<CleartextsT>(checker: { parse: (cleartexts: unknown) => CleartextsT }, cleartexts: unknown): CleartextsT {
  try {
    return checker.parse(cleartexts)
  } catch (err) {
    throw isVaultError(err) ? err : cleartextsThrew()
  }
}

function isCorrectable(err: VaultError): boolean { return (EX.correctablekindVals as readonly string[]).includes(err.refusalkind) }

/** Zero a passkey answer's PRF bytes wherever `cleartexts` carries them (G2). */
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
