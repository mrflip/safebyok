---
"safebyok": minor
---

A vaultDB's verbs are an interface of their own, so a client of a store can stand where the store does. Nothing here reads what an older release wrote or sent.

* `VaultDBVerbs` (`safebyok`, `safebyok/storage`) names the verbs a model calls, plain and `try*`, and `VaultDBVerbnames` lists them. The abstract `VaultDB` implements it, `tidyGone` and `tryTidyGone` among its verbs, so a client of a store offers them too.
* `BankOpts.vaultDB` and the listing models take a `VaultDBVerbs`. The check of it now asks for each verb as a function as well as the brand, and refuses, as `bad_option`, a branded object missing one.
* `safebyok/storage` exports the checks a client parses a vaultDB's answers with off a wire, where an absent field arrives as null: one per verb (`listVaultsAnswer` to `delBoxAnswer`, and `tidyGoneAnswer`), `crossedNotice` for a watch, and `crossedErr`, `crossedReqParams`, `damagedVault` and `damagedBox`. Each parses to the answer the verb returns, its refusal a `VaultError` again; a field it does not know, or a damaged row outside `damaged_rows`, is `unexpected_error`.
* `fetchFailed` and `WatchEnded` (`safebyok/storage`) are the sentences a client of a GraphQL server says a failed request and a watch's ended stream in.
* `VaultDBVerbs.watch` takes an optional `onBadNews`, which a vaultDB whose watch can end unbidden tells of that end; a bank's listings pass it on to the host's `onBadNews`, or the logger.
* `ListAct` names the acts of a listing, and `IsVaultDB` (`safebyok/storage`) is the brand a vaultDB of your own answers true to.
* A damaged row crossing a wire keeps the label it is stored under, though that label fails a label's check.
* Breaking: `VaultDB.relay` and the `VaultDBRelay` type are gone. A server carrying a vaultDB to a browser calls its verbs, or their `try*` forms, itself, as `safebyok-graphql/server` now does.
* The README says what a host must do when the signed-in user changes: vacate the bank and make another. A bank never follows a change of user_id.
