# Sprint adapter_port: resolutions

The matters the Coach ruled during the sprint, swept from the sprint doc's *Resolved* tab and the
*Your calls* table of its *Cleanup* tab at the sprint's wrap-up. Each entry gives the matter as its row
put it (bold: the row's handle), the Coach's answer word for word ("(empty: took the Rec)" is an empty
`proceed`, which took the recommendation), where it was asked, and where the work went.

Batches run newest first; inside a batch, the doc's order (oldest first). The *Resolved* tab kept its
bullets as lists, one per batch of rulings, and carried no per-batch time beyond the date on each bullet
(all 2026-11-25), so a batch is a list as the tab held it. The Coach's chat rulings of 2026-11-26 and the
orchestrator's own calls have sections of their own.

## The Coach's chat rulings (2026-11-26)

Copied from `adapter_port-progress.md`, section "The Coach's rulings (2026-11-26), on D1's review".

* **Errors across the GraphQL wire.** "GraphQL is a transport: what goes in, goes out." The mechanism itself failing is
  `unexpected_error`. An issue conveying the result in our code (getUserId throws) is a VaultDB error, thrown by the
  code on receipt. A refusal by the library's rules (a watch scope failing its check) is misuse and gets its specific
  VaultDB error, never `unexpected_error`. An error in the wrapped vaultDB crosses as a delivered BadAnswer; the
  adapter does not re-throw it. The cases go in the adapter's header doc block.
* `ended` on SafebyokNotice: "lgtm" (spelled `isEnded` per *Naming*).
* The microtask before `onEnded`: demonstrated by a test in `packages/safebyok-graphql/tests/wontfix/`.
* `onEnded` is required on the base `doWatch`; the public `watch` supplies the noop default.

## Rulings in the Resolved tab, newest batch first

### Batch 5 (the tab's last list)

* **E1 side effect: a failed Convex function no longer falls back to the box this device holds** (the vault falls back only on `storage_unavailable`).
  * Coach: "no broken systems trying to succeed"
  * Date: 2026-11-25. Asked: #923.
  * Work: stands as built; no widening of the fallback.
* **Postgres: ship a ready-made `PostgresListen` for a pg Client?**
  * Coach: "yes write, in a new pr"; in chat: "postgres go ahead but in a new thread after all of your prs are filed"
  * Date: 2026-11-25. Asked: #930.
  * Work: thread G `postgres_listen`, after every sprint PR files.
* **Bad news after `onEnded`?**
  * Coach: "No it is explicitly ok for there to be news sent after it; change the note to say so."
  * Date: 2026-11-25. Asked: #930.
  * Work: #930: `VaultDB.watch`'s doc says news may follow `onEnded`.

### Batch 4

* **A failed Postgres UNLISTEN is swallowed** (with E3's guards gone, the host's listen may keep notifying a stopped watch).
  * Coach: in chat: "yes for onbadnews for the watch"
  * Date: 2026-11-25. Asked: #923, E3 rework.
  * Work: thread F `postgres_standalone`.

### Batch 3

* **GraphQL: how typed the wire is.** The design typed only the envelope; rec: type the asks' flat fields, keep records and `track`/`tracked` as JSON.
  * Coach: "ok for not records or track but most things, in ask and answer"
  * Date: 2026-11-25. Asked: #914, Q1.
  * Work: D's brief: type most of ask and answer; records and `track`/`tracked` JSON.
* **For coach: try the Convex README's setup.**
  * Coach: "I may have to do more to be able to try it, let's merge and I can rework so donnt wait on me for leaving draft more"
  * Date: 2026-11-25. Asked: #923.
  * Work: PRs leave draft once filed and green with everything below.
* **A write just as a Convex watch starts goes unannounced.**
  * Coach: "no fix; listing lazily will get this right in the end"
  * Date: 2026-11-25. Asked: #923.
  * Work: no code.
* **Convex can't store some sidecar keys.**
  * Coach: "refuse, don't store as JSON: the customer can do that themselves"
  * Date: 2026-11-25. Asked: #923 review.
  * Work: #923 rework: `bad_record` up front.
* **E1 plan: a failed Convex function refuses `storage_issue`, with Convex's error as its cause.**
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: Closer Look E1.
  * Work: #923 rework.
* **E4: Convex classifies each write twice, and bundles the core into the deployment.**
  * Coach: "I'll wokr on it"
  * Date: 2026-11-25. Asked: Closer Look E4.
  * Work: the Coach's.
* **E5a: nothing stops a release of a public package whose core is private.**
  * Coach: "coming out of private soon"
  * Date: 2026-11-25. Asked: Closer Look E5.
  * Work: no change.
* **E5b: a Convex test checks less than its title.**
  * Coach: "amke the tests good"
  * Date: 2026-11-25. Asked: Closer Look E5.
  * Work: #923 rework: that test, the two-clause titles, sloppy-input tests.
* **E6: a Convex watch resends the whole bank on every change.**
  * Coach: "enough to want to send deltas, the main thing is to not worry about polling"
  * Date: 2026-11-25. Asked: Closer Look E6.
  * Work: a new thread, `convex_deltas`.
* **E7: safebyok-convex publishes test machinery and unused refusal exports.**
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: Closer Look E7.
  * Work: #923 rework: refusal exports dropped, kind list tied; `/testing` kept.
* **E8: `postgres-driver.ts` is what the split left.**
  * Coach: "make the new postgres one standalone and amazing. Old one will be shut down real soon."
  * Date: 2026-11-25. Asked: Closer Look E8.
  * Work: a new thread, `postgres_standalone`.
* **Closer Look E2** (storage_issue vs unexpected_error when storage disagrees with the classifier). **E3** (lifecycle-crossing guards in the watch code). The row held both.
  * Coach: E2, in chat: "E2 I'll deal with." E3, in chat: "E3 remove the guards."
  * Date: 2026-11-25. Asked: Closer Look E2 and E3 (#923).
  * Work: E2 the Coach's. E3 done on #923 (Convex and Postgres; the unsubscribe-once and Postgres's unlisten-once kept, each for a non-crossing reason).

### Batch 2

* **Upgrading your Convex app empties its vaults** (new component table, no migration; old tables emptied before deploy).
  * Coach: in chat: "no objections to the emptying thing, no production releases have happened"
  * Date: 2026-11-25. Asked: #923.
  * Work: stands as built; README and changeset say so.

### Batch 1 (the tab's first list)

* **Base is #912, but stats is not under it.** Convex (B) builds on #912 without `doStats`, and gets it as rework once lease_shelf's line becomes one.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: plan, thread B.
  * Work: B's handoff; *Cleanup*, *Finally*.
* **Published names go to the new-core packages**, at 0.5.0, public, in the fixed group; the `-big` copies private.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: thread A.
  * Work: built in #916.
* **Convex and graphql leave the release group for now**, and come back with B and D.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: thread A.
  * Work: built in #916; B and D re-add them.
* **`pgClientOf` leaves `safebyok-postgres`**, moved to `-big`; port it back if the vault side needs transactions.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: #916.
  * Work: stands as built.
* **GraphQL is a design first**; D builds nothing until approved.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: thread C.
  * Work: #914; D waits on Q1.
* **GraphQL: send the vaultDB's own answer**, minus `ask`, not the internal Actual.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: #914, Q2.
  * Work: D's brief.
* **GraphQL: a refusal on every bad answer**, in an `err` field, never a GraphQL error, its cause never crossing.
  * Coach: "the approach is  transparently carry the answer across, which it sounds like what is happening"
  * Date: 2026-11-25. Asked: #914, Q3.
  * Work: D's brief; B's handoff.
* **GraphQL: one write mutation**, `safebyokWriteThing`, for put and del.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: #914, Q4.
  * Work: D's brief.
* **GraphQL: a revoked sign-in that ends a watch is reported** to `onBadNews`.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: #914, Q5.
  * Work: D's brief.
* **GraphQL: a bad record from the server refuses `storage_issue`.**
  * Coach: "Ok but don't catch  errors just to rethrow: it will make debugging harder if everything has turned into mystery meat storage issue"
  * Date: 2026-11-25. Asked: #914, Q6.
  * Work: D's brief; B's handoff (only a failed check of a received record is `storage_issue`; no catch-and-relabel).
* **GraphQL: the class is `GraphQLVaultDB`.**
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: #914, Q7.
  * Work: D's brief.
* **Frozen big's pointers now name the new packages**; a one-commit fix points them at the `-big` names.
  * Coach: (empty: took the Rec)
  * Date: 2026-11-25. Asked: #916 review.
  * Work: a commit on #916, with the notes sweep.

## The orchestrator's calls (from *Cleanup*, *Your calls*)

Not Coach rulings. Each is a call the orchestrator made on its own, listed for the Coach to see; the
Coach did not rule on them. Columns as the table had them: Matter, My call, Lands in.

* **Orchestrator's call, not a Coach ruling.** Matter: Where the refusal allowlist lives (#914, Q8): big's `crossedErr` and `vaultErrorOfCrossed`, what a refusal may carry over a wire
  * My call: Port its file into the new core, per `notes/transition.md`, whenever B or D first needs it, so Convex and GraphQL share one list
  * Lands in: B (Convex) or D, whichever is first
* **Orchestrator's call, not a Coach ruling.** Matter: The old GraphQL e2e suite (#914)
  * My call: `e2e/tests/graphql` becomes `e2e/tests/graphql-big`, and the new suite takes the old name, as the packages do
  * Lands in: D2
* **Orchestrator's call, not a Coach ruling.** Matter: convex-big's Convex agent skills (.claude/skills) came over into safebyok-convex (#923)
  * My call: Keep them: they belong with the package
  * Lands in: #923, as built
* **Orchestrator's call, not a Coach ruling.** Matter: Q8 refusal allowlist: Convex didn't need it (it sends only identity_revoked and bad_record, as convex-big did) (#923)
  * My call: D ports big's crossedErr file into the new core
  * Lands in: D1
* **Orchestrator's call, not a Coach ruling.** Matter: Exported names in the new safebyok-convex that break STYLE.md: demandCaller awaits (so checkCaller), SafebyokErrorKind (smush kind), FakeDeployment.as and .arrange (reach past the API) (#923 review)
  * My call: Rename now, before the package's first release: checkCaller (with notes/security.md's entry, through its subagent), SafebyokErrorkind, _cheat_ names
  * Lands in: A rework on #923
* **Orchestrator's call, not a Coach ruling.** Matter: SQLSTATE 42501 (insufficient privilege) in safebyok-postgres: old changelogs mapped it to not_permitted (#930)
  * My call: Keep storage_issue: it is the server's own database role lacking a grant, not the user lacking permission
  * Lands in: #930, as built
