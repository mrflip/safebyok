---
"safebyok": minor
---

A vaultDB's verbs are an interface of their own, so a client of a store can stand where the store does:

* `VaultDBVerbs` (`safebyok`, `safebyok/storage`) names the verbs a model calls, plain and `try*`, and `VaultDBVerbnames` lists them. The abstract `VaultDB` implements it; `tidyGone` stays on the store alone.
* `BankOpts.vaultDB` and the listing models take a `VaultDBVerbs`. The check of it now asks for each verb as a function as well as the brand, and refuses, as `bad_option`, a branded object missing one.
* `safebyok/storage` exports the checks a client parses a vaultDB's answers with off a wire, where an absent field arrives as null: one per verb (`listVaultsAnswer` to `delBoxAnswer`), `crossedNotice` for a watch, and `crossedErr`, `crossedReqParams`, `damagedVault` and `damagedBox`. Each parses to the answer the verb returns, its refusal a `VaultError` again; a field it does not know, or a damaged row outside `damaged_rows`, is `unexpected_error`.
* `ListAct` names the acts of a listing.
