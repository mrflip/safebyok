import { Storable } from "./storable";

class Vault extends Storable {
  constructor(scope: VaultScope, opts: StorableOpts) {
      super(scope, opts);
  }

  fetchAndStuff() {
    const [ cached, fetched, lease ] = await Promise.all([this.cachedRecord(), this.fetchRecord(), KeptLease.tryGet(this.#deviceDB, this.#scope)])
    // props is
    const props = this.#reconcileOrThrow({ cached, fetched, lease })
    this.adopt(record)
  }

  /** update in-place with new values, replacing snapshot */
  override protected _assignProps(record) {
    // assign self values from props
  }

  override protected _makeSnapshot() {
    // do the thing.
  }

  /** Get the vault record, listing and this device's lease, judge them against the picture in hand by `#judgeStored`, take what it finds new, and raise this device's record to it.
   * Reads {@link DeviceDB.tryGetDeviceRecord}, then `VaultDB.getVault` beside {@link KeptLease.tryGet}, the lease kept.
   * A vault judged `behind` locks the vault as storage it cannot trust, and refuses 'vault_behind'.
   */
  async #takeStorage() {
    const refreshedAt = this.#clockNow()
    // I don't know what this counter is for but I'm skeptical it's needed. Don't tell me about it, but it needs a better encapsulation and one name.
    const leasesSeen = this.#leasesHeld
    // The device record is read first, so a raise this device's own write made is never held
    // against a read served before that write landed.
    const record = deviceRecordFor(this.#scope, valOf(await this.#deviceDB.tryGetDeviceRecord(this.#scope)))
    // Let go meanwhile: read no more, as the judgment would ignore what came.
    if (this.#goneBy !== null) { return }
    const [stored, leaseKept] = await Promise.all([this.#vaultDB.getVault(this.#scope), KeptLease.tryGet(this.#deviceDB, this.#scope)])

    // reconcileOrThrow -- if consistent, returns a ready-to-make ducktyped vault object { ...props, boxes, lease }. What is lease
    const verdict = this.#judgeStored(stored, record)
    if (verdict === 'ignore') { return }
    if (verdict === 'behind') {
      const refusal = behindError()
      // Storage serving an older copy is not to be trusted with an unlocked vault.
      await this.#heedRefusal(refusal)
      throw refusal
    }
    const { boxes, damagedBoxes, ...fresh } = verdict

    // this is adopting values, updating the snapshot (are there consequences to that),
    // stuff with the trouble queue, making new decisions about the lease, making new decisions about error conditions,
    // then updating the boxes, then updating the wayins. That's about 2/3rds of it. Seems a bit action packed.
    this.#takePicture({ fresh: frozenVaultRecord(fresh), listing: { boxes, damagedBoxes }, leaseKept: valOf(leaseKept), refreshedAt, leasesSeen })
    // Anyone new to the codebase will think raise means throw. Hasn't the epoch already updated?
    // does this mean "cache the record"?
    await this.#raiseRecordAfter(fresh.vault_epoch, 'refresh')
  }
}

class Listing {






}