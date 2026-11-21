/** The giver: a host's React layer over one bank, made once at module scope, before anyone signs in.
 * Its provider says who is signed in. Its hooks read the slot the provider fills, and records come through the host's React Query.
 */

import { type QueryKey, type UseMutationResult, type UseQueryResult, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Bank, type BankSnapshot, type BirthCleartexts, type BoxLabelpath, type BoxRecord, type BoxUnsealed, Checkers, type Gating, type KeyDeriver, Labelpath, type PasskeyAddCleartexts,
  type PasskeyRevokeCleartexts, type PassphraseReplaceCleartexts, type PassphraseVerdict, PendingBank, type Tombstone, type UnlockCleartexts, type VaultDB, type Whisper,
} from 'safebyok'
import { FormMutationDefaults, boxRecordQueryKey, recordQueryDefaults, shownRecordOf } from './giver-defaults'
import { type GiverConfig, type GiverSlotSnapshot, GiverSlot } from './giver-slot'
import { type BoxQueryOpts, ScopeChecks } from './shapes-giver'

// == [Types]: ProviderProps, BoxShown, FormMutationResult, StrengthVerdictResult, ReactGiver, BankGiver

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
export type ReactGiver = ReturnType<typeof reactGiver>

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
export function reactGiver(config: GiverConfig) {
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

  const bankGiver = makeBankGiver(slot, useShownSnapshot)
  return Object.freeze({
    Provider,
    useStrengthVerdict,
    /** The hooks and calls of the giver's bank, refusing any other banklabel. Name the result in PascalCase (`const Knock = SOK.bank('knock')`), so the rules-of-hooks lint checks `Knock.useBank()`. */
    bank: (banklabel: string) => {
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

  /** The box's stored record, through React Query, its whisper still sealed.
   * `data` is the record, null when none is stored or it was deleted, and undefined while pending or while nobody is signed in.
   * A record overtaken by a newer revision shows until the newer one arrives.
   * `opts` are React Query's own, and override the giver's. A `select` given there is handed the whole record, the box's
   * tombstone, or its shell where none is stored.
   */
  function useBoxRecord<SelT = BoxRecord | null>(labelpath: string, opts: BoxQueryOpts<BoxShown, SelT> = {}): UseQueryResult<SelT> {
    const boxLabelpath = boxLabelpathOf(labelpath)
    const userid = useShownSnapshot((snap) => snap.userid)
    const queryKey: QueryKey = (userid === null) ? ['sok', null, banklabel, boxLabelpath] : boxRecordQueryKey({ userid, banklabel, labelpath: boxLabelpath })
    return useQuery<BoxShown, Error, SelT>({
      ...recordQueryDefaults(() => isBehind(boxLabelpath)),
      queryKey,
      queryFn: (userid === null) ? skipToken : () => getBoxShown(boxLabelpath),
      select:  shownRecordOf as (record: BoxShown) => SelT,
      ...opts,
    })
  }

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

  return Object.freeze({
    useBank, useBoxRecord, withWhisper, lock, dismissUnlock,
    useBirth, useUnlock, useReplacePassphrase, useAddPasskey, useRevokePasskey,
  })
}
// --

// == [Helpers]: boxLabelpathOf, Checks

/** The core's labelpath of the host's box `labelpath`, under `box/`. */
function boxLabelpathOf(labelpath: string): BoxLabelpath {
  return Checks.boxLabelpath.parse(`box/${Checks.labelpath.parse(labelpath)}`)
}

/** The checks of what a host hands a bank's hooks and calls. */
const Checks = Checkers('bad_record', ({ str, fn, custom }) => ({
  labelpath:    str.min(1),
  boxLabelpath: custom<BoxLabelpath>((val) => (typeof val === 'string') && Labelpath.isBox(val), 'Expected the labelpath of a box, such as `openai`'),
  fn:           fn(),
}))
// --
