---
"safebyok-big": minor
"safebyok-indexeddb": minor
---

The bank and device databases are scoped only by the host's `dbName`: `safebyok:<store>-v…` with none, `safebyok-<dbName>:<store>-v…` with one (`safebyok:bank-v001-001-001`, `safebyok:device-v002-001-001`, `safebyok:devicerow-v002-001-001`), and `IdbBankDB` rings on `safebyok:bank` or `safebyok-<dbName>:bank`. `dbName` no longer defaults to `'safebyok'`, and a device database made with `{ dbName: 'acme' }` is now `safebyok-acme:…`, not `acme:…`; `dbprefixOf` is new in `safebyok/storage`. A database under an old name is left in the browser, unread. The device row gains a `package_version`, the npm version of safebyok that last called `ensureCachedDevice`: put with the row on every `ensureCachedDevice`, keeping its `device_tok`. A device row from before fails its check, so it is made fresh (its `device_tok` with it); the device row database's layout version is `002-001-001`, so an old one is deleted unread.
