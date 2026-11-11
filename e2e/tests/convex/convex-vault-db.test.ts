/** ConvexVaultDB over a ConvexReactClient: the battery every VaultDB runs, and what that client does its own way. */

// The battery's hooks are copies of those in `packages/safebyok-convex/tests/convex-vault-db.test.ts`,
// which run over a ConvexClient so that package's suite stands alone: a change to one is made in both.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConvexReactClient } from 'convex/react'
import type { Boxscope, Notice, VaultScope } from 'safebyok/storage'
import { ConvexVaultDB } from 'safebyok-convex'
import type { ConvexVaultDBOpts } from 'safebyok-convex'
import { fakeDeployment } from 'safebyok-convex/testing'
import type { FakeDeployment, FakeHost } from 'safebyok-convex/testing'
import * as TH from './test-helpers'

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

/** A real ConvexReactClient on `deployment`, signed in as `subject`, or as no one. */
const connectReact = (deployment: FakeDeployment<FakeHost>, subject: string | null) => (
  deployment.connectWith(subject, (address, opts) => new ConvexReactClient(address, opts))
)

// The battery writes as several users, so its vaults reach the component directly, past the host's wrapper.
const madeOn = new WeakMap<ConvexVaultDB, { deployment: ComponentDeployment, client: ConvexReactClient, opts: VaultDBOnOpts }>()

type VaultDBOnOpts = Omit<ConvexVaultDBOpts, 'client' | 'api'>

const vaultDBOn = (deployment: ComponentDeployment, opts: VaultDBOnOpts = {}): ConvexVaultDB => {
  const client = connectReact(deployment, null)
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

TH.describeVaultDBBattery("ConvexVaultDB over a ConvexReactClient", {
  makeVaultDB:         (opts) => vaultDBOn(deploy(TH.componentHost()), opts),
  makeTwin:            (vaultDB) => vaultDBOn(madeOf(vaultDB).deployment, madeOf(vaultDB).opts),
  makeCappedVaultDB:   (maxBoxes) => vaultDBOn(deploy(TH.componentHost()), { maxBoxes }),
  _cheat_rowsOf:       convexRowsOf,
  _cheat_failNextCall: (vaultDB) => { failNextCall(vaultDB) },
})

/** A ConvexVaultDB on a host as the README has it, over a ConvexReactClient signed in as `subject`. */
const hostedVaultDB = (subject: string | null) => {
  const deployment = deploy(TH.hostWith(TH.bySubject))
  return { deployment, vaultDB: new ConvexVaultDB({ client: connectReact(deployment, subject), api: deployment.api.safebyok }) }
}

describe("ConvexVaultDB over a ConvexReactClient, on a host's functions", () => {
  it("serves the user signed in", async () => {
    const { vaultDB } = hostedVaultDB('u1')
    const ask = TH.vaultPutAskOf(TH.vaultAt())
    await TH.expectGood(vaultDB.tryPutVault(ask))
    expect(await vaultDB.getVault(TH.vaultGetAskOf())).to.deep.include({ act: 'gotlive', world: TH.vaultAt() })
  })

  it("is refused when no one is signed in, or someone else is", async () => {
    await TH.expectBad(hostedVaultDB(null).vaultDB.tryGetVault(TH.vaultGetAskOf()), 'identity_revoked')
    await TH.expectBad(hostedVaultDB('u2').vaultDB.tryListVaults(TH.bankScope), 'identity_revoked')
  })

  it("is refused again for a query the client already has the refusal of", async () => {
    const { vaultDB } = hostedVaultDB('u2')
    await TH.expectBad(vaultDB.tryGetVault(TH.vaultGetAskOf()), 'identity_revoked')
    await TH.expectBad(vaultDB.tryGetVault(TH.vaultGetAskOf()), 'identity_revoked')
  })

  it("notifies a second watch of a change in rows the client already watches", async () => {
    const { deployment, vaultDB } = hostedVaultDB('u1')
    const first: Notice[] = []
    const second: Notice[] = []
    const unwatchFirst = vaultDB.watch(TH.bankScope, (notice) => { first.push(notice) })
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    const unwatchSecond = vaultDB.watch(TH.bankScope, (notice) => { second.push(notice) })
    await deployment.arrange((backend) => backend.withIdentity({ subject: 'u1' }).mutation(deployment.api.safebyok.putVault, TH.putVaultArgs(TH.vaultAt())))
    await vi.waitFor(() => { expect(second.map(({ act }) => act)).to.include('got') })
    expect(first.map(({ act }) => act)).to.include('got')
    unwatchFirst()
    unwatchSecond()
    unwatchSecond()
  })
})
