# Deleting a damaged row: the design we did not ship

**Status: not built, on purpose (the Coach, 2026-11-09).** "I predict too many bug reports about non-bugs." The feature is in `notes/wontfix.md`; a row that fails its check stands until someone removes it with their own store's tools. This file is the design to start from if the library ever offers that delete.

[#608](https://github.com/mrflip/safebyok/pull/608) (branch `20261108-del_damaged`) built an earlier version. Where it differs from this file, this file is right.

## The rule

A damaged row may be deleted only on the judgement of the vaultDB wrapping the database:

* the library version in charge of the data must find the data stored in *its* database defective;
* the delete must be transactional;
* the judgement must use the same JavaScript validators as everything else.

The way to get all three across adapters: demonstrate, outside the transaction, that the row offered as testimony fails the validators of the library in charge; then demonstrate, at the moment of deletion, that the testimony is what is stored.

## On the way out of storage

Optimize for the common case, in this order:

1. Run the row's Zod validator. If it passes, that is the end of it.
2. If it fails, apply the scope validator. "Scope" is `applabel`, `user_id`, `vaultlabel`, `boxlabel`, `vault_tok`, and anything else that was an equality predicate on the query, each consistent with what was asked.
3. If the scope fails, it is a storage error, thrown. No working system should have matched a valid request to such a row, and we could not safely identify the row to delete it. A row that is not an object lands here.
4. If the scope passes, capture it, now known good. The row is a damaged row: **a scope plus an `AnyBag`**. `AnyBag` is `Record<string, any>`, not `unknown`.

**The bag is never inspected again until deletion.** It is unsafe, and it is evidence that something has gone horribly wrong. No revision is peeked from it, and no `damagekind` or `format_mismatch` is guessed from its `fmt`.

## Refusals and answers

* `damaged_vault` and `damaged_box`, not one `damaged_row`.
* An answer with a `damaged_box` refusal carries `{ err: damaged_box, dbhas: <void shell tombstone>, damaged_row: <the bag>, world, ... }`.
* An answer with a `damaged_vault` refusal cannot meet the answer type through `world`, so **vault rows get no delete helper**. This feature is boxes only.

Two names to settle when building. `damaged_box` is taken today, for a whisper that would not open under the lease (`refusalkindVals`). The kind for a storage error in step 3 is `record_conflict` as the kinds stand: its comment already says "a record of another scope or another vault", where `storage_unavailable` promises that a retry may mend it.

## The verb

`delDamagedBox({ ...scoped, boxprops })`. A row in the listing has a known-good scope, so the verb needs no tombstone.

1. The adapter deserializes the stored row and returns it to `AdapterVaultDB`.
2. `AdapterVaultDB` validates it as above and answers `damaged_box`, or lists it in `damaged_rows`, with the bag.
3. The listing holds the bag. The caller nominates it with `delDamagedBox`, attaching the bag as testimony.
4. `vaultDB.delDamagedBox` runs *its* validator over the testimony, in the `strip` form, proving the record will error any query it matches. Testimony that passes is the caller's mistake (`bad_option`), and nothing is read.
5. The adapter's `doDelDamagedBox`, in one transaction, compares and deletes.
6. A success answers with no row.

### The comparison

Take each **stored** field (`applabel`, `user_id`, ... `garbage`) and index into the testimony. A field the testimony holds and the row does not is ignored. A stored field the testimony lacks or differs on refuses it, so a library that cannot send a field cannot perform the delete, by design.

Why this is sound: the `strip` validator reads only the fields it knows, so a row that fails it fails on those fields, and they are all among the stored fields compared. This needs the box forms to have no optional field. A healthy row lacking an optional field could otherwise be deleted by testimony adding a bad value for it. They have none today.

Adapters should store records and not blobs, which is part of why this comparison is the natural one.

### Delete, do not tombstone

The row is deleted, and **the delete is not versioned**. There is no `prior` and no revision check: the man has a sword, it doesn't matter how old they are.

*A reviewer will say this means people holding good copies can't do something.* They already couldn't. The row was too broken to read, and any holder of the box was either out of date or saw it through `damaged_box`. There is no good solution, and anything further is a complicated bad solution that cannot be justified.

If the testimony fails its check but the row no longer matches (someone repaired it after the listing), the delete does not land, and the adapter reports what it found.

## What to check before shipping it

* **`fmt` must be an honest version of the validators.** A validator changed without a `fmt` bump makes intact rows fail, and this verb would delete them.
* **The trust surface of the raw row:** G8 (`notes/guarantees.md`), a Convex validator failure or a GraphQL server echoing `boxprops`, and the host-visible listing holding the bag. Read the adapters' queries as they then stand, and add a `notes/security.md` entry.
