# react_free: resolutions

Matters the Coach ruled during the sprint, and calls the orchestrator made on its own; newest batch first.

## 2026-11-22

No matter was ruled by the Coach during the sprint.

### Calls left to the orchestrator

* **The word providers rebuild their value on every render (#836 review).** The orchestrator's call: leave it, no memo until a host shows it slow, by maintainability over performance. Lands nowhere: no change.
* **The old React demo shows Create vault for half a second after creating it (#838).** The orchestrator's call: leave it, that demo builds on safebyok-big, which is frozen. Lands nowhere: no change.
* **Knock-Knock's Any username will do sits beside a sign-in that refuses Bob! (#838).** The orchestrator's call: leave it, the refusal says why. Lands nowhere: no change.
* **A react-giver test can read its result before the effect sets it (CI, node 26, #838).** The orchestrator's call: fix the test to wait on the result itself. Lands in #838, a test-only commit.
