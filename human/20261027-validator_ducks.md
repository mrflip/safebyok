# 2026-10-27: Validators in src/shapes/, one parse per precondition -- four questions

Thread `validator_ducks`, stacked on #297, PR #301. Its plan, three surveys, the sweep's rules and
what was built are in `whiteboard/20261027-validator_ducks/`.

**It collides with `vault_params`** (fixup sprint thread 2, building on the same base). This
thread left those members alone, so the restack should meet import lines and a few shared call
sites.

Round 2 took your corrections: the ducks are the shapes themselves, written out and stripping;
`vaultBag` takes any carrier and refuses only a store; and two sweeps made preconditions one-line
parses across `src/`, fixing the bugs the surveys found.

Questions left:

1. **The scope validators' case.** `vaultScope` and `VaultScope` are one validator under two
   names, and STYLE.md names the camel ones.
2. **Retire `invalid_box` for `bad_record`?** It is one bug-only failure, checked twice on the box
   write path.
3. **`VaultBag`, `BankBag` and `BoxListing`** appear in public signatures but are not exported.
   `BoxListing` and `VaultOfBox` are first-guess names.
4. **The host interfaces as `Z.infer`** (`MakeBankOpts`, `VaultLogger`, `KeyDeriver`, `Clock`,
   `StrengthChecker`), at the cost of per-member docs in a host's editor.
