---
"safebyok-big": minor
"safebyok-indexeddb": minor
"safebyok-convex": minor
"safebyok-graphql": minor
"safebyok-react": patch
---

**A vaultDB's get, put and del each take one ask, and answer an act.** A host that calls a vaultDB itself, or has written one, changes those calls; `Vault` and `Box` take the arguments they took.

```ts
vaultDB.getBox({ op: 'get', ...address, ifAbsent, expected })
vaultDB.putBox({ op: 'put', ...address, ifAbsent, ifPresent, expected, record })
vaultDB.delBox({ op: 'del', ...address, expected, record })   // record: the tombstone to store
```

The address is the vault's scope, with `boxlabel` and `vault_tok` for a box. `expected` is the row the caller holds, or the sentinel where it holds none (`sentinelVaultOf`, `sentinelBoxOf`). A good answer's `act` is `born`, `reborn`, `replaced`, `deleted`, `gotlive`, `gotvoid`, `gotgone` or `passed`. A refusal carries an act too, beside `err.refusalkind`: `void`, `gone`, `camped`, `dubdel`, `stale`, `retcon`, `clash`, `forked`, `ahead`, and for a box under a vault that is not live in its life, `vault_void`, `vault_gone`, `vault_reborn` or `vault_full`.

**A row's life token is new at every delete as well as every create.** A tombstone carries a `vault_tok` or `box_tok` of its own, and deleting a vault deletes the box rows of that life where it used to leave their tombstones.

**The cap on a vault's boxes, `maxBoxes`, counts every box row of the vault's life, tombstones among them, in every adapter**, so deleting a box frees no room. Only a put of a new box is refused `vault_full` at the cap: a box put again over its own tombstone, a replace and a delete never are. A vault made anew starts with none.

**What a host using `Vault` and `Box` will see.**
* Deleting a box that is not stored, or deleting one twice, refuses `absent_box` where it answered null.
* A deleted vault is listed as a new `Vault` object that reads as deleted; the object it replaces is disabled and locked.
* A put under `ifPresent: 'fail'` over a live row the device has not yet fetched refuses `stale_write`, and `camped` once it has. A put under `ifAbsent: 'fail'` over a box deleted on another device likewise refuses `stale_write`, then `absent_box`.
* Where a vault was deleted or made anew on another device, a box call there refuses `absent_vault` or `vault_reborn`, the `Vault` object of the ended life is disabled and locked at once, and a new one is listed in its place: deleted, or locked.
* `listBoxes` that refuses for its vault carries the vault row stored as `world`, as `getBox` does, and under a damaged vault row it refuses as `getBox` does.

**For an adapter's author.** Each `do*` call of `AdapterVaultDB` takes the checked ask and answers what `classifyBox` or `classifyVault` made of the rows it fetched, storing `ask.record` where `isWriteAct` holds of the act, all in one atomic step. A gate verb (`replacePassphrase`, `addPasskey`, `revokePasskey`) is a vault put that names its verb as `gateVerb`, and the classifier makes that verb's tests over the row stored. `safebyok/storage` exports the ask checkers and the lists of acts. The battery of `safebyok/testing` plants each of a list of flawed rows (`FlawedVaultRows`, `FlawedBoxRows`) past the verbs: a store either does not hold the row, or every verb refuses it, as `storage_issue` where it is filed under another scope and as damaged otherwise.

**`safebyok-convex`:** the four writing functions take `{ ask }` and check it again on the server before a row is read. A host's `convex/` module exports the same names, and is deployed again. The component's `safebyok_tallies` table keeps four figures for each vault life, `all_count`, `live_count`, `all_size` and `live_size`, where it kept `box_count` and `box_bytes`: clear the component's tables before deploying.

**`safebyok-graphql`:** each get, put and del field takes one `ask` input in place of a record or scope with options, and `SafebyokReqParams.prior` is `expected`. A host that serves the schema serves the new one, and one that allowlists operation documents takes the new documents.
