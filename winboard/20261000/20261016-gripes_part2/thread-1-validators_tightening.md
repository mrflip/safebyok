# Thread 1: validators_tightening (2026-10-16)

Branch `20261016-validators_tightening`, PR [#104](https://github.com/mrflip/safebyok/pull/104),
cut from main at b60e516 (main had not moved at filing). Justify (after the restack): green -- root 154, safebyok 1328, indexeddb 139, postgres 217, react 110, convex 327, demo 153, argon2-wasm 44, graphql 205. Before it: root 123, safebyok 1163, indexeddb 108, postgres 162,
react 74, convex 282, demo 131, argon2-wasm 44, graphql 159. `pnpm size` within every budget.

* **Built**
  - **Well-formed text** (`src/validators.ts`): a `WellFormed` check, a refine refusing a match of
    `/\p{Cs}/u`, on
    `UserId`, `LockboxNote` and every field of `AnyTextValidators` (`Label`'s ASCII pattern
    already refused). Refused as `bad_label`, `bad_option` for a note.
  - **Control characters in a default note**: `NoteChars`, a refine refusing a match of
    `/(?![\t\n])\p{Cc}/u`, refuses C0 (CR
    included), DEL and C1. A host's `validators.note` is untouched.
  - **Fine-grained refusals** (`src/names.ts`): `check` passes on the first issue's message when
    the refusing schema is one of ours (`OurChecks`, the identities of `DefaultValidators` and
    `AnyTextValidators`), since ours quote nothing; a host's schema is named only ("the boxlabel
    check passed in openVault's validators"); a non-string says "missing, or not text". The
    `DefaultSaid` table is gone.
  - **The entry**: `safebyok/validators` drops `Whisper` and `EpochMillis`. Size 8.36 kB to
    3.86 kB; `DefaultValidators` 3.42 to 3.74 (of 4); `openVault` 20.01 to 20.14 (of 20.5);
    `everything` 28.16 to 28.27.
  - **The misspelt field**: `checkValidators(bag)` (`names.ts`, exported from the main entry) is
    the strictObject check that lived privately in `vault.ts`; `rulesOf` runs it, so `openVault`
    and every `VaultDB` verb refuse a misspelt bag, and `VaultProvider` calls it in render (a
    two-line hunk), throwing to the error boundary.
  - **The forgotten bag**: a `VaultDB` verb handed no `validators` now checks with
    `AnyTextValidators` (`rulesFor` in `vault-db.ts`), not the defaults. And the vault itself had
    forgotten it: `reviseUnlocks` called `updateBundle` without `rules`, so a host with a wider
    `userId` or label check could not add, remove or change a passphrase or passkey (`bad_label`).
    Fixed, with a test spying all nine verbs for the vault's bag (it fails on the old line).
  - Tests for each, docs (core, react and Convex READMEs, VOCABULARY's *note*), a
    `notes/security.md` entry, a changeset (`safebyok`, `safebyok-react` minor).
* **Decisions taken**
  - **A Unicode property escape, not `String.prototype.isWellFormed`.** `isWellFormed` is ES2024:
    every package's tsconfig that reads the core's source, and the demo's, would need
    `ES2024.String` in its lib, and it needs a newer engine than anything the core uses today. `\p{Cs}` under the `u` flag is
    ES2018 and is Unicode's own category for surrogates, matching only a lone one; it sits
    in Zod as a one-line refine. Not a hand-rolled scan.
  - **The forgotten bag made harmless rather than loud.** The plan offered "impossible or loud";
    making the bag required reshapes every public verb's signature (the blocking case). Defaulting
    an omitted bag to any well-formed text keeps the signatures, and the mistake stops mattering:
    the vault always passes its bag (now tested), a wrapper's outer verbs have already checked,
    and the shipped server recipes already pass `AnyTextValidators`. Tests that relied on the
    old default (two in `describeVaultDB`, seven in `vault-db.test.ts`) now pass
    `DefaultValidators` explicitly.
  - **`AnyTextValidators` keeps five distinct schemas**, not one shared: `VaultProvider` reopens on
    a schema's identity, and a test swaps one field's for another's.
  - **Carriage return is refused** in a default note: a textarea's value hands up newlines alone.
* **Review** (`fixed`): af44ea2 makes `erase()`'s standing boxlabel check plain `Z.string()`
  again, so a box a host's own check stored under a lone surrogate stays erasable; 57aa845 says
  "well-formed" names where the docs promised any. At filing, from its finding 1: both checks
  first matched the whole text, which overflowed V8's regex stack on ~10M characters and came out
  as "threw rather than answering"; they now search for a stray character instead (a test runs
  12M characters). Its findings 2-4 left as they are, on the PR.
* **Restack** onto main at 58b132a6 (the matters line, #105 to #118), tagged
  `20261016-validators_tightening-prerestack3` and `-prerestack4`. Conflicts were in
  `notes/security.md` (the entries kept side by side) and `vault-provider.tsx` (main's rewritten
  provider, with the `checkValidators` call put back into it). Beyond the conflicts:
  `eraseDamagedVault`, new in main, gets the same bag treatment as the other nine verbs. It
  refuses a misspelt bag, and hands its verb the vault's rules, where it had passed the raw bag.
  Its verb, handed none, admits any well-formed text. Two of main's tests now pass
  `DefaultValidators` explicitly. `damaged_lockbox`'s three refusals no longer quote the boxlabel,
  as `absent_box` already did not. Main's test titled "is named as damaged" now checks that the
  message says "That lockbox is damaged" without naming it. A new test covers both paths.
  Sizes after: `everything` 29.53 of 30 kB, `openVault` 20.87 of 23, `validators` 3.86,
  `DefaultValidators` 3.74 of 4.
* **Deviations**: none from the plan's items. The `updateBundle` fix is beyond it, found while
  checking every call site.
* **Discoveries**
  - **The Coach's question, "Is their error message that unspecific?"** Convex's client does not
    check: `convexToJson` passes strings through, and JSON sends a lone surrogate as `\ud800`.
    Only Convex's docs ("must be valid Unicode sequences") and its closed server refuse it, and
    `convex-test` round-trips one happily, so no test here can show the refusal or its text. A
    server error reaches the client as a plain `Error` (`[CONVEX M(path)] <server message>`), with
    no class or code: mapping it finer than `storage_unavailable` would mean matching unpublished
    message text. Not done; our checks now refuse first. The Convex README's old claim (it
    refuses "as `storage_unavailable`") was unverified, and is softened.
  - Running the shipped wrappers with `AnyTextValidators` explicitly (demo, GraphQL, Postgres
    recipe, `perUser`) is now redundant, and harmless; left as written.
  - The `validators` size budget (8.5 kB) now has 4.8 kB of slack. Not lowered (#99 owns budgets).
* **For thread 4's TODO heading** ("What exactly are we guaranteeing with these validators")
  - Should well-formed text be a floor beneath a host's own schema too? Today a host's
    `z.string()` admits a lone surrogate, and Convex then refuses it as `storage_unavailable`.
  - `AnyTextValidators` admits control characters in every field, labels included, and they
    reach `snapshot.boxes`.
  - A `VaultDB` verb handed no bag now admits any well-formed text: is that the right guarantee
    for a server calling the verbs bare?
* **For the Coach**
  - Harmless (any well-formed text) or loud (a required bag, reshaping nine public signatures)
    for the forgotten bag? Built harmless.
  - A tightened default strands a lockbox already stored with a control character in its note,
    or a lone surrogate in a name or user id, as damaged (`store()` over it writes afresh).
  - Minimum platform support: `\p{...}` escapes need ES2018 (Hermes has them, as far as I know;
    untested).
