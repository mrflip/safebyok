# 2026-10-27: Validators in src/shapes/, duck validators -- six questions

Thread `validator_ducks`, stacked on #297. Its plan, three surveys and what was built are in
`whiteboard/20261027-validator_ducks/`.

**It collides with `vault_params`** (fixup sprint thread 2, building on the same base). This
thread left those members alone, so the restack should meet import lines only.

Questions, each a contract or naming call left as it was:

1. **`vaultBag` and Vault objects.** The duck contract says a caller may hand in a Vault object.
   #293 made `vaultBag` strict, and its open question asked whether to accept one. Today a
   `vaultScopeDuck` would take a Vault object and still refuse a store in the bag. Left strict.
2. **Retire `invalid_box` for `bad_record`?** It is one bug-only failure, checked twice on the box
   write path. This thread dropped only the vault's re-kinding of it.
3. **The scope validators' case.** `vaultScope` and `VaultScope` are one validator under two
   names, and STYLE.md names the camel ones.
4. **`Kit.fn`.** It costs `idb` 43 B and `utils` 56 B. `Kit.fn` and `Kit.duck` are both public.
5. **`VaultBag`, `BankBag` and `BoxListing`** appear in public signatures but are not exported.
   `BoxListing` and `VaultOfBox` are first-guess names.
6. **`passkeyAnswerShape`** refuses bytes from another realm (`instanceof Uint8Array`), and
   `lease.ts` accepts them (by tag).
