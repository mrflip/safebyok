# core_first: the design it starts from

Copied 2026-11-22 from `whiteboard/20261122-react_targets/react_targets-plan.md` (on the base checkout and #817), its sections from *The caches: the Coach's takeaway* to the end, unchanged. A log, oldest first: a later section replaces an earlier one. Words in quotes are the Coach's. Where it names #827, #831 or thread 12, read them as references: this sprint builds on main (the plan, *Ground rules*).

## The caches: the Coach's takeaway (2026-11-22)

The question was whether the minder could run on the customer's `QueryClient`, with its defaults set on our subtree alone. My reading of TanStack 5.107.1 and the minder: it could, at the cost of the gate's wrapped bankKey sitting in the customer's cache, and of moving two things the minder does on its own client. The Coach:

* "We don't have to keep everything in theirs. They care about boxes and listing. Having a tiny little cache to syndicate vaultdb<>indexeddb<>instances/memory is reasonable and frankly might solve a lot of our problems."
* The takeaway, in his words: "1. we can offer customers the right to use *our* TSQ. 2. we could probably use theirs but hell if I'm going to reinvestigate the two things that are in there to solve an ordering issue. 3. if our hooks can work properly against a full/dead/soon TSQ, we should decommission the bridge. 4. if 3 holds I'm comfortable moving to the next issue?"
* **Left as they are for now**, each because it settled an ordering problem he does not want to dive back into in this workshop: the React layer's stale-time function ("it solved some weird race... leave for now"), and the minder's cache-level `onSuccess` ("this was also a race"). A thread that finds one of them in its way says so; it neither works around it nor reopens it unasked.
* On a customer who misuses a shared cache: "we can offer a 'doctor' skill that looks at the codebase to find these", and "as long as their errors are catastrophic or obvious, we don't have to defend against them."
* On tombstones in a `dead` entry: structural sharing "would see null rather than undefined, and be able to get (sync) the `dead` entry at that scope". My answer: yes, that is enough, since the record on the other side names its own scope; the function becomes a closure over the minder's client, and the `dead` entry must land before the item shows null. Not built, and not part of the spike.
* `vault.putBoxMutationOptions`: good "if it parallels the function name in minder" (it does: `#tsqQueryOptions`, and the React layer's `unlockMutationOptions`).

**Running:** thread 8, `one_cache_spike`, an `opus` worker in `/workspace/byok-one_cache_spike` on #821's tip, throwaway, no PR: the hooks observe the minder's own client (`useQuery(options, minderClient)`), the bridge and the copy deleted, the cache's shape as it is today (tombstones in the item). It reports whether item 3 holds.

## Rulings, fifth round (the Coach, 2026-11-22)

* **A draft split across forms**: "add wontfix". The row is on #825's branch (`e8c1683f4`).
* **`refusalTextOf`'s default**: "would you write this in a file for a separate session? Make no changes on it now." The file is `refusal_text-handoff.md`, beside this plan.
* **`.claude/compact-instructions.md`** yields to a `/compact` instruction's choice of topics (on this line).
* **Git and gh** (standing): "you have permission and encouragement to use git and gh to manage your worktrees and prs, including force-push against a known SHA and going in/out of draft, in every respect except adding the label 'queue' or merging a pr."
* **The mutation twin's form stays `<form action={(form) => { save.mutate(form) }}>`** ("go for it"). The Coach on the `onSubmit` alternative: "is the customer typing this in, or is it one time by us? That's an unpleasant experience", and "that's looking pretty intrusive; from my experience, a harbinger of a later report that things aren't working because someone started overriding how events and forms work." I withdrew `onSubmit`: every such form would give up `useFormStatus`, reset itself and pass its button its pending state, and the only reader of the one render is a component the host wrote inside that form.
* **The one render is a wontfix row** ("yes"), on #823's branch (`5805b62ca`).
* **Wontfix demonstrations** (the Coach's idea and rules, 2026-11-22): "demonstrate that it exists, for someone who wants to show that it's a bigger deal than we think -- but also require that the amount of mocking or injection to make it happen be evidence whether it really is true".
  * They live in `tests/wontfix/`, one file a row. STYLE.md's *Tests* says so, on #823 (`3f19f66e6`): "next to the exception for folder'ed tests, tests that have a cross-cutting concern such as wontfix demonstrations".
  * A demonstration may mock or inject, and names what at its head: "I'd like it to stand either way, so that I don't have agents faffing around trying to re-argue it. The rule is 'have you learned something that would let you make this fail without the mock'?"
  * When one fails: "The test should be inverted and moved to the correct location." (My reading: by whoever changed the behaviour, and the row is deleted.)
  * The exemplar: `packages/safebyok-react-lean/tests/wontfix/form-status-twin.test.tsx` on #823, which mocks nothing.
  * **Built, not reviewed:** thread 9, [#826](https://github.com/mrflip/safebyok/pull/826) `wontfix_demos`, on #825: a demonstration for each of the other four React rows, none of which mocks or injects anything; `pnpm justify` green by the worker's report. Two rows were corrected from what the tests showed: the Undo row needs a draft still dirty after the refusal, and a suspending read over our factories needs a cast today (no suspending hook; burndown, *Waits on ownership and startup*).

## The one-cache spike's result (thread 8, 2026-11-22)

Branch `20261122-one_cache_spike` at `f9d2c8f2d`, throwaway, no PR; its thread file is `thread-8-one_cache_spike.md` on that branch. `pnpm justify` green, by the worker's report. The hooks observe the minder's own client through `useQuery(options, minderClient)`; `react-bridge.ts` and the copy are deleted (`safebyok-react-lean/src`: +106, −165 lines); the minder is unchanged but for a door, `minderQueryClientOf(minder)`, exported from a new `safebyok/internals` entry, which hands over the whole client, read and write.

**It holds for a hook mounted once a user is signed in**: the bridge's tests pass as tests of the hooks; all four orderings pass with no timer or microtask; `useBox` answers on its first render a record the minder has; a record told by a list reaches a mounted hook through a listener in the React layer that refetches active queries; one copy of query-core resolves.

**Two gaps, each wanting a change to the minder to close properly** (held; the Coach's):

1. **A hook mounted while nobody is signed in never updates after sign-in.** Each device's minder has a client of its own, and TanStack binds a hook's observer to the client of its first render. Today's hooks survive sign-in because the host's client outlives it. This is the ownership question: who owns the client, and for how long. The worker's options: the Provider remounts its children on sign-in; one client that outlives the device, which the minder is handed; or a rule that record hooks mount only once signed in.
2. **`useBoxList` lists from an effect.** A listing has no queryFn on the minder's client (`skipToken`, and the cache's `onSuccess` would read a listing's answer as a record), so the hook calls `minder.tryList` when the listing is bare or stale. A list's refusal no longer shows as the hook's error.

Also to settle if this is adopted: a host's hook options (`retry`, `staleTime`, `structuralSharing`) now configure the minder's own query while the hook observes it; `bankGiver.queryClient()` and `BoxQueries.client` are new host-facing API, write-capable; the stale-time function's `0` arm looks inert there (left, by ruling); record hooks no longer need a `QueryClientProvider`, the form verbs still do; the guides' `useQuery(vault.box(lp))` needs our client as its second argument.

## The caches: the Coach's direction after the spike (2026-11-22)

His list of what would be nice, in his order and numbering: "1. no bridge, no second home for the data, no timing and invalidation CS402 Final Exam questions. 2. our hooks run against our TSQ. 3. our TSQ data looks like what people want. 4. our TSQ can be queried as if it were a perfectly performant consistent data source. ... 72. we could in principle live in a subtree of a customer's RQ. ... 87. Our TSQ is safe to share and use directly as an unsupported API. No Takers: -- Our TSQ becomes a customer-facing API".

His directives:

1. "Where it's trivial, let's start keeping house like we had a spouse, it can help to win one: pin the options that need pinning; live in our subtree; examine items in structuralSharing, eliminate the need for select, narrow the options the hooks accept; give a listing a real fetch function; etc."
2. "Make no plans to offer to host or offer to adopt."
3. "Use a small standalone TSQ for gate and bank and anything else internal".

His question, on my "have the cache's `onSuccess` skip listings": "should the work being done on every receipt in list, instead be done in onSuccess?" My answer: yes (below, *Answered*). Nothing is built from this section yet.

**Answered.** Once a listing has a fetch function, TanStack itself may fetch it (a mounted hook, an invalidation), and then only the fetch function and the cache's `onSuccess` are sure to run: `tryList` is not. `onSuccess` runs right after the listing lands, which is today's order (the listing first, then each record, so no record's joining changes the listing again). It is handed what the fetch function returned, so the fetch function returns the vaultDB's records, and the listing's combining function (`stableListingOf`, its structural sharing) makes the labelpaths from them.

## The feed principle (the Coach, 2026-11-22)

> the query function / write / mutaion handles only its return value; inject other records at the feed (they land before the record does) and settle consequences in sendToTSQ or onSuccess using the same function

It replaces my answer above (a fetch function that returns the records, reduced by structural sharing). His two applications:

* **A listing**: "isn't this what a select does? we can also perform the `soon` injection when the list hits vaultdb as we do for dbhas". So the listing's fetch function returns only the labelpaths, and `AdapterVaultDB` notifies the listed Things at the feed before the list resumes, as `notifyDbhas` does a refusal's `dbhas`. Agreed, and being built (thread 10).
* **An absent or deleted Thing**: "We could have the api return null on the `val` when `ifAbsent: 'get'`, and make `dbhas` exist on ok true and false". So a get's return value is the live record or null, and a tombstone is a `dbhas` the feed lands in `dead` before the item lands. Proposed by the Coach as a "could"; not ruled, not built. My three questions on it are in chat: inject `dbhas` only where it is another record than the `val`; whether the shell goes; and what a get of a Thing never stored tells apart from a deleted one.

**Built, under review:** thread 10, [#827](https://github.com/mrflip/safebyok/pull/827) `minder_house`, on #821, tip `7dc67ec7d`, `pnpm justify` green by the worker's report. Worktree `/workspace/byok-minder_house`. What it changes for a caller:

* `tryList` answers `Outcome<Labelpath[]>`; it returned the vaultDB's whole `ListThingsAnswer`. Its only callers were tests. `list`'s signature is unchanged.
* `ThingNotice.val`, in the exported `VaultDB` contract, may now be a sparse record: "A Thing a list answers is reported sparse, as listed."
* A listener of a first list hears a `success` for each Thing that joins the listing, then the list's own; it heard one.
* `goodbye` removes the bank's subtree by key prefix. A list waiting at `goodbye` rejects with TanStack's `CancelledError` (a crossing, with its wontfix row).
* New pins in `FixedQueryCacheOpts`: `queryKeyHashFn`, a pass-through `persister`, `initialData`, `select: identity`.

**Reviewed** (2026-11-22): three small fixes kept (`listen` now tells only this bank's queries; a comment; a test local's name), and I reworded `list`'s doc: a list called while another of the same labelpath is under way answers what that one does, so it can miss a Thing written since that one began (the cached listing does not). The reviewer found no invariant false but the one below, and no test weakened. Left alone: `select: identity` as a pin (the reviewer preferred `undefined`, which TanStack's types refuse under `exactOptionalPropertyTypes`; its only cost is an observer kept across `goodbye` and `hello`, an ending). `tryList` no longer tells a list under a tombstone or under nothing from an empty one (the parent's `act`); the `kids` value's `parentlife` is where that returns (`vaultdb_answers-handoff.md`).

Flagged once, for the Coach: `safebyok-postgres`, which is published, builds its vaultDB on `AdapterVaultDB`, so its watches now hear each listed Thing, sparse. #827's changeset is empty.

Open with the Coach: one invariant in the minder's header needs rewording, and the worker left it alone. It reads "An operation caches only its own good answer: the record got, written or listed…"; proposed: "the record got or written, or the labelpaths listed… (a refusal's `dbhas`, each Thing a list answers, or a tracked…)".

## The customer's contract with our cache (the Coach, 2026-11-22)

It corrects my reading of "No Takers: our TSQ becomes a customer-facing API", from which I had struck the query factories and any handle to our client.

* "Out of bounds: the customer can freely use our queue"
* "Out of bounds: the customer contract allows them to inspect how our library uses our queue, do the same thing themselves against our queue"
* "Allowed: the customer contract allows them to use our methods to query the queue: getting our queryOptions and using it against our queue"
* "Allowed: the customer can assume that a change to the queryKey or a breaking change in the record shape will receive a major version bump"

So the factories stay, and a customer needs some way to point TanStack's hooks at our client. Proposed by me, and loosened by him in the next section (invalidating and the devtools are both fine): one handle to the client, documented as the second argument of `useQuery`, `useQueries` and `useSuspenseQuery` over our factories; a refetch through a method of ours (`vault.invalidate`); the devtools unsupported. Under semver: the key and data shape of whatever has a factory (a box's item, a listing). A soon and a `dead` entry have no factory and no promise.

## The contract with our cache, refined (the Coach, 2026-11-22)

* Invalidating: "you can invalidate but not advance (no fair making something less stale in time or validity)".
* The devtools on our client: "I don't have an issue with that, just don't make us promise not to change".
* The handle: "I'm not willing to give over `.box` on Vault to TSQ's weird query format, so this would be a helper object, but we can work that out later". So the guides' `vault.box(lp)` as a query factory is wrong as sketched: the factories move to a helper object, not yet named.
* The vaultDB's answers under the feed principle (a list's `kids` value and `deltas`, `dbhas` only when usefully different, a frozen singleton for the shell): specified, not built, in `vaultdb_answers-handoff.md` beside this plan, for a thread of its own on #827.

## Ownership and startup: the Coach's states and sequence (2026-11-22)

The caches are settled as far as this workshop takes them; the listing and the vaultDB's answers go on from `vaultdb_answers-handoff.md`. His opening on startup, verbatim:

> We have these states:
>
> user: banked and on the device; banked but vacant ; unbanked
> BankMinder: userids ; gates ; leases ; banks
> VaultMinder:  box kids, item, gone, soon
> And these data stores:
> vaultDB: 30-300ms; assume this needs userid so we have DB access
> idb: 0.5-5ms
>
> There will be a small security <> UX tension for the startup time after a pageload, userid, and database availability.
> Assume the BankMinder can exist early, and the customer caches root gate, bank, and box (and maingate, which right now is the same as the root gate) by banklabel and userid.
> I'm happier if VaultMinder is only instantiated after the user exists; we can explore having it live across signins though.
> An opportunistic process (undesigned) will keep it synced with the local indexeddb
>
> module start
> sync device
> sync BankMinder, VaultMinder exists
> sync Provider exists, keyed on userid and banklabel (which must='main')
> ...async bankminder has loaded local bank/gate/box records
> ...user is signed in
> (if user is banked: anything cached is ready)
> async fetch bank/gate
>
> ... continue

My continuation, proposed in chat, nothing ruled:

1. **First render, server and browser alike** (synchronous, nothing started): the Provider makes the device in a `useState` initializer, and with it the BankMinder, its small cache, and the vault cache's client, empty. Constructors do no I/O, touch no browser global and subscribe to nothing. The stage is `'signed_out'` where the `userid` prop is null, else `'starting'`. The server never gets further, so it and the browser's first render agree.
2. **First effect, browser only**: `device.hello()`: the device database opens, and the BankMinder loads the bank, gate and root box cached for the users this device has seen.
3. **An effect on `userid`**: the device is told who is signed in. It makes that user's bank and VaultMinder, on the client made in step 1.
4. **Banked and on the device**: the stage is `'locked'` from the cache, a few milliseconds in, and cached records show sealed. **Vacant or unbanked**: `'starting'` until the vaultDB answers.
5. **The vaultDB's bank and gate arrive** (30 to 300 ms): they confirm the cache or replace it; a user with no bank goes to `'unborn'`.

Where it differs from his sketch, each for him to rule: the device is made at the Provider's mount, not at module start; "keyed on userid" as a React `key` would remount the customer's whole tree at sign-in, where a vault client that outlives the user needs none; and the VaultMinder is made at sign-in, as he prefers, but its client is not.

The decision the security and UX tension comes down to: what may be done on a cached gate before the vaultDB confirms it. Showing the stage and sealed records: I would allow. Unlocking: his to rule.


### What is synced with the device's database (the Coach, 2026-11-22, "coming around to")

> the indexeddb and the Minders should be synced: The BankMinder for all user+banks; the VaultMinder all boxes for the active user, for all user+bank the root box and listing.

My reading and notes, raised in chat, nothing ruled:

* **What it buys.** A returning user's stage and box list from the device in a few milliseconds. If the stage leaves `'starting'` only once the restore has landed, a hook mounted at `'locked'` answers on its first render, and a suspending hook never suspends on a cached record. And one list of each cached listing, once the vaultDB is reachable, says which cached boxes are behind (its `deltas`).
* **What stays on the device for a user who is not signed in**: the passphrase-wrapped bankKey (material for guessing offline), the gate's headers, the bank, the root box, the labels of the top-level boxes, and whatever a lease allows. Readable by whoever has the browser profile, and by the customer's own page.
* **One ending it implies**: when the active user changes, the earlier user's boxes leave the device's database, or it grows a vault per user.
* **Order**: the restore lands before the minder says `hello` to the vaultDB, so a restored record never meets a fetched one out of order.
* **Mechanism to check first**: TanStack's own persistence (`@tanstack/query-persist-client-core`: `persistQueryClient`, with `shouldDehydrateQuery`, `maxAge` and a `buster`), one stored snapshot for each user and bank, in the device database's adapter package and not the core. It restores a cache exactly, the soon, `dead` and listing entries and their times included; it writes past structural sharing and `onSuccess`, which is harmless into an empty cache.

**TanStack's persistence, where it is and its limits** (found 2026-11-22; from its docs and query-core 5.107.1's `hydration.ts`, not tried):

* `dehydrate` and `hydrate` are in `@tanstack/query-core`, which the core already has. `persistQueryClient` (the timestamp, `maxAge`, `buster` and the subscribe-and-save loop around them) is in `@tanstack/query-persist-client-core`, not installed here; the stock persisters and the React provider that waits for a restore are further packages.
* One snapshot of the client, rewritten whole on a change, throttled by the stock persisters to once a second. No coordination between tabs: the last to save wins the whole snapshot.
* A restore builds each query with its saved state: structural sharing and the cache's `onSuccess` do not run, and an entry whose data landed later, by the device's clock, is left alone. It is asynchronous, and ordering it before any fetch is the caller's job.
* Defaults to change for us: only a query whose last fetch succeeded is saved (an item whose last get was refused has its record and an error state, and would be dropped); a snapshot older than 24 hours is discarded whole.
* What is saved must survive the serializer: frozen-ness, prototypes and object identity do not. A custom persister over IndexedDB can store objects without JSON.
* Nothing is encrypted.

### A world query (the Coach, 2026-11-22)

> I'm on board with the persist. We can define a world query that is keyed on user+bank+banklife+bank.lifetok (a new field being added in another session) -- holds the bank, gate, root box and root box listing.

Today's code already has the shape in part: every vaultDB answer carries `world` (`WorldRecord`: the bank's record with its main gate as `maingate`) and `tracked` (the bank, the main gate and the root box, each `'same'` or the Thing stored). My notes, raised in chat, nothing ruled:

* **For it**: one entry is one consistent set of roots, from one answer; the stage is a function of one value; one small entry for each user and bank is what the BankMinder persists; and it arrives by the feed on every answer already.
* **The root box's listing in it**: it changes whenever a top-level box is added or deleted, where the bank and gate change a few times a day; it is the listing a customer most wants to read, and the world's value has the wrapped bankKey; and the vault cache would have a second copy. Proposed: the world is the bank, the gate and the root box, and the root listing stays the vault cache's.
* **A life in the key**: the key cannot be made until a world has been read, so the entry is landed, never fetched by its key; the first fetch is by user and bank, and the entry is found by key prefix. A late answer from an earlier life lands under its own key, so nothing has to compare lives. Entries of earlier lives need removing, in memory and in the persisted snapshot.
* I do not know what `lifetok` rotates on, so I cannot judge its place in the key.

**Ruled** (the Coach, 2026-11-22): "ok go with the simpler plan". My reading: the world query has the bank, the gate and the root box, and the root box's listing stays in the vault cache. The key (user, bank, `banklife`, `lifetok`) stands as he gave it.

### Ownership and startup: what is settled and what waits (2026-11-22)

Settled by the Coach: our own cache, read by our hooks, with no bridge; a small cache of its own for the gate, the bank and anything internal; the BankMinder may exist early, the VaultMinder once the user does; both synced with the device's database through TanStack's persistence; a world query for the bank, gate and root box.

Proposed by me, not ruled, and what the React thread waits on:

1. The device is made at the Provider's mount (React's once-per-mount initializer) and started in an effect, not at module start.
2. The vault cache's client is made with the device, empty, and each user's VaultMinder attaches to it, so that a hook mounted while signed out goes on working after sign-in. That needs no React `key` on the user, which would remount the customer's tree at sign-in.
3. The stage leaves `'starting'` only once the restore from the device's database has landed.

Ruled by the Coach, 2026-11-22:

* **A cached gate**: "We can give the customer an independent throttle later, but right now let's set it at this: 1. if we have the data, we can use it; 2. we require a userid in the context if that's the right word; 3. no unlock until userid". So the stage and an unlock both run on what the device has cached, before the vaultDB confirms it, once the Provider has a `userid`; with none, nothing unlocks. What follows, accepted with it: an unlock works with the vaultDB unreachable, and a passphrase replaced on another device still unlocks what this device cached until the fetched gate lands.
* **`lifetok`**: "bank's lifetok is changed on every delete and create". So each delete or create of a bank makes a new world key, and the entries of earlier keys are removed by prefix.
* **What stays on the device for a user who is not signed in**: "what stays is the customer's to define".

**Ruled** (the Coach, 2026-11-22), on the three proposals above: "lgtm on all three, and if the customer complains on the last one we can assess costs to making it". So: the device is made at the Provider's mount and started in an effect; the vault cache's client is made with it, empty, and each user's VaultMinder attaches; the stage leaves `'starting'` only once the restore from the device's database has landed.

### Building it: two threads now, the rest for a sprint

* **Thread 11, `minder_client`** (running: an `opus` worker in `/workspace/byok-minder_client`, on #827): a factory for the minder's client with its cache-level `onSuccess`, `ThingMinder` and `Device.make` taking the client as an option, a minder attaching and detaching. A minder given no client makes its own, as today.
* **Thread 12, the React thread** (next, on thread 11): the Provider owns a holder made once at its mount (the client, and the signed-in user's device), started and signed in from effects, so that module scope and render make nothing that does I/O, touches a browser global or subscribes (`reactGiver(config)` itself is still called at module scope, and makes only components and hooks); the hooks observe our client; the bridge and the copy go; hook options narrowed; `useBoxList` over the listing query #827 made; tests that no longer need a module reset. `reactGiver(config)` stays as the maker of the Provider and the hooks for now: the surface in the guides (hooks by name, `useVault()`, a helper object for the query options) is a thread of its own, with names still to settle.
* **Not literal yet**: the core's `Device` is made for one user, so "the device at the Provider's mount" is a holder in the React layer until the core has a device that exists before its user. That, the BankMinder apart from the VaultMinder, the world query, persistence (and with it ruling 3), and the vaultDB's answers are core work for a sprint.
