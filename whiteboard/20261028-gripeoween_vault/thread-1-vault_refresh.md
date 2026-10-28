# Thread 1: vault_refresh (2026-10-28)

Branch `20261028-vault_refresh`, PR pending, stacked on #334. Justify: green at step 2.

Preplan steps 1 and 2 (`gripeoween-vault-preplan.md`), step 2 first.

* **Built**:
  * Step 2, the device-record seam: `DeviceDB.getDeviceRecord` resolves a checked
    `DeviceRecord | null` (a record misfiled under the scope reads as none);
    `raiseDeviceRecord` resolves the record as stored, checked, or null. `deviceRecordFor` is
    module-private. The vault and the bank call the throwing forms.
  * Step 1, the refresh ladder: under way.
