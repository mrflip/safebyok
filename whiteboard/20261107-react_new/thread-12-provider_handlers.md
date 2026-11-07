# Thread 12: provider_handlers (2026-11-07)

Branch `20261107-provider_handlers`, PR filed against main, stacked on #574 (itself on #573). Justify: green -- safebyok-react 10 files, 105 tests (9 added); every other package as before.

* **Built** (all in `packages/safebyok-react/src/bank-provider.tsx`, its tests, the README's provider section, and a changeset)
  * A handler prop that is no function (`onBadNews`, `onPanic`, `requestCleartext`; null too, but `requestCleartext` null still means "ask no one") reaches `Bank.make` as given, so it refuses `bad_option` to the error boundary. `misusedHandler` hands such a value on and undefined for a function or none.
  * `onPanic` is held in a ref as `onBadNews` is; only whether the host has one is in the bank effect's dependencies, so an inline one makes no new bank. The bank is handed a panic wrapper only while the host has an `onPanic`; with none, `Bank.make` gets none and `guardOnPanic` answers false, so the vault vacates as the core does.
  * The warning, said once through `bank.logger`, naming each of `logger`, `keyDeriver`, `strengthChecker`, `vaultDB`, `deviceDB` that changed identity since the last bank the effect made. Made in the bank effect after `Bank.make`, so a StrictMode rerun or a change of user alone says nothing.
  * Tests: 9 in `BankProvider's handlers`; six fail against the old provider.
* **Decisions taken**
  * **A let-go bank's panic.** A `PanicHandler`'s return is ignored (`guardOnPanic` answers true after any host handler), so a wrapper cannot report "unheard". Once the provider has let its bank go, the wrapper throws the refusal; the core catches it and reports it to the platform (`reportError`), as it does for a panic nobody hears, and the next user's handler hears nothing. The cost: the vault of the let-go bank is not vacated by that panic (the core takes the throw as a heard panic). The bank is swept already, so I judged this harmless. Set aside: dropping the refusal silently (the platform never hears of a lease that survived its erase); calling the live ref's handler (the next user's).
  * Giving or dropping `onPanic` remakes the bank, as `onBadNews` already did, because the core acts on whether the host has one. The README says so.
  * The warning goes through `bank.logger` (the one the bank settled: the host's logger, else the default), not through a logger the provider settles itself.
* **Deviations**: none. No `eslint-disable`, no `@ts-expect-error`. One cast, in `misusedHandler`, typing a misused handler as the handler it is not.
* **Discoveries**: `BankOpts`' `onPanic` and `requestCleartext` accept `unknown` for lint's purposes but `tsc` wants a handler type; `Bank.make` accepts `null` for `onBadNews` as a refusal (not nullable), so a JS host's null is now refused where the old provider allowed it.

## Open questions
* **Let-go bank's panic**: the throw-to-platform choice above, versus a core change letting a handler answer "unheard" (a core design point, not touched).
