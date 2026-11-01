/** The test world of a vault listing in `src/models/`: a vaultDB of one vault row and a box store, a device cache that keeps nothing, a deviceDB that keeps one lease, and a clock the test moves. */

import { afterEach, vi } from 'vitest'
import { type RefusalMeta, VaultError } from '../../src/errors'
import type { VaultScope } from '../../src/shapes/scopes'
import type { BoxWorld } from '../../src/models/box-listing'
import type { AnyGating, Gating, RequestCleartext } from '../../src/models/gating'
import type { Lease } from '../../src/models/lease'
import { deferred } from '../../src/helpers/deferred'
import type { Cleartexts, CleartextsForGatingkind, GatingKind, VaultRecord, VaultSparse } from '../../src/models/models-shapes'
import type { Vault } from '../../src/models/vault'
import { NOVEL, Proving } from '../../src/models/proving'
import { localStoreFront } from '../../src/models/store-front'
import { type BoxVaultDB, type VaultListingOpts, type VaultWorld, VaultListing } from '../../src/models/vault-listing'
import type { Clock } from '../../src/shapes/bank-opts'
import { memoryStore } from '../../src/string-store'
import { quietLogger } from './logging'
import { anyStrengthChecker, passkeyOf, testDeriver } from './builders'

/** The clock's first reading: 31 October 2026. */
export const T0 = Date.UTC(2026, 9, 31)

/** The scope of the one vault these worlds hold. */
export const Dna = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })

export const Passphrase = 'correct horse battery staple'

/** The passphrase a gate change sets in place of {@link Passphrase}. */
export const NewPassphrase = 'a new passphrase for the vault'

/** The cleartexts of a user who types `passphrase`. */
export const byPassphrase = (passphrase: string) => ({ passphrase })

/** The cleartexts of a user who touches the passkey `tag` names, its answer as `passkeyOf` makes it. */
export const byPasskey = async (tag: string) => ({ passkeyAnswer: await passkeyOf(tag) })

/** How long a lease these worlds grant lasts: an hour. */
export const LeaseMillis = 60 * 60_000

const ok = <ValT>(val: ValT) => Promise.resolve({ ok: true as const, val, err: null })
const nothing = (): void => undefined

// == [The user at the dialog]: GatingAnswers, UsualAnswers, answerAtOnce, declineAtOnce, holdNextDialog

/** What the user hands each kind of gating, made fresh for each attempt, since an attempt spends it. */
export type GatingAnswers = { [KindT in GatingKind]?: () => CleartextsForGatingkind[KindT] | Promise<CleartextsForGatingkind[KindT]> }

/** The user who knows {@link Passphrase}, moves to {@link NewPassphrase}, and adds or revokes the `laptop` passkey. */
export const UsualAnswers: GatingAnswers = Object.freeze({
  build_vault:        () => byPassphrase(Passphrase),
  unlock_vault:       () => byPassphrase(Passphrase),
  replace_passphrase: () => ({ passphrase: Passphrase, nextPassphrase: NewPassphrase }),
  add_passkey:        async () => ({ passphrase: Passphrase, passkeyAnswer: await passkeyOf('laptop') }),
  revoke_passkey:     () => byPassphrase(Passphrase),
})

/** A requestCleartext whose user makes one attempt at once with what `answers` holds for the gating's kind, and closes the dialog: a gating left open is declined. A kind `answers` leaves out is declined unattempted. */
export const answerAtOnce = (answers: GatingAnswers = UsualAnswers): RequestCleartext => async (gating: AnyGating) => {
  const answer = answers[gating.gatingkind] as (() => Cleartexts | Promise<Cleartexts>) | undefined
  if (answer === undefined) { gating.decline(); return }
  await (gating as Gating).tryAttempt(await answer())
}

/** A requestCleartext whose user declines every gating. */
export const declineAtOnce: RequestCleartext = (gating: AnyGating) => { gating.decline() }

/** A dialog the test holds open for the next gating `requestCleartext` is handed: `gating` resolves that gating, and `close()` resolves `requestCleartext`, as the host's dialog closing would. */
export const holdNextDialog = (requestCleartext: VaultTestWorld['requestCleartext']) => {
  const handed = deferred<AnyGating>()
  const closed = deferred<undefined>()
  requestCleartext.mockImplementationOnce((gating: AnyGating) => {
    handed.resolve(gating)
    return closed.promise
  })
  return { gating: handed.promise, close: () => { closed.resolve(undefined) } }
}
// --

/** Every listing made since the last test. */
const madeListings: VaultListing[] = []

/** Say goodbye to every listing a test made, after it, so no autolock timer outlives its test: call it once at the top of a test file. */
export const useVaultWorlds = (): void => {
  afterEach(() => {
    for (const listing of madeListings.splice(0)) { listing.goodbye() }
  })
}

/** A deviceDB that keeps the one lease last put, and logs each lease verb. */
const makeDeviceDB = () => {
  let cached: unknown = null
  return {
    cachedNow:   () => cached,
    cache:       (record: unknown) => { cached = record },
    tryGetLease: vi.fn((_scope: VaultScope) => ok(cached)),
    tryPutLease: vi.fn((record: unknown) => { cached = record; return ok(record) }),
    tryDelLease: vi.fn((_scope: VaultScope) => { cached = null; return ok(undefined) }),
  }
}
export type FakeDeviceDB = ReturnType<typeof makeDeviceDB>

/** The box half of a vaultDB: a `localStoreFront`'s box stores, each answer and notice carrying `vaultRow()` as its world, since the vault row lives in the world's own fake store and not in the front. */
const makeBoxVaultDB = (clock: Clock, vaultRow: () => VaultRecord | null): BoxVaultDB => {
  const front = localStoreFront({ store: memoryStore(), clock })
  const withWorld = <AnswerT extends { world: unknown }>(answer: AnswerT): AnswerT => ({ ...answer, world: vaultRow() })
  return {
    boxStore: (scope) => {
      const store = front.boxStore(scope)
      return {
        get:   async (boxscope) => withWorld(await store.get(boxscope)),
        put:   async (record, priorRevisionTok) => withWorld(await store.put(record, priorRevisionTok)),
        del:   async (boxscope, priorRevisionTok) => withWorld(await store.del(boxscope, priorRevisionTok)),
        watch: (onNotice, fullFor, onChange) => store.watch((notice) => onNotice(withWorld(notice)), fullFor, onChange),
      }
    },
  }
}

/** A vault listing over a vaultDB of one row, `stored0` to begin with, and the deviceDB and clock it shares with every other session `anotherSession` opens on this device. `worldOverrides` says otherwise of the world.
 * Its `requestCleartext` is a spy, answering as {@link answerAtOnce} does with {@link UsualAnswers}
 * until a test says otherwise (`requestCleartext.mockImplementation(declineAtOnce)`); its
 * `strengthChecker` a spy admitting every passphrase. Its vaultDB's `put` refuses 'stale_write', carrying the row, over any revision but `priorRevisionTok`.
 */
export const makeVaultWorld = (stored0: VaultRecord | null = null, worldOverrides: Partial<VaultWorld> = {}) => {
  let stored = stored0
  let now = T0
  const deviceDB = makeDeviceDB()
  const requestCleartext = vi.fn(answerAtOnce())
  const strengthChecker = vi.fn(anyStrengthChecker)
  const clock = { now: () => now }
  const world: VaultWorld = {
    clock,
    lockState:    () => 'unlocked',
    ensureTimely: () => Promise.resolve(),
    takeWorld:    nothing,
    scope:        { applabel: Dna.applabel, user_id: Dna.user_id },
    logger:       quietLogger,
    keyDeriver:   testDeriver,
    strengthChecker,
    requestCleartext,
    device_id:    'device-1',
    leaseMillis:  LeaseMillis,
    deviceDB:     deviceDB as unknown as VaultWorld['deviceDB'],
    vaultDB:      makeBoxVaultDB(clock, () => stored),
    boxRefreshMillis: 10 * 60_000,
    ...worldOverrides,
  }
  const answerOf = (scope: VaultScope, val: VaultRecord | VaultSparse | null) => ({ scope, ok: true as const, val, world: null })
  const opts: VaultListingOpts = {
    world,
    store: {
      get:   (scope) => Promise.resolve(answerOf(scope, stored)),
      put:   (record, priorRevisionTok) => {
        if ((stored?.revision_tok ?? null) !== priorRevisionTok) { return Promise.resolve({ scope: record, ok: false as const, err: new VaultError('stale_write', "stored under another revision", { meta: { vault_stored: stored } as unknown as RefusalMeta }), world: null }) }
        stored = record
        return Promise.resolve(answerOf(record, record))
      },
      del:   () => Promise.reject(new Error('not in these tests')),
      watch: () => nothing,
    },
    cache: { load: () => Promise.resolve([]), save: () => Promise.resolve() },
    maxMillisSinceRefresh: 10 * 60_000,
  }
  const makeListing = (): VaultListing => {
    const made = new VaultListing(opts)
    madeListings.push(made)
    return made
  }
  const listing = makeListing()
  /** Another device's put of `record`, landing in the vaultDB behind this one's back, at the next revision. */
  const storeBehindOurBack = (record: VaultRecord): VaultRecord => {
    stored = { ...record, revision_tok: `rev-${String(record.revision_seq + 1)}`, revision_seq: record.revision_seq + 1, written_at: now }
    return stored
  }
  const demandStored = (): VaultRecord => {
    if (stored === null) { throw new Error('nothing stored') }
    return stored
  }
  return {
    listing, opts, deviceDB, requestCleartext, strengthChecker, storeBehindOurBack, demandStored,
    storedNow:      () => stored,
    /** A new listing over the same vaultDB, deviceDB and clock: the next session on this device. */
    anotherSession: makeListing,
    /** Move the clock on by `millis`; no timer fires. */
    advance:        (millis: number) => { now += millis },
  }
}
export type VaultTestWorld = ReturnType<typeof makeVaultWorld>

/** The record of a vault ensured of `Dna` under `passphrase`, as a vaultDB holds it. */
export const storedVaultRecord = async (passphrase: string = Passphrase): Promise<VaultRecord> => {
  const { listing, demandStored } = makeVaultWorld()
  await listing.ensure(Dna, byPassphrase(passphrase))
  return demandStored()
}

/** A vault ensured of `Dna` of `cleartexts` (under {@link Passphrase} unless told otherwise), in a fresh world: stored, unlocked, its lease kept on the device. */
export const makeBornVault = async (cleartexts: Cleartexts = byPassphrase(Passphrase)) => {
  const world = makeVaultWorld()
  const vault = await world.listing.ensure(Dna, cleartexts)
  return { ...world, vault }
}

/** A vault born as {@link makeBornVault} makes it, with the passkey of the `laptop` beside the passphrase. */
export const makeBornVaultWithPasskey = async () => {
  const passkeyAnswer = await passkeyOf('laptop')
  return makeBornVault({ passphrase: Passphrase, passkeyAnswer })
}

/** Another device revokes the laptop's passkey of `born`'s vault, adding the passkey `tag` names in its place unless it is null, and stores the gate behind `born`'s back: `born`'s vault fetches nothing. */
export const replacePasskeyElsewhere = async (born: Awaited<ReturnType<typeof makeBornVaultWithPasskey>>, tag: string | null): Promise<void> => {
  const other = makeVaultWorld(born.demandStored(), { device_id: 'device-2' })
  const theirs = await other.listing.build(other.demandStored())
  await theirs.revokePasskey(byPassphrase(Passphrase))
  if (tag !== null) { await theirs.addPasskey({ passphrase: Passphrase, passkeyAnswer: await passkeyOf(tag) }) }
  born.storeBehindOurBack(other.demandStored())
}

/** Another device replaces the passphrase with {@link NewPassphrase}, its put landing in the vaultDB behind `born`'s back: the record stored, under the next `gate_epoch`. `born` has heard nothing yet. */
export const moveGateElsewhere = async (born: Pick<VaultTestWorld, 'demandStored' | 'storeBehindOurBack'>): Promise<VaultRecord> => {
  const other = makeVaultWorld(born.demandStored(), { device_id: 'device-2' })
  const theirs = await other.listing.build(other.demandStored())
  await theirs.replacePassphrase({ passphrase: Passphrase, nextPassphrase: NewPassphrase })
  return born.storeBehindOurBack(other.demandStored())
}

const RoundTripBoxKeyStamp  = Object.freeze({ boxlabel: 'anthropic_api_key' })
const RoundTripWhisperStamp = Object.freeze({ revision_seq: 1 })

/** What `opener` unseals of a whisper `sealer` seals: the two hold one vaultKey only if it comes back. */
export const roundTrip = async (sealer: Lease, opener: Lease): Promise<string> => {
  const sealed = await sealer.sealWith(new TextEncoder().encode('sk-test'), RoundTripBoxKeyStamp, RoundTripWhisperStamp)
  return new TextDecoder().decode(await opener.unsealWith(sealed, RoundTripBoxKeyStamp, RoundTripWhisperStamp))
}

/** A passphrase proving of the vault `stamp` names, its wayin made, so it holds a vaultKey to lease. */
export const makeProving = async ({ vault_tok, registered_at }: { vault_tok: string, registered_at: number }) => {
  const { passphraseProving } = await Proving.makeProvingPair({ ...Dna, vault_tok, registered_at }, byPassphrase(Passphrase), makeVaultWorld().opts.world)
  await passphraseProving.makeWayin(NOVEL)
  return passphraseProving
}

/** `vault` as its boxes see it, but that it takes no world: the models world's fake store answers with none. */
export const boxWorldOf = (vault: Vault): BoxWorld => ({
  clock:        vault.clock,
  scope:        vault.scope,
  vault_tok:    vault.vault_tok,
  lockState:    () => vault.lockState(),
  ensureTimely: (opts) => vault.ensureTimely(opts),
  takeWorld:    () => undefined,
  demandLease:  () => vault.demandLease(),
})
