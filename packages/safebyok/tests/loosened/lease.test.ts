/** What a lease does today that a guarantee or the spec forbids, pinned as it is until the Coach rules. Each `it` names its source and line. */

import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as TH from '../test-helpers'
import { fakeLeaseFriendOf, makeGrantedLease, useFakeClock } from '../test-helpers/proving-world'

useFakeClock()

describe("forgetting a lease whose forget is refused", () => {
  it("whiteboard/20261030-newvault/newvault-spec.md:73, 'forget() drops the keys and forgets the record': a vacate whose forgetLease is refused throws with the lease already forgotten, and a second vacate resolves without forgetting, so the record lies on", async () => {
    const friend = fakeLeaseFriendOf()
    const lease = await makeGrantedLease(friend)
    await lease.cacheAsCacheCan()
    friend.forgetLease.mockRejectedValueOnce(new VaultError('unexpected_error', 'the datastore is down'))
    await TH.expectRefusal(lease.revoke())
    expect(lease.isPresent).to.be.false
    await lease.revoke()
    expect(friend.forgetLease).toHaveBeenCalledTimes(1)
    expect(friend.cached).to.not.be.null
  })
})
