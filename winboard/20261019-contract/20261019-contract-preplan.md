# 2026-10-19: contract -- the preplan for building the Contract

**No back-compat layer, no migrations, no catering to vestigial names or methods.** This is
pre-pre-alpha: a placeholder npm publish and nothing else. An old stored record fails safe (reads
as absent or damaged) and the changeset says so. Every phase and every thread below opens with
this line.

Written by Fable for the Coach and for the `/sprint` orchestrator, which turns this into one
`contract-plan.md` with the phases as sections. It stands on `main` after softlock_gone
([#190](https://github.com/mrflip/safebyok/pull/190)) and on the design doc's **Contract** tab
(https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70, rev 2010, 2026-10-19),
which is the specification: a thread builds its section of the Contract, and where the Contract
is silent the thread writes the missing section first (*Ground rules*). The *Thunks* tab holds the
principles behind it; the *Bad news* tab the handler's cases.

**Mode: YOLO.** This is **one sprint in four phases** (the Coach, 2026-10-19: phases, not sprints,
so the sprint runner does not stop between them), plus two sessions the Coach runs: one plan, one
progress document, one sprint PR, the phases run in order under one orchestrator. One document
because later phases bend earlier ones: the `Outcome` shape, the class with first-class fields and the `tryX`/`X` pair are built once,
in the first phase, for everything after.

## The order

| Stage | What | Who runs it | Review |
|---|---|---|---|
| 0. `rename_pass` | every pure rename, files first | the Coach, a session before the sprint cuts (`whiteboard/20261019-rename_pass/rename_pass-plan.md`) | greps and counts; no reviewer |
| A. `shapes` | `Outcome`, `VaultError.meta`, the `Vault` class, `make` inert, the `tryX`/`X` pair, `getProof`/`ensureLease`, react over the class | the sprint runner, 3 at once, review `medium` | opus-high passes 1 and 2 at the end |
| B. `models` | `Proof`, `Wayin`, `Lease`, `Box` as classes with first-class fields; `putWayin`/`delWayin` and the one-passphrase policy | the sprint runner, 2 at once, review `medium` | opus-high passes 1 and 2 |
| C. `calls` | each call to its Contract section, store verb first: `putBox`, `delBox` and tombstones, `getBox`/`openBox`/`getWhisper`, `lock`/`close`/`del`, subscriptions | the sprint runner, 3 at once, review `medium` | opus-high passes 1, 2 and 5 |
| policy | lock timing vs work in flight: one defensible policy, tests first | the Coach and an agent, a session; the runner does not wait for it (below) | the tests are the review |
| D. `batteries` | retry and timeouts, the react `getProof`, the TanStack adapter, the default handler; README, VOCABULARY and VAULTDB.md from the Contract; demo and e2e; the sweep | the sprint runner, 3 at once, review `medium` | opus-high passes 1 to 5 |

**Why in this order.** Stage 0 runs on a quiet tree, before any thread opens, because a rename
under open worktrees conflicts in every one of them, and because git's rename detection must not
be asked to see a rename and a rewrite in one commit. Phase A changes the two things every later
thread touches, the result shape and the handle, so nothing else can start until it lands. Phase
B extracts the classes from `vault.ts` while the calls still behave as today, so each extraction
is checked against today's tests. Phase C rewrites each call to its Contract section, store verb
first, vault verb second, because the vault's side of each answer is a pass-through. The policy
session sits after C because lock timing needs the final shape of the calls; **the runner does not
wait for it**: phase D cuts from phase C's tip, and the policy's own thread lands whenever the
Coach has held the session, with D3 leaving its lock-timing paragraph as the TODO states it until
then. Phase D is what a customer meets first and is written last, from the
Contract, once the code says what the Contract says.

## Two questions the Coach asked, answered by this plan

**Rename the vocabulary up front, or in stages?** Up front for every name whose meaning does not
change, in the thread for every name whose meaning does. A pure rename (`storeBox` to `putBox`,
`Lockbox` to `Box`, `kind` to `refusalkind`, the files) is cheapest on a quiet tree, once, by
script, with git following the files; staged, the same rename lands in a dozen worktrees as
conflicts and in the history as a rename threaded through a rewrite. A name that promises a shape
the code does not yet have (`tryPutBox` returning an `Outcome`, `putWayin` replacing three verbs,
`Lease.grant`) arrives with the shape, because until then the name would lie, and a reviewer or a
customer reading the tree between phases would be misled. So: stage 0 renames everything the
Contract renames without changing; phases A to C bring each new name with its shape; and no
rename of any kind happens while the sprint has open threads. If a name turns out wrong mid-way, it
waits for the quiet tree after the sprint and gets a small rename session of its own.

**Does code review add value over old-versus-new and a lot of renames?** Not for the renames: the
rename pass's review is its acceptance greps, the unchanged test count per package, `pnpm justify`
and a read of the by-hand diff; eyes over four hundred files of mechanical change find nothing a
grep does not. For the reform threads, a per-thread reviewer at `medium` catches the thread's own
slips (a promise without a test, a secret through a side door, a shim left behind) but cannot
judge coherence across threads, and a general "review this" over a phase's ten thousand changed
lines rediscovers the plan. So per-thread review stays light and specific, and the weight goes on
**opus-high passes at the end of each phase, one lens per pass**, each with a checklist, each
reporting a table rather than prose:

1. **Contract conformance.** For every Does, Guarantees, Returns and Refuses line in the sections
   this phase built, the test that proves it, by title; a line with no test is a finding. For
   every refusal a section names, the test that provokes it.
2. **Security.** Key handling (non-extractable where the Contract says so, bytes dropped where it
   says so), ctx binding on every cipher and wrap, no secret in a message, a `cause`, a log, a
   test fixture or a `meta` field; the lease's lifetime; the `notes/security.md` entry for each.
3. **Vestiges.** Old names, dead branches, back-compat shims, comments that tell history, a `try`
   twin built the wrong way round, a function named `ensure` that only checks. And placement: the
   guesses table re-done for phase C's calls, arguments each way, for the Coach's coin flips.
4. **Customer docs.** README, VOCABULARY, VAULTDB.md and every doc block against the Contract:
   does a sentence promise what the code does, in the customer's words, with no story.
5. **Adapter conformance.** The battery against each adapter: one atomic conditional write per
   verb, what stands reported in the same transaction, nothing thrown.

Passes 1 and 2 run after every phase, because a mistake in A's `Outcome` or B's `Lease` propagates
into everything after; the runner does not stop for them, it spawns them as the next phase's
first threads cut, and their findings go to a small thread in that phase; 3 to 5 run where the table above says. Each pass is one `opus` agent at
`high`, in a worktree, reading the Contract and the phase's diff, with the checklist as its
prompt and a findings file as its output, filed as a PR comment on the sprint PR. Fixes go to a
small thread of the next phase.

## Rulings these rest on

From the Coach, 2026-10-19, in the design doc and in chat. Workers do not re-litigate them.

* **The Contract tab is the spec.** Pseudo-pseudo code; per class a block of first-class fields,
  then per call: signature, Does, Guarantees, Returns, Refuses. It serves the customer, not the
  coder: no story of how the design evolved, in the doc or in doc blocks.
* **Verbs and nouns.** The key-value trio `get`, `put`, `del` on every layer and by scope; `ensure`
  is get-or-create and nothing else (STYLE.md, *Naming*: a check is a `check`); `read` and `write`
  are umbrella words. **Box everywhere**: code, prose, VOCABULARY and stored names. `del` means
  gone: a tombstone of label and revision, no ciphertext.
* **Outcome.** `Outcome<T> = GoodOutcome<T> | BadOutcome`, one union at every layer; nothing thrown
  past the entry boundary. `err` is always a `VaultError` with `refusalkind`, `family`
  (`misuse` | `condition` | `bad_news`), `message`, `cause?`, and `meta?` with specific names
  (`box_stored`, `vault_props_stored`, `capacity`; the set grows, a generic name may come later).
  Every call ships as `tryX()` (the `Outcome`, the contract's form) and `X()` (`val` or `throw err`).
* **Classes.** `Vault`, `Box`, `Wayin` (with `PassphraseWayin`, `PasskeyWayin`), `Proof` (with
  `PassphraseProof`, `PasskeyProof`), `Lease`: real classes, every stored field a first-class
  field, no `props` bag, no secret bytes in a field. The Zod schema stays the stored contract.
  `make` touches nothing; the first `hello()` reads. `snapshot`, `getSnapshot`, `subscribe` for
  `useSyncExternalStore`. One handler, `onBadNews`. `staleMinutes`. `getProof`/`Ask`/`attempt`/
  `lockLanded`, through `ensureLease()` only.
* **Policy.** One passphrase, at most one passkey, passphrase first. `putWayin` replaces the
  passphrase or adds the passkey; `delWayin` deletes only the passkey.
* **Out.** Rotation and soft locks. `vault_key_epoch` survives, reserved at 1. Lock timing vs work
  in flight is a policy session after phase C; until then the last writer wins, and no thread
  pins today's behaviour with a test.
* **Names punted.** `DeviceDB` stays `DeviceDB` until the vault, the models and the VaultDB have
  settled; the Contract's *Pantry* section describes it. No thread renames it.
* **The doc.** The Coach's inline highlights in the design doc are comments to the agent; act on
  them and clear them, never rewrite over them unread.

## Ground rules for every thread

* Its own worktree per PROCESS.md, one PR, `pnpm justify` green at every commit, a changeset (the
  bump is what changesets does pre-1.0; the note lists every renamed or reshaped export), a
  `notes/security.md` entry through the sonnet subagent wherever a reviewer should look.
* **The Contract section is the thread's spec, and the tests are its proof.** Each Does step,
  Guarantees line and Refuses bullet gets a test whose title names the section
  (`"putBox refuses stale_write with meta.box_stored the winner (Contract: putBox, Refuses)"`).
  Tests live in `tests/vault/<theme>.test.ts` and the conformance batteries under
  `tests/test-helpers/`; a theme file past about 1,500 lines splits (STYLE.md, *Tests*).
* **Contract drift.** A thread that finds its section wrong, or silent where it must decide, writes
  the proposed text in its thread file and files an *Open Matters* row, then continues with the
  Contract as written unless the gap blocks it. It never routes around the Contract. The
  orchestrator carries each ruling into the tab, so the tab stays the spec.
* **No shims past the phase.** An interim adapter (a throwing body wrapped into an `Outcome` at
  the boundary, an `Outcome` unwrapped for an internal caller) is allowed within a phase so each
  PR is green, and is named in the thread file; the phase's last thread, or the next phase's
  first, removes it. Pass 3 hunts the rest.
* **No renames** beyond the names a thread's new shapes bring. No prose about how the code came to
  be, in doc blocks or comments; that goes in the thread file.
* **Size budgets** per the sprint skill: the thread that moves a line reruns `pnpm size:budget
  --write`; the last thread of phase D lowers every line to the rule.
* Secret material never reaches a message, a `cause`, a `meta` field, a log or a test fixture.
  Validate at the entry, confident code inside.

## Where each method lives: first guesses

These are guesses, not rulings. There are good arguments in each direction; it does not matter
while everything is fluid, and it matters when the surface is exposed to other people. Phase B's
last thread improves the guesses against the code as built, and the Coach makes the remaining
calls then, as coin flips over the improved table. The rule the guesses lean on, for every method
that could sit at either end: **a method lives on the class whose
fields it reads and writes most; crypto bound to a `*Ctx` lives on the class whose fields make up
that ctx; a secret never leaves its class, so derivation lives on `Proof`; orchestration that
touches storage, the clock, the device store or the state machine lives on `Vault`; no model
class holds a store, a clock or a logger of its own: each holds `vault`, a reference back to the
vault it belongs to, and reaches the scope, the clock, the logger and the key deriver through it
(the Coach, 2026-10-19). The VaultDB and DeviceDB keep their own loggers, being made before the
vault.** Applied to the which-end-is-it cases, with the crypto
weighted as the Coach asked:

| Method | What it touches | Crypto in it | First guess | Name under that guess, and the other guess |
|---|---|---|---|---|
| derive a key from a proof | the proof's secret, the way in's salt and ctx | Argon2id or HKDF: the heaviest crypto in the package | `Proof` | `proof.wayinKeyFor(wayin)` |
| open a way in | the way in's wrap and ctx; one call into the proof | one unwrap under `wayinCtx` | `Wayin` | `wayin.tryOpen(proof)` |
| make a way in | mints the salt (passphrase) or takes it from the proof (passkey), builds every wayin field, wraps the vaultKey under `wayinCtx`; one call into the proof | one wrap under `wayinCtx`; the derivation is the proof's call | `Wayin` | `Wayin.seal(vault, proof, vaultKey, stamp)`. The other guess is `proof.wayin(...)`: for it, the proof holds the only secret and the crypto starts there; against it, a proof would come to know a vaultKey, a device id and a label, and four of the five steps write the wayin's fields |
| make a lease | generates `lease_key`, wraps the vaultKey under `leaseCtx` (scope, `vault_id`, `unlock_epoch`, `ask_passphrase_at`: the lease's own fields), computes `ask_passphrase_at` from the clock and `leaseHours` | one `generateKey`, one wrap under `leaseCtx` | `Lease` for the building; `Vault` for the clock and the write (or `Lease` for all of it) | `Lease.grant(vault, vaultKeyPair, askPassphraseAt)` returns the lease, reading scope, `vault_id` and `unlock_epoch` off its vault; the vault computes `askPassphraseAt` and writes it with `deviceDB.putLease`. The other guesses are `proof.lease` (for: symmetry with the way in; against: a lease is re-granted on a wayin change with the key in hand and no proof) and `lease.put()` writing itself through its vault |
| open a lease | the lease's wrap and ctx; the vault props to compare against | one unwrap under `leaseCtx` | `Lease` | `lease.tryOpen(vault)` |
| seal a box | serializes the whisper, mints `boxKey` and `revision_tok`, ciphers and wraps under `boxCtx` (the box's fields), sets the times from the clock | one `generateKey`, one cipher, one wrap, all under `boxCtx` | `Box` | `Box.seal(vault, boxlabel, whisper, vaultKey, { sidecar, over })`, the scope, `vault_id` and clock off its vault |
| open a box | the box's wrap, ciphertext and ctx | one unwrap, one decipher under `boxCtx` | `Box` | `box.tryOpen(vaultKey)` |
| one refresh when a box will not open | storage | none | `Vault` | `vault.openBox(box)` wrapping `box.tryOpen` |
| ask for a proof: one prompt at a time, the waiters, `lockLanded`, `carry_on`, the late answer dropped | the prompt gate's own state: who is waiting, whether a lock landed, the one answer | none | a small class of its own, `Ask`, already the type the customer sees, owning `attempt`, `lockLanded`, the waiter list and the answer, the vault making one per prompt; or the vault's own, as today | `ask.attempt(proof)`; `vault.ensureLease()` is `hello`, the fit check, `new Ask(why, this)`, `await getProof(ask)`, settle |
| `ensureLease` itself | `hello()`, `lease.endsWithin`, the state machine, the key in hand, the device store | none of its own: all of it is in `Proof`, `Wayin` and `Lease` | `Vault` | `vault.ensureLease()`: the result is a standing lease, and the orchestration reads the vault's state at every step. The other guess is `Lease`, by its name; against it, a lease does not know how to prompt, and there may be no proof at all |

Whatever the placements, today's `ensureLease` body is a tangle of all four, and the guesses share
one aim: once `Proof.wayinKeyFor`, `Wayin.tryOpen`, `Lease.grant`, `Lease.tryOpen` and a prompt
gate exist, what is left on the vault should be a dozen lines of sequencing with no crypto in
them. Thread B5 reports whether it came out that way.

The Contract tab's class blocks show these guesses as one placement, because a block has to show
one, and say so.

## Note to the orchestrator: review and model per thread

The sprint skill's header carries one review level and one cap; this plan varies both per thread,
and the orchestrator follows the thread's lines over the header:

* **`*Model:*`** names the worker's model as the skill allows (`opus` for a thread with crypto, a
  concurrency gate, a stored shape, or a Contract section to write first; `sonnet` for the
  mechanical ones; unnamed means the default). Where a thread's first step is to write its
  Contract section and its test list, the worker does that in its first turn and puts it in its
  thread file before any code: that is the planning pass the Coach asked about, and `opus` is the
  model for it.
* **`*Review:*`** names the reviewer's level and, where it says so, the model: `none` files without
  a reviewer (the orchestrator still checks the test count and that `pnpm justify` ran); `low` is a
  reviewer told to check only the things the line lists; `medium` is the skill's default; `high`
  is a reviewer handed the thread's Contract section and the ground rules as its checklist, at
  `opus`. An `opus` worker gets at least a `medium` review by a reviewer that is not itself.
* **The Coach's usage window.** Nothing the orchestrator can call reports how much of the Coach's
  session quota is used, so it cannot act at 90%. What it can see is a refusal for usage limits,
  its own or a worker's. On the first one: pause the sprint as §4 says (every thread's work is
  pushed; the pause note says where each stands), and schedule the resume with a wakeup or cron
  for 10:50 America/New_York (14:50 UTC on 2026-10-19), which the Coach named as the reset; on
  waking, re-read the pause note and refill the frontier. Do not pre-empt: a pause costs nothing,
  a guess at the quota costs idle hours.
* The end-of-phase passes (above) are not thread reviewers: the orchestrator spawns each as one
  `opus` agent at `high` in a worktree, with its lens as the whole prompt, and files the findings
  on the sprint PR.

---

## Stage 0: `rename_pass` (a session)

As planned in `whiteboard/20261019-rename_pass/rename_pass-plan.md`: three commits (files by
`git mv`; identifiers by script; prose), Box everywhere including stored names, the `ensure`
checks to `check`, the DeviceDB verbs to the trio, `kind` to `refusalkind` on `VaultError` (by
tsc-assisted rename, not sed: `kind` is everywhere). No behaviour. One PR, merged before phase A
cuts.

Added since that plan was written: `VaultError.kind` → `refusalkind` and `isVaultError(err, kind)`'s
parameter with it; `RefusalKind` the type stays. Acceptance adds
`grep -rnw "kind" packages/safebyok/src/errors.ts` finding nothing but prose.

---

## Phase A: `shapes`

Everything every later thread touches. Six threads; A1 first and alone, then A2 and A1b together,
then the rest stacked. Each gets a `human/` note only if it finds a one-way door.

### A1. `outcome` -- the result shape and the error, core and local stores

Build `Outcome<T>`, `GoodOutcome<T>`, `BadOutcome` (Contract, *Shapes*), exported from the core.
`VaultError` gains `family` (derived from `refusalkind` by one table, `VaultErrorFamilyForKind`
extended with `bad_news`) and `meta?` with `box_stored`, `vault_props_stored`, `capacity`; its
constructor takes them; `cause` stays. Helpers: `good(val)`, `bad(err)`, and `outcomeOf(thunk)`
that turns a throwing body into an `Outcome` (a thrown non-`VaultError` becomes a `VaultError` of
kind `storage_unavailable` with `cause`, as the store base does today). The `VaultDB` base class
returns an `Outcome` from every verb: `getVaultProps`, `ensureVaultProps`, `putVaultProps`,
`delVault`, `delDamagedVault`, `listBoxes`, `getBox`, `putBox`, `delBox`; the adapter hooks it
calls may still throw inside, the base catches at its boundary. `localVaultDB` and `idbVaultDB`
(the core's and `safebyok-indexeddb`'s) follow. The conformance battery
(`tests/test-helpers/vault-db-conformance.ts`) expects `Outcome`s. The vault's call sites unwrap
at each call for now (`const { ok, val, err } = await ...; if (! ok) { throw err }`), named as the
interim shim in the thread file.

*Touches:* `errors.ts`, `refusals.ts`, `vault-db.ts`, `local-vault-db.ts`, `idb-vault-db.ts`,
the battery, `vault.ts` call sites, `index.ts`. *Depends on:* nothing unmerged. *Look-ahead:* A1b
makes the remote adapters match; A4 builds the vault's `tryX` over `outcomeOf`; C1 gives `putBox`
its real `expect` and `meta`. *Size:* large; the `Vault` and `everything` budget lines move.
*Model:* `opus`. *Review:* `medium`.

### A1b. `outcome-adapters` -- Postgres, Convex, GraphQL

The three remote adapters return `Outcome`s through the base: nothing thrown, the host's auth
refusals passed through as `not_permitted` and `identity_revoked` with `cause`, and the battery
green against each (Postgres in the container). The GraphQL schema's result types are reshaped
only where a verb's answer shape changed (`LockboxRetirement` is already `BoxDeletion`).

*Touches:* the three adapter packages and their tests. *Depends on:* A1. *Look-ahead:* C1 asks each
for an atomic conditional `putBox` that reports what stands; build nothing of that yet, but note
in the thread file how each backend would do it in one statement or transaction. *Size:* medium.
*Model:* default. *Review:* `medium`, with the battery's run against each adapter in the reviewer's checklist.

### A2. `vault-class` -- the closure becomes a class, same behaviour

`Vault.make` returns an instance of `class Vault`; every function inside today's `make` closure
becomes a method or a private method; module state becomes fields; the `Vault` object type and the
`export const Vault = { make }` go. Behaviour, tests and the snapshot shape stay as they are: the
test count per file is unchanged, and the diff is read for anything that is not a mechanical
move. Methods are bound in the constructor. `vault-opts.ts`'s parse stays as the constructor's
first line.

*Touches:* `vault.ts` whole, `vault-opts.ts`, `index.ts`, `safebyok-react`'s types. *Depends on:*
A1 (so the class is written once, with the `Outcome` imports in place). *Look-ahead:* A3 adds the
fields; B1 to B3 pull methods out of this class into the model classes, so keep today's section
banners as the seams. *Size:* the largest diff of the reform, mechanical; `Vault` budget moves.
*Model:* `opus`, for the seams. *Review:* `low`: the diff is a move (no behaviour, no new branch), the test count per file is unchanged, the section banners survive as B1 to B3's seams.

### A3. `fields-and-make` -- first-class fields, snapshot from them, `make` inert

The Contract's `Vault` block: `applabel`, `user_id`, `vaultlabel`, `vault_id`, `registered_at`,
`unlock_epoch`, `vault_key_epoch`, `wayins`, `state`, `boxes`, `capacity`, `askPassphraseAt`,
`trouble` as fields, written by one private `settle()` that also replaces `snapshot` (frozen) and
notifies subscribers. `make` validates and returns in state `opening`: no storage, no device store,
no bell, no first `hello()`; the first `hello()` reads, starts the storage watch and settles.
`hello({ staleMinutes })` with the default from `make`, `0` forcing a read, coalesced.
`onBadNews(news)`: one handler told every `bad_news` before the call settles, never awaited, its
throw landing in `trouble`; today's `reportError`/`onError` wiring goes where it overlaps.
`safebyok-react`'s `VaultProvider` calls `hello()` itself (the TODO's *hello, make and the react
lifecycle* section is settled by this: the provider owns the first hello, in an effect).

*Touches:* `vault.ts`, `vault-opts.ts`, `types.ts` (`VaultSnapshot`), react's provider, the
`tests/vault/vault-make.test.ts` and `vault-storage.test.ts` themes. *Depends on:* A2. *Look-ahead:*
A5 renders from the fields; B1 types `wayins` as `Wayin[]`. *Size:* medium.
*Model:* `opus`. *Review:* `medium`.

### A4. `try-twins` -- every public call in two forms

Every public method becomes a pair: `tryX(...)` resolving to `Outcome<T>`, built as `outcomeOf`
over today's body, and `X(...)` as one line over it, `val` or `throw err`. `getWhisper(boxlabel)`
as throwing sugar over `getBox` and `openBox`, no `try` form (it may stand on today's `readBox`
until C4). The `Vault` type in `index.ts` exports both forms; react's hooks call the `try` forms.
The thread file lists each pair and marks which bodies still throw internally, for phase C to
flip one call at a time.

*Touches:* `vault.ts`, `index.ts`, react. *Depends on:* A3. *Look-ahead:* C1 to C5 replace each
`outcomeOf` wrapper with a body that returns `Outcome`s natively; batteries (D1) wrap `tryPutBox`.
*Size:* medium; mechanical.
*Model:* `sonnet`. *Review:* `low`: every public method has both forms, each `X` is one line over its `tryX`, the thread file lists the pairs.

### A5. `react-over-class` -- the provider, the hooks, the snapshot

`VaultProvider` takes `Vault.make`'s options as props (`getProof` and `onBadNews` among them, the
shipped modal the default), holds one instance for the signed-in user, makes it in an effect, calls
`hello()` once, and hands it down; `useVault()` returns the instance, `useVaultSnapshot()` reads through
`useSyncExternalStore(vault.subscribe, vault.getSnapshot)`. `openError` and `retryOpen` become
reads of `vault.trouble` and a call of `vault.hello({ staleMinutes: 0 })`. The
`react-hooks/set-state-in-effect` suppression is removed if the lifecycle no longer needs it, and
the TODO section is closed either way. `WhisperField`, `PasskeyUnlockButton` and the boundary
read the fields they need off the snapshot.

*Touches:* `safebyok-react/src/*`, its tests, the demo's provider usage. *Depends on:* A4.
*Look-ahead:* A6 replaces the modal's wiring with `getProof`. *Size:* medium.
*Model:* default. *Review:* `medium`, with StrictMode's double effects in the checklist.

### A6. `getproof` -- `ensureLease`, `acquireLease`, `Ask`, the react modal as `getProof`

The Contract's *ensureLease* and *getProof* sections: `ensureLease({ renewWithin })` idempotent;
the internal `acquireLease(why)` with `why` ∈ `absent` | `locked` | `lease_ending`; one prompt at a
time through a shared promise; no `getProof` means `declined`; `Ask` is a class of its own, one per prompt, owning
`why`, `vault`, `attempt`, `lockLanded`, the waiter list and the one answer (*Where each method
lives*), so the vault's `ensureLease` is sequencing only; `attempt(proof, { wayinId? })` runs today's unlock body for one proof and returns
`Outcome<Vault>`; `carry_on` only for `lease_ending`, else `bad_option`; a `lock()`/`close()`/
`del()` landing while the prompt is up refuses every waiter `vault_locked` and settles
`lockLanded`; an `attempt()` after that refuses at once, no counter. Every data call goes through
`ensureLease()`. `safebyok-react` ships a `getProof` that is `PassphraseModal`, one at a time,
closing on `lockLanded`, handling `attempt`'s refusals as the Contract groups them; `withUnlockedVault`
and `useVaultDialog`-style wiring go. With no `getProof` configured, behaviour is today's: the call
refuses `vault_locked`.

*Touches:* `vault.ts` (the unlock section), `vault-opts.ts` (`getProof`, `onBadNews` options),
react's modal and provider, `tests/vault/vault-lease.test.ts`. *Depends on:* A5. *Look-ahead:* B4's
`putWayin` takes a proof through the same `attempt` path; the policy session reads
`lockLanded`'s cases. *Size:* large.
*Model:* `opus`. *Review:* `high`.

**Phase A closes with** opus-high passes 1 and 2 over the phase's line, run by the orchestrator as
agents while phase B's first threads cut, and a last small thread
`a-shims` if pass 3's quick grep (a worker, not a pass) finds an interim shim that can already go.

**Ruled for phase A** (the Coach, 2026-10-19): `outcomeOf` is exported from `safebyok`. `VaultProvider`
takes `Vault.make`'s options as props, `getProof` and `onBadNews` among them, and makes the vault
itself (the provider owns the lifecycle: a change of user makes a new vault, StrictMode makes none
twice); an app that wants `<VaultProvider vault={vault}>` writes that two-line wrapper itself.

---

## Phase B: `models`

The classes with first-class fields. B1 and B3 run together from A's tip; B2 and B4 stack on B1; B5 last, on B4.
The rule for all four, the Coach's convention (2026-10-19): **each model class is made from its
stored record by `static make(record)`, which validates through the Zod schema, and gives the
record back as `thing.props`, a frozen pojo (`toJSON()` the same); every other stored field is a
first-class field; each holds `vault`, never part of `props`, as a **non-enumerable property** (no circular
serialization, a log line shows the record alone), and logs, reads the clock and derives keys
through it; the VaultDB and DeviceDB see only records.** The vault keeps `logger`, `clock` and
`keyDeriver` the same way. Two helpers in `utils.ts`, the Coach's, attach them: `adorn<VT>(obj,
val: VT): VT` and `decorate<OT>(obj: OT, props: Partial<OT>): OT`, over `Object.defineProperty`,
with tests; B1 adds them first. The vault exposes `logger`, `clock` and `keyDeriver` read-only, and a test gives a model a stub typed as the slice of `Vault`
the models read (`Pick<Vault, ...>`), never the whole class. Instances are what the vault holds and hands out; records are what crosses a
storage boundary.

### B1. `proof-wayin` -- `Proof`, `PassphraseProof`, `PasskeyProof`; `Wayin`, `PassphraseWayin`, `PasskeyWayin`

The Contract's *Proof* and *Wayin* sections. `Proof.parse(given)` replaces `parseProof`,
`parsePasskey` and `parseNewPasskey`; `wayinKeyFor(wayin)` derives late, straight into a
non-extractable key, bytes dropped. `Wayin` with its fields first-class, `summary`, and
`tryOpen(proof): Outcome<VaultKeyPair>`; `Wayin.make(record)` discriminates on `wayinkind` into
the two subclasses. `wayin.ts`'s `open`, `openWithPassphrase`, `openWithPasskey`, `tryPassphrase`,
`tryUnwrap`, `summarize` become methods; `sealPassphrase`, `sealFirstPassphrase`, `sealPasskey`
become statics for now (the Contract notes `proof.wayin(...)` may replace them later; do not build
that). `vault.wayins` is `Wayin[]`; `WayinSummary` stays the snapshot's shape. Refusals as the
section lists them; `absent_wayin` stays the vault's.

*Touches:* `wayin.ts` (becomes the classes), `vault.ts` (the proofs and passkeys section, the
unlock body's call into `Wayin.open`), `types.ts`, `tests/wayin.test.ts`,
`tests/vault/vault-wayins.test.ts`. *Depends on:* phase A's tip. *Look-ahead:* B2 takes the
`VaultKeyPair` from `tryOpen`; B4 builds `putWayin` on the statics. *Size:* large.
*Model:* `opus`. *Review:* `high`: the secret never leaves `Proof`, derivation straight into a non-extractable key, every wrap and unwrap under `wayinCtx`.

### B2. `lease` -- `Lease.grant`, `lease.tryOpen`, `endsWithin`

The Contract's *Lease* section. Fields first-class; `Lease.grant(vault, vaultKeyPair,
askPassphraseAt)` generates the non-extractable `lease_key`, wraps, drops
the extractable handle and returns the lease; the vault computes `askPassphraseAt` and writes the
record through `deviceDB.putLease` (*Where each method lives*); `tryOpen(vault)` checks scope, `vault_id`, `unlock_epoch` and
the clock, then unwraps; `endsWithin(millis)` serves `ensureLease`'s `renewWithin`. The vault's
`grantLease`, the lease take-up in `hello()` and the lease-end timer call these and keep only when
to ask. `DeviceDB.getLease`/`putLease`/`delLease` take and return records and `Outcome`s (the
device battery, `tests/test-helpers/device-db-conformance.ts`, follows).

*Touches:* `types.ts` (`Lease` schema stays), a new `lease.ts`, `vault.ts` (the lease section),
`device-db.ts`, `idb.ts`, `tests/vault/vault-lease.test.ts`, `tests/device-db.test.ts`. *Depends
on:* B1. *Look-ahead:* the policy session's scenarios 1, 2, 5 and 6 are about this class; C5's
`lock()` deletes through it. *Size:* medium.
*Model:* `opus`. *Review:* `high`: `lease_key` non-extractable, the extractable handle dropped, `leaseCtx` complete, the write on the vault not the class.

### B3. `box` -- `Box.seal`, `box.tryOpen`, `summary`, `DamagedBox`

The Contract's *Box* section. Fields first-class (the stored record's, `sidecar` as the parsed
value with `sidecar_json` on the record); `Box.seal(boxlabel, whisper, vaultKey, vault, { sidecar,
over })` is today's sealing from `storeBox`'s body with the fresh `boxKey` and `boxCtx`;
`tryOpen(vaultKey)` is `decipherLockbox` with `recordOpens` as its boolean form; `summary` is
what `vault.boxes` lists. `box.ts`'s free functions become statics and methods. The vault keeps
`decipherOrCatchUp` and the listing. `vault.openBox(box)` lands here as a thin method over
`box.tryOpen` with the key in hand (`vault_locked` otherwise); `readBox`/`getBox` still return the
whisper until C4.

*Touches:* `box.ts` (becomes the class), `vault.ts` (the reading and sealing sections),
`tests/box.test.ts`, `tests/vault/vault-boxes.test.ts`. *Depends on:* phase A's tip; runs beside
B1. *Look-ahead:* C1 and C2 put `Box` records through `putBox(expect, box)`; C4 makes `getBox`
return a `Box`. *Size:* large.
*Model:* `opus`. *Review:* `high`: fresh `boxKey` per seal, `boxCtx` complete and rebuilt never stored, nothing partial handed back.

### B4. `put-wayin` -- `putWayin`, `delWayin`, the one-passphrase policy

The Contract's *Wayin* policy and the brief: `putWayin(proof, newProof, { wayinlabel })` replaces
the passphrase (a passphrase `newProof`) or adds the passkey (a passkey `newProof`, refused
`too_many_wayins` when one stands); `delWayin(proof, wayinId)` deletes the passkey only, refuses
`last_wayin` for the passphrase; both take the standing passphrase's proof through the same path
as `attempt`, move `unlock_epoch`, re-grant this device's lease, and refuse as the Contract's
*attempt* groups plus `weak_passphrase`. `addPassphrase`, `changePassphrase`, `addPasskey` and the
`wayinId` disambiguation go. The thread writes the two calls' full nesting into the Contract
(signature, Does, Guarantees, Returns, Refuses) as an *Open Matters* row before building, and
builds to it once the Coach flips the row or, in YOLO, to the brief as written. `safebyok-react`'s
change-passphrase and add-passkey wiring follow; `MaxUnlocks` becomes the policy's two.

*Touches:* `vault.ts` (the ways-in section), `wayin.ts`, `types.ts` (`wayinList` bounds), react,
`tests/vault/vault-wayins.test.ts`, TODO.md (the multiple-passphrases section closes). *Depends
on:* B2. *Look-ahead:* D3's README writes the policy for the customer. *Size:* medium.
*Model:* `opus`, since it writes its Contract section first. *Review:* `medium`.

### B5. `placement` -- improve the guesses before the Coach's coin flips

A reviewing thread, not a building one: an `opus` worker at `high` reads the four model classes
and what is left of `vault.ts` against *Where each method lives: first guesses*, and against the
code in general (the ground rules, STYLE.md, the Contract's class blocks). Its job is to improve
the guesses, not to rule: for each row it writes, from the code as built, the arguments for each
end (whose fields the method reads and writes, where its crypto is, what its name reads like from
the caller's side, what a test of it needs), says which way the code now leans and how strongly,
and moves code only where the arguments all point one way; everything else becomes an *Open
Matters* row, one per method, for the Coach to flip. It also reports whether `ensureLease` came
out as sequencing only, whether every model reaches the clock, the logger and the key deriver
through `vault`, and whether any secret is reachable from a field other than
`PassphraseProof.passphrase` and `PasskeyProof.prfBytes`. Its thread file is the table, re-done.

*Touches:* the model classes and `vault.ts`, lightly. *Depends on:* B4. *Look-ahead:* pass 3 at the
end of phase D repeats the placement check over phase C's calls. *Size:* small to medium.
*Model:* `opus`. *Review:* `low`: it is the review; a second reviewer only confirms that any
move it made kept the tests green and the count unchanged.

**Phase B closes with** opus-high passes 1 and 2, run as phase C's first thread cuts.

**For the Coach, phase B:** nothing open. `WayinSummary` survives as the snapshot's plain shape.

---

## Phase C: `calls`

Each call rewritten to its Contract section, bottom-up: the store verb returns the real `Outcome`
with its `meta`, every adapter does the atomic conditional write and reports what stands, the
battery proves it, then the vault verb becomes a state update and a pass-through, its A4 wrapper
removed. C1 first; C2 on C1; C3 on C2; C4 beside C3 from C2's tip; C5 and C6 on the top of the
line, C5 first.

### C1. `putbox-store` -- `VaultDB.putBox(expect, box, { signal })`

The Contract's *VaultDB.putBox* section, in the base and in every adapter: `expect = { vault_id,
vault_key_epoch, revision_tok: string | null }`; one atomic conditional write (Postgres: one
statement with a `WHERE` on the three and `RETURNING`, or one transaction that re-reads; Convex:
one mutation; GraphQL: one resolver over the host's store, documented as the host's duty;
IndexedDB and local: one transaction); what stands reported in the same transaction as
`meta.box_stored`; `vault_mismatch` with `meta.vault_props_stored`; `invalid_box` from the base;
`box_too_large`/`vault_full` with `meta.capacity`; `signal` honoured, an abort reported as
`storage_unavailable`. The battery gains the race cases from `tests/test-helpers/racing.ts`
against each adapter (Postgres in the container). `BoxExpectation` and the `outcome:` field style
go.

*Touches:* `vault-db.ts`, all five VaultDBs, the battery, `VAULTDB.md`. *Depends on:* phase B's
tip. *Look-ahead:* C3 gives `delBox` the same `expect` and a tombstone to report; C7 generalises the
pattern to the vault-props verbs. *Size:* large; adapter budgets move.
*Model:* `opus`. *Review:* `high`: one statement or transaction per adapter, what stands reported in the same transaction, the battery's races green.

### C2. `putbox-vault` -- `vault.putBox` to its section

The Contract's *vault.putBox*: synchronous validation first; `ensureLease()` as the one look;
the standing revision from `vault.boxes` or `over`; `Box.seal`; one `vaultDB.putBox`; the listing
updated from what came back; nothing refuses after the write landed. `stale_write` passed through
with `meta.box_stored`; `vault_mismatch` relocks and becomes `vault_locked` with
`meta.vault_props_stored`; `invalid_box` becomes `bad_record`; `damaged_box` for a standing box
naming no revision. `refuseStaleStoreBox`, `refreshOnStale` and the second read go. The body
returns `Outcome`s natively; the A4 wrapper for this pair is removed.

*Touches:* `vault.ts`, `tests/vault/vault-boxes.test.ts`, `vault-races.test.ts`. *Depends on:* C1.
*Look-ahead:* D1's batteries loop the overwrite and merge over this. *Size:* medium.
*Model:* default. *Review:* `medium`.

### C3. `delbox-tombstones` -- `delBox` on both layers, and the tombstone

The tombstone's shape is in the Contract (*Box*, *The tombstone*): `{ format:
'safebyok-tombstone-v1', boxlabel, revision_tok, vault_key_epoch, deleted_at }`, in the same table
as the boxes, its `revision_tok` fresh from the delete, no ciphertext, no sidecar; `listBoxes`
returns it, `vault.boxes` hides it, the vault keeps it for expectations; not counted in capacity;
lives until the vault is deleted. Why the same table: the conditional write stays one compare in
one statement on every backend, where a second table would need two reads in one transaction,
which a key-value or REST backend cannot promise. Why a fresh revision: a tombstone carrying the box's last revision would match a stale put and
resurrect the box (the Coach considered recycling it so repeated deletes stay quiet, and withdrew
it, 2026-10-19). Repeated deletes stay quiet anyway: a `delBox` that finds a tombstone already
under the label is ok with nothing to do, which costs the store nothing, since it refuses
`stale_write` with the tombstone standing and the vault reads that as done. Postgres: the ciphertext
columns become nullable with a `CHECK` tying null to the tombstone format; Convex: a union in the
schema; GraphQL: a `SafebyokTombstone` member in the listing's union. `VaultDB.delBox(expect)` is one atomic conditional write that replaces the box
with its tombstone and reports what stands; `vault.delBox(boxlabel, { over? })` mirrors `putBox`.
`delIfIncoherent` is folded into `delBox`'s damaged case or dropped; the thread decides and says
why. `BoxDelExpectation`, `BoxDeletion` and `deleted_other` go.

*Touches:* `vault-db.ts`, all adapters (a tombstone row or document), the battery, `vault.ts`,
`tests/vault/vault-boxes.test.ts`, the GraphQL schema. *Depends on:* C2. *Look-ahead:* C6's
listing subscription carries tombstones. *Size:* large.
*Model:* `opus`, since it writes the tombstone's shape first. *Review:* `high`.

### C4. `getbox` -- `getBox` returns a `Box`, `openBox`, `getWhisper`

`getBox(boxlabel): Outcome<Box>` reads the record and hands back the instance, no decipher;
`openBox(box): Outcome<Whisper>` deciphers with the key in hand, one refresh on a box that will
not open (today's `decipherOrCatchUp`), then `damaged_box` or `vault_locked`; `getWhisper` is the
throwing sugar. The thread writes `getBox` and `openBox`'s full nesting into the Contract first.
`readBoxOrThrow`, `readBoxOrDamaged` and `checkStandingBoxlabel` fold into these. react's
`WhisperField` and any `useBox`-style hook read through `getWhisper`.

*Touches:* `vault.ts`, react, `tests/vault/vault-boxes.test.ts`. *Depends on:* C2; runs beside C3.
*Look-ahead:* D1's merge path is `openBox(err.meta.box_stored)`. *Size:* medium.
*Model:* default. *Review:* `medium`.

### C5. `lock-close-del` -- `lock()`, `close()`, `del()` to a written section

The Contract carries a first guess for the three (*vault.lock(), vault.close(), vault.del(): a
first guess*). **The Coach to the orchestrator (2026-10-19):** by the time put and get and
everything it took to get there have landed, an agent then will do a better job of writing this
spec than we can now. So this thread treats the Contract's section as a starting guess, rewrites
it from the code as built (Does, Guarantees, Returns, Refuses; `del()` through
`VaultDB.delVault(expect)` with `vault_mismatch` when the vault was made anew, and the mark and
lease deleted; `lock()` deleting the lease and dropping the key; `close()` ending the watch and
the handle), files the rewrite as an *Open Matters* row, builds to it under YOLO, and leaves lock
timing exactly as the TODO says: last writer wins, no test pinning it. `retire`'s edge
cases in TODO.md are answered or re-filed under `del()`.

*Touches:* `vault.ts`, `vault-db.ts` (`delVault`, `delDamagedVault` returning `Outcome`s with
`meta`), adapters, `tests/vault/vault-del.test.ts`, TODO.md. *Depends on:* C3 and C4's line.
*Look-ahead:* the policy session rules on what these do mid-flight. *Size:* medium.
*Model:* `opus`, since it writes three Contract sections first. *Review:* `medium`.

### C6. `subscriptions` -- the per-box subscription and the bell

Ruled (the Coach, 2026-10-19): the vault's one `subscribe` carries props, capacity, the ways in
and the listing together, and splitting it into three is a TODO entry this thread writes; what this
thread builds is the one per-box subscription, `subscribeBox(boxlabel, listener)`, fed by its own
`getBox` when the listing says the label's revision moved, and react's `useBox(boxlabel)` over it
and `getWhisper`. The change bell stays the one source; its `onChange` becomes a
`hello({ staleMinutes: 0 })`.

*Touches:* `vault.ts`, `change-bell.ts`, react hooks, `tests/vault/vault-storage.test.ts`.
*Depends on:* C5. *Look-ahead:* D4's demo renders from these. *Size:* medium.
*Model:* default. *Review:* `medium`.

### C7. `vault-props-verbs` -- `getVaultProps`, `ensureVaultProps`, `putVaultProps` to the pattern

The remaining VaultDB verbs get the same treatment as `putBox`: `expect` for `putVaultProps`
(`unlock_epoch` as its revision), what stands reported on a loss, `ensureVaultProps` atomic so two
devices creating at once get one vault and the loser sees `created_elsewhere` from it; the vault's
`created_elsewhere` path and the wayin-change path use them natively. Any A1 shim left in the vault
goes here.

*Touches:* `vault-db.ts`, adapters, the battery, `vault.ts`. *Depends on:* C1; can run beside C2
once C1 files. *Size:* medium.
*Model:* default. *Review:* `medium`.

**Phase C closes with** opus-high passes 1, 2 and 5, run as phase D's first threads cut.

**For the Coach, phase C:** the three call sections (C5) as *Open Matters* rows when the thread
rewrites them from the code; and whether `delIfIncoherent` survives (C3 proposes).

---

## The policy session: lock timing vs work in flight

Not a phase, and not on the runner's path. The Coach and an agent, over TODO.md's seven scenarios and
`softlock_gone-removed-tests.md` in `whiteboard/20261019-softlock_gone/` (or `winboard/` once closed), decide for each what the vault
promises: a lock means now, or in-flight work finishes. The output is a Contract section
(*Locks and work in flight*, under `lock()`), the tests written to it, and then one thread that
makes them pass, cut from wherever the line stands when the Coach is done. Its one constraint from this plan: no counters and no second lock kind; if the
policy needs a mechanism, it is `lockLanded` and the key being gone, nothing else.

---

## Phase D: `batteries`

What the customer meets. D1 and D3 run together from phase C's tip; D2 on D1; D4 on D2; D5 last.

### D1. `batteries-core` -- retry, timeouts, the bounded overwrite and merge, the default handler

The batteries live in the `safebyok/browser` entry point of the core (the Coach, 2026-10-19: even if
it gets heavy, it stays in core for now; a `safebyok-presets` split is for later, as fastkey's was): `withRetry(vault)` or
per-call wrappers that retry `storage_unavailable` with backoff and never retry `misuse` or
`vault_locked`; a default `AbortSignal.timeout()` for every store call; `putBox` looping the
`stale_write` overwrite a bounded number of times, with an optional `merge(mine, theirs)` over
`openBox(err.meta.box_stored)`; a default `onBadNews` that logs through the host's logger and, for
`damaged_box`, deletes the box (the *Thunks* default, ruled). Retry and backoff over `p-retry` as an optional peer
dependency, ruled by the Coach (2026-10-19): batteries encode one opinion in simple code, and
`cockatiel` buys the right to be picky that a batteries persona does not need.

*Touches:* a new entry point, `tsdown.config.ts`, `index.ts`, `.size-limit.json`, tests. *Depends
on:* phase C's tip. *Look-ahead:* D2 wraps these for TanStack. *Size:* medium.
*Model:* default. *Review:* `medium`.

### D2. `batteries-react` -- the TanStack adapter and the shipped `getProof`

Mutation and query options for TanStack Query over the `try` forms, with the retry predicate on
`family` and `refusalkind` (never `misuse` or `vault_locked`; `storage_unavailable` yes); the react
`getProof` (A6's modal) as the default when `VaultProvider` is given none; a `useBox(boxlabel)`
hook over the subscription and `getWhisper`. TanStack as an optional peer, in an entry point of
`safebyok-react` (`safebyok-react/tanstack`) so an app without it installs nothing; the Coach ruled
batteries stay in the core packages, and this follows that.

*Touches:* `safebyok-react`, possibly a new package. *Depends on:* D1. *Size:* medium.
*Model:* default. *Review:* `medium`.

### D3. `customer-docs` -- README, VOCABULARY, VAULTDB.md and every doc block from the Contract

The Contract's first two sections (*How your secrets are kept safe*, *What we ask of you, and what
we promise*) become the README's, in the README's voice; VOCABULARY says box, `Outcome`,
`refusalkind`, `meta`, the trio, `ensure`, the policy, and drops every retired word to
`notes/old_vocabulary.md`; VAULTDB.md is the adapter writer's contract (*What an adapter must
do*, the verbs, the battery); every doc block in `src/` is read against its Contract line and
rewritten where it tells history or promises less or more than the code. `notes/security.md`
gains one entry per decision the reform made, through the subagent. No code.

*Touches:* docs only. *Depends on:* phase C's tip; runs beside D1. *Size:* large, prose.
*Model:* `opus`, for the prose. *Review:* `none`: pass 4 is its review.

### D4. `demo-and-e2e` -- the react demo and the adapter-by-framework checks on the new surface

The demo uses `VaultProvider` with `getProof`, `onBadNews`, the hooks and `getWhisper`; its store
table reads the listing subscription; e2e's pairings run green against each adapter.

*Touches:* `demos/`, `e2e/`. *Depends on:* D2. *Size:* medium.
*Model:* `sonnet`. *Review:* `low`: the demo and e2e run green.

### D5. `sweep` -- vestiges, budgets, TODO and NOTYET, changesets

Pass 3's checklist as a thread: old names, dead code, shims, history in comments, `ensure`
checks; `pnpm size:budget --write` lowering every line to the rule; TODO.md and NOTYET.md updated
for what the reform settled; the changesets of the four phases read together so the release note
tells one story; `winboard/` moves for the closed folders.

*Touches:* everything, lightly. *Depends on:* D4. *Size:* medium.
*Model:* `sonnet`. *Review:* `low`: the vestige greps find nothing.

**Phase D closes with** opus-high passes 1 to 5, the last review of the reform.

**For the Coach, phase D:** nothing open.

---

## What this plan does not decide

* The lock-timing policy (the session's).
* Pantry as a name, or any rename of `DeviceDB`.
* Rotation, `ShelfVaultDB`, the format snapshot test, the test container, identity apart from the
  backing database: TODO.md's side quests and soonish shelf, untouched.
