# The dojo's findings (2026-11-23)

For the Coach and the workshop settling the threat model for form text: what each form kept and cleared, today, and what
the library made awkward for the dojo. Every row is what `tests/components/LoginTab.test.tsx` and `NewBoxTab.test.tsx`
assert, under jsdom over fake-indexeddb; nobody has yet looked at it in a real browser.

## What each form kept and cleared, today

"Cleared" is React's own reset of an uncontrolled form whose `action` is a function: React queues it as the action
starts, so it comes after every outcome, refused or not. A form that submits from `onSubmit` with `preventDefault` gets
none. The one exception is Login's Dismiss, where the dojo's own Cancel calls `form.reset()`.
The library deletes the secret fields from the `FormData` only; it never touches the inputs.

**Login** (Nolo, bank `unborn`): a hand-built form on `useBirth`, `useNewPassphrase`, `PassphraseInput` and `popField`.

| Button | What happens | username | passphrase | confirmation | message shown | stage after |
| --- | --- | --- | --- | --- | --- | --- |
| Sign In | the bank is born | cleared | cleared | cleared | Your vault is created. | `unlocked` |
| Weak | `weak_passphrase` (the birth judges again; the meter still says Strong enough) | cleared | cleared | cleared | That passphrase is too easy to guess. | `unborn` |
| Exists | `gate_made_elsewhere` | cleared | cleared | cleared | This vault's passphrase was just set on another device, … Enter the passphrase chosen there to unlock it. | `unborn` |
| Failed | `storage_unavailable` | cleared | cleared | cleared | The dojo told its vaultDB to refuse this write. | `unborn` |
| Dismiss | the form is reset; nothing reaches the library | cleared | cleared | cleared | (none) | `unborn` |

**New Box** (Hero, unlocked): `putBoxAction` under `useActionState`, `WhisperInput`, `useStrengthVerdict`, the username
put back with `defaultValue={put?.texts['username']}` as the giver's doc block says.

| Button | What happens | username | password | confirmation | message shown |
| --- | --- | --- | --- | --- | --- |
| Save | the box is put | cleared | cleared | cleared | Saved the box. |
| Weak | the host's own check (`whisperOf`) throws before the put | kept (put back from `texts`) | cleared | cleared | That password is too easy to guess: … |
| Exists | `stale_write` | kept | cleared | cleared | stale_write |
| Failed | `storage_unavailable` | kept | cleared | cleared | The dojo told its vaultDB to refuse this write. |
| Dismiss | `bank_locked`, the bank locked before the submit; no unlock prompt | kept | cleared | cleared | The bank is locked, so nothing was read or written: unlock it (bank.ensureUnlocked) and call again. |

Read with it:

* **The birth has no `texts`**: on every refusal Login loses the username the user typed. `putBoxAction` gives them
  back; the form verbs (`useBirth`, `useUnlock`, …) do not.
* **Exists on Login leaves the page unborn**: the message says to unlock with the passphrase chosen elsewhere, but the
  stage stays `unborn`, so a page switched on the stage shows the create form again until a reload.
* **New Box's Dismiss had no counterpart**: `putBoxAction` refuses `bank_locked` on a locked bank and never asks for
  the passphrase. Only `useDraft`'s `put` waits for the unlock form; the add-a-box path the demos use does not.

## What the library made awkward, verbose or impossible

Each with what it cost the dojo. None is smoothed over with machinery.

1. **idb-lean names no database or object store.** The dojo spells `safebyok-dojo:vault-v001-001-001` / `things`
   (from the README) and `…:persist-v001-001-001` / `clients` (from the source) to read and load rows. 4 lines in
   `src/lib/stores.ts`, and the vault's again in `scripts/make-fixture.ts`.
2. **`IdbPersister.persistClient` cannot be awaited**: it is throttled and fire-and-forget, so the fixture's caches
   cannot be written through it in order. Raw writes instead (part of 1).
3. **The roots minder's QueryClient is out of reach of a React host**: the giver exposes no device, so Inspect's TSQ
   panel shows the boxes' client only; Bank and Gate read 0 there. 0 lines; a gap in the panel.
4. **`useNewPassphrase` has no `judge`**, so once the checker changes, the Login meter cannot be judged again: it says
   Strong enough while the birth refuses `weak_passphrase`. 0 lines; recorded.
5. **A host's strength check at submit cannot await.** `whisperOf` is synchronous and the secrets must leave the
   `FormData` before the first await, so the check reads the verdict from render: the action is remade under `useMemo`
   keyed on the verdict, and Weak submits from an effect after the verdict lands. About 10 lines in `NewBoxTab.tsx`.
6. **The kit's `formActionOf` is private**, so a hand-built form verb rewrites it: pop the fields, make the gating,
   `mutateAsync`, and keep a second error for what threw before the mutation ran (the host's check, a gating at the
   wrong stage), since `birth.error` holds only the mutation's. About 20 lines in `LoginTab.tsx`.
7. **The form verbs give back no `texts`** (above): a host restoring the username would hand-roll it. Not built.
8. **Messages unfit for a user pass through `refusalTextOf`**: `stale_write`'s message is `stale_write`, and
   `bank_locked`'s tells a developer to call `bank.ensureUnlocked`. 0 lines; shown as they come.
9. **No unlock prompt for a box put** (above): building one means `useDraft` or a hand-made wait. Not built.
10. **No device-side way to read a vault database's rows**, as a devtool would: Inspect reads raw rows (part of 1).

React itself, not the library, cost two lines more: an outcome set after an `await` must be wrapped in
`startTransition` to commit with React's reset of the form, and a query-cache subscriber must go through
`notifyManager.batchCalls`, since `useBox` adds a query while it renders.
