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
* **Sprint doc:** https://claude.ai/code/artifact/362ec68d-5bf3-46aa-a379-59a9c8bfb548
  (*Open Matters*, *Resolved*, *Progress*).
* **Status:** running. `a_sec` (#203) restacked onto #204 and filed at 9e5ed329 after a third, restack review (the Coach's leave). B2 `lease` building from it.

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
| B4 | `put-wayin` | `a_sec2` | opus | medium (`high` if it takes the slots) | Writes its Contract section to the thread file first; YOLO builds to the brief. *Orchestrator:* **waits on the Coach's look at `one_of_each-design.md`** (one passphrase, one passkey as stored slots; the design recommends doing it in B4, before B4 builds; rows in *Open Matters*). *Orchestrator:* the Coach on merging the three sealing statics (`sealPassphrase`, `sealFirstPassphrase`, `sealPasskey`): "If it proves awkward, don't force the three into one ... line the three functions up together, and then make sure any loss of clarity in the combined function is small". *Orchestrator:* the Coach's ruling (2026-10-19): the strength checker's contract is "return a value saying good or bad"; any throw from it (or from react's `passphraseAdvice`) is an `unexpected_error` naming the function, carrying none of the thrown value's kind, meta or cause (today a thrown condition passes through). The option is `strengthChecker`, **optional**: its default refuses every passphrase as too weak and logs that the customer must choose one, pointing to a new CUSTOMIZATION.md (section and AI prompt: `ruling-strength-checker.md`, the Coach's words). *Orchestrator:* the Coach's ruling (2026-10-19, design brief question 1): "The standard default must be to provide old passphrase to get new passkey or new passphrase ... it's how it's done everywhere else, and we don't invent crypto": only the standing passphrase proves a new passphrase or a new passkey; a passkey proves neither. |
| B5 | `placement` | B3 + B4 restacked | opus | low | *Orchestrator:* the preplan stacks B5 on B4 only, but B5 reads all four model classes, so B3 joins the line first. The Coach on the Wayin subclasses' public constructors (2026-10-19): "if it's not violent to make them non-public, do that. I also don't mind something as dumb as make sending a detatched `_was_made` flag. No eviscerating the functionality of access to the class." Likewise `Ask.raise` off the public surface, and `adorn`/`decorate` to an internal module. `adorn` is the Coach's triquet form, `adorn(obj, ckey, val)` (ruled: the preplan's two-argument form was a typo; it lets a getter say `return adorn(this, 'foo', val)`): restore it and its callers. A `Box` (or `Proof`) from another copy of safebyok is a misuse refusal naming the double load (the Coach: "anything revealing the existence of a second safebyok should crash the app"; a row asks about another copy's refusals). The Coach on `vault.hello` as a bare listener (2026-10-19): "If there's a way to detect that, we should": `hello`/`ensureLease` refuse an Event, and anything else that is not a plain bag, with a specific `bad_option` naming the fix ("wrap it: `() => vault.tryHello()`"), reversing A4's leniency; `optionsCheck`'s `Z.strictObject` already refuses extra fields. Rename `#makesStandDown` to say create (the vault's first write to storage), not make, which reads as `Vault.make`. |

*Orchestrator (line):* B's line is B1 → B3 → `a_fixes` → `a_sec` → B2 → `a_sec2` → B4 → B5.
`a_sec` is restacked onto #204 (ruled 2026-10-19), and B2 cuts from it.

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

### Phase C: `calls`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| C1 | `putbox-store` | B's line | opus | high | One atomic conditional write per adapter; battery's races. *Orchestrator:* `meta.box_stored` is typed `Box | null` until now: widen it (C3 adds the tombstone). A1b's `thread-A1b-c1-putbox.md` has each backend's one-statement write. Adds the refusal kinds `vault_mismatch` (condition) and `invalid_box` (pass 1: in the Contract's Refusals table, absent from `RefusalKindVals`), with `FamilyCases` rows and the README table. |
| `lean_core` | `lean_core` | C1 | opus | high | *Orchestrator:* the Coach's rulings on the orchestration inventory (2026-10-19; `orchestration-inventory.md`, *Resolved*): the core is hello → unlock → op. **Every op uses the lazy hello** (YOLO, its own row): unlock, way-in changes and del lose their forced second read (props writes are conditional on `vault_id`/`unlock_epoch`). Drop: the read after every write (update the listing from what the write returned, C1's stored box); the storage read before putBox/delBox (take the revision from the listing in hand, as the Contract says); the catch-up read on `stale_write` (the refusal carries `meta.box_stored`); the read before calling a box damaged (tell a remade vault's box from its own `vault_id`/epoch against the props in hand); the read before `created_elsewhere`; the re-read when the vault looks full. A lost create takes up the winner's props from storage's answer (`meta.vault_props_stored`; no hello) and the unlock starts over against them. Keep the storage watch ("subscriptions like this, outside the critical path, are good things"). **Move the lease take-up out of hello** into unlock/`ensureLease` (ruled: hello earns vault state alone), and the provider's mount calls `ensureLease` to pay for it. **Every op runs unlock explicitly** (which runs hello): "let's have it be explicit, uniformly hello->unlock->op". The read queue keeps sharing a read under way and drops the queued extra run. A test pins which lease refusal kinds the vault logs when it drops a lease (B2 review; ruled). *Orchestrator:* `a_sec2` removes `RefusalMeta.vault_props_stored` (salts and wrapped keys must never reach a host's refusal): the lost create's winning props travel from storage to the vault on a storage-only path (`a_sec2`'s thread file says how). The Coach (2026-10-19) on a lease_ending ask dismissed: "we should not terminate the lease": a declined `lease_ending` ask carries on under the standing lease, and the Contract says so. |
| C2 | `putbox-vault` | `lean_core` | default | medium | *Orchestrator:* stacked on `lean_core`, so it builds on the lean putBox. |
| C7 | `vault-props-verbs` | `lean_core` | default | medium | Beside C2, as the preplan allows. |
| C3 | `delbox-tombstones` | C2 + C7 restacked | opus | high | *Orchestrator:* C3 and C7 both rewrite every adapter and the battery, so C3 waits for C7 in the line rather than conflicting at the restack. Proposes `delIfIncoherent`'s fate. Writes the line under each `del` doc block that a tombstone stands (thread 0's row, ruled). |
| C4 | `getbox` | C2 + C7 line | default | medium | Beside C3. Writes `getBox`/`openBox` nesting first. *Orchestrator:* removes the vault's own `useBox(boxlabel, callback)` (ruled); renames the private `#openBox(boxlabel)`, which reads storage and asks, unlike the public `openBox(box)` (B3 review). |
| C5 | `lock-close-del` | C3 + C4 restacked | opus | medium | Rewrites the Contract's first guess; files the rewrite as an *Open Matters* row. |
| C6 | `subscriptions` | C5 | default | medium | |

**Closing phase C:** passes 1, 2 and 5; fixes in `c-fixes`.

### The policy session

Not on the runner's path (preplan). Nothing waits for it.

### Phase D: `batteries`

| # | Label | Base | Model | Review | Gloss |
|---|---|---|---|---|---|
| D1 | `batteries-core` | C's line | default | medium | `p-retry` as optional peer: the Coach ruled it (dependency yes). *Orchestrator:* the default `onBadNews` is idempotent: the same `damaged_vault` can be told twice (ruled). |
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
