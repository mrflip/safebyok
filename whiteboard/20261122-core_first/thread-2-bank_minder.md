# Thread 2: bank_minder (2026-11-22)

Branch `20261122-bank_minder`, PR [#844](https://github.com/mrflip/safebyok/pull/844), stacked on [#840](https://github.com/mrflip/safebyok/pull/840) (sprintbase `f3fe4d495`). Proved: safebyok 1416 tests, safebyok-react-lean 252, safebyok-idb-lean 123, typecheck and lint in each; `pnpm justify` at ready (see the PR's **Tests:** line).

* **Built**:
  * `packages/safebyok/src/minding/bank-minder.ts`: `BankMinder`, one per device, with its own TanStack `QueryClient`. It needs no userid and holds any number of users' worlds. A world is `BankRoots` (`{ bank, gate, root }`), keyed `['sok', userid, banklabel, 'world', lifeseq, lifetok]` in one place (`worldQueryKeyOf`), and found by prefix (`worldAt(scope)`). Its verbs are `fetchWorld(vaultDB, scope)` (a get of the root box, no track: the answer's `world` carries the bank and main gate), `tryWrite`, `tryBirthBank`, `sendToTSQ(record)` and `subscribe`. Its defaults: `skipToken` and `staleTime: Infinity` (never fetched by key), with structural sharing `newerRootsOf` (no root goes back within a life).
  * `src/minding/minder-keys.ts`: `bankKeyHeadOf`, shared by both minders.
  * `ThingMinder` is renamed `VaultMinder` (`src/minding/vault-minder.ts`, `tests/minding/vault-minder/`). It caches boxes under the root box only (items, soons, listings, the root listing included). Any other item refuses `bad_record` (`Throwers.boxesOnly`). Its watch hands the bank, main gate and root box to `bankMinder.sendToTSQ`, and it takes `opts.bankMinder`. `rootBox` reads the world. `MinderFriend.rootBox` is gone.
  * Device: makes the BankMinder and exposes `device.bankMinder`. Bring-up is `minder.hello()`, then `fetchWorld`; the stage is `'unborn'` for no world or a bank that is not live. `Gate.make` and `Bank.make` take the world's records. Bank: `rootBox` and `track` read the world; `Bank.make(record, opts)` has dropped `rootBox` and requires a world of the record's life. `BankMakeRecord` is removed. Gate puts and the bank's put go through `bankMinder.tryWrite`; the birth goes through `bankMinder.tryBirthBank`.
  * React (mechanical): the gate's host query reads `device.bankMinder.worldAt(scope)?.gate`, and `bridgeWorld` copies the world's gate into the host's entry on `bankMinder.subscribe`. idb-lean: its test world births through the BankMinder, and its README says the roots are not copied.
  * VOCABULARY: *minder* reworded, *world* added; *item*, *soon*, *minded* and *watch* adjusted.
* **Decisions made**:
  * **One watch.** The VaultMinder's watch forwards root notices, instead of the BankMinder keeping a watch of its own: a second watch would double the vaultDB's notices, and the BankMinder would need a bank to watch before any VaultMinder exists.
  * **A world lands whole first.** A world of a life with no world cached lands only with its root box in hand (a `fetchWorld` or birth answer, or a root box notice with its world). A main gate or root box notice lands in the world found by prefix. A bank notice lands only under its own key.
  * **Lives kept apart by key.** A whole world of a new life `removeQueries` the bank's head, then sets its own key. Nothing compares lives.
  * **No world, no shell.** Without a world, `VaultMinder` gets of a box the vaultDB lacks refuse (`Shell.of` needs the root's life). This is documented on the class.
* **Deviations**:
  * **Loosened: a damaged root.** A damaged bank or gate row beside a root box now refuses `storage_issue` at bring-up (it was `damaged_row`). The stage is still `'failed'`.
  * **Host key renamed.** The host's gate query key is now `['sok', userid, banklabel, 'gate']`.
  * **Not built: handing a VaultMinder its client.** The minder's cache-level `onSuccess` pin sits on the client it makes; sharing a client is thread 4's. The pin is untouched.
  * **Not reactive: the stage.** It is read from the world at bring-up, not recomputed from it.
* **Discoveries**:
  * **The world outlives the bank.** It stays through the VaultMinder's `goodbye`, a bank's sweep and a device's vacate, the gate's wrapped bankKey ciphertext with it. This is recorded in `notes/guarantees-drift.md` (G3 kept in substance) and `notes/security.md`.
  * **The Gate object adopts no gate changed elsewhere**, as before; the world has the newer one. Thread 4 should read the gate from the world.
  * **New wontfix rows.** `notes/wontfix.md` has two: a late answer from an earlier life replaces the world (a crossing); a bank deleted or born elsewhere leaves the earlier life's world until a whole world lands.
  * **The React tests run against `safebyok`'s `dist`.** Build it first, or they pass against the old code.
* **For the Coach**: the open matters in the PR body. The main ones are when the world should be dropped, and whether `storage_issue` is right for a damaged root.

Looked up: `rg -n 'thread 2|bank_minder|BankMinder' core_first-plan.md` for how the world's key and the feed fit the later threads (4, 6).
