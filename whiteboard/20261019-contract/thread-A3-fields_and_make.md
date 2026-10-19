# Thread A3: fields_and_make (2026-10-19)

Branch `20261019-fields_and_make`, [PR #197](https://github.com/mrflip/safebyok/pull/197), stacked on [#196](https://github.com/mrflip/safebyok/pull/196) (`20261019-vault_class`). Justify: green; 4199 tests, 4006 passed, 193 skipped (live backends), 0 failed.

* **Built**:
  * `packages/safebyok/src/vault.ts`:
    * **The Contract's field block**, `[Vault: fields]`: `applabel`, `user_id`, `vaultlabel`,
      `vault_id`, `registered_at`, `unlock_epoch`, `vault_key_epoch`, `wayins`, `state`, `boxes`,
      `capacity`, `askPassphraseAt`, `trouble`, plus `syncing`, `snapshot` and `leaseMillis`, each a
      getter (no setter) reading the snapshot. `#settle()` (was `#bump()`) is the one writer: it
      builds the frozen picture (`#picture()`) and replaces the snapshot, telling listeners, only
      when something changed. `#capacity()` reckons boxes and reserved bytes as `#checkRoomFor` does.
    * **`make` inert.** The constructor parses, assigns and builds the first `opening` snapshot;
      no `subscribe`, no first hello (`#sayFirstHello` is gone). `#hello()` starts the storage
      watch (`#watchStorage`, once) before its first read; `close()` ends it if started.
    * **`hello({ staleMinutes })`** resolves the vault. `#helloWithin(staleMillis)` forgets a
      settled hello once the last successful read began `staleMillis` ago or more (`#readAt`,
      stamped in `#takeStorage` by the checked clock), then waits on `#hello()` and settles (the
      Contract's "only step 3"). Internal callers keep `#hello()`: once settled is enough.
    * **`[Bad news]`**: `#tellingBadNews(call)` wraps every public async method (field heads
      read `unlock = this.#tellingBadNews(async (...) => { ... })`, bodies untouched); it tells a
      `bad_news` refusal to `onBadNews` before the promise settles, once per error object (a
      `WeakSet`). `useBox` wraps only its read (`#getBox`), so a host callback's throw is never
      told. Background reads (`#watchRefresh`) and swallowed catch-ups (`#catchUp`,
      `#refuseCreatedElsewhere`) tell what they met. A listing tells each box newly shown
      damaged as `damaged_box` news with `meta.box_listed`. A handler's throw, or its promise's
      rejection, becomes `trouble` as `bad_option` (cause: the throw), logged as `error` and handed
      to `reportToPlatform`.
  * `vault-opts.ts`: options `staleMinutes` (`parseStaleMinutes`, minutes to millis, `Infinity`
    to `ForeverMillis`) and `onBadNews` (`parseOnBadNews`); type `BadNewsHandler`.
  * `types.ts`: `StaleMinutes = 1`. `errors.ts`: `RefusalMeta.box_listed`. `index.ts` exports
    `StaleMinutes` and the type `BadNewsHandler`.
  * `safebyok-react`: `VaultProvider` passes `staleMinutes` and `onBadNews` through (and warns of
    `onBadNews` changing identity, as of `logger`); it already said the first hello in its effect,
    and now keeps that hello's refusal itself as `openError` (while the vault is `opening`), since
    `trouble` no longer carries conditions. `PassphraseModal` and the demo read `user_id` and
    `vaultlabel` off the snapshot.
  * Tests: `tests/vault/vault-hello.test.ts`, the `hello` and `a hello that fails` describes moved
    out of `vault-make.test.ts` in their own commit (titles unchanged), then reworked, with new
    describes `vault.hello, by the Contract` and `onBadNews, by the Contract`; in
    `vault-make.test.ts`, `Vault.make, by the Contract` and `the vault's fields, by the Contract`,
    the A2-review regression test among them ("keeps its own lease length and hello, whatever a
    host writes over the handle's"). `rolledBackWorld` moved to `world.ts`.
  * `notes/security.md` (sonnet subagent): a new entry for `onBadNews`; folds into the `#`-fields
    entry (getters over the frozen snapshot) and the `make_hello` entry (make inert, staleMinutes,
    `trouble` bad news only). That entry's opening still says make starts `hello()`: the header
    allows only appending.
  * Docs: the core README (*Quickstart*, *Logging*, *Bad news*), the react and convex READMEs;
    TODO.md's *hello, make and the react lifecycle* section closed down to its one open item.
* **Decisions taken**:
  * **Fields are getters over the frozen snapshot**, not `#` fields with getters of their own: one
    source, so fields and snapshot cannot disagree, and `#settle()` is literally the one writer.
    Read-only in fact: `Reflect.set(vault, 'state', ...)` is false, and strict code throws.
  * **`trouble` built as the Contract writes it**: the latest bad news or the handler's throw. It
    clears when a read lists no damaged box. Conditions no longer land there.
  * **`syncing` kept** (not in the Contract): the only snapshot word left for "a background read
    failed".
  * **`staleMinutes` defaults to 1**, counted from the last successful read of any kind (a hello,
    a write's catch-up, a ring). `0` while a hello is under way shares it: coalescing wins.
  * **The boundary wrapper is A4's seam**: `#tellingBadNews` is where `tryX`/`X` will be made.
  * **`onBadNews` typed `(news) => void | Promise<void>`**, since an async handler's rejection is
    caught and kept.
* **Deviations**:
  * **`props` not built**: the thread's list omits it; B1's models will say what it holds.
  * **No `damaged_wayin` listing news**: summaries do not flag a damaged wayin today; B1's `Wayin`.
  * **A first hello's condition is no longer in the snapshot**: the react provider holds it.
* **Discoveries**:
  * The react suite resolves `safebyok` through its `dist/`: rebuild the core before running it.
* **For the Coach**:
  * **`trouble` as the Contract writes it** costs the snapshot its word on why a read failed:
    `syncing: false` stays, the reason goes to the caller (react: the provider's `openError`).
    Recommend: keep.
  * **Default `staleMinutes` of 1** (the Contract names none). Recommend: keep.
  * **Contract drift**, seven items below. Recommend: carry each into the tab.
* **Test counts** (vitest JSON reporter; *total* includes skipped): 4142 (193 skipped) at base,
  4199 (193) at tip; per workspace and per file in
  [thread-A3-fields_and_make-counts.md](thread-A3-fields_and_make-counts.md). Moved: core
  `vault-make.test.ts` 124 to 93 and `vault-hello.test.ts` 0 to 87 (52 moved, 56 new across the
  two), react `vault-provider.test.tsx` 79 to 80.
* **Size**: `pnpm size:budget --write` set four lines to the rule: `everything` 39 to 40 kB,
  `Vault` 32 to 33, `VaultProvider` 7.2 to 7.5, `reactEverything` 8.3 to 8.4.

## Contract drift (proposed text)

Built to the Contract as written; each item is where it was silent, or says less than the code does.

1. **`Vault.make`, Refuses** says `bad_option`, "nothing else". Make also throws `bad_label` (a
   label or `userId` failing its check) and `insecure_context` (plain http), both misuse. Propose:
   "*Fix the code:* `bad_option`, `bad_label`, `insecure_context`. Nothing else can arise here."
2. **`syncing`** is not in the `Vault` block. Propose, under *this device's picture*:
   `syncing: boolean // false while the last read of storage failed: what it shows may be behind`.
3. **`trouble` never clears** in the Contract. Propose: `// the latest bad news, or what your
   onBadNews threw; null once a read finds nothing amiss`.
4. **`staleMinutes`' default and origin.** Propose for `Vault.make`: `staleMinutes?: number, //
   hello()'s default: 1 (StaleMinutes). Infinity: read only when what was read no longer stands`;
   and for `vault.hello`: "within it of the vault's last read of storage, by any call".
5. **`meta.box_listed`** (Shapes): `box_listed?: DamagedBox // damaged_box told of a listing: the
   box as listed`, the handle a default handler deletes by.
6. **The handler's type**: `onBadNews?: (news: VaultError) => void | Promise<void>`, "a promise it
   returns is not awaited; what it rejects with lands in `trouble`, as a throw does".
7. **A forced hello while one runs**: "`0` forces a read, unless one is under way: it shares it".

