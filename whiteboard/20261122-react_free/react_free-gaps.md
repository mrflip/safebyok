# react_free: library gaps and edge cases, from the look-over

Three cold readers (demos; giver; parts and kit) put the Coach's four questions to the code at `df1b4227d`
(2026-11-22): in the demos, *is this a workaround for a library gap?* and *is this how a top-notch React developer
writes it?*; in the library, *where is this a workaround for a gap below it?* and *where does it sacrifice the common
case for an edge case?* What follows is what they found to **document**, for a later session to fix at the root. The
code stays as it is, worked around, so the root cause shows. What the look-over **changed** (only removals, no new
mechanism) is listed last, with the PR.

Each entry: the gap, the common case it costs, the evidence (a path and a snippet to search on), and the root fix in a
clause. Foundations first.

## The giver and the core under it

* **Two TanStack caches, one mirrored into the other** (for the rewrite). The minder caches in a TanStack client of
  its own, under the same keys the giver hands the host (`boxQueryKeyOf` returns `ThingMinder.itemQueryKeyOf`), and
  its gate item holds wrapped bankKeys under the host's `useGate` key. The core accepts only a client "made by
  `ThingMinder.makeClient`" (`shapes-bankish.ts`, `queryClient?: QueryClient`). So the giver mirrors every minder event
  into the host's cache (`react-bridge.ts`, `queueMicrotask(() => { deliverOrTell(client, minder, event) })`), and
  four more things exist only because there are two caches: `isBehindAt` as the stale time, `newerOrSharedOf` as
  structural sharing, the bare-listing rule and the microtask hop. Every box read pays for the mirror. Root fix: the
  minder caches in the host's client, or the hooks read the minder's store directly. (The stale-time function and the
  cache-level `onSuccess` stay, as ruled; this says why they exist.)
* **`useStrengthVerdict`'s generation counter stands in for a load the new core dropped.** `react-giver.tsx`,
  `const judgeseq = useRef(0)` … `if (ownseq === judgeseq.current)`: a zxcvbn checker imports its dictionary on its
  first judgement, so verdicts can land out of order until it has loaded. safebyok-big loaded both at bring-up
  (`safebyok-big/src/models/device.ts`, `await this.strengthChecker.load()`); the new core builds a guarded `load`
  (`helpers/passphrase-strength.ts`) and nothing calls it. The counter now reaches hosts through
  `useNewPassphrase().verdict`. Root fix: `Device.hello` loads the strength checker and the key deriver; then
  `judgeseq` goes, and a truly asynchronous host checker is a wontfix row. No note records this loosening from big: a
  candidate for `notes/guarantees-drift.md`.
* **The form verbs' default `onSettled: vacateGating` guards one edge and costs five warnings.** `giver-defaults.ts`,
  `FormMutationDefaults`; five doc blocks say "An `onSettled` of your own replaces the one that vacates the gating:
  vacate it there too." `Gating.attempt` already vacates in a `finally`, so the default matters only when
  `mutationFn` never runs (a host's `onMutate` threw). Root fix: decide whether that edge earns the default; if so,
  say why once in `FormMutationOptions`; if not, delete `onSettled`, `vacateGating` and the five sentences. Touches
  G2 (zeroing the passkey answer): not removed unasked.
* **`BoxNamed`'s object form only spells the labelpath, in the core's spelling.** `BoxNamed = string |
  Readonly<{ labelpath: string }>`: a record's revision is ignored by design, only its `labelpath` (`box/jokes`, where
  the string form is the host's `jokes`) is read, and nothing in the demos, kit or parts uses it. Root fix: a plain
  string; deletes `boxLabelpathOfNamed`'s object branch and `Checks.boxScoped`. Left for the workshop: it is a
  contract change in its code.
* **The Provider and the giver are shaped for cases a page cannot reach** (for the rewrite). (a) The Provider's
  `vaultDB` and `keyDeriver` props serve only tests. (b) `shownOf`, `StartingShown` and `useShown` hide one user's
  device from another userid, so the hooks key by the user the Provider shows while the calls and `*MutationOptions`
  key by whoever is signed in; the device lives for the page, and a Provider handed another userid shows `starting`
  for good. (c) `ensureDevice` makes the device and starts the bridge during render, guarded by a module-level
  `device !== null`. (d) One bank (`isOneBank`) configured as a map, reached by name (`SOK.bank('knock')`) and keyed
  by banklabel (`useQueryOptions().knock.box(...)`). Root fix: a giver per test, one notion of the signed-in user, the
  device started outside render, a one-bank config and handle.
* **`useDraft` keeps a typed secret across a lock, and its own example teaches the workaround.** `use-draft.ts`'s
  lock effect empties only untyped fields; `useStageChange`'s `@example` is `if (stage === 'locked') {
  draft.discard() }`, and envman's `EnvRow.tsx` does exactly that ("The library leaves an open draft alone on a lock:
  this demo empties it"), which also throws away the row's settings edits. This is code concerned with clearing a
  form, in a host. Root fix: decide the default; if a lock leaves no typed secret in the page, `useDraft` forgets
  typed whisper fields on lock as `forgetTyped` does on a reset, keeping sidecar edits, and the demo block and the
  example go.
* **`useDraft().whisperField`'s placeholder bypasses the words provider.** `use-draft.ts`, `PartsPhrases.masked`:
  a host's override of `masked` never reaches a draft's field, and the giver imports from the parts layer above it.
  Root fix: `usePartsPhrases().masked`, or leave the placeholder to the host (deletes a line and the import). A
  one-token fix for the next thread in `use-draft.ts` (thread 12).
* **`putBoxAction` fixes the box's name when it is made**, so an add-a-new-item form makes the action per submit,
  against its own doc (envman `AddEnvForm.tsx`, "the put action is made per submit, not once"). The common case of a
  list that grows by one per submit is not served. Root fix: the host's action validates and calls `putBoxOnce`
  (adds nothing to the library), or `putBoxAction` takes the name per call.
* **`Whisper` is `Record<string, any>`**, so every callback casts (`String(whisper['apiKey'])` in `KeyPanel.tsx`,
  `AddEnvForm.tsx`, `EnvRow.tsx`, `KnockForm.tsx`), forced by `no-unsafe-argument`. Root fix: `PutBoxActionOpts`,
  `DraftPutOpts` and `withWhisper` generic over the whisper's shape. Low consequence.
* **Passkey ceremony messages are not overridable** (Coach row, proceed): they reach a user only through
  `refusalTextOf`'s held default arm. They get words in the session that settles that arm; this line belongs in
  `refusal_text-handoff.md` beside the workshop's plan, which lives in the workshop's worktree.

## Ruling wanted: `putBoxAction`'s `texts`

`putBoxAction`'s refusal carries `texts: textsOfForm(form)`, the form's typed fields back. `notes/react_lib_principles.md`
refuses exactly that ("`putBoxAction` handing a refused form its fields back"). The two readers split:

* **Keep it** (giver reader): React 19 resets an Action form's uncontrolled fields when the action ends, refused or
  not; returning the submitted values through `useActionState` as `defaultValue` is React's own guidance and what
  Conform's `submission.reply()` and TanStack Form's `mergeForm` do. Without it every host writes the same wrapper:
  form-clearing code. Strike the note's clause.
* **Drop it** (demos reader): a professional validates its own fields in its own action first, with the same schema on
  the client (zod), so a validation refusal never reaches the library or the reset. Only a rare library refusal
  (storage, lock, stale) then loses typed text, which is the note's own wontfix shape ("loses typed text and corrupts
  nothing"). `texts` and the demo's echo helpers go.

Either way envman should validate the way a professional does (below).

## The parts and kit

* **`useNewPassphrase` leaves form clearing to the host, though `useDraft` handles it itself.** `use-new-passphrase.ts`,
  `// React empties the fields after each submit without an onChange, so the verdicts are reset by hand.` and
  `forget`; each kit form wires `onReset={newPassphrase.forget}`, and the headless guide's example leaves it out, so a
  host copying it shows "Strong enough", "The passphrases match" and `isReady: true` over two empty fields after a
  refused submit. `useDraft` listens for its form's `reset` itself (ruled). Root fix: the hook listens for its form's
  `reset` as `useDraft` does; `forget` and the `onReset` wiring go.
* **`useNewPassphrase().field` and `usePassphraseField` do not compose as the guide shows** (Closer Look 1.1).
  `docs/guide-headless.md`'s `PassphraseField` takes only `{ name, label }` and hard-codes `current-password`, so
  spreading `{...newPassphrase.field}` onto it silently drops `id`, `ref`, `onChange`, `aria-describedby` and
  `required`; the verdict never arrives, with no type error (TypeScript does not check a JSX spread's extra props). The
  two prop sets do join when the host spreads both onto one input (`<Input {...np.field} {...field.inputProps} />`,
  with `usePassphraseField({ id: np.field.id, autoComplete: 'new-password' })`). The guide also calls
  `useNewPassphrase()` without the giver it requires, the one parts-level hook without the `useGivenGiver` fallback
  (`docs/guide-suspense.md` already lists it as owed). Root fix: the guide's example forwards `id`, `autoComplete` and
  the rest; the giver argument becomes optional; or, for field props that are plain attributes, the hook reads its two
  inputs by name from a form-level `onChange`/`onReset` (deletes the refs, ids, handlers and `forget`; a different
  mechanism, so a design call).
* **The guide's unlock dialog is a form Action, which the kit's `UnlockForm` says it must not be.**
  `guide-headless.md`, `useActionState(actionOf(vault.unlock), null)` and `<form action={unlockAction}`, against
  `unlock-form.tsx`'s "the form submits from a handler, never a form action" (an unlock awaited by a host's pending
  Action cannot show its refusal until that Action ends). Root fix: the guide's dialog written as `UnlockForm` is, or
  rendering `UnlockForm` inside the host's `Dialog`.
* **`useWhisperText`'s `isCurrentRef` serves only an unkeyed direct caller re-pointed mid-Show, and half-closes it.**
  `use-whisper-text.ts`, `const isCurrentRef = useRef<() => boolean>(() => true)` parked by a layout effect for a click
  handler (the "latest ref" pattern, not React's effect-cleanup stale flag). Inside `WhisperText`, whose `key` is
  `JSON.stringify([props.labelpath, props.field])`, it never fires; for a direct caller the button still reads Hide
  (the wontfix row). It does keep the old field's secret from landing under the new label, so it stays until the root
  fix: `useReveal` records the labelpath and field each Show asked for and drops a landing that no longer matches.
  (The reset during render, `priorBoxField`, is React's documented idiom and serves a real direct caller: fine.)
* **`useWhisperMask`'s `maskShownRef` serves one blank.** `use-whisper-mask.ts`, `const maskShownRef =
  useRef<string | null>(null)` and `isSameMask`: it blanks the element when pointed at another box, field or tail,
  but keeps the old mask while the same box's mask is fetched again. With the mask's `ifLocked` synchronous (changed
  below), the only remaining promise is an unlocked unseal of milliseconds. Root fix: keep whatever the element shows
  until the next mask lands (deletes the ref and a branch; a re-pointed component shows the previous tail for one
  unseal), or a layout effect keyed on `[maskEl, labelpath, field, tail]` whose cleanup empties it. Left as is: the
  #834 review added the blank on purpose.
* **Two word providers, the kit writing into the parts' context** (Closer Look 1.5). `phrases-kit.tsx`,
  `...PartsPhrases,` in `KitPhrases` (no kit code reads those four words) and `<KitPhrasesContext value={merged}>
  <PartsPhrasesContext value={merged}>`; `PartsPhrasesContext` is exported for that alone. It exists so a kit host needs
  one provider. Root fix, a choice: each provider gives only its own words (a kit host translating Show / Hide nests
  `PartsPhrasesProvider` too; deletes the copy, the cross-layer write and the export), or one words table and context
  in a module both layers import.
* **Where `className` lands, and what a host cannot reach** (Closer Look 1.6). The rule is consistent ("className goes
  where the other attributes go": the `<input>`, `WhisperText`'s wrapper, `WhisperMask`'s `<code>`), but the inputs'
  wrapper class is fixed while `WhisperText`'s and `WhisperMask`'s defaults are replaced, the Show / Hide buttons take
  nothing, and the Caps Lock status is a classless sibling outside the wrapper (`passphrase-input.tsx`,
  `<span role="status">`), reachable only as `.passphrase-input + [role=status]`. Root fix: decide whether parts offer
  more than `className` (the field hooks exist for hosts who want control); at least move the status inside the
  wrapper, and say in each part's doc which elements exist for a stylesheet.

## The demos

* **envman validates its own fields by hand, inside the library's `sidecarOf`** (Coach row, explain). `lib/env-form.ts`,
  `envFieldsOf`: three `throw new Error`s, a hand-written `Number()` parse, the first failure only, no errors per field,
  no `aria-invalid`; and the add form runs it inside `sidecarOf` (`AddEnvForm.tsx`), so the library is called and the
  secret popped before the demo's own title check throws back out through it. The markup already has `required`,
  `type=number min=1 step=1` and `type=date`, so the browser blocks every refusal but a title of spaces. A
  professional: the same zod schema on the client and in the action (`title: z.string().trim().min(1, 'Give it a
  title.')`, `rotation_days: z.coerce.number().int().min(1)`), the action validating before it calls the library, and
  what is shown back being what was typed, untrimmed (trimming belongs to parsing for storage). Conform is the
  Action-native library for this. Root fix: zod in envman's own actions, run before the library, and `pattern` on the
  title; reshapes both forms, so it waits on the `texts` ruling above.
* **Every kit form needs `username`, so both demos prop-drill it** (for the rewrite). Knock-Knock threads it from App
  through six components into six kit forms, envman into three, each for one hidden password-manager field
  (`unlock-form.tsx`, `UsernameField`). `WaysIn.tsx` also passes it twice to `AddPasskeyForm` (`user: { name: username
  ?? 'knock', displayName: username ?? 'knock' }`). Root fix: the Provider takes `username` and the kit reads it from
  context; the kit fills `passkeyOpts.user` from it.
* **Knock-Knock loses a refused username; envman keeps it.** `SessionBar.tsx`, `<form action={(form) => {
  signingIn.mutate(...) }}>`: the mutation twin's ruled form shape resets every field on submit, whatever the result.
  Harmless for one field; the same gap as envman's validation for a richer form.
* **The demos' localStorage vaultDB is a copy in each demo, reaching through a test door** (`// Cheat (react_life)`,
  `_cheat_things`). Root fix: idb_lean's browser vaultDB replaces both copies. Its half-made write is now a wontfix row
  with a demonstration (below).
* **envman's `ApplyResult` is declared inside `EnvSettingsDialog`'s body** (left as it is). The look-over meant to move
  it to module scope beside the other types; `unicorn/prefer-smaller-scope` refuses that for a type one component uses,
  and an earlier thread put it inside for that reason. Root fix, if any: the lint rule's exemption for types, a Coach
  call.
* Found fine: the duplicated fake sessions and `formTextOf` (app code; a demo is a self-contained starter), the
  stage switches, `useIsKeyStored`'s `select`, Knock-Knock's `SessionBar` mutation over a synchronous `signIn`
  (`Promise.resolve()` keeps `require-await` quiet, and TanStack turns a throw into the mutation's `error`).

## Changed by the look-over

Only removals and corrections, each curing code that exists because of how it was built; PR on top of #832.

* envman: the three `sanitizeForeignError` calls on the demo's own throws removed (Coach row: "only an error being
  placed on a typed foreign field ... or coming from a possibly-insane source").
* envman: the settings dialog echoes what was typed raw, as the add form does, and drops the echo nothing reads on
  success; the test asserts `' '`.
* envman: `addEnvAction` and `signInAction` back to `function` declarations.
* Knock-Knock: the test-only `fetchFn` parameter on `tellKnockKnockJoke` removed; its test stubs the global.
* The giver's `withLockableWhisper` lost its locked branch's last caller this sprint (the mask reads the stored
  record itself): it becomes `withUnlockedWhisper`, a pass-through to the vault; the mask's `ifLocked` is synchronous,
  and its async-locked blank and test go.
* The put factories' "make it under `useMemo`, so its checks run once" advice removed, with Knock-Knock's `useMemo`,
  the giver test's and the form-status-twin demonstration's.
* `useNewPassphrase`'s fields drop their `aria-label` and `placeholder`, and the kit forms their placeholders: each
  field showed its word twice (label above, placeholder inside) since the visible labels came (Coach row, explain).
* The whisper-mask test that sampled once for "never blank between" removed.
* The field hooks' doc blocks say that a hook called in the component that renders the form cannot see its submit:
  pass `isPending`.
* A wontfix row and demonstration: the demos' localStorage vaultDB, refused a save mid-write, keeps the write in memory
  (Coach row: "show that you have to force a fault mid-operation").
