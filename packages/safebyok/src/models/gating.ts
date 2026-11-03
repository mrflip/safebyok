import { makeLifeTok } from '../crypto'
import { VaultError } from '../errors'
import { adorn, tattoo } from '../helpers'
import { type Outcome, bad, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import type { VaultScope } from '../shapes/scopes'
import * as VX from '../shapes/vault'
import type { ClearsForGatingkind, GatingKind, WayinHeader } from './models-shapes'
import * as MSX from './models-shapes'
import { PasskeyProving, PassphraseProving, Proving } from './proving'
import type { Vault } from './vault'
import type { VaultListing, VaultWorld } from './vault-listing'

// == [Given to a gating]: RequestCleartext, AnyGating, GatingSnapshot, ProvingsForGatingkind, Run, VaultForGatingkind, LaunchArgs

/** The host's dialog: shown with this gating, resolving once it closes. It hands the user's clears to `gating.attempt`, and its returning with no attempt under way declines. */
export type RequestCleartext = (gating: AnyGating) => unknown

export type AnyGating = { [KindT in GatingKind]: Gating<KindT> }[GatingKind]

export type GatingSnapshot = VaultScope & Readonly<{ gatingkind: GatingKind }>

/** What an attempt makes of the clears it is handed, for its `run`. */
export type ProvingsForGatingkind = {
  build_vault:  { passphraseProving: PassphraseProving, passkeyProving: PasskeyProving | null }
  unlock_vault: { proved: Proving }
}

/** The verb a gating is launched for, past the enter key. It hears provings, never a clear. */
export type Run<KindT extends GatingKind> = (provings: ProvingsForGatingkind[KindT]) => Promise<Vault>

export type VaultForGatingkind = { build_vault: null, unlock_vault: Vault }

export type LaunchArgs<KindT extends GatingKind> = { listing: VaultListing, scope: VaultScope, vault: VaultForGatingkind[KindT], run: Run<KindT> }
// --

// == [Gating]: launch, isOpen, whenSettled, checkStrength, attempt, decline, declineAtLock, toJSON

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

  /** The dialog shown with a new gating, resolving what `run` answers once it settles. Refuses 'already_asking' a gating open on this bank, with no join; 'bad_option' a world with no dialog; 'declined' or 'locked_while_asking' an ask that ended with no attempt. */
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

  /** The one door for a clear: what the user typed tried once, answered as an Outcome. Done, or refused for good, it settles the gating; a correctable refusal ({@link MSX.correctableKindVals}) leaves it open, and a passkey's answer unspent, to go again. Refuses 'attempt_in_flight' while one runs, and 'gating_landed' once settled, spending what it was handed. */
  attempt(clears: ClearsForGatingkind[KindT]): Promise<Outcome<Vault>> {
    const refusal = this.#refusalOfAttempt()
    if (refusal !== null) {
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
    if (outcome.ok || (! isCorrectable(outcome.err)) || this.#isLastAttempt) {
      spendClears(clears)
      this.#settleOnce(outcome)
    }
    return outcome
  }

  /** The user said no. With no attempt under way the gating settles 'declined'; one under way runs on, and its outcome settles it. */
  decline(): void { this.#endAsking(gatingDeclined()) }

  /** A lock on the vault it asks for. With no attempt under way the gating settles 'locked_while_asking'; past the enter key nothing turns back, and the attempt's outcome settles it. */
  declineAtLock(): void { this.#endAsking(lockedWhileAsking()) }

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

// == [An attempt's provings]: Prove, ProveForGatingkind, isCorrectable, spendClears

type Asked<KindT extends GatingKind> = { scope: VaultScope, vault: VaultForGatingkind[KindT], world: VaultWorld }

type Prove<KindT extends GatingKind> = (asked: Asked<KindT>, clears: unknown) => Promise<ProvingsForGatingkind[KindT]>

/** Past the enter key, the last to hear the clears. A birth's stamp is minted here, one per attempt. */
const ProveForGatingkind: { [KindT in GatingKind]: Prove<KindT> } = {
  build_vault: async ({ scope, world }, clears) => {
    const { passphraseClear, passkeyClear } = MSX.vaultBuildClears.parse(clears)
    const stamp = MSX.vaultStamp.parse({ ...scope, vault_tok: makeLifeTok(), registered_at: world.clock.now() })
    const passphraseProving = await PassphraseProving.buildNovel(stamp, passphraseClear, world)
    const passkeyProving = passkeyClear ? await PasskeyProving.buildNovel(stamp, passkeyClear, world) : null
    return { passphraseProving, passkeyProving }
  },
  unlock_vault: async ({ vault, world }, clears) => {
    const { passphraseClear, passkeyClear } = MSX.vaultUnlockClears.parse(clears)
    await vault.ensureTimely(MSX.Promptly)
    const { gate } = vault
    const proved = (passphraseClear === undefined) ? await PasskeyProving.buildStored(gate, passkeyClear!) : await PassphraseProving.buildStored(gate, passphraseClear, world)
    return { proved }
  },
}

const isCorrectable = (err: VaultError): boolean => (MSX.correctableKindVals as readonly string[]).includes(err.refusalkind)

/** Zero a passkey answer's PRF bytes wherever `clears` carries them, checked or not: an answer is single-use (G2). */
const spendClears = (clears: unknown): void => {
  // The reach-in may meet a getter or a proxy of the host's, which may throw: spending is best effort, and never replaces the outcome it follows.
  try {
    const prfBytes: unknown = (clears as { passkeyClear?: { prfBytes?: unknown } | null } | null)?.passkeyClear?.prfBytes
    if (prfBytes instanceof Uint8Array) { prfBytes.fill(0) }
  } catch { /* nothing left to spend */ }
}
// --

// == [Refusals]: alreadyAsking, noRequestCleartext, requestCleartextThrew, gatingDeclined, lockedWhileAsking, gatingSettled, attemptInFlight

export const alreadyAsking = (): VaultError => new VaultError('already_asking', Phrases.AlreadyAsking)

const noRequestCleartext = (): VaultError => new VaultError('bad_option', Phrases.NoRequestCleartext)

const requestCleartextThrew = (): VaultError => new VaultError('unexpected_error', Phrases.RequestCleartextThrew)

const gatingDeclined = (): VaultError => new VaultError('declined', Phrases.GatingDeclined)

const lockedWhileAsking = (): VaultError => new VaultError('locked_while_asking', Phrases.LockedWhileAsking)

const gatingSettled = (): VaultError => new VaultError('gating_landed', Phrases.GatingSettled)

const attemptInFlight = (): VaultError => new VaultError('attempt_in_flight', Phrases.AttemptInFlight)
// --
