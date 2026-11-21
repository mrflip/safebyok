# Sprint react_life: two apps running normally on the new core

* **Date:** 2026-11-21. **Issued by:** the Coach. **Mode:** YOLO (the Coach, at the invocation), with `/turbochat`.
* **Prepared by** the design session; **orchestrated by** another Opus session, which starts here.
* **Default levels:** review `low`; worker and reviewer on their agents' own model and effort; the style pass on
  `style-reviewer`'s pin. Each thread names its own where they differ. **At once:** 3 threads.
* **Sprint doc:** https://claude.ai/artifact/KbesoYhFF84nnLQorPYQ2K (Open Matters, Cleanup, Progress, Resolved).
* **Status:** threads 1 to 15 merged. Thread 16 (`birth_verb`, #813) filed and out of draft; thread 17 (`new_passphrase`, #814, stacked on #813) filing. Then: the sprint PR squashed and rebased on top with notes/security.md reconciled, and wrap-up.

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
* *Orchestrator:* ready, #802, no compaction. Exports `ReplacePassphraseForm`, `AddPasskeyForm`, `RevokePasskeyForm`, `PasskeyUnlockButton`, and the ported `passkeysAvailable`, `createPasskey`, `askPasskey`. Gap for thread 7: no hook gives the bank's passkey header. My calls on Cleanup: `formActionOf`'s null `cleartextsOf`, the copied meter, no revoke-by-passkey.
* *Review:* fixed (medium). The passkey forms clear the last refusal when an attempt starts, with two tests; a style fix and two doc corrections. The core's gating zeroes the passkey answer, so `attemptThenZero` is rightly not ported. Left: docs name the missing `Knock.usePasskeyHeader()` (thread 7 adds it); `createPasskey`'s follow-up `get()` may need a fresh gesture on a real browser; naming and long docs for a documentarian pass.
* *Orchestrator:* after filing, #801 (thread 4) was rebased onto #802 so the line is straight; one conflict, in `tests/test-helpers.ts` (keep the fake authenticator, drop the deleted worlds); `pnpm justify` green at the tip.

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

*Orchestrator:* cut from #801, the top of the line, on `thread-worker-400k`. Also adds `Knock.usePasskeyHeader()` to the giver (thread 6's gap).
* *Orchestrator:* ready, #803. The worker stalled for hours mid-proof (a hung `pnpm justify` typecheck) and was resumed by message. Built the demo, `usePasskeyHeader` (a cheat over `useMutationState`), a new `safebyok-react-lean/testing` entry, `LocalStorageVaultDB` (a cheat over `_cheat_things`), and an integration test of every flow under jsdom; fixed a flaky #802 test as a ride-along. Locked and unlocked share one component so a knock waiting on the dialog keeps its result. Not yet clicked through in a browser.
* *Review:* fixed (low). The cancel and wrong-passphrase cases now run the rule-2 search, and a new case shows the passkey button after a reload; four style fixes. Judged against the dream: it holds. Left: the key's mask keeps its last four secret characters in the plaintext sidecar (a TOP Open Matters row); doc blocks and names in `src/lib/anthropic.ts` (Cleanup). Out of bounds, noted: `LocalStorageVaultDB.#save` throwing after the memory write; `signIn` not guarding blocked storage.

**"Once that's reached" is reached here.**

### 8. `giver_box_list`: listings

Serves thread 10: envman lists its records. The Coach's text is quoted there.

* **Builds:** `Knock.useBoxList()` over the root's listing, a list key under `keys`, and the bridge copying listing
  events, which it drops today.
* **Leaves out:** `useBoxes`.
* **Levels:** `opus`, medium effort; review `low`. **Depends on:** 7. **Beside:** 9.
* **Ready when:** a test adds a box and sees the listing grow, the same array until then.
* *Orchestrator:* ready, #804, no compaction. `Knock.useBoxList()` (no args) answers host labelpaths in order, the same array until a box joins; deleted boxes stay listed (their `useBox` answers null). `Knock.keys.boxList()`; a new core static `ThingMinder.listQueryKeyOf(scope)`. The bridge copies listing successes into the host's item.
* *Review:* fixed (medium). A doc block and an `@example` marker; the listing-fetch crossing got its `notes/wontfix.md` row. Rule 7 holds. Out of bounds, noted: a lock between `minder.list` and `listingAt`.

### 9. `use_draft`: drafts

Serves thread 10: envman's masked editor with save and undo. The Coach's text is quoted there.

* **Builds:** `useDraft(labelpath)`: `isDirty`, `isBehind`, `base`, `sidecar`, `setSidecar`, `whisperField('val')`
  (masked; focus reveals through `withWhisper` into the input's DOM value), `put`, `discard`.
* **Leaves out:** `rebase`.
* **Levels:** `opus`, high effort; review `medium`. **Depends on:** 7. **Beside:** 8.
* **Ready when:** a test does focus, reveal, edit, put, and focus, edit, discard, with no secret found.
* *Orchestrator:* ready, #805, no compaction. `Knock.useDraft` in `src/giver/use-draft.ts`; answers `isDirty`, `isWhisperDirty`, `isBehind`, `base`, `sidecar`, `setSidecar`, `whisperField(fieldname)` (props for a plain `<input>`), `put(opts?)` with `sidecarOf`, `discard`, `lastErr`. `put` cites the base (`stale_write` when behind) and waits for unlock. `es-toolkit` added as a runtime dependency. Two wontfix rows. My calls on Cleanup; the dream's comment amended.
* *Review:* fixed (medium). `put` no longer writes a field empty when its typed-into input has left the page (refuses `bad_record`); the tests now search for the keys while shown and while typed, not only after; a wontfix row and two style fixes. Left: typed text survives a lock (an Open Matters row; `notes/security.md` records the reveal path); doc blocks; `DraftFriend` unexported; a few untested cases. Out of bounds, noted: four crossings.
* *Orchestrator:* after filing, #805 was rebased onto #804 (conflicts: both wontfix rows kept, the bank-giver key lists joined); `pnpm justify` green at the tip.

### 10. `demo_envman`: the envman app

> * Additionally a "doppler-lite" app well call "envman", in safebyok-demo-envman. It lets me add (in sidecar) a title, description, rotation period and last rotated timestamp. The whisper has a single text field, `val`. The editor shows the whisper masked when not editing; clicking into the text field unmasks. and exposes a "save" or "undo" button. records older than their rotation period are red; I can edit that, or rename, through a "gear" button opening a small modal.
> it should probably be its own package.

* **Builds:** `demos/safebyok-demo-envman`, a package of its own beside the Knock-Knock demo. The list (`useBoxList`, each row its own `useBox`); an add form (title, description, rotation period,
  `last_rotated_at`; the box's label is a minted id); the row editor (`useDraft`, save and undo), where saving a new
  `val` stamps `last_rotated_at`; red when a record is older than its period; a gear modal that edits the sidecar,
  the title included, which is what "rename" means.
* **Levels:** `opus`, medium effort; review `low`. **Depends on:** 8, 9 and 11, cut from 11 (*Orchestrator:* 11 added before it).
* *Orchestrator:* envman stores its sidecar mask with the package's mask helper at `tail: 0` (no secret characters: the Coach, 2026-11-21); thread 12 adds the live reveal.
* **Ready when:** add two records, reload and see them, back-date one and see it red, edit its value with save and
  undo.
* *Review:* fixed (low, run at medium). The gear's Done no longer moves `last_rotated_at` to midnight UTC when only the title changes (`envFieldsOf`, new `env-form.test.ts`); the gear dialog submits by `onSubmit` so a refused entry keeps the typed fields; two doc blocks. Left: Save with a dirty value overwrites a same-draft back-date (Open Matters); `numberOr` accepts any finite number (app-written sidecar only); `local-vault-db.ts` and `SessionBar.tsx` carry Knock-Knock's quirks; loose helper exports against *Imports* (my call: leave); doc-block and test-gap list to the documentarian pass on *Finally*.

### 11. `giver_surface`: the Coach's rulings on the giver's surface

*Orchestrator:* added 2026-11-21 from three Open Matters rulings; runs after 8 and 9 and before 10, so envman is
written against the final names.

> Standalone gating makers dropped → "add them back; what does the dream_interface file prescribe you use? Both approaches are wanted i was told"
> Parts and kit take the bank as a prop → "im pretty sure we dont want this in the end but getting it working is right. the context doesnt help?"
> Three box-hook names against STYLE.md → "yes correct the names to what style says"
> Form mutation keys leave out the userid → (took the revised Rec: add the userid)
> The key's mask leaks its last four characters → "the amount masked should be tuneable. It's by design that a small number of characters are revealed so you know which particular key you typed in ; perhaps it was rotated, etc. If four makes you nervous but two or three will do, change the mask schedule for everyone."

* **Builds:** (a) the standalone gating makers and mutation options back on the bank giver, beside the five form
  hooks and their `.gating` (the dream prescribes the hook form; this adds the TanStack-idiomatic
  `useMutation(Knock.unlockMutationOptions())` route and a gating built outside a hook); (b) `SOK.Provider` puts its
  giver and its one bank in a package-level context the parts and kit read, so `<UnlockForm />` and
  `<WhisperText labelpath field />` work bare, as the dream writes them; `bank` and `giver` props stay as overrides;
  (c) the renames STYLE.md asks for: `nullifyThing` to a pure-derivation `fooOf` name, `PutBoxActionResult.error` to
  `err`, `delBox` to `delBoxOnce`; (d) the Knock-Knock demo drops its `bank={Knock}` props where the context serves,
  and the dream's examples follow the new names. (e) the form mutation keys carry the userid: `['sok', userid, banklabel, verb]`, null while
  signed out, as the box keys do. (f) a tuneable mask helper, exported from the package (the dream's `mask(whisper.apiKey)`),
  with one default schedule: the first 7 and last 4 characters; the Knock-Knock demo uses it, and envman will.
* **Levels:** `opus`, medium effort; review `low`. **Depends on:** 8 and 9, cut from the top of the two.
* **Ready when:** a kit form renders bare under the provider and its tests pass; the old names are gone; a test makes
  a gating outside a hook and mutates through the standalone options.
* *Orchestrator:* ready, #806, no compaction. `liveOf`, `err`, `delBoxOnce`; `fooGating` and `fooMutationOptions()` beside the hooks; the provider's `{ giver, bank }` context (`src/giver/giver-context.ts`, unexported), props as overrides, `bad_record` outside a provider; form keys carry the userid; `maskOf(text, { head, tail }?)`, default 7 and 4, the demo storing `tail: 0`. The dream's names updated on the sprint branch.
* *Review:* fixed (low). One style fix. Standalone gatings vacate as the hooks do; the demo's stored mask has no secret characters; rule 2 holds. Left: `maskOf` reimplements `safebyok-big`'s `mask` (thread 12 replaces it); doc blocks; a test file for the context (thread 12); the name "given".

### 12. `lockable_whisper`: a locked view, and a callback on a stage change

*Orchestrator:* added 2026-11-21 from two of the Coach's feature requests, placed after envman at the orchestrator's
choice ("they go lower in the list at a priority you choose").

> Unsaved typing survives a lock → "is there an ergonomic hook or snapshot capability to run a callback when the stage changes? (by ergonomic I mean that if e.g. we provide the snapshot but you have to do other work to get the callback, the ergonomic version has us also offer the second)
>
> don't empty it by default, but use such a callback to demonstrate how a customer might themselves clear the form on lock. Don't build that in to our /kit components"
>
> Coach note → "I hadn't quite realized your point was that the masked text hits storage.
> Add withLockableWhisper that takes, in the second opts bag, a callback ifLocked. rather than calling ensureLocked, the function uses the main callback when unlocked, the other when locked.
>
> The value stored in the sidecar is as you proposed -- no secret characters, by calling mask with tail:0; when locked, that's what's rendered.
> If unlocked, the first callback is used: it calls mask with tail:4 and you see a helpful reveal"

* **Builds:** (a) `Knock.withLockableWhisper(labelpath, callback, { ifLocked })`: on an unlocked bank it calls
  `callback` with the unsealed whisper, as `withWhisper` does; on a locked bank it calls `ifLocked` (with the sealed
  box: its sidecar) instead of waiting for the unlock form. (b) an ergonomic stage-change callback beside
  `useBank`'s snapshot, e.g. `Knock.useStageChange((stage, prevStage) => …)` (a hook), so a host need not write the
  `useEffect` over `useBank((b) => b.stage)` itself; name it by STYLE.md. (c) both demos show the key as
  `withLockableWhisper` would: locked, the stored `tail: 0` mask from the sidecar; unlocked, a live `tail: 4` mask
  of the unsealed whisper. (d) envman clears its open draft on lock through (b), in the demo only, not in the kit.
* *Orchestrator:* also: `PasskeyUnlockButton` defaults its `passkeyHeader` from the bank's `usePasskeyHeader()` through the provider's context (#806's leftover).
* *Orchestrator:* also: replace thread 11's `maskOf` and its `MaskSchedule` with `safebyok-big`'s `mask(text, opts?)` (`packages/safebyok-big/src/helpers/mask.ts`, banded schedule with `head`/`tail` overrides), exported through `safebyok-big/internals` and re-exported from `safebyok-react-lean`, in both demos: CLAUDE.md, "re-export what big defines rather than redefining it… never reimplement it a different way", and the Coach's own words, "calling mask with tail:0". Also a ride-along test file for `src/giver/giver-context.ts` (`useGivenGiver`, the `giver` prop, outside-a-provider cases).
* **Leaves out:** emptying typed text on lock in `useDraft` or the kit (the Coach: not by default, not in /kit).
* **Levels:** `opus`, medium effort; review `medium`. **Depends on:** 10.
* **Ready when:** tests show `withLockableWhisper` taking each branch without waiting; the stage-change callback
  fires once per change; envman's draft clears on lock in its own test; no secret found.
* *Review:* fixed (medium). The demos' live tail-4 mask queries set `gcTime: 0`, so the last four characters leave the host QueryClient and DOM on lock (both App tests check it); a `typeof` check replaces an `as string` cast in `KeyMask`; one test's first line and one doc block. Left: `mask(x, { tail: 4 })` reveals four characters of a short value while unlocked (Open Matters); `valRevealOf` → `valLiveMaskOf` and five doc blocks to the documentarian pass; `useStageChange` runs after commit, so one locked render may show the draft before it is discarded (my call: leave); `withLockableWhisper` on an unstarted bank throws `demandBank`'s refusal (my call: leave, with Closer Look E8); the lock-crossing wontfix row awaits the Coach.

### 13. `giver_device`: the giver keeps its device; useGate reads the gate through React Query

*Orchestrator:* added 2026-11-21 from a chat with the Coach after the line filed.

> "what is "slot"? That word isn't in VOCABULARY, `slot.device?.bank?.maingate.passkey0` this doesn't look like anything anyone wants. What are all the question marks for? who is uncertain that a device exists?"
>
> "I would instead have a useGate that serves the bank's maingate. An upcoming change will make that less weird than it sounds. [...] Why does a giver instance need a slot to hold a single variable, why doesn't it just store the device directly?"
>
> "is that better than watching the React Query, which will see every update immediately? Shouldn't the snapshots be coming from TSQ or RQ?"
>
> "Do you want thread 13 built as itemized? yes, with the RQ version. [...] proceed on 13, I endorse your proposals and decisions on the above points"

* **Builds:** (a) `GiverSlot` dissolves (VOCABULARY lists *slot* as a vague word). The giver's closure holds
  `let device: Device | null` and plain `start`/`demandDevice`/`demandBank`/`demandVault`; the provider starts the
  device and passes it to its children through context, so a hook under the provider always has one. Only the calls a
  host may make outside the provider (`lock`, `keys.*`, `fooMutationOptions`) keep a nobody-signed-in branch. The
  second store (`GiverSlotSnapshot`, `#align`, `SignedOutSlot`, `StartingSlot`) goes; `SignedOutBank` stays as the
  constant `useBank` answers with no userid. (b) `Knock.useGate()`: a `useQuery` over `minder.get(MainGate)`, as
  `useBox` is (keeping the `await device.hello()` hop), with a gate key beside `keys.box`; the bridge forwards gate
  events as it does box events. The host's cache holds the gate without each wayin's wrapped bankKey: one function
  makes that shown form, for the query function and the bridge alike. (c) `usePasskeyHeader` goes; the kit's
  `PasskeyUnlockButton` and the demos read `useGate()`'s `passkey0`.
* **Leaves out:** a notify in `Bank.#putGate` (the minder's watch already carries every gate write); moving stage
  into the cache (locked and unlocked rest on a lease, which is never stored).
* **Levels:** `opus`, medium effort; review `medium`. **Depends on:** 12.
* **Ready when:** no `slot` left in the package; a hook under the provider reads a non-null device; `useGate` shows a
  passkey added and revoked without a reload; the host's cache holds no wrapped bankKey and no secret (rule 2).
* *Review:* fixed (medium, opus). `deviceOf` became `ensureDevice`; two test and spacing style fixes; the Provider's comment and `GiverEvent`'s doc block. The device made during render judged sound in the browser (idempotent; no second device or bridge under StrictMode or a discarded render). Left: SSR would keep the first request's device on the server (a TODO entry; a client-only line in the Provider's doc block rides along on 14); a `passkeyHeaderOf` export for a selector copied four times (rides along on 14); `useGate` takes the box-named `BoxQueryOpts` (rename when the bank record follows `useGate`'s shape); `PasskeyUnlockButton` shows nothing until the gate query resolves; a vague `OfData` suffix in the bridge.

### 14. `whisper_mask`: a part that shows a whisper's live mask, written into the page

*Orchestrator:* added 2026-11-21 from the Coach's ruling on an Open Matters row (survey after thread 12).

> The demos' tail-4 mask sits in the host's query cache → "can "the way whisper text does it" be made simple? I don't want a big deal, but it sounds like a dream interface would provide that"

* **Builds:** a part beside `WhisperText`, which writes a whisper field's live mask into the page rather than into
  React state or the host's query cache: unlocked, `mask(field, { tail })` of the unsealed whisper through
  `withLockableWhisper`; locked, the stored mask from the sidecar through `ifLocked`; rewritten when the stage or the
  box's revision changes. Small and plain; it should read as the simple form of what `WhisperText` does. Both demos
  use it in place of their mask queries (`KeyMask`, `useValMask`), and `withLockableWhisper`'s doc example stops
  teaching a query.
* **Leaves out:** folding `WhisperText` and `useDraft`'s reveal into one helper (Closer Look E10, not yet ruled);
  changing `mask`'s policy (a TODO entry, the Coach on #808).
* **Levels:** `opus`, medium effort; review `medium`. **Depends on:** 13.
* **Ready when:** neither demo holds a mask in React Query; the part's test shows the stored mask locked, the live
  tail unlocked, and the stored mask again on lock; rule 2 finds no secret, and the last four are in neither the page
  nor any cache once locked.
* *Review:* fixed (medium). Doc blocks of `WhisperMask`, `withLockableWhisper` and the Provider; a three-behaviour test split. Envman's mask beside the input judged sound. Left: the effect has no cleanup, so a late answer can write the tail after a lock, or overwrite a newer mask (a wontfix row; a two-line stale-result flag awaits the Coach, Open Matters); a ms passive-effect gap after a lock; empty while loading. Filing went red once (Knock-Knock's passkey test, `authenticator.calls.get` empty); a fresh worker is repairing it.

### 15. `stage_not_wait`: verbs read the stage and act or refuse; nothing but startup awaits hello

*Orchestrator:* added 2026-11-21 from two Open Matters rows and the Coach in chat.

> withLockableWhisper, a lock landing mid-call (#808) → "remove the wait on hello there and everywhere but the startup sequence. Assume that things are disabled and locked (and in general will not be called) if state is not correct. Remember that hello takes a fraction of a second. Would you find other examples of this?" / "WithUnlockedWhisper is not supposed to call ensureUnlocked"

> WhisperMask, a late answer after a lock (#810) → "Demonstrate react best practices everywhere especially if it trivially resolves a race or edge case; you may add that as a standing memory"

> In chat: "look for things awaiting unreasonable startup or state crossings those count as concurrency machinery (waiting on hello() )"

Earlier, on the shape: "it should call an unseal method that refuses: there should be a method that unlocks then unseals (by calling the one this will: it demands unlocked and unseals). But withLockable will have just sync checked that the vault is unlocked".

* **Builds:**
  * **Core,** `Vault.withUnlockedWhisper(labelpath, fn)`: demands the lease (refusing `bank_locked`), gets the box
    by today's rule (a refused get throws only when nothing is cached), unseals it through `bank.unsealBox`, calls
    `fn`. It never waits and never unlocks. `Vault.withWhisper` becomes `await bank.ensureUnlocked()` then
    `withUnlockedWhisper`, dropping the `Promise.allSettled` pairing.
  * **React, no `await device.hello()` but the provider's effect:** `withWhisper`, `withLockableWhisper`,
    `putBoxOnceAt` and `delBoxOnce` read the stage synchronously and act or refuse. `withLockableWhisper`:
    unlocked, `vault.withUnlockedWhisper`; locked, `ifLocked` with the box; any other stage, a refusal.
    `withWhisper`: locked or unlocked, `vault.withWhisper` (the unlock form is the user's, not a crossing); else a
    refusal. The two writes refuse through `demandVault()` as they already do at locked.
  * **Queries** (`useBox`, `useGate`, `useBoxList`, `boxQuery`): `skipToken` but at locked or unlocked, as they already do with no device. A loader calling `queryClient.query(boxQuery(...))` before then
    rejects as it does signed out; its doc says to wait on the stage. Their queryFns lose their `await`; the bridge defers its writes into the host's
    QueryClient out of the minder's own notification, one line flagged as a pragmatic fix (the Coach, on the
    ordering-await row: "Move to the bridge and flag as a pragmatic fix. If it causes other problems it will have to
    go.").
  * **A failed bring-up** gets a refusal phrase of its own in place of `BankNotStarted`'s advice (Closer Look E8).
  * **WhisperMask's effect** gets React's stale-result flag in its cleanup, and its wontfix row goes. Where React's
    docs teach an idiom that closes a race in a line or two in the files this thread touches, use it.
  * **notes/wontfix.md:** thread 12's row on a lock landing mid-`withLockableWhisper` is rewritten: such a lock is a
    `bank_locked` refusal (a `#no-slop-crossings` row at most). Thread 12's misplaced comment on `withWhisper`
    ("Awaited even once said") goes with the await.
* **Leaves out:** removing `#unlockWait`, `isUnlockWanted` and the unlock dialog's trigger (the Coach's shape keeps
  a method that unlocks then unseals); `Vault.forceTimelyUnlocked`, which nothing calls (Cleanup); E2's device verb;
  E10.
* **Levels:** `opus` worker, medium effort; review `medium`. **Depends on:** 14.
* **Ready when:** `rg 'hello\(\)' packages/safebyok-react-lean/src demos` finds only the provider's effect; a test shows `withLockableWhisper` refusing at starting and answering through `ifLocked` at
  locked; no test's subject is a crossing.

* *Review:* fixed (medium). A test title. Left: the bridge's microtask takes deliveries outside `ThingMinder.listen`'s try/catch, so a throw from `setQueryData` (a broken host `structuralSharing`) escapes uncaught instead of reaching `tellBadNews` (the Coach: "Bad news handler to the bridge and try catch on all deliveries sound perfect"; done in ceb458102, with a test); `withLockableWhisper`'s doc states a crossing's outcome as contract, and `vault.ts`'s two whisper doc blocks narrate (documentarian, Cleanup); demos' adapter tests still call `device.hello()` (outside the rule). Filing went red once on e2e's "stops the server's watch once the browser stops watching" (Postgres, safebyok-big; a timeout) and green on the re-run: a flake. The worker compacted once, before its readiness check.

### 16. `birth_verb`: birth is a device verb

*Orchestrator:* added 2026-11-21 from the Closer Look triage (E2, E5).

> E2, on the cheat by which a born bank is handed to its device (`adoptBornBank`) → "having a device verb sounds good". On whether `buildBornBank` may say hello before it births → "yes, it will likely have to. Paper over what you must, my next session will build on it"

> E5, on `Vault.sweep` stopping the device's minder, which it no longer owns → "a note, no code, thanks"; then "lgtm"

* **Builds:**
  * `device.birthGating(cleartexts)`, wrapping `Bank.birthGating` and keeping the bank it resolves, in place of the
    bank-to-device call `adoptBornBank`. The giver's create-vault path calls it.
  * `buildBornBank` (the test fixture) says hello before it births, so `#bringUp`'s fixture-only early return
    (`if (this.#bank !== null) { return }`, the "Cheat (react_life)") goes, and with it the wontfix row "A bank
    born on a device while its hello still fetches".
  * E5: a row in `notes/wontfix.md` that `Vault.sweep` stops the device's minder, which it no longer owns, to be
    settled when ends are built. No code.
* **Paper over what you must** (the Coach): where the device verb meets a startup knot, a cheat marked
  "Cheat (react_life)" and a line in the thread file beats a redesign; the Coach's next session builds on it.
* **Leaves out:** retiring the stand-in root shell (`#rootShell`) and E1's refusal kind (`bad_record` for a box read
  before birth; Rec was `absent_vault`), unless the verb cannot stand without them; the bank's copies of minder
  records (TODO); E11's ownership work.
* **Levels:** `opus` worker, medium effort; review `medium`. **Depends on:** 15.
* **Ready when:** nothing calls `adoptBornBank` and it is gone; `#bringUp` has no fixture-only branch; the giver's
  create-vault flow and both demos still birth a bank; the E5 row is in.

* *Review:* flagged (high), then fixed on a second review (high). The first found the 'starting' refusal threw before the gating existed, leaving the host's passkey answer unzeroed (G2); a rework makes the gating, vacates it and throws, makes `keep` optional and checked, and fixes two doc blocks. Left: whether `Bank.birthGating` stays on the surface; `keep` vs `adopt` (VOCABULARY's vague verbs); a test asserting an answer stays live on an entry-point refusal (the declared deviation, in the drift entry); `keepNothing` unneeded; out of range, `gating.ts` drops its own copies unzeroed when the cleartext check refuses. One compaction before the readiness check.

### 17. `new_passphrase`: one new-passphrase hook, one reveal helper

*Orchestrator:* added 2026-11-21 from the Closer Look triage (E10).

> E10, on the new-passphrase meter and the reveal machine each existing twice → "lgtm, build "Rec: one useNewPassphrase hook and one reveal helper, a small thread after 13. Say if you want it.""

* **Builds:**
  * `useNewPassphrase`: the one hook behind every form that takes a new passphrase (its strength verdict, the
    latest-wins `judgeseq` ref in `react-giver.tsx`, and whatever else the create-vault and change-passphrase forms
    each keep), used by each of them.
  * One reveal helper for what `use-draft.ts` and `parts/whisper-text.tsx` each do: pending state, `withWhisper`,
    write into the DOM inside the callback, mask on lock. Both use it.
  * Ride-along: a one-line comment on useDraft's focus branch (`if (input.ownerDocument.activeElement !== input)`):
    the unlock dialog takes the focus.
* **Leaves out:** new behaviour; a passphrase never enters React state beyond what it does now.
* **Levels:** `opus` worker, medium effort; review `medium`. **Depends on:** 16 (cut from its tip once ready).
* **Ready when:** each concern is written once; both demos' tests pass unchanged in what they assert.

* *Review:* fixed (medium). A lost doc block and quoted keys. Left: two draft fields waiting on one unlock both reveal (pre-existing, a guard would be new state); doc blocks of `useReveal`, `showWhisper`, `useNewPassphrase` (documentarian); STYLE.md's `"` for quoted keys vs big's `'`. `WhisperText` showing the old field after a prop change was closed by a keyed inner part (React's reset idiom), with a test, under the Coach's best-practices ruling.

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
