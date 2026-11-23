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

## What each Practice card shows

The Practice tab (thread 5) has a card for each thing a careful form with a secret does: a working example to copy, a
line or two on why, and the thing not to do beside it where there is one. Each card's claims are asserted by
`tests/components/practice/<Card>.test.tsx` under jsdom (over fake-indexeddb, for a card that saves); "read" marks what was
only read, in react-dom's source or elsewhere, and not run. Nobody has looked at the tab in a real browser.

Where a test says the secret is in no React state, `TH.fiberHolds` walked every fiber of the page's tree, current and
alternate: each hook's state, queue and skipped updates (`baseQueue`), each component's props, each form's status,
`FormData` values included. It reads plain data only: a closure (what a debounce holds), a `Map` or `Set`, and a
`#private` field are out of its reach, and so TanStack Query's caches are. It finds the key in the double-submit card's
queued form status (item 2), and `tests/test-helpers/fiber-holds.test.tsx` pins its reach into `baseQueue`, so it is
not blind.

1. **Hold the submit until zod passes, and show each message by its field** (`ValidateCard`). The check runs in
   `onSubmit`, reading `new FormData(form)`, and calls `preventDefault()` when zod refuses: react-dom 19.3.1 starts a
   form Action only when the submit event was not default-prevented (`extractEvents$1`, read), so no action runs, no
   reset comes, and nothing goes into the form's status, unless the handler itself started a transition, when React puts
   the form's `FormData` in its status all the same (read) (run: no save, both fields kept, the first bad field
   focused). Only the messages are in state; once one shows, the form checks itself again on each change, so a mended
   field's message clears (run). Each message is the `aria-describedby` of its field, which is `aria-invalid` while it
   has one (run). A zod 4 issue carries no copy of the input: the messages are the schema's own, the card's text never
   holds the key, and the fiber walk finds it nowhere (run). The **Don't** runs the same check inside the form Action:
   React resets the form once the action returns, so the messages sit beside emptied fields (run). **Where the check has
   to run**, then: in `onSubmit`, before React starts the action. Inside the action it comes too late to keep what was
   typed, unless the form also cancels its reset as Forms row 1 does.
2. **Disable the submit while the save is pending** (`DoubleSubmitCard`, real saves held by the dojo's vaultDB). The
   library's `SubmitButton` is disabled from the first press until the save ends; a press on it then starts nothing, and
   React's form status holds only the name, the library having deleted the key before its first await (run). The
   **Don't**, a plain enabled button pressed twice: `useActionState` queues the second submit, React's form status shows
   `keyname, apiKey`, and the fiber walk finds the key; both saves land, and once they have, the walk finds it nowhere
   (run). Between those, by one run of the reviewer's, not asserted: the key leaves the queued `FormData` when the first
   save ends and the second action, starting, deletes it; React commits neither save's result until both have ended, so
   the status line keeps reading `keyname, apiKey` until then, and no "Saves ended: 1" is ever shown. This is the
   second-submit item of *React's form status, by experiment*, above, shown.
3. **Don't debounce a secret's check or its submit** (`DebounceCard`, es-toolkit 1.53.2's `debounce`, with the dojo's
   made-up service and save; fake timers). Run: a debounced check typed into and then cleared (`form.reset()`, which
   fires no change) fires after its wait with the 24-character key, the field then holding nothing; one whose form was
   removed fires too ("the form was gone"); nothing fires before the wait ends. es-toolkit releases what it holds once
   it fires or is cancelled (read, its source), so it holds the key exactly until it fires, and no longer. A debounced
   submit merges the presses within its wait into one save, which is a guard of a sort; but a press after the wait while
   the save is still pending starts a second save, the two running together (run). **The brief's "it only delays the
   second one" is not quite true**: within its wait it merges the presses into one call, with the last press's arguments
   (read, its source); after it, it lets the next press through. The right tools beside it: the submit disabled while
   pending (run: two presses, one save), a test on a button press (item 9), and for a check as the user types, the
   latest answer only, as `useStrengthVerdict` does (read, its `judgeseq`). Not shown: firing after the bank locks,
   which is the same timer and was not run. lodash is not a dependency here (only `lodash.merge`).
4. **Invite a password manager to the passphrase, and disinvite it from a key** (`PasswordManagerCard`). The kit's
   `UnlockForm`, handed `username`, renders a real form, a hidden `username` field with `autocomplete="username"`, and
   `name="passphrase"` with `type="password"` and `autocomplete="current-password"` (run); it unlocks the bank (run).
   `useNewPassphrase` gives each new field `autocomplete="new-password"` (read; item 5 renders it). The key's
   `WhisperInput` carries every attribute of `WhisperFieldAttributes` (run). What a manager does with any of it, Chrome's
   built-in one above all, was not run: the export's doc says Chrome's still offers a saved password for a
   `type="password"` field marked `off`, and the card says so.
5. **A new passphrase's strength as it is typed, and its confirmation** (`NewPassphraseCard`; the brief's items 5 and 6
   as one card, since `useNewPassphrase` does both over `useStrengthVerdict`). Run: three characters get the dojo
   checker's reason, four "Strong enough", six spaces the library's own blank verdict; a confirmation that differs is
   `aria-invalid` with "The passphrases do not match", and one that matches makes the form ready; neither text is found by
   the fiber walk.
6. **Turn the typing helpers off on a field that can be revealed** (`RevealCard`). Run: a hand-made Show button leaves
   the field `type="text"` with no `spellcheck`, `autocorrect` or `autocapitalize`; the library's `WhisperInput` and
   `PassphraseInput`, shown, keep `spellcheck="false"`, `autocorrect="off"` and `autocapitalize="none"`. **What the
   library's parts set**: `WhisperInput` spreads `WhisperFieldAttributes` after the host's props, and its type leaves
   them out, so a host cannot undo them; `PassphraseInput` sets the three before the host's props, so a host can. Both
   hide the field again while a form Action's submit is pending; in a form that submits from `onSubmit`, only
   `PassphraseInput` does, handed `isPending`, and `WhisperInput`, having no such prop, stays shown (read; the reviewer
   ran the latter once). What a browser's spell-checker or a phone's keyboard does with a text field's contents was
   read, not run: public reports (2022) found enhanced spell-check services in Chrome and Edge sending field text to
   their servers.
7. **Let a key be pasted, and trim it where the whisper is made** (`PasteCard`). Run: a key set as pasted, with two
   spaces before it and a space and a newline after, is stored trimmed (read back with `withWhisper`), and the page
   shows its `mask`; the input drops the newline itself, as HTML has a single-line input do, so the trim is for the
   spaces; a paste into the **Don't**'s field is cancelled. **A passphrase's surrounding spaces**: the library takes a
   passphrase as typed and trims nothing (read: `passphraseCleartext` is a plain string); Hero's passphrase with a space
   after it unlocks nothing (run, in `PasswordManagerCard`'s test), and one of only spaces is judged weak (run, item 5).
8. **After a refusal, focus the field and say what to do** (`RefusalCard`). Run: a refused save keeps the key, focuses its
   field, and shows the kit's text in a `role="alert"` that the field is described by, the field `aria-invalid`; a save
   meeting `stale_write` shows the form's own words instead of the kit's `stale_write` (awkward item 8); a save after a
   refusal lands and empties the form.
9. **Test a key with a button the user presses** (`TestKeyCard`, the dojo's made-up service). Run: the handler reads the
   field when pressed, the button is disabled while the check runs, the answer shows, the key stays in its field, and the
   fiber walk finds it nowhere.
10. **Give an onSubmit form `method="post"`** (`PostMethodCard`). Read in react-dom 19.3.1's server renderer and run
    with `renderToString` under jsdom: a form that submits from `onSubmit` is rendered as a bare `<form>`, whose
    `method` a browser reads as `get`, so a submit before React attaches would send every field, the key too, in the URL
    (HTML's form submission, read, not run in a browser). With `method="post"` the tag keeps it, and the fields would go
    in the body, still to the server. A form Action is rendered with `action="javascript:throw …"`, no `method`, and a
    script that catches an early submit and keeps its `FormData`, secret included, in `document.$$reactFormReplay` until
    React attaches and replays it; React warns of a `method` given beside a function `action`, and the server renderer
    drops it (run); the client keeps the attribute and submits through the action all the same (the reviewer's run, not
    asserted). So the card is for `onSubmit` forms only. Which of the library's forms it touches: awkward item 16.

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

15. **The kit's `UsernameField` is not exported**: a host's own passphrase form writes the hidden username field again
    (one line). The Practice tab shows the kit's `UnlockForm` instead. 0 lines; recorded.
16. **The kit's `UnlockForm` and passkey unlock submit from `onSubmit` with no `method`**: rendered on a server and
    submitted before React attaches, the browser would send `UnlockForm`'s passphrase and username in the URL (Practice
    item 10). The passkey unlock has no field, so an early submit only reloads the page with an empty query. The kit's
    form Actions (`CreateVaultForm`, `ReplacePassphraseForm`, the passkey add and revoke) are safe from it. The two are
    shown at stage `locked`, which a server rarely knows, so the risk is narrow. 0 lines; recorded, not built: nothing
    under `packages/` changes in this thread.
17. **The kit's `UnlockForm` submitted before the bank is brought up rejects unhandled**: `formActionOf` rejects a
    gating made at the wrong stage, as its doc says, and `UnlockForm` awaits it with no `catch` (its `submit` has
    `try`/`finally`, under `void`). The passkey unlock has the same shape, but renders only once the bank's header names
    a passkey. A test that unlocked through the Practice card before the stage showed `locked` met it. The form is
    documented for stage `locked`. 0 lines; recorded.
18. **`useDraft` reveals a field only on its focus**: there is no call to show a field without focusing it, and none to
    show it read-only. The envman eye and quill are the host's buttons that move the focus, each cancelling its
    `mousedown` so the press does not blur, and mask, the field first, with a ref composed onto the draft's: about 25 lines
    in `src/components/scenarios/EnvmanForm.tsx`. A click on the field, or a Tab into it, shows it too; and after a lock
    with the field focused the eye does nothing, since focusing a focused field fires nothing.
19. **A revealed draft field is editable**: double-click-to-edit takes a boolean of the host's and a `readOnly` joined to
    the draft's. 4 lines.
20. **`useDraft` has no pending state, outcome or order for `put`**: the host counts saves under way and logs how each
    ended, about 15 lines, and `SaveLog.tsx` shows them. Two puts at once cite the same base, so whichever lands second
    refuses `stale_write`. Where the first lands first, an edit made between the two is lost from the box and the form;
    only where the first is held past the second is every edit stored.
21. **`put` starts the draft again from the box stored when it lands**: it empties every input and drops the sidecar
    edit, including whatever was typed after it began. Keeping that typing would take a host's own diff of the draft
    against what the put sent. Not built.
22. **`put` empties the field that has the focus**: after Enter in a field being edited, the field stays focused,
    editable, masked and empty; the eye does nothing until it loses focus, since focusing a focused field fires nothing;
    and what is typed next replaces the whole whisper. 0 lines.
23. **A draft field typed into keeps its text in the input's `value` while masked, and across a lock**: `put` reads it
    from there. 0 lines; the envman mirror shows it.
24. **`WhisperInput`'s button reads Show and Hide**, from `PartsPhrases`, and no prop makes it an eye. 0 lines.
25. **A draft's mask is the placeholder of an empty input**, eight dots, saying nothing of the stored whisper;
    `WhisperMask` is an element of its own. 0 lines.
26. **`useDraft` binds no sidecar field to an input**: `whisperField` gives a whisper's field its props, but the sidecar
    comes whole, so the envman username is a controlled input bound by hand, a reader of one string field and a setter
    spreading the whole sidecar. About 7 lines.
27. **`useDraft` has no save on blur**: the host wraps the whisper field's `onBlur` around its own, with the draft's
    `isDirty`, and adds one to the username. About 6 lines; a move from one field into the other saves too (E10).

React itself, not the library, cost two lines more: an outcome set after an `await` must be wrapped in
`startTransition` to commit with React's reset of the form, and a query-cache subscriber must go through
`notifyManager.batchCalls`, since `useBox` adds a query while it renders.

## The Scenarios forms, claim by claim

Thread 6 built the two forms the Coach describes as a user would meet them, on the Scenarios tab
(`src/components/scenarios/`), and asked of each of his sentences whether it holds "with no weirdness". **Envman** edits
Hero's stored box `github` on `useDraft`: the username (sidecar) in a plain input, the password (whisper) in the
draft's field, an eye and a quill beside it, and Save, or a save when either field loses focus. **API key** writes a new
box from the Forms tab's recommended row (a form Action through `putBoxAction` that cancels React's reset on a refusal)
with a `WhisperInput`, and shows the box stored beneath it by `WhisperMask`. The app mounts the kit's `UnlockDialog`.
Each row is asserted by `tests/components/scenarios/ScenariosTab.test.tsx`, one test a claim, under jsdom; **nobody has
run either form in a real browser**: the machine has none.

| Claim | Today | What was found |
| --- | --- | --- |
| E1. I see the whisper field masked. | works | An empty password input, its placeholder eight dots: it says nothing of the password's length. |
| E2. I click an eye and I see it. | works, odd | The password shows in the field, read-only; a second press masks it. Any focus shows it too (a click on the field, a Tab into it): the eye is a host button that focuses the field (list item 18). After a lock, or a save that lands, with the field focused, the eye does nothing until the field loses focus. From the keyboard the eye only shows it: a Tab to the eye masks the field, so pressing the eye shows it again. |
| E3. I double click the field and I am editing its cleartext like a text edit. | works | The host keeps the field read-only until a double click (item 19). |
| E4. The quill edit button to its right does the same. | works | One press reveals and makes it editable. |
| E5. On blur it masks again. | works, odd | Dots again, but not the same dots: a field not typed into is emptied, back to the placeholder's eight; one typed into shows a dot a character, since it keeps its text in the input's `value` until a save lands, and across a lock (items 23, 25). |
| E6. I can click Save while the field is masked. | works | Save writes the password typed and the username. Disabled until something is typed, as `useDraft`'s example has it. |
| E7. I can click Save while the field is not masked. | works, odd | A mouse press on Save saves what was typed; the field masks as the press takes the focus, as on any blur. Enter in the field saves without masking it first, and once the save lands leaves the field focused, editable, masked and empty: the eye does nothing until it loses focus, and what is typed next replaces the whole password (item 22). |
| E8. Save puts both the whisper and the sidecar. | works | One press, both fields; a field left alone keeps what was stored. |
| E9. It saves in the background: nothing goes away in the form. | cannot today | During the save the form stays usable; once it lands, the username shows what was saved (no render shows the old one) and the password shows masked. But whatever is typed while a save runs, in either field, goes away when it lands, and a password revealed meanwhile is masked and emptied under the focus (item 21). Going on working while it saves is what "in the background" asks for, and that is where things go away. |
| E10. I can save on blur of the sidecar field. | works, odd | Leaving the username with an edit saves. Leaving it for the password reveals the password while the save runs; the save landing masks and empties it, the focus still there, losing anything typed into it meanwhile, and a click does not show it again until it loses focus. |
| E11. I can save on blur of the whisper field. | works, odd | Leaving the password with an edit saves; leaving it unchanged saves nothing. A save begun while one runs cites the same revision, so whichever lands second refuses `stale_write`: where the first lands first, an edit made between the two is lost from the box and the form; where the first is held past the second, every edit is stored and the log still ends in the error (item 20). |
| A1. I enter the values. | works | Title (sidecar) and key (whisper), plain uncontrolled inputs: in no React state and no `value` attribute. |
| A2. The whisper field is password-style. | works | `WhisperInput`, with the attributes that keep password managers away. |
| A3. An eye reveals it. | works, odd | Its button shows the key as text and hides it, but reads Show and Hide, not an eye (item 24). It does nothing while a save runs. |
| A4. Once I hit Save it is only displayed as masked. | works | While the save runs the key is masked, though still in the input's `value`. Once stored, React empties the form and the key shows only by `WhisperMask`: its last four characters while unlocked, the sidecar's stored mask while locked. A refusal keeps it in the field, masked. |

One claim, E9, cannot hold today without a host's own diff of the draft (item 21); nothing under `packages/` changed, and
nothing was built past a host's plain use of the hooks and parts. Where the reading of a sentence was a choice: the eye shows the text in the field itself; "click Save whether
the field is masked or not" is a press on Save while the field shows its text, which a mouse press masks as it takes the
focus, and Enter saves unmasked (a Save that cancels its `mousedown`, as the eye does, would save as Enter does); save on
blur hides the Save button, a choice of the dojo's, not the Coach's words, since with both a mouse press on Save after an
edit would start two saves, the blur's and the press's, and end one in `stale_write` (reasoned, not run);
"sidebar" is the sidecar; the envman box is the fixture's `github` (username and password), not a new one, so the
fixture is not remade.

### What the dojo tried, and what the user sees

By scratch tests under jsdom, not kept, unless a claim's test above covers it.

* **Reveal, then edit**: the eye shows it read-only; a double click or the quill makes it editable. As the claims say.
* **Edit, then Save without a blur**: by Enter here; the field is left focused and empty, and the eye then does nothing
  until it loses focus (E7).
* **Blur without changing anything**: masked and emptied; with save on blur, no save.
* **Change only the sidecar, or only the secret**: each saves alone; the other keeps what was stored.
* **Save twice quickly**, the first held: the second lands first (`ok`), the first then refuses `stale_write`. The log's
  newest line is the error; both edits are stored. With the second held instead (by the thread's reviewer, wrapping the
  vaultDB's write), the first lands and the second refuses `stale_write`: a username typed between the two presses is
  in neither the box nor the form.
* **Save on blur while a save is under way**: the same as twice quickly.
* **Save on blur, from the username into the password**, the save held (by the thread's reviewer): the password shows
  while the save runs; once it lands it is masked and emptied under the focus, and a password typed there meanwhile is
  in neither the box nor the field (E10).
* **Type while a save is held**: the typing is gone when the save lands, the username back to what was saved and the
  password emptied.
* **Save while locked**, envman: the `UnlockDialog` opens; once unlocked the save lands and nothing is lost. Cancel logs
  "The unlock was dismissed, …", and everything typed stays, the password masked in its `value`.
* **Save while locked**, API key: `bank_locked`, with its message for a developer (list item 8) and no unlock prompt
  (item 9); everything typed stays, since the form cancels React's reset on a refusal.
* **A refused write**: envman logs the vaultDB's message and keeps every field, the password masked in its `value`; API
  key the same, as the Forms tab's row 1.
* **Lock while revealed**, the field focused: masked and emptied at once, the focus left on it; the eye then does
  nothing until the field loses focus. Clicked away and back, the eye opens the unlock dialog, and once unlocked the
  field shows, given the focus back.
* **Lock while being edited**: masked, the typed password still in its `value`; a Save then waits for the unlock dialog
  and writes it.
* **Reveal, switch tabs, come back**: under jsdom the field stays revealed in the hidden tab and on return, since jsdom
  moves no focus on a click and hides nothing from focus. In a browser the press on a tab button takes the focus, which
  should blur and mask the field before the tab hides. Not seen in one.
