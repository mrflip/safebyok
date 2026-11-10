/** ConvexVaultDB: the battery every VaultDB runs, over a real ConvexClient, and the triage and options of its own. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { anyApi } from 'convex/server'
import type { ConvexClient } from 'convex/browser'
import type { Boxscope, VaultScope } from 'safebyok/storage'
import * as TH from './test-helpers'
import { ConvexVaultDB } from '../src/index'
import type { ConvexVaultDBOpts } from '../src/index'
import { fakeDeployment } from '../src/testing'
import type { FakeDeployment, FakeHost } from '../src/testing'

type ComponentDeployment = FakeDeployment<ReturnType<typeof TH.componentHost>>

// Every deployment a test makes is closed after it, so no client keeps its socket's timers alive.
// The battery refuses mutations on purpose, and a client logs each as an error: a spy keeps the output clean.
const deployments: FakeDeployment<FakeHost>[] = []
const deploy = <Host extends FakeHost>(host: Host): FakeDeployment<Host> => {
  const deployment = fakeDeployment(host, { logger: TH.spyLogger().logger })
  deployments.push(deployment)
  return deployment
}
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

// The battery writes as several users, so its vaults reach the component directly, past the host's wrapper.
const madeOn = new WeakMap<ConvexVaultDB, { deployment: ComponentDeployment, client: ConvexClient, opts: VaultDBOnOpts }>()

type VaultDBOnOpts = Omit<ConvexVaultDBOpts, 'client' | 'api'>

const vaultDBOn = (deployment: ComponentDeployment, opts: VaultDBOnOpts = {}): ConvexVaultDB => {
  const client = deployment.client(null)
  const vaultDB = new ConvexVaultDB({ ...opts, client, api: TH.rootApi })
  madeOn.set(vaultDB, { deployment, client, opts })
  return vaultDB
}

const madeOf = (vaultDB: ConvexVaultDB) => {
  const made = madeOn.get(vaultDB)
  if (! made) { throw new Error('The vaultDB was not made by this test file.') }
  return made
}

const convexRowsOf = (vaultDB: ConvexVaultDB): TH.VaultDBRowCheats => {
  type ComponentBackend = ReturnType<ComponentDeployment['as']>
  const { deployment } = madeOf(vaultDB)
  // Plants are changes the clients hear of, as a write from elsewhere would be.
  const run: ComponentBackend['run'] = async (fn) => await deployment.arrange(async (backend) => await backend.run(fn))
  const findVaultDoc = async (db: Parameters<Parameters<ComponentBackend['run']>[0]>[0]['db'], { applabel, user_id, vaultlabel }: VaultScope) => (
    await db.query('safebyok_vaults').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel)).unique()
  )
  return {
    plantVaultRow: async (scope, row) => {
      await run(async ({ db }) => {
        const { applabel, user_id, vaultlabel } = scope
        const vaultDoc = await findVaultDoc(db, scope)
        if (vaultDoc) { await db.replace('safebyok_vaults', vaultDoc._id, { applabel, user_id, vaultlabel, vault: row }) } else { await db.insert('safebyok_vaults', { applabel, user_id, vaultlabel, vault: row }) }
      })
    },
    // A planted row is not tallied, so the life's tally is dropped, to be counted afresh.
    plantBoxRow: async (scope: Boxscope, vault_tok, row) => {
      await run(async ({ db }) => {
        const { applabel, user_id, vaultlabel, boxlabel } = scope
        const boxDoc = await db.query('safebyok_boxes')
          .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok).eq('boxlabel', boxlabel))
          .unique()
        const planted = { applabel, user_id, vaultlabel, vault_tok, boxlabel, box: row }
        if (boxDoc) { await db.replace('safebyok_boxes', boxDoc._id, planted) } else { await db.insert('safebyok_boxes', planted) }
        const tallyDoc = await db.query('safebyok_tallies')
          .withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
          .unique()
        if (tallyDoc) { await db.delete('safebyok_tallies', tallyDoc._id) }
      })
    },
    vaultRowOf: async (scope) => await run(async ({ db }) => {
      const vaultDoc = await findVaultDoc(db, scope)
      return (vaultDoc?.vault ?? null) as unknown
    }),
    boxRowsOf: async ({ applabel, user_id, vaultlabel }, vault_tok) => {
      const boxDocs = await run(async ({ db }) => await db.query('safebyok_boxes')
        .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('applabel', applabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
        .collect())
      return new Map(boxDocs.map(({ boxlabel, box }) => [boxlabel, box as unknown]))
    },
  }
}

// The next query or mutation the vault's client makes fails as Convex reports a server error, its text the host's.
const failNextCall = (vaultDB: ConvexVaultDB, text = '[Request ID: 0123456789abcdef] Server Error'): void => {
  const calls = madeOf(vaultDB).client as unknown as Record<'query' | 'mutation', () => Promise<unknown>>
  const spies = [vi.spyOn(calls, 'query'), vi.spyOn(calls, 'mutation')]
  const fail = (): Promise<never> => {
    for (const spy of spies) { spy.mockRestore() }
    return Promise.reject(new Error(text))
  }
  for (const spy of spies) { spy.mockImplementationOnce(fail) }
}

TH.describeVaultDBBattery("ConvexVaultDB over a ConvexClient", {
  makeVaultDB:         (opts) => vaultDBOn(deploy(TH.componentHost()), opts),
  makeTwin:            (vaultDB) => vaultDBOn(madeOf(vaultDB).deployment, madeOf(vaultDB).opts),
  makeCappedVaultDB:   (maxBoxes) => vaultDBOn(deploy(TH.componentHost()), { maxBoxes }),
  makeVaultDBFor:      () => {
    const deployment = deploy(TH.hostWith(TH.bySubject))
    return (user_id) => new ConvexVaultDB({ client: deployment.client(user_id), api: deployment.api.safebyok })
  },
  _cheat_rowsOf:       convexRowsOf,
  _cheat_failNextCall: (vaultDB) => { failNextCall(vaultDB) },
})

describe("ConvexVaultDB's refusals", () => {
  it("revoke the identity when the host's functions refuse the caller", async () => {
    const deployment = deploy(TH.hostWith(TH.bySubject))
    const vaultDB = new ConvexVaultDB({ client: deployment.client('u2'), api: deployment.api.safebyok })
    await TH.expectBad(vaultDB.tryGetVault(TH.vaultScope), 'identity_revoked')
    await TH.expectBad(vaultDB.tryListVaults(TH.bankScope), 'identity_revoked')
  })

  it("quote nothing of any other failure's text", async () => {
    const vaultDB = vaultDBOn(deploy(TH.componentHost()))
    failNextCall(vaultDB, 'host detail sk-live-0000')
    const refusal = await TH.expectBad(vaultDB.tryListVaults(TH.bankScope), 'storage_unavailable')
    expect(TH.thrownText(refusal)).not.to.include('sk-live-0000')
  })
})

describe("ConvexVaultDB's constructor", () => {
  it("refuses a client that is not a Convex client", () => {
    TH.expectSyncRefusal(() => new ConvexVaultDB({ client: {} as never, api: TH.rootApi }), 'bad_option')
  })

  it("refuses the whole generated api in place of its safebyok module", () => {
    const deployment = deploy(TH.componentHost())
    TH.expectSyncRefusal(() => new ConvexVaultDB({ client: deployment.client(null), api: anyApi as never }), 'bad_option')
  })

  it("refuses a maxBoxes it cannot use", () => {
    const deployment = deploy(TH.componentHost())
    for (const maxBoxes of [-1, 1.5, NaN]) {
      TH.expectSyncRefusal(() => new ConvexVaultDB({ client: deployment.client(null), api: TH.rootApi, maxBoxes }), 'bad_option')
    }
  })
})
