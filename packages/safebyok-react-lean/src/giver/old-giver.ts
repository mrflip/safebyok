/** The giver: React hooks over a Device and its bank. This tab's state comes from the Device; stored records come through the host's React Query.
 * The giver turns the bank minder's events into what a host and its user most likely want to see. It puts records and
 * their metadata in the host's React Query cache, and supplies default options a host may override, then leaves the cache
 * to work as React Query and the host's options say.
 */

import { type UseMutationResult, type UseQueryResult, mutationOptions, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  type BankSnapshot, type BirthCleartexts, type Gating, type PasskeyAddCleartexts, type PasskeyRevokeCleartexts, type PassphraseReplaceCleartexts, type PassphraseVerdict,
  type UnlockCleartexts, PendingBank,
} from 'safebyok'
import { FormMutationDefaults, bankQueryKey, boxRecordQueryKey, recordQueryDefaults, shownRecordOf } from './giver-defaults'
import { bridgeDevice } from './react-bridge'
import { type BoxQueryOpts, type GiverBank, type GiverDevice, type RecordFields, Checks, ScopeChecks } from './shapes-giver'

// == [Form mutations]: FormMutationResult

/** A form verb's mutation, through `useMutation`, with `gating` to make what its `mutate` is handed. */
export type FormMutationResult<CleartextsT> = UseMutationResult<void, Error, Gating> & Readonly<{
  /** The gating of the form verb over `cleartexts`, for `mutate`. */
  gating: (cleartexts: CleartextsT) => Promise<Gating>
}>
// --

// == [The giver]: ReactGiver, StrengthVerdictResult, BankGiver, makeReactGiver, Unjudged, makeBankGiver

/** The hooks {@link makeReactGiver} returns. */
export type ReactGiver<RecordT extends RecordFields> = ReturnType<typeof makeReactGiver<RecordT>>

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
export type BankGiver<RecordT extends RecordFields> = ReturnType<typeof makeBankGiver<RecordT>>

/** Make the React hooks for `device`. Make them once, at module scope, beside the Device.
 * The objects a vaultDB answers with are deep-frozen when cached, so a vaultDB must never change an object after answering with it.
 * @example export const Giver = makeReactGiver(device)
 */
export function makeReactGiver<RecordT extends RecordFields>(device: GiverDevice<RecordT>) {
  Checks.device.parse(device)
  // A staleTime is answered at once, so the giver keeps the bank object started now: none until one starts.
  let startedBank: GiverBank<RecordT> | null = null
  device.onBankStart((bank) => {
    startedBank = bank
    return () => { startedBank = null }
  })

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
      return makeBankGiver(device, (labelpath) => startedBank?.isBoxRecordBehind(labelpath) ?? false)
    },
  })
}

/** The fields of a {@link StrengthVerdictResult} before anything is judged. */
const Unjudged = Object.freeze({ verdict: null, isJudging: false, lastErr: null })

/** The hooks for `device`'s bank, under which the host's item of a box is stale while `isBoxRecordBehind` answers true of its labelpath. */
function makeBankGiver<RecordT extends RecordFields>(device: GiverDevice<RecordT>, isBoxRecordBehind: (labelpath: string) => boolean) {
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

  /** React Query's options for the box's whole record, for your own `useQuery`, `queryClient.query` or route loader.
   * `data` is the whole record, the box's tombstone, or its shell where none is stored. Its defaults, any of which you may override:
   * - stale while the bank's minder has heard of a newer revision than its record, and fresh otherwise: the bridge copies
   *   in each newer record the minder caches
   * - fetches even while offline
   * - never replaces a record with an older one
   */
  function boxRecordQueryOptions(labelpath: string) {
    return queryOptions({ ...recordQueryDefaults(() => isBoxRecordBehind(labelpath)), ...boxRecordQueryOf(labelpath) })
  }

  /** The key and fetch of the box's record. */
  function boxRecordQueryOf(labelpath: string) {
    const labelpathC = Checks.labelpath.parse(labelpath)
    return {
      queryKey: boxRecordQueryKey({ userid: device.userid, banklabel: device.banklabel, labelpath: labelpathC }),
      queryFn:  async () => {
        const bank = await device.ensureBank()
        return bank.getBoxRecord(labelpathC)
      },
    }
  }

  /** The box's stored record, through React Query, its whisper still sealed.
   * `data` is the record, null when none is stored or it was deleted, and undefined while pending. A record overtaken by a
   * newer revision shows until the newer one arrives. Mount the giver's `useBridge` for it to follow changes.
   * `opts` are React Query's own, and override {@link boxRecordQueryOptions}'s. A `select` given there is handed the whole
   * record, the box's tombstone, or its shell where none is stored.
   */
  function useBoxRecord<SelT = RecordT | null>(labelpath: string, opts: BoxQueryOpts<RecordT, SelT> = {}): UseQueryResult<SelT> {
    return useQuery<RecordT, Error, SelT>({ ...recordQueryDefaults(() => isBoxRecordBehind(labelpath)), ...boxRecordQueryOf(labelpath), select: shownRecordOf as (record: RecordT) => SelT, ...opts })
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
    useBankSnapshot, useBoxRecord, boxRecordQueryOptions,
    birthGating, birthMutationOptions, useBirth, unlockGating, unlockMutationOptions, useUnlock,
    replacePassphraseGating, replacePassphraseMutationOptions, useReplacePassphrase, addPasskeyGating, addPasskeyMutationOptions, useAddPasskey,
    revokePasskeyGating, revokePasskeyMutationOptions, useRevokePasskey, dismissUnlock,
  })
}
// --
