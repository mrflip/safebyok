# Thread 2: bank_minder (2026-11-22)

Branch `20261122-bank_minder`, PR [#844](https://github.com/mrflip/safebyok/pull/844), stacked on [#842](https://github.com/mrflip/safebyok/pull/842) (lease_duck; sprintbase `774406ca9`), rebased there from #840 after #830, #831 and #837 merged below it. Proved: `pnpm justify` green after that rebase (see the PR's **Tests:** line).

* **Built**:
  * `packages/safebyok/src/minding/bank-minder.ts`: `BankMinder`, one per device, with its own TanStack `QueryClient`. It needs no userid and holds any number of users' worlds. A world is `BankRoots` (`{ bank, gate, root }`), keyed `['sok', userid, banklabel, 'world', lifeseq, lifetok]` in one place (`worldQueryKeyOf`), and found by prefix (`worldAt(scope)`). Its verbs are `fetchWorld(vaultDB, scope)` (a get of the root box, no track: the answer's `world` carries the bank and main gate), `tryWrite`, `tryBirthBank`, `sendToTSQ(record)` and `subscribe`. Its defaults: `skipToken` and `staleTime: Infinity` (never fetched by key), with structural sharing `newerRootsOf` (no root goes back within a life).
  * `src/minding/minder-keys.ts`: `bankKeyHeadOf`, shared by both minders.
  * `ThingMinder` is renamed `VaultMinder` (`src/minding/vault-minder.ts`, `tests/minding/vault-minder/`). It caches boxes under the root box only (items, soons, listings, the root listing included). Any other item refuses `bad_record` (`Throwers.boxesOnly`). Its watch hands the bank, main gate and root box to `bankMinder.sendToTSQ`, and it takes `opts.bankMinder`. `rootBox` reads the world. `MinderFriend.rootBox` is gone.
  * Device: makes the BankMinder and exposes `device.bankMinder`. Bring-up is `minder.hello()`, then `fetchWorld`; the stage is `'unborn'` for no world or a bank that is not live. `Gate.make` and `Bank.make` take the world's records. Bank: `rootBox` and `track` read the world; `Bank.make(record, opts)` has dropped `rootBox` and requires a world of the record's life. `BankMakeRecord` is removed. Gate puts and the bank's put go through `bankMinder.tryWrite`; the birth goes through `bankMinder.tryBirthBank`.
  * React: the giver's gate query (`useGate`, key `['sok', userid, banklabel, 'gate']` in the provider's client) reads the gate from the BankMinder's world and caches it as `GateShown`, wayin headers only (`gateShownOfWorld` in `react-giver.tsx`). A Provider effect, `refetchGateOnWorld`, invalidates that query on each `bankMinder.subscribe` notice. So no wrapped bankKey sits in the provider's client, which closes `notes/security.md`'s 2026-11-22 `provider_owns` entry (amended, through the file's subagent). idb-lean: its test world births through the BankMinder, and its README says the roots are not copied.
  * `IdbMinderBridge.goodbye` and its test are removed (the Coach: no goodbye until it has a caller and a feature need). `hello` keeps its guard against a second call with a boolean.
  * VOCABULARY: *minder* reworded, *world* added; *item*, *soon*, *minded* and *watch* adjusted.
* **Decisions made**:
  * **The rebase onto #842.** The rename is redone as its own commit, mechanically (`git mv` and sed over the tree, outside whiteboard/, winboard/, human/, .changeset/ and notes/security.md), so #831's shared-client test and #837's giver were renamed with everything else. #831's `makeClient`, `isClient`, landers and `opts.queryClient` survive beside `opts.bankMinder`, with their tests.
  * **Forwarding works on a shared client.** The VaultMinder hands the bank, gate and root box to the BankMinder in `#sendToTSQ`, whatever client it caches in, so a VaultMinder on a client made elsewhere still forwards them: no gap for thread 4. Tested in `vault-minder-shared-client.test.ts` (a gate written elsewhere reaches the shared BankMinder's world; neither minder's listener hears it).
  * **`listen` skips a host's own keys.** The giver's gate query lies under the bank's key head in the shared client, and the minder told it as a `listing` event. `#minderEventOf` now tells only keys whose entrykind is an item, soon or listing (`Entrykinds`), as `listen`'s contract already said ("tells only this bank's items, soons and listings"). Tested.
  * **`bridgeWorld` re-homed, not dropped.** #837 deleted `react-bridge.ts`. I chose the query reading the world over copying the world's gate into the client: a copy would put the whole gate, wrapped bankKeys with it, back in the provider's client. The `staleTime` check is `() => false`: the world has no newer revision than the gate it holds.
  * **One watch.** The VaultMinder's watch forwards root notices, instead of the BankMinder keeping a watch of its own: a second watch would double the vaultDB's notices, and the BankMinder would need a bank to watch before any VaultMinder exists.
  * **A world lands whole first.** A world of a life with no world cached lands only with its root box in hand (a `fetchWorld` or birth answer, or a root box notice with its world). A main gate or root box notice lands in the world found by prefix. A bank notice lands only under its own key.
  * **Lives kept apart by key.** A whole world of a new life `removeQueries` the bank's head, then sets its own key. Nothing compares lives.
  * **No world, no shell.** Without a world, `VaultMinder` gets of a box the vaultDB lacks refuse (`Shell.of` needs the root's life). This is documented on the class.
* **Deviations**:
  * **Loosened: a damaged root.** A damaged bank or gate row beside a root box now refuses `storage_issue` at bring-up (it was `damaged_row`). The stage is still `'failed'`.
  * **Host key renamed.** The host's gate query key is now `['sok', userid, banklabel, 'gate']`.
  * **Not reactive: the stage.** It is read from the world at bring-up, not recomputed from it.
* **Discoveries**:
  * **The world outlives the bank** (see *End states*). The gate's wrapped bankKey ciphertext stays in the BankMinder's client with it. This is recorded in `notes/guarantees-drift.md` (G3 kept in substance) and `notes/security.md`.
  * **The Gate object adopts no gate changed elsewhere**, as before; the world has the newer one. Thread 4 should read the gate from the world.
  * **New wontfix rows.** `notes/wontfix.md` has two: a late answer from an earlier life replaces the world (a crossing); a bank deleted or born elsewhere leaves the earlier life's world until a whole world lands.
  * **The S1 to S3 findings** in react_targets' burndown (*Out of bounds*) were known and left alone, as the handoff said.
  * **The React tests run against `safebyok`'s `dist`.** Build it first, or they pass against the old code.
* **For the Coach**: the open matters in the PR body: whether `storage_issue` is right for a damaged root, and whether the Gate should read the world (thread 4).

## End states, for the final report

* The world stays through the VaultMinder's `goodbye`, a sweep and a vacate; when it is dropped is for the ends work.
* A bank deleted or born again elsewhere leaves the earlier life's world until a whole world of the new life lands; no world of a new life is fetched when its bank is noticed alone.

Looked up: at the build, `rg -n 'thread 2|bank_minder|BankMinder' core_first-plan.md` for how the world's key and the feed fit the later threads (4, 6). Nothing at the rebase.
