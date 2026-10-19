import { VaultDB, VaultError, isVaultError, type VaultPropsExpectation, type RetireExpectation, type Lockbox, type LockboxExpectation, type StoredLockbox, type VaultProps, type VaultScope } from 'safebyok'

/**
 * DEMO JANK: a pretend backend outage, switched on and off from the backend inspection panel, so
 * you can watch the app say "Can't reach your vault" in place and retry. A real app has no such
 * switch: its adapter refuses as `storage_unavailable` when its backend really is down.
 */
export type Outage = {
  /** True while the pretend backend is down. */
  isDown: () => boolean
  /** Take the pretend backend down, or bring it back. */
  setDown: (down: boolean) => void
  /** Calls `listener` whenever the switch flips; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
}

/**
 * An outage switch, starting up (the backend reachable).
 *
 * @example
 *   const outage = makeOutage()
 *   outage.setDown(true)
 *   outage.isDown()  // true
 */
export const makeOutage = (): Outage => {
  let down = false
  const listeners = new Set<() => void>()
  return {
    isDown: () => down,
    setDown: (nowDown) => {
      if (nowDown === down) { return }
      down = nowDown
      listeners.forEach((listener) => { listener() })
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/**
 * A VaultDB that hands every call through to `inner`, except while `outage` is down: then every
 * read and write refuses as `storage_unavailable`, as a real adapter does when its backend cannot
 * be reached. Watching for changes carries on through an outage, as a live query's socket would
 * reconnect. It declares what `inner` declares, so its own verbs hold every name to `inner`'s
 * limits before handing the call on.
 *
 * @example
 *   const vaultDB = new OutageVaultDB(idbVaultDB({ dbName: 'safebyok_demo' }), outage)
 */
export class OutageVaultDB extends VaultDB {
  readonly maxRecordBytes: number
  readonly maxVaultBytes: number
  readonly maxLockboxes: number
  readonly maxNameBytes: number
  private readonly inner: VaultDB
  private readonly outage: Outage

  /**
   * @param inner - The adapter that really stores the vault, whose logger this one says things through.
   * @param outage - The switch that takes it down.
   */
  constructor(inner: VaultDB, outage: Outage) {
    super({ logger: inner.logger })
    this.inner = inner
    this.outage = outage
    this.maxRecordBytes = inner.maxRecordBytes
    this.maxVaultBytes = inner.maxVaultBytes
    this.maxLockboxes = inner.maxLockboxes
    this.maxNameBytes = inner.maxNameBytes
  }

  protected async doReadVaultProps(scope: VaultScope): Promise<unknown> {
    this.refuseWhileDown()
    return await this.inner.readVaultProps(scope)
  }

  protected async doFetchOrCreateVaultProps(vaultProps: VaultProps): Promise<unknown> {
    this.refuseWhileDown()
    return await this.inner.fetchOrCreateVaultProps(vaultProps)
  }

  // The inner adapter's public verbs refuse a failed expectation as stale_write themselves, and a
  // VaultError passes through this adapter's verbs untouched: so reaching the end means it landed.
  protected async doUpdateVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean> {
    this.refuseWhileDown()
    await this.inner.updateVaultProps(vaultProps, expected)
    return true
  }

  protected async doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    this.refuseWhileDown()
    return await this.inner.readBox(scope, boxlabel)
  }

  // The inner list hands back public summaries, without the `format` this adapter's own list
  // verb checks for, so each lockbox is read whole; one retired between the list and its read is
  // simply gone. One the inner verbs refuse as damaged goes up as a stand-in that no lockbox
  // matches, so this adapter's own list marks it damaged too.
  protected async doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    this.refuseWhileDown()
    const listed = await this.inner.listBoxes(scope)
    const stored = await Promise.all(listed.map(async ({ boxlabel }) => ({ boxlabel, lockbox: await this.wholeOrDamaged(scope, boxlabel) })))
    return stored.filter(({ lockbox }) => lockbox !== null)
  }

  private async wholeOrDamaged(scope: VaultScope, boxlabel: string): Promise<unknown> {
    try {
      return await this.inner.readBox(scope, boxlabel)
    } catch (err) {
      if (! isVaultError(err, 'corrupt_record')) { throw err }
      return 'damaged'
    }
  }

  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<unknown> {
    this.refuseWhileDown()
    return this.inner.updateBox(scope, lockbox, expected)
  }

  protected async doRetireBox(scope: VaultScope, boxlabel: string, expected: RetireExpectation): Promise<boolean> {
    this.refuseWhileDown()
    await this.inner.retireBox(scope, boxlabel, expected)
    return true
  }

  protected async doRetireVault(scope: VaultScope, expected: RetireExpectation): Promise<boolean> {
    this.refuseWhileDown()
    await this.inner.retireVault(scope, expected)
    return true
  }

  // The one public verb this adapter hands on itself: retiring a vault whose props are damaged
  // needs the record as stored, which this adapter's own doReadVaultProps never sees, as the inner
  // verbs refuse it. The inner adapter does the checking and the retiring.
  override async retireDamagedVault(scope: VaultScope): Promise<void> {
    this.refuseWhileDown()
    await this.inner.retireDamagedVault(scope)
  }

  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    return this.inner.subscribe(scope, onChange)
  }

  private refuseWhileDown(): void {
    if (this.outage.isDown()) {
      throw new VaultError('storage_unavailable', "The pretend backend is down: switch the outage off in the backend panel below, then retry.")
    }
  }
}
