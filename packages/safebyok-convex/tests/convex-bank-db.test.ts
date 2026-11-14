/** ConvexBankDB: the shared BankDB battery run through a real ConvexClient, plus tests of its own refusals, options and cascades. */

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { anyApi } from 'convex/server'
import type { ConvexClient } from 'convex/browser'
import type { BankScope, BX, VaultScope } from 'safebyok-big/storage'
import * as TH from './test-helpers'
import { ConvexBankDB } from '../src/index'
import type { ConvexBankDBOpts } from '../src/index'
import { fakeDeployment } from '../src/testing'
import { MaxTidiedBoxSize, MaxTidiedBoxes } from '../src/component/tallies'
import type { FakeDeployment, FakeHost } from '../src/testing'

const { BW } = TH

type ComponentDeployment = FakeDeployment<ReturnType<typeof TH.componentHost>>
type ComponentBackend = ReturnType<ComponentDeployment['as']>
type ComponentDb = Parameters<Parameters<ComponentBackend['run']>[0]>[0]['db']

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

// The battery writes as several users, so its bankDBs call the component directly, without the host's wrapper.
const madeOn = new WeakMap<ConvexBankDB, { deployment: ComponentDeployment, client: ConvexClient, opts: BankDBOnOpts }>()

type BankDBOnOpts = Omit<ConvexBankDBOpts, 'client' | 'api'>

function bankDBOn(deployment: ComponentDeployment, opts: BankDBOnOpts = {}): ConvexBankDB {
  const client = deployment.client(null)
  const bankDB = new ConvexBankDB({ ...opts, client, api: TH.rootBankApi })
  madeOn.set(bankDB, { deployment, client, opts })
  return bankDB
}

function madeOf(bankDB: ConvexBankDB) {
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

function convexRowsOf(bankDB: ConvexBankDB): TH.BankDBRowCheats {
  const { deployment } = madeOf(bankDB)
  // Plant through `arrange`, so the clients are notified of each planted change, as they would be of a write from elsewhere.
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
    // A planted row is not tallied, so the life's tally is deleted and the next put recounts it.
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

// Make the client's next query or mutation fail the way Convex reports a server error, with `text` as its message.
function failNextCall(bankDB: ConvexBankDB, text = '[Request ID: 0123456789abcdef] Server Error'): void {
  const calls = madeOf(bankDB).client as unknown as Record<'query' | 'mutation', () => Promise<unknown>>
  const spies = [vi.spyOn(calls, 'query'), vi.spyOn(calls, 'mutation')]
  const fail = (): Promise<never> => {
    for (const spy of spies) { spy.mockRestore() }
    return Promise.reject(new Error(text))
  }
  for (const spy of spies) { spy.mockImplementationOnce(fail) }
}

/** The row fields of the component's documents. */
const RowFields = ['bank', 'gate', 'vault', 'box']

// convex-test's database is not exported, so this alters each document on its way into the database, at the syscall that writes it.
/** Until the test ends, have the deployment's database store a row other than the one each write sends, as a datastore that alters what it stores would. */
function storeOtherwise(): void {
  /** The runtime's syscall that writes, as convex-test installs it on the global `Convex`. */
  type AsyncSyscall = (op: string, jsonArgs: string) => Promise<string>
  const convex = (globalThis as unknown as { Convex: { asyncSyscall: unknown } }).Convex
  // convex-test's getter answers the syscall of the test running, so the original getter is called at each write.
  const descriptor = Object.getOwnPropertyDescriptor(convex, 'asyncSyscall') as { get: (this: unknown) => AsyncSyscall }
  const spy = vi.spyOn(convex, 'asyncSyscall', 'get').mockImplementation(() => {
    const asyncSyscall = descriptor.get.call(convex)
    return async (op: string, jsonArgs: string) => {
      if ((op !== '1.0/insert') && (op !== '1.0/replace')) { return await asyncSyscall(op, jsonArgs) }
      const args = JSON.parse(jsonArgs) as { value: Record<string, unknown> }
      for (const field of RowFields) { if (Object.hasOwn(args.value, field)) { args.value[field] = TH.storedOtherwiseOf(args.value[field]) } }
      return await asyncSyscall(op, JSON.stringify(args))
    }
  })
  onTestFinished(() => { spy.mockRestore() })
}

TH.describeBankDBBattery("ConvexBankDB over a ConvexClient", {
  makeBankDB:            (opts) => bankDBOn(deploy(TH.componentHost()), opts),
  makeTwin:              (bankDB) => bankDBOn(madeOf(bankDB).deployment, madeOf(bankDB).opts),
  makeCappedBankDB:      (maxBoxes) => bankDBOn(deploy(TH.componentHost()), { maxBoxes }),
  makeBankDBFor:         () => {
    const deployment = deploy(TH.bankHostWith(TH.bySubject))
    return (user_id) => new ConvexBankDB({ client: deployment.client(user_id), api: deployment.api.safebyokBank })
  },
  _cheat_rowsOf:         convexRowsOf,
  _cheat_failNextCall:   (bankDB) => { failNextCall(bankDB) },
  _cheat_storeOtherwise: storeOtherwise,
})

describe("ConvexBankDB's refusals", () => {
  it("revoke the identity when the host's functions refuse the caller", async () => {
    const deployment = deploy(TH.bankHostWith(TH.bySubject))
    const bankDB = new ConvexBankDB({ client: deployment.client('u2'), api: deployment.api.safebyokBank })
    await TH.expectBad(bankDB.tryEnsureBank(BW.bankEnsureAsk), 'identity_revoked')
    await TH.expectBad(bankDB.tryBuildBank(BW.bankBuildAskOf()), 'identity_revoked')
  })

  it("quote nothing of any other failure's text", async () => {
    const bankDB = bankDBOn(deploy(TH.componentHost()))
    failNextCall(bankDB, 'host detail sk-live-0000')
    const refusal = await TH.expectBad(bankDB.tryEnsureBank(BW.bankEnsureAsk), 'storage_unavailable')
    expect(TH.thrownText(refusal)).not.to.include('sk-live-0000')
  })

  it("tell a watch's onBadNews of a watched query that fails", async () => {
    const deployment = deploy(TH.bankHostWith(TH.bySubject))
    const bankDB = new ConvexBankDB({ client: deployment.client('u1'), api: deployment.api.safebyokBank })
    const onBadNews = vi.fn()
    const unwatch = bankDB.watch(BW.bankScope, () => undefined, onBadNews)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    deployment.signOut()
    await vi.waitFor(() => { expect(onBadNews).toHaveBeenCalled() })
    expect(onBadNews.mock.calls[0]?.[0]).to.have.property('refusalkind', 'identity_revoked')
    unwatch()
  })
})

describe("ConvexBankDB's constructor", () => {
  it("refuses a client that is not a Convex client", () => {
    TH.expectSyncRefusal(() => new ConvexBankDB({ client: {} as never, api: TH.rootBankApi }), 'bad_option')
  })

  it("refuses the whole generated api in place of its safebyokBank module", () => {
    const deployment = deploy(TH.componentHost())
    TH.expectSyncRefusal(() => new ConvexBankDB({ client: deployment.client(null), api: anyApi as never }), 'bad_option')
  })

  it("refuses a maxBoxes it cannot use", () => {
    const deployment = deploy(TH.componentHost())
    for (const maxBoxes of [-1, 0, 1.5, NaN]) {
      TH.expectSyncRefusal(() => new ConvexBankDB({ client: deployment.client(null), api: TH.rootBankApi, maxBoxes }), 'bad_option')
    }
  })
})

/** More box rows than a cascade's budget for one transaction. */
const Overflow = 10_000

// A transaction may write 16,000 documents, and delBank's cascade spends half of that: past it, it leaves rows for tidyGone.
describe("ConvexBankDB's cascades, past what one transaction holds", () => {
  it("leaves the rows past its budget after a delBank, unreachable, for tidyGone to delete", { timeout: 60_000 }, async () => {
    const { deployment, bankDB, bank, vault } = await builtWithLimits()
    const other = BW.vaultAt(0, 'bank1', 'life2', { vaultlabel: 'other' })
    await bankDB.putVault(BW.vaultPutAskOf(other))
    await plantBoxes(deployment, vault, Overflow / 2)
    await plantBoxes(deployment, other, Overflow / 2)
    await bankDB.delBank(BW.bankDelAskOf(bank))
    expect(await boxCountOf(deployment)).to.be.above(0).and.below(Overflow)

    const reborn = BW.bankAt(2, 'bank2')
    await bankDB.buildBank(BW.bankBuildAskOf(reborn, BW.gateAt(0, 'bank2'), BW.bankTombstoneOf(bank)))
    const ensured = await bankDB.ensureBank(BW.bankEnsureAsk)
    expect(ensured.val?.vaults).to.deep.equal([])
    const rebornVault = BW.vaultAt(0, 'bank2', 'life1')
    const rebornBox = BW.boxAt(0, 'bank2', 'life1')
    await bankDB.putVault(BW.vaultPutAskOf(rebornVault))
    await bankDB.putBox(BW.boxPutAskOf(rebornBox))
    const leftovers = []
    for (let ii = 0; ii < 3; ii += 1) {
      const { val } = await bankDB.tidyGone(BW.boxTidyAsk)
      leftovers.push(val.leftover)
    }
    expect(leftovers).to.deep.equal(['many', 'some', 'none'])
    expect(await boxCountOf(deployment)).to.eq(1)
    expect(await bankDB.getBox(BW.boxGetAskOf({ ...BW.boxQuery, bank_tok: 'bank2' }))).to.deep.include({ val: rebornBox })
  })
})

const TidyCases = [
  // none left:
  [0,                        "none", 'leaves none when there were none'],
  [3,                        "none", 'deletes a few in one call'],
  [MaxTidiedBoxes,           "none", 'deletes exactly a batch in one call'],
  // some left, which the next call deletes:
  [MaxTidiedBoxes + 3,       "some", 'leaves some when a few are past the batch'],
  [2 * MaxTidiedBoxes,       "some", 'leaves some when exactly a batch is past the batch'],
  // many left, more than the next call deletes:
  [(2 * MaxTidiedBoxes) + 1, "many", 'leaves many when more than a batch is past the batch'],
] as const

// The live vault holds one box row, which every call leaves, and the rows planted under an earlier bank life are of an ended one.
describe("ConvexBankDB's tidyGone, deleting a batch of box rows of ended lives", () => {
  for (const [planted, leftover, blurb] of TidyCases) {
    it(blurb, { timeout: 60_000 }, async () => {
      const { deployment, bankDB, vault } = await builtWithLimits()
      const box = BW.boxAt()
      await bankDB.putBox(BW.boxPutAskOf(box))
      await plantBoxes(deployment, { ...vault, bank_tok: 'bank0' }, planted)
      expect(await bankDB.tidyGone(BW.boxTidyAsk)).to.deep.include({ val: { totalCount: 1, leftover } })
      expect(await boxCountOf(deployment)).to.eq(1 + planted - Math.min(planted, MaxTidiedBoxes))
      expect(await bankDB.getBox(BW.boxGetAskOf())).to.deep.include({ val: box })
    })
  }

  it("deletes what it left as some on the next call", async () => {
    const { deployment, bankDB, vault } = await builtWithLimits()
    await plantBoxes(deployment, { ...vault, bank_tok: 'bank0' }, MaxTidiedBoxes + 3)
    expect(await bankDB.tidyGone(BW.boxTidyAsk)).to.deep.include({ val: { totalCount: 0, leftover: 'some' } })
    expect(await bankDB.tidyGone(BW.boxTidyAsk)).to.deep.include({ val: { totalCount: 0, leftover: 'none' } })
    expect(await boxCountOf(deployment)).to.eq(0)
  })

  it("deletes fewer box rows when they pass its batch's bytes first, and counts what is left by the same bytes", async () => {
    const { deployment, bankDB, vault } = await builtWithLimits()
    const ciphertext_b64 = 'c'.repeat(MaxTidiedBoxSize / 16)
    await plantBoxes(deployment, { ...vault, bank_tok: 'bank0' }, 40, ciphertext_b64)
    expect(await bankDB.tidyGone(BW.boxTidyAsk)).to.deep.include({ val: { totalCount: 0, leftover: 'many' } })
    expect(await boxCountOf(deployment)).to.eq(40 - 16)
    expect(await bankDB.tidyGone(BW.boxTidyAsk)).to.deep.include({ val: { totalCount: 0, leftover: 'some' } })
    expect(await boxCountOf(deployment)).to.eq(40 - 32)
  })
})

// The rows of the ended life sort after the live ones, under a later bank_tok, so the call reads every live row before them.
describe("ConvexBankDB's tidyGone, within one transaction", () => {
  it("fits beside a live vault near its byte limit", async () => {
    const { deployment, bankDB, vault } = await builtWithLimits()
    const ciphertext_b64 = 'c'.repeat(MaxTidiedBoxSize / 16)
    await plantBoxes(deployment, vault, 48, ciphertext_b64)
    await bankDB.putBox(BW.boxPutAskOf(BW.boxAt()))
    await plantBoxes(deployment, { ...vault, bank_tok: 'bank2' }, 40, ciphertext_b64)
    expect(await bankDB.tidyGone(BW.boxTidyAsk)).to.deep.include({ val: { totalCount: 49, leftover: 'many' } })
    expect(await boxCountOf(deployment)).to.eq(49 + 40 - 16)
  })
})

/** How many box rows are stored under the bank, across every life. */
async function boxCountOf(deployment: ComponentDeployment): Promise<number> {
  const boxDocs = await deployment.as(null).run(async ({ db }) => await db.query('safebyok_boxes')
    .withIndex('by_box', (idx) => idx.eq('user_id', BW.bankScope.user_id).eq('banklabel', BW.bankScope.banklabel))
    .collect())
  return boxDocs.length
}

/** Plant `qty` box rows in the vault life of `vault`, past its tally, in batches each well inside one transaction. */
async function plantBoxes(deployment: ComponentDeployment, vault: BX.VaultRecord, qty: number, ciphertext_b64 = 'Y3Q'): Promise<void> {
  const { vaultlabel, bank_tok, vault_tok } = vault
  for (let beg = 0; beg < qty; beg += 2500) {
    await deployment.as(null).run(async ({ db }) => {
      for (let ii = beg; ii < Math.min(beg + 2500, qty); ii += 1) {
        const boxlabel = `box${String(ii).padStart(5, '0')}`
        const box = BW.boxAt(0, bank_tok, vault_tok, { vaultlabel, boxlabel, whisper_ciphered: { cipher_iv_b64: 'aXY', ciphertext_b64 } })
        await db.insert('safebyok_boxes', { ...BW.bankScope, vaultlabel, bank_tok, vault_tok, boxlabel, box })
      }
    })
  }
}

/** A bankDB, on a backend that keeps Convex's transaction limits, with the bank built and its vault put. */
async function builtWithLimits() {
  const deployment = deploy({ api: anyApi, createTest: () => TH.componentTest(true) })
  const bankDB = bankDBOn(deployment)
  const bank = BW.bankAt()
  const vault = BW.vaultAt()
  await bankDB.buildBank(BW.bankBuildAskOf(bank))
  await bankDB.putVault(BW.vaultPutAskOf(vault))
  return { deployment, bankDB, bank, vault }
}
