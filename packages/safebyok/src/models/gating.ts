import { makeLifeTok } from '../crypto'
import { VaultError, isVaultError } from '../errors'
import { adorn, tattoo } from '../helpers'
import { type Outcome, bad, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import type { VaultScope } from '../shapes/scopes'
import * as VX from '../shapes/vault'
import { attemptInFlight, clearsThrew, gatingDeclined, gatingSettled, lockedWhileAsking, noRequestCleartext, requestCleartextThrew, samePassphrase } from '../helpers/throwers'
import type { AnyGating, ClearsForGatingkind, GatingKind, GatingSnapshot, LaunchArgs, Prove, RequestCleartext, Run, VaultForGatingkind, VaultRecord, VaultWorld, WayinHeader } from './models-shapes'
import * as MSX from './models-shapes'
import type { Gate } from './gate'
import { PasskeyProving, PassphraseProving, Proving } from './proving'
import type { Vault } from './vault'
import type { VaultListing } from './vault-listing'

// == [Gating]: launch, isOpen, whenSettled, checkStrength, attempt, decline, declineAtLock, declineAtDiscard, toJSON

/** One ask of the user, one open per bank. It holds the clears only for the length of an attempt, and settles once: launch answers with that outcome. */
export class Gating<KindT extends GatingKind = GatingKind> {
  declare readonly gatingkind:    KindT
  declare readonly applabel:      string
  declare readonly user_id:       string
  declare readonly vaultlabel:    string
  declare readonly vault:         VaultForGatingkind[KindT]
  /** The header of the passkey wayin in the gate at launch, for the dialog to ask that passkey; null with none. */
  declare readonly passkeyHeader: WayinHeader | null

  readonly #listing: VaultListing
  readonly #run:     Run<KindT>
  readonly #prove:   Prove<KindT>
  readonly #settled: Promise<Outcome<Vault>>
  #settle:        (outcome: Outcome<Vault>) => void = () => undefined
  #outcome:       Outcome<Vault> | null = null
  #isAttempting  = false
  #isLastAttempt = false

  private constructor(gatingkind: KindT, { listing, scope, vault, run }: LaunchArgs<KindT>) {
    tattoo(this, { gatingkind, ...scope }, { writable: false })
    adorn(this, 'vault', vault)
    adorn(this, 'passkeyHeader', vault?.gate.toJSON().passkey_wayin ?? null)
    this.#listing = listing
    this.#run = run
    this.#prove = ProveForGatingkind[gatingkind]
    this.#settled = new Promise((resolve) => { this.#settle = resolve })
    Object.freeze(this)
  }

  /** SLOPDOC: Opens a new gating's dialog on this bank and resolves with the vault its `run` answers. */
  static async launch<KindT extends GatingKind>(gatingkind: KindT, args: LaunchArgs<KindT>): Promise<Vault> {
    const { scope } = MSX.gatingLaunchArgs.parse({ gatingkind, scope: args.scope, run: args.run })
    const { requestCleartext } = args.listing.world
    if (requestCleartext === undefined) { throw noRequestCleartext() }
    const gating = new Gating(gatingkind, { ...args, scope })
    args.listing.holdGating(gating as unknown as AnyGating)
    void gating.#askHost(requestCleartext)
    return valOf(await gating.#settled)
  }

  async #askHost(requestCleartext: RequestCleartext): Promise<void> {
    try {
      await requestCleartext(this as unknown as AnyGating)
      this.#endAsking(gatingDeclined())
    } catch {
      this.#endAsking(requestCleartextThrew())
    }
  }

  get isOpen(): boolean { return this.#outcome === null }

  /** The outcome once settled, a promise that never rejects: a dialog closes on it, as the package cannot close a host's dialog. */
  get whenSettled(): Promise<Outcome<Vault>> { return this.#settled }

  /** The verdict on a passphrase, as the user types it. Nothing changes. */
  async checkStrength(passphraseClear: string): Promise<VX.PassphraseVerdict> {
    return Proving.checkStrength(VX.passphraseCleartext.parse(passphraseClear), this.#scope, this.#listing.world)
  }

  get #scope(): VaultScope {
    const { applabel, user_id, vaultlabel } = this
    return { applabel, user_id, vaultlabel }
  }

  /** SLOPDOC: The one door for a clear: tries what the user typed once, and answers how it went as an Outcome. */
  attempt(clears: ClearsForGatingkind[KindT]): Promise<Outcome<Vault>> {
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
    if (this.#outcome !== null) { return gatingSettled() }
    return this.#isAttempting ? attemptInFlight() : null
  }

  async #attemptOnce(clears: ClearsForGatingkind[KindT]): Promise<Outcome<Vault>> {
    const asked = { scope: this.#scope, vault: this.vault, world: this.#listing.world }
    const outcome = await outcomeOf(async () => this.#run(await this.#prove(asked, clears)))
    this.#isAttempting = false
    // A correctable refusal, short of the last attempt, leaves the clears unspent for the next.
    if (outcome.ok || (! isCorrectable(outcome.err)) || this.#isLastAttempt) {
      spendClears(clears)
      this.#settleOnce(outcome)
    }
    return outcome
  }

  /** The user said no. With no attempt under way the gating settles 'declined'; one under way runs on, and its outcome settles it. */
  decline(): void { this.#endAsking(gatingDeclined()) }

  /** A lock on the vault it asks for. With no attempt under way the gating settles 'locked_while_asking'; past the enter key nothing turns back, and the attempt's outcome settles it. A `del_vault` hears nothing: a lock does not stop a delete. */
  declineAtLock(): void {
    if (this.gatingkind !== 'del_vault') { this.declineAtDiscard() }
  }

  /** What it asks of is going away, whatever its kind: it settles as {@link declineAtLock} has it. */
  declineAtDiscard(): void { this.#endAsking(lockedWhileAsking()) }

  /** No more attempts: `refusal` settles the gating, or else the attempt under way does, whatever it answers. */
  #endAsking(refusal: VaultError): void {
    if (this.#isAttempting) {
      this.#isLastAttempt = true
      return
    }
    this.#settleOnce(bad(refusal))
  }

  #settleOnce(outcome: Outcome<Vault>): void {
    if (this.#outcome !== null) { return }
    this.#outcome = outcome
    this.#listing.releaseGating()
    this.#settle(outcome)
  }

  toJSON(): GatingSnapshot {
    const { gatingkind } = this
    return { gatingkind, ...this.#scope }
  }
}
// --

// == [An attempt's provings]: Prove, ProveForGatingkind, timelyAnte, provePassphrase, checkedClears, isCorrectable, spendClears

/** Past the enter key, the last to hear the clears. A birth's stamp is minted here, one per attempt. */
const ProveForGatingkind: { [KindT in GatingKind]: Prove<KindT> } = {
  build_vault: async ({ scope, world }, clears) => {
    const { passphraseClear, passkeyClear } = checkedClears(MSX.vaultBuildClears, clears)
    const stamp = MSX.vaultStamp.parse({ ...scope, vault_tok: makeLifeTok(), registered_at: world.clock.now() })
    const passphraseProving = await PassphraseProving.buildNovel(stamp, passphraseClear, world)
    const passkeyProving = passkeyClear ? await PasskeyProving.buildNovel(stamp, passkeyClear, world) : null
    return { passphraseProving, passkeyProving }
  },
  unlock_vault: async ({ vault, world }, clears) => {
    const { passphraseClear, passkeyClear } = checkedClears(MSX.vaultUnlockClears, clears)
    await vault.ensureTimely(MSX.Promptly); vault.demandEnabled()
    const { gate } = vault
    if (passphraseClear !== undefined) { return { proved: await PassphraseProving.buildStored(gate, passphraseClear, world) } }
    if (! passkeyClear) { throw new VaultError('unexpected_error', Phrases.ProofMissing) }
    return { proved: await PasskeyProving.buildStored(gate, passkeyClear) }
  },
  replace_passphrase: async ({ vault, world }, clears) => {
    const { antePassphraseClear, nextPassphraseClear } = checkedClears(MSX.passphraseReplaceClears, clears)
    if (antePassphraseClear === nextPassphraseClear) { throw samePassphrase() }
    const { ante, gate } = await timelyAnte(vault)
    const anteProving = await PassphraseProving.buildStored(gate, antePassphraseClear, world)
    const nextProving = await PassphraseProving.buildNovel(gate.stamp, nextPassphraseClear, world)
    return { ante, anteProving, nextProving }
  },
  add_passkey: async ({ vault, world }, clears) => {
    const { passphraseClear, passkeyClear } = checkedClears(MSX.passkeyAddClears, clears)
    const { ante, gate } = await timelyAnte(vault)
    const proved = await PassphraseProving.buildStored(gate, passphraseClear, world)
    const passkeyProving = await PasskeyProving.buildNovel(gate.stamp, passkeyClear, world)
    return { ante, proved, passkeyProving }
  },
  revoke_passkey: ({ vault, world }, clears) => provePassphrase(vault, checkedClears(MSX.passkeyRevokeClears, clears), world),
  del_vault:      ({ vault, world }, clears) => provePassphrase(vault, checkedClears(MSX.vaultDelClears, clears), world),
}

/** The attempt's one record and the gate it holds, read once, after its timeliness request. */
const timelyAnte = async (vault: Vault): Promise<{ ante: VaultRecord, gate: Gate }> => {
  await vault.ensureTimely(MSX.Promptly); vault.demandEnabled()
  return { ante: vault.fullRecord, gate: vault.gate }
}

const provePassphrase = async (vault: Vault, { passphraseClear }: { passphraseClear: VX.PassphraseCleartext }, world: VaultWorld): Promise<{ ante: VaultRecord, proved: PassphraseProving }> => {
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

const isCorrectable = (err: VaultError): boolean => (MSX.correctableKindVals as readonly string[]).includes(err.refusalkind)

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
