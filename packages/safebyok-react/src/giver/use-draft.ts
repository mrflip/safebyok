/** `useDraft`, a bank's editor of one box: its sidecar in React state, the fields of its whisper in the page's inputs, and `put` to write them back. */

import { isEqual } from 'es-toolkit'
import { type ChangeEventHandler, type FocusEventHandler, type RefCallback, useEffect, useRef, useState } from 'react'
import {
  type BoxRecord, type BoxUnsealed, Checkers, type LiveOf, type Sealable, Shell, type Sidecar, Thing, type Vault, VaultError, type Whisper, WhisperFieldAttributes, bulletproofHandlerOf,
} from 'safebyok'
import { sanitizeForeignError } from 'safebyok/storage'
import { PartsPhrases } from '../parts/phrases-parts'
import { liveOf } from './giver-defaults'
import * as Phrases from './phrases-giver'
import type { BoxSelected, BoxShown } from './react-giver'
import { type BoxQueryOpts, HostCallbackOpts } from './shapes-giver'
import { type RevealFriend, useReveal } from './use-reveal'

// == [Types]: Draft, DraftPutOpts, WhisperFieldProps, DraftFriend

/** What a bank's `useDraft` answers: a draft of one box, its sidecar and the fields of its whisper, and the calls that write or drop it. */
export type Draft = Readonly<{
  /** True while the draft differs from its base: its sidecar does, or a field of its whisper has been typed into. */
  isDirty:        boolean
  /** True while a field of the draft's whisper has been typed into: to stamp a sidecar field when `put` writes a new whisper. */
  isWhisperDirty: boolean
  /** True once the stored box has moved past `base`: another device or tab wrote or deleted it since the draft was first edited.
   * `put` then refuses `stale_write`, and `discard` starts again from the box stored.
   */
  isBehind:       boolean
  /** The record the draft is based on: the stored box until the draft is first edited, then the revision stored at that moment.
   * null where none is stored or it was deleted; undefined while pending or while nobody is signed in.
   */
  base:           BoxSelected
  /** The draft's sidecar: the base's until `setSidecar` sets another. */
  sidecar:        Sidecar
  /** Set the draft's sidecar, whole, as `put` will write it. */
  setSidecar:     (sidecar: Sidecar) => void
  /** The props of an `<input>` for the field `fieldname` of the box's whisper. Spread them onto the input.
   * The input shows the field masked. Focusing it shows the field's text, which `withWhisper` writes into the input's
   * value, never into React; on a locked bank it waits for the unlock form first. Leaving it masks it again, and empties
   * it unless it was typed into. The input has no name, so a form's `FormData` never carries it.
   */
  whisperField:   (fieldname: string) => WhisperFieldProps
  /** Write the draft, resolving the box stored, and start again from it. On a locked bank, it first waits for the unlock form.
   * It writes the fields typed into over the box's whisper, and the draft's sidecar, citing the base.
   * It tries once, and rejects with its refusal, the draft left as it was: `stale_write` where the box has moved past the base.
   */
  put:            (opts?: DraftPutOpts) => Promise<LiveOf<BoxRecord>>
  /** Drop the draft's edits and empty its inputs, starting again from the box stored. */
  discard:        () => void
  /** Why the last field focused could not be shown, such as `dismissed` when the user closed the unlock form, or null. */
  lastErr:        Error | null
}>

/** How a draft's `put` writes. */
export type DraftPutOpts = Readonly<{
  /** The sidecar to write, from the whisper about to be written and the draft's sidecar. Left out, the draft's sidecar is written.
   * Use the whisper only inside it, and return no part of it. What it throws rejects `put`, anything that is no `Error` wrapped in one.
   */
  sidecarOf?: ((whisper: Whisper, sidecar: Sidecar) => Sidecar) | undefined
}>

/** The props a draft's `whisperField` gives an `<input>`: its ref, its type, its handlers, and the attributes that keep password managers away. */
export type WhisperFieldProps = typeof WhisperFieldAttributes & Readonly<{
  ref:         RefCallback<HTMLInputElement>
  type:        'text' | 'password'
  /** True while the field's text is on its way, so nothing typed meanwhile is written over. */
  readOnly:    boolean
  placeholder: string | undefined
  onFocus:     FocusEventHandler<HTMLInputElement>
  onBlur:      FocusEventHandler<HTMLInputElement>
  onChange:    ChangeEventHandler<HTMLInputElement>
}>

/** What a draft reads of its bank's giver. */
type DraftFriend = RevealFriend & Readonly<{
  useBox:      (labelpath: string, opts: BoxQueryOpts<BoxShown, BoxShown>) => Readonly<{ data: BoxShown | undefined }>
  /** The vault of the signed-in user's bank, refusing `absent_vault` while there is none. */
  demandVault: () => Vault
}>
// --

// == [The hook]: makeUseDraft

/** The `useDraft` of the bank `bank` reads. */
export function makeUseDraft(bank: DraftFriend) {
  /** A draft of the box at `labelpath`: an editor's sidecar, its whisper's fields as inputs, and `put` and `discard` for its Save and Undo.
   * The fields' text lives only in the inputs: React never holds it, and `put` reads it from there.
   * The inputs may sit in a form whose action calls `put`. React empties that form once the action ends, and the draft forgets the fields
   * typed into with it, so a refused put there loses what was typed, but not the draft's sidecar.
   * @example
   *   const draft = Knock.useDraft('jokes')
   *   <input aria-label="API key" {...draft.whisperField('apiKey')} />
   *   <button disabled={! draft.isDirty} onClick={() => { void draft.put() }}>Save</button>
   *   <button disabled={! draft.isDirty} onClick={draft.discard}>Undo</button>
   */
  function useDraft(labelpath: string): Draft {
    const stored = bank.useBox(labelpath, { select: wholeThingOf }).data
    const isLocked = bank.useBank((snap) => snap.isLocked)
    const [pinned, setPinned] = useState<BoxShown | undefined>(undefined)
    const [sidecarSet, setSidecarSet] = useState<Sidecar | null>(null)
    const [dirtyFieldnames, setDirtyFieldnames] = useState<ReadonlySet<string>>(NoFieldnames)
    const reveal = useReveal(bank, labelpath)
    const [lastErr, setLastErr] = useState<Error | null>(null)
    const inputs = useRef(new Map<string, HTMLInputElement>())

    const baseThing = (pinned === undefined) ? stored : pinned
    const base = (baseThing === undefined) ? undefined : liveOf<BoxRecord>(baseThing)
    const baseSidecar = base?.sidecar ?? EmptySidecar
    const sidecar = sidecarSet ?? baseSidecar
    const isWhisperDirty = dirtyFieldnames.size > 0
    const isSidecarDirty = ! isEqual(sidecar, baseSidecar)
    const isDirty = isWhisperDirty || isSidecarDirty
    const isBehind = (pinned !== undefined) && (stored !== undefined) && isMovedPast(pinned, stored)

    // Locking the bank masks the field shown, and this empties every input not typed into.
    useEffect(() => {
      if (isLocked) { emptyInputs(inputs.current, dirtyFieldnames) }
    }, [isLocked, dirtyFieldnames])

    // React empties a form's uncontrolled fields once its action ends, firing no change event, so the draft forgets them with it.
    // An effect listens, not the inputs' ref callbacks: React detaches a ref callback that changed before it resets the form in the same commit.
    useEffect(() => {
      const forms = formsOf(inputs.current)
      for (const form of forms) { form.addEventListener('reset', forgetTyped) }
      return () => { for (const form of forms) { form.removeEventListener('reset', forgetTyped) } }
    })

    /** Base the draft on the box stored now, unless it already has a base. */
    function pin(): void { setPinned((prior) => (prior === undefined) ? stored : prior) }

    function setSidecar(next: Sidecar): void {
      pin()
      setSidecarSet(next)
    }

    /** Show the field `fieldname` in `input`: what was typed there, or else the box's whisper, written into its value. */
    async function revealField(fieldname: string, input: HTMLInputElement): Promise<void> {
      if (reveal.fieldname === fieldname) { return }
      if (dirtyFieldnames.has(fieldname)) {
        reveal.showTyped(fieldname)
        return
      }
      setLastErr(null)
      try {
        await reveal.showWhisper(fieldname, (text) => { input.value = text })
        // The unlock form takes the focus while the bank is locked: the field shown is given it back.
        if (input.ownerDocument.activeElement !== input) { input.focus() }
      } catch (err) {
        setLastErr(sanitizeForeignError(err))
      }
    }

    /** Mask the field `fieldname`, emptying `input` unless it was typed into. A field on its way stays so: the unlock form took the focus. */
    function maskField(fieldname: string, input: HTMLInputElement): void {
      if ((reveal.fieldname === fieldname) && (! reveal.isRevealed)) { return }
      if (! dirtyFieldnames.has(fieldname)) { input.value = '' }
      reveal.mask()
    }

    function markDirty(fieldname: string): void {
      pin()
      setDirtyFieldnames((prior) => (prior.has(fieldname) ? prior : new Set([...prior, fieldname])))
    }

    function whisperField(fieldname: string): WhisperFieldProps {
      Checks.fieldname.parse(fieldname)
      const isRevealed = (reveal.fieldname === fieldname) && reveal.isRevealed
      const isEmpty = (! isRevealed) && (! dirtyFieldnames.has(fieldname))
      return {
        ...WhisperFieldAttributes,
        ref:         (input) => holdInput(inputs.current, fieldname, input),
        type:        isRevealed ? 'text' : 'password',
        readOnly:    (reveal.fieldname === fieldname) && (! reveal.isRevealed),
        placeholder: ((base !== null) && (base !== undefined) && isEmpty) ? PartsPhrases.masked : undefined,
        onFocus:     (event) => { void revealField(fieldname, event.currentTarget) },
        onBlur:      (event) => { maskField(fieldname, event.currentTarget) },
        onChange:    () => { markDirty(fieldname) },
      }
    }

    /** Forget the fields typed into and mask the field shown, as a form reset empties them. A draft with no sidecar edit left is discarded. */
    function forgetTyped(): void {
      if (isSidecarDirty) {
        emptyInputs(inputs.current, NoFieldnames)
        setDirtyFieldnames(NoFieldnames)
        reveal.mask()
      } else {
        discard()
      }
    }

    function discard(): void {
      emptyInputs(inputs.current, NoFieldnames)
      setPinned(undefined)
      setSidecarSet(null)
      setDirtyFieldnames(NoFieldnames)
      reveal.mask()
    }

    async function put(opts: DraftPutOpts = {}): Promise<LiveOf<BoxRecord>> {
      const { sidecarOf: hostSidecarOf } = Checks.draftPutOpts.parse(opts)
      const sidecarOf = hostSidecarOf && bulletproofHandlerOf(hostSidecarOf, HostCallbackOpts)
      const edits = Object.fromEntries([...dirtyFieldnames].map((fieldname) => [fieldname, inputOf(inputs.current, fieldname).value]))
      const box = await bank.withWhisper(labelpath, async (whisper, unsealed) => {
        const nextWhisper = { ...whisper, ...edits }
        const draftSidecar = sidecarSet ?? ((pinned === undefined) ? unsealed.sidecar : baseSidecar)
        const patch = { sidecar: sidecarOf ? sidecarOf(nextWhisper, draftSidecar) : draftSidecar }
        const vault = bank.demandVault()
        return await vault.putBoxOnce(citedOf(vault, pinned, unsealed), patch, { whisper: nextWhisper })
      })
      discard()
      return box
    }

    return { isDirty, isWhisperDirty, isBehind, base, sidecar, setSidecar, whisperField, put, discard, lastErr }
  }

  return useDraft
}
// --

// == [Helpers]: NoFieldnames, EmptySidecar, wholeThingOf, isMovedPast, citedOf, holdInput, inputOf, formsOf, emptyInputs, Checks

/** No field typed into. */
const NoFieldnames: ReadonlySet<string> = new Set()

/** The sidecar of a draft with no box to base it on. */
const EmptySidecar: Sidecar = Object.freeze({})

/** The `select` that hands a draft the whole record, or null, to compare revisions by. */
function wholeThingOf(thing: BoxShown): BoxShown { return thing }

// The item never goes back, so a stored box other than the pinned one has moved past it.
/** True when `stored` has moved past `pinned`: a newer revision, or one of them null and the other not. */
function isMovedPast(pinned: BoxShown, stored: BoxShown): boolean {
  if ((pinned === null) || (stored === null)) { return ((pinned === null) !== (stored === null)) }
  return (Thing.cmp(pinned, stored) > 0)
}

// The put unseals the box first, so a base that is null meets a box stored live only where one was written since: the
// shell cites nothing stored, and the put refuses.
/** What a draft's put cites: its base, the box's shell where the base is null, or with no base the box unsealed. */
function citedOf(vault: Vault, pinned: BoxShown | undefined, unsealed: BoxUnsealed): Sealable<LiveOf<BoxRecord>> {
  if (pinned === undefined) { return Thing.sparseOf(unsealed) }
  if (pinned !== null) { return pinned }
  const scope = { modelkind: unsealed.modelkind, userid: unsealed.userid, banklabel: unsealed.banklabel, labelpath: unsealed.labelpath }
  return Shell.of(scope, vault.bank.rootBox)
}

// React hands a ref callback null only where it returned no cleanup, which this one always does.
/** Hold `input` in `inputs` as the field `fieldname`'s, until React calls the cleanup returned. */
function holdInput(inputs: Map<string, HTMLInputElement>, fieldname: string, input: HTMLInputElement | null): () => void {
  if (input !== null) { inputs.set(fieldname, input) }
  return () => { inputs.delete(fieldname) }
}

/** The input holding the field `fieldname`, which has text typed into it. Throws where it has left the page, rather than let the field be written empty. */
function inputOf(inputs: ReadonlyMap<string, HTMLInputElement>, fieldname: string): HTMLInputElement {
  const input = inputs.get(fieldname)
  if (input === undefined) { throw new VaultError('bad_record', Phrases.TypedFieldGone) }
  return input
}

/** The forms the inputs of `inputs` belong to. */
function formsOf(inputs: ReadonlyMap<string, HTMLInputElement>): ReadonlySet<HTMLFormElement> {
  return new Set([...inputs.values()].flatMap((input) => ((input.form === null) ? [] : [input.form])))
}

/** Empty every input of `inputs` but those of `keptFieldnames`. */
function emptyInputs(inputs: ReadonlyMap<string, HTMLInputElement>, keptFieldnames: ReadonlySet<string>): void {
  for (const [fieldname, input] of inputs) {
    if (! keptFieldnames.has(fieldname)) { input.value = '' }
  }
}

/** The checks of what a host hands a draft. */
const Checks = Checkers('bad_record', ({ obj, str, fn }) => ({
  fieldname:    str.min(1),
  draftPutOpts: obj({ sidecarOf: fn<NonNullable<DraftPutOpts['sidecarOf']>>().optional() }),
}))
// --
