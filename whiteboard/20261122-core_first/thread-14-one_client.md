# Thread 14: one_client (2026-11-23)

Branch `20261123-one_client`, PR [#857](https://github.com/mrflip/safebyok/pull/857), stacked on [#856](https://github.com/mrflip/safebyok/pull/856). Proved: `safebyok`
1445 tests, `safebyok-idb-lean` 112, `safebyok-react-lean` 307 (no source change), lint and typecheck of all three; `pnpm justify` green after the catch-up.

A removal: one minder, one QueryClient, made together. No new machinery was needed.

* **Built**:
  * `Minder` (`packages/safebyok/src/minding/minder.ts`) makes its own `TSQ.QueryClient` in its constructor. The
    client's `queryFn`, `staleTime`, `structuralSharing` and the cache's `onSuccess` close over `this`, so the dispatch
    by `bankHashOf` and the `#minders` map are gone. `minder.persist(persister)` is an instance method: restore, then
    subscribe, saving every query with data in that client.
  * A minder's `userid`, `banklabel` and `scope` read its friend's scope at each use, so they refuse until `signIn` as
    `Device.scope` does. `#fetchAt` demands minding first, which keeps the old `minder_not_started` refusal of a fetch
    before `hello`.
  * `Device` (`packages/safebyok/src/models/device.ts`) makes `#bankMinder` and `#minder` in its constructor;
    `device.queryClient` is `this.#minder.queryClient`, the same object from `Device.make` on. `#bringUp` restores
    roots then boxes, each through `persisterOf(this.scope)`, before the two `hello()`s. `device.hello()` only checks
    the secure context.
  * `DevicePersisters` is `{ roots: PersisterOfBank, boxes: PersisterOfBank }` (`storage/persister.ts`), with the
    record labels `roots:<userid>:<banklabel>` and `boxes:<userid>:<banklabel>` in the doc's example and the idb-lean
    README. The ride-along: `DeviceOpts.persisters`' doc now says "restored at `signIn`".
  * Gone: `Minder.makeClient`, `Minder.isClient`, `MinderOpts.queryClient`, `MindersOfClient`, `bankHashOf`, the static
    `persist(client, persister, scope?)`, `useridsCachedIn`, `Device.useridsSeen`, the phrases `MinderClientExpected`
    and `PersisterExpected` (dead with it), and `vault-minder-shared-client.test.ts`.
* **Branching lines** (if, ternary, `??`, `?.`, early return, try/catch, case): `minder.ts` 63 to 58, `device.ts` 35
  to 33. The two `?.` added in `device.ts` are `this.#persisters?.roots` and `?.boxes`, persisters being optional.
* **What a caller observes differently**:
  * `persisters.roots` is a function of the bank's scope, as `boxes` is; a `Persister` there is refused `bad_record`.
  * `device.hello()` restores nothing and touches no persister; roots are restored at `signIn`, and a failed roots
    restore is told to `onBadNews` there. `hello()` returns a fresh resolved promise each call, not the same one.
  * `device.queryClient` is readable before `signIn`, and the same object throughout.
  * `Device.useridsSeen` is gone (a host that listed cached users loses it).
  * The boxes snapshot holds every query with data in `device.queryClient`, not only the bank's: a host query run in
    that client is saved too (see *For the Coach*).
* **Deviations**:
  * The minder's friend check no longer reads `scope`: the Device is the friend from its constructor, and its scope
    refuses until `signIn`. `MinderFriend.scope`'s doc says it is read at each use.
  * `device.minder` and `device.bankMinder` still refuse `absent_vault` until `signIn`, keyed on `#userid` now; they
    could become plain fields (two branching lines fewer), but that changes what they answer, so it waits on a ruling.
  * `PersisterExpected` removed as well as `MinderClientExpected`: nothing used it once roots became a function.
* **Decisions made**: `isPersister` stays exported: it is public and the idb-lean test uses it. Minder tests now make a
  minder and call `minder.persist` (`persistedMinderOf` in `minder-persist.test.ts`); the "saves only the bank at
  scope" test went with the scope argument.
* **For the Coach**:
  * **Host queries in the boxes snapshot.** Before, the boxes persister kept only queries under the bank's key head, so a
    host's own `useQuery` in `device.queryClient` was never saved. Now it is, and a value structured clone refuses
    would fail the save. One condition (`queryKey[0] === MinderKeyRoot`) in `SaveOpts` puts it back. Recommendation:
    add it if hosts share the client; else leave it.
  * **`device.minder` as a plain field**: recommend leaving the refusal, the contract the tests state.
