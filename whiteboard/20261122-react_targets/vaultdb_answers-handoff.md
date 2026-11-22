# The vaultDB's answers under the feed principle (a handoff for a thread of its own)

Specified by the Coach in the react_targets workshop, 2026-11-22; not built. He wants it out of the workshop's context
("let's keep context focused on the big design, I think that will be straightforward"). It stacks on
[#827](https://github.com/mrflip/safebyok/pull/827), which made a listing a real query whose cached value is today a
`Labelpath[]`, with each listed Thing notified sparse at the feed.

## The principle

> the query function / write / mutaion handles only its return value; inject other records at the feed (they land
> before the record does) and settle consequences in sendToTSQ or onSuccess using the same function

"The invariant of `val` always being what is returned and what is in the cache holds."

## A list's answer (the Coach, 2026-11-22; his second shape replaces his first)

The `val`, in his words:

> Change the `val`: `{ modelkind: 'kids', parentpath, parentlife, items: { [label]: { lifeseq } }, gones: { [label]: { lifeseq } } }`
> eg { claude: { lifeseq: '...' }, openai: { lifeseq: '...' } }. don't otherwise change the answer shape.

* "the root element cannot appear in a listing (i.e. you can't query 'list the children of the parents of root')."
* `deltas: [{ ...sparse record }, ...]` beside it, which "contains every record that is also in val", injected at the
  feed. On a listener hearing one event for each child: "hence `deltas`, but not yet minimal".
* The parent's revision "is not on the `kids` object, because it won't be updated. the lifepath is a signal to
  invalidate, so it's immutable for the life of the listing object".
* "on the answer: change 'parent' to 'parentage' and make it an array. the parentage records should be injected in the
  feed". Today's `parent` is not injected: the minder lands only the listed children.
* `damaged_rows`: "out of bounds at the moment". Leave it as it is.
* A sparse record in a notice "was in principle already true -- pg sends a sparse record if it exceeds NOTIFY".
* "The invariant of `val` always being what is returned and what is in the cache holds."

Today's list answer (`ListThingsAnswer`, `packages/safebyok/src/storage/vault-db.ts`): `val` is the children as sparse
records in labelpath order, tombstones included (these become `deltas`); `parent: Sparse | null` and
`damaged_rows: DamagedThing[]` sit beside the answer, good or refused; `act` is the parent's get act; a refused list's
`dbhas` is `[]` under `void` or `gone`, null otherwise. Since #827 the minder's `tryList` answers only labelpaths, so
nothing tells a caller the parent is a tombstone or was never stored: `parentlife` is where that returns.

One thing to know about `items` and `gones` as objects: JavaScript orders an object's keys that look like whole numbers
first, in numeric order, whatever order they were added in. A label such as `2024` will not stay in labelpath order.

## A record that is not where the listing says (the Coach's proposal, 2026-11-22)

> instead of the thing where we do surgery on a listing in onSuccess, look up your place in the listing and if it's
> off, invalidate it (surgery optional)

My reading, agreed in chat and not yet ruled in detail: when a record lands, the one settling function looks its label
up in its parent's cached listing. It is off when the label is in neither `items` nor `gones`, has another `lifeseq`,
is in the wrong one of the two, or the record's parent life is not the listing's `parentlife`. Then the listing is
invalidated, and never joined to: its value stays what the vaultDB last answered. This replaces `#addToParentListing`,
the bare root listing seeded at `hello`, and the invariants "a listing never drops a labelpath" and "the same array
until a labelpath joins it". It supersedes my proposal to derive membership from the cached entries.

To get right:

* **A list's own deltas land before the list does, so each is off against the old listing.** TanStack's
  `invalidateQueries` cancels and restarts a fetch under way for a query that has data: the restarted list's deltas
  would cancel it again, without end. Invalidate with `{ cancelRefetch: false }`, which joins the list under way, or
  mark stale only while one is.
* **A mounted hook should re-list.** Today's listing is invalidated with `refetchType: 'none'`, and the header says
  `invalidate` asks the vaultDB nothing. Under this proposal an off record's invalidation refetches a listing a hook is
  showing; a listing nobody shows is only marked.
* **The cost:** a box this device has just put or deleted shows in the listing one list later, and each such change
  costs a list. If that list is refused the listing stays as it was, marked stale, though the box's own record is
  cached. Surgery for this device's own writes is the optional remedy.

## A get's answer

* "We could have the api return null on the `val` when `ifAbsent: 'get'`, and make `dbhas` exist on ok true and false."
* On injecting `dbhas` only when it is another record than the `val`: "I'd have VaultDB only return it when it's
  usefully different."
* On the shell, and on null: "I don't like using null or absence as a sentinel. We can swap it for a singleton frozen
  object as long as everyone promises to never use object equality (ie. it's an optimization not a contract)."
* Then the item has the live record or that object, a tombstone lands in a `dead` entry by the feed, and structural
  sharing looks the `dead` entry up by the scope of whichever side is a record ("it would see null rather than
  undefined, and be able to get (sync) the `dead` entry at that scope").
* The stale-read check compares the answered record with the newest cached: for an answer with no live record it
  compares the `dbhas`.
* `newerThingOf` must also pass through what is no record: TanStack runs structural sharing on every `select` result.
  It promises today "Refuses anything but a record".

## What reads tombstones today

14 places in `thing-minder.ts`, 2 in `models/vault.ts`, `models/base-thing.ts`, and in the React layer `liveOf` and
`gateShownOf` (`giver-defaults.ts`); six of the minder's test files. The events a listener is told change with it
(`ThingEvent`, `MinderEventFormat`).

## `known`: an internal, groomed listing (the Coach's refinement, 2026-11-22)

> if we sent an injected record that was the merge of gones and items, sent first, into `known` -- this is an internal
> listing, not a query result, and is groomed

My reading, agreed in chat and not yet ruled in detail. Two entries for a parent's children:

* **The listing**: a query result, public, exactly the vaultDB's `kids` value, replaced whole by each list and never
  joined to.
* **`known`**: an entry kind of the minder's own, beside `soon` (and `dead`): label to `lifeseq`, of every child heard
  of. A list's answer injects its merged `items` and `gones` into it at the feed, **before** the deltas. Each record
  that lands grooms it (a new label, another `lifeseq`, live to gone).

The rule that replaces "is this record off against the listing": **when grooming changes `known`, invalidate the
listing.** A list's own deltas change nothing in `known`, since its merge arrived first, so they invalidate nothing, and
the cancel-and-restart trap above does not arise. A record from anywhere else that is news to `known` grooms it and
invalidates the listing once.

Costs: one more entry kind; one more kind of record injected at the feed, which is no Thing, so `ThingNotice` and every
watch handler meet it; and the grooming code stays (it is today's `#addToParentListing`, pointed at `known`).

To decide in the thread: whether a list's merge replaces `known` or is united with it (a child heard of after the
list's snapshot, against a child the vaultDB no longer has); and whether `known` exists from `hello` or from the first
list.

## To explore first: is a first landing enough? (the Coach, 2026-11-22)

> we should first explore whether invalidating the listing when query.state.dataUpdateCount === 1 is sufficient. We
> should also add a read_at timestamp to the answer data type so that a listing can be ordered

`dataUpdateCount` is TanStack's count of the times an entry's data was set, by a fetch or by `setQueryData`: 1 on the
entry's first landing. `onSuccess` is handed nothing of what the entry had before, so this is the one thing it knows.

My analysis, from the source and the minder's code, not from a run. For the thread to confirm with tests:

| What changed for the listing | Does a first landing show it? |
|---|---|
| A child nobody had heard of | Yes: its first record lands in a new item or soon. |
| A child dies | Only once a tombstone has an entry of its own (`dead`). In the item, as today, it is the item's second landing or later. |
| A child is born again under its label, with a new `lifeseq` | No, where the new life lands in the item the old life had. Deleting a key and adding it again under the same name is ordinary use. |
| A second death | No, unless the `dead` entry was removed at the rebirth. |

And it fires where nothing changed for the listing:

* **The first get of a child the listing already has.** A list lands each child sparse, in a soon; the first `useBox` of
  each then lands its item for the first time. A list of N children would be invalidated up to N times as its rows mount.
* **A soon is removed when its item catches up, and made again the next time the item falls behind.** Each of those is a
  first landing, a list's own deltas among them.

Qualified as "the first landing in this entry, and the Thing has no other entry", both false alarms go; the rebirth is
still missed, because telling it needs the `lifeseq` the cache had before.

The three rules, then: **(A)** a first landing, simplest, and wrong on a rebirth; **(B)** look the record's label up in
the listing's own `items` and `gones` and invalidate where it is absent, has another `lifeseq` or is in the wrong one,
with `{ cancelRefetch: false }` so that a list's own deltas join the list under way: no new entry, right in all four
rows, one TanStack flag to lean on; **(C)** `known`, above: right in all four, no flag, an entry kind and a notice kind more.

`read_at`: a time on the answer, so that two listings can be ordered and a late answer does not replace a later one.
The Coach, 2026-11-22: "it's the store's -- we currently assume a unitary datastore. I'm trying to think if we want to
make them swear it's a time. I think we may, as such: it must be nondecreasing and the real part should be accurate to
100,000 milliseconds. a datastore that carries a journal clock can send it as the decimal portion and has to promise not
to partition *and* lose time for more than 1m40s".

My notes on it, raised in chat and not ruled:

* **Room in a number.** A JavaScript number near today's epoch milliseconds has steps of about 0.00024, so the decimal
  portion orders about three digits: a counter of up to 999 within a millisecond fits, a journal position such as
  Postgres's 64-bit LSN does not. An integer part of physical time within a bound, and a counter that breaks ties, is a
  hybrid logical clock (Kulkarni and others, 2014), a published construction.
* **What must hold, in terms of reads**: where one answer's read saw everything another's saw, its `read_at` is no
  less. "Nondecreasing" on a wall clock taken at a transaction's start is that only approximately.
* **Never compare it with the device's clock.** The accuracy is for a person reading a log; freshness by the device's
  clock against the store's would fail on a device whose clock is wrong.
* STYLE.md has times as integers of UTC epoch milliseconds: a decimal portion is an exception to write down.

**`read_at` as a sortable id** (the Coach, 2026-11-22): "I forgot about the other end of safe integer accuracy. what I
really want is a ulid, or the new sorting uuid". Facts found: UUID version 7 (RFC 9562) is built into PostgreSQL from
18, as `uuidv7()`; no earlier version has it, and no version has a ULID. Its first 48 bits are epoch milliseconds, the
next 12 a sub-millisecond part, and it rises within one backend (one connection) even if the clock steps back; across
backends it is ordered by the clock alone. It is a string, so it is not a time by STYLE.md's rule, and its name should
not end `_at`. The other vaultDBs would make one in JavaScript (the `uuid` package's `v7`). Not ruled.

**On Convex** (facts found, 2026-11-22): it has no UUID version 7 of its own; a function makes one in JavaScript. Inside
a query or a mutation `Date.now()` is one value for the whole run, the time given to the transaction when it started, and
randomness is seeded. So the id's milliseconds are the transaction's, and the bits within a millisecond are in no
order. A list is a query, which Convex caches: the id is from when the query last ran, and Convex's docs warn that
`Date.now()` in a query costs it cache hits. Not confirmed: whether `crypto.getRandomValues`, which the `uuid` package's
`v7` uses, exists in Convex's default runtime.

## `read_tc`, the time code (the Coach, 2026-11-22)

> ok so read_tc for "time code", a non-decreasing string matching
> /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/ which should be a uuid v7 and must meet
> "where one answer's read saw everything another's saw, its read_at is no less" to the customer's satisfaction. The
> alternative is a string of 12 or more base32 characters whose leftmost 10 digits correspond to 48 bits of epoch
> milliseconds.

Two slips in the quote, corrected here: the pattern has a stray `)` before `$`, and the property names `read_at` where
it means `read_tc`. The pattern: `/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`.

It replaces `read_at` above. My notes, raised in chat, not ruled:

* **One form, the UUID one.** The base32 alternative gains nothing a store needs (whatever can write 48 bits of
  milliseconds and a fill can write either), and two forms cannot be compared with each other. If base32 is kept, name
  its alphabet: RFC 4648's own (`A-Z2-7`) does not sort in numeric order as text; Crockford's and RFC 4648's
  "base32hex" do.
* **Compared as text, never parsed**: lowercase hex of a fixed width sorts in time order.
* **It has to be on the `kids` value, not only beside it on the answer.** A listing is ordered where it lands, in
  structural sharing, which is handed the two values and nothing else; and by the feed principle the fetch function
  returns only the `val`.
* **Only its shape can be checked.** Answers arrive out of order, which is what it is for, so "no less than the last one
  seen" is not a check the adapter's base can make.
* It needs a line in STYLE.md beside `_at`: a `_tc` is a string that sorts by time, and no integer of milliseconds.

**Ruled** (the Coach, 2026-11-22): "but yes uuidv7, via library. add read_tc to answer and kids good catch". So one
form, a UUID version 7 made by a library, on the answer and on the `kids` value. And: "ok I am going to trust list can
be worked out from there." On base-32: "We should disambiguate what base-32 means in our own docs; in the code, it's
lowercase 0-9a-v as generated by `.toString(32)`" (`parseInt('2012v', 32)` is 2098271, and back). That alphabet sorts in
numeric order as text.

