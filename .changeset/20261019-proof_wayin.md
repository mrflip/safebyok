---
"safebyok": minor
"safebyok-react": minor
---

Ways in and proofs are classes. `vault.wayins` is now `Wayin[]` (`PassphraseWayin`, `PasskeyWayin`, exported): each stored field its own, `summary` what the snapshot lists, `props` the frozen record, `toJSON()` the record; `vault.getSnapshot().wayins` stays `WayinSummary[]`. `vault.props` (and `snapshot.props`) is the stored vault props, one frozen record. The vault exposes `logger`, `clock` (checked) and `keyDeriver` read-only. The stored-record schemas are renamed `Wayin` → `WayinRecord`, `PassphraseWayin` → `PassphraseWayinRecord`, `PasskeyWayin` → `PasskeyWayinRecord`; the stored shape is unchanged. The type a host hands in for a passkey, `PasskeyProof`, is renamed `PasskeyAnswer` (safebyok-react's `createPasskey` and `askPasskey` return it); `PasskeyProof` is now the checked proof class the vault makes of it, beside `PassphraseProof`, exported as types. A way in stored damaged is told to `onBadNews` as `damaged_wayin` news with `meta.wayin_listed`, though the read succeeds. `safebyok/utils` exports `adorn` and `decorate`, which attach entries to an object as hidden, fixed properties.
