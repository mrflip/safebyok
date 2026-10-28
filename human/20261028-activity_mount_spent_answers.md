# 2026-10-28: PR #350 -- passkey answers tried now or zeroed, and every attempt spends its answer

[#350](https://github.com/mrflip/safebyok/pull/350) now also:

* tries a passkey's answer at once while the dialog shows, or zeroes it untried; it no longer
  parks one for a hidden dialog to show again (that parking held the PRF bytes unbounded, and
  never zeroed them if the dialog was unmounted while hidden);
* has the core zero the answer an attempt is handed on every outcome but a correctable refusal
  (`spendAnswer`, `gating.ts`); before, an attempt refused before the seal left the bytes.

Open questions:

* **Which refusals leave an answer unspent.** Only `correctableKindVals`. `bad_option` and
  `attempt_in_flight` leave the gating open but spend the answer, as misuse. Rec: keep.
* **Suspense now waits as Activity does** (from before). Rec: keep.
