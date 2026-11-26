# Sprint adapter_port

Date: 2026-11-25. Mode: **YOLO**. Issued by the Coach.

Levels (default): review `medium`; worker `thread-worker` on its own model and effort; reviewer `thread-reviewer`
on its `sonnet` pin; style pass `style-reviewer` on its `sonnet` pin. Up to 3 threads at once.

Sprint doc: https://claude.ai/artifact/LdbJqWk27MHUvdCNQGBFTK (doc 9ef98d92-eb17-4e25-8ee6-e23d6871618e; tabs: Open Matters 6e187ae9-478a body b6bb67df-8264, State enum f88d13eb-9fff; Cleanup 23302d02-ef2b body f42312cf-406e; Progress 91b99d7f-31f1 body 3eb8062d-a469; Resolved 3c0c907f-62db body 9e44ff2c-c3ac). Bookmark rev: Open Matters 2.

Status: line on main 70dc5189e: #916 → #923 → #931 → #930 → #914 (all ready, CI green, justify green at the top) → #932 D1 `graphql_vault` (reviewed fixed, rework on minors 1–5, 7, 8 under way) → #913. G `postgres_listen` waits on D1 filing. Base synced at 0befbc37d (stale: before E, F, C moved). Cleanup adds: D1 doc blocks (review minor 9) for the documentarian.
ready. D waits on the Coach's yes to C's design.

## Read first

* `notes/transition.md`, whole (it is short): exports, and using what big has.
* `PROCESS.md`, *Packages*.
* `packages/safebyok/src/storage.ts`: what a storage adapter is written against.
* `packages/safebyok-idb-lean/` and `packages/safebyok-postgres/src/postgres-vault-db.ts`: the two new-core adapters
  that exist, as models.

## Ground rules

* **The lease_shelf sprint is still running** in another session (#900–#912, and thread 7 `one_watch`, unpushed).
  Its line is not yet one line: #905 `stats` (`doStats`, on every new-core vaultDB) and #911 `pg_read_tc` stand on
  separate branches, not under #912. Never touch its branches or worktrees. This sprint's threads are cut from
  #912's branch, `20261125-lifecycle`; `scripts/file-thread` rebases them onto its reviewed tip.
* **The `-big` packages are frozen**, like safebyok-big: they change only to be renamed, and to follow a renamed
  dependency. They become `private: true` and leave the `fixed` group in `.changeset/config.json`.
* **A published name passes to the new-core package.** `safebyok-indexeddb`, `-react`, `-postgres`, `-fastkey`,
  and once ported `-convex` and `-graphql`, keep their version and stay public in the `fixed` group, as
  `safebyok-postgres` does today, though the core they build on is private at 0.0.0. Publishing waits for the
  core's release; this sprint cuts none.
* **A package's directory and its name agree.** `git mv` the directory, so history follows.
* **Dependencies**: each new-core adapter has `safebyok` as a peer dependency (PROCESS.md, *Packages*), never
  `safebyok-big`; what it needs from big it reaches through `safebyok/storage` or `safebyok/core`, which re-export
  it (`notes/transition.md`).
* **Changesets**: a changeset for each public package whose content changes, saying what a host sees
  (`safebyok-indexeddb` and `safebyok-react` now run on the new core, a breaking change before 1.0.0); `--empty`
  where only private packages change.

## Threads

### A. `big_names`: the adapters on big become `-big`, and the ported ones take the names

> Would you rename the adapters that still hit -big to -big (safebyok-convex-big, etc) including the idb one, then
> port them to the new code? […]
> Yes to react, fastkey  publishin.

Gloss. The moves:

| Today | Becomes |
|---|---|
| `safebyok-indexeddb` | `safebyok-indexeddb-big` |
| `safebyok-idb-lean` | `safebyok-indexeddb` |
| `safebyok-react` | `safebyok-react-big` |
| `safebyok-react-lean` | `safebyok-react` |
| `safebyok-convex` | `safebyok-convex-big` |
| `safebyok-graphql` | `safebyok-graphql-big` (depends on `safebyok-postgres-big`) |
| `safebyok-postgres` | **split**: `bank-*` files, their SQL and tests, and `PostgresBankDB` to `safebyok-postgres-big`; the `vault-*` files stay, and `safebyok-postgres` drops `safebyok-big` |
| `safebyok-fastkey` | stays; ported in place: imports from `safebyok-big` become `safebyok` / `safebyok/browser` |

Then every consumer follows: `demos/safebyok-demo-react` and `e2e/` to the `-big` names; the dojo, envman and
knockknock demos to `safebyok-react` and `safebyok-indexeddb`; each package's eslint config, README title, vitest
config and `exports.test.ts`; the `fixed` group (drop `convex` and `graphql` until B and D bring them back); root
tests whose fixtures name a package (`tests/scripts/dependabot.test.ts`); PROCESS.md *Packages*; the root README's
package list. A `-big` README gains one line at the top: frozen, on safebyok-big, until its port replaces it.
`safebyok-postgres`'s `index.ts` exports its vaultDB, which today it does not (#911 says "`PostgresVaultDB` is not
yet exported"). Notes and whiteboards that name the old directories are left alone (CLAUDE.md: a note naming
big's files describes big alone).

Depends on: #912. Look-ahead: B builds a new `safebyok-convex` beside `safebyok-convex-big`, and copies what it can
(validators, refusals, the testing harness); D the same for graphql. Size: large but mechanical; the postgres split
is the one place for judgment. Levels: review `low`.

*Review:* fixed (ran at medium, the reviewer's floor). Fixed: `postgres-driver.ts`'s `causeOf` phrase and `refusalOf` doc and tests. Left: stale `-lean` names in `notes/wontfix.md` and `notes/react_lib_principles.md` (docs sweep, *Cleanup*); frozen big's README, doc blocks and an `askPasskey` phrase now point at the new-core names (Coach's row); long doc blocks in `postgres-driver.ts` and fastkey's test helpers (`documentarian`, *Cleanup*); five banners in `postgres-driver.ts` (nit, dropped).

### B. `convex_vault`: a new-core `safebyok-convex`

> […] then port them to the new code

Gloss. A Convex component with one `things` table keyed by `[userid, banklabel, labelpath]`, and a
`ConvexVaultDB` on `AdapterVaultDB`, modelled on `PostgresVaultDB` (each call one Convex mutation or query, written
only over the Thing it cites; a watch from a reactive query). It ports from `safebyok-convex-big` what still fits:
validators, refusals, the `testing` harness, the server helpers. The VaultDB battery in
`packages/safebyok/tests/test-helpers/vaultdb-battery.ts` runs against it, as it does for idb and postgres.
Exported from `src/index.ts`; README rewritten for the new core, from `safebyok-indexeddb`'s.

**Look-ahead / gap:** #905 adds `doStats` to `AdapterVaultDB`, and #911 an optional `read_tc` on `Received`; neither
is on #912's line. B builds without them; when the lease_shelf line becomes one, B is rebased onto it and given
`doStats` (and may send `read_tc`) as rework (*Cleanup*, *Finally*).

Depends on: A (ready). Size: large. Levels: review `medium`; worker effort high.

*Review:* fixed (`medium`, on opus: the identity gate traced and sound). Fixed: `DB` star import, smushed `path` names, `demandUnwritten`/`checkedWritten`, `isWrite` on its own line, two test titles, two README facts (what a write fetches; Convex's object-key limit). Left: sidecar keys Convex refuses (Coach's row); `demandCaller`→`checkCaller`, `SafebyokErrorkind`, `_cheat_` names on `FakeDeployment` (my call: a rework now); doc blocks, `@example` twins, sloppy-input tests (`documentarian`, *Cleanup*); a split of two two-clause test titles; `writeAt`'s re-fetch (harmless, dropped). Unconfirmed: the changeset's "Convex refuses to deploy" (added to the Coach's upgrade row).

*Orchestrator:* A left `packages/safebyok-convex` free; the new `safebyok-postgres` exports `PostgresVaultDB`, `thingsChannelOf`, `VaultTablesSql`, `VaultFunctionsSql` and its driver code is `src/postgres-driver.ts`, the model for B. B moves convex-big's CHANGELOG to the published name, as A did for indexeddb and react.

### C. `graphql_design`: how a new-core vaultDB travels over GraphQL

> […] then port them to the new code

Gloss. A design, not code: `whiteboard/20261125-adapter_port/graphql_vault-design.md`. A GraphQL client vaultDB
(`GraphqlVaultDB`) and the server resolvers that wrap a server-side vaultDB (`PostgresVaultDB`): one operation per
vaultDB verb (get, list, put, del, birth, get-world, and `stats` from #905), the subscription that carries a watch,
how asks and answers and refusals cross the wire, what `safebyok-graphql-big` has that carries over (schema
helpers, the yoga recipe), and the e2e suite. The wire schema is a public surface: a one-way door. The thread
ends at the design, with its open questions for the Coach.

Depends on: nothing beyond #912's line. Size: medium. Levels: review `none` (no code); worker on opus.

*Review:* none, docs only. *Orchestrator:* ready as #914 (compacted once). Open questions Q1–Q7 in *Open Matters*; Q8 (the refusal allowlist ported into the core) and the e2e rename (`e2e/tests/graphql` → `graphql-big`) are my calls, on *Cleanup*.

### D. `graphql_vault`: a new-core `safebyok-graphql`

Gloss. Built from C's design once the Coach approves it. Not started in YOLO without that yes. *Orchestrator:* C splits it in two: D1 the package (`GraphQLVaultDB`, if Q7 holds, and `vaultResolvers`), D2 the yoga recipe, a real-Postgres e2e harness for `PostgresVaultDB` and the e2e suite. D must export classifier checks private today (`shellAt`, `listedThingOf`, `rootStoredOf`, the listing kids' check).

Depends on: C, the Coach's yes, A, and #905 and #911 on the line. *Orchestrator:* all met: Q1 ruled 2026-11-25, "ok for not records or track but most things, in ask and answer"; lease_shelf merged to main.

*Orchestrator:* Coach's rulings (2026-11-25): Q2 answer-shaped; Q3 every bad answer ("transparently carry the answer across"); Q4 one mutation; Q5 report it; Q6 `storage_issue`, but "don't catch errors just to rethrow": only a failed check of a received record refuses it; Q7 `GraphQLVaultDB`. Q1 re-explained (the keys are `bank`, `gate`, `box`; the reason for JSON is `tracked`'s record-or-`'same'`), awaiting the Coach.

### E. `convex_deltas`: a Convex watch that sends what changed

> E6: enough to want to send deltas, the main thing is to not worry about polling

Gloss. Today `watchThings` returns every Thing of the bank, so each box put re-sends every box's ciphertext to every
watcher and the client diffs it all. Make the watch carry only what changed, still pushed by Convex's reactive query
(no polling): e.g. a query over the bank's Things changed since a cursor (an index on a change stamp), the client
advancing its cursor as notices arrive. Design inside the thread, from Convex's docs (library first). Keeps
`#no-slop-crossings`: no guards for a result after unwatch. Main's #926 added an optional `onEnded` to `VaultDB.watch`; where a Convex watch ends before its stop, it calls it. Depends on: B's rework batch. Size: medium. Levels:
review `medium`; worker on opus.

### F. `postgres_standalone`: the new safebyok-postgres, standalone and amazing

> E8: make the new postgres one standalone and amazing. Old one will be shut down real soon.

Gloss. `safebyok-postgres` no longer bends to the old one: fold `postgres-driver.ts`'s watch plumbing and vaultDB
refusal back into `postgres-vault-db.ts` (or into concepts of their own), keep pg's error mapping where it reads best,
drop the line-for-line copies' old wording, and make the package read as one clean adapter: README, exports, tests.
Also *Coach (2026-11-25): "yes for onbadnews for the watch"*, and *(2026-11-25) "it is explicitly ok for there to be news sent after it; change the note to say so"*: a failed UNLISTEN at a watch's stop is reported to `onBadNews`, not swallowed. And main's #926 (`watch_recovery`) added an optional `onEnded` to `VaultDB.watch` ("called once where the watch ends before its stop is called"): a Postgres watch that ends itself on a failed fetch calls it.
Depends on: B's rework batch (E3's Postgres edits are on #923). Size: medium. Levels: review `medium`.

### G. `postgres_listen`: a ready-made PostgresListen for node-postgres

> yes write, in a new pr … postgres go ahead but in a new thread after all of your prs are filed

Gloss. `safebyok-postgres` exports a `PostgresListen` built for node-postgres's `Client` (a dedicated connection, LISTEN/UNLISTEN, notification routing by channel, reporting a failed UNLISTEN as news), replacing the README's recipe; D's server can use it. Cut only after every other sprint PR has filed. Depends on: all of A–F and D1 filed. Size: small. Levels: review `low`.

## For the Coach

* #912's line is not the whole lease_shelf sprint: #905 `stats`, #906 `probe`, #910 `devicetok`, #911
  `pg_read_tc` stand on separate branches, and thread 7 `one_watch` is building. This sprint is cut from #912; it
  rides on whatever line lease_shelf's wrapup makes.
