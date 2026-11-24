# Thread 23: one_store (2026-11-24)

Branch `20261124-one_store`, PR (see the PR's own link), stacked on [#888](https://github.com/mrflip/safebyok/pull/888). Proved: see
the PR's **Tests:** line (`pnpm justify` in full).

Built by hand (no /sprint), three pieces, S first, then F and W, each its own commits.

* **Built**:
  * **S**. `Thing.receive` tells every subscriber (`#tellSubscribers`) once it has taken in news, a newer sparse revision
    among it; a Thing's record is its snapshot. A Thing's constructor takes a `BulletproofCallback`, which wraps each
    subscriber as it subscribes (`#subscribers` is a Map, listener to wrapped). `ThingMakeOpts` (`shapes-thing.ts`)
    carries it: `BankOpts` and `GateOpts` extend it, `Box.make(record, opts = {})` takes it, and `World.makeThing` hands
    every Thing `world.bulletproofCallback` (a bound getter: `bulletproofHandlerOf` with `ifError: 'tell'`,
    `Throwers.refusalOfThrown`, to `device.tellBadNews`). The world's own subscribers go through it too, as does the root
    shelf's `hear` (`device.#listenShelf`). The world subscribes to each root Thing in `makeThing` (`#hearRoot`, today's
    rule unchanged) and no longer listens to the VaultMinder. `device.subscribe`, `device.getSnapshot`, `DeviceSnapshot`,
    the device's `#align` and `#makeSnapshot` go; `device.vault` makes the vault at its first read once the bank is live.
    Gate's world subscription, its `#tell` and the tell after its put go; Bank's `subscribe` override and `getSnapshot`
    go. `BankSnapshot` is `WorldSnapshot`, `PendingBank`/`SignedOutBank` are `PendingWorld`/`SignedOutWorld`. In the
    giver: `useBank` is `useWorld`, over `device.world`; `useGate` is `useSyncExternalStore(gate?.subscribe ??
    subscribeToNothing, …)` over the gate Thing read at render; `listenToGate` goes.
  * **F**. `useFormMutation`'s `attempt` hands the mutation `gatingOrRefusalOf(params)`: the gating, or the maker's
    refusal (`sanitizeForeignError`). `FormMutationDefaults.mutationFn` rejects with a refusal it is handed, and
    `onSettled` vacates only a gating. The variables' type is the new export `GatingOrRefusal = Gating | Error`.
  * **W**. `Vault.withUnlockedWhisper` rethrows a refused get unless it is `storage_unavailable` over a box the device
    holds. The giver's `withLockableWhisper` has a second `@example`: a field masked whole while locked, to its tail
    while unlocked, in an effect on the stage.
* **Decisions made**:
  * S: the guard reaches each Thing through its make options (`ThingMakeOpts.bulletproofCallback`), uniform across Bank,
    Gate and Box. Set aside: Bank and Gate deriving it from `device.world` (Box has no device, so it would need its own
    route), and a protected override per class (a member on each kind for one job).
  * S: the snapshot type is renamed with its two constants (`PendingWorld`, `SignedOutWorld`), since they are named
    after it. `BankStage` keeps its name: it is the bank's stage. The giver's `Shown` field is `snapshot`.
  * S: `device.vault` is made on first read, as the brief proposed: no plainer way found that does not lean on
    subscriber order or move the Vault.
  * F: the refusal is handed as the variables, not a closure over `params`, which would hold the cleartexts in
    TanStack's cache.
  * W: a `try`/`catch` stays. The vault TSQ's `getOnce` is TanStack's `query`, which rejects: a `tryGetOnce` could only
    be `Outcome.outcomeOf` over it, a try/catch dressed up. The catch rethrows all but the one expected case.
* **Deviations**:
  * S, outside the brief: `VaultMinder.#receiveAtThing` keeps a new Thing before it receives its first record, and lets
    it go where that record is refused. Without it the world's subscriber, told inside `receive`, could not find the
    Thing (`thingAt` read undefined), and 393 tests failed. Not a raw verb; the classifier and record forms are untouched.
  * S: `vaultTSQ`'s own listener keeps its `hear` unwrapped: a throw there already reaches the device's `onBadNews` through
    its own `onBadNews`. The one `onBadNews: noop` left (`device.#listenShelf`) says it drops a duplicate the vault TSQ
    tells.
* **Discoveries**:
  * After a sweep, a first read of `device.vault` refuses `disabled` (from `Vault.make`) where it used to answer the
    swept vault. Every verb of that vault refused `disabled` anyway. An ending: no guard added.
  * The gate Thing appears with a stage change in every common flow (restored roots, a sign-in's answer, a birth). A
    non-live gate record arriving alone at `unborn` would not re-subscribe `useGate` until the next render; both show
    no gate.
  * The envman demo uses `WhisperMask` once per row (`EnvRow.tsx`, field `val`, tail 4).
* **Test promises changed** (before → after): listed in the PR body, which carries the full list.
* **For the Coach**: the open matters in the PR body.
