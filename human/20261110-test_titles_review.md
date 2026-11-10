# 2026-11-10: Test titles reviewed for slop -- the core package's tests need a rewrite pass; the rest are mostly plain

A review only: no test file was changed. Worktree `/workspace/byok-adapter_docblocks`, read at its working tree on
2026-11-10. The rules are STYLE.md *Tests*, `notes/gallant-test_titles.md` and the *Plain English* section of
`notes/gallant-docblocks.md`.

## Verdict

About one title in five fails the rules: 705 of 3,756. The faults sit mainly in one place. In `packages/safebyok`, 22% of
titles fail, and in `tests/models/` and the storage batteries in `tests/test-helpers/`, a reader who has not opened the
file often cannot tell what is being tested. The adapters, React package, demo, e2e and root scripts are mostly plain.
Their failures are scattered cases of the same habits, not a register of their own. The bulk-case blurbs are the best
writing in the suite: short, plain table rows, with few faults.

One fault is mechanical and worth fixing first. In 33 titles in `packages/safebyok/tests/models/`, "world" stands where
"held" was meant: "a box not world is built and world", "the box world kept as it was". Commit `dec969112` ("tests:
"hold" gives way to has, pending, open and listed, and the models-world fixture is named world") is where "box world"
first appears, so this looks like a rename that caught words it should not have. "World" is a VOCABULARY.md term (what a
thing is listed under), and the bad rename makes those titles both ungrammatical and misleading.

## 1. Counts

A title is one `describe`, `it` or `test` string, template titles included, or one blurb in a bulk case list. Where a
row in the list below says "same at :N", only the first title is counted.

| Package | Titles examined | Flagged | Share |
|---|---:|---:|---:|
| `packages/safebyok` | 2,726 | 596 | 22% |
| `packages/safebyok-react` | 289 | 36 | 12% |
| `packages/safebyok-convex` | 125 | 18 | 14% |
| `packages/safebyok-graphql` | 57 | 19 | 33% |
| `packages/safebyok-fastkey` | 51 | 5 | 10% |
| `packages/safebyok-postgres` | 38 | 3 | 8% |
| `packages/safebyok-indexeddb` | 19 | 2 | 11% |
| `demos/safebyok-demo-react` | 117 | 6 | 5% |
| `e2e` | 13 | 1 | 8% |
| `tests/` (root scripts) | 321 | 19 | 6% |
| **Total** | **3,756** | **705** | **19%** |

Counts by fault. A title can have two faults, so these add up to more than 705.

| Fault | Count |
|---|---:|
| `#plain-english` (of which 33 are "world" for "held") | 451 |
| `#outcome-not-action` | 117 |
| `#no-as-trailer` | 72 |
| `#kind-is-the-assertion` | 16 |
| `#so-clause-is-the-behaviour` | 15 |
| `#conditions-move-up` | 14 |
| `#name-the-referent` | 12 |
| `#invariant-not-trace` | 8 |
| `#no-citations` | 3 |

The graphql share is high because of one habit: its watch tests say "tells" for "reports" (see pattern 2). Its other
titles are fine.

## 2. Recurring patterns

### Pattern 1: "world" where "held" was meant (33 titles, all in `packages/safebyok/tests/models/`)

- `listing.test.ts:104` "delivers a notice as a good answer: a box not world is built and world"
- `listing-delivering.test.ts:92` "is thrown to a build(record), the box world kept as it was"
- `box-listing-rows.test.ts:40` "refuses 'absent_box' for a box world gone, which stays world"

Rewrite: "builds and holds a box from a notice of one not yet held"; "is thrown to a build(record), leaving the held box
unchanged"; "refuses 'absent_box' for a held box that is gone, and keeps holding it". A careful search-and-replace of
the participle "world" back to "held" fixes most of them. Each one still needs a reader's eye, because "world" is also
used correctly in the same files.

### Pattern 2: house verbs in place of ordinary ones

The most common fault. "Answers" means returns, "tells" means reports or notifies, "hears" means receives or is refused,
"stands" or "where it stands" means unchanged, "in hand" means cached, "spends" means zeroes, and "nobody asked" means
without prompting.

- `idb-shelf.test.ts:26` "answers the one shelf for a database, however often it is asked" -> "returns the same shelf
  for a database on every call"
- `graphql-vault-db.test.ts:190` "tells the refusal that ends a stream as itself" -> "reports the refusal that ends a
  stream unchanged"
- `vault-boxes-putting.test.ts:94` "hears 'stale_write' where another session's box was written since hello, the record
  delivered" -> "refuses 'stale_write' where another session wrote the box since hello"
- `gating.test.ts:432` "takes up a cached lease, nobody asked" -> "unlocks with a cached lease without asking"
- `gating.test.ts:87` "makes the passkey's wayin beside the passphrase's, and spends the answer" -> "... and zeroes the
  answer"

### Pattern 3: one title narrates the whole test

The title lists the setup and every assertion, joined by commas, colons and semicolons. `vault-life.test.ts`,
`bank-ending.test.ts`, `vault-gate.test.ts`, `bank.test.ts` and `readme-recipes.test.ts` are full of these.

- `vault-life.test.ts:55` "forgets the kept lease at lock(), so the next session asks for the passphrase: its box
  refuses 'vault_locked', a wrong passphrase refuses 'wrong_passphrase', and the right one opens the whisper the first
  session sealed" -> "makes the next session ask for the passphrase after lock()"
- `vault-unlock.test.ts:77` "locks at `lock()`, reporting locked before it returns and forgetting the row; seal and
  unseal refuse; then 'dismissed' with no proof and ..." -> "locks at lock() before it returns", with the unlock cases
  moved to their own tests
- `bank.test.ts:50` "readies a bank over an empty VaultDB and DeviceDB, loading its plugins, telling its listeners, and
  answering the same snapshot until something changes" -> "readies a bank over empty storage"

### Pattern 4: a reason tacked on after a colon, "as" or "so"

The title states the behaviour, then explains it. The rule says the explanation goes in a `//` comment or nowhere.

- `box-whisper-states.test.ts:271` "puts while veiled and unlocked: the veil hides, it does not discard (the Coach,
  2026-11-05)" -> "puts while veiled and unlocked"
- `vault-boxes.test.ts:99` "`${verb} refuses on a vault deleted, as gone beats locked`" -> "`${verb} refuses on a deleted
  vault, even while locked`"
- `proving.test.ts:501` "refuses a second buildWayin on one proving, so its leases stay under the one vaultKey its first
  wayin wraps" -> "refuses a second buildWayin on one proving"

### Pattern 5: private phrasing that reads as nothing to a newcomer

Every word is ordinary, but the sentence is not one anyone would say. This covers dropped nouns ("no thread's", "a
refusal that is none"), "is no X" for "is not an X", stacked prepositions, and invented figures of speech ("tattoos",
"ducks as", "wears the brand", "birthday gift", "Bob's your uncle", "handed rubble", "epochalypse").

- `box-fields.test.ts:149` "leaves an edit be at a tell that moved nothing of its leaf" -> "keeps an edit when a change
  notice leaves its field untouched"
- `box.test.ts:31` "are exactly the nine the base tattoos: the four of the scope, registered_at, vault_tok and the three
  revision props" -> "are exactly nine: the four scope fields, registered_at, vault_tok and the three revision fields"
- `validator.test.ts:217` "frames a refusal as the story asks, where before the failures and advice after, each ending
  the failures in a period" -> "puts the story's where before the failures and its advice after"
- `box-listing-rows.test.ts:239` "shows a box's sidecar as `box.sidecar` gives it: Bob's your uncle by any path" ->
  "shows the same sidecar as `box.sidecar`"

### Smaller patterns

- **Refusal kinds the customer never handles.** `vault_full`, `box_too_large`, `gate_made_elsewhere`,
  `storage_unavailable`, `unexpected_error` and `lease_revoke_failed` appear in titles without quotes. The lint only
  catches a kind in quotes with an underscore in it, so these slip past, and so does `'camped'`. `'bad_option'` is
  quoted in `safebyok-fastkey/tests/wasm-deriver.test.ts:276` and `:283` and in
  `safebyok-convex/tests/testing.test.ts:119`, and those files still pass. Either the kind check does not reach those
  files or it allows these cases; someone should check. The six `gate_made_elsewhere` siblings in `gating.test.ts`
  should go under one `describe("when another device builds the vault first")`.
- **Citations.** Three titles in `box-whisper-states.test.ts` carry "(the Coach, 2026-11-05)".
- **An "as its example shows" trailer** is left at `test-helpers.test.ts:25`, `boundary.test.tsx:68` and
  `safebyok-convex/tests/testing.test.ts:79`. Each should become a `// member @example N` comment.
- **A stock phrase repeated.** Six blurbs in `refusals/errors.test.ts` end "is a fact of syncing".

## What is already fine

Most titles outside `packages/safebyok/tests/models/` and the batteries pass. Good examples, to copy:

- The demo components (`KnockKnockWidget`, `KnockKnockToolkit`, `AccountMenu`, `SessionBar`): "knocks with the saved
  key, not an unsaved edit", "keeps a separate key in each flow".
- The root scripts: "refuses a cached tarball that is not the one recorded, and fetches nothing in its place", "stages a
  prerelease under next".
- The bulk-case blurbs in `mask.test.ts`, `primitives.test.ts`, `shapes-vaultish-*.test.ts`, `runtime-deps.test.ts` and
  `release.test.ts`: "one character is too short", "a key a little short gives up head characters first".
- In the core, `helpers/crypto.test.ts`, `helpers/stable-jsonify.test.ts`, `helpers/mask.test.ts` and
  `refusals/report-error.test.ts` are almost all plain.

Template titles over case tables (`older | sparse | full takes 'older'` in `storable-receiving.test.ts`) follow
`#templates-are-tables` and are left alone. Only the explanations added after their colons are flagged.

## How this was done, and its limits

Titles were taken from the test files with ripgrep, together with the third element of every bulk case row. Each title
was read in its `describe` chain. Titles split across lines, and blurbs built any other way, were not collected; a few
may have been missed. The line between a terse title and slop is a judgement. I flagged a title when a reader who has
not opened the file would ask "meaning what?", and left alone a short "putting nothing" or "calling nothing" ending,
since the gallant file accepts "asking storage nothing". A suggested rewrite is a draft. It has not been checked
against the test's assertions, and some rewrites (marked "two tests") would split a test.

## 3. Every flagged title

Sorted by path and line. The title is quoted as written, so it can be found with a search; `\|` in a title stands for a
literal `|`.

### `demos/safebyok-demo-react`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| demos/safebyok-demo-react/tests/lib/auth.test.ts:83 | the session survives in device storage, as a page reload would see it | #no-as-trailer | the session survives a page reload |
| demos/safebyok-demo-react/tests/lib/outage-vault-db.test.ts:12 | answers its verbs while online | #plain-english | passes every call through while online |
| demos/safebyok-demo-react/tests/lib/outage-vault-db.test.ts:31 | tells its subscribers of each flip, until they unsubscribe | #plain-english | notifies subscribers of each switch between online and offline until they unsubscribe |
| demos/safebyok-demo-react/tests/lib/saved-api-key.test.ts:48 | answers null for an apiKey that is no string | #plain-english | returns null for an apiKey that is not a string (and "answers" -> "returns" at :34, :38, :42, :54, :60) |
| demos/safebyok-demo-react/tests/lib/storage.test.ts:9 | are the browser's batteries and the vaultDB behind the outage switch | #plain-english | use the browser's storage adapters and a vaultDB behind the outage switch |
| demos/safebyok-demo-react/tests/pages/LandingPage.test.tsx:24 | shows a signed-in user the widget form alone, with no control panels, and links to the labs | #outcome-not-action | shows a signed-in user only the widget form and links to the labs |

### `e2e`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| e2e/tests/convex/convex-vault-db.test.ts:141 | still hears a change in rows the client already watches, so sends no first answer | #so-clause-is-the-behaviour | still reports a change to rows the client already watches |

### `packages/safebyok-convex`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| packages/safebyok-convex/tests/component/tallies.test.ts:13 | has at most 7 MiB less 1 KiB of boxes: half the read budget, less a whole document of vault row and room for the tally | #no-as-trailer | has at most 7 MiB less 1 KiB of boxes |
| packages/safebyok-convex/tests/component/tallies.test.ts:37 | weighs a heavier whisper heavier, byte for byte, and nothing as nothing | #plain-english | adds a whisper's bytes to the weight, and nothing for no whisper |
| packages/safebyok-convex/tests/component/tallies.test.ts:50 | refuses a new box in a vault with its most | #plain-english | refuses a new box in a vault already at its count limit |
| packages/safebyok-convex/tests/component/tallies.test.ts:74 | answers a tally against the cap it is bound by and the component's weight limit | #plain-english | reports a tally against its cap and the component's weight limit |
| packages/safebyok-convex/tests/component/tallies.test.ts:78 | answers a vault past a limit and left uncounted as full by both, as refuses treats it | #no-as-trailer | reports an uncounted vault past a limit as full |
| packages/safebyok-convex/tests/component/vaults.test.ts:111 | removes the box rows and tallies of every life of the bank that has ended, answering how many box rows remain | #plain-english | removes the box rows and tallies of every ended vault life, and returns how many box rows remain |
| packages/safebyok-convex/tests/component/vaults.test.ts:187 | is counted, for a life planted without one, at its next box put, the life reading as ever until then | #plain-english | is created at the next box put for a vault life that lacks one |
| packages/safebyok-convex/tests/component/vaults.test.ts:210 | has a life to the client's maxBoxes, answering how full it is, and never refuses a replacement | #plain-english | fills a vault life up to the client's maxBoxes, and never refuses a replacement |
| packages/safebyok-convex/tests/component/vaults.test.ts:220 | has a life to the component's own count limit, whatever cap the client asks | #plain-english | caps a vault life at the component's own limit, whatever the client asks |
| packages/safebyok-convex/tests/component/vaults.test.ts:273 | refuses a new box that would take the life past it, answering how full it is, and lets in one that fits | #outcome-not-action | refuses a new box over the weight limit and accepts one that fits |
| packages/safebyok-convex/tests/component/vaults.test.ts:280 | lets a replacement grow the life up to it exactly, then refuses one byte more, and lets a lighter one in | #outcome-not-action | lets a replacement reach the weight limit exactly but not exceed it |
| packages/safebyok-convex/tests/component/vaults.test.ts:290 | keeps a life too large to read whole deletable, a box at a time, its puts refused as full | #plain-english | lets a vault life too large to read whole be deleted a box at a time |
| packages/safebyok-convex/tests/server.test.ts:115 | calls getUserId as a method of the bag it was handed, so one that leans on this works | #so-clause-is-the-behaviour | calls getUserId with its object as `this` |
| packages/safebyok-convex/tests/server.test.ts:133 | `refuses ${blurb} with a bad_option that says what to pass` | #kind-is-the-assertion | `refuses ${blurb}, saying what to pass` (same at :140) |
| packages/safebyok-convex/tests/testing.test.ts:79 | gives every client the logger it was handed, so a test hears the refusal the client would have printed, as its third example shows | #no-as-trailer | gives every client the logger it was given (with `// fakeDeployment @example 3`) |
| packages/safebyok-convex/tests/testing.test.ts:97 | calls a logger as its methods, so a logger built as a class keeps its this, and takes one with no verbose line | #outcome-not-action | two tests: calls a class logger's methods with its `this`; accepts a logger without verbose |
| packages/safebyok-convex/tests/testing.test.ts:119 | refuses a host or options it cannot run, as 'bad_option', quoting none of what it was handed | #kind-is-the-assertion | refuses a host or options it cannot run, quoting none of them |
| packages/safebyok-convex/tests/testing.test.ts:159 | arranges the backend in turn with its clients, and has pushed the change to every watcher and cache when it answers | #plain-english | pushes a backend change to every watcher and cache before it returns |

### `packages/safebyok-fastkey`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| packages/safebyok-fastkey/tests/wasm-deriver.test.ts:66 | derives 32 deterministic bytes, and a different salt lands somewhere else entirely | #outcome-not-action | derives 32 deterministic bytes that change with the salt |
| packages/safebyok-fastkey/tests/wasm-deriver.test.ts:147 | keeps none of the extra fields it was handed: a spec cannot smuggle in a function | #no-as-trailer | drops extra fields from the spec |
| packages/safebyok-fastkey/tests/wasm-deriver.test.ts:276 | refuses with kind 'bad_option' on a platform with no WebAssembly, as React Native's Hermes is | #kind-is-the-assertion, #no-as-trailer | refuses on a platform without WebAssembly |
| packages/safebyok-fastkey/tests/wasm-deriver.test.ts:283 | refuses with kind 'bad_option', naming the fix, when a Content-Security-Policy forbids compiling it | #kind-is-the-assertion | refuses, naming the fix, when a Content-Security-Policy blocks compiling |
| packages/safebyok-fastkey/tests/wasm-deriver.test.ts:306 | passes along, as it came, a failure that is not WebAssembly's to compile | #plain-english | rethrows unchanged any failure other than a WebAssembly compile error |

### `packages/safebyok-graphql`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| packages/safebyok-graphql/tests/graphql-vault-db.test.ts:86 | is a VaultDB, as a bank takes one, and no AdapterVaultDB, as a server's resolvers take one | #no-as-trailer | is a VaultDB and not an AdapterVaultDB |
| packages/safebyok-graphql/tests/graphql-vault-db.test.ts:105 | refuses a failed request with a cause with the error's name, HTTP status and code alone | #plain-english | refuses a failed request with a cause that carries only the error's name, HTTP status and code |
| packages/safebyok-graphql/tests/graphql-vault-db.test.ts:130 | refuses a malformed request before sending it, as any VaultDB refuses one | #no-as-trailer | refuses a malformed request before sending it |
| packages/safebyok-graphql/tests/graphql-vault-db.test.ts:148 | tells a stream the server ends once, and never subscribes again | #plain-english | reports a stream the server ends once, and does not resubscribe |
| packages/safebyok-graphql/tests/graphql-vault-db.test.ts:169 | tells a GraphQL error once, stops its stream, and hears nothing after | #outcome-not-action | reports a GraphQL error once and stops the stream |
| packages/safebyok-graphql/tests/graphql-vault-db.test.ts:180 | tells nothing of the stream the server ends revoking its identity, and never subscribes again | #plain-english | reports nothing when the server ends the stream for a revoked identity, and does not resubscribe |
| packages/safebyok-graphql/tests/graphql-vault-db.test.ts:190 | tells the refusal that ends a stream as itself | #plain-english | reports the refusal that ends a stream unchanged |
| packages/safebyok-graphql/tests/graphql-vault-db.test.ts:207 | stops a stream that ends as it begins, telling it once | #plain-english | reports once a stream that ends as soon as it starts |
| packages/safebyok-graphql/tests/vault-resolvers.test.ts:109 | answers each verb as the VaultDB's own try* verb does | #plain-english | returns for each verb what the VaultDB's try* verb returns |
| packages/safebyok-graphql/tests/vault-resolvers.test.ts:156 | sends a refusal as the answer's err with nothing of what the VaultDB's driver said | #plain-english | sends a refusal as the answer's err without the driver's message |
| packages/safebyok-graphql/tests/vault-resolvers.test.ts:164 | sends nothing of what a throwing userIdOf said | #plain-english | leaks nothing from a userIdOf that throws |
| packages/safebyok-graphql/tests/vault-resolvers.test.ts:198 | refuses a vaultDB or userIdOf it cannot use, a client of a vaultDB among them | #plain-english | refuses an unusable vaultDB or userIdOf, including a client-side vaultDB |
| packages/safebyok-graphql/tests/vault-resolvers.test.ts:219 | lets go of its listen when ended | #plain-english | stops listening when ended |
| packages/safebyok-graphql/tests/vault-resolvers.test.ts:244 | ends with a refusal carrying nothing of what its throwing userIdOf said | #plain-english | ends with a refusal that leaks nothing from a userIdOf that throws |
| packages/safebyok-graphql/tests/vault-resolvers.test.ts:258 | ends a watch it refuses after one notice | #plain-english | sends one notice for a refused watch, then ends it |
| packages/safebyok-graphql/tests/vault-resolvers.test.ts:272 | builds alone, every root field it adds named safebyok... | #outcome-not-action | builds on its own, with every root field it adds prefixed safebyok |
| packages/safebyok-graphql/tests/vault-schema.test.ts:156 | is caught missing a field a check reads | #plain-english | fails the check when it lacks a field the core reads (same for :163 and :168) |
| packages/safebyok-graphql/tests/vault-schema.test.ts:174 | the walk | #plain-english | the schema walk |
| packages/safebyok-graphql/tests/yoga-recipe.test.ts:131 | refuses a browser signed in as one user the bank of another | #plain-english | refuses a browser signed in as one user access to another user's bank |

### `packages/safebyok-indexeddb`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| packages/safebyok-indexeddb/tests/idb-vault-db.test.ts:165 | deletes the unversioned vault database and each older version's, unread, on its first call | #plain-english | deletes the unversioned database and every older version without reading them, on first use |
| packages/safebyok-indexeddb/tests/idb-vault-db.test.ts:177 | leaves a newer version's database, another dbName's, and the device database's where they stand | #plain-english | leaves untouched a newer version's database, another dbName's, and the device database |

### `packages/safebyok-postgres`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| packages/safebyok-postgres/tests/postgres-vault-db.test.ts:59 | refuses a statement that failed for want of a table or a privilege as unexpected, and any other as the storage out of reach | #plain-english | two tests: a missing table or privilege is an unexpected error; any other failure is storage unavailable |
| packages/safebyok-postgres/tests/postgres-vault-db.test.ts:79 | hears a write whose rows will not fit in a notification as the rows then stand | #plain-english | reports a write too large for a notification by re-reading the rows |
| packages/safebyok-postgres/tests/postgres-vault-db.test.ts:211 | hears a user_id of capitals and punctuation, its channel LISTENed as a quoted identifier | #plain-english | listens on a quoted channel for a user_id with capitals and punctuation |

### `packages/safebyok-react`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| packages/safebyok-react/tests/add-passkey-modal.test.tsx:29 | makes a passkey under the app's name and the user's, adds it on the passphrase, and the gating concludes | #outcome-not-action | adds a passkey named for the app and the user |
| packages/safebyok-react/tests/attempt-refusals.test.ts:16 | says nothing of a second attempt while one runs: the first answers | #no-as-trailer | says nothing of a second attempt while one runs |
| packages/safebyok-react/tests/attempt-refusals.test.ts:22 | `says nothing of ${refusalkind} on a gating it concluded: the gating's outcome tells it` | #no-as-trailer | `says nothing of ${refusalkind} once the gating has concluded` |
| packages/safebyok-react/tests/bank-provider.test.tsx:364 | leaves a vault whose lease survived its forget to be vacated when the host has no onLifecycle, as the core does | #no-as-trailer | without onLifecycle, leaves a vault whose lease could not be forgotten for the host to vacate |
| packages/safebyok-react/tests/bank-provider.test.tsx:376 | tells the next user's onLifecycle nothing of the bank it let go, whose vacate tells the last user's onLifecycle of the lease it cannot forget | #outcome-not-action | reports the old bank's vacate to the old user's onLifecycle, not the new user's |
| packages/safebyok-react/tests/bank-provider.test.tsx:439 | shows the dialog with the user's gesture spent, as its own click supplies the next | #no-as-trailer | shows the dialog after the user's gesture is used up |
| packages/safebyok-react/tests/bank-provider.test.tsx:595 | asks nobody when requestCleartext answers nothing | #plain-english | shows no dialog when requestCleartext returns nothing |
| packages/safebyok-react/tests/boundary.test.tsx:40 | tells onCaught once, and a null fallback leaves nothing in the children's place | #outcome-not-action | two tests: "calls onCaught once" and "renders nothing for a null fallback" |
| packages/safebyok-react/tests/boundary.test.tsx:68 | hands React a VaultError's kind, message and meta but not its cause, thrown in render, as its example shows | #no-as-trailer | gives React a VaultError's kind, message and meta, but not its cause (with `// forBoundary @example 1`) |
| packages/safebyok-react/tests/boundary.test.tsx:80 | hands back a VaultError with no cause as itself | #plain-english | returns a VaultError with no cause unchanged |
| packages/safebyok-react/tests/boundary.test.tsx:86 | turns an Error that quotes what it was handed into a fixed unexpected_error quoting none of it | #kind-is-the-assertion | replaces an Error that quotes its input with a fixed refusal that quotes nothing (same at :87, :88) |
| packages/safebyok-react/tests/box-whisper-field.test.tsx:69 | puts an edit through its box's fields' put | #plain-english | saves an edit through BoxFields.put |
| packages/safebyok-react/tests/devmode/dev-device-db-inspector.test.tsx:66 | shows a damaged row's proved_at that names no time as its number | #plain-english | shows an invalid proved_at as a raw number |
| packages/safebyok-react/tests/devmode/dev-vault-db-inspector.test.tsx:36 | tombstones a box row by delBox, then answers tidyGone | #plain-english | deletes a box row with delBox, then runs tidyGone |
| packages/safebyok-react/tests/hooks.test.tsx:273 | read why the whisper hides while it will not show | #plain-english | read why the whisper is hidden |
| packages/safebyok-react/tests/hooks.test.tsx:296 | read none again for a box deleted | #plain-english | read null again once the box is deleted |
| packages/safebyok-react/tests/hooks.test.tsx:314 | read whether a box shows and wears its veil | #plain-english | read whether a box is showing and whether it is veiled |
| packages/safebyok-react/tests/hooks.test.tsx:343 | read the empty answers for no box | #plain-english | read empty values when there is no box |
| packages/safebyok-react/tests/messages.test.ts:5 | frames each varying sentence whole around its part | #plain-english | builds each variable sentence as a whole around its variable part |
| packages/safebyok-react/tests/messages.test.ts:10 | has a word for everything, none of it blank | #plain-english | has a non-empty message for every key |
| packages/safebyok-react/tests/messages.test.ts:15 | is in the one locale, which formats the dialog's relative times | #plain-english | uses a single locale, which also formats relative times |
| packages/safebyok-react/tests/passkey-unlock-button.test.tsx:54 | says only that its last word no longer stands when the user dismisses the prompt, and takes a press again | #plain-english | clears its last message when the user dismisses the prompt, and can be pressed again |
| packages/safebyok-react/tests/passkey-unlock-button.test.tsx:88 | hands a browser's failure to onGripe in calm words, and says nothing of a refusal on a gating that has concluded | #outcome-not-action | two tests: "reports a browser failure to onGripe in calm words" and "says nothing once the gating has concluded" |
| packages/safebyok-react/tests/passkey-unlock-button.test.tsx:102 | leaves an attempt under way to answer when pressed during it | #plain-english | ignores a press while an attempt is running |
| packages/safebyok-react/tests/passkey-unlock-button.test.tsx:111 | meets misuse by taking itself away and pointing to the passphrase, reporting the very error to React | #plain-english | on misuse, hides itself, points to the passphrase, and reports the error to React |
| packages/safebyok-react/tests/passkey-unlock-button.test.tsx:167 | keeps the passkey's word while the user types the passphrase, until they submit | #plain-english | keeps the passkey's message while the user types the passphrase |
| packages/safebyok-react/tests/passkey.test.ts:63 | takes a relying party id and a timeout left undefined as left out | #plain-english | treats an undefined relying party id or timeout as omitted |
| packages/safebyok-react/tests/passkey.test.ts:81 | zeroes the browser's own copy of the answer once copied, so the answer's bytes are the one copy | #so-clause-is-the-behaviour | zeroes the browser's copy of the answer after copying it |
| packages/safebyok-react/tests/passkey.test.ts:101 | asks the new passkey again when its authenticator answers only when asked | #plain-english | asks the new passkey a second time when its authenticator gives no PRF answer at creation |
| packages/safebyok-react/tests/passkey.test.ts:135 | asks the vault's passkey over its own salt, and hands back the answer it gave as made | #plain-english | asks the vault's passkey with its salt, and returns the answer unchanged |
| packages/safebyok-react/tests/passkey.test.ts:159 | resolves null when the user dismisses the prompt, or has not the passkey at hand | #plain-english | resolves null when the user dismisses the prompt or does not have the passkey |
| packages/safebyok-react/tests/passkey.test.ts:190 | a header of no wayinkind there is | #plain-english | a header with an unknown wayinkind |
| packages/safebyok-react/tests/passkey.test.ts:217 | refuses a passphrase header as a vault with no passkey | #plain-english | refuses a passphrase header as it refuses a vault with no passkey |
| packages/safebyok-react/tests/passphrase-modal.test.tsx:30 | chooses the first passphrase, filed under the user and the vault | #plain-english | builds the vault with the first passphrase, under the user and vault ids (same "filed under" at del-vault-modal:21, replace-passphrase-modal:36, revoke-passkey-modal:26) |
| packages/safebyok-react/tests/passphrase-modal.test.tsx:38 | names its two fields apart, for a password manager | #plain-english | gives its two fields distinct names for password managers |
| packages/safebyok-react/tests/vault-controls.test.tsx:55 | unlocks the vault in hand, never asking the bank to ensure one | #plain-english | unlocks the vault it was given without asking the bank for one |

### `packages/safebyok`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| packages/safebyok/tests/browser.test.ts:48 | is out of reach of a keyDeriverSpec, which asks for a salt of 16 bytes | #no-as-trailer | cannot be expressed as a keyDeriverSpec |
| packages/safebyok/tests/browser.test.ts:83 | hands another deriver what it needs to wear the same specs: the supplied spec and its parse | #plain-english | exports the supplied spec and its parser for other derivers |
| packages/safebyok/tests/browser.test.ts:105 | answers a frozen bag of the Argon2id deriver, a DeviceDB in IndexedDB and the zxcvbn checker | #plain-english | returns frozen options with the Argon2id deriver, an IndexedDB DeviceDB and the zxcvbn checker |
| packages/safebyok/tests/browser.test.ts:114 | answers the same bag for the same dbName, so it is safe to call during render | #plain-english | returns the same object for the same dbName |
| packages/safebyok/tests/browser.test.ts:121 | answers another DeviceDB for another dbName, the deriver and checker shared | #plain-english | returns a separate DeviceDB for each dbName, sharing the deriver and checker |
| packages/safebyok/tests/dom/box-fields.test.ts:24 | answers one instance per box | #plain-english | returns one instance per box |
| packages/safebyok/tests/dom/box-fields.test.ts:76 | does nothing given null, as a React before 19 hands a ref at an unmount | #no-as-trailer | does nothing when given null |
| packages/safebyok/tests/dom/box-fields.test.ts:149 | leaves an edit be at a tell that moved nothing of its leaf | #plain-english | keeps an edit when a change notice leaves its field untouched |
| packages/safebyok/tests/dom/box-fields.test.ts:160 | follows a leaf that moved | #plain-english | shows the new value of a field that changed |
| packages/safebyok/tests/dom/box-fields.test.ts:230 | makes a new whisper with an edit and tells, and keeps the one in hand with none | #outcome-not-action | two tests: "makes a new whisper when a field was edited" and "keeps the cached whisper when nothing was edited" |
| packages/safebyok/tests/dom/box-fields.test.ts:276 | has a try form answering an outcome | #plain-english | has a try form that returns an Outcome |
| packages/safebyok/tests/dom/box-fields.test.ts:285 | unexposes at the last unbind of every caller of BoxFields.of, and not before, blanking each as it goes | #plain-english | unexposes only when the last bound element unbinds |
| packages/safebyok/tests/dom/box-fields.test.ts:302 | stops hearing, so that a lock writes to no element let go | #so-clause-is-the-behaviour | writes nothing to an unbound element at a lock |
| packages/safebyok/tests/dom/box-fields.test.ts:314 | binds again from nothing, and hears again | #plain-english | binds and listens again after the last unbind |
| packages/safebyok/tests/helpers/clock.test.ts:19 | make nowMillis answer what fn answers, until the reset | #plain-english | make nowMillis return what fn returns, until the reset |
| packages/safebyok/tests/helpers/consts.test.ts:16 | is the microsecond epochalypse: the last millisecond whose epoch microseconds are a safe integer | #plain-english | is the last millisecond whose epoch microseconds are a safe integer |
| packages/safebyok/tests/helpers/consts.test.ts:56 | is no own key of a model, so a spread and Object.keys leave it out | #plain-english | is not an own key of a model |
| packages/safebyok/tests/helpers/consts.test.ts:62 | tell a VaultDB or a DeviceDB by the brand its base class carries, as another copy of safebyok would make it | #no-as-trailer | recognize a VaultDB or DeviceDB by its base-class brand, even from another copy of safebyok |
| packages/safebyok/tests/helpers/consts.test.ts:69 | refuse a duck, the other one, and a copy of a VaultDB's own fields, which leaves the brand behind | #plain-english | reject a look-alike object, the other kind, and a copy of a VaultDB's fields |
| packages/safebyok/tests/helpers/consts.test.ts:148 | knows a guarded function or object from any copy of safebyok | #plain-english | recognizes a guarded function or object made by any copy of safebyok |
| packages/safebyok/tests/helpers/consts.test.ts:156 | refuses what wears no true guard's brand | #plain-english | is false for anything without the guard brand |
| packages/safebyok/tests/helpers/crypto.test.ts:52 | binds a vault's stamp, a purpose and a header: the same parts make the same bytes, and other parts others | #plain-english | gives the same bytes for the same parts, and different bytes for different parts |
| packages/safebyok/tests/helpers/crypto.test.ts:171 | a non-extractable unwrap refuses exportKey: the platform keeps the bytes | #no-as-trailer | a non-extractable unwrapped key refuses exportKey |
| packages/safebyok/tests/helpers/crypto.test.ts:199 | takes a cipherCtx as its info: the key made for one header opens nothing sealed under another's | #no-as-trailer | uses the cipherCtx as its info, so keys for different headers differ |
| packages/safebyok/tests/helpers/helpers.test.ts:19 | lets a getter attach what it works out on the first read, which every later read finds in its place | #plain-english | lets a getter cache its value on first read |
| packages/safebyok/tests/helpers/helpers.test.ts:66 | is fixed with the rest of an object frozen after it | #plain-english | freezes along with the object |
| packages/safebyok/tests/helpers/helpers.test.ts:96 | throws on assigning to a readonly prop, which a configurable one still lets adorn redefine | #outcome-not-action | throws on assigning to a readonly prop |
| packages/safebyok/tests/helpers/logger.test.ts:17 | hands back the host's logger, each call passed through as it was made | #plain-english | wraps the host's logger, passing each call through unchanged |
| packages/safebyok/tests/helpers/logger.test.ts:45 | answers the one default logger, DefaultLogger, whenever it is given none or null | #plain-english | returns DefaultLogger when given none or null |
| packages/safebyok/tests/helpers/logger.test.ts:51 | guards the same host logger as the same object, however often it is handed in | #plain-english | returns the same guarded logger each time it is given the same host logger |
| packages/safebyok/tests/helpers/logger.test.ts:58 | guards a logger once: one it has guarded comes back as itself, however many layers hand it down | #plain-english | returns an already-guarded logger unchanged |
| packages/safebyok/tests/helpers/logger.test.ts:67 | carries nothing beside its three calls | #plain-english | has no properties beyond its three methods |
| packages/safebyok/tests/helpers/logger.test.ts:72 | guards a logger made from a guarded one, which inherits nothing that would let it skip the guard | #no-as-trailer | guards a logger whose prototype is a guarded logger |
| packages/safebyok/tests/helpers/logger.test.ts:133 | drops what a promise from another realm rejects with, which is no instance of this realm's Promise | #no-as-trailer | drops a rejection from another realm's promise |
| packages/safebyok/tests/helpers/logger.test.ts:149 | knows a logger parseLogger made safe, and the DefaultLogger, from the host's bare one | #plain-english | tells a guarded logger and DefaultLogger apart from an unguarded host logger |
| packages/safebyok/tests/helpers/logger.test.ts:162 | sends what the default logger hears to the app's own, a fallback taken before the call included | #plain-english | routes the default logger to the app's logger, even for a fallback taken before the call |
| packages/safebyok/tests/helpers/logger.test.ts:187 | takes the default logger itself as the console, rather than handing each call to itself | #plain-english | treats DefaultLogger as the console, so it never calls itself |
| packages/safebyok/tests/helpers/logger.test.ts:207 | fits a logger whose story is typed as a record of any | #plain-english | accepts a logger whose story parameter is typed Record<string, any> |
| packages/safebyok/tests/helpers/one-at-a-time.test.ts:63 | serves every call made during a run with that same run, starting none of its own | #plain-english | shares the running task with every call made during it |
| packages/safebyok/tests/helpers/one-at-a-time.test.ts:100 | tells a run's failure to every call that shared it | #plain-english | rejects every call that shared a failed run |
| packages/safebyok/tests/helpers/passphrase-strength.test.ts:26 | is the one verdict that admits, frozen | #plain-english | is the frozen verdict for a strong passphrase |
| packages/safebyok/tests/helpers/passphrase-strength.test.ts:53 | answers the host's own verdicts: a reason for a passphrase it finds short, StrongVerdict for any other | #plain-english | returns the host checker's verdicts |
| packages/safebyok/tests/helpers/passphrase-strength.test.ts:59 | answers the weak verdict of a checker that finds one weak, its reason as the checker gave it | #plain-english | returns a weak verdict with the checker's reason |
| packages/safebyok/tests/helpers/passphrase-strength.test.ts:84 | answers StrongVerdict for a passphrase the checker admits, handing it the passphrase exactly as given and a frozen copy of the scope | #outcome-not-action | returns StrongVerdict for a passphrase the checker accepts |
| packages/safebyok/tests/helpers/passphrase-strength.test.ts:190 | answers the same, every time, logging nothing: it is an ordinary checker | #no-as-trailer | returns the same verdict every time |
| packages/safebyok/tests/helpers/validator.test.ts:55 | refuses a scope with a bad name as its call's kind, naming the field | #plain-english | refuses a scope with a bad name, with the call's refusal kind, naming the field |
| packages/safebyok/tests/helpers/validator.test.ts:81 | repeats the keys of a schema keyed by its input in the refusal | #plain-english | names the input's keys in the refusal for a record schema |
| packages/safebyok/tests/helpers/validator.test.ts:117 | quotes no value it refuses, counts the fields it does not accept, never naming one, and lists the fields it takes | #outcome-not-action | quotes no refused value and names no unknown field |
| packages/safebyok/tests/helpers/validator.test.ts:217 | frames a refusal as the story asks, where before the failures and advice after, each ending the failures in a period | #plain-english | puts the story's where before the failures and its advice after |
| packages/safebyok/tests/helpers/validator.test.ts:230 | parses with a story as without one, and passes a story of nothing by, framing a failure as the failures alone | #plain-english | parses the same with or without a story, and ignores an empty story |
| packages/safebyok/tests/helpers/validator.test.ts:237 | refuses a story that is none, a Zod parse context among them, whatever the input | #plain-english | refuses an invalid story, including a Zod parse context |
| packages/safebyok/tests/helpers/validator.test.ts:243 | parses and then has the result to another bag with parseConsistent, refusing its call's kind | #plain-english | parseConsistent parses, then checks the result against another object |
| packages/safebyok/tests/helpers/validator.test.ts:251 | refuses a disagreement as the refusal handed to parseConsistent says, and a failed parse as parse does | #plain-english | refuses a disagreement with the refusal given to parseConsistent |
| packages/safebyok/tests/helpers/validator.test.ts:259 | frames a failed parse with the where and advice handed to parseConsistent, and leaves a disagreement's message as it is | #outcome-not-action | frames a failed parse with the story given to parseConsistent |
| packages/safebyok/tests/helpers/validator.test.ts:273 | types a Story as optional where and advice, and a ConsistencyRefusal as a kind and an optional message, each read off its shape | #plain-english | types Story and ConsistencyRefusal from their shapes |
| packages/safebyok/tests/helpers/validator.test.ts:356 | refuses opts that are none, whatever it would check | #plain-english | refuses invalid opts |
| packages/safebyok/tests/helpers/validator.test.ts:413 | says the refusal's message, a sentence or one made from the fields that disagree | #plain-english | uses the refusal's message, or one built from the fields that disagree |
| packages/safebyok/tests/helpers/validator.test.ts:420 | passes by a field only one bag defines, or one defines as undefined | #plain-english | ignores a field only one object defines, or defines as undefined |
| packages/safebyok/tests/helpers/validator.test.ts:438 | refuses a bag that is not an object, or a refusal that is none | #plain-english | refuses a non-object, or an invalid refusal |
| packages/safebyok/tests/helpers/validator.test.ts:470 | hands out epochMillis, the instant every time is, as the same object the package exports | #plain-english | includes epochMillis, the same validator the package exports |
| packages/safebyok/tests/helpers/whisper-field.test.ts:13 | turns off filling, saving and generating, capitalizing, correcting and spell-checking: a secret text is no credential | #no-as-trailer | turns off autofill, saving, generation, capitalization, correction and spell-checking |
| packages/safebyok/tests/helpers/whisper-field.test.ts:20 | is every value text, so setAttribute takes each as it is | #plain-english | has only string values |
| packages/safebyok/tests/helpers/zxcvbn-strength-checker.test.ts:63 | answers StrongVerdict of a strong passphrase | #plain-english | returns StrongVerdict for a strong passphrase |
| packages/safebyok/tests/helpers/zxcvbn-strength-checker.test.ts:84 | refuses the vault's own names, which a guesser who knows the user tries first | #no-as-trailer | finds the vault's own names weak |
| packages/safebyok/tests/helpers/zxcvbn-strength-checker.test.ts:104 | refuses a passphrase that is no text, and a scope that is no scope | #plain-english | refuses a non-string passphrase or an invalid scope |
| packages/safebyok/tests/helpers/zxcvbn-strength-checker.test.ts:136 | is run by a check made before it, which answers a weak verdict while the dictionary does not load | #plain-english | is started by an early check, which returns weak until the dictionary loads |
| packages/safebyok/tests/index.test.ts:84 | exports where a box's whisper stands | #plain-english | exports the whisper states |
| packages/safebyok/tests/index.test.ts:89 | exports the bags box.whisper answers while it will not show | #plain-english | exports the sentinel values box.whisper returns while hidden |
| packages/safebyok/tests/models/bank-ending.test.ts:34 | is not called by hello, so an old row stands, and the vault's ensureUnlocked leaves it, asking for a proof whose lease is written over it | #outcome-not-action | is not called by hello |
| packages/safebyok/tests/models/bank-ending.test.ts:55 | past autolock, ensureUnlocked asks the dialog as it does with no row at all, not refusing for the lease's age | #plain-english | past autolock, ensureUnlocked asks for the passphrase rather than refusing |
| packages/safebyok/tests/models/bank-ending.test.ts:80 | past autolock, a lease granted stays granted: ensureUnlocked looks at no row, forgets nothing and asks nothing | #outcome-not-action | past autolock, a granted lease stays granted |
| packages/safebyok/tests/models/bank-ending.test.ts:96 | past autolock, a late page's ensureUnlocked leaves the row, not loaded, so the page with its lease finds it and locks | #so-clause-is-the-behaviour | past autolock, a late page leaves the row for the page holding the lease to lock |
| packages/safebyok/tests/models/bank-ending.test.ts:111 | called by a host after hello on a fresh page, forgets an old lease through the vault just listed, and that vault asks again | #conditions-move-up | forgets an old lease on a fresh page, so the vault asks again |
| packages/safebyok/tests/models/bank-ending.test.ts:138 | does nothing before a hello, having nothing listed, and leaves the row where it is | #plain-english | does nothing before hello |
| packages/safebyok/tests/models/bank-ending.test.ts:165 | leaves an old row whose vault is not listed, and one of another life, neither locking the vault listed | #plain-english | ignores old rows of unlisted vaults and of other vault lives |
| packages/safebyok/tests/models/bank-ending.test.ts:199 | leaves a refused forget to the vault's own lock, which onLifecycle hears | #plain-english | leaves a refused forget to the vault's lock, which reports it to onLifecycle |
| packages/safebyok/tests/models/bank-ending.test.ts:233 | vacates every listed vault and every lease of the bank on this device, leaving the vaultDB, and disables the bank for good | #outcome-not-action | vacates every vault and lease of the bank on this device, and disables the bank |
| packages/safebyok/tests/models/bank-ending.test.ts:258 | forgets a fresh page's rows of its own bank with nothing listed, another user's staying | #plain-english | forgets its own bank's lease rows on a fresh page, and leaves other users' rows |
| packages/safebyok/tests/models/bank-ending.test.ts:269 | tells the host's onLifecycle of a lease its vacate cannot forget and then of the vacate, though the bank is disabled, a repeat doing nothing | #outcome-not-action | reports an unforgettable lease and then the vacate to onLifecycle |
| packages/safebyok/tests/models/bank-ending.test.ts:305 | forgets the bank's row in the deviceDB after its leases, so the next ensureCachedBank mints another device_id, another user's row staying | #so-clause-is-the-behaviour | forgets the bank row, so the next bank gets a new device_id |
| packages/safebyok/tests/models/bank-ending.test.ts:327 | tells the host's onBadNews of a bank row its vacate cannot forget, and forgets it where the listing of the leases is refused | #outcome-not-action | two tests: reports an unforgettable bank row; forgets the bank row when the lease listing is refused |
| packages/safebyok/tests/models/bank-ending.test.ts:340 | disables the bank at once, before it forgets its rows: every call refuses, and the snapshot reads refused with the cause | #outcome-not-action | disables the bank before it forgets its rows |
| packages/safebyok/tests/models/bank-ending.test.ts:359 | tells the host nothing past the disable but its vacate's refusals, a vault's own forget going to the platform | #plain-english | after disabling, reports only the vacate's own refusals to the host |
| packages/safebyok/tests/models/bank-ending.test.ts:391 | settles a repeat during its forget and after it, scanning the cached leases once, the first cause standing | #plain-english | a repeated vacate settles without scanning the leases again, keeping the first cause |
| packages/safebyok/tests/models/bank-ending.test.ts:401 | settles where the host's onLifecycle awaits a vacate of the bank its forget is telling | #plain-english | settles when onLifecycle awaits a vacate of the same bank |
| packages/safebyok/tests/models/bank-ending.test.ts:414 | refuses a story whose cause is no VaultError, or that has a field it does not accept, and stays enabled | #plain-english | refuses a story whose cause is not a VaultError or that has an unknown field |
| packages/safebyok/tests/models/bank-ending.test.ts:421 | tells its listeners of a vacate with nothing listed, the stage alone having changed | #plain-english | notifies listeners of a vacate even with nothing listed |
| packages/safebyok/tests/models/bank-ending.test.ts:458 | sweeps its vaults and leaves their cached leases for the next bank, which picks one up with nobody asked | #outcome-not-action | leaves cached leases at a sweep for the next bank to use |
| packages/safebyok/tests/models/bank-ending.test.ts:490 | forgets the bank's cached leases at a vacate after a sweep, as a sign-out after the page's cleanup | #no-as-trailer | forgets the bank's cached leases at a vacate after a sweep |
| packages/safebyok/tests/models/bank-probe.test.ts:25 | ensures the vault 'home' on a bank with none, and reports each step, the box 'box1' holding the default whisper and sidecar | #outcome-not-action | builds the vault 'home' and box 'box1' on an empty bank, reporting each step |
| packages/safebyok/tests/models/bank-probe.test.ts:64 | replaces what the box held, finding it first, and adds no second box | #plain-english | replaces an existing box rather than adding a second |
| packages/safebyok/tests/models/bank-probe.test.ts:103 | holds to a maxMillisSinceRefresh of its own, apart from the bank's refresh settings | #plain-english | uses its own maxMillisSinceRefresh, not the bank's |
| packages/safebyok/tests/models/bank-probe.test.ts:114 | answers as bad the refusal a step meets, naming the verb | #plain-english | returns a bad Outcome naming the step that was refused |
| packages/safebyok/tests/models/bank-probe.test.ts:122 | answers as bad before hello, and for a label it cannot use, or a horizon | #plain-english | returns a bad Outcome before hello, and for an invalid label or horizon |
| packages/safebyok/tests/models/bank.test.ts:40 | makes a bank where the page is a secure context, or the host has no such idea | #plain-english | makes a bank in a secure context, or where the platform has no isSecureContext |
| packages/safebyok/tests/models/bank.test.ts:50 | readies a bank over an empty VaultDB and DeviceDB, loading its plugins, telling its listeners, and answering the same snapshot until something changes | #outcome-not-action | readies a bank over empty storage |
| packages/safebyok/tests/models/bank.test.ts:68 | tells onLifecycle each hello's outcome, a bank's naming no vault and a vault's naming it | #plain-english | reports each hello's outcome to onLifecycle, naming the vault for a vault's hello |
| packages/safebyok/tests/models/bank.test.ts:85 | tells the host nothing of a hello a sweep crosses | #plain-english | reports nothing of a hello interrupted by a sweep |
| packages/safebyok/tests/models/bank.test.ts:98 | lists every vault and tombstone the vaultDB has stored, locked, with no prompt, the tombstone in its slot but not its snapshot | #conditions-move-up | lists every stored vault, locked, without asking |
| packages/safebyok/tests/models/bank.test.ts:112 | on a second call receives a row of the same life into the vault listed, and replaces one of a new life, the old vault vacated | #outcome-not-action | two tests: a second hello updates a listed vault; it replaces a vault of a new life |
| packages/safebyok/tests/models/bank.test.ts:129 | tombstones the vault listed where the row is deleted, the vault staying in its slot and gone from the snapshot, and a rebuild goes over it | #outcome-not-action | marks a listed vault deleted when its row is deleted |
| packages/safebyok/tests/models/bank.test.ts:146 | refuses with no network, the bank not ready: each bank call asks for a hello first, until one succeeds | #outcome-not-action | stays not ready while offline, and every call refuses until a hello succeeds |
| packages/safebyok/tests/models/bank.test.ts:162 | refuses when a strength checker will not load, what it threw the cause, asking nothing of the vaultDB | #plain-english | refuses when the strength checker fails to load, with its error as cause (same at :176 for the key deriver) |
| packages/safebyok/tests/models/bank.test.ts:190 | passes a VaultError a key deriver's load throws as it came | #plain-english | rethrows a VaultError from a key deriver's load unchanged (same at :201) |
| packages/safebyok/tests/models/bank.test.ts:258 | hears a vault made elsewhere over the watch it starts | #plain-english | sees a vault built on another device through its watch |
| packages/safebyok/tests/models/bank.test.ts:270 | the host's functions, as a bank has them | #plain-english | the host's functions inside a bank |
| packages/safebyok/tests/models/bank.test.ts:279 | asks the dialog, answering true once it closes and false when it throws, keeping nothing of the throw | #plain-english | returns true when the dialog closes and false when it throws |
| packages/safebyok/tests/models/bank.test.ts:359 | builds a vault by asking, unlocked, and answers it from then on, nobody asked, through the snapshot and the subscription | #outcome-not-action | builds an unlocked vault by asking, then returns it without asking again |
| packages/safebyok/tests/models/bank.test.ts:388 | refuses a null requestCleartext, which is no function and no leaving out | #plain-english | refuses a null requestCleartext |
| packages/safebyok/tests/models/bank.test.ts:427 | answers tryEnsureVault's refusal as an Outcome | #plain-english | tryEnsureVault returns a refusal as an Outcome |
| packages/safebyok/tests/models/bank.test.ts:431 | hands a fresh bank the lease this device has cached, nobody asked | #plain-english | unlocks a fresh bank with the device's cached lease without asking |
| packages/safebyok/tests/models/bank.test.ts:446 | vacates the bank on a refused hello, which shows the revocation, its caller hearing it, the default reporting it, and no lease left | #outcome-not-action | vacates the bank when hello is refused for a revoked identity |
| packages/safebyok/tests/models/bank.test.ts:467 | vacates the bank when any vault's call into the vaultDB is refused so, then passes the refusal up | #plain-english | vacates the bank when any vault's call is refused for a revoked identity |
| packages/safebyok/tests/models/bank.test.ts:505 | refuses as disabled a listing of the vaults answered after a sweep, so a revocation in it neither reaches the host nor vacates | #so-clause-is-the-behaviour | ignores a revocation that arrives after a sweep |
| packages/safebyok/tests/models/bank.test.ts:526 | vacates once for a burst of revocations, the first its cause and the rest refused as disabled before they vacate | #plain-english | vacates once for a burst of revocations |
| packages/safebyok/tests/models/bank.test.ts:545 | logs a bad news with no onBadNews to hear it, and other news vacates nothing | #outcome-not-action | logs bad news when there is no onBadNews |
| packages/safebyok/tests/models/bank.test.ts:556 | logs nothing to the console with a logger of three no-ops, though a bad news has no onBadNews to hear it | #plain-english | logs nothing to the console through a no-op logger |
| packages/safebyok/tests/models/bank.test.ts:584 | with no strengthChecker, finds every new passphrase weak, its reason sending the app's makers to CUSTOMIZATION.md | #outcome-not-action | with no strengthChecker, finds every new passphrase weak |
| packages/safebyok/tests/models/bank.test.ts:594 | keeps to its call when the host's logger throws, in Bank.make and past a cached lease row it cannot forget | #plain-english | carries on when the host's logger throws |
| packages/safebyok/tests/models/bank.test.ts:610 | hears a vault's bad news the same as its own, a revocation told so vacating nothing, and news past a sweep going to the logger | #outcome-not-action | handles a vault's bad news like its own |
| packages/safebyok/tests/models/bank.test.ts:662 | refuses a handler that is no function, no bank, or news that is no VaultError, telling nobody | #plain-english | refuses a handler that is not a function, a missing bank, or news that is not a VaultError |
| packages/safebyok/tests/models/bank.test.ts:674 | tells no listener once unsubscribed, and a listener's throw reaches the platform and not the call that changed the bank | #outcome-not-action | two tests: stops notifying once unsubscribed; reports a listener's throw to the platform |
| packages/safebyok/tests/models/bank.test.ts:710 | answers null with no gating open | #plain-english | is null with no gating open (and :715 "answers the live gating" -> "is the open gating") |
| packages/safebyok/tests/models/bank.test.ts:792 | drops a birth's gating at a sweep, whose listeners meet the bank and its listing already disabled | #plain-english | drops a birth's gating at a sweep, after disabling the bank |
| packages/safebyok/tests/models/box-listing-create.test.ts:53 | leaves a void box in the slot where the put is refused with no record, out of the snapshot, and the scope free for another create | #conditions-move-up | leaves the scope free for another create when the put is refused |
| packages/safebyok/tests/models/box-listing-create.test.ts:66 | hears the vaultDB's 'camped' over a live row it does not have, delivered before it is thrown | #plain-english | refuses 'camped' over a live row it does not hold, delivering that row first |
| packages/safebyok/tests/models/box-listing-create.test.ts:95 | over a live box world hears the vaultDB's 'camped', the box world kept | #plain-english ("world" for "held") | refuses 'camped' over a live held box, leaving it unchanged |
| packages/safebyok/tests/models/box-listing-create.test.ts:119 | creates two boxes, each world under its own boxlabel | #plain-english ("world" for "held") | creates two boxes, each held under its own boxlabel |
| packages/safebyok/tests/models/box-listing-create.test.ts:138 | BoxListing: create has a dna to boxDna at its door | #plain-english | BoxListing: create checks its dna with boxDna |
| packages/safebyok/tests/models/box-listing-create.test.ts:175 | gives each box born a box_tok of its own, its birthday gift | #plain-english | gives each new box its own box_tok |
| packages/safebyok/tests/models/box-listing-create.test.ts:201 | refuses ifAbsent 'fail': a create that must find a box is not a create | #no-as-trailer | refuses ifAbsent 'fail' |
| packages/safebyok/tests/models/box-listing-create.test.ts:216 | answers its refusal through tryCreate as an Outcome | #plain-english | tryCreate returns a refusal as an Outcome |
| packages/safebyok/tests/models/box-listing-create.test.ts:226 | puts a full record at revision 0 over no record, its sealed parts the fake lease's | #plain-english | puts a full record at revision 0, sealed by the vault's lease |
| packages/safebyok/tests/models/box-listing-create.test.ts:252 | builds of a record while the vault is locked | #plain-english | builds from a record while the vault is locked |
| packages/safebyok/tests/models/box-listing-create.test.ts:296 | `makes a box present of a dna with ${blurb}` | #plain-english | `creates a box from a dna with ${blurb}` (also :303) |
| packages/safebyok/tests/models/box-listing-create.test.ts:321 | `refuses a dna whose whisper is ${blurb}, naming the field, quoting nothing, having and saving nothing` | #outcome-not-action | `refuses a dna whose whisper is ${blurb}` |
| packages/safebyok/tests/models/box-listing-rows.test.ts:28 | refuses 'absent_box' for a box not world, having none | #plain-english ("world" for "held") | refuses 'absent_box' for a box not held |
| packages/safebyok/tests/models/box-listing-rows.test.ts:34 | resolves null for a box not world under 'nil' | #plain-english ("world" for "held") | resolves null under 'nil' for a box not held |
| packages/safebyok/tests/models/box-listing-rows.test.ts:40 | refuses 'absent_box' for a box world gone, which stays world | #plain-english ("world" for "held") | refuses 'absent_box' for a held box that is gone, and keeps holding it |
| packages/safebyok/tests/models/box-listing-rows.test.ts:49 | resolves null for a box world gone under 'nil', the box still at `at(scope)` as its tombstone | #plain-english ("world" for "held") | resolves null under 'nil' for a held box that is gone, keeping its tombstone |
| packages/safebyok/tests/models/box-listing-rows.test.ts:69 | `refuses 'absent_box' for a ${form} box, built and world as its tombstone` | #plain-english ("world" for "held") | `refuses 'absent_box' for a ${form} box, and holds its tombstone` (also :80, :87) |
| packages/safebyok/tests/models/box-listing-rows.test.ts:112 | does not judge a put's or a del's answer: a deleted box comes back world | #plain-english ("world" for "held") | does not apply ifAbsent to a put's or del's answer |
| packages/safebyok/tests/models/box-listing-rows.test.ts:220 | delivers box_stored to a box not yet world, building it | #plain-english ("world" for "held") | builds a box not yet held from box_stored |
| packages/safebyok/tests/models/box-listing-rows.test.ts:239 | shows a box's sidecar as `box.sidecar` gives it: Bob's your uncle by any path | #plain-english | shows the same sidecar as `box.sidecar` |
| packages/safebyok/tests/models/box-listing.test.ts:25 | makes a listing of a world, a vaultDB and a horizon, calling none of them | #plain-english | makes a listing from a world, a vaultDB and a horizon without calling them |
| packages/safebyok/tests/models/box-listing.test.ts:80 | refuses a dna, which is no record, having and putting nothing | #plain-english | refuses a dna in place of a record |
| packages/safebyok/tests/models/box-listing.test.ts:87 | hands a record to the box already world, which receives it | #plain-english ("world" for "held") | hands a record to the box already held |
| packages/safebyok/tests/models/box-listing.test.ts:98 | hydrates a box world, answering that instance | #plain-english ("world" for "held") | hydrates a held box and returns it |
| packages/safebyok/tests/models/box-listing.test.ts:108 | asks nothing of a full box world within its horizon, and asks again given a horizon of 0 | #plain-english ("world" for "held") | asks storage nothing for a full held box within its horizon, and fetches under a horizon of 0 |
| packages/safebyok/tests/models/box-listing.test.ts:119 | fetches a box not world, and has what it finds | #plain-english ("world" for "held") | fetches and holds a box not yet held |
| packages/safebyok/tests/models/box-listing.test.ts:127 | refuses a box absent as 'absent_box', or answers null where asked for nil | #plain-english | refuses an absent box with 'absent_box', or returns null under 'nil' (same at :133) |
| packages/safebyok/tests/models/box-listing.test.ts:141 | answers the box stored while the vault is locked | #plain-english | returns the stored box while the vault is locked |
| packages/safebyok/tests/models/box-listing.test.ts:150 | refuses fed a put's ifAbsent, and once vacated | #outcome-not-action | two tests: "refuses a put's ifAbsent" and "refuses once vacated" (the gallant pair) |
| packages/safebyok/tests/models/box-listing.test.ts:157 | tryGet answers the outcome | #plain-english | tryGet returns an Outcome |
| packages/safebyok/tests/models/box-listing.test.ts:176 | answers the box world, alive or deleted, as it stands | #plain-english ("world" for "held") | returns the held box, alive or deleted |
| packages/safebyok/tests/models/box-listing.test.ts:184 | under ifAbsent 'fail', answers the box world, alive or deleted, and refuses an empty slot as 'absent_box', naming vault.hello | #outcome-not-action | under ifAbsent 'fail', refuses an empty slot with 'absent_box' |
| packages/safebyok/tests/models/box-listing.test.ts:204 | demands nothing of the vault, as only the put it prepares has side effects: that put refuses 'vault_locked' | #no-as-trailer | works while the vault is locked |
| packages/safebyok/tests/models/box-listing.test.ts:231 | `refuses creating ${blurb} while the vault is locked, having nothing and calling nothing` | #plain-english | `refuses creating ${blurb} while locked, calling nothing` |
| packages/safebyok/tests/models/box-listing.test.ts:240 | refuses a sound dna created while the vault is locked as 'vault_locked', the dna checked first | #plain-english | checks the dna before refusing 'vault_locked' |
| packages/safebyok/tests/models/box-listing.test.ts:247 | says a bag is no whisper, naming whisper, for a dna that hands it as the whisper | #plain-english | refuses a plain object as a dna's whisper |
| packages/safebyok/tests/models/box-listing.test.ts:263 | shows the scope of the vault it lists, as a vault shows its own | #no-as-trailer | shows the scope of the vault it lists |
| packages/safebyok/tests/models/box-putting.test.ts:25 | `puts ${blurb} alive at the next revision, registered now under a new box_tok, over the tombstone's revision` | #conditions-move-up | `brings ${blurb} back to life under a new box_tok` |
| packages/safebyok/tests/models/box-putting.test.ts:53 | seals a whisper with its sidecar over a full box at the next revision, its sealed parts the fake lease's | #plain-english | seals the whisper and sidecar of a full box with the vault's lease |
| packages/safebyok/tests/models/box-putting.test.ts:77 | seals a patch of both halves over a sparse record, fetching nothing and keeping the world timely | #conditions-move-up | seals a patch of both halves over a sparse record without fetching |
| packages/safebyok/tests/models/box-putting.test.ts:104 | refuses a live box still sparse once hydrated, saying so, putting nothing | #outcome-not-action | refuses a live box that is still sparse after hydrating |
| packages/safebyok/tests/models/box-putting.test.ts:111 | has nothing that carries the whisper, in the record in hand or the snapshot | #plain-english | keeps the whisper out of the cached record and the snapshot |
| packages/safebyok/tests/models/box-putting.test.ts:137 | `refuses it over a tombstone stored, with opts ${JSON.stringify(opts)}` | #name-the-referent | `refuses 'stale_write' over a stored tombstone, with opts ${...}` |
| packages/safebyok/tests/models/box-putting.test.ts:146 | puts over the revision in hand, with ifPresent 'repl' | #plain-english | puts over the cached revision with ifPresent 'repl' |
| packages/safebyok/tests/models/box-putting.test.ts:153 | seals over the revision it took on entry: a frontier received during the seal is met as 'stale_write', not sealed over | #plain-english | refuses 'stale_write' when a newer revision arrives during the seal |
| packages/safebyok/tests/models/box-putting.test.ts:169 | resolves itself with ifPresent 'get' over a live record, having that record and saving nothing | #plain-english | with ifPresent 'get' over a live record, takes that record and saves nothing |
| packages/safebyok/tests/models/box-putting.test.ts:176 | takes the timely options beside ifPresent, handing the world its maxWorldMillis | #plain-english | accepts the timeliness options beside ifPresent |
| packages/safebyok/tests/models/box-putting.test.ts:216 | refuses before its guards: a patch naming neither refuses while the vault is locked, too | #plain-english | refuses a patch naming neither half, even while the vault is locked |
| packages/safebyok/tests/models/box-putting.test.ts:222 | seals nothing at an expose, a veil or an unexpose: they move only what the instance has | #no-as-trailer | seals nothing on expose, veil or unexpose |
| packages/safebyok/tests/models/box-putting.test.ts:237 | seals the sidecar given over a full box, carrying none over from the record in hand | #plain-english | seals the given sidecar over a full box, not the cached one |
| packages/safebyok/tests/models/box-putting.test.ts:245 | box.put checks its patch before it asks the lock | #plain-english | box.put checks its patch before it checks the lock |
| packages/safebyok/tests/models/box-putting.test.ts:261 | lays only the whisper and the sidecar of a full patch over the record, whatever else it carries | #plain-english | takes only the whisper and sidecar from a full patch, ignoring other fields |
| packages/safebyok/tests/models/box-seal.test.ts:23 | opens the whisper create sealed, and the one a later put sealed: the sealed parts carry none of it | #outcome-not-action | opens the whispers sealed by create and by a later put |
| packages/safebyok/tests/models/box-seal.test.ts:32 | opens the sealed record in another listing, and refuses 'damaged_whisper' for it with its sidecar altered | #outcome-not-action | two tests: "opens the sealed record in another listing" and "refuses 'damaged_whisper' when the sidecar is altered" |
| packages/safebyok/tests/models/box-whisper-patching.test.ts:23 | deep-merges into a new object, its arrays replaced, leaving the old one be and putting nothing | #outcome-not-action | deep-merges into a new object, replacing arrays |
| packages/safebyok/tests/models/box-whisper-patching.test.ts:37 | tells each subscriber once, leaving the snapshot, which has nothing of the value, as it was | #plain-english | notifies each subscriber once without changing the snapshot |
| packages/safebyok/tests/models/box-whisper-patching.test.ts:49 | is what box.putExposed then puts | #name-the-referent | gives the value that box.putExposed then puts |
| packages/safebyok/tests/models/box-whisper-patching.test.ts:73 | merges while locked, showing nothing and putting nothing, and the unlock shows it | #outcome-not-action | merges while locked, and shows the result after unlock |
| packages/safebyok/tests/models/box-whisper-patching.test.ts:131 | box.whisper answers one object until something moves, in every state, so a hook does not loop | #plain-english | box.whisper returns the same object until it changes, in every state |
| packages/safebyok/tests/models/box-whisper-states.test.ts:87 | box.whisper, state by operation (the Coach, 2026-11-05) | #no-citations | box.whisper, state by operation |
| packages/safebyok/tests/models/box-whisper-states.test.ts:175 | an expose after a veil shows the whisper again, and the snapshot says so (the Coach, 2026-11-05) | #no-citations | an expose after a veil shows the whisper again |
| packages/safebyok/tests/models/box-whisper-states.test.ts:207 | `a ${ending} clears the value, a veil still passes, and an unveil says nothing is exposed` | #outcome-not-action | `a ${ending} clears the value` |
| packages/safebyok/tests/models/box-whisper-states.test.ts:253 | seals the value exposed, an edit in place included, and answers the box | #plain-english | seals the exposed value, including edits made in place |
| packages/safebyok/tests/models/box-whisper-states.test.ts:271 | puts while veiled and unlocked: the veil hides, it does not discard (the Coach, 2026-11-05) | #no-citations | puts while veiled and unlocked |
| packages/safebyok/tests/models/box-whisper-states.test.ts:299 | answers an Outcome from tryPutExposed | #plain-english | returns an Outcome from tryPutExposed |
| packages/safebyok/tests/models/box-whisper-states.test.ts:312 | reads isLocked live, and has none of it on the box | #plain-english | reads isLocked live without storing it on the box |
| packages/safebyok/tests/models/box-whisper-states.test.ts:362 | keeps one listener on two boxes through one's leaving | #plain-english | keeps a listener on one box when the other box leaves |
| packages/safebyok/tests/models/box-whisper-states.test.ts:380 | answers box.whisper with one identity between changes, so a store over it does not loop | #plain-english | returns the same box.whisper object until it changes |
| packages/safebyok/tests/models/box-whisper.test.ts:54 | box.extractWhisper(): what the lease opens that is no whisper | #plain-english | box.extractWhisper(): a decrypted value that is not a valid whisper |
| packages/safebyok/tests/models/box-whisper.test.ts:86 | gives back the very object once unlocked, an edit made before the lock or during it kept | #plain-english | returns the same object once unlocked, with edits kept |
| packages/safebyok/tests/models/box-whisper.test.ts:110 | the bags and Storable.isFUBag: a mark, not an identity | #plain-english | the sentinel objects and Storable.isFUBag |
| packages/safebyok/tests/models/box-whisper.test.ts:131 | a forgery, harmless as it only ever refuses at a put | #no-as-trailer | a forged sentinel |
| packages/safebyok/tests/models/box-whisper.test.ts:146 | never takes a whisper for one: a whisper of that name is exposed | #name-the-referent | never mistakes a whisper for a sentinel, even one with the same name |
| packages/safebyok/tests/models/box-whisper.test.ts:153 | `refuses ${kind}, a copy, or one nested, at a put, keeping what is stored` | #plain-english | `refuses to put ${kind}, a copy of it, or an object containing it` |
| packages/safebyok/tests/models/box-whisper.test.ts:200 | refuses before its guards: a whisper JSON would mangle refuses while the vault is locked | #plain-english | refuses a whisper JSON would mangle, even while locked |
| packages/safebyok/tests/models/box-whisper.test.ts:206 | exposes a plain copy of the whisper put: the host's later change to its own reaches no box, and the box's takes an edit, stable until the next expose | #outcome-not-action | exposes a copy of the whisper put, not the host's object |
| packages/safebyok/tests/models/box-whisper.test.ts:227 | `puts and opens ${blurb} as the whisper it is` | #plain-english | `round-trips ${blurb}` |
| packages/safebyok/tests/models/box.test.ts:31 | are exactly the nine the base tattoos: the four of the scope, registered_at, vault_tok and the three revision props | #plain-english | are exactly nine: the four scope fields, registered_at, vault_tok and the three revision fields |
| packages/safebyok/tests/models/box.test.ts:50 | leave out the world, the listing, the whisper exposed, the record's sealed parts and fmt, which are adorned, private or on the prototype | #no-as-trailer | leave out the world, the listing, the exposed whisper, the sealed parts and fmt |
| packages/safebyok/tests/models/box.test.ts:59 | duck as the record's sparse form where the host JSON-stringifies them | #plain-english | serialize to the record's sparse form under JSON.stringify |
| packages/safebyok/tests/models/box.test.ts:66 | ENCRYPTED is the bag the whisper answers while unexposed, locked or not | #plain-english | box.whisper is ENCRYPTED while unexposed, locked or not |
| packages/safebyok/tests/models/box.test.ts:73 | answers itself, whether the vault is unlocked or locked | #plain-english | is readable whether the vault is locked or not |
| packages/safebyok/tests/models/box.test.ts:172 | is flat in the scope, so that it ducks as one | #plain-english | has the scope fields at the top level, so it can stand in for a scope |
| packages/safebyok/tests/models/box.test.ts:274 | box.receive(rcvd): registered_at, set at a birthday; another vault_tok throws | #outcome-not-action | split into "box.receive(rcvd): registered_at" and "box.receive(rcvd): a record of another vault_tok" |
| packages/safebyok/tests/models/box.test.ts:288 | takes registered_at and box_tok from a newer record of another life received over a box world alive, a birthday elsewhere after a deletion this device never received | #conditions-move-up | takes registered_at and box_tok from a newer record of another life, over a live held box |
| packages/safebyok/tests/models/box.test.ts:300 | a record at the revision world | #plain-english ("world" for "held") | a record at the held revision |
| packages/safebyok/tests/models/box.test.ts:315 | throws for a record under another vault_tok whose life tok path, joined, is the box's own | #plain-english | throws for a record of another vault_tok even when the joined token path matches the box's |
| packages/safebyok/tests/models/box.test.ts:384 | refuses a bag handed to put, naming whisper and saying it is no whisper | #plain-english | refuses a plain object as the whisper |
| packages/safebyok/tests/models/box.test.ts:422 | takes { ...record, whisper, sidecar } to put, putting the next revision over the one world | #plain-english | accepts { ...record, whisper, sidecar } and puts the next revision |
| packages/safebyok/tests/models/ctx-bytes.test.ts:82 | binds a box's two seals to the vault's stamp, the box's own, and each its purpose | #plain-english | binds each of a box's two seals to the vault's stamp, the box's stamp and its own purpose |
| packages/safebyok/tests/models/ctx-bytes.test.ts:150 | makes a box's two purposes two ctxs: its wrapped key will not open as its ciphered whisper | #plain-english | gives a box's two purposes different ctxs |
| packages/safebyok/tests/models/gate.test.ts:22 | refuses a pickle where it wants a Wayin | #plain-english | refuses a plain record in place of a Wayin |
| packages/safebyok/tests/models/gate.test.ts:99 | has the stamp it was handed, as parsed, hidden | #plain-english | keeps the parsed stamp as a hidden prop |
| packages/safebyok/tests/models/gating.test.ts:66 | shows the dialog a gating asking for the scope, and on attempt lands the vault stored, listed and unlocked | #invariant-not-trace | builds the vault stored, listed and unlocked on the dialog's attempt |
| packages/safebyok/tests/models/gating.test.ts:87 | makes the passkey's wayin beside the passphrase's, and spends the answer | #plain-english | adds the passkey wayin beside the passphrase's, and zeroes the answer |
| packages/safebyok/tests/models/gating.test.ts:98 | leaves the gating open on a weak passphrase, putting nothing and spending no passkey answer, and the next attempt lands | #outcome-not-action | stays open after a weak passphrase, and the next attempt succeeds |
| packages/safebyok/tests/models/gating.test.ts:112 | answers the live check with a verdict, and nothing changes | #plain-english | returns a verdict from the live check without changing anything |
| packages/safebyok/tests/models/gating.test.ts:121 | rejects, never throws, a live check of what is no passphrase | #plain-english | rejects, rather than throws, a live check of a non-string |
| packages/safebyok/tests/models/gating.test.ts:129 | has nothing where the put is refused: the gating concludes the refusal, nothing stored, listed or cached | #plain-english | concludes with the refusal when the put is refused, storing nothing |
| packages/safebyok/tests/models/gating.test.ts:142 | leaves the vault stored and listed, locked, where the lease is refused past the put, and the passphrase opens it next | #outcome-not-action | leaves the vault stored but locked when the lease is refused after the put |
| packages/safebyok/tests/models/gating.test.ts:160 | refuses gate_made_elsewhere where another's vault won the slot during the dialog, saying so, with their record kept and no lease | #kind-is-the-assertion, #conditions-move-up | under `describe("when another device builds the vault first")`: "refuses, and keeps the other device's record" (same family :173, :183, :194, :213, :223) |
| packages/safebyok/tests/models/gating.test.ts:173 | refuses gate_made_elsewhere whatever passphrase either chose: the loser's is never tried against the winner's gate | #kind-is-the-assertion, #no-as-trailer | "refuses whatever passphrase either device chose" under the describe above |
| packages/safebyok/tests/models/gating.test.ts:240 | attaches no lease to another life that overtook the put's own answer | #plain-english | attaches no lease when another vault life was stored before the put's answer arrived |
| packages/safebyok/tests/models/gating.test.ts:269 | refuses a second launch, with no join, and the first goes on; concluded, the next launches | #outcome-not-action | refuses a second gating while one is open |
| packages/safebyok/tests/models/gating.test.ts:296 | concludes 'dismissed' on dismiss, having nothing, and whenConcluded hears it | #outcome-not-action | concludes 'dismissed' on dismiss |
| packages/safebyok/tests/models/gating.test.ts:322 | takes any kind's clears from a host's dialog that never narrows on the gating's kind | #plain-english | accepts any kind of cleartext from a host dialog that ignores the gating kind |
| packages/safebyok/tests/models/gating.test.ts:329 | refuses another kind's clears, concluding the gating, putting nothing, and the refusal has no passphrase | #outcome-not-action | refuses the wrong kind of cleartext and concludes the gating |
| packages/safebyok/tests/models/gating.test.ts:340 | refuses a second while one runs, spending what it was handed, and the first goes on | #name-the-referent | refuses a second attempt while one runs |
| packages/safebyok/tests/models/gating.test.ts:364 | concludes a malformed attempt, spends what came with it, and the refusal has no passphrase | #outcome-not-action | concludes on a malformed attempt without quoting the passphrase |
| packages/safebyok/tests/models/gating.test.ts:378 | spends an answer from another realm, whose bytes are no instance of this realm's Uint8Array | #no-as-trailer | zeroes a passkey answer from another realm |
| packages/safebyok/tests/models/gating.test.ts:389 | replaces what a getter on the clears throws, so the passphrase it quotes appears nowhere in the refusal | #so-clause-is-the-behaviour | keeps a passphrase quoted by a throwing getter out of the refusal (same at :466) |
| packages/safebyok/tests/models/gating.test.ts:417 | asks once no lease is granted or cached; a wrong passphrase re-enters, and the right one unlocks | #outcome-not-action | asks for the passphrase when no lease is cached |
| packages/safebyok/tests/models/gating.test.ts:432 | takes up a cached lease, nobody asked | #plain-english | unlocks with a cached lease without asking |
| packages/safebyok/tests/models/gating.test.ts:442 | tells the dialog the gate's passkey, and opens by its answer, spent once it has | #plain-english | unlocks with the gate's passkey, and zeroes its answer |
| packages/safebyok/tests/models/gating.test.ts:503 | concludes as the attempt under way answers when dismissed, a wrong passphrase getting no re-entry | #plain-english | when dismissed mid-attempt, concludes with that attempt's result |
| packages/safebyok/tests/models/gating.test.ts:528 | concludes an open birth on a sweep: nothing outlives the listing | #no-as-trailer | concludes an open birth on a sweep |
| packages/safebyok/tests/models/gating.test.ts:570 | is the same for requestCleartext returning under an attempt | #name-the-referent | concludes with the attempt's refusal when requestCleartext returns mid-attempt |
| packages/safebyok/tests/models/halpimonfire.test.ts:16 | during the seal refuses 'vault_locked', putting nothing: put checks the lock at both ends of the seal | #no-as-trailer | during the seal refuses 'vault_locked', putting nothing |
| packages/safebyok/tests/models/halpimonfire.test.ts:27 | during the put writes the record anyway: the put is past the window, and the box reports locked after | #no-as-trailer | during the put still writes the record |
| packages/safebyok/tests/models/halpimonfire.test.ts:42 | ends unlocked: the proof still takes up and caches its lease, and the next lock() ends that session | #outcome-not-action | ends unlocked |
| packages/safebyok/tests/models/halpimonfire.test.ts:59 | during hello leaves the list made and the next putBox refusing 'vault_locked', putting nothing | #plain-english | during hello still lists the boxes, and the next putBox refuses 'vault_locked' |
| packages/safebyok/tests/models/halpimonfire.test.ts:67 | during getBox's get answers the box, with its whisper refusing 'vault_locked' | #plain-english | during getBox's get still returns the box, whose whisper refuses 'vault_locked' |
| packages/safebyok/tests/models/halpimonfire.test.ts:93 | during delBox's del lands: the tombstone is stored, and the vault reports locked after | #plain-english | during delBox's del still deletes the box |
| packages/safebyok/tests/models/halpimonfire.test.ts:143 | a %s as the answer comes back refuses, the row stored all the same | #plain-english | a %s as the answer arrives refuses, though the row is stored |
| packages/safebyok/tests/models/halpimonfire.test.ts:156 | leaves the vault unlocked on the new lease where a lock crossed its making, with no second forget | #plain-english | leaves the vault unlocked on the new lease when a lock arrives while it is made |
| packages/safebyok/tests/models/lease.test.ts:38 | throws with the lease already gone from memory, and a second revoke asks nothing more, the row left for Lease.forget | #outcome-not-action | throws with the lease already gone from memory |
| packages/safebyok/tests/models/lease.test.ts:60 | caches nothing of itself: a lease is cached by cacheAsCacheCan | #no-as-trailer | caches nothing on its own |
| packages/safebyok/tests/models/lease.test.ts:85 | refuses a kind of proving there is none of | #plain-english | refuses an unknown wayin kind |
| packages/safebyok/tests/models/lease.test.ts:142 | answers null when the device caches no lease | #plain-english | returns null when the device has no cached lease (same "answers" for :146, :155, :201) |
| packages/safebyok/tests/models/lease.test.ts:165 | answers null past autolock, so the vault asks for a proof, and leaves the row untouched, warning of nothing | #outcome-not-action | returns null past autolock and leaves the row untouched |
| packages/safebyok/tests/models/lease.test.ts:175 | opens a row past autolock again once the clock is set back, as the row was left | #no-as-trailer | opens a row past autolock again once the clock is set back |
| packages/safebyok/tests/models/lease.test.ts:192 | finds nothing past an autolock of ForeverMillis, a host's Infinity: a lease cached long ago is in force | #plain-english | never expires a lease under an autolock of ForeverMillis |
| packages/safebyok/tests/models/lease.test.ts:256 | still answers null where a row of another gate has its forget refused, telling no bad news and logging nothing | #conditions-move-up | returns null quietly when forgetting another gate's row is refused |
| packages/safebyok/tests/models/lease.test.ts:274 | `tells a cached record ${blurb} as 'damaged_lease' bad news, quoting none of it, answers null and leaves it in place` | #outcome-not-action, #kind-is-the-assertion | `reports a cached record ${blurb} as bad news without quoting it` |
| packages/safebyok/tests/models/lease.test.ts:306 | throws what forgetLease refuses, the lease out of force all the same; tryRevoke answers it as a bad Outcome | #outcome-not-action | throws what forgetLease refuses, leaving the lease out of force |
| packages/safebyok/tests/models/lease.test.ts:317 | Lease.forget forgets a record with no lease granted, on each call, and starts before it answers, so forgets are written in call order | #outcome-not-action | Lease.forget forgets records in call order |
| packages/safebyok/tests/models/lease.test.ts:328 | Lease.forget throws what forgetLease refuses; tryForget answers it as a bad Outcome | #outcome-not-action | Lease.forget throws what forgetLease refuses |
| packages/safebyok/tests/models/lease.test.ts:411 | refuses a whisper that is no string | #plain-english | refuses a whisper that is not a string |
| packages/safebyok/tests/models/lease.test.ts:430 | refuses to open the box key and whisper of one box laid under another's: 'damaged_whisper' | #plain-english | refuses 'damaged_whisper' for one box's sealed parts moved onto another |
| packages/safebyok/tests/models/lease.test.ts:454 | refuses sealed parts that are no ciphered bags | #plain-english | refuses sealed parts that are not ciphertext objects |
| packages/safebyok/tests/models/lease.test.ts:470 | `reads as a lease, but with ${blurb} its first seal or unseal locks the vault, refuses 'damaged_lease' and lets the lease go, forgetting nothing itself, so the next refuses 'vault_locked'` | #outcome-not-action | `with ${blurb}, locks the vault at its first seal or unseal` |
| packages/safebyok/tests/models/lease.test.ts:487 | will not open once its gate_epoch is moved to the one asked: the epoch is bound by the wrap | #no-as-trailer | will not open once its gate_epoch is altered |
| packages/safebyok/tests/models/listing-delivering.test.ts:21 | Listing's pipeline: what every answer takes | #plain-english | Listing's pipeline: handling of every answer (same at listing-verbs.test.ts:40 and listing.test.ts:38) |
| packages/safebyok/tests/models/listing-delivering.test.ts:23 | throws a refusal as it came, delivering nothing | #plain-english | rethrows a refusal unchanged and delivers nothing |
| packages/safebyok/tests/models/listing-delivering.test.ts:69 | refuses, a refusal among them, its world not taken | #plain-english | refuses any late answer, refusals included, without adopting its world |
| packages/safebyok/tests/models/listing-delivering.test.ts:81 | is thrown to a fetch, which cannot have the record it asked for: the box as it was, nothing told | #no-as-trailer | is thrown to a fetch, leaving the box unchanged |
| packages/safebyok/tests/models/listing-delivering.test.ts:92 | is thrown to a build(record), the box world kept as it was | #plain-english ("world" for "held") | is thrown to a build(record), leaving the held box unchanged |
| packages/safebyok/tests/models/listing-delivering.test.ts:112 | is thrown to a fetch of a scope not world, and nothing is world, saved or told | #plain-english ("world" for "held") | is thrown to a fetch of a scope not yet held, and nothing is held, saved or notified |
| packages/safebyok/tests/models/listing-delivering.test.ts:126 | lets a 'stale_write' reach its caller as it came, the carried record's conflict going to onBadNews | #outcome-not-action | rethrows a 'stale_write' unchanged |
| packages/safebyok/tests/models/listing-delivering.test.ts:135 | leaves the answer's own refusals to the caller: a world's, a refusal answer, the absent refusal | #plain-english | leaves the answer's own refusals to the caller |
| packages/safebyok/tests/models/listing-delivering.test.ts:146 | builds an instance that is world, gone, and not in the snapshot | #plain-english ("world" for "held") | builds a held instance that is gone and absent from the snapshot |
| packages/safebyok/tests/models/listing-delivering.test.ts:154 | is the same revision however often it comes, not one revision under two toks | #plain-english | is one revision however often it arrives |
| packages/safebyok/tests/models/listing-delivering.test.ts:164 | a create(dna) over the scope of a box stored and world alive hears the vaultDB's 'camped': the box world kept | #plain-english ("world" for "held") | a create(dna) over a live held box is refused as 'camped', and the box is unchanged |
| packages/safebyok/tests/models/listing-delivering.test.ts:174 | a create(dna) over the scope of a box stored and world deleted brings it back on the instance world, at the next seq | #plain-english ("world" for "held") | a create(dna) over a deleted held box brings it back at the next seq |
| packages/safebyok/tests/models/listing-delivering.test.ts:222 | listing: a record of another vault_tok meets no instance world | #plain-english ("world" for "held") | listing: a record of another vault_tok reaches no held instance |
| packages/safebyok/tests/models/listing-delivering.test.ts:252 | leaves undelivered a stale_write refusal's stored record of another vault_tok, throwing the stale_write | #plain-english | throws a 'stale_write' whose record has another vault_tok without delivering that record |
| packages/safebyok/tests/models/listing-delivering.test.ts:266 | compares a record listed under another vault_tok by reconcileCentral, so a listed instance keeps refusing as it did | #so-clause-is-the-behaviour | an instance listed under another vault_tok keeps refusing |
| packages/safebyok/tests/models/listing-delivering.test.ts:283 | leaves the instance world under the scope asked as it was, and the instance of the record's scope too | #plain-english ("world" for "held") | leaves the held instances of both scopes unchanged |
| packages/safebyok/tests/models/listing-delivering.test.ts:294 | refuses a put and a del answered with a record of another scope, and the record a stale_write carries, told to onBadNews with the stale_write thrown | #outcome-not-action | refuses a put or del answered with a record of another scope (split the stale_write case out) |
| packages/safebyok/tests/models/listing-verbs.test.ts:26 | listing.fetch(scope): nothing stored for a thing world alive | #plain-english ("world" for "held") | listing.fetch(scope): nothing stored for a box held alive |
| packages/safebyok/tests/models/listing-verbs.test.ts:27 | refuses by the same-revision row same \| gone \| alive, the box as it was | #plain-english | refuses, and leaves the box unchanged |
| packages/safebyok/tests/models/listing-verbs.test.ts:42 | puts a box over the revision it is given, and its answer is the box's | #outcome-not-action | puts a box over the revision it is given |
| packages/safebyok/tests/models/listing-verbs.test.ts:53 | puts a box by the same path, reading its revision from a record as it reads it from a box | #plain-english | reads the prior revision from a record as it does from a box |
| packages/safebyok/tests/models/listing-verbs.test.ts:59 | sends no prior tok over no record, and has the box that is written | #plain-english | sends no prior tok when there is no record |
| packages/safebyok/tests/models/listing-verbs.test.ts:76 | forwards ifAbsent and ifPresent, an upcreate where left out | #plain-english | forwards ifAbsent and ifPresent, defaulting to an upcreate |
| packages/safebyok/tests/models/listing-verbs.test.ts:100 | has tryPut resolve the outcome of a refusal, rejecting never | #plain-english | tryPut resolves a refusal as an Outcome and never rejects |
| packages/safebyok/tests/models/listing-verbs.test.ts:132 | goes over the sparse record's own revision for a box not world | #plain-english ("world" for "held") | deletes over the sparse record's revision for a box not held |
| packages/safebyok/tests/models/listing-verbs.test.ts:159 | makes the fake VaultDB keep the record exactly as given over no row | #plain-english | stores the record exactly as given where there is no row |
| packages/safebyok/tests/models/listing-verbs.test.ts:223 | refuses 'camped' under 'fail', the box world taking the live record | #plain-english ("world" for "held") | refuses under 'fail', and the held box takes the live record |
| packages/safebyok/tests/models/listing-verbs.test.ts:232 | saves nothing under 'get', and resolves the box world taking the live record | #plain-english ("world" for "held") | saves nothing under 'get', and the held box takes the live record |
| packages/safebyok/tests/models/listing-verbs.test.ts:262 | meets 'stale_write' for a record at revision 0 put over no record where storage has stored one, the box world keeping its own | #conditions-move-up | refuses 'stale_write' for a first put where storage already has a row |
| packages/safebyok/tests/models/listing-verbs.test.ts:290 | meets 'stale_write' carrying nothing from a put, and a refusal from a del, where the box world is stored no more | #outcome-not-action | two tests: a put over a vanished row refuses 'stale_write'; a del over one refuses |
| packages/safebyok/tests/models/listing-verbs.test.ts:299 | meets a stored revision lower than the world revision with 'stale_write' carrying it; the box judges it older and keeps its own, stuck there | #outcome-not-action | refuses 'stale_write' when storage has a lower revision than the box holds |
| packages/safebyok/tests/models/listing-verbs.test.ts:312 | listing.tryPut and listing.tryFetch answer the vaultDB's own answer | #plain-english | listing.tryPut and listing.tryFetch return the vaultDB's answer |
| packages/safebyok/tests/models/listing-verbs.test.ts:324 | answers a refusal before the call as a bad answer, its act the refusalkind | #plain-english | returns a refusal made before the call as a bad answer whose act is the refusal kind |
| packages/safebyok/tests/models/listing-verbs.test.ts:331 | answers a fetch with the instance as its val, and the vaultDB's act | #plain-english | returns a fetch's instance as val, with the vaultDB's act |
| packages/safebyok/tests/models/listing.test.ts:40 | has nothing of an empty listing, and still starts the watch | #plain-english | starts the watch even for an empty listing |
| packages/safebyok/tests/models/listing.test.ts:47 | fetches nothing: the instances world stay as they are | #plain-english ("world" for "held") | fetches nothing |
| packages/safebyok/tests/models/listing.test.ts:54 | rejects, throwing nothing at its caller, where the VaultDB's watch refuses | #plain-english | rejects without throwing when the VaultDB's watch refuses |
| packages/safebyok/tests/models/listing.test.ts:60 | tells as bad news the end the VaultDB's watch reports | #plain-english | reports the end of the VaultDB's watch as bad news |
| packages/safebyok/tests/models/listing.test.ts:104 | delivers a notice as a good answer: a box not world is built and world | #plain-english ("world" for "held") | builds and holds a box from a notice of one not yet held |
| packages/safebyok/tests/models/listing.test.ts:116 | hands a notice to the box world, which receives it | #plain-english ("world" for "held") | hands a notice to the held box |
| packages/safebyok/tests/models/listing.test.ts:126 | delivers a notice of a deletion, which no fetch's ifAbsent judges: the box is world gone | #plain-english ("world" for "held") | delivers a notice of a deletion, and the held box is gone |
| packages/safebyok/tests/models/listing.test.ts:136 | tells a refusal met on the way to its world, rather than throwing it | #plain-english | reports a refusal from a notice as bad news instead of throwing it |
| packages/safebyok/tests/models/listing.test.ts:146 | is empty, frozen and the same array before anything is world | #plain-english ("world" for "held") | is the same empty frozen array before anything is held |
| packages/safebyok/tests/models/listing.test.ts:185 | follows a thing's change that no delivery brought: a put, once | #plain-english | follows a change from a put, once |
| packages/safebyok/tests/models/proof.test.ts:279 | a host calling autolock locks a vault past its autolock, and a late page asks for a proof whether its host calls it or not | #outcome-not-action | autolock locks a vault past its autolock time |
| packages/safebyok/tests/models/proof.test.ts:325 | a row past autolock outlives a late page whose dialog closes unanswered, and the first page's bank.autolock finds it and locks | #plain-english | a lease row past autolock survives a late page's unanswered dialog, and autolock then locks |
| packages/safebyok/tests/models/proof.test.ts:387 | a second device: what it does reaches this one's components through the watch, with nobody asked and no lock | #plain-english | a second device's changes reach this device's components through the watch |
| packages/safebyok/tests/models/proof.test.ts:444 | React StrictMode over a vault already cached: the second effect's fresh bank picks up the lease with nobody asked | #plain-english | under React StrictMode, the second effect's bank unlocks with the cached lease without asking |
| packages/safebyok/tests/models/proving.test.ts:73 | answers the strengthChecker's verdict, hearing the passphrase and the scope | #plain-english | returns the strengthChecker's verdict for the passphrase and scope |
| packages/safebyok/tests/models/proving.test.ts:84 | replaces a throw from a getter on what the checker answered with a sanitized refusal: the passphrase it quotes appears nowhere in the refusal | #plain-english | replaces a throwing getter on the verdict with a refusal that does not quote the passphrase |
| packages/safebyok/tests/models/proving.test.ts:137 | refuses a passphrase the world's strengthChecker finds weak as 'weak_passphrase', with its reason, before the keyDeriver is asked | #conditions-move-up | refuses 'weak_passphrase' before deriving a key |
| packages/safebyok/tests/models/proving.test.ts:144 | is of the first gate's epoch, its stamp the one handed | #plain-english | has the first gate epoch and the stamp given |
| packages/safebyok/tests/models/proving.test.ts:207 | is of the first gate's epoch, and leaves the answer unspent: spending it is the caller's | #plain-english | has the first gate epoch, and does not zero the answer |
| packages/safebyok/tests/models/proving.test.ts:236 | proves the gate's passphrase wayin: its stamp and epoch the gate's, its header the wayin's, and it has the gate's vaultKey | #plain-english | proves the gate's passphrase wayin and recovers the vaultKey |
| packages/safebyok/tests/models/proving.test.ts:245 | takes a record's gate as readily as a Gate: its props beside the stamp | #plain-english | accepts a gate record as well as a Gate |
| packages/safebyok/tests/models/proving.test.ts:279 | does not ask the strengthChecker: a passphrase already in use is proved, not judged | #no-as-trailer | does not ask the strengthChecker |
| packages/safebyok/tests/models/proving.test.ts:302 | proves the gate's passkey wayin, its epoch the gate's, and leaves the answer unspent: spending it is the caller's | #plain-english | proves the gate's passkey wayin and does not zero the answer |
| packages/safebyok/tests/models/proving.test.ts:325 | `refuses an answer ${blurb} as 'wrong_passkey', unspent` | #kind-is-the-assertion | `refuses an answer ${blurb}, leaving it unzeroed` |
| packages/safebyok/tests/models/proving.test.ts:340 | keeps the deriver's label and salt length, frozen and branded as guarded, the brand hidden from a spread | #plain-english | keeps the deriver's label and salt length, and brands it as guarded |
| packages/safebyok/tests/models/proving.test.ts:369 | runs the host's load on the host, and resolves for a deriver that carries none | #plain-english | calls the host's load with the host as `this`, and resolves when there is none |
| packages/safebyok/tests/models/proving.test.ts:427 | from NOVEL wraps a new vaultKey under the proving's key: a wayin of its header that opens with the passphrase | #no-as-trailer | from NOVEL wraps a new vaultKey that the passphrase opens |
| packages/safebyok/tests/models/proving.test.ts:440 | from another proving wraps that proving's vaultKey: the passphrase and passkey wayins open to the same vaultKey | #no-as-trailer | from another proving wraps that proving's vaultKey |
| packages/safebyok/tests/models/proving.test.ts:493 | refuses a proving of another vault as its source: a wayin wraps only its own vault's vaultKey | #no-as-trailer | refuses a source proving of another vault |
| packages/safebyok/tests/models/proving.test.ts:501 | refuses a second buildWayin on one proving, so its leases stay under the one vaultKey its first wayin wraps | #so-clause-is-the-behaviour | refuses a second buildWayin on one proving |
| packages/safebyok/tests/models/proving.test.ts:508 | refuses a buildWayin on a stored proving: it has its wayin from birth | #no-as-trailer | refuses buildWayin on a stored proving |
| packages/safebyok/tests/models/proving.test.ts:559 | is HKDF over the PRF bytes, its info the wayin's whole ctx: the vault's stamp, the purpose and the header | #plain-english | is HKDF over the PRF bytes, with the wayin's ctx as info |
| packages/safebyok/tests/models/proving.test.ts:587 | grants a lease of the proving's vault, not yet cached, recording the proving's epoch, when it was proved, and how | #plain-english | grants an uncached lease that records the epoch, the proof time and the wayin kind |
| packages/safebyok/tests/models/proving.test.ts:604 | grants leases over one vaultKey from both provings once both made wayins: what one seals, the other opens | #no-as-trailer | grants leases over one vaultKey from both provings |
| packages/safebyok/tests/models/readme-recipes.test.ts:31 | fetches its passphrase in requestCleartext, spreads and edits the whisper, and a lock takes its fields and an unlock brings them back | #invariant-not-trace | runs as written |
| packages/safebyok/tests/models/readme-recipes.test.ts:64 | shows at an expose, hides at a lock with an edit kept, saves on the button, and unexposes as it unmounts | #invariant-not-trace | runs as written |
| packages/safebyok/tests/models/readme-recipes.test.ts:95 | paints a new object at each patch, a read-only blank at a lock and a veil, and puts what was patched | #invariant-not-trace | runs as written |
| packages/safebyok/tests/models/storable-ops.test.ts:72 | never fetches a created box for want of the whisperCiphered: the birth that was written is full | #no-as-trailer | never fetches a box it created |
| packages/safebyok/tests/models/storable-ops.test.ts:79 | never fetches a deleted central for want of the whisperCiphered, while timely | #plain-english | never fetches a deleted box while timely |
| packages/safebyok/tests/models/storable-ops.test.ts:181 | arms none, however long the record in hand sits: an untimely record waits for the next call that asks | #plain-english | sets no timer: a stale record waits for the next call |
| packages/safebyok/tests/models/storable-ops.test.ts:203 | puts the record sealed over central's revision, resolving this once storage's answer is adopted | #plain-english | puts the sealed record over the cached revision and resolves once the answer is adopted |
| packages/safebyok/tests/models/storable-ops.test.ts:231 | storable.del(): deleted over central's revision, again where gone | #plain-english | storable.del() |
| packages/safebyok/tests/models/storable-ops.test.ts:264 | deletes again a thing deleted, at its tombstone's revision, which stays | #plain-english | deletes a deleted thing again at its tombstone's revision |
| packages/safebyok/tests/models/storable-ops.test.ts:275 | deletes again a thing deleted; the same tombstone answered reads 'same' | #plain-english | treats the same tombstone returned for a repeat delete as 'same' |
| packages/safebyok/tests/models/storable-ops.test.ts:305 | follows the listing's word on isLocked, reading it fresh each time | #plain-english | reads the listing's isLocked afresh on each call |
| packages/safebyok/tests/models/storable-ops.test.ts:354 | storable.hydrate(opts): success is receive's verdict on the record fetched | #plain-english | storable.hydrate(opts): marking success |
| packages/safebyok/tests/models/storable-ops.test.ts:405 | keeps a rebirth written over a box world gone when the deletion world arrives again: an older record says nothing new | #plain-english ("world" for "held") | keeps a rebirth when the old deletion arrives again |
| packages/safebyok/tests/models/storable-ops.test.ts:449 | storable.hydrate(opts): timeliness asks of the record in hand alone | #plain-english | storable.hydrate(opts): timeliness depends only on the cached record |
| packages/safebyok/tests/models/storable-receiving.test.ts:94 | `older \| ${rcvdShape} \| full notes no success: an older record says nothing of the revision world` | #templates-are-tables (tail) | drop the tail after the colon |
| packages/safebyok/tests/models/storable-receiving.test.ts:102 | success noted on a record not older, where the record in hand is whole | #plain-english | marks success for a record no older than a full cached record |
| packages/safebyok/tests/models/storable-receiving.test.ts:223 | other \| newer \| full \| never stored takes 'adopt': a box born elsewhere first is the one storage has stored | #templates-are-tables (tail) | drop the tail after the colon |
| packages/safebyok/tests/models/storable-receiving.test.ts:234 | for a thing never stored reads as 'same': nothing stored is the tombstone it was born with | #no-as-trailer | reads as 'same' for a thing never stored |
| packages/safebyok/tests/models/storable-receiving.test.ts:241 | `for a thing world alive (${centralShape}) refuses, by same \| gone \| alive` | #plain-english ("world" for "held") | `refuses for a live box held as ${centralShape}` |
| packages/safebyok/tests/models/storable.test.ts:69 | is tattooed on the box as its own props, which nothing assigns or deletes | #plain-english | is copied onto the box as read-only own props |
| packages/safebyok/tests/models/storable.test.ts:82 | the props that follow the record in hand: revision_tok, revision_seq, written_at; and vault_tok, which never moves | #plain-english | the record props: revision_tok, revision_seq, written_at and vault_tok |
| packages/safebyok/tests/models/storable.test.ts:118 | keep the vault_tok of birth, not writable: a record under another vault_tok received over a tombstone throws, and neither it nor the scope moves | #outcome-not-action | keep the vault_tok of birth, which no received record changes |
| packages/safebyok/tests/models/storable.test.ts:180 | answers one frozen object, the same one again and again | #plain-english | returns the same frozen object on every call |
| packages/safebyok/tests/models/storable.test.ts:188 | is one function with one identity, answering the current snapshot | #plain-english | is a stable function that returns the current snapshot |
| packages/safebyok/tests/models/storable.test.ts:212 | is made on the first call, so that an align before it has none to replace and tells nobody | #so-clause-is-the-behaviour | an align before the first getSnapshot notifies nobody |
| packages/safebyok/tests/models/storable.test.ts:222 | is made by becomeNotifiable, which answers the box, so that the next change notifies; the snapshot it made is the one getSnapshot answers | #outcome-not-action | is made by becomeNotifiable, so the next change notifies |
| packages/safebyok/tests/models/storable.test.ts:268 | hands each listener the new snapshot to find, already in place when it is called | #plain-english | updates the snapshot before it calls each listener |
| packages/safebyok/tests/models/storable.test.ts:292 | is one function with one identity, answering an unsubscribe | #plain-english | is a stable function that returns an unsubscribe |
| packages/safebyok/tests/models/storable.test.ts:311 | takes an unsubscribe called twice as it takes one | #plain-english | treats a second unsubscribe as a no-op |
| packages/safebyok/tests/models/storable.test.ts:329 | demandPuttable answers the patch as parsed while the vault is unlocked, and refuses 'vault_locked' while it is locked | #outcome-not-action | two tests: "returns the parsed patch while unlocked" and "refuses 'vault_locked' while locked" |
| packages/safebyok/tests/models/storable.test.ts:343 | demandPuttable refuses before the lock, and the lock before a record not whole | #plain-english | demandPuttable checks the patch, then the lock, then that the record is full |
| packages/safebyok/tests/models/storable.test.ts:377 | ensurePuttable refreshes and demands nothing: it resolves while locked, where put refuses | #no-as-trailer | ensurePuttable resolves while the vault is locked |
| packages/safebyok/tests/models/storable.test.ts:384 | put ensures once, before its seal, and a bad patch puts nothing | #outcome-not-action | two tests: "put refreshes once before it seals" and "a bad patch puts nothing" |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:13 | seals over the sentinel prior, puts 'born', and delivers: the whisper opens, nothing of it in the row | #invariant-not-trace | stores a new box whose whisper opens and is absent from the row |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:24 | answers stale_write for a patch of both halves over a box stored but not listed, nothing fetched | #plain-english | refuses 'stale_write' for a full patch over a stored box not yet listed |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:45 | under create, takes neither half, and the box opens to {} and a sidecar of {} | #plain-english | creates a box with an empty whisper and sidecar when given neither |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:94 | hears 'stale_write' where another session's box was written since hello, the record delivered | #plain-english | refuses 'stale_write' where another session wrote the box since hello |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:106 | hears 'stale_write' for a sidecar alone on a box stored but not listed, asking no getBox, and its retry keeps the whisper | #outcome-not-action | refuses 'stale_write' for a sidecar-only put over a stored box not yet listed |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:116 | hears 'damaged_row' for a sidecar alone over a damaged row not listed, fetching nothing: a damaged row is the host's | #no-as-trailer | refuses 'damaged_row' for a sidecar-only put over a damaged row |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:155 | over a row stored, hears 'stale_write' with the frontier delivered, and the next put on that instance is written | #outcome-not-action | refuses 'stale_write' over a stored row, and the next put succeeds |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:169 | over a row stored, hears 'camped' under ifPresent 'fail', the row standing | #plain-english | refuses under ifPresent 'fail' over a stored row |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:189 | as a void listed within its horizon, has getBox ask nothing, and fetchBox hear the box stored, keeping the instance | #outcome-not-action | two tests: getBox asks storage nothing; fetchBox finds the stored box |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:203 | as a tombstone listed within its horizon, has getBox ask nothing, and fetchBox hear a box reborn elsewhere | #outcome-not-action | two tests, as above |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:234 | under ifAbsent 'fail' on a tombstone listed, over a box reborn elsewhere, leaves it to the vaultDB: 'stale_write' with the frontier delivered | #conditions-move-up | refuses 'stale_write' under ifAbsent 'fail' when the box was reborn elsewhere |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:276 | unseals and reseals: the sidecar moves, the whisper opens as it was, sealed anew under the new stamp | #invariant-not-trace | changes the sidecar and keeps the whisper |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:286 | neither reads nor clears the whisper exposed, opening the stored one for a put of the sidecar alone | #plain-english | leaves the exposed whisper alone in a sidecar-only put |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:296 | puts box.whisper handed to it, the exposed whisper taken as any other | #plain-english | puts the exposed box.whisper like any other whisper |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:320 | puts nothing of box.whisper read while locked and handed to a put after the unlock: LOCKED never replaces the secret | #no-as-trailer | never stores LOCKED read from box.whisper while locked |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:334 | puts what a kept reference has at a put after a lock and an unlock: nothing blanked it | #no-as-trailer | puts the value a saved reference holds across a lock and unlock |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:346 | is what putBox of a sidecar alone does to a box listed | #name-the-referent | matches what putBox does with a sidecar alone |
| packages/safebyok/tests/models/vault-boxes-putting.test.ts:390 | edits in place and puts a copy, as a script does | #no-as-trailer | puts a copy of a whisper edited in place |
| packages/safebyok/tests/models/vault-boxes.test.ts:11 | vault.hello: the host's call for the list and the pushes | #plain-english | vault.hello |
| packages/safebyok/tests/models/vault-boxes.test.ts:12 | is run by no box verb, a getBox fetching only its own box and listing only that one | #plain-english | is not called by any box method: getBox fetches and lists only its own box |
| packages/safebyok/tests/models/vault-boxes.test.ts:99 | `${verb} refuses on a vault deleted, as gone beats locked` | #no-as-trailer | `${verb} refuses on a deleted vault, even while locked` |
| packages/safebyok/tests/models/vault-boxes.test.ts:106 | getBox and fetchBox answer the box while locked | #plain-english | getBox and fetchBox return the box while locked |
| packages/safebyok/tests/models/vault-boxes.test.ts:138 | a vault found gone delivers no box: the tombstone reaches the vault as its world, and no bad news is told | #outcome-not-action | a deleted vault delivers no box |
| packages/safebyok/tests/models/vault-boxes.test.ts:161 | takes the gate a box's answer brings: a row moved elsewhere, no notice heard, leaves the vault full with the new gate | #plain-english | adopts the new gate that a box's answer carries |
| packages/safebyok/tests/models/vault-boxes.test.ts:190 | resolves the full box whose whisper opens, and its try form an Outcome | #outcome-not-action | resolves the full box, whose whisper opens |
| packages/safebyok/tests/models/vault-boxes.test.ts:200 | answers within the horizon without a get; fetchBox always gets | #outcome-not-action | two tests: "getBox makes no get within the horizon" and "fetchBox always gets" |
| packages/safebyok/tests/models/vault-boxes.test.ts:218 | of a box stored and not listed hears 'stale_write' over the sentinel, the frontier delivered, and the retry is written | #outcome-not-action | refuses 'stale_write' for a stored box not yet listed, and a second try succeeds |
| packages/safebyok/tests/models/vault-boxes.test.ts:226 | leaves the box listed in its tombstone, a get then absent, the whisper refused | #plain-english | leaves the box listed as a tombstone |
| packages/safebyok/tests/models/vault-boxes.test.ts:294 | refuses a birth over it as 'damaged_row', the row standing | #plain-english | refuses 'damaged_row' for a create over it, leaving the row |
| packages/safebyok/tests/models/vault-boxes.test.ts:301 | is not deleted by tryDelBox, past reading or with its peek: 'damaged_row', the rows and the listing standing | #plain-english | is not deleted by tryDelBox |
| packages/safebyok/tests/models/vault-gate.test.ts:96 | refuses 'damaged_row' at hydrate, a salt too short to be one failing the row's check, and writes nothing | #conditions-move-up | refuses 'damaged_row' at hydrate for a salt that is too short |
| packages/safebyok/tests/models/vault-gate.test.ts:105 | is told as 'damaged_row' from a listing of the bank's vaults, and listed no more | #plain-english | is reported as 'damaged_row' by the bank's listing, and dropped from it |
| packages/safebyok/tests/models/vault-gate.test.ts:146 | lays the next wayin and keeps the passkey: the next passphrase opens, the ante refuses 'wrong_passphrase', the passkey still opens | #outcome-not-action | replaces the passphrase wayin and keeps the passkey |
| packages/safebyok/tests/models/vault-gate.test.ts:195 | refuses 'stale_write' a row moved since the attempt read it, overwriting nothing, the vault adopting the row stored and staying unlocked | #outcome-not-action | refuses 'stale_write' a row moved since the attempt read it (the gallant form; drop the rest) |
| packages/safebyok/tests/models/vault-gate.test.ts:205 | renews the lease under the epoch it wrote, not a newer one delivered before its answer, so the next session asks a proof | #so-clause-is-the-behaviour | renews the lease under the epoch it wrote |
| packages/safebyok/tests/models/vault-gate.test.ts:240 | spreads the record the attempt read, not the live vault: a record delivered during the proving refuses 'stale_write', overwriting nothing | #no-as-trailer | refuses 'stale_write' when a record arrives during the proving |
| packages/safebyok/tests/models/vault-gate.test.ts:253 | the try form answers the refusal | #plain-english | the try form returns the refusal |
| packages/safebyok/tests/models/vault-gate.test.ts:284 | lays the passkey's wayin and keeps the passphrase's: both open, and the passphrase's lease stays granted | #outcome-not-action | adds the passkey wayin and keeps the passphrase's |
| packages/safebyok/tests/models/vault-gate.test.ts:297 | refuses where a passkey is stored, nobody asked | #plain-english | refuses without asking when a passkey is already stored |
| packages/safebyok/tests/models/vault-gate.test.ts:318 | spends a bare ArrayBuffer of PRF bytes in refusing it | #plain-english | zeroes a bare ArrayBuffer of PRF bytes when refusing it |
| packages/safebyok/tests/models/vault-gate.test.ts:330 | refuses 'stale_write' a row moved since the attempt read it, a passkey revoked or added elsewhere never overwritten | #outcome-not-action | refuses 'stale_write' a row moved since the attempt read it |
| packages/safebyok/tests/models/vault-gate.test.ts:340 | nulls the passkey's wayin and keeps the passphrase's, the vault unlocked: no key turns over | #plain-english | removes the passkey wayin and keeps the vault unlocked |
| packages/safebyok/tests/models/vault-gate.test.ts:361 | refreshes before it answers at once: a passkey added elsewhere, within the vault's horizon, is asked for and revoked | #plain-english | revokes a passkey added on another device since the last refresh |
| packages/safebyok/tests/models/vault-gate.test.ts:370 | refuses 'wrong_passphrase' the user of a passkey who cannot prove the passphrase, the wayin left | #plain-english | refuses 'wrong_passphrase' without the current passphrase, keeping the passkey |
| packages/safebyok/tests/models/vault-gate.test.ts:385 | locks no other device: the session with the older gate stays unlocked as it adopts the new, and its next session asks the new passphrase | #outcome-not-action | locks no other device |
| packages/safebyok/tests/models/vault-gate.test.ts:404 | locks the vault, puts a tombstone with its boxes cascaded, forgets the row cached, and stays in its slot tombstoned | #invariant-not-trace | deletes the vault and its boxes, and forgets the cached lease |
| packages/safebyok/tests/models/vault-gate.test.ts:445 | concludes an asking on the listing's goodbye: nothing outlives the listing, a delete's dialog neither | #no-as-trailer | concludes an open delete dialog on the listing's goodbye |
| packages/safebyok/tests/models/vault-gate.test.ts:457 | refuses 'stale_write' a row moved since the attempt read it: nothing deleted, the vault left locked and its row adopted | #outcome-not-action | refuses 'stale_write' a row moved since the attempt read it |
| packages/safebyok/tests/models/vault-gate.test.ts:472 | tells of a refused forget and lets the tombstone stand | #plain-english | reports a refused forget as bad news and keeps the tombstone |
| packages/safebyok/tests/models/vault-gate.test.ts:482 | refuses a vault found gone, nobody asked | #plain-english | refuses a deleted vault without asking |
| packages/safebyok/tests/models/vault-gate.test.ts:494 | goes over the revision handed, not the slot's: a stale copy of this life refuses 'stale_write' | #plain-english | deletes at the revision given, so a stale copy refuses 'stale_write' |
| packages/safebyok/tests/models/vault-gate.test.ts:503 | refuses a stale instance of another life than the slot's, asking the vaultDB nothing, and the slot's vault stands | #plain-english | refuses an instance of an older vault life without calling the vaultDB |
| packages/safebyok/tests/models/vault-lease.test.ts:31 | renewed: a lease granted is attached under the epoch that was written, its row cached, and the vault never reports locked on the way | #outcome-not-action | attaches the new lease under the written epoch without ever reporting locked |
| packages/safebyok/tests/models/vault-lease.test.ts:46 | was locked: a vault locked at the start writes the change and ends unlocked, its row cached | #plain-english | from locked, writes the change and ends unlocked |
| packages/safebyok/tests/models/vault-lease.test.ts:57 | leaves the vault unlocked where a lock() came past the enter key | #plain-english | leaves the vault unlocked when lock() comes after submit |
| packages/safebyok/tests/models/vault-lease.test.ts:88 | A refused forget of the row: lease_revoke_failed | #kind-is-the-assertion | A refused forget of the lease row |
| packages/safebyok/tests/models/vault-lease.test.ts:91 | is announced by the friend's tryForgetLease, which answers it as a bad Outcome | #plain-english | is returned as a bad Outcome by tryForgetLease |
| packages/safebyok/tests/models/vault-lease.test.ts:100 | is heard by the host's onLifecycle, leaving the vault locked and enabled; a rejection of it goes to the platform and no further | #outcome-not-action | is reported to onLifecycle, leaving the vault locked and enabled |
| packages/safebyok/tests/models/vault-lease.test.ts:125 | with no onLifecycle reports it and vacates the vault; the vacate's own refusal finds that done | #outcome-not-action | with no onLifecycle, reports it and vacates the vault |
| packages/safebyok/tests/models/vault-lease.test.ts:140 | The discards: sweep and vacate, down the chain | #plain-english | sweep and vacate |
| packages/safebyok/tests/models/vault-lease.test.ts:153 | sweep leaves the row, drops the lease, disables and delists all the way down | #plain-english | sweep keeps the cached row but drops the lease and disables every child |
| packages/safebyok/tests/models/vault-lease.test.ts:180 | past a discard every guard refuses, what would take a call refuses, and lock, sweep and vacate are no-ops | #outcome-not-action | after a sweep or vacate, every call refuses but lock, sweep and vacate are no-ops |
| packages/safebyok/tests/models/vault-lease.test.ts:196 | past a discard vault.boxListing answers the listing it listed, its verbs refusing | #plain-english | after a sweep or vacate, vault.boxListing still returns its listing, whose methods refuse |
| packages/safebyok/tests/models/vault-lease.test.ts:211 | a hydrate past a discard refuses only where it fetches: a timely record answers the instance, a stale one refuses | #plain-english | after a sweep or vacate, hydrate refuses only when it would fetch |
| packages/safebyok/tests/models/vault-lease.test.ts:232 | a sweep crossing ensureUnlocked's peek at the cached lease refuses, nobody asked | #plain-english | ensureUnlocked refuses without asking when a sweep lands during its lease lookup |
| packages/safebyok/tests/models/vault-lease.test.ts:255 | a box listing swept with its vault refuses a birth, ahead of the lock the sweep left | #plain-english | a swept box listing refuses a create before checking the lock |
| packages/safebyok/tests/models/vault-lease.test.ts:262 | a listing past a sweep or a vacate takes no further call, and answers a late notice with nothing | #plain-english | a listing refuses every call after a sweep or vacate and ignores late notices |
| packages/safebyok/tests/models/vault-lease.test.ts:300 | a vault and a lease show neither the lease friend nor the lease key handle, one level deep, by identity | #plain-english | vaults and leases never expose the lease friend or the key handle |
| packages/safebyok/tests/models/vault-lease.test.ts:301 | no field of a gating shows the gating's friend, nor Object.keys or JSON.stringify, and a vault has no such verb | #outcome-not-action | a gating does not expose its friend through fields, Object.keys or JSON.stringify |
| packages/safebyok/tests/models/vault-life.test.ts:42 | is born unlocked under a gate of its passphrase, which the vault record carries, and a box built in it opens the whisper it sealed; neither record stored has the whisper or the passphrase | #outcome-not-action | is born unlocked, and stores neither the whisper nor the passphrase |
| packages/safebyok/tests/models/vault-life.test.ts:55 | forgets the kept lease at lock(), so the next session asks for the passphrase: its box refuses 'vault_locked', a wrong passphrase refuses 'wrong_passphrase', and the right one opens the whisper the first session sealed | #outcome-not-action | makes the next session ask for the passphrase after lock() |
| packages/safebyok/tests/models/vault-life.test.ts:69 | leaves the cached lease at a sweep, so the next session's ensureUnlocked takes it up and opens the box without asking; a lock() there forgets it, and the session after asks for the passphrase again | #outcome-not-action | lets the next session unlock without asking after a sweep, but not after a lock() |
| packages/safebyok/tests/models/vault-life.test.ts:85 | opens, in a first session locked, a whisper the next one sealed: the first takes up the lease the next cached at its next ensureUnlocked, asking nothing | #plain-english | a locked session unlocks with the lease a later session cached, and opens its whisper |
| packages/safebyok/tests/models/vault-life.test.ts:101 | locks the vault: the exposed whisper shows LOCKED, the unseal refuses 'vault_locked', and the cached lease is forgotten, so the next session asks for the passphrase | #outcome-not-action | locks the vault and forgets the cached lease |
| packages/safebyok/tests/models/vault-life.test.ts:115 | keeps the exposed whisper through the lock: unlocked again by the passphrase, the box answers it again | #plain-english | shows the exposed whisper again once unlocked |
| packages/safebyok/tests/models/vault-life.test.ts:127 | replaces the passphrase: the vault stays unlocked through the change and still seals; the next session's old passphrase refuses 'wrong_passphrase', and the new one opens the box, as does the passkey, whose wayin the change kept | #outcome-not-action | replaces the passphrase, after which only the new passphrase and the passkey unlock |
| packages/safebyok/tests/models/vault-life.test.ts:146 | adds a passkey: the next session unlocks by the passkey alone, and opens the box sealed under the passphrase's lease before the passkey was added | #outcome-not-action | adds a passkey that alone unlocks the next session and opens older boxes |
| packages/safebyok/tests/models/vault-life.test.ts:157 | revokes the passkey: a vault unlocked by the passkey stays unlocked through the revoke and still seals; the next session's passkey is refused, and the passphrase opens what that vault sealed | #outcome-not-action | revokes the passkey, after which only the passphrase unlocks |
| packages/safebyok/tests/models/vault-life.test.ts:182 | asks the other device for the passphrase, though this one caches a lease; unlocked, it caches a lease of its own and opens the box this device sealed, and this device's lock() leaves it unlocked | #outcome-not-action | asks the other device for the passphrase even though this one has a cached lease |
| packages/safebyok/tests/models/vault-life.test.ts:196 | seals, on the other device, a whisper this one opens: every lease of the vault has its one vaultKey | #no-as-trailer | opens a whisper the other device sealed |
| packages/safebyok/tests/models/vault-listing.test.ts:67 | listing's gate verbs: the record each sends the vaultDB | #plain-english | listing's gate methods |
| packages/safebyok/tests/models/vault-listing.test.ts:105 | revokePasskey over no passkey answers the record stored | #plain-english | revokePasskey with no passkey returns the stored record |
| packages/safebyok/tests/models/vault-listing.test.ts:122 | refuses an ante of another bank | #plain-english | refuses a prior record from another bank |
| packages/safebyok/tests/models/vault-listing.test.ts:129 | reaches a local delete's end state when a fetch finds it: locked, row forgotten, boxes vacated, the vault in its slot | #plain-english | leaves the vault as a local delete would, once a fetch finds the tombstone |
| packages/safebyok/tests/models/vault-listing.test.ts:143 | announces a refused forget at its tombstone, not as bad news, and the tombstone stands | #plain-english | reports a refused forget to onLifecycle, not as bad news, and keeps the tombstone |
| packages/safebyok/tests/models/vault-listing.test.ts:163 | ends the box listing with no bad news, the vault listing's own watch off | #conditions-move-up | ends the box listing with no bad news |
| packages/safebyok/tests/models/vault-listing.test.ts:190 | %s refuses, as the refresh that finds the tombstone vacates the box before the box's guard runs | #no-as-trailer | %s refuses |
| packages/safebyok/tests/models/vault-listing.test.ts:200 | lands on that same end state, the tombstone stored | #name-the-referent | leaves the vault deleted, locked and its lease forgotten |
| packages/safebyok/tests/models/vault-listing.test.ts:213 | deletes an unlocked vault with no prompt, landing on that same end state | #name-the-referent | deletes an unlocked vault without asking (same at :214 for a locked vault) |
| packages/safebyok/tests/models/vault-listing.test.ts:233 | refuses the old vault's own fetch and hydrate that met it, resolving no vault let go | #plain-english | refuses the old vault's fetch and hydrate |
| packages/safebyok/tests/models/vault-listing.test.ts:242 | replaces it: the old vacated and delisted, its row forgotten, a new vault in the slot, locked | #name-the-referent | replaces the old vault with a new, locked one |
| packages/safebyok/tests/models/vault-listing.test.ts:257 | has a tombstone of another vault_tok the same way, the old vacated | #name-the-referent | vacates the old vault for a tombstone of another vault_tok too |
| packages/safebyok/tests/models/vault-listing.test.ts:268 | an old instance, replaced by the very call it made | #plain-english | an old instance replaced by its own call |
| packages/safebyok/tests/models/vault-listing.test.ts:269 | vault.del(vault.scope) refuses, and the new life stored stands | #plain-english | vault.del(vault.scope) refuses and leaves the new vault |
| packages/safebyok/tests/models/vault-listing.test.ts:292 | loses to a tombstone, of this vault_tok or another: the vault stays gone | #plain-english | is ignored once the vault is deleted |
| packages/safebyok/tests/models/vault-listing.test.ts:343 | a vault listing refuses to answer for another user, where another vault of this user is plainly not listed | #plain-english | refuses a scope of another user, even when it is not listed |
| packages/safebyok/tests/models/vault-listing.test.ts:349 | Vault.launchBirth refuses a scope of another user, nobody asked | #plain-english | Vault.launchBirth refuses a scope of another user without asking (same "nobody asked" at :357, :365) |
| packages/safebyok/tests/models/vault-listing.test.ts:392 | a birth's listing.put, nothing ever stored: written over never stored | #plain-english | a birth's listing.put with nothing ever stored is written |
| packages/safebyok/tests/models/vault-listing.test.ts:399 | a birth's listing.put, another won: the vault stored is listed and answered, locked, and the record dropped | #plain-english | a birth's listing.put that loses a race lists the winner's vault, locked |
| packages/safebyok/tests/models/vault-listing.test.ts:421 | the entrypoints, handed rubble | #plain-english | the entrypoints, given malformed input |
| packages/safebyok/tests/models/vault-listing.test.ts:434 | lock() with an forget that throws synchronously | #plain-english | lock() with a forget that throws synchronously |
| packages/safebyok/tests/models/vault-listing.test.ts:458 | vacates the vault listed in its slot, keeps the row in damaged_rows, and tells it as bad news | #outcome-not-action | vacates the vault and lists the row in damaged_rows |
| packages/safebyok/tests/models/vault-listing.test.ts:494 | the listing's verbs answer the vaultDB's own answer | #plain-english | the listing's try methods return the vaultDB's answer (same at :545) |
| packages/safebyok/tests/models/vault-listing.test.ts:511 | tryDel answers a delete naming another life than the vault listed as bad, deleting nothing | #plain-english | tryDel returns a bad answer for a delete of another vault life |
| packages/safebyok/tests/models/vault-listing.test.ts:520 | get answers the vault listed, and fetches one that is not | #plain-english | get returns a listed vault and fetches one that is not listed |
| packages/safebyok/tests/models/vault-listing.test.ts:530 | answers 'timely', with no world, where the instance listed is fresh enough, and asks storage nothing | #outcome-not-action | returns act 'timely' without asking storage when the listed instance is fresh |
| packages/safebyok/tests/models/vault-listing.test.ts:555 | answers a disabled listing as bad, asking storage nothing | #plain-english | returns a bad answer on a disabled listing |
| packages/safebyok/tests/models/vault-listing.test.ts:565 | a listing asks storage once for what callers ask at once | #plain-english | concurrent requests share one storage call |
| packages/safebyok/tests/models/vault-unlock.test.ts:30 | ensureUnlocked asks nobody of a vault unlocked, where unlock asks the user for proof | #plain-english | ensureUnlocked does not ask when the vault is unlocked; unlock always asks |
| packages/safebyok/tests/models/vault-unlock.test.ts:40 | the lease cached is ensureUnlocked's to take up: unlock asks for proof past it | #plain-english | only ensureUnlocked uses the cached lease; unlock always asks |
| packages/safebyok/tests/models/vault-unlock.test.ts:61 | is born unlocked, under the lease its passphrase proving grants and the deviceDB caches; ensureUnlocked answers the vault and asks nothing | #outcome-not-action | is born unlocked, with its lease cached |
| packages/safebyok/tests/models/vault-unlock.test.ts:71 | refuses a stamp of no fields, at the seal and at the unseal: a seal bound to nothing of the box's binds nothing | #no-as-trailer | refuses an empty stamp at seal and unseal |
| packages/safebyok/tests/models/vault-unlock.test.ts:77 | locks at `lock()`, reporting locked before it returns and forgetting the row; seal and unseal refuse; then 'dismissed' with no proof and a dialog closed unanswered, the proof's own refusal with a wrong one, and it unlocks with the right one | #outcome-not-action | locks at lock() before it returns (split the unlock cases into their own tests) |
| packages/safebyok/tests/models/vault-unlock.test.ts:97 | tells listeners the lock moved, as the snapshot shows it | #plain-english | notifies listeners when the lock changes |
| packages/safebyok/tests/models/vault-unlock.test.ts:119 | vault.unlock on a vault listed sparse fetches its full record, where the gating it launches would refuse | #no-as-trailer | vault.unlock fetches the full record of a vault listed sparse |
| packages/safebyok/tests/models/vault-unlock.test.ts:138 | seals nothing another vault opens: the vaultKey and the vault's stamp are bound in | #no-as-trailer | seals nothing another vault can open |
| packages/safebyok/tests/models/vault-unlock.test.ts:147 | has the lease, reporting unlocked, and caches its row, in place of the lease it displaces | #plain-english | takes the new lease and caches it over the old one |
| packages/safebyok/tests/models/vault-unlock.test.ts:171 | loses to a lock made while its row is being cached: the vault locked, and no row left cached | #plain-english | yields to a lock that arrives while the lease is being cached |
| packages/safebyok/tests/models/vault-unlock.test.ts:186 | has the lease where the deviceDB refuses its row, told as bad news: it costs the next session a proof, not this one its lease | #plain-english | keeps the lease when the deviceDB refuses to cache it, and reports bad news |
| packages/safebyok/tests/models/vault-unlock.test.ts:201 | The lease this device has cached: taken up in ensureUnlocked alone | #plain-english | The cached lease, used only by ensureUnlocked |
| packages/safebyok/tests/models/vault-unlock.test.ts:202 | attaches it at the next session's ensureUnlocked, opening what the born one sealed, asking nothing; hello takes up nothing | #outcome-not-action | is used at the next session's ensureUnlocked without asking |
| packages/safebyok/tests/models/vault-unlock.test.ts:222 | takes up no lease cached under an older gate, and forgets it: asking for the proof | #plain-english | forgets a lease cached under an older gate and asks for the passphrase |
| packages/safebyok/tests/models/vault-unlock.test.ts:236 | takes up no lease another device cached before the gate changed: the user of a revoked passkey asks for the proof | #no-as-trailer | ignores a lease cached before the gate changed |
| packages/safebyok/tests/models/vault-unlock.test.ts:250 | takes up a cached lease as old as the world's leaseMillis, and leaves one any older not loaded, which reads as no row | #plain-english | uses a cached lease up to leaseMillis old and ignores an older one |
| packages/safebyok/tests/models/vault-unlock.test.ts:275 | tells a row that is no lease as bad news and asks for the proof, leaving it to be cached over | #plain-english | reports an invalid lease row as bad news and asks for the passphrase |
| packages/safebyok/tests/models/vault-unlock.test.ts:301 | forgets the row at a lock() of a vault that has no lease: the next session asks for the proof | #no-as-trailer | forgets the lease row at lock() even without a lease |
| packages/safebyok/tests/models/vault.test.ts:11 | VaultListing.buildVault: the gate is built before the vault is born, and stored in the vault record alone | #outcome-not-action | VaultListing.buildVault |
| packages/safebyok/tests/models/vault.test.ts:12 | builds the vault's gate from what the closure answers, and puts the record with it over no record | #plain-english | builds the gate from the closure's result and stores it in a new vault record |
| packages/safebyok/tests/models/vault.test.ts:22 | has no vault where the dialog throws: the refusal is sanitized, and a second buildVault is not refused as already listed | #outcome-not-action | builds nothing when the dialog throws |
| packages/safebyok/tests/models/vault.test.ts:50 | ducks as its record, the gate_epoch riding on the Gate: listing.recordOf(vault) answers the record it has | #plain-english | serializes back to its record through listing.recordOf |
| packages/safebyok/tests/models/vault.test.ts:57 | has no gate in hand while it has a sparse record, and refuses until it is hydrated | #plain-english | has no gate while sparse, and refuses until hydrated |
| packages/safebyok/tests/models/vault.test.ts:94 | grants the vault whose stamp the proving is of a lease, caching nothing of itself | #plain-english | grants a lease to the vault the proving belongs to |
| packages/safebyok/tests/models/vault.test.ts:140 | answers itself with no fetch while the record in hand is younger than maxMillis, and fetches once it is not | #plain-english | fetches only once the cached record is older than maxMillis |
| packages/safebyok/tests/models/vault.test.ts:179 | resolves over a vault its fetch finds gone, enabled still, and leaves the guards that need it present to refuse | #plain-english | resolves for a deleted vault and leaves refusing to the guards |
| packages/safebyok/tests/models/wayin.test.ts:89 | makes the same wayin again: new Wayin(wayin.pickle()) pickles equal | #plain-english | round-trips through pickle() |
| packages/safebyok/tests/refusals/errors.test.ts:43 | carries refusalkind, family, message and cause, and its family read from the one table | #plain-english | carries refusalkind, family, message and cause |
| packages/safebyok/tests/refusals/errors.test.ts:107 | a box deleted elsewhere is a fact of syncing | #plain-english (stock phrase) | a box deleted on another device is a normal sync outcome; the phrase recurs at :109, :114, :120, :121, :129 |
| packages/safebyok/tests/refusals/errors.test.ts:108 | a novel vault, asked for what only a gated one has, is set up by its first unlock | #plain-english | a vault with no gate yet is set up by its first unlock |
| packages/safebyok/tests/refusals/errors.test.ts:131 | a row no working store could answer, no object at all or of another address, is past retrying | #plain-english | a row that is not an object, or is filed under the wrong address, will not be fixed by a retry |
| packages/safebyok/tests/refusals/errors.test.ts:232 | `is false for ${blurb}, so it can pose as no refusal` | #so-clause-is-the-behaviour | `is false for ${blurb}` |
| packages/safebyok/tests/refusals/errors.test.ts:247 | is null for a VaultError whose kind is off the list: the thrower's own text | #no-as-trailer | is null for a VaultError whose kind is not on the list |
| packages/safebyok/tests/refusals/host-error-sanitizer.test.ts:36 | reads nothing of the foreign throw: one whose every access, instanceof included, throws costs nothing | #plain-english | never reads the foreign error, even one whose every property access throws |
| packages/safebyok/tests/refusals/host-error-sanitizer.test.ts:64 | stands in for a key deriver's throw quoting the passphrase | #plain-english | replaces a key deriver's error that quotes the passphrase |
| packages/safebyok/tests/refusals/host-error-sanitizer.test.ts:79 | stands in for a storage client's failure | #plain-english | replaces a storage client's error |
| packages/safebyok/tests/refusals/outcome.test.ts:26 | narrows on ok, so a destructured val is the answer once a refusal has returned | #so-clause-is-the-behaviour | narrows on ok |
| packages/safebyok/tests/refusals/outcome.test.ts:62 | turns anything else thrown into unexpected_error, the thrown value its cause | #kind-is-the-assertion | wraps anything else thrown, keeping it as the cause (same at :72) |
| packages/safebyok/tests/refusals/outcome.test.ts:81 | never rejects: what an app wraps is one Outcome whatever happens | #no-as-trailer | never rejects |
| packages/safebyok/tests/refusals/outcome.test.ts:91 | turns a throw that is no VaultError into what otherwise makes of it | #plain-english | passes a non-VaultError throw to otherwise |
| packages/safebyok/tests/refusals/outcome.test.ts:130 | hands back a VaultError as the same object, and makes storage_unavailable of anything else, the throw its cause | #outcome-not-action, #kind-is-the-assertion | two tests: returns a VaultError unchanged; wraps anything else with it as cause (same at :140) |
| packages/safebyok/tests/refusals/throwers.test.ts:58 | refuses as storage_unavailable, saying to try again, the backend's error as its cause | #kind-is-the-assertion | says to try again, with the backend's error as cause |
| packages/safebyok/tests/refusals/throwers.test.ts:131 | names no thrown at all for a throw that has no name | #plain-english | names no error for a throw without a name |
| packages/safebyok/tests/refusals/throwers.test.ts:137 | is the kind whose phrase it carries | #plain-english | carries the message for its kind |
| packages/safebyok/tests/shapes/primitives.test.ts:57 | answers for text of millions of characters, refusing it by its length | #plain-english | refuses text of millions of characters quickly, by its length (same at :155) |
| packages/safebyok/tests/shapes/shapes-answers.test.ts:34 | parse each good answer that crossed back to the answer its verb returned | #plain-english | parse each serialized good answer back to what its method returned |
| packages/safebyok/tests/shapes/shapes-core.test.ts:72 | says a bag or a copy is no whisper, and of one nested that a whisper has no symbol key | #plain-english | refuses a sentinel or a copy as a whisper, and a nested one as a symbol key |
| packages/safebyok/tests/shapes/shapes-enums.test.ts:5 | name alive, damaged and gone, a tombstone's am being never alive | #plain-english | list alive, damaged and gone; a tombstone is never alive |
| packages/safebyok/tests/shapes/shapes-gateish.test.ts:63 | takes a passkey's answer, its bytes the very ones handed in | #plain-english | accepts a passkey's answer without copying its bytes |
| packages/safebyok/tests/shapes/shapes-vaultish-box.test.ts:51 | refuses a plain object carrying a field the Box ducks without | #plain-english | refuses a plain object with a field a Box does not have |
| packages/safebyok/tests/shapes/shapes-vaultish-box.test.ts:101 | name the format of the box the models describe | #plain-english | give the box format number the models use |
| packages/safebyok/tests/shapes/shapes-vaultish-box.test.ts:187 | VX.boxDna and VX.boxPatch: the duckish of a box's dna and of its patch | #plain-english | VX.boxDna and VX.boxPatch, given a Box |
| packages/safebyok/tests/shapes/shapes-vaultish-box.test.ts:239 | SX.vaultRecord and SX.vaultSparse: the gate rides in the vault record, and nowhere in the sparse form | #plain-english | SX.vaultRecord and SX.vaultSparse |
| packages/safebyok/tests/shapes/shapes-vaultish-listing.test.ts:99 | fills what a create means: add where nothing stands, fail over a live record | #plain-english | defaults to ifAbsent 'add' and ifPresent 'fail' |
| packages/safebyok/tests/shapes/shapes-vaultish-listing.test.ts:107 | has ifAbsent to 'add': a create that must find a box is not a create | #plain-english | requires ifAbsent 'add' |
| packages/safebyok/tests/shapes/shapes-vaultish-listing.test.ts:138 | refuses a fetch's ifAbsent: 'nil' is no answer to a put | #no-as-trailer | refuses ifAbsent 'nil' |
| packages/safebyok/tests/shapes/shapes-vaultish-records.test.ts:19 | The checks of what the base knows of a record | #plain-english | Record checks used by the Storable base |
| packages/safebyok/tests/shapes/shapes-vaultish-records.test.ts:132 | The checks of what reconciling passes | #plain-english | Checks of reconcile results |
| packages/safebyok/tests/storage/device-db.test.ts:48 | passes a VaultError a generic call throws as it came | #plain-english | rethrows a VaultError from a generic call unchanged |
| packages/safebyok/tests/storage/device-db.test.ts:55 | a deviceDB whose generic call answers a bank row that fails its check | #plain-english | a deviceDB whose generic call returns an invalid bank row |
| packages/safebyok/tests/storage/idb-device-db.test.ts:137 | `says a browser's ${errname} as '${refusalkind}'` | #plain-english | `maps a browser's ${errname} to '${refusalkind}'` |
| packages/safebyok/tests/storage/idb-device-db.test.ts:147 | deletes the old core's device database and each earlier version's, unread, on its first call | #plain-english | deletes the old core's device database and every earlier version without reading them, on first use |
| packages/safebyok/tests/storage/idb-device-db.test.ts:174 | leaves a newer version's database, as an updated tab of the page made it | #no-as-trailer | leaves a newer version's database alone |
| packages/safebyok/tests/storage/idb-device-db.test.ts:183 | answers its calls while another tab has an old database open | #plain-english | works while another tab has an old database open |
| packages/safebyok/tests/storage/idb-device-db.test.ts:192 | leaves another dbName's databases, and the vault's, where they stand | #plain-english | leaves another dbName's databases and the vault database untouched |
| packages/safebyok/tests/storage/idb-shelf.test.ts:17 | answers a shelf that files rows in the database named by its stem and version | #plain-english | returns a shelf that stores rows in the database named by its stem and version |
| packages/safebyok/tests/storage/idb-shelf.test.ts:26 | answers the one shelf for a database, however often it is asked | #plain-english | returns the same shelf for a database on every call |
| packages/safebyok/tests/storage/idb-shelf.test.ts:31 | answers a shelf on a connection of its own once the page has forgotten the database's | #plain-english | opens a new connection once the page has dropped the old one |
| packages/safebyok/tests/storage/idb-shelf.test.ts:42 | answers a shelf of its own for each dbName, stem and version | #plain-english | returns a separate shelf for each dbName, stem and version |
| packages/safebyok/tests/storage/idb-shelf.test.ts:50 | lists the browser's databases for its wipe once for each database, however many shelves use it | #plain-english | lists the browser's databases once per database, however many shelves share it |
| packages/safebyok/tests/storage/idb-shelf.test.ts:76 | refuses a spec that is no bag, and a field it does not accept | #plain-english | refuses a spec that is not an object, or has an unknown field |
| packages/safebyok/tests/storage/memory-vault-db.test.ts:51 | takes a vault's hundredth box and refuses the next as vault_full | #kind-is-the-assertion | accepts a vault's hundredth box and refuses the next |
| packages/safebyok/tests/storage/memory-vault-db.test.ts:59 | refuses a box record over the default bytes as box_too_large, one that a Postgres notice could still carry | #kind-is-the-assertion, #no-as-trailer | refuses a box record over the default byte cap |
| packages/safebyok/tests/storage/vault-db.test.ts:45 | reads as storage_unavailable, the VaultDB's error its cause, by a throw and by an answer alike | #kind-is-the-assertion, #plain-english | wraps a VaultDB failure, thrown or answered, with the original error as its cause |
| packages/safebyok/tests/storage/vault-db.test.ts:63 | read the same, the answer alone carrying the world and dbhas: an error's meta has neither, so no wrapped key | #no-as-trailer | agree, except that only the answer carries world and dbhas |
| packages/safebyok/tests/storage/vault-db.test.ts:80 | the duck a model takes for one | #plain-english | what counts as a VaultDB |
| packages/safebyok/tests/storage/vault-db.test.ts:83 | takes a VaultDB, or a client of one that wears the brand and answers every verb | #plain-english | accepts a VaultDB, or a client that carries the brand and has every method |
| packages/safebyok/tests/test-helpers/device-db-battery.ts:137 | answers an Outcome through each try form | #plain-english | each try form returns an Outcome (same at :416) |
| packages/safebyok/tests/test-helpers/device-db-battery.ts:162 | leaves a row of another vault_tok where it stands | #plain-english | leaves a row of another vault_tok untouched |
| packages/safebyok/tests/test-helpers/device-db-battery.ts:185 | peeks what stood before a forget called after it, however late it is awaited | #plain-english | a peek sees the row as it was before a later forget |
| packages/safebyok/tests/test-helpers/device-db-battery.ts:196 | answers every lease stowed, oldest first, without its key | #plain-english | returns every stowed lease, oldest first, without its key |
| packages/safebyok/tests/test-helpers/device-db-battery.ts:228 | answers an empty list for an empty DeviceDB | #plain-english | returns an empty list for an empty DeviceDB (same at :266, :474) |
| packages/safebyok/tests/test-helpers/device-db-battery.ts:245 | answers a stored row that fails its check, which listLeases leaves out | #plain-english | includes a row that fails its check |
| packages/safebyok/tests/test-helpers/device-db-battery.ts:284 | deletes a row filed under labels today's checks refuse, by the scopepath listRawLeases answers | #plain-english | deletes a row with invalid labels by its scopepath (same family :273, :298) |
| packages/safebyok/tests/test-helpers/device-db-battery.ts:320 | is a no-op where nothing stands | #plain-english | is a no-op where there is no row |
| packages/safebyok/tests/test-helpers/vault-db-battery-dels.ts:25 | answers void with a sentinel over a void row, and gone with the stored tombstone over a tombstone, whatever the revision | #outcome-not-action | two tests: act 'void' over a void row; act 'gone' over a tombstone |
| packages/safebyok/tests/test-helpers/vault-db-battery-dels.ts:39 | refuses a row past peeking at any prior, the sentinels a listing shows among them, with the row | #plain-english | refuses a row too damaged to read, at any prior |
| packages/safebyok/tests/test-helpers/vault-db-battery-dels.ts:73 | a repeat over this life's tombstone moves no revision, whatever its own, and answers the tombstone | #plain-english | a repeat delete returns the tombstone without moving its revision |
| packages/safebyok/tests/test-helpers/vault-db-battery-dels.ts:81 | over no row, or another life's, writes nothing, tombstones what lies under its vault_tok, and answers void with a sentinel | #outcome-not-action | over no row, or another life's, writes nothing and returns act 'void' |
| packages/safebyok/tests/test-helpers/vault-db-battery-dels.ts:102 | refuses a row past peeking at the sentinels a listing shows, and a damaged tombstone at its own revision, tombstoning no box | #outcome-not-action | refuses an unreadable row or a damaged tombstone, and deletes no box |
| packages/safebyok/tests/test-helpers/vault-db-battery-dels.ts:134 | keeps the boxes under a vault row past reading, as it may yet be read | #no-as-trailer | keeps the boxes under an unreadable vault row |
| packages/safebyok/tests/test-helpers/vault-db-battery-gets.ts:41 | answers getVault with a vault row of any vault_tok, as its address is its scope alone | #no-as-trailer | getVault returns a vault row of any vault_tok |
| packages/safebyok/tests/test-helpers/vault-db-battery-gets.ts:148 | answers gotvoid over a bank with no vaults, its world the scope | #plain-english | returns act 'gotvoid' for a bank with no vaults |
| packages/safebyok/tests/test-helpers/vault-db-battery-gets.ts:155 | lists vaults full or tombstone, and sets aside a row failing validation as its scope alone | #outcome-not-action | lists full vaults and tombstones, and sets aside invalid rows |
| packages/safebyok/tests/test-helpers/vault-db-battery-gets.ts:178 | answers the record alone, and the record as world | #plain-english | returns the record as both val and world |
| packages/safebyok/tests/test-helpers/vault-db-battery-gets.ts:183 | over a void row, refuses with no row, and answers null with ifAbsent nil | #outcome-not-action | over a void row, refuses, or returns null under ifAbsent 'nil' (same at :192, :261, :269) |
| packages/safebyok/tests/test-helpers/vault-db-battery-gets.ts:201 | refuses a row failing validation or of a later fmt, naming the field, with no world and the request's safe metadata | #conditions-move-up | refuses an invalid or newer-format row, naming the field |
| packages/safebyok/tests/test-helpers/vault-db-battery-gets.ts:213 | answers the sparse boxes, tombstones included, the rows it set aside, and the vault row as world | #plain-english | returns the sparse boxes, tombstones, set-aside rows and the vault row |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:31 | is born over a void row at the sentinel prior, seq 0, and reborn over a tombstone at its revision | #outcome-not-action | two tests: is born over a void row at seq 0; is reborn over a tombstone |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:40 | replaces a live row at its revision by default, and answers stale_write over one at another | #outcome-not-action | two tests: replaces a live row at its revision; refuses 'stale_write' at another |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:53 | over a live row, ifPresent get answers it as declined, and fail refuses, neither saving | #outcome-not-action | two tests, one per ifPresent value (same at :114) |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:72 | refuses a record's revision_seq not one past its prior's, and a record failing its checks, naming the field and quoting none of it | #outcome-not-action | two tests: a revision_seq that skips; a record that fails its checks |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:94 | names the whole sentinel as a birth's prior, so a void row takes no record past revision_seq 0 | #so-clause-is-the-behaviour | a void row accepts no record past revision_seq 0 |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:103 | is born, replaced and reborn by the row it is written over, with the vault row as world | #plain-english | returns act born, replaced or reborn according to the row it writes over |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:161 | what a put hears, by the row it finds and its ifAbsent and ifPresent | #plain-english | a put's result for each row state, ifAbsent and ifPresent |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:183 | answers declined with the live box under ifAbsent %s and ifPresent get, at its revision or not | #plain-english | returns act 'declined' with the live box under ifAbsent %s and ifPresent get |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:203 | refuses over a void box row or a tombstone a prior misses, under ifAbsent add and ifPresent %s | #plain-english | refuses over a void row or tombstone the prior does not match, under ifAbsent add and ifPresent %s |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:235 | writes a gate verb, which takes no ifAbsent, over the live row it moves | #plain-english | writes a gate method over the live row |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:265 | refuse under any such row, a later fmt among them, and change nothing | #plain-english | refuse, and change nothing, under any such row |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:279 | replacePassphrase lays the wayin on, moves gate_epoch and the revision each one up, and leaves the rest as stored | #outcome-not-action | replacePassphrase sets the new wayin and moves gate_epoch and the revision up by one |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:299 | revokePasskey nulls a passkey stored, and over none answers revoked with nothing moved | #outcome-not-action | two tests: removes a stored passkey; with none stored, returns act 'revoked' and moves nothing |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:309 | a gate verb refuses when the row moved past its params' revision, even a verb its row would otherwise refuse | #plain-english | a gate method refuses when the row has moved past its revision |
| packages/safebyok/tests/test-helpers/vault-db-battery-puts.ts:317 | refuses a verb moving the wayin it leaves alone | #plain-english | refuses a gate method that changes a wayin it should leave alone |
| packages/safebyok/tests/test-helpers/vault-db-battery-races.ts:37 | two births of one vault settle on one life, the other declined with it | #plain-english | two racing births of one vault store one, and the other is declined |
| packages/safebyok/tests/test-helpers/vault-db-battery-races.ts:50 | two replacements of one box at one prior write one, the other refused with the winner | #plain-english | of two racing replacements of one box, one is written and the other refused (same at :62, :89) |
| packages/safebyok/tests/test-helpers/vault-db-battery-races.ts:113 | a vault changed between a gate verb's look at it and its move | #plain-english | a vault changed while a gate method runs |
| packages/safebyok/tests/test-helpers/vault-db-battery-races.ts:121 | answers stale_write with the new life when the vault was deleted and born again | #plain-english | refuses 'stale_write' with the new vault life when the vault was deleted and rebuilt |
| packages/safebyok/tests/test-helpers/vault-db-battery-races.ts:193 | hears a cascade's box under the vault row stored, not the request's tombstone | #plain-english | reports a cascaded box with the stored vault row, not the request's tombstone |
| packages/safebyok/tests/utils.test.ts:38 | answers 43 characters of unpadded base64url | #plain-english | returns 43 characters of unpadded base64url |
| packages/safebyok/tests/utils.test.ts:44 | answers alike for equal text and apart for different text | #plain-english | returns the same hash for equal text and different hashes for different text |
| packages/safebyok/tests/utils.test.ts:49 | answers an id that passes the user_id rule and fails the label rule | #plain-english | returns an id that passes the user_id rule and fails the label rule |

### `tests`

| Where | Title | Fault | Rewrite |
|---|---|---|---|
| tests/scripts/changeset.test.ts:13 | main is no thread | #plain-english | main is not a thread branch (the "is no X" form recurs at :14, :18, :20) |
| tests/scripts/changeset.test.ts:100 | names a package named twice once | #plain-english | lists a package named twice only once |
| tests/scripts/changeset.test.ts:140 | names the file for the thread, and a second for its suffix | #plain-english | names the file for the thread, and adds a suffix to a second one |
| tests/scripts/changeset.test.ts:153 | refuses a branch that is no thread's, and writes nothing | #plain-english | refuses a branch that is not a thread branch, and writes nothing |
| tests/scripts/changeset.test.ts:159 | refuses a request that is not whole, with its reason | #plain-english | refuses an incomplete request and says what is missing |
| tests/scripts/cut-thread.test.ts:82 | refuses a label that is not one, a base that names no commit, and a worktree that exists | #plain-english | refuses an invalid label, an unknown base, or an existing worktree |
| tests/scripts/dependabot.test.ts:43 | keeps whatever the pull request spelled from ending a code span or a line | #plain-english | escapes pull request text that would end a code span or a line |
| tests/scripts/dump-sessions.test.ts:67 | leaves out credentials, and what can be had again | #plain-english | leaves out credentials and anything that can be regenerated |
| tests/scripts/dump-sessions.test.ts:79 | writes the dump readable only by its owner, and stored paths are relative | #outcome-not-action | two tests: "makes the dump readable only by its owner" and "stores relative paths" |
| tests/scripts/dump-sessions.test.ts:88 | takes nothing again while nothing has changed, and writes no second dump | #plain-english | writes no second dump while nothing has changed |
| tests/scripts/dump-sessions.test.ts:119 | ignores the dumps of another volume: they say nothing of what this one holds | #no-as-trailer | ignores the dumps of another volume |
| tests/scripts/file-thread.test.ts:192 | knows a tracked file whose name is not ASCII as the tip's | #plain-english | recognizes a tracked file with a non-ASCII name as part of the tip |
| tests/scripts/git-mergify.test.ts:153 | leaves out a draft, a pull request already labeled queue, and one whose head main holds | #plain-english | skips drafts, pull requests already labeled queue, and ones already merged into main |
| tests/scripts/git-survey.test.ts:165 | counts many commits with no match on main and names the newest three, then goes on to the next branch | #invariant-not-trace | lists only the newest three of many unmatched commits, and goes on to the next branch |
| tests/scripts/git-survey.test.ts:301 | holds back every prune, a finished branch\'s entry too, while one branch holds work | #plain-english | prunes nothing, not even a finished branch's entry, while any branch has uncommitted work |
| tests/scripts/ohai.test.ts:34 | stamps +-:--:-- where when the singer began is not known | #plain-english | stamps +-:--:-- when the start time is unknown |
| tests/test-helpers.test.ts:19 | removes it, and what was left in it, once the test that made it returns | #name-the-referent | removes the directory and its contents once the test returns |
| tests/test-helpers.test.ts:25 | makeScratchDir, called in a beforeEach as its @example has it | #no-as-trailer | makeScratchDir in a beforeEach (with `// makeScratchDir @example N` on the first test) |
| tests/test-helpers.test.ts:34 | has removed the last test's by the time the next test runs | #name-the-referent | removes the previous test's directory before the next test runs |
