# Sprint react_life: the provider, a startup order, and two apps that prove it

* **Date:** 2026-11-21. **Issued by:** the Coach. **Mode:** normal.
* **Prepared by** the design session; **orchestrated by** another Opus session, which starts here.
* **Default levels:** review `medium`; worker and reviewer on their agents' own model and effort; the style pass on
  `style-reviewer`'s pin. Each thread names its own where they differ. **At once:** 3 threads.
* **Sprint doc:** https://claude.ai/artifact/KbesoYhFF84nnLQorPYQ2K (Open Matters, Cleanup, Progress, Resolved).
* **Status:** planned, no thread cut.

## Read first

* `react_life-design.md`, whole (it is short): what the Coach agreed, each item marked Agreed, Directed, Proposed or
  Later. Where it and the code disagree, it is the intent.
* `dream_interface.md`: what a host writes. The spec for hooks, parts and kit.
* `survey-core.md` and `survey-app.md`, by the section a thread's gloss names. One correction: section 6 of
  `survey-core.md` says fetching the bank's records needs a Bank. It does not: an ask's `track` is optional
  (`shapes-asks.ts`, `trackGiven`), and the minder uses `rootBox` only for the shell of a box below the root.
* STYLE.md *Naming*, once, by any thread that writes code.

## Ground rules

1. **This is a spike.** "Your goal is not production ready yet, we're proving that the library works end-to-end
   (well, end-to-middle, because no deleting vaults, vacate, etc)" (the Coach). Take the shortest honest path. Mark
   each cheat `// Cheat (react_life): …` and list it in your thread file.
2. **Build no ending stage or verb:** no `swept`, `vacate`, `delete`, `sweep`, and no `isEnded`. One thing ends a
   device: a different userid arriving. That teardown is `goodbye()`: it disables the instance, so every later call
   refuses, locks the bank, and rejects calls waiting on an unlock. No stage records it and nothing restarts it.
3. **`safebyok/core` stays the disciplined subset:** nothing from `minding/`, `Vault` or TanStack at runtime.
   `tests/index.test.ts` keeps its assertion.
4. **Dream rule 2 is tested.** Every test that handles a whisper or a passphrase searches the rendered tree, the
   QueryClient's query and mutation caches, and any action state for it (`holdsText`, `secret-search.ts`).
5. **One bank per giver; box labelpaths are flat,** and the giver adds the `box/` prefix.
6. **The design file wins over the code.** Build this plan's default for each Proposed item, and record a deviation
   in your thread file.
7. **A user switch that crosses a fetch or a gating gets a row in `notes/wontfix.md`,** not a guard.
8. **Leave `safebyok-big`, `safebyok-react` and `demos/safebyok-demo-react` alone,** but for what a thread's gloss
   names. Every changeset is `--empty`. No new runtime dependency without asking in chat.
9. **Check with the Coach or your orchestrating agent before fanning out** to subagents.

## The startup order the spike builds

1. **Module scope.** `SOK = reactGiver({ banks: { knock: { vaultDB } }, keyDeriver })` holds config and an empty
   slot. `Knock = SOK.bank('knock')`.
2. **The provider mounts,** inside the host's `QueryClientProvider`, and takes the QueryClient and its `vaultDB` and
   `keyDeriver` overrides. In render it compares its prop with the slot's userid: an empty slot is `signed_out`, a
   different user is `starting` in that same pass.
3. **The `[userid]` effect** has no cleanup and is safe to run twice. If another user has the slot, the slot lets go
   of it first: `device.goodbye()`, `minder.goodbye()`, the bridge stops, and our queries and form mutations under
   the old bank's key are removed from the host's React Query. Then it makes the device, the minder with the device
   as its friend, and the bridge.
4. **`startDevice(device, minder)`,** outside core: `minder.hello()`, then the minder gets the bank, the gate and
   the root box, then `device.bringUp(roots)`. A live bank becomes a `Bank`, stage `locked`. None stored is
   `unborn`. A refusal is `failed`, with `lastErr`.
5. **The vault** is made when the device first has a bank: `Vault.make(bank, minder)`.
6. **Birth** hands the born, unlocked bank to its device, and the slot makes the vault.

**Cheats:** a fresh `device_tok` for each Device; no lease cache, so a reload lands locked; both demos run over
`MemoryVaultDB`, saved to localStorage by a demo helper (ciphertext and sidecars only).

## Threads

Cut from `origin/main` unless a thread says otherwise. Each lands green.

### 1. `no_swept`: remove the fake lifecycle

> * remove hallucinatory lifecycle stages: we know what disables the program.
>   - do not implement the "ending" stages: vacate, delete, sweep.

* **Builds:** the `swept` stage goes, leaving the design's six. `Device.sweep`, `Bank.sweep`, `Vault.sweep`,
  `Lease.sweep`, `bankSwept` and its phrases, and `isEnded` and `endCause` in the snapshot go. What they did is one
  `goodbye()` (ground rule 2), with one refusal for a call on a let-go instance. The restart wording on `hello` and
  `goodbye` goes. VOCABULARY's **stage** row and the doc blocks that name `vacated` and `deleted` are brought to the
  six.
* **Leaves:** `isEnabled` and `demandEnabled`, which `goodbye()` now drives. `hostVault` may stay until thread 3
  moves the minder out of the vault.
* **Touches:** `models/{device,bank,vault,lease}.ts`, `shapes-bankish.ts`, throwers and phrases, `thing-minder.ts`
  doc blocks; the bank, device, vault, lease and bank-forms tests (about 48 cases, `survey-core.md` section 3); one
  line of `knock-knock-world.ts`.
* **Levels:** `sonnet`, medium effort; review `low`. **Depends on:** nothing. **Beside:** 2.
* **Look-ahead:** thread 3 restructures a smaller Device. **Size:** one feature, mechanical.
* **Ready when:** `rg -n 'swept|sweep\(' packages/safebyok/src` finds nothing, and `pnpm justify` is green.

### 2. `react_lean_pkg`: a private package for the new React layer

> * implement a spike of the provider and the pieces described.

* **Builds:** `packages/safebyok-react-lean`, private at 0.0.0, packaged like `safebyok-react`, with entries `.`,
  `./parts` and `./kit`. `git mv` the giver's sources, its tests and its three test worlds into it; copy
  `secret-search.ts`, which old tests also use. `safebyok` becomes a real dependency and the eslint-disables that
  excused it go. `safebyok-react` drops its devDependency on `safebyok`.
* **Leaves out:** any change of behaviour.
* **Levels:** `sonnet`, low effort; review `low`. **Depends on:** nothing. **Beside:** 1; restacked onto 1 before
  thread 3 is cut.
* **Look-ahead:** every later thread writes here. **Size:** small.
* **Ready when:** `pnpm --filter safebyok-react-lean test` passes the same 62 giver cases.

### 3. `device_bring_up`: the core's startup order

> * implement a spike of the provider and the pieces described. There's still some fuzziness about who makes what in which order, but with the lifecycle now tied only to userid, the pressure is low. Cheat if you have to -- eg always seed in certain records, or something. Rip out existing cheat entrypoints once they're not needed (ignore any that exist for testing)

* **Builds:** steps 4 to 6 of the startup order. `Device` gains its bank, `bringUp`, the `starting`, `unborn` and
  `failed` stand-ins in its snapshot, and what a `MinderFriend` needs (its bank's once it has one, else asks with no
  track and the root shell). `MinderFriend` becomes a structural interface. `Vault.make(bank, minder)`. `Bank`'s
  constructor registers nothing, and drops `queryCacheOpts` and its import of `MinderChecks`. `startDevice` is
  exported from the `safebyok` index. `cheatHoldBank`, `cheatDropBank`, `#thisIsTemporaryBank` and `#madeBanks` go.
* **Leaves out:** leases, the deviceDB, minting a `device_tok` in core.
* **Touches:** `models/{device,bank,vault}.ts`, `shapes-minder.ts`, `shapes-bankish.ts`, `index.ts`; device tests
  (bring-up to unborn, locked and failed; birth adopts; `goodbye` rejects waiters), vault and bank tests,
  `models-world.ts`, the new package's `knock-knock-world.ts`.
* **Levels:** `opus`, high effort; review `high`. **Depends on:** 1 and 2, cut from the top of the two restacked.
* **Look-ahead:** thread 4 needs the device's snapshot stages, `goodbye`, and `Vault.make(bank, minder)`.
* **Size:** one feature in four files and their tests, at the limit.
* **Ready when:** a test runs `startDevice` over a `MemoryVaultDB` that has a born bank and sees `starting` then
  `locked`, and over an empty one sees `unborn`, then birth, then `unlocked`.

### 4. `giver_slot`: the provider and the slot

> * implement a spike of the provider and the pieces described.
> * focus first on getting a startup order and proving the library against two recognizeable use cases, demonstrating the dream hooks, parts and kit.

* **Builds:** steps 1 to 3 of the startup order. `reactGiver(config)` and its slot; `SOK.Provider`; the slot's
  letting go, which evicts our queries and mutations; `Knock.useBank(select?)` with the composed stage; the form
  verbs with a synchronous `.gating`; `SOK.useStrengthVerdict`; `Knock.withWhisper`, `lock`, `dismissUnlock`. The
  bridge is made per device. The provider's unmount does nothing.
* **Tests:** retire the fake-world cases tied to `onBankStart` and `ensureBank`, rather than port them. Write a
  provider world (the real giver, `MemoryVaultDB`, the test deriver): a userid starts, null changes nothing, a
  switch evicts, StrictMode's double effect. Port `knock-knock.test` to it.
* **Levels:** `opus`, high effort; review `high`. **Depends on:** 3.
* **Look-ahead:** threads 5 and 6 read the slot's vault.
* **Size:** the sprint's largest. If it runs long, `withWhisper`, `lock` and the knock-knock port move to thread 5.
* **Ready when:** the ported test passes: unborn, birth, lock, `withWhisper` waits, unlock, it resumes, a user
  switch gives `starting` then `locked`, with no secret found in the tree or either cache.

### 5. `giver_boxes`: reading and writing a box

> * implement the react Knock-Knock app, with the hooks, parts and kit needed to do that, into safebyok-demo-knockknock.

* **Builds:** `Knock.boxQuery`, `useBox`, `keys.under`; `SOK.useQueryOptions`; `nullifyThing` as the default
  `select`; `putBoxOnce`, `delBox`, `putBoxAction`. The bridge, minder-giver and react-bridge tests are ported.
* **Leaves out:** listings, `putBox` with a revisor, suspense.
* **Levels:** `opus`, medium effort; review `high`. **Depends on:** 4. **Beside:** 6.
* **Ready when:** a test shows `putBoxAction`, then `useBox` with the new sidecar, and no whisper in the action
  state, the mutation cache or the query cache.

### 6. `parts_kit`: parts and kit

> You're inspired by the existing app and its functionality but hew strictly to best-in-class practices recommended by our dream_interface doc

* **Builds:** parts `WhisperInput`, `WhisperText` (revealing writes to the DOM through a ref), `PassphraseInput`,
  `SubmitButton` (`useFormStatus`). Kit `UnlockForm`, also as the dialog shown while an unlock is wanted, and
  `CreateVaultForm` with the strength meter. A private `formActionOf` helper, which deletes the field from the
  `FormData` before its first await.
* **Leaves out:** passkey kit, the ways-in kit.
* **Levels:** `opus`, high effort; review `high`. **Depends on:** 4; restacked onto 5 after. **Beside:** 5.
* **Ready when:** tests drive each kit form, and no passphrase or whisper is found after a submit.

### 7. `demo_knockknock`: the Knock-Knock app

> * implement the react Knock-Knock app, with the hooks, parts and kit needed to do that, into safebyok-demo-knockknock. You're inspired by the existing app and its functionality but hew strictly to best-in-class practices recommended by our dream_interface doc

* **Builds:** `demos/safebyok-demo-knockknock`: configs copied with `cp` from the old demo and never read, a `build`
  script, `pnpm demo:knockknock`. The app (`survey-app.md` section 1): fake sign-in and user switching, the stage
  switch, the kit forms, the key editor (`putBoxAction` and `WhisperInput`, a mask in the sidecar), Show
  (`WhisperText`), Delete (`delBox`), Lock, and the knock form (`useMutation` over `withWhisper`, with the unlock
  dialog on demand). Sign-out calls `Knock.lock()`, since a null userid changes nothing. The localStorage helper
  for `MemoryVaultDB`, in `src/lib/`.
* **Levels:** `opus`, medium effort; review `medium`. **Depends on:** 5 and 6, cut from the top of the two.
* **Ready when:** `pnpm demo:knockknock` runs both flows by hand, and an integration test runs them with the SDK
  stubbed: a new user creates a vault, saves a key, knocks, and gets a joke; a second user signs in and the first
  returns to `locked`, knocks, unlocks in the dialog, and gets a joke.

**"Once that's reached" is reached here.**

### 8. `giver_box_list`: listings

> * Additionally a "doppler-lite" app well call "envman", in safebyok-demo-envman.

* **Builds:** `Knock.useBoxList()` over the root's listing, a list key under `keys`, and the bridge copying listing
  events, which it drops today.
* **Leaves out:** `useBoxes`.
* **Levels:** `opus`, medium effort; review `medium`. **Depends on:** 7. **Beside:** 9.
* **Ready when:** a test adds a box and sees the listing grow, the same array until then.

### 9. `use_draft`: drafts

> The editor shows the whisper masked when not editing; clicking into the text field unmasks. and exposes a "save" or "undo" button.

* **Builds:** `useDraft(labelpath)`: `isDirty`, `isBehind`, `base`, `sidecar`, `setSidecar`, `whisperField('val')`
  (masked; focus reveals through `withWhisper` into the input's DOM value), `put`, `discard`.
* **Leaves out:** `rebase`.
* **Levels:** `opus`, high effort; review `high`. **Depends on:** 7. **Beside:** 8.
* **Ready when:** a test does focus, reveal, edit, put, and focus, edit, discard, with no secret found.

### 10. `demo_envman`: the envman app

> * Additionally a "doppler-lite" app well call "envman", in safebyok-demo-envman. It lets me add (in sidecar) a title, description, rotation period and last rotated timestamp. The whisper has a single text field, `val`. The editor shows the whisper masked when not editing; clicking into the text field unmasks. and exposes a "save" or "undo" button. records older than their rotation period are red; I can edit that, or rename, through a "gear" button opening a small modal.
> it should probably be its own repo.

* **Builds:** `demos/safebyok-demo-envman`, in this repo for now. The list (`useBoxList`, each row its own
  `useBox`); an add form (title, description, rotation period, `last_rotated_at`; the box's label is a minted id);
  the row editor (`useDraft`, save and undo); red when a record is older than its period; a gear modal that edits
  the sidecar. It imports public entries only, so it can be moved out later.
* **Levels:** `opus`, medium effort; review `medium`. **Depends on:** 8 and 9, cut from the top of the two.
* **Ready when:** add two records, reload and see them, back-date one and see it red, edit its value with save and
  undo.

## What no thread builds

Typed whispers, `whisperQuery`, `useSuspenseBox`, `useBoxes`, `putBox` with a revisor, a draft's `rebase`,
`isWatching` and `heardAt`, passkey kit, `unlock.formAction` on the hooks, the bank boundary, a QueryClient made by
the giver, nested labelpaths, an IndexedDB vaultDB, leases cached on the device.

## Risks

* **Thread 4 outgrows one context,** mostly through the 45 fake-world tests. It retires those tied to the removed
  interface, and has a named overflow into thread 5.
* **Thread 3's test churn.** `Bank.make` stays a plain constructor, so only tests that read the device's snapshot
  after it change.
* **Restack conflicts** from thread 2 moving files that threads 1 and 3 edit. Thread 1 touches one line there, and
  the two are restacked before thread 3 is cut.
* **Demo scaffolding eats context:** a 498-line eslint config, three tsconfigs, vite. Copy them, never read them.

## For the Coach

The rows are in the sprint doc's *Open Matters*. Three would change what is built: where the new React layer
lives (thread 2), who owns the minder (thread 3), and how a demo persists (thread 7).
