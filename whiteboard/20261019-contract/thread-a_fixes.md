# Thread a_fixes: phase A's fix-ups (2026-10-19)

Branch `20261019-a_fixes`, stacked on [#202](https://github.com/mrflip/safebyok/pull/202)
(`20261019-box`). Justify: green at each commit so far.

* **Built** (so far):
  1. `isVaultCondition` is `isCondition`, core and react.
  2. `staleMinutes` defaults to 5 (`StaleMinutes`), docs and tests to match.
  3. `ensureLease`'s option `renewWithin` is `renewMinutes` (`parseRenewMinutes`; the private
     `#ensureLease(renewMillis)`).
