// @vitest-environment node
// The VaultDB battery and its races, run over a real Postgres through `pg`: the same
// `describeVaultDB` that `packages/safebyok-postgres/tests/postgres-vault-db.test.ts` runs over a
// PGlite, which runs one statement at a time. Here each device has a pool of its own, so the
// statements the races hold and release run on separate connections, at once.
import { describe, it } from 'vitest'
import type { VaultDBOpts } from 'safebyok'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()

/** A fresh, emptied database, and the postgresVaultDB a request signed in as `user_id` gets over it: one pool, one listener, as a server has. */
const freshServer = async (vaultDBOpts: VaultDBOpts = {}) => {
  const db = getDb()
  await db.endDevices()
  await db.empty()
  return TH.deviceOver(db, undefined, { vaultDBOpts })
}

TH.describeOnPostgres('battery', "postgresVaultDB over a real Postgres", () => {
  TH.describeVaultDB('postgresVaultDB over a real Postgres', async (vaultDBOpts) => {
    const vaultDBFor = await freshServer(vaultDBOpts)
    return TH.perUser((user_id) => vaultDBFor(user_id))
  }, {
    makeCappedVaultDB:     async (maxBoxes) => {
      const db = getDb()
      await db.endDevices()
      await db.empty()
      const vaultDBFor = TH.deviceOver(db, undefined, { maxBoxes })
      return TH.perUser((user_id) => vaultDBFor(user_id))
    },
    makeVaultDBFor: async () => {
      const vaultDBFor = await freshServer()
      return (user_id) => vaultDBFor(user_id)
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
