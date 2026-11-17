# 2026-10-15: Sprint second_harvest done -- one merge lands the rest; the open questions are in TODO.md

The sprint took the low_hanging_fruit sprint's leftovers and the rulings you made along the way:
- the core's validation moved to `zod/mini`, cutting `openVault` from 30 kB to about 16 kB brotlied;
- a failed `openVault` cleans up after itself, and its errors come in families a host can branch on;
- a shortened passphrase-reentry setting takes hold at the next open;
- a lock now beats an unlock racing it;
- `lockSoon()` gives a grace period before locking;
- every stored time is a bounded, whole epoch millisecond, named for what happened, and the host clock is checked;
- a pluggable logger, with the console as the fallback when the host passes none.

Every ready PR now forms one **merge stack**. Each branch sits on the one below, and every PR's base is `main`.
Merging the top PR with a merge commit (not a squash) marks all the others merged.

**The stack, bottom to top** (each "Stacked on" the one before). You merged #51, so 1-9 are in main; merging the
top (#63) lands the rest:

1. [#45](https://github.com/mrflip/safebyok/pull/45): store backoff (low_hanging_fruit).
2. [#37](https://github.com/mrflip/safebyok/pull/37): `mask` and `safebyok/utils`, squashed to four commits.
3. [#55](https://github.com/mrflip/safebyok/pull/55): thread 4, lock_race. A lock wins against an unlock in flight.
4. [#60](https://github.com/mrflip/safebyok/pull/60): thread 5, `lockSoon()`.
5. [#57](https://github.com/mrflip/safebyok/pull/57): the epoch bounds. `FarFuture` is in 2255, `FarPast` is 1981, and `EpochMillis` sits between them.
6. [#58](https://github.com/mrflip/safebyok/pull/58): thread 3, remembered_deadline.
7. [#59](https://github.com/mrflip/safebyok/pull/59): CLAUDE.md's exception, "Until 1.0.0, neither binds backward".
8. [#61](https://github.com/mrflip/safebyok/pull/61): thread 2, provider_conditions. Error families, and a failed open closes its watch.
9. [#51](https://github.com/mrflip/safebyok/pull/51): the low_hanging_fruit sprint's documents, squashed to one commit.
10. [#62](https://github.com/mrflip/safebyok/pull/62): thread 1, zod_mini.
11. [#52](https://github.com/mrflip/safebyok/pull/52): test helpers as `TH`, published as `safebyok/testing` (another session's work, restacked here).
12. [#64](https://github.com/mrflip/safebyok/pull/64): thread 6, clean_times. Stored times, the clock check, and `Infinity` coerced at the door.
13. [#65](https://github.com/mrflip/safebyok/pull/65): thread 7, pluggable_logger.
14. [#66](https://github.com/mrflip/safebyok/pull/66): this sprint's documents, CLAUDE.md's console line, and
    TODO's open questions.
15. [#49](https://github.com/mrflip/safebyok/pull/49): a thread's PR is a draft while underway (another session's).
16. [#63](https://github.com/mrflip/safebyok/pull/63): the Version PR opens as a draft (another session's). **Merge
    it, and everything below goes purple.**

**Answered at closeout:** #49 and #63 go on the stack; CLAUDE.md's console line now names the fallback logger; a
logger everywhere is ready to start (TODO.md); the older questions below moved to TODO.md for tomorrow;
[#38](https://github.com/mrflip/safebyok/pull/38) is yours to close.

**Your rulings this sprint:**
- no backward compatibility until 1.0.0;
- validate the host clock (a real number is fine if it is in bounds);
- coerce `Infinity` at the first opportunity and refuse it after that;
- "values inside our interface should possess their final form";
- there are no deployed vaults to worry about;
- `lockSoon()` on a bad clock warns and locks at once;
- with no logger, the console is the fallback.

The YOLO calls are in the plan, *Decisions taken in YOLO*.

**Open, for you**

- **Close [#38](https://github.com/mrflip/safebyok/pull/38).** All of it is already in main, unchanged, through #36, and it shipped in 0.2.0. [#49](https://github.com/mrflip/safebyok/pull/49) (draft-PR guidance) is not in the stack; say so and it goes on top.
- **CLAUDE.md's console line** (#65). It says "`src/` writes nothing to the console (the linter enforces it)", which is now true except for the fallback in `src/console-logger.ts`. The proposed wording is "...writes nothing to the console but through the fallback logger". The core's `eslint.config.mjs` comment says the same thing and needs the same change.
- **Confirm the suppressions on the PRs.** Each thread recorded your approval as relayed to it, not given directly:
  - #64's `no-console` line, which #65 removes;
  - #65's file-wide `no-console` in `console-logger.ts`.
- **A follow-up thread?** The Convex adapter's failing watch never reaches the logger. My suggestion is a `logger` option on `convexVaultDB`, which leaves the `VaultDB` interface alone.
- **#60's four calls**, still unanswered:
  - the snapshot flips at once;
  - an unlock during the grace period beats the timer;
  - the grace period is capped at 60 s;
  - `close()` keeps the record and throws `vault_closed`.
- **#55:** a lost `unlock()` rejects with `vault_locked`; should it be `stale_write`?
- **Release levels:** several changesets are minor where patch might do. This is pre-1.0, so minor is the safe default.
- **Lint:** should `unicorn/prefer-iterator-to-array` be turned off while the lib target is ES2023?
- **Minor findings left on the PRs** (each is in its PR's open questions):
  - #64: a clock that goes bad partway through `store()` lets the write land, then throws.
  - #65:
    - a storage watch that stays broken warns on every change event, with no rate limit;
    - a failed catch-up after a stale write is logged as "a background refresh";
    - `log` has no call site yet;
    - a logger written inline in JSX reopens the vault on every render (the README warns about it).
  - #62: `/* @__PURE__ */` annotations would save `idbDeviceDB` about 0.5 kB.
  - #52:
    - the build now lays modules out under `dist/src/`;
    - the published helpers in `tests/` get test lint rules, not `src/`'s;
    - `makeGate`'s `prefer-promise-with-resolvers` disable now ships.
  - #58:
    - a backward clock step erases a fresh remembered unlock;
    - tabs opening with different settings erase each other's records.
- **Follow-ups:**
  - wrap deviceDB failures at open as `storage_unavailable`;
  - move `tallyWatches` into `safebyok/testing`, if #52 did not already take it.
- **Housekeeping:** `/workspace/byok-convex_server_cap` is unregistered as a worktree but still on disk. Its branch has merged. Say the word and I will delete it.
