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

## Where each Forms row keeps the secret

The Forms tab (thread 4) builds one form ten ways: a username (the box's sidecar) and a password (its whisper). Every
save is held six seconds by the dojo's vaultDB; then **save** stores the box, **stale** meets a box another device wrote
during the hold (`stale_write`, a real second `Device`), and **fail** is refused by the vaultDB (`storage_unavailable`).
Each cell names where the password's text could be read: **field** (the input's `value`), **attribute** (its `value`
attribute, which a serialized page shows), **variables** (a TanStack mutation's), **state** (React state, or a form
library's store). "Nowhere" means none of those. Asserted by `tests/components/forms/FormsTab.test.tsx` under jsdom,
except where marked. All three buttons read the same during the hold, and stale and fail read the same after it, so the
tables have one column for each. Once a save is stored, no row leaves the password in the DOM (asserted), so they have
no column for it; row 9's state keeps it in the render before (item below).

The tab opens with the Coach's question: "First, choose your tradeoff: would you like the value cleared on save, but
kept for edit or retry on error? Or would you like it cleared immediately, but require the user to re-enter it on a
problem?" A table of the rows to choose from follows, best first, then those rows; then, under a heading of their own, a
table of the rows that show what goes wrong, each naming its bad practice, then those rows.

| How to choose | While saving | After an error | Why |
| --- | --- | --- | --- |
| 1. Recommended, form Action: cleared on save, kept for edit or retry on error | field | field | React 19's own form idiom, plus one line: the form cancels React's reset when the save was refused. |
| 2. Balanced, plain HTML form (`onSubmit`): cleared on save, kept for edit or retry on error | field | field | Where a form Action does not fit: React never resets an `onSubmit` form, so the form clears itself once the box is stored. |
| 3. Balanced, with TanStack (a mutation that reads the form): cleared on save, kept for edit or retry on error | field | field | Keeps `useMutation`'s pending and error state: the mutation is handed nothing and reads the form inside its `mutationFn`, so its variables hold nothing. |
| 4. Balanced, with a form library (react-hook-form, the password not registered): cleared on save, kept for edit or retry on error | field | field | When the app already has a form library: give it every field but the secret, and read the secret from its input when the form submits. |
| 5. Hardened, unpleasant (`onSubmit`, the password emptied first): cleared at once, typed again after an error | nowhere | nowhere | Where a secret must not sit in a field while a slow save runs, as on a shared screen; the cost is typing it again after any error. |
| 6. Hardened, kinder (`onSubmit`, the password emptied first and put back on a refusal): hidden while saving, put back for edit or retry on error | nowhere | field | Where a secret must not sit in a field while a slow save runs, but an error should not cost typing it again; the cost is a handler that empties the input and fills it again by hand. |

| Avoid | While saving | After an error | What goes wrong |
| --- | --- | --- | --- |
| 7. Avoid, React's default (the form Action as its docs show it): cleared after every outcome | field | nowhere | Letting React's reset run after a refusal: the secret sits in its field for the whole save, and is still lost on an error. |
| 8. Avoid, a mutation handed the form (`putBoxMutationOptions`): cleared at once, never kept | nowhere; variables and state (React's form status) once, as it goes pending | nowhere | A secret in a mutation's variables: TanStack shows them to its cache's subscribers before the library deletes the password from them. |
| 9. Avoid, a controlled input (text in `useState`): cleared on save, kept for edit or retry on error | field, attribute, state | field, attribute, state | A secret in React state: React also writes it into the input's `value` attribute, so it is in the page's markup. Once stored, state keeps it in the render before; the DOM has nothing (attribute `""`). |
| 10. Avoid, a form library holding the secret (react-hook-form, as its docs show): cleared on save, kept for edit or retry on error | field, state (its store) | field, state (its store) | Registering the secret with the form library: its store keeps the text as typed, until the form is reset. |

Read with it:

* **React writes a controlled input's text into its `value` attribute**, for `type="password"` and `type="text"` alike
  (row 9, and the test that shows the password as text): the text is in the serialized DOM, not only in the live
  property. An uncontrolled input never gets the attribute, of either type. A `defaultValue` does write it: row 7 puts the
  username back from `texts` after a refusal, and the username then sits in the username's attribute. jsdom runs
  react-dom's own code here, so a browser should show the same; nobody has looked in one.
* **Row 8 empties the form as the save starts**: its action hands the form to `mutate` and returns at once, and React
  resets an action's form when the action returns. During the hold both fields are empty, and on a refusal what was typed
  is gone: no `texts` come back. The mutation's variables are the `FormData`. As `mutate` starts, its cache's subscribers
  are told of it with the password still in it, since TanStack tells its listeners when the mutation goes pending, before
  the `mutationFn` runs. So React Query's devtools, a `useMutationState` select or a persister sees the password once.
  The row's **Variables** cell shows it: a plain listener on the host's mutation cache writes what the variables held as
  the mutation went pending, `[["username","hero_at_site"],["password","made-up-password-1234"]]` (asserted). The library
  deletes the password before the hold begins, and from then on the variables hold only the username (asserted).
* **Row 3's variables are `undefined`**: nothing typed reaches TanStack (its Variables cell reads `(none)`, asserted). Its
  form is never reset by React, so it keeps the password after a refusal and resets itself once stored, as rows 2, 4 and
  10 do.
* **Row 4 keeps react-hook-form off the password**: the password's input is not registered; the save reads it through a
  ref when `handleSubmit` calls it, and empties it with `reset()` once stored. react-hook-form's store holds the username
  alone: a probe by the thread's second review walked the row's fiber, its hooks and react-hook-form's `control`, and
  found the password nowhere before the press, during the hold, or after save or fail, where the same walk finds it in
  row 10's `_formValues` (jsdom; not kept). It took no workaround:
  react-hook-form ignores an input it was not given. Its `reset()` calls `form.reset()` on the registered field's form
  too, which empties the password as well; the row empties it itself rather than lean on that.
* **Row 5 is not a form Action**, though one that reads the form and returns at once would empty the fields as early:
  React keeps the `FormData` it hands a form Action as the form's status (`useFormStatus`' `data`), and renders it with
  the password unless the action deletes the field before React renders (below). Row 5 submits from `onSubmit`, reads
  the form, empties the password's input, and only then sets its pending state; nothing of the password reaches React,
  TanStack or a store (the second review's probe found it in none of the row's hooks, during the hold or after), though
  the save holds it in its arguments until it ends, and so does the handler's own `FormData`, which the third review's
  probe found still reachable, password and all, through the hold. A refusal keeps the username (asserted) and leaves
  the password to type again.
* **Row 6 puts the password back on a refusal**: its `onSubmit` reads the password's input into a local, empties the
  input, and only then reads the form, so the `FormData` holds the username alone; the save takes the local as its
  argument. During the hold the mirror shows the input empty for every button; once stored the form resets and the
  password is nowhere; after stale or fail the handler writes the local back into the input's `value`, and the mirror
  shows the text with no `value` attribute (asserted, one test per button). The password reaches no React state, ref or
  store: the third review's probe walked the row's hooks and the form's fibers, the previous render's too, during the
  hold and after each outcome, and found it in none; writing `.value` back reaches neither React state nor the attribute,
  and the put-back survives the row's later renders. One oddity: the input stays enabled during the save, so text typed
  meanwhile is overwritten by the put-back on a refusal. Not a form Action, for row 5's reason
  and one more: React resets an action's form when the action ends, which would empty the password just put back unless
  the form cancelled it as row 1 does. **Row 6 is the sprint orchestrator's addition, not the Coach's**: it fills the
  one corner of the Coach's question no row showed, and goes without touching the rest if he would rather not offer it.
* **Row 1's one line works**: `onReset={(event) => { if (put?.err) { event.preventDefault() } }}`, reading the result the
  action resolved, from the render that commits it, keeps every field on a refusal and still clears on a save.
* **React state in rows 1 and 7**: `useActionState` keeps the result, whose `texts` hold the username but not the
  password, which the library deleted before reading them. Both are form Actions, and React's form status holds the
  submitted `FormData` while the action is pending, but without the password: see the next item.
* **React's form status, by experiment** (found by the thread's second review: a probe test, not kept, with a
  `useFormStatus()` reader under each form Action's form, recording `data` at every render; jsdom only). react-dom hands
  the action the very `FormData` it keeps as the status's `data`, so what the action deletes from it, the status loses.
  * Rows 1 and 7: no render sees the password. React calls the action within the submit event, `putBoxAction` deletes
    the field before its first await, and React renders the pending status after the event: `data` holds the username
    alone, at the first render and through the hold. Nothing in the form's fiber or the row's hooks reaches the password,
    during the hold or after any outcome.
  * Row 8: the first pending render's `data` holds the password. The action hands the form to `mutate` and returns; the
    library deletes the field only once TanStack's `mutationFn` runs, after a microtask, by which time React has rendered
    the pending status (and, as the action has returned, the not-pending one after it). In a browser, React's render is
    queued as a microtask before TanStack's, so the order should hold there too.
  * A form Action that never deletes the field (a probe row awaiting `putBoxOnce` on the form's text): every pending
    render's `data` holds the password, for the whole save, and once it ends the form's alternate fiber still keeps that
    status, password and all, until the form renders again. Row 9 shows the same of `useState`: after a save empties it,
    the alternate fiber keeps the password typed (the table's "the render before").
  * A second submit while row 1's save is pending (`fireEvent.submit`; the row's disabled buttons forbid it from the
    page) is queued by `useActionState`, and React renders the pending status with that submit's `FormData`, password
    included, until the first save ends and `putBoxAction` gets to delete it. So `putBoxAction` keeps the password out
    of React's form status only for a submit whose action runs at once.
* **react-hook-form's store** (row 10) keeps every registered field's text as it is typed, the password too, until
  `reset()`: `getValues()` answered `{"password":"…"}` in a probe test (not kept), and its source sets
  `_formValues[name]` on each change. It is outside React state, but React DevTools and its own DevTool reach it.
* **"State" is within a page script's reach too**, with more effort: the review read react-hook-form's store, and
  `useState` the same way, through the input's `__reactFiber$…` property. The mirror shows only the DOM, so the table's
  split between the DOM and state is one of effort, not of reach.
* **The Inspect tab cannot show row 8's variables**: it prints a `FormData` as `[object FormData]`. The Variables cell
  and the test read the host's mutation cache instead.

## What the library made awkward, verbose or impossible

Each with what it cost the dojo. None is smoothed over with machinery.

1. **idb-lean names no database or object store.** The dojo spells `safebyok-dojo:vault-v001-001-001` / `things`
   (from the README) and `…:persist-v001-001-001` / `clients` (from the source) to read and load rows. 4 lines in
   `src/lib/stores.ts`, and the vault's again in `scripts/make-fixture.ts`.
2. **`IdbPersister.persistClient` cannot be awaited**: it is throttled and fire-and-forget, so the fixture's caches
   cannot be written through it in order. Raw writes instead (part of 1).
3. **The roots minder's QueryClient is out of reach of a React host**: the giver exposes no device, so Inspect's TSQ
   panel shows the boxes' client only; Bank and Gate read 0 there. 0 lines; a gap in the panel.
   Thread 3 added a back door for a devtool: `device.maskedView()` in the core, handed on as `SOK.maskedView()`, answers
   the bank TSQ and the vault TSQ with each ciphertext masked to its last 2 characters and its length, and the lease by
   its loggable; the TSQ panel now reads it, so Bank and Gate show. The bank TSQ itself stays out of a React host's reach.
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
11. **`putBoxMutationOptions`' mutation key names the user signed in when the options are made.** Under `useMemo(…, [])`,
    as its docs show, a form mounted before the provider has signed the user in keys its mutation
    `["sok", null, "dojo", "putBox"]`. 0 lines; recorded.
12. **`putBoxMutationOptions`' documented form loses everything on a refusal** (row 8, above): `<form action={(form) => {
    put.mutate(form) }}>` returns at once, so React resets the form as the save starts, and the mutation gives back no
    `texts`. A host who keeps what was typed submits from `onSubmit` (row 2, or row 3 to keep a mutation) and loses the library's deleting of fields,
    which it then does not need. 0 lines; recorded.
13. **The library's form helpers take only a `FormData`**: a form library that hands the host a plain object
    (react-hook-form) cannot use `putBoxAction` or `putBoxMutationOptions`, and calls `putBoxOnce` itself (rows 4 and 10). 0 lines.
14. **Bringing about `stale_write` for real takes a second device**: a planted raw row meets `record_conflict` once this
    page has saved there (the README says so of New Box's Exists), and a box written before the save would ring this
    page's watch, which may hear it before the save cites. So the vaultDB holds the save, and a second `Device`,
    unlocked with the fixture's passphrase, writes a box during the hold, after the save has cited. About 30 lines in
    `src/lib/elsewhere.ts`; the dojo's scaffolding, not a host's. A save after a stale one then lands, the watch having
    told this page of the newer box.

React itself, not the library, cost two lines more: an outcome set after an `await` must be wrapped in
`startTransition` to commit with React's reset of the form, and a query-cache subscriber must go through
`notifyManager.batchCalls`, since `useBox` adds a query while it renders.
