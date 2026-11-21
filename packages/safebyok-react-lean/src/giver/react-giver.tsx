/** The giver: a host's React layer over one bank, made once at module scope, before anyone signs in.
 * Its provider says who is signed in. Its hooks read the slot the provider fills, and records come through the host's React Query.
 */

import { type DataTag, type QueryKey, type UseMutationResult, type UseQueryOptions, type UseQueryResult, queryOptions, skipToken, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  Bank, type BankSnapshot, type BirthCleartexts, type BoxCleartexts, type BoxLabelpath, type BoxRecord, type BoxUnsealed, Checkers, type Gating, type KeyDeriver, Labelpath, type LiveOf,
  type LivePublicPropsOf, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts, type PasskeyWayinHeader, type PassphraseReplaceCleartexts, type PassphraseVerdict, PendingBank, type Sidecar, type Tombstone,
  type TombstoneOf, type UnlockCleartexts, type Userid, type VaultDB, type Whisper,
} from 'safebyok'
import { FormMutationDefaults, ListingQueryDefaults, boxListQueryKeyOf, boxQueryKeyOf, boxesQueryKeyUnder, nullifyThing, recordQueryDefaults } from './giver-defaults'
import { type GiverConfig, type GiverSlotSnapshot, GiverSlot } from './giver-slot'
import { type BoxQueryOpts, ScopeChecks } from './shapes-giver'

// == [Types]: ProviderProps, BoxShown, BoxNamed, BoxSelected, BoxQueryOptions, BoxQueries, PutBoxActionOpts, PutBoxActionResult, FormMutationResult, StrengthVerdictResult, ReactGiver, BankGiver

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

/** The `queryOptions` of a box, for `useQuery`, `useQueries`, `queryClient.query` and the rest. */
export type BoxQueryOptions = UseQueryOptions<BoxShown, Error, BoxSelected> & Readonly<{ queryKey: DataTag<QueryKey, BoxShown, Error> }>

/** The query factories of the signed-in user's bank, from `SOK.useQueryOptions()`. */
export type BoxQueries = Readonly<{
  /** The `queryOptions` of the box at `labelpath`. */
  box: (labelpath: string) => BoxQueryOptions
}>

/** How a {@link BankGiver.putBoxAction} reads the form it is handed. */
export type PutBoxActionOpts = Readonly<{
  /** The box's whisper, read from the form's fields. */
  whisperOf:  (form: FormData) => Whisper
  /** The box's sidecar, from the whisper read and the form's fields. Left out, the box keeps the sidecar it has, and a box written for the first time refuses for want of one. */
  sidecarOf?: ((whisper: Whisper, form: FormData) => Sidecar) | undefined
}>

/** What a {@link BankGiver.putBoxAction} resolves, for `useActionState` to keep: the box stored, or why it was not. */
export type PutBoxActionResult = Readonly<{ box: LiveOf<BoxRecord>, error: null }> | Readonly<{ box: null, error: unknown }>

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
  lastErr:   unknown
  /** Ask the signed-in user's strength checker for its verdict on `passphrase`, resolving once it lands. Never rejects.
   * Call it as the user types, with the field's value.
   */
  judge:     (passphrase: string) => Promise<void>
}>

/** What {@link reactGiver} returns: the provider, the strength hook, and `bank` for the bank's own hooks. */
export type ReactGiver<BanklabelT extends string = string> = ReturnType<typeof reactGiver<BanklabelT>>

/** The hooks and calls of a giver's bank, from `SOK.bank(banklabel)`. */
export type BankGiver = ReturnType<ReactGiver['bank']>
// --

// == [The giver]: reactGiver, Unjudged

/** Make the giver of one bank: hold `config`, and an empty slot for whoever signs in. Make it once, at module scope.
 * `config` is the bank, as `banks: { mybank: { vaultDB } }`, and the options of each Device it makes.
 * A box's labelpath is the host's, without the `box/` the core stores it under.
 * @example
 *   export const SOK   = reactGiver({ banks: { knock: { vaultDB } }, keyDeriver })
 *   export const Knock = SOK.bank('knock')
 */
export function reactGiver<BanklabelT extends string>(config: GiverConfig<BanklabelT>) {
  const slot = GiverSlot.make(config)
  /** The provider's userid prop, for the hooks under it to compare with the slot's device. */
  const UseridContext = createContext<string | null | undefined>(undefined)

  /** Says who is signed in: mount it once, at the root, inside the host's `QueryClientProvider`.
   * The first userid starts that user's device. A null or undefined userid changes nothing, and neither does unmounting.
   * Under it, a hook never shows a device whose userid is not the prop's: it shows `starting` instead.
   */
  function Provider({ userid, vaultDB, keyDeriver, children }: ProviderProps) {
    const client = useQueryClient()
    // This effect has no cleanup, and that is deliberate: the device lives for the page, and a second run, such as
    // StrictMode's, finds the slot full and does nothing. A null userid, or an unmount, leaves the device running.
    useEffect(() => {
      if (typeof userid === 'string') { slot.start(userid, { client, vaultDB, keyDeriver }) }
    }, [userid, client, vaultDB, keyDeriver])
    return <UseridContext value={userid}>{children}</UseridContext>
  }

  /** What `pick` reads of the slot's snapshot, as the provider's children see it: `starting`, with no userid, while the device is not the prop's user's. */
  function useShownSnapshot<SelT>(pick: (snap: GiverSlotSnapshot) => SelT): SelT {
    const userid = useContext(UseridContext)
    const shownOf = () => {
      const snap = slot.getSnapshot()
      return pick(((typeof userid === 'string') && (snap.userid !== userid)) ? StartingSlot : snap)
    }
    return useSyncExternalStore(slot.subscribe, shownOf, shownOf)
  }

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
        const verdict = await slot.demandDevice().judgeStrength(passphrase)
        if (ownseq === judgeseq.current) { setJudged({ verdict, isJudging: false, lastErr: null }) }
      } catch (err) {
        if (ownseq === judgeseq.current) { setJudged({ verdict: null, isJudging: false, lastErr: err }) }
      }
    }, [])
    return { ...judged, judge }
  }

  const { bankGiver, boxQueryOf } = makeBankGiver(slot, useShownSnapshot)

  /** The query factories of the signed-in user's bank, by banklabel, for the host's own `useQuery` and its kin.
   * Every key it makes is the user's: it re-renders when the user changes, so each query made from it changes key with them.
   * While nobody is signed in, a query from it fetches nothing.
   * @example
   *   const sok = SOK.useQueryOptions()
   *   const { data: box } = useQuery(sok.knock.box('jokes'))
   */
  function useQueryOptions(): Readonly<Record<BanklabelT, BoxQueries>> {
    const userid = useShownSnapshot((snap) => snap.userid)
    return useMemo(() => {
      const queries: BoxQueries = Object.freeze({ box: (labelpath: string) => boxQueryOf(userid, labelpath) })
      return Object.freeze({ [slot.banklabel]: queries }) as Record<BanklabelT, BoxQueries>
    }, [userid])
  }

  return Object.freeze({
    Provider,
    useStrengthVerdict,
    useQueryOptions,
    /** The hooks and calls of the giver's bank, refusing any other banklabel. Name the result in PascalCase (`const Knock = SOK.bank('knock')`), so the rules-of-hooks lint checks `Knock.useBank()`. */
    bank: (banklabel: BanklabelT) => {
      ScopeChecks.bankScoped.parseConsistent({ banklabel }, { banklabel: slot.banklabel })
      return bankGiver
    },
  })
}

/** The fields of a {@link StrengthVerdictResult} before anything is judged. */
const Unjudged = Object.freeze({ verdict: null, isJudging: false, lastErr: null })

/** The slot's snapshot as a hook shows it while the slot's device is not the provider's user's: no device to read, and stage `starting`. */
const StartingSlot: GiverSlotSnapshot = Object.freeze({ userid: null, bank: PendingBank })
// --

// == [The bank]: makeBankGiver

/** The hooks and calls of `slot`'s bank, with `useShownSnapshot` reading the slot as the provider's children see it. */
function makeBankGiver(slot: GiverSlot, useShownSnapshot: <SelT>(pick: (snap: GiverSlotSnapshot) => SelT) => SelT) {
  const { banklabel } = slot

  /** The bank's snapshot. Synchronous: it never waits and never suspends.
   * Switch a screen on its `stage`.
   * Given `select`, it re-renders only when what `select` returns changes: return a field of the snapshot or a primitive, never a new object.
   */
  function useBank(): BankSnapshot
  function useBank<SelT>(select: (snap: BankSnapshot) => SelT): SelT
  function useBank<SelT>(select?: (snap: BankSnapshot) => SelT): BankSnapshot | SelT {
    return useShownSnapshot((snap) => (select ? select(snap.bank) : snap.bank))
  }

  // Cheat (react_life): the bank's snapshot does not carry its gate, so this reads the gate during render, and re-renders
  // on each change of stage and on each form mutation of the bank that succeeds, the ways a passkey comes and goes.
  /** The header of the bank's passkey, or null while it has none or there is no bank.
   * Show `AddPasskeyForm` while it is null and `RevokePasskeyForm` while it is not, and hand it to `PasskeyUnlockButton`.
   * @example
   *   const passkeyHeader = Knock.usePasskeyHeader()
   *   <PasskeyUnlockButton bank={Knock} passkeyHeader={passkeyHeader} />
   */
  function usePasskeyHeader(): PasskeyWayinHeader | null {
    useBank((snap) => snap.stage)
    useMutationState({ filters: { mutationKey: ['sok', banklabel], status: 'success' }, select: (mutation) => mutation.state.submittedAt })
    const passkey0 = slot.device?.bank?.maingate.passkey0 ?? null
    return useMemo(() => (passkey0?.toJSON() as PasskeyWayinHeader | undefined) ?? null, [passkey0])
  }

  /** True while the bank's minder has heard of a newer revision of the box than its item. */
  function isBehind(labelpath: BoxLabelpath): boolean {
    const { device } = slot
    return device?.minder.isBehindAt({ ...device.scope, labelpath }) ?? false
  }

  /** The signed-in user's record of the box at `labelpath`, through the device's minder. */
  async function getBoxShown(labelpath: BoxLabelpath): Promise<BoxShown> {
    const device = slot.demandDevice()
    await device.hello()
    return await device.minder.get({ ...device.scope, labelpath })
  }

  // One factory serves render and the calls outside it: a hook hands it the userid it shows, `boxQuery` the slot's.
  /** The `queryOptions` of the box at `labelpath` in `userid`'s bank, skipping the fetch while `userid` is null. */
  function boxQueryOf(userid: Userid | null, labelpath: string): BoxQueryOptions {
    return queryOptions({ ...boxQueryBaseOf(userid, labelpath), select: nullifyThing<BoxRecord> })
  }

  /** {@link boxQueryOf}, less its `select`. */
  function boxQueryBaseOf(userid: Userid | null, labelpath: string): Pick<UseQueryOptions<BoxShown>, 'queryKey' | 'queryFn' | 'networkMode' | 'staleTime' | 'structuralSharing'> {
    const boxLabelpath = boxLabelpathOf(labelpath)
    return {
      ...recordQueryDefaults(() => isBehind(boxLabelpath)),
      queryKey: boxQueryKeyOf({ userid, banklabel, labelpath: boxLabelpath }),
      queryFn:  (userid === null) ? skipToken : () => getBoxShown(boxLabelpath),
    }
  }

  /** The `queryOptions` of the box at `labelpath`, for whoever is signed in when called: for a route loader, a prefetch, or `useQuery` outside the provider's reach.
   * Its `data` is what {@link useBox} answers. While nobody is signed in, it fetches nothing, and `queryClient.query` rejects.
   * @example
   *   loader: () => queryClient.query(Knock.boxQuery('jokes'))
   */
  function boxQuery(labelpath: string): BoxQueryOptions {
    return boxQueryOf(slot.device?.userid ?? null, labelpath)
  }

  /** The box's stored record, through React Query, its whisper still sealed.
   * `data` is the record, null when none is stored or it was deleted, and undefined while pending or while nobody is signed in.
   * A record overtaken by a newer revision shows until the newer one arrives.
   * `opts` are React Query's own, and override the giver's. A `select` given there is handed the whole record, the box's
   * tombstone, or its shell where none is stored: {@link nullifyThing} is the default.
   * @example
   *   const { data: box } = Knock.useBox('jokes')
   *   const mask = Knock.useBox('jokes', { select: (thing) => nullifyThing(thing)?.sidecar['mask'] }).data
   */
  function useBox<SelT = BoxSelected>(labelpath: string, opts: BoxQueryOpts<BoxShown, SelT> = {}): UseQueryResult<SelT> {
    const userid = useShownSnapshot((snap) => snap.userid)
    return useQuery<BoxShown, Error, SelT>({ ...boxQueryBaseOf(userid, labelpath), select: nullifyThing as (thing: BoxShown) => SelT, ...opts })
  }

  /** The signed-in user's listing of the root box's children. */
  async function getBoxListing(): Promise<readonly Labelpath[]> {
    const device = slot.demandDevice()
    await device.hello()
    await device.minder.list(RootBoxLabelpath)
    // The minder caches the root box's listing from `hello`, so there is always one to read.
    return device.minder.listingAt({ ...device.scope, labelpath: RootBoxLabelpath })!
  }

  /** The labelpaths of the bank's boxes, through React Query, for a list that renders each one by {@link useBox}.
   * `data` is the labelpaths in labelpath order, and undefined while pending or while nobody is signed in. It is the same array until a box joins.
   * A deleted box stays listed, and its `useBox` answers null. A box this device writes or hears of joins at once.
   * @example
   *   const { data: labelpaths } = Knock.useBoxList()
   *   labelpaths?.map((labelpath) => <JokeRow key={labelpath} labelpath={labelpath} />)
   */
  function useBoxList(): UseQueryResult<readonly string[]> {
    const userid = useShownSnapshot((snap) => snap.userid)
    return useQuery({
      ...ListingQueryDefaults,
      queryKey: boxListQueryKeyOf({ userid, banklabel }),
      queryFn:  (userid === null) ? skipToken : getBoxListing,
      select:   hostLabelpathsOf,
    })
  }

  /** The keys of the signed-in user's boxes in the host's React Query, reading whoever is signed in when called. */
  const keys = Object.freeze({
    /** The key of the box at `labelpath`'s query. */
    box:   (labelpath: string): QueryKey => boxQueryKeyOf({ userid: slot.device?.userid ?? null, banklabel, labelpath: boxLabelpathOf(labelpath) }),
    /** The key that starts the key of the box at `labelpath` and of every box under it, or of every box when left out: for `invalidateQueries`.
     * @example
     *   void queryClient.invalidateQueries({ queryKey: Knock.keys.under('jokes') })
     */
    under: (labelpath?: string): QueryKey => boxesQueryKeyUnder({ userid: slot.device?.userid ?? null, banklabel, labelpath: (labelpath === undefined) ? RootBoxLabelpath : boxLabelpathOf(labelpath) }),
    /** The key of {@link useBoxList}'s query, which no key from `under` starts. */
    boxList: (): QueryKey => boxListQueryKeyOf({ userid: slot.device?.userid ?? null, banklabel }),
  })

  /** Call `fn` with the box's whisper, and resolve what `fn` resolves. On a locked bank, it first waits for the unlock form.
   * While it waits, `useBank((bank) => bank.isUnlockWanted)` is true: show the unlock form, or call {@link dismissUnlock}, which rejects the wait `dismissed`.
   * `fn` also gets the whole box, unsealed. Use the whisper only inside `fn`, and return only what is safe to retain:
   * what `fn` throws is rethrown as thrown.
   * @example
   *   const ask = useMutation({ mutationFn: (line: string) => Knock.withWhisper('jokes', ({ apiKey }) => tellJoke(apiKey, line)) })
   */
  async function withWhisper<ResultT>(labelpath: string, fn: (whisper: Whisper, box: BoxUnsealed) => ResultT | Promise<ResultT>): Promise<ResultT> {
    const boxLabelpath = boxLabelpathOf(labelpath)
    Checks.fn.parse(fn)
    const device = slot.demandDevice()
    await device.hello()
    return await slot.demandVault().withWhisper(boxLabelpath, (box) => fn(box.whisper, box))
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
    await slot.demandDevice().hello()
    return await slot.demandVault().putBoxOnce(boxLabelpath, patch, secrets)
  }

  /** Delete the box `boxNamed` names, resolving its stored tombstone. It tries once, over the newest revision the minder has heard of.
   * A {@link useBox} showing the box then answers null.
   */
  async function delBox(boxNamed: BoxNamed): Promise<TombstoneOf<BoxRecord>> {
    const boxLabelpath = boxLabelpathOfNamed(boxNamed)
    await slot.demandDevice().hello()
    return await slot.demandVault().delBoxOnce(boxLabelpath)
  }

  // React shows the form's FormData to the components inside it, through `useFormStatus().data`, until the action settles.
  // Emptied before the first await, it holds the whisper during no render.
  /** A form action for `useActionState` that writes the box `boxNamed` names from the form's fields, as {@link putBoxOnce} does.
   * Make it at module scope, or under `useMemo`, so its checks run once.
   * It reads the whisper with `opts.whisperOf`, and the sidecar with `opts.sidecarOf`, then empties the form of every field before it writes.
   * It never rejects: it resolves the box stored, or the error that stopped it, a refusal or what `whisperOf` or `sidecarOf` threw, as thrown.
   * @example
   *   const [put, putAction, isPutting] = useActionState(useMemo(() => Knock.putBoxAction('jokes', {
   *     whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
   *     sidecarOf: (whisper) => ({ mask: maskOf(String(whisper['apiKey'])) }),
   *   }), []), null)
   *   <form action={putAction}><input name="apiKey" type="password" /><button disabled={isPutting}>Save</button></form>
   */
  function putBoxAction(boxNamed: BoxNamed, opts: PutBoxActionOpts): (prior: PutBoxActionResult | null, form: FormData) => Promise<PutBoxActionResult> {
    const boxLabelpath = boxLabelpathOfNamed(boxNamed)
    const { whisperOf, sidecarOf } = Checks.putBoxActionOpts.parse(opts)
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
        return { box: await putBoxOnceAt(boxLabelpath, patch, secrets), error: null }
      } catch (err) {
        return { box: null, error: err }
      }
    }
  }

  /** Lock the bank, dropping its keys: a whisper needs the unlock form again. Does nothing while there is no bank. */
  function lock(): void { slot.device?.lock() }

  /** Dismiss the wait for the unlock form: every {@link withWhisper} waiting rejects `dismissed`, and the bank stays locked.
   * Call it from the unlock form's close button. Does nothing while there is no bank.
   */
  function dismissUnlock(): void { slot.device?.bank?.dismissUnlock() }

  // Each form mutation below resolves nothing: the bank's snapshot says what changed. Its error is the verb's refusal, to
  // branch on by `family`: a `condition` is the user's to correct, at the field or in a banner, with the form left open.
  // Its `gating` refuses `absent_vault` at a stage the verb has no bank for: show each form only at its own stage.

  /** A form verb's mutation, keyed `verb` under the bank, with `gatingOf` as its `gating`. */
  function useFormMutation<CleartextsT>(verb: string, gatingOf: (cleartexts: CleartextsT) => Gating): FormMutationResult<CleartextsT> {
    return { ...useMutation({ ...FormMutationDefaults, mutationKey: ['sok', banklabel, verb] }), gating: gatingOf }
  }

  /** The mutation that births the bank, at stage `unborn`, leaving it unlocked: hand it `birth.gating({ passphraseCleartext })`.
   * Disable the submit until the giver's `useStrengthVerdict` judges the passphrase strong.
   */
  function useBirth(): FormMutationResult<BirthCleartexts> {
    return useFormMutation('birth', (cleartexts: BirthCleartexts) => Bank.birthGating(slot.demandDevice(), cleartexts))
  }

  /** The mutation that unlocks the bank by its passphrase or its passkey: hand it `unlock.gating({ passphraseCleartext })`.
   * Every {@link withWhisper} waiting resumes. A wrong passphrase or passkey refuses, and the bank stays locked.
   * Disable the submit while it is pending (`disabled={unlock.isPending}`), so a double press unlocks once.
   * @example
   *   const unlock = Knock.useUnlock()
   *   <form action={(form) => {
   *     const passphraseCleartext = String(form.get('passphrase'))
   *     form.delete('passphrase')
   *     unlock.mutate(unlock.gating({ passphraseCleartext }))
   *   }}>
   */
  function useUnlock(): FormMutationResult<UnlockCleartexts> {
    return useFormMutation('unlock', (cleartexts: UnlockCleartexts) => slot.demandBank().unlockGating(cleartexts))
  }

  /** The mutation that replaces the passphrase, proved by the current passphrase or the passkey, leaving the bank unlocked.
   * Disable the submit until the giver's `useStrengthVerdict` judges the new passphrase strong.
   */
  function useReplacePassphrase(): FormMutationResult<PassphraseReplaceCleartexts> {
    return useFormMutation('replacePassphrase', (cleartexts: PassphraseReplaceCleartexts) => slot.demandBank().replacePassphraseGating(cleartexts))
  }

  /** The mutation that adds a passkey, proved by the passphrase, leaving the bank unlocked.
   * Run the WebAuthn ceremony in the click handler, before anything slow (the browser requires it).
   */
  function useAddPasskey(): FormMutationResult<PasskeyAddCleartexts> {
    return useFormMutation('addPasskey', (cleartexts: PasskeyAddCleartexts) => slot.demandBank().addPasskeyGating(cleartexts))
  }

  /** The mutation that revokes the passkey, proved by the passphrase or the passkey, leaving the bank unlocked. */
  function useRevokePasskey(): FormMutationResult<PasskeyRevokeCleartexts> {
    return useFormMutation('revokePasskey', (cleartexts: PasskeyRevokeCleartexts) => slot.demandBank().revokePasskeyGating(cleartexts))
  }

  const bankGiver = Object.freeze({
    useBank, usePasskeyHeader, useBox, useBoxList, boxQuery, keys, withWhisper, putBoxOnce, delBox, putBoxAction, lock, dismissUnlock,
    useBirth, useUnlock, useReplacePassphrase, useAddPasskey, useRevokePasskey,
  })
  return { bankGiver, boxQueryOf }
}
// --

// == [Helpers]: RootBoxLabelpath, boxLabelpathOf, boxLabelpathOfNamed, hostLabelpathsOf, emptyForm, Checks

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
    labelpath:        str.min(1),
    boxLabelpath,
    boxScoped:        obj({ labelpath: boxLabelpath }).loose(),
    fn:               fn(),
    putBoxActionOpts: obj({ whisperOf: fn<PutBoxActionOpts['whisperOf']>(), sidecarOf: fn<NonNullable<PutBoxActionOpts['sidecarOf']>>().optional() }),
    form:             custom<FormData>((val) => val instanceof FormData, 'Expected the FormData a form action is handed'),
  }
})
// --
