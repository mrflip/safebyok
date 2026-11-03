/** What a lease does today that a guarantee or the spec forbids, pinned as it is until the Coach rules. Each `it` names its source and line. */

import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/errors'
import { bad } from '../../src/outcome'
import * as TH from '../test-helpers'
import { fakeLeaseFriendOf, makeGrantedLease, useFakeClock } from '../test-helpers/proving-world'

useFakeClock()

describe("forgetting a lease whose erase is refused", () => {
  it("whiteboard/20261030-newvault/newvault-spec.md:73, 'forget() drops the keys and erases the record': a vacate whose tryUncacheLease is refused throws with the lease already forgotten, and a second vacate resolves without erasing, so the record lies on", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    await lease.cache()
    friend.tryUncacheLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the store is down')))
    await TH.expectRefusal(lease.vacate(), 'unexpected_error')
    expect(lease.isForgotten).to.be.true
    await lease.vacate()
    expect(friend.tryUncacheLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.not.be.null
  })
})
