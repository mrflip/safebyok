# softlock_gone: resolutions

These are the Coach's rulings on the session's open matters, swept from the Open Matters doc (https://claude.ai/code/artifact/04988258-a234-411c-9910-efa6d2f07c89) on 2026-10-19, for PR #190.

## 2026-10-19

- **TODO edits ride this PR.** The blaring *Lock timing vs. work in flight* entry and the rotation line go in TODO.md in this PR, rather than a PR of their own. Coach: "y". 2026-10-19. Raised: plan, step 3. Work: already in #190 (commits 61280dde, 40528c47).
- **The expiry's clock warning goes too.** With one timer nothing reads the clock at the deadline, so the `expiry` warning goes; its test checks the key drops on a broken clock with nothing logged. Coach: "y". 2026-10-19. Raised: plan A, commit b352616d. Work: already in #190.
- **A read checks for a key twice, no counter.** readBox/useBox look for a key in hand when storage answers and again after deciphering, keeping four race tests the plan expected to delete. Coach: "y". 2026-10-19. Raised: plan, test rule. Work: already in #190.
- **An eighth scenario for the TODO.** A lock() during a hello's lease read no longer stops the hello taking it up; folded into scenario 1. Coach: "y". 2026-10-19. Raised: step 2. Work: already in #190 (TODO.md).
- **retire() erases the mark; a mark always has a seen vault.** With the lock generation gone, a mark with nothing seen meant the same as no mark, so retire() erases it and `seen` is never null; a host DeviceDB now has `eraseMark` called by retire(), and old marks read as no mark. Explained at the Coach's request, then ruled in chat. Coach: "accepted! thanks". 2026-10-19. Raised: plan, What stays: seen. Work: already in #190 (commit b352616d).
