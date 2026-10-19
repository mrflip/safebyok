import { it, describe, expect, vi } from 'vitest'
import type { Lockbox } from '../../src/box'
import type { VaultProps, LockboxSummary, DamagedLockbox } from '../../src/types'
import { NameFloorBytes } from '../../src/validators'
import { type VaultDB, type VaultDBOpts, type LockboxRetireExpectation } from '../../src/vault-db'
import { type MakeDevices, type Turnstile, openTurnstile, raceEveryWay, makeTurnstile, type RaceOutcome, outcomeOf } from './racing'
import { vaultPropsOf, scopeOf, boxOf, noBoxYet, summaryOf, sidecarJsonOf, thisVault, OddLabels, retiring, wayinOf, fakeCiphered, vaultPropsAtEpochOf } from './builders'
import { expectRefusal } from './refusals'
import { unheard, ticks, wakeupAtNextTick } from './timing'
import { spyLogger, thrownText, leafTexts } from './logging'


// == [Contract and types]: VaultDBContract, VaultDBContractLine, VaultDBVerbs, MakeVaultDB, DescribeVaultDBOpts, MakeVaultDBDevices, others

/**
 * The numbered lines of the VaultDB contract (the core's `VAULTDB.md`), each by its number and
 * short title, as the document has them: {@link describeVaultDB} titles each of its groups by one,
 * and an adapter's own tests of a line the battery cannot reach (5.4, who may reach a vault) cite
 * it the same way. A line whose title is not here is not in the contract.
 *
 * @example describe(`postgresVaultDB, 5.5: ${TH.VaultDBContract['5.5']}`, () => { ... })
 */
export const VaultDBContract = Object.freeze({
  '1.1': 'What is stored reads back whole',
  '1.2': 'Each vault keeps to itself',
  '1.3': 'Nothing is repaired, and nothing is dropped',
  '2.1': 'A write that resolved is seen by every read after it',
  '2.2': 'Every lockbox stored can be read by its boxlabel',
  '2.3': 'A listing is whole',
  '3.1': 'Vault props are created once',
  '3.2': 'An update of the vault props lands only over the props it read',
  '3.3': 'A lockbox write lands only over the lockbox it read, in the vault it was sealed for',
  '3.4': 'A retirement wins, within its vault, and says what it removed',
  '3.5': 'A vault is retired whole, and alone',
  '3.6': 'A refused write wrote nothing',
  '3.7': 'Writes that do not collide all land',
  '3.8': 'A lockbox write lands only under the vaultKey that stands',
  '4.1': 'An adapter declares the most lockboxes it holds in one vault',
  '4.2': 'A new lockbox past the limit is refused, on a best effort',
  '4.3': 'A replacement is never refused for the count',
  '4.4': 'Under the limit, a new lockbox lands',
  '4.5': 'Past the limit, nothing is lost',
  '4.6': "A hard limit is the backend's, or opt-in",
  '5.1': 'Every refusal is a VaultError whose kind says what to do',
  '5.2': 'A stale write means an expectation failed, and nothing else',
  '5.3': 'A refusal quotes nothing it was handed',
  '5.4': 'Only the signed-in user reaches their vaults',
  '5.5': 'identity_revoked means the user is gone',
  '5.6': 'not_permitted refuses one call, and locks nothing',
  '5.7': 'An adapter with no notion of identity says neither',
  '6.1': 'subscribe hands back an unsubscribe, and calls when the vault may have changed',
  '6.2': 'A watch that fails calls onChange',
  '7.1': 'The most it holds in one record',
  '7.2': 'The most it holds of one vault',
  '7.3': 'The most it holds in one name',
} as const)

/** A numbered line of the VaultDB contract, such as `'3.3'`. */
export type VaultDBContractLine = keyof typeof VaultDBContract

/**
 * A VaultDB as the suite sees it: its public verbs only. Structural, so an adapter extending
 * VaultDB from the built package (`safebyok`) qualifies as readily as one extending `src/`.
 */
export type VaultDBVerbs = Pick<VaultDB,
  'maxRecordBytes' | 'maxVaultBytes' | 'maxLockboxes' | 'maxNameBytes' | 'readVaultProps' | 'fetchOrCreateVaultProps' | 'updateVaultProps' | 'readBox' | 'listBoxes' | 'listBoxRecords' | 'updateBox' | 'retireBox' | 'retireVault' | 'retireDamagedVault' | 'subscribe'
>

/**
 * A fresh, empty adapter, made with the {@link VaultDBOpts} it is handed -- its `logger`, for the
 * battery to hear what it says -- as every adapter's factory takes them: no record in it, and none
 * shared with another call.
 */
export type MakeVaultDB = (vaultDBOpts: VaultDBOpts) => VaultDBVerbs | Promise<VaultDBVerbs>

/** What {@link describeVaultDB} takes beside its adapter. */
export type DescribeVaultDBOpts = {
  /**
   * A fresh, empty adapter that declares and holds `maxLockboxes` lockboxes in one vault, for the
   * lockbox limit's lines (4.2 to 4.5); without it, those are skipped. An adapter whose limit is
   * `Infinity`, or fixed and too large to fill in a test, has none to give.
   */
  makeCappedVaultDB?: ((maxLockboxes: number) => VaultDBVerbs | Promise<VaultDBVerbs>) | undefined
  /**
   * A fresh, empty backend, as a way to make an adapter over it signed in as a given user, or
   * signed out for null: for line 5.4, who may reach a vault; without it, that is skipped. An
   * adapter with no notion of identity has none to give.
   */
  makeVaultDBFor?: (() => ((userId: string | null) => VaultDBVerbs) | Promise<(userId: string | null) => VaultDBVerbs>) | undefined
  /**
   * Whether the adapter `makeVaultDB` makes pushes: calls a subscriber after each write through
   * it, for line 6.1's push tests; without it, those are skipped. An adapter with no push (a
   * backend that cannot say when it changed, or one whose push the factory left unwired) leaves
   * it out.
   */
  pushes?: boolean | undefined
  /**
   * A fresh, empty backend, as a way to make devices over it: for the races (lines 3.1 to 3.7 and
   * 4.5) made from different devices, line 2.1 across devices, and 6.1's push from another device.
   * Each device is an adapter of its own over that backend, sharing nothing else with the others --
   * no adapter, client, connection, lock or queue -- held to `maxLockboxes` where the adapter takes a
   * limit (as for `makeCappedVaultDB`), and passing `turnstile` before every round trip it makes to
   * the backend, a watch's start among them ({@link throughTurnstile}), so a race can hold it there:
   * {@link expectRoundTripsThroughTurnstile} shows that each write passes it, though not that every
   * round trip does, since only the adapter knows how many it makes. An adapter over a backend in this
   * process that answers synchronously makes no round trips, and leaves `turnstile` be.
   * Without it, the races run through one adapter, as `makeVaultDB` makes it, and the rest is skipped.
   */
  makeDevices?: MakeVaultDBDevices | undefined
}

/** What a device of {@link DescribeVaultDBOpts.makeDevices} is made with: the limit to hold it to, where the adapter takes one. */
export type VaultDBDeviceOpts = { maxLockboxes?: number | undefined }

/** A fresh, empty backend, as a way to make devices over it: {@link MakeDevices} of a VaultDB, its factory taking {@link VaultDBDeviceOpts}. */
export type MakeVaultDBDevices = MakeDevices<VaultDBVerbs, VaultDBDeviceOpts>

/** The lockbox limit {@link describeVaultDB} asks a capped adapter for. */
const CappedLockboxes = 3
// --

/**
 * The behaviour every VaultDB owes, written once: the VaultDB contract (the core's `VAULTDB.md`),
 * one group of tests for each of its numbered lines that a test can reach through an adapter's
 * public verbs, each group titled by its line ({@link VaultDBContract}). Run it against an adapter
 * with a factory making a fresh, empty one per test, and -- for an adapter with a lockbox limit a
 * test can fill -- a second making one held to a given limit, and for an adapter that serves the
 * user signed in, a third making one signed in as anyone; and for an adapter that pushes, a word
 * that it does.
 *
 * For an adapter's own tests, from `safebyok/testing`; it runs under vitest. It checks refusals
 * by `kind` rather than by class, so an adapter passes whichever copy of the package it extends.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeAdapter - A fresh, empty adapter, made with the VaultDBOpts it is handed: no record
 *   in it, and none shared with another call.
 * @param opts - Optionally, `makeCappedVaultDB`, for the lockbox limit's lines; `makeVaultDBFor`,
 *   for who may reach a vault; and `pushes`, for subscribe's calls.
 *
 * @example
 *   describeVaultDB('localVaultDB', (vaultDBOpts) => localVaultDB({ ...vaultDBOpts, store: memoryStore() }), { pushes: true })
 * @example
 *   describeVaultDB('postgresVaultDB', makeRequest, {
 *     makeCappedVaultDB: (maxLockboxes) => postgresVaultDB({ client, userId: 'u1', maxLockboxes }),
 *     makeVaultDBFor:    () => (userId) => postgresVaultDB({ client, userId }),
 *   })
 */
export const describeVaultDB = (adapterTitle: string, makeAdapter: MakeVaultDB, opts: DescribeVaultDBOpts = {}) => {
  // == [Setup]: makeVaultDB, lineTitle, timing, withVaultProps, servedHolding, cappedHolding

  const { makeCappedVaultDB, makeVaultDBFor } = opts
  /** A fresh adapter, made with no VaultDBOpts: the battery's own lines hear nothing it logs. */
  const makeVaultDB = () => makeAdapter({})

  /** The title of a group of tests for one line of the contract. */
  const lineTitle = (line: VaultDBContractLine) => `${adapterTitle}, as a VaultDB, ${line}: ${VaultDBContract[line]}`

  // The lockbox limit's lines run only over a capped adapter.
  const capped = makeCappedVaultDB !== undefined
  // And who may reach a vault, only over an adapter that knows who is signed in.
  const signsIn = makeVaultDBFor !== undefined

  // The races, the lines across devices and the push tests, each runnable on its own.
  const timing = vaultDBTimingChecks(makeAdapter, opts)
  /** Each timing check of `line`, as a test, run where its adapter can give what it needs. */
  const timingTestsOf = (line: VaultDBContractLine) => {
    for (const check of Object.values(timing)) {
      if (check.line === line) { it.runIf(check.runs)(check.title, () => expectToHold(check), TimingTestMillis) }
    }
  }

  /** A fresh adapter whose `u1` scope holds vault props, as every lockbox write needs. */
  const withVaultProps = async () => {
    const vaultDB = await makeVaultDB()
    await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u1'))
    return vaultDB
  }

  /** A fresh backend whose u1 vault holds two lockboxes, and the way to sign in to it. */
  const servedHolding = async () => {
    if (! makeVaultDBFor) { throw new Error('describeVaultDB ran a sign-in test with no makeVaultDBFor.') }
    const vaultDBFor = await makeVaultDBFor()
    const owner = vaultDBFor('u1')
    await owner.fetchOrCreateVaultProps(vaultPropsOf('u1'))
    await storeEach(owner, ['anthropic', 'openai'])
    return { owner, vaultDBFor }
  }

  /** A fresh capped adapter, its `u1` vault made and holding a new lockbox under each boxlabel. */
  const cappedHolding = async (boxlabels: readonly string[]) => {
    if (! makeCappedVaultDB) { throw new Error('describeVaultDB ran a lockbox limit test with no makeCappedVaultDB.') }
    const vaultDB = await makeCappedVaultDB(CappedLockboxes)
    await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u1'))
    await storeEach(vaultDB, boxlabels)
    return vaultDB
  }
  // --

  // == [Reading back and isolation]: 1.1 reads back whole, 1.2 keeps to itself

  describe(lineTitle('1.1'), () => {
    it("has no vault props until they are created, then reads them back whole", async () => {
      const vaultDB = await makeVaultDB()
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.be.null
      expect(await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
    })

    it("has no lockbox until one is written, then reads it back whole", async () => {
      const vaultDB = await withVaultProps()
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("reads back a lockbox with an empty sidecar as stored, and lists it with that sidecar", async () => {
      const vaultDB = await withVaultProps()
      const sidecarless = boxOf('anthropic', 'one', { sidecar_json: '{}' })
      await vaultDB.updateBox(scopeOf('u1'), sidecarless, noBoxYet)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(sidecarless)
      const [summary] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaryOf(summary)?.sidecar).to.deep.equal({})
    })

    it("reads a sidecar's JSON back exactly as written, as it is bound: accented letters, an emoji, a tab, a newline, quotes and backslashes", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one', { sidecar_json: sidecarJsonOf(LiteralSidecar) }), noBoxYet)
      const lockbox = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(lockbox?.sidecar_json).to.eq(sidecarJsonOf(LiteralSidecar))
      const [summary] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaryOf(summary)?.sidecar).to.deep.equal(LiteralSidecar)
    })

    it("adds nothing it was handed beyond the record: a field safebyok never writes is left behind", async () => {
      const vaultDB = await makeVaultDB()
      await vaultDB.fetchOrCreateVaultProps({ ...vaultPropsOf('u1'), stray_field: 'never stored' } as VaultProps)
      const written = await vaultDB.updateBox(scopeOf('u1'), { ...boxOf('anthropic', 'one'), stray_field: 'never stored' } as Lockbox, noBoxYet)
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
      expect(written).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("hands back from a lockbox write the record as stored, field for field the one written and the one a read then finds", async () => {
      const vaultDB = await withVaultProps()
      const writes = [
        [boxOf('anthropic', 'one'),                                                   noBoxYet],
        [boxOf('anthropic', 'two', { sidecar_json: sidecarJsonOf(LiteralSidecar) }), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 }],
        [boxOf('openai', 'one', { sidecar_json: '{}' }),                              noBoxYet],
      ] as const
      for (const [lockbox, expected] of writes) {
        const written = await vaultDB.updateBox(scopeOf('u1'), lockbox, expected)
        expect(written).to.deep.equal(lockbox)
        expect(await vaultDB.readBox(scopeOf('u1'), lockbox.boxlabel)).to.deep.equal(written)
      }
    })
  })

  describe(lineTitle('1.2'), () => {
    it("keeps each scope to itself: same boxlabel, two users, no collision", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u2'))
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u2'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_tok: null, vault_key_epoch: 1 })
      const oneBox = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      const twoBox = await vaultDB.readBox(scopeOf('u2'), 'anthropic')
      expect(oneBox?.revision_tok).to.eq('rev-one')
      expect(twoBox?.revision_tok).to.eq('rev-two')
      expect(await vaultDB.listBoxes(scopeOf('u2'))).to.have.lengthOf(1)
    })

    it("keeps apart users whose ids differ only by a colon, a quote, a backslash, a comma or a bracket", async () => {
      const vaultDB = await makeVaultDB()
      const userIds = ['u1', 'u1:', 'u1"', String.raw`u1\\`, 'u1,', 'u1[', 'u1]', 'u1","main']
      for (const [ii, userId] of userIds.entries()) {
        await vaultDB.fetchOrCreateVaultProps(vaultPropsOf(userId))
        await vaultDB.updateBox(scopeOf(userId), boxOf('anthropic', `of-${String(ii)}`), { vault_id: `vault-id-${userId}`, revision_tok: null, vault_key_epoch: 1 })
      }
      const listEach = () => Promise.all(userIds.map((userId) => vaultDB.listBoxes(scopeOf(userId))))
      const before = await listEach()
      expect(before.map((listing) => listing.map((box) => summaryOf(box)?.revision_tok))).to.deep.equal(userIds.map((_userId, ii) => [`rev-of-${String(ii)}`]))
      await vaultDB.retireVault(scopeOf('u1'), thisVault)
      const after = await listEach()
      expect(after.map((listing) => listing.length)).to.deep.equal([0, 1, 1, 1, 1, 1, 1, 1])
    })

    it("holds one spelling of a letter: a user id with it composed is stored, and one with it decomposed refused, never normalized", async () => {
      const vaultDB = await makeVaultDB()
      const [composed, decomposed] = ['caf\u{E9}', 'cafe\u{301}']
      await vaultDB.fetchOrCreateVaultProps(vaultPropsOf(composed))
      expect(await vaultDB.readVaultProps(scopeOf(composed))).to.deep.equal(vaultPropsOf(composed))
      await expectRefusal(vaultDB.fetchOrCreateVaultProps(vaultPropsOf(decomposed)), 'bad_record')
      await expectRefusal(vaultDB.readVaultProps(scopeOf(decomposed)), 'bad_label')
    })

    it("keeps apart vaults and boxes whose labels differ only by a colon, a quote, a backslash, a comma or a bracket, or are in any script", async () => {
      const vaultDB = await makeVaultDB()
      const scopes = OddLabels.map((vaultlabel) => scopeOf('u1', vaultlabel))
      for (const [ii, scope] of scopes.entries()) {
        await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u1', { ...scope, vault_id: `vault-id-${String(ii)}` }))
        await vaultDB.updateBox(scope, boxOf(OddLabels[ii] ?? '', `of-${String(ii)}`), { vault_id: `vault-id-${String(ii)}`, revision_tok: null, vault_key_epoch: 1 })
      }
      const listEach = () => Promise.all(scopes.map((scope) => vaultDB.listBoxes(scope)))
      const before = await listEach()
      expect(before.map((listing) => listing.map((box) => [box.boxlabel, summaryOf(box)?.revision_tok]))).to.deep.equal(OddLabels.map((label, ii) => [[label, `rev-of-${String(ii)}`]]))
      await vaultDB.retireVault(scopes[0] ?? scopeOf('u1'), { vault_id: 'vault-id-0' })
      const after = await listEach()
      expect(after.map((listing) => listing.length)).to.deep.equal(OddLabels.map((_label, ii) => (ii === 0 ? 0 : 1)))
    })

    it("keeps boxes of one vault apart, by any labels, reading back each under its own", async () => {
      const vaultDB = await withVaultProps()
      for (const [ii, boxlabel] of OddLabels.entries()) {
        await vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, `of-${String(ii)}`), noBoxYet)
      }
      const summaries = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaries.map((box) => box.boxlabel)).to.have.members([...OddLabels])
      for (const [ii, boxlabel] of OddLabels.entries()) {
        const lockbox = await vaultDB.readBox(scopeOf('u1'), boxlabel)
        expect(lockbox?.revision_tok).to.eq(`rev-of-${String(ii)}`)
      }
      const quoted = retiring(`rev-of-${String(OddLabels.indexOf('main"'))}`)
      expect(await vaultDB.retireBox(scopeOf('u1'), 'main"', quoted)).to.deep.equal({ outcome: 'retired' })
      const remaining = await vaultDB.listBoxes(scopeOf('u1'))
      expect(remaining).to.have.lengthOf(OddLabels.length - 1)
    })
  })
  // --

  // == [Reads after writes]: 2.1 seen by later reads, 2.2 by boxlabel, 2.3 listings

  describe(lineTitle('2.1'), () => {
    it("shows each write to the very next read and listing, and each retirement likewise", async () => {
      const vaultDB = await withVaultProps()
      const revisionsNow = async () => ({
        read:   await revisionIn(vaultDB, 'anthropic'),
        listed: await listedRevisions(vaultDB),
      })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      expect(await revisionsNow()).to.deep.equal({ read: 'rev-one', listed: ['rev-one'] })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 })
      expect(await revisionsNow()).to.deep.equal({ read: 'rev-two', listed: ['rev-two'] })
      await vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-two'))
      expect(await revisionsNow()).to.deep.equal({ read: null, listed: [] })
    })

    timingTestsOf('2.1')
  })

  describe(lineTitle('2.2'), () => {
    it("reads each of many lockboxes back by its boxlabel", async () => {
      const vaultDB = await withVaultProps()
      await storeEach(vaultDB, ManyBoxlabels)
      const revisions = await Promise.all(ManyBoxlabels.map((boxlabel) => revisionIn(vaultDB, boxlabel)))
      expect(revisions).to.deep.equal(ManyBoxlabels.map((boxlabel) => `rev-${boxlabel}`))
    })
  })

  describe(lineTitle('2.3'), () => {
    it("lists summaries sorted by boxlabel, with format and both ciphered fields stripped", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'two'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      const summaries = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaries.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'openai'])
      expect(summaries[0]).to.deep.equal({
        boxlabel:        'anthropic',
        revision_tok:    'rev-one',
        vault_key_epoch: 1,
        sidecar:         { note: 'a test box' },
        registered_at:   Date.UTC(2026, 9, 14),
        written_at:      Date.UTC(2026, 9, 14),
        damaged:         false,
      })
    })

    it("lists every lockbox, however many: never a page or a sample", async () => {
      const vaultDB = await withVaultProps()
      await storeEach(vaultDB, ManyBoxlabels)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(ManyBoxlabels.toSorted((one, two) => one.localeCompare(two)))
    })

    it("lists the same twice with nothing written between", async () => {
      const vaultDB = await withVaultProps()
      await storeEach(vaultDB, ['openai', 'anthropic', 'mistral'])
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.deep.equal(await vaultDB.listBoxes(scopeOf('u1')))
    })

    it("lists every lockbox as stored through listBoxRecords, for a server to serve: each record whole but for its two ciphered fields", async () => {
      const vaultDB = await withVaultProps()
      await storeEach(vaultDB, ['openai', 'anthropic'])
      await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u2'))
      await vaultDB.updateBox(scopeOf('u2'), boxOf('mistral', 'other'), { vault_id: 'vault-id-u2', revision_tok: null, vault_key_epoch: 1 })
      const records = await vaultDB.listBoxRecords(scopeOf('u1'))
      const listedOf = (boxlabel: string) => {
        const { lockbox_key_wrapped: _lockboxKeyWrapped, whisper_ciphered: _whisperCiphered, ...listed } = boxOf(boxlabel, boxlabel)
        return listed
      }
      expect(records).to.have.deep.members([listedOf('openai'), listedOf('anthropic')])
      expect(await vaultDB.listBoxRecords(scopeOf('u3'))).to.deep.equal([])
    })
  })
  // --

  // == [Creating and updating]: 3.1 created once, 3.2 vault props update, 3.3 lockbox write

  describe(lineTitle('3.1'), () => {
    it("yields to vault props already standing: the second device gets the first's back", async () => {
      const vaultDB = await withVaultProps()
      const latecomer = { ...vaultPropsOf('u1'), vault_id: 'the-second-arrival' }
      expect(await vaultDB.fetchOrCreateVaultProps(latecomer)).to.deep.equal(vaultPropsOf('u1'))
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
    })

    timingTestsOf('3.1')
  })

  describe(lineTitle('3.2'), () => {
    it("lands while the standing vault props are the ones proven against", async () => {
      const vaultDB = await withVaultProps()
      const next = { ...vaultPropsOf('u1'), unlock_epoch: 2 }
      await vaultDB.updateVaultProps(next, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(next)
    })

    it("refuses over an unlock_epoch since moved on, writing nothing", async () => {
      const vaultDB = await withVaultProps()
      const theirs = { ...vaultPropsOf('u1'), unlock_epoch: 2, wayins: [wayinOf('passphrase', { vault_key_wayin_wrapped: fakeCiphered('theirs') })] }
      await vaultDB.updateVaultProps(theirs, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
      const mine = { ...vaultPropsOf('u1'), unlock_epoch: 2, wayins: [wayinOf('passphrase', { vault_key_wayin_wrapped: fakeCiphered('mine') })] }
      await expectRefusal(vaultDB.updateVaultProps(mine, { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(theirs)
    })

    it("refuses over a vault made anew under another vault_id", async () => {
      const vaultDB = await withVaultProps()
      const next = { ...vaultPropsOf('u1'), vault_id: 'vault-id-gone', unlock_epoch: 2 }
      await expectRefusal(vaultDB.updateVaultProps(next, { vault_id: 'vault-id-gone', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
    })

    it("refuses where no vault props stand: an update never creates", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateVaultProps(vaultPropsOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.be.null
    })

    timingTestsOf('3.2')
  })

  describe(lineTitle('3.3'), () => {
    it("replaces a lockbox over the revision it read", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 })
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'two'))
    })

    it("refuses a write over a revision it never read, writing nothing", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      // A second device that saw no box, and one that saw some other revision, both lose.
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), noBoxYet), 'stale_write')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-other', vault_key_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(boxOf('anthropic', 'one'))
    })

    it("hands back the lockbox it wrote over the revision it read, and nothing from a write refused as stale", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      const landed = await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 })
      expect(landed).to.deep.equal(boxOf('anthropic', 'two'))
      // Refused, it rejects: there is no record to resolve, and none is carried on the refusal.
      const refusal = await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'three'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 }), 'stale_write')
      expect(quotedOf(refusal, landed)).to.deep.equal([])
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(landed)
    })

    it("refuses a write into a scope that holds no vault props", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses a box sealed for a vault since retired and made anew, though no box stands in either", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.retireVault(scopeOf('u1'), thisVault)
      await vaultDB.fetchOrCreateVaultProps({ ...vaultPropsOf('u1'), vault_id: 'vault-id-reborn' })
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'stale'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'fresh'), { vault_id: 'vault-id-reborn', revision_tok: null, vault_key_epoch: 1 })
      const reborn = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(reborn?.revision_tok).to.eq('rev-fresh')
    })

    it("refuses a write expecting another user's vault_id", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u2'))
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u2', revision_tok: null, vault_key_epoch: 1 }), 'stale_write')
    })

    timingTestsOf('3.3')
  })
  // --

  // == [Retiring]: 3.4 box retirement, 3.5 vault retirement

  describe(lineTitle('3.4'), () => {
    it("removes one box without touching its neighbours, saying it retired the revision named, and then that there is none", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'two'), noBoxYet)
      expect(await vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-one'))).to.deep.equal({ outcome: 'retired' })
      expect(await vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-one'))).to.deep.equal({ outcome: 'absent' })
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      expect(await vaultDB.readBox(scopeOf('u1'), 'openai')).to.not.be.null
    })

    it("removes a box written over the revision it names all the same, saying it retired another", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 })
      expect(await vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-one'))).to.deep.equal({ outcome: 'retired_other' })
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("removes a box holding a revision where it names none, saying it retired another", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      expect(await vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring(null))).to.deep.equal({ outcome: 'retired_other' })
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("says there is none for a box never written, whatever revision it names, and writes nothing", async () => {
      const vaultDB = await withVaultProps()
      expect(await vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring(null))).to.deep.equal({ outcome: 'absent' })
      expect(await vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-one'))).to.deep.equal({ outcome: 'absent' })
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("wins over a write: a write over a revision retired meanwhile refuses, and the box stays gone", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-one'))
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("refuses from a stale handle, even naming the revision that stands: a vault retired and made anew keeps its box", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.retireVault(scopeOf('u1'), thisVault)
      await vaultDB.fetchOrCreateVaultProps({ ...vaultPropsOf('u1'), vault_id: 'vault-id-reborn' })
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_tok: null, vault_key_epoch: 1 })
      await expectRefusal(vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-reborn')), 'stale_write')
      await expectRefusal(vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring(null)), 'stale_write')
      const kept = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(kept?.revision_tok).to.eq('rev-reborn')
    })

    it("refuses in a scope that holds no vault props, even with no box to retire", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring(null)), 'stale_write')
    })

    timingTestsOf('3.4')
  })

  describe(lineTitle('3.5'), () => {
    it("removes the vault props and every box of that scope, and nothing else", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u2'))
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await vaultDB.updateBox(scopeOf('u2'), boxOf('anthropic', 'two'), { vault_id: 'vault-id-u2', revision_tok: null, vault_key_epoch: 1 })
      await vaultDB.retireVault(scopeOf('u1'), thisVault)
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.be.null
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
      expect(await vaultDB.readVaultProps(scopeOf('u2'))).to.not.be.null
      expect(await vaultDB.readBox(scopeOf('u2'), 'anthropic')).to.not.be.null
    })

    it("refuses from a stale handle: a vault made anew survives, vault props and boxes", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.retireVault(scopeOf('u1'), thisVault)
      const reborn = { ...vaultPropsOf('u1'), vault_id: 'vault-id-reborn' }
      await vaultDB.fetchOrCreateVaultProps(reborn)
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'reborn'), { vault_id: 'vault-id-reborn', revision_tok: null, vault_key_epoch: 1 })
      await expectRefusal(vaultDB.retireVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(reborn)
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(1)
    })

    it("refuses where no vault props stand: there is no vault of that vault_id to retire", async () => {
      const vaultDB = await makeVaultDB()
      await expectRefusal(vaultDB.retireVault(scopeOf('u1'), thisVault), 'stale_write')
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.be.null
    })

    it("retireDamagedVault leaves a vault that stands sound as it is, and is quiet where none stands", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
      await expectRefusal(vaultDB.retireDamagedVault(scopeOf('u1')), 'bad_option')
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(1)
      await vaultDB.retireVault(scopeOf('u1'), thisVault)
      await vaultDB.retireDamagedVault(scopeOf('u1'))
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.be.null
    })
    timingTestsOf('3.5')
  })
  // --

  // == [Refused and independent writes]: 3.6 refused wrote nothing, 3.7 independent writes, 3.8 vaultKey

  describe(lineTitle('3.6'), () => {
    it("leaves the whole vault as it stood after each refusal: vault props, boxes and listing", async () => {
      const vaultDB = await withVaultProps()
      await storeEach(vaultDB, ['anthropic', 'openai'])
      const before = await standingVault(vaultDB, ['anthropic', 'openai', 'mistral'])
      const refusals = [
        [() => vaultDB.updateVaultProps(vaultPropsOf('u1', { unlock_epoch: 3 }), { vault_id: 'vault-id-u1', unlock_epoch: 2 }),         'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'late'), { vault_id: 'vault-id-u1', revision_tok: 'rev-other', vault_key_epoch: 1 }),     'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('mistral', 'late'), { vault_id: 'vault-id-gone', revision_tok: null, vault_key_epoch: 1 }),            'stale_write'],
        [() => vaultDB.updateBox(scopeOf('u1'), boxOf('mistral', 'late', { sidecar_json: '{"note":' }), noBoxYet),                      'bad_record'],
        [() => vaultDB.retireBox(scopeOf('u1'), 'anthropic', { vault_id: 'vault-id-gone', revision_tok: 'rev-anthropic' }),               'stale_write'],
        [() => vaultDB.retireVault(scopeOf('u1'), { vault_id: 'vault-id-gone' }),                                                         'stale_write'],
      ] as const
      for (const [refuse, kind] of refusals) {
        await expectRefusal(refuse(), kind)
        expect(await standingVault(vaultDB, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
      }
    })
  })

  describe(lineTitle('3.7'), () => {
    timingTestsOf('3.7')
  })

  /** A fresh adapter whose u1 vault held `anthropic` under vaultKey epoch 1, its vault props since moved to epoch 2. */
  const epochMovedHolding = async () => {
    const vaultDB = await withVaultProps()
    await storeEach(vaultDB, ['anthropic'])
    await vaultDB.updateVaultProps(vaultPropsAtEpochOf('u1', 2), { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    return vaultDB
  }

  describe(lineTitle('3.8'), () => {
    const underFirstKey = { vault_id: 'vault-id-u1', revision_tok: 'rev-anthropic', vault_key_epoch: 1 } as const
    const underSecondKey = { ...underFirstKey, vault_key_epoch: 2 } as const

    it("refuses a write sealed under another vaultKey epoch than the vault props', over the revision it read, writing nothing", async () => {
      const vaultDB = await epochMovedHolding()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'stale'), underFirstKey), 'stale_write')
      expect(await revisionIn(vaultDB, 'anthropic')).to.eq('rev-anthropic')
    })

    it("refuses a new lockbox sealed under another vaultKey epoch than the vault props', though none stands under its boxlabel", async () => {
      const vaultDB = await epochMovedHolding()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'stale'), noBoxYet), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'openai')).to.be.null
    })

    it("refuses a write sealed under a vaultKey epoch the vault props do not stand for", async () => {
      const vaultDB = await withVaultProps()
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'ahead', { vault_key_epoch: 2 }), { ...noBoxYet, vault_key_epoch: 2 }), 'stale_write')
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.be.null
    })

    it("lands a write sealed under the vault props' vaultKey epoch, over a lockbox sealed under another", async () => {
      const vaultDB = await epochMovedHolding()
      const resealed = boxOf('anthropic', 'resealed', { vault_key_epoch: 2 })
      await vaultDB.updateBox(scopeOf('u1'), resealed, underSecondKey)
      expect(await vaultDB.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(resealed)
      const [listed] = await vaultDB.listBoxes(scopeOf('u1'))
      expect(summaryOf(listed)?.vault_key_epoch).to.eq(2)
    })
  })
  // --

  // == [Lockbox limits]: 4.1 declared, 4.2 refused, 4.3 replacement, 4.4 under, 4.5 nothing lost

  describe(lineTitle('4.1'), () => {
    it("declares a whole number of lockboxes above zero, or Infinity", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxLockboxes === Infinity || (Number.isSafeInteger(vaultDB.maxLockboxes) && vaultDB.maxLockboxes > 0)).to.be.true
    })
  })

  describe.runIf(capped)(lineTitle('4.2'), () => {
    it("refuses a new lockbox in a full vault as vault_full, writing nothing", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const before = await standingVault(vaultDB, ['anthropic', 'openai', 'mistral', 'gemini'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet), 'vault_full')
      expect(await standingVault(vaultDB, ['anthropic', 'openai', 'mistral', 'gemini'])).to.deep.equal(before)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'mistral', 'openai'])
    })

    it("never lets writes made one after another past the limit", async () => {
      const vaultDB = await cappedHolding([])
      const write = (boxlabel: string) => settledKind(vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet))
      const outcomes = [await write('anthropic'), await write('openai'), await write('mistral'), await write('gemini'), await write('cohere')]
      expect(outcomes).to.deep.equal(['landed', 'landed', 'landed', 'vault_full', 'vault_full'])
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(CappedLockboxes)
    })
  })

  describe.runIf(capped)(lineTitle('4.3'), () => {
    it("replaces a lockbox in a full vault", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'next'), { vault_id: 'vault-id-u1', revision_tok: 'rev-openai', vault_key_epoch: 1 })
      const replaced = await vaultDB.readBox(scopeOf('u1'), 'openai')
      expect(replaced?.revision_tok).to.eq('rev-next')
    })

    it("refuses a first write under a boxlabel already taken in a full vault as stale_write, not vault_full", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('openai', 'mine'), noBoxYet), 'stale_write')
      const standing = await vaultDB.readBox(scopeOf('u1'), 'openai')
      expect(standing?.revision_tok).to.eq('rev-openai')
    })
  })

  describe.runIf(capped)(lineTitle('4.4'), () => {
    it("lands a new lockbox once retiring one has made room", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet), 'vault_full')
      await vaultDB.retireBox(scopeOf('u1'), 'openai', retiring('rev-openai'))
      await vaultDB.updateBox(scopeOf('u1'), boxOf('gemini', 'gemini'), noBoxYet)
      const listed = await vaultDB.listBoxes(scopeOf('u1'))
      expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthropic', 'gemini', 'mistral'])
    })
  })

  describe(lineTitle('4.5'), () => {
    timingTestsOf('4.5')
  })
  // --

  // == [Refusals and access]: 5.1 VaultError kinds, 5.3 quotes nothing, 5.4 signed-in user

  describe(lineTitle('5.1'), () => {
    it("refuses a scope or boxlabel below the floor every name is held to as bad_label, and a lockbox holding one as bad_record, before storage sees it", async () => {
      const vaultDB = await withVaultProps()
      await expectRefusal(vaultDB.readVaultProps({ ...scopeOf('u1'), vaultlabel: '' }), 'bad_label')
      await expectRefusal(vaultDB.readBox(scopeOf('u1'), 'tab\there'), 'bad_label')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('cafe\u{301}', 'one'), noBoxYet), 'bad_record')
      await expectRefusal(vaultDB.retireBox({ ...scopeOf('u1'), user_id: 'u1\u{D800}' }, 'anthropic', retiring(null)), 'bad_label')
      const overlong = 'u'.repeat(NameFloorBytes + 1)
      await expectRefusal(vaultDB.listBoxes(scopeOf(overlong)), 'bad_label')
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("refuses a name holding ^, which key-value stores join names on, in every place a name goes, whatever the store, writing nothing: as bad_label, and in a record as bad_record", async () => {
      const vaultDB = await withVaultProps()
      const holding = 'a^b'
      await expectRefusal(vaultDB.fetchOrCreateVaultProps(vaultPropsOf(holding)), 'bad_record')
      await expectRefusal(vaultDB.readVaultProps({ ...scopeOf('u1'), applabel: holding }), 'bad_label')
      await expectRefusal(vaultDB.listBoxes({ ...scopeOf('u1'), vaultlabel: holding }), 'bad_label')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf(holding, 'one'), noBoxYet), 'bad_record')
      await expectRefusal(vaultDB.readBox(scopeOf('u1'), holding), 'bad_label')
      await expectRefusal(vaultDB.retireBox(scopeOf('u1'), holding, retiring(null)), 'bad_label')
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })

    it("takes any name above the floor, whatever a vault's validators would say: they are the vault's, at its entry", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('Not a Label!', 'one'), noBoxYet)
      const lockbox = await vaultDB.readBox(scopeOf('u1'), 'Not a Label!')
      expect(lockbox?.revision_tok).to.eq('rev-one')
    })

    it("refuses a malformed record or expectation, vault props under another vault_id, or a lockbox under another vault_key_epoch, as bad_record, before storage sees it", async () => {
      const vaultDB = await withVaultProps()
      await vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'kept'), noBoxYet)
      const unparsable = boxOf('anthropic', 'one', { sidecar_json: 'not json' })
      await expectRefusal(vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u1', { unlock_epoch: 0 })), 'bad_record')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), unparsable, noBoxYet), 'bad_record')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_tok: '', vault_key_epoch: 1 }), 'bad_record')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'one', { vault_key_epoch: 2 }), noBoxYet), 'bad_record')
      await expectRefusal(vaultDB.updateVaultProps(vaultPropsOf('u1', { unlock_epoch: 0 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'bad_record')
      await expectRefusal(vaultDB.updateVaultProps(vaultPropsOf('u1', { vault_id: 'vault-id-new', unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'bad_record')
      await expectRefusal(vaultDB.retireBox(scopeOf('u1'), 'anthropic', retiring('')), 'bad_record')
      await expectRefusal(vaultDB.retireBox(scopeOf('u1'), 'anthropic', { vault_id: 'vault-id-u1' } as LockboxRetireExpectation), 'bad_record')
      await expectRefusal(vaultDB.retireVault(scopeOf('u1'), { vault_id: '' }), 'bad_record')
      expect(await vaultDB.readVaultProps(scopeOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(1)
      const kept = await vaultDB.readBox(scopeOf('u1'), 'anthropic')
      expect(kept?.revision_tok).to.eq('rev-kept')
    })
  })

  describe(lineTitle('5.3'), () => {
    it("quotes no ciphertext, boxlabel or sidecar of a write it refuses as stale", async () => {
      const vaultDB = await withVaultProps()
      const lockbox = boxOf('secret_project_x', 'sk-fake-quoted', { sidecar_json: sidecarJsonOf({ note: 'a sidecar never to be quoted' }) })
      const refusal = await expectRefusal(vaultDB.updateBox(scopeOf('u1'), lockbox, { vault_id: 'vault-id-gone', revision_tok: null, vault_key_epoch: 1 }), 'stale_write')
      expect(quotedOf(refusal, lockbox)).to.deep.equal([])
    })

    it.runIf(capped)("quotes no ciphertext, boxlabel or sidecar of a lockbox it refuses as vault_full", async () => {
      const vaultDB = await cappedHolding(['anthropic', 'openai', 'mistral'])
      const lockbox = boxOf('secret_project_x', 'sk-fake-quoted', { sidecar_json: sidecarJsonOf({ note: 'a sidecar never to be quoted' }) })
      const refusal = await expectRefusal(vaultDB.updateBox(scopeOf('u1'), lockbox, noBoxYet), 'vault_full')
      expect(quotedOf(refusal, lockbox)).to.deep.equal([])
    })
  })

  describe.runIf(signsIn)(lineTitle('5.4'), () => {
    it("refuses another user every verb on a vault as identity_revoked, reading and writing nothing", async () => {
      const { owner, vaultDBFor } = await servedHolding()
      const before = await standingVault(owner, ['anthropic', 'openai', 'mistral'])
      const attempts = everyVerbOn(vaultDBFor('u2'))
      for (const attempt of attempts) { await expectRefusal(attempt(), 'identity_revoked') }
      expect(await standingVault(owner, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
    })

    it("refuses every verb while no one is signed in as identity_revoked, reading and writing nothing", async () => {
      const { owner, vaultDBFor } = await servedHolding()
      const before = await standingVault(owner, ['anthropic', 'openai', 'mistral'])
      const attempts = everyVerbOn(vaultDBFor(null))
      for (const attempt of attempts) { await expectRefusal(attempt(), 'identity_revoked') }
      expect(await standingVault(owner, ['anthropic', 'openai', 'mistral'])).to.deep.equal(before)
    })
  })
  // --

  // == [Subscribe and size limits]: 6.1 subscribe, 7.1 record, 7.2 vault, 7.3 name

  describe(lineTitle('6.1'), () => {
    it("hands back an unsubscribe that can be called", async () => {
      const vaultDB = await makeVaultDB()
      const unsubscribe = vaultDB.subscribe(scopeOf('u1'), unheard)
      expect(unsubscribe).to.be.a('function')
      unsubscribe()
    })

    timingTestsOf('6.1')
  })

  describe(lineTitle('7.1'), () => {
    it("declares the most it holds in one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxRecordBytes).to.be.greaterThan(0)
    })
  })

  describe(lineTitle('7.2'), () => {
    it("declares the most it holds of one vault, no less than one record", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxVaultBytes).to.be.a('number')
      expect(vaultDB.maxVaultBytes).to.be.at.least(vaultDB.maxRecordBytes)
    })
  })

  describe(lineTitle('7.3'), () => {
    it("declares the most bytes it holds in one name: a whole number above zero, or Infinity", async () => {
      const vaultDB = await makeVaultDB()
      expect(vaultDB.maxNameBytes === Infinity || (Number.isSafeInteger(vaultDB.maxNameBytes) && vaultDB.maxNameBytes > 0)).to.be.true
    })

    it("holds a name of every length it declares, up to the floor's, in every place a name goes", async () => {
      const vaultDB = await makeVaultDB()
      const longest = 'n'.repeat(Math.min(vaultDB.maxNameBytes, NameFloorBytes))
      const scope = { applabel: longest, user_id: longest, vaultlabel: longest }
      await vaultDB.fetchOrCreateVaultProps({ ...vaultPropsOf(longest), ...scope })
      await vaultDB.updateBox(scope, boxOf(longest, 'one'), { vault_id: `vault-id-${longest}`, revision_tok: null, vault_key_epoch: 1 })
      const lockbox = await vaultDB.readBox(scope, longest)
      expect(lockbox?.revision_tok).to.eq('rev-one')
    })

    it("refuses a name one byte longer than it holds as bad_label, in every place a name goes, writing nothing", async () => {
      const vaultDB = await withVaultProps()
      if (vaultDB.maxNameBytes >= NameFloorBytes) { return }
      const overlong = 'n'.repeat(vaultDB.maxNameBytes + 1)
      await expectRefusal(vaultDB.fetchOrCreateVaultProps(vaultPropsOf(overlong)), 'bad_label')
      await expectRefusal(vaultDB.readVaultProps({ ...scopeOf('u1'), applabel: overlong }), 'bad_label')
      await expectRefusal(vaultDB.readVaultProps({ ...scopeOf('u1'), vaultlabel: overlong }), 'bad_label')
      await expectRefusal(vaultDB.updateBox(scopeOf('u1'), boxOf(overlong, 'one'), noBoxYet), 'bad_label')
      expect(await vaultDB.listBoxes(scopeOf('u1'))).to.have.lengthOf(0)
    })
  })
  // --
}

/** The longest a race or push test may take: a race runs a score of schedules, each over a fresh backend. */
const TimingTestMillis = 60_000

/** One of {@link vaultDBTimingChecks}: the contract line it proves, its title, whether its adapter can run it, and the check, which rejects when it fails. */
export type VaultDBTimingCheck = { line: VaultDBContractLine, title: string, runs: boolean, check: () => Promise<void> }

/**
 * The tests of {@link describeVaultDB} that are about when -- the races between devices, what one
 * device sees of another's writes, and what subscribe hears -- each runnable on its own, so a test
 * can show that one fails against an adapter that breaks it. `describeVaultDB` runs each in its
 * line's group, where `runs`. Each race runs under every schedule of {@link raceEveryWay}, its
 * devices from `makeDevices`, or else every move through one adapter from `makeVaultDB` (or
 * `makeCappedVaultDB`, for the limit's).
 *
 * Two limits of what they prove. `pushFromTheStart` holds a watch's start at the turnstile only
 * where that start is a round trip through it; a watch that starts as `subscribe` returns, or
 * whose start `makeDevices` leaves unwired (a Convex client's `watchQuery` is not a promise, so
 * cannot pass it), is live at once, and the check then shows what the other push checks do. And a
 * push check credits a call to a write by when it ran, not by what caused it: a late call from an
 * earlier write that reads the vault after a later one landed is credited to the later.
 *
 * @param makeAdapter - A fresh, empty adapter, as `describeVaultDB` takes it.
 * @param opts - `describeVaultDB`'s options.
 * @returns Each check, by a handle naming what it races or watches.
 *
 * @example await TH.vaultDBTimingChecks(() => new MyVaultDB(), { makeDevices }).rivalFirstWrites.check()
 */
export const vaultDBTimingChecks = (makeAdapter: MakeVaultDB, opts: DescribeVaultDBOpts = {}) => {
  // == [Timing setup]: makeVaultDB, devicesFor, cappedAdapter, twoDevices, sameAdapterTwice

  const { makeCappedVaultDB, makeDevices, pushes = false } = opts
  /** A fresh adapter, made with `vaultDBOpts`, or with none. */
  const makeVaultDB = (vaultDBOpts: VaultDBOpts = {}) => makeAdapter(vaultDBOpts)
  const capped = makeCappedVaultDB !== undefined
  const devices = makeDevices !== undefined
  // Titles say what the moves come from, so a race through one adapter claims no more than it proves.
  const fromTwo = devices ? 'from two devices' : 'through one adapter'
  const fromEach = devices ? 'each from its own device' : 'all through one adapter'

  /** Devices over one fresh backend for a race, held to `maxLockboxes` if given: from `makeDevices`, or else one adapter for every move. */
  const devicesFor = (maxLockboxes?: number) => async (turnstile: Turnstile): Promise<() => VaultDBVerbs> => {
    if (makeDevices) {
      const deviceFor = await makeDevices(turnstile)
      return () => deviceFor({ maxLockboxes })
    }
    const shared = await (maxLockboxes === undefined ? makeVaultDB() : cappedAdapter(maxLockboxes))
    return () => shared
  }
  const cappedAdapter = async (maxLockboxes: number) => {
    if (! makeCappedVaultDB) { throw new Error('vaultDBTimingChecks ran a lockbox limit check with no makeCappedVaultDB.') }
    return await makeCappedVaultDB(maxLockboxes)
  }
  /** Two devices over one fresh backend, through `turnstile` (by default one never held): for a check that is no race. */
  const twoDevices = async (turnstile: Turnstile = openTurnstile): Promise<[VaultDBVerbs, VaultDBVerbs]> => {
    if (! makeDevices) { throw new Error('vaultDBTimingChecks ran a check across devices with no makeDevices.') }
    const deviceFor = await makeDevices(turnstile)
    return [deviceFor({}), deviceFor({})]
  }
  /** A watcher and a writer over one fresh backend: one adapter as both. */
  const sameAdapterTwice = async (): Promise<[VaultDBVerbs, VaultDBVerbs]> => {
    const vaultDB = await makeVaultDB()
    return [vaultDB, vaultDB]
  }
  // --
  return {
    // == [Cross-device and creation races]: seenAcrossDevices, rivalCreates, rivalVaultPropsUpdates, rivalFirstWrites, rivalReplacements

    seenAcrossDevices: {
      line:  '2.1',
      title: "shows a write made on one device to the very next read and listing on another, and a retirement likewise",
      runs:  devices,
      check: async () => {
        const [one, two] = await twoDevices()
        expect(one, 'makeDevices made one adapter for both devices').to.not.eq(two)
        await one.fetchOrCreateVaultProps(vaultPropsOf('u1'))
        expect(await two.readVaultProps(scopeOf('u1'))).to.deep.equal(vaultPropsOf('u1'))
        await one.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)
        expect({ read: await revisionIn(two, 'anthropic'), listed: await listedRevisions(two) }).to.deep.equal({ read: 'rev-one', listed: ['rev-one'] })
        await two.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-one'))
        expect({ read: await revisionIn(one, 'anthropic'), listed: await listedRevisions(one) }).to.deep.equal({ read: null, listed: [] })
        await two.retireVault(scopeOf('u1'), thisVault)
        expect(await one.readVaultProps(scopeOf('u1'))).to.be.null
      },
    },
    rivalCreates: {
      line:  '3.1',
      title: `settles two creates of one vault made at once ${fromTwo} on one vault record, which both get back, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          moves:       [(one) => one.fetchOrCreateVaultProps(vaultPropsOf('u1', { vault_id: 'vault-id-one' })), (two) => two.fetchOrCreateVaultProps(vaultPropsOf('u1', { vault_id: 'vault-id-two' }))],
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            const [first, second] = outcomes
            expect(first?.val).to.deep.equal(second?.val)
            for (const racer of racers) { expect(await racer.readVaultProps(scopeOf('u1'))).to.deep.equal(first?.val) }
          },
        })
      },
    },
    rivalVaultPropsUpdates: {
      line:  '3.2',
      title: `lands one of two updates of one vault record made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [vaultPropsOf('u1', { unlock_epoch: 2, wayins: [wayinOf('one')] }), vaultPropsOf('u1', { unlock_epoch: 2, wayins: [wayinOf('two')] })]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultPropsFirst,
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.updateVaultProps(rival, { vault_id: 'vault-id-u1', unlock_epoch: 1 })),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            for (const racer of racers) { expect(await racer.readVaultProps(scopeOf('u1'))).to.deep.equal(winner) }
          },
        })
      },
    },
    rivalFirstWrites: {
      line:  '3.3',
      title: `lands one of two first writes of a lockbox made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [boxOf('anthropic', 'one'), boxOf('anthropic', 'two')]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultPropsFirst,
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.updateBox(scopeOf('u1'), rival, noBoxYet)),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            for (const racer of racers) { expect(await racer.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(winner) }
          },
        })
      },
    },
    rivalReplacements: {
      line:  '3.3',
      title: `lands one of two replacements of one revision made at once ${fromTwo}, and refuses the other as stale_write, however they interleave`,
      runs:  true,
      check: async () => {
        const rivals = [boxOf('anthropic', 'one'), boxOf('anthropic', 'two')]
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic']),
          moves:       rivals.map((rival) => (racer: VaultDBVerbs) => racer.updateBox(scopeOf('u1'), rival, over('rev-anthropic'))),
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'stale_write'])
            const winner = rivals[outcomes.findIndex((outcome) => outcome.kind === 'landed')]
            for (const racer of racers) { expect(await racer.readBox(scopeOf('u1'), 'anthropic')).to.deep.equal(winner) }
          },
        })
      },
    },
    // --
    // == [Retirement and disjoint-write races]: retireBeatsReplacement, vaultRetireBeatsWrite, apartNewLockboxes, apartReplaceAndRetire

    retireBeatsReplacement: {
      line:  '3.4',
      title: `lands a retirement made at once ${fromTwo} with a replacement of its lockbox, which is gone afterwards, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic']),
          moves:       [(one) => one.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-anthropic')), (two) => two.updateBox(scopeOf('u1'), boxOf('anthropic', 'next'), over('rev-anthropic'))],
          verdict:     async ([erased, written], racers) => {
            expect(erased?.kind).to.eq('landed')
            expect(['landed', 'stale_write']).to.include(written?.kind)
            // A replacement that landed went first, so the retirement removed it, and says so.
            expect(erased?.val).to.deep.equal({ outcome: written?.kind === 'landed' ? 'retired_other' : 'retired' })
            for (const racer of racers) { expect(await racer.readBox(scopeOf('u1'), 'anthropic')).to.be.null }
          },
        })
      },
    },
    vaultRetireBeatsWrite: {
      line:  '3.5',
      title: `leaves no lockbox behind a vault retired while a lockbox was written into it ${fromTwo}, however they interleave`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultPropsFirst,
          moves:       [(one) => one.retireVault(scopeOf('u1'), thisVault), (two) => two.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)],
          verdict:     async ([erased, written], racers) => {
            expect(erased?.kind).to.eq('landed')
            expect(['landed', 'stale_write']).to.include(written?.kind)
            for (const racer of racers) { expect(await standingVault(racer, ['anthropic'])).to.deep.equal({ vaultProps: null, listed: [], lockboxes: [null] }) }
          },
        })
      },
    },
    apartNewLockboxes: {
      line:  '3.7',
      title: `lands two new lockboxes written into one vault at once ${fromTwo}, however they interleave, neither waiting on the other`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       withVaultPropsFirst,
          moves:       [(one) => one.updateBox(scopeOf('u1'), boxOf('anthropic', 'anthropic'), noBoxYet), (two) => two.updateBox(scopeOf('u1'), boxOf('openai', 'openai'), noBoxYet)],
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            for (const racer of racers) { expect(await listedRevisions(racer)).to.deep.equal(['rev-anthropic', 'rev-openai']) }
          },
        })
      },
    },
    apartReplaceAndRetire: {
      line:  '3.7',
      title: `lands a replacement of one lockbox and a retirement of another made at once ${fromTwo}, however they interleave, neither waiting on the other`,
      runs:  true,
      check: async () => {
        await raceEveryWay({
          makeDevices: devicesFor(),
          setup:       holdingFirst(['anthropic', 'openai']),
          moves:       [(one) => one.updateBox(scopeOf('u1'), boxOf('anthropic', 'next'), over('rev-anthropic')), (two) => two.retireBox(scopeOf('u1'), 'openai', retiring('rev-openai'))],
          verdict:     async (outcomes, racers) => {
            expect(kindsOf(outcomes)).to.deep.equal(['landed', 'landed'])
            for (const racer of racers) {
              const listed = await racer.listBoxes(scopeOf('u1'))
              expect(listed.map((box) => [box.boxlabel, summaryOf(box)?.revision_tok])).to.deep.equal([['anthropic', 'rev-next']])
            }
          },
        })
      },
    },
    // --
    // == [Lockbox limit races]: crowdForLastPlace, pastLimitFromRoomierDevice

    crowdForLastPlace: {
      line:  '4.5',
      title: `keeps every lockbox that landed when four writers race for the last place, ${fromEach}, and leaves nothing of those refused, however they interleave`,
      runs:  capped,
      check: async () => {
        const racers = ['mistral', 'gemini', 'cohere', 'groq']
        await raceEveryWay({
          makeDevices: devicesFor(CappedLockboxes),
          setup:       holdingFirst(['anthropic', 'openai']),
          moves:       racers.map((boxlabel) => (racer: VaultDBVerbs) => racer.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet)),
          verdict:     async (outcomes, [first]) => {
            if (! first) { throw new Error('A crowd race had no devices.') }
            // However many found room -- one, where the adapter checks strictly; more, where its
            // count and its insert are apart -- each landed or was refused as full, and one landed.
            expect(outcomes.every((outcome) => outcome.kind === 'landed' || outcome.kind === 'vault_full')).to.be.true
            const landed = racers.filter((_boxlabel, ii) => outcomes[ii]?.kind === 'landed')
            expect(landed).to.not.have.lengthOf(0)
            const found = await Promise.all(racers.map((boxlabel) => revisionIn(first, boxlabel)))
            expect(found).to.deep.equal(racers.map((boxlabel, ii) => (outcomes[ii]?.kind === 'landed' ? `rev-${boxlabel}` : null)))
            // Back under the limit, keeping one racer that landed: the listing is whole again.
            const [kept, ...others] = landed
            for (const boxlabel of ['anthropic', 'openai', ...others]) { await first.retireBox(scopeOf('u1'), boxlabel, retiring(`rev-${boxlabel}`)) }
            const listed = await first.listBoxes(scopeOf('u1'))
            expect(listed.map((box) => box.boxlabel)).to.deep.equal([kept])
          },
        })
      },
    },
    pastLimitFromRoomierDevice: {
      line:  '4.5',
      title: "keeps every lockbox of a vault past its limit -- filled by a device allowed more -- readable, refuses a new one as full, replaces one, and lists it whole once retirements bring it back under",
      runs:  capped && devices,
      check: async () => {
        if (! makeDevices) { throw new Error('vaultDBTimingChecks ran a check across devices with no makeDevices.') }
        const deviceFor = await makeDevices(openTurnstile)
        const tight = deviceFor({ maxLockboxes: CappedLockboxes })
        const roomy = deviceFor({ maxLockboxes: CappedLockboxes + 2 })
        expect(tight.maxLockboxes, 'makeDevices made a device not held to the maxLockboxes it was asked for').to.eq(CappedLockboxes)
        const held = ['anthropic', 'openai', 'mistral', 'gemini', 'cohere']
        await roomy.fetchOrCreateVaultProps(vaultPropsOf('u1'))
        await storeEach(roomy, held)
        expect(await Promise.all(held.map((boxlabel) => revisionIn(tight, boxlabel)))).to.deep.equal(held.map((boxlabel) => `rev-${boxlabel}`))
        await expectWholeOrRefused(tight, held)
        const before = await standingVault(tight, [...held, 'groq'])
        await expectRefusal(tight.updateBox(scopeOf('u1'), boxOf('groq', 'groq'), noBoxYet), 'vault_full')
        expect(await standingVault(tight, [...held, 'groq'])).to.deep.equal(before)
        await tight.updateBox(scopeOf('u1'), boxOf('openai', 'next'), over('rev-openai'))
        for (const boxlabel of ['anthropic', 'mistral', 'gemini']) { await tight.retireBox(scopeOf('u1'), boxlabel, retiring(`rev-${boxlabel}`)) }
        await tight.updateBox(scopeOf('u1'), boxOf('groq', 'groq'), noBoxYet)
        expect(await listedRevisions(tight)).to.deep.equal(['rev-cohere', 'rev-groq', 'rev-next'])
      },
    },
    // --
    // == [Push checks]: pushEachWrite, pushFromAnotherDevice, pushFromTheStart, pushPastAFailingListener, pushEndsOnUnsubscribe

    pushEachWrite: {
      line:  '6.1',
      title: "calls onChange after each kind of write to the vault, a read on each call seeing the write, once its watch is live",
      runs:  pushes,
      check: () => expectEachWriteHeard(sameAdapterTwice),
    },
    pushFromAnotherDevice: {
      line:  '6.1',
      title: "calls onChange after each kind of write made on another device, a read on each call seeing the write, once its watch is live",
      runs:  pushes && devices,
      check: () => expectEachWriteHeard(twoDevices),
    },
    pushFromTheStart: {
      line:  '6.1',
      title: `hears a write made ${devices ? 'on another device ' : ''}while its watch is still starting, a watch that starts late calling once it is live`,
      runs:  pushes,
      check: async () => {
        const keeper = makeTurnstile()
        const [watcher, writer] = await (devices ? twoDevices(keeper.turnstile) : sameAdapterTwice())
        await writer.fetchOrCreateVaultProps(vaultPropsOf('u1'))
        // A watch whose start is a round trip is held there while the write lands; one that starts
        // as subscribe returns, or not through the turnstile, never comes to the gate.
        const gate = keeper.holdAt(1)
        const watch = readingWatch(watcher)
        await Promise.race([gate.reached, ticks(WatchStartTicks)])
        keeper.holdNone()
        await expectHeard(watch, writer, () => writer.updateBox(scopeOf('u1'), boxOf('anthropic', 'anthropic'), noBoxYet), gate.release)
        watch.unsubscribe()
      },
    },
    pushPastAFailingListener: {
      line:  '6.1',
      title: "lands each write and calls every other listener when one listener throws and another rejects, logging each failure as an error",
      runs:  pushes,
      check: async () => {
        const spy = spyLogger()
        const vaultDB = await makeVaultDB({ logger: spy.logger })
        await vaultDB.fetchOrCreateVaultProps(vaultPropsOf('u1'))
        const thrown = new Error('a listener that throws')
        const rejected = new Error('a listener whose promise rejects')
        const unsubscribes = [
          vaultDB.subscribe(scopeOf('u1'), () => { throw thrown }),
          // A host's listener may be async, though subscribe types it as returning nothing.
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          vaultDB.subscribe(scopeOf('u1'), () => Promise.reject(rejected)),
        ]
        const watch = readingWatch(vaultDB)
        await untilLive([watch], vaultDB)
        await expectHeard(watch, vaultDB, () => vaultDB.updateBox(scopeOf('u1'), boxOf('anthropic', 'anthropic'), noBoxYet))
        const failures = () => spy.calls.filter((call) => call.err === thrown || call.err === rejected)
        await vi.waitFor(() => {
          expect(failures().map((call) => call.err), 'a listener failure the logger never heard').to.include.members([thrown, rejected])
        }, { timeout: HeardWithinMillis, interval: 5 })
        for (const call of failures()) {
          expect(call.level).to.eq('error')
          expect(call.story).to.deep.equal({ call: 'subscribe' })
        }
        for (const unsubscribe of [...unsubscribes, watch.unsubscribe]) { unsubscribe() }
      },
    },
    pushEndsOnUnsubscribe: {
      line:  '6.1',
      title: "calls an unsubscribed onChange no more, through several writes, however often it unsubscribes, while another watch hears each",
      runs:  pushes,
      check: async () => {
        const [watcher, writer] = await (devices ? twoDevices() : sameAdapterTwice())
        await writer.fetchOrCreateVaultProps(vaultPropsOf('u1'))
        const gone = readingWatch(watcher)
        const stays = readingWatch(watcher)
        await untilLive([gone, stays], writer)
        gone.unsubscribe()
        gone.unsubscribe()
        const goneCalls = gone.tally.calls
        for (const boxlabel of ['anthropic', 'openai', 'mistral']) {
          await expectHeard(stays, writer, () => writer.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet))
        }
        await wakeupAtNextTick()
        expect(gone.tally.calls, 'an unsubscribed onChange was called').to.eq(goneCalls)
        stays.unsubscribe()
      },
    },
    // --
  } satisfies Record<string, VaultDBTimingCheck>
}

// == [Turnstile check]: expectRoundTripsThroughTurnstile

/**
 * That a device from `makeDevices` passes the turnstile it was made with before each of its writes
 * goes to the backend -- a create, an update of the vault props, a write of a lockbox, a retirement
 * of one and of the vault -- so the races of {@link describeVaultDB} can hold it there. A race
 * cannot tell a turnstile left unwired from an adapter that makes no round trips; an adapter over a
 * backend reached by round trips calls this in its own tests to show its factory wires one. It
 * counts at least one pass for each write, so a write that makes a second round trip around the
 * turnstile goes unseen here, and unheld in the races.
 *
 * @param makeDevices - The adapter's makeDevices, as `describeVaultDB` takes it.
 *
 * @example it("sends each device's statements through the turnstile", () => TH.expectRoundTripsThroughTurnstile(makeDevices))
 */
export const expectRoundTripsThroughTurnstile = async (makeDevices: MakeVaultDBDevices): Promise<void> => {
  const tally = { passes: 0 }
  const counting: Turnstile = { pass: () => { tally.passes += 1; return Promise.resolve() } }
  const device = (await makeDevices(counting))({})
  const writes = [
    ['fetchOrCreateVaultProps', () => device.fetchOrCreateVaultProps(vaultPropsOf('u1'))],
    ['updateVaultProps',        () => device.updateVaultProps(vaultPropsOf('u1', { unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 })],
    ['updateBox',               () => device.updateBox(scopeOf('u1'), boxOf('anthropic', 'one'), noBoxYet)],
    ['retireBox',               () => device.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-one'))],
    ['retireVault',             () => device.retireVault(scopeOf('u1'), thisVault)],
  ] as const
  for (const [verb, write] of writes) {
    const before = tally.passes
    await write()
    expect(tally.passes - before, `${verb} reached the backend without passing the turnstile: makeDevices gives its devices a client that does not go through it`).to.be.greaterThan(0)
  }
}
// --

// == [Race helpers]: expectToHold, withVaultPropsFirst, holdingFirst, kindsOf, expectWholeOrRefused, glimpseOf

/** A timing check run as a test: it rejects, failing the test, when what it checks does not hold. */
const expectToHold = (check: VaultDBTimingCheck): Promise<void> => check.check()

/** A race's setup: u1's vault made, through the first device. */
const withVaultPropsFirst = (first: VaultDBVerbs) => first.fetchOrCreateVaultProps(vaultPropsOf('u1'))

/** A race's setup: u1's vault made, holding a new lockbox under each of `boxlabels`, through the first device. */
const holdingFirst = (boxlabels: readonly string[]) => async (first: VaultDBVerbs) => {
  await first.fetchOrCreateVaultProps(vaultPropsOf('u1'))
  await storeEach(first, boxlabels)
}

/** What a replacement in u1's vault expects: that vault, and the revision it read. */
const over = (revisionTok: string) => ({ vault_id: 'vault-id-u1', revision_tok: revisionTok, vault_key_epoch: 1 })

/** The kinds of `outcomes`, sorted, so a test of who won need not say which device it was. */
const kindsOf = (outcomes: readonly RaceOutcome[]): string[] => outcomes.map((outcome) => outcome.kind).toSorted((one, two) => one.localeCompare(two))

/** That `vaultDB` lists every one of `boxlabels` in u1's vault, or refuses the listing outright: never part of it (2.3). */
const expectWholeOrRefused = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => {
  const listing = await outcomeOf(vaultDB.listBoxes(scopeOf('u1')))
  if (listing.kind === 'landed') {
    const listed = listing.val as (LockboxSummary | DamagedLockbox)[]
    expect(listed.map((box) => box.boxlabel)).to.have.members([...boxlabels])
    return
  }
  expect(listing.val, 'a listing refused with something other than a VaultError').to.have.property('name', 'VaultError')
}

/** What u1's vault holds as one device reads it: its vault props, and each listed lockbox's boxlabel and revision. */
const glimpseOf = async (vaultDB: VaultDBVerbs) => {
  const vaultProps = await vaultDB.readVaultProps(scopeOf('u1'))
  const listed = await vaultDB.listBoxes(scopeOf('u1'))
  return { vaultProps, listed: listed.map((box) => [box.boxlabel, summaryOf(box)?.revision_tok]) }
}
// --

// == [Watch helpers]: readingWatch, expectHeard, untilLive, expectEachWriteHeard

/**
 * A watch on u1's vault through `watcher` that, each time it is called, reads the vault, as a vault
 * does, keeping what each read found and how many writes the test had begun when the call came.
 */
const readingWatch = (watcher: VaultDBVerbs) => {
  const tally = { calls: 0, writesBegun: 0 }
  const reads: { after: number, found: Awaited<ReturnType<typeof glimpseOf>> }[] = []
  const readAndKeep = async (after: number) => {
    try {
      reads.push({ after, found: await glimpseOf(watcher) })
    } catch {
      // A read that fails finds nothing, and the test waiting on it times out saying so.
    }
  }
  const onChange = () => {
    tally.calls += 1
    void readAndKeep(tally.writesBegun)
  }
  const unsubscribe = watcher.subscribe(scopeOf('u1'), onChange)
  return { tally, reads, unsubscribe }
}

/** How many ticks a watch has to come to the turnstile as it starts, for a check to hold it there. */
const WatchStartTicks = 20

/** How long a watch has to hear a write before a push test calls it unheard. */
const HeardWithinMillis = 2000

/**
 * That a write made by `write`, through `writer`, is heard by `watch`: some call made after the
 * write began reads the vault as it stands after it. `onWritten` runs once the write has landed. A call before the write, or one whose read
 * ran before the write landed, never finds that, since each write in a push test leaves the vault
 * unlike it ever stood before.
 */
const expectHeard = async (watch: ReturnType<typeof readingWatch>, writer: VaultDBVerbs, write: () => Promise<unknown>, onWritten = unheard) => {
  watch.tally.writesBegun += 1
  const begun = watch.tally.writesBegun
  await write()
  onWritten()
  const after = await glimpseOf(writer)
  await vi.waitFor(() => {
    expect(watch.reads.filter((read) => read.after >= begun).map((read) => read.found), 'no call to onChange read the vault as the write left it').to.deep.include(after)
  }, { timeout: HeardWithinMillis, interval: 5 })
}

/** How many probe writes {@link untilLive} makes, and how long it waits on each, before it calls a watch dead. */
const LiveProbes = 20

const ProbeWaitMillis = 100

/**
 * Resolves once every one of `watches` has been called, so is known to be live: at once, for a
 * watch that calls when it starts; otherwise after a probe write through `writer` -- the vault props'
 * unlock_epoch moved on -- made again until each is heard, as a watch that starts on its own time
 * may miss the first. u1's vault props must already stand.
 */
const untilLive = async (watches: readonly ReturnType<typeof readingWatch>[], writer: VaultDBVerbs) => {
  const allHeard = () => watches.every((watch) => watch.tally.calls > 0)
  for (let ii = 0; ii < LiveProbes && ! allHeard(); ii += 1) {
    const standing = await writer.readVaultProps(scopeOf('u1'))
    if (! standing) { throw new Error('untilLive probes a vault that holds vault props, and found none.') }
    await writer.updateVaultProps({ ...standing, unlock_epoch: standing.unlock_epoch + 1 }, { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch })
    try {
      await vi.waitFor(() => { expect(allHeard()).to.be.true }, { timeout: ProbeWaitMillis, interval: 5 })
    } catch {
      // Not heard yet: probe again.
    }
  }
  expect(allHeard(), `a watch heard none of ${String(LiveProbes)} writes to its vault`).to.be.true
}

/**
 * That a watch through the first of `pair` hears each kind of write made through the second: an
 * update of the vault props, two new lockboxes, a replacement, a retirement of one, of the vault,
 * and a create of the vault anew. The two may be one adapter, or two devices.
 */
const expectEachWriteHeard = async (pair: () => Promise<[VaultDBVerbs, VaultDBVerbs]>) => {
  const [watcher, writer] = await pair()
  await writer.fetchOrCreateVaultProps(vaultPropsOf('u1'))
  const watch = readingWatch(watcher)
  await untilLive([watch], writer)
  const standing = await writer.readVaultProps(scopeOf('u1'))
  const epoch = standing?.unlock_epoch ?? 1
  const writes = [
    () => writer.updateVaultProps(vaultPropsOf('u1', { unlock_epoch: epoch + 1 }), { vault_id: 'vault-id-u1', unlock_epoch: epoch }),
    () => writer.updateBox(scopeOf('u1'), boxOf('anthropic', 'anthropic'), noBoxYet),
    () => writer.updateBox(scopeOf('u1'), boxOf('openai', 'openai'), noBoxYet),
    () => writer.updateBox(scopeOf('u1'), boxOf('anthropic', 'next'), { vault_id: 'vault-id-u1', revision_tok: 'rev-anthropic', vault_key_epoch: 1 }),
    () => writer.retireBox(scopeOf('u1'), 'anthropic', retiring('rev-next')),
    () => writer.retireVault(scopeOf('u1'), thisVault),
    () => writer.fetchOrCreateVaultProps(vaultPropsOf('u1', { vault_id: 'vault-id-anew' })),
  ]
  for (const write of writes) { await expectHeard(watch, writer, write) }
  watch.unsubscribe()
}
// --

// == [Fixtures and stranger helpers]: everyVerbOn, LiteralSidecar, ManyBoxlabels, storeEach, standingVault, revisionIn, others

/** Every verb a stranger might try on `u1`'s vault, each as a thunk. */
const everyVerbOn = (stranger: VaultDBVerbs) => [
  () => stranger.readVaultProps(scopeOf('u1')),
  () => stranger.fetchOrCreateVaultProps(vaultPropsOf('u1', { vault_id: 'vault-id-theirs' })),
  () => stranger.updateVaultProps(vaultPropsOf('u1', { unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }),
  () => stranger.readBox(scopeOf('u1'), 'anthropic'),
  () => stranger.listBoxes(scopeOf('u1')),
  () => stranger.updateBox(scopeOf('u1'), boxOf('anthropic', 'theirs'), { vault_id: 'vault-id-u1', revision_tok: 'rev-anthropic', vault_key_epoch: 1 }),
  () => stranger.updateBox(scopeOf('u1'), boxOf('mistral', 'theirs'), noBoxYet),
  () => stranger.retireBox(scopeOf('u1'), 'openai', retiring('rev-openai')),
  () => stranger.retireVault(scopeOf('u1'), thisVault),
]

/** Text no normalization leaves alone: "café" with its accent composed, then decomposed, and a key. */
/**
 * A sidecar of accented letters, an emoji, a tab, a newline, quotes, backslashes, Hebrew, a
 * null and a fraction: JSON a store must hand back byte for byte as it was written, as it is bound.
 */
const LiteralSidecar = Object.freeze({
  note: 'caf\u{E9} na\u{EF}ve \u{1F511}\trotated\nin March',
  path: String.raw`C:\keys\"work"`,
  tags: ['\u{5D0}\u{5D1}', null, 1.5],
})

/** Enough lockboxes that a listing cut to a page, or a sample, would show it: 25, `box0` to `box24`. */
const ManyBoxlabels = Object.freeze(Array.from({ length: 25 }, (_unused, ii) => `box${String(ii)}`))

/** A new lockbox under each boxlabel, in `u1`'s vault, one after another: its revision `rev-<boxlabel>`. */
const storeEach = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => {
  for (const boxlabel of boxlabels) { await vaultDB.updateBox(scopeOf('u1'), boxOf(boxlabel, boxlabel), noBoxYet) }
}

/** Everything `u1`'s vault holds, as its verbs read it: the vault props, the listing, and each of `boxlabels` read. */
const standingVault = async (vaultDB: VaultDBVerbs, boxlabels: readonly string[]) => ({
  vaultProps: await vaultDB.readVaultProps(scopeOf('u1')),
  listed:     await vaultDB.listBoxes(scopeOf('u1')),
  lockboxes:  await Promise.all(boxlabels.map((boxlabel) => vaultDB.readBox(scopeOf('u1'), boxlabel))),
})

/** The revision of `u1`'s lockbox under `boxlabel`, or null when there is none. */
const revisionIn = async (vaultDB: VaultDBVerbs, boxlabel: string): Promise<string | null> => {
  const lockbox = await vaultDB.readBox(scopeOf('u1'), boxlabel)
  return lockbox?.revision_tok ?? null
}

/** The revision of each lockbox `u1`'s listing shows, in its order. */
const listedRevisions = async (vaultDB: VaultDBVerbs): Promise<(string | undefined)[]> => {
  const listed = await vaultDB.listBoxes(scopeOf('u1'))
  return listed.map((box) => summaryOf(box)?.revision_tok)
}

/** How a write settled: `landed`, or the kind it was refused with (`unknown` for no kind). */
const settledKind = async (write: Promise<unknown>): Promise<string> => {
  try {
    await write
    return 'landed'
  } catch (err) {
    const { kind } = err as { kind?: unknown }
    return typeof kind === 'string' ? kind : 'unknown'
  }
}

/** Which of a lockbox's boxlabel, sidecar and ciphertexts a refusal quotes anywhere. */
const quotedOf = (refusal: unknown, lockbox: Lockbox): string[] => {
  const told = thrownText(refusal)
  const quotable = [lockbox.boxlabel, lockbox.sidecar_json, ...leafTexts(lockbox.lockbox_key_wrapped), ...leafTexts(lockbox.whisper_ciphered)]
  return quotable.filter((text) => text !== '' && told.includes(text))
}
// --

// == [perUser]: perUser

/**
 * One adapter reaching every user's vaults, made of a VaultDB per user: for
 * {@link describeVaultDB} over an adapter that serves only the user signed in, as a server's
 * does when it makes one per request. The suite reaches two users' vaults through one adapter;
 * this sends each verb to the VaultDB `vaultDBFor` made for the user its scope or vault props name,
 * making each user's once and keeping it. Its limits are those of the one made for `anyone`.
 *
 * @param vaultDBFor - The VaultDB a request signed in as `userId` gets.
 * @returns The verbs of one adapter, each sent on to its user's VaultDB.
 *
 * @example
 *   describeVaultDB('postgresVaultDB', () => perUser((userId) => postgresVaultDB({ client, userId, listen: (channel, onNotify) => client.listen(channel, onNotify) })))
 */
export const perUser = (vaultDBFor: (userId: string) => VaultDBVerbs): VaultDBVerbs => {
  const vaultDBs = new Map<string, VaultDBVerbs>()
  const as = ({ user_id }: { user_id: string }): VaultDBVerbs => {
    const known = vaultDBs.get(user_id)
    if (known) { return known }
    const vaultDB = vaultDBFor(user_id)
    vaultDBs.set(user_id, vaultDB)
    return vaultDB
  }
  const anyone = as({ user_id: 'anyone' })
  return {
    maxRecordBytes:          anyone.maxRecordBytes,
    maxVaultBytes:           anyone.maxVaultBytes,
    maxLockboxes:            anyone.maxLockboxes,
    maxNameBytes:            anyone.maxNameBytes,
    readVaultProps:          (scope) => as(scope).readVaultProps(scope),
    fetchOrCreateVaultProps: (vaultProps) => as(vaultProps).fetchOrCreateVaultProps(vaultProps),
    updateVaultProps:        (vaultProps, expected) => as(vaultProps).updateVaultProps(vaultProps, expected),
    readBox:                 (scope, boxlabel) => as(scope).readBox(scope, boxlabel),
    listBoxes:               (scope) => as(scope).listBoxes(scope),
    listBoxRecords:          (scope) => as(scope).listBoxRecords(scope),
    updateBox:               (scope, lockbox, expected) => as(scope).updateBox(scope, lockbox, expected),
    retireBox:               (scope, boxlabel, expected) => as(scope).retireBox(scope, boxlabel, expected),
    retireVault:             (scope, expected) => as(scope).retireVault(scope, expected),
    retireDamagedVault:      (scope) => as(scope).retireDamagedVault(scope),
    subscribe:               (scope, onChange) => as(scope).subscribe(scope, onChange),
  }
}
// --
