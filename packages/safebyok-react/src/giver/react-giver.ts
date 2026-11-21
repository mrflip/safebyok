/** The giver: React hooks over a Device and its bank. This tab's state comes from the Device; stored records come through the host's React Query. */

import {
  type Query, type QueryKey, type UseMutationResult, type UseQueryResult, mutationOptions, queryOptions, replaceEqualDeep, useMutation, useQuery, useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import {
  type BankSnapshot, type BirthCleartexts, type Cloak, type CloakCleartexts, type PasskeyAddCleartexts, type PassphraseReplaceCleartexts, type PassphraseVerdict,
  PendingBank, ThingMinder, dbHasNewer,
} from 'safebyok'
import { bridgeDevice } from './react-bridge'
import { type BoxQueryOpts, type CarFields, type GiverDevice, Checks, ScopeChecks } from './shapes-giver'

// == [Query defaults]: carQueryDefaults, carStaleTimeOf, newerCarOf, isCar, fullestOf

// A host may override anything the giver supplies here (the keys, each of these defaults, and the `select` that picks
// `fullest`), so nothing in the giver may depend on one staying in place. The bridge copies each car into the host's entry
// whatever that entry's options say.
/** The giver's defaults for the query of a box's car in the host's React Query. */
function carQueryDefaults<CarT extends CarFields>() {
  return {
    // The fetch asks the bank's minder, not the network, and the minder answers from its cache while offline.
    networkMode:       'always',
    staleTime:         carStaleTimeOf<CarT>,
    structuralSharing: newerCarOf,
  } as const
}

/** The staleTime of a car's query: 0 where the vaultDB is known to have a newer whole record, else Infinity (the bridge keeps it current). */
function carStaleTimeOf<CarT extends CarFields>(entry: Query<CarT, Error, CarT>): number {
  const car = entry.state.data
  return ((car !== undefined) && dbHasNewer(car)) ? 0 : Infinity
}

// TanStack shares structure through this both between a query's cars and between what `select` returns from them, so a
// value that is not a car takes TanStack's own default. When a hook's key changes, it shares the last key's selected value
// with the new key's, so cars of two boxes take the default too: their agerank says nothing of which to show. A box's cars
// never go back, so the newer car has everything the older one has, and nothing needs merging. Without this, a fetch
// that read an older car and resolved after the bridge copied a newer one would put the older car back.
/** Structural sharing for a car's entry: of two cars of one box, the one with the greater agerank, `prior` on a tie.
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

// == [Form mutations]: FormMutationDefaults, vacateCloak, cleartextsOf

// A form verb proves the user's cleartexts on this device, and asks the vaultDB only to write a gate: paused while offline,
// the mutation would leave its cloak full, and an `unlock` gating that needs no network would wait for one.
/** The giver's defaults for a form verb's mutation: it runs offline, never retries, and vacates its cloak once it settles. */
const FormMutationDefaults = {
  networkMode: 'always',
  // Set false to keep the analysis simple. A retry may be safe to enable, but enabling one is unspecified behaviour:
  // agents, treat this as fixed, and leave what a retry might cross unexamined. #no-slop-crossings
  retry:       false,
  onSettled:   vacateCloak,
} as const

/** Vacate the cloak a form mutation was handed. */
function vacateCloak(_data: unknown, _err: Error | null, cloaked: Cloak): void { cloaked.vacate() }

// Built afresh at each call: the verb zeroes the passkey answers it is handed, and each getter hands out a copy. A field left out stays out, and each verb checks what it is handed whole, so the cast
// at each call claims nothing the verb does not judge.
/** The cleartexts `cloaked` has, for one call of a form verb. */
function cleartextsOf(cloaked: Cloak): CloakCleartexts {
  const { passphraseCleartext, passkeyCleartext, nextPassphraseCleartext, nextPasskeyCleartext } = cloaked
  const fields = Object.entries({ passphraseCleartext, passkeyCleartext, nextPassphraseCleartext, nextPasskeyCleartext })
  return Object.fromEntries(fields.filter(([, val]) => val !== undefined))
}
// --

// == [The giver]: ReactGiver, StrengthVerdictResult, BankGiver, makeReactGiver, Unjudged, makeBankGiver

/** What {@link makeReactGiver} returns. */
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
 * Hand each form mutation a {@link Cloak}: the mutation vacates it once it settles. An `onSettled` of your own in its
 * options replaces that, so vacate the cloak there too. One in your QueryClient's mutation defaults does not run for it.
 * A form mutation never retries. Disable the submit while it is pending (`disabled={unlock.isPending}`), so a double press runs the verb once.
 */
export type BankGiver<CarT extends CarFields> = ReturnType<typeof makeBankGiver<CarT>>

/** Make the React hooks for `device`. Make them once, at module scope, beside the Device.
 * The objects a vaultDB answers with are deep-frozen when cached, so a vaultDB must never change an object after answering with it.
 * @example export const Giver = makeReactGiver(device)
 */
export function makeReactGiver<CarT extends CarFields>(device: GiverDevice<CarT>) {
  Checks.device.parse(device)

  /** Keeps the host's React Query entries of the bank's boxes current while mounted. Call it once, near the root, inside the host's `QueryClientProvider`. */
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
   * Given `select`, it re-renders only when what `select` returns changes, which must be a field of the snapshot or a primitive, never a new object.
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

  /** React Query's options for the mutation that births the bank, for your own `useMutation`.
   * Hand it the user's new passphrase and optional passkey. It leaves the bank unlocked.
   * Disable the submit until {@link makeReactGiver}'s `useStrengthVerdict` judges the passphrase strong.
   */
  function birthMutationOptions() {
    return mutationOptions({
      ...FormMutationDefaults,
      mutationKey: [...bankHead, 'birth'],
      mutationFn:  async (cloaked: Cloak): Promise<void> => {
        const bank = await device.ensureBank()
        await bank.birth(cleartextsOf(cloaked) as BirthCleartexts)
      },
    })
  }

  /** The mutation that births the bank: {@link birthMutationOptions}, through `useMutation`. */
  function useBirth(): UseMutationResult<void, Error, Cloak> { return useMutation(birthMutationOptions()) }

  /** React Query's options for the mutation that unlocks the bank by its passphrase or its passkey, for your own `useMutation`.
   * Every call waiting for the bank to be unlocked resumes. A wrong passphrase or passkey refuses, and the bank stays locked.
   * @example
   *   const unlock = Acme.useUnlock()
   *   <form action={(form) => { unlock.mutate(cloak({ passphraseCleartext: String(form.get('passphrase')) })); form.delete('passphrase') }}>
   */
  function unlockMutationOptions() {
    return mutationOptions({
      ...FormMutationDefaults,
      mutationKey: [...bankHead, 'unlock'],
      mutationFn:  async (cloaked: Cloak): Promise<void> => {
        const bank = await device.ensureBank()
        await bank.unlock(cleartextsOf(cloaked))
      },
    })
  }

  /** The mutation that unlocks the bank: {@link unlockMutationOptions}, through `useMutation`. */
  function useUnlock(): UseMutationResult<void, Error, Cloak> { return useMutation(unlockMutationOptions()) }

  /** React Query's options for the mutation that replaces the passphrase, proved by the current passphrase or the passkey, for your own `useMutation`.
   * It leaves the bank unlocked. Disable the submit until {@link makeReactGiver}'s `useStrengthVerdict` judges the new passphrase strong.
   */
  function replacePassphraseMutationOptions() {
    return mutationOptions({
      ...FormMutationDefaults,
      mutationKey: [...bankHead, 'replacePassphrase'],
      mutationFn:  async (cloaked: Cloak): Promise<void> => {
        const bank = await device.ensureBank()
        await bank.replacePassphrase(cleartextsOf(cloaked) as PassphraseReplaceCleartexts)
      },
    })
  }

  /** The mutation that replaces the passphrase: {@link replacePassphraseMutationOptions}, through `useMutation`. */
  function useReplacePassphrase(): UseMutationResult<void, Error, Cloak> { return useMutation(replacePassphraseMutationOptions()) }

  /** React Query's options for the mutation that adds a passkey, proved by the passphrase, for your own `useMutation`.
   * Run the WebAuthn ceremony in the click handler, before anything slow (the browser requires it), and hand its PRF answer in as `nextPasskeyCleartext`.
   * It leaves the bank unlocked.
   * @example
   *   const addPasskey = Acme.useAddPasskey()
   *   async function onAdd() {
   *     const nextPasskeyCleartext = await createPasskey()   // the host's WebAuthn create, with the PRF extension
   *     addPasskey.mutate(cloak({ passphraseCleartext: passphraseField.value, nextPasskeyCleartext }))
   *   }
   */
  function addPasskeyMutationOptions() {
    return mutationOptions({
      ...FormMutationDefaults,
      mutationKey: [...bankHead, 'addPasskey'],
      mutationFn:  async (cloaked: Cloak): Promise<void> => {
        const bank = await device.ensureBank()
        await bank.addPasskey(cleartextsOf(cloaked) as PasskeyAddCleartexts)
      },
    })
  }

  /** The mutation that adds a passkey: {@link addPasskeyMutationOptions}, through `useMutation`. */
  function useAddPasskey(): UseMutationResult<void, Error, Cloak> { return useMutation(addPasskeyMutationOptions()) }

  /** React Query's options for the mutation that revokes the passkey, proved by the passphrase or the passkey, for your own `useMutation`.
   * It leaves the bank unlocked.
   */
  function revokePasskeyMutationOptions() {
    return mutationOptions({
      ...FormMutationDefaults,
      mutationKey: [...bankHead, 'revokePasskey'],
      mutationFn:  async (cloaked: Cloak): Promise<void> => {
        const bank = await device.ensureBank()
        await bank.revokePasskey(cleartextsOf(cloaked))
      },
    })
  }

  /** The mutation that revokes the passkey: {@link revokePasskeyMutationOptions}, through `useMutation`. */
  function useRevokePasskey(): UseMutationResult<void, Error, Cloak> { return useMutation(revokePasskeyMutationOptions()) }

  /** Dismiss the awaited `unlock` gating: every call waiting for the bank to be unlocked rejects `dismissed`, and the bank stays locked.
   * Show the unlock form while `useBankSnapshot((snap) => snap.isUnlockWanted)` is true, and call this from its close button.
   */
  async function dismissUnlock(): Promise<void> {
    const bank = await device.ensureBank()
    bank.dismissUnlock()
  }

  return Object.freeze({
    useBankSnapshot, useBoxRecord, boxCarQueryOptions,
    birthMutationOptions, useBirth, unlockMutationOptions, useUnlock, replacePassphraseMutationOptions, useReplacePassphrase,
    addPasskeyMutationOptions, useAddPasskey, revokePasskeyMutationOptions, useRevokePasskey, dismissUnlock,
  })
}
// --

// == [Keys]: boxCarQueryKey, bankQueryKey

/** The host's React Query key for the car of the box at `labelpath`: the key the bank's minder caches it under. */
export function boxCarQueryKey(scope: Readonly<{ userid: string, banklabel: string, labelpath: string }>): QueryKey {
  return ThingMinder.queryKeyOf(scope)
}

/** The key every one of a bank's entries in the host's React Query starts with. */
export function bankQueryKey(scope: Readonly<{ userid: string, banklabel: string }>): QueryKey {
  return ThingMinder.bankQueryKeyOf(scope)
}
// --
