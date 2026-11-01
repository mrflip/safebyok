import { Mutex } from 'es-toolkit'
import { Checkers } from '../checks/validator'
import { deferred } from '../helpers/deferred'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { adorn, tattoo } from '../helpers'
import { isVaultError } from '../errors'
import type { VaultLogger } from '../logger'
import { type Outcome, bad, good, outcomeOf, valOf } from '../outcome'
import * as VX from '../shapes/vault'
import * as CX from '../shapes/scopes'
import type { VaultScope } from '../shapes/scopes'
import type { CleartextsForGatingkind, GatingKind, PasskeyGatingKind, PasskeyWayinHeader, StrengthChecker, WayinKind } from './models-shapes'
import * as MSX from './models-shapes'
import { checkStrength, spendAnswerAfter } from './proving'
import { Storable } from './storable'
import type { Vault } from './vault'

// == [Given to a gating]: GatingWorld, RequestCleartext, AnyGating, GatingOpts, GatingSnapshot, Checks

/** The bank, as far as a gating needs it: the host's `requestCleartext` and `strengthChecker`, and the logger. */
export type GatingWorld = {
  requestCleartext: RequestCleartext
  strengthChecker:  StrengthChecker
  logger:           VaultLogger
}

/** The host's one place UI meets the vault: handed a {@link Gating}, it shows a dialog for its `gatingkind`, and resolves once the dialog closes.
 * Call the gating's `tryAttempt` on each submit, and on Cancel resolve, or call `decline()`. A
 * gating still open when this resolves is declined. It hears what the user types: keep it on the
 * device, and never log it. Whatever it throws refuses the gated call 'unexpected_error', which
 * carries none of it.
 *
 * @example
 *   const requestCleartext: RequestCleartext = async (gating) => {
 *     await showDialogFor(gating)   // resolves when the dialog closes
 *   }
 */
export type RequestCleartext = (gating: AnyGating) => unknown

/** A gating of any kind, narrowed by its `gatingkind`. */
export type AnyGating = { [KindT in GatingKind]: Gating<KindT> }[GatingKind]

/** How a gated verb launches a gating: the vault it is for, or null for one not yet built, the world it asks through, and `run`, the verb itself, handed each attempt's cleartexts. */
export type GatingOpts<KindT extends GatingKind = GatingKind> = {
  scope: VaultScope
  vault: Vault | null
  world: GatingWorld
  run:   (cleartexts: CleartextsForGatingkind[KindT]) => Promise<Vault>
}

/** A gating as the host's state wants it: its kind, the scope of its vault, and whether that vault has a passkey to offer, as the vault's snapshot shows it. */
export type GatingSnapshot = VaultScope & Readonly<{ gatingkind: GatingKind, hasPasskey: boolean }>

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ obj, fn, custom }) => ({
  gatingOpts: obj({
    scope: CX.vaultScope,
    vault: custom<Vault | null>((val) => val === null || val instanceof Storable, 'Expected a vault, or null'),
    world: MSX.gatingWorld,
    run:   fn<(cleartexts: unknown) => Promise<Vault>>(),
  }),
}))
// --

// == [Gating]: launch, isOpen, provedBy, attempt, attemptPasskey, decline, declineAtLock, checkStrength, toJSON, with the try forms of attempt, attemptPasskey and checkStrength

/** One request to the user for cleartext: a passphrase, or a passkey's answer, as its `gatingkind` needs.
 * A gated verb called without cleartexts launches one through {@link Gating.launch}, hands it to the
 * host's {@link RequestCleartext}, and awaits its settling. Each attempt runs the verb with what the
 * user typed. An attempt refused as correctable (a wrong passphrase or passkey, a weak or unchanged
 * passphrase) leaves the gating open for the next; any other outcome settles it, and the verb
 * answers that outcome. Attempts run one at a time, in the order made.
 */
export class Gating<KindT extends GatingKind = GatingKind> {
  declare readonly gatingkind:    KindT
  declare readonly applabel:      string
  declare readonly user_id:       string
  declare readonly vaultlabel:    string
  /** The vault the gating is for, or null for one the gating builds. */
  declare readonly vault:         Vault | null
  /** The vault's passkey header as the gating launched, for `askPasskey`; null where the vault has no passkey, or is not built yet. */
  declare readonly passkeyHeader: PasskeyWayinHeader | null

  readonly #world:   GatingWorld
  readonly #run:     (cleartexts: unknown) => Promise<Vault>
  readonly #settled = deferred<Outcome<Vault>>()
  #outcome:  Outcome<Vault> | null = null
  /** Held by each attempt, and by each settling the host or the launch asks for, so each waits its turn behind those begun before it. */
  readonly #turns = new Mutex()

  private constructor(gatingkind: KindT, opts: GatingOpts<KindT>) {
    const { scope, vault, world, run } = Checks.gatingOpts.parse(opts)
    tattoo(this, { gatingkind: MSX.gatingkind.parse(gatingkind) as KindT, ...scope }, { writable: false })
    adorn(this, 'vault', vault)
    adorn(this, 'passkeyHeader', vault === null ? null : vault.gate.passkeyHeader)
    this.#world = world as GatingWorld
    this.#run = run
    Object.freeze(this)
  }

  /** Ask the user for cleartext through the world's {@link RequestCleartext}, and resolve the vault once an attempt succeeds.
   * Answers as soon as the gating settles, the dialog open or not. Refuses 'declined' when the
   * user declines, or the host's dialog closes with the gating still open; 'unexpected_error' when
   * `requestCleartext` throws; and as the attempt refused when an attempt settles it.
   */
  static async launch<KindT extends GatingKind>(gatingkind: KindT, opts: GatingOpts<KindT>): Promise<Vault> {
    const gating = new Gating(gatingkind, opts)
    // The verb answers once the gating settles, whether or not the host's dialog has closed.
    void gating.#askHost()
    return valOf(await gating.#settled.promise)
  }

  /** True until an attempt, a decline or the host's dialog closing settles the gating. */
  get isOpen(): boolean { return this.#outcome === null }

  /** The wayins whose proof an attempt may hand in: none to build a vault, either to unlock one, and the passphrase alone to change its gate. */
  get provedBy(): readonly WayinKind[] { return MSX.ProvedByForGatingkind[this.gatingkind] }

  /** Run the gated verb with `cleartexts`, resolving the vault, after any attempt in flight.
   * A correctable refusal ('wrong_passphrase', 'wrong_passkey', 'weak_passphrase',
   * 'same_passphrase') leaves the gating open, and a passkey's answer unspent, for the host to hand
   * in again or zero; any other outcome settles the gating and spends the answer (G2). Once the
   * vault's passkey has changed since the gating launched, a 'wrong_passkey' refuses 'gate_moved'
   * instead: {@link Gating.passkeyHeader} names a passkey the vault no longer has. An attempt on a
   * gating settled refuses 'gating_landed'.
   */
  attempt(cleartexts: CleartextsForGatingkind[KindT]): Promise<Vault> {
    return spendAnswerAfter(cleartexts, async () => valOf(await this.#inTurn(() => this.#attemptOnce(cleartexts))))
  }

  /** The vault an attempt resolves, as an {@link Outcome}: the non-throwing form of {@link Gating.attempt}, as a dialog wants it. */
  tryAttempt(cleartexts: CleartextsForGatingkind[KindT]): Promise<Outcome<Vault>> { return outcomeOf(() => this.attempt(cleartexts)) }

  /** Run the gated verb with a passkey's answer, as `askPasskey` gives it for {@link Gating.passkeyHeader}: an {@link Gating.attempt} of `{ passkeyAnswer }`.
   * A gating no passkey proves (its `provedBy` says) refuses 'bad_option', attempting nothing and
   * leaving the gating open; the answer is spent all the same.
   */
  attemptPasskey(this: Gating<PasskeyGatingKind>, passkeyAnswer: VX.PasskeyAnswer): Promise<Vault> {
    return spendAnswerAfter({ passkeyAnswer }, () => {
      if (! this.provedBy.includes('passkey')) { throw RefusalFuncs.passkeyProvesNot() }
      return this.attempt({ passkeyAnswer })
    })
  }

  /** The vault a passkey's attempt resolves, as an {@link Outcome}: the non-throwing form of {@link Gating.attemptPasskey}. */
  tryAttemptPasskey(this: Gating<PasskeyGatingKind>, passkeyAnswer: VX.PasskeyAnswer): Promise<Outcome<Vault>> { return outcomeOf(() => this.attemptPasskey(passkeyAnswer)) }

  /** Settle the gating as declined, once any attempt in flight has run: the gated verb refuses 'declined'. A gating settled already stays as it settled. */
  decline(): void { this.#settleInTurn(bad(RefusalFuncs.gatingDeclined())) }

  /** Settle the gating as a lock of its vault declines it, once any attempt in flight has run: the gated verb refuses 'declined', saying the vault was locked. A gating settled already stays as it settled. */
  declineAtLock(): void { this.#settleInTurn(bad(RefusalFuncs.lockedWhileAsking())) }

  /** Hand `passphrase` to the host's `strengthChecker`, as an attempt would, without running the verb: a weak one refuses 'weak_passphrase', with the checker's reason. */
  checkStrength(passphrase: string): Promise<void> {
    return checkStrength(this.#world.strengthChecker, VX.passphraseCleartext.parse(passphrase), this.#scope())
  }

  /** The strength check as an {@link Outcome}: the non-throwing form of {@link Gating.checkStrength}. */
  tryCheckStrength(passphrase: string): Promise<Outcome<void>> { return outcomeOf(() => this.checkStrength(passphrase)) }

  async #attemptOnce(cleartexts: CleartextsForGatingkind[KindT]): Promise<Outcome<Vault>> {
    if (this.#outcome !== null) { return bad(RefusalFuncs.gatingSettled()) }
    const outcome = this.#judgedAgainstLaunch(await outcomeOf(() => this.#run(cleartexts)))
    if (outcome.ok || ! MSX.isCorrectable(outcome.err)) { this.#settleOnce(outcome) }
    return outcome
  }

  // A passkey refused by a vault whose passkey changed since launch is no slip the user can correct: the dialog asks for a passkey the vault no longer has.
  #judgedAgainstLaunch(outcome: Outcome<Vault>): Outcome<Vault> {
    if (outcome.ok || ! isVaultError(outcome.err, 'wrong_passkey') || ! this.#isPasskeyMovedSinceLaunch()) { return outcome }
    return bad(RefusalFuncs.passkeyMovedSinceLaunch())
  }

  #isPasskeyMovedSinceLaunch(): boolean {
    const { vault, passkeyHeader: launched } = this
    if (vault?.isFull !== true) { return false }
    const current = vault.gate.passkeyHeader
    return launched?.credential_id !== current?.credential_id || launched?.prf_salt_b64 !== current?.prf_salt_b64
  }

  // The dialog closing settles a gating still open, as a decline does.
  async #askHost(): Promise<void> {
    const heard = await tryHearRequestCleartext(this.#world.requestCleartext, this)
    this.#settleInTurn(heard.ok ? bad(RefusalFuncs.gatingDeclined()) : heard)
  }

  #settleInTurn(outcome: Outcome<Vault>): void {
    void this.#inTurn(() => { this.#settleOnce(outcome) })
  }

  // Neither step rejects: an attempt answers an Outcome, and a settling only records one.
  async #inTurn<ValT>(step: () => ValT | Promise<ValT>): Promise<ValT> {
    await this.#turns.acquire()
    try {
      return await step()
    } finally {
      this.#turns.release()
    }
  }

  #settleOnce(outcome: Outcome<Vault>): void {
    if (this.#outcome !== null) { return }
    this.#outcome = outcome
    this.#settled.resolve(outcome)
  }

  #scope(): VaultScope {
    const { applabel, user_id, vaultlabel } = this
    return { applabel, user_id, vaultlabel }
  }

  toJSON(): GatingSnapshot { return { gatingkind: this.gatingkind, ...this.#scope(), hasPasskey: this.passkeyHeader !== null } }
}
// --

// == [Host calls]: tryHearRequestCleartext

// The host function that hears the passphrase (guarantees.md, G1 and G8): what it throws may quote it, so it is replaced, not kept as a cause.
const tryHearRequestCleartext = async (requestCleartext: RequestCleartext, gating: Gating): Promise<Outcome<void>> => {
  try {
    await requestCleartext(gating)
    return good(undefined)
  } catch {
    return bad(RefusalFuncs.requestCleartextThrew())
  }
}
// --
