import { noop } from 'es-toolkit'
import { VaultError } from '../errors'
import { adorn, tattoo } from '../helpers'
import type { VaultLogger } from '../logger'
import { type Outcome, bad, good, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import { type VaultScope, vaultScope } from '../shapes/scopes'
import * as VX from '../shapes/vault'
import type { CleartextsForGatingkind, GatingKind, StrengthChecker } from './models-shapes'
import * as MSX from './models-shapes'
import type { Vault } from './vault'
import type { VaultDna, VaultListing } from './vault-listing'

// == [Given to a gating]: GatingWorld, RequestCleartext, AnyGating, GatingSnapshot, Run

export type GatingWorld = {
  requestCleartext?: RequestCleartext | undefined
  strengthChecker:   StrengthChecker
  logger:            VaultLogger
}

export type RequestCleartext = (gating: AnyGating) => unknown

export type AnyGating = { [KindT in GatingKind]: Gating<KindT> }[GatingKind]

export type GatingSnapshot = VaultScope & Readonly<{ gatingkind: GatingKind }>

type Run = (handed: unknown) => Promise<Vault>
// --

// == [Gating]: buildVault, unlockVault, replacePassphrase, addPasskey, revokePasskey, each with its try form; isOpen, attempt, decline, toJSON

export class Gating<KindT extends GatingKind = GatingKind> {
  declare readonly gatingkind: KindT
  declare readonly applabel:   string
  declare readonly user_id:    string
  declare readonly vaultlabel: string
  declare readonly vault:      Vault | null

  readonly #run:     Run
  readonly #settled: Promise<Outcome<Vault>>
  readonly #settle:  (outcome: Outcome<Vault>) => void
  #outcome:    Outcome<Vault> | null = null
  #attempting: Promise<unknown> | null = null

  private constructor(gatingkind: KindT, scope: VaultScope, vault: Vault | null, run: Run, settled: Promise<Outcome<Vault>>, settle: (outcome: Outcome<Vault>) => void) {
    tattoo(this, { gatingkind: MSX.gatingkind.parse(gatingkind) as KindT, ...vaultScope.parse(scope) }, { writable: false })
    adorn(this, 'vault', vault)
    this.#run = run
    this.#settled = settled
    this.#settle = settle
    Object.freeze(this)
  }

  static buildVault(listing: VaultListing, dna: VaultDna, world: GatingWorld): Promise<Vault> {
    const scope = listing.scopeOf(dna)
    return this.#ask('build_vault', scope, null, world, async (handed) => {
      const checked = MSX.vaultBuildCleartexts.parse(handed)
      await checkStrength(world, checked.passphrase, scope)
      const vault = await listing.build(dna, () => checked)
      return vault.send({})
    })
  }

  static tryBuildVault(listing: VaultListing, dna: VaultDna, world: GatingWorld): Promise<Outcome<Vault>> { return outcomeOf(() => this.buildVault(listing, dna, world)) }

  // GAP: vault.ts `ensureUnlocked(proofClosure?)` throws noProofToUnlock() where none is handed; with a world that carries `requestCleartext`, it would `await Gating.unlockVault(this, this.world)` and answer `this.demandLease()`.
  static unlockVault(vault: Vault, world: GatingWorld): Promise<Vault> {
    return this.#ask('unlock_vault', vault.scope, vault, world, async (handed) => {
      const checked = MSX.vaultUnlockCleartexts.parse(handed)
      await vault.ensureUnlocked(() => checked)
      return vault
    })
  }

  static tryUnlockVault(vault: Vault, world: GatingWorld): Promise<Outcome<Vault>> { return outcomeOf(() => this.unlockVault(vault, world)) }

  // GAP: vault.ts `replacePassphrase`, `addPasskey` and `revokePasskey` take closures only; called with none, each would ask through its Gating static here, as `unlockVault`'s GAP says.
  static replacePassphrase(vault: Vault, world: GatingWorld): Promise<Vault> {
    return this.#ask('replace_passphrase', vault.scope, vault, world, async (handed) => {
      const { passphrase, nextPassphrase } = MSX.passphraseReplaceCleartexts.parse(handed)
      if (passphrase === nextPassphrase) { throw samePassphrase() }
      await checkStrength(world, nextPassphrase, vault.scope)
      return vault.replacePassphrase(() => ({ passphrase }), () => ({ passphrase: nextPassphrase }))
    })
  }

  static tryReplacePassphrase(vault: Vault, world: GatingWorld): Promise<Outcome<Vault>> { return outcomeOf(() => this.replacePassphrase(vault, world)) }

  static addPasskey(vault: Vault, world: GatingWorld): Promise<Vault> {
    return this.#ask('add_passkey', vault.scope, vault, world, (handed) => {
      const { passphrase, passkeyAnswer } = MSX.passkeyAddCleartexts.parse(handed)
      return vault.addPasskey(() => ({ passphrase }), () => ({ passkeyAnswer }))
    })
  }

  static tryAddPasskey(vault: Vault, world: GatingWorld): Promise<Outcome<Vault>> { return outcomeOf(() => this.addPasskey(vault, world)) }

  static revokePasskey(vault: Vault, world: GatingWorld): Promise<Vault> {
    return this.#ask('revoke_passkey', vault.scope, vault, world, (handed) => {
      const { passphrase } = MSX.passkeyRevokeCleartexts.parse(handed)
      return vault.revokePasskey(() => ({ passphrase }))
    })
  }

  static tryRevokePasskey(vault: Vault, world: GatingWorld): Promise<Outcome<Vault>> { return outcomeOf(() => this.revokePasskey(vault, world)) }

  static async #ask(gatingkind: GatingKind, scope: VaultScope, vault: Vault | null, world: GatingWorld, run: Run): Promise<Vault> {
    const { requestCleartext } = MSX.gatingWorld.parse(world) as GatingWorld
    if (requestCleartext === undefined) { throw noRequestCleartext() }
    let settle: (outcome: Outcome<Vault>) => void = noop
    const settled = new Promise<Outcome<Vault>>((resolve) => { settle = resolve })
    const gating = new Gating(gatingkind, scope, vault, run, settled, settle)
    const heard = await hearRequestCleartext(requestCleartext, gating)
    await gating.#attempting
    gating.#settleOnce(heard.ok ? bad(gatingDeclined()) : heard)
    return valOf(await gating.#settled)
  }

  get isOpen(): boolean { return this.#outcome === null }

  attempt(cleartexts: CleartextsForGatingkind[KindT]): Promise<Outcome<Vault>> {
    if (this.#outcome !== null) { return Promise.resolve(bad(gatingSettled())) }
    const attempting = this.#attemptOnce(cleartexts)
    this.#attempting = attempting
    return attempting
  }

  async #attemptOnce(cleartexts: unknown): Promise<Outcome<Vault>> {
    const outcome = await outcomeOf(() => this.#run(cleartexts))
    if (outcome.ok || ! isCorrectable(outcome.err)) { this.#settleOnce(outcome) }
    return outcome
  }

  decline(): void {
    this.#settleOnce(bad(gatingDeclined()))
  }

  #settleOnce(outcome: Outcome<Vault>): void {
    if (this.#outcome !== null) { return }
    this.#outcome = outcome
    this.#settle(outcome)
  }

  toJSON(): GatingSnapshot {
    const { gatingkind, applabel, user_id, vaultlabel } = this
    return { gatingkind, applabel, user_id, vaultlabel }
  }
}
// --

// == [Host calls]: hearRequestCleartext, checkStrength, verdictOf, isCorrectable

const hearRequestCleartext = async (requestCleartext: RequestCleartext, gating: AnyGating): Promise<Outcome<void>> => {
  try {
    await requestCleartext(gating)
    return good(undefined)
  } catch {
    return bad(requestCleartextThrew())
  }
}

const checkStrength = async (world: GatingWorld, passphrase: string, scope: VaultScope): Promise<void> => {
  const verdict = await verdictOf(world.strengthChecker, passphrase, scope)
  if (! verdict.success) { throw notAVerdict() }
  if (! verdict.data.strong) { throw weakPassphrase(verdict.data.reason) }
}

const verdictOf = async (strengthChecker: StrengthChecker, passphrase: string, scope: VaultScope): Promise<ReturnType<typeof VX.passphraseVerdict.safeParse>> => {
  try {
    return VX.passphraseVerdict.safeParse(await strengthChecker(passphrase, scope))
  } catch {
    throw strengthCheckerThrew()
  }
}

const isCorrectable = (err: VaultError): boolean => (MSX.correctableKindVals as readonly string[]).includes(err.refusalkind)
// --

// == [Refusals]: noRequestCleartext, requestCleartextThrew, gatingDeclined, gatingSettled, strengthCheckerThrew, notAVerdict, weakPassphrase, samePassphrase

const noRequestCleartext = (): VaultError => new VaultError('bad_option', Phrases.NoRequestCleartext)

const requestCleartextThrew = (): VaultError => new VaultError('unexpected_error', Phrases.RequestCleartextThrew)

const gatingDeclined = (): VaultError => new VaultError('vault_locked', Phrases.GatingDeclined)

const gatingSettled = (): VaultError => new VaultError('gating_landed', Phrases.GatingSettled)

const strengthCheckerThrew = (): VaultError => new VaultError('unexpected_error', Phrases.StrengthCheckerThrew)

const notAVerdict = (): VaultError => new VaultError('bad_option', Phrases.NotAVerdict)

const weakPassphrase = (reason: string): VaultError => new VaultError('weak_passphrase', reason)

const samePassphrase = (): VaultError => new VaultError('same_passphrase', Phrases.SamePassphrase)
// --
