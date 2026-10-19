# Thread 8: size_rule (2026-10-16)

Branch `20261015-small_sweep` (commits on thread 4's PR), PR [#99](https://github.com/mrflip/safebyok/pull/99). Justify: green.

* **Built**
  - `tools:` `.size-limit.json` re-derived by the rule: measured + 3 kB at 5 kB and over, + 50% (at least + 1 kB) under it, then rounded **up** to two significant figures. Measured bytes -> budget: everything 26_829 -> 30 kB; openVault 19_150 -> 23 kB; stableJsonify 2_324 -> 3.5 kB; argon2idWebV1Deriver 5_002 -> 8.1 kB; idbDeviceDB 9_270 -> 13 kB; browserOpts 14_193 -> 18 kB; mask 5_747 -> 8.8 kB; argon2idWasmWebV1Deriver 9_375 -> 13 kB; argon2idWasmDeriver 15_058 -> 19 kB. `pnpm size` passes.
  - `docs:` PROCESS.md has a *Size budgets* section (before *Where things are written*): the three-step rule, written where the next person raising a budget looks, since JSON cannot carry a comment.
  - `docs:` `.claude/skills/sprint/SKILL.md`: the Coach's second sentence in §1 (guess the target up front, generously and round; plan a late thread to lower budgets to the rule) and §2 (that late thread is the one exception to "workers leave the budgets alone").
* **Decisions taken**
  - "Roundish" is two significant figures, rounded up: it matches the Coach's examples (2_500, 150_000) and is mechanical. Budgets are written in kB (1000 bytes, size-limit's meaning), not the Coach's underscored byte form, to keep the file as thread 4 left it.
  - The rule is applied as written even where it lowers a budget thread 4 set: argon2idWebV1Deriver 9 -> 8.1 kB (measured 5_002, one byte over the 5 kB line), mask 9 -> 8.8 kB, stableJsonify 6 -> 3.5 kB. Nothing rounds down from the rule's own number. Wave 2 threads do not touch these bundles' sources much, but the orchestrator can widen any of them back if a thread needs it.
  - No changeset: tooling and docs only (#99's empty changeset covers the PR).
* **Deviations**: none.
* **Discoveries**: the 5 kB line is a cliff: a bundle of 4_999 bytes gets +2.5 kB, one of 5_002 gets +3 kB. argon2idWebV1Deriver sits one byte over, so the rule is generous to it in relative terms.
* **For the Coach**: the rule lowered three budgets from thread 4's +3 kB-everywhere values (above). Say if you would rather the rule only ever loosened.
