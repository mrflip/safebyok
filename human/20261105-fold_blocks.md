# 2026-11-05: Shapes sectioned and code regrouped into fold blocks -- proposals for the rework

Both PRs are move-and-group only, bar `refusingAs`. Decisions for the internal rework:

* **Vault's lease methods** now sit together. The lifecycle half (`#attachLease`, `#renewLease`, `#dropLease`, `#vacateLease`) could fold into `Lease`.
* **Repeats to look at:** the gate verbs across `Vault`, `VaultListing`, `VaultDB` and `Gating`; the bad-news route; `Bank`'s lease sweep; overlapping guards.
* **Names that read alike:** `Vault.del`/`delVault`, `Storable.isFull`/`isWhole`/`isWholeRecord`, `Listing.handleIfAbsent`.
* **Untested directly:** see the shape-sections PR's list. Start with `whisper`'s and `sidecar`'s refusal kinds, which are promises.
