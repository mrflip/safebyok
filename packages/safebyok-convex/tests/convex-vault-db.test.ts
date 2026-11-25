/** ConvexVaultDB: the battery every vaultDB must pass, run through a real ConvexClient, then what is its own (options, refusals, the component's writes, the watch). */

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { anyApi } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { ConvexClient } from 'convex/browser'
import { type BoxRecord, type ThingScope, type VaultEvent, Shell } from 'safebyok/storage'
import * as TH from './test-helpers'
import { ConvexVaultDB } from '../src/index'
import { fakeDeployment } from '../src/testing'
import type { FakeDeployment, FakeHost } from '../src/testing'
import type { SafebyokVaultApi } from '../src/server'

type ComponentDeployment = FakeDeployment<ReturnType<typeof TH.componentHost>>
type ComponentBackend = ReturnType<ComponentDeployment['_cheat_backendAs']>
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

/** The cheat into what `convexVaultDB` stores. Each plants through `_cheat_arrange`, so the clients hear of it as of a write from elsewhere. */
function _cheat_convexThingsOf(convexVaultDB: ConvexVaultDB): TH.VaultDBRowCheats {
  const { deployment } = madeOf(convexVaultDB)
  const run: ComponentBackend['run'] = async (fn) => await deployment._cheat_arrange(async (backend) => await backend.run(fn))
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

/** The labelpath of each Thing the deployment stores, in order. */
async function thingLabelpathsOf(convexVaultDB: ConvexVaultDB): Promise<string[]> {
  const docs = await madeOf(convexVaultDB).deployment._cheat_backendAs(null).run(async ({ db }) => await db.query('things').withIndex('by_scope').collect())
  return docs.map(({ labelpath }) => labelpath)
}

describe("ConvexVaultDB's refusals", () => {
  it("revoke the identity when the host's functions refuse the caller", async () => {
    const deployment = deploy(TH.vaultHostWith(TH.bySubject))
    const convexVaultDB = new ConvexVaultDB({ client: deployment.client('u2'), api: deployment.api.safebyokVault })
    await TH.expectBad(convexVaultDB.tryGetThing(TH.getGateAskOf()), 'identity_revoked')
    await TH.expectBad(convexVaultDB.tryBirthBank(TH.birthBankAskOf()), 'identity_revoked')
  })

  it("refuse a failed call as storage_issue, Convex's error its cause", async () => {
    const convexVaultDB = makeConvexVaultDB()
    const thrown = new Error('[Request ID: 0123456789abcdef] Server Error')
    failNextCallWith(convexVaultDB, thrown)
    const refusal = await TH.expectBad(convexVaultDB.tryGetThing(TH.getGateAskOf()), 'storage_issue')
    expect(refusal.cause).to.equal(thrown)
  })

  it("quote nothing of a failed call's error in the refusal's message", async () => {
    const convexVaultDB = makeConvexVaultDB()
    failNextCall(convexVaultDB, 'host detail sk-live-0000')
    const refusal = await TH.expectBad(convexVaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
    expect(refusal.message).not.to.include('sk-live-0000')
  })

  it("refuse a host's own ConvexError as storage_issue, the error its cause", async () => {
    const convexVaultDB = makeConvexVaultDB()
    const thrown = new ConvexError({ code: 'over_quota' })
    failNextCallWith(convexVaultDB, thrown)
    const refusal = await TH.expectBad(convexVaultDB.tryListThings(TH.listAskAt('box')), 'storage_issue')
    expect(refusal.cause).to.equal(thrown)
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
  it("stores one document for each Thing a bank is born with", async () => {
    const convexVaultDB = makeConvexVaultDB()
    await TH.expectGood(convexVaultDB.tryBirthBank(TH.birthBankAskOf()))
    expect(await thingLabelpathsOf(convexVaultDB)).to.deep.equal(['bank', 'box', 'gate'])
  })

  it("writes no document but the cited Thing's", async () => {
    // The backend refuses a transaction that writes a second document, so a write over the cited Thing alone succeeds.
    const deployment = deploy(TH.componentHostWritingAtMost(1))
    const backend = deployment._cheat_backendAs(null)
    for (const thing of [TH.bankThingOf(), TH.gateThingOf(), TH.rootBoxOf()]) {
      await backend.run(async ({ db }) => { await db.insert('things', { ...TH.ThingBank, labelpath: thing.labelpath, thing }) })
    }
    const convexVaultDB = new ConvexVaultDB({ client: deployment.client(null), api: TH.rootVaultApi })
    const box = TH.boxThingOf()
    const boxBirthAsk = TH.birthAskOf(box, Shell.childCited(TH.Life0))
    await TH.expectGood(convexVaultDB.tryWriteThing(boxBirthAsk))
    const stored = await backend.run(async ({ db }) => await thingDocAt(db, TH.BoxScope))
    expect(stored?.thing).to.deep.equal(box)
  })

  it("refuses an ask that fails the core's checks, with the core's sentence", async () => {
    const refusal = await TH.convexRefusalOf(TH.componentTest().query(TH.rootVaultApi.getThing, { ask: { ...TH.getGateAskOf(), banklabel: '' } }))
    expect(refusal.kind).to.eq('bad_record')
    expect(refusal).to.have.property('message').that.is.a('string')
  })
})

// Anyone signed in may call the component's functions with arguments of their own making.
type SloppyCase = readonly [keyof SafebyokVaultApi, Record<string, unknown>, string]

const SloppyQueryCases: readonly SloppyCase[] = [
  ["listThings",  { ask: null },                                          'refuses a list with no ask'],
  ["listThings",  { ask: { ...TH.listAskAt('box'), labelpath: 42 } },     'refuses a list whose labelpath is a number'],
  ["getWorld",    { ask: "acme" },                                        'refuses a world asked as a bare string'],
  ["getWorld",    { ask: { ...TH.getWorldAskOf(), userid: undefined } },  'refuses a world asked without its userid'],
  ["stats",       { ask: {} },                                            'refuses stats asked of an empty object'],
  ["watchThings", { scope: { userid: 'u1' } },                            'refuses a watch whose scope has no banklabel'],
  ["watchThings", { scope: [] },                                          'refuses a watch whose scope is an array'],
]

const GateOfOtherBank = TH.gateThingOf({ banklabel: 'other' })
const SloppyMutationCases: readonly SloppyCase[] = [
  ["writeThing",  { ask: { ...TH.birthAskOf(), record: null } },              'refuses a write with no record'],
  ["writeThing",  { ask: { ...TH.birthAskOf(), record: GateOfOtherBank } },   'refuses a write whose record is at another scope'],
  ["birthBank",   { ask: { ...TH.birthBankAskOf(), gate: TH.rootBoxOf() } },  'refuses a birth whose gate is a box'],
  ["birthBank",   { ask: 7 },                                                 'refuses a birth asked as a number'],
]

describe("ConvexVaultDB's component, given sloppy arguments", () => {
  for (const [fnname, args, blurb] of SloppyQueryCases) {
    it(blurb, async () => {
      const refusal = await TH.convexRefusalOf(TH.componentTest().query(TH.rootVaultApi[fnname] as FunctionReference<'query'>, args))
      expect(refusal.kind).to.eq('bad_record')
    })
  }

  for (const [fnname, args, blurb] of SloppyMutationCases) {
    it(blurb, async () => {
      const refusal = await TH.convexRefusalOf(TH.componentTest().mutation(TH.rootVaultApi[fnname] as FunctionReference<'mutation'>, args))
      expect(refusal.kind).to.eq('bad_record')
    })
  }
})

const SidecarKeyCases: readonly (readonly [BoxRecord['sidecar'], string])[] = [
  // the three rules Convex holds an object key to:
  [{ $team: "acme" },                 'refuses a sidecar key that starts with a dollar sign'],
  [{ "équipe": "acme" },              'refuses a sidecar key with a character outside printable ASCII'],
  [{ "tab\tkey": "acme" },            'refuses a sidecar key with a control character'],
  [{ ["k".repeat(1025)]: "acme" },    'refuses a sidecar key past 1024 characters'],
  // anywhere in the sidecar:
  [{ team: { $lead: "ada" } },        'refuses such a key nested within the sidecar'],
  [{ teams: [{ $lead: "ada" }] },     'refuses such a key in an object within an array'],
]

describe("ConvexVaultDB's put of a box whose sidecar Convex would not store", () => {
  for (const [sidecar, blurb] of SidecarKeyCases) {
    it(blurb, async () => {
      const convexVaultDB = makeConvexVaultDB()
      const mutation = vi.spyOn(madeOf(convexVaultDB).client, 'mutation')
      const ask = TH.birthAskOf(TH.boxThingOf('openai', { sidecar }), Shell.childCited(TH.Life0))
      await TH.expectBad(convexVaultDB.tryWriteThing(ask), 'bad_record')
      expect(mutation).not.toHaveBeenCalled()
    })
  }

  it("accepts a sidecar key of 1024 printable characters", async () => {
    const convexVaultDB = makeConvexVaultDB()
    await TH.expectGood(convexVaultDB.tryBirthBank(TH.birthBankAskOf()))
    const ask = TH.birthAskOf(TH.boxThingOf('openai', { sidecar: { ["k~ ".repeat(341) + "k"]: "acme" } }), Shell.childCited(TH.Life0))
    await TH.expectGood(convexVaultDB.tryWriteThing(ask))
  })

  it("carries nothing of the sidecar's values in its refusal", async () => {
    const convexVaultDB = makeConvexVaultDB()
    const ask = TH.birthAskOf(TH.boxThingOf('openai', { sidecar: { $note: "sk-fake-0000", team: "acme-ops" } }), Shell.childCited(TH.Life0))
    const refusal = await TH.expectBad(convexVaultDB.tryWriteThing(ask), 'bad_record')
    expect(TH.thrownText(refusal)).not.to.include('sk-fake-0000')
    expect(TH.thrownText(refusal)).not.to.include('acme-ops')
  })

  it("refuses a bank born with such a key in its root box's sidecar", async () => {
    const convexVaultDB = makeConvexVaultDB()
    const mutation = vi.spyOn(madeOf(convexVaultDB).client, 'mutation')
    const ask = TH.birthBankAskOf({ root: TH.rootBoxOf({ sidecar: { $team: "acme" } }) })
    await TH.expectBad(convexVaultDB.tryBirthBank(ask), 'bad_record')
    expect(mutation).not.toHaveBeenCalled()
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

  it("refuses undefined for its options", () => {
    TH.expectSyncRefusal(() => new ConvexVaultDB(undefined as never), 'bad_record')
  })

  it("refuses options without a client", () => {
    TH.expectSyncRefusal(() => new ConvexVaultDB({ api: TH.rootVaultApi } as never), 'bad_record')
  })

  it("refuses options without an api", () => {
    const deployment = deploy(TH.componentHost())
    TH.expectSyncRefusal(() => new ConvexVaultDB({ client: deployment.client(null) } as never), 'bad_record')
  })

  it("refuses the whole generated api in place of its safebyokVault module", () => {
    const deployment = deploy(TH.componentHost())
    TH.expectSyncRefusal(() => new ConvexVaultDB({ client: deployment.client(null), api: anyApi as never }), 'bad_record')
  })
})
