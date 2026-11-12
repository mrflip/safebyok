# 2026-11-12: Documentarian pass on bank_world's adapters -- GraphQL verbs now point at BankDB

The documentarian run over the files sprint bank_world's line changed outside the core: the adapters and the client, as one
PR in two groups. Group 1 did `safebyok-convex`, `safebyok-graphql`, `safebyok-indexeddb` and `safebyok-postgres`; group 2
did `safebyok-react` (`bank-controls.tsx`, `hooks.ts`, `bank-provider.tsx`, `shapes.ts`), and its parts are marked
**(react)** below. Doc blocks only: no behaviour, name, `@example` code or running comment changed,
apart from four reasons moved out of doc blocks into `//` comments.

## Open questions

1. **The GraphQL client's verbs now point at `BankDB` instead of copying it.** Each verb of `GraphQLBankDB` carried the
   core `BankDB` interface's block word for word (`passed`, `ifAbsent: 'nil'`, `gate_issue`, `camped`, ...). Each now has a
   short headline and a `{@link BX.BankDB.<verb>}`, by `#point-dont-redefine`. My reason: the sibling run is rewriting
   `BankDB`'s blocks right now, so a copy here would go stale at once. The cost: hovering a `GraphQLBankDB` verb shows the
   headline, and the details are one click away. If you want the copies back, the better time is after the core run
   lands, copying its new text. `AdapterBankDB` in the core copies the same blocks too. That is the sibling run's file, but
   the same treatment would fit it.
2. **`SafebyokBankComponent.api` still names `identity_revoked`** (thread 16's review nit). I kept it: it is the one kind
   a host branches on here (signed out, so vacate), which `#no-refusal-catalog` allows. I only reworded the block.
3. **Convex `tidyGone` deletes only as much as one transaction allows, and doesn't say whether rows remain.** The `//`
   comment says "a host calls it again to delete the rest", but `Tidied` gives a host nothing to tell it when to.
   Changing that is behaviour, so it's out of scope. I left the doc block saying "as many as one transaction allows" and
   added no "call again".
4. **(react) `BankProvider` now says it remounts its children and vacates the previous user's device.** The old block
   said neither, and both were only in the `//` comments. Both are things a host would otherwise get wrong (state typed
   under one user is gone after a switch; the old user's leases are forgotten). The vacate happens when the next user's
   device is made, so a switch through a null `user_id` vacates nothing until someone signs in, and `user_id`'s own
   block still tells a host to call `vacate()` at sign-out. Cut the line if the block is meant to stay at two.
5. **(react) The hooks section banner in `hooks.ts` lists `VaultStage, VaultLifecycle`**, which live in `shapes.ts`, and
   `VaultLifecycle` spells out the stage literals instead of using `VaultStage`. Both are code, not doc blocks, so I left
   them.

## Where the code and the old prose disagreed

* **`watchRows`, `rowsWatched` (validators) and `RowsWatched` (convex-bank-db)** said "every gate row, vault row and box
  row of a live vault in a watch's scope". The code returns every vault row in scope, including tombstones and rows of
  ended lives, and box rows only for live vaults. All three now say: "the bank row, every gate and vault row in scope, and
  the box rows of each live vault". A vault's scope has no gate rows, which "in scope" now covers, so I dropped the extra
  sentence `watchRows` had.
* **`ConvexBankDBOpts.maxBoxes`** said "This adapter currently enforces it exactly". The component's own comment above
  `putBox` says "Nothing promises that exactness". I dropped the promise from the block (the `//` comment keeps the fact).
* **`ReviseBankSql`** said "ending everything under it". The function deletes every gate, vault and box row under the bank
  and then, for a `buildBank` over a tombstone, inserts the new main gate. The block now says so.
* **`PostgresBankDBOpts.listen`** said `watch` "hears other devices' writes". With `listen`, it hears every write to the
  user's channel, this device's own included. The block drops "other devices'".

* **(react) `LeaseRowLineProps`** said "A null handler means the row has no such button". Only `onForgetRaw` can be null.
  The block now names it.
* **(react) `useDevice`** said "null while nobody is signed in". It is also null on the provider's first render, before its
  layout effect makes the device. The block now says "null while there is none, as when nobody is signed in".
* **(react) `UserBankProvider`** said it renders the dialog for the open gating. It does only when `requestCleartext` is
  not given. The block now says so.
* **(react) `Listing`** said "the rows from the last listing". On a failed listing the code keeps the rows from the last one
  that succeeded. The `val` field's block says so.

## Proposed renames

* `Tallies.refuses(tally, growth, maxBoxes)` -> `wouldPassLimit`: it is a yes/no predicate (STYLE.md: a boolean query is
  `isFoo` or the condition), and it refuses nothing itself.
* idb-bank-db.ts: `Rung`, `#ring`, `#bellname` -> `WriteNotice`, `#broadcast`, `#channelname`. A bell is a private figure
  of speech: the block has to explain it as "a notice of one write, broadcast to every watch".
* `Tallies.weigh(boxDoc)` -> `sizeOf`, low priority: it is pure and returns a number, and the verbs table gives a pure
  function a `fooOf` name.
* **(react)** devmode's `Listing<ValT>` (shapes.ts) -> `PanelListing`: the core's `Listing` is the model class every
  listing extends, and the same name for a panel's last rows and error misleads a reader who knows the core.
* **(react)** `useProvided(hookname)` -> `useProvidedDevice`, low priority: the first line is "Return the nearest
  BankProvider's device", and the name leaves out what is provided.

## Doc-block lines, before -> after

| File | Before | After |
|---|---:|---:|
| safebyok-convex/src/component/banks.ts | 42 | 42 |
| safebyok-convex/src/component/tallies.ts | 25 | 28 |
| safebyok-convex/src/component/validators.ts | 21 | 23 |
| safebyok-convex/src/convex-bank-db.ts | 27 | 27 |
| safebyok-convex/src/phrases.ts | 8 | 8 |
| safebyok-convex/src/server.ts | 24 | 24 |
| safebyok-graphql/src/bank-resolvers.ts | 24 | 26 |
| safebyok-graphql/src/graphql-bank-db.ts | 75 | 61 |
| safebyok-indexeddb/src/bank-shelf.ts | 20 | 20 |
| safebyok-indexeddb/src/idb-bank-db.ts | 13 | 13 |
| safebyok-postgres/src/bank-queries.ts | 17 | 17 |
| safebyok-postgres/src/postgres-bank-db.ts | 35 | 35 |
| safebyok-react/src/components/bank-controls.tsx | 3 | 7 |
| safebyok-react/src/hooks/hooks.ts | 17 | 25 |
| safebyok-react/src/provider/bank-provider.tsx | 13 | 16 |
| safebyok-react/src/shapes.ts | 85 | 89 |

These blocks were already short. The work was in the wording, not the length. `tallies.ts` grew because `Tally` became a
two-item list, and `validators.ts` grew because `boxPutWritten`'s second fact got its own line. The react files grew
because one-line blocks joined by semicolons became a headline and a second line, and because a few blocks gained the
fact a host would otherwise get wrong (where a failure goes, the box watch, the whisper placeholder, the remount).
`shapes.ts` grew because `AskPasskeyOpts` and `Listing` got a block per field.

## Changes, member by member

**safebyok-convex/src/phrases.ts.** Module block: kept the description, and moved "gathered so their wording can be
reviewed in one place" to a `//`. `StoredOutOfStep`: "a component and a client that disagree on whether a write was
stored", instead of "where the classifier here found no write, or stored nothing where it found one".

**safebyok-convex/src/component/validators.ts.** Module block reworded. `askArgs`, `putBoxArgs`, `watchRowsArgs` now
open "The arguments of ...", instead of "A function of the bankDB takes its ask, as the client's verb checked it" and
"`putBox` takes ...". `rowOfGate`, `rowOfVault`, `rowOfBox`, `rowOfWatchedBox`: "as stored" (a slop tell in the
bestiary) became "from storage, unchecked". Every return validator now opens with the function that returns it ("What
`getVault` returns: ..."). `boxPutWritten` lost "As {@link boxWritten}" (a sibling comparison): it now lists boxWritten's
fields plus capacity, with `roomless` on its own line. `rowsWatched`: see the disagreements above.

**safebyok-convex/src/component/tallies.ts.** `MaxVaultBoxSize`: "measured as Convex sizes a document" -> "measured by
Convex's `getDocumentSize`". `Life`: "One life of a vault: its scope, its bank's `bank_tok` and its own `vault_tok`".
`Tally`: a two-item list of the `all_*` and `live_*` fields. `Reckoning`: "if any" -> "or null for none". `BoxDocGiven`:
"the core's predicates" -> "the core". `weigh`, `growthOf`, `capacityOf`, `reckon`, `record`, `countBoxes`: the
mechanism came out (see dropped facts), and each now opens with what it returns or does. The top-of-file `//` comment
("one query list it") is a running comment, so I left it, as briefed.

**safebyok-convex/src/component/banks.ts.** `putGate`: "its verb's policy included" (a dangling absolute) -> "under the
verb's policy". `watchRows`: see the disagreements above. `storedOrNull`: "when it refuses a row stored" -> "if it refuses".
`endedBoxQueries`: reworded into one sentence ("that belong to no life in `lives` and lie under no vaultlabel in
`sparedlabels`"). `lifeOf`: "The {@link Life} of an ask or a record, without its other fields." The rest were already fine.

**safebyok-convex/src/convex-bank-db.ts.** `ConvexBankDBOpts.maxBoxes`: the default moved to the headline. Kept: the
`vault_full` a caller meets and the component's own limit. Dropped: "currently enforces it exactly". `RowsWatched`: see
the disagreements above. `refusalOf`: dropped "is rebuilt as itself". `storedAsWritten`: "Return `stored`, demanding that
its act is a write exactly when the component wrote." `changesOf`, `heardOf`: "the row above it" (rows have no height) ->
"its parent row". `latestOf`: two sentences instead of a trailing participle.

**safebyok-convex/src/server.ts.** `SafebyokBankComponent.api`: the two sentences on the first line are now one, and
`identity_revoked` stays on line two (open question 2). `componentCheck`: "never undefined or null" -> "not null".
`scopeUser`: the trailing absolute became a sentence.

**safebyok-graphql/src/graphql-bank-db.ts.** Class block: added "It checks each ask before sending it, and each answer the
server returns" (the guarantee a reviewer looks for: `notes/more_style.md`, "A browser checks what a server sends").
`IsBankDB`: the core's wording, "Always true: marks a bankDB for safe branding." Each verb now has a headline and a link to
`BX.BankDB.<verb>` (open question 1). `tidyGone` lost "For hosts". `tryListBoxes` lost its copy of the core's `parent`
note. `watch`: kept the GraphQL-specific contract (it ends at the first trouble, calls `onBadNews` once, and does not
resubscribe on its own; `identity_revoked` ends it silently), and added "To resume, call `watch` again" (`#say-what-to-do`).
`gateVerbAskOf`, `answerForRefusal`: plainer. `troubleOf`: points at `networkTroubleOf` and `schemaNotServed` instead of
glossing them. `ensuredOf`, `listedOf`: "but not its `damaged_rows`" -> "Its `damaged_rows` are left as sent".

**safebyok-graphql/src/bank-resolvers.ts.** `BankResolversOpts`: "which you call once when your server starts" moved to
`bankResolvers`, whose block it describes. `safebyokEpochMillis`: "GraphQL's own Int is 32-bit" is a reason, so it moved
to a `//`.

**safebyok-indexeddb/src/bank-shelf.ts.** `BankDBVersion`: the reason (so names sort by version) moved to a `//`.
`shelfOf`: the two names in their natural order. `BoxScopepath`: "Each vault life has its own box rows" (the tuple
already shows both tokens). `lifeRangeOf`: "one vault life", instead of "one life of a vault in one life of its bank".

**safebyok-indexeddb/src/idb-bank-db.ts.** `IdbBankDBOpts.maxBoxes`: "live and deleted together" -> "tombstones
included", the wording the other adapters use. `#roomIn`: shortened.

**safebyok-postgres/src/bank-queries.ts.** Module block: the reason (each statement is written out so it can be run by
hand) moved to a `//`. `ReviseBankSql`: see the disagreements above.

**safebyok-postgres/src/postgres-bank-db.ts.** `PostgresBankDBOpts`: `listen` lost its semicolon and "other devices'".
`maxBoxes` now says "tombstones included". `refusalOf`: names the two kinds it chooses between. `#roomAt`: "tombstones
included".

**(react) components/bank-controls.tsx.** `BankLockControl`: "Render whether ... ; nothing while there is no bank"
became a headline and a second line, which adds that a failed unlock goes to the provider's `onBadNews` and a dismissed
dialog does not. `CreateVaultButton`: "the bank first, built or unlocked where it needs to be" -> "building or unlocking
the bank first if needed"; added that it is disabled while nobody is signed in, and where failures go. `tellUnlessDismissed`:
"Tell `device`'s host of `err`" -> "Send `err` to `device`'s `onBadNews`".

**(react) provider/bank-provider.tsx.** `BankContext`: the gapped list became two sentences. `useProvided`: the throw got
its own line. `useProviderDevice`: "keep it until unmount" -> "sweep it at unmount"; added that it starts bringing up the
bank, that ignored changes to `opts` are warned of (`useWarnOfIgnoredOpts`), and that the device always calls the latest
`handlers`. `latest`: a phrase. `BankProvider`: the semicolon went; "the built-in dialog for the device's open gating,
building or deleting the bank among them" -> "a built-in dialog for each gating the device opens"; added the remount and
the vacate (open question 4). `UserBankProvider`: the dialog only without `requestCleartext` (see the disagreements).
`isHostAsking`: "in place of" -> "instead of".

**(react) hooks/hooks.ts.** `useDevice`: "Its `vacate()` is sign-out" -> "Call its `vacate()` at sign-out"
(`#say-what-to-do`). `useBank`: the semicolon list became a second sentence. `useBankSnapshot`: "whose `isLocked` is the
one lock its vaults and boxes share" got its own line: "covers every vault and box in the bank: they share one lock".
`useDeviceSnapshot`: the field list shrank (see dropped facts). `useDeviceSnapshotFor`, `useVaultFor`: "Same as {@link
...}." (a sibling comparison) -> "{@link ...}, naming `hookname` in the error when there is no provider". `watchedLives`:
reordered. `useVault`: added that it begins the box watch, so the host need not call `vault.beginWatch()`. `useBoxes`:
"the present boxes" (the listing's snapshot holds only present ones). `useBox`: "until" -> "while" (it goes null again
when the box is deleted). `useBoxIsShowing`, `useBoxExposure`: two fragments became one sentence each. `useWhisper`:
added "ask {@link useBoxExposure}, never the placeholder's identity", which the core's `ENCRYPTED` block asks of every
caller (the placeholder is `ENCRYPTED`, `LOCKED` or `VEILED`, frozen per copy of safebyok).

**(react) shapes.ts.** `BankProviderProps`: "which it fills in" (a hung clause) went. `VaultStage`: "in hand" -> "up";
the dangling "the bank unlocked" became "Call `bank.ensureVault` on the unlocked bank to create one"; `bankless` also
covers a bank built anew elsewhere, as `useBank` says. `VaultLifecycle`: "What `useVault` returns", as group 1 opened the
return validators. `AskPasskeyOpts`: the inline list became a block per field, worded as `CreatePasskeyOpts.timeout` and
`passkeyRpId` are. `Gripe`: the "which" clause became a sentence naming `refusalkind`. `ModalFormProps.onCancel` and
`.cancelTakesFocus`: the colon and the semicolon became sentences, and "a confirm" -> "a confirmation". `Listing`: a block
per field (see the disagreements). `LeaseRowLineProps`: names `onForgetRaw`. The rest were already plain.

## Dropped facts

Facts I dropped that STYLE.md does not plainly cut. Put back what matters:

* `ConvexBankDBOpts.maxBoxes`: "This adapter currently enforces it exactly." It is still in the `//` above the
  component's `putBox`, beside "Nothing promises that exactness".
* `Tallies.weigh`: "by Convex's `getDocumentSize` with its allowance for system fields" (mechanism). `getDocumentSize`
  is named on `MaxVaultBoxSize` now.
* `Tallies.reckon`: "a count of its box rows that stops once a limit is passed" (mechanism). The null tally a caller
  sees past a limit is on `Reckoning`.
* `Tallies.countBoxes`: "its tally's count, or else a count of its rows" (mechanism).
* `Tallies.record`: "inserting the tally row the first time" became "creating it if needed".
* `CVX.askArgs`: "as the client's verb checked it". The component parses every ask again (the `//` above `askFor`).
* `GraphQLBankDB` verbs, each now behind its `{@link BX.BankDB.<verb>}`: `ensureBank`'s `damaged_rows` and its null
  `val`; `buildBank`'s "over no bank or its tombstone" and its `passed` act; `replacePassphrase`, `addPasskey` and
  `revokePasskey`'s `gate_issue` refusal, `addPasskey`'s `camped` refusal, `revokePasskey`'s `passed` act; `getVault` and
  `getBox`'s `ifAbsent: 'nil'`; `putVault` and `putBox`'s "live under `bank_tok`", "as `ifPresent` and `ifAbsent`
  allow" and `passed` act; `listBoxes` and `getBox`'s refusal when the vault is not live; `tryListBoxes`'s `parent` on
  a refused vault row.
* `GraphQLBankDB[IsBankDB]`: "recognized even across duplicate copies of safebyok". The `Symbol.for` brand rule is in
  `notes/more_style.md`.
* `GraphQLBankDB.watch`: "because the session is no longer signed in", now just the kind `identity_revoked`.
* `IdbBankDB.#roomIn`: "by its `bank_tok` and `vault_tok`", and "soft" before cap (the options say soft).
* `BoxScopepath`: "It includes the `bank_tok` and `vault_tok`". The tuple shows them, and the `//` above keeps the reason.
* **(react)** `useDeviceSnapshot`: "why it ended" from the field list. `DeviceSnapshot.err` carries it, and `VaultLifecycle`
  gives it as `cause` once `spent`.
* **(react)** `BankProviderProps`: "`gates`, which it fills in" (the provider passes `['main']`).
* **(react)** `BankProvider`: "building or deleting the bank among them", now "each gating the device opens".
* **(react)** `useProviderDevice`: "keep it until unmount", now "sweep it at unmount" (a StrictMode rerun makes a fresh
  device; the `//` in the body says so).
