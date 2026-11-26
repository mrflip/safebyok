# Sprint adapter_port: progress

What the threads have taught, newer than the plan wherever they disagree.

## For B (convex_vault)

*Orchestrator:* from C's design (#914, `graphql_vault-design.md`):
* **A refusal over a wire**: big's `crossedErr` and `vaultErrorOfCrossed` hold the one list of what a refusal may
  carry across a wire (meta limited to `oplabel`, `act`, `capacity`, `fieldnames`, `labelpaths`; the cause never
  crosses). My call: whichever of B and D first needs it ports its file into the new core (`notes/transition.md`),
  and the other reuses it.
* **To the client, the server is its storage**: a record the client fetched that fails the classifier's check
  refuses `storage_issue` (C's Q6, pending the Coach). Convex's client side reads the same way.

## For D (graphql_vault)

*Orchestrator:* C's design and thread file (#914) are D's brief, with the Coach's rulings on Q1–Q7 from the
sprint doc. D needs #905 (`doStats`) and #911 (`read_tc` on `Received`) on its base.

## The Coach's rulings (2026-11-25)

*Orchestrator:* every row of the first batch proceeded as recommended, with two notes that bind every thread:
* **No catch-and-relabel.** "Ok but don't catch errors just to rethrow: it will make debugging harder if everything
  has turned into mystery meat storage issue." `storage_issue` is only what a failed check of a received record
  throws; other errors pass through as they are, apart from the classification the core's helpers already do.
* **Refusals cross transparently.** "the approach is transparently carry the answer across".
* Big may take a one-commit fix pointing its README, doc blocks and the `askPasskey` phrase at the `-big` names.

## The Coach's rulings (2026-11-26), on D1's review

* **Errors across the GraphQL wire.** "GraphQL is a transport: what goes in, goes out." The mechanism itself failing is
  `unexpected_error`. An issue conveying the result in our code (getUserId throws) is a VaultDB error, thrown by the
  code on receipt. A refusal by the library's rules (a watch scope failing its check) is misuse and gets its specific
  VaultDB error, never `unexpected_error`. An error in the wrapped vaultDB crosses as a delivered BadAnswer; the
  adapter does not re-throw it. The cases go in the adapter's header doc block.
* `ended` on SafebyokNotice: "lgtm" (spelled `isEnded` per *Naming*).
* The microtask before `onEnded`: demonstrated by a test in `packages/safebyok-graphql/tests/wontfix/`.
* `onEnded` is required on the base `doWatch`; the public `watch` supplies the noop default.
