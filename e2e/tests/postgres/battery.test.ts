// @vitest-environment node
// The VaultDB battery and its races, run over a real Postgres through `pg`: the same
// `describeVaultDB` that `packages/safebyok-postgres/tests/postgres-vault-db.test.ts` runs over a
// PGlite, which runs one statement at a time. Here each device has a pool of its own, so the
// statements the races hold and release run on separate connections, at once.
import { describe, it } from 'vitest'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()

/** A fresh, emptied database, and the postgresVaultDB a request signed in as `userId` gets over it: one pool, one listener, as a server has. */
const freshServer = async () => {
  const db = getDb()
  await db.endDevices()
  await db.empty()
  return TH.deviceOver(db, undefined, {})
}

TH.describeOnPostgres('battery', "postgresVaultDB over a real Postgres", () => {
  TH.describeVaultDB('postgresVaultDB over a real Postgres', async () => {
    const vaultDBFor = await freshServer()
    return TH.perUser((userId) => vaultDBFor(userId))
  }, {
    makeCappedVaultDB:     async (maxLockboxes) => {
      const db = getDb()
      await db.endDevices()
      await db.empty()
      const vaultDBFor = TH.deviceOver(db, undefined, { maxLockboxes })
      return TH.perUser((userId) => vaultDBFor(userId))
    },
    makeVaultDBFor: async () => {
      const vaultDBFor = await freshServer()
      return (userId) => vaultDBFor(userId)
    },
    pushes:      true,
    makeDevices: TH.devicesOver(getDb),
  })

  describe("postgresVaultDB's devices over a real Postgres, for the battery's races", () => {
    it("send every write's statement through the race's turnstile", async () => {
      await TH.expectRoundTripsThroughTurnstile(TH.devicesOver(getDb))
    })
  })
})
