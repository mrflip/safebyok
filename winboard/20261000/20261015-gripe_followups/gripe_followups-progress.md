# Sprint gripe_followups -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread              | Base          | Status   |
| - | ------------------- | ------------- | -------- |
| 1 | vault_amendments    | `origin/main` | filed [#87](https://github.com/mrflip/safebyok/pull/87) |
| 2 | validation_overrides | #87 (restacked) | filed [#85](https://github.com/mrflip/safebyok/pull/85) (no review: documents only) |

## What the threads have taught

*Orchestrator:* thread 2, validation_overrides, filed as [#85](https://github.com/mrflip/safebyok/pull/85)
(documents only, no review). The write-up, `validation-overrides.md`, recommends a fixed
**floor** (ASCII, no colon, length ceilings, checked everywhere, reads included) under a
replaceable **policy** (checked only where a name is made, defaulting to today's grammar), set
through `openVault({ validators: { boxlabel?, userId?, note? } })`. The defaults move into
`safebyok/validators`, with no `z` re-export and no ckey stringifier for now. Its six questions
for the Coach decide a later build thread; none blocks this sprint. For thread 1: a `validators`
bag would make `VaultProvider` reopen the vault on every render if built inline, and the size
allowance assumes ASCII labels.

*Orchestrator:* thread 1, vault_amendments, filed as [#87](https://github.com/mrflip/safebyok/pull/87):
an exported `UserId` (1 to 100 characters) used by every record that names a scope; `erase()`
removes a box whose record fails validation; `Vault.reentryWindowMs` and an exported
`ForeverMs`, so `PassphraseModal` reads the window from the vault and drops its `reentryHours`
prop. *Review:* `fixed` -- the changeset now says a vault stored under a longer `userId` no
longer opens, and that `erase()` is new only for records failing validation (73ded50); the
worker then reflowed a doc line, dropped a double blank line, and narrowed the README's
`corrupt_record` row (c62479c). Left, as follow-ups on the PR: a lockbox row that breaks the
listing makes every `openVault` refuse, with no remedy short of clearing storage by hand (it
predates the sprint); `erase()` can report `corrupt_record` after its delete has landed.

*Orchestrator:* **restacked** into one line: main → #87 → #85 → #83. #85 (documents only)
rebased onto #87 without a conflict; this sprint PR is squashed on top.
