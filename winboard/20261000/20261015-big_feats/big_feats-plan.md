# Sprint big_feats -- plan

* **Date**: 2026-10-15
* **Mode**: YOLO
* **Review level**: medium
* **At once**: 3 threads
* **Issued by**: flip (the Coach)
* **Status**: amendments underway -- the six threads filed and restacked into one line on gripe_fixes' #82 (#82 → #71 → #76 → #73 → #78 → #74 → #77); amendment threads 7, 9 and 10 underway, 8 waiting on 7. Rulings: `winboard/20261015-big_feats/20261015-sprint_big_feats_rulings-human.md`

## Read first

Beyond CLAUDE.md, and STYLE.md and VOCABULARY.md before naming anything or writing a test:

* `TODO.md` on your base: your thread's entry (roadmap 3's first bullet for threads 2 and 3,
  roadmap 6 and 8, the *Side quests* for 4 to 6). It is the Coach's design intent; this plan
  glosses it.
* `winboard/20261015-second_harvest/20261015-sprint_second_harvest_done-human.md` and
  `winboard/20261015-second_harvest/second_harvest-plan.md` (on your base): what the stack below
  you just built -- zod/mini, epoch-ms times, the clock checks, the pluggable logger, `TH` test
  helpers published as `safebyok/testing` (whose `describeVaultDB` is the shared adapter suite).
* `notes/security.md`, and for threads 2 and 3 `winboard/20261014-crypto/decisions.md`.
* For threads 4 to 6, `packages/safebyok-convex/` as the packaging template (package.json,
  tsdown, eslint cut from the core's, vitest, README), and `packages/safebyok/src/vault-db.ts`.
* **The concurrent sprint.** Another sprint, **gripe_fixes**, is running beside this one on the
  same base, in different worktrees. Its plan is
  `/workspace/byok-gripe_fixes/winboard/20261015-gripe_fixes/gripe_fixes-plan.md` (read-only to
  you). Its thread 1 (`kdf_configs`) reshapes `KeyDeriver`; its thread 2 (`vaultdb_validation`)
  tightens `vault-db.ts`, `idb.ts` and `vault.ts`; its threads 4 (`ci_tooling`), 7
  (`test_helpers`) and 8 (`comment_width`) touch package scripts, tests and comments everywhere.

## Ground rules

* **The base is [#63](https://github.com/mrflip/safebyok/pull/63)'s tip**, `ea4b93d`
  (`origin/20261015-draft_version_pr`), the top of the second_harvest merge stack: merging #63
  with a merge commit lands the whole stack unchanged, so a branch cut from it needs no rebase
  afterwards. A thread cut there says **"Stacked on #63"** first thing in its PR body; one cut
  from another thread says "Stacked on #N" for that thread instead.
* **Push only with an explicit refspec**:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <branch>:<branch>`.
* **Small, additive hunks in shared files.** `notes/security.md`, `VOCABULARY.md`, `vault.ts`,
  `vault-db.ts`, `.changeset/config.json`, `pnpm-workspace.yaml`: the gripe_fixes threads edit
  them too. Add; don't reorganize.
* **New packages** (threads 1, 4, 5, 6) copy `safebyok-convex`'s packaging as it stands on your
  base: `safebyok` as a peer dependency (so `instanceof VaultError` holds across them), their own
  `eslint.config.mjs` cut from the core's, a README, a changeset, and a place in the `fixed`
  group of `.changeset/config.json` (a test refuses a public package left out).
* **Runtime dependencies the Coach has named, and so has said yes to**: `hash-wasm` (thread 1),
  urql's `@urql/core` as a peer (thread 6). Anything else at runtime is proposed in your report,
  not added. Development dependencies that are plainly the boring answer (PGlite, `graphql`,
  `fake-indexeddb`) may simply be installed: say so.
* **Storage adapters store records field by field, as the Convex component does** (the Coach,
  correcting the orchestrator's first rule). Every public field is its own typed column (the
  scope, ids, `passphrase_epoch`, `boxlabel`, `revision_id`, the times); each ciphered value
  (`Ciphered`) and any structured public payload (the envelope list `unlocks`, after thread 2) is
  its own opaque column (`jsonb`, or the backend's equivalent). Never one blob per record. The
  cipher binding is rebuilt from field values, not from stored bytes, so `jsonb`'s key reordering
  is harmless; strings are stored as-is, no unicode normalization. An adapter compares only the
  scope, `boxlabel`, `vault_id`, `passphrase_epoch` and `revision_id`. Because the columns follow
  the bundle's shape, **thread 5 rebases onto thread 2 before filing** (see *Order*).
* **`passphrase_epoch` keeps its name in this sprint** (YOLO decision 2). Do not rename it.

## Threads

### 1. argon2_wasm

> hash-wasm as a pluggable KDF

*Gloss.* TODO roadmap 6: a package, `safebyok-fastkey`, exporting a `KeyDeriver` over
hash-wasm's Argon2id, `hash-wasm` its dependency and `safebyok` a peer. The core keeps noble as
the default in `safebyok/browser`. It wears the same label, `argon2id_web_v1`, with the same
parameters; a test derives one fixed passphrase and salt through both implementations and
compares the bytes -- that test is what makes "same spec" a fact. README: Hermes has no
WebAssembly, so not for React Native. Measure both derivers' time in Node and report it.

*Base*: **gripe_fixes thread 1, `kdf_configs`**, once it has filed (cut from its tip; "Stacked on
#<its PR>"). It adds `KeyDeriverSpec`, an `argon2idDeriver(spec)` factory, and the rule that a
deriver wearing a supplied label must carry that spec's parameters. So this package exports the
wasm twin of that seam: `argon2idWasmDeriver(spec)` (or as STYLE.md names it) and a ready
`argon2idWasmWebV1Deriver`, both spreading the spec, so a host may run its own spec through
WebAssembly too. *Fallback*: if every other thread of this sprint has started and `kdf_configs`
still has not filed, the orchestrator cuts this from #63 instead, and the deriver is
`{ ...Argon2idWebV1, deriveKeyBytes }`, which fits both shapes.
*Touches*: a new `packages/safebyok-fastkey/`, `.changeset/config.json`, the lockfile,
`notes/security.md` (a second implementation behind one label). *Depends on*: kdf_configs.
*Look-ahead*: nothing later builds on it.

*Review:* `fixed`. Four fixes: a lone-surrogate passphrase among the byte-for-byte cases, the
test's hex encoder replaced by `Buffer`, an index test pinning the exports, and a
`notes/security.md` line that hash-wasm never zeroes its working memory. The equivalence held on
every point checked (parameters, variant and version, lane rounding, UTF-8), and a bundle of
either wasm export carries no noble. Left, minor: the 1 GiB refusal still names `@noble/hashes`;
`parseKeyDeriverSpec` takes a `KeyDeriverSpec`, not `unknown`; hash-wasm caches a failed compile,
and older Safari may need `'unsafe-eval'`; `pnpm size` builds the core twice; a duplicated test
helper. Not checked: real browsers' CSP behaviour. Filed as [#74](https://github.com/mrflip/safebyok/pull/74), stacked on #68.

### 2. unlock_envelopes

> multiple unlock phrases (envelopes)

*Gloss.* TODO roadmap 3's first bullet, built now: the bundle's `key_deriver_label`,
`passphrase_salt_b64` and `vault_key_passphrase_wrapped` become `unlocks`, a list of envelopes
`{ method: 'passphrase', key_deriver_label, salt_b64, vault_key_wrapped, ... }`, each wrapping the
one vaultKey, each method with its own binding purpose. And the user may hold several
passphrases: add one, remove one, change one. A stored-format change, allowed before 1.0 with
no migration: an old bundle fails validation and reads as corrupt, and the changeset says so.

Calls this thread makes and records (recommendations, not orders):

* **An envelope has an id** (`unlock_id`, random) so it can be named for removal and change, and
  likely a host-chosen `unlocklabel` (a Label, "work laptop phrase") so a user can tell them apart.
  The envelope's own fields are in its binding.
* **What a locked vault shows.** The snapshot (or a method) lists the envelopes' public parts --
  id, method, label -- while locked. Thread 3 adds a passkey's `credential_id` and PRF salt to
  that listing, which a host needs *before* unlocking to ask the authenticator: design it to
  grow.
* **Unlock with several passphrases.** Keep a fresh salt per envelope (the standard; never share
  salts to save time). Then a passphrase is tried against each passphrase envelope, one Argon2id
  per envelope, or aimed at one by id. Pick, bound the worst case (a cap on envelopes is a fine
  answer), record the call and its unlock-time cost.
* **Never lock the user out**: removing the last envelope refuses. **Removal is not
  revocation**: whoever knew a removed passphrase and kept a copy of the old bundle still holds
  the vaultKey; rotation is out of scope. A `notes/security.md` entry says so.
* `passphrase_epoch` bumps on any envelope change and keeps its name (YOLO decision 2).
* The remembered device unlock (`vault_key_local_wrapped`) stays as it is: it is not an envelope.

*Touches*: `types.ts`, `vault.ts`, `crypto.ts` (purposes), the `TH` fixtures (`bundleOf`), the
Convex component's schema and validators, the React binding if it names bundle fields,
`notes/security.md`, VOCABULARY.md (envelope, unlock), README. *Depends on*: nothing; cut from
#63. *Look-ahead*: thread 3 stacks on this and adds the second method; leave the method a
discriminated union with one member, and the listing ready to carry method-specific public
fields.

*Review:* `fixed`. One fix: an unlock aimed at one envelope (`unlockId`) on a vault destroyed
elsewhere silently made a new vault, and now refuses `absent_unlock`. Left, minor: a taken
`unlocklabel` is `bad_label` (misuse), not a condition; another deriver's envelopes are passed over
silently; small cleanups. Two minor findings were fixed by the worker at the orchestrator's word
before filing: a malformed or wrong-length `salt_b64` refuses as `corrupt_record` (checked at
unlock in `envelope.ts`, not in the schema, to keep the size budget), and a blank proof
passphrase is refused up front. Filed as [#71](https://github.com/mrflip/safebyok/pull/71),
rebased onto main after the second_harvest stack merged.

### 3. passkey_unlock

> Fingerprint unlock (passkeys, hardware keys)

*Gloss.* TODO roadmap 8: the WebAuthn PRF extension yields 32 bytes per credential (passkeys and
hardware keys alike: a security key's `hmac-secret` is what PRF runs on). An envelope of method
`passkey` holds its `credential_id`, the PRF salt it was evaluated with, and the vaultKey wrapped
under a key made from those bytes (`importWrappingKeyBytes`, or HKDF first if the binding wants
it: follow a published construction, never invent one). Its own binding purpose. **The core takes
bytes; the WebAuthn call lives in the host or the React binding**, never the core: a small
framework-agnostic helper beside the React binding, or in it, is this thread's call. Adding a
passkey requires an unlocked vault; unlocking with one is an unlock like any other
(`askPassphraseAt` and the remembered device unlock apply as to a passphrase). A
`notes/security.md` entry on what a credential-held key does and does not protect against
(device theft with biometrics, a synced passkey's cloud account, removal not being revocation).
Tests mock `navigator.credentials`; no real authenticator is needed. The demo gains an "add
fingerprint" button if it is cheap.

*Touches*: `types.ts`, `vault.ts`, crypto helpers, `safebyok-react` (a helper and maybe dialog
copy), the demo, `notes/security.md`, VOCABULARY.md, READMEs. *Depends on*: thread 2 (cut from
its tip once filed). *Look-ahead*: none.

*Review:* `fixed`. One demo fix: "Add fingerprint" made a passkey before refusing the empty
starting passphrase, orphaning it. The construction held (HKDF per RFC 5869, an unambiguous
`info`, the whole header in the AAD), as did the proof paths and the helper. At the
orchestrator's word, `createPasskey`'s doc now says a dismissed fallback also orphans a
credential. Left, minor: HKDF `info` leaves out `vault_id` and the scope (a construction call for
the Coach); `addPasskey` checks its proof only after the passkey exists; one damaged passkey
envelope blocks every passkey; the button reads the snapshot without subscribing; two cleanups.
Not checked: a real authenticator. Filed as [#76](https://github.com/mrflip/safebyok/pull/76),
stacked on #71.

### 4. indexeddb_package

> The IndexedDB vault store as its own package

*Gloss.* TODO's side quest: `safebyok-indexeddb`, the documented example of a KV-store backend,
"duplicate this and type here, here and here", with its own tests, tsdown config and changeset,
so it is the template for packaging as much as for the adapter. `idbVaultDB` moves there;
`idbDeviceDB` stays in the core's `safebyok/idb` (the device store is a fact about the device,
not a backend choice). Duplicating the bell and BroadcastChannel plumbing is fine: a template
wants to be self-contained. Before 1.0 nothing binds backward, so `safebyok/idb` stops exporting
`idbVaultDB` outright: no re-export shim; the changeset says what a host changes (one import).
`browserOpts()` and the demo follow. Run `TH.describeVaultDB` over it. If the move makes the
truly atomic `versionedUpdate` side quest (one IndexedDB transaction) natural, it may come
along, declared.

*Base*: **gripe_fixes thread 2, `vaultdb_validation`**, once it has filed (cut from its tip;
"Stacked on #<its PR>"): it validates `idbVaultDB`'s `dbName` and VaultDB's inputs, and moving the
code before that lands would leave it a modify/delete conflict. *Fallback*: as for thread 1, cut
from #63 once nothing else can start. *Touches*: a new `packages/safebyok-indexeddb/`, the core's
`idb.ts`, `browser.ts`, `package.json`, `index.ts` docs, the demo, the README.
*Depends on*: vaultdb_validation. *Look-ahead*: threads 5 and 6 are SQL and wire backends; this
README is where "how to write an adapter" starts, so write it for an adapter author.

*Review:* `fixed`. Two fixes: the bell no longer calls a listener that unsubscribed between the
ring and its microtask (a closed vault tried to refresh and logged a warning), and
`vaultMeetsExpectation` needs a finite `passphrase_epoch`, as the core's `StandingBundle` does.
Atomicity, compatibility with vaults the core wrote, and a channel carrying only `'changed'` all
held. Left, minor: the BroadcastChannel keeps a Node or Bun process alive; a throwing listener
crashes Node (`reportError` an option); the device store's bell keeps its old ways; list and
erase read the whole store; a failed write's `cause` can be null; the race tests share one
connection. Filed as [#77](https://github.com/mrflip/safebyok/pull/77), stacked on #70.

### 5. postgres_vaultdb

> Postgres Vault DB

*Gloss.* TODO's side quest: `safebyok-postgres`, the example of a SQL backend. Recommended shape
(the thread's call, recorded):

* **No driver dependency.** The host passes a query function, `(text, params) => Promise<{ rows }>`,
  which `pg`'s `Pool.query` and PGlite's `query` already are (postgres.js needs a one-line
  wrapper; the README shows it). Tests run against a real Postgres in-process with PGlite
  (`@electric-sql/pglite`, a development dependency).
* **The SQL ships with the package**: the table DDL as an exported string (and/or a `.sql` file),
  a column per public field and a `jsonb` column per ciphered value (*Ground rules*), with a
  trigger that `NOTIFY`s on change.
* **Every verb is one statement**, so each is atomic without a transaction API: `versionedUpdate`
  is an `UPDATE ... WHERE vault_id = $ AND passphrase_epoch = $`, a lockbox write a single
  statement checking the standing bundle, an erase a `DELETE` guarded the same way.
* **Where it runs.** Postgres has nowhere to run the vault's verbs, and the vault runs in the
  browser: this VaultDB runs on the host's server, made per request for the signed-in user, and
  refuses (`not_permitted`) a scope naming anyone else -- the `getUserId` equivalent. The README
  gives the route recipe, and a short Supabase section (row-level security, realtime) if it is
  cheap.
* **Subscribe**: an optional `listen` hook the host wires to `LISTEN` (pg's notifications,
  PGlite's `listen`); without it, the VaultDB does not push.

*Touches*: a new `packages/safebyok-postgres/`, `.changeset/config.json`, the lockfile,
`notes/security.md` (the server-side authorization rule). *Depends on*: thread 2, for the
bundle's columns. Built from #63; **before filing, it waits for thread 2 to file, rebases onto
thread 2's tip** (allowed: this branch is unpushed), moves its bundle columns to thread 2's shape,
and files "Stacked on #<thread 2>". *Look-ahead*: **thread 6 runs this VaultDB behind GraphQL resolvers**, per request, and pushes
its change notifications out as GraphQL subscriptions: export the per-request factory and the
change hook in a shape a resolver can call, and keep its errors VaultErrors with kinds a wire can
carry.

*Review:* `fixed`. Two doc fixes: PGlite's `listen` must be called on its PGlite (passed bare,
it loses `this` and the VaultDB silently hears nothing), and `notes/security.md` says a driver's
`cause` can quote a whole failing row, ciphertext included. Atomicity, bound parameters,
`not_permitted` before every query, a scope-only NOTIFY and secret-free messages all held
(concurrency reasoned from Postgres's semantics: PGlite has one connection). The README recipe's
malformed body now answers 400, at the orchestrator's word. Left, minor: a rejected `listen` is
dropped silently; route-borne records unvalidated past scope and boxlabel; the NOTIFY scope
visible to any role; `listBoxRecords` copies the core's messages; `placeholderOf`'s plain Error.
Filed as [#73](https://github.com/mrflip/safebyok/pull/73), rebased onto #71 with its columns
moved to the `unlocks` shape.

### 6. graphql_vaultdb

> Graphql vault db (using the postgres vault db)

*Gloss.* TODO's side quest (urql), warned there as "not actually easy": subscribe and
`versionedUpdate` need resolvers on the host's server as well as a client. `safebyok-graphql`, in
two halves:

* **Server**: the schema as SDL (an exported string) and a resolver map over a VaultDB made per
  request -- in the README and the tests, thread 5's Postgres VaultDB -- so it drops into any
  GraphQL server (Yoga, Apollo, Mercurius) with no server dependency of ours. Records cross as
  JSON text, exactly as stored. A refusal crosses as a GraphQL error carrying its `kind` in
  `extensions`, never a record. Change notification is a subscription fed by the Postgres change
  hook.
* **Client**: `graphqlVaultDB(client)` over an urql `Client` (`@urql/core` a peer), mapping each
  verb to an operation and each error's kind back to a VaultError, and `subscribe` to the
  subscription.
* Tests run the whole round trip in-process: urql's execute exchange (or an equivalent) against
  `graphql-js`, PGlite behind, `TH.describeVaultDB` over the client.

*Touches*: a new `packages/safebyok-graphql/`, `.changeset/config.json`, the lockfile.
*Depends on*: thread 5 (cut from its tip once filed). *Look-ahead*: none.

*Review:* `fixed`. One fix: a subscriber leaving a quiet vault kept `vaultDB.subscribe`, and
Postgres's LISTEN, alive until the next write (a `ReadableStream`'s iterator queued `return()`
behind the pending `next()`); the stream is now read through a reader whose `cancel` ends it.
Leaks, authorization, fidelity and coalescing held. At the orchestrator's word, the README says
the server half and the host's server must share one copy of `graphql`. Left, minor:
`passphrase_epoch` as Int32; validation errors read as `storage_unavailable`; a `vaultDBFor`
misconfiguration crosses with its kind; helpers duplicated from the core. Not tried: graphql 16,
Apollo, Mercurius, graphql-ws, a real disconnect. Filed as
[#78](https://github.com/mrflip/safebyok/pull/78), stacked on #73.

## Amendments (after the Coach's rulings, 2026-10-15)

The Coach read the done note, answered most of its questions
(`winboard/20261015-big_feats/20261015-sprint_big_feats_rulings-human.md`), and asked for two things: restack the six PRs into
one mergeable line, and do the follow-up work in amendment PRs on top of it. The line is now
#82 → #71 → #76 → #73 → #78 → #74 → #77, with #77 at `12fc4d0`. The amendments are built from
#77, assembled into a line above it, and the sprint's documents PR (#79) goes on top of
everything.

*Ground rules for the amendments:*

* **No backward compatibility.** The Coach: "there's no need for backwards compatibility; the
  only available versions of the packages are deprecated." A changed stored shape gets no shim
  and no migration. An old record fails safe, and the changeset says what a host sees.
* **Restacks justify at the top.** The Coach: "if you can cleanly assemble a>b>c>d and d
  justifies, push them all and let CI have a chance."
* Not yet ruled, so not built: HKDF `info` binding, `listBoxRecords`, reporting swallowed
  subscription failures to the logger, and the epoch revocation note in `security.md`.

### 7. epoch_rename

> yes -- renaming passphrase_epoch to unlock_epoch across all five adapters
> yes -- Rename passphrase_epoch to unlock_epoch across the core

*Gloss*: one mechanical sweep. It renames the stored bundle field, `DeviceUnlock`'s field, the
`BundleExpectation`, and every adapter that stores or matches it: the core's memory VaultDB,
`safebyok-indexeddb`, `safebyok-convex` (its schema and component), `safebyok-postgres` (its
column) and `safebyok-graphql` (its schema field). It also covers docs (VOCABULARY, READMEs,
`notes/security.md`), comments, tests, the demo, and a changeset naming the stored-shape change.
Also sweep prose that calls it a "passphrase epoch" when it is the unlock epoch. The old field
name gets no alias. *Model*: sonnet. *Base*: #77 `12fc4d0`. *Look-ahead*: thread 8 stacks on it
and touches the same adapters.

### 8. store_vault_cap

> stores without limits can specify a large number, 1_200_300_400_500_600 will do if Infinity
> won't. Don't offer that constant from core, because each store should set their own. [...] --
> A vault size cap on the Postgres server: a lockbox-count check inside the insert, refusing
> vault_full, as the Convex component has.

*Gloss*, as the rulings note reads it:
* Every `VaultDB` declares a `maxLockboxes`, an abstract readonly beside `maxRecordBytes`, with
  no default and no constant in the core.
* A store with no limit of its own declares a large one: Infinity where the number stays in
  memory, `1_200_300_400_500_600` where it must cross a wire or be stored.
* `openVault` refuses with `bad_option` a `maxLockboxes` above its store's, and defaults to the
  smaller of `MaxLockboxes` and the store's.
* `safebyok-postgres` takes its limit as an option, has a default of its own, and enforces it
  inside the insert statement itself, so a hostile client cannot skip it. A new lockbox past the
  limit is refused as `vault_full`; a replacement never is.
* Convex declares the component's limit. GraphQL declares what its server half enforces (an
  option, defaulting to Postgres's).
*Base*: thread 7's tip, once filed.

### 9. unlock_fixes

From the rulings' *Smaller ones*, recommended as amendments:
* `addPasskey` checks its proof before it asks the authenticator for a new passkey, so a wrong
  passphrase leaves no passkey behind that opens nothing.
* `safebyok-indexeddb`'s BroadcastChannel no longer keeps a Node or Bun process alive (`unref`
  where the platform has it), and a listener that throws no longer escapes as an uncaught error.
* A test that sends a passkey envelope through `safebyok-graphql`, backing #78's claim that a new
  way in crosses with no change there (thread 6's restack report).
*Base*: #77 `12fc4d0`; restacked onto thread 8 at assembly.

### 10. docs_housekeeping

> yes, you are approved to name the packages safebyok-{graphql,postgres,etc} and modify the
> guidance docs including CLAUDE.md to reflect that.
> noted, add to security.md: "Dependencies: hash-wasm has no published audit"
> as long as nothing needs a package or anything, it's ok if there are test helpers in the common
> library that the core doesn't need -- TH.perUser into safebyok/testing

*Gloss*:
* CLAUDE.md's *Layout* lists every package (`safebyok`, `safebyok-react`, `safebyok-convex`,
  `safebyok-indexeddb`, `safebyok-postgres`, `safebyok-graphql`, `safebyok-fastkey`) and the
  `safebyok-<store>` naming rule for storage adapters. Do the same for PROCESS.md and any other
  guidance doc that names the packages.
* `notes/security.md` gets the hash-wasm entry: no published audit, and its working memory is
  never zeroed.
* `TH.perUser` moves from the Postgres and GraphQL tests into `safebyok/testing`, with a doc block
  and a test, and both suites use it.
* YOLO: pin `graphql-yoga` and `@graphql-tools/schema` (dev only, #78) to the newest release at
  least two weeks old.
*Base*: #77 `12fc4d0`; restacked onto thread 9 at assembly.

**Assembly**: #77 → 7 → 8 → 9 → 10 → #79, justified at the top only, then pushed together.

## Order

* **Now**: threads 2 and 5, from #63.
* **When gripe_fixes files `kdf_configs`**: thread 1, from it. **When it files
  `vaultdb_validation`**: thread 4, from it. (Fallback: from #63, once nothing else can start.)
* **When thread 2 files**: thread 3 starts, and thread 5 (if ready) rebases onto it and files.
  **When thread 5 files**: thread 6.

## Decisions taken in YOLO

1. **The base is #63's tip, the top of the second_harvest merge stack**, not `origin/main`.
   *Orchestrator:* the sprint skill says a thread standing on two unmerged threads waits. I read
   the stack as one: it is linear, and the Coach merges it whole by merging its top, after which
   every branch cut from it sits on main with no rebase. Cutting from main instead would rebuild
   each thread on code the stack rewrites (zod/mini, the times, the logger, `TH`). The gripe_fixes
   sprint made the same call. If this reading is wrong, the threads wait for the stack to merge.
2. **`passphrase_epoch` is not renamed `unlock_epoch` in this sprint.** TODO leaves the rename to
   the envelopes thread, and once passkeys arrive the old name no longer fits. But the rename
   touches the `VaultDB` expectation that every adapter reads, and three new adapters are built
   in parallel with thread 2. One mechanical sweep across the core and all five adapters, once
   these PRs land, is cheaper than every thread chasing it. Recorded as a follow-up.
3. **Threads 1 and 4 wait on the gripe_fixes sprint's `kdf_configs` and `vaultdb_validation`**,
   which rework exactly what they build on. Each falls back to #63 rather than stalling the
   sprint.
4. **Thread 5 builds beside thread 2 and rebases onto it before filing**, rather than waiting to
   start. Its columns follow the bundle's shape (the Coach's field-by-field rule), so it cannot
   file on #63 alone; building in parallel and rebasing an unpushed branch costs one column
   change.

5. **Amendment thread 10 pins the two young GraphQL dev dependencies** to releases at least two
   weeks old, a two-way door the Coach did not rule on.

## For the Coach

* Two sprints are rewriting the core at once (big_feats and gripe_fixes), both on the
  second_harvest stack. Thread 2 (envelopes) and gripe_fixes' `kdf_configs` and
  `vaultdb_validation` all edit `vault.ts`; whichever merges second rebases. The workers are told
  to keep shared hunks small.
* `safebyok-indexeddb` makes `safebyok/idb` stop exporting `idbVaultDB`: a one-import change for
  hosts, made with no shim because nothing binds backward before 1.0.
