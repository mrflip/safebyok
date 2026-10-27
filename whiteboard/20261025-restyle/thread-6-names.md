# Thread 6: names (2026-10-26)

Branch `20261026-names`, PR [#277](https://github.com/mrflip/safebyok/pull/277), stacked on #276.
Justify: green (core 3159 passed / 37 skipped, convex 334, graphql 331, postgres 318, react 307,
indexeddb 165, fastkey 49, demo 227, e2e 107, root 265); size budgets unmoved.

* **Built**:
  * **`user_id` for every `userId`**: a vault's draft (`VaultDraft`, `VaultChoice`, vault-opts.ts,
    bank.ts), `delDamagedVault`, safebyok-react's `BankProvider` prop and `Provided`,
    `messages.passphraseUsername`'s parameter, `postgresVaultDB`'s option and private field,
    `safebyok/testing` (`memoryVaultOpts`, builders), the READMEs, VOCABULARY, the demo's auth and
    session, e2e. A draft still naming `userId` refuses `bad_option` naming `user_id` (new test,
    `tests/bank.test.ts`). Kept: `getUserId`/`GetUserId` (a verb, Convex's host option),
    `UserId` (the type alias), `MaxUserIdChars`, `UserIdPattern`, the phrases, and test locals such
    as `longestUserId`, `signedInUserId`: names of concepts, camel as STYLE has `keyDeriverLabel`.
  * **`PasskeyAnswer`** is `{ credential_id, prf_salt_b64, prfBytes }` (types.ts, proving.ts,
    safebyok-react's `passkey.ts`).
  * **`ask_passphrase_at`** for the snapshot's field and the Vault object's getter (vault.ts), with
    consts.ts and crypto.ts examples, README, VOCABULARY and the demo's lock chip.
  * **Limits keep the option's name once resolved**: `ParsedBankOpts.maxWhisperBytes`,
    `VaultParts.maxBoxes` / `maxVaultBytes`, the Vault object's `#maxWhisperBytes`, `#maxBoxes`,
    `#maxVaultBytes`; `checkLimitsFit` and `limitsOf` take a bag (internal only).
  * **The wire, flat.** Convex: the component's and the host wrapper's seven scoped functions take
    `{ ...VaultScope.fields, ... }`; all seven `mustBe(ctx, args.scope.user_id)` are
    `mustBe(ctx, args.user_id)`, and the wrapper hands the same `args` to the component. GraphQL:
    seven root fields take `applabel: String!, user_id: String!, vaultlabel: String!`;
    `SafebyokVaultScopeInput` is gone; resolvers read the scope from `args`; the client sends three
    variables. Tests: every Convex function and every GraphQL root field refuses a call naming
    another user whose vault stands, leaving it unchanged; every Convex function refuses a call
    still nesting `scope` at Convex's validator; the schema's scoped root fields are checked to take
    three `String!` and no `scope`.
  * `notes/old_vocabulary.md` retires each old name; `notes/security.md` has the entry (sonnet).
* **Decisions taken**:
  * `ensureVault` and `putVaultProps` (Convex and GraphQL) keep `{ draft }` / `{ vaultProps,
    expected }`: a record is the thing, not a nested scope, and their `mustBe` reads its own
    `user_id`, as before.
  * The Vault object's getter is renamed too (`vault.ask_passphrase_at`), for one name; thread 11
    may drop it with the other per-field getters.
  * The Postgres route recipe (README, `route-recipe.test.ts`) keeps its positional `args: [scope,
    ...]`: it mirrors the VaultDB's positional verbs, which this sprint keeps.
  * `IdbRow.ckey` kept: `ckey` in its generic sense fits a row holding any key.
* **Deviations**:
  * **"Stamp" wording deferred to thread 9.** No "authentics", nor "binding" for bound fields, is
    in the code; "bound"/"binds" appear only as verbs, which NEWSTYLE itself uses ("Bind what is
    fixed"). The noun phrases ("the fields its wrap is bound to") sit in exactly the ctx functions
    thread 9 rewrites, and today's `Stamp` type holds epochs, which a NEWSTYLE stamp never does:
    calling the bound fields "the stamp" now would collide with that type until thread 8 folds it.
  * **Pulled forward, small**: `prf_salt_b64` in `PasskeyAnswer` beside `credential_id` (same rule:
    a host-facing field takes its stored spelling).
  * **Hardening the flattening forced**: `graphqlVaultDB`'s `storedVaultOf` refuses an answer that
    leaves the vault field out (a server not serving the schema, not validating), which had read
    as "no vault" once the nested input type no longer failed coercion; its test split in two.
* **Discoveries**:
  * A blanket rename collapsed a comparison: `servingOnly(userId)` beside a destructured
    `{ user_id }` became `user_id !== user_id` (tests/test-helpers.test.ts); caught by
    `noUnusedLocals`, repaired with `signedIn`. Later sweeps: grep for a new name already bound.
  * VOCABULARY still heads rows `registeredAt`, `writtenAt` for stored `registered_at`,
    `written_at`: the same one-name rule would rename them; not in this thread's list.
* **For the Coach**: the authorization moves (server.ts:98-167, vaults.ts) are the part to review
  hard; each is tested.
