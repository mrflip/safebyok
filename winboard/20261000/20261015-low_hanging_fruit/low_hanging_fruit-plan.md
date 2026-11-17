# Sprint low_hanging_fruit: plan

* **Date**: 2026-10-15
* **Mode**: YOLO
* **Review level**: medium
* **Threads at once**: 3
* **Status**: done -- fourteen threads, all filed; see the progress document and `winboard/20261015-low_hanging_fruit/20261015-sprint_low_hanging_fruit_done-human.md`.
* **Issued by**: the Coach (flip), from the preplan
  `winboard/20261014-low_hanging_fruit/20261014-low_hanging_fruit-preplan.md`, which is on
  `20261015-roadmap_fruit` ([#26](https://github.com/mrflip/safebyok/pull/26), unmerged)
* **Status**: underway; see the progress document's status line

Sprint worktree `/workspace/byok-low_hanging_fruit`, branch `20261015-low_hanging_fruit`. Sprint
directory: `winboard/20261015-low_hanging_fruit/`. Sprint doc (live mirror, a tab per thread):
[Sprint low_hanging_fruit](https://claude.ai/code/artifact/5c68c0cb-3736-4ae7-9973-f69c1cdc5fe9).

## Read first

* `CLAUDE.md`, `PROCESS.md`, `STYLE.md`, `VOCABULARY.md` (main's copies).
* *Orchestrator, 04:55 UTC:* **[#26](https://github.com/mrflip/safebyok/pull/26) has merged**, so a
  thread cut from today's `origin/main` has these files; a thread stacked on an older branch reads
  them with `git -C /workspace/byok show origin/main:<path>`:
  - `winboard/20261014-low_hanging_fruit/20261014-low_hanging_fruit-preplan.md`, the source of
    every thread below. Its header ("Rulings these rest on") and its *Open to the Coach* apply to
    all of you.
  - `STYLE.md`: it adds the rule that every time is UTC epoch milliseconds, an integer.
  - `TODO.md`: the roadmap items and *Sand in the sandals* the threads cite.
  Follow what they say, but do not copy their edits into your branch: #26 lands them.
* `winboard/20261014-crypto/rulings.md`, for threads 1, 2, 6 and 7.
* `notes/security.md`, before you decide something a security reviewer should see.

## Ground rules for this sprint

* **Changesets**: every thread carries one, written with `pnpm changeset`. A real one when it
  changes a published package (`safebyok`, `safebyok-react`); `pnpm changeset --empty` otherwise.
  Threads 1, 2 and 5 change the public surface before `0.1.0`, so their changesets and their
  PRs' first lines say what a host does about it.
* **The sprint doc**: the Coach asked that each worker *also* mirror its thread file into that
  thread's own tab of the sprint doc. The orchestrator made the tab; your handoff names its doc
  id and body node id. You are that tab's only writer: overwrite it whole, with the whole text
  of your `thread-<N>-<label>.md`, each time you commit that file (at `ready`, at `filed`, at
  `blocked`). The repo file is the source of truth: write and commit it first, mirror second.
  Load `guide( items = ["topic.index", "topic.editing"] )` before your first docs call. Never
  touch another tab. If the Docs tools are missing or refused, say so in your report and carry
  on: the orchestrator mirrors it instead.
* **Work in flight beside the sprint, not ours**:
  - `/workspace/byok-strict_configs` (`20261015-strict_configs`): an agent's large uncommitted
    diff over the eslint and tsconfig files, `package.json`s, and parts of `vault.ts`,
    `vault-db.ts`, `types.ts`, `idb.ts`, the React provider and the Convex package. Live as the
    sprint starts. Never touch it; whichever lands second rebases, and that is the Coach's to
    sequence.
  - `/workspace/byok-open_vault_unsubscribe`: uncommitted, untouched since 02:16 UTC. Thread 3
    reads it; nobody writes to it.
  - The main checkout has another agent's uncommitted work. Read it, never write to it.
* **The vault.ts chain.** Threads 1, 2, 6 and 7 all rewrite `openVault`'s options or `store()`,
  so they are stacked, one on the next (below): each starts from the one before it as filed, and
  inherits its decisions. Thread 8 stacks on 2. Everything else is cut from `origin/main`.

## Dependencies and order

```
origin/main ─┬─ 1 vault_size_cap ── 2 explicit_options ─┬─ 6 boundary_audit ── 7 stale_write_retry
             │                                          └─ 8 size_budget
             ├─ 3 provider_open_rejection
             ├─ 4 epoch_millis
             ├─ 5 mask_utils
             ├─ 9 docs_sweep
             ├─ 10 sandals
             └─ 11 label_grammar_report   (documents only: no review)
```

Start: 1, 3, 4. Then the lowest-numbered thread whose base exists, as slots free. The chain
(1, 2, 6, 7) is the critical path and its numbers keep it at the front of the queue.

## Decisions taken in YOLO

1. **Stacking 1 → 2 → 6 → 7, and 8 on 2.** The preplan ran most threads side by side from
   `main`; four of them rewrite the same lines of `vault.ts`, and stacking costs wall-clock time,
   not the Coach's time. The alternative (side by side, with the Coach rebasing at merge time) is
   open if the Coach prefers it.
2. **Thread 4 runs independently of thread 1.** The preplan's "1 and 4 first" assumed both
   touched `store()`'s timestamps; thread 4's own text excludes the stored `created_at` and
   `updated_at`, so it barely touches `vault.ts`.
3. **The preplan's recommendations on its *Open to the Coach* are taken as stated**: the entry
   is `safebyok/browser`; the adapter declares `maxVaultBytes` (bytes, not a count); the new
   kind is `vault_full`; `mask` keeps `maxLen`. Each PR says so in its first lines, so the Coach
   can overturn it before merging.
4. **Thread 8's two dev dependencies** (`size-limit`, `@size-limit/preset-small-lib`) go in
   without waiting: PROCESS.md lets the plainly boring dev dependency be installed, then
   reported.
5. **VOCABULARY.md's `mask` paragraph moves from thread 9 to thread 5**, which writes `mask`.
6. **The React README's error-boundary note moves from thread 9 to thread 3**, whose behaviour
   it documents (#32).
7. **Thread 1's open-time fit check** (`maxLockboxes * (maxWhisperBytes + 1 KiB) >
   maxVaultBytes / 2`, not the preplan's plain product) is accepted: measured, stronger, and the
   defaults fit.
8. **The cap of three counts building workers, not reviews**, so the queue does not idle while
   reviews run.
9. ~~**`mask`'s `maxLen` floor**~~ *superseded by the Coach, 2026-10-15 ~05:30 UTC (see 11)*: (thread 5's review): a `maxLen` below `head + tail + 9` is
   refused as `bad_option`, rather than collapsing into a longer result or letting the length
   show past `maxLen`. The reviewer leaned to "collapse only when shorter"; refusing keeps
   `maxLen` honest and the security note true.
10. ~~**`mask` strips bidi controls~~ *superseded by the Coach (see 11)*: and zero-width invisibles** (U+200B, U+2060, U+FEFF) as well
    as control characters, keeping ZWJ, ZWNJ, variation selectors and tags.

11. **The Coach's contract for `mask`** (in chat, ~05:30 UTC), replacing 9 and 10: not a
    faithful copy of head and tail but "a whiff of interesting text from each end, best effort,
    safely viewable in a log or reminder." No `Intl.Segmenter`; butcher simply, then always pass
    the whole output through a normalization stage that guarantees safe output (strip every
    invisible, and whatever would display oddly, such as bidi controls; one compact line). A
    `maxLen` too small for head + `***...***` + tail does not throw: it gives `maxLen` stars, no
    ellipsis, no head, no tail.

12. **The Coach's answers to #34's questions** (in chat): `maxVaultBytes` stays abstract, no
    default; every error kind (`vault_full`, `whisper_too_large`, the rest) is listed with its
    family in the core package, and the scattered lists are cleaned up (thread 13); the Convex
    component's `updateBox` enforces a cap server-side (thread 12). Both are new threads stacked
    at the end of the chain, so #34's stack stays valid.

13. **`mask` strips strong right-to-left letters** (#37's third review): with every bidi control
    gone, Hebrew and Arabic letters still reorder the digits and punctuation beside them, in the
    mask and the log line around it. Under the Coach's directive ("if you can safely strip things
    that would cause weird display (like the wrong end of a bidi), do so"), they are stripped too.
    The cost: those scripts vanish from a mask. On #37's open questions for the Coach to reverse.
14. **`store()` sleeps a long random while before each retry, doubling** (the Coach, in chat):
    "it should include a long random sleep that doubles each time to avoid thundering herds";
    three attempts in all stays ("more poetic"). As a new PR, thread 14 `store_backoff`, cut
    from #44's tip, so #44 can merge as it stands. My numbers, a two-way door: before retry
    *n* (1 or 2), a uniformly random wait in [2^(n-1), 2^n) seconds, so 1-2 s, then 2-4 s,
    at most 6 s added to a store that lost two races. Named constants, not options. The jitter
    guards no secret; it is drawn from `crypto.getRandomValues` all the same, because the core's
    linter keeps `Math.random` out of `src/` (#45).
15. **The Coach's answers after the sprint closed** (in chat):
    * #42: yes to `size-limit` and `@size-limit/preset-small-lib` as dev dependencies.
    * #37: `mask` lives in `safebyok/utils`; `Z.object` stays (so `mask` ships zod). Right-to-left
      letters: "strip the text direction markers and then chomp where things land ... make the
      string safe to butcher, then butcher, then check it is safe", and the doc says "mask is
      intended for plain text. Calling it with arbitrary blobs may give unusual behavior". My
      reading, built on #37: decision 13 is reversed, so right-to-left letters are kept while every
      bidi control and mark is still stripped, and the pipeline has three named stages.
    * #45: our retry stays; `p-retry` is noted under TODO.md's RAGEBAIT. The numbers stand.
    * #46: no host knob. Client and storage limits that disagree are undefined behaviour ("not a
      bug, but we won't say what will happen"), and the docs say so.
    * #50: `unknown_key_deriver` is misuse (as built).
    * #40: "allow unlimited, u do u". Thread 15 `unlimited_reentry`: `Infinity` is accepted, and
      the deadline is clamped to the latest `Date` (8.64e15 ms), so nothing stored or shown is
      infinite.
    * Asked for more explanation before deciding: the provider handing conditions to the context;
      #43's three questions; #44's `vault_locked` vs `stale_write`; #33/#32's screen-lock recipe
      and the `unlock()`/`lock()` race.
16. **The Coach's next answers** (in chat): the rebases of #37, #46 and #50 are the orchestrator's,
    force-pushes authorized (done with leases). The cost of `\p{M}` (Indic and Thai vowels, which
    are combining marks) is noted in `mask`'s docs on #37, and `maskCarefully` (marks kept, a few
    per base) goes under TODO.md's NOT YET. The far-future constant is exported as `FarFuture` (#53).
    zod/mini is not part of this sprint: it is roadmap item 7, whose baseline (#42) has merged.

## The threads

### 1. `vault_size_cap`

*The Coach's text, verbatim from the preplan:*

Nothing caps how many lockboxes a vault holds. On Convex, listing, watching and erasing each read
the whole vault in one transaction with a 16 MiB read budget (erase reads it twice), so past
about 150 lockboxes at the largest default whisper a vault cannot be erased (the package README
and `tests/component/vaults.test.ts` record the measurement). The pattern is the one
`maxWhisperBytes` already follows against `maxRecordBytes`:

* `VaultDB` declares `maxVaultBytes` beside `maxRecordBytes`: the most one vault may hold in
  all. `convexVaultDB`: 8 MiB (half the read budget, since erase reads twice); `idbVaultDB` and
  `localVaultDB`: `Infinity`. The abstract class documents the contract for adapter authors.
* `OpenVaultOpts.maxLockboxes`, default `MaxLockboxes = 100` (exported, searchable like
  `MaxWhisperBytes`), any positive integer. `openVault` refuses as `bad_option` when
  `maxLockboxes * maxWhisperBytes > vaultDB.maxVaultBytes`, with a message that names both knobs
  and the adapter's limit. The host raises either freely while the product fits.
* `store()` of a boxlabel not already in the vault, when the vault holds `maxLockboxes`,
  refuses as `vault_full`: a new error kind, a condition (the user can erase a box), never
  quoting a label it did not need to. Replacing a standing box is never refused by the cap. The
  count comes from the snapshot's boxes after the `refresh()` that `store()` already does.
* `safebyok-react`'s provider passes `maxLockboxes` through (its `satisfies` check will insist).
* Tests: the refusal at the cap, a replacement at the cap allowed, erase then store allowed,
  the `bad_option` on an impossible pair, the adapter suite checking each in-tree adapter
  declares a `maxVaultBytes`. The Convex README's "about 150" becomes "100 by default, raised
  with `maxLockboxes` as far as `maxVaultBytes` allows", and `notes/security.md` gets a line
  only if the thread finds one worth a reviewer's eye.

Model: Opus.

*Orchestrator's gloss:*

* **Touches**: `packages/safebyok/src/{vault.ts, vault-db.ts, errors.ts, index.ts}`, the in-tree
  adapters (`idbVaultDB`, `localVaultDB`), `tests/vault-db-suite.ts`; `safebyok-convex`'s
  `convexVaultDB` and README; `safebyok-react`'s provider props.
* **Model**: Opus. **Base**: `origin/main`.
* **Look-ahead**: `store()` today reads the box (`readBox`) *before* writing and calls
  `refresh()` only *after*, so "the count comes from the snapshot after the refresh store()
  already does" does not quite hold: decide where the count comes from and record why. Thread 7
  wraps `store()` in a retry that re-reads between attempts, so make the cap check a step that
  re-runs naturally on each attempt. Thread 2 stacks on this and also edits `OpenVaultOpts`, the
  option parsing at the top of `openVault`, and the provider's props: leave them tidy.

### 2. `explicit_options`

*The Coach's text, verbatim from the preplan:*

The main code path asks for every tree-shakeable choice; one subpath export supplies the defaults.

* `OpenVaultOpts.keyDeriver` becomes required. `openVault` no longer falls back to
  `argon2idWebV1Deriver` (`packages/safebyok/src/vault.ts`, the `??` at the deriver), which is
  what keeps noble in every bundle today. `argon2idWebV1Deriver` stays exported from the core.
* A new entry, `safebyok/browser` (named for what it assumes, not for whom it is for), exporting
  `browserOpts({ dbName }?)`: a bag `{ keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB({ dbName }) }`
  the host spreads into `openVault`. A bag, not a wrapper function, so there is one `openVault`
  to document and a host can override one field. The vault store is never in the bag: the
  backend is the one choice every host makes. The main entry must not import this one.
* `safebyok-react`'s `VaultProvider` prop `keyDeriver` becomes required too (it is optional
  today, so the typecheck fails the moment the core's option does, which is the point), and the
  demo passes `browserOpts()`.
* While the surface is open: the snapshot's `expiresAt` is renamed `askPassphraseAt` and
  `rememberForMs` becomes `forcePassphraseReentryHours` (TODO.md, roadmap 3 and 5), since both
  are one-line renames today and breaking changes after `0.1.0`.
* README (core): the quickstart imports from `safebyok/browser`; the tree-shaking paragraph says
  why the main path is explicit.
* Tests: `openVault` without `keyDeriver` refuses as `bad_option`; a bundle built from a bare
  `openVault` import contains no `argon2` (thread 8 makes this a budget; here, one vitest that
  greps the built chunk is enough).

Model: Opus.

*Orchestrator's gloss:*

* **Touches**: `vault.ts` (the deriver's fallback; the renames run through the snapshot and its
  tests), a new `src/browser.ts` with its `tsdown.config.ts` line and `exports` entry, the React
  provider and README, the demo, the core README, a test over the built bundle.
* **Model**: Opus. **Base**: thread 1's branch, once filed ("Stacked on #<1>").
* **Look-ahead**: thread 8 stacks on this and makes the "no `argon2` in a bare `openVault`
  bundle" check a size budget: keep the vitest simple, so 8 can keep or retire it. Thread 5 adds
  `safebyok/utils` beside `safebyok/browser` in the same `tsdown.config.ts` and `exports` lines,
  from `main`: an expected, mechanical conflict. Read TODO.md's roadmap items 3 and 5 from #26
  before the renames. `forcePassphraseReentryHours` is a duration, not a time, so it is not
  bound by STYLE.md's epoch-milliseconds rule; it still becomes milliseconds inside.

### 3. `provider_open_rejection`

*The Coach's text, verbatim from the preplan:*

`packages/safebyok-react/src/vault-provider.tsx` calls `openVault` with `void` and drops a
rejection. Hold the error in state and throw it during render, so an error boundary and the dev
overlay show it: every rejection `openVault` can produce before the vault exists is misuse
(`bad_option`, `bad_label`, `unknown_key_deriver`) or storage trouble that no user action fixes.
The full misuse-versus-condition split (TODO.md, *Error families*) is not this thread; this is
the one case that is silent today. Read `20261015-open_vault_unsubscribe` first: it closes the
subscription a failed open leaks, on the same path. Test: a provider given a bad label throws to
a boundary. Model: Sonnet.

*Orchestrator's gloss:*

* **Touches**: `packages/safebyok-react/src/vault-provider.tsx` and its test.
* **Model**: Sonnet. **Base**: `origin/main`.
* **Look-ahead**: `20261015-open_vault_unsubscribe` has no commits: its work is uncommitted in
  `/workspace/byok-open_vault_unsubscribe` (`git -C <it> diff`), untouched since 02:16 UTC, and
  some paths are from before the core moved to `packages/`. Read it to see where the two changes
  meet; do not carry its core change over. Threads 1 and 2 add and require props on the same
  provider: keep this change to the open effect and its error state.

### 4. `epoch_millis`

*The Coach's text, verbatim from the preplan:*

STYLE.md now says a time is UTC epoch milliseconds, an integer, everywhere. This thread makes
the code outside the stored records true to it: the demo's own records (`lib/auth.ts`
`created_at` is an ISO string), any `toISOString()` or `new Date(...)` in `src/` that is not
formatting for display, test fixtures, and the React package. The stored lockbox and bundle
fields (`created_at`, `updated_at`, ISO strings today) are **not** this thread's: they are
renamed and retyped together in the reservations thread (TODO.md, roadmap 3), and doing them
twice is churn. Grep for `toISOString`, `Date.parse`, `new Date(` and `_at:` to find the rest.
Model: Sonnet.

*Orchestrator's gloss:*

* **Touches**: the demo (`lib/auth.ts` and whatever else the grep finds), test fixtures, the
  React package; little or nothing in `packages/safebyok/src/`.
* **Model**: Sonnet. **Base**: `origin/main`.
* **Look-ahead**: STYLE.md's rule is on #26 only (Read first). Device records may already hold
  numbers (`expires_at`): check before changing anything stored, and change nothing in a stored
  lockbox or bundle. Thread 10 renames `tests/helpers.ts`: touch the test helpers as little as
  you can.

### 5. `mask_utils`

*The Coach's text, verbatim from the preplan:*

A `safebyok/utils` entry (its own line in `tsdown.config.ts` and `exports`) with
`mask(whisper, { head = 2, tail = 4, minStars = 6, maxLen = 15 })` as TODO.md specifies: strip
control characters first; keep `head` and `tail` characters and star the rest; when the whisper
is shorter than `head + tail + minStars`, give up head characters first, then tail; above
`maxLen`, put `***...***` between head and tail. Recommendation on the open choice: keep
`maxLen`, since the caller is sizing a table cell and thinks in characters shown, not stars.
Library search first (CLAUDE.md): a masking package that strips control characters and honours
a minimum star count is unlikely to exist, but the search is the rule, and the PR says what was
found. Tests per `@example`, including an empty whisper and one that is all control characters.
VOCABULARY.md mentions a stars-only variant: export `maskAll(whisper)` beside it, or strike the
sentence; the PR says which. Model: Sonnet.

*Orchestrator's gloss:*

* **Touches**: a new `src/utils.ts` (or a `mask.ts` it re-exports), its `tsdown.config.ts` line
  and `exports` entry, `VOCABULARY.md`'s `mask` paragraph (moved here from thread 9), the core
  README if it lists entry points.
* **Model**: Sonnet. **Base**: `origin/main`.
* **Look-ahead**: thread 2 adds `safebyok/browser` in the same lines (mechanical conflict).
  Thread 8 will want a budget entry for `mask`: if this thread has merged by then, 8 adds it;
  otherwise the PR notes it. `mask` handles a whisper: nothing of it reaches an error message.

### 6. `boundary_audit`

*The Coach's text, verbatim from the preplan:*

The audit the rulings ask for (`winboard/20261014-crypto/rulings.md`, *The boundary pattern*):
every "late" optional on a record (`Lockbox.note` today, the `public` bag, `whisper_schema_version`
and `whisper_codec` once roadmap 3 has added them, `DeviceUnlock`'s shape) is nulled, defaulted
and validated where it crosses storage or the public API, and trusted past that. Touches
`src/types.ts`, `src/vault.ts`, `src/vault-db.ts` and their tests. Model: Opus.

*Orchestrator's gloss:*

* **Touches**: `src/types.ts`, `src/vault.ts`, `src/vault-db.ts` and their tests; the device
  store's `DeviceUnlock` parsing.
* **Model**: Opus. **Base**: thread 2's branch, once filed (which stands on 1).
* **Look-ahead**: an audit first, a change second: say in the thread file which optionals were
  already right and which were not. Thread 7 stacks on this and wraps `store()`: keep `note`'s
  handling in `store()` easy to wrap. Fields that only arrive with roadmap 3 are named, not
  invented.

### 7. `stale_write_retry`

*The Coach's text, verbatim from the preplan:*

`stale_write` exists now ([#18](https://github.com/mrflip/safebyok/pull/18)). `store()` and
`erase()` retry a versioned update up to a small fixed limit (three) when the expectation fails,
re-reading between attempts, and surface `stale_write` only after that. Erases carry a
`vault_id` expectation only, so an erase retries only across a reborn vault, which is to say it
does not: a refused erase surfaces at once. The conflict-handler hook the rulings mention "with
the retry work" is API design and stays in TODO *Soonish*; this thread is the politeness only.
Tests: two sessions racing on one box, the loser's retry landing. Model: Sonnet.

*Orchestrator's gloss:*

* **Touches**: `vault.ts` (`store()`, `erase()`), `tests/vault.test.ts`.
* **Model**: Sonnet. **Base**: thread 6's branch, once filed.
* **Look-ahead**: thread 1's cap check must sit inside the attempt, so a retry re-counts. The
  limit of three is a named constant, not a magic number. No other thread builds on this.

### 8. `size_budget`

*The Coach's text, verbatim from the preplan:*

A tree-shaking budget in CI, by library: `size-limit` with `@size-limit/preset-small-lib`, one
entry per public import shape (`openVault` alone; `stableJsonify` alone; `idbDeviceDB` from
`safebyok/idb`; `browserOpts` from `safebyok/browser` once thread 2 lands), each with a limit a
little above today's measured size, and `pnpm size` at the root. The measured figures to start
from (rolldown, minified; before zod/mini): everything 136 KB, `openVault` 132 KB,
`stableJsonify` 106 KB, `idbDeviceDB` 108 KB. The zod-mini thread then lowers the limits; a
regression fails CI. Dev dependencies only, a Coach's yes for them in the PR. Model: Sonnet.

*Orchestrator's gloss:*

* **Touches**: the root `package.json` (`pnpm size`), a `.size-limit` config, CI's workflow,
  dev dependencies.
* **Model**: Sonnet. **Base**: thread 2's branch, once filed (stacked; sibling of 6).
* **Look-ahead**: measure the limits on the stacked branch, where `openVault` no longer pulls
  noble in, not from the preplan's pre-thread-2 figures. Thread 10 edits the same root scripts
  (`&&` chaining): expected conflict. A `mask` entry waits on thread 5 (see 5).

### 9. `docs_sweep`

*The Coach's text, verbatim from the preplan:*

The stale lines the canvass found, each a one-line fix; not the README promotion (a roadmap
item):

* `src/types.ts`: the `Label` doc block lists `userlabel`; `VaultScope.user_id` is deliberately
  not a Label.
* `src/string-store.ts` and `src/vault-db.ts`: "stub", "pretend" and "stand-in" survive from the
  plaintext era; `localVaultDB` is a real local-only store.
* `VOCABULARY.md`: `revisionId` "lets storage refuse a write made from a stale read" is true now
  (#18): check the wording; the `mask` paragraph matches thread 5.
* The screen-lock recipe the rulings ask to document: a host line on `visibilitychange` calling
  `lock()` (or `lockSoon()` once expiry lands), in the core README's locking section.
* The demo calls `navigator.storage.persist()` as `src/idb.ts`'s doc block says a host should.
* The React passphrase dialog, and the README, say there is no recovery path, as the proposed
  README promised the UI would.
* `notes/security.md`: the release bullet still describes the release-published trigger and
  `prepublishOnly`; #22 changed both. The `rememberForMs` wording stays until roadmap 3.
* `.devcontainer/devcontainer.json` volumes are still `byok-*` (a note for the Coach's rebuild,
  not an edit).

Model: Sonnet.

*Orchestrator's gloss:*

* **Touches**: `src/types.ts`, `src/string-store.ts`, `src/vault-db.ts` doc blocks; the core
  README's locking section; the demo's `navigator.storage.persist()`; the React passphrase
  dialog; `notes/security.md`.
* **Model**: Sonnet. **Base**: `origin/main`.
* **Look-ahead**: ~~`VOCABULARY.md`'s `mask` paragraph~~ moved to thread 5 (still check the
  `revisionId` wording). Threads 1 and 2 edit the same README and `vault-db.ts`: keep each fix
  to its line. The devcontainer item is a note for the Coach, not an edit.

### 10. `sandals`

*The Coach's text, verbatim from the preplan:*

TODO.md's *Sand in the sandals*, in one pass, each item its own commit:

* The second flaky tamper test: `packages/safebyok/tests/vault.test.ts` "a lockbox with altered
  ciphertext refuses to open" overwrites the first base64url character with `A`; use `tweakB64`
  from `tests/helpers.ts` as #25 did in `crypto.test.ts`.
* A test helpers module star-imported as `TH`: move `tweakB64` and the other helpers in, and
  replace the hand-written `await new Promise((resolve) => { setTimeout(resolve, 0) })` with
  `TH.wakeupAtNextTick()` wherever it appears. (A rename of `tests/helpers.ts`, not a second file.)
* `safebyok` becomes a peer dependency of `safebyok-convex` (today a dependency; two copies
  would break `instanceof VaultError`), the way `safebyok-react` already declares it.
* The root scripts chain with `&&`, so a root-level failure hides package failures: run the root
  check and `pnpm -r` so both report.
* The demo's coverage config gains an `include`.
* Convex's `--no-error-on-unmatched-pattern` goes, now that the package has source.
* Comment lines over 100 columns (two React eslint configs, PROCESS.md, release.yml).
* The root eslint config ignores `**/dist/`: a stale root `dist/` from before the core move
  (gitignored) fails the whole justify today.
* Not this thread, for the Coach: the dependabot check after its next weekly run (fallback
  `directories: ['/', '/packages/*', '/demos/*']`), and the demo's passphrase-dialog
  click-through, which needs a browser.

The slow justify (core rebuilt by several pre-scripts; `workspaceConcurrency: 1`) is looked at,
not necessarily fixed: report what a fix would take. Model: Sonnet.

*Orchestrator's gloss:*

* **Touches**: `tests/helpers.ts` (renamed and star-imported as `TH`) and every test that imports
  it, across packages; `safebyok-convex`'s `package.json`; root scripts; the demo's coverage
  config; eslint configs; `PROCESS.md`; `release.yml`.
* **Model**: Sonnet. **Base**: `origin/main`.
* **Look-ahead**: the helper move touches the import line of nearly every test file, which the
  chain threads also edit: keep it mechanical, one commit, so a rebase resolves it by taking
  both sides. The in-flight `strict_configs` worktree rewrites the same eslint configs and root
  scripts: note it in the PR; do not try to anticipate its diff.

### 11. `label_grammar_report`

*The Coach's text, verbatim from the preplan:*

Investigation, no code change: what depends on `Label`'s strictness (`^[a-z](_?[a-z0-9])+$`,
max 40)? Read every `parseLabel` call site, the storage ckeys in both in-tree adapters, the
cipher binding (labels are elements of the additional-data array, so a label with a `"` or `\`
is JSON-escaped, not a separator), the Convex tables and validators (and whether the grammar
should be enforced server-side, a question the sprint left), and the React package. Report in a
`human/` entry: which of applabel, vaultlabel, boxlabel could take a host-chosen grammar without
touching a stored record or a binding, and what the pluggable validator's seam would be. The
pluggable validator itself is a *Soonish* item that waits on this. Model: Sonnet.

*Orchestrator's gloss:*

* **Touches**: nothing in code; one `human/` entry.
* **Model**: Sonnet. **Base**: `origin/main`.
* **Look-ahead**: documents only, so no review. The pluggable validator's seam is what a later
  *Soonish* thread builds; name it concretely enough that the thread can start from it.

### 12. `convex_server_cap` (added by the Coach's answer, 2026-10-15)

*The Coach's words:* "yes -- Should the Convex component's updateBox enforce a cap server-side?"

*Orchestrator's gloss:*

* **Touches**: `packages/safebyok-convex/src/component/` (the tables, `vaults.ts`'s `updateBox`,
  validators), the host's authenticating wrappers if a limit is configured there,
  `convexVaultDB`, the Convex README, `notes/security.md`, and their tests.
* **Model**: Opus. **Base**: thread 7's branch, once filed (stacked at the end of the chain).
* **Look-ahead**: today the cap is enforced only on the client (thread 1), so a modified client
  can grow a Convex vault past what `destroy()` can erase. The server cannot trust a limit the
  client sends, and must not read the whole vault on every write (the read budget is the very
  problem). Design the enforcement to be cheap per write (for example a running count or byte
  total kept on the vault's own row, updated in the same transaction), bounded by
  `maxVaultBytes`'s 8 MiB or a component-configured count, and refusing with a condition the
  client maps to `vault_full`. A stored-shape change to the component's tables must still read
  every vault already written (CLAUDE.md), and says how it backfills. Erase and destroy must
  stay possible for a vault already over the limit.

### 13. `error_kinds` (added by the Coach's answer, 2026-10-15)

*The Coach's words:* "add vault_full , whisper_too_large; other errors to the core package,
clean up elsewhere"

*Orchestrator's gloss* (the orchestrator's reading, given to the Coach to correct):

* Every `VaultError` kind is listed, with its family (misuse vs. condition, TODO.md's *Error
  families*) and what a host does about it, in the core package: `src/errors.ts`'s doc block for
  the kind union, and the core README's errors section. Lists elsewhere (TODO.md's *Error
  families*, the React and Convex READMEs, VOCABULARY.md if it has one) shrink to a pointer.
* **Model**: Sonnet. **Base**: thread 12's branch, once filed, so it lists any kind 12 adds.
* **Look-ahead**: documentation and doc blocks; no kind is renamed or removed. `mask`'s kinds
  (#37) and the convex adapter's mapping are included once their PRs are in the base, or noted.

## For the Coach

* **The preplan is on [#26](https://github.com/mrflip/safebyok/pull/26), unmerged**, along with
  STYLE.md's epoch-milliseconds rule and TODO.md's current text. The workers read them from that
  branch. Merging #26 first keeps the sprint's PRs from citing rules main does not yet have.
* **`strict_configs` is live and broad.** Its uncommitted diff touches the files most of these
  threads touch. Expect to rebase one side or the other.
* **YOLO decisions** above (the stacking, and taking the preplan's recommendations) are each one
  sentence to reverse before merge.
* The preplan's *Coach chores* (removing merged worktrees, the first release's switches, the
  devcontainer volumes, dependabot, the demo click-through) stay yours; nothing here does them.
