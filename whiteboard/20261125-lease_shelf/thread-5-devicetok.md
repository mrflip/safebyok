# Thread 5: devicetok (2026-11-25)

Branch `20261125-devicetok`, stacked on #909. Proved: nothing built yet; blocked on the handoff's check 2 before any change.

* **Discoveries**:
  * **Check 2 holds: `device_tok` is bound into a cipher ctx.** A wayin's wrapped bankKey is bound to
    `wayinCtxOf(bankStamp, gateStamp, header)` (`packages/safebyok/src/models/wayin.ts`), which passes the
    whole checked wayin header to big's `Crypto.cipherCtx`, which binds `stableJsonify([...stamps, purpose, header])`
    as AES-GCM additional data. The header's field names are in those bytes: `ctx-bytes.test.ts` pins
    `{"born_at":…,"device_tok":"…","key_deriver_label":…}`. Renaming the field to `devicetok` changes the
    bytes every wayin wrap is bound to. The construction itself (`cipherCtx`, and which record it binds) is
    unchanged: it binds the header generically, field by field, as it would any renamed header field.
  * **Check 1 holds, mildly: the checker is big's.** `WayinChecks` and `BankishChecks.deviceRecord` take the
    `device_tok` checker from big's `CX` (`safebyok-big/src/shapes/shapes-core.ts`: `device_tok: uuid(Phrases.DeviceTokShape)`),
    whose phrase reads "A device_tok is a UUID, …". The `DeviceTok` type is the new core's own (`shapes/primitives.ts`).
    CLAUDE.md lets big broaden by "a new checker": big gains `devicetok: uuid(Phrases.DevicetokShape)` beside
    `device_tok`, and the new core destructures that. No fork, no reimplementation.
  * **An old wayin fails safe.** `Wayin.make` and the gate's `wayins` check are `.strict()`: a stored wayin with
    `device_tok` refuses `bad_record` at read, before any unwrap, so the gate reads as corrupt.
* **For the Coach**: may the rename change the wayin ctx's bytes (recommended: yes)? See the PR body.
