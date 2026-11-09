import type { Modelkind } from '../helpers/consts'
import { VaultError, isVaultError } from '../refusals/errors'
import { randomId } from '../helpers/crypto'
import { adorn, tattoo } from '../helpers/helpers'
import { type Outcome, bad, outcomeOf, valOf } from '../refusals/outcome'
import * as EX from '../shapes/shapes-enums'
import type { Gatingkind } from '../shapes/shapes-enums'
import type { VaultScope } from '../shapes/shapes-core'
import * as GX from '../shapes/shapes-gateish'
import type { AnteProvings, AnyGating, AskUser, ClearsForGatingkind, GatingSnapshot, LaunchArgs, Prove, Run, VaultForGatingkind, WayinHeader } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { VaultWorld } from '../shapes/shapes-vaultish'
import * as SX from '../shapes/shapes-storage'
import type { VaultRecord } from '../shapes/shapes-storage'
import { proofMissing, attemptInFlight, clearsThrew, gatingDismissed, gatingConcluded, requestCleartextThrew, samePassphrase } from '../refusals/throwers'
import { Gate } from './gate'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from './proving'
import type { Vault } from './vault'
import type { VaultListing } from './vault-listing'

/** One ask of the user, one open per bank. It holds the clears only for the length of an attempt, and concludes once: launch answers with that outcome. */
export class Gating<KindT extends Gatingkind = Gatingkind> {
  // == [Props]: gatingkind, gatingTok, applabel, user_id, vaultlabel, vault, passkeyHeader, #listing, #launchArgs, #run, #prove, #concluded, #conclude, #outcome, #isAttempting, #isLastAttempt

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
  readonly #launchArgs: LaunchArgs<KindT>
  readonly #run:        Run<KindT>
  readonly #prove:      Prove<KindT>
  readonly #concluded:    Promise<Outcome<Vault>>
  #conclude:        (outcome: Outcome<Vault>) => void = () => undefined
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

  // == [Construction]: constructor, launch, askHost

  private constructor(gatingkind: KindT, launchArgs: LaunchArgs<KindT>) {
    const { listing, scope, vault } = launchArgs
    tattoo(this, { gatingkind, gatingTok: randomId(), ...scope })
    adorn(this, 'vault', vault)
    adorn(this, 'passkeyHeader', vault?.gate.toJSON().passkey_wayin ?? null)
    this.#listing = listing
    this.#launchArgs = launchArgs
    this.#run = RunForGatingkind[gatingkind]
    this.#prove = ProveForGatingkind[gatingkind]
    this.#concluded = new Promise((resolve) => { this.#conclude = resolve })
    Object.freeze(this)
  }

  /** SLOPDOC: Opens a new gating's dialog on this bank and resolves with the vault its run answers. */
  static async launch<KindT extends Gatingkind>(gatingkind: KindT, args: LaunchArgs<KindT>): Promise<Vault> {
    const { scope, askUser } = GX.gatingLaunchArgs.parse({ gatingkind, scope: args.scope, friend: args.friend, askUser: args.askUser })
    const gating = new Gating(gatingkind, { ...args, scope })
    args.listing.holdGating(gating as unknown as AnyGating)
    if (askUser !== null) { void gating.#askHost(askUser) }
    return valOf(await gating.#concluded)
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

  /** SLOPDOC: The one door for a clear: tries what the user typed once, and answers how it went as an Outcome. */
  attempt(clears: ClearsForGatingkind[Gatingkind]): Promise<Outcome<Vault>> {
    const refusal = this.#refusalOfAttempt()
    if (refusal !== null) {
      // A clear is spent even when refused at the door.
      spendClears(clears)
      return Promise.resolve(bad(refusal))
    }
    this.#isAttempting = true
    return this.#attemptOnce(clears)
  }

  #refusalOfAttempt(): VaultError | null {
    if (this.#outcome !== null) { return gatingConcluded() }
    return this.#isAttempting ? attemptInFlight() : null
  }

  async #attemptOnce(clears: ClearsForGatingkind[Gatingkind]): Promise<Outcome<Vault>> {
    const asked = { scope: this.#scope, vault: this.vault, listing: this.#listing, world: this.#listing.world }
    const outcome = await outcomeOf(async () => this.#run(await this.#prove(asked, clears), this.#launchArgs))
    this.#isAttempting = false
    // A correctable refusal, short of the last attempt, leaves the clears unspent for the next.
    if (outcome.ok || (! isCorrectable(outcome.err)) || this.#isLastAttempt) {
      spendClears(clears)
      this.#concludeOnce(outcome)
    }
    return outcome
  }
  // --

  // == [Concluding]: dismiss, endAsking, concludeOnce

  /** Ends the asking with nothing proved: the gating concludes 'dismissed', or an attempt under way runs on and its outcome concludes it. */
  dismiss(): void { this.#endAsking(gatingDismissed()) }

  /** No more attempts: `refusal` concludes the gating, or else the attempt under way does, whatever it answers. */
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
    this.#listing.releaseGating()
    this.#conclude(outcome)
  }
  // --

  /** Answers 'gating', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'gating' { return 'gating' satisfies Modelkind }
}

// == [An attempt's runs]: RunForGatingkind

/** Past the proving, the change the gating was launched for. Each hears provings, never a clear, and comes to its vault's private verbs by the friend. */
const RunForGatingkind: { [KindT in Gatingkind]: Run<KindT> } = {
  build_vault: async ({ passphraseProving, passkeyProving }, { listing, prior, friend }) => {
    const passphraseWayin = await passphraseProving.buildWayin(NOVEL)
    const passkeyWayin    = await passkeyProving?.buildWayin(passphraseProving) ?? null

    const gate   = Gate.make(passphraseProving.stamp, passphraseWayin, passkeyWayin)
    const record = listing.recordOfBirth(gate, prior)
    const vault  = await listing.put(record, { prior, ifAbsent: 'add', ifPresent: 'get' })

    // The row stored may be another's, born first: this proof opens only its own.
    if (vault.vault_tok === record.vault_tok) { await friend.unlockByProof(vault, passphraseProving) }
    return vault
  },

  unlock_vault: ({ proved }, { vault, friend }) => friend.unlockByProof(vault, proved),

  // Each gate change leases the vault under the epoch it stored. The old lease stays in force for the moments between: the vaultKey did not change.
  replace_passphrase: async ({ ante, anteProving, nextProving }, { listing, vault, friend }) => {
    const nextWayin        = await nextProving.buildWayin(anteProving)
    const passphrase_wayin = SX.passphraseWayinRecord.parse(nextWayin.pickle())
    const stored = await listing.replacePassphrase({ ...ante, gate: { passphrase_wayin } })
    return friend.unlockByProof(vault, anteProving, stored.gate.gate_epoch)
  },

  add_passkey: async ({ ante, proved, passkeyProving }, { listing, vault, friend }) => {
    const passkeyWayin  = await passkeyProving.buildWayin(proved)
    const passkey_wayin = SX.passkeyWayinRecord.parse(passkeyWayin.pickle())
    const stored = await listing.addPasskey({ ...ante, gate: { passkey_wayin } })
    return friend.unlockByProof(vault, proved, stored.gate.gate_epoch)
  },

  revoke_passkey: async ({ ante, proved }, { listing, vault, friend }) => {
    const stored = await listing.revokePasskey({ ...ante, gate: { passkey_wayin: null } })
    return friend.unlockByProof(vault, proved, stored.gate.gate_epoch)
  },

  del_vault: async ({ ante }, { listing, vault }) => {
    // The lock first: no box opens under a lease while the tombstone goes out. The answer delivered vacates its boxes.
    vault.lock()
    await listing.del(ante)
    return vault
  },
}
// --

// == [An attempt's provings]: Prove, ProveForGatingkind, timelyAnte, provePassphrase, checkedClears, isCorrectable, spendClears

/** Past the enter key, the last to hear the clears. A birth's stamp is minted here, one per attempt. */
const ProveForGatingkind: { [KindT in Gatingkind]: Prove<KindT> } = {
  build_vault: async ({ scope, listing, world }, clears) => {
    const { passphraseClear, passkeyClear } = checkedClears(GX.vaultBuildClears, clears)
    const stamp = listing.stampOfBirth(scope)
    const passphraseProving = await PassphraseProving.buildNovel(stamp, passphraseClear, world)
    const passkeyProving = passkeyClear ? await PasskeyProving.buildNovel(stamp, passkeyClear, world) : null
    return { passphraseProving, passkeyProving }
  },
  unlock_vault: async ({ vault, world }, clears) => {
    const { passphraseClear, passkeyClear } = checkedClears(GX.vaultUnlockClears, clears)
    await vault.ensureTimely(VX.Promptly); vault.demandPromptable()
    const { gate } = vault
    if (passphraseClear !== undefined) { return { proved: await PassphraseProving.buildStored(gate, passphraseClear, world) } }
    if (! passkeyClear) { throw proofMissing() }
    return { proved: await PasskeyProving.buildStored(gate, passkeyClear) }
  },
  replace_passphrase: async ({ vault, world }, clears) => {
    const { antePassphraseClear, nextPassphraseClear } = checkedClears(GX.passphraseReplaceClears, clears)
    if (antePassphraseClear === nextPassphraseClear) { throw samePassphrase() }
    const { ante, gate } = await timelyAnte(vault)
    const anteProving = await PassphraseProving.buildStored(gate, antePassphraseClear, world)
    const nextProving = await PassphraseProving.buildNovel(gate.stamp, nextPassphraseClear, world)
    return { ante, anteProving, nextProving }
  },
  add_passkey: async ({ vault, world }, clears) => {
    const { passphraseClear, passkeyClear } = checkedClears(GX.passkeyAddClears, clears)
    const { ante, gate } = await timelyAnte(vault)
    const proved = await PassphraseProving.buildStored(gate, passphraseClear, world)
    const passkeyProving = await PasskeyProving.buildNovel(gate.stamp, passkeyClear, world)
    return { ante, proved, passkeyProving }
  },
  revoke_passkey: ({ vault, world }, clears) => provePassphrase(vault, checkedClears(GX.passkeyRevokeClears, clears), world),
  del_vault:      ({ vault, world }, clears) => provePassphrase(vault, checkedClears(GX.vaultDelClears, clears), world),
}

/** The attempt's one record and the gate it holds, read once, after its timeliness request. */
const timelyAnte = async (vault: Vault): Promise<{ ante: VaultRecord, gate: Gate }> => {
  await vault.ensureTimely(VX.Promptly); vault.demandPromptable()
  return { ante: vault.fullRecord, gate: vault.gate }
}

const provePassphrase = async (vault: Vault, { passphraseClear }: { passphraseClear: GX.PassphraseCleartext }, world: VaultWorld): Promise<AnteProvings> => {
  const { ante, gate } = await timelyAnte(vault)
  return { ante, proved: await PassphraseProving.buildStored(gate, passphraseClear, world) }
}

/** The clears through their checker. A throw that is no refusal came from a getter or proxy of the host's, reading a clear, so nothing of it is kept (G8). */
const checkedClears = <ClearsT>(checker: { parse: (clears: unknown) => ClearsT }, clears: unknown): ClearsT => {
  try {
    return checker.parse(clears)
  } catch (err) {
    throw isVaultError(err) ? err : clearsThrew()
  }
}

const isCorrectable = (err: VaultError): boolean => (EX.correctablekindVals as readonly string[]).includes(err.refusalkind)

/** Zero a passkey answer's PRF bytes wherever `clears` carries them, checked or not and of any realm, a bare ArrayBuffer too, as WebAuthn hands one: an answer is single-use (G2). */
const spendClears = (clears: unknown): void => {
  // The reach-in may meet a getter or a proxy of the host's, which may throw: spending is best effort, and never replaces the outcome it follows.
  try {
    const prfBytes: unknown = (clears as { passkeyClear?: { prfBytes?: unknown } | null } | null)?.passkeyClear?.prfBytes
    if (ArrayBuffer.isView(prfBytes)) { new Uint8Array(prfBytes.buffer, prfBytes.byteOffset, prfBytes.byteLength).fill(0) }
    if (Object.prototype.toString.call(prfBytes) === '[object ArrayBuffer]') { new Uint8Array(prfBytes as ArrayBuffer).fill(0) }
  } catch { /* nothing left to spend */ }
}
// --
