# The principles of receiving, and which one gave way

Moved out of `storable-spec.md` *Receive* on 2026-10-30, because they cannot all be honored at once
and a worker reading them beside the tables would try.

The spec listed four:

1. It is desirable to allow the customer to make reconciliation decisions.
2. Don't throw away customer data.
3. Honor customer intent.
4. Provide defaults that are safe first, clear second, and ergonomic a distant third.

The case that sets them against each other is a staged edit, not yet sent, surpassed by a record
received from storage. No strategy is both good and simple: anything that keeps the staged has the
device dragging it along until the customer sends, hoping for a `stale_write`, while a spurious
`edit` could bump it into prominence. Principle 4 won over principle 2 (the Coach, 2026-10-30):

* A healthy received record (full, sparse, or a deletion tombstone) drops the staged.
* A damaged received record carries the staged to the revision after the ouchstone.
* A full record at the same revision (`fill`) surpasses nothing and leaves the staged as it was.

Dropping the staged is the only sound policy without the customer's say. Principle 1 is the real answer, a callback the customer gives `reconcileStaged`, and it is not written yet. Principle 3 is served
by `edit` always staging, even an empty patch, and by a staged edit outliving damage.

The rows are in the `reconcileStaged` doc block in `src/models/storable.ts`.
