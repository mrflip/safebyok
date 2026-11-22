# Thread 5: knock_query (2026-11-22)

Branch `20261122-knock_query`, PR #822, stacked on #821 (on #820, #818, #817). Proved: `pnpm justify` green at `77d3af2e3` (knockknock 27 tests in 4 files, safebyok-react-lean 271 in 17, safebyok 1399, safebyok-big 2946, safebyok-react 277, e2e 576, demo-react 99, envman 24, scripts 331, the adapters all passing).

Knock-Knock is the plain-hooks-over-React-Query demo: everything the user does is a `useMutation`. Only `demos/safebyok-demo-knockknock` changes.

* **Built**:
  * **Putting the key** (`src/components/KeyPanel.tsx`, `KeyEditor`). A `useMutation` whose variable is the form's FormData, from `<form action={(form) => { putKey.mutate(form) }}>`. Its `mutationFn` calls `popField(form, 'apiKey')` before its first await, refuses a blank key, then `Knock.putBoxOnce` with the sidecar `mask(apiKey, { tail: 0 })`. `networkMode: 'always'`. Pending and the error come from the mutation, and the button is a plain `<button type="submit" disabled={putKey.isPending}>`. `DeleteKeyButton` is unchanged.
  * **`src/hooks/useIsKeyStored.ts`**: `Knock.useBox(KeyLabelpath, { select: (thing) => liveOf(thing) !== null }).data`, which is `undefined` while looking, then `false` or `true`. `KeyPanel` keeps its three states. `KnockForm` treats looking as not stored, as before.
  * **`src/components/SessionBar.tsx`**: sign-in is a `useMutation` and its error comes from the mutation. Before, it used a `useState` gripe, a try/catch and an `(err as Error)` cast. Sign-out is untouched.
  * **Test** (`tests/components/App.test.tsx`, "puts the key by a mutation that retains none of it, whether the put lands or is refused"). It loads a page that already has a key and checks that the put's retained FormData has no fields. It then makes `Storage.prototype.setItem` throw a QuotaExceededError once, replaces the key, and waits for the alert. It asserts:
    * both mutations' variables are empty, and the second one's error is the alert's text;
    * `holdsText` over their variables and errors is false for both keys;
    * `expectTextUnheld` (React tree and every query and mutation state), the page's text, and `expectUnheld`.

    With `form.get` swapped in for `popField`, this test fails, and so do six of the file's nine others.
  * README bullets for KeyPanel and the hook. The changeset is empty, with a message.
* **Decisions made**:
  * **`networkMode: 'always'` on the put.** Under TanStack's default `'online'`, a mutation started offline is paused before `mutationFn` runs, so the key would sit in its retained variables. The library's own `FormMutationDefaults` (`giver-defaults.ts`) uses `'always'` for the same reason. The sign-in and delete mutations stay on the default, because they carry no secret and a real host's versions are network calls.
  * **A plain button, not `SubmitButton`.** `SubmitButton` reads `useFormStatus`, whose pending ends when the sync action that calls `mutate` returns. It would never show "Saving…".
  * **The hook is named "stored", not "saved"**, since VOCABULARY.md keeps "save" out of a put's names. It lives in `src/hooks/` beside `useSession`.
  * **A sparse record counts as stored.** A record exists, and the mask shows what it can.
  * **The refused put is a storage refusal** (`setItem` throwing). The new core has no size limit, and a second tab's vaultDB is a separate store in memory, so neither a size refusal nor a stale_write was available.
* **Deviations**:
  * **Change 4: no change to `unlock-form.test.tsx`.** The double-press test already ends with `expect(world.deriver.heard).to.eq(1)`, and `heard` counts derives. With `disabled={isUnlocking}` removed from `unlock-form.tsx` and the disabled assertion swapped for a type check, it fails "expected 2 to equal 1". With the original assertion, it fails at the disabled check first. Both edits were reverted. The premise that nothing is counted does not hold.
  * The README changed. The handoff did not name it, but its bullets described `putBoxAction`.
* **Set aside**:
  * Sign-in as `async (u) => { signIn(u) }`: lint (`require-await`).
  * `Promise.resolve(u).then(signIn)`: lint (`prefer-await`). It became `{ signIn(username); return Promise.resolve() }` with a comment.
  * A `mutationKey` on the put, to find it in the test: it would exist only for the test, so the test filters the mutation cache by `variables instanceof FormData` instead.
* **Discoveries** (library findings, for the Coach):
  * **`vi.resetModules()` per test: confirmed.** The giver is a module-level singleton, so `loadPage` re-imports the modules. A spy on a storage class must re-import `safebyok/storage` after the reset.
  * **`useBox` pending for one render: confirmed.** After a reload, the minder had fetched `box/anthropic` before the stage reached locked. The page still went "Looking for your key", then blank, then the mask.
  * **`WhisperMask` renders blank for a moment while locked** (new). It computes the mask asynchronously.
  * **Twin of `putBoxAction`:** a `putBoxMutation(labelpath, { whisperOf, sidecarOf })` returning options for `useMutation` would make the app plainer. The host would no longer need to remember the pop before the await or `networkMode: 'always'`.
  * **`SubmitButton` is Action-shaped.** An `isPending` prop, like `PassphraseInput`'s, would let a mutation form use it.
  * **Developer text reaches the user.** A storage refusal's message ends "The storage adapter's own error is this error's cause.", and the app shows `err.message`. `refusalTextOf` (`src/kit/phrases-kit.ts`) is not exported from the kit.
  * **`useBox`'s `select` gets the raw thing** (a record, a tombstone or the shell), so every select starts from `liveOf`. Minor.
  * **`docs/guide-react_query.md` sketches `takeField`.** The library has `popField`.
  * **The demo's `package.json` lists `use-effect-event`, which nothing uses.** Left in place, since dependencies are out of scope.
* **Not verified**: a real browser. The offline pause rests on TanStack's documented behaviour and the library's comment, not on a test. The new test checks what the mutations retain at the end, not each intermediate render.
* **For the Coach**: the open questions in PR #822: `putBoxMutation`, `SubmitButton`'s `isPending`, exporting `refusalTextOf`, and change 4's premise.
