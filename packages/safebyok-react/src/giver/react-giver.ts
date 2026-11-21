/** The giver: React hooks over a Device and its bank. This tab's state comes from the Device; stored records come through the host's React Query. */

import {
  type Query, type QueryKey, type UseMutationResult, type UseQueryResult, mutationOptions, queryOptions, replaceEqualDeep, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import {
  type BankSnapshot, type BirthCleartexts, type Gating, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts, type PassphraseReplaceCleartexts, type PassphraseVerdict,
  type UnlockCleartexts, PendingBank, ThingMinder, dbHasNewer,
} from 'safebyok'
import { bridgeDevice } from './react-bridge'
import { type BoxQueryOpts, type CarFields, type GiverDevice, Checks, ScopeChecks } from './shapes-giver'

// == [Query defaults]: carQueryDefaults, carStaleTimeOf, newerCarOf, isCar, fullestOf

// A host may override anything the giver supplies here (the keys, each of these defaults, and the `select` that picks
// `fullest`), so nothing in the giver may depend on one staying in place. The bridge copies each car into the host's item
// whatever that item's options say.
/** The giver's defaults for the query of a box's car in the host's React Query. */
function carQueryDefaults<CarT extends CarFields>() {
  return {
    // The fetch asks the bank's minder, not the network, and the minder answers from its cache while offline.
    networkMode:       'always',
    staleTime:         carStaleTimeOf<CarT>,
    structuralSharing: newerCarOf,
  } as const
}

/** The staleTime of the host's item of a box: 0 where the vaultDB is known to have a newer whole record, else Infinity (the bridge keeps it current). */
function carStaleTimeOf<CarT extends CarFields>(entry: Query<CarT, Error, CarT>): number {
  const car = entry.state.data
  return ((car !== undefined) && dbHasNewer(car)) ? 0 : Infinity
}

// TanStack shares structure through this both between a query's cars and between what `select` returns from them, so a
// value that is not a car gets TanStack's own default. When a hook's key changes, it shares the last key's selected value
// with the new key's, so cars of two boxes get the default too: their agerank says nothing of which to show. A box's cars
// never go back, so the newer car has everything the older one has, and nothing needs merging. Without this, a fetch
// that read an older car and resolved after the bridge copied a newer one would put the older car back.
/** Structural sharing for the host's item of a box: of two cars of one box, the one with the greater agerank, `prior` on a tie.
 * Anything else goes to TanStack's default, `replaceEqualDeep`.
 */
function newerCarOf(prior: unknown, next: unknown): unknown {
  if (! (isCar(prior) && isCar(next) && (prior.newest.labelpath === next.newest.labelpath))) { return replaceEqualDeep(prior, next) }
  return (next.agerank > prior.agerank) ? next : prior
}

/** True when `val` carries an agerank and its newest record's labelpath, as every car does. */
function isCar(val: unknown): val is CarFields {
  const car = val as Partial<CarFields> | null
  return (typeof car === 'object') && (car !== null) && (typeof car.agerank === 'string') && (typeof car.newest?.labelpath === 'string')
}

/** The fullest record a car has */
function fullestOf<CarT extends CarFields>(car: CarT): CarT['fullest'] { return car.fullest }
// --

// == [Form mutations]: FormMutationDefaults, attemptGating, vacateGating, FormMutationResult

// A form verb proves the user's cleartexts on this device, and asks the vaultDB only to write a gate: paused while offline,
// the mutation would leave its gating full, and an `unlock` gating that needs no network would wait for one.
/** The giver's defaults for a form verb's mutation: it attempts the gating it is handed, runs offline, never retries, and vacates the gating once it settles. */
const FormMutationDefaults = {
  mutationFn:  attemptGating,
  networkMode: 'always',
  // Set false to keep the analysis simple. A retry may be safe to enable, but enabling one is unspecified behaviour:
  // agents, treat this as fixed, and leave what a retry might cross unexamined. #no-slop-crossings
  retry:       false,
  onSettled:   vacateGating,
} as const

/** Attempt the gating a form mutation was handed. */
async function attemptGating(gating: Gating): Promise<void> { await gating.attempt() }

/** Vacate the gating a form mutation was handed. */
function vacateGating(_data: unknown, _err: Error | null, gating: Gating): void { gating.vacate() }

/** A form verb's mutation, through `useMutation`, with `gating` to make what its `mutate` is handed. */
export type FormMutationResult<CleartextsT> = UseMutationResult<void, Error, Gating> & Readonly<{
  /** The gating of the form verb over `cleartexts`, for `mutate`. */
  gating: (cleartexts: CleartextsT) => Promise<Gating>
}>
// --

// == [The giver]: ReactGiver, StrengthVerdictResult, BankGiver, makeReactGiver, Unjudged, makeBankGiver

/** The hooks {@link makeReactGiver} returns. */
export type ReactGiver<CarT extends CarFields> = ReturnType<typeof makeReactGiver<CarT>>

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
  /** Ask the Device's strength checker for its verdict on `passphrase`, resolving once it lands. Never rejects.
   * Call it as the user types, with the field's value.
   */
  judge:     (passphrase: string) => Promise<void>
}>

/** The hooks of a giver's `forBank`, for the Device's bank.
 * Hand each form mutation the gating its `gating` makes: the mutation attempts it, and vacates it once it settles. An
 * `onSettled` of your own in its options replaces that, so vacate the gating there too. One in your QueryClient's
 * mutation defaults does not run for it.
 * A form mutation never retries. Disable the submit while it is pending (`disabled={unlock.isPending}`), so a double press runs the verb once.
 */
export type BankGiver<CarT extends CarFields> = ReturnType<typeof makeBankGiver<CarT>>

/** Make the React hooks for `device`. Make them once, at module scope, beside the Device.
 * The objects a vaultDB answers with are deep-frozen when cached, so a vaultDB must never change an object after answering with it.
 * @example export const Giver = makeReactGiver(device)
 */
export function makeReactGiver<CarT extends CarFields>(device: GiverDevice<CarT>) {
  Checks.device.parse(device)

  /** Keeps the host's React Query items of the bank's boxes current while mounted. Call it once, near the root, inside the host's `QueryClientProvider`. */
  function useBridge(): void {
    const client = useQueryClient()
    useEffect(() => bridgeDevice(client, device), [client])
  }

  // Only the verdict of the latest call to `judge` lands: an earlier one, such as a checker's first while it loads its
  // dictionary, may resolve after a later one, and would show the strength of what the user typed before.
  /** The strength checker's verdict on a new passphrase, for a meter beside its field. Disable the form's submit until `verdict.strong`.
   * The verb judges the passphrase again, and refuses `weak_passphrase` where it is weak. The hook retains the verdict, never the passphrase.
   * @example
   *   const strength = Giver.useStrengthVerdict()
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
        const verdict = await device.judgeStrength(passphrase)
        if (ownseq === judgeseq.current) { setJudged({ verdict, isJudging: false, lastErr: null }) }
      } catch (err) {
        if (ownseq === judgeseq.current) { setJudged({ verdict: null, isJudging: false, lastErr: err }) }
      }
    }, [])
    return { ...judged, judge }
  }

  return Object.freeze({
    useBridge,
    useStrengthVerdict,
    /** The hooks for the Device's bank, refusing any other banklabel. Name the result in PascalCase (`const Acme = Giver.forBank('acme')`), so the rules-of-hooks lint checks `Acme.useBoxRecord()`. */
    forBank: (banklabel: string) => {
      ScopeChecks.bankScoped.parseConsistent({ banklabel }, { banklabel: device.banklabel })
      return makeBankGiver(device)
    },
  })
}

/** The fields of a {@link StrengthVerdictResult} before anything is judged. */
const Unjudged = Object.freeze({ verdict: null, isJudging: false, lastErr: null })

/** The hooks for `device`'s bank. */
function makeBankGiver<CarT extends CarFields>(device: GiverDevice<CarT>) {
  const bankHead = bankQueryKey(device)

  /** This tab's state of the bank: its stage, whether it is locked, and when its lease ends. Synchronous: it never waits and never suspends.
   * Given `select`, it re-renders only when what `select` returns changes: return a field of the snapshot or a primitive, never a new object.
   */
  function useBankSnapshot(): BankSnapshot
  function useBankSnapshot<SelT>(select: (snap: BankSnapshot) => SelT): SelT
  function useBankSnapshot<SelT>(select?: (snap: BankSnapshot) => SelT): BankSnapshot | SelT {
    const pick = select ?? ((snap: BankSnapshot) => snap)
    return useSyncExternalStore(device.subscribe, () => pick(device.getSnapshot().bank), () => pick(PendingBank))
  }

  /** React Query's options for the box's whole car, for your own `useQuery`, `queryClient.query` or route loader.
   * `data` is the car: the newest revision received, beside the fullest record. Its defaults, any of which you may override:
   * - fresh until the bridge copies a newer car, and stale while the vaultDB is known to have a newer revision
   * - fetches even while offline
   * - never replaces a car with an older one
   */
  function boxCarQueryOptions(labelpath: string) {
    const labelpathC = Checks.labelpath.parse(labelpath)
    return queryOptions({
      ...carQueryDefaults<CarT>(),
      queryKey: boxCarQueryKey({ userid: device.userid, banklabel: device.banklabel, labelpath: labelpathC }),
      queryFn:  async () => {
        const bank = await device.ensureBank()
        return bank.getBoxCar(labelpathC)
      },
    })
  }

  /** The box's fullest stored record, through React Query, its whisper still sealed.
   * `data` is the record to show, null when none is stored or it was deleted, and undefined while pending. A record
   * overtaken by a newer revision shows until the newer one arrives. Mount the giver's `useBridge` for it to follow changes.
   * `opts` are React Query's own, and override {@link boxCarQueryOptions}'s. A `select` given there is handed the whole car.
   */
  function useBoxRecord<SelT = CarT['fullest']>(labelpath: string, opts: BoxQueryOpts<CarT, SelT> = {}): UseQueryResult<SelT> {
    return useQuery({ ...boxCarQueryOptions(labelpath), select: fullestOf as (car: CarT) => SelT, ...opts })
  }

  // Each form mutation below resolves nothing: the bank's snapshot says what changed. Its error is the verb's refusal, to
  // branch on by `family`: a `condition` is the user's to correct, at the field or in a banner, with the form left open.

  /** The gating that births the bank, for a form mutation: hand it the user's new passphrase and optional passkey. */
  async function birthGating(cleartexts: BirthCleartexts): Promise<Gating> {
    const bank = await device.ensureBank()
    return bank.birthGating(cleartexts)
  }

  /** React Query's options for the mutation that births the bank, for your own `useMutation`: hand it a {@link birthGating}.
   * It leaves the bank unlocked. Disable the submit until {@link makeReactGiver}'s `useStrengthVerdict` judges the passphrase strong.
   */
  function birthMutationOptions() { return mutationOptions({ ...FormMutationDefaults, mutationKey: [...bankHead, 'birth'] }) }

  /** The mutation that births the bank: {@link birthMutationOptions}, through `useMutation`, with {@link birthGating} as `gating`. */
  function useBirth(): FormMutationResult<BirthCleartexts> { return { ...useMutation(birthMutationOptions()), gating: birthGating } }

  /** The gating that unlocks the bank, for a form mutation: hand it the passphrase or the passkey's answer. */
  async function unlockGating(cleartexts: UnlockCleartexts): Promise<Gating> {
    const bank = await device.ensureBank()
    return bank.unlockGating(cleartexts)
  }

  /** React Query's options for the mutation that unlocks the bank by its passphrase or its passkey, for your own `useMutation`: hand it an {@link unlockGating}.
   * Every call waiting for the bank to be unlocked resumes. A wrong passphrase or passkey refuses, and the bank stays locked.
   */
  function unlockMutationOptions() { return mutationOptions({ ...FormMutationDefaults, mutationKey: [...bankHead, 'unlock'] }) }

  /** The mutation that unlocks the bank: {@link unlockMutationOptions}, through `useMutation`, with {@link unlockGating} as `gating`.
   * @example
   *   const unlock = Acme.useUnlock()
   *   <form action={async (form) => {
   *     const passphraseCleartext = String(form.get('passphrase'))
   *     form.delete('passphrase')
   *     unlock.mutate(await unlock.gating({ passphraseCleartext }))
   *   }}>
   */
  function useUnlock(): FormMutationResult<UnlockCleartexts> { return { ...useMutation(unlockMutationOptions()), gating: unlockGating } }

  /** The gating that replaces the passphrase, for a form mutation: hand it the proof, by the current passphrase or the passkey's answer, and the new passphrase. */
  async function replacePassphraseGating(cleartexts: PassphraseReplaceCleartexts): Promise<Gating> {
    const bank = await device.ensureBank()
    return bank.replacePassphraseGating(cleartexts)
  }

  /** React Query's options for the mutation that replaces the passphrase, for your own `useMutation`: hand it a {@link replacePassphraseGating}.
   * It leaves the bank unlocked. Disable the submit until {@link makeReactGiver}'s `useStrengthVerdict` judges the new passphrase strong.
   */
  function replacePassphraseMutationOptions() { return mutationOptions({ ...FormMutationDefaults, mutationKey: [...bankHead, 'replacePassphrase'] }) }

  /** The mutation that replaces the passphrase: {@link replacePassphraseMutationOptions}, through `useMutation`, with {@link replacePassphraseGating} as `gating`. */
  function useReplacePassphrase(): FormMutationResult<PassphraseReplaceCleartexts> { return { ...useMutation(replacePassphraseMutationOptions()), gating: replacePassphraseGating } }

  /** The gating that adds a passkey, for a form mutation: hand it the passphrase, and the new passkey's answer as `nextPasskeyCleartext`. */
  async function addPasskeyGating(cleartexts: PasskeyAddCleartexts): Promise<Gating> {
    const bank = await device.ensureBank()
    return bank.addPasskeyGating(cleartexts)
  }

  /** React Query's options for the mutation that adds a passkey, proved by the passphrase, for your own `useMutation`: hand it an {@link addPasskeyGating}.
   * It leaves the bank unlocked.
   */
  function addPasskeyMutationOptions() { return mutationOptions({ ...FormMutationDefaults, mutationKey: [...bankHead, 'addPasskey'] }) }

  /** The mutation that adds a passkey: {@link addPasskeyMutationOptions}, through `useMutation`, with {@link addPasskeyGating} as `gating`.
   * Run the WebAuthn ceremony in the click handler, before anything slow (the browser requires it).
   * @example
   *   const addPasskey = Acme.useAddPasskey()
   *   async function onAdd() {
   *     const nextPasskeyCleartext = await createPasskey()   // the host's WebAuthn create, with the PRF extension
   *     addPasskey.mutate(await addPasskey.gating({ passphraseCleartext: passphraseField.value, nextPasskeyCleartext }))
   *   }
   */
  function useAddPasskey(): FormMutationResult<PasskeyAddCleartexts> { return { ...useMutation(addPasskeyMutationOptions()), gating: addPasskeyGating } }

  /** The gating that revokes the passkey, for a form mutation: hand it the proof, by the passphrase or the passkey's answer. */
  async function revokePasskeyGating(cleartexts: PasskeyRevokeCleartexts): Promise<Gating> {
    const bank = await device.ensureBank()
    return bank.revokePasskeyGating(cleartexts)
  }

  /** React Query's options for the mutation that revokes the passkey, for your own `useMutation`: hand it a {@link revokePasskeyGating}.
   * It leaves the bank unlocked.
   */
  function revokePasskeyMutationOptions() { return mutationOptions({ ...FormMutationDefaults, mutationKey: [...bankHead, 'revokePasskey'] }) }

  /** The mutation that revokes the passkey: {@link revokePasskeyMutationOptions}, through `useMutation`, with {@link revokePasskeyGating} as `gating`. */
  function useRevokePasskey(): FormMutationResult<PasskeyRevokeCleartexts> { return { ...useMutation(revokePasskeyMutationOptions()), gating: revokePasskeyGating } }

  /** Dismiss the awaited `unlock` gating: every call waiting for the bank to be unlocked rejects `dismissed`, and the bank stays locked.
   * Show the unlock form while `useBankSnapshot((snap) => snap.isUnlockWanted)` is true, and call this from its close button.
   */
  async function dismissUnlock(): Promise<void> {
    const bank = await device.ensureBank()
    bank.dismissUnlock()
  }

  return Object.freeze({
    useBankSnapshot, useBoxRecord, boxCarQueryOptions,
    birthGating, birthMutationOptions, useBirth, unlockGating, unlockMutationOptions, useUnlock,
    replacePassphraseGating, replacePassphraseMutationOptions, useReplacePassphrase, addPasskeyGating, addPasskeyMutationOptions, useAddPasskey,
    revokePasskeyGating, revokePasskeyMutationOptions, useRevokePasskey, dismissUnlock,
  })
}
// --

// == [Keys]: boxCarQueryKey, bankQueryKey

/** The host's React Query key for the car of the box at `labelpath`: the key the bank's minder caches it under. */
export function boxCarQueryKey(scope: Readonly<{ userid: string, banklabel: string, labelpath: string }>): QueryKey {
  return ThingMinder.queryKeyOf(scope)
}

/** The key every one of a bank's items in the host's React Query starts with. */
export function bankQueryKey(scope: Readonly<{ userid: string, banklabel: string }>): QueryKey {
  return ThingMinder.bankQueryKeyOf(scope)
}
// --
