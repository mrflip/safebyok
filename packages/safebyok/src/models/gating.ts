import { makeLifeTok } from '../helpers/crypto'
import { VaultError, isVaultError } from '../refusals/errors'
import { adorn, tattoo } from '../helpers/helpers'
import { type Outcome, bad, outcomeOf, valOf } from '../refusals/outcome'
import * as EX from '../shapes/shapes-enums'
import type { GatingKind } from '../shapes/shapes-enums'
import type { VaultScope } from '../shapes/shapes-core'
import * as GX from '../shapes/shapes-gateish'
import type { AnteProvings, AnyGating, ClearsForGatingkind, GatingSnapshot, LaunchArgs, Prove, RequestCleartext, Run, VaultForGatingkind, WayinHeader } from '../shapes/shapes-gateish'
import * as SX from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import type { VaultRecord, VaultWorld } from '../shapes/shapes-vaultish'
import { proofMissing, attemptInFlight, clearsThrew, gatingDeclined, gatingSettled, lockedWhileAsking, noRequestCleartext, requestCleartextThrew, samePassphrase } from '../refusals/throwers'
import { Gate } from './gate'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from './proving'
import type { Vault } from './vault'
import type { VaultListing } from './vault-listing'

/** One ask of the user, one open per bank. It holds the clears only for the length of an attempt, and settles once: launch answers with that outcome. */
export class Gating<KindT extends GatingKind = GatingKind> {
  // == [Props]: gatingkind, applabel, user_id, vaultlabel, vault, passkeyHeader, #listing, #launchArgs, #run, #prove, #settled, #settle, #outcome, #isAttempting, #isLastAttempt

  declare readonly gatingkind:    KindT
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
  readonly #settled:    Promise<Outcome<Vault>>
  #settle:        (outcome: Outcome<Vault>) => void = () => undefined
  #outcome:       Outcome<Vault> | null = null
  #isAttempting  = false
  #isLastAttempt = false
  // --

  // == [Getters]: isOpen, whenSettled, scope, toJSON

  get isOpen(): boolean { return this.#outcome === null }

  /** The outcome once settled, a promise that never rejects: a dialog closes on it, as the package cannot close a host's dialog. */
  get whenSettled(): Promise<Outcome<Vault>> { return this.#settled }

  get #scope(): VaultScope {
    const { applabel, user_id, vaultlabel } = this
    return { applabel, user_id, vaultlabel }
  }

  toJSON(): GatingSnapshot {
    const { gatingkind } = this
    return { gatingkind, ...this.#scope }
  }
  // --

  // == [Construction]: constructor, launch, askHost

  private constructor(gatingkind: KindT, launchArgs: LaunchArgs<KindT>) {
    const { listing, scope, vault } = launchArgs
    tattoo(this, { gatingkind, ...scope })
    adorn(this, 'vault', vault)
    adorn(this, 'passkeyHeader', vault?.gate.toJSON().passkey_wayin ?? null)
    this.#listing = listing
    this.#launchArgs = launchArgs
    this.#run = RunForGatingkind[gatingkind]
    this.#prove = ProveForGatingkind[gatingkind]
    this.#settled = new Promise((resolve) => { this.#settle = resolve })
    Object.freeze(this)
  }

  /** SLOPDOC: Opens a new gating's dialog on this bank and resolves with the vault its run answers. */
  static async launch<KindT extends GatingKind>(gatingkind: KindT, args: LaunchArgs<KindT>): Promise<Vault> {
    const { scope } = GX.gatingLaunchArgs.parse({ gatingkind, scope: args.scope, friend: args.friend })
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
  // --

  // == [The attempt]: checkStrength, attempt, refusalOfAttempt, attemptOnce

  /** The verdict on a passphrase, as the user types it. Nothing changes. */
  async checkStrength(passphraseClear: string): Promise<GX.PassphraseVerdict> {
    return Proving.checkStrength(GX.passphraseCleartext.parse(passphraseClear), this.#scope, this.#listing.world)
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
    const outcome = await outcomeOf(async () => this.#run(await this.#prove(asked, clears), this.#launchArgs))
    this.#isAttempting = false
    // A correctable refusal, short of the last attempt, leaves the clears unspent for the next.
    if (outcome.ok || (! isCorrectable(outcome.err)) || this.#isLastAttempt) {
      spendClears(clears)
      this.#settleOnce(outcome)
    }
    return outcome
  }
  // --

  // == [Settling]: decline, declineAtLock, declineAtDiscard, endAsking, settleOnce

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
  // --
}

// == [An attempt's runs]: RunForGatingkind, recordOfBirth

/** Past the proving, the change the gating was launched for. Each hears provings, never a clear, and comes to its vault's private verbs by the friend. */
const RunForGatingkind: { [KindT in GatingKind]: Run<KindT> } = {
  build_vault: async ({ passphraseProving, passkeyProving }, { listing, prior, friend }) => {
    const passphraseWayin = await passphraseProving.buildWayin(NOVEL)
    const passkeyWayin    = await passkeyProving?.buildWayin(passphraseProving) ?? null

    const gate   = Gate.make(passphraseProving.stamp, passphraseWayin, passkeyWayin)
    const record = recordOfBirth(gate, prior, listing.clock.now())
    const vault  = await listing.put(record, { prior, ifAbsent: 'add', ifPresent: 'get' })

    // The row stored may be another's, born first: this proof opens only its own.
    if (vault.vault_tok === record.vault_tok) { await friend.unlockByProof(vault, passphraseProving) }
    return vault
  },

  unlock_vault: ({ proved }, { vault, friend }) => friend.unlockByProof(vault, proved),

  replace_passphrase: async ({ ante, anteProving, nextProving }, { listing, vault, friend }) => {
    const nextWayin        = await nextProving.buildWayin(anteProving)
    const passphrase_wayin = GX.passphraseWayinRecord.parse(nextWayin.pickle())
    return friend.landGate(vault, anteProving, () => listing.replacePassphrase({ ...ante, gate: { passphrase_wayin } }))
  },

  add_passkey: async ({ ante, proved, passkeyProving }, { listing, vault, friend }) => {
    const passkeyWayin  = await passkeyProving.buildWayin(proved)
    const passkey_wayin = GX.passkeyWayinRecord.parse(passkeyWayin.pickle())
    return friend.landGate(vault, proved, () => listing.addPasskey({ ...ante, gate: { passkey_wayin } }))
  },

  revoke_passkey: ({ ante, proved }, { listing, vault, friend }) => (
    friend.landGate(vault, proved, () => listing.revokePasskey({ ...ante, gate: { passkey_wayin: null } }))
  ),

  del_vault: async ({ ante }, { listing, vault }) => {
    // The lock first: no box opens under a lease while the tombstone goes out. The answer delivered vacates its boxes.
    vault.lock()
    await listing.del(ante)
    return vault
  },
}

/** The record of a birth, at the revision after `prior`, carrying `gate` and the stamp it was made under. */
const recordOfBirth = (gate: Gate, prior: VX.Revision, now: number): VaultRecord => (
  { ...gate.stamp, fmt: VX.VaultFormat, am: 'a', ...SX.nextRevisionOf(prior, now), gate: gate.pickle() }
)
// --

// == [An attempt's provings]: Prove, ProveForGatingkind, timelyAnte, provePassphrase, checkedClears, isCorrectable, spendClears

/** Past the enter key, the last to hear the clears. A birth's stamp is minted here, one per attempt. */
const ProveForGatingkind: { [KindT in GatingKind]: Prove<KindT> } = {
  build_vault: async ({ scope, world }, clears) => {
    const { passphraseClear, passkeyClear } = checkedClears(GX.vaultBuildClears, clears)
    const stamp = GX.vaultStamp.parse({ ...scope, vault_tok: makeLifeTok(), registered_at: world.clock.now() })
    const passphraseProving = await PassphraseProving.buildNovel(stamp, passphraseClear, world)
    const passkeyProving = passkeyClear ? await PasskeyProving.buildNovel(stamp, passkeyClear, world) : null
    return { passphraseProving, passkeyProving }
  },
  unlock_vault: async ({ vault, world }, clears) => {
    const { passphraseClear, passkeyClear } = checkedClears(GX.vaultUnlockClears, clears)
    await vault.ensureTimely(VX.Promptly); vault.demandEnabled()
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
  await vault.ensureTimely(VX.Promptly); vault.demandEnabled()
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

const isCorrectable = (err: VaultError): boolean => (EX.correctableKindVals as readonly string[]).includes(err.refusalkind)

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
