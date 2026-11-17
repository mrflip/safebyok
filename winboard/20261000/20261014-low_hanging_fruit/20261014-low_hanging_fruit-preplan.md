# 2026-10-14: Low-hanging fruit -- preplan (revised 2026-10-15)

The small tasks that are either needed and attached to nothing, or so simple we will do them
anyway. Each is one thread, one PR, a sitting or less; none needs a plan of its own beyond this
page. Both sprints that stood in the way have landed (pr_releases:
[#15](https://github.com/mrflip/safebyok/pull/15), [#16](https://github.com/mrflip/safebyok/pull/16),
[#22](https://github.com/mrflip/safebyok/pull/22); convex_vaultdb:
[#17](https://github.com/mrflip/safebyok/pull/17) to [#21](https://github.com/mrflip/safebyok/pull/21)),
so every thread here is cut from `main` now. The core is `packages/safebyok/`; its tests are
`packages/safebyok/tests/`. In flight beside these, cut but not yet pushed:
`20261015-open_vault_unsubscribe` (a failed `openVault` leaking its subscription; thread 3
touches the same path and should read that branch before starting) and `20261015-strict_configs`.

Each thread follows PROCESS.md (own worktree, `pnpm justify` green, one PR, a `human/` entry)
and carries a changeset: a real one when it changes a published package, `pnpm changeset
--empty` otherwise. Threads 1, 2 and 4 change the public surface before `0.1.0`; their changesets
say what a host does about it.

Rulings these rest on (the Coach, in chat, 2026-10-14 and 15): `keyDeriver` and `deviceDB` are
explicit in the main code path, with one subpath export supplying the "don't make me think"
defaults; the IndexedDB device store stays in the core; a vault has a lockbox cap the host raises
freely, mirrored on the adapter; every time is UTC epoch milliseconds (STYLE.md); `mask` lives in
`safebyok/utils` (VOCABULARY.md); a hand-rolled utility needs a library search first (CLAUDE.md).

## Threads

| #  | Label | Size | Why it is here |
| -- | ----- | ---- | -------------- |
| 1  | `vault_size_cap` | small | Needed before publishing: on Convex an uncapped vault becomes un-erasable |
| 2  | `explicit_options` | small | Needed by the hash-wasm roadmap item; the Coach's "basic options" export |
| 3  | `provider_open_rejection` | small | Needed: a failed `openVault` in React is silent today |
| 4  | `epoch_millis` | tiny | Ruled convention; the code outside stored records |
| 5  | `mask_utils` | small | Promised by VOCABULARY.md; nothing depends on it |
| 6  | `boundary_audit` | small | The late-optionals audit the rulings ask for |
| 7  | `stale_write_retry` | small | Ruled TODO(soonish); a few lines now that `stale_write` exists |
| 8  | `size_budget` | small | The baseline the zod-mini thread will lower; keeps tree-shaking true |
| 9  | `docs_sweep` | small | Stale lines the canvass found; not the README promotion |
| 10 | `sandals` | small | TODO.md's *Sand in the sandals*, swept in one pass |
| 11 | `label_grammar_report` | tiny | Investigation only, no code change |

Order: 1 and 4 first (both touch `vault.ts` near `store()` and the timestamps; 4 is a few
lines, so run it before or inside 1's rebase); the rest in any order.

### 1. `vault_size_cap`

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

### 2. `explicit_options`

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

### 3. `provider_open_rejection`

`packages/safebyok-react/src/vault-provider.tsx` calls `openVault` with `void` and drops a
rejection. Hold the error in state and throw it during render, so an error boundary and the dev
overlay show it: every rejection `openVault` can produce before the vault exists is misuse
(`bad_option`, `bad_label`, `unknown_key_deriver`) or storage trouble that no user action fixes.
The full misuse-versus-condition split (TODO.md, *Error families*) is not this thread; this is
the one case that is silent today. Read `20261015-open_vault_unsubscribe` first: it closes the
subscription a failed open leaks, on the same path. Test: a provider given a bad label throws to
a boundary. Model: Sonnet.

### 4. `epoch_millis`

STYLE.md now says a time is UTC epoch milliseconds, an integer, everywhere. This thread makes
the code outside the stored records true to it: the demo's own records (`lib/auth.ts`
`created_at` is an ISO string), any `toISOString()` or `new Date(...)` in `src/` that is not
formatting for display, test fixtures, and the React package. The stored lockbox and bundle
fields (`created_at`, `updated_at`, ISO strings today) are **not** this thread's: they are
renamed and retyped together in the reservations thread (TODO.md, roadmap 3), and doing them
twice is churn. Grep for `toISOString`, `Date.parse`, `new Date(` and `_at:` to find the rest.
Model: Sonnet.

### 5. `mask_utils`

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

### 6. `boundary_audit`

The audit the rulings ask for (`winboard/20261014-crypto/rulings.md`, *The boundary pattern*):
every "late" optional on a record (`Lockbox.note` today, the `public` bag, `whisper_schema_version`
and `whisper_codec` once roadmap 3 has added them, `DeviceUnlock`'s shape) is nulled, defaulted
and validated where it crosses storage or the public API, and trusted past that. Touches
`src/types.ts`, `src/vault.ts`, `src/vault-db.ts` and their tests. Model: Opus.

### 7. `stale_write_retry`

`stale_write` exists now ([#18](https://github.com/mrflip/safebyok/pull/18)). `store()` and
`erase()` retry a versioned update up to a small fixed limit (three) when the expectation fails,
re-reading between attempts, and surface `stale_write` only after that. Erases carry a
`vault_id` expectation only, so an erase retries only across a reborn vault, which is to say it
does not: a refused erase surfaces at once. The conflict-handler hook the rulings mention "with
the retry work" is API design and stays in TODO *Soonish*; this thread is the politeness only.
Tests: two sessions racing on one box, the loser's retry landing. Model: Sonnet.

### 8. `size_budget`

A tree-shaking budget in CI, by library: `size-limit` with `@size-limit/preset-small-lib`, one
entry per public import shape (`openVault` alone; `stableJsonify` alone; `idbDeviceDB` from
`safebyok/idb`; `browserOpts` from `safebyok/browser` once thread 2 lands), each with a limit a
little above today's measured size, and `pnpm size` at the root. The measured figures to start
from (rolldown, minified; before zod/mini): everything 136 KB, `openVault` 132 KB,
`stableJsonify` 106 KB, `idbDeviceDB` 108 KB. The zod-mini thread then lowers the limits; a
regression fails CI. Dev dependencies only, a Coach's yes for them in the PR. Model: Sonnet.

### 9. `docs_sweep`

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

### 10. `sandals`

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

### 11. `label_grammar_report`

Investigation, no code change: what depends on `Label`'s strictness (`^[a-z](_?[a-z0-9])+$`,
max 40)? Read every `parseLabel` call site, the storage ckeys in both in-tree adapters, the
cipher binding (labels are elements of the additional-data array, so a label with a `"` or `\`
is JSON-escaped, not a separator), the Convex tables and validators (and whether the grammar
should be enforced server-side, a question the sprint left), and the React package. Report in a
`human/` entry: which of applabel, vaultlabel, boxlabel could take a host-chosen grammar without
touching a stored record or a binding, and what the pluggable validator's seam would be. The
pluggable validator itself is a *Soonish* item that waits on this. Model: Sonnet.

## Coach chores

Not threads; things only the Coach can do, found on the way:

* Remove the merged worktrees `../byok-convex`, `../byok-whisper-cap`, `../byok-staged-publish`
  (and `../byok-pr_releases` once #23 lands); delete or retire the stale local branch
  `20261015-roadmap` (an earlier copy of this branch's commits); run `scripts/git-attic`
  (notes/housekeeping.md). A vite dev server from a removed worktree may still be listening on
  port 5199.
* The first release's switches (TODO.md, roadmap 1), then deprecate `safebyok@0.0.0`.
* On the next container rebuild: the `.devcontainer/devcontainer.json` volumes are still named
  `byok-*`.
* Dependabot after its next weekly run; the demo's passphrase-dialog click-through.

## Open to the Coach

* Thread 2's entry name: `safebyok/browser` is the recommendation; `safebyok/basic` was your
  word. The reasoning: name the assumption (IndexedDB, noble Argon2id) so a `safebyok/node`
  sibling reads naturally later.
* Thread 1: `maxVaultBytes` as the adapter's declaration (bytes, so raising `maxWhisperBytes`
  is covered) rather than a lockbox count; and `vault_full` as the kind's name.
* Thread 5: `maxLen` over `maxStars`, and whether the stars-only variant ships.
* Thread 8 adds two dev dependencies (`size-limit`, its preset).
