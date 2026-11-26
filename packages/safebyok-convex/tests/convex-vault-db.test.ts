/** ConvexVaultDB: the battery every vaultDB must pass, run through a real ConvexClient, then what is its own (options, refusals, the component's writes, the watch). */

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { anyApi } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { ConvexClient } from 'convex/browser'
import { type BoxRecord, type ThingScope, type VaultEvent, Shell, VoidLifeTok } from 'safebyok/storage'
import * as TH from './test-helpers'
import { ConvexVaultDB } from '../src/index'
import { fakeDeployment } from '../src/testing'
import type { FakeDeployment, FakeHost } from '../src/testing'
import type { SafebyokVaultApi } from '../src/server'
import schema, { tableOf } from '../src/component/schema'
import type { TableNames } from '../src/component/_generated/dataModel'

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
  return await db.query(tableOf(labelpath)).withIndex('by_scope', (idx) => idx.eq('userid', userid).eq('banklabel', banklabel).eq('labelpath', labelpath)).unique()
}

// As Postgres's plant (`jsonb_populate_record`), a field of `raw` its table has no field for is dropped; one of the wrong type is refused.
/** Insert `raw` as the document at `scope`, in place of any stored there. */
async function plantIn(db: ComponentDb, scope: ThingScope, raw: unknown): Promise<void> {
  const doc = await thingDocAt(db, scope)
  if (doc) { await db.delete(doc._id) }
  const table = tableOf(scope.labelpath)
  const fields = Object.entries(raw as object).filter(([fieldname]) => Object.hasOwn(schema.tables[table].validator.fields, fieldname))
  await db.insert(table, { ...Object.fromEntries(fields), commit_ts: db.vars.commitTs } as never)
}

/** The cheat into what `convexVaultDB` stores. Each plants through `_cheat_arrange`, so the clients hear of it as of a write from elsewhere. */
function _cheat_convexThingsOf(convexVaultDB: ConvexVaultDB): TH.VaultDBRowCheats {
  const { deployment } = madeOf(convexVaultDB)
  const run: ComponentBackend['run'] = async (fn) => await deployment._cheat_arrange(async (backend) => await backend.run(fn))
  return {
    plant: async (scope, raw) => {
      await run(async ({ db }) => { await plantIn(db, scope, raw) })
    },
    remove: async (scope) => {
      await run(async ({ db }) => {
        const doc = await thingDocAt(db, scope)
        if (doc) { await db.delete(doc._id) }
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

/** Until the test ends, hand the client each mutation's manifest with its `written` tag flipped, as a component out of step with the client would. */
function flipWritten(convexVaultDB: ConvexVaultDB): void {
  const { client } = madeOf(convexVaultDB)
  const mutation = client.mutation.bind(client)
  const spy = vi.spyOn(client, 'mutation').mockImplementation(async (fnRef, args) => {
    const manifest = await mutation(fnRef, args) as { tags: { written: boolean } }
    return { ...manifest, tags: { ...manifest.tags, written: ! manifest.tags.written } }
  })
  onTestFinished(() => { spy.mockRestore() })
}

/** The labelpath of each Thing the deployment stores, table by table, in order. */
async function thingLabelpathsOf(convexVaultDB: ConvexVaultDB): Promise<Record<string, string[]>> {
  return await madeOf(convexVaultDB).deployment._cheat_backendAs(null).run(async ({ db }) => {
    const labelpathsIn = async (table: TableNames): Promise<string[]> => {
      const docs = await db.query(table).withIndex('by_scope').collect()
      return docs.map(({ labelpath }) => labelpath)
    }
    return { bank_things: await labelpathsIn('bank_things'), gate_things: await labelpathsIn('gate_things'), box_things: await labelpathsIn('box_things') }
  })
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
  it("refuses storage_issue where the component says it wrote nothing and the act tables find a write", async () => {
    const [writing, birthing] = [makeConvexVaultDB(), makeConvexVaultDB()]
    flipWritten(writing)
    flipWritten(birthing)
    await TH.expectBad(writing.tryWriteThing(TH.birthAskOf()), 'storage_issue')
    await TH.expectBad(birthing.tryBirthBank(TH.birthBankAskOf()), 'storage_issue')
  })

  it("refuses storage_issue where the component says it wrote and the act tables find no write", async () => {
    const convexVaultDB = makeConvexVaultDB()
    await TH.expectGood(convexVaultDB.tryWriteThing(TH.birthAskOf()))
    flipWritten(convexVaultDB)
    await TH.expectBad(convexVaultDB.tryWriteThing(TH.birthAskOf()), 'storage_issue')
  })
})

describe("ConvexVaultDB's component", () => {
  it("stores one document for each Thing a bank is born with, each in the table of its kind", async () => {
    const convexVaultDB = makeConvexVaultDB()
    await TH.expectGood(convexVaultDB.tryBirthBank(TH.birthBankAskOf()))
    expect(await thingLabelpathsOf(convexVaultDB)).to.deep.equal({ bank_things: ['bank'], gate_things: ['gate'], box_things: ['box'] })
  })

  it("stores each of a Thing's fields as a field of its document, beside the commit timestamp", async () => {
    const convexVaultDB = makeConvexVaultDB()
    await TH.expectGood(convexVaultDB.tryBirthBank(TH.birthBankAskOf()))
    const backend = madeOf(convexVaultDB).deployment._cheat_backendAs(null)
    const doc = await backend.run(async ({ db }) => await thingDocAt(db, TH.GateScope))
    expect(doc).to.deep.include(TH.gateThingOf())
    expect(doc).to.have.all.keys(...Object.keys(TH.gateThingOf()), '_creationTime', '_id', 'commit_ts')
  })

  it("writes no document but the cited Thing's", async () => {
    // The backend refuses a transaction that writes a second document, so a write over the cited Thing alone succeeds.
    const deployment = deploy(TH.componentHostWritingAtMost(1))
    const backend = deployment._cheat_backendAs(null)
    for (const thing of [TH.bankThingOf(), TH.gateThingOf(), TH.rootBoxOf()]) {
      await backend.run(async ({ db }) => { await plantIn(db, { ...TH.ThingBank, labelpath: thing.labelpath }, thing) })
    }
    const convexVaultDB = new ConvexVaultDB({ client: deployment.client(null), api: TH.rootVaultApi })
    const box = TH.boxThingOf()
    const boxBirthAsk = TH.birthAskOf(box, Shell.childCited(TH.Life0))
    await TH.expectGood(convexVaultDB.tryWriteThing(boxBirthAsk))
    const actual = await backend.run(async ({ db }) => await thingDocAt(db, TH.BoxScope))
    expect(actual).to.deep.include(box)
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
  ["watchThings", { scope: { userid: 'u1' }, cursor: null },              'refuses a watch whose scope has no banklabel'],
  ["watchThings", { scope: [], cursor: null },                            'refuses a watch whose scope is an array'],
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

  it("refuses a watch whose cursor is not an int64", async () => {
    await expect(TH.componentTest().query(TH.rootVaultApi.watchThings, { scope: TH.ThingBank, cursor: 7 as never })).rejects.toThrow()
  })

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

/** The ask that writes `box`, new, under the root box of a born bank. */
function boxBirthAskOf(box: BoxRecord = TH.boxThingOf()) { return TH.birthAskOf(box, Shell.childCited(TH.Life0)) }

describe("ConvexVaultDB's component watch", () => {
  it("sends only the Things committed after its cursor, and the cursor to watch from next", async () => {
    const backend = TH.componentTest()
    await backend.mutation(TH.rootVaultApi.birthBank, { ask: TH.birthBankAskOf() })
    const start = await backend.query(TH.rootVaultApi.watchThings, { scope: TH.ThingBank, cursor: null })
    expect(start.things).to.deep.equal([])
    const box = TH.boxThingOf()
    await backend.mutation(TH.rootVaultApi.writeThing, { ask: boxBirthAskOf(box) })
    const since = await backend.query(TH.rootVaultApi.watchThings, { scope: TH.ThingBank, cursor: start.cursor })
    expect(since).to.deep.include({ things: [{ labelpath: box.labelpath, raw: box }], banktok: TH.bankThingOf().lifetok })
    expect(Number(since.cursor - start.cursor)).to.be.above(0)
    expect(await backend.query(TH.rootVaultApi.watchThings, { scope: TH.ThingBank, cursor: since.cursor })).to.deep.include({ things: [], cursor: since.cursor })
  })

  it("sends the Things of its own bank alone", async () => {
    const backend = TH.componentTest()
    await backend.mutation(TH.rootVaultApi.birthBank, { ask: TH.birthBankAskOf() })
    const other = await backend.query(TH.rootVaultApi.watchThings, { scope: { ...TH.ThingBank, banklabel: 'other' }, cursor: 0n })
    expect(other).to.deep.include({ things: [], banktok: VoidLifeTok, cursor: 0n })
  })
})

describe("ConvexVaultDB's watch", () => {
  it("keeps one subscription as it moves its cursor, and none once stopped", async () => {
    const convexVaultDB = makeConvexVaultDB()
    const { deployment } = madeOf(convexVaultDB)
    const events: VaultEvent[] = []
    const unwatch = convexVaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, () => undefined)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    await TH.expectGood(convexVaultDB.tryBirthBank(TH.birthBankAskOf()))
    await vi.waitFor(() => { expect(events).to.have.lengthOf(3) })
    await TH.expectGood(convexVaultDB.tryWriteThing(boxBirthAskOf()))
    await vi.waitFor(() => { expect(events).to.have.lengthOf(4) })
    await TH.aWhile()
    expect(deployment.watching()).to.have.lengthOf(1)
    unwatch()
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(0) })
  })

  it("notifies of each Thing once, though the watch subscribes again after each", async () => {
    const convexVaultDB = makeConvexVaultDB()
    const events: VaultEvent[] = []
    const unwatch = convexVaultDB.watch(TH.ThingBank, (event) => { events.push(event) }, () => undefined)
    await vi.waitFor(() => { expect(madeOf(convexVaultDB).deployment.watching()).to.have.lengthOf(1) })
    await TH.expectGood(convexVaultDB.tryBirthBank(TH.birthBankAskOf()))
    const boxes = [TH.boxThingOf('openai'), TH.boxThingOf('anthropic')]
    for (const box of boxes) { await TH.expectGood(convexVaultDB.tryWriteThing(boxBirthAskOf(box))) }
    await vi.waitFor(() => { expect(events).to.have.lengthOf(5) })
    await TH.aWhile()
    expect(events.slice(3).map((event) => (event.eventkind === 'item') && event.val)).to.deep.equal(boxes)
    unwatch()
  })

  it("subscribes no more once a listener stops it on hearing a Thing", async () => {
    const convexVaultDB = makeConvexVaultDB()
    const { deployment } = madeOf(convexVaultDB)
    const heard = vi.fn()
    const unwatch: () => void = convexVaultDB.watch(TH.ThingBank, () => { heard(); unwatch() }, () => undefined)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    await TH.expectGood(convexVaultDB.tryWriteThing(TH.birthAskOf()))
    await vi.waitFor(() => { expect(heard).toHaveBeenCalledTimes(1) })
    await TH.aWhile()
    expect(deployment.watching()).to.have.lengthOf(0)
  })

  it("leaves a second watch of the bank on the same client running when the first stops twice", async () => {
    const convexVaultDB = makeConvexVaultDB()
    await TH.expectGood(convexVaultDB.tryBirthBank(TH.birthBankAskOf()))
    const [firstEvents, secondEvents]: [VaultEvent[], VaultEvent[]] = [[], []]
    const [openai, anthropic] = [TH.boxThingOf('openai'), TH.boxThingOf('anthropic')]
    const unwatchFirst = convexVaultDB.watch(TH.ThingBank, (event) => { firstEvents.push(event) }, () => undefined)
    const unwatchSecond = convexVaultDB.watch(TH.ThingBank, (event) => { secondEvents.push(event) }, () => undefined)
    const { deployment } = madeOf(convexVaultDB)
    await vi.waitFor(() => { expect(deployment.watching()).to.have.lengthOf(1) })
    await TH.expectGood(convexVaultDB.tryWriteThing(boxBirthAskOf(openai)))
    await vi.waitFor(() => { expect([firstEvents.length, secondEvents.length]).to.deep.equal([1, 1]) })
    unwatchFirst()
    unwatchFirst()
    await TH.expectGood(convexVaultDB.tryWriteThing(boxBirthAskOf(anthropic)))
    await vi.waitFor(() => { expect(secondEvents).to.have.lengthOf(2) })
    expect(firstEvents).to.have.lengthOf(1)
    unwatchSecond()
  })
})

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
