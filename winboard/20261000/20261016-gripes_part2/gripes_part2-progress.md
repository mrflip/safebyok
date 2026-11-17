# Sprint gripes_part2 -- progress

## Status

| #   | Thread                | Status   |
| --- | --------------------- | -------- |
| 1   | validators_tightening | filed #104 |
| 2   | convex_setup_check    | filed #102 |
| 3   | test_hygiene          | filed #103 |
| 4   | docs_rulings          | filed #101 |
| 5   | matters_followups     | filed #117 |

## What the threads have taught

* **Thread 5 (#117), matters_followups.** `Sanitizer.refusalFor` (new `src/sanitizer.ts`): a
  foreign error never rides as a refusal's `cause`; the host-schema drop and every Convex failure
  that isn't our own refusal go through it (`storage_unavailable`, no cause; the message points
  at the deployment's logs, or the browser console for trouble before the call left). erase reads
  storage once; `read()`/`use()` document `bad_label`; the vault-total estimate is called
  conservative; `validators.unlocklabel`, checked where a way in is added (not on read; the first
  `passphrase` exempt); a second `close()` returns early; `TODO.md` gains the size-check note, the
  pluggable sanitizer (and that `asStorageTrouble`, Postgres and GraphQL still carry a cause), the
  KDF follow-ups, and "Re-examine the pluggable validators interface". *Review:* fixed two (a
  taken unlocklabel or duplicate passkey was refused quoting the label; an empty unlocklabel a
  host admits failed late as `bad_option`, now `bad_label` at entry). Left, minor: safebyok's own
  Convex refusals still carry the `ConvexError` as cause; two near-copy storage-trouble messages.
  For the Coach (matter rows): Convex drops every foreign cause; `unlocklabel` entry-only.

*Orchestrator (round 2):* #115 merged the matters line (#105 to #115) into main (`23f263a`)
while #117 was in review. The restack onto it conflicts from #104's first commit
(`notes/security.md`, `vault-provider.tsx`); each thread's worker restacks its own, bottom-up.

*Orchestrator (round 2):* #99 (the matters sprint's small_sweep: size budgets by rule,
`justify:root`, TODO) merged under the line; restacked onto main at `5090c1a` with no conflicts,
`pnpm justify` and `pnpm size` green at the top. The Coach answered every matter row: thread 5
gathers the builds; `withUnlockedVault` keeps #98's behaviour; the directories wait for the Coach.
The matters sprint's own line (#105 to #115) now edits `vault.ts`, `vault-db.ts`, `errors.ts`, the
test helpers, Convex's refusals and `TODO.md` heavily: whichever line merges second restacks.

*Orchestrator:* **restacked** into one line, biggest first: main (`b60e516`) → #104 → #103 → #102
→ #101 → #100. No conflicts; `pnpm justify` and `pnpm size` green once, at the top.

* **Thread 1 (#104), validators_tightening.** `UserId`, `LockboxNote` and every
  `AnyTextValidators` field refuse lone surrogates (a search for `\p{Cs}`, not a whole-text match,
  so 12M characters don't overflow V8's regex stack); the default note refuses C0 (CR included),
  DEL and C1 but tab and newline; our refusals say which rule failed, quoting nothing; the
  `safebyok/validators` entry 8.36 → 3.86 kB; `checkValidators` exported, used by `openVault`,
  `rulesOf` and `VaultProvider` (a misspelt `boxLabel` is `bad_option`); a bare `VaultDB` verb
  admits any well-formed text instead of the defaults. Beyond the plan: `reviseUnlocks` passed no
  rules to `updateBundle`, so a host with wider checks got `bad_label` on every passphrase or
  passkey change. Convex's own refusal text can't be verified (`convex-test` admits lone
  surrogates; server errors arrive as a bare `Error`). *Review:* fixed two (erase() could not
  reach a box a host's `z.string()` stored under a lone surrogate; docs said "never refuses" where
  only well-formed names hold). The regex rewrite came after, at the orchestrator's word, with a
  test. Left, minor: `OurChecks` recognises our schemas by identity (two copies of the core fall
  back to vaguer wording); `checkValidators` runs on every verb call and render (cheap, kept).
  For the Coach: the forgotten bag harmless (as built) or a required argument; boxes stored with
  a control character or lone surrogate now list as damaged; `\p{}` on Hermes untested.

* **Thread 3 (#103), test_hygiene.** `tallyWatches` counts each watch closed at most once;
  `expectRefusal` asserts `instanceOf(VaultError)` (matching `isVaultError`; the pending
  `20261015-thin_tests` changeset now agrees, and the new one names the ESM/CJS split as a second
  way to see two classes); `beforeNextCall`/`holdNextCall` keep a per-method queue, one arming per
  call, on a plain method or an existing spy; `convexRefusalOf` tested; the demo's vaults close
  after each test and its panels wipe their stores. *Review:* fixed two (the panel tests asserted
  before the shelf read, so passed without the wipe; `world.seed` leaked a vault on a refusal).
  The queue came after the review, at the orchestrator's word, restoring base's arm-twice
  behaviour (76 lines, tested, unreviewed). Left, minor: a prototype-level spy is shadowed after
  restore; the demo's ordered test pair breaks under `-t`/`.only`; `stateOnOpen` leaves its vault
  open. `Vault.close()` twice unsubscribes twice: a matter row for the Coach.

* **Thread 2 (#102), convex_setup_check.** `SafebyokComponent.api(opts)` refuses a bag without a
  `getUserId` function, and `new SafebyokComponent(component)` a non-object component (a forgotten
  `app.use(safebyok)`), both `bad_option` from `VaultError`; no new kind. Importing `VaultError`
  into `server.ts` costs a host's Convex bundle 98 B (esbuild-measured). *Review:* clean; left,
  minor: a `getUserId` relying on `this` passes the check (predates), the test setup repeats
  `hostWith`'s, one test pins 9 functions, `checkedApiOpts`'s generic is only a cast. At the
  orchestrator's word the worker then trimmed the message and added the component check (three
  tests): small, but after the review. An installed-looking proxy for a never-deployed component
  still fails only at the first call.

* **Thread 4 (#101), docs_rulings.** `TODO.md` *Soonish* gains the Coach's validator-guarantees
  heading (refused text in `snapshot.boxes`, control characters, lone surrogates, server-side names,
  `unlocklabel`), "Group error messages?", the damaged-box store race, and Convex's `getUserId`
  question; a *Rulings from gripes_part2* section before *Sand in the sandals*; `STYLE.md`'s
  `expect*` rule. *Review:* none (documents only). Deviation, accepted: *Pluggable label validator*
  and *Validating the user id* stay where they were (moving them would be a large hunk in a shared
  file). **For threads 1 and 2**: its TODO lines on control characters, lone surrogates and the
  Convex setup check assume your builds; if yours land differently, say so in your report.

*Orchestrator:* the three cleanup leftovers the Coach asked about (size checks, erase's double
read, `read()`'s doc), `withUnlockedVault` against #98, and `unlocklabel`'s slot are matter rows in
the doc's Open Matters tab, drafting.
