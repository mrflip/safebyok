/** ConvexBankDB over a ConvexReactClient: the battery every BankDB runs, and what that client does its own way. */

// The battery's hooks are copies of those in `packages/safebyok-convex/tests/convex-bank-db.test.ts`,
// which run over a ConvexClient so that package's suite stands alone: a change to one is made in both.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConvexReactClient } from 'convex/react'
import type { BankScope, BX, VaultScope } from 'safebyok/storage'
import { ConvexBankDB } from 'safebyok-convex'
import type { ConvexBankDBOpts } from 'safebyok-convex'
import { fakeDeployment } from 'safebyok-convex/testing'
import type { FakeDeployment, FakeHost } from 'safebyok-convex/testing'
import * as TH from './test-helpers'

const { BW } = TH

type ComponentDeployment = FakeDeployment<ReturnType<typeof TH.componentHost>>
type ComponentBackend = ReturnType<ComponentDeployment['as']>
type ComponentDb = Parameters<Parameters<ComponentBackend['run']>[0]>[0]['db']

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

// The battery writes as several users, so its bankDBs reach the component directly, past the host's wrapper.
const madeOn = new WeakMap<ConvexBankDB, { deployment: ComponentDeployment, client: ConvexReactClient, opts: BankDBOnOpts }>()

type BankDBOnOpts = Omit<ConvexBankDBOpts, 'client' | 'api'>

const bankDBOn = (deployment: ComponentDeployment, opts: BankDBOnOpts = {}): ConvexBankDB => {
  const client = connectReact(deployment, null)
  const bankDB = new ConvexBankDB({ ...opts, client, api: TH.rootBankApi })
  madeOn.set(bankDB, { deployment, client, opts })
  return bankDB
}

const madeOf = (bankDB: ConvexBankDB) => {
  const made = madeOn.get(bankDB)
  if (! made) { throw new Error('The bankDB was not made by this test file.') }
  return made
}

async function getBankDoc(db: ComponentDb, { user_id, banklabel }: BankScope) {
  return await db.query('safebyok_banks').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel)).unique()
}

async function getGateDoc(db: ComponentDb, { user_id, banklabel }: BankScope, gatelabel: string) {
  return await db.query('safebyok_gates').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('gatelabel', gatelabel)).unique()
}

async function getVaultDoc(db: ComponentDb, { user_id, banklabel, vaultlabel }: VaultScope) {
  return await db.query('safebyok_vaults').withIndex('by_scope', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel)).unique()
}

function lifeBoxQuery(db: ComponentDb, { user_id, banklabel, vaultlabel }: VaultScope, bank_tok: string, vault_tok: string) {
  return db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('bank_tok', bank_tok).eq('vault_tok', vault_tok))
}

const convexRowsOf = (bankDB: ConvexBankDB): TH.BankDBRowCheats => {
  const { deployment } = madeOf(bankDB)
  // Plants are changes the clients hear of, as a write from elsewhere would be.
  const run: ComponentBackend['run'] = async (fn) => await deployment.arrange(async (backend) => await backend.run(fn))
  return {
    plantBankRow: async (scope, row) => {
      await run(async ({ db }) => {
        const { user_id, banklabel } = scope
        const bankDoc = await getBankDoc(db, scope)
        if (bankDoc) { await db.replace('safebyok_banks', bankDoc._id, { user_id, banklabel, bank: row }) } else { await db.insert('safebyok_banks', { user_id, banklabel, bank: row }) }
      })
    },
    plantGateRow: async (scope, row) => {
      await run(async ({ db }) => {
        const { user_id, banklabel, gatelabel } = scope
        const gateDoc = await getGateDoc(db, scope, gatelabel)
        if (gateDoc) { await db.replace('safebyok_gates', gateDoc._id, { user_id, banklabel, gatelabel, gate: row }) } else { await db.insert('safebyok_gates', { user_id, banklabel, gatelabel, gate: row }) }
      })
    },
    plantVaultRow: async (scope, row) => {
      await run(async ({ db }) => {
        const { user_id, banklabel, vaultlabel } = scope
        const vaultDoc = await getVaultDoc(db, scope)
        if (vaultDoc) { await db.replace('safebyok_vaults', vaultDoc._id, { user_id, banklabel, vaultlabel, vault: row }) } else { await db.insert('safebyok_vaults', { user_id, banklabel, vaultlabel, vault: row }) }
      })
    },
    // A planted row is not tallied, so the life's tally is dropped, to be counted afresh.
    plantBoxRow: async (scope, bank_tok, vault_tok, row) => {
      await run(async ({ db }) => {
        const { user_id, banklabel, vaultlabel, boxlabel } = scope
        const boxDoc = await lifeBoxQuery(db, scope, bank_tok, vault_tok).filter((qq) => qq.eq(qq.field('boxlabel'), boxlabel)).unique()
        const planted = { user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel, box: row }
        if (boxDoc) { await db.replace('safebyok_boxes', boxDoc._id, planted) } else { await db.insert('safebyok_boxes', planted) }
        const tallyDoc = await db.query('safebyok_tallies')
          .withIndex('by_life', (idx) => idx.eq('user_id', user_id).eq('banklabel', banklabel).eq('vaultlabel', vaultlabel).eq('bank_tok', bank_tok).eq('vault_tok', vault_tok))
          .unique()
        if (tallyDoc) { await db.delete('safebyok_tallies', tallyDoc._id) }
      })
    },
    bankRowOf: async (scope) => await run(async ({ db }) => {
      const bankDoc = await getBankDoc(db, scope)
      return (bankDoc?.bank ?? null) as unknown
    }),
    gateRowOf: async (scope) => await run(async ({ db }) => {
      const gateDoc = await getGateDoc(db, scope, scope.gatelabel)
      return (gateDoc?.gate ?? null) as unknown
    }),
    vaultRowOf: async (scope) => await run(async ({ db }) => {
      const vaultDoc = await getVaultDoc(db, scope)
      return (vaultDoc?.vault ?? null) as unknown
    }),
    boxRowsOf: async (scope, bank_tok, vault_tok) => {
      const boxDocs = await run(async ({ db }) => await lifeBoxQuery(db, scope, bank_tok, vault_tok).collect())
      return new Map(boxDocs.map(({ boxlabel, box }) => [boxlabel, box as unknown]))
    },
  }
}

// The next query or mutation the bankDB's client makes fails as Convex reports a server error, its text the host's.
const failNextCall = (bankDB: ConvexBankDB, text = '[Request ID: 0123456789abcdef] Server Error'): void => {
  const calls = madeOf(bankDB).client as unknown as Record<'query' | 'mutation', () => Promise<unknown>>
  const spies = [vi.spyOn(calls, 'query'), vi.spyOn(calls, 'mutation')]
  const fail = (): Promise<never> => {
    for (const spy of spies) { spy.mockRestore() }
    return Promise.reject(new Error(text))
  }
  for (const spy of spies) { spy.mockImplementationOnce(fail) }
}

TH.describeBankDBBattery("ConvexBankDB over a ConvexReactClient", {
  makeBankDB:          (opts) => bankDBOn(deploy(TH.componentHost()), opts),
  makeTwin:            (bankDB) => bankDBOn(madeOf(bankDB).deployment, madeOf(bankDB).opts),
  makeCappedBankDB:    (maxBoxes) => bankDBOn(deploy(TH.componentHost()), { maxBoxes }),
  _cheat_rowsOf:       convexRowsOf,
  _cheat_failNextCall: (bankDB) => { failNextCall(bankDB) },
})

/** A ConvexBankDB on a host as the README has it, over a ConvexReactClient signed in as `subject`. */
const hostedBankDB = (subject: string | null) => {
  const deployment = deploy(TH.bankHostWith(TH.bySubject))
  return { deployment, bankDB: new ConvexBankDB({ client: connectReact(deployment, subject), api: deployment.api.safebyokBank }) }
}

describe("ConvexBankDB over a ConvexReactClient, on a host's functions", () => {
  it("serves the user signed in", async () => {
    const { bankDB } = hostedBankDB('u1')
    await TH.expectGood(bankDB.tryBuildBank(BW.bankBuildAskOf()))
    expect(await bankDB.ensureBank(BW.bankEnsureAsk)).to.deep.include({ act: 'gotlive', parent: BW.bankAt() })
  })

  it("is refused when no one is signed in, or someone else is", async () => {
    await TH.expectBad(hostedBankDB(null).bankDB.tryEnsureBank(BW.bankEnsureAsk), 'identity_revoked')
    await TH.expectBad(hostedBankDB('u2').bankDB.tryGetVault(BW.vaultGetAskOf()), 'identity_revoked')
  })

  it("is refused again for a query the client already has the refusal of", async () => {
    const { bankDB } = hostedBankDB('u2')
    await TH.expectBad(bankDB.tryEnsureBank(BW.bankEnsureAsk), 'identity_revoked')
    await TH.expectBad(bankDB.tryEnsureBank(BW.bankEnsureAsk), 'identity_revoked')
  })

  it("notifies a second watch of a change in rows the client already watches", async () => {
    const { deployment, bankDB } = hostedBankDB('u1')
    const first: BX.Notice[] = []
    const second: BX.Notice[] = []
    const unwatchFirst = bankDB.watch(BW.bankScope, (notice) => { first.push(notice) })
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    const unwatchSecond = bankDB.watch(BW.bankScope, (notice) => { second.push(notice) })
    await deployment.arrange((backend) => backend.withIdentity({ subject: 'u1' }).mutation(deployment.api.safebyokBank.buildBank, TH.buildBankArgs(BW.bankAt())))
    await vi.waitFor(() => { expect(second.map(({ act }) => act)).to.include('gotlive') })
    expect(first.map(({ act }) => act)).to.include('gotlive')
    unwatchFirst()
    unwatchSecond()
    unwatchSecond()
  })
})
