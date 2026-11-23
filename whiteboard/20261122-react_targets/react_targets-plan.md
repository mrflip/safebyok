# react_targets: the workshop's plan

A workshop (`/workshop`) between the Coach and one session, begun 2026-11-21. Its goal: `safebyok` and
`safebyok-react-lean` make a security expert nod and a React developer sigh with joy.

## How to read this

A log, oldest first: a later section replaces an earlier one where they differ, and the last three sections say where
things stand. A ruling answers the question that was in front of us, in the case it was asked about; where we have its
reason, the reason is beside it. Words in quotes are the Coach's. Where a case in hand does not fit a ruling's reason,
say so and propose what does: applying it to the letter is not the aim.

## How the Coach wants it run

* This thread's PR is the line: each worker's PR stacks on it, and it closes last, as one squashed commit of them all.
* The session edits in this worktree (`/workspace/byok-react_targets`); the `base-sync` agent carries the Coach's
  fingerpainting in the base checkout into it, and the line back to the base. Workers use worktrees of their own.
* Agents liberally, to keep the session's context roomy, and every spawn names its model.
* Out of bounds as subjects of design or repair: the endings (lock, sweep, vacate, delete, sign-out), autolock, the
  adapters, the deviceDB, and the demos' looks for their own sake. A thread whose work passes through an ending's code
  changes what it needs there (#827 did, in `goodbye`) and leaves how the ending behaves alone. A demo may change, or
  gain a feature, to show a library offering.

## The steps

1. **Set the target.** Four guides in `docs/`, one for each audience of `docs/react-overview.md`: pencil sketches, no
   longer than the dream interface (132 lines), each over the same three apps (one API key, Doppler-lite, a
   device-only password manager). Done: `guide-react_query.md`, `guide-suspense.md`, `guide-nextjs.md`,
   `guide-headless.md`.
2. **Clear the low-hanging fruit** in `safebyok-react-lean` that needs no change of architecture (below).
3. **Make the apps exemplary**, and say where the library prevents it. The same, for the four guides. The Coach is
   reading this step.

Meanwhile the Coach triages the large matters: the two TanStack caches and the bridge between them, whether the giver
exists, and who owns what at startup.

## Rulings

* **The sketch stands** (the Coach, 2026-11-22: "Sketch sounds great"), as a pencil target:
  * No giver. `<SafebyokProvider userid vaultDB keyDeriver>` owns the device; hooks are imported by name; `useVault()` is
    the one handle for the calls and the query factories.
  * One bank, labelled `'main'`: no call names a bank, and a second bank would wrap a subtree.
  * Gate verbs take the form: `vault.unlock(form)` reads `passphrase` and deletes it before it first awaits. A host
    has no need to see a gating.
* **The invariant to hold**: cleartexts and semi-cleartexts are seen only within private methods of gating, proving and
  lease. The threat it answers is an agent filing bug reports, not an attacker in the page: a small horizon lets a
  reviewer finish. Where a React interface needs it loosened, bring the case to the Coach.
* **Supported targets**: React 19.0, ES2022, Next.js 16 LTS, Node 22 to 26.
* **`useEffectEvent` comes from a ponyfill dependency, a peer** (the Coach, 2026-11-22), not hand-rolled.

## Step 2: the fruit

One thread, `react_fruit`, stacked on this line:

1. `WhisperText`'s Hide leaves the whisper in the page when `masked` is an element: both branches are a `span` in one
   slot, so React never unmounts it. A `key` on each, and a test with an element `masked`.
2. The React 19.0 floor: `useEffectEvent` from `use-effect-event` in `useStageChange` and `WhisperMask`; the peer
   range of `react` and `react-dom` to `^19.0.0`.
3. `'use client'` on the three entries.
4. `takeText` exported from the kit as `takeField`.
5. `PutBoxActionResult.err` typed `Error`.

Held, because the target deletes or reshapes them: the gatings' `onSettled` doc lines, `boxQuery`'s advice to use it
outside the provider, explicit types for the giver, hooks passed as props, and `initialData` for a box's query.

## Open

* The third app, the device-only password manager, has no demo. Built now, it would stand on the demos'
  `localStorage` vaultDB, since no browser vaultDB is ported.
* Still to come from the Coach: the two caches and the bridge.

## State, 2026-11-22 (a handoff)

The line and what stands on it, each a draft:

* [#817](https://github.com/mrflip/safebyok/pull/817) `react_targets`: the overview, the four guides, this plan. The base checkout was synced onto it once.
* [#818](https://github.com/mrflip/safebyok/pull/818) `react_fruit`, on #817: the five fruit, reviewed, CI green at `717784b37`; then `popField` (tip `ae8f36bae`).
* [#819](https://github.com/mrflip/safebyok/pull/819) `envman_actions`, on #818: envman's forms as Actions. Reviewed, **not ready**: see the unlock finding below.
* `bulletproof`, on #818, worktree `/workspace/byok-bulletproof`: being built by an `opus` worker.

## Rulings since the first round

* **Step 3**: each demo is the worked example of one guide (Knock-Knock: plain hooks and `useMutation`; envman: Actions). The password manager comes later, as a pretext for Suspense, nested boxes and pre-baked components.
* **`popField`** is the name of the helper that returns a form field's text and deletes the field (`take` is a word VOCABULARY.md avoids).
* **A host's function is wrapped once, by `bulletproofHandlerOf(handler, { ifError: 'fail' | 'tell', transformer, onBadNews })`**, all checks up front. `whisperOf` and `sidecarOf` get only the type-wrong case handled, and rethrow. Its options are not an option on `putBoxAction` (round three, below, says what that meant). A default redacting transformer comes later.
* **No check that the bundler wrote `'use client'`**: it would test tsdown, not our code. `instanceof FormData` stays.
* **The vocabulary of the docs is fixed after the fact, lightly**; the Coach is weighing that against making every agent read the naming rules.
* **Agents' proposals that bend a sound implementation to a thorny edge at unreasonable cost are refused** (the Coach, of `draft.saveAction` and of `putBoxAction` returning a refused form's fields).

## Findings from building envman

* **An Action that waits for the unlock freezes the kit's unlock dialog after a wrong passphrase.** The kit's `UnlockForm` is a form Action; React batches transitions, so its pending state cannot settle while the waiting Action is pending. A `useMutation` caller is unaffected. Proven in jsdom by the reviewer's probe (`scratchpad/envman_actions/probe-wrong-passphrase.diff`). Open: fix the kit (the unlock form submits outside a transition), or keep such callers off Actions.
* **`useDraft`'s input inside a `<form action>`**: React's reset empties it while the draft still counts it typed, and the next Save writes an empty value. Envman's Save is a button, so it does not arise there.
* The Suspense and headless guides sketch unlocking as `useActionState(actionOf(vault.unlock))`, which the first finding makes wrong.

## Open with the Coach

* The unlock finding's fix, and so #819's fate.
* The caches: whether React observes the minder's own cache (`useQuery(options, minderClient)`), with no bridge and no copy in the host's cache; a spike was offered. Paused by the Coach.
* Whether `SessionBar` keeps the Action idiom it joined unasked; `draft.lastErr` typed `Error`.
* Knock-Knock's step 3 thread is not started.
* The guides still say `takeField`, and three *Not built yet* lines are now untrue (`popField` exported, `err` typed, `'use client'`).

## State, later on 2026-11-22 (a handoff; it replaces the list of PRs above)

The stack, each a draft against `main`: [#817](https://github.com/mrflip/safebyok/pull/817) `react_targets` (this line) ← [#818](https://github.com/mrflip/safebyok/pull/818) `react_fruit` (tip `ae8f36bae`, with `popField`) ← [#820](https://github.com/mrflip/safebyok/pull/820) `bulletproof` (tip `6b047da8b`, reviewed) ← [#821](https://github.com/mrflip/safebyok/pull/821) `unlock_urgent` (tip `1c089d40f`, reviewed clean). [#819](https://github.com/mrflip/safebyok/pull/819) `envman_actions` stands on #818 and awaits a rework onto #821. No agent is running.

## Rulings, third round (the Coach, 2026-11-22)

* **The axiom.** Nothing in the three demos is exotic enough to cost a feature of React: every feature is available to a host using the hooks, parts and kit correctly. Where one is not, suspect first what we do that is not vanilla.
* **Userland forms, and the kit's as far as reasonable, are Action forms** (`<form action>`, `useActionState`, `SubmitButton`). Round four narrows this to the demo whose modality is Actions.
* **The unlock dialog is the exception**: of { operates like the other forms, Action-like, simple, low potential for interaction, well-behaved, easy to reason about, secure } it drops only "Action-like". It opens beneath a caller that may be a pending Action, and React batches transitions, so it runs on urgent state (#821).
* **`bulletproofHandlerOf`** stays exported from the core's front door ("it's handy"); "not offered to the customer" meant no option on `putBoxAction`. Its `onBadNews` is for our own code to hand in its own handler. The held sites stay held.
* **Refused**: `draft.saveAction`; `putBoxAction` returning a refused form's fields. `useDraft` instead discards when its form resets (#821).

## Proposed, not yet ruled

* Knock-Knock's joke form becomes an Action form; envman's settings dialog and sign-in bar stay Action forms; "one guide per demo" softens to "each demo leads with one guide and uses the nicest tool for each case".
* #821's deviation: a programming error in the two unlock forms is now an unhandled rejection, where the form action sent it to an error boundary.
* `PassphraseInput`'s new optional `isPending` prop (the reviewer: the plainest sound way).
* `WhisperMask` and `WhisperText` drop a refusal silently when the host passes no `onError`.

## The error-sink survey (read-only, at `1c089d40f`)

* No throw from a host callback that was handed cleartext reaches a log, the console, the platform or `onBadNews` through library code: a deriver's and a checker's are replaced by a refusal with no cause; `withWhisper`'s and the `sidecarOf`s' go back to the host's caller; `putBoxAction`'s comes back in its result. The one odd path: a host that calls `withWhisper` inside its own subscriber and lets the throw escape.
* `onBadNews` is fed by eight sites: a device, bank or gate subscriber threw; a minder listener threw; the bridge's delivery threw; watch trouble; `sweep`'s watch-stop threw; rows stored damaged. None reports a failure its caller is also thrown.
* The default handler writes the refusal's message and kind only. Reported to the platform instead, the object's `cause` could be the host's own adapter or HTTP error, whole.
* Open with the Coach: whether listener throws should go to the platform as thrown, leaving `onBadNews` for the library's own background failures; and a by-value check in `withWhisper` that warns, by path, when a thrown error carries the whisper's text.

## Next, once ruled

The #819 rework onto #821 (a row's Save as a form Action, the README's note removed); Knock-Knock's thread; a docs pass on the guides (`popField`, three lines now built, the unlock form is not an Action, the vocabulary); the caches (paused).

## Rulings, fourth round (the Coach, 2026-11-22)

* **Each demo is a pure-form exercise in one modality, passing the niece test.** Not twelve demos, and none written against the grain of its modality to prove a point. **The parts play nicely with each modality, offering more than one of a thing if needed. The kit is done once and best.** Knock-Knock: plain hooks over React Query (its submits are `useMutation`s). Envman: Actions (its forms are form Actions, the unlock dialog aside, for round three's reason). The password manager: later.
* **#821 stands**: the `isPending` prop on `PassphraseInput`, the draft's reset listener, and the unlock forms' programming errors as unhandled rejections ("if the best thing to do for the customer is throw it, do that"). A cancelled reset that still discards a draft has its row in `notes/wontfix.md`.
* **Error routing is for a future session.** The Coach is comfortable imposing a default transformer that redacts anything secret-looking, the secret in hand included, which a host must replace to have something weaker; it is not built. The library also endeavours not to disclose a wrapped passphrase (offline guessing) or a sidecar's contents itself ("We endeavor to"). He notes how much code routes errors. The survey above is that session's starting point; so are the parts' silent drop of a refusal with no `onError`, and whether listener throws go to the platform.

## Running

* `envman_actions` rework (PR #819), an `opus` worker in `/workspace/byok-envman_actions`: rebased onto #821, a row's Save as a form Action.
* `knock_query`, an `opus` worker in `/workspace/byok-knock_query`, on #821: the key's save as a mutation, one hook for "is a key saved", and the unlock test that counts derives.
* #821's tip is `4c7c7d608` (the wontfix row).

## State after the two demo threads (2026-11-22)

The stack: #817 ← #818 (`ae8f36bae`) ← #820 (`6b047da8b`) ← #821 `unlock_urgent` (`4c7c7d608`) ← two siblings: [#819](https://github.com/mrflip/safebyok/pull/819) `envman_actions` reworked (`e8eebe1b8`), and [#822](https://github.com/mrflip/safebyok/pull/822) `knock_query` (`8cbf02c4a`). Both demo PRs are built and **not yet reviewed**: their reviews wait on the rulings below, since each demo would change again. No agent is running.

Proposed to the Coach, not yet ruled: one library thread on `safebyok-react-lean`, "multiples for each modality":

* `putBoxMutation(labelpath, { whisperOf, sidecarOf })`: options for `useMutation`, the twin of `putBoxAction`. A put by mutation has two traps the host must otherwise remember: `popField` before the first await, and `networkMode: 'always'` (under TanStack's default a mutation started offline pauses before its `mutationFn` runs, and its variables retain the form with the key in it).
* `SubmitButton` takes `isPending`, as `PassphraseInput` does: it reads `useFormStatus`, so a mutation's form cannot use it today.
* The kit's `refusalTextOf` exported: a storage refusal's message ends with a sentence written for a developer, and a demo's alert shows it.
* A draft forgets only its typed fields when its form resets, and no longer its sidecar edits (a refused Save in envman loses a title changed in the gear's dialog). Envman's Undo then calls `draft.discard` again.
* `draft.lastErr` and a rejected `draft.put` typed `Error`.

Then: each demo takes up what applies, one review of each, a pass in a real browser (nobody has run either demo outside jsdom), and the docs pass on the guides.

Corrections: the #821 reviewer's note that the double-press test counts nothing was wrong; it ends with `expect(world.deriver.heard).to.eq(1)`. The demos list `use-effect-event` to meet the React layer's peer, not because they call it.

Also met: `WhisperMask` is blank for a moment while locked, since it writes its mask asynchronously; a `useBox` shows pending for one render with the record in hand (the caches question).

## State after the library threads (2026-11-22, a handoff; it replaces the lists of PRs above)

The stack, each a draft against `main`: #817 (this line) ← #818 `react_fruit` (`ae8f36bae`) ← #820 `bulletproof` (`6b047da8b`) ← #821 `unlock_urgent` (`9f0b0f591`), all four reviewed. On #821, as siblings:

* [#819](https://github.com/mrflip/safebyok/pull/819) `envman_actions` (`e8eebe1b8`) and [#822](https://github.com/mrflip/safebyok/pull/822) `knock_query` (`8cbf02c4a`): built, **not reviewed**. Each changes again when it takes up the library threads below (burndown, *Free*, item 2), so its review follows that.
* [#824](https://github.com/mrflip/safebyok/pull/824) `draft_truth` (`1760d08aa`) ← [#825](https://github.com/mrflip/safebyok/pull/825) `error_wraps` (`62dce158c`): built, `pnpm justify` green at the tip, under review. Worktree `/workspace/byok-draft_truth`; its local branch `draft_truth-presplit` is a backup of the combined head, to delete once both are reviewed.
* [#823](https://github.com/mrflip/safebyok/pull/823) `multiples` (`7b3571b39`): built, `pnpm justify` green, under review. Worktree `/workspace/byok-multiples`.

Rulings since the fourth round (the Coach, 2026-11-22):

* **The error wraps go in a thin PR of their own, with a count of call sites** (#825: five calls added, each at an existing catch).
* **A host names the secret fields** (`secretFieldnames`): "Let's start there. If it grows past this I should investigate in a session of its own, to make sure we're solving the customer's problem (they may not want the field cleared permanently)."
* **`putBoxMutation`, `SubmitButton`'s `isPending`, exporting `refusalTextOf`**: "yes and built here".

What `putBoxAction` promises now, on #823: its result has a third member on both shapes, `texts`, the first string of each field left in the form after a refusal (`{}` after a landed write, when no names were told, and for a form that is no `FormData`). A host that reads only `box` and `err` sees no change.

Open, the worker's, for the Coach: `refusalTextOf`'s default arm shows a `condition` refusal's own message where the kit has no phrase for it; nobody has checked that each such message is fit for a user. The review is asked to list them.

Next: the reviews' findings; then the burndown's *Free* list from item 2, which I recommend as a `/sprint` in another session, so that this one keeps the core questions.

## The library threads' reviews (2026-11-22)

* **#824 and #825: reviewed.** #824's code is right; the reviewer added one test (on #825's branch, now `1f59bc567`) showing a reset keeps the draft's base while a sidecar edit is pending. #825 is clean. Wontfix candidate, left alone: a reset of one form forgets fields typed into the same draft's inputs outside that form.
* **#823: reviewed, two doc fixes kept (now `4acc0477b`), two matters open with the Coach:**
  * **A render can read the secret through the twin.** With `<form action={(form) => { put.mutate(form) }}>`, React's form status has the `FormData` for one render before `mutationFn` deletes the field: TanStack awaits `onMutate` before it calls `mutationFn`, set or not. The reviewer's probe: a child reading `useFormStatus().data?.get('apiKey')` saw the key once under the twin, and never under `putBoxAction`. TanStack itself retains nothing. Proposed, not ruled: the twin's documented form submits from `onSubmit` with `preventDefault` and `new FormData(event.currentTarget)`, as the unlock form does; React then has no `FormData` in its form status, and a refused form keeps its fields.
  * **`refusalTextOf`'s default arm shows a developer's text to a user**: bare kinds from storage refusals (`stale_write`, `camped`, `absent_box`, `vault_full`), and messages naming calls (`bank.ensureUnlocked`, `bank.ensureVault`) or instructing the host. Proposed, not ruled: the default arm answers the trouble phrase; phrases for the conditions a user can act on come later.
* Not relayed as findings: doc-block wording, test titles of more than one clause, one local's name. For a documentarian pass at close-out.
* The reviewer of #824 and #825 was refused a local fast-forward of `/workspace/byok-draft_truth` by the harness; its local `20261122-error_wraps` is one commit behind origin.

## The caches: the Coach's takeaway (2026-11-22)

The question was whether the minder could run on the customer's `QueryClient`, with its defaults set on our subtree alone. My reading of TanStack 5.107.1 and the minder: it could, at the cost of the gate's wrapped bankKey sitting in the customer's cache, and of moving two things the minder does on its own client. The Coach:

* "We don't have to keep everything in theirs. They care about boxes and listing. Having a tiny little cache to syndicate vaultdb<>indexeddb<>instances/memory is reasonable and frankly might solve a lot of our problems."
* The takeaway, in his words: "1. we can offer customers the right to use *our* TSQ. 2. we could probably use theirs but hell if I'm going to reinvestigate the two things that are in there to solve an ordering issue. 3. if our hooks can work properly against a full/dead/soon TSQ, we should decommission the bridge. 4. if 3 holds I'm comfortable moving to the next issue?"
* **Left as they are for now**, each because it settled an ordering problem he does not want to dive back into in this workshop: the React layer's stale-time function ("it solved some weird race... leave for now"), and the minder's cache-level `onSuccess` ("this was also a race"). A thread that finds one of them in its way says so; it neither works around it nor reopens it unasked.
* On a customer who misuses a shared cache: "we can offer a 'doctor' skill that looks at the codebase to find these", and "as long as their errors are catastrophic or obvious, we don't have to defend against them."
* On tombstones in a `dead` entry: structural sharing "would see null rather than undefined, and be able to get (sync) the `dead` entry at that scope". My answer: yes, that is enough, since the record on the other side names its own scope; the function becomes a closure over the minder's client, and the `dead` entry must land before the item shows null. Not built, and not part of the spike.
* `vault.putBoxMutationOptions`: good "if it parallels the function name in minder" (it does: `#tsqQueryOptions`, and the React layer's `unlockMutationOptions`).

**Running:** thread 8, `one_cache_spike`, an `opus` worker in `/workspace/byok-one_cache_spike` on #821's tip, throwaway, no PR: the hooks observe the minder's own client (`useQuery(options, minderClient)`), the bridge and the copy deleted, the cache's shape as it is today (tombstones in the item). It reports whether item 3 holds.

## Rulings, fifth round (the Coach, 2026-11-22)

* **A draft split across forms**: "add wontfix". The row is on #825's branch (`e8c1683f4`).
* **`refusalTextOf`'s default**: "would you write this in a file for a separate session? Make no changes on it now." The file is `refusal_text-handoff.md`, beside this plan.
* **`.claude/compact-instructions.md`** yields to a `/compact` instruction's choice of topics (on this line).
* **Git and gh** (standing): "you have permission and encouragement to use git and gh to manage your worktrees and prs, including force-push against a known SHA and going in/out of draft, in every respect except adding the label 'queue' or merging a pr."
* **The mutation twin's form stays `<form action={(form) => { save.mutate(form) }}>`** ("go for it"). The Coach on the `onSubmit` alternative: "is the customer typing this in, or is it one time by us? That's an unpleasant experience", and "that's looking pretty intrusive; from my experience, a harbinger of a later report that things aren't working because someone started overriding how events and forms work." I withdrew `onSubmit`: every such form would give up `useFormStatus`, reset itself and pass its button its pending state, and the only reader of the one render is a component the host wrote inside that form.
* **The one render is a wontfix row** ("yes"), on #823's branch (`5805b62ca`).
* **Wontfix demonstrations** (the Coach's idea and rules, 2026-11-22): "demonstrate that it exists, for someone who wants to show that it's a bigger deal than we think -- but also require that the amount of mocking or injection to make it happen be evidence whether it really is true".
  * They live in `tests/wontfix/`, one file a row. STYLE.md's *Tests* says so, on #823 (`3f19f66e6`): "next to the exception for folder'ed tests, tests that have a cross-cutting concern such as wontfix demonstrations".
  * A demonstration may mock or inject, and names what at its head: "I'd like it to stand either way, so that I don't have agents faffing around trying to re-argue it. The rule is 'have you learned something that would let you make this fail without the mock'?"
  * When one fails: "The test should be inverted and moved to the correct location." (My reading: by whoever changed the behaviour, and the row is deleted.)
  * The exemplar: `packages/safebyok-react-lean/tests/wontfix/form-status-twin.test.tsx` on #823, which mocks nothing.
  * **Built, not reviewed:** thread 9, [#826](https://github.com/mrflip/safebyok/pull/826) `wontfix_demos`, on #825: a demonstration for each of the other four React rows, none of which mocks or injects anything; `pnpm justify` green by the worker's report. Two rows were corrected from what the tests showed: the Undo row needs a draft still dirty after the refusal, and a suspending read over our factories needs a cast today (no suspending hook; burndown, *Waits on ownership and startup*).

## The one-cache spike's result (thread 8, 2026-11-22)

Branch `20261122-one_cache_spike` at `f9d2c8f2d`, throwaway, no PR; its thread file is `thread-8-one_cache_spike.md` on that branch. `pnpm justify` green, by the worker's report. The hooks observe the minder's own client through `useQuery(options, minderClient)`; `react-bridge.ts` and the copy are deleted (`safebyok-react-lean/src`: +106, −165 lines); the minder is unchanged but for a door, `minderQueryClientOf(minder)`, exported from a new `safebyok/internals` entry, which hands over the whole client, read and write.

**It holds for a hook mounted once a user is signed in**: the bridge's tests pass as tests of the hooks; all four orderings pass with no timer or microtask; `useBox` answers on its first render a record the minder has; a record told by a list reaches a mounted hook through a listener in the React layer that refetches active queries; one copy of query-core resolves.

**Two gaps, each wanting a change to the minder to close properly** (held; the Coach's):

1. **A hook mounted while nobody is signed in never updates after sign-in.** Each device's minder has a client of its own, and TanStack binds a hook's observer to the client of its first render. Today's hooks survive sign-in because the host's client outlives it. This is the ownership question: who owns the client, and for how long. The worker's options: the Provider remounts its children on sign-in; one client that outlives the device, which the minder is handed; or a rule that record hooks mount only once signed in.
2. **`useBoxList` lists from an effect.** A listing has no queryFn on the minder's client (`skipToken`, and the cache's `onSuccess` would read a listing's answer as a record), so the hook calls `minder.tryList` when the listing is bare or stale. A list's refusal no longer shows as the hook's error.

Also to settle if this is adopted: a host's hook options (`retry`, `staleTime`, `structuralSharing`) now configure the minder's own query while the hook observes it; `bankGiver.queryClient()` and `BoxQueries.client` are new host-facing API, write-capable; the stale-time function's `0` arm looks inert there (left, by ruling); record hooks no longer need a `QueryClientProvider`, the form verbs still do; the guides' `useQuery(vault.box(lp))` needs our client as its second argument.

## The caches: the Coach's direction after the spike (2026-11-22)

His list of what would be nice, in his order and numbering: "1. no bridge, no second home for the data, no timing and invalidation CS402 Final Exam questions. 2. our hooks run against our TSQ. 3. our TSQ data looks like what people want. 4. our TSQ can be queried as if it were a perfectly performant consistent data source. ... 72. we could in principle live in a subtree of a customer's RQ. ... 87. Our TSQ is safe to share and use directly as an unsupported API. No Takers: -- Our TSQ becomes a customer-facing API".

His directives:

1. "Where it's trivial, let's start keeping house like we had a spouse, it can help to win one: pin the options that need pinning; live in our subtree; examine items in structuralSharing, eliminate the need for select, narrow the options the hooks accept; give a listing a real fetch function; etc."
2. "Make no plans to offer to host or offer to adopt."
3. "Use a small standalone TSQ for gate and bank and anything else internal".

His question, on my "have the cache's `onSuccess` skip listings": "should the work being done on every receipt in list, instead be done in onSuccess?" My answer: yes (below, *Answered*). Nothing is built from this section yet.

**Answered.** Once a listing has a fetch function, TanStack itself may fetch it (a mounted hook, an invalidation), and then only the fetch function and the cache's `onSuccess` are sure to run: `tryList` is not. `onSuccess` runs right after the listing lands, which is today's order (the listing first, then each record, so no record's joining changes the listing again). It is handed what the fetch function returned, so the fetch function returns the vaultDB's records, and the listing's combining function (`stableListingOf`, its structural sharing) makes the labelpaths from them.

## The feed principle (the Coach, 2026-11-22)

> the query function / write / mutaion handles only its return value; inject other records at the feed (they land before the record does) and settle consequences in sendToTSQ or onSuccess using the same function

It replaces my answer above (a fetch function that returns the records, reduced by structural sharing). His two applications:

* **A listing**: "isn't this what a select does? we can also perform the `soon` injection when the list hits vaultdb as we do for dbhas". So the listing's fetch function returns only the labelpaths, and `AdapterVaultDB` notifies the listed Things at the feed before the list resumes, as `notifyDbhas` does a refusal's `dbhas`. Agreed, and being built (thread 10).
* **An absent or deleted Thing**: "We could have the api return null on the `val` when `ifAbsent: 'get'`, and make `dbhas` exist on ok true and false". So a get's return value is the live record or null, and a tombstone is a `dbhas` the feed lands in `dead` before the item lands. Proposed by the Coach as a "could"; not ruled, not built. My three questions on it are in chat: inject `dbhas` only where it is another record than the `val`; whether the shell goes; and what a get of a Thing never stored tells apart from a deleted one.

**Built, under review:** thread 10, [#827](https://github.com/mrflip/safebyok/pull/827) `minder_house`, on #821, tip `7dc67ec7d`, `pnpm justify` green by the worker's report. Worktree `/workspace/byok-minder_house`. What it changes for a caller:

* `tryList` answers `Outcome<Labelpath[]>`; it returned the vaultDB's whole `ListThingsAnswer`. Its only callers were tests. `list`'s signature is unchanged.
* `ThingNotice.val`, in the exported `VaultDB` contract, may now be a sparse record: "A Thing a list answers is reported sparse, as listed."
* A listener of a first list hears a `success` for each Thing that joins the listing, then the list's own; it heard one.
* `goodbye` removes the bank's subtree by key prefix. A list waiting at `goodbye` rejects with TanStack's `CancelledError` (a crossing, with its wontfix row).
* New pins in `FixedQueryCacheOpts`: `queryKeyHashFn`, a pass-through `persister`, `initialData`, `select: identity`.

**Reviewed** (2026-11-22): three small fixes kept (`listen` now tells only this bank's queries; a comment; a test local's name), and I reworded `list`'s doc: a list called while another of the same labelpath is under way answers what that one does, so it can miss a Thing written since that one began (the cached listing does not). The reviewer found no invariant false but the one below, and no test weakened. Left alone: `select: identity` as a pin (the reviewer preferred `undefined`, which TanStack's types refuse under `exactOptionalPropertyTypes`; its only cost is an observer kept across `goodbye` and `hello`, an ending). `tryList` no longer tells a list under a tombstone or under nothing from an empty one (the parent's `act`); the `kids` value's `parentlife` is where that returns (`vaultdb_answers-handoff.md`).

Flagged once, for the Coach: `safebyok-postgres`, which is published, builds its vaultDB on `AdapterVaultDB`, so its watches now hear each listed Thing, sparse. #827's changeset is empty.

Open with the Coach: one invariant in the minder's header needs rewording, and the worker left it alone. It reads "An operation caches only its own good answer: the record got, written or listed…"; proposed: "the record got or written, or the labelpaths listed… (a refusal's `dbhas`, each Thing a list answers, or a tracked…)".

## The customer's contract with our cache (the Coach, 2026-11-22)

It corrects my reading of "No Takers: our TSQ becomes a customer-facing API", from which I had struck the query factories and any handle to our client.

* "Out of bounds: the customer can freely use our queue"
* "Out of bounds: the customer contract allows them to inspect how our library uses our queue, do the same thing themselves against our queue"
* "Allowed: the customer contract allows them to use our methods to query the queue: getting our queryOptions and using it against our queue"
* "Allowed: the customer can assume that a change to the queryKey or a breaking change in the record shape will receive a major version bump"

So the factories stay, and a customer needs some way to point TanStack's hooks at our client. Proposed by me, and loosened by him in the next section (invalidating and the devtools are both fine): one handle to the client, documented as the second argument of `useQuery`, `useQueries` and `useSuspenseQuery` over our factories; a refetch through a method of ours (`vault.invalidate`); the devtools unsupported. Under semver: the key and data shape of whatever has a factory (a box's item, a listing). A soon and a `dead` entry have no factory and no promise.

## The contract with our cache, refined (the Coach, 2026-11-22)

* Invalidating: "you can invalidate but not advance (no fair making something less stale in time or validity)".
* The devtools on our client: "I don't have an issue with that, just don't make us promise not to change".
* The handle: "I'm not willing to give over `.box` on Vault to TSQ's weird query format, so this would be a helper object, but we can work that out later". So the guides' `vault.box(lp)` as a query factory is wrong as sketched: the factories move to a helper object, not yet named.
* The vaultDB's answers under the feed principle (a list's `kids` value and `deltas`, `dbhas` only when usefully different, a frozen singleton for the shell): specified, not built, in `vaultdb_answers-handoff.md` beside this plan, for a thread of its own on #827.

## Ownership and startup: the Coach's states and sequence (2026-11-22)

The caches are settled as far as this workshop takes them; the listing and the vaultDB's answers go on from `vaultdb_answers-handoff.md`. His opening on startup, verbatim:

> We have these states:
>
> user: banked and on the device; banked but vacant ; unbanked
> BankMinder: userids ; gates ; leases ; banks
> VaultMinder:  box kids, item, gone, soon
> And these data stores:
> vaultDB: 30-300ms; assume this needs userid so we have DB access
> idb: 0.5-5ms
>
> There will be a small security <> UX tension for the startup time after a pageload, userid, and database availability.
> Assume the BankMinder can exist early, and the customer caches root gate, bank, and box (and maingate, which right now is the same as the root gate) by banklabel and userid.
> I'm happier if VaultMinder is only instantiated after the user exists; we can explore having it live across signins though.
> An opportunistic process (undesigned) will keep it synced with the local indexeddb
>
> module start
> sync device
> sync BankMinder, VaultMinder exists
> sync Provider exists, keyed on userid and banklabel (which must='main')
> ...async bankminder has loaded local bank/gate/box records
> ...user is signed in
> (if user is banked: anything cached is ready)
> async fetch bank/gate
>
> ... continue

My continuation, proposed in chat, nothing ruled:

1. **First render, server and browser alike** (synchronous, nothing started): the Provider makes the device in a `useState` initializer, and with it the BankMinder, its small cache, and the vault cache's client, empty. Constructors do no I/O, touch no browser global and subscribe to nothing. The stage is `'signed_out'` where the `userid` prop is null, else `'starting'`. The server never gets further, so it and the browser's first render agree.
2. **First effect, browser only**: `device.hello()`: the device database opens, and the BankMinder loads the bank, gate and root box cached for the users this device has seen.
3. **An effect on `userid`**: the device is told who is signed in. It makes that user's bank and VaultMinder, on the client made in step 1.
4. **Banked and on the device**: the stage is `'locked'` from the cache, a few milliseconds in, and cached records show sealed. **Vacant or unbanked**: `'starting'` until the vaultDB answers.
5. **The vaultDB's bank and gate arrive** (30 to 300 ms): they confirm the cache or replace it; a user with no bank goes to `'unborn'`.

Where it differs from his sketch, each for him to rule: the device is made at the Provider's mount, not at module start; "keyed on userid" as a React `key` would remount the customer's whole tree at sign-in, where a vault client that outlives the user needs none; and the VaultMinder is made at sign-in, as he prefers, but its client is not.

The decision the security and UX tension comes down to: what may be done on a cached gate before the vaultDB confirms it. Showing the stage and sealed records: I would allow. Unlocking: his to rule.


### What is synced with the device's database (the Coach, 2026-11-22, "coming around to")

> the indexeddb and the Minders should be synced: The BankMinder for all user+banks; the VaultMinder all boxes for the active user, for all user+bank the root box and listing.

My reading and notes, raised in chat, nothing ruled:

* **What it buys.** A returning user's stage and box list from the device in a few milliseconds. If the stage leaves `'starting'` only once the restore has landed, a hook mounted at `'locked'` answers on its first render, and a suspending hook never suspends on a cached record. And one list of each cached listing, once the vaultDB is reachable, says which cached boxes are behind (its `deltas`).
* **What stays on the device for a user who is not signed in**: the passphrase-wrapped bankKey (material for guessing offline), the gate's headers, the bank, the root box, the labels of the top-level boxes, and whatever a lease allows. Readable by whoever has the browser profile, and by the customer's own page.
* **One ending it implies**: when the active user changes, the earlier user's boxes leave the device's database, or it grows a vault per user.
* **Order**: the restore lands before the minder says `hello` to the vaultDB, so a restored record never meets a fetched one out of order.
* **Mechanism to check first**: TanStack's own persistence (`@tanstack/query-persist-client-core`: `persistQueryClient`, with `shouldDehydrateQuery`, `maxAge` and a `buster`), one stored snapshot for each user and bank, in the device database's adapter package and not the core. It restores a cache exactly, the soon, `dead` and listing entries and their times included; it writes past structural sharing and `onSuccess`, which is harmless into an empty cache.

**TanStack's persistence, where it is and its limits** (found 2026-11-22; from its docs and query-core 5.107.1's `hydration.ts`, not tried):

* `dehydrate` and `hydrate` are in `@tanstack/query-core`, which the core already has. `persistQueryClient` (the timestamp, `maxAge`, `buster` and the subscribe-and-save loop around them) is in `@tanstack/query-persist-client-core`, not installed here; the stock persisters and the React provider that waits for a restore are further packages.
* One snapshot of the client, rewritten whole on a change, throttled by the stock persisters to once a second. No coordination between tabs: the last to save wins the whole snapshot.
* A restore builds each query with its saved state: structural sharing and the cache's `onSuccess` do not run, and an entry whose data landed later, by the device's clock, is left alone. It is asynchronous, and ordering it before any fetch is the caller's job.
* Defaults to change for us: only a query whose last fetch succeeded is saved (an item whose last get was refused has its record and an error state, and would be dropped); a snapshot older than 24 hours is discarded whole.
* What is saved must survive the serializer: frozen-ness, prototypes and object identity do not. A custom persister over IndexedDB can store objects without JSON.
* Nothing is encrypted.

### A world query (the Coach, 2026-11-22)

> I'm on board with the persist. We can define a world query that is keyed on user+bank+banklife+bank.lifetok (a new field being added in another session) -- holds the bank, gate, root box and root box listing.

Today's code already has the shape in part: every vaultDB answer carries `world` (`WorldRecord`: the bank's record with its main gate as `maingate`) and `tracked` (the bank, the main gate and the root box, each `'same'` or the Thing stored). My notes, raised in chat, nothing ruled:

* **For it**: one entry is one consistent set of roots, from one answer; the stage is a function of one value; one small entry for each user and bank is what the BankMinder persists; and it arrives by the feed on every answer already.
* **The root box's listing in it**: it changes whenever a top-level box is added or deleted, where the bank and gate change a few times a day; it is the listing a customer most wants to read, and the world's value has the wrapped bankKey; and the vault cache would have a second copy. Proposed: the world is the bank, the gate and the root box, and the root listing stays the vault cache's.
* **A life in the key**: the key cannot be made until a world has been read, so the entry is landed, never fetched by its key; the first fetch is by user and bank, and the entry is found by key prefix. A late answer from an earlier life lands under its own key, so nothing has to compare lives. Entries of earlier lives need removing, in memory and in the persisted snapshot.
* I do not know what `lifetok` rotates on, so I cannot judge its place in the key.

**Ruled** (the Coach, 2026-11-22): "ok go with the simpler plan". My reading: the world query has the bank, the gate and the root box, and the root box's listing stays in the vault cache. The key (user, bank, `banklife`, `lifetok`) stands as he gave it.

### Ownership and startup: what is settled and what waits (2026-11-22)

Settled by the Coach: our own cache, read by our hooks, with no bridge; a small cache of its own for the gate, the bank and anything internal; the BankMinder may exist early, the VaultMinder once the user does; both synced with the device's database through TanStack's persistence; a world query for the bank, gate and root box.

Proposed by me, not ruled, and what the React thread waits on:

1. The device is made at the Provider's mount (React's once-per-mount initializer) and started in an effect, not at module start.
2. The vault cache's client is made with the device, empty, and each user's VaultMinder attaches to it, so that a hook mounted while signed out goes on working after sign-in. That needs no React `key` on the user, which would remount the customer's tree at sign-in.
3. The stage leaves `'starting'` only once the restore from the device's database has landed.

Ruled by the Coach, 2026-11-22:

* **A cached gate**: "We can give the customer an independent throttle later, but right now let's set it at this: 1. if we have the data, we can use it; 2. we require a userid in the context if that's the right word; 3. no unlock until userid". So the stage and an unlock both run on what the device has cached, before the vaultDB confirms it, once the Provider has a `userid`; with none, nothing unlocks. What follows, accepted with it: an unlock works with the vaultDB unreachable, and a passphrase replaced on another device still unlocks what this device cached until the fetched gate lands.
* **`lifetok`**: "bank's lifetok is changed on every delete and create". So each delete or create of a bank makes a new world key, and the entries of earlier keys are removed by prefix.
* **What stays on the device for a user who is not signed in**: "what stays is the customer's to define".

**Ruled** (the Coach, 2026-11-22), on the three proposals above: "lgtm on all three, and if the customer complains on the last one we can assess costs to making it". So: the device is made at the Provider's mount and started in an effect; the vault cache's client is made with it, empty, and each user's VaultMinder attaches; the stage leaves `'starting'` only once the restore from the device's database has landed.

### Building it: two threads now, the rest for a sprint

* **Thread 11, `minder_client`** (built, under review: draft [#831](https://github.com/mrflip/safebyok/pull/831) on #827, worktree `/workspace/byok-minder_client`, `pnpm justify` green by the worker's report): a factory for the minder's client with its cache-level `onSuccess`, `ThingMinder` and `Device.make` taking the client as an option, a minder attaching and detaching. A minder given no client makes its own, as today.
* **Thread 12, the React thread** (next, on thread 11): the Provider owns a holder made once at its mount (the client, and the signed-in user's device), started and signed in from effects, so that module scope and render make nothing that does I/O, touches a browser global or subscribes (`reactGiver(config)` itself is still called at module scope, and makes only components and hooks); the hooks observe our client; the bridge and the copy go; hook options narrowed; `useBoxList` over the listing query #827 made; tests that no longer need a module reset. `reactGiver(config)` stays as the maker of the Provider and the hooks for now: the surface in the guides (hooks by name, `useVault()`, a helper object for the query options) is a thread of its own, with names still to settle.
* **Not literal yet**: the core's `Device` is made for one user, so "the device at the Provider's mount" is a holder in the React layer until the core has a device that exists before its user. That, the BankMinder apart from the VaultMinder, the world query, persistence (and with it ruling 3), and the vaultDB's answers are core work for a sprint.

### Thread 11 as built (2026-11-22)

What a caller sees, by the worker's report (the review is under way):

* `ThingMinder.makeClient()`, `ThingMinder.isClient(val)` and the getter `minder.queryClient`; `queryClient` as an option of `ThingMinder.make` and `Device.make`, which refuse (`bad_record`) a client `makeClient` did not make. With none, a minder makes its own, as before.
* A minder attaches to its client at `hello` and detaches at `goodbye`. The query defaults are set at `hello`, where the constructor set them.
* `hello` throws `bad_record` while another minder of the same bank is minding in the same client. It never threw before.

Open with the Coach, each with the worker's lean: `hello` refusing a twin (keep); the header's "`goodbye` empties its cache", true on a shared client only of its own bank's entries (reword: "removes its bank's entries from the cache"); `DeviceOpts.queryClient` naming a TanStack type on `safebyok/core` (accept).

For the React thread: the defaults stay set after `goodbye`, closing over the minder that left; a hook that observes a bank's key before `hello` builds a query with no defaults.

### Thread 11 reviewed (2026-11-22)

#831's tip is `3bf1b5912`; `pnpm justify` green by the reviewer's run. Three fixes kept: a test that could not fail now can, `goodbye`'s doc says it removes its own bank's entries, and a quote style. For a minder given no client, the reviewer found nothing a caller observes changed from #827.

* **Three findings, all at endings, none repaired**: they are in the burndown, under *Out of bounds*, for whoever takes up endings. Each needs a second Device of one bank on one client, or a fetch after `goodbye`. Thread 12 avoids all three by making one device for each Provider's mount and never saying `goodbye`.
* **`safebyok/core`'s header** ("no caching, so neither the ThingMinder nor TanStack Query") was untrue before this thread: `Device` is exported there with its `minder` getter, and makes a `ThingMinder`. What stays true is that core exports neither name. The reviewer's words: "the device caches through its minder, but neither the ThingMinder nor TanStack Query is exported here". Not applied.
* **Open with the Coach, small**: `bankMindedInClient` refuses `bad_record` for what is a conflict of state, not bad input; `makeClient()` takes no options.

### The stack restacked into one line (2026-11-22)

So that thread 12 stands on every reviewed library change: main ← #817 ← #818 ← #820 ← #821 ← #827 ← #831 ← #824 ← #825 ← #823 ← #826. #819 and #822 stay siblings on #821. #823 had already been rebased onto #825, so the two edits of `putBoxAction`'s `catch` were merged before this.
New tips: #824 `453946f6d`, #825 `9a3fa1d69`, #823 `1c051f5f7`, #826 `4dd856230`; `pnpm justify` green at #826's. The old tips are tagged `*-prerestack-r1122b` in the base checkout.

### Thread 12, `provider_owns` (built, under review, 2026-11-22)

Draft [#837](https://github.com/mrflip/safebyok/pull/837) on #826, tip `1cb635808`, worktree `/workspace/byok-provider_owns`; `pnpm justify` green by the worker's report; the core untouched. Beyond what *Building it* says, its brief settles three things the Coach has not seen, each mine and each open to him:

* **The user's Device is made in an effect on `userid`**, not in the Provider's initializer: `Device.make` checks the secure context, which a server render cannot. So the first render with a userid shows `'starting'` with no device, where today's makes the device during render.
* **The calls that are not hooks** (`Knock.putBoxOnce`, `withWhisper`) find the device through the giver: the Provider registers its holder with its giver in an effect and unregisters at unmount. With none mounted they refuse `absent_vault`. This lasts until `useVault()`.
* **One device for each Provider's mount**, the first userid's, as today's giver has one for the page. It is also what keeps the thread clear of the three endings findings.

**What a caller observes, by the worker's report** (the review is under way):

* The Provider needs no `QueryClientProvider` and may render on a server: until its effects run, a hook shows `'starting'` for a userid and `'signed_out'` for none. The form verbs' mutations still need the host's `QueryClientProvider`.
* A hook mounted while signed out or at `'starting'` shows the record after sign-in with no remount, and then a later revision the watch tells of. The bridge and the copy are gone.
* Each mount of a Provider has its own device and client; unmounting unregisters it and ends nothing; mounting again makes a second device, and the first keeps its watch (an ending; for the burndown's endings list).
* The calls that are not hooks refuse `absent_vault` with no Provider mounted; with two mounted they act on the one mounted last.
* The factories run in our client: `useQuery(sok.knock.box('jokes'), sok.knock.client)`, with two new members, `BoxQueries.client` and `Knock.queryClient()`, whose names wait for the surface thread.
* A record hook takes `select`, `placeholderData` and `notifyOnChangeProps` (`useGate`: the first and last), narrowed by type and at runtime.
* **`useBoxList` shows the bare seeded listing, usually `[]`, from the device's start until the first list lands**, where it showed `undefined`; envman would flash "No secrets yet." Open with the Coach. The seed goes when the listing is rebuilt from `vaultdb_answers-handoff.md`.
* A listing now ages by the minder's own stale time (an hour); the host's copy never aged.
* The stale-time function's `0` arm is inert (every test passes with it changed); its `Infinity` arm still replaces the minder's hour on an item a hook observes. Left as it is.

**Another session's sprint shares this stack.** `react_free` ([#832](https://github.com/mrflip/safebyok/pull/832)) works the burndown's *Free* list on #823: #834 `field_hooks` ← #836 `kit_parts`, and #835 `opts_checked`, all on #823's new tip. #819 and #822 were rebased onto #823 by that sprint and still sit on #823's tip from before the restack (`908751892`): each wants `git rebase --onto origin/20261122-multiples 908751892`, by whoever owns them now. #837 and that sprint's PRs are siblings above #823 in one package, so close-out has a merge between them.

### Thread 12 reviewed (2026-11-22)

#837's tip is `3142c97e3`; `pnpm justify` green by the reviewer's run; three commits kept (two doc fixes, one alignment). Confirmed by probe: our hooks bind the mount's client on their first render whatever the `userid`; a query built before the minder's `hello` takes the minder's defaults on the next render (TanStack re-reads the defaults on every render); one device and one bring-up under StrictMode; nothing at module scope, in the initializer or in render does I/O, touches a browser global or subscribes; a hook's gate leaves out the wrapped bankKey, under a host's `select` too; `refetchMarked` cannot loop. No whisper's cleartext or passphrase is anywhere React or TanStack retains it that it was not before.

Findings, none repaired, each open with the Coach:

* **F4. Our whole client is in a host's hands** through `Knock.queryClient()` and `BoxQueries.client`: the main gate with each wayin's wrapped bankKey (material for guessing a weak passphrase offline), the bank, the soons and the listing, readable and writable, and so shown by devtools pointed at it. No React-layer export reached the wrapped bankKey before; the host's own vaultDB does. The Coach's directive 3 (a small cache of its own for the gate and bank) closes it and is not built. Nothing is recorded in `notes/security.md` yet: that waits on his ruling whether the handle stands meanwhile.
* **F1. A host's `useQuery(Knock.boxQuery(lp), Knock.queryClient())` in a component mounted in the same commit as the Provider** binds the giver's empty client, since the Provider registers in an effect: it shows the first record and never a newer one. The docs now send a component to `useQueryOptions()` and its `client`, which come through context. It goes when `useVault()` replaces the giver's accessor.
* **F3. The factories do not narrow.** Options a host spreads over `boxQuery()` land on the minder's own query while observed; a host's `queryFn` or `initialData` would put unchecked records in the minder's item. Proposed: a doc line on both factories, and no wrapper (the contract: "you can invalidate but not advance").
* **F2. `useBoxList` before the first list**: `data: []`, `status: 'success'`, `isPending: false`, and `isFetching: true` once the bank is up. Envman shows "No secrets yet." for the length of the first list, and its "Looking for your secrets…" never shows. The reviewer found no honest fix in the hook (rewriting the result defeats TanStack's tracked props). Proposed: envman asks `isFetching && labelpaths.length === 0`; the seed itself goes with the listing's rebuild.
* **F5. After a Provider unmounts, `lock()` through the giver does nothing**, while that mount's device stays unlocked with its watch open. An ending; in the burndown's endings list, reported for its secrets side.

Also noted: a selecting `useBank` renders once more, when the device appears; the tests' search of the host's client for a wrapped bankKey is now nearly vacuous, since nothing of ours goes there.


## 2026-11-23: both lines land, the minder made simple, the threat model, the dojo

Where things stand, replacing what earlier sections say of open PRs. The workshop's own PR (#817) has merged, so *How
the Coach wants it run* above no longer describes a line: a round is now a PR of its own from main, or stacked on the
one it needs.

### What merged

* The workshop's line, #818 … #837 and #817, then core_first's, #844 … #857 and #839. Main is `683175bef`.
* **`one_client` ([#857](https://github.com/mrflip/safebyok/pull/857)).** The Coach asked which of three shapes the minder should have: a split between what manages the QueryClient and what queries it, one minder shared by all users, or "minder and TSQ have the same lifetime". He did not mind the first or third: "we don't need the common use case to be awesome, we need all use cases to be simple and work and to prove there are no races". Built as the third, with the lifetime the device's: one minder, one client, made together by the device before anyone signs in; persisters per user and bank, restored at `signIn`. It reverses #831's shared client. The reason: a device serves its first user for its life, so no client ever had a second minder, and restoring every user's roots before anyone is identified loaded wrapped bankKeys nobody asked for.
* **Thread 12's F4 is closed in substance:** the roots are in a client no host reaches. F2 is closed by `useBoxList`'s doc, not checked by a run.

### The threat model (the Coach, 2026-11-23)

Written as `docs/threat-model.md` ([#859](https://github.com/mrflip/safebyok/pull/859), a draft). What the Coach ruled or said, in his words:

* Time is a dimension of it, and "some of them do defend against a script in the page": `withWhisper`, the strength check, compare-and-swap and stamps. A script in the page is bounded by time, not out of the model.
* A stolen device belongs beside the walk-up.
* Two lease clocks: "only after we have things working. And it's a customer option: a password manager or doppler is one thing, a price-capped 96-character PAT is another." "Assume the common use case has lock times of days or nevers." "This is void if they have control over the clock."
* A freshness bound on the gate: "also real, also a TODO, also clock".
* The session-replay marker on the parts: "TODO that!". "Masking a field at the tab-sleep notification or a timer is quite reasonable." All four are in `TODO.md`.
* Forms: "We offer uncontrolled fields with bells and whistles: eyeball unmasking, timer and page lock, mask display schedule, placeholder text. sidecar fields are controlled; customer defines how the sidecar and whisper fields map to box elements."
* Reloading the page to switch users or sign out: "I don't think a customer will stand for this."

Proposed by the session, not ruled:

* **The table of what a form keeps after each outcome** (kept through a refusal or a failure; cleared when stored or cancelled).
* ~~Sign-out comes into bounds, alone, as the next core thread.~~ Refused by the Coach the same day; endings stay out of bounds. His forecast of how it would go: "the agent implements all the things to wipe data or disable items. Now the code has some number of extra guards everywhere, and combinatorial places where data exists fully/partially/not/damaged/healthy. Next come bug reports about various network events happening in the liminal period ... After that come crossings of the thing being started ... Meanwhile, neither of us know what a gating is." The gating talk comes first. The dojo's Reset keeps reloading the page ("yes").
* **The roots reach a host as records with the key material left out, not as the client:** `useGate` does this for the gate already. For the dojo's Inspect tab the Coach ruled: "mask the keys as they come out of the back door, but do include a taste of them for the dev to understand how the library works. This is for experimentation, not to be installed in a real app." A worker is building it, stacked on #860.
* ~~An async step on `putBoxAction` and `putBoxMutationOptions`, for "test the key before saving".~~ Withdrawn the same day. The Coach: testing a key "should be a button under control of the user", and a button's handler is not a submit, so the key stays in its field and no form is emptied. For strength, "the in-form check would just disable submit, our check runs async just fine": the verb judges inside the library, after it has taken the passphrase, where awaiting costs nothing. The dojo needed its ten lines only because its Weak button forces a submit past a disabled one.
* **The react_free PRs (#819, #822, #832, #834, #835, #836, #838, #843) are closed once a new sprint has mined them,** not reworked: the surface work rewrites the same hooks.

Found by experiment (jsdom only): React's reset of a form Action goes through the form's cancelable `reset` event, so a form that cancels it when the action ended in a refusal keeps its uncontrolled fields, a secret's among them, and still clears when stored.

Small matters: `landedKidsOf` keeps `>` on `read_tc` (the session's lean, lightly held; a comment is owed, since `>` already returns `prior` for the same read). `UsernameField` should return `null` for no username and its five callers drop their condition: a directive for the next thread through the kit.

### The dojo

`demos/safebyok-demo-dojo` ([#858](https://github.com/mrflip/safebyok/pull/858), reviewed and ready; [#860](https://github.com/mrflip/safebyok/pull/860) stacked on it, under review): each outcome of a vault-creation form and a box-put form on demand, and an Inspect tab over the stores. What each form keeps today, and what the library made awkward, are in `whiteboard/20261123-dojo/dojo-findings.md`. The finding that matters: the library empties only the `FormData`, and React's reset empties every uncontrolled field after every outcome of a form Action.

Ruled by the Coach: the second tab adds a box ("yes, box"); the outcomes come about for real ("perfect"); the Thing's fields are `label, am, lifepath, lifeseq, revtok, revseq, written_at, born_at, fmt` after its scope, "the thing's body follows fmt the last common field", and the Inspect table leaves out everything before `label`; the table keeps each row's ckey; a shell lists its fields as a record does ("good call").

Open from the dojo, each with the Coach: after `gate_made_elsewhere` the stage stays `unborn` though the message says to unlock; the form verbs hand back no texts, so a hand-built vault form loses its username on a refusal; `stale_write` and `bank_locked` reach a user as a bare kind and a developer's instruction; `safebyok-idb-lean` exports no database or store names; nobody has run the dojo in a real browser.

### What is next

"Before we can do the gating we need to demonstrate the target": the dojo is that demonstration. Then the gating talk (what a gate is, the gate verbs as calls that take the form), dynamic instances, and error routing, none yet discussed.

Two words the Coach set straight (2026-11-23): "mask display schedule" meant the map from a text's length to how many stars show and how many characters from each end, which the code calls `MaskSchedule`; with fields that mask again on a timer, that map "needs a new word". He proposed `MaskingPolicy`, "to define the space-time extent of masked text": the length map and the timed masking under one name (in `TODO.md`). "Placeholder text" meant only an input's light gray placeholder.

The inspection back door, further (the Coach, 2026-11-23): "8 chars is good" for the taste. It also answers the lease's metadata, "active, born_at, proven_at, other metadata", and none of its key material. "I don't mind it being its own package if you want full deniability: safebyok-raw": the session kept it as one call in the core handed on by the giver, since a package of its own would still need the React package to hand it the device, and the call answers only cut data.

### The gating talk opens, and the back door's review (2026-11-23)

**What a gating is at the tip:** a one-shot capsule of a form verb's cleartexts and the change they prove, emptied after every attempt, a refusal included. It exists because TanStack keeps a mutation's variables; each of five verbs comes three ways (a gating maker, mutation options, a hook), and a host writes `unlock.mutate(unlock.gating({ passphraseCleartext: popField(form, 'passphrase') }))`. The Coach: "That is unpleasant, and mixes concerns." He names three things in it: "swallow plaintext into private vars with limited disclosure (this was for a while separate, called a 'cloak')", "funny business to divorce and reattach data to form fields", and "the attempt".

**Ruled:** "We should have an entrypoint for a gating Attempt that accepts reasonable fieldnames", the bag handed straight in with humane field names and renamed inside (`const { passphrase: passphraseCleartext } = GX.fooGating.parse(formCleartext)`). One method, not two, for a `FormData` and a bag: the entrypoint's parse turns a `FormData` into a bag first, then runs the same check ("Perfect").

**The session's reading, not yet ruled:** emptying a form works only for a `FormData`, and is needed only when the form is a TanStack mutation's variables. A form Action or a handler that awaits the verb leaves nothing holding the form, so the verb need never delete from one, and the `Gating` class can be private or go. Held until the back door's rework lands, since both pass through `gate.ts`.

**The Forms tab** (the Coach's spec, being built as a PR stacked on #861): rows that each build the same form one way, "how to do it and how not to do it"; each button slow-plays a save for six seconds; a mirror written by JavaScript that is not React shows where the secret's text is in the DOM; the result reads "ok @ 5:44pm" or "err @ 5:44pm: <message>"; a form library is welcome, "anything goes for the dojo".

**The back door** ([#861](https://github.com/mrflip/safebyok/pull/861), a draft): its review found that two prefixes of the passphrase wayin's wrapped bankKey, taken across a passphrase replace, XOR to keystream alone, a check for an offline guess as good as the whole wrap. The Coach: "Aren't we supposed to include a never-reused salt next to every wrap or encryption? It's supposed to be safe to expose these." They are, in that nothing leaks without a guess and each guess costs a key-deriver run; the finding is that a masked view was meant to show less than the whole wrap. Ruled: show the end, "three chars is enough, just to be able to say 'yes this is the same record here as there'", as `…xyz(64)`; call it a "masked view", not a taste; the lease shows a `loggable`, not its stamp; the rule that `{ ...thing }` "only reveals things you'd want in a log (not secret, not opaque)" goes into STYLE.md and "into the invariants of Thing's doc block"; the BankMinder's QueryClient is "the bank TSQ", since "query, client and cache will never be unambiguous". A sealed whisper's length is the backend's to see today: padding by Padmé is in `TODO.md`.

### The Forms tab, and what the library offers for forms (the Coach, 2026-11-23)

The dojo's Forms tab ([#862](https://github.com/mrflip/safebyok/pull/862), a draft on #861) builds one form with a secret ten ways, and its reviews settled the facts the form verbs rest on (all in `whiteboard/20261123-dojo/dojo-findings.md`):

* React keeps a form Action's `FormData` as the form's pending status, the same object the action is handed. An action that deletes the secret from it before it returns keeps the secret out of React's hands; one that does not leaves it there for the whole save. So a verb handed a `FormData` takes the secret out before it first awaits, which reverses the session's earlier lean that it need never delete.
* A mutation handed the form shows the secret to TanStack's mutation-cache subscribers once, before any `mutationFn` runs. A mutation handed nothing, which reads the form itself, shows nothing.
* A controlled input's text is written into its `value` attribute, for a password field too. A form library's store keeps a registered field's text as typed.
* Cancelling the form's `reset` event on a refusal keeps an uncontrolled secret through a refused form Action, in one line.
* A second submit queued behind a pending save under `useActionState` sits in React's status, secret included, until the first ends: disable the button while pending.

The Coach's framing for a host: "First, choose your tradeoff: would you like the value cleared on save, but kept for edit or retry on error? Or would you like it cleared immediately -- but require the user re-enter on a problem?" "Have the docs recommend only ones where it's a good idea."

**Ruled** ("I endorse your recommendations on which to recommend and the library offerings to drop and keep"):

* Recommend: a form Action whose form cancels its reset on a refusal; a plain `onSubmit` form; a TanStack mutation handed nothing; a form library given every field but the secret; and, for a shared screen, a form that empties the field at once.
* The library offers: secret inputs that cannot be controlled; one verb per action that takes a form or a bag; for form Actions, an action that empties its form at once, with a one-line helper to cancel the reset on a refusal.
* The library drops `putBoxMutationOptions` as documented, which is the mutation handed the form; its docs show the mutation handed nothing. No cloak is offered: it would cure only that one row, which handing the mutation nothing already does.

Also ruled: "masking a field shouldn't validate it: that would be surprising behavior trying to log a field", so `maskUuid` checks nothing, and `safebyok/utils` again loads none of the vault. A "things to do right" tab is being built (validation by zod with the message by its input, no double submit, why a debounce is wrong, inviting and disinviting a password manager, and more), stacked on #862.


### Two more tabs, the masked view's nod, and the form verbs start (the Coach, 2026-11-23)

The dojo line is now #858 ← #860 ← #861 ← #862 ← #863 `dojo_practice` ← #864 `dojo_scenarios` ← thread 7 `gating_attempt`, every base `main`.

**Ruled:**

* The masked view shows **2** characters, not 3: "you mentioned last 3 chars was safe, do 2 anyway". By the same counting, up to 21 masked wraps of one bankKey check no guess, where it was 14 (`notes/security.md` has the amendment). This is taken as the nod that held #861 in draft.
* `Entrykind` is `Qkeykind`, and STYLE's example says "stored records", not "entries" (done on #861).
* "LeaseStamp should be the stamp, lease sparse doesn't sound useful as a type"; Wayin and Proving break the spread rule, to fix; whether a box's record keeps the spread rule waits on the form verbs; `Knock.vaultTsqClient()` "in a later pass" (all four in `TODO.md`).
* The Inspect tab's TSQ panel re-reading each second while shown: "that's OK".
* The form verbs: "we've got a good proposal, yes start: `gate.gatingFooAttempt(params: FormData | gatingDNA)`". Thread 7 builds the five entrypoints in the core, one call on each React hook that takes a form or a dna, a one-line helper to keep a form's text through a refusal, and moves the kit and the dojo's Login tab onto them.

**Held for a ruling, with the worker's counts to come:** whether the core's older three ways for each verb (`unlockGating`, `unlock`, `tryUnlock`) and the giver's (`Knock.unlockGating`, `Knock.unlockMutationOptions`, `popField`) go once the entrypoints are in.

### The dojo line ready, the form verbs built, the minder's matrix (the Coach, 2026-11-23)

**Where the PRs stand.** #858 and #860 merged. Ready, each one commit, CI green: #861 ← #862 ← #863 ← #864, every base `main`; merging #864 with a merge commit lands all four. Draft: #865 `gating_attempt` (built and reviewed, awaits the rulings below), #866 `minder_matrix` (tests only, from main; in rework), #859 (this plan and the threat model). The react_free PRs (#819, #822, #832, #834, #835, #836, #838, #843) carry the label `sidelined`.

**Ruled:**

* **PRs:** "would you pull the prs out of draft as they're ready?" and, on squashing the dojo's back-and-forth, "No need to have green commits, just a green final result." #861 to #864 were squashed to one commit each with their trees unchanged; the old tips are local tags `20261123-<label>-presquash`.
* **`device.bankMinder` stays a public getter.** The session's lean to hide it was withdrawn at the Coach's question: "The record is cached in indexeddb and queryable by vaultdb -- what fields should be secret? What boundaries are significant?" The gate's record reaches a host through its own vaultDB anyway. The boundaries that matter are the private methods that see cleartext, what leaves by itself (a spread, `toJSON`, an error, a log, the masked view), and the device's edge.
* **A form verb handed a form at a stage that has no bank: no fix, a row in `notes/wontfix.md`** (on #865). The Coach: "remember that when an agent comes forward with a crossing like this to have them describe the path that leads here ... To this edge case, you're adding machinery in the form submit of every single attempt, that maligns a form you don't own." The path is a host showing a form at a stage it is not for, or a bank ending under a shown form.
* **The workshop's records** (this plan, `dojo-findings.md`, the memory) "are for you to dip into, or read when it's likely to help": not a reading list.

**The minder's matrix test** (#866, `packages/safebyok/tests/minding/vault-minder/vault-minder-chains.test.ts`). The Coach asked for "a matrix test for sequences of records coming via get and #sendToTSQ": a table of `[liveness, lifeseq, revseq]` précis tuples a scenario runner constructs and feeds in order, by gets, by the feed, and mixed. His rulings on it:

* "wanted is what should hold, written from four principles -- just so"; "Where today's code ends elsewhere, the row also carries today -- great idea".
* The listing: "any change in life (vacant, full/soon, dead) should invalidate the listing, eventually invalidating old records".
* Size: "a->b -- (live+soon/live/dead/dead+soon/bare+soon) to (live+soon/live/dead/dead+soon/bare+soon) x (older/newer) I think that's 50".
* A later life's soon over an earlier life's item: "I think the item is removed from cache in this case: our best prior is not 'here, but out of date' but rather 'null, then vacant, but out of date'."
* "there aren't sparse tombstones and the lifeseq tick/tocks; every tombstone has an off lifeseq, since incremented each time and starting with zero". The core counts `revseq` on across lives, so his tuples that restart it at a new life were mapped onto one history.
* A get behind a bare soon of the same life: "It should not be stale_read to have soon,4,6+bare met by full,4,3: For any full record coming in on a bare record of that life, it's better than what was there, and should be shown to the customer." This changes the get's contract in `minder.ts` ("refuses `stale_read`, and changes nothing") for that one case; the minder thread makes the change, the table states it.
* "Keep the record generator, because we're likely generating the wrong tree shape."
* "fix the tests to instead assert the correct state": read by the session as the seed check, each seeded start asserted against what the principles give for it, with today's state as its tripwire, where the 13 dead+soon rows asserted a state the principles do not allow.

**What the table found** (40 of 69 rows end elsewhere today; the reviewer reproduced the first three through real writes and the watch):

* The listing is never marked after the first record stored: ordinary.
* A dead record is kept once a later life is live: ordinary.
* A later life's soon does not end the earlier life: ordinary. So dead+soon is reachable today.
* An earlier life's record lands under a later life's soon: needs redelivery or a lagging replica.
* A get behind the cache refuses `stale_read` where the feed lands the same record: get only.

**Open on #865, the form verbs** (`gate.gating<Verb>Attempt(params: FormData | dna)` in the core; `attempt`, `wasRefused`, `keepTextIfRefused` on each React hook). Each with the session's recommendation:

1. `keepTextIfRefused(event, onEmptied?)`, so a host's own clearing (the dojo's `newPassphrase.forget`) cannot be ordered wrongly. Recommended; about three lines.
2. The old ways for each verb. Recommended: remove now those with no caller in `src` (`tryUnlock` and its siblings; `Knock.<verb>Gating` and a hook's `.gating`; `Knock.<verb>MutationOptions`); the core's `gate.unlock({…})` and siblings go in a later pass, after a sweep of about 75 test call sites, and `popField` and the makers' `isInCleartextNames` bridge go with them.
3. Names: `wasRefused` breaks `isFoo`, and "dna" names a form verb's fieldnames as well as a maker's object.
4. Which kit forms keep their text through a refusal. Recommended: create-vault and replace-passphrase only.
5. `method="post"` on `UnlockForm` moves a passphrase submitted before hydration from the URL to the request body. Recommended: record it, build nothing.

**Open elsewhere:**

* The table of what a form keeps after each outcome (`docs/threat-model.md`, *Text typed into a form*) is still the session's proposal, not ruled. Once #865 lands, that doc's *Not built yet* line on forms keeping their text is out of date.
* Scenarios claim E9, "It saves in the background: nothing goes away in the form", is "cannot today" because `useDraft`'s `put` ends with `discard()`. Whether "in the background" means the user keeps typing while it saves decides what `useDraft` owes (findings 18 to 27).
* Two threads recommended, neither started: the minder (mark the listing on any change of life; drop the dead record at a rebirth; a later life's soon ends the earlier life; a full record lands on a bare soon of its life), with #866's table as its acceptance test; and `useDraft` (typing kept across a save, a pending state, a reveal without moving focus).
* A flaky test on main fails CI now and then: `passkey-forms.test.tsx`, "drops a wrong-passphrase message when the next attempt ends at a dismissed prompt". A two-line fix sits uncommitted in the worktree `byok-test_races`, not this session's.
