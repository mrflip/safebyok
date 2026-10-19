# Thread: split_jumbos -- the files CLAUDE.md tells agents not to read

Date: 2026-10-19. Issued by: the Coach. Mode: **a session, not a sprint**: one branch, one PR,
the Coach in the loop between steps. Branch `20261019-split_jumbos`, cut from `origin/main` at
`f979f16b` or later. Runs **before** `softlock_gone` (`whiteboard/20261019-softlock_gone/`),
whose deletions then fall into one small file.

## The principle: pure moves

Nothing in this thread changes behaviour, a test's wording, a doc block's wording, or the public
surface. Code moves between files; imports and re-exports follow; that is all. Three checks say
so, and the PR quotes them:

* the test count is the same before and after (`pnpm vitest run --reporter=json` at each end,
  compare `numTotalTests`), and every test passes;
* `git diff --color-moved=dimmed-zebra --color-moved-ws=allow-indentation-change` shows only
  moved blocks, import lines, `export` keywords and re-export lines;
* `pnpm justify` is green in every package, and `pnpm size:budget` raises no line (a src module
  moved is the same bytes under another file name; `unbundle` keeps each module its own file).

Where a move forces a small edit (a helper that two new files need, a relative import that
gains a `../`), that is a move. Where a reader of the diff would see anything else, stop and say
so.

**Open PRs.** #138 (`deriver_shim`) and #81 (`comment_width`) both touch what this thread
moves. The Coach (2026-10-19): both will be re-implemented from their descriptions later, so
neither is rebased across this thread, and this thread does not wait for them.

## Part 1. `tests/vault.test.ts` into `tests/vault/`

6,691 lines, 53 top-level `describe` blocks, 74 file-local helpers. The vitest config already
includes `tests/**/*.test.ts`; nothing to configure. Eight files, each named for what a reader
would look for, each block moved whole and in its present order. Line numbers as of `f979f16b`:

| File | Blocks (lines) | About |
|---|---|---|
| `vault-make.test.ts` | Vault.make, Vault.make's options, hello, a page that is not a secure context, the host's clock (92-652); the key deriver seam (4242-4490); a hello that fails (5075-5292) | 1,030 |
| `vault-lease.test.ts` | unlock and lock, the lease, the lease when the host changes leaseHours, the vault's leaseMillis, the lease from a host's own DeviceDB (653-1088); natural expiry, a change to the ways in once it has landed, the unlock window renewed, its timer (4584-4854); the session vaultKey is non-extractable (5293-5351) | 770 |
| `vault-lockboxes.test.ts` | storeBox and readBox, the times a vault keeps, the sidecar, the lockbox limit, the host's validators, what a lockbox weighs in storage, while locked, useBox (1089-2167) | 1,080 |
| `vault-retire.test.ts` | retireBox and retire, retireDamagedVault, damaged lockboxes (2168-2602); a way in stored damaged (2791-2834) | 480 |
| `vault-wayins.test.ts` | changePassphrase, several passphrases, passkeys (2835-3502); a new passphrase's strength (4491-4583) | 760 |
| `vault-races.test.ts` | a lock that lands while an unlock is under way, a read in flight when a lock lands, a first unlock that loses the race to create the vault, a vault that moves elsewhere while an unlock is under way (3503-3916); a lock in another handle on this device, the device mark's lock generation, close (4855-5074); a stale session cannot reach into a vault reborn elsewhere, versioned updates, refreshes one at a time (5352-5909) | 1,190 |
| `vault-locksoon.test.ts` | lockSoon (3917-4241) | 325 (softlock_gone deletes the file) |
| `vault-storage.test.ts` | scoping, the snapshot and its subscribers, what the backend sees, tampering (2603-2790); the logger, when storage says the user is no longer signed in, the device mark, vault props rolled back, the vaultKey's epoch (5910-6692) | 970 |

**The shared helpers** go to `tests/vault/world.ts`, a module beside the tests and not itself a
test, star-imported as `World` or named-imported as the agent finds reads best (one way, in all
eight files). The rule: a helper used by two or more of the new files moves to `world.ts`,
exported; one used by one file stays in that file, above its first use, unexported. Found by a
script, not by eye. As of `f979f16b` the preamble (lines 23-81: `u1VaultPropsCkey`, `u1BoxCkey`,
`isU1Box`, `silence`, `neverRings`, `makeWorld`, `boxlabelsOf`, `MisfitStores`, `HourMillis`,
`SevenDaysMillis`) is shared by nearly every block, and these mid-file helpers cross what will be
file boundaries: `storedRowOf` and `storedVaultPropsOf` (1191-1196, nine and twelve blocks),
`makeRacingWorld` (3493, eight blocks, defined inside *passkeys*' span but used by the races),
`wayinlabelsOf`, `countingDeriver`, `vaultWithPasskey`, `refusing`, `rowsOf`, `damagedVaultWorld`,
`leaseDeadlineOf`, `uncheckingDeviceDB`, `generationOf`, `seedVault`, `storedWayinsOf`, `seenIn`,
`markIn`. Each is checked again after the blocks are assigned: a helper two blocks share that
land in the same file stays local.

**Watch for**, in the preamble: a top-level `beforeEach`, `afterEach` or `vi.*` call (one that
quiets the default logger, say) applies to every block in the old file. It is repeated at the top
of each new file that needs it, not registered from `world.ts` as a side effect of importing it.
`vi.useFakeTimers` state is per file, so blocks that fake the clock (*the host's clock*, *natural
expiry*, *the key deriver seam*) must restore it in their own `afterEach`, as they do today;
check that none relied on a neighbour's restore.

Imports: `../src/...` becomes `../../src/...`; `./test-helpers` becomes `../test-helpers`. The
`import * as TH` stays.

## Part 2. `tests/test-helpers.ts` into `tests/test-helpers/`, behind the same front door

2,655 lines, 61 exports, published as `safebyok/testing` (`tsdown.config.ts`'s `testing` entry)
and imported as `TH` by every package's tests. **`tests/test-helpers.ts` stays**, as the front
door: it becomes a file of `export * from './test-helpers/<part>'` lines, so the tsdown entry,
every `import * as TH from './test-helpers'`, every other package's `safebyok/testing`, and
STYLE.md's "one `TH`" rule are untouched. The parts, by the file's own seams:

| Part | Exports (lines) |
|---|---|
| `fixtures.ts` | `testDeriver`, `anyPassphraseTest`, `memoryVaultOpts`, `settledVault`, `freshDbName`, `fakeCiphered`, `scopeOf`, `wayinOf`, `passkeyWayinOf`, `passkeyOf`, `vaultPropsOf`, `rotatedVaultPropsOf`, `boxOf`, `sidecarJsonOf`, `OddLabels`, `summaryOf`, `noBoxYet`, `thisVault`, `retiring`, `markOf`, `NoLocks`, `leaseOf`, `tweakB64` (35-379) |
| `timing.ts` | `wakeupAtNextTick`, `aWhile`, `eventually`, `changeCounter`, `liveWatch`, `makeGate`, `beforeNextCall`, `holdNextCall`, `tallyWatches` (380-599) |
| `racing.ts` | the *racing devices* section: `Turnstile`, `throughTurnstile`, `RaceOutcome`, `MakeDevices`, `Race`, `raceEveryWay` (600-906) |
| `logging.ts` | `spyLogger`, `loggedText`, `thrownText`, `leafTexts`, `LoggedCall` (907-1012) |
| `vault-db-conformance.ts` | `VaultDBContract` and its types, `describeVaultDB`, `vaultDBTimingChecks`, `expectRoundTripsThroughTurnstile`, `perUser` (1013-2492) |
| `device-db-conformance.ts` | `describeDeviceDB` (2493-2604) |
| `refusals.ts` | `expectRefusal`, `expectSyncRefusal`, `omitting` (2605-2655) |

Parts import each other by relative path (`racing.ts` needs `timing.ts`'s gate, the conformance
suites need the fixtures and the refusal helpers): the agent lets the compiler find the edges.
No cycle may be introduced; `import-x/no-cycle` or `tsc` will say.

**Config that names the file**, each gaining the folder: `eslint.config.mjs` sections
*secret-keeping*, *platform-neutral* and *tree-shaking* (`files: ['src/**/*.ts',
'tests/test-helpers.ts']` becomes `[..., 'tests/test-helpers.ts', 'tests/test-helpers/**/*.ts']`),
and the comment above them at line 192. `tsdown.config.ts` is unchanged: `unbundle` follows the
front door's imports, and only those, into `dist/`. Check `dist/testing.js` after a build still
re-exports everything it did (`pnpm build`, then diff the export names).

**Its test** follows path for path: `tests/test-helpers.test.ts` (1,318 lines, 29 blocks)
becomes `tests/test-helpers/<part>.test.ts`, each block beside the part that defines what it
tests. The build never reaches a `.test.ts` (nothing imports one), so they ship nowhere.

## Part 3. The outer rings of `src/vault.ts`, and `localVaultDB`

`vault.ts` is three rings: the public types and the `Vault` interface's doc block (1-630), the
`make` closure (658-2036, fifteen shared `let`s), and module-level helpers (2036-2709). **The
closure is not touched**: it cannot be split without changing its shape, and the store reform is
about to change its shape. The outer ring moves:

* **`src/vault-opts.ts`**: `MakeVaultOpts` (95-218) and everything that parses or bounds it:
  `makeVaultOptsShape`, `RenamedMakeVaultOpts`, `ensureKnownOpts`, `parseVaultDB`,
  `parseDeviceDB`, the declared-limit pipeline (`someBytes` through `DeclaredLimitFor`,
  `parseDeclared`, `ensureLimitsFit`), lease hours (`someHours` through `parseLeaseHours`,
  `deadlineAfter` if nothing in the closure needs it, else it stays), the clock (`clockShape`,
  `parseClock`, `clockReading`, `readClock`), `parseMaxWhisperBytes`, `parseMaxLockboxes`,
  `parseKeyDeriver`, and the exported constants `StoredBytesPerWhisperByte`,
  `LockboxFieldsBytes`, `LockboxFixedBytes` (2355-2709, roughly). `src/index.ts` re-exports the
  same names from the new path; the public surface does not move. `vault.ts` imports what the
  closure calls.
* **`src/retire-damaged-vault.ts`**: `RetireDamagedVaultOpts`, `retireDamagedVault`,
  `deviceTroubleAsConditions`, `DeviceTroubleSaid`, `asCondition` (2039-2160). `damagedAs` is
  used inside the closure too: it stays in `vault.ts` and is imported by the new module, or
  moves and is imported back; one direction, no cycle.
* What stays with the closure: the error constructors, the proof and passkey parsers, the
  lockbox header helpers, `isUnderHeldKey`, `armExpiry`'s constants and `unrefTimeout`: small,
  and the reform will want them in hand.

`vault.ts` lands near 1,900 lines, the interface and its closure.

* **`src/local-vault-db.ts`**: `LocalVaultDBOpts`, `localVaultDB`, its class and
  `localVaultDBOptsShape`, `jsonOrText`, `readJson` (`vault-db.ts` 858-1020); `index.ts`
  re-exports. Its tests, the two `localVaultDB` blocks of `tests/vault-db.test.ts` (252-391 and
  1162-1198), become `tests/local-vault-db.test.ts`, path for path.

**Tests of the moved src.** Path for path says `tests/vault-opts.test.ts` for `vault-opts.ts`.
The blocks that test it (*Vault.make's options*, *the host's clock*, parts of *the lockbox
limit*) test it through `Vault.make`, which is the only way a caller reaches it. They stay in
`tests/vault/vault-make.test.ts` and `vault-lockboxes.test.ts`: a test lives with the public verb
it drives. One line in STYLE.md's rule says so (Part 4).

## Part 4. The rules, so this does not grow back

* **STYLE.md, *Tests*** (the opening paragraph at line 186 and the helpers bullet):

  > Vitest, in each package's `tests/`, path for path with its `src/`: `src/foo/bar.ts` is
  > tested in `tests/foo/bar.test.ts`. A test file that passes about 1,500 lines becomes a folder
  > named for its module, `tests/foo/bar/`, of `bar-<theme>.test.ts` files whose themes are what
  > a reader would look for (`bar-races`, `bar-refusals`), with the helpers two or more of them
  > share in a `world.ts` beside them; no `bar.test.ts` stays outside the folder, and no
  > `describe` title changes for the move. A module reached only through another's public verb
  > (`vault-opts.ts` through `Vault.make`) is tested beside that verb.

  and, in the helpers bullet, "live in one module" becomes "are reached through one module,
  `tests/test-helpers.ts`, which may re-export a folder of parts beside it".
* **CLAUDE.md, *Reading***: the list of files long enough to search instead shrinks to what is
  still long: `src/vault.ts`, `README.md`, and the `tests/vault/` folder taken together. The
  rest come off the list.
* **The changeset**: `pnpm changeset --empty`, unless publint or attw object to the new module
  names in `dist/`, in which case a `patch` saying the internal module layout changed and no
  entry point moved.

## Not in this thread

* **The `make` closure**, as above. The reform carves it.
* **`README.md`** (918 lines). The Contract tab is about to become second-tier docs, and the
  README sheds its store and unlock sections into whatever that produces; splitting it first is
  splitting it twice.
* `src/vault-db.ts`'s abstract class (168-565) and its helpers: a thousand lines that read fine
  once `localVaultDB` is out. `src/types.ts` (509) is already its own thing.
* The adapters' and react's tests, all under the threshold.

## Order of work

Each step ends green (`pnpm justify` at the root) and committed; the Coach is in the loop between.

1. Cut the branch. Record the baseline: the test count per package, `pnpm size:budget` as it
   stands, and the export names of `dist/testing.js` after one `pnpm build`.
2. **Part 1.** Script the helper-sharing check first (a helper's users by block), then assign
   blocks to files per the table, hoist the shared helpers to `world.ts`, and move. Run the
   folder alone (`pnpm vitest run tests/vault`), then everything. Commit: "tests: vault.test.ts
   becomes tests/vault/, eight files and a world, nothing reworded".
3. **Part 2.** The helpers folder, the front door, the eslint globs, the helpers' own tests.
   Build and diff the testing entry's exports against the baseline. Run every package's tests,
   since all of them import `TH`. Commit.
4. **Part 3.** `vault-opts.ts`, `retire-damaged-vault.ts`, `local-vault-db.ts`, `index.ts`'s
   re-exports, the `localVaultDB` tests moved. Build; publint and attw run inside it. Size
   budgets checked. Commit.
5. **Part 4.** STYLE.md, CLAUDE.md, the changeset. Commit. Open the PR with the three checks'
   output quoted, the per-file line counts, and the list of helpers hoisted to `world.ts`.

## Acceptance

* `wc -l` on every `.ts` under `packages/safebyok/tests/` and `src/`: nothing over 2,000 but
  `src/vault.ts`, and nothing over 1,500 under `tests/`.
* Test counts equal before and after, every package; `pnpm justify` green everywhere.
* `git diff --color-moved` from the base shows no changed line inside a moved block.
* `dist/testing.js` exports the same names; `src/index.ts` exports the same names.
* STYLE.md states the rule, and CLAUDE.md's reading list matches the tree.

## What was done (2026-10-19)

The Coach ruled the plan's numbers and split points guides, not rules. PRs: #188 (Parts 1, 2 and
the guidance of Part 4), #189 (Part 3, stacked). Where the work differs from the plan above:

* **`tests/vault/`** as planned: eight files and `world.ts`, 23 shared helpers. The "watch for"
  note was moot: `vault.test.ts` had no top-level hook.
* **`tests/test-helpers/`**: seven parts, with `fixtures.ts` named `builders.ts` (`fixtures/` means
  sample data here). The front door names its exports (`export { … } from`) instead of
  `export *`, because six internals that two parts share would otherwise have joined
  `safebyok/testing`. The plan's line ranges cut across families in places (`deferred`, `ticks`,
  `microtasks`, `unresolved`, `unheard` belong to timing; `NotRefused` to refusals), which would
  have made import cycles. `import-x/no-cycle`, which the plan relied on, is not in the eslint
  config; one run with it switched on over `src` and `tests` found none. The eslint glob is
  `tests/test-helpers/*.ts`, and `tests/test-helpers.test.ts` (1,318 lines) stayed whole, its
  doc block saying why, so no test file sits among the shipped parts.
* **Part 3**: `src/vault-opts.ts` (416) and `src/retire-damaged-vault.ts` (115); `vault.ts` is
  2,208 lines, not 1,900. `src/local-vault-db.ts` was not made: about a dozen importers changed
  for 160 lines out of a 1,020-line file. `retireDamagedVault`'s tests, a public verb of their own,
  became `tests/retire-damaged-vault.test.ts`.
* **Part 4**: STYLE.md and CLAUDE.md edits ride in #188, in the commits they describe, at the
  Coach's word that guidance needs no PR of its own. Two empty changesets, one per PR.
* softlock_gone's plan now says where the code it cites has gone.
