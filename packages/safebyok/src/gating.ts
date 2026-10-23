import { VaultError, isVaultError, type RefusalKind } from './errors'
import { Gate } from './gate'
import { type BadOutcome, type Outcome, bad, good } from './outcome'
import { PasskeyProving, PassphraseProving, type Proving, type ProvingGating, checkFreshSalt, checkedPasskeyAnswer, headerOf } from './proving'
import { type GatedVaultProps, type PasskeyAnswer, type Stamped, type VaultProps, isGated } from './types'
import type { Vault } from './vault'

/** Gatings: one request for cleartext, raised by a vault call that needs the user's passphrase or passkey, and the chain each attempt at it runs.
 * A gating owns its chain, by the rule that whoever touches a secret owns it: its attempt is where
 * the cleartext becomes a proving, and where the provings make the gate. The vault offers it
 * `putGate` and knows nothing of passphrases; the provings do the cryptography. One gating stands
 * per vault at a time, and it is handed to the host's `requestCleartext`.
 */

/** Each kind of gating, by the change its attempt makes: see {@link Gating}. */
export const GatingKindVals = ['initialize_gate', 'unlock_vault', 'change_passphrase', 'put_passkey', 'del_passkey', 'del_vault'] as const
/** The kind of a {@link Gating}: `initialize_gate`, `unlock_vault`, `change_passphrase`, `put_passkey`, `del_passkey` or `del_vault`. */
export type GatingKind = typeof GatingKindVals[number]

/** The refusals of this device's own store, which a grant after a change to the ways in only warns of. */
const DeviceStoreKinds: ReadonlySet<RefusalKind> = new Set(['storage_unavailable', 'storage_blocked'])

/** The refusals an attempt meets that the user can correct: the dialog shows each in place, and the gating stays open for the next attempt. */
export const CorrectableKindVals = ['wrong_passphrase', 'wrong_passkey', 'weak_passphrase', 'same_passphrase'] as const

/** The vault call a gating was raised by, as the logger names it. */
export type GatingCall = 'ensureUnlocked' | 'putWayin' | 'delWayin' | 'del'

/** What every gating carries, whatever its kind. */
type GatingCommon = {
  /** The vault asking, its fields live while the dialog is up. */
  readonly vault:      Vault
  /** Settles only when a `lock()` lands while the gating stands, or the vault goes gone: close the dialog. Every call waiting on it is then refused 'vault_locked'. */
  readonly lockLanded: Promise<void>
  /** Close the gating unanswered: every call waiting on it refuses 'vault_locked', and an attempt under way unlocks nothing. Declining is no lock: a lease in hand stands. A second call does nothing. */
  decline:             () => void
}

/** A novel vault asks for its first passphrase, and a passkey beside it if the host has one: offer strength advice. */
export type InitializeGateGating = GatingCommon & {
  readonly gatingkind: 'initialize_gate'
  /** Set the vault's first passphrase, and its passkey when given (an answer over a fresh salt, as `createPasskey` makes), and unlock it. */
  attempt:             (passphrase: string, passkey?: PasskeyAnswer) => Promise<Outcome<Vault>>
}
/** A locked vault asks for its passphrase or its passkey, to unlock it. */
export type UnlockVaultGating = GatingCommon & {
  readonly gatingkind: 'unlock_vault'
  /** Unlock with the passphrase. */
  attemptPassphrase:   (passphrase: string) => Promise<Outcome<Vault>>
  /** Unlock with the passkey's answer, as `askPasskey(vault.passkey)` gives it. */
  attemptPasskey:      (passkey: PasskeyAnswer) => Promise<Outcome<Vault>>
}
/** `putWayin('passphrase')` asks for the current passphrase and the next: the next replaces it, and the passkey goes with it. */
export type ChangePassphraseGating = GatingCommon & {
  readonly gatingkind: 'change_passphrase'
  /** Replace `current` with `next`, removing any passkey, and unlock under `next`. */
  attempt:             (current: string, next: string) => Promise<Outcome<Vault>>
}
/** `putWayin('passkey')` asks for the passphrase and a new passkey's answer: the passkey is added, or replaces the one standing. */
export type PutPasskeyGating = GatingCommon & {
  readonly gatingkind: 'put_passkey'
  /** Put the passkey, proven by the passphrase, and unlock. */
  attempt:             (passphrase: string, passkey: PasskeyAnswer) => Promise<Outcome<Vault>>
}
/** `delWayin('passkey')` asks for the passphrase, to remove the passkey. */
export type DelPasskeyGating = GatingCommon & {
  readonly gatingkind: 'del_passkey'
  /** Remove the passkey, proven by the passphrase, and unlock. */
  attempt:             (passphrase: string) => Promise<Outcome<Vault>>
}
/** `del()` asks for the passphrase, to delete the vault. */
export type DelVaultGating = GatingCommon & {
  readonly gatingkind: 'del_vault'
  /** Delete the vault, proven by the passphrase. The Vault object is then gone. */
  attempt:             (passphrase: string) => Promise<Outcome<Vault>>
}

/** One request for cleartext, handed to the host's {@link RequestCleartext}: a discriminated union on `gatingkind`, each kind carrying its one typed attempt beside `decline` and `lockLanded`.
 * Call the attempt on each submit. It runs the kind's whole chain and resolves the vault, or the
 * refusal. A refusal the user can correct ('wrong_passphrase', 'wrong_passkey',
 * 'weak_passphrase', 'same_passphrase') leaves the gating open: show it in place and ask again.
 * Any other outcome, success among them, settles the gating, and every call waiting on it hears
 * it: close the dialog. A second attempt while one runs refuses 'attempt_in_flight'; one after the
 * gating settled, 'gating_landed'. A malformed argument refuses 'bad_option', leaving it open.
 *
 * @example
 *   if (gating.gatingkind === 'unlock_vault') {
 *     const { ok, err } = await gating.attemptPassphrase(typed)
 *     if (! ok && err.refusalkind === 'wrong_passphrase') { showInPlace(err.message) }
 *   }
 * @example void gating.lockLanded.then(() => { closeDialog() })
 */
export type Gating = InitializeGateGating | UnlockVaultGating | ChangePassphraseGating | PutPasskeyGating | DelPasskeyGating | DelVaultGating

/** Your method, the one place UI meets the vault: handed a {@link Gating}, it shows a dialog for its `gatingkind`, and resolves once the dialog closes.
 * The vault raises a gating when a call needs the user's passphrase or passkey: `ensureUnlocked()`
 * on a locked or novel vault, `putWayin()`, `delWayin()` and `del()`. One stands at a time per
 * vault. Call the gating's attempt on each submit; on Cancel, resolve (or call `decline()`). A
 * gating still open when this resolves is declined: the call that raised it refuses
 * 'vault_locked'. It hears the passphrase the user types: keep it on the device, and never log it
 * or let it reach an error tracker. Whatever it throws refuses the call 'unexpected_error', and is
 * never logged.
 *
 * @example
 *   const requestCleartext: RequestCleartext = async (gating) => {
 *     if (navigator.userActivation?.isActive === false) { return }   // declined: no one to ask
 *     await showDialogFor(gating)   // resolves when the dialog closes
 *   }
 */
export type RequestCleartext = (gating: Gating) => void | Promise<void>

/** What a gating reaches of its Vault object inside the package, which no getter of the Vault object shows. */
export type GatingInside = {
  /** Read storage now through the refresh join, demand the Vault object stands and `gating` has not landed, and resolve the vault props in hand. */
  freshen:     (gating: RaisedGating) => Promise<VaultProps>
  /** Store `gate` over its base, `vault.putGate`, within the attempt's hold. */
  putGate:     (gate: Gate, call: GatingCall) => Promise<Gate>
  /** Delete the vault `proving` proved, expecting its `vault_tok` and `gate_epoch`, resolving the tombstone's `vault_epoch`. */
  delVault:    (proving: PassphraseProving) => Promise<number>
  /** Once the gating that deleted the vault settled: lock, let the Vault object go, and raise the device record to `vaultEpoch`. */
  afterDel:    (vaultEpoch: number) => Promise<void>
  /** Consult this device's store for a lease that fits, ending past `renewMillis` from now, and take it up: true when taken. */
  takeUp:      (gating: RaisedGating, renewMillis: number) => Promise<boolean>
  /** The refusal `thrown` makes, bad news told, as a public call's outcome. */
  badOutcome:  (thrown: unknown) => BadOutcome
  /** The vault's demand on `thing`, a refusal logged as `call`'s. */
  demand:      (thing: Stamped, call: GatingCall) => void
  /** The host's request for cleartext, guarded, or null for none. */
  request:     ((gating: Gating) => Promise<void>) | null
}

/** One gating, raised: what the vault keeps to run, join, settle and land it, and the {@link Gating} it hands the host.
 * It is the {@link ProvingGating} its provings are made for: `landed` once it settled, was declined,
 * or a lock landed.
 */
export class RaisedGating implements ProvingGating {
  /** The kind it was raised as. */
  readonly gatingkind: GatingKind
  /** The vault call that raised it, as the logger names it. */
  readonly call: GatingCall
  /** The one outcome every call waiting on it shares. */
  readonly settled: Promise<Outcome<void>>
  /** What the host is handed. */
  readonly gating: Gating
  readonly #vault: Vault
  readonly #inside: GatingInside
  readonly #onOver: () => void
  #settle: (outcome: Outcome<void>) => void = () => undefined
  #landLock: () => void = () => undefined
  #over = false
  #attempting = false

  private constructor(gatingkind: GatingKind, call: GatingCall, vault: Vault, inside: GatingInside, onOver: () => void) {
    this.gatingkind = gatingkind
    this.call = call
    this.#vault = vault
    this.#inside = inside
    this.#onOver = onOver
    this.settled = new Promise((settle) => { this.#settle = settle })
    const lockLanded = new Promise<void>((settle) => { this.#landLock = settle })
    this.gating = this.#gatingOf(lockLanded)
  }

  /** Raise a gating of `gatingkind` for `call`, not yet run: `onOver` hears it settle, before any waiter does. */
  static raise(gatingkind: GatingKind, call: GatingCall, vault: Vault, inside: GatingInside, onOver: () => void): RaisedGating {
    return new RaisedGating(gatingkind, call, vault, inside, onOver)
  }

  /** Run it, once the vault holds it as the gating standing: the pantry consult first when `renewMillis` is given, then the host's request. */
  run(renewMillis: number | null): void {
    void this.#run(renewMillis)
  }

  /** True once it settled, was declined, or a lock landed: its provings open nothing more. */
  get landed(): boolean { return this.#over }

  /** Settle it with `outcome`, once: every waiter hears it. Later settles do nothing. */
  settle(outcome: Outcome<void>): void {
    if (this.#over) { return }
    this.#over = true
    this.#onOver()
    this.#settle(outcome)
  }

  /** A `lock()` landed, or the vault went gone, while it stood: every waiter refuses 'vault_locked', or `told` when the lock was storage's refusal, and `lockLanded` settles. */
  landLock(told?: VaultError): void {
    // A deletion under way that a read finds landed -- its own write, heard before it answered --
    // is settled by its chain, which knows whether the write was its own.
    const ownDeletion = this.gatingkind === 'del_vault' && this.#attempting && told?.refusalkind === 'vault_gone'
    if (! ownDeletion) { this.settle(bad(told ?? lockLandedError())) }
    this.#landLock()
  }

  /** The pantry consult, then the host's request: a gating still open once the host's request resolves is declined. */
  async #run(renewMillis: number | null): Promise<void> {
    try {
      if (renewMillis !== null && await this.#inside.takeUp(this, renewMillis)) {
        this.settle(good(undefined))
        return
      }
      if (this.#over) { return }
      const { request } = this.#inside
      if (request === null) {
        this.settle(bad(declinedError(false)))
        return
      }
      await request(this.gating)
      this.settle(bad(declinedError(true)))
    } catch (err) {
      this.settle(this.#inside.badOutcome(err))
    }
  }

  /** One attempt: `check` the arguments, take the slot, run `chain`, and settle with what it made, unless the user can correct its refusal. */
  async #attempt(check: () => void, chain: () => Promise<void>): Promise<Outcome<Vault>> {
    if (this.#over) { return bad(gatingOverError()) }
    try {
      check()
    } catch (err) {
      return this.#inside.badOutcome(err)
    }
    if (this.#attempting) { return bad(attemptInFlightError()) }
    this.#attempting = true
    try {
      await chain()
      this.settle(good(undefined))
      return good(this.#vault)
    } catch (err) {
      const refused = this.#inside.badOutcome(err)
      if (! (CorrectableKindVals as readonly string[]).includes(refused.err.refusalkind)) { this.settle(refused) }
      return refused
    } finally {
      this.#attempting = false
    }
  }

  /** The {@link Gating} the host is handed, frozen: its kind's attempt, `decline` and `lockLanded`. */
  #gatingOf(lockLanded: Promise<void>): Gating {
    const common = { vault: this.#vault, lockLanded, decline: () => { this.settle(bad(declinedError(true))) } }
    // One attempt of the kind: its arguments checked, then its chain, each handed what the host handed in.
    const attemptOf = <ArgsT extends unknown[]>(check: (...args: ArgsT) => void, chain: (...args: ArgsT) => Promise<void>) => (
      async (...args: ArgsT): Promise<Outcome<Vault>> => await this.#attempt(() => { check(...args) }, async () => { await chain(...args) })
    )
    const byKind: { [KindT in GatingKind]: () => Extract<Gating, { gatingkind: KindT }> } = {
      initialize_gate: () => ({ ...common, gatingkind: 'initialize_gate', attempt: attemptOf(checkFirstGate, async (passphrase: string, passkey?: PasskeyAnswer) => { await this.#initializeGate(passphrase, passkey) }) }),
      unlock_vault:    () => ({
        ...common,
        gatingkind:        'unlock_vault',
        attemptPassphrase: attemptOf(checkText, async (passphrase: string) => { await this.#unlockByPassphrase(passphrase) }),
        attemptPasskey:    attemptOf(checkedPasskeyAnswer, async (passkey: PasskeyAnswer) => { await this.#unlockByPasskey(passkey) }),
      }),
      change_passphrase: () => ({ ...common, gatingkind: 'change_passphrase', attempt: attemptOf(checkTexts, async (current: string, next: string) => { await this.#changePassphrase(current, next) }) }),
      put_passkey:       () => ({ ...common, gatingkind: 'put_passkey', attempt: attemptOf(checkNewPasskey, async (passphrase: string, passkey: PasskeyAnswer) => { await this.#putPasskey(passphrase, passkey) }) }),
      del_passkey:       () => ({ ...common, gatingkind: 'del_passkey', attempt: attemptOf(checkText, async (passphrase: string) => { await this.#delPasskey(passphrase) }) }),
      del_vault:         () => ({ ...common, gatingkind: 'del_vault', attempt: attemptOf(checkText, async (passphrase: string) => { await this.#delVault(passphrase) }) }),
    }
    return Object.freeze(byKind[this.gatingkind]())
  }

  // == [Chains]: initializeGate, unlockByPassphrase, unlockByPasskey, changePassphrase, putPasskey, delPasskey, delVault, gatedOf

  // Each chain is a straight line, branching only on the state in hand at its start, which it
  // captures as the base its gate is built on. A demand sits inside every primitive, so none is
  // written between them; each opens with a read of storage through the refresh join.

  /** `initialize_gate`: the first gate, its passphrase wayin and its passkey's when given around a fresh vaultKey, stored at epoch 1, and the lease granted by the passphrase.
   * A gate found standing at the start, made elsewhere while the user typed, is 'gate_made_elsewhere'.
   * The strength check runs before any derivation, so a weak passphrase zeroes no passkey's answer.
   */
  async #initializeGate(passphrase: string, passkey: PasskeyAnswer | undefined): Promise<void> {
    const held = await this.#inside.freshen(this)
    if (isGated(held)) { throw gateMadeElsewhereError() }
    await this.#vault.checkStrength(passphrase)
    this.#inside.demand({ vault_tok: held.vault_tok, gate_epoch: held.gate_epoch }, this.call)
    const [passphraseProving, passkeyProving] = await Promise.all([
      PassphraseProving.seal(this.#vault, { slotlabel: 'passphrase' }, passphrase, { gating: this }),
      passkey === undefined ? undefined : PasskeyProving.seal(this.#vault, { slotlabel: 'passkey' }, passkey, { gating: this }),
    ])
    const wayins = await passphraseProving.sealWayins(passkeyProving)
    await this.#inside.putGate(Gate.make(this.#vault, { base: null, ...wayins }), this.call)
    await passphraseProving.grantLease()
  }

  /** `unlock_vault` by the passphrase: proven over the gate's passphrase wayin, then the lease granted. */
  async #unlockByPassphrase(passphrase: string): Promise<void> {
    const held = this.#gatedOf(await this.#inside.freshen(this))
    const proving = await PassphraseProving.seal(this.#vault, headerOf(held.passphrase), passphrase, { gating: this })
    await proving.grantLease()
  }

  /** `unlock_vault` by the passkey: proven over the gate's passkey wayin, then the lease granted; 'absent_wayin' when the vault has none. */
  async #unlockByPasskey(passkey: PasskeyAnswer): Promise<void> {
    const held = this.#gatedOf(await this.#inside.freshen(this))
    if (held.passkey === null) { throw absentPasskey("Unlock with the passphrase.") }
    const proving = await PasskeyProving.seal(this.#vault, headerOf(held.passkey), passkey, { gating: this })
    await proving.grantLease()
  }

  /** `change_passphrase`: `next` replaces `current`, the passkey dropped as ever, the gate stored at epoch + 1, and the lease granted by the new passphrase.
   * `current === next` is 'same_passphrase' before anything, and the strength check runs before any
   * derivation. The current passphrase is sealed and checked before the next is sealed, so a typo,
   * or a passphrase stored damaged, costs no second derivation: the seals share no junction.
   */
  async #changePassphrase(current: string, next: string): Promise<void> {
    // Two strings this tab's user typed, which no attacker observes: no constant time needed.
    if (current === next) { throw samePassphraseError() }
    const held = this.#gatedOf(await this.#inside.freshen(this))
    const base = Gate.of(this.#vault, held)
    await this.#vault.checkStrength(next)
    this.#inside.demand(base, this.call)
    const currentProving = await PassphraseProving.seal(this.#vault, headerOf(held.passphrase), current, { gating: this })
    await currentProving.checkWayin()
    const newProving = await PassphraseProving.seal(this.#vault, { slotlabel: 'passphrase' }, next, { gating: this })
    const wayin = await currentProving.resealWayinFor(newProving)
    await this.#inside.putGate(Gate.make(this.#vault, { base, passphrase: wayin as typeof base.passphrase, passkey: null }), this.call)
    await this.#grantAfterChange(newProving)
  }

  /** `put_passkey`: the passkey added or replaced, proven by the passphrase, the gate stored at epoch + 1, and the lease granted by the passphrase.
   * The passphrase is checked before the passkey's answer is sealed, so a typo returns to the dialog
   * with the answer unspent; the seals do not share a junction.
   */
  async #putPasskey(passphrase: string, passkey: PasskeyAnswer): Promise<void> {
    const held = this.#gatedOf(await this.#inside.freshen(this))
    const base = Gate.of(this.#vault, held)
    const passphraseProving = await PassphraseProving.seal(this.#vault, headerOf(held.passphrase), passphrase, { gating: this })
    await passphraseProving.checkWayin()
    const passkeyProving = await PasskeyProving.seal(this.#vault, { slotlabel: 'passkey' }, passkey, { gating: this })
    const wayin = await passphraseProving.resealWayinFor(passkeyProving)
    await this.#inside.putGate(Gate.make(this.#vault, { base, passphrase: base.passphrase, passkey: wayin as NonNullable<typeof base.passkey> }), this.call)
    await this.#grantAfterChange(passphraseProving)
  }

  /** `del_passkey`: the passkey removed, proven by the passphrase, whose wayin stays and grants the lease; 'absent_wayin' when the vault has none. */
  async #delPasskey(passphrase: string): Promise<void> {
    const held = this.#gatedOf(await this.#inside.freshen(this))
    if (held.passkey === null) { throw absentPasskey('Nothing was changed.') }
    const base = Gate.of(this.#vault, held)
    const proving = await PassphraseProving.seal(this.#vault, headerOf(held.passphrase), passphrase, { gating: this })
    await proving.checkWayin()
    await this.#inside.putGate(Gate.make(this.#vault, { base, passphrase: base.passphrase, passkey: null }), this.call)
    await this.#grantAfterChange(proving)
  }

  /** `del_vault`: the vault deleted, proven by the passphrase, leaving its tombstone; the gating settles with success, and then the vault locks and goes. */
  async #delVault(passphrase: string): Promise<void> {
    const held = this.#gatedOf(await this.#inside.freshen(this))
    const proving = await PassphraseProving.seal(this.#vault, headerOf(held.passphrase), passphrase, { gating: this })
    await proving.checkWayin()
    const vaultEpoch = await this.#inside.delVault(proving)
    this.settle(good(undefined))
    await this.#inside.afterDel(vaultEpoch)
  }

  /** Grant the lease by `proving` once a change to the ways in has landed, as today's contract has it: a grant the device store refuses is said through the logger, never thrown as though the change had not landed.
   * A grant a lock or a decline stopped (`gating_landed`), or the vault moving on, still throws:
   * the gating is over, and its waiters heard so already.
   */
  async #grantAfterChange(proving: Proving): Promise<void> {
    try {
      await proving.grantLease()
    } catch (err) {
      if (! isVaultError(err) || ! DeviceStoreKinds.has(err.refusalkind)) { throw err }
      this.#vault.logger.warn("The change to the vault's ways in landed in storage, but this device could not take up its unlock afresh: it stands locked here, and asks for the passphrase at its next open.", { call: this.call }, err)
    }
  }

  /** `held`, once gated: a gating other than `initialize_gate` is raised only on a vault with its gate, and a gate never goes. */
  #gatedOf(held: VaultProps): GatedVaultProps {
    if (! isGated(held)) { throw new VaultError('absent_vault', 'This vault has no passphrase yet, so nothing can prove this change: unlock it first, which sets its passphrase.') }
    return held
  }
  // --
}

// == [Refusals]: checkText, checkTexts, checkNewPasskey, checkFirstGate, declinedError, lockLandedError, gatingOverError, attemptInFlightError, samePassphraseError, gateMadeElsewhereError, absentPasskey

/** Refuse 'bad_option' for a passphrase that is not text, quoting none of it. */
const checkText = (given: unknown): void => {
  if (typeof given !== 'string') { throw new VaultError('bad_option', 'A passphrase is the text the user typed, as a string.') }
}

/** Refuse 'bad_option' unless both passphrases are text. */
const checkTexts = (current: unknown, next: unknown): void => {
  checkText(current)
  checkText(next)
}

/** Refuse 'bad_option' unless the passphrase is text and the passkey's answer one a new passkey gives, over a fresh salt. */
const checkNewPasskey = (passphrase: unknown, passkey: unknown): void => {
  checkText(passphrase)
  checkFreshSalt(checkedPasskeyAnswer(passkey))
}

/** Refuse 'bad_option' unless the first passphrase is text and the passkey's answer, when given, one a new passkey gives. */
const checkFirstGate = (passphrase: unknown, passkey?: unknown): void => {
  checkText(passphrase)
  if (passkey !== undefined) { checkFreshSalt(checkedPasskeyAnswer(passkey)) }
}

/** The refusal of a call whose gating was declined: by the user, or for want of a `requestCleartext` to ask. */
export const declinedError = (asked: boolean): VaultError => new VaultError('vault_locked', asked
  ? 'The vault is locked, and the user declined to unlock it: nothing was read or written. Ask again when they want the vault.'
  : 'The vault is locked, and there is no requestCleartext to ask the user (Bank.make was given none): nothing was read or written. Hand Bank.make a requestCleartext that shows a dialog.')

const lockLandedError = () => new VaultError('vault_locked', 'The vault was locked while it was asking for a passphrase, so nothing was unlocked and the dialog is over. Ask again when the user wants the vault.')

const gatingOverError = () => new VaultError('gating_landed', 'This dialog is over -- it was answered, declined, or a lock landed -- so this attempt was not tried, and nothing was changed. Ask again when the user wants the vault.')

const attemptInFlightError = () => new VaultError('attempt_in_flight', 'An attempt is already under way in this dialog, so this one was not tried: wait for it to finish, as disabling the submit button while it runs does.')

const samePassphraseError = () => new VaultError('same_passphrase', 'The new passphrase is the one the vault already has: choose a different one.')

const gateMadeElsewhereError = () => new VaultError('gate_made_elsewhere', "This vault's passphrase was just set on another device, so the one you entered was not set here, and nothing was changed. Enter the passphrase chosen there to unlock it.")

const absentPasskey = (then: string) => new VaultError('absent_wayin', `This vault has no passkey: it may have been removed on another device. ${then}`)
// --
