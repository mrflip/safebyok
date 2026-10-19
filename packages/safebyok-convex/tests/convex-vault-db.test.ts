// The loops below over `ClientCases` have copies in `e2e/tests/convex/convex-vault-db.test.ts`, which
// run over `ConvexReactClient` (this package lists no framework): a change to a looped test is
// made in both.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { anyApi } from 'convex/server'
import { Vault, VaultError, memoryDeviceDB } from 'safebyok'
import * as TH from './test-helpers'
import { convexVaultDB } from '../src/index'
import { MaxVaultLockboxes } from '../src/component/tallies'
import type { ConvexVaultClient, SafebyokApi } from '../src/index'
import type { GetUserId } from '../src/server'
import { fakeDeployment } from '../src/testing'
import type { FakeDeployment } from '../src/testing'

type Deployment = FakeDeployment<ReturnType<typeof TH.hostWith>>

// Every deployment a test makes is closed after it, so no client keeps its socket's timers alive.
const deployments: Deployment[] = []
const deploy = (getUserId: GetUserId = TH.bySubject) => {
  const deployment = fakeDeployment(TH.hostWith(getUserId))
  deployments.push(deployment)
  return deployment
}
afterEach(async () => {
  await Promise.all(deployments.splice(0).map((deployment) => deployment.close()))
})

/**
 * The clients convexVaultDB accepts that need no framework, each connected to `deployment` and
 * signed in as `subject`. `ConvexReactClient` is run in `e2e/`, which holds React.
 */
const ClientCases: [string, (deployment: Deployment, subject: string | null) => ConvexVaultClient][] = [
  ['ConvexClient', (deployment, subject) => deployment.client(subject)],
]

/**
 * Devices over a fresh deployment, each with clients of its own whose queries and mutations pass
 * the race's turnstile. The fake deployment runs one call at a time, as Convex's serializable
 * transactions let a mutation behave; its limit is its own, so `maxLockboxes` asks nothing of it.
 */
const devicesOver = (connect: (deployment: Deployment, subject: string | null) => ConvexVaultClient): TH.MakeVaultDBDevices => (turnstile) => {
  const deployment = deploy()
  return () => TH.perUser((userId) => convexVaultDB({ client: TH.throughTurnstile(turnstile, connect(deployment, userId), ['query', 'mutation']), api: deployment.api.safebyok }))
}

for (const [clientTitle, connect] of ClientCases) {
  TH.describeVaultDB(`convexVaultDB over a ${clientTitle}`, (vaultDBOpts) => {
    const deployment = deploy()
    return TH.perUser((userId) => convexVaultDB({ ...vaultDBOpts, client: connect(deployment, userId === '' ? null : userId), api: deployment.api.safebyok }))
  }, {
    makeVaultDBFor: () => {
      const deployment = deploy()
      return (userId) => convexVaultDB({ client: connect(deployment, userId), api: deployment.api.safebyok })
    },
    makeDevices: devicesOver(connect),
    pushes:      true,
  })

  describe(`convexVaultDB's devices over a ${clientTitle}, for the battery's races`, () => {
    it("send every write's mutation through the race's turnstile", async () => {
      await TH.expectRoundTripsThroughTurnstile(devicesOver(connect))
    })
  })
}

const u1 = TH.scopeOf('u1')

describe("convexVaultDB, as it is made", () => {
  it("holds at most Convex's document limit in one record", () => {
    const deployment = deploy()
    expect(convexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok }).maxRecordBytes).to.eq(1_048_576)
  })

  it("holds at most half of what one Convex function may read in one vault, since retiring reads it twice", () => {
    const deployment = deploy()
    expect(convexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok }).maxVaultBytes).to.eq(8 * 1024 * 1024)
  })

  it("declares the component's own limit on lockboxes, which the component enforces", () => {
    const deployment = deploy()
    expect(convexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok }).maxLockboxes).to.eq(MaxVaultLockboxes)
    expect(MaxVaultLockboxes).to.eq(8000)
  })

  const NotClientCases = [
    [null,                                     'refuses null for a client'],
    [{},                                       'refuses an object with no Convex calls'],
    [{ query: () => null, mutation: () => null }, 'refuses a client that cannot watch a query'],
  ] as const

  for (const [notClient, blurb] of NotClientCases) {
    it(blurb, () => {
      const deployment = deploy()
      expect(() => convexVaultDB({ client: notClient as unknown as ConvexVaultClient, api: deployment.api.safebyok })).to.throw(VaultError, /needs a Convex client/)
    })
  }

  it("refuses the whole generated api, where it wants api.safebyok", () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    // A host's generated `api` answers any property, as anyApi does.
    expect(() => convexVaultDB({ client, api: anyApi as unknown as SafebyokApi })).to.throw(VaultError, /api\.safebyok/)
    expect(() => convexVaultDB({ client, api: {} as SafebyokApi })).to.throw(VaultError, /api\.safebyok/)
    expect(convexVaultDB({ client, api: anyApi['safebyok'] as unknown as SafebyokApi }).maxRecordBytes).to.eq(1_048_576)
  })
})

/** `vaultDB`'s `u1` vault, made and filled with eight lockboxes of 900,000 bytes: a little under the component's limit. */
const nearlyFull = async (vaultDB: ReturnType<typeof convexVaultDB>) => {
  await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
  for (let ii = 0; ii < 8; ii++) {
    await vaultDB.updateBox(u1, TH.heavyBox(`heavy_${String(ii)}`, 900_000), TH.noBoxYet)
  }
}

describe("convexVaultDB, refusing", () => {
  // Every verb's identity_revoked is the battery's line 5.4: these are what Convex's own says.
  for (const [clientTitle, connect] of ClientCases) {
    it(`refuses over a ${clientTitle} as identity_revoked when no one is signed in, saying so, with no cause`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB({ client: connect(deployment, null), api: deployment.api.safebyok })
      const refusal = await TH.expectRefusal(vaultDB.readVaultProps(u1), 'identity_revoked')
      expect(refusal).to.be.instanceOf(VaultError)
      expect(refusal.message).to.eq('No one is signed in, so this vault cannot be reached: sign in, then try again.')
      expect(refusal).to.not.have.property('cause')
    })

    it(`refuses over a ${clientTitle} as identity_revoked for another user's vault, saying so, with no cause`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB({ client: connect(deployment, 'u2'), api: deployment.api.safebyok })
      const refusal = await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic_api_key', 'a1'), TH.noBoxYet), 'identity_revoked')
      expect(refusal.message).to.eq('This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.')
      expect(refusal).to.not.have.property('cause')
    })
  }

  it("lists a lockbox the component holds but safebyok would never write as damaged, under its boxlabel", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const vaultDB = convexVaultDB({ client, api: deployment.api.safebyok })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('openai', 'two'), TH.noBoxYet)
    // Past the adapter's own checks, straight to the component, which bounds no time's form.
    const lockbox = { ...TH.boxOf('anthropic', 'one'), written_at: Date.UTC(2026, 9, 14) + 0.5 }
    await client.mutation(deployment.api.safebyok.updateBox, { scope: u1, lockbox, expected: TH.noBoxYet })
    const listed = await vaultDB.listBoxes(u1)
    expect(listed.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['anthropic', true], ['openai', false]])
    await vaultDB.retireBox(u1, 'anthropic', { vault_id: 'vault-id-u1' })
    expect(await vaultDB.listBoxes(u1)).to.have.lengthOf(1)
  })

  for (const [clientTitle, connect] of ClientCases) {
    it(`refuses a lockbox the component has no room for over a ${clientTitle} as vault_full`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      await nearlyFull(vaultDB)
      const refusal = await TH.expectRefusal(vaultDB.updateBox(u1, TH.heavyBox('one_too_many', 200_000), TH.noBoxYet), 'vault_full')
      expect(refusal.message).to.eq('This vault is full: retire a lockbox to make room, then try again.')
      expect(refusal).to.not.have.property('cause')
      const listed = await vaultDB.listBoxes(u1)
      expect(listed.map((summary) => summary.boxlabel)).to.not.include('one_too_many')
    })
  }

  it("has a vault's storeBox() refuse as vault_full a lockbox the component has no room for, under the vault's own maxLockboxes", async () => {
    const deployment = deploy()
    const client = deployment.client('u1')
    const vault = await openOver(client, deployment.api.safebyok)
    await vault.unlock(TH.RealPassphrase)
    // Lockboxes the vault never opens, leaving less room than one whisper of 40,000 bytes takes.
    const vaultDB = convexVaultDB({ client, api: deployment.api.safebyok })
    const vaultProps = await vaultDB.readVaultProps(u1)
    const vaultId = vaultProps?.vault_id ?? ''
    for (const [ii, bytes] of [...Array.from({ length: 8 }, () => 900_000), 120_000].entries()) {
      await vaultDB.updateBox(u1, TH.heavyBox(`heavy_${String(ii)}`, bytes), { vault_id: vaultId, revision_tok: null, vault_key_epoch: 1 })
    }
    const refusal = await TH.expectRefusal(vault.storeBox('anthropic_api_key', 'x'.repeat(40_000)), 'vault_full')
    expect(refusal.message).to.eq('This vault is full: retire a lockbox to make room, then try again.')
    expect(vault.getSnapshot().boxes.map((box) => box.boxlabel)).to.not.include('anthropic_api_key')
    vault.close()
  })

  it("makes any other failure storage_unavailable, carrying nothing of Convex's error", async () => {
    const deployment = deploy(() => { throw new Error('the auth provider is down') })
    const refusal = await TH.expectRefusal(convexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok }).readVaultProps(u1), 'storage_unavailable')
    expect(refusal.cause).to.be.undefined
    expect(refusal.message).to.include("your Convex deployment's logs, or, for trouble before the call left, the browser console")
    expect(TH.thrownText(refusal)).to.not.include('the auth provider is down')
  })
})

describe("a record the deployment refused", () => {
  // Distinctive values throughout, so that finding one in what is thrown means it was quoted.
  const subject = 'user_quotable'
  const scope = { applabel: 'quotable_app', user_id: subject, vaultlabel: 'quotable_vault' }
  const quotableKey = { vault_key_epoch: 52_874, prior_vault_key: { vault_key_epoch: 52_873, vault_key_wrapped: TH.fakeCiphered('prior_quotable') } }
  const quotableWayins = [TH.wayinOf('quotable_phrase', { vault_key_epoch: 52_874, device_id: 'device_quotable', registered_at: Date.UTC(2026, 8, 17) })]
  const standing = TH.vaultPropsOf(subject, { ...scope, ...quotableKey, unlock_epoch: 52_871, wayins: quotableWayins })
  const nextVaultProps = { ...standing, unlock_epoch: 52_872, vault_key_passphrase_wrapped: TH.fakeCiphered('rewrapped_quotable') }
  const lockbox = TH.boxOf('quotable_box', 'quotable_rev', { sidecar_json: TH.sidecarJsonOf({ note: 'a quotable sidecar' }), vault_key_epoch: 52_874 })
  // The whisper's codec and schema version are the same in every lockbox, so nothing to quote.
  const { whisper_codec: _codec, whisper_schema_version: _version, ...quotableBox } = lockbox

  // A rival of every record above, in the same shapes with other values. Whatever a record shares
  // with it -- the format literals, the test deriver's label, the fake salt -- is public and the
  // same in every record, so finding it in a refusal is no leak; only what varies per record counts.
  const rivalScope = { applabel: 'rival_app', user_id: 'user_rival', vaultlabel: 'rival_vault' }
  const rivalVaultProps = TH.vaultPropsOf('user_rival', { ...rivalScope, vault_key_epoch: 11, prior_vault_key: { vault_key_epoch: 10, vault_key_wrapped: TH.fakeCiphered('prior_rival') }, unlock_epoch: 7, wayins: [TH.wayinOf('rival_phrase', { vault_key_epoch: 11, device_id: 'device_rival', registered_at: Date.UTC(2026, 0, 2) })] })
  const rivalBox = TH.boxOf('rival_box', 'rival_rev', { sidecar_json: TH.sidecarJsonOf({ note: 'a rival note' }), vault_key_epoch: 11 })
  const rivalLeaves = new Set(TH.leafTexts({ scope: rivalScope, record: [rivalVaultProps, { ...rivalVaultProps, unlock_epoch: 8, vault_key_passphrase_wrapped: TH.fakeCiphered('rewrapped_rival') }, rivalBox] }))
  const perRecordLeaves = (record: unknown) => TH.leafTexts({ scope, record }).filter((leaf) => ! rivalLeaves.has(leaf))

  const RefusedWrites: [string, unknown, (vaultDB: ReturnType<typeof convexVaultDB>) => Promise<unknown>][] = [
    ['updateVaultProps', nextVaultProps, (vaultDB) => vaultDB.updateVaultProps(nextVaultProps, { vault_id: standing.vault_id, unlock_epoch: 52_871 })],
    ['updateBox',        quotableBox, (vaultDB) => vaultDB.updateBox(scope, lockbox, { vault_id: standing.vault_id, revision_tok: null, vault_key_epoch: 52_874 })],
  ]

  for (const [verb, record, write] of RefusedWrites) {
    it(`is quoted nowhere in what ${verb} throws: message, properties or causes`, async () => {
      const deployment = deploy()
      const client = deployment.client(subject)
      await convexVaultDB({ client, api: deployment.api.safebyok }).fetchOrCreateVaultProps(standing)
      // The core strips a field it does not know, so this one strays in on the wire, past it,
      // where Convex's validator refuses the call. convex-test's validator names the field; a
      // dev deployment's quotes the arguments too (notes/security.md). The refusal carries none of it.
      const straying: ConvexVaultClient = {
        query:    client.query.bind(client),
        onUpdate: client.onUpdate.bind(client),
        mutation: (mutationRef, args) => client.mutation(mutationRef, { ...args, stray_field: 'x' }),
      }
      const vaultDB = convexVaultDB({ client: straying, api: deployment.api.safebyok })
      const refusal = await TH.expectRefusal(write(vaultDB), 'storage_unavailable')
      expect(refusal.cause).to.be.undefined
      const thrown = TH.thrownText(refusal)
      expect(thrown).to.not.include('stray_field')
      const quotables = perRecordLeaves(record)
      expect(quotables, 'the leak sweep looks for what varies per record').to.include('quotable_app')
      expect(quotables, 'and not for the public constants every record shares').to.not.include.members(['test_digest_v0'])
      for (const leaf of quotables) {
        expect(thrown).to.not.include(leaf)
      }
      expect(await vaultDB.readVaultProps(scope)).to.deep.equal(standing)
      expect(await vaultDB.readBox(scope, 'quotable_box')).to.be.null
    })
  }

  it("is quoted nowhere in what updateBox throws when Convex's validator quotes the refused argument", async () => {
    const deployment = deploy()
    const client = deployment.client(subject)
    await convexVaultDB({ client, api: deployment.api.safebyok }).fetchOrCreateVaultProps(standing)
    const expected = { vault_id: standing.vault_id, revision_tok: null, vault_key_epoch: lockbox.vault_key_epoch }
    const quotedArgs = withSidecarNotText({ scope, lockbox, expected })
    await expect(client.mutation(deployment.api.safebyok.updateBox, quotedArgs)).rejects.toThrow('quoted_by_convex')
    const quoting: ConvexVaultClient = {
      query:    client.query.bind(client),
      onUpdate: client.onUpdate.bind(client),
      mutation: (mutationRef, args) => client.mutation(mutationRef, withSidecarNotText(args)),
    }
    const vaultDB = convexVaultDB({ client: quoting, api: deployment.api.safebyok })
    const refusal = await TH.expectRefusal(vaultDB.updateBox(scope, lockbox, expected), 'storage_unavailable')
    expect(refusal.cause).to.be.undefined
    expect(TH.thrownText(refusal)).to.not.include('quoted_by_convex')
    expect(await vaultDB.readBox(scope, 'quotable_box')).to.be.null
  })
})

/** `args` with its lockbox's sidecar not text, past the core's checks: convex-test's validator quotes it. */
const withSidecarNotText = <ArgsT extends object>(args: ArgsT): ArgsT => ({ ...args, lockbox: { ...(args as { lockbox?: object }).lockbox, sidecar_json: ['quoted_by_convex'] } })

/** Resolves once every message already sent to `vaultDB`'s client has arrived: one round trip behind them. */
const caughtUp = async (vaultDB: ReturnType<typeof convexVaultDB>) => { await vaultDB.readVaultProps(u1) }

/**
 * A watch of `u1`'s vault through `vaultDB`, once its first result has come in: its `onChange`,
 * how often that had been called by then (`heardBefore`), and its `unsubscribe`.
 */
const settledWatch = async (vaultDB: ReturnType<typeof convexVaultDB>) => {
  const onChange = vi.fn()
  const unsubscribe = vaultDB.subscribe(u1, onChange)
  await vi.waitFor(() => { expect(onChange).toHaveBeenCalled() })
  return { onChange, unsubscribe, heardBefore: onChange.mock.calls.length }
}

describe("convexVaultDB.subscribe", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`calls onChange over a ${clientTitle} when another device writes to the vault`, async () => {
      const deployment = deploy()
      const here = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      const there = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      const watch = await settledWatch(here)
      await there.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
      await vi.waitFor(() => { expect(watch.onChange.mock.calls.length).to.be.greaterThan(watch.heardBefore) })
    })

    it(`hears nothing over a ${clientTitle} of another vault's writes`, async () => {
      const deployment = deploy()
      const here = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      const watch = await settledWatch(here)
      await here.fetchOrCreateVaultProps({ ...TH.vaultPropsOf('u1'), vaultlabel: 'work' })
      await caughtUp(here)
      expect(watch.onChange.mock.calls.length).to.eq(watch.heardBefore)
    })

    it(`unsubscribes once over a ${clientTitle}, however often it is called, leaving another watch of the vault be`, async () => {
      const deployment = deploy()
      const client = connect(deployment, 'u1')
      const alongside = await settledWatch(convexVaultDB({ client, api: deployment.api.safebyok }))
      const unsubscribe = convexVaultDB({ client, api: deployment.api.safebyok }).subscribe(u1, () => undefined)
      unsubscribe()
      unsubscribe()
      const heardBefore = alongside.onChange.mock.calls.length
      await convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok }).fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
      await vi.waitFor(() => { expect(alongside.onChange.mock.calls.length).to.be.greaterThan(heardBefore) })
    })

    it(`calls onChange over a ${clientTitle} when a sign-out fails its watch, so the vault looks again`, async () => {
      const deployment = deploy()
      const here = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      await here.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
      const watch = await settledWatch(here)
      deployment.signOut()
      await vi.waitFor(() => { expect(watch.onChange.mock.calls.length).to.be.greaterThan(watch.heardBefore) })
      await TH.expectRefusal(here.readVaultProps(u1), 'identity_revoked')
    })

    it(`subscribes calmly over a ${clientTitle} while signed out, and throws nothing later`, async () => {
      const deployment = deploy()
      const here = convexVaultDB({ client: connect(deployment, null), api: deployment.api.safebyok })
      const unsubscribe = here.subscribe(u1, () => undefined)
      // The refused watch arrives with the next round trip; an error thrown from inside the
      // client's socket would fail this test as unhandled.
      await TH.expectRefusal(here.readVaultProps(u1), 'identity_revoked')
      unsubscribe()
    })
  }

  it("calls onChange for the first result too: the vault's first read may have missed a write", async () => {
    const deployment = deploy()
    const here = convexVaultDB({ client: deployment.client('u1'), api: deployment.api.safebyok })
    const onChange = vi.fn()
    here.subscribe(u1, onChange)
    await vi.waitFor(() => { expect(onChange).toHaveBeenCalledTimes(1) })
  })
})

/** The README's example: a vault opened over the app's own Convex client. */
const openOver = (client: ConvexVaultClient, api: SafebyokApi) => TH.settledVault(TH.memoryVaultOpts({ vaultDB: convexVaultDB({ client, api }) }))

const resolvesNull = () => Promise.resolve(null)
const unwatches = () => undefined

/** A ConvexClient whose one watch the test drives by hand: `heard` delivers, `failed` errs. */
const handDrivenClient = () => {
  const watch = { heard: (): unknown => undefined, failed: (_err: Error): unknown => undefined }
  const client = {
    query:    resolvesNull,
    mutation: resolvesNull,
    onUpdate: (_queryRef: unknown, _args: unknown, onUpdate: (result: unknown) => unknown, onError: (err: Error) => unknown) => {
      watch.heard = () => onUpdate(null)
      watch.failed = onError
      return unwatches
    },
  }
  return { client: client as unknown as ConvexVaultClient, watch }
}

describe("convexVaultDB.subscribe, when its ConvexClient watch fails", () => {
  it("warns once for a failing streak, calling onChange each time, and again once it has heard between", () => {
    const spy = TH.spyLogger()
    const { client, watch } = handDrivenClient()
    const onChange = vi.fn()
    convexVaultDB({ client, api: anyApi['safebyok'] as unknown as SafebyokApi, logger: spy.logger }).subscribe(u1, onChange)
    watch.failed(new Error('socket closed'))
    watch.failed(new Error('socket closed'))
    expect(spy.calls.map((heard) => heard.level)).to.deep.equal(['warn'])
    expect(onChange).toHaveBeenCalledTimes(2)
    watch.heard()
    watch.failed(new Error('socket closed again'))
    expect(spy.calls.map((heard) => heard.level)).to.deep.equal(['warn', 'warn'])
    expect(spy.calls[1]!.err?.message).to.eq('socket closed again')
    expect(onChange).toHaveBeenCalledTimes(4)
  })
})

describe("a vault over convexVaultDB, opened before sign-in", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`is refused as identity_revoked over a ${clientTitle}, still opening, and leaves no watch live on the deployment once closed`, async () => {
      const deployment = deploy()
      const vaultDB = convexVaultDB({ client: connect(deployment, null), api: deployment.api.safebyok })
      const vault = Vault.make(TH.memoryVaultOpts({ vaultDB }))
      await TH.expectRefusal(vault.hello(), 'identity_revoked')
      expect(vault.getSnapshot().state).to.eq('opening')
      vault.close()
      await vi.waitFor(() => { expect(deployment.watching()).to.deep.equal([]) })
    })
  }
})

describe("a vault over convexVaultDB, when its user signs out", () => {
  for (const [clientTitle, connect] of ClientCases) {
    it(`locks over a ${clientTitle} while idle, forgetting its lease, and erases nothing`, async () => {
      const deployment = deploy()
      const spy = TH.spyLogger()
      const deviceDB = memoryDeviceDB()
      const vaultDB = convexVaultDB({ client: connect(deployment, 'u1'), api: deployment.api.safebyok })
      const vault = await TH.settledVault(TH.memoryVaultOpts({ vaultDB, deviceDB, logger: spy.logger }))
      await vault.unlock(TH.RealPassphrase)
      await vault.storeBox('anthropic_api_key', 'sk-ant-test-not-a-real-key')
      deployment.signOut()
      await vi.waitFor(() => { expect(vault.getSnapshot().state).to.eq('locked') })
      expect(await deviceDB.readLease(u1)).to.be.null
      // Storage it cannot trust has the vault say hello afresh at its next call, refused as ever.
      await TH.expectRefusal(vault.readBox('anthropic_api_key'), 'identity_revoked')
      await TH.expectRefusal(vault.unlock(TH.RealPassphrase), 'identity_revoked')
      expect(spy.calls.map((heard) => heard.level)).to.include('log')
      expect(await deployment.as('u1').query(deployment.api.safebyok.listBoxSummaries, { scope: u1 })).to.have.lengthOf(1)
      vault.close()
    })
  }
})
