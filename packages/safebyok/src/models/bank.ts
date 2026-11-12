import type { Modelkind } from '../helpers/consts'
import type { GoodAct } from '../shapes/shapes-enums'
import { nowMillis } from '../helpers/clock'
import { tattoo } from '../helpers/helpers'
import type { VaultLogger } from '../helpers/logger'
import type { GuardedStrengthChecker } from '../helpers/passphrase-strength'
import { type Outcome, demandGood, good, outcomeOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { reportToPlatform } from '../refusals/report-error'
import { type BankScope, type BankedVaultScope, type VaultScope, bankedVaultScope } from '../shapes/shapes-core'
import * as SX from '../shapes/shapes-storage'
import type { GoodAnswer } from '../storage/vault-db'
import type { Box } from './box'
import type { LeaseDated } from '../shapes/shapes-storage'
import * as VX from '../shapes/shapes-vaultish'
import type { BankFriend, BankSnapshot, ListingOpts } from '../shapes/shapes-vaultish'
import type { DeviceDB } from '../storage/device-db'
import type { Device } from './device'
import type { Vault } from './vault'
import type { GuardedKeyDeriver } from './proving'
import { VaultListing } from './vault-listing'

/** The signed-in user's vaults in the app, one Vault object per scope, and what they share: made by the {@link Device}, through `device.ensureBank()`. */
export class Bank {
  // == [Props]: user_id, banklabel, scope, device, device_tok, keyDeriver, deviceDB, logger, strengthChecker, leaseMillis, boxRefreshMillis, #tellBadNews, #listeners, #vaultListing, #snapshot, #getSnapshot, #subscribe

  declare readonly user_id:   string
  declare readonly banklabel: string
  readonly scope:            BankScope
  /** The device that made this bank: its options, its host's functions, its open gating and its end. */
  readonly device:           Device
  /** The token of this device's row in the deviceDB, which each wayin records. */
  readonly device_tok:       string
  readonly keyDeriver:       GuardedKeyDeriver
  readonly deviceDB:         DeviceDB
  readonly logger:           VaultLogger
  readonly strengthChecker:  GuardedStrengthChecker
  readonly leaseMillis:      number
  /** The refresh horizon of each vault's boxes. */
  readonly boxRefreshMillis: number

  /** The device's word to the host of bad news no caller waits on. */
  readonly #tellBadNews:  BankFriend['tellBadNews']
  readonly #listeners = new Set<() => void>()
  readonly #vaultListing: VaultListing
  #snapshot:              BankSnapshot

  readonly #getSnapshot = (): BankSnapshot => this.#snapshot

  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: vaultListing, snapshot, getSnapshot, subscribe, toJSON

  /** The listing of this bank's vaults. */
  get vaultListing(): VaultListing { return this.#vaultListing }

  /** This bank's current {@link BankSnapshot}. */
  get snapshot(): BankSnapshot { return this.#snapshot }

  /** The unbound snapshot getter, for `useSyncExternalStore`. */
  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }

  /** The unbound subscribe callback, for `useSyncExternalStore`. */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** This bank's snapshot, for `JSON.stringify`. */
  toJSON(): BankSnapshot { return this.#snapshot }
  // --

  // == [Construction]: constructor, vaultScopeOf

  // The device's options are its own: the bank keeps the ones its vaults reach for.
  constructor(device: Device, device_tok: string, opts: ListingOpts) {
    VX.bankArgs.parse({ device, device_tok })
    this.scope = device.scope
    tattoo(this, this.scope)
    this.device = device
    this.device_tok = device_tok
    this.keyDeriver = device.keyDeriver
    this.deviceDB = device.deviceDB
    this.logger = device.logger
    this.strengthChecker = device.strengthChecker
    this.leaseMillis = device.leaseMillis
    this.boxRefreshMillis = device.boxRefreshMillis
    this.#vaultListing = new VaultListing(this, opts)
    this.#tellBadNews = opts.bankFriend.tellBadNews
    this.#vaultListing.subscribe(this.#remakeSnapshot)
    this.#snapshot = this.#makeSnapshot()
    Object.freeze(this)
  }

  /** The full {@link VaultScope} of `scope` in this bank, refusing a scope of another bank. */
  vaultScopeOf(scope: BankedVaultScope): VaultScope {
    const { vaultlabel } = bankedVaultScope.parseConsistent(scope, this.scope, { message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }
  // --

  // == [The world of its vaults]: isLocked, ensureTimely, receiveWorld

  /** False: a bank has no lock, and each vault keeps its own. */
  get isLocked(): boolean { return false }

  /** Resolves at once: nothing above a bank needs refreshing. */
  ensureTimely(): Promise<void> { return Promise.resolve() }

  /** Does nothing: no world sits above a bank. */
  receiveWorld(): void { /* no world sits above a bank */ }
  // --

  // == [Locks]: autolock, lock

  /** Lock each listed vault with a cached lease past autolock, forgetting it. Call it after `ensureBank` and on your own timer.
   * A best-effort reminder, not a guarantee: it finds leases only by row, and `Lease.buildFromCache` leaves such a row for it.
   */
  async autolock(): Promise<void> {
    const cutoff = nowMillis() - this.leaseMillis
    const listed = await listOwnLeases(this.deviceDB, this.scope)
    if (! listed.ok) { this.#tellBadNews([listed.err]); return }
    const oldRows = listed.val.filter((row) => row.proved_at < cutoff)
    for (const row of oldRows) {
      const listed = this.#vaultListing.at(row)
      if (listed?.vault_tok === row.vault_tok) { listed.lock() }
    }
  }

  /** Every listed vault locked; the bank stays ready. Never throws. */
  lock(): this {
    this.#vaultListing.lock()
    return this
  }
  // --

  // == [Vaults]: vaultAt, ensureVault, tryEnsureVault, tryProbe, probe

  /** The vault listed for `scope`, a tombstone among them, or null. */
  vaultAt(scope: BankedVaultScope): Vault | null {
    this.device.demandEnabled()
    return this.#vaultListing.at(this.vaultScopeOf(scope))
  }

  /** SLOPDOC: The vault for `scope`, whether already listed or built now by asking the user. */
  async ensureVault(scope: BankedVaultScope): Promise<Vault> {
    const asked = this.vaultScopeOf(scope)
    this.device.demandEnabled()
    const listed = this.#vaultListing.at(asked)
    return (listed?.isPresent === true) ? listed : this.#vaultListing.buildVault(asked)
  }

  /** Non-throwing form of {@link ensureVault}. */
  tryEnsureVault(scope: BankedVaultScope): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(scope)) }

  /** Trials this bank's storage end to end at startup and reports each step, asking the user if the vault needs it: replaces one box, fetches it back and opens it, surfacing nothing it held. */
  tryProbe(asked: VX.ProbeAsked = {}, opts: VX.ProbeOpts = {}): Promise<Outcome<VX.ProbeReport>> { return outcomeOf(() => this.#probe(asked, opts)) }

  async #probe(asked: VX.ProbeAsked, opts: VX.ProbeOpts): Promise<VX.ProbeReport> {
    const { vaultlabel, boxlabel, whisper, sidecar } = VX.probeAsked.parse(asked)
    const { maxMillisSinceRefresh, maxMillisAtGetBack } = VX.probeOpts.parse(opts)
    const vault = await this.ensureVault({ vaultlabel })
    await vault.ensureUnlocked()
    const horizons = { maxMillisSinceRefresh, maxWorldMillis: maxMillisSinceRefresh }
    await vault.hydrate(horizons)
    // A device that has not listed the box would otherwise put over it as if none stood there.
    const found = await vault.getBox(boxlabel, { ...horizons, ifAbsent: 'nil' })
    const timely = { box: found?.sparse ?? null, vault: vault.sparse, boxRefreshedAt: found?.refreshedAt ?? null, vaultRefreshedAt: vault.refreshedAt, timestamp: nowMillis() }
    const boxscope = { ...vault.scope, boxlabel }
    const replacing = { ifAbsent: 'add', ifPresent: 'repl' } as const
    const put = probeStepOf(demandGood(await vault.boxListing.puttable(boxscope, replacing).tryPut({ whisper, sidecar }, { ...horizons, ...replacing })))
    const fetched = demandGood(await vault.boxListing.tryGet(boxscope, { maxMillisSinceRefresh: maxMillisAtGetBack }))
    const fetch = probeStepOf(fetched)
    await fetched.val?.extractWhisper({ maxMillisSinceRefresh: Infinity })
    return { timely, put, fetch, unseal: { ok: true, timestamp: nowMillis() } }
  }
  // --

  // == [Snapshot]: remakeSnapshot, makeSnapshot

  /** Make the snapshot again, and tell every listener where it differs. Bound, as its listing calls it. */
  readonly #remakeSnapshot = (): void => {
    const next = this.#makeSnapshot()
    if (next.vaults === this.#snapshot.vaults) { return }
    this.#snapshot = next
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }

  #makeSnapshot(): BankSnapshot {
    return Object.freeze({ ...this.scope, device_tok: this.device_tok, vaults: this.#vaultListing.snapshot })
  }
  // --

  /** Answers 'bank', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'bank' { return 'bank' satisfies Modelkind }
}

// == [Helpers]: listOwnLeases, probeStepOf

/** The leases cached in `deviceDB` for the bank scope `scope`, oldest first. */
export async function listOwnLeases(deviceDB: DeviceDB, { user_id, banklabel }: BankScope): Promise<Outcome<LeaseDated[]>> {
  const listed = await deviceDB.tryListLeases()
  return listed.ok ? good(listed.val.filter((row) => (row.user_id === user_id) && (row.banklabel === banklabel))) : listed
}

/** A storage verb's answer with no wrapped key or ciphertext left in it, and when it came back. */
function probeStepOf({ act, ask, val, world }: GoodAnswer<Box | null, GoodAct, unknown>): VX.ProbeStep {
  return { ok: true, act, ask, val: SX.boxSparse.parse(val?.sparse), world: SX.vaultSparse.parse(world), timestamp: nowMillis() }
}
// --
