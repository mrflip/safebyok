/** The giver: a host's React layer over one bank, made once at module scope, before anyone signs in.
 * Its provider says who is signed in, and hands its hooks that user's device. Records come through the host's React Query.
 */

import { type DataTag, type QueryKey, type UseMutationOptions, type UseMutationResult, type UseQueryOptions, type UseQueryResult, mutationOptions, queryOptions, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  type Bank, type BankSnapshot, type BankStage, type BirthCleartexts, type BoxCleartexts, type BoxLabelpath, type BoxRecord, type BoxUnsealed, Checkers, Device, type GateRecord, type Gating, type KeyDeriver, Labelpath,
  type LiveOf, type LivePublicPropsOf, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts, type PasskeyWayinHeader, type PassphraseReplaceCleartexts, type PassphraseVerdict, type PassphraseWayinHeader,
  PendingBank, type Sidecar, type Tombstone, type TombstoneOf, type UnlockCleartexts, type Userid, type Vault, VaultError, type VaultDB, type Whisper, bulletproofHandlerOf,
} from 'safebyok'
import { sanitizeForeignError } from 'safebyok/storage'
import { useEffectEvent } from 'use-effect-event'
import {
  FormMutationDefaults, ListingQueryDefaults, boxListQueryKeyOf, boxQueryKeyOf, boxesQueryKeyUnder, formMutationKeyOf, gateQueryKeyOf, gateShownOf, liveGateOf, liveOf, recordQueryDefaults,
} from './giver-defaults'
import { type Given, GiverContext } from './giver-context'
import * as Phrases from './phrases-giver'
import { bridgeMinder } from './react-bridge'
import { type BoxQueryOpts, ConfigChecks, type GiverConfig, type GiverMount, HostCallbackOpts, ScopeChecks, SignedOutBank } from './shapes-giver'
import { makeUseDraft } from './use-draft'

// == [Types]: ProviderProps, BoxShown, BoxNamed, BoxSelected, HeaderedGate, GateShown, GateSelected, BoxQueryOptions, BoxQueries, WithLockableWhisperOpts, PutBoxActionOpts, PutBoxActionResult, FormMutationOptions, FormMutationResult, StrengthVerdictResult, ReactGiver, BankGiver

/** The props of a giver's `Provider`. */
export type ProviderProps = Readonly<{
  /** The signed-in user's id. The first one starts that user's device; null or undefined changes nothing. */
  userid:      string | null | undefined
  /** The vaultDB to use in place of the config's: a test's `MemoryVaultDB`, say. Only the one present when the first userid arrives is used. */
  vaultDB?:    VaultDB | undefined
  /** The key deriver to use in place of the config's. Only the one present when the first userid arrives is used. */
  keyDeriver?: KeyDeriver | undefined
  children?:   ReactNode
}>

/** A box's record as the giver fetches it: the whole record, its tombstone, or its shell where none is stored. */
export type BoxShown = BoxRecord | Tombstone<BoxRecord>

/** What names a box to a bank's writes: the host's labelpath, such as `'openai'`, or an object scoped to the box, such as its record. */
export type BoxNamed = string | Readonly<{ labelpath: string }>

/** What a box's query answers by default: the live record, null where none is stored or it was deleted, or undefined. */
export type BoxSelected = LiveOf<BoxRecord> | null | undefined

/** The main gate's record as the giver shows it: each wayin by its header, without the bankKey it wraps. */
export type HeaderedGate = Omit<GateRecord, 'wayins'> & Readonly<{ wayins: Readonly<{ main: PassphraseWayinHeader, passkey0: PasskeyWayinHeader | null }> }>

/** The main gate as the giver fetches it: its record by its wayins' headers, or its shell where none is stored. */
export type GateShown = HeaderedGate | Tombstone<HeaderedGate>

/** What the gate's query answers by default: the live gate, null where no bank is stored, or undefined. */
export type GateSelected = HeaderedGate | null | undefined

/** The `queryOptions` of a box, for `useQuery`, `useQueries`, `queryClient.query` and the rest. */
export type BoxQueryOptions = UseQueryOptions<BoxShown, Error, BoxSelected> & Readonly<{ queryKey: DataTag<QueryKey, BoxShown, Error> }>

/** The query factories of the signed-in user's bank, from `SOK.useQueryOptions()`. */
export type BoxQueries = Readonly<{
  /** The `queryOptions` of the box at `labelpath`. */
  box: (labelpath: string) => BoxQueryOptions
}>

/** What a {@link BankGiver.withLockableWhisper} calls in place of its callback on a locked bank. */
export type WithLockableWhisperOpts<ResultT> = Readonly<{
  /** Called with the box's stored record, its whisper sealed, while the bank is locked: answer from its sidecar. */
  ifLocked: (box: LiveOf<BoxRecord>) => ResultT | Promise<ResultT>
}>

/** How a {@link BankGiver.putBoxAction} reads the form it is handed. */
export type PutBoxActionOpts = Readonly<{
  /** The box's whisper, read from the form's fields. */
  whisperOf:  (form: FormData) => Whisper
  /** The box's sidecar, from the whisper read and the form's fields. Left out, the box keeps the sidecar it has, and a box written for the first time refuses for want of one. */
  sidecarOf?: ((whisper: Whisper, form: FormData) => Sidecar) | undefined
}>

/** What a {@link BankGiver.putBoxAction} resolves, for `useActionState` to keep: the box stored, or the `Error` that stopped it. */
export type PutBoxActionResult = Readonly<{ box: LiveOf<BoxRecord>, err: null }> | Readonly<{ box: null, err: Error }>

/** React Query's options for a form verb's mutation, for the host's own `useMutation`: its `mutate` is handed the verb's gating. */
export type FormMutationOptions = UseMutationOptions<void, Error, Gating>

/** A form verb's mutation, through `useMutation`, with `gating` to make what its `mutate` is handed. */
export type FormMutationResult<CleartextsT> = UseMutationResult<void, Error, Gating> & Readonly<{
  /** The gating of the form verb over `cleartexts`, for `mutate`. */
  gating: (cleartexts: CleartextsT) => Gating
}>

/** The result of a giver's `useStrengthVerdict`: the latest verdict on a new passphrase, and `judge` to ask for the next. */
export type StrengthVerdictResult = Readonly<{
  /** The verdict on the passphrase last judged, or null before any verdict lands or after the checker refuses.
   * It stays while the next is judged.
   */
  verdict:   PassphraseVerdict | null
  /** True from a call to `judge` until its verdict lands. */
  isJudging: boolean
  /** The checker's refusal of the passphrase last judged, or null. */
  lastErr:   Error | null
  /** Ask the signed-in user's strength checker for its verdict on `passphrase`, resolving once it lands. Never rejects.
   * Call it as the user types, with the field's value.
   */
  judge:     (passphrase: string) => Promise<void>
}>

/** What {@link reactGiver} returns: the provider, the strength hook, and `bank` for the bank's own hooks. */
export type ReactGiver<BanklabelT extends string = string> = ReturnType<typeof reactGiver<BanklabelT>>

/** The hooks and calls of a giver's bank, from `SOK.bank(banklabel)`. */
export type BankGiver = ReturnType<ReactGiver['bank']>

/** What a provider shows the hooks under it: its user's device, or none and the bank snapshot shown meanwhile. */
type Shown = Readonly<{ device: Device, bank: null }> | Readonly<{ device: null, bank: BankSnapshot }>

/** What a bank's hooks and calls read of their giver. */
type BankFriend = Readonly<{
  banklabel:    string
  /** The signed-in user's device, or null while nobody is signed in: for the calls a host may make outside the provider. */
  signedIn:     () => Device | null
  demandDevice: () => Device
  demandBank:   () => Bank
  demandVault:  () => Vault
  useShown:     () => Shown
}>
// --

// == [The giver]: reactGiver, Unjudged, shownOf, SignedOutShown, StartingShown

/** Make the giver of one bank: hold `config`, until someone signs in. Make it once, at module scope.
 * `config` is the bank, as `banks: { mybank: { vaultDB } }`, and the options of each Device it makes.
 * A box's labelpath is the host's, without the `box/` the core stores it under.
 * @example
 *   export const SOK   = reactGiver({ banks: { knock: { vaultDB } }, keyDeriver })
 *   export const Knock = SOK.bank('knock')
 */
export function reactGiver<BanklabelT extends string>(config: GiverConfig<BanklabelT>) {
  const [[banklabel, { vaultDB: configVaultDB }]] = ConfigChecks.giverConfig.parse(config).banks
  const { banks: _banks, ...configDeviceOpts } = config
  /** The signed-in user's device, from the first userid a provider is handed, for the page's life. */
  let device: Device | null = null
  // One context for each giver, so a hook of one giver never reads the device of another giver's provider.
  /** The device the nearest provider of this giver shows its children, or signed out outside every one. */
  const ShownContext = createContext<Shown>(SignedOutShown)

  /** The giver's device: `userid`'s, made now, or the one already made, whatever `userid`.
   * `mount`'s vaultDB and key deriver, where given, replace the config's; its client is the one the minder's records are bridged into.
   */
  function ensureDevice(userid: string, { client, vaultDB, keyDeriver }: GiverMount): Device {
    if (device !== null) { return device }
    const opts = { ...configDeviceOpts, vaultDB: vaultDB ?? configVaultDB, ...(keyDeriver && { keyDeriver }) }
    // Cheat (react_life): a fresh device_tok for each device. Nothing keeps one across a reload yet.
    const made = Device.make({ userid, banklabel, device_tok: globalThis.crypto.randomUUID() }, opts)
    device = made
    // Nothing ends a device yet, so the bridge is never stopped.
    bridgeMinder(client, made.minder, (badnews) => { made.tellBadNews(badnews) })
    return made
  }

  /** The signed-in user's device. Refuses `absent_vault` while nobody is signed in. */
  function demandDevice(): Device {
    if (device === null) { throw new VaultError('absent_vault', Phrases.NobodySignedIn) }
    return device
  }

  /** The signed-in user's bank. Refuses `absent_vault` while nobody is signed in, while the bank is unborn, until it is brought up, or where it failed to come up. */
  function demandBank(): Bank {
    const signedIn = demandDevice()
    if (signedIn.bank === null) { throw bankAbsentOf(signedIn) }
    return signedIn.bank
  }

  /** The vault of the signed-in user's bank. Refuses as {@link demandBank} does. */
  function demandVault(): Vault {
    const signedIn = demandDevice()
    if (signedIn.vault === null) { throw bankAbsentOf(signedIn) }
    return signedIn.vault
  }

  /** Says who is signed in: mount it once, at the root, inside the host's `QueryClientProvider`.
   * The first userid starts that user's device. A null or undefined userid changes nothing, and neither does unmounting.
   * Under it, a hook never shows a device whose userid is not the prop's: it shows `starting` instead.
   * The parts and the kit beneath it use its giver and bank, unless handed their own as props.
   * Render it in the browser only: on a server, one device would serve every request.
   */
  function Provider({ userid, vaultDB, keyDeriver, children }: ProviderProps) {
    const client = useQueryClient()
    // The device is made during render, so the first render with a userid shows it, and a selecting hook renders no
    // more than its selection changes. Each later call, StrictMode's or a discarded render's, answers the one device.
    // `hello` fetches the bank, its main gate and root box through the minder, so it waits for the effect; it has no
    // cleanup, as the device lives for the page.
    const made = (typeof userid === 'string') ? ensureDevice(userid, { client, vaultDB, keyDeriver }) : device
    useEffect(() => { void made?.hello() }, [made])
    const shown = useMemo(() => shownOf(made, userid), [made, userid])
    return <ShownContext value={shown}><GiverContext value={given}>{children}</GiverContext></ShownContext>
  }

  /** What the nearest provider shows its children: its user's device, or none and the bank snapshot shown meanwhile. */
  function useShown(): Shown { return useContext(ShownContext) }

  // Only the verdict of the latest call to `judge` lands: an earlier one, such as a checker's first while it loads its
  // dictionary, may resolve after a later one, and would show the strength of what the user typed before.
  /** The strength checker's verdict on a new passphrase, for a meter beside its field. Disable the form's submit until `verdict.strong`.
   * The verb judges the passphrase again, and refuses `weak_passphrase` where it is weak. The hook retains the verdict, never the passphrase.
   * @example
   *   const strength = SOK.useStrengthVerdict()
   *   <input name="nextPassphrase" type="password" onChange={(event) => { void strength.judge(event.target.value) }} />
   *   <button disabled={strength.isJudging || ! strength.verdict?.strong}>Change passphrase</button>
   */
  function useStrengthVerdict(): StrengthVerdictResult {
    const [judged, setJudged] = useState<Omit<StrengthVerdictResult, 'judge'>>(Unjudged)
    const judgeseq = useRef(0)
    // One `judge` for the hook's life, so a host may list it in an effect's dependencies.
    const judge = useCallback(async (passphrase: string): Promise<void> => {
      judgeseq.current += 1
      const ownseq = judgeseq.current
      setJudged((prior) => ({ ...prior, isJudging: true }))
      try {
        const verdict = await demandDevice().judgeStrength(passphrase)
        if (ownseq === judgeseq.current) { setJudged({ verdict, isJudging: false, lastErr: null }) }
      } catch (err) {
        if (ownseq === judgeseq.current) { setJudged({ verdict: null, isJudging: false, lastErr: sanitizeForeignError(err) }) }
      }
    }, [])
    return { ...judged, judge }
  }

  const { bankGiver, boxQueryOf } = makeBankGiver({ banklabel, signedIn: () => device, demandDevice, demandBank, demandVault, useShown })

  /** The query factories of the signed-in user's bank, by banklabel, for the host's own `useQuery` and its kin.
   * Every key it makes is the user's: it re-renders when the user changes, so each query made from it changes key with them.
   * Until the bank is brought up, a query from it fetches nothing.
   * @example
   *   const sok = SOK.useQueryOptions()
   *   const { data: box } = useQuery(sok.knock.box('jokes'))
   */
  function useQueryOptions(): Readonly<Record<BanklabelT, BoxQueries>> {
    const shownDevice = useShown().device
    const isUp = bankGiver.useBank(isBroughtUp)
    return useMemo(() => {
      const queries: BoxQueries = Object.freeze({ box: (labelpath: string) => boxQueryOf(shownDevice, labelpath, isUp) })
      return Object.freeze({ [banklabel]: queries }) as Record<BanklabelT, BoxQueries>
    }, [shownDevice, isUp])
  }

  const giver = Object.freeze({
    Provider,
    useStrengthVerdict,
    useQueryOptions,
    /** The hooks and calls of the giver's bank, refusing any other banklabel. Name the result in PascalCase (`const Knock = SOK.bank('knock')`), so the rules-of-hooks lint checks `Knock.useBank()`. */
    bank: (banklabelAsked: BanklabelT) => {
      ScopeChecks.bankScoped.parseConsistent({ banklabel: banklabelAsked }, { banklabel })
      return bankGiver
    },
  })
  /** What the provider hands the parts and the kit beneath it. */
  const given: Given = Object.freeze({ giver, bank: bankGiver })
  return giver
}

/** The fields of a {@link StrengthVerdictResult} before anything is judged. */
const Unjudged = Object.freeze({ verdict: null, isJudging: false, lastErr: null })

/** What a provider handed `userid` shows its children of `made`, the giver's device: none while it is another user's or not yet made. */
function shownOf(made: Device | null, userid: string | null | undefined): Shown {
  if (typeof userid !== 'string') { return (made === null) ? SignedOutShown : { device: made, bank: null } }
  return ((made !== null) && (made.userid === userid)) ? { device: made, bank: null } : StartingShown
}

/** What a hook shows while nobody is signed in: no device, and stage `signed_out`. */
const SignedOutShown: Shown = Object.freeze({ device: null, bank: SignedOutBank })

/** What a hook shows while the provider's user has no device: no device, and stage `starting`. */
const StartingShown: Shown = Object.freeze({ device: null, bank: PendingBank })
// --

// == [The bank]: makeBankGiver

/** The hooks and calls of the bank `friend` serves. */
function makeBankGiver(friend: BankFriend) {
  const { banklabel, signedIn, demandDevice, demandBank, demandVault, useShown } = friend

  /** The bank's snapshot. Synchronous: it never waits and never suspends.
   * Switch a screen on its `stage`.
   * Given `select`, it re-renders only when what `select` returns changes: return a field of the snapshot or a primitive, never a new object.
   */
  function useBank(): BankSnapshot
  function useBank<SelT>(select: (snap: BankSnapshot) => SelT): SelT
  function useBank<SelT>(select?: (snap: BankSnapshot) => SelT): BankSnapshot | SelT {
    const { device, bank } = useShown()
    const pickOf = () => {
      const snap = (device === null) ? bank : device.getSnapshot().bank
      return select ? select(snap) : snap
    }
    return useSyncExternalStore((device === null) ? subscribeToNothing : device.subscribe, pickOf, pickOf)
  }

  /** Call `onChange` after each render that shows the bank at a new stage, with the stage before it: never on the first render.
   * Use it to act on a lock, as to empty a form the user was typing a secret into.
   * @example
   *   Knock.useStageChange((stage) => { if (stage === 'locked') { draft.discard() } })
   */
  function useStageChange(onChange: (stage: BankStage, prevStage: BankStage) => void): void {
    Checks.fn.parse(onChange)
    const stage = useBank((snap) => snap.stage)
    const prevStageRef = useRef(stage)
    const changed = useEffectEvent((prevStage: BankStage) => { onChange(stage, prevStage) })
    useEffect(() => {
      const prevStage = prevStageRef.current
      if (prevStage === stage) { return }
      prevStageRef.current = stage
      changed(prevStage)
    }, [stage])
  }

  // One factory serves render and the calls outside it: a hook hands it the device it shows, `boxQuery` the one signed in.
  /** The `queryOptions` of the box at `labelpath` in `device`'s bank, skipping the fetch unless `isUp`, the bank brought up. */
  function boxQueryOf(device: Device | null, labelpath: string, isUp: boolean): BoxQueryOptions {
    return queryOptions({ ...boxQueryBaseOf(device, labelpath, isUp), select: liveOf<BoxRecord> })
  }

  /** {@link boxQueryOf}, less its `select`. */
  function boxQueryBaseOf(device: Device | null, labelpath: string, isUp: boolean): Pick<UseQueryOptions<BoxShown>, 'queryKey' | 'queryFn' | 'networkMode' | 'staleTime' | 'structuralSharing'> {
    const boxLabelpath = boxLabelpathOf(labelpath)
    return {
      ...recordQueryDefaults(() => isBehindAt(device, boxLabelpath)),
      queryKey: boxQueryKeyOf({ userid: useridOf(device), banklabel, labelpath: boxLabelpath }),
      queryFn:  (isUp && (device !== null)) ? () => getBoxShown(device, boxLabelpath) : skipToken,
    }
  }

  /** The `queryOptions` of the box at `labelpath`, for whoever is signed in when called: for a route loader, a prefetch, or `useQuery` outside the provider's reach.
   * Its `data` is what {@link useBox} answers. Until the bank is brought up, it fetches nothing, and `queryClient.query` rejects:
   * a loader waits for the stage to show `locked` or `unlocked` first.
   * @example
   *   loader: () => queryClient.query(Knock.boxQuery('jokes'))
   */
  function boxQuery(labelpath: string): BoxQueryOptions {
    const device = signedIn()
    return boxQueryOf(device, labelpath, (device !== null) && isBroughtUp(device.getSnapshot().bank))
  }

  /** The box's stored record, through React Query, its whisper still sealed.
   * `data` is the record, null when none is stored or it was deleted, and undefined while pending or until the bank is brought up.
   * A record overtaken by a newer revision shows until the newer one arrives.
   * `opts` are React Query's own, and override the giver's. A `select` given there is handed the whole record, the box's
   * tombstone, or its shell where none is stored: {@link liveOf} is the default.
   * @example
   *   const { data: box } = Knock.useBox('jokes')
   *   const mask = Knock.useBox('jokes', { select: (thing) => liveOf(thing)?.sidecar['mask'] }).data
   */
  function useBox<SelT = BoxSelected>(labelpath: string, opts: BoxQueryOpts<BoxShown, SelT> = {}): UseQueryResult<SelT> {
    const { device } = useShown()
    const isUp = useBank(isBroughtUp)
    return useQuery<BoxShown, Error, SelT>({ ...boxQueryBaseOf(device, labelpath, isUp), select: liveOf as (thing: BoxShown) => SelT, ...opts })
  }

  /** The bank's main gate, through React Query: its wayins' headers, never the bankKey they wrap.
   * `data` is the gate, null when no bank is stored, and undefined while pending or until the bank is brought up.
   * Its `wayins.passkey0` is the header of the bank's passkey, or null while it has none: a passkey added or revoked on any device shows here.
   * `opts` are React Query's own, as {@link useBox} takes them.
   * @example
   *   const passkeyHeader = Knock.useGate({ select: passkeyHeaderOf }).data
   *   {(passkeyHeader === null) && <AddPasskeyForm username={user.email} />}
   */
  function useGate<SelT = GateSelected>(opts: BoxQueryOpts<GateShown, SelT> = {}): UseQueryResult<SelT> {
    const { device } = useShown()
    const isUp = useBank(isBroughtUp)
    return useQuery<GateShown, Error, SelT>({ ...gateQueryBaseOf(device, isUp), select: liveGateOf as (gate: GateShown) => SelT, ...opts })
  }

  /** The key, fetch and defaults of the query of `device`'s main gate, skipping the fetch unless `isUp`, the bank brought up. */
  function gateQueryBaseOf(device: Device | null, isUp: boolean): Pick<UseQueryOptions<GateShown>, 'queryKey' | 'queryFn' | 'networkMode' | 'staleTime' | 'structuralSharing'> {
    return {
      ...recordQueryDefaults(() => isBehindAt(device, Labelpath.MainGate)),
      queryKey: gateQueryKeyOf({ userid: useridOf(device), banklabel }),
      queryFn:  (isUp && (device !== null)) ? () => getGateShown(device) : skipToken,
    }
  }

  /** The signed-in user's listing of the root box's children. */
  async function getBoxListing(): Promise<readonly Labelpath[]> {
    const device = demandDevice()
    await device.minder.list(RootBoxLabelpath)
    // The minder caches the root box's listing from `hello`, so there is always one to read.
    return device.minder.listingAt({ ...device.scope, labelpath: RootBoxLabelpath })!
  }

  /** The labelpaths of the bank's boxes, through React Query, for a list that renders each one by {@link useBox}.
   * `data` is the labelpaths in labelpath order, and undefined while pending or until the bank is brought up. It is the same array until a box joins.
   * A deleted box stays listed, and its `useBox` answers null. A box this device writes or hears of joins at once.
   * @example
   *   const { data: labelpaths } = Knock.useBoxList()
   *   labelpaths?.map((labelpath) => <JokeRow key={labelpath} labelpath={labelpath} />)
   */
  function useBoxList(): UseQueryResult<readonly string[]> {
    const { device } = useShown()
    const isUp = useBank(isBroughtUp)
    return useQuery({
      ...ListingQueryDefaults,
      queryKey: boxListQueryKeyOf({ userid: useridOf(device), banklabel }),
      queryFn:  (isUp && (device !== null)) ? getBoxListing : skipToken,
      select:   hostLabelpathsOf,
    })
  }

  /** The keys of the signed-in user's boxes and gate in the host's React Query, reading whoever is signed in when called. */
  const keys = Object.freeze({
    /** The key of the box at `labelpath`'s query. */
    box:   (labelpath: string): QueryKey => boxQueryKeyOf({ userid: useridOf(signedIn()), banklabel, labelpath: boxLabelpathOf(labelpath) }),
    /** The key that starts the key of the box at `labelpath` and of every box under it, or of every box when left out: for `invalidateQueries`.
     * @example
     *   void queryClient.invalidateQueries({ queryKey: Knock.keys.under('jokes') })
     */
    under: (labelpath?: string): QueryKey => boxesQueryKeyUnder({ userid: useridOf(signedIn()), banklabel, labelpath: (labelpath === undefined) ? RootBoxLabelpath : boxLabelpathOf(labelpath) }),
    /** The key of {@link useBoxList}'s query, which no key from `under` starts. */
    boxList: (): QueryKey => boxListQueryKeyOf({ userid: useridOf(signedIn()), banklabel }),
    /** The key of {@link useGate}'s query, which no key from `under` starts. */
    gate:    (): QueryKey => gateQueryKeyOf({ userid: useridOf(signedIn()), banklabel }),
  })

  /** Call `fn` with the box's whisper, and resolve what `fn` resolves. On a locked bank, it first waits for the unlock form.
   * Call it once the stage shows `locked` or `unlocked`: before then it refuses. While it waits, `useBank((bank) => bank.isUnlockWanted)` is true: show the unlock form, or call {@link dismissUnlock}, which rejects the wait `dismissed`.
   * `fn` also gets the whole box, unsealed. Use the whisper only inside `fn`, and return only what is safe to retain:
   * what `fn` throws is rethrown as thrown.
   * @example
   *   const ask = useMutation({ mutationFn: (line: string) => Knock.withWhisper('jokes', ({ apiKey }) => tellJoke(apiKey, line)) })
   */
  async function withWhisper<ResultT>(labelpath: string, fn: (whisper: Whisper, box: BoxUnsealed) => ResultT | Promise<ResultT>): Promise<ResultT> {
    const boxLabelpath = boxLabelpathOf(labelpath)
    Checks.fn.parse(fn)
    return await demandVault().withWhisper(boxLabelpath, (box) => fn(box.whisper, box))
  }

  /** Call `fn` with the box's whisper on an unlocked bank, and `opts.ifLocked` with its sealed record on a locked one, resolving what either resolves.
   * Unlike {@link withWhisper}, it never waits for the unlock form: a lock that lands before the box is unsealed refuses `bank_locked`.
   * Call it once the stage shows `locked` or `unlocked`, and again after a lock, an unlock or a `putBox`.
   * Use the whisper only inside `fn`. A result that shows any of the whisper belongs in the page, not in React's state or a query.
   * @example
   *   const shown = await Knock.withLockableWhisper('jokes', ({ apiKey }) => mask(String(apiKey), { tail: 4 }), { ifLocked: (box) => String(box.sidecar['mask']) })
   *   maskElement.textContent = shown
   */
  async function withLockableWhisper<ResultT>(
    labelpath: string, fn: (whisper: Whisper, box: BoxUnsealed) => ResultT | Promise<ResultT>, opts: WithLockableWhisperOpts<ResultT>,
  ): Promise<ResultT> {
    const boxLabelpath = boxLabelpathOf(labelpath)
    Checks.fn.parse(fn)
    const { ifLocked } = Checks.withLockableWhisperOpts.parse(opts) as WithLockableWhisperOpts<ResultT>
    const vault = demandVault()
    if (vault.bank.isUnlocked) { return await vault.withUnlockedWhisper(boxLabelpath, (box) => fn(box.whisper, box)) }
    const box = liveOf<BoxRecord>(await vault.minder.get({ ...vault.bank.scope, labelpath: boxLabelpath }))
    // A sparse record has no sidecar to read, so it refuses as a deleted box does.
    if ((box === null) || (box === undefined)) { throw new VaultError('absent_box', Phrases.BoxAbsent) }
    return await ifLocked(box)
  }

  // Each write tries once. By the time it resolves, the minder has cached what was written, and the bridge has copied it
  // into the host's item of the box, wherever a hook made one.

  /** Seal and write the next revision of the box `boxNamed` names, applying `patch` and encrypting `secrets`. Resolves the stored box, its whisper sealed.
   * The write cites the newest revision the minder has heard of at that labelpath, whatever revision a record handed it is at.
   * It tries once: where another revision is stored meanwhile, it refuses `stale_write`. A box written for the first time, or over a deleted one, needs `patch.sidecar`.
   * On a locked bank it refuses `bank_locked`: unlike {@link withWhisper}, it does not wait for the unlock form.
   * @example
   *   await Knock.putBoxOnce('jokes', { sidecar: { mask: 'sk-…f00d' } }, { whisper: { apiKey } })
   */
  async function putBoxOnce(boxNamed: BoxNamed, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<LiveOf<BoxRecord>> {
    return await putBoxOnceAt(boxLabelpathOfNamed(boxNamed), patch, secrets)
  }

  /** {@link putBoxOnce} of the box at `boxLabelpath`. */
  async function putBoxOnceAt(boxLabelpath: BoxLabelpath, patch: LivePublicPropsOf<BoxRecord, BoxCleartexts>, secrets: BoxCleartexts): Promise<LiveOf<BoxRecord>> {
    return await demandVault().putBoxOnce(boxLabelpath, patch, secrets)
  }

  /** Delete the box `boxNamed` names, resolving its stored tombstone. It tries once, over the newest revision the minder has heard of.
   * A {@link useBox} showing the box then answers null.
   */
  async function delBoxOnce(boxNamed: BoxNamed): Promise<TombstoneOf<BoxRecord>> {
    const boxLabelpath = boxLabelpathOfNamed(boxNamed)
    return await demandVault().delBoxOnce(boxLabelpath)
  }

  // React shows the form's FormData to the components inside it, through `useFormStatus().data`, until the action settles.
  // Emptied before the first await, it holds the whisper during no render.
  /** A form action for `useActionState` that writes the box `boxNamed` names from the form's fields, as {@link putBoxOnce} does.
   * Make it at module scope, or under `useMemo`, so its checks run once.
   * It reads the whisper with `opts.whisperOf`, and the sidecar with `opts.sidecarOf`, then empties the form of every field before it writes.
   * It never rejects: it resolves the box stored, or the `Error` that stopped it, a refusal or what `whisperOf`, `sidecarOf` or the vaultDB threw.
   * An `Error` thrown arrives as it is; anything else thrown arrives wrapped in an `Error`, a thrown string as its message.
   * @example
   *   const [put, putAction, isPutting] = useActionState(useMemo(() => Knock.putBoxAction('jokes', {
   *     whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
   *     sidecarOf: (whisper) => ({ mask: mask(String(whisper['apiKey']), { tail: 0 }) }),
   *   }), []), null)
   *   <form action={putAction}><input name="apiKey" type="password" /><button disabled={isPutting}>Save</button></form>
   */
  function putBoxAction(boxNamed: BoxNamed, opts: PutBoxActionOpts): (prior: PutBoxActionResult | null, form: FormData) => Promise<PutBoxActionResult> {
    const boxLabelpath = boxLabelpathOfNamed(boxNamed)
    const { whisperOf: hostWhisperOf, sidecarOf: hostSidecarOf } = Checks.putBoxActionOpts.parse(opts)
    const whisperOf = bulletproofHandlerOf(hostWhisperOf, HostCallbackOpts)
    const sidecarOf = hostSidecarOf && bulletproofHandlerOf(hostSidecarOf, HostCallbackOpts)
    /** The patch and the secrets of the write, read from `form`, which is left empty whether or not they could be read. */
    function takeForm(form: FormData): [LivePublicPropsOf<BoxRecord, BoxCleartexts>, BoxCleartexts] {
      try {
        const whisper = whisperOf(form)
        return [sidecarOf ? { sidecar: sidecarOf(whisper, form) } : {}, { whisper }]
      } finally {
        emptyForm(form)
      }
    }
    return async (_prior, form) => {
      try {
        const [patch, secrets] = takeForm(Checks.form.parse(form))
        return { box: await putBoxOnceAt(boxLabelpath, patch, secrets), err: null }
      } catch (err) {
        return { box: null, err: sanitizeForeignError(err) }
      }
    }
  }

  /** Lock the bank, dropping its keys: a whisper needs the unlock form again. Does nothing while there is no bank. */
  function lock(): void { signedIn()?.lock() }

  /** Dismiss the wait for the unlock form: every {@link withWhisper} waiting rejects `dismissed`, and the bank stays locked.
   * Call it from the unlock form's close button. Does nothing while there is no bank.
   */
  function dismissUnlock(): void { signedIn()?.bank?.dismissUnlock() }

  // Each form mutation below resolves nothing: the bank's snapshot says what changed. Its error is the verb's refusal, to
  // branch on by `family`: a `condition` is the user's to correct, at the field or in a banner, with the form left open.
  // Each gating refuses `absent_vault` at a stage the verb has no bank for: show each form only at its own stage.
  // The birth's gating refuses `disabled` at `'starting'`, until the device's `hello` answers.
  // A verb comes three ways: its gating, its mutation options for the host's own `useMutation`, and its hook, which is
  // the two together. The hook keys its mutation by the user the provider shows; the options, by whoever is signed in.

  /** React Query's options for the form mutation keyed `verb` under `userid`'s bank. */
  function formMutationOptionsOf(userid: Userid | null, verb: string): FormMutationOptions {
    return mutationOptions({ ...FormMutationDefaults, mutationKey: formMutationKeyOf({ userid, banklabel, verb }) })
  }

  /** The form mutation keyed `verb` under the bank of the user the provider shows, with `gatingOf` as its `gating`. */
  function useFormMutation<CleartextsT>(verb: string, gatingOf: (cleartexts: CleartextsT) => Gating): FormMutationResult<CleartextsT> {
    const { device } = useShown()
    return { ...useMutation(formMutationOptionsOf(useridOf(device), verb)), gating: gatingOf }
  }

  /** The gating that births the bank under a new passphrase, for {@link birthMutationOptions}' mutation. */
  function birthGating(cleartexts: BirthCleartexts): Gating { return demandDevice().birthGating(cleartexts) }

  /** React Query's options for the mutation that births the bank, for the host's own `useMutation`: hand its `mutate` a {@link birthGating}.
   * An `onSettled` of your own replaces the one that vacates the gating: vacate it there too.
   */
  function birthMutationOptions(): FormMutationOptions { return formMutationOptionsOf(useridOf(signedIn()), 'birth') }

  /** The mutation that births the bank, at stage `unborn`, leaving it unlocked: hand it `birth.gating({ passphraseCleartext })`.
   * Disable the submit until the giver's `useStrengthVerdict` judges the passphrase strong.
   */
  function useBirth(): FormMutationResult<BirthCleartexts> { return useFormMutation('birth', birthGating) }

  /** The gating that unlocks the bank by its passphrase or its passkey, for {@link unlockMutationOptions}' mutation. */
  function unlockGating(cleartexts: UnlockCleartexts): Gating { return demandBank().gate.unlockGating(cleartexts) }

  /** React Query's options for the mutation that unlocks the bank, for the host's own `useMutation`: hand its `mutate` an {@link unlockGating}.
   * An `onSettled` of your own replaces the one that vacates the gating: vacate it there too.
   * @example
   *   const unlock = useMutation(Knock.unlockMutationOptions())
   *   unlock.mutate(Knock.unlockGating({ passphraseCleartext }))
   */
  function unlockMutationOptions(): FormMutationOptions { return formMutationOptionsOf(useridOf(signedIn()), 'unlock') }

  /** The mutation that unlocks the bank by its passphrase or its passkey: hand it `unlock.gating({ passphraseCleartext })`.
   * Every {@link withWhisper} waiting resumes. A wrong passphrase or passkey refuses, and the bank stays locked.
   * Disable the submit while it is pending (`disabled={unlock.isPending}`), so a double press unlocks once.
   * @example
   *   const unlock = Knock.useUnlock()
   *   <form action={(form) => { unlock.mutate(unlock.gating({ passphraseCleartext: popField(form, 'passphrase') })) }}>
   */
  function useUnlock(): FormMutationResult<UnlockCleartexts> { return useFormMutation('unlock', unlockGating) }

  /** The gating that replaces the passphrase, proved by the current passphrase or the passkey, for {@link replacePassphraseMutationOptions}' mutation. */
  function replacePassphraseGating(cleartexts: PassphraseReplaceCleartexts): Gating { return demandBank().gate.replacePassphraseGating(cleartexts) }

  /** React Query's options for the mutation that replaces the passphrase, for the host's own `useMutation`: hand its `mutate` a {@link replacePassphraseGating}.
   * An `onSettled` of your own replaces the one that vacates the gating: vacate it there too.
   */
  function replacePassphraseMutationOptions(): FormMutationOptions { return formMutationOptionsOf(useridOf(signedIn()), 'replacePassphrase') }

  /** The mutation that replaces the passphrase, proved by the current passphrase or the passkey, leaving the bank unlocked.
   * Disable the submit until the giver's `useStrengthVerdict` judges the new passphrase strong.
   */
  function useReplacePassphrase(): FormMutationResult<PassphraseReplaceCleartexts> { return useFormMutation('replacePassphrase', replacePassphraseGating) }

  /** The gating that adds a passkey, proved by the passphrase, for {@link addPasskeyMutationOptions}' mutation. */
  function addPasskeyGating(cleartexts: PasskeyAddCleartexts): Gating { return demandBank().gate.addPasskeyGating(cleartexts) }

  /** React Query's options for the mutation that adds a passkey, for the host's own `useMutation`: hand its `mutate` an {@link addPasskeyGating}.
   * An `onSettled` of your own replaces the one that vacates the gating: vacate it there too.
   */
  function addPasskeyMutationOptions(): FormMutationOptions { return formMutationOptionsOf(useridOf(signedIn()), 'addPasskey') }

  /** The mutation that adds a passkey, proved by the passphrase, leaving the bank unlocked.
   * Run the WebAuthn ceremony in the click handler, before anything slow (the browser requires it).
   */
  function useAddPasskey(): FormMutationResult<PasskeyAddCleartexts> { return useFormMutation('addPasskey', addPasskeyGating) }

  /** The gating that revokes the passkey, proved by the passphrase or the passkey, for {@link revokePasskeyMutationOptions}' mutation. */
  function revokePasskeyGating(cleartexts: PasskeyRevokeCleartexts): Gating { return demandBank().gate.revokePasskeyGating(cleartexts) }

  /** React Query's options for the mutation that revokes the passkey, for the host's own `useMutation`: hand its `mutate` a {@link revokePasskeyGating}.
   * An `onSettled` of your own replaces the one that vacates the gating: vacate it there too.
   */
  function revokePasskeyMutationOptions(): FormMutationOptions { return formMutationOptionsOf(useridOf(signedIn()), 'revokePasskey') }

  /** The mutation that revokes the passkey, proved by the passphrase or the passkey, leaving the bank unlocked. */
  function useRevokePasskey(): FormMutationResult<PasskeyRevokeCleartexts> { return useFormMutation('revokePasskey', revokePasskeyGating) }

  const useDraft = makeUseDraft({ useBank, useBox, withWhisper, demandVault })

  const bankGiver = Object.freeze({
    useBank, useStageChange, useGate, useBox, useBoxList, boxQuery, keys, withWhisper, withLockableWhisper, putBoxOnce, delBoxOnce, putBoxAction, useDraft, lock, dismissUnlock,
    useBirth, useUnlock, useReplacePassphrase, useAddPasskey, useRevokePasskey,
    birthGating, unlockGating, replacePassphraseGating, addPasskeyGating, revokePasskeyGating,
    birthMutationOptions, unlockMutationOptions, replacePassphraseMutationOptions, addPasskeyMutationOptions, revokePasskeyMutationOptions,
  })
  return { bankGiver, boxQueryOf }
}
// --

// == [Helpers]: useridOf, isBroughtUp, isBehindAt, getBoxShown, getGateShown, subscribeToNothing, bankAbsentOf, RootBoxLabelpath, boxLabelpathOf, boxLabelpathOfNamed, hostLabelpathsOf, emptyForm, Checks

/** `device`'s userid, or null for no device. */
function useridOf(device: Device | null): Userid | null {
  return (device === null) ? null : device.userid
}

/** True while `bank` is brought up, unborn, locked or unlocked: the stages its boxes and gate are fetched at. */
function isBroughtUp(bank: BankSnapshot): boolean {
  return (bank.stage === 'unborn') || (bank.stage === 'locked') || (bank.stage === 'unlocked')
}

/** True while `device`'s minder has heard of a newer revision of the Thing at `labelpath` than its item. False for no device. */
function isBehindAt(device: Device | null, labelpath: Labelpath): boolean {
  return device?.minder.isBehindAt({ ...device.scope, labelpath }) ?? false
}

/** `device`'s record of the box at `labelpath`, through its minder. */
async function getBoxShown(device: Device, labelpath: BoxLabelpath): Promise<BoxShown> {
  return await device.minder.get({ ...device.scope, labelpath })
}

/** `device`'s main gate, through its minder, as the host's React Query holds it. */
async function getGateShown(device: Device): Promise<GateShown> {
  return gateShownOf(await device.minder.get({ ...device.scope, labelpath: Labelpath.MainGate }))
}

/** The subscribe of a store that never changes, for `useSyncExternalStore` while there is no device. */
function subscribeToNothing(): () => void { return unsubscribeFromNothing }

/** The unsubscribe {@link subscribeToNothing} answers. */
function unsubscribeFromNothing(): void { /* Nothing was subscribed. */ }

/** The refusal of a call that needs `device`'s bank, while it has none: unborn, still coming up, or failed. */
function bankAbsentOf(device: Device): VaultError {
  const { stage } = device.getSnapshot().bank
  if (stage === 'unborn') { return new VaultError('absent_vault', Phrases.BankAbsent) }
  return new VaultError('absent_vault', (stage === 'failed') ? Phrases.BankFailed : Phrases.BankNotStarted)
}

/** The core's labelpath of the root box, which every box is under. */
const RootBoxLabelpath = 'box' as BoxLabelpath

/** The core's labelpath of the host's box `labelpath`, under `box/`. */
function boxLabelpathOf(labelpath: string): BoxLabelpath {
  return Checks.boxLabelpath.parse(`box/${Checks.labelpath.parse(labelpath)}`)
}

/** The core's labelpath of the box `boxNamed` names: the host's labelpath under `box/`, or a scoped object's own. */
function boxLabelpathOfNamed(boxNamed: BoxNamed): BoxLabelpath {
  return (typeof boxNamed === 'string') ? boxLabelpathOf(boxNamed) : Checks.boxScoped.parse(boxNamed).labelpath
}

// Labelpaths are flat: a box's label is the host's labelpath.
/** The host's labelpaths of the boxes the core lists at `boxLabelpaths`. */
function hostLabelpathsOf(boxLabelpaths: readonly Labelpath[]): readonly string[] {
  return boxLabelpaths.map((boxLabelpath) => Labelpath.labelOf(boxLabelpath))
}

/** Delete every field of `form`. */
function emptyForm(form: FormData): void {
  const fieldnames = new Set(form.keys())
  for (const fieldname of fieldnames) { form.delete(fieldname) }
}

/** The checks of what a host hands a bank's hooks and calls. */
const Checks = Checkers('bad_record', ({ obj, str, fn, custom }) => {
  const boxLabelpath = custom<BoxLabelpath>((val) => (typeof val === 'string') && Labelpath.isBox(val), 'Expected the labelpath of a box, such as `openai`')
  return {
    labelpath:               str.min(1),
    boxLabelpath,
    boxScoped:               obj({ labelpath: boxLabelpath }).loose(),
    fn:                      fn(),
    withLockableWhisperOpts: obj({ ifLocked: fn<WithLockableWhisperOpts<unknown>['ifLocked']>() }),
    putBoxActionOpts:        obj({ whisperOf: fn<PutBoxActionOpts['whisperOf']>(), sidecarOf: fn<NonNullable<PutBoxActionOpts['sidecarOf']>>().optional() }),
    form:                    custom<FormData>((val) => val instanceof FormData, 'Expected the FormData a form action is handed'),
  }
})
// --
