# Thread A3: Contract drift

For the orchestrator and the Coach, carrying rulings into the Contract tab: where [thread A3](thread-A3-fields_and_make.md) found the tab silent, or saying less than the code does.

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

