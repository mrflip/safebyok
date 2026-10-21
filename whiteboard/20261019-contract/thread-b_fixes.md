# Thread b_fixes: phase B's closing fixes (2026-10-21)

Branch `20261020-b_fixes`, PR pending, stacked on #209 (`placement`). Justify: green (core 2559
passed, 35 skipped, at the second commit).

Resumed from a worker stopped mid-build. Its uncommitted work (S1 and S2 begun) was sound and is
kept: the strength checker's parse moved inside its guard, with two tests; `#movedOn` split from
`#outrun`, the grant erasing its lease when the props moved on, with two race tests. Changed from
it: the throwing-verdict helper moved to module scope (lint), the test titles reworded, the
refusal's message names a verdict that threw as it was read, and the grant no longer writes a
lease it would at once erase (see S2).

* **Built**:
  * **S1** (`src/passphrase-strength.ts`): `checkStrongEnough` parses the verdict inside the
    `try`, so a verdict whose `strong` or `reason` getter throws is `unexpected_error` carrying
    nothing. Two tests fail without it. React's `adviceFrom` already read the verdict inside its
    `try`.
  * **S2** (`src/vault.ts`, `#grantLease`): `isVoided` (overtaken, or the props moved on) is
    asked before the write, which then does not happen, and after it, which erases what was
    written. A close alone still erases nothing. Two race tests (`vault-races.test.ts`: a `del()`
    landing while an unlock's, or a `putWayin()`'s, lease is written) fail without it.
