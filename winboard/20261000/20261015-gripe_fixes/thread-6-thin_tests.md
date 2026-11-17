# Thread 6: thin_tests (2026-10-15)

Branch `20261015-thin_tests`, PR #75, stacked on #70 (tip `d874db3`), which stands on
#66. Justify: green (root 105, safebyok 780, safebyok-convex 268, safebyok-react 28, demo 119;
publint, attw and `pnpm size` clean).

* **Built**:
  - `safebyok/testing` (`packages/safebyok/tests/test-helpers.ts`), four new exports, each with a
    doc block and tests in `test-helpers.test.ts`:
    - `expectRefusal(operation, kind)`: the one refusal check. It checks by `name === 'VaultError'`
      and `kind`, not class, so it holds for any copy of the package. It fails if the operation
      resolves, and returns the error for a closer look.
    - `thrownText(err)`: message, stack, own properties and every cause, as one text to search.
      `loggedText` now calls it.
    - `leafTexts(record)`: a record's string and number values. It walks them with
      `JSON.stringify`'s replacer: no hand-rolled recursion.
    - `omitting(bag, ckey)`: a bag with one field left out, still typed as the whole bag.
  - `tweakB64('')` throws a `TypeError`. It used to return `'a'`, which decodes to nothing. The
    `'A'` case became `'QQ'` (one byte), and a new test checks that bent text decodes to the same
    length.
  - Three refusal helpers folded into `TH.expectRefusal`: `vault.test.ts`'s (by class, 135 call
    sites), `describeVaultDB`'s private one (by kind), and `convex-vault-db.test.ts`'s
    `refusalOf`. The demo's `refusalKind` (`outage.test.ts`) went the same way. One Convex test
    keeps an explicit `instanceOf(VaultError)` against the host's copy of the package.
  - **The Convex "never quotes a record" test** is now `describe("a record the deployment
    refused")`. It runs over the #70 wrapping client, for both `updateBundle` and `updateBox`, with
    distinctive values everywhere (subject `user_quotable`, app `quotable_app`, epochs 52_871 and
    52_872). It sweeps every leaf of the record and of the scope through `thrownText(refusal)`:
    message, stack, properties, and the whole cause chain. It also checks that the cause really
    is the deployment's validator error, and that nothing was written. Mutation-checked: a
    wrapping client that quotes the arguments into its error makes both cases fail.
  - `vault.test.ts`: `makeWorld()` gains `optsWith(overrides)`. The missing-`vaultDB`,
    missing-`deviceDB` and missing-`keyDeriver` tests use `TH.omitting(world.optsWith(), ...)`
    instead of `undefined as unknown as ...` and `withoutDeriver as OpenVaultOpts`.
  - The demo's `createAuth` takes `clock?: Clock` (the core's type, `wallClock` by default). Its
    test pins `registered_at`, checks that signing in again keeps it, and covers the default
    under fake `Date` timers.
  - **Demo component tests** under jsdom (a `// @vitest-environment jsdom` line per file; the
    `lib/` tests stay under node). There is one file per component, mirroring `src/`:
    `App`, `KnockKnock`, `PsstModal`, `SessionBar`, `VaultDashboard`, the two inspection panels,
    `StoreTable`, and `useSession`. Their helpers are in `tests/test-helpers.tsx`:
    - `makeWorld()` returns `renderInVault`, `open` and `seed`.
    - `answerPassphraseDialog()` types into the dialog and submits it.
    - `Passphrase`.
    It re-exports `safebyok/testing`, so it serves as the demo's `TH`. Coverage went from 22% to
    97% of statements; only `main.tsx`, the boot line, is left at 0.
  - `vitest/expect-expect` names `TH.expectRefusal` as well as `expectRefusal`, in all five
    eslint configs. The demo's filename rules extend to `tests/App.test.tsx`,
    `tests/components/**` (PascalCase) and `tests/hooks/**` (camelCase).
  - Changeset `20261015-thin_tests.md` (safebyok minor). The core README's `safebyok/testing`
    sentence names the new helpers.

* **Review** (`fixed`): cbcb860, the missing-store cases each check their own field's message;
  ed955db, the demo outage tests check `isVaultError` against the host's class again;
  dd20171, the changeset says `describeVaultDB` now requires the name `VaultError`. Then, by
  the worker: the knock-knock Cancel test runs over an unlocked vault, so it can fail
  (mutation-checked). The review's remaining minor findings are the PR's open questions.

* **Decisions taken**:
  - **Blank text throws** rather than being handled. A tamper test aimed at an empty field is
    aimed at the wrong field, and no one-character answer decodes.
  - **The unified helper checks name and kind, not class**, so it serves an adapter built on
    the published package. A test that means the class says so itself.
  - **Demo devDependencies**: `@testing-library/react`, `@testing-library/dom`, `jsdom` and
    `fake-indexeddb`, at the versions the React binding and the core already pin. The boring
    answer: nothing new enters the lockfile's set of packages.
  - **The anthropic call is faked at `fetch`** (`vi.stubGlobal`), not by mocking the module.
    The knock-knock tests then prove the key reaches Anthropic's `x-api-key` header and never
    the page's HTML.
  - **The demo's helper module is `test-helpers.tsx`, not `.ts`**: it renders JSX, and
    `createElement` cannot type VaultProvider's required `children`. The import path is unchanged.

* **Deviations**: none from the plan. Struck as told: the modal bullet (thread 3) and the
  build-first `pretest` (thread 4). Package scripts are untouched.

* **Discoveries**:
  - **convex-test's validator quotes nothing** ("Unexpected field `stray_field` in object"). So
    the strengthened sweep proves that *our* code adds no quotation. It cannot reproduce a dev
    deployment, whose validator quotes the arguments into the error that `convexVaultDB` keeps
    as the refusal's `cause`, as `notes/security.md` (2026-10-15) records and accepts. A comment
    in the test says so. See *For the Coach*.
  - `server.test.ts` and `component/vaults.test.ts` each keep a `refusalOf`. Those read
    `ConvexError` data, a different contract from a `VaultError`, so they are left. They are
    candidates for thread 7.
  - `TODO.md`'s "second flaky tamper test" item is already done: `vault.test.ts` uses
    `TH.tweakB64` at both sites.
  - **For thread 7**: three more candidates. `makeWorld`/`optsWith` in `vault.test.ts` and
    the React tests' worlds look alike; `fakeAnthropic` in the demo's `KnockKnock.test.tsx` and
    `makeFakeAnthropic` in `anthropic.test.ts` are near-twins; and the probe components in
    `SessionBar.test.tsx` and `test-helpers.test.tsx` repeat the pattern.

* **For the Coach**:
  - **Should `convexVaultDB` keep a Convex error that may quote a refused record as its
    `cause`?** On a dev deployment Convex's validator error quotes the arguments (scope, notes,
    ciphertext; never plaintext or keys), and `storage_unavailable` carries that error as its
    cause. This is accepted in `notes/security.md`. The strengthened test fails if the
    deployment's error quotes, so it would catch it, but convex-test never quotes. Options:
    1. Keep it, and say in the test that only our own code is under test. This is what is built.
    2. Drop Convex's message from the cause for errors that are not safebyok's, at a cost to
       debugging.
    I recommend option 1. The cause is the host's own deployment talking to the host.
