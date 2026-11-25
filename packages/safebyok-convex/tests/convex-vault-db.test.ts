/** ConvexVaultDB: the battery every vaultDB must pass, run through a real ConvexClient, then what is its own (options, refusals, the component's writes, the watch). */

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { anyApi } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { ConvexClient } from 'convex/browser'
import { type ThingScope, type VaultEvent, Shell } from 'safebyok/storage'
import * as TH from './test-helpers'
import { ConvexVaultDB } from '../src/index'
import { fakeDeployment } from '../src/testing'
import type { FakeDeployment, FakeHost } from '../src/testing'

type ComponentDeployment = FakeDeployment<ReturnType<typeof TH.componentHost>>
type ComponentBackend = ReturnType<ComponentDeployment['as']>
type ComponentDb = Parameters<Parameters<ComponentBackend['run']>[0]>[0]['db']

// Each deployment a test makes is closed afterwards, so no client keeps its socket's timers alive.
// The battery makes calls fail on purpose, and a client logs each failure as an error, so a spy keeps the output clean.
const deployments: FakeDeployment<FakeHost>[] = []
function deploy<Host extends FakeHost>(host: Host): FakeDeployment<Host> {
  const deployment = fakeDeployment(host, { logger: TH.spyLogger().logger })
  deployments.push(deployment)
  return deployment
}
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

// The battery's vaultDBs call the component directly, without the host's wrapper and its sign-in.
const madeOn = new WeakMap<ConvexVaultDB, { deployment: ComponentDeployment, client: ConvexClient }>()

/** A ConvexVaultDB on a fresh deployment of the component alone. */
function makeConvexVaultDB(): ConvexVaultDB {
  const deployment = deploy(TH.componentHost())
  const client = deployment.client(null)
  const convexVaultDB = new ConvexVaultDB({ client, api: TH.rootVaultApi })
  madeOn.set(convexVaultDB, { deployment, client })
  return convexVaultDB
}

/** The deployment and client `convexVaultDB` was made on. */
function madeOf(convexVaultDB: ConvexVaultDB) {
  const made = madeOn.get(convexVaultDB)
  if (! made) { throw new Error('The vaultDB was not made by this test file.') }
  return made
}

/** The document of the Thing at `scope`, or null for none. */
async function thingDocAt(db: ComponentDb, { userid, banklabel, labelpath }: ThingScope) {
  return await db.query('things').withIndex('by_scope', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel).eq('labelpath', labelpath)).unique()
}

/** The cheat into what `convexVaultDB` stores. Each plants through `arrange`, so the clients hear of it as of a write from elsewhere. */
function _cheat_convexThingsOf(convexVaultDB: ConvexVaultDB): TH.VaultDBRowCheats {
  const { deployment } = madeOf(convexVaultDB)
  const run: ComponentBackend['run'] = async (fn) => await deployment.arrange(async (backend) => await backend.run(fn))
  return {
    plant: async (scope, raw) => {
      await run(async ({ db }) => {
        const { userid, banklabel, labelpath } = scope
        const doc = await thingDocAt(db, scope)
        if (doc) { await db.replace('things', doc._id, { userid, banklabel, labelpath, thing: raw }) } else { await db.insert('things', { userid, banklabel, labelpath, thing: raw }) }
      })
    },
    remove: async (scope) => {
      await run(async ({ db }) => {
        const doc = await thingDocAt(db, scope)
        if (doc) { await db.delete('things', doc._id) }
      })
    },
  }
}

TH.describeVaultDBBattery('ConvexVaultDB', {
  makeVaultDB:   makeConvexVaultDB,
  _cheat_rowsOf: _cheat_convexThingsOf,
})

// Make the client's next query or mutation fail the way Convex reports a server error, with `text` as its message.
function failNextCall(convexVaultDB: ConvexVaultDB, text = '[Request ID: 0123456789abcdef] Server Error'): void {
  failNextCallWith(convexVaultDB, new Error(text))
}

/** Make the client's next query or mutation reject with `thrown`. */
function failNextCallWith(convexVaultDB: ConvexVaultDB, thrown: Error): void {
  const calls = madeOf(convexVaultDB).client as unknown as Record<'query' | 'mutation', () => Promise<unknown>>
  const spies = [vi.spyOn(calls, 'query'), vi.spyOn(calls, 'mutation')]
  const fail = (): Promise<never> => {
    for (const spy of spies) { spy.mockRestore() }
    return Promise.reject(thrown)
  }
  for (const spy of spies) { spy.mockImplementationOnce(fail) }
}

/** Until the test ends, hand the client each mutation's result with `written` as `alter` makes it, as a component out of step with the client would. */
function alterWritten(convexVaultDB: ConvexVaultDB, alter: (written: unknown) => unknown): void {
  const { client } = madeOf(convexVaultDB)
  const mutation = client.mutation.bind(client)
  const spy = vi.spyOn(client, 'mutation').mockImplementation(async (fnRef, args) => {
    const result = await mutation(fnRef, args) as { written: unknown }
    return { ...result, written: alter(result.written) }
  })
  onTestFinished(() => { spy.mockRestore() })
}

/** How many Things the deployment stores. */
async function thingCountOf(convexVaultDB: ConvexVaultDB): Promise<number> {
  const docs = await madeOf(convexVaultDB).deployment.as(null).run(async ({ db }) => await db.query('things').collect())
  return docs.length
}

describe("ConvexVaultDB's refusals", () => {
  it("revoke the identity when the host's functions refuse the caller", async () => {
    const deployment = deploy(TH.vaultHostWith(TH.bySubject))
    const convexVaultDB = new ConvexVaultDB({ client: deployment.client('u2'), api: deployment.api.safebyokVault })
    await TH.expectBad(convexVaultDB.tryGetThing(TH.getGateAskOf()), 'identity_revoked')
    await TH.expectBad(convexVaultDB.tryBirthBank(TH.birthBankAskOf()), 'identity_revoked')
  })

  it("quote nothing of any other failure's text", async () => {
    const convexVaultDB = makeConvexVaultDB()
    failNextCall(convexVaultDB, 'host detail sk-live-0000')
    const refusal = await TH.expectBad(convexVaultDB.tryGetThing(TH.getGateAskOf()), 'storage_unavailable')
    expect(TH.thrownText(refusal)).not.to.include('sk-live-0000')
  })

  it("hand on the component's refusal of an ask, with its sentence", async () => {
    const convexVaultDB = makeConvexVaultDB()
    failNextCallWith(convexVaultDB, new ConvexError({ kind: 'bad_record', message: 'The ask is not one the component reads.' }))
    const refusal = await TH.expectBad(convexVaultDB.tryWriteThing(TH.birthAskOf()), 'bad_record')
    expect(refusal.message).to.include('The ask is not one the component reads.')
  })

  it("tell a watch's onBadNews of a watched query that fails", async () => {
    const deployment = deploy(TH.vaultHostWith(TH.bySubject))
    const convexVaultDB = new ConvexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyokVault })
    const onBadNews = vi.fn()
    const unwatch = convexVaultDB.watch(TH.ThingBank, () => undefined, onBadNews)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    deployment.signOut()
    await vi.waitFor(() => { expect(onBadNews).toHaveBeenCalled() })
    expect(onBadNews.mock.calls[0]?.[0]).to.have.property('refusalkind', 'identity_revoked')
    unwatch()
  })
})

describe("ConvexVaultDB against a component out of step with it", () => {
  it("refuses unexpected_error where the component wrote nothing and the client finds a write", async () => {
    const [writing, birthing] = [makeConvexVaultDB(), makeConvexVaultDB()]
    alterWritten(writing, () => null)
    alterWritten(birthing, () => null)
    await TH.expectBad(writing.tryWriteThing(TH.birthAskOf()), 'unexpected_error')
    await TH.expectBad(birthing.tryBirthBank(TH.birthBankAskOf()), 'unexpected_error')
  })

  it("refuses unexpected_error where the component wrote and the client finds no write", async () => {
    const convexVaultDB = makeConvexVaultDB()
    await TH.expectGood(convexVaultDB.tryWriteThing(TH.birthAskOf()))
    alterWritten(convexVaultDB, () => ({ thing: TH.gateThingOf(), bank: null, tracked: { bank: null, gate: 'same', box: null } }))
    await TH.expectBad(convexVaultDB.tryWriteThing(TH.birthAskOf()), 'unexpected_error')
  })
})

describe("ConvexVaultDB's component", () => {
  it("stores one document for each Thing, writing only the Thing a write cites", async () => {
    const convexVaultDB = makeConvexVaultDB()
    await TH.expectGood(convexVaultDB.tryBirthBank(TH.birthBankAskOf()))
    expect(await thingCountOf(convexVaultDB)).to.eq(3)
    const boxBirthAsk = TH.birthAskOf(TH.boxThingOf(), Shell.childCited(TH.Life0))
    await TH.expectGood(convexVaultDB.tryWriteThing(boxBirthAsk))
    expect(await thingCountOf(convexVaultDB)).to.eq(4)
    const gate = await TH.expectGood(convexVaultDB.tryGetThing(TH.getAskAt('gate')))
    expect(gate).to.deep.equal(TH.gateThingOf())
  })

  it("refuses an ask that fails the core's checks, with the core's sentence", async () => {
    const refusal = await TH.convexRefusalOf(TH.componentTest().query(TH.rootVaultApi.getThing, { ask: { ...TH.getGateAskOf(), banklabel: '' } }))
    expect(refusal.kind).to.eq('bad_record')
    expect(refusal).to.have.property('message').that.is.a('string')
  })
})

/** A client with a ConvexReactClient's `watchQuery`, standing on a ConvexClient's `onUpdate`. */
function reactLike(client: ConvexClient) {
  return {
    query:      client.query.bind(client),
    mutation:   client.mutation.bind(client),
    watchQuery: (queryRef: FunctionReference<'query'>, args: Record<string, unknown>) => {
      let latest: unknown
      return {
        onUpdate:         (callback: () => void) => client.onUpdate(queryRef, args, (result: unknown) => { latest = result; callback() }),
        localQueryResult: () => latest,
      }
    },
  }
}

describe("ConvexVaultDB's watch over a client with watchQuery, as a ConvexReactClient", () => {
  it("notifies of each Thing written after its first result", async () => {
    const deployment = deploy(TH.componentHost())
    const convexVaultDB = new ConvexVaultDB({ client: reactLike(deployment.client(null)), api: TH.rootVaultApi })
    const events: VaultEvent[] = []
    const unwatch = convexVaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, () => undefined)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    await TH.expectGood(convexVaultDB.tryWriteThing(TH.birthAskOf()))
    await vi.waitFor(() => { expect(events).to.have.lengthOf(1) })
    expect(TH.maskedReadTcsOf(events)).to.deep.equal([TH.itemEventOf(TH.gateThingOf())])
    unwatch()
  })
})

describe("ConvexVaultDB's constructor", () => {
  it("refuses a client that is not a Convex client", () => {
    TH.expectSyncRefusal(() => new ConvexVaultDB({ client: {} as never, api: TH.rootVaultApi }), 'bad_record')
  })

  it("refuses the whole generated api in place of its safebyokVault module", () => {
    const deployment = deploy(TH.componentHost())
    TH.expectSyncRefusal(() => new ConvexVaultDB({ client: deployment.client(null), api: anyApi as never }), 'bad_record')
  })
})
