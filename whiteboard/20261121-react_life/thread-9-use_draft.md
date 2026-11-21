# Thread 9: use_draft (2026-11-21)

Branch `20261121-use_draft`, PR [#805](https://github.com/mrflip/safebyok/pull/805), stacked on #803. Proved: `pnpm justify` green after the catch-up onto
`ef1cc6873`; `safebyok-react-lean` 200 tests, 11 of them `tests/giver/use-draft.test.tsx`.

* **Built**: `Knock.useDraft(labelpath)`, in `packages/safebyok-react-lean/src/giver/use-draft.ts`, wired onto the bank
  giver by one line in `makeBankGiver` (`makeUseDraft(slot, { useBank, useBox, withWhisper })`). It answers `isDirty`,
  `isWhisperDirty`, `isBehind`, `base`, `sidecar`, `setSidecar`, `whisperField(fieldname)`, `put(opts?)`, `discard`
  and `lastErr`. Types `Draft`, `DraftPutOpts` and `WhisperFieldProps` are exported from the package's index.
  `WhisperText`'s private `textOf` moved beside it as `whisperTextOf`, so both write a field's text the same way.
  Two rows in `notes/wontfix.md`. `es-toolkit` joins the package's dependencies (the core already depends on it).

## How it works

* **The base follows the store until the first edit.** `base` is `useBox`'s record (through a whole-record `select`)
  until `setSidecar` or a keystroke pins it; `discard` and a successful `put` unpin it. So an untouched draft always
  shows what is stored, and `isBehind` (`Thing.cmp(pinned, stored) > 0`) means: edited, and the stored box moved since.
  No new subscription, refetch or freshness check: it reads only what `useBox` answers.
* **The whisper lives in the DOM and in callbacks, nowhere else.** `whisperField(fieldname)` gives props for a plain
  `<input>`: a ref callback, `type` (`password` masked, `text` shown), `readOnly` while the reveal is on its way, a
  `••••••••` placeholder while the field is empty over a stored box, `onFocus`/`onBlur`/`onChange`, and
  `WhisperFieldAttributes`. No `name`, so a form's `FormData`, and so `useFormStatus().data`, never carries it.
  Focus calls `withWhisper`, whose callback writes the field into `input.value` (waiting for the unlock form on a locked
  bank, then giving the input its focus back). Blur masks, and empties the input unless it was typed into. A lock masks
  the shown field (render-phase reset, as `WhisperText` does) and an effect empties the inputs not typed into. React
  state holds only the pinned record (sealed), the draft sidecar, the names of the fields typed into, which field is
  shown, and the last reveal's refusal.
* **`put` is `withWhisper` around `vault.putBoxOnce`**: the fields typed into are read from their inputs, merged over the
  stored whisper inside the callback, and written with the draft's sidecar, citing the pinned base (or the box read,
  unpinned). A sidecar-only change still needs the whisper, so it goes through the callback too (`notes/wontfix.md`,
  *Changing only a box's sidecar needs the bank unlocked*). On a refusal the draft is left as it was.

## Decisions made

* **`put` cites the base, so a draft behind refuses `stale_write`**, rather than writing over the newest revision as
  `putBoxOnce` does. A draft is edited against what it showed; writing over another device's revision would lose its
  sidecar change silently. `discard` then starts again from the newest. `rebase` (keep the edits, move the base) is
  left out, as the plan says.
* **`put` waits for the unlock form on a locked bank** (it is `withWhisper`'s wait), where `putBoxOnce` refuses
  `bank_locked`. It needs the whisper anyway, and envman's Save should not fail on a lock the user can answer.
* **`put(opts)` takes `sidecarOf(whisper, sidecar)`**, as `putBoxAction` does, run inside the write's callback: the
  hook for a stamp or a mask. `isWhisperDirty` lets a host stamp only when a field was typed into. Both are additions
  to the dream's list.
* **`lastErr`** holds a reveal's refusal (`dismissed` when the unlock form is closed), rather than swallowing it; a
  `put`'s refusal rejects its promise.
* **`isDirty` compares sidecars by value** (`es-toolkit`'s `isEqual`), so setting the base's sidecar back is clean. A
  field typed into stays dirty even if typed back to its old text: telling would need the old text outside a callback.
* **The draft edits a stored box.** On a box none is stored at, a focus refuses `absent_box` into `lastErr` and `put`
  refuses `absent_box`. Thread 10's add form writes new boxes with `putBoxOnce` or `putBoxAction`.

## Deviations

* **Props for a plain `<input>`, not for `WhisperInput`.** The dream's comment says "props for WhisperInput", but its
  own code line spreads them on `<input>`, and `WhisperInput` takes a `name` and has its own Show button, which would
  fight the focus reveal.
* **The callbacks are fresh each render**, not stable as the dream's comment says: each closes over the render's
  state. A host passing `draft.put` to `useMutation` is unaffected.

## Discoveries

* `fireEvent.focus` does not reach React's `onFocus` (React listens to `focusin`): tests call `input.focus()` and
  `input.blur()` inside `act`.
* `bank.getSnapshot()` is the way to read a bank's snapshot in a test (there is no `snapshot` getter).

## For thread 10 (envman)

```tsx
const draft = Env.useDraft(id)
<input aria-label="Value" {...draft.whisperField('val')} />
<button disabled={! draft.isDirty} onClick={() => { void save() }}>Save</button>
<button disabled={! draft.isDirty} onClick={draft.discard}>Undo</button>
async function save() {
  await draft.put({ sidecarOf: (_whisper, sidecar) => (draft.isWhisperDirty ? { ...sidecar, last_rotated_at: Date.now() } : sidecar) })
}
```

* Show `draft.isBehind` ("changed elsewhere: Undo to see it") and `put`'s rejection (`stale_write`) beside Save.
* The gear modal edits the sidecar: either `draft.setSidecar({ ...draft.sidecar, title, rotation_period })` and let
  the row's Save write it, or have the modal's own Save call `draft.put({ sidecarOf: (_whisper, sidecar) => ({ ...sidecar, title }) })`.
  `setSidecar` then `put` in one handler writes the old sidecar: `put` reads the render's state.
* Red for an old record reads `base?.sidecar.last_rotated_at` against the period; it follows the store while clean.

## For the Coach

* **`notes/security.md`**: the draft's reveal path (DOM value by ref, no `name`, `put` merging inside `withWhisper`)
  may deserve an entry; the worker did not spawn the `sonnet` recorder without the orchestrator's word.
* Two `notes/wontfix.md` rows await a ruling: a lock landing mid-reveal, and another device writing between a reveal
  and the first keystroke.
