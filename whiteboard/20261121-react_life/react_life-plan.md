# Sprint react_life: two apps running normally on the new core

* **Date:** 2026-11-21. **Issued by:** the Coach. **Mode:** YOLO (the Coach, at the invocation), with `/turbochat`.
* **Prepared by** the design session; **orchestrated by** another Opus session, which starts here.
* **Default levels:** review `low`; worker and reviewer on their agents' own model and effort; the style pass on
  `style-reviewer`'s pin. Each thread names its own where they differ. **At once:** 3 threads.
* **Sprint doc:** https://claude.ai/artifact/KbesoYhFF84nnLQorPYQ2K (Open Matters, Cleanup, Progress, Resolved).
* **Status:** running. Threads 1 to 5 filed, out of draft (#797–#801; #800 and #801 are siblings on #799). Thread 6 building, stacked on #800. Thread 7 waits on 6, then a restack of #801 into the line.

## The goal

Show that the library supports a best-practices React app, end to end: two basic apps, working normally, written to
`dream_interface.md`. This is a proof, not production code: "we're proving that the library works end-to-end (well,
end-to-middle, because no deleting vaults, vacate, etc)" (the Coach).

The apps must **run**. Starting them the conventional way is welcome where it comes easily, and a cheat is as good
where it does not.

## The Coach's word at the invocation (2026-11-21)

> Consider it a certainty that there will be design gaps around startup: who owns the bridge when this thing wants that as a constructor yada yada.
> Standing back, you'll agree that if we have a working app that performs all its actions, the task of re-apportioning instance ownership becomes transformatively easier. In the other direction, axiomatizing a retrospectively poor design decision of when the minder is built could make everything that comes after it brittle.
>
> Focus just so: get the app working, elegantly if possible, by artifice if stymied, so that we may simplify in or after this sprint.
>
> Lastly, let us highlight a concurrency whizbang that might not be recognized as such: reinserting records or events from the bridge or another listener into the *minder's* TSQ cache, or dispatching from within that cache's dataflow to or from the cache or vaultDB, is strictly out of bounds. improvements in freshness, or avoidance of races, in the minder or react query are out of bounds.

*Orchestrator:* what this means for the threads, as ground rules 6 to 8 below: who makes which instance, and when,
is not settled by this sprint; a thread that meets an ownership knot picks whichever arrangement gets the app
running with the least code, cheats where the clean one resists, and writes down which it chose, so it can be
re-apportioned later. Nothing is built that other code would have to lean on the minder being made at one moment
rather than another.

## Read first

* `react_life-design.md`, whole (it is short): what the Coach agreed, each item marked Agreed, Directed, Proposed or
  Later. Its *Ends, for later* section is background only: nothing in it is built here.
* `dream_interface.md`: what a host writes. The spec for hooks, parts and kit. Where it describes something this
  plan puts out of bounds (a second user, say), this sprint does not build it.
* `survey-core.md` and `survey-app.md`, by the section a thread's gloss names. One correction: section 6 of
  `survey-core.md` says fetching the bank's records needs a Bank. It does not: an ask's `track` is optional
  (`shapes-asks.ts`, `trackGiven`), and the minder uses `rootBox` only for the shell of a box below the root.

## What is in bounds, and what is not

**In bounds:** starting up; lock and unlock; each gating verb but deleting the bank (birth, unlock, replace the
passphrase, add a passkey, revoke a passkey); reading, writing and deleting a box; the hooks, parts and kit two apps
need.

**Out of bounds:** anything that takes a working instance to a non-working one, and anything built to cope with
that. Examples:

* **Ending an instance:** sweep, vacate, deleting a bank, a sign-out's teardown, a second userid arriving, the
  provider unmounting, the page being hidden.
* **Anything on a timer:** autolock, a check of a lease's expiry, caching a lease, the deviceDB.
* **A crossing:** a record, notice or fetch that lands during or just after a lock, an unlock or a gating; two calls
  of one verb at once; an error thrown in the middle of a transition; a second tab.
* **Machinery for any of those:** counters, abort signals, timers, coordinating tokens, generation numbers,
  "is this still current" flags, supervisors, queues.
* **New core machinery in general.** We know of no call for a mechanism in the core that neither `safebyok` nor
  `safebyok-big` already has. If a thread seems to need one, that is a sign to cheat.

**The teardown code that exists stays as it is.** Leave `sweep`, `goodbye` and their tests alone: not extended, not
renamed, not replaced by something new. New code does not call them.

**When something out of bounds comes up, do the cheapest thing and carry on:**

* A crossing gets a row in `notes/wontfix.md` and no code (CLAUDE.md, *Hours separate updates*).
* A missing end is answered by the demo reloading the page, which is a browser's `process.exit`. To change user or
  sign out, the demo clears its own session and reloads.
* A startup knot is answered by a cheat: seed the records in the vaultDB, load them in a wrapper effect, or hardcode
  the JSON. Mark it `// Cheat (react_life): …` and list it in the thread file.
* None of these is a question for the Coach.

### Why the line is drawn here

A guard written for a gap nobody designed is new surface. The next review finds bugs in the guard, those earn more
guards, and the sprint becomes the shoring-up of machinery nobody asked for. `notes/reference-timings.md` lists about
twenty-five crossings that reviews found in one earlier sprint. The same note gives the timescales:

| Event | Time |
|---|---|
| Read a value from IndexedDB | 0.5 to 5 ms |
| A vaultDB round trip on Convex, connection warm | 50 to 300 ms |
| The same, on a cold connection or a weak mobile signal | 500 to 2,000 ms |
| Derive a key (Argon2id) | 650 ms; 1,300 to 3,250 ms on a phone |
| A person types a passphrase | 5,000 to 30,000 ms |
| Worst-case vaultDB requests, end to end, in a 30-day key rotation | about 1.3 million |

Everything the machine does finishes in under a few seconds, and the slowest step in any flow is a person typing.
Life events are days or weeks apart, so one landing inside another operation's millisecond window is rare enough to
leave unspecified. The apps here are judged under normal conditions.

### For the reviewer, and for the orchestrator reading a review

A review in this sprint asks three things: does it run normally, can a secret reach somewhere it should not (the
dream's rule 2), and is the code plain to read.

A reviewer is built to imagine what could go wrong, and end states and crossings are where there is most to
imagine. Such a finding may well be true. In this sprint it is still out of bounds: the reviewer lists it in one
line under "Out of bounds, noted" and fixes nothing, and the orchestrator opens no rework and no Open Matters row
for it. The one exception is CLAUDE.md's: something that could corrupt what the vaultDB stores, or put secret
material where it should not be, is reported.

Quote this section in each review handoff.

## Ground rules

1. **Dream rule 2 gets a test where a thread adds a path for a secret.** One test for each new path a whisper or a
   passphrase travels searches the rendered tree, the QueryClient's query and mutation caches, and any action state
   for it (`holdsText`, `secret-search.ts`).
2. **One bank per giver; box labelpaths are flat,** and the giver adds the `box/` prefix.
3. **Where the design and the code disagree on what your thread builds, follow the design.** For a Proposed item,
   build this plan's default.
4. **The old code is not this sprint's:** `safebyok-big`, `demos/safebyok-demo-react`, and `safebyok-react` beyond
   what thread 1 moves out of it. Nothing published changes, so expect empty changesets.
5. **Check with the Coach or your orchestrating agent before fanning out** to subagents.
6. **Startup ownership stays loose.** Who makes the minder, the bridge or the vault, and when, may be wrong today
   and re-apportioned later. Get the app running: the elegant arrangement where it comes easily, a marked cheat
   where it does not. Build nothing whose correctness depends on the minder being made at one particular moment, and
   list each ownership choice and cheat in the thread file.
7. **The minder's TSQ cache is fed only by the minder's own fetches and watches.** Never reinsert records or events
   from the bridge, the giver or any other listener into the minder's cache, and never dispatch, from inside that
   cache's dataflow (a subscriber, an observer callback, a query function's side effect), to the cache or the
   vaultDB. The bridge reads the minder and writes only to the host's QueryClient.
8. **No freshness or race work** in the minder or in React Query: no refetch-on-something, no invalidation added to
   avoid a stale read, no dedup or ordering of in-flight fetches. A stale or racy read in normal use is a row in
   `notes/wontfix.md`, if anything.

## Who owns what (the Coach, 2026-11-21)

* **The device owns the minder.** `safebyok` takes `@tanstack/query-core` as a peer dependency.
* **The giver makes the bridge,** with the host's QueryClient. `safebyok-react-lean` takes `@tanstack/react-query`
  as a peer dependency.
* **The new React layer is `packages/safebyok-react-lean`,** private.
* **A demo survives a reload** through the memory vaultDB saved to localStorage by a helper in the demo. The
  Postgres adapter may work too; the focus is React.

## The startup the spike aims for

1. **Module scope.** `SOK = reactGiver({ banks: { knock: { vaultDB } }, keyDeriver })` holds config and an empty
   slot. `Knock = SOK.bank('knock')`.
2. **The provider mounts,** inside the host's `QueryClientProvider`, and takes the QueryClient and its `vaultDB` and
   `keyDeriver` overrides.
3. **A userid arrives.** The provider's `[userid]` effect has no cleanup and is safe to run twice. It makes the
   device, which makes its minder, and the giver makes the bridge. A null or undefined userid changes nothing.
4. **The device starts.** Its minder says `hello()` and gets the bank, the gate and the root box. A stored bank
   becomes a `Bank`, stage `locked`. None stored is `unborn`.
5. **The vault** is made once the device has a bank: `Vault.make(bank, minder)`.
6. **Birth** hands the born, unlocked bank to its device, and the vault is made then.

If a step resists, cheat it and keep the later steps. Cheats already expected: a fresh `device_tok` for each Device;
no lease cache, so a reload lands locked; the localStorage helper.

## Threads

### 1. `react_lean_pkg`: a private package for the new React layer

Serves threads 2 to 10, which all write in it.

* **Builds:** `packages/safebyok-react-lean`, private at 0.0.0, packaged like `safebyok-react`, with entries `.`,
  `./parts` and `./kit`, and `@tanstack/react-query` as a peer dependency. `git mv` the giver's sources, its tests
  and its three test worlds into it; copy `secret-search.ts`, which old tests also use. `safebyok` becomes a real
  dependency of it and the eslint-disables that excused it go. `safebyok-react` drops its devDependency on
  `safebyok`. `safebyok` declares `@tanstack/query-core` a peer dependency.
* **Leaves out:** any change of behaviour.
* **Levels:** `sonnet`, low effort; review `low`. **Depends on:** nothing.
* **Look-ahead:** every later thread writes here. **Size:** small.
* **Ready when:** `pnpm --filter safebyok-react-lean test` passes the same 62 giver cases.
* *Orchestrator:* ready, #797. The plan's 62 was a miscount: the four test files moved unchanged and vitest counts 88.
* *Review:* fixed (low). `safebyok` takes `@tanstack/query-core` as a devDependency beside the peer; the changeset's front matter tidied. Left: the copied `eslint.config.mjs` still names `safebyok-react` in its block labels (rename when next touched); `secret-search.ts` duplicated until `safebyok-react` retires; react-query a required peer (right); the lean package reaches query-core through `safebyok` (fine).

### 2. `device_bring_up`: the device starts its own bank

> * implement a spike of the provider and the pieces described. There's still some fuzziness about who makes what in which order, but with the lifecycle now tied only to userid, the pressure is low. Cheat if you have to -- eg always seed in certain records, or something. Rip out existing cheat entrypoints once they're not needed (ignore any that exist for testing)

* **Builds:** steps 4 to 6 of the startup. The device makes and owns its minder, and is the minder's friend
  (`MinderFriend` becomes a structural interface). The device has its bank, and its snapshot shows `starting`,
  `unborn`, `locked` and `unlocked`, and `failed` with `lastErr` where bring-up is refused, if that is cheap.
  `unborn` is a stand-in in that snapshot "as needed, but fake things or substitute a shim, or anything so that
  startup questions don't get in the way of a working app" (the Coach).
  `Vault.make(bank, minder)`. `cheatHoldBank`, `cheatDropBank`, `#thisIsTemporaryBank` and `#madeBanks` go once
  the device has its own bank; where the existing sweep code calls one, make the smallest edit that compiles.
* **Leaves out:** leases, the deviceDB, minting a `device_tok` in core, and everything out of bounds.
* **About `safebyok/core`:** the device now imports the minder. If the assertion in `tests/index.test.ts` that core
  lacks the minder then fails, change the assertion and say so in the thread file. Keeping that subset free of
  TanStack is not this sprint's.
* **Touches:** `models/{device,bank,vault}.ts`, `shapes-minder.ts`, `shapes-bankish.ts`, `index.ts`; device, vault
  and bank tests, `models-world.ts`, the new package's `knock-knock-world.ts`.
* **Levels:** `opus`, high effort; review `medium`. **Depends on:** 1, cut from its tip.
* **Look-ahead:** thread 3 needs the device's snapshot stages and `Vault.make(bank, minder)`.
* **Size:** one feature in four files and their tests, at the limit. Its cheats are its overflow.
* **Ready when:** a test starts a device over a `MemoryVaultDB` that has a born bank and sees `starting` then
  `locked`, and over an empty one sees `unborn`, then birth, then `unlocked`.
* *Orchestrator:* ready, #798. One compaction, six minutes in, before its readiness check. Cheats: birth hands the bank to the device from inside `Bank.birthGating` (`device.adoptBornBank`); `hello` skips its fetch when the device already has a bank. Deviation: five sweep and lock tests dropped and one rewritten, because a swept device now shows the swept bank. Two Open Matters rows.
* *Review:* fixed (medium). `hello` starts the minder inside its `try`, so a throwing watch shows `failed` rather than rejecting; doc blocks trimmed; a `queryCacheOpts` test. Left: `safebyok/core` now pulls in the minder and TanStack through `Device` (an Open Matters row); a tombstoned bank row reads as `unborn`; `#hold` sets the bank before the vault (only reachable via a swept bank). Four out-of-bounds findings noted.

### 3. `giver_slot`: the provider and the slot

> * focus first on getting a startup order and proving the library against two recognizeable use cases, demonstrating the dream hooks, parts and kit.

* **Builds:** steps 1 to 3 of the startup. `reactGiver(config)` and its slot; `SOK.Provider`; the bridge, made by
  the giver; `Knock.useBank(select?)` with the composed stage; the form verbs with a synchronous `.gating`;
  `SOK.useStrengthVerdict`; `Knock.withWhisper`, `lock`, `dismissUnlock`.
* **Leaves out:** a second userid, the provider's unmount, and any eviction from the host's React Query.
* **Tests:** the fake-world cases that only exercise `onBankStart` and `ensureBank` can be retired; port the ones
  that test behaviour a host sees. Write a provider world (the real giver, `MemoryVaultDB`, the test deriver): a
  userid starts, null changes nothing, StrictMode's double effect starts once. Port `knock-knock.test` to it.
* **Levels:** `opus`, high effort; review `medium`. **Depends on:** 2.
* **Look-ahead:** threads 4 to 6 read the slot's vault.
* **Size:** the sprint's largest. If it runs long, `withWhisper`, `lock` and the knock-knock port move to thread 4.
* *Orchestrator:* run on `thread-worker-400k` (opus, high), since thread 2 compacted after six minutes and this thread is larger.
* *Orchestrator:* ready, #799, no compaction, nothing moved to thread 4. The old giver (`old-giver.ts`, `minder-bank.ts`, the fake and minder-giver worlds) stays unexported for thread 4 to port and delete. Two Open Matters rows (form mutation keys without the userid; standalone gating makers dropped); the provider effect's wider deps are my call.
* *Review:* fixed (medium). The bridge holds rule 7: it writes only to the host's QueryClient, and the host refetch reaches `minder.get` after `await device.hello()`, outside the minder's subscriber; keep that `await`. Style and doc-block fixes. Left: three `@example` blocks without twin tests; `giver-defaults.ts` tested only indirectly. Out of bounds, noted: a second userid or a null userid after sign-in leaves the first device live (the demos reload).
* **Ready when:** the ported test passes: unborn, birth, lock, `withWhisper` waits, unlock, it resumes, with no
  secret found in the tree or either cache.

### 4. `giver_boxes`: reading and writing a box

Serves thread 7: the hooks Knock-Knock's key editor needs. The Coach's text is quoted there.

* **Builds:** `Knock.boxQuery`, `useBox`, `keys.under`; `SOK.useQueryOptions`; `nullifyThing` as the default
  `select`; `putBoxOnce`, `delBox`, `putBoxAction`. The bridge, minder-giver and react-bridge tests are ported.
* **Leaves out:** listings, `putBox` with a revisor, suspense.
* *Orchestrator:* also ports or retires the old giver's three test files (`react-bridge`, `minder-giver`, `old-giver`: 50 cases) and deletes the old giver and its worlds, which thread 3 left. Run on `thread-worker-400k`.
* *Orchestrator:* ready, #801. One compaction at ~262k, after proving, just before ready. The old giver and its worlds are deleted; `useBoxRecord` gave way to `useBox`. Three of its leftovers are my calls on Cleanup (emptying every FormData field; the signed-out `boxQuery` error; listings' key goes to thread 8).
* *Review:* fixed (low). Two doc blocks tidied. Rules 2, 7 and 8 checked, nothing to change. Left: three exported names against STYLE.md (`nullifyThing`, `PutBoxActionResult.error`, `delBox`: an Open Matters row); `@example` twins unmarked (Cleanup). Out of bounds, noted: a late `putBoxAction` result after a lock.
* **Levels:** `opus`, medium effort; review `low`. **Depends on:** 3. **Beside:** 5 and 6.
* **Ready when:** a test shows `putBoxAction`, then `useBox` with the new sidecar, and no whisper in the action
  state, the mutation cache or the query cache.

### 5. `parts_kit`: parts, and the unlock and create-vault forms

Serves thread 7: the parts and kit Knock-Knock needs. The Coach's text is quoted there.

* **Builds:** parts `WhisperInput`, `WhisperText` (revealing writes to the DOM through a ref), `PassphraseInput`,
  `SubmitButton` (`useFormStatus`). Kit `UnlockForm`, also as the dialog shown while an unlock is wanted, and
  `CreateVaultForm` with the strength meter. A private `formActionOf` helper, which deletes the field from the
  `FormData` before its first await.
* **Levels:** `opus`, high effort; review `medium`. **Depends on:** 3. **Beside:** 4.
* **Ready when:** tests drive each kit form, and no passphrase or whisper is found after a submit.
* *Orchestrator:* ready, #800, no compaction. Parts and kit take the bank as a prop (`bank={Knock}`, `giver={SOK}`), against the dream's bare `<UnlockForm />`: an Open Matters row. `CreateVaultForm` gained a confirmation field and a hidden `username` field, ported from the old kit. Kit words are English constants (my call: leave until a host asks).
* *Review:* fixed (medium). A revealed `WhisperInput` now re-masks at each submit, as `PassphraseInput` does, with a test. Rule 2 traced path by path: no secret in the tree, props, state or caches. Left: `formActionOf` treats every rejection as a refusal; four live regions in `CreateVaultForm`; `textOf` → `takeText` (handed to thread 6); long doc blocks, no `@example` twins, a few missing cases (Cleanup). Out of bounds, noted: an unmount inside `withWhisper`'s callback.

### 6. `kit_ways_in`: the other gating verbs

> two apps, and yes the new-user flow, returning-user flow, lock and unlock; each gating verb except delete bank

* **Builds:** kit forms for replacing the passphrase, adding a passkey and revoking a passkey, and a passkey unlock
  button. Port `safebyok-react`'s `helpers/passkey.ts` rather than writing WebAuthn calls anew. Tests stub
  `navigator.credentials`.
* **Levels:** `opus`, medium effort; review `medium`. **Depends on:** 5. **Beside:** 4.
* **Ready when:** tests drive each form to its verb, and no passphrase is found after a submit.

### 7. `demo_knockknock`: the Knock-Knock app

> * implement the react Knock-Knock app, with the hooks, parts and kit needed to do that, into safebyok-demo-knockknock. You're inspired by the existing app and its functionality but hew strictly to best-in-class practices recommended by our dream_interface doc

* **Builds:** `demos/safebyok-demo-knockknock`: configs copied with `cp` from the old demo and edited where they name
  the package, a `build` script, `pnpm demo:knockknock`. The app (`survey-app.md` section 1): fake sign-in, the
  stage switch, the kit forms, the key editor (`putBoxAction` and `WhisperInput`, a mask in the sidecar), Show
  (`WhisperText`), Delete (`delBox`), Lock, the ways-in forms, and the knock form (`useMutation` over
  `withWhisper`, with the unlock dialog on demand). The localStorage helper for `MemoryVaultDB`, in `src/lib/`.
  Changing user or signing out clears the demo's session and reloads the page.
* **Levels:** `opus`, medium effort; review `low`. **Depends on:** 4, 5 and 6, cut from the top of the three.
* **Ready when:** `pnpm demo:knockknock` runs these by hand, and an integration test runs them with the SDK
  stubbed: a new user creates a vault, saves a key, knocks and gets a joke; after a reload the user is `locked`,
  knocks, unlocks in the dialog and gets a joke; lock and unlock; replace the passphrase; add a passkey, unlock with
  it, revoke it.

**"Once that's reached" is reached here.**

### 8. `giver_box_list`: listings

Serves thread 10: envman lists its records. The Coach's text is quoted there.

* **Builds:** `Knock.useBoxList()` over the root's listing, a list key under `keys`, and the bridge copying listing
  events, which it drops today.
* **Leaves out:** `useBoxes`.
* **Levels:** `opus`, medium effort; review `low`. **Depends on:** 7. **Beside:** 9.
* **Ready when:** a test adds a box and sees the listing grow, the same array until then.

### 9. `use_draft`: drafts

Serves thread 10: envman's masked editor with save and undo. The Coach's text is quoted there.

* **Builds:** `useDraft(labelpath)`: `isDirty`, `isBehind`, `base`, `sidecar`, `setSidecar`, `whisperField('val')`
  (masked; focus reveals through `withWhisper` into the input's DOM value), `put`, `discard`.
* **Leaves out:** `rebase`.
* **Levels:** `opus`, high effort; review `medium`. **Depends on:** 7. **Beside:** 8.
* **Ready when:** a test does focus, reveal, edit, put, and focus, edit, discard, with no secret found.

### 10. `demo_envman`: the envman app

> * Additionally a "doppler-lite" app well call "envman", in safebyok-demo-envman. It lets me add (in sidecar) a title, description, rotation period and last rotated timestamp. The whisper has a single text field, `val`. The editor shows the whisper masked when not editing; clicking into the text field unmasks. and exposes a "save" or "undo" button. records older than their rotation period are red; I can edit that, or rename, through a "gear" button opening a small modal.
> it should probably be its own package.

* **Builds:** `demos/safebyok-demo-envman`, a package of its own beside the Knock-Knock demo. The list (`useBoxList`, each row its own `useBox`); an add form (title, description, rotation period,
  `last_rotated_at`; the box's label is a minted id); the row editor (`useDraft`, save and undo), where saving a new
  `val` stamps `last_rotated_at`; red when a record is older than its period; a gear modal that edits the sidecar,
  the title included, which is what "rename" means.
* **Levels:** `opus`, medium effort; review `low`. **Depends on:** 8 and 9, cut from the top of the two.
* **Ready when:** add two records, reload and see them, back-date one and see it red, edit its value with save and
  undo.

## What no thread builds

Everything out of bounds above. Also, as nice-to-haves for now: typed whispers, `whisperQuery`, `useSuspenseBox`,
a draft's `rebase`, `isWatching` and `heardAt`, `unlock.formAction` on the hooks (the kit's private helper serves
until the demos show it earns its place), the bank boundary, a QueryClient made by the giver, nested labelpaths, an
IndexedDB vaultDB.

**Built when an app calls for it** (the Coach, 2026-11-21): "if writing the app basically means writing the feature
named, implement the feature: I could easily envision useBoxes, putBox with a revisor, or an editBox equivalent of
withWhisper that returns a sealed putAsk being called for." A thread that finds its app needs one of those three
builds it beside the hook it extends (thread 4, 8 or 9) and says so in its thread file. `TODO.md` already describes
`vault.editBoxRecord`.

The Coach's bullet "remove hallucinatory lifecycle stages" is met this way: the host-facing stage list is the six
the program can reach, and the new React layer neither produces nor switches on `swept`, `vacated` or `deleted`. The
core's existing `swept` code is left where it is (*What is in bounds*).

## Risks

* **Thread 3 outgrows one context,** mostly through the 45 fake-world tests. It may retire those tied to the
  removed interface, and has a named overflow into thread 4.
* **Thread 2 meets a startup knot.** Its gloss says to cheat and keep going.
* **A review pulls a thread toward end states.** *For the reviewer* above is quoted in each review handoff.
* **Demo scaffolding eats context:** a 498-line eslint config, three tsconfigs, vite. Copying them with `cp` costs
  far less than reading them through.

## For the Coach

Every row of the sprint doc's *Open Matters* is ruled and in *Resolved*. Nothing waits on the Coach.
