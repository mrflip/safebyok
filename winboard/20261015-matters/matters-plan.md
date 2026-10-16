# Sprint matters -- plan

* **Date**: 2026-10-15
* **Mode**: normal for wave 1; **YOLO from part 2** (2026-10-16, a new orchestrator session, the
  Coach: "big_feats part 2, yolo mode"). Judgment calls a competent Coach would call two-way doors
  are taken and listed under *Decisions taken in YOLO*; a one-way call still becomes a matter row.
* **Review level**: medium
* **At once**: 3 threads
* **Issued by**: flip (the Coach), through the Open Matters tab of the big_feats sprint doc
  (`/turbochat`): each thread below is a row they set to `proceed`, with their answer verbatim.
* **Status**: the gripes line merged (main b60e516, 2026-10-16 ~01:30Z), freeing wave 2. Filed:
  1, 2, 3, 4, 8 (#96 to #99), being restacked onto main as one line. Underway: 10, 11, 13; 9 waits
  for #97's restack. Queued: 7, 15, 16, then 5 (after 11), 6, 12, 14; 17 waits on #101.

## Read first

Beyond CLAUDE.md, and STYLE.md and VOCABULARY.md before naming anything or writing a test:

* `TODO.md`'s *Open from big_feats*, and `winboard/20261015-big_feats/20261015-sprint_big_feats_rulings-human.md`: where each
  of these matters came from.
* `notes/security.md`, and for thread 1 `winboard/20261014-crypto/decisions.md`.
* `winboard/20261015-big_feats/big_feats-progress.md`: what the big_feats sprint learned,
  including the size budgets and the reviews' leftovers.

## Ground rules

* **The base is main** at `c4c070f` (big_feats and `/turbochat` merged). Push only with an
  explicit refspec:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <branch>:<branch>`.
* **Never `git stash`** in a worktree: the stash is one ref shared by every worktree and the
  main checkout (which holds the Coach's stashes), so a pop can take another's entry. Check work
  out of the way with a local commit instead.
* **No backward compatibility** (CLAUDE.md, and the Coach again here): a stored shape that
  changes reads old records as corrupt, and the changeset says so.
* **The gripes line is open beside us**, and is not yet on this base. Built on main from before
  big_feats, it runs main → #87 → #85 → #83 → #92 → #95 → #93 → #91 → #90: validation
  overrides, rows keyed by the JSON of their names (#92), damaged lockboxes (#93), dialog wording.
  It touches the core, `safebyok-react`, the demo, `TODO.md`, `notes/security.md`,
  `VOCABULARY.md` and `.size-limit.json`. Keep hunks in those shared files small and additive, so
  whichever line lands second restacks cheaply.
* **`TODO.md` is thread 4's alone** in this sprint. Another thread with something for it says so
  in its report.
* **Size budgets**: thread 4 raises them, and wave 2 is cut after it, so inherits the room. Wave
  1's other threads add little to the core's bundles; none of them edits `.size-limit.json`, and
  one that overshoots main's budget says so in its report.

## Threads

### Wave 1: cut from main now

#### 1. hkdf_info

> **The passkey's HKDF info.** *Rec: add vault_id and the scope.* The Coach: "Make everything
> verifiable unless there's a good reason not to. We do not need to maintain backwards
> compatability"

*Gloss.* The passkey wrapping key's HKDF `info` (`packages/safebyok/src/crypto.ts`, around line
104, and its callers in `vault.ts`) gains `vault_id` and the scope (applabel, user_id,
vaultlabel), beside format, purpose and credential_id. "Make everything verifiable" reaches
further, so sweep every derivation and every cipher binding (HKDF info, AES-GCM AAD) for a
field we write that is left out, and bind it unless there's a good reason; each reason kept goes
in `notes/security.md`. Old passkey envelopes read as corrupt (no compat). `crypto:` prefix.
Look-ahead: none.

#### 2. release_age (sonnet)

> **pnpm's `minimumReleaseAge`.** The Coach: "yes seven days. Same policy as for similar things:
> report it when it's added, and always add each exception to security.md for later audit and
> re-pinning. Should hot releases be pinned more, or less, specifically than normal? I'd rather
> 100 bugs than one vuln"

*Gloss.* `minimumReleaseAge: 10080` (minutes) in `pnpm-workspace.yaml`. Every exception
(`minimumReleaseAgeExclude`) gets an entry in `notes/security.md` naming the package, the exact
version, why, and when to revisit. The orchestrator's answer to the Coach's question, for the
thread to write into PROCESS.md *Dependencies*: a hot release (a fix we must take before it is
seven days old) is pinned *more* specifically -- the exact version, never a range -- excluded by
name and version only, recorded the same day, and the exclusion is removed once the version ages
past seven days. Never an exclusion for convenience. Also retire the hand pins of big_feats' YOLO
decision 5 if the rule now covers them. Check that a frozen-lockfile install and CI still pass,
and report what the rule refused, if anything. `deps:` prefix for the setting, `docs:` for
PROCESS.md.

#### 3. passkey_button_ux

> **`PasskeyUnlockButton`'s misuse errors.** *Rec: match the passphrase dialog.* The Coach: "make
> the behavior follow best ux practices first -- design for a productionized professional app
> (does that give the guidance necessary? I will need more background on what the precise
> experience is for developer and user to help make a decision)"

*Gloss.* `packages/safebyok-react/src/passkey-unlock-button.tsx`, beside `passphrase-modal.tsx`.
Today a programming mistake (a bad prop, a vault opened wrong) shows calmly in the button, where
`PassphraseModal` throws it to the error boundary. Design both components' failure behaviour to
the practice of a professional production app: the end user sees a calm, actionable state for
what they can fix or retry; the developer meets a misuse loudly and early, in development,
without the user's screen going blank in production. Build what that practice settles. Then
write, in the thread file and the PR, the experience before and after for both audiences, so the
Coach can rule on anything left. A choice that remains goes back as a matter. `client:` prefix.

#### 4. small_sweep (sonnet)

> **The flaky demo test.** The Coach: "go"
>
> **For you: Supabase.** The Coach: "yes untested in the readme, not yet in the todo"
>
> **For you: real authenticators.** The Coach: "I will run acceptance tests. Add a line to the
> TODO soonish: \"What level of e2e testing is appropriate?\""
>
> **Size headroom.** The Coach: "loosen things. Add guidance that a sprint orchestrator can and
> should monitor the size tests and have workers advance them so there are not trivial merge
> conflicts or resolutions when we stack the sprint's PRs -- if we're at 25 out of 28, and workers
> will be adding 1, 3, and 6 to it, advance the cap to 38 so their edits agree."
>
> **Sand in the sandals.** The Coach: "the root scripts chain with `&&` ... that's bad, fix that /
> Convex's `--no-error-on-unmatched-pattern`: make this its own row with a good explanation / the
> demo's coverage has no `include`: this sounds like a request to solve an obvious problem the
> obvious way; if so, do so; if not, explain in a new row. / the root eslint config doesn't ignore
> a stale root `dist/`: same: if it's an obvious problem, solve that"

*Gloss.* One commit each:
* `demos/safebyok-demo-react/tests/test-helpers.test.tsx:62`: wait for the dialog to go
  (`waitFor`), as the other assertions there do. `demo:`
* The Postgres README's Supabase section says plainly that it has not been run against Supabase.
  Not a TODO entry. `docs:`
* `TODO.md`: "What level of e2e testing is appropriate?" under *Open from big_feats*; the
  rulings line updated (HKDF info and `minimumReleaseAge` ruled, threads 1 and 2; `addPasskey`'s
  shape kept, as built); the epoch line pointing at the revocation matter instead; *Sand in the
  sandals* cleared of what main already fixed (the root scripts run every package since the
  gripes sprint, the root eslint ignores `**/dist/**`, the demo's coverage has an `include`, and
  Convex's flag is gone -- check each before striking it). `plan:`
* `justify:root` still chains with `&&`: make it run all three and fail if any failed, as
  `justify` does. `tools:`
* `.size-limit.json`: every budget raised to what it measures now plus at least 3 kB, rounded up
  to a whole kB, so the sprint's threads and the gripes line's restack don't fight over it.
  `tools:`
* `.claude/skills/sprint/SKILL.md`: the Coach's size guidance, in §1 (plan) and §2 (cut): the
  orchestrator reads `pnpm size` when planning, estimates what each thread adds, and has the
  first thread raise each budget to cover the sum, so stacked PRs agree; workers don't edit the
  budgets afterwards, and report an overshoot. `docs:`

### Wave 2: waits on the gripes line

Cut from the gripes line's top once it is restacked onto main (or from main once it lands): #92
rekeys every row and #93 changes what `listBoxes` returns, which is the ground these threads
audit and rewrite.

#### 5. vaultdb_battery

> **Audit the VaultDBs and grow the standard battery.** The Coach: "yes do this as a sprint"

*Gloss.* TODO's entry: audit every adapter against the `VaultDB` contract, move into
`TH.describeVaultDB` whatever a package proves by hand that is really the contract, and trim each
package's bespoke tests to what is its own (extra testing is fine; vacuous testing is not). Each
package runs the battery itself; the core runs it over `localVaultDB(memoryStore())`. "As a
sprint": large enough to split by package if the audit shows it -- the orchestrator decides when
the audit reports.

#### 6. race_helper (opus)

> **A race helper.** The Coach: "yes, proceed. I would like this work done by opus, with thought
> put in to making sure it's an honest test, and assessing what parts of this should be a generic
> method implementing the test vs helpers offered to the individual db implementer."

*Gloss.* Stacked on thread 5. Two writers through separate stores, interleaved at the points
that matter; one lands, the other is `stale_write`. "Honest": the test must fail against an
adapter that doesn't actually guard (prove it with a deliberately broken adapter), and must not
pass because the two writers secretly share a connection or a lock. Decide, and say why, what the
battery runs for every adapter and what is a helper an adapter calls with its own interleaving
points.

#### 7. indexeddb_fixes

> **No null as an error's cause.** The Coach: "go"
>
> **IndexedDB reads only the scope's rows.** The Coach: "this seems like a straightforward and
> useful fix -- am I just approving a follow-on commit or is there something deeper here (in which
> case, explain more)"

*Gloss.* `packages/safebyok-indexeddb`. A failed write whose `request.error` is null reports "the
write failed for an unknown reason", never a null cause. `listBoxes` and `eraseVault` read a key
range over the scope's prefix, not the whole store, and the bell's BroadcastChannel is closed
when its vault closes. The orchestrator's answer to the Coach: a follow-on, nothing deeper -- but
the key range is built on how rows are keyed, which #92 changes, so it waits for that.

## Part 2: the Coach's second round of proceeds (YOLO)

From the Open Matters tab, 2026-10-16. Each thread quotes the row and the Coach's answer verbatim.
The gripes line is being restacked onto main by its own session, in `/workspace/byok-restack`:
never touch that directory. Rows that needed no thread are under *Swept without a thread*.

### Wave 3: cut now

#### 3, continued. passkey_button_ux (#98)

Its review-round commits (`fd83bf1f..60bc87e8`) get a second review, then it files. The Coach
ruled on its two matters: **the dialog's swap to a notice**: "LGTM" (kept). **The hand-written
error boundary**: the Coach's rubric -- "if it's a zod situation, where even if they didn't,
something else they're installing does anyway ... I'd prefer a library. If our code is perfectly
readable and most libraries are also running around rolling their own, and we would often be the
only one inviting r-e-b to the party, skip it." *Orchestrator:* skip it, so the class stays.
`react-error-boundary` reaches about 8% of React installs (14.9M a week against React's 188M), no
major framework or UI kit depends on it (Next, React Router, Sentry roll their own), and the
equivalent call sites are no shorter. Its `onError` would also hand us the error object, which our
no-argument callback deliberately never sees. The PR's body records the ruling.

#### 8. size_rule (sonnet) -- commits on #99

> **Size budgets: +3 kB, or a percentage? (#99)** Rec: keep +3 kB for the big bundles, and use
> +50% (at least 1 kB) for anything under 5 kB. The Coach: "The rule you propose sounds good, but
> have it also choose a roundish number to avoid rebase conflicts. (i.e. 2_500 not 2_431 bytes,
> 150_000 not 146_000 bytes) An orchestrator is encouraged to guess at a target and have a late
> thread lower it"

*Gloss.* Worktree `../byok-size_rule` on #99's own branch, `20261015-small_sweep`; no new PR.
Re-derive every `.size-limit.json` budget by the rule (measured + 3 kB at 5 kB and over; measured
+ 50%, at least + 1 kB, under it), then round **up** to a round number (two significant figures
is the spirit: 2.5 kB, 6 kB, 23 kB, 150 kB). Write the rule where the next person raising a budget
looks (beside `.size-limit.json`'s use in PROCESS.md, or the file that documents `pnpm size`), and
fold the Coach's second sentence into `.claude/skills/sprint/SKILL.md`'s size guidance (thread 4's
text): the orchestrator guesses the sprint's target up front, and a late thread lowers the budgets
to the rule once the sprint's sizes are known. `tools:` and `docs:`.

#### 9. damaged_bundle -- stacked on #97

> **A tampered vault says "wrong passphrase" (#97).** Rec: a later thread gives a damaged bundle
> its own calm message, probably after trying every way in. The Coach: "yes, use fine-grained
> error messages; if there become too many we can group them"
>
> **Bind the passphrase key's Argon2 settings too? (#97)** Rec: leave it out; security.md says
> why. The Coach: "yes, leave the settings out. If anything went in it would be more like a
> difficulty measure; relegate to security.md"

*Gloss.* Cut from #97's tip (`ec0c9f18`); its PR says "Stacked on #97". AES-GCM fails the same
way for a wrong key and for altered additional data, so a single failed envelope cannot tell
"wrong passphrase" from "damaged". Find what *can* be known and say exactly that: e.g. a
structurally invalid bundle or envelope; a bundle every one of whose ways in fails where at least
one should not (a passkey that answered, a remembered unlock whose key is held); a lockbox that
fails under a vault key that just opened others. Each distinct, knowable cause gets its own `kind`
and a calm message saying what to do (VOCABULARY.md has the words; the gripes line's #93 calls a
lockbox that fails to open "damaged", so use that word for the same idea). Do not claim tampering
the code cannot know; where the cause is ambiguous, the message says so plainly ("the passphrase
didn't open this vault: check it, or the stored vault may be damaged"). New error kinds are public
surface: name them in the PR's open questions. Also the Coach's Argon2 ruling: one sentence in
`notes/security.md`'s binding entry (#97's) -- if any Argon2 setting were ever bound, it would be
as a difficulty measure (a floor on cost), not as a binding. `vault:` / `docs:`.

#### 10. identity_revoked (opus)

> **Does a vault lock on sign-out?** When storage answers `not_permitted` (the user has signed
> out), should the vault lock itself and drop its keys? From the Convex sprint. Rec: yes. The
> Coach: "storage adapters should provide fine-grained guidance. If "not permitted" should be
> interpreted as "user has changed / is not logged in", have them send back a "identity_revoked"
> message. Can we consolidate a policy module that makes decisions about whether identity_revoked
> implies a lock, delete, whatever?"

*Gloss.* From main. Today an adapter's refusal is `not_permitted` whatever its cause. Give the
storage error vocabulary a distinct `identity_revoked` (the signed-in identity is gone or changed)
beside `not_permitted` (this identity may not do that), have each adapter that can tell the two
apart say which (Convex certainly; Postgres and GraphQL as far as their host hooks allow;
IndexedDB never revokes), and put the vault's response in one small, documented policy -- a
module the vault consults, with a default (Rec: lock, dropping keys; never erase local data on a
revocation) and a host override if it comes naturally. Design first, in the thread file: the
signals, the default policy and why, and what a host sees (`subscribe`/snapshot, the React
binding's dialog). Keep core edits additive where the gripes line also edits (`vault.ts`, the
error module), so its restack stays cheap. New kinds and any policy option are public surface:
name them in the PR's open questions. `storage:` / `vault:`.

#### 11. vaultdb_contract -- the Coach's note on the Postgres cap

> The Coach (Your notes): "postgres cap -- see tab. - launch one worker to expand the manifesto
> seen there into a design contract, and to compare it with the test, aligning test group titles
> with lines in the contract or lines of the contract with test group titles (don't turn the
> contract into a bullet-point soup; but if a line in the contract implies a test, let's have that
> test) - if something like the statement I proposed (don't trust my word for it) would meet the
> guarantee I propose, launch another worker to rip out all that other garbage and do something
> that doesn't involve a black belt in psql DDL, disruptive locks and an extra table"

*Gloss.* Read `matter-postgres_cap.md` in this directory: the Coach's contract is its *Your
thoughts*. Write it up as the `VaultDB` design contract (prose, with the guarantees as numbered
lines the tests can name; answer the Coach's inline questions -- which layer owns the versioned
update, what a limited listing promises -- from the code, or record them as open). Put it where
the `VaultDB` interface is documented for adapter authors (a `docs/` or the core's README section
that already describes `VaultDB`; check before making a new file). Then align the standard battery
(`describeVaultDB` in `safebyok/testing`) with it: group titles that cite the contract's lines, and
a test for every line that implies one and lacks it. Thread 5 later audits each adapter against
this contract, so leave per-adapter work to it, except where a new battery test fails an adapter
today: then mark it `.todo`/`.skip` with the reason, and list it in the report. `docs:` / `tests:`.

#### 12. postgres_soft_cap (sonnet) -- stacked on 11

> (the second half of the Coach's note above)

*Gloss.* Cut from thread 11's tip once it files. *Orchestrator's reading* (the worker checks it,
"don't trust my word for it"): the Coach's one-statement insert -- `INSERT ... SELECT ... WHERE
(SELECT count(*) ...) < cap RETURNING ...` -- meets the contract they proposed, which asks for a
best-effort soft max, an insert that is refused only if it didn't happen, and a best-effort count;
under concurrency two inserts may both pass and overshoot by a few, which the contract allows. If
the worker finds it does meet it, `safebyok-postgres` drops the `lockbox_count` column, the
trigger, the `FOR UPDATE` lock, `StillFullSql` and their migration text for that statement; the
README states the count's guarantee in the contract's words and offers the *vaya con dios* note
for a host who wants a hard cap. If it does not, report `blocked` with why.

#### 13. rotation_design (opus) -- documents only

> The Coach (Your notes): "The revocation/key rotation tab: make it a sprint (a) and also add the
> NOTYET described in it". In the tab: "Yes, do (a)" and "Do we have a way to invalidate other
> devices that is legit under apple/google strict privacy matters -- to lock all entryways on a
> given device? The UX work needed to support this is non-trivial, so it should be a NOTYET, but
> let's make sure the data we need is in there"

*Gloss.* Read `matter-revocation.md` in this directory. A design, in
`whiteboard/20261016-rotation/`, for (a) vault-key rotation when a way in is removed: a fresh
vaultKey, every lockbox re-encrypted, the remaining envelopes re-wrapped, atomic or resumable over
a store that has no transactions (the contract thread 11 writes), what a second device mid-rotation
sees, and the `unlock_epoch` rollback check the tab mentions. And the NOTYET: per-device
invalidation -- what a device must record (a per-device identifier on each envelope it adds? which
identifiers Apple's and Google's privacy rules allow, and which they forbid) so that "lock every
way in this device added" is possible later; the design names the stored fields the build adds now.
Its thread breakdown becomes thread 14 (and more) in this plan. Stored-shape changes are a contract
(pre-1.0, so no compat); name them in the PR's open questions. Also add the NOTYET to `TODO.md`
(thread 4 owned TODO in wave 1; it has filed). `plan:` / `docs:`.

### Wave 4: waits

* **14. rotation_build**: from thread 13's design, after the gripes line lands (it rewrites the
  lockbox listing and erasure that rotation walks).
* Wave 2 (threads 5 to 7) as before. Thread 5 now audits against thread 11's contract.

### Swept without a thread

* **`safebyok` as a peer of every adapter**: already so on main (every adapter's `package.json`
  lists it under `peerDependencies`, `workspace:^`). Nothing to do.
* **Convex's `react` dev dependency**: kept. The Coach's question -- a separate `safebyok-e2e` for
  cross-harness tests -- goes back as a matter with a recommendation.
* **Housekeeping**: the deletion was refused by this session's permission check; a read-only survey
  lists what is safe to remove, for the Coach to run.

### Wave 5: the Coach's third round (2026-10-16)

The gripes line has merged (main `b60e516`). The Coach's answers, verbatim, and where each went:

* **The two lines collide** -- "I've restacked and merged a great pile of prs, would you please
  take the ones on your sprint that are ready to merge and have an agent restack them on main? They
  should be smart about justify time: if a, b, c, d rebase with relative ease, and justify d passes,
  push d (so that its CI starts) and then push a, b, c -- let the ci system validate. unless a
  sprint is already stacked, they should choose a stack order of least drama". *Orchestrator:* a
  restacking agent puts #96 to #99 in one line on main (its order, least drama), justify once at
  the top. Every later thread, once filed, is restacked onto the line's top.
* **The first-emit deviation** -- "yes proceed as you recommended": accepted as built; thread 13
  strikes it from TODO if listed.
* **A failed `openVault` leaks its subscription** -- "yes": closed (fixed by #61); thread 13 ticks
  it off in TODO.
* **The gripes session's PRs** -- the Coach handles #81 (to draft, before 1.0.0) and #66.

#### 15. e2e_home (sonnet)

> **A home for cross-harness tests.** Rec: a private workspace package beside `demos/`, say
> `e2e/`, never published, holding those tests; `safebyok-convex`'s own `package.json` then lists
> no React at all. The Coach: "yes"

*Gloss.* From main. A private workspace package (`e2e/` at the root, or `packages/`-adjacent as
`demos/` is: follow the demos' layout and naming), `"private": true`, with its own justify scripts
so the root's `pnpm justify` runs it. Move Convex's tests that use a real `ConvexReactClient` (and
anything else that pairs a store with a framework) into it, and drop `react` (and `react-dom`,
`@testing-library/*`, if only those tests used them) from `safebyok-convex`'s devDependencies. The
moved tests must still fail when what they test is broken: move them, don't rewrite them. CLAUDE.md's
*Layout* names the new directory. `tests:` / `tools:`.

#### 16. late_unlock (sonnet) -- stacked on #98

> **A second dialog after a late unlock (#98).** Rec: close the newer dialog too, settling its
> waiters as unlocked, in a small follow-up on the React binding. The Coach: "yes"

*Gloss.* Cut from #98's restacked tip. In `vault-provider.tsx`, when an unlock lands (the vault's
snapshot turns unlocked) while a newer dialog is asking, close that dialog and settle its waiters
as unlocked (they retry their actions), instead of leaving it up. #98's test that pins "a late
unlock settles only its own dialog" changes to the new behaviour, and the thread file says so.
`client:`.

#### 17. validation_note (sonnet) -- waits on #101

> **Label grammar on the server?** Should Convex, Postgres and GraphQL refuse a label outside the
> grammar server-side, and not only in the client? The Coach: "The other sprint is adding these to
> a todo section called "What exactly are we guaranteeing with these validators" or something. Add
> a description of this there. Don't add new code"

*Gloss.* That section arrives with another session's #101 (`20261016-docs_rulings`). Once #101
merges, a documents-only thread from main adds to it a description of the server-side question:
today the label grammar is checked only in the client, so a store reached by another client (or a
host's server code) can hold a label outside it; what each of Convex, Postgres and GraphQL could
check, at what cost; no recommendation beyond what the section's own framing asks. `plan:`.

#### 21. damaged_erase (sonnet) -- stacked on #108

> **A damaged vault can't be deleted (#108).** When the stored vault itself fails its checks,
> `openVault` refuses with `damaged_bundle`, and `destroy()` needs an opened handle, so an app has
> no way to clear it and start over. Rec: a small `eraseVault`-style escape hatch (or `destroy`
> reachable without a handle) for exactly this case, behind the same care as `destroy()`. The
> Coach: "yes."

*Gloss.* Cut from the line's top once #108 files. Give a host a way to erase a vault that
`openVault` refuses as `damaged_bundle` -- and only that case: a narrow, documented call (say
`eraseDamagedVault(opts)` or a `destroy` reachable from the refusal), taking the same scope and
the same care `destroy()` takes (it erases the stored vault and the device's remembered unlock;
nothing else), refusing if the bundle is in fact sound. New public surface: name it in the PR's
open questions. `vault:`.

#### 22. flake_fixes (sonnet) -- on the line's top

*Orchestrator's thread*, from what CI and the workers met: tests that fail at random under load.
Convex's "lists, signs and erases the 1365 lockboxes..." (`packages/safebyok-convex/tests/component/
vaults.test.ts`, on main) takes 31-34 s under coverage against vitest's 30 s default; a React
`vault-provider` dialog test ("wrong passphrase...", "an action through withUnlockedVault summons
the dialog..."); the demo's `answerPassphraseDialog` and `VaultDashboard` delete. Find why each is
timing-dependent and make it deterministic (await the condition, not a delay); for the Convex test,
a per-test timeout sized to its work (YOLO decision 12: not a smaller fill, which would change what
it proves). `tests:`.

### Wave 2, freed

The gripes line has landed, so wave 2 is cut from main now: **7, indexeddb_fixes** at once;
**5, vaultdb_battery** stacked on thread 11 once it files (it audits against 11's contract);
**6** stacked on 5. **14, rotation_build** waits only on 13.

## Decisions taken in YOLO

1. Part 2 continues this sprint, its worktree and its doc, rather than starting a new one: the
   Coach's answers and the elevated tabs stay where they were written.
2. The error boundary stays hand-written (thread 3): the Coach's rubric says "skip it".
3. Threads 10 to 13 are cut from main now, not after the gripes line: they keep shared-file edits
   additive, and the restack absorbs the rest.
4. The Argon2 note rides thread 9 (stacked on #97) instead of a commit on #97 itself.
5. Thread 3 finishing (a second review and filing) runs beside three new threads, slightly over the
   cap of 3: it is a light thread with no builder.
6. The label-grammar description (17) waits for #101 to merge rather than stacking on another
   session's unmerged branch.
7. The two TODO tick-offs (first-emit, `openVault` leak) ride thread 13, which already edits TODO.
8. Threads 10, 11 and 13, interrupted when the last session ended, are resumed on the new main;
   thread 9 resumes on #97's restacked tip.
9. The cap of 3 counts threads being built; a thread in review or filing doesn't hold a slot.
10. New threads are cut from the line's top, not main, so they file without a restack (the Coach's
    one-stack preference); a thread cut from main earlier is restacked onto the top when it files.
11. Postgres's NOTIFY trigger becomes opt-in (thread 12), by the Coach's baseline: no operational
    work beyond tables and indexes unless the host opts in.
12. Convex's 1365-lockbox test gets a per-test timeout, not a smaller fill (thread 22).
14. Thread 21's flagged finding (an old build erasing a newer vault) is fixed by narrowing the hatch
    to refuse what may be newer; the "stored-shape change bumps `format`" rule goes to the Coach.
13. Thread 12 also corrects the older pending `20261015-store_vault_cap` changeset, which announced
    the column it removes.
15. Thread 14's flagged review (#120): S1 is taken in this PR -- the device mark also records the
    highest `vault_key_epoch` seen, bound into every envelope, so storage can't raise it -- because the
    mark is new and unshipped, and leaving it would undo rotation's promise once thread 19 lands. S2's
    honest message and an `eraseMark` recipe go in too (no new surface); a `rolled_back` hatch goes to
    the Coach.
16. #111 and #119 restacked onto main `cc32761` after the gripes line merged; justify green at #119.

## Not in this sprint

* **Elevated**, for the Coach to take to another session: the Postgres vault cap, revocation and
  server signing, and the store base class (tabs under Open Matters).
* **Still drafting** in Open Matters (part 2): label grammar on the
  server (the Coach: "leave alone"), the gripes session's open PRs, the two lines colliding; and,
  re-explained for the Coach, the first-emit deviation and the `openVault` subscription leak (the
  leak is already fixed on main, #61).
* **Ruled 2026-10-16, to TODO.md** (Soonish): `destroy()`'s edge cases, assessed once the
  contract and the unified tests settle; *Lock NOW vs soft lock*, the Coach holding #106's
  read-after-lock re-check until the guarantee is decided.
* **Ruled 2026-10-16, accepted**: a write returns no count (#107's departure from the manifesto;
  the Coach: "yes, better all around").
* **Ruled 2026-10-16**: Convex's own tests stay in `safebyok-convex`, the fake deployment shipped
  as a test-only `safebyok-convex/testing` entry; `e2e/` keeps only the `ConvexReactClient` half
  (#111, option b; thread 15 resumes).
* **Ruled 2026-10-16 (second round)**: the broad `format` rule ("any change to what a stored record
  may hold bumps `format`"), with a schema snapshot test to TODO's side quests; which ways in a
  rotation keeps moved to TODO's Soonish with the recommendation landed (keep only the proven
  ones; thread 19 ungated); the device-label question folded into TODO's NOT YET device lockout;
  #111's option (b) confirmed; one test container for every backend to TODO's side quests (the
  Coach: close out the PRs first, for the push to 1.0.0).
* `addPasskey`'s shape: kept as built (the Coach: "LGTM"); thread 4 records it.

## For the Coach

* **The two lines collide.** The gripes line was built on main from before big_feats, so its
  restack onto main meets the IndexedDB package move, the unlock envelopes and the passkeys. Wave
  2 waits for it. (A matter row asks how you'd like it ordered.)
