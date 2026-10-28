# Thread 27: restyle tidy (2026-10-28)

Branch `20261028-restyle_tidy`, PR pending, on main (`1f22111b`, #322 merged). Justify: green at
each commit so far.

The tidy after #322, every item approved by the Coach, one commit per item.

* **Built** (so far):
  * **1. StoredBox.box** is typed `DamagedBoxRecord | Z.input<typeof boxSparse>`: the same type,
    now naming the exported `DamagedBoxRecord`.
  * **2. `src/shapes/host-code.ts` (`HX`)** holds the shapes of a host's code: `vaultDBShape`,
    `deviceDBShape`, `clockShape`, `keyDeriverShape`, `loggerShape`, `localVaultDBOptsShape` and
    `callback`. `shapes/bank-opts.ts` keeps the options, defaults and limits. logger.ts imports
    only `HX`.
