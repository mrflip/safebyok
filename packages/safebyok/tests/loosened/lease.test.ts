/** What a lease does today that a guarantee or the spec forbids, pinned as it is until the Coach rules. Each `it` names its source and line. */

import { describe, expect, it, vi } from 'vitest'
import { MaxTimerMillis } from '../../src/consts'
import { VaultError } from '../../src/errors'
import { Lease } from '../../src/models/lease'
import { bad } from '../../src/outcome'
import * as TH from '../test-helpers'
import { duckVaultOf, fakeDBFriendOf, grantedLeaseOf, sealStampsOf, T0, useFakeClock, WeekMillis } from '../test-helpers/proving-world'

useFakeClock()

const whisperBytesOf = (): Uint8Array => new TextEncoder().encode('{"val":"sk-test-0000"}')

describe("a lease past its autolock_at", () => {
  it("notes/guarantees.md:230, 'dropped at its ask_passphrase_at': once the clock passes autolock_at, before its timer fires, the lease is not in force yet still seals and opens", async () => {
    const lease = await grantedLeaseOf(duckVaultOf(), fakeDBFriendOf())
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    vi.setSystemTime(T0 + WeekMillis + 1)
    expect(lease.isInForce).to.be.false
    const sealed = await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
    expect(await lease.unsealWith(sealed, boxKeyStamp, whisperStamp)).to.be.instanceOf(Uint8Array)
  })

  it("whiteboard/20261030-newvault/newvault-spec.md:67, 'a Trigger ... scheduled at autolock_at, whose launch is vault.lock()': a lease longer than MaxTimerMillis arms no timer, so a day past its autolock_at it has locked nothing and still seals", async () => {
    const vault = duckVaultOf()
    const leaseMillis = MaxTimerMillis + WeekMillis
    const lease = await grantedLeaseOf(vault, fakeDBFriendOf(), { leaseMillis })
    expect(vi.getTimerCount()).to.eq(0)
    await vi.advanceTimersByTimeAsync(leaseMillis + (24 * 3_600_000))
    expect(vault.lock).not.toHaveBeenCalled()
    expect(lease.isForgotten).to.be.false
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    await lease.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
  })

  it("notes/guarantees.md:230, 'dropped at its ask_passphrase_at': Lease.get hands back a kept lease whose autolock_at has passed, and it seals until its autolock's timer turns", async () => {
    const friend = fakeDBFriendOf()
    await grantedLeaseOf(duckVaultOf(), friend)
    vi.setSystemTime(T0 + (2 * WeekMillis))
    const vault = duckVaultOf()
    const got = await Lease.get(vault, friend)
    expect(got).to.be.instanceOf(Lease)
    expect(got!.isInForce).to.be.false
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    await got!.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp)
    await vi.advanceTimersByTimeAsync(0)
    expect(vault.lock).toHaveBeenCalledTimes(1)
    expect(friend.kept).to.be.null
  })
})

describe("a lease that proves damaged", () => {
  it("notes/guarantees.md:230, 'dropped ... when it proves damaged': a lease that will not open calls vault.lock() and keeps its record, in force, refusing 'damaged_lease' and locking again at each later call", async () => {
    const friend = fakeDBFriendOf()
    await grantedLeaseOf(duckVaultOf(), friend)
    const kept = friend.kept as { autolock_at: number }
    friend.kept = { ...kept, autolock_at: kept.autolock_at + 1 }
    const vault = duckVaultOf()
    const got = await Lease.get(vault, friend)
    const { boxKeyStamp, whisperStamp } = sealStampsOf('b1')
    await TH.expectRefusal(got!.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp), 'damaged_lease')
    await TH.expectRefusal(got!.sealWith(whisperBytesOf(), boxKeyStamp, whisperStamp), 'damaged_lease')
    expect(vault.lock).toHaveBeenCalledTimes(2)
    expect(got!.isForgotten).to.be.false
    expect(got!.isInForce).to.be.true
    expect(friend.tryDelLease).not.toHaveBeenCalled()
  })
})

describe("forgetting a lease whose erase is refused", () => {
  it("whiteboard/20261030-newvault/newvault-spec.md:66, 'forget() drops the keys and erases the record': a forget whose tryDelLease is refused throws with the lease already forgotten, and a second forget resolves without erasing, so the record lies on", async () => {
    const friend = fakeDBFriendOf()
    const lease = await grantedLeaseOf(duckVaultOf(), friend)
    friend.tryDelLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the store is down')))
    await TH.expectRefusal(lease.forget(), 'unexpected_error')
    expect(lease.isForgotten).to.be.true
    await lease.forget()
    expect(friend.tryDelLease).toHaveBeenCalledTimes(1)
    expect(friend.kept).to.not.be.null
  })
})

describe("the stamps a lease seals under", () => {
  it("packages/safebyok/src/models/models-shapes.ts:644, 'A stamp is the caller's own fields fixed for its record's life': empty stamps pass, so what one box sealed under them opens as any other box's", async () => {
    const lease = await grantedLeaseOf(duckVaultOf(), fakeDBFriendOf())
    const sealed = await lease.sealWith(whisperBytesOf(), {}, {})
    expect(await lease.unsealWith(sealed, {}, {})).to.be.instanceOf(Uint8Array)
  })
})
