# Thread 4: rework after the Coach's rulings (2026-11-07)

For whoever reworks or files thread 4 next: what the four rulings of 2026-11-07 built, on top of `7c18591cc`.
One commit each, justify green after each.

* **maxRecordBytes** (`d4fe2c209`): `GraphQLVaultDBOpts` takes `maxRecordBytes` again (it spreads
  `DB.vaultDBOpts.shape` into its check), and enforces no record size: a box past it is sent on and the server's
  store decides. No wire field carries it. The changeset's breaking line about it is gone. Test: a box over the
  client's own limit is born.
* **Network-error cause** (`81cbdc205`, README `ecd6c27c1`): `networkTroubleOf(err)` builds a fresh Error whose
  message is the core phrase `fetchFailed(thrownName, status, code)` and whose own fields are `thrownName`, `status`
  (from `err.response.status`, a safe integer) and `code` (the network error's, or its cause's, only when it matches
  `/^[A-Z][A-Z0-9_]{0,39}$/`). Never the CombinedError, the message (urql makes a non-JSON body or a statusText into
  it), or a body. `thrownName`, not `name`: lint forbids assigning an Error's `name`. Tests: a message that is the
  record, a code beside a detail, a 502 with a body: none of the record reaches message, stack or entries.
* **tidyGone** (`5d1a8c0a9`): `tidyGone`/`tryTidyGone` in `VaultDBVerbs` and `VaultDBVerbnames`; `Tidied` its own
  type (`SafebyokTidied`, `SafebyokTidiedAnswer`); `tidyGoneAnswer` in shapes-answers; mutation
  `safebyokTidyGone(applabel, user_id)` behind `served(context, scope.user_id, ...)`; the client verb; the drift test
  and the gate test cover it. The battery's dels call `vaultDB.tidyGone` directly; `_cheat_storeOf` stays, for the
  races' `slipInFront` alone.
* **Resubscribe** (`f8f62eb15`): `afterAPause`, `ResubscribeMillis` and `noop` are gone. The watch subscribes once.
  An error result ends it, told as `troubleOf(err)` (shared with `fieldOf`: `storage_unavailable` with the sanitized
  cause for a network error, else `unexpected_error` with no cause). A closing result ends it, told as
  `storage_unavailable` with the core phrase `WatchEnded` and meta `{ call: 'watch' }`. An `identity_revoked` notice
  ends it quietly, as before. Told once, unsubscribed at once; nothing after the host's unwatch. A stream that ends
  inside `subscribe()` is stopped once `subscribe()` returns (the `watching` holder object exists for that guard and
  for lint, which refused a `let` assigned once after a closure that reads it).
  * **The channel**: `VaultDBVerbs.watch(scope, onNotice, onBadNews?)`, a third, optional parameter. The listings'
    `watchRows` take it, and `hello()` passes `(news) => { this.world.tellBadNews([news]) }`, so the host hears it
    at `BankOpts.onBadNews`, else `logger.warn`. The base `VaultDB.watch` keeps two parameters: its stores' watches
    never end unbidden. Set aside: an `onBadNews` option on `GraphQLVaultDBOpts` (a second channel beside the
    bank's, which the ruling ruled out) and reporting through a refused notice to `onNotice` (a notice is a hint to
    fetch, and the listings drop what is not their row).
  * Tests: graphql, a stream's end told once and never resubscribed (60s of fake time), a failed request, a GraphQL
    error that stops its stream, revoked tells nothing, nothing after stop, a stream ending as it begins; core
    (`listing.test.ts`), the end a store's watch reports reaches the world's bad news.
* **notes/security.md** (`755cec832`, by a sonnet subagent, not read here): three entries amended in place, for the
  four items.

## Discoveries

* An ended watch leaves the listing's `#unwatch` set, so `hello()` alone does not start it again; `goodbye()` then
  `hello()` does. Left so, per "don't handle it"; the coming task queue is where a restart would live.
* A `PostgresVaultDB`'s LISTEN could also end unbidden (a dropped connection), and its watch has no way to say so
  yet. Out of this thread; the third parameter is there for it.

## Open matters

* **The watch's `onBadNews` parameter**: keep it, the one path from a vaultDB to the bank's bad news. Or an option
  on `GraphQLVaultDBOpts`, which would leave a host two places to listen.
* **`codeOf`'s capitals-only pattern**: keep it; a code that is not a capitals word (a number, a sentence) is left out
  rather than risk quoting text.
