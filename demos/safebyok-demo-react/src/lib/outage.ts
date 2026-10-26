import { VaultDB, VaultError, outcomeOf, valOf, type Outcome, type VaultRecordExpectation, type VaultDelExpectation, type BoxRecord, type BoxGetExpectation, type BoxExpectation, type BoxDelExpectation, type StoredVault, type VaultTombstone, type VaultRecord, type VaultRecords, type VaultScope } from 'safebyok'

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
  readonly maxBoxes: number
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
    this.maxBoxes = inner.maxBoxes
    this.maxNameBytes = inner.maxNameBytes
  }

  // The inner adapter's records verbs hand on each box as stored, which this adapter's own checks
  // read as its listing does.
  protected async doGetVault(scope: VaultScope): Promise<StoredVault> {
    this.refuseWhileDown()
    return storedVaultOf(valOf(await this.inner.getVaultRecords(scope)))
  }

  protected async doEnsureVault(draft: VaultRecord & { gate: null, gate_epoch: 0 }): Promise<StoredVault> {
    this.refuseWhileDown()
    return storedVaultOf(valOf(await this.inner.ensureVaultRecords(draft)))
  }

  // The inner adapter's public verbs refuse a failed expectation as stale_write themselves, and a
  // refusal thrown here passes through this adapter's verbs untouched: so reaching the end means
  // it landed, and the vault record as the inner adapter stored it is the answer.
  protected async doPutVaultProps(vaultRecord: VaultRecord, expected: VaultRecordExpectation): Promise<unknown> {
    this.refuseWhileDown()
    return valOf(await this.inner.putVaultProps(vaultRecord, expected))
  }

  protected async doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<unknown> {
    this.refuseWhileDown()
    return valOf(await this.inner.getBox(scope, boxlabel, expected))
  }

  protected async doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown> {
    this.refuseWhileDown()
    return valOf(await this.inner.putBox(scope, expected, box))
  }

  protected async doGetCapacity(scope: VaultScope): Promise<unknown> {
    this.refuseWhileDown()
    return valOf(await this.inner.getCapacity(scope))
  }

  protected async doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown> {
    this.refuseWhileDown()
    return valOf(await this.inner.delBox(scope, boxlabel, expected))
  }

  // What the inner adapter's deletion left, its tombstone, is the answer.
  protected async doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<unknown> {
    this.refuseWhileDown()
    return valOf(await this.inner.delVault(scope, expected))
  }

  // The one public verb this adapter hands on itself: deleting a vault whose props are damaged
  // needs the record as stored, which this adapter's own doGetVault never sees, as the inner
  // verbs refuse it. The inner adapter does the checking and the deleting.
  override delDamagedVault(scope: VaultScope): Promise<Outcome<VaultTombstone | null>> {
    return this.outage.isDown() ? outcomeOf(() => { this.refuseWhileDown(); return null }) : this.inner.delDamagedVault(scope)
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

/** A vault as another VaultDB's records verbs hand it on, or null for none, as this adapter's half hands it up: each box under the boxlabel it holds. */
const storedVaultOf = (records: VaultRecords | null): StoredVault => (
  records === null
    ? { vaultProps: null, boxes: [] }
    : { vaultProps: records.vaultProps, boxes: records.boxes.map((box) => ({ boxlabel: (box as { boxlabel: string }).boxlabel, box })) }
)
