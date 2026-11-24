/** The giver: a host's React layer over one bank, made once at module scope, before anyone signs in.
 * Its provider makes a device at its mount, tells it who is signed in, and hands its hooks that device. Its hooks observe the device's QueryClient, which the signed-in user's minder caches records in.
 */

import { type DataTag, type QueryKey, type UseMutationOptions, type UseMutationResult, type UseQueryOptions, type UseQueryResult, QueryClient, mutationOptions, queryOptions, skipToken, useMutation, useQuery } from '@tanstack/react-query'
import { pick } from 'es-toolkit'
import { type ReactNode, type SyntheticEvent, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  type AddPasskeyDna, type Bank, type BankSnapshot, type BankStage, type BirthDna, type BoxCleartexts, type BoxLabelpath, type BoxRecord, type BoxUnsealed, Checkers, Device, type GateRecord, type Gating, type KeyDeriver, type Kids, Labelpath,
  type LiveOf, type LivePublicPropsOf, type MaskedView, type PasskeyWayinHeader, type PassphraseVerdict, type PassphraseWayinHeader,
  type ReplacePassphraseDna, type RevokePasskeyDna, type UnlockDna, EmptyMaskedView, PendingBank, Shell, type Sidecar, SignedOutBank, type Tombstone, type TombstoneOf, type Userid, type Vault, VaultError, type VaultDB, type Whisper, bulletproofHandlerOf,
} from 'safebyok'
import { sanitizeForeignError } from 'safebyok/storage'
import { useEffectEvent } from 'use-effect-event'
import {
  FormMutationDefaults, boxListQueryKeyOf, boxQueryKeyOf, boxesQueryKeyUnder, formMutationKeyOf, gateShownOf, liveGateOf, liveOf, recordQueryDefaults,
} from './giver-defaults'
import { type Given, GiverContext } from './giver-context'
import * as Phrases from './phrases-giver'
import { popField } from './pop-field'
import { type BoxQueryOpts, ConfigChecks, type GiverConfig, HostCallbackOpts, ScopeChecks } from './shapes-giver'
import { makeUseDraft } from './use-draft'

// == [Types]: ProviderProps, BoxShown, BoxNamed, BoxSelected, HeaderedGate, GateShown, GateSelected, GateOpts, GateResult, BoxQueryOptions, BoxQueries, WithLockableWhisperOpts, PutBoxActionOpts, PutBoxActionResult, PutBoxMutationOptions, FormMutationResult, StrengthVerdictResult, ReactGiver, BankGiver

/** The props of a giver's `Provider`. */
export type ProviderProps = Readonly<{
  /** The signed-in user's id. The first one this mount of the provider is handed signs that user in on its device; null or undefined changes nothing. */
  userid:      string | null | undefined
  /** The vaultDB to use in place of the config's: a test's `MemoryVaultDB`, say. Only the one present at the provider's mount is used. */
  vaultDB?:    VaultDB | undefined
  /** The key deriver to use in place of the config's. Only the one present at the provider's mount is used. */
  keyDeriver?: KeyDeriver | undefined
  children?:   ReactNode
}>

/** A box's record as the giver fetches it: the whole record, or null where none is stored or it was deleted. */
export type BoxShown = BoxRecord | null

/** What names a box to a bank's writes: the host's labelpath, such as `'openai'`, or an object scoped to the box, such as its record. */
export type BoxNamed = string | Readonly<{ labelpath: string }>

/** What a box's query answers by default: the live record, null where none is stored or it was deleted, or undefined. */
export type BoxSelected = LiveOf<BoxRecord> | null | undefined

/** The main gate's record as the giver shows it: each wayin by its header, without the bankKey it wraps. */
export type HeaderedGate = Omit<GateRecord, 'wayins'> & Readonly<{ wayins: Readonly<{ main: PassphraseWayinHeader, passkey0: PasskeyWayinHeader | null }> }>

/** The main gate as the giver shows it: its record by its wayins' headers, or its shell where none is stored. */
export type GateShown = HeaderedGate | Tombstone<HeaderedGate>

/** What `useGate` answers by default: the live gate, null where no bank is stored, or undefined. */
export type GateSelected = HeaderedGate | null | undefined

/** `useGate`'s options: `select` makes what the hook answers from the gate shown. */
export type GateOpts<SelT> = Readonly<{ select?: ((gate: GateShown) => SelT) | undefined }>

/** What `useGate` answers: `data`, what its `select` makes of the gate, or undefined until the device's sign-in answers. */
export type GateResult<SelT> = Readonly<{ data: SelT | undefined }>

/** The `queryOptions` of a box, for `useQuery`, `useQueries`, `queryClient.query` and the rest, run in the giver's QueryClient. */
export type BoxQueryOptions = UseQueryOptions<BoxShown, Error, BoxSelected> & Readonly<{ queryKey: DataTag<QueryKey, BoxShown, Error> }>

/** The query factories of the signed-in user's bank, from `SOK.useQueryOptions()`. */
export type BoxQueries = Readonly<{
  /** The `queryOptions` of the box at `labelpath`, to run in `client`. */
  box:    (labelpath: string) => BoxQueryOptions
  /** The QueryClient each query from `box` runs in: hand it to `useQuery` and its kin as their second argument. Set or remove nothing in it. */
  client: QueryClient
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
  /** The names of the form's fields that carry a secret, such as the ones `whisperOf` reads. Only these are deleted from the form; left out, every field is. */
  secretFieldnames?: readonly string[] | undefined
}>

/** What a {@link BankGiver.putBoxAction} resolves, for `useActionState` to keep: the box stored, or the `Error` that stopped it.
 * `texts` is the text of each field left in the form, by fieldname: empty for a write that landed.
 */
export type PutBoxActionResult = Readonly<{ box: LiveOf<BoxRecord>, err: null, texts: Readonly<Record<string, string>> }> | Readonly<{ box: null, err: Error, texts: Readonly<Record<string, string>> }>

/** React Query's options for a box write's mutation, for the host's own `useMutation`: its `mutate` is handed the form. */
export type PutBoxMutationOptions = UseMutationOptions<LiveOf<BoxRecord>, Error, FormData>

/** A form verb's mutation, through `useMutation`, with `attempt` to run it from a form or a dna. */
export type FormMutationResult<ParamsT> = UseMutationResult<void, Error, Gating> & Readonly<{
  /** Run the form verb on `params`, a form's `FormData` or a dna: hand it to a form's `action`, or call it from a submit handler.
   * The secret fields leave the `FormData` at once, and the mutation is handed the verb's gating, never the form. It
   * resolves once the mutation settles, so a `SubmitButton` stays disabled until then, and a refusal shows as `error`,
   * never as a rejection. A gating refused at the wrong stage is refused the same way, but the mutation never runs, so
   * `error` stays null: only `wasRefused` says so.
   */
  attempt:           (params: ParamsT) => Promise<void>
  /** True where the last `attempt` was refused, read as it settled: for code that runs right after it, where `error` may not have rendered yet. */
  wasRefused:        () => boolean
  /** Keep what the form's fields hold after a refused `attempt`, so the user can correct it: hand it the `onReset` of a form whose `action` runs `attempt`.
   * React empties such a form once its action ends, whatever the outcome; this cancels that reset after a refusal, and
   * only that one: a Cancel button's reset still empties the form. A form that calls `attempt` from a submit handler gets
   * no reset from React, so it needs none of this: there, the next reset after a refusal, a Cancel's too, would be cancelled.
   * `onEmptied`, where given, is called with the event each time the form is let empty, and never when its text is kept:
   * hand it what else the form forgets on a reset, such as `useNewPassphrase`'s `forget`.
   * @example
   *   <form action={unlock.attempt} onReset={unlock.keepTextIfRefused}>
   * @example
   *   <form action={birth.attempt} onReset={(event) => { birth.keepTextIfRefused(event, newPassphrase.forget) }}>
   */
  keepTextIfRefused: (event: SyntheticEvent, onEmptied?: (event: SyntheticEvent) => void) => void
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

/** What {@link reactGiver} returns: the provider, the strength hook, `maskedView` for a devtool, and `bank` for the bank's own hooks. */
export type ReactGiver<BanklabelT extends string = string> = ReturnType<typeof reactGiver<BanklabelT>>

/** The hooks and calls of a giver's bank, from `SOK.bank(banklabel)`. */
export type BankGiver = ReturnType<ReactGiver['bank']>

/** What a provider shows the hooks under it: its user's device, or none and the bank snapshot shown meanwhile; and the QueryClient they observe. */
type Shown = Readonly<{ client: QueryClient } & ({ device: Device, bank: null } | { device: null, bank: BankSnapshot })>

/** What a bank's hooks and calls read of their giver. */
type BankFriend = Readonly<{
  banklabel:    string
  /** The device of the provider mounted, or null while there is none or nobody is signed in: for the calls a host may make outside the provider. */
  signedIn:     () => Device | null
  /** The QueryClient of the provider mounted, or the giver's own while none is: for the calls a host may make outside the provider. */
  clientNow:    () => QueryClient
  demandDevice: () => Device
  demandBank:   () => Bank
  demandVault:  () => Vault
  useShown:     () => Shown
}>
// --

// == [The giver]: reactGiver, Unjudged, shownOf

/** Make the giver of one bank: hold `config`, until someone signs in. Make it once, at module scope.
 * `config` is the bank, as `banks: { mybank: { vaultDB } }`, and the options of the Device each provider makes.
 * A box's labelpath is the host's, without the `box/` the core stores it under.
 * @example
 *   export const SOK   = reactGiver({ banks: { knock: { vaultDB } }, keyDeriver })
 *   export const Knock = SOK.bank('knock')
 */
export function reactGiver<BanklabelT extends string>(config: GiverConfig<BanklabelT>) {
  const [[banklabel, { vaultDB: configVaultDB }]] = ConfigChecks.giverConfig.parse(config).banks
  const { banks: _banks, ...configDeviceOpts } = config
  // A ref, in effect: the provider's effect sets it, and the calls outside its hooks read it.
  /** The device of the provider mounted, which the calls outside its hooks act on, or null while none is. */
  let mounted: Device | null = null
  /** The QueryClient a hook observes outside every provider, where each query skips its fetch. */
  const outsideClient = new QueryClient()
  // One context for each giver, so a hook of one giver never reads the device of another giver's provider.
  /** The device the nearest provider of this giver shows its children, or signed out outside every one. */
  const ShownContext = createContext<Shown>({ device: null, bank: SignedOutBank, client: outsideClient })

  /** The device of the provider mounted, while someone is signed in on it, or null. */
  function signedInDevice(): Device | null {
    return (typeof mounted?.userid === 'string') ? mounted : null
  }

  /** The signed-in user's device. Refuses `absent_vault` while nobody is signed in, or no provider is mounted. */
  function demandDevice(): Device {
    const device = signedInDevice()
    if (device === null) { throw new VaultError('absent_vault', Phrases.NobodySignedIn) }
    return device
  }

  /** The signed-in user's bank. Refuses `absent_vault` while nobody is signed in, while the bank is unborn, until the device's sign-in answers, or where it failed to come up. */
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

  /** Says who is signed in: mount it once, at the root, inside the host's `QueryClientProvider`, which runs the form verbs' mutations.
   * It makes a device at its mount, and signs in on it the first userid it is handed, for the life of this mount. A null or undefined userid changes nothing.
   * Under it, a hook never shows a device whose userid is not the prop's: it shows `starting` instead. Until its effects run,
   * as in a server render, a hook shows `starting` for a userid and `signed_out` for none.
   * The calls that are not hooks act on the device of the provider mounted, and refuse once it unmounts. Unmounting ends nothing.
   * Mount one at a time: under two mounted at once, those calls act on the one mounted last, until it unmounts.
   * The parts and the kit beneath it use its giver and bank, unless handed their own as props.
   */
  function Provider({ userid, vaultDB, keyDeriver, children }: ProviderProps) {
    // StrictMode makes a second device and discards it, and a server render discards its own: making one does no I/O,
    // and subscribes to nothing. The hooks observe its QueryClient from their first render, before anyone signs in.
    // Cheat (react_life): a fresh device_tok for each device. Nothing keeps one across a reload yet.
    const [device] = useState(() => Device.make({ banklabel, device_tok: globalThis.crypto.randomUUID() }, {
      ...configDeviceOpts, vaultDB: vaultDB ?? configVaultDB, ...(keyDeriver && { keyDeriver }),
    }))
    /** The device, once a userid is signed in on it. */
    const [signedIn, setSignedIn] = useState<Device | null>(null)
    // The device serves its first user for its life: each later `signin`, StrictMode's second run of the effect among them,
    // answers as the first and starts nothing more.
    const signin = useEffectEvent((user: string) => {
      void device.signin(user)
      setSignedIn(device)
    })
    useEffect(() => {
      mounted = device
      void device.hello()
      return () => { if (mounted === device) { mounted = null } }
    }, [device])
    useEffect(() => { if (typeof userid === 'string') { signin(userid) } }, [userid])
    const shown = useMemo(() => shownOf(signedIn, userid, device.vaultTsqClient), [signedIn, userid, device])
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

  const { bankGiver, boxQueryOf } = makeBankGiver({
    banklabel, signedIn: signedInDevice, clientNow: () => mounted?.vaultTsqClient ?? outsideClient, demandDevice, demandBank, demandVault, useShown,
  })

  /** The query factories of the signed-in user's bank, by banklabel, for the host's own `useQuery` and its kin, with the QueryClient they run in.
   * Every key it makes is the user's: it re-renders when the user changes, so each query made from it changes key with them.
   * Until the device's sign-in answers, a query from it fetches nothing.
   * @example
   *   const sok = SOK.useQueryOptions()
   *   const { data: box } = useQuery(sok.knock.box('jokes'), sok.knock.client)
   */
  function useQueryOptions(): Readonly<Record<BanklabelT, BoxQueries>> {
    const { device: shownDevice, client } = useShown()
    const isFetchable = bankGiver.useBank(isFetchStage)
    return useMemo(() => {
      const queries: BoxQueries = Object.freeze({ box: (labelpath: string) => boxQueryOf(shownDevice, labelpath, isFetchable), client })
      return Object.freeze({ [banklabel]: queries }) as Record<BanklabelT, BoxQueries>
    }, [shownDevice, isFetchable, client])
  }

  // The device stays out of a host's reach: what leaves is the core's copy, each ciphertext masked, and the lease's loggable.
  /** The mounted provider's bank TSQ, vault TSQ and lease, masked for a devtool, as `device.maskedView()` does.
   * For experimenting, never for an app's own logic: what it answers may change without notice. While no provider is mounted, or nobody is signed in, it answers `EmptyMaskedView`.
   * It is no hook: call it again to see what changed.
   */
  function maskedView(): MaskedView { return mounted?.maskedView() ?? EmptyMaskedView }

  const giver = Object.freeze({
    Provider,
    useStrengthVerdict,
    useQueryOptions,
    maskedView,
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

/** What a provider handed `userid` shows its children of `device`, its device once signed in: none while it is another user's or nobody is signed in on it, stage `starting` for a userid and `signed_out` for none. */
function shownOf(device: Device | null, userid: string | null | undefined, client: QueryClient): Shown {
  if ((device !== null) && ((typeof userid !== 'string') || (device.userid === userid))) { return { device, bank: null, client } }
  return { device: null, bank: (typeof userid === 'string') ? PendingBank : SignedOutBank, client }
}
// --

// == [The bank]: makeBankGiver

/** The hooks and calls of the bank `friend` serves. */
function makeBankGiver(friend: BankFriend) {
  const { banklabel, signedIn, clientNow, demandDevice, demandBank, demandVault, useShown } = friend

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
  /** The `queryOptions` of the box at `labelpath` in `device`'s bank, skipping the fetch unless `isFetchable`, true at a stage the bank's boxes are fetched at. */
  function boxQueryOf(device: Device | null, labelpath: string, isFetchable: boolean): BoxQueryOptions {
    return queryOptions({ ...boxQueryBaseOf(device, labelpath, isFetchable), select: liveOf<BoxRecord> })
  }

  // Left with no queryFn, a query of the minder's item fetches by the client's own, which asks the minder of the item's
  // bank and lands the record as a get's.
  /** {@link boxQueryOf}, less its `select`. */
  function boxQueryBaseOf(device: Device | null, labelpath: string, isFetchable: boolean): Pick<UseQueryOptions<BoxShown>, 'queryKey' | 'queryFn' | 'networkMode' | 'staleTime' | 'structuralSharing'> {
    const boxLabelpath = boxLabelpathOf(labelpath)
    return {
      ...recordQueryDefaults(boxLabelpath, () => isBehindAt(device, boxLabelpath), (scoped) => device?.minder.deadAt(scoped)),
      queryKey: boxQueryKeyOf({ userid: useridOf(device), banklabel, labelpath: boxLabelpath }),
      ...((! isFetchable || (device === null)) && { queryFn: skipToken }),
    }
  }

  /** The `queryOptions` of the box at `labelpath`, for whoever is signed in when called: for a route loader or a prefetch.
   * Run it in {@link queryClient}'s client, not the host's. Its `data` is what {@link useBox} answers. Until the device's sign-in answers,
   * it fetches nothing, and `query` rejects: a loader waits for the stage to show `locked` or `unlocked` first.
   * In a component, take the giver's `useQueryOptions()` instead, as {@link queryClient} says.
   * @example
   *   loader: () => Knock.queryClient().query(Knock.boxQuery('jokes'))
   */
  function boxQuery(labelpath: string): BoxQueryOptions {
    const device = signedIn()
    return boxQueryOf(device, labelpath, (device !== null) && isFetchStage(device.getSnapshot().bank))
  }

  /** The QueryClient that {@link boxQuery}'s queries and {@link keys} run in: the provider's mounted when called, or one where every query fetches nothing while none is.
   * The records of the signed-in user's bank are cached there. Read, invalidate or refetch there; set or remove nothing.
   * A provider counts as mounted only once its effects have run, and `useQuery` keeps the client of its first render: called in the
   * provider's first render, this answers the one where nothing is fetched, and the hook never shows a later revision. In a component, take the giver's
   * `useQueryOptions()` and its `client`, the provider's from the first render.
   */
  function queryClient(): QueryClient { return clientNow() }

  /** The box's stored record, through React Query, its whisper still sealed.
   * `data` is the record, null when none is stored or it was deleted, and undefined while pending or until the device's sign-in answers.
   * A record overtaken by a newer revision shows until the newer one arrives.
   * `opts` are React Query's options that shape what this one hook shows. A `select` given there is handed the whole record, or
   * null where none is stored or it was deleted: {@link liveOf} is the default. A `select` that returns a record should return it, or the item's own null,
   * never a null of its own: the hook reads null as nothing stored.
   * @example
   *   const { data: box } = Knock.useBox('jokes')
   *   const mask = Knock.useBox('jokes', { select: (thing) => liveOf(thing)?.sidecar['mask'] }).data
   */
  function useBox<SelT = BoxSelected>(labelpath: string, opts: BoxQueryOpts<BoxShown, SelT> = {}): UseQueryResult<SelT> {
    const { device, client } = useShown()
    const isFetchable = useBank(isFetchStage)
    const shaping = pick(opts, BoxShapingOptnames)
    return useQuery<BoxShown, Error, SelT>({ ...boxQueryBaseOf(device, labelpath, isFetchable), select: liveOf as (thing: BoxShown) => SelT, ...shaping }, client)
  }

  // The gate is read from the world in the device's BankMinder at each render, and React keeps only the gate shown: the
  // whole gate, with the bankKeys its wayins wrap, stays in the BankMinder.
  /** The bank's main gate: its wayins' headers, never the bankKey they wrap. Synchronous: it never waits and never suspends.
   * `data` is the gate, null when no bank is stored, and undefined until the device's sign-in answers.
   * Its `wayins.passkey0` is the header of the bank's passkey, or null while it has none: a passkey added or revoked on any device shows here.
   * Given `select`, `data` is what `select` makes of the gate.
   * @example
   *   const passkeyHeader = Knock.useGate({ select: passkeyHeaderOf }).data
   *   {(passkeyHeader === null) && <AddPasskeyForm username={user.email} />}
   */
  function useGate<SelT = GateSelected>(opts: GateOpts<SelT> = {}): GateResult<SelT> {
    const { device } = useShown()
    const isFetchable = useBank(isFetchStage)
    const { select = liveGateOf as (gate: GateShown) => SelT } = opts
    const subscribe = useCallback((onChange: () => void) => ((device === null) ? unsubscribeFromNothing : device.bankMinder.subscribe(onChange)), [device])
    const shownNow = () => ((isFetchable && (device !== null)) ? gateShownOfWorld(device) : undefined)
    const shown = useSyncExternalStore(subscribe, shownNow, shownNow)
    return { data: (shown === undefined) ? undefined : select(shown) }
  }

  // The minder's listing fetches by a list, so the hook's first render once the bank is up lists the root box.
  /** The labelpaths of the bank's boxes, through React Query, for a list that renders each one by {@link useBox}.
   * `data` is the labelpaths in labelpath order, and undefined until the first list lands. It is the same array until the labelpaths change.
   * A deleted box stays listed, and its `useBox` answers null. It lists again only on evidence, never on a remount, window focus or reconnect:
   * a box this device writes or hears of for the first time, or `invalidateQueries` on {@link keys}`.boxList()`. The box joins when that list lands.
   * A list refused shows as its `error`.
   * @example
   *   const { data: labelpaths } = Knock.useBoxList()
   *   labelpaths?.map((labelpath) => <JokeRow key={labelpath} labelpath={labelpath} />)
   */
  function useBoxList(): UseQueryResult<readonly string[]> {
    const { device, client } = useShown()
    const isFetchable = useBank(isFetchStage)
    return useQuery<Kids, Error, readonly string[]>({
      queryKey: boxListQueryKeyOf({ userid: useridOf(device), banklabel }),
      ...((! isFetchable || (device === null)) && { queryFn: skipToken }),
      select:   hostLabelpathsOf,
      staleTime: Infinity,
    }, client)
  }

  /** The keys of the signed-in user's boxes in {@link queryClient}'s client, reading whoever is signed in when called. */
  const keys = Object.freeze({
    /** The key of the box at `labelpath`'s query. */
    box:   (labelpath: string): QueryKey => boxQueryKeyOf({ userid: useridOf(signedIn()), banklabel, labelpath: boxLabelpathOf(labelpath) }),
    /** The key that starts the key of the box at `labelpath` and of every box under it, or of every box when left out: for `invalidateQueries`.
     * @example
     *   void Knock.queryClient().invalidateQueries({ queryKey: Knock.keys.under('jokes') })
     */
    under: (labelpath?: string): QueryKey => boxesQueryKeyUnder({ userid: useridOf(signedIn()), banklabel, labelpath: (labelpath === undefined) ? RootBoxLabelpath : boxLabelpathOf(labelpath) }),
    /** The key of {@link useBoxList}'s query, which no key from `under` starts. */
    boxList: (): QueryKey => boxListQueryKeyOf({ userid: useridOf(signedIn()), banklabel }),
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

  // Each write tries once. By the time it resolves, the minder has cached what was written, in the item a hook shows.

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
  // With its secret fields deleted before the first await, it holds the whisper during no render.
  /** A form action for `useActionState` that writes the box `boxNamed` names from the form's fields, as {@link putBoxOnce} does.
   * Make it at module scope, or under `useMemo`, so its checks run once.
   * It reads the whisper with `opts.whisperOf`, and the sidecar with `opts.sidecarOf`, then deletes the form's secret fields before it writes: every field, or only those `opts.secretFieldnames` names.
   * Name every field that carries a secret: one `whisperOf` reads that you leave out stays in the `FormData` React retains.
   * It never rejects: it resolves the box stored, or the `Error` that stopped it, a refusal or what `whisperOf`, `sidecarOf` or the vaultDB threw.
   * A refusal also carries `texts`, the text of each field left in the form (a file's field is left out), for `defaultValue`: React resets the form once the action ends, and these put back what the user typed.
   * An `Error` thrown arrives as it is; anything else thrown arrives wrapped in an `Error`, a thrown string as its message.
   * @example
   *   const [put, putAction, isPutting] = useActionState(useMemo(() => Knock.putBoxAction('jokes', {
   *     whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
   *     sidecarOf: (whisper, form) => ({ title: String(form.get('title')), mask: mask(String(whisper['apiKey']), { tail: 0 }) }),
   *     secretFieldnames: ['apiKey'],
   *   }), []), null)
   *   <form action={putAction}>
   *     <input name="title" defaultValue={put?.texts['title']} />
   *     <input name="apiKey" type="password" />
   *     <button disabled={isPutting}>Save</button>
   *   </form>
   */
  function putBoxAction(boxNamed: BoxNamed, opts: PutBoxActionOpts): (prior: PutBoxActionResult | null, form: FormData) => Promise<PutBoxActionResult> {
    const boxLabelpath = boxLabelpathOfNamed(boxNamed)
    const readForm = formReaderOf(opts)
    return async (_prior, form) => {
      try {
        const [patch, secrets] = readForm(form)
        return { box: await putBoxOnceAt(boxLabelpath, patch, secrets), err: null, texts: {} }
      } catch (err) {
        return { box: null, err: sanitizeForeignError(err), texts: textsOfForm(form) }
      }
    }
  }

  /** React Query's options for writing the box `boxNamed` names from a form, for the host's own `useMutation`: its `mutate` is handed the `FormData`, as {@link putBoxAction}'s action is.
   * Make them under `useMemo`, so their checks run once: their `mutationKey` names the user signed in when they are made.
   * The mutation reads the whisper with `opts.whisperOf` and the sidecar with `opts.sidecarOf`, deletes the form's secret fields, then writes as {@link putBoxOnce} does.
   * Every field, or only those `opts.secretFieldnames` names: name every field that carries a secret, since one `whisperOf` reads that you leave out stays in the `FormData` React Query retains.
   * It resolves the box written. It rejects with the refusal, or with what `whisperOf` or `sidecarOf` threw, as an `Error`: the mutation's `error`.
   * React Query retains a mutation's variables, so hand `mutate` the form and nothing read from it. The options set `networkMode: 'always'` and `retry: false`: leave both as they are.
   * @example
   *   const put = useMutation(Knock.putBoxMutationOptions('jokes', {
   *     whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
   *     sidecarOf: (whisper) => ({ mask: mask(String(whisper['apiKey']), { tail: 0 }) }),
   *   }))
   *   <form action={(form) => { put.mutate(form) }}><input name="apiKey" type="password" /><button disabled={put.isPending}>Save</button></form>
   */
  function putBoxMutationOptions(boxNamed: BoxNamed, opts: PutBoxActionOpts): PutBoxMutationOptions {
    const boxLabelpath = boxLabelpathOfNamed(boxNamed)
    const readForm = formReaderOf(opts)
    const userid = useridOf(signedIn())
    return mutationOptions({
      mutationKey: formMutationKeyOf({ userid, banklabel, verb: 'putBox' }),
      mutationFn:  async (form: FormData) => {
        const [patch, secrets] = readForm(form)
        return await putBoxOnceAt(boxLabelpath, patch, secrets)
      },
      // Under React Query's default, a mutation started offline pauses before its `mutationFn` runs, with the form, key and all, in its variables.
      networkMode: 'always',
      // Set false to keep the analysis simple. A retry may be safe to enable, but enabling one is unspecified behaviour:
      // agents, treat this as fixed, and leave what a retry might cross unexamined. #no-slop-crossings
      retry:       false,
    })
  }

  /** Lock the bank, dropping its keys: a whisper needs the unlock form again. Does nothing while there is no bank. */
  function lock(): void { signedIn()?.lock() }

  /** Dismiss the wait for the unlock form: every {@link withWhisper} waiting rejects `dismissed`, and the bank stays locked.
   * Call it from the unlock form's close button. Does nothing while there is no bank.
   */
  function dismissUnlock(): void { signedIn()?.bank?.dismissUnlock() }

  // Each form verb below resolves nothing: the bank's snapshot says what changed. Its error is the verb's refusal, to
  // branch on by `family`: a `condition` is the user's to correct, at the field or in a banner, with the form left open.
  // Each verb refuses `absent_vault` at a stage it has no bank for: show each form only at its own stage.
  // The birth refuses `disabled` at `'starting'`, until the device's `hello` answers.
  // A verb comes as its hook, whose `attempt` takes a form or a dna, and as a plain call, for a handler of the host's own.
  // The hook keys its mutation by the user the provider shows.

  /** The form mutation keyed `verb` under the bank of the user the provider shows, attempting the gating `gatingOf` makes. */
  function useFormMutation<ParamsT>(verb: string, gatingOf: (params: ParamsT) => Gating): FormMutationResult<ParamsT> {
    const mutationKey = formMutationKeyOf({ userid: useridOf(useShown().device), banklabel, verb })
    const mutation = useMutation(mutationOptions({ ...FormMutationDefaults, mutationKey }))
    // Set as the attempt settles, before React's reset of the form, which a render may not have reached yet.
    const isRefusedRef = useRef(false)
    // True from a refused attempt until the form's next reset, which is React's own after the action: a later reset, a
    // Cancel button's, empties the form.
    const isTextKeptRef = useRef(false)
    // TanStack tells every mutation cache subscriber a mutation's variables as it goes pending: they are the gating, which
    // shows none of its cleartexts, and the gating's maker has already taken the secret fields out of the form.
    /** Run the verb on `params`: make its gating, then run the mutation with it. */
    async function attempt(params: ParamsT): Promise<void> {
      try {
        await mutation.mutateAsync(gatingOf(params))
        isRefusedRef.current = false
      } catch {
        isRefusedRef.current = true
      }
      isTextKeptRef.current = isRefusedRef.current
    }
    /** True where the last attempt was refused. */
    function wasRefused(): boolean { return isRefusedRef.current }
    /** Cancel the form's first reset after a refused attempt; call `onEmptied` on any other. */
    function keepTextIfRefused(event: SyntheticEvent, onEmptied?: (event: SyntheticEvent) => void): void {
      Checks.onEmptied.parse(onEmptied)
      if (isTextKeptRef.current) { event.preventDefault() } else { onEmptied?.(event) }
      isTextKeptRef.current = false
    }
    return { ...mutation, attempt, wasRefused, keepTextIfRefused }
  }

  /** Birth the bank under the new passphrase in `params`, a form or a dna, with no hook: for a submit handler or a `mutationFn` of your own.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields at once. Hand a mutation of your own nothing of the form.
   */
  async function gatingBirthAttempt(params: FormData | BirthDna): Promise<void> { await demandDevice().gatingBirthAttempt(params) }

  /** The mutation that births the bank, at stage `unborn`, leaving it unlocked: hand its `attempt` the form, whose new passphrase is the field `passphrase`.
   * Disable the submit until the giver's `useStrengthVerdict` judges the passphrase strong.
   * @example
   *   const birth = Knock.useBirth()
   *   <form action={birth.attempt} onReset={birth.keepTextIfRefused}>
   */
  function useBirth(): FormMutationResult<FormData | BirthDna> { return useFormMutation('birth', (params: FormData | BirthDna) => demandDevice().birthGating(params)) }

  /** Unlock the bank by the passphrase or the passkey's answer in `params`, a form or a dna, with no hook: for a submit handler or a `mutationFn` of your own.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields at once. Hand a mutation of your own nothing of the form.
   */
  async function gatingUnlockAttempt(params: FormData | UnlockDna): Promise<void> { await demandBank().gate.gatingUnlockAttempt(params) }

  /** The mutation that unlocks the bank by its passphrase or its passkey: hand its `attempt` the form, whose passphrase is the field `passphrase`, or `{ passkeyAnswer }`.
   * Every {@link withWhisper} waiting resumes. A wrong passphrase or passkey refuses, and the bank stays locked.
   * @example
   *   const unlock = Knock.useUnlock()
   *   <form action={unlock.attempt} onReset={unlock.keepTextIfRefused}>
   */
  function useUnlock(): FormMutationResult<FormData | UnlockDna> { return useFormMutation('unlock', (params: FormData | UnlockDna) => demandBank().gate.unlockGating(params)) }

  /** Replace the passphrase by the `nextPassphrase` in `params`, a form or a dna, proved by its `passphrase` or passkey answer, with no hook: for a submit handler or a `mutationFn` of your own.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields at once. Hand a mutation of your own nothing of the form.
   */
  async function gatingReplacePassphraseAttempt(params: FormData | ReplacePassphraseDna): Promise<void> { await demandBank().gate.gatingReplacePassphraseAttempt(params) }

  /** The mutation that replaces the passphrase, proved by the current passphrase or the passkey, leaving the bank unlocked: hand its `attempt` the form, with the fields `passphrase` and `nextPassphrase`.
   * Disable the submit until the giver's `useStrengthVerdict` judges the new passphrase strong.
   */
  function useReplacePassphrase(): FormMutationResult<FormData | ReplacePassphraseDna> {
    return useFormMutation('replacePassphrase', (params: FormData | ReplacePassphraseDna) => demandBank().gate.replacePassphraseGating(params))
  }

  /** Add the passkey whose answer is the `nextPasskeyAnswer` in `params`, proved by its `passphrase`, with no hook: for a submit handler or a `mutationFn` of your own. */
  async function gatingAddPasskeyAttempt(params: AddPasskeyDna): Promise<void> { await demandBank().gate.gatingAddPasskeyAttempt(params) }

  /** The mutation that adds a passkey, proved by the passphrase, leaving the bank unlocked: hand its `attempt` `{ passphrase, nextPasskeyAnswer }`, as a form cannot carry the answer.
   * Run the WebAuthn ceremony in the click handler, before anything slow (the browser requires it).
   */
  function useAddPasskey(): FormMutationResult<AddPasskeyDna> { return useFormMutation('addPasskey', (params: AddPasskeyDna) => demandBank().gate.addPasskeyGating(params)) }

  /** Revoke the passkey, proved by the `passphrase` or the passkey's answer in `params`, a form or a dna, with no hook: for a submit handler or a `mutationFn` of your own.
   * A `FormData` loses its `passphrase`, `nextPassphrase` and `confirmation` fields at once. Hand a mutation of your own nothing of the form.
   */
  async function gatingRevokePasskeyAttempt(params: FormData | RevokePasskeyDna): Promise<void> { await demandBank().gate.gatingRevokePasskeyAttempt(params) }

  /** The mutation that revokes the passkey, proved by the passphrase or the passkey, leaving the bank unlocked: hand its `attempt` the form, whose passphrase is the field `passphrase`. */
  function useRevokePasskey(): FormMutationResult<FormData | RevokePasskeyDna> { return useFormMutation('revokePasskey', (params: FormData | RevokePasskeyDna) => demandBank().gate.revokePasskeyGating(params)) }

  const useDraft = makeUseDraft({ useBank, useBox, withWhisper, demandVault })

  const bankGiver = Object.freeze({
    useBank, useStageChange, useGate, useBox, useBoxList, boxQuery, queryClient, keys, withWhisper, withLockableWhisper, putBoxOnce, delBoxOnce, putBoxAction, putBoxMutationOptions, useDraft, lock, dismissUnlock,
    useBirth, useUnlock, useReplacePassphrase, useAddPasskey, useRevokePasskey,
    gatingBirthAttempt, gatingUnlockAttempt, gatingReplacePassphraseAttempt, gatingAddPasskeyAttempt, gatingRevokePasskeyAttempt,
  })
  return { bankGiver, boxQueryOf }
}
// --

// == [Helpers]: useridOf, isFetchStage, isBehindAt, GateShownOfCkey, gateShownOfWorld, BoxShapingOptnames, subscribeToNothing, bankAbsentOf, RootBoxLabelpath, boxLabelpathOf, boxLabelpathOfNamed, hostLabelpathsOf, formReaderOf, textsOfForm, emptyForm, Checks

/** `device`'s userid, or null for no device. */
function useridOf(device: Device | null): Userid | null {
  return (device === null) ? null : device.userid
}

/** True while `bank` is unborn, locked or unlocked: the stages its boxes and gate are fetched at. */
function isFetchStage(bank: BankSnapshot): boolean {
  return (bank.stage === 'unborn') || (bank.stage === 'locked') || (bank.stage === 'unlocked')
}

/** True while `device`'s minder has heard of a newer revision of the Thing at `labelpath` than its item. False for no device. */
function isBehindAt(device: Device | null, labelpath: Labelpath): boolean {
  return device?.minder.isBehindAt({ ...device.scope, labelpath }) ?? false
}

// useSyncExternalStore wants the same snapshot until the store changes, and the world's gate record is the same object
// until a newer one lands. Weakly held: the BankMinder alone keeps the gate record alive.
/** The gate shown for each world's gate record, or for each device whose BankMinder has no world of its bank. */
const GateShownOfCkey = new WeakMap<GateRecord | Device, GateShown>()

/** `device`'s main gate, from its bank's world, as the giver shows it: its shell where no world is heard of. The same object until the world's gate changes. */
function gateShownOfWorld(device: Device): GateShown {
  const gate = device.bankMinder.worldAt()?.gate
  const ckey = gate ?? device
  const cached = GateShownOfCkey.get(ckey)
  if (cached !== undefined) { return cached }
  const shown = gateShownOf(gate ?? Shell.of({ ...device.scope, labelpath: Labelpath.MainGate }))
  GateShownOfCkey.set(ckey, shown)
  return shown
}

/** The options of React Query's that a record hook takes from its caller: those that shape what that one hook shows. */
const BoxShapingOptnames = ['select', 'placeholderData', 'notifyOnChangeProps'] as const

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

// Labelpaths are flat: a box's label is the host's labelpath. Labels sort by code unit, as the vaultDB lists them.
/** The host's labelpaths of the boxes a list answered as `kids`, live and deleted, in labelpath order. */
function hostLabelpathsOf(kids: Kids): readonly string[] {
  return [...Object.keys(kids.items), ...Object.keys(kids.gones)].toSorted((one, other) => ((one < other) ? -1 : 1)) // eslint-disable-line unicorn/prefer-simple-sort-comparator
}

/** The patch and the secrets of a box write, read from a form with the host's `opts` and then stripped of its secret fields, whether or not they could be read.
 * The secret fields are those `opts.secretFieldnames` names, or every field where it is left out.
 */
function formReaderOf(opts: PutBoxActionOpts): (form: FormData) => [LivePublicPropsOf<BoxRecord, BoxCleartexts>, BoxCleartexts] {
  const { whisperOf: hostWhisperOf, sidecarOf: hostSidecarOf, secretFieldnames } = Checks.putBoxActionOpts.parse(opts)
  const whisperOf = bulletproofHandlerOf(hostWhisperOf, HostCallbackOpts)
  const sidecarOf = hostSidecarOf && bulletproofHandlerOf(hostSidecarOf, HostCallbackOpts)
  return (form) => {
    Checks.form.parse(form)
    try {
      const whisper = whisperOf(form)
      return [sidecarOf ? { sidecar: sidecarOf(whisper, form) } : {}, { whisper }]
    } finally {
      if (secretFieldnames === undefined) { emptyForm(form) } else { for (const fieldname of secretFieldnames) { popField(form, fieldname) } }
    }
  }
}

/** The text of each field of `form`, by fieldname, leaving out a file's field: none for anything that is no `FormData`. */
function textsOfForm(form: unknown): Readonly<Record<string, string>> {
  if (! (form instanceof FormData)) { return {} }
  const texts = new Map<string, string>()
  for (const [fieldname, val] of form) {
    if ((typeof val === 'string') && ! texts.has(fieldname)) { texts.set(fieldname, val) }
  }
  return Object.fromEntries(texts)
}

/** Delete every field of `form`. */
function emptyForm(form: FormData): void {
  const fieldnames = new Set(form.keys())
  for (const fieldname of fieldnames) { form.delete(fieldname) }
}

/** The checks of what a host hands a bank's hooks and calls. */
const Checks = Checkers('bad_record', ({ obj, arr, str, fn, custom }) => {
  const boxLabelpath = custom<BoxLabelpath>((val) => (typeof val === 'string') && Labelpath.isBox(val), 'Expected the labelpath of a box, such as `openai`')
  return {
    labelpath:               str.min(1),
    boxLabelpath,
    boxScoped:               obj({ labelpath: boxLabelpath }).loose(),
    fn:                      fn(),
    onEmptied:               fn<(event: SyntheticEvent) => void>().optional(),
    withLockableWhisperOpts: obj({ ifLocked: fn<WithLockableWhisperOpts<unknown>['ifLocked']>() }),
    putBoxActionOpts:        obj({ whisperOf: fn<PutBoxActionOpts['whisperOf']>(), sidecarOf: fn<NonNullable<PutBoxActionOpts['sidecarOf']>>().optional(), secretFieldnames: arr(str.min(1)).optional() }),
    form:                    custom<FormData>((val) => val instanceof FormData, 'Expected the FormData a form action is handed'),
  }
})
// --
