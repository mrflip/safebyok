---
---

None: safebyok and safebyok-big are private at 0.0.0, and the public adapters change a test's and a comment's words only. A working vaultDB answers as before. In the new core, the refusal kind of a row read from storage that fails its kind's checks is now `incompatible_row`, where it was `damaged_row`, and a list sets such children aside in `incompatible_rows` (`IncompatibleThing`), not `damaged_rows`. safebyok-big adds the kind `incompatible_row` to its `refusalkindVals` (bad news) and keeps `damaged_row` for its own use. An adapter author who tested for `damaged_row` tests for `incompatible_row`.
