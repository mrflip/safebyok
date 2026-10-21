# docblocks_vaultdb_opts_box: open questions

The doc-block pass over `packages/safebyok/src/vault-db.ts`, `vault-opts.ts` and `box.ts`.

1. **Code and prose disagreed on a broken strength checker.** `MakeVaultOpts.strengthChecker`
   said a checker that answers no verdict, or throws, "is thrown by the call that asked it, even
   a `try` form". Since ec3805d1 (#225) such a checker is refused like any call. The doc now says
   the call refuses 'bad_option' or 'unexpected_error'. No behaviour changed.
2. **When may an adapter override a public verb?** The VaultDB class doc said "never override the
   public verbs, but `listBoxRecords`". `delDamagedVault`'s doc, and the error in
   `del-damaged-vault.ts`, say an adapter that hands each call on to another VaultDB must hand
   `delDamagedVault` on too, which means overriding it. The class doc now names that exception.
   Is that the ruling?
3. **`parseStaleMinutes` named a parameter it lacks.** Its doc said "`fallback` when it is left
   out"; the function has no `fallback`, and uses `StaleMinutes`. The doc no longer says so.
4. **`maxVaultBytes` calls some cases undefined behaviour** (a backend breaking its declared
   limit, or a vault opened with limits that disagree with its backend's). `notes/wontfix.md`
   does not list them. Should it?
5. **`MakeVaultOpts.leaseHours` points to `notes/wontfix.md`**, which the published package does
   not ship. Kept as it was.
6. **@examples with no test pointing back:** `VaultPropsExpectation`, `BoxExpectation`,
   `VaultDelExpectation`, `BoxDelExpectation`, `BoxDeletion`, `StoredBox`, `VaultDBOpts`'s first,
   `listBoxRecords`, `delBox`, `watchTrouble`, `onBadNews`, `getProof`, `parseStaleMinutes`,
   `parseMakeVaultOpts`, `heldListing`. Adding tests was out of scope for a doc-block pass.
7. **One running comment moved, not dropped**: `mayBeNewer`'s rule for maintainers ("any change
   to what a stored record may hold bumps `format`") is now a `//` comment in its body.
