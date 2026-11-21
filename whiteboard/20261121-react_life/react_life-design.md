# react_life: startup, the provider, and who makes what

Worked out with the Coach in one design session, 2026-11-21. `dream_interface.md` beside this file is what a host
writes; this file is what stands behind it. Each item is marked **Agreed** (the Coach said so), **Directed** (the
Coach's instruction for this sprint), **Proposed** (put to the Coach, not yet answered: an Open Matters row), or
**Later** (agreed in principle, not built in this sprint).

The code drifted during the refactoring. Where the code and this file disagree, this file is the intent; say so in
the thread file rather than carrying the code's behaviour over.

## What this sprint builds, and does not

* **Directed.** A spike of the provider and the pieces below, proving a startup order against two recognizable use
  cases. Cheating is allowed where the order of making is still fuzzy (always seeding certain records, say). Existing
  cheat entrypoints go once nothing needs them; ones that exist for tests may stay.
* **Directed.** "Your goal is not production ready yet, we're proving that the library works end-to-end (well,
  end-to-middle, because no deleting vaults, vacate, etc)" (the Coach, 2026-11-21).
* **Directed.** The lifecycle is tied only to the userid. Remove the hallucinatory lifecycle stages. Do not build the
  ending stages: no vacate, no delete, no sweep.
* **Directed.** No work on features that touch life transitions. The goal is a basic app working normally: lock and
  unlock are the only transitions, and nothing that takes a working instance to a non-working one is contemplated,
  a second userid included. The teardown code that exists is neither removed nor replaced. A startup paradox is
  cheated, not solved. `react_life-plan.md`, *What is in bounds*, has the examples.
* **Directed.** The two use cases are the two apps, and between them: the new-user flow, the returning-user flow,
  lock and unlock, and each gating verb but deleting the bank.
* **Later.** Sign-out policy, vacate, delete, the userid-only discard, a second userid, other tabs, lease expiry,
  autolock.

## The ladder: what exists when

| When | What exists |
|---|---|
| module scope | the giver: static config (banks, vaultDB, keyDeriver, whisper schemas) and one mutable slot, the current device |
| the provider mounts | the host's QueryClient is in hand, and is given to the giver |
| a userid arrives | the device, which owns the vaultDB, the TSQ cache, the minder and the bridge |
| the bank and gate records are in hand | the bank, then the vault; the lease loads after |

* **Agreed.** The giver predates the user and holds no user state. Everything a hook reads goes through its slot.
* **Agreed.** A device cannot exist before its userid, and has it from construction.
* **Agreed.** The device owns the minder's lifecycle; the minder co-lives with the vaultDB, the TSQ and the bridge.
* **Agreed.** The TSQ cache is made at the userid boundary, so only one user's data is ever in it. If that gets in the
  way it may be kicked to module scope until everything else works, and tightened later.
* **Agreed.** The minder exists before the bank and fetches the bank and gate records. Given a userid, a bank record
  is microseconds away (cached), a fraction of a second away (stored), or already in hand. An existing bank gets a
  bank and a vault; an absent bank shows only the birth form. The gap needs no object of its own.
* **Agreed.** The bank is constructed with the bank and gate records, and loads its lease asynchronously.
* **Agreed.** The vault is the customer's interface without React. It is stateless: its userid, its banklabel, and
  refs to the bank, the minder and the bridge. It needs a bank at construction. It is generous: a labelpath string
  or a whole scoped object both name a box, and it consults the minder by scope.
* **Agreed.** The core must be able to export a disciplined subset that signs in, unseals boxes and executes the
  gatings, with no vault, minder, giver or bridge. The bank knows none of them.
* **Agreed.** Nothing invokes a gating until the customer triggers it. So startup never needs the user.
* **Agreed.** `hello()` starts an instance's asynchronous work, once, when it is known to be in use. Construction has
  no side effects. Nothing calls `hello()` on an ended instance: it is dropped and a new one made.
* **Agreed.** The device owns the minder, and `safebyok` takes `@tanstack/query-core` as a peer dependency. The
  giver makes the bridge, and `safebyok-react-lean`, the new private React package, takes `@tanstack/react-query`
  as a peer dependency.

## The provider

* **Agreed.** One `<SOK.Provider userid>`, replacing `SOK.useSignIn` and `SOK.useBridge`. It fills the giver's slot,
  and may override `vaultDB` and `keyDeriver` for its mount, which is what lets a test render the real giver over a
  memory vaultDB. One provider is mounted at a time. Functions outside render read the slot when called.
* **Agreed.** The host's QueryClient is given through the provider, any time before the vault is made.
* **Agreed.** What the `userid` prop does:

  | The prop | Effect |
  |---|---|
  | becomes a string, and nothing is running | start |
  | goes null or undefined | nothing |
  | becomes a different user | the first user's device ends in memory, then the second starts (**Later**: not this sprint's) |

* **Agreed.** In render the provider compares its prop with the device's userid. Children of a different user get
  `starting` in that same pass, never the first user's device.
* **Agreed.** The `[userid]` effect has no cleanup, and start is safe to call twice. This looks like a bug to a
  React reviewer, so it carries a comment.
* **Agreed.** A started device steadfastly maintains, according to principles: it serves what it has until it is
  signalled. **Proposed** as those principles: a refused vaultDB call is reported and ends nothing; it does not
  retry or reopen a watch on its own; it extends no lease; it lets go at once when signalled.
* **Proposed.** What the provider's unmount does. `hello()` is React's mount, and React expects each mount to have an
  unmount. With no sweep in this sprint, the spike does nothing on unmount.
* **Agreed.** The provider belongs at the root, above the router.

## Stages

* **Directed.** Only what the program can reach: `signed_out`, `starting`, `unborn`, `locked`, `unlocked`, `failed`.
  `swept`, `vacated` and `deleted` go.
* **Agreed.** `signed_out`, `starting` and `failed` are states of a slot, not of a bank object. The flat `stage` that
  `Acme.useBank()` answers is the composed view.
* **Proposed.** `unborn` is a state of the slot too: no bank object, and birth fills it.

## Rules for the hooks, parts and kit

`safebyok-react` has three levels: **hooks**, **parts** (pieces such as `WhisperInput`), and **kit** (assemblies
built from parts).

* **Agreed.** The dream's three rules stand.
* **Agreed.** `WhisperInput` and `WhisperText` are parts, and uncontrolled.
* **Agreed.** An error a host's own callback throws reaches `error` as thrown, stack and all.
* **Agreed.** A host's own `select` is handed the whole item. `nullifyThing` is the default `select`: undefined for a
  bare item (only a sparse record known, so the query is pending anyway), null for a tombstone or the shell. A
  tombstone's sidecar is `{}`.
* **Agreed.** React hands one `FormData` both to a form's action and to `useFormStatus().data`. An action that
  deletes the field once read, before it first awaits, leaves no render to see it.
* **Proposed.** `unlock.formAction` and its like on each form verb: it takes the conventional fields out of the
  `FormData`, attempts the gating, and returns a promise that settles with the mutation and never rejects. Parts
  build on it. `unlock.gating(cleartexts)` stays for triggers that are not forms.
* **Proposed.** A bank boundary: a component that renders its children only while a device lives, keyed on it, with
  the stage switch as its fallback. Until ruled, the dream's `switch (bank.stage)` and hooks that work anywhere under
  the provider are the default.

## Ends, for later

Recorded so that nothing built now forecloses them. None is built in this sprint.

* **Agreed.** The cascade: call `vault.verb`; it calls `bank.lock`; then each instance verbs its own instances and
  then itself. The bank's disabled and locked `&&` everyone's: you may be disabled for other reasons, but if the bank
  is, so are you.
* **Agreed.** Vacate strips everything of the user from this device, as if they had never logged in: the deviceDB's
  rows, our part of the host's React Query, the TSQ, the lease and gate in memory.
* **Agreed.** The host will decide which ending events discard data, and will be able to discard with only a userid
  and no session. What a sign-out keeps is a policy: cached boxes, the cached gate, the lease, the saved userid.
* **Agreed.** Only these hold user data we control: IndexedDB through the deviceDB, the backing datastore through
  the vaultDB, the bank's lease and gate in memory, the TSQ, and our namespaced part of the host's React Query.
  A userid is not user data.
* **Agreed.** No restart: nothing resumes an ended instance, and the `swept` stage has no reader.

## Found in the code, 2026-11-21

* Nothing in `src` calls `minder.hello()`, and only test helpers implement the `GiverDevice` the giver is handed.
* `makeReactGiver` registers `device.onBankStart(…)` at module scope and discards its stop function.
* On a bank's end the bridge resets our entries in the host's React Query; it does not evict them, and leaves our
  form mutations.
* A lease's expiry is reported (`leaseEndsAt`) and enforced nowhere: no timer, and no comparison at use.
* `Device.make` ignores the deviceDB, so no lease is cached, and nothing in `src` mints a `device_tok`.
* The minder's friend is a Bank (`MinderFriend`), and `Bank.make` needs a root box record: a minder cannot yet exist
  before its bank (`survey-core.md`, section 1).
* The new core has a memory vaultDB and a Postgres one, and none that persists in a browser (`survey-app.md`,
  section 4).
* `safebyok-react` exports nothing from `giver/`, so a demo has no import path to it (`survey-app.md`, section 2).
* Of the hallucinatory stages only `swept` is in the code; `vacated` and `deleted` are in doc blocks alone.
