/** ConvexVaultDB: the shared VaultDB battery run through a real ConvexClient, plus tests of its own refusals and options. */

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

// Each deployment a test makes is closed afterwards, so no client keeps its socket's timers alive.
// The battery makes mutations fail on purpose, and a client logs each failure as an error, so a spy keeps the output clean.
const deployments: FakeDeployment<FakeHost>[] = []
function deploy<Host extends FakeHost>(host: Host): FakeDeployment<Host> {
  const deployment = fakeDeployment(host, { logger: TH.spyLogger().logger })
  deployments.push(deployment)
  return deployment
}
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

// The battery writes as several users, so its vaultDBs call the component directly, without the host's wrapper.
const madeOn = new WeakMap<ConvexVaultDB, { deployment: ComponentDeployment, client: ConvexClient, opts: VaultDBOnOpts }>()

type VaultDBOnOpts = Omit<ConvexVaultDBOpts, 'client' | 'api'>

function vaultDBOn(deployment: ComponentDeployment, opts: VaultDBOnOpts = {}): ConvexVaultDB {
  const client = deployment.client(null)
  const vaultDB = new ConvexVaultDB({ ...opts, client, api: TH.rootApi })
  madeOn.set(vaultDB, { deployment, client, opts })
  return vaultDB
}

function madeOf(vaultDB: ConvexVaultDB) {
  const made = madeOn.get(vaultDB)
  if (! made) { throw new Error('The vaultDB was not made by this test file.') }
  return made
}

const convexRowsOf = (vaultDB: ConvexVaultDB): TH.VaultDBRowCheats => {
  type ComponentBackend = ReturnType<ComponentDeployment['as']>
  const { deployment } = madeOf(vaultDB)
  // Plant through `arrange`, so the clients are notified of each planted change, as they would be of a write from elsewhere.
  const run: ComponentBackend['run'] = async (fn) => await deployment.arrange(async (backend) => await backend.run(fn))
  async function getVaultDoc(db: Parameters<Parameters<ComponentBackend['run']>[0]>[0]['db'], { user_id, banklabel, vaultlabel }: VaultScope) {
    return await db.query('safebyok_vaults').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel)).unique()
  }
  return {
    plantVaultRow: async (scope, row) => {
      await run(async ({ db }) => {
        const { user_id, banklabel, vaultlabel } = scope
        const vaultDoc = await getVaultDoc(db, scope)
        if (vaultDoc) { await db.replace('safebyok_vaults', vaultDoc._id, { user_id, banklabel, vaultlabel, vault: row }) } else { await db.insert('safebyok_vaults', { user_id, banklabel, vaultlabel, vault: row }) }
      })
    },
    // A planted row is not tallied, so the life's tally is deleted and the next put recounts it.
    plantBoxRow: async (scope: Boxscope, vault_tok, row) => {
      await run(async ({ db }) => {
        const { user_id, banklabel, vaultlabel, boxlabel } = scope
        const boxDoc = await db.query('safebyok_boxes')
          .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok).eq('boxlabel', boxlabel))
          .unique()
        const planted = { user_id, banklabel, vaultlabel, vault_tok, boxlabel, box: row }
        if (boxDoc) { await db.replace('safebyok_boxes', boxDoc._id, planted) } else { await db.insert('safebyok_boxes', planted) }
        const tallyDoc = await db.query('safebyok_tallies')
          .withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
          .unique()
        if (tallyDoc) { await db.delete('safebyok_tallies', tallyDoc._id) }
      })
    },
    vaultRowOf: async (scope) => await run(async ({ db }) => {
      const vaultDoc = await getVaultDoc(db, scope)
      return (vaultDoc?.vault ?? null) as unknown
    }),
    boxRowsOf: async ({ user_id, banklabel, vaultlabel }, vault_tok) => {
      const boxDocs = await run(async ({ db }) => await db.query('safebyok_boxes')
        .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('vault_tok', vault_tok))
        .collect())
      return new Map(boxDocs.map(({ boxlabel, box }) => [boxlabel, box as unknown]))
    },
  }
}

// Make the client's next query or mutation fail the way Convex reports a server error, with `text` as its message.
function failNextCall(vaultDB: ConvexVaultDB, text = '[Request ID: 0123456789abcdef] Server Error'): void {
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
    await TH.expectBad(vaultDB.tryGetVault(TH.vaultGetAskOf()), 'identity_revoked')
    await TH.expectBad(vaultDB.tryListVaults(TH.vaultListAsk), 'identity_revoked')
  })

  it("quote nothing of any other failure's text", async () => {
    const vaultDB = vaultDBOn(deploy(TH.componentHost()))
    failNextCall(vaultDB, 'host detail sk-live-0000')
    const refusal = await TH.expectBad(vaultDB.tryListVaults(TH.vaultListAsk), 'storage_unavailable')
    expect(TH.thrownText(refusal)).not.to.include('sk-live-0000')
  })

  it("tell a watch's onBadNews of a watched query that fails", async () => {
    const deployment = deploy(TH.hostWith(TH.bySubject))
    const vaultDB = new ConvexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok })
    const onBadNews = vi.fn()
    const unwatch = vaultDB.watch(TH.bankScope, () => undefined, onBadNews)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    deployment.signOut()
    await vi.waitFor(() => { expect(onBadNews).toHaveBeenCalled() })
    expect(onBadNews.mock.calls[0]?.[0]).to.have.property('refusalkind', 'identity_revoked')
    unwatch()
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
    for (const maxBoxes of [-1, 0, 1.5, NaN]) {
      TH.expectSyncRefusal(() => new ConvexVaultDB({ client: deployment.client(null), api: TH.rootApi, maxBoxes }), 'bad_option')
    }
  })
})
