# 2026-10-16: Sprint gripes_part2 done -- one merge lands it; your open matters are in the doc

Your `proceed` rows from the gripe_rulings doc's Open Matters tab, built as four threads from main
at `b60e516`, reviewed at medium, normal mode:
- the default checks refuse lone surrogates and, in notes, control characters, and our refusals
  say which rule failed;
- `safebyok/validators` no longer drags in the record schemas (8.36 → 3.86 kB);
- a misspelt validator field is refused everywhere, through one exported `checkValidators`;
- a forgotten validators bag no longer quietly applies the defaults;
- a bug found on the way: changing a passphrase or passkey ignored a host's wider checks;
- Convex checks `getUserId` and its component when the host builds it, not at the first request;
- the test helpers no longer hide leaks or double-record, and the demo's tests clean up;
- `TODO.md` holds the questions you asked to have written down; `STYLE.md` the `expect*` rule.

**The line, bottom to top.** Merging the top (#100) with a merge commit marks all merged.

1. [#104](https://github.com/mrflip/safebyok/pull/104): validators_tightening (on main).
2. [#103](https://github.com/mrflip/safebyok/pull/103): test_hygiene. Stacked on #104.
3. [#102](https://github.com/mrflip/safebyok/pull/102): convex_setup_check. Stacked on #103.
4. [#101](https://github.com/mrflip/safebyok/pull/101): docs_rulings. Stacked on #102.
5. [#100](https://github.com/mrflip/safebyok/pull/100): this sprint's documents. Stacked on #101.

**Not reviewed, said plainly.** Three small changes came after their reviews, at the
orchestrator's word: #102's component check and trimmed message; #103's per-method queue for
`beforeNextCall` (restoring main's arm-twice behaviour, 76 lines, tested); #104's regex rewrite.
Each has tests, and `pnpm justify` ran green at the top of the line.

**Open, for you** -- as `drafting` rows in the Open Matters tab, each with a Rec:
- size checks: why not once, after serialization? (two checks, different questions; keep both);
- erasing a box under a refused name reads it twice;
- `read()` and `use()` don't document `bad_label`;
- `withUnlockedVault`: #98 resolves null on a misuse rather than rejecting, as you'd approved;
- `unlocklabel` has no validator slot;
- closing a vault twice unsubscribes twice;
- #104's forgotten bag: harmless (as built) or a required argument (nine public signatures).

**Minor, in the PRs:** boxes already stored with a control character or a lone surrogate now
list as damaged (#104); `\p{}` on Hermes untested (#104); `expectRefusal` is stricter for a
lookalike `VaultError` from a second copy of the core (#103); `stateOnOpen` still leaves its vault
open (#103).

**Housekeeping:** the delete-directories command is in its matter row. The other session's
matters sprint (#96 to #99, more coming) shares `vault-provider.tsx`, the test helpers and
`TODO.md` with this line; whichever lands second restacks.
