# Thread 25: inspectable (2026-11-24)

Branch `20261124-inspectable`, PR [#891](https://github.com/mrflip/safebyok/pull/891), stacked on [#890](https://github.com/mrflip/safebyok/pull/890) (thread 24, whole_records). Proved: every test passes after the rebase onto #890 (safebyok 1879, safebyok-react-lean 338, dojo 111, e2e 576, nothing
skipped), and `pnpm justify` was green in full before it (on #889); after it, `pnpm justify` is red only in safebyok's
forgotten-exports check, on `SparseOf` and `BoxSparse`, which #890 adds and its own CI fails on too: thread 24's to fix, then a rebase here.

Built by hand (no /sprint): a move, not a redesign. Each class a devtool's view shows reports itself in one method,
`inspectable()`, the last member of the class, and the device's composes them. What a consumer receives is unchanged,
field for field, and what is masked is unchanged.

* **Built**:
  * `VaultTSQ.inspectable(): MaskedRow[]` (`src/minding/vault-tsq.ts`): `maskedRowsOf`'s body, inline: each query under
    the bank's key, its state, and its record or listing through `maskedOf`.
  * `Thing.inspectable(): MaskedRow` (`src/models/thing.ts`): `maskedRecordRowOf`'s body for `this`: the record the Thing
    models, masked, under its item key, as a vault TSQ item settled on it would show.
  * `World.inspectable(): MaskedViewLease` (`src/models/world.ts`): `maskedViewLeaseOf`'s body: the lease's loggable and
    `ends_at`, or `{ active: false }` while locked or while the roots are not all live (the old `this.bank === null`).
  * `Device.inspectable(): MaskedView` (`src/models/device.ts`), in place of `maskedView()` and `#maskedRootRows`, with the
    Coach's doc line: `EmptyMaskedView` before `signin`, else `{ bankTSQ: [bank, gate, rootBox] heard of, each
    .inspectable(), vaultTSQ: this.#vaultTSQ?.inspectable() ?? [], lease: this.#world.inspectable() }`.
  * The helper file `src/minding/masked-rows.ts` is `src/helpers/mask-ciphertexts.ts`, keeping only what both the vault
    TSQ and Thing call: `maskedOf` (now exported), `maskedCiphertextOf`, `MaskedChars`, `CiphertextFieldname` and the
    comment on why a mask shows a ciphertext's end.
  * The giver's `maskedView` calls `mounted?.inspectable()`; its name, `MaskedView`, `MaskedRow`, `MaskedViewLease` and
    `EmptyMaskedView` keep theirs. VOCABULARY.md's *masked view* names `device.inspectable()`. `notes/security.md` has an
    amendment saying the masking moved (a sonnet subagent wrote it, per its header).
* **Decisions made**:
  * The lease already has its report, `lease.loggable` (also its `toJSON`): Lease gets no `inspectable()`, and the world's
    report wraps the loggable.
  * The vault reports nothing today, so it gets no method. The world reports no stage: the view has none, and the brief
    adds no report.
  * The device composes the three roots itself: one line, and the world's getters are already public. Set aside: the
    world answering `{ bankTSQ, lease }`, which changes what the world's report is for no gain in this pass.
  * `MaskedRow` keeps its name: it is the consumer's shape, one row of the Inspect tab's table per query.
* **Deviations**: none from the brief. Fixed in the lines moved: `maskedViewLeaseOf(world | undefined)` took an
  `undefined` to mean "no live roots"; `World.inspectable` asks `areRootsLive` directly, with the same answers.
* **Discoveries**:
  * Keeping the shape is awkward in one place: `Thing.inspectable()` answers a TanStack Query row (`status: 'success'`,
    `fetchStatus: 'idle'`, `isInvalidated: false`, `lastRefusalkind: null`) for something no query keeps, and a model
    (`thing.ts`) imports `VaultTSQ` for `itemQueryKeyOf`. The roots are kept in Things, not in any TSQ: `bankTSQ` names
    a TSQ that does not exist.
  * Only `queryKey` and `val` of a row are read by the Inspect tab; the rest is read by the core's device tests.
* **For the Coach**, his five notes on this code:
  1. *A new shape, or an outcome or the tsqQuery? Frozen?* The consumer, the Inspect tab, reads only `queryKey` and
     `val`. An outcome does not fit: a query has states an outcome has no room for (pending, fetching, invalidated), and
     a root Thing has no fetch at all. The tsqQuery cannot leave: its `state.data` is the record unmasked, and it carries
     its client. A copy is needed, and could be as small as `{ queryKey, val }`. Not frozen: each call builds a fresh copy
     that is the caller's, so freezing protects nothing in the core; `EmptyMaskedView` is frozen because it is shared.
  2. *`lastRefusalkind`: isn't it always `storage_unavailable`?* No. A query's error is what its queryFn rejected with:
     the VaultMinder's `getOnce` and `listOnce` reject with refusals of every kind (`stale_read`, `bad_record`,
     `storage_unavailable`), which `storageRefusalOf` passes through. Only a non-refusal (TanStack's `CancelledError`, a
     host's raw throw) becomes `storage_unavailable`; `Throwers.refusalOfThrown` would call it `unexpected_error`, which
     is arguably truer.
  3. *Why two masked views?* The giver's `maskedView` is the React package's front door, since a host never holds the
     device: it forwards to the mounted device's view, or `EmptyMaskedView`. The device's is now `inspectable()`. Your
     sketch, `{ vaultTSQ: …inspectable(), vault: …inspectable() }`, is close: the vault shows nothing today, so there is
     no `vault` key; `bankTSQ` comes from three Things and `lease` from the world.
  4. *Should VaultTSQ report itself, and the roots?* It reports itself now. It has no world: it holds a VaultMinder and
     the bank's scope, and could reach the root Things through `thingAt`. But its items are only boxes under the root
     box; the roots are in no TSQ, so it would report what it does not keep. The world owns the three root getters and
     the lease, and is the better home for `bankTSQ` if the device should not compose it.
  5. *Over-DRY; a method on Thing; be honest about the contract.* Done: `Thing.inspectable()`, and the device maps it over
     the roots. The contract stays what it was: one row per root Thing heard of, of whatever life (a tombstone or the
     shell among them), so fewer than three before the sign-in's answer lands or while unborn; it never refuses. That
     serves the customer best: a debugging view that throws when things are broken fails exactly when it is wanted. After
     an ending it answers whatever falls out (`#no-slop-crossings`).
