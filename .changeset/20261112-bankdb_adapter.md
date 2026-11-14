---
"safebyok-big": minor
---

**New exports: the bankDB, to take the vaultDB's place.** `BankDB` is the interface (each verb with its `try*` form, listed in `BankDBVerbnames`, branded `IsBankDB`); `AdapterBankDB` is the base class a storage adapter extends, writing one `do*` call per verb that fetches, judges and stores the whole verb in one step; `MemoryBankDB` keeps it in memory; and `BX` carries its shapes, classifier and wire checks (`BX.getBoxAnswer` and the like). A bankDB's box row is `fmt` 5003, the vaultDB's box row with its bank's `bank_tok`. `BadAnswer.act` widens to take the bankDB's refusals (`bank_void`, `bank_gone`, `bank_reborn`). **Stored format:** unchanged for every store that exists.
