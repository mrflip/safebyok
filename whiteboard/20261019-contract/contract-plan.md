# 2026-10-19: contract -- the sprint plan

**No back-compat layer, no migrations, no catering to vestigial names or methods.** This is
pre-pre-alpha: a placeholder npm publish and nothing else. An old stored record fails safe (reads
as absent or damaged) and the changeset says so. Every phase and every thread below opens with
this line.

* **Date:** 2026-10-19. **Issued by:** the Coach (flip), `/sprint contract`, with the preplan
  [`20261019-contract-preplan.md`](20261019-contract-preplan.md) beside this file.
* **Mode:** YOLO. **Review:** `medium` unless a thread names its own level (the preplan's
  `*Review:*` lines win over this header). **At once:** 3.
* **The spec:** the design doc's **Contract** tab,
  https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70 (tab id `7474ec29-37d9`).
  A markdown export of rev 2025 (after the first batch of rulings) sits at
  `/tmp/claude-1000/-workspace-byok/23ac0f81-dcca-476b-9702-e252de19ef92/scratchpad/contract/contract.md`
  (56 kB; `grep -n '^#'` is its outline). The handoff says when a ruling has changed it since.
* **Sprint doc:** https://claude.ai/artifact/7h4ZNsYfYYD6aS81htMwgB
  (*Open Matters*, *Resolved*, *Progress*).
* **Status:** **paused for the weekend** (2026-10-21). The line is main → #213 (C1) → #212 (`b_fixes`) → #214 (`b_simplify`) → #215 (`wayin_rules`) → #216 (`checker`) → #217 (`store_rulings`) → #218 (`checker2`) → #192 (this sprint PR, out of draft). At the restart: `props_bag`, `wayin_api` (once its verbs row is ruled), `lean_core`, phase C, a pause before D1, phase D. `human/20261021-sprint_contract_paused.md` and the sprint doc's *For Restart Sprint* tab say where things stand.

## How this plan relates to the preplan

The preplan is the Coach's issue, written by Fable with the Coach. **Each thread's text is its
section of the preplan, verbatim**: the handoff quotes it whole. This plan does not copy it; it
adds the orchestrator's gloss per thread (base, model, review, look-ahead changes) and records
what the threads teach. Where this plan and the preplan disagree, this plan is newer.

The preplan's *Rulings these rest on*, *Ground rules for every thread*, *Where each method lives:
first guesses* and *Note to the orchestrator* hold for every thread and are not repeated here.

## Read first (every worker)

* The preplan: *Rulings these rest on*, *Ground rules for every thread*, and the worker's own
  thread section; *Where each method lives* for phase B and the `ensureLease` work.
* The Contract tab: the sections the thread builds, and *Shapes* and *Refusals*. Read the
  scratchpad export with `grep -n` and read only the lines needed; never `read` the doc itself.
* STYLE.md *Naming* (and its new *ensure* paragraph once thread 0 lands), *Validation*, *Tests*.
* PROCESS.md *Threads* and the changeset section, before the first commit.
* `progress.md` beside this file, looked up for the threads the handoff names.

## Ground rules particular to this sprint

* *Orchestrator:* **The core is hello → unlock → op** (the Coach, 2026-10-19): `hello` earns a vault state, `unlock` earns a lease, an op carries out something that will almost always succeed. Retries, backoffs, refreshes, re-reads on a miss, read-through caching and "if X then try something else" fallbacks belong to an outer layer driving the core, not in it. "This is not a real-time database. The customer has a choice of what drift they're willing to accept." A thread that finds itself adding one stops and raises it.
* *Orchestrator:* **Specific refusals** (the Coach, 2026-10-19): "All workers should write the code to issue specific, readable, actionable refusals. If an existing one isn't a good match, they may make new ones. In all cases, add them to the contract" (the thread file's drift section; the orchestrator carries it). What a host might throw gets a prescribed kind; the rest is `unexpected_error`.
* *Orchestrator:* **Simple control flow first** (the Coach, 2026-10-19): "prioritize simple, analyzable control flow over UX niceties until the control flow is mature ... We must not allow complicated interactions in the critical path. If that leads to a horrible user experience, we'll use that as evidence for a flawed design, outside the scope of current work; until then the code is safe and users will have to deal." A UX fix that reorders or couples steps of a call becomes a D5 TODO; showing the refusal a call already got is fine.
* *Orchestrator:* **Refusal and log wording** (the Coach, 2026-10-19): "Generate refusal and logging statements that are safe, specific, actionable, empathetic to the customer (failures) or the user (conditions)". Both rules go into STYLE.md (`a_sec2`).
* *Orchestrator:* the Coach's grant extends to CLAUDE.md, STYLE.md and the like: "you may edit claude.md, Style, etc for the purposes of keeping its content aligned with the codebase changes".

* The Coach (2026-10-19, at the invocation): "think flexibly, especially for this sprint as we are
  changing so many things." Where the preplan reads wrong against the code as built, say so in the
  thread file and the report, propose the better course, and take it if it is a two-way door.
* The Coach's grant: workers and their agents may edit `STYLE.md`, `VOCABULARY.md` and
  `notes/security.md` **to rename items and correct contracts**. `notes/security.md` still goes
  through a `sonnet` subagent (its header says how); a rename there may be scripted with the rest.
* Contract drift goes to the thread file and the report's *Open matters*; the orchestrator files
  the row and carries rulings into the Contract tab. Workers do not edit the design doc.
* Phase boundaries are not pauses: phase B cuts from A's restacked tip as soon as A6 files.
* **Live-backend e2e** (the Coach, 2026-10-19): "If they are passing in ci that's good enough for
  now. Don't wait on the ci run, but if you see a calamity look into it on a later thread." No
  thread waits on CI; a CI failure on a pushed branch becomes a small thread of its own.

## Threads

Bases follow the sprint skill: from `origin/main`, or from the filed tip of the one thread a thread
stands on, or from the top of a restacked line where it stands on two.

### 0. `rename_pass` -- stage 0, run by the sprint

*Text:* the preplan's *Stage 0*, and the whole of `whiteboard/20261019-rename_pass/rename_pass-plan.md`
(the Coach's staged version, carried into the thread's branch).
*Gloss (Orchestrator):* the preplan has the Coach run this as a session before the sprint cuts.
When the sprint was called it had not landed (`main` still has `src/lockbox.ts`), and no session
was running it, so the sprint runs it first, alone, on a quiet tree: nothing else is cut until it
files. It also carries the Coach's staged *ensure* paragraph for STYLE.md, which the rename's
`check` verbs rest on. Base: `origin/main`. Model: default. Review: `none` (the preplan: greps and
counts); the orchestrator checks the acceptance greps, the per-package test counts and that
`pnpm justify` ran. Size: large, mechanical; the `everything` and `Vault` lines may move a little.
Filed as an *Open Matters* row so the Coach can close the PR and run it by hand instead.

### Phase A: `shapes`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| A1 | `outcome` | 0 | opus | medium | `Outcome`, `VaultError.family`/`meta`, every VaultDB verb returns an `Outcome`; vault unwraps (interim shim, named). `everything` and `Vault` budgets move. |
| A1b | `outcome-adapters` | A1 | default | medium + battery per adapter | Postgres needs the container; if Docker is unavailable, say so and run what can run. Notes how each backend does C1's one-statement write. |
| A2 | `vault-class` | A1 | opus | low (preplan's checklist) | Runs beside A1b. Pure move; per-file test count unchanged; banners kept as B's seams. |
| A3 | `fields-and-make` | A2 | opus | medium | `make` inert, first `hello()` reads, `settle()`, `onBadNews`, `staleMinutes`. |
| A4 | `try-twins` | A3 | default (was sonnet: it now carries five small decisions) | low (preplan's checklist) | Every public call as `tryX`/`X`; thread file lists the pairs and which bodies still throw. *Orchestrator:* A3's `#tellingBadNews` wrapper is the seam to build the pairs on. Also: export `valOf` (or its successor) and drop the demo's `answered` shim; decide what `outcomeOf` does with a bug at the VaultDB base and the vault's boundary; a runtime guard refusing an Outcome-shaped record from a `do*` hook; `subscribe`'s synchronous throws; `hello` ignoring a non-options first argument (bare event handler). Each pending its Open Matters row. |
| A5 | `react-over-class` | A4 | default | medium + StrictMode | Provider makes the vault from props and owns the first `hello()`. *Orchestrator:* StrictMode still opens two vaults in development, each reading once (A3 review): defer the provider's first hello past StrictMode's cleanup. Hold `onBadNews` in a ref so an inline handler does not remake the vault each render. `openError` now comes from the provider's own hello (`helloRefusal`), since `trouble` is bad news only. |
| A6 | `getproof` | A5 | opus | high | `ensureLease`, `Ask` class, `attempt`, `lockLanded`; react modal as `getProof`. |

*Orchestrator:* A1b does not hold up A3 to A6; it joins the line at the restack before phase B.

*Review (A1, #194, `fixed`):* six test spies still rejecting from `getVaultProps` now resolve
`bad(...)`; doc blocks rewrapped; `VaultDB`'s doc block tells a wrapping `do*` to unwrap. Test
counts did not fall (the worker reported passed-only). Left: the demo's
`VaultDashboard.test.tsx:55,89` mocks still reject (to A1b); `expectBad`'s unreported `!`;
`outcomeOf` in the base maps a bug to `storage_unavailable` (an Open Matters row, A4);
`RefusalMeta` fields unfilled until C1; unused `settledKind` in e2e; the battery's "never a
rejection" covers only the base's refusals. Live-backend e2e (96) not run: A1b's reviewer runs them.

*Review (A1b, #195, `clean`):* battery green over PGlite, Convex's fake deployment and GraphQL with
PGlite; e2e Postgres (88) not run, no Docker. Side doors checked: driver `cause` stays server-side.
Left (minor): in-process GraphQL `cause` chain reaches the driver error (Open Matters row); a lost
GRANT reads `not_permitted` (row); VAULTDB.md 5.6's RLS wording broader than the behaviour; the
`not_permitted` wording restated in two adapters; new error strings use `'` like their neighbours.

*Review (A2, #196, `fixed`):* the vault read `this.leaseMillis` and called `this.hello()` internally,
both writable by a host on the handle; now `#leaseMillis` and `#hello()`. Regression test carried
into A3.

*Review (A3, #197, `flagged`):* fixed a recursion over an adapter that rings as it is subscribed
to, an alignment, and the make_hello entry in `notes/security.md` (in place, under the Coach's
grant). **Flagged:** a stale `hello()` re-running `#fetchLease` can undo a `lock()` landing during
the lease read. YOLO: the worker is resumed to make any key change cancel a take-up in flight (no
counter); a second review covers only the new commits. Minors: `trouble` sticks while a damaged
box stands; bare `vault.hello` as an event handler (to A4); handler told before the snapshot moves
and thenables unhandled (to the rework, if small); shallow freeze of `sidecar`; StrictMode's two
vaults (to A5); capacity reckoned twice. *Second review (rework only, `fixed`):* the abort holds on every
path; `#grantLease` now stands the take-up down before writing its lease (else a take-up could
discard the fresh one); `notes/security.md` corrected in place in two entries. Left: a lease delete
already sent is not called back on an unordered device store (fails safe; to the policy session);
inside `onBadNews`, `vault.trouble` is one step behind. One `unicorn/no-thenable` suppression in a
test, judged right.

*Review (A4, #198, `fixed`, at medium):* the wrapped-answer guard now proven for `delVault` too.
Left: another copy's VaultError kept only half the way (to `a-fixes`); `hello`'s handler example
should use `tryHello` (to `a-fixes`); `asHelloOpts` ignores any non-plain object; a stored record
shaped like an Outcome reads `bad_option` not damaged; `delDamagedVault` has no `try` form (C5).

*Review (A5, #199, `fixed`):* the ref-held `onBadNews` teller was shared by every vault the
provider made, so an old user's late read could tell the next user's handler: now a gate per vault,
closed in cleanup. Tests added for `<Activity>` and `WithUnlockedVault`'s example. Left: no server
snapshot for `useVault()` (as at base); the deferred first hello assumes StrictMode's rehearsal is
one task; the security note line (to `a-fixes`); `vault-provider.test.tsx` ~1,597 lines (A6 splits).

*Review (A6, #200, `fixed`, at high, opus):* every Does/Guarantees/Refuses line of *ensureLease* and
*getProof* has a test. Fixed: a hello's take-up could take up an overtaken attempt's lease before
it was erased (now stood down first); a `close()` during a data call's hello still raised an ask;
a `VaultError` thrown by `getProof` reached waiters with its own kind (now `unexpected_error`);
doc blocks pointed hosts at the Contract. Left: start over loses a failed delete (row); Cancel on
`lease_ending` declines (row); the gesture is checked after the hello (row, policy session);
check-before-prompt, the boundary's `cause`, `DialogTrouble` (to `a-fixes`); a stood-down attempt
may still create the vault; a synchronous `lock()` inside `getProof` is missed (host misuse);
`Ask.raise` public (row, B5).

**`a_sec`** (*Orchestrator:* added after phase A's pass 2): phase A's security fix-up, cut from
19c0cc87 beside B1 and B3, opus, review `high`. F1 (a lock after Cancel misses the ask's attempt),
F2 (a take-up in flight survives a revocation elsewhere), F3 (React gates close late), F4 (a
`passphraseAdvice` throw unstripped), plus the queued boundary-`cause`, `DialogTrouble` and two
security-note lines (moved here from `a-fixes`). Restacked on top of B1 when B1 files; B2 cuts
from it.

**Closing phase A:** passes 1 and 2 (opus, `high`, worktree-isolated agents, one lens each) over
`origin/main...<A's tip>` while B1 and B3 build; findings filed as a comment on the sprint PR and
fixed in a small thread `a-fixes` (on B's line, after B4), with the `a-shims` grep folded in.
*Orchestrator:* `a-fixes` already holds, from A4's review: one shared `isVaultError` that knows a
refusal from another copy of safebyok, used at every `instanceof` site (`asStorageTrouble`,
`#hearBadNews`, `RefusalPolicy`, react's `isVaultCondition`), and the changeset and
`notes/security.md` narrowed to match; `hello`'s handler example as `vault.tryHello`; the A4
thread file's "Throwing alone" list gains `delDamagedVault` (its `try` form is phase C's, C5). From A5's review: one sentence in
`notes/security.md`'s A5 entry, through the sonnet subagent: a vault the provider has let go
tells no handler.
*Orchestrator:* from the Coach's rulings (2026-10-19), `a-fixes` also: rename `isVaultCondition`
to `isCondition` (core and react); `staleMinutes` defaults to **5**; reopen TODO.md's react
lifecycle / `set-state-in-effect` section ("Leave the todo, this is a big problem. Don't need a
fix, do need the caveat") and write the caveat for hosts in safebyok-react's README; TODO entries
"redact with batteries included opts" (a refusal's `cause` chain, in-process GraphQL) and "should
tryClose really be a promise"; a Postgres README sentence telling operators to check grants when
users see `not_permitted`. The `hello` example as `tryHello` waits on its row (explain).
*Orchestrator:* from A6's review (#200), `a-fixes` also: strip `cause` before the dialog rethrows
misuse to React's error boundary (a host key deriver's or strength test's throw may quote the
passphrase, and `onCaughtError` logs the chain); `getBox`/`useBox`/`delBox` check the label floor
and the box's existence before `#ensureLease` prompts; `DialogTrouble` follows the ask (lift
`useAnswerOnce` above the boundary so `lockLanded` closes it); a `notes/security.md` line on the
A6 `lockLanded` entry: an overtaken attempt stands down any lease take-up as it erases its lease.
*Orchestrator:* the Coach's second batch (2026-10-19) adds to `a-fixes`: rename `ensureLease`'s
`renewWithin` to **`renewMinutes`** ("Use the unit it is dangerous to get wrong"); TODO entries
"a throwing `getProof` is always `unexpected_error`: allow more specificity" and "changing scope
requires a new vault from scratch: `vault_id`, `applabel`, `user_id`, `vaultlabel` are
immutable" (a Coach note).
*Orchestrator:* from phase A's pass 1 (conformance; comment on #192), `a-fixes` also: an
`ensureLease` row in `vault-twins.test.ts`'s `TwinCases`; the scope-fields immutability test loops
over `Object.keys(vault.snapshot)`; `created_elsewhere` and `damaged_wayin` provoked through
`ask.attempt` in `vault-lease.test.ts`; `Ask.attempt`'s doc block drops `passkey_unavailable`.

### Phase B: `models`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| B1 | `proof-wayin` | A's line (A1b restacked in) | opus | high | Adds `adorn`/`decorate` to `utils.ts` first. *Orchestrator:* settles the passkey proof's name (the Contract's `Ask.attempt` says `PasskeyAnswer`, the code `PasskeyProof`). Also: A3 left `props` unbuilt and `damaged_wayin` news from a listing unbuilt (summaries flag no damaged wayin yet); both are B1's. |
| B3 | `box` | A's line | opus | high | Beside B1. |
| B2 | `lease` | B1 + `a_sec` restacked | opus | high | *Orchestrator:* stands on `a_sec`, whose F2 fix lives in the lease take-up B2 extracts. |
| `a_sec2` | `a_sec2` | B2 | opus | high | *Orchestrator:* the Coach's ruling (2026-10-19): close the create window `a_sec`'s second review left (a create racing a deletion elsewhere leaves this device unlocked on the deleted vault until its next read) in B2's lease shape; the stale-read rollback; `notes/security.md`'s host-throw sentence (condition only), through the sonnet subagent; fastkey's README lines 72-80 and changeset (`bad_option` is now `unexpected_error`). From the Coach's rulings (2026-10-19): remove `a_fixes`'s re-read on a listing miss (a locked vault refuses `absent_box` from the listing in hand: no refreshes in the core); a test pinning that a VaultError's mark stays out of `JSON.stringify` and `inspect`, and no `instanceof VaultError` left outside `isVaultError`; the security note's deriver `wrong_passphrase` wording (B1 replaces its message). `.vitest/` in `.gitignore` (ruled). Salts and wrapped keys out of the public snapshot and `vault.wayins` (ruled: summaries only); `Lease.grant` validates its input with Zod and lets it throw; a security note that the vault keeps no proof (untested); CLAUDE.md's stale `Wayin.open` example. Remove `a_fixes`'s cross-copy mark (ruled: "least amount of logic ... dealt with brutally"): `isVaultError` is `instanceof` plus the kind. A blocked IndexedDB mocked as a browser throws it. Rewrap `notes/security.md` line 623 (B2's amendment, one 219-character line) through the sonnet subagent. A TODO entry: cross-device invalidation comes from a proper mechanism, each device authenticating a token when it joins or creates a vault. |
| B4a | `slots` | `a_sec2` | opus | high | *Orchestrator:* the Coach ruled option A of `one_of_each-design.md` (2026-10-19; `ruling-one_of_each.md`, the Coach's words): the vault props carry `passphrase` (required) and `passkey` (or `null`) as plain records, format `safebyok-vault-v5` (`v4` joins `OlderVaultPropsFormats`; old vaults read damaged; no migration), in the existing vault table. B4a builds the shape and everything it reaches: types and schemas; every adapter (Convex validators, Postgres columns, GraphQL schema; IndexedDB and local storage hold JSON whole); the battery, conformance and helpers; `Wayin` opening collapsed to the slot `proof.kind` picks (`tryOpenAmong`, `openWithPassphrase`'s list walk, `skippedByOtherDeriver`, `listOf` go); way-in ids and labels, `wayinList`, the `distinct*` refines, `MaxUnlocks`, `last_wayin` and `too_many_wayins` removed; the snapshot's `wayins` becomes `passphrase` and `passkey` summaries; react's `askPasskey`/`offersPasskey` follow. The existing verbs shrink to what slots allow, no more: a passphrase change and a passkey add both prove with the standing passphrase (ruled: "provide old passphrase to get new passkey or new passphrase"); a second passkey replaces the first (YOLO on the Rec; the row stands); deleting the passkey takes no aim. B4 then gives them their Contract names. The Wayin names stay ("I don't today know yet ... whether it, or the passphrase/passkey deserve the name Wayin"). If slots on the vault prove not "tenably a minimal code path", stop and report: the Coach's second guess is two tables. Large. *Orchestrator:* also, from `a_sec2`'s second review: the react provider sticks at "Opening" after a later `rolled_back` (its `openError` reads only its own hello's refusal): `useOpenError` falls back to a `rolled_back` `snapshot.trouble` while `opening`, and `VaultState`'s doc for `opening` is updated (YOLO, a row). The changeset says what a host sees (every vault reads damaged). |
| B4 | `put-wayin` | B4a | opus | medium | Writes its Contract section to the thread file first; YOLO builds to the brief. *Orchestrator:* stands on B4a's slots: `putWayin(proof, newProof)` and `delWayin(proof)` over the two slots, with no ids, labels or room checks; the preplan's B4 list policy is superseded. From B4a: the three verbs funnel through `#reviseWayins(proof: PassphraseProof, { call, check?, revise })`, so the rename is mechanical; `addPasskey` returns a boolean until B4 gives it the Contract's return; confirm `mayBeNewer` by format alone against the Contract's refusal table. Through its sonnet subagent: `notes/security.md` ~1407 says a `lock()` during `addPasskey`'s prompt leaves the vault locked, where `#reviseWayins` grants the lease regardless; ~731's "today's `safebyok-vault-v3`" reads oddly beside the v5 note. *Orchestrator:* the Coach on merging the three sealing statics (`sealPassphrase`, `sealFirstPassphrase`, `sealPasskey`): "If it proves awkward, don't force the three into one ... line the three functions up together, and then make sure any loss of clarity in the combined function is small". *Orchestrator:* the Coach's ruling (2026-10-19): the strength checker's contract is "return a value saying good or bad"; any throw from it (or from react's `passphraseAdvice`) is an `unexpected_error` naming the function, carrying none of the thrown value's kind, meta or cause (today a thrown condition passes through). The option is `strengthChecker`, **optional**: its default refuses every passphrase as too weak and logs that the customer must choose one, pointing to a new CUSTOMIZATION.md (section and AI prompt: `ruling-strength-checker.md`, the Coach's words). *Orchestrator:* the Coach's ruling (2026-10-19, design brief question 1): "The standard default must be to provide old passphrase to get new passkey or new passphrase ... it's how it's done everywhere else, and we don't invent crypto": only the standing passphrase proves a new passphrase or a new passkey; a passkey proves neither. |
| B5 | `placement` | B4 (B3 already in the line) | opus | medium (*Orchestrator:* raised from low: it now builds refusals and surface changes) | *Orchestrator:* the preplan stacks B5 on B4 only, but B5 reads all four model classes, so B3 joins the line first. The Coach on the Wayin subclasses' public constructors (2026-10-19): "if it's not violent to make them non-public, do that. I also don't mind something as dumb as make sending a detatched `_was_made` flag. No eviscerating the functionality of access to the class." Likewise `Ask.raise` off the public surface, and `adorn`/`decorate` to an internal module. `adorn` is the Coach's triquet form, `adorn(obj, ckey, val)` (ruled: the preplan's two-argument form was a typo; it lets a getter say `return adorn(this, 'foo', val)`): restore it and its callers. A `Box` (or `Proof`) from another copy of safebyok is a misuse refusal naming the double load (the Coach: "anything revealing the existence of a second safebyok should crash the app"; a row asks about another copy's refusals). The Coach on `vault.hello` as a bare listener (2026-10-19): "If there's a way to detect that, we should": `hello`/`ensureLease` refuse an Event, and anything else that is not a plain bag, with a specific `bad_option` naming the fix ("wrap it: `() => vault.tryHello()`"), reversing A4's leniency; `optionsCheck`'s `Z.strictObject` already refuses extra fields. Rename `#makesStandDown` to say create (the vault's first write to storage), not make, which reads as `Vault.make`. |

*Orchestrator (line):* B's line is B1 → B3 → `a_fixes` → `a_sec` → B2 → `a_sec2` → B4a → B4 → B5.
`a_sec` is restacked onto #204 (ruled 2026-10-19), and B2 cuts from it.

*Review (B5, #209, `fixed`, medium, raised from low):* the `Wayin.seal` ctx move keeps the bytes (ctx-bytes tests pin them); the double-load check runs at every entry and never misreads a plain record; private constructors and `Ask[raiseAsk]` leave nothing public behind. Fixed: a second copy's Box is checked before its fields parse (a foreign Box that lined up with a record would have been accepted). Left (minor, to `b-fixes`): `hello`'s third example still shows `void vault.hello()` (make it `tryHello`); an unreported `getProof!` in react's dialog test.

*Review (B4, #208, `fixed`, high, raised from medium for the seal merge):* `Wayin.seal` seals exactly as the three statics did (same keying, same ctx bytes, no new construction); the extra unwrap's key is non-extractable and dropped at once; only the standing passphrase proves a change; the strength checker meets the ruling (no throw leaks; CUSTOMIZATION.md ships, last clause verbatim); `mayBeNewer` fits the Contract's table. Fixed: the blank-at-create kind in `errors.ts` and the README (`wrong_passphrase`), `UnchosenCheckerSaid`'s wording, two messages' quotes. Left (minor): a blank passphrase is two kinds (row); the unchosen default found by identity (row); a passkey's ctx built twice in `Wayin.seal` (B5); the demo orphans a passkey from an empty field (D4, UX); a weak passphrase masks `absent_vault` (Contract's order); a non-text stored format reads newer; stale Contract Refusals rows (carried with B4's drift); two `notes/security.md` wordings (b-fixes).

*Review (B4a, #207, `fixed`, high):* each wrap binds what it bound before minus the way-in id and label; a passkey's wrap cannot sit in the passphrase slot; only the standing passphrase proves a change; a replaced passkey refuses `wrong_passkey`; adapters keep a null only for `passkey`. Fixed: two refusal messages' quotes, `deriveWrappingKey`'s v4 example, a test's `wayinlabel` wording. Left (minor): `mayBeNewer` by format alone (row; B4 confirms); three shapes for the pair of ways in; react's second `useSyncExternalStore`; two stale `notes/security.md` passages (to B4).

*Review (`a_sec2`, #206, `flagged` twice, high, two reviews; filed on YOLO with the Coach's leave to defer a hole to a later B thread):* both races closed, each test failing without its fix; no salt or wrapped key reaches a host. First review fixed doc wording, `leaseCtxOf`'s doc, `Lease.grant`'s misuse tests, three stale security entries, `.gitignore`; flagged the restore recipe dead on an open handle (`isNewerCopy`) and `RefusalMeta.vault_props_stored`; reworked: a `rolled_back` lock forgets the props in hand, `vault_props_stored` removed, STYLE.md gains *Control flow and refusals*. Second review fixed a hello kept as greeted after a forget during it, and a `del()` that resolved ok over the standing older vault (it now refuses `rolled_back`); flagged the react provider stuck at "Opening" after a later `rolled_back` (to B4a). Left (minor): `onBadNews` repeats news after a forget; a custom adapter's `rolled_back` also forgets; a refresh coinciding with a forget skips `isNewerCopy` (held to the mark); a read begun before a create can stand it down (row); the failed-mark-write restore corner (class doc line). The orchestrator fixed after review, docs only: the security note's `box_stored` claim; STYLE.md's rule now says "add no".

*Review (B2, #205, `flagged` then `clean`, high, two reviews):* crypto held (`lease_key` non-extractable, the transient not kept, `leaseCtxOf` the same 8 parts, the write on the vault). Fixed: a take-up standing down during `Lease.make` still erased and warned (a check restored); `endsWithin` failed open on NaN; two doc recipes. Flagged: a host's own DeviceDB lost `storage_blocked`; reworked by exporting `deviceOutcomeOf` (ruled) with a blocked-store conformance case. Left (rows): `Lease.grant` validates nothing; device calls wrapped twice; `#discardLease` keys its warning on `vault_locked`; browser words in device-store messages; a real browser's refusing `indexedDB.open` untested (D4). `notes/security.md` line 623 wants rewrapping (`a_sec2`).

*Review (B3, #202, `flagged` then `fixed`, high, two reviews):* crypto moved unchanged. Flagged:
boxes read `vault_id`/`vault_key_epoch` off the lagging snapshot getters; reworked to take a
`holder` (B1's shape) from one source. Fixed along the way: `tryOpen` on an uncreated vault,
`vault.clock` frozen, the key checked before a stored box is made (a race refused `absent_vault`),
size checked before any crypto. Left: openBox on a foreign record tells bad news (row);
dual-package `instanceof` (row); private `#openBox` renamed at C4. *Restack onto B1:* the vault
now freezes every props record it takes up (`frozenVaultProps`), and boxes, ways in and the
snapshot share that one object (a2b45988, unreviewed: phase B's passes cover it).

*Review (B1, #201, `fixed`, high):* crypto moved unchanged; the vault reads `proof.passphrase` only
for a new passphrase's strength test. Fixed: `vault.wayins` typing; each way in's `holder` was the
vault's own unfrozen props (now the frozen snapshot props). Left: salts and wrapped keys in the
snapshot (row); Wayin subclasses public constructors (row, B5); a lingering damaged way in pins
`trouble`; two publishes per read; double parsing; examples without pointing tests.

*Orchestrator:* `a_sec`'s second review (comment on #203) left one significant window, the Coach's:
a create racing a deletion elsewhere can leave this device unlocked on the deleted vault until its
next read. Proposed: file `a_sec` as it stands and open `a_sec2` (a stand-down for the create; the
stale-read rollback; the `notes/security.md` host-throw sentence, condition only; fastkey's README
lines 72-80 and the changeset). `a_fixes` was cut meanwhile from #202, the one independent thread.

*Review (`a_sec`, #203, `flagged` twice, then the Coach's ruling; a third, restack review `fixed`, high):* the restack onto #204 moved the deriver wrap into `passphraseKeyOf` (`src/proof.ts`); every fix held. Fixed: `wayinKeyFor`'s doc. Left, to `a_sec2` (rows): `wayin.ts`'s sealing doc; the security note's deriver paragraph; the boundary's bug message; `.vitest/` in `.gitignore`. Left as is (row): a lease written for new props goes unused until the next real read.

*Review (`a_fixes`, #204, `flagged` then `fixed`, medium, two reviews):* the cross-copy mark
(`Symbol.for('safebyok.VaultError')`) holds; flagged: a locked vault refused `absent_box` from a
stale listing; reworked to read once on a miss. Left: a stale hello plus a miss reads twice; a
`close()` during that read answers `absent_box`; a host's `instanceof` misses another copy.

**Closing phase B:** passes 1 and 2 again, as C1 builds; fixes in `b-fixes`.
*Orchestrator (2026-10-20):* phase B filed in one line, #201 → #202 → #204 → #203 → #205 → #206 → #207 → #208 → #209 (47ab50be). Passes 1 and 2 ran over `19c0cc87...47ab50be` beside C1; findings on #192.
*Pass 1 (conformance):* 121 lines; 10 untested (2 significant: the proof-reference line, ruled untested; and D1), 18 refusals provoked only elsewhere (putWayin, delWayin), 10 drifts not known (D1 significant: unlock refuses when the lease can't be written, where the Contract says it stays unlocked; YOLO keep the code, a row). *Pass 2 (security):* S1 significant, the strength checker's verdict parse ran outside its guard, so a throwing getter's message (the passphrase) rode as `cause`; S2 significant, an outrun `#grantLease` left its lease, which could outlive `del()` for 168 h; minors M1 (a deriver's throw rides as `cause`, row), M2 (`box_stored`'s type, row; C1 told), M3 (`Wayin`/`Lease.toJSON` give the full record), M4 (PRF bytes not zeroed, row); the security-notes check (a late addendum on #192) found stale and missing entries.
*`b_fixes` (cut 2026-10-20 from #209, beside C1):* S1, S2, D1's test, M1's doc block, M3, the untested putWayin/delWayin refusals and minor lines, B5's two leftovers, and every security-note fix above through the sonnet subagent.
*Orchestrator:* `b-fixes` also takes, from B5's review: `hello`'s third example as `void vault.tryHello()`; react's dialog test's `getProof!` narrowed or reported. And, through its sonnet subagent, three `notes/security.md` wordings left by B4's work and review: ~1903's secure_floor "core default of 12 code points" that never existed; ~1428's "lives for one proof and one wrap" (one proof, one seal and one lease wrap); ~1946's sentence reading as if `putWayin` existed before.

*Orchestrator (2026-10-21):* `b_fixes` reported `ready` as #212 (e82e7f43), under high review.
*Review (`b_fixes`, #212, `fixed`, high):* S1 and S2 correct, each pinned by tests failing without it. Fixed: the Wayin `toJSON` docs and changeset said "no salt" (a passkey's summary keeps `prf_salt_b64`; it carries no wrap and no passphrase's salt); `#movedOn`'s doc line. Left (minor): a failed S2 erase logs the take-up warning and, on unlock, throws past `#settle()` (row, with D1); `Lease.toJSON` lists fields by hand (taste); react's `adviceFrom` trusts the verdict's shape (row, TODO); the pre-write `isVoided` skip untested alone. Dropped: an erase can wipe a newer lease (recorded; fails safe). The orchestrator had the security notes' M3 passage checked through a sonnet subagent.

*Orchestrator (2026-10-21):* the line is main → #213 (C1) → #212 (`b_fixes`, f145f9ad), restacked, justify green at the top. `b_rulings` runs as **two stacked threads**, each quoting its items below verbatim: **`b_simplify`** (items 3, 5, 6, 7, 8, 9, 10, 16, 17; cut from #212's tip; opus, review `medium`), then **`wayin_rules`** (items 1, 2, 4, 11, 12, 13, 14, 15; cut from `b_simplify`; opus, review `high`), then `props_bag`.

**`b_rulings`** (*Orchestrator:* added 2026-10-21 from the Coach's *Open Matters* rulings on phase B; cut from the top of the C1 + `b_fixes` line, before `lean_core`; opus, review `high`). The Coach's words are quoted; each item names its row's handle.

1. *A second passkey replaces the first* -- the macOS model: "You cannot have a passkey without a passphrase. You can add or replace a passkey matched to that passphrase if you prove the passphrase. You can replace your passphrase using your passphrase. You must create a passkey as you do, or the old one is removed. You cannot add a second passphrase or a second passkey. The verbs we supply, and the data structure, should support this: per user, one passphrase, none-or-one passkey." B4a/B4 built all of it but one clause: **a passphrase change removes the standing passkey** (the user makes a new one, proving the new passphrase). The changeset and the README say so.
2. *Placement: the vault stamps a new way in* -- "the clock and epoch are effectively globals, carried by the vault. Those are wayin concerns. Vault is becoming a kitchen sink": `Wayin.seal` builds its own stamp from the vault's accessors.
3. *Placement: the vault computes a lease's deadline* -- "it's lease's concern, why isn't lease doing it?": `Lease.grant` computes its deadline.
4. *Placement: the strength check reads the passphrase on the vault* -- "yes proof. If proof has a vault property, it should call back to that: this shouldn't be a runtime choice": the check moves to the passphrase proof (`checkStrongEnough`), calling back to its vault's checker; the vault keeps the once-per-handle log. The vault no longer reads `proof.passphrase`.
5. *Placement: one argument order for the makers* (took the Rec): `(vault, holder, ...what, key, opts)` for `Box.seal`, `Wayin.seal`, `Lease.grant` (unless C1 has set it).
6. *Way-in constructors are private in TypeScript only* -- "This is paranoia. No, just write normal code": drop the module-private key; ordinary constructors, `Wayin.make`/`seal` the documented way to get one.
7. *adorn stays non-configurable* -- "no, adorn and decorate should be writeable and configurable".
8. *The wrap the message suggests has braces* -- "remove or select options on no-misused-promises in the relevant package, that's a dumb rule": configure the rule off for void-returning listeners (`checksVoidReturn`) in the core's config (and the configs cut from it, if they carry it); the non-bag refusal then suggests `() => vault.tryHello()`. Report the lint change in the PR's open questions.
9. *The double-load check* -- "If you can't reduce the second loaded copy check to a single one once in the process lifecycle remove it altogether. Is this really something that happens?" and *A double load is refused as bad_option* -- "I'd say unexpected_error". *Orchestrator (YOLO, after an investigation):* **remove it** -- `checkOneCopy` (`src/one-copy.ts`) and its marks on `Proof` and `Box` and every call site. The `instanceof` or schema check after each call already refuses a foreign object; the check only re-worded that refusal. A single `globalThis` registration would also refuse harmless duplicates and may trip test runners and hot reload. `UnreadVaultProps`'s `Symbol.for` sentinel may become a plain module symbol. On the default checker: superseded by item 13.
10. *A storage read begun before a create can undo it* -- a TODO entry under a new `## Potential Optimizations` heading, carrying the Coach's argument verbatim (the new-vault race between DeviceDB and VaultDB in hello can be identified with certainty and the DeviceDB re-fetched against the VaultDB record); for now "apologize for bad UX, keep control flow clean".
11. *Placement: the seal hands back a session key* -- "this sounds like a terrible idea, why are we wrapping and rewrapping". *Orchestrator (investigated):* the unwrap is how the creating unlock turns its fresh, extractable vault key into the non-extractable handle the vault keeps (`wayin.ts:252-254`, `#draftVaultProps` `vault.ts:1455-1470`); `putWayin` throws the result away (a wasted unwrap per change). **`Wayin.seal` returns only the way in; `#draftVaultProps` alone makes the non-extractable handle** (e.g. through the way in's `unwrapUnder`). Never keep the extractable key.
12. *Placement: the fresh-salt check belongs with the proof* -- "Where is the list of salts it checks? Is this a real problem? Why isn't PRF doing that for us?" *Orchestrator (investigated):* there is no list: `checkFreshSalt` checks only that the salt is 32 bytes of base64url (`wayin.ts:425-429`), which keeps `putWayin` from writing a passkey every later unlock would read as `damaged_wayin`; the host mints the salt and PRF needs nothing more. **Rename it `checkSaltShape`, move it to `proof.ts`, keep the door call (`newProofOf`), drop the repeat in `passkeyKeying`.**

13. *The default strength checker logs once, when first used* -- "no, the default strength checker is a default strength checker, not a sentinel. The point is that it's untenable. Please write simple code": the default is an ordinary checker that answers weak (its reason points to CUSTOMIZATION.md); the vault's identity comparison and its once-per-handle log go. If the default still logs, it logs plainly each time it is called.
14. *A blank passphrase is two different refusals* -- "How would a blank passphrase ever reach the vault? every passphrase entered as an input (not verification) should be checked": a passphrase handed in as a new one -- the first at create, as well as putWayin's -- goes through the strength check (blank: `weak_passphrase`); only a passphrase that proves (unlock, the standing one in putWayin/delWayin) is read as a proof.
15. *addPasskey returns true or false* -- "putFoo should return the foo object as it is in the database (not what was sent) on success": a rule for every `put*` (STYLE.md, and the Contract's principles): `putWayin` resolves the way in as stored (its summary); C2's `vault.putBox` and C7's props verbs follow it (C1's `VaultDB.putBox` already does).
16. *security.md entries amended in place* (took the Rec): amend-in-place, marked "amended YYYY-MM-DD (thread)", is the rule; the header of `notes/security.md` says so, through its sonnet subagent.
17. From C1's review: `outcome.ts` `bad`'s `@example` reads `Refusals.staleWrite('vaultProps')` (`'box'` left `StaleWriteVals`).

*Review (`b_simplify`, #214, `fixed`, medium):* the reorder left no spy at a wrong index; the lease deadline is the same value and arms the expiry; a foreign Box or PassphraseProof is still refused (a foreign PasskeyProof reads as its answer, harmless); every `decorate` is followed by a freeze. Fixed: `Lease.grant` parses its computed deadline again (a NaN `leaseMillis` or clock reading had been bound into the wrap); the changeset's foreign-proof line; a doc wrap. The orchestrator had the security notes say so (cb986356). Left (minor): shadowing the handle's `leaseMillis`/`clock` (row: freeze the handle); a foreign PassphraseProof refused with the passkey message; public way-in constructors trust their record.

*Review (`wayin_rules`, #215, `fixed`, high):* the rulings are built as asked. Fixed: the four new doc blocks put their purpose on the `/**` line; the demo's new-passphrase field warns about the passkey only when there is one (98459f9f). Left (minor): the create's second derivation can fail after the write (the vault is made; the next unlock opens it; row); `registered_at` of the vault props and of the first passphrase come from two clock reads; the default checker's reason speaks to users and makers at once (item 13); four older doc blocks the thread touched still open with `/**` alone (for a documentarian run).

**`props_bag`** (*Orchestrator:* added 2026-10-21; stacked on `b_rulings`; opus, review `medium`). *The vault's public props are gone* -- "Yes adopt that rule. Vault should also have "virtual" capacity props given over by VaultDB": every model keeps a `props` getter under one rule (its stored fields minus key material: salts, wrapped keys, ciphertext; an empty bag when nothing qualifies); `vault.props` and `snapshot.props` return the vault's bag (`vault_id`, `unlock_epoch`, `vault_key_epoch`, `registered_at`) with the VaultDB's capacity as virtual props beside them; the way-in summaries stay. The rule goes into STYLE.md and the Contract's principles (orchestrator). *Riders (the Coach, 2026-10-21):* *Box.toJSON* -- "leave encrypted fields out of toJSON": a Box's `toJSON` gives its summary (no ciphertext, no wrapped box key); `meta.box_stored` still carries the Box itself. *Ask.raise* (took the Rec): an ordinary exported function in `ask.ts` (not exported from `index.ts`), an ordinary constructor, and `Ask` exported from `index.ts` as a type only; the symbol goes. *Orchestrator:* stacked on `checker2` at the restart; it exposes `store_rulings`'s capacity answer.


**`checker`** (*Orchestrator:* added 2026-10-21 from the Coach's third pass of rulings; stacked on `wayin_rules`; opus, review `medium`). The Coach's words are quoted; each item names its row's handle.

1. *The strength checker's names* -- "Can't you just have Vault.make's validator read strengthChecker: (... check it's a function, default to ours) and it's done in one line with perfectly uniform error messages?": `Vault.make`'s options schema takes `strengthChecker` as a function with our default; `parseStrengthChecker` goes, and its refusal is the schema's ordinary `bad_option`.
2. *React's adviceFrom trusts the verdict's shape* -- "Don't we wrap the strength checker? This might be why I'm getting a lot of weird questions about it. Wrap it, enforce the contract (throwing as a mistake if it's violated), catch the errors and centralize the decision making there": one wrapper around the host's checker is the only caller of it: it checks the verdict's shape (a verdict that breaks the contract throws as a mistake), catches the checker's throw (`unexpected_error`, carrying nothing), and decides strong or weak. The vault's checks and the React dialog's as-you-type advice (`adviceFrom`) both go through it.
3. *The zxcvbn checker answers weak if its dictionary fails to load* -- "Load the checker, idempotently, at hello(), failing if it fails. Late checks are dangerous: you want a fundamental thing to break loud and clear": a checker may carry an idempotent load; `hello()` runs it, and a failed load fails `hello` loudly (no "weak, try again" answer). The zxcvbn chunk stays a dynamic import, loaded at hello.
4. *One message for every non-bag* -- "validate once with zod as normal, add a hint as long as it doesn't obscure a detailed normal message": `hello`/`ensureLease` options go through one zod schema with its ordinary detailed message; the "an event, most likely" hint is added beside it, never in place of it.
5. *A key deriver's throw rides as cause; the checker's doesn't* -- "Leave it, we will audit these. Add todo: "Add "sensitive" and "host" flags to refusals"": a TODO entry with those words; the deriver's handling stays.
6. *no-misused-promises relaxed everywhere* -- "does it need to be off everywhere? Where did it need the exceptions? I thought it was a react thing": `b_simplify` turned `checksVoidReturn` off in all ten configs; the only lines it freed were two core tests (`vault-db` subscribe listeners that are async on purpose). Restore the rule's default in every config where nothing trips it; keep it off only where real code passes an async function as a void listener (likely react and the demo), and give the two core tests their `eslint-disable-next-line` back (reported).


*Review (`checker`, #216, `fixed`, medium):* no passphrase reaches a message, log or cause through the guard or zod's English (it names fields and types, never values); the load is one sequential first step of hello. Fixed: eight new doc blocks put their purpose on the `/**` line (04ff5fa1). Left (minor): a keyless non-plain object passes as options; a failed load retried on a storage ring is logged as a storage fault (row); `vault.strengthChecker` doesn't check its arguments (row: bind the scope); the modal passes through any VaultError (row); VOCABULARY.md's strengthChecker entry lags (the Contract's rewrite).

**`store_rulings`** (*Orchestrator:* added 2026-10-21 from the Coach's fourth pass of rulings, on C1's rows; stacked on `checker`; opus, review `medium`). The Coach's words are quoted.

1. *putBox's signal* -- "Rip it out; pause before running D1": `VaultDB.putBox` loses `opts.signal` (and the helpers only it uses); D1 owns timeouts outright. No other storage call takes a signal.
2. *A replayed box write* -- "Why is the postgres function running a select following -- can't it just use returning? Earnest question, I'm not a sql expert. But doing it in two steps raises my eyebrows": every adapter answers a resend of a write that already landed as `stale_write` naming that box (Postgres reports landed from its guard passing, not from the standing revision matching), pinned by a battery case that sends the same write twice. Rewrite Postgres's statement around `RETURNING` wherever it can carry the answer; answer the Coach's question in the thread file (why a trailing SELECT is or isn't needed under Postgres's statement snapshot), plainly, for a row.
3. *The landed flag in Convex's answer* -- "no back-compat, yes": the Convex adapter refuses an answer of unknown shape as `corrupt_record`, saying the deployed component is out of date; no shim.
4. *Capacity from storage* -- "Have each vaultDB return a reasonable estimate for capacity. What capacity estimate are we doing that's faster than Select sum(size(...))?": each VaultDB answers the vault's capacity (`{ boxes: { used, max }, bytes: { used, max } }`) as a reasonable estimate in the same statement or transaction that refuses `vault_full`, and on its own for `props_bag`'s virtual capacity props; a plain `sum(octet_length(...))` is fine where that is what is cheapest. Answer the Coach's question in the thread file.


*Review (`store_rulings`, #217, `fixed`, medium):* lock order can't deadlock among single statements; the READ COMMITTED races walked by hand hold; capacity carries only counts and sums; `vault.ts` untouched. Fixed: a Postgres first write weighs the vault only when it refuses `vault_full`; five new doc blocks' purpose lines; `capacityOf`'s example tested (33fdda9b). Left (minor): the answers file has three loose sentences (the doc's rows carry the corrected wording); Convex's uncounted vault can name the wrong limit (row); another Convex version's malformed `vault_full` capacity escapes as a TypeError (row); `Refusals.vaultFull` builds its message before the base checks the capacity; Convex recounts an untallied vault on every `getCapacity`; `doPutBox`'s hook doc omits `vaultFull`. Live Postgres not run here: CI's is the first real run of `ON CONFLICT`, `xmax = 0` and `FOR UPDATE` under contention.

**`checker2`** (*Orchestrator:* added 2026-10-21 from the Coach's rulings on #216's rows; stacked on `store_rulings`, ahead of `props_bag`, as the last thread before the weekend pause; opus, review `medium`). The Coach's words are quoted.

1. *A broken checker now shows while typing* -- "if the checker throws or answers nonsense (which causes a throw), that should hit the app's handler, this is not a condition. I may have generated confusion -- the wrappeer around the strength checker should re-throw errors that should be thrown"; and *The passphrase dialog passes the vault's refusals through* -- "I may not understand something about react. Is it normal to catch red-alert exceptions and route them to the dialog box?": the guard throws when the host's checker throws or answers a verdict that breaks the contract: a thrown mistake, never a refusal result, even from a `try*` call; the dialog's as-you-type advice doesn't catch it, so it reaches the app's error boundary. *Orchestrator:* what is thrown still carries nothing the checker heard (the standing ruling: a passphrase-hearing host function's throw is never a `cause`); the thrown error says the host's checker failed and where to look. `adviceFailed`'s pass-through goes with it.
2. *The checker loads before storage is read* -- "you can fire them off async in parallel. If the thing doesn't load, you'll be crashing out anyway.": hello starts the checker's load and the storage read together and awaits both; a failed load still fails hello.
3. *The guarded checker takes a scope its vault already knows* -- "yes. vault.checkPassphrase(...) validates and strength check": the guarded checker becomes `vault.checkPassphrase(typed)`, binding the vault's own scope, validating its argument and running the strength check. *Orchestrator:* the proposal row "The way-in verbs, proposed" used `checkPassphrase` for the authorizing check; that row now has to pick another name.
4. *A failed checker load is logged as a storage fault* -- "why are functions messing with other functions' errors? If hello throws, how does that become a storage error?": the storage watch stops rewording what a hello it runs throws; answer the Coach's question in the thread file.
5. *Rollback check and del()* -- "Add a todo "tombstone vaults; decide if the vault_id is a check -- the labels are meant to be the primary key"": a TODO entry in those words. The rest of that row's Rec stands (keep the rollback check; drop the recipe telling hosts to erase the mark; `del()` waits on hello and hands `delVault` its scope and `vault_id`, with no read first): `lean_core`'s.

*Review (`checker2`, #218, `fixed`, medium):* fixed: a hello whose load failed still tells the read's bad news (fac92fdd); `checkPassphrase`'s quotes and return (8e3929bd); `PassphraseModal` answers `declined` when a thrown mistake takes it away, where a host's own `getProof` waited for good (8837bea9); the security notes amended for both by the orchestrator's sonnet subagent. Left (minor): the watch never logs a failed hello's recovery (row); `errors.ts` overstates where `ThrownMistake` gets through; `useAdvice` tests the advice twice; the thread file's watch answer is too narrow (the doc's row is corrected). The flaky dialog test is a timeout under load.

**`wayin_api`** (*Orchestrator:* added 2026-10-21; stacked on `props_bag`; opus, review `high`). **Waits on the Coach's ruling of the proposal row "The way-in verbs, proposed"** (item 4 below).

1. *absent_wayin now means only "no passkey"* -- "i don't understand how there could be no wayin; if so, remove the refusal type": `absent_wayin` goes. An unlock by a passkey when the vault holds none is `wrong_passkey` (as another passkey's answer already is); removing a passkey the vault doesn't hold follows the proposal's ruling.
2. *vault.passphrase reads like the secret* -- "vault.passphraseWayin, passkeyWayin": rename the vault's and the snapshot's `passphrase`/`passkey` summaries to `passphraseWayin`/`passkeyWayin`.
3. *putWayin takes a finished passkey* -- "checking that the action is authorized before taking the action sounds like the right call,": the passphrase is checked before the browser makes the passkey, so a mistyped passphrase leaves no stray passkey.
4. *Contract: putWayin and delWayin as built* -- "A function with the name "putWayin" should prima facie have the signature `putWayin(wayin)`, maybe with options, being the throwing counterpart to tryPutWayin. If you are changing a passphrase, call that `changePassphrase({ existingPassphrase, newPassphrase })` so that you can't switch them. Do we have to offer a customer-facing option to delete a passkey? Anyway it shouldn't be called dalWayin unless it has the correct signature": the verbs as the proposal row's ruling sets them.
5. *Contract: a passphrase's summary has no salt* -- "keep the key-deriver label": a passphrase's summary gains `key_deriver_label` (it is no secret, and a host needs it to know whether this device's deriver can open the passphrase); never its salt or wrap.

### Phase C: `calls`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| C1 | `putbox-store` | B's line | opus | high | One atomic conditional write per adapter; battery's races. *Orchestrator:* `meta.box_stored` is typed `Box | null` until now: widen it (C3 adds the tombstone). A1b's `thread-A1b-c1-putbox.md` has each backend's one-statement write. Adds the refusal kinds `vault_mismatch` (condition) and `invalid_box` (pass 1: in the Contract's Refusals table, absent from `RefusalKindVals`), with `FamilyCases` rows and the README table. |
| `lean_core` | `lean_core` | C1 | opus | high | *Orchestrator:* the Coach's rulings on the orchestration inventory (2026-10-19; `orchestration-inventory.md`, *Resolved*): the core is hello → unlock → op. **Every op uses the lazy hello** (YOLO, its own row): unlock, way-in changes and del lose their forced second read (props writes are conditional on `vault_id`/`unlock_epoch`). Drop: the read after every write (update the listing from what the write returned, C1's stored box); the storage read before putBox/delBox (take the revision from the listing in hand, as the Contract says); the catch-up read on `stale_write` (the refusal carries `meta.box_stored`); the read before calling a box damaged (tell a remade vault's box from its own `vault_id`/epoch against the props in hand; B5 names it `#decipherOrCatchUp`); the read before `created_elsewhere`; the re-read when the vault looks full. A lost create takes up the winner's props from storage's answer (`meta.vault_props_stored`; no hello) and the unlock starts over against them. Keep the storage watch ("subscriptions like this, outside the critical path, are good things"). **Move the lease take-up out of hello** into unlock/`ensureLease` (ruled: hello earns vault state alone), and the provider's mount calls `ensureLease` to pay for it. **Every op runs unlock explicitly** (which runs hello): "let's have it be explicit, uniformly hello->unlock->op". The read queue keeps sharing a read under way and drops the queued extra run. A test pins which lease refusal kinds the vault logs when it drops a lease (B2 review; ruled). *Orchestrator:* `a_sec2` removes `RefusalMeta.vault_props_stored` (salts and wrapped keys must never reach a host's refusal): the lost create's winning props travel from storage to the vault on a storage-only path: storage's refusals and the host's share `VaultError`, so not on `meta`. A lost create takes `ensureVaultProps`'s good value (the winner's props); a stale props write gets a VaultDB-level answer, and the vault refuses a fresh `stale_write` carrying no props (`a_sec2`'s thread file; a row asks). The Coach (2026-10-21) on `vault_props_stored`'s removal: "using the meta field to carry the things it should carry is good"; and took the Rec on how a lost create gets the winner: `ensureVaultProps`'s good value, and a storage-level answer for a stale props write (no props on a refusal's meta). The Coach (2026-10-19) on a lease_ending ask dismissed: "we should not terminate the lease": a declined `lease_ending` ask carries on under the standing lease, and the Contract says so. |
| C2 | `putbox-vault` | `lean_core` | default | medium | The Coach (2026-10-21) on what `expect` is: "why not `putBox(box)`? It has the vault and everything on it": `VaultDB.putBox` takes the Box alone, which carries (or reaches) its scope, `vault_id` and the revision it replaces; say what that takes if a stored Box doesn't carry them. *Orchestrator:* stacked on `lean_core`, so it builds on the lean putBox. The Coach (2026-10-21) on putBox's split seal: "don't split it. The size is not a guarantee, it's a best-effort canary. Just use the serialized size or whatever's most convenient": `putBox` goes through `Box.seal`, and `planSeal`/`sealPlanned` merge back. The makers' argument order is `b_rulings`'s. `vault.putBox` resolves the box as stored (the Coach: "putFoo should return the foo object as it is in the database (not what was sent) on success"). Pass 3 reads `thread-B5-placement-table.md`. |
| C7 | `vault-props-verbs` | `lean_core` | default | medium | Beside C2, as the preplan allows. |
| C3 | `delbox-tombstones` | C2 + C7 restacked | opus | high | *Orchestrator:* C3 and C7 both rewrite every adapter and the battery, so C3 waits for C7 in the line rather than conflicting at the restack. Proposes `delIfIncoherent`'s fate. Writes the line under each `del` doc block that a tombstone stands (thread 0's row, ruled). |
| C4 | `getbox` | C2 + C7 line | default | medium | Beside C3. Writes `getBox`/`openBox` nesting first. *Orchestrator:* removes the vault's own `useBox(boxlabel, callback)` (ruled); renames the private `#openBox(boxlabel)`, which reads storage and asks, unlike the public `openBox(box)` (B3 review). |
| C5 | `lock-close-del` | C3 + C4 restacked | opus | medium | Rewrites the Contract's first guess; files the rewrite as an *Open Matters* row. |
| C6 | `subscriptions` | C5 | default | medium | |

*Review (C1, #213, `fixed`, high):* every backend's conditional write is one atomic step; no ciphertext-carrying `cause` crosses a wire; the codemod's spy indexes are right; `#refuseStalePutBox` is interim and safe. Fixed: a failed catch-up dropped `meta.box_stored`; GraphQL attached `box_stored` to any refusal kind; putBox's `null` doc; ten doc-block first lines; the new examples' tests. Left (minor): `outcome.ts` `bad`'s example says `staleWrite('box')` (to `b_rulings`); Convex trusts its answer's shape under skew (row); Postgres answers `landed` to a replayed write where the others say `stale_write` (row); a refused write is a no-op UPDATE in Postgres (row); a reborn row during the wait reports `null` (safe); `boxStoredOf` duplicates `checkStoredBox`; the route recipe hands on `box_stored` with any kind.

**Closing phase C:** passes 1, 2 and 5; fixes in `c-fixes`.

### The policy session

Not on the runner's path (preplan). Nothing waits for it.

### Phase D: `batteries`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| D1 | `batteries-core` | C's line | default | medium | **Pause before D1** (the Coach, 2026-10-21: "pause before running D1"). `p-retry` as optional peer: the Coach ruled it (dependency yes). *Orchestrator:* the default `onBadNews` is idempotent: the same `damaged_vault` can be told twice (ruled). The ruling on a failed lease write also settles a failed S2 erase of an outrun lease: what it logs, and whether unlock throws `storage_unavailable` or `vault_locked` (#212's review; the Coach took the Rec). |
| D3 | `customer-docs` | C's line | opus | none (pass 4) | Beside D1. |
| D2 | `batteries-react` | D1 | default | medium | *Orchestrator:* A6 pulled forward the shipped dialog as the provider's default `getProof` (`getProof={null}` asks no one); D2 keeps TanStack and `useBox`. *Orchestrator:* a failed start-over delete shows its refusal in the provider; the lock still lands before the delete (the Coach, 2026-10-19: simple control flow first). |
| D6 | `damaged_callback` | D1 | default | medium | *Orchestrator:* the Coach (2026-10-19): "there should be a thread to have a damaged box callback which would issue delIfDamaged or del depending on locked state". Outside the main line: a battery a host opts into, beside D2. |
| D4 | `demo-and-e2e` | D2 | sonnet | low | |
| D5 | `sweep` | D4 + D3 line | sonnet | low | Lowers every size line to the rule. Writes a TODO entry: `StringStore`'s `read`/`write`/`erase` to the trio, a quiet-tree rename after the sprint (thread 0's row, ruled). Also TODO entries (the Coach, 2026-10-19): assess where async responses to refusals happen, outside the main line; UX annoyances to solve safely once correct, starting with a lease written for new props going unused until the next real read, and a click's activation expiring before the dialog asks on a slow backend (A6 review); upvote the one-passphrase TODO (trying the typed passphrase against each passphrase way in) with a note that it is orchestration-y; "review whether hello on mount is right, and the correctness of user-driven retry and delete" (react); "scour the code for where critical paths are obsessing about logging and refusal publicity chains". |

**Closing phase D:** passes 1 to 5.

## For the Coach

* The main checkout has staged, uncommitted work on `20261018-reformx` (upstream gone): the
  preplan, the rename plan, STYLE.md's *ensure* paragraph, the sprint skill's per-thread review
  levels, and the unpushed commit `0e2df3be` (CLAUDE.md's *read as markdown*, a TODO line). The
  sprint carries the preplan (this PR) and the rename plan and *ensure* paragraph (thread 0's PR);
  the rest is left to you.
