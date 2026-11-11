import type { Modelkind } from '../helpers/consts'
import { VaultError, isVaultError } from '../refusals/errors'
import { randomId } from '../helpers/crypto'
import { adorn, tattoo } from '../helpers/helpers'
import { type Outcome, bad, outcomeOf, valOf } from '../refusals/outcome'
import * as EX from '../shapes/shapes-enums'
import type { Gatingkind } from '../shapes/shapes-enums'
import type { VaultScope } from '../shapes/shapes-core'
import * as GX from '../shapes/shapes-gateish'
import type { AnyGating, AskUser, CleartextsForGatingkind, GatingSnapshot, UnlockByProof, VaultForGatingkind, VaultGatingkind, WayinHeader } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import * as SX from '../shapes/shapes-storage'
import type { VaultRecord, VaultSparse } from '../shapes/shapes-storage'
import { attemptInFlight, cleartextsThrew, gateMadeElsewhere, gatingDismissed, gatingConcluded, requestCleartextThrew, samePassphrase } from '../refusals/throwers'
import { Gate } from './gate'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from './proving'
import type { Vault } from './vault'
import type { VaultListing } from './vault-listing'

/** What an attempt does with the user's cleartexts: prove them, and make the change its gating is for. */
type Act = (cleartexts: unknown) => Promise<Vault>

/** One ask of the user, one open per bank. It has the cleartexts only for the length of an attempt, and concludes once: its launcher answers with that outcome. */
export class Gating<KindT extends Gatingkind = Gatingkind> {
  // == [Props]: gatingkind, gatingTok, applabel, user_id, vaultlabel, vault, passkeyHeader, #listing, #act, #concluded, #conclude, #outcome, #isAttempting, #isLastAttempt

  declare readonly gatingkind:    KindT
  /** Unique to this gating, for a dialog to key on: the next gating's form starts empty, whatever was typed in this one. */
  declare readonly gatingTok:     string
  declare readonly applabel:      string
  declare readonly user_id:       string
  declare readonly vaultlabel:    string
  declare readonly vault:         VaultForGatingkind[KindT]
  /** The header of the passkey wayin in the gate at launch, for the dialog to ask that passkey; null with none. */
  declare readonly passkeyHeader: WayinHeader | null

  readonly #listing:    VaultListing
  readonly #act:        Act
  readonly #concluded:  Promise<Outcome<Vault>>
  #conclude:      (outcome: Outcome<Vault>) => void = () => undefined
  #outcome:       Outcome<Vault> | null = null
  #isAttempting  = false
  #isLastAttempt = false
  // --

  // == [Getters]: isOpen, whenConcluded, scope, toJSON

  /** True until this gating concludes. */
  get isOpen(): boolean { return this.#outcome === null }

  /** The outcome once concluded, a promise that never rejects: a dialog closes on it, as the package cannot close a host's dialog. */
  get whenConcluded(): Promise<Outcome<Vault>> { return this.#concluded }

  get #scope(): VaultScope {
    const { applabel, user_id, vaultlabel } = this
    return { applabel, user_id, vaultlabel }
  }

  /** This gating's {@link GatingSnapshot}: its kind, token and vault scope, never a cleartext. */
  toJSON(): GatingSnapshot {
    const { gatingkind, gatingTok } = this
    return { gatingkind, gatingTok, ...this.#scope }
  }
  // --

  // == [Launching]: constructor, launchOn, launchBirth, callGatingByKind, launch, askHost

  private constructor(gatingkind: KindT, listing: VaultListing, scope: VaultScope, vault: VaultForGatingkind[KindT], act: Act) {
    tattoo(this, { gatingkind, gatingTok: randomId(), ...scope })
    adorn(this, 'vault', vault)
    adorn(this, 'passkeyHeader', vault?.gate.toJSON().passkey_wayin ?? null)
    this.#listing   = listing
    this.#act       = act
    this.#concluded = new Promise((resolve) => { this.#conclude = resolve })
    Object.freeze(this)
  }

  // The package exports Gating as a type only: these take the vault's unlockByProof, which a gating hands a proving.
  /** Ask the user to prove they may make the change `gatingkind` names to `vault`, and answer the vault once it is made. */
  static async launchOn(vault: Vault, gatingkind: VaultGatingkind, unlockByProof: UnlockByProof, askUser: AskUser | null): Promise<Vault> {
    const checked = GX.gatingLaunchOnArgs.parse({ gatingkind, vault, unlockByProof, askUser })
    const act: Act = (cleartexts) => Gating.#callGatingByKind(checked.gatingkind, checked.vault, cleartexts, checked.unlockByProof)
    const gating = new Gating(checked.gatingkind, checked.vault.listing, checked.vault.scope, checked.vault, act)
    return gating.#launch(checked.askUser)
  }

  /** Ask the user for a new vault's passphrase, build the vault under `scope` over the row `expected`, and return it unlocked. */
  static async launchBirth(listing: VaultListing, scope: VaultScope, expected: VaultSparse, unlockByProof: UnlockByProof, askUser: AskUser | null): Promise<Vault> {
    const checked = GX.gatingLaunchBirthArgs.parse({ listing, scope, expected, unlockByProof, askUser })
    const act: Act = (cleartexts) => buildVault(checked.listing, checked.scope, checked.expected, cleartexts, checked.unlockByProof)
    const gating = new Gating('build_vault', checked.listing, checked.scope, null, act)
    return gating.#launch(checked.askUser)
  }

  static #callGatingByKind(gatingkind: VaultGatingkind, vault: Vault, cleartexts: unknown, unlockByProof: UnlockByProof): Promise<Vault> {
    return ActOnVault[gatingkind](vault, cleartexts, unlockByProof)
  }

  async #launch(askUser: AskUser | null): Promise<Vault> {
    this.#listing.attachGating(this as unknown as AnyGating)
    if (askUser !== null) { void this.#askHost(askUser) }
    return valOf(await this.#concluded)
  }

  async #askHost(askUser: AskUser): Promise<void> {
    this.#endAsking((await askUser(this as unknown as AnyGating)) ? gatingDismissed() : requestCleartextThrew())
  }
  // --

  // == [The attempt]: checkStrength, attempt, refusalOfAttempt, attemptOnce

  /** The verdict on a passphrase, as the user types it. Nothing changes. */
  async checkStrength(passphraseClear: string): Promise<GX.PassphraseVerdict> {
    return Proving.checkStrength(GX.passphraseCleartext.parse(passphraseClear), this.#scope, this.#listing.world)
  }

  /** SLOPDOC: The one door for a cleartext: tries what the user typed once, and answers how it went as an Outcome. */
  attempt(cleartexts: CleartextsForGatingkind[Gatingkind]): Promise<Outcome<Vault>> {
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

  async #attemptOnce(cleartexts: CleartextsForGatingkind[Gatingkind]): Promise<Outcome<Vault>> {
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

  #concludeOnce(outcome: Outcome<Vault>): void {
    if (this.#outcome !== null) { return }
    this.#outcome = outcome
    this.#listing.detachGating()
    this.#conclude(outcome)
  }
  // --

  /** Answers 'gating', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'gating' { return 'gating' satisfies Modelkind }
}

// == [The acts]: buildVault, unlockVault, replacePassphrase, addPasskey, revokePasskey, delVault, ActOnVault

// Each act proves the cleartexts, then makes its change. A cleartext goes only to checkedCleartexts and a Proving builder (G1); the
// change hears provings, and comes to the vault's private unlock by unlockByProof (G9).

/** Build a vault under `scope` using the passphrase and (if given) passkey; unlock once built. */
const buildVault = async (listing: VaultListing, scope: VaultScope, expected: VaultSparse, cleartexts: unknown, unlockByProof: UnlockByProof): Promise<Vault> => {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.vaultBuildCleartexts, cleartexts)
  // A birth's stamp is minted here, one per attempt.
  const stamp             = listing.stampOfBirth(scope)
  const passphraseProving = await PassphraseProving.buildNovel(stamp, passphraseClear, listing.world)
  const passkeyProving    = passkeyClear ? await PasskeyProving.buildNovel(stamp, passkeyClear, listing.world) : null

  const passphraseWayin = await passphraseProving.buildWayin(NOVEL)
  const passkeyWayin    = await passkeyProving?.buildWayin(passphraseProving) ?? null
  const gate   = Gate.make(passphraseProving.stamp, passphraseWayin, passkeyWayin)
  const record = listing.recordOfBirth(gate, expected)
  const vault  = await listing.put(record, { expected, ifAbsent: 'add', ifPresent: 'get' })

  // The row stored may be another's, born first: this proof opens only its own, and the user must hear that theirs was not set.
  if (vault.vault_tok !== record.vault_tok) { throw gateMadeElsewhere() }
  return unlockByProof(vault, passphraseProving)
}

/** Unlock `vault` by the passphrase or the passkey. */
const unlockVault = async (vault: Vault, cleartexts: unknown, unlockByProof: UnlockByProof): Promise<Vault> => {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.vaultUnlockCleartexts, cleartexts)
  await vault.ensureTimely(VX.Promptly); vault.demandPromptable()
  const proved = (passphraseClear === undefined)
    ? await PasskeyProving.buildStored(vault.gate, passkeyClear)
    : await PassphraseProving.buildStored(vault.gate, passphraseClear, vault.world)
  return unlockByProof(vault, proved)
}

// Each gate change grants a lease to the vault under the epoch it wrote. The old lease stays in force for the moments between: the vaultKey did not change.

/** Replace the passphrase of `vault`, proved by the one it has. */
const replacePassphrase = async (vault: Vault, cleartexts: unknown, unlockByProof: UnlockByProof): Promise<Vault> => {
  const { antePassphraseClear, nextPassphraseClear } = checkedCleartexts(GX.passphraseReplaceCleartexts, cleartexts)
  if (antePassphraseClear === nextPassphraseClear) { throw samePassphrase() }
  const { ante, gate } = await timelyAnte(vault)
  const anteProving = await PassphraseProving.buildStored(gate, antePassphraseClear, vault.world)
  const nextProving = await PassphraseProving.buildNovel(gate.stamp, nextPassphraseClear, vault.world)

  const nextWayin = await nextProving.buildWayin(anteProving)
  const stored    = await vault.listing.replacePassphrase(ante, SX.passphraseWayinRecord.parse(nextWayin.pickle()))
  return unlockByProof(vault, anteProving, stored.gate.gate_epoch)
}

/** Add a passkey to `vault`, proved by its passphrase. */
const addPasskey = async (vault: Vault, cleartexts: unknown, unlockByProof: UnlockByProof): Promise<Vault> => {
  const { passphraseClear, passkeyClear } = checkedCleartexts(GX.passkeyAddCleartexts, cleartexts)
  const { ante, gate } = await timelyAnte(vault)
  const proved         = await PassphraseProving.buildStored(gate, passphraseClear, vault.world)
  const passkeyProving = await PasskeyProving.buildNovel(gate.stamp, passkeyClear, vault.world)

  const passkeyWayin = await passkeyProving.buildWayin(proved)
  const stored       = await vault.listing.addPasskey(ante, SX.passkeyWayinRecord.parse(passkeyWayin.pickle()))
  return unlockByProof(vault, proved, stored.gate.gate_epoch)
}

/** Revoke the passkey of `vault`, proved by its passphrase. */
const revokePasskey = async (vault: Vault, cleartexts: unknown, unlockByProof: UnlockByProof): Promise<Vault> => {
  const { passphraseClear } = checkedCleartexts(GX.passkeyRevokeCleartexts, cleartexts)
  const { ante, gate } = await timelyAnte(vault)
  const proved = await PassphraseProving.buildStored(gate, passphraseClear, vault.world)

  const stored = await vault.listing.revokePasskey(ante)
  return unlockByProof(vault, proved, stored.gate.gate_epoch)
}

/** Delete `vault`, proved by its passphrase. */
const delVault = async (vault: Vault, cleartexts: unknown): Promise<Vault> => {
  const { passphraseClear } = checkedCleartexts(GX.vaultDelCleartexts, cleartexts)
  const { ante, gate      } = await timelyAnte(vault)
  await PassphraseProving.buildStored(gate, passphraseClear, vault.world)

  // The lock first: no box opens under a lease while the tombstone goes out. The delete goes over the revision proved, as
  // a gate verb's record does, and the answer delivered vacates its boxes.
  vault.lock()
  return vault.del(ante)
}

const ActOnVault: Record<VaultGatingkind, (vault: Vault, cleartexts: unknown, unlockByProof: UnlockByProof) => Promise<Vault>> = {
  unlock_vault:       unlockVault,
  replace_passphrase: replacePassphrase,
  add_passkey:        addPasskey,
  revoke_passkey:     revokePasskey,
  del_vault:          delVault,
}
// --

// == [An act's helpers]: timelyAnte, checkedCleartexts, isCorrectable, spendCleartexts

/** The hydrated vault's record (as a pojo, not instance) and its gate (as an instance) */
const timelyAnte = async (vault: Vault): Promise<{ ante: VaultRecord, gate: Gate }> => {
  await vault.ensureTimely(VX.Promptly); vault.demandPromptable()
  return { ante: vault.fullRecord, gate: vault.gate }
}

/** The cleartexts through their checker. A throw that is not one of this library's is replaced whole, keeping nothing of it (G8). */
const checkedCleartexts = <CleartextsT>(checker: { parse: (cleartexts: unknown) => CleartextsT }, cleartexts: unknown): CleartextsT => {
  try {
    return checker.parse(cleartexts)
  } catch (err) {
    throw isVaultError(err) ? err : cleartextsThrew()
  }
}

const isCorrectable = (err: VaultError): boolean => (EX.correctablekindVals as readonly string[]).includes(err.refusalkind)

/** Zero a passkey answer's PRF bytes wherever `cleartexts` carries them (G2). */
const spendCleartexts = (cleartexts: unknown): void => {
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
