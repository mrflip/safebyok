# giver_needs: resolutions

What the Coach ruled during the giver_needs sprint, and the orchestrator's own calls the Coach did not need to rule on.

## The Coach's rulings

Newest batch first. Each entry gives the matter as the doc's *Resolved* tab put it, the Coach's answer word for word,
the date, where it was asked, and where the work went.

### tryWrite lands the tracked records too

The matter: thread 4 had the minder's `tryWrite` land the answer's `world` and `tracked` records beside its own;
explained: the vaultDB's write acts on one subject and hands those back. Rec: keep it.

The Coach, in chat:

> "it's supposed to not happen in the verb but rather in vaultDB -- sending them out as watch notices. the minder just
> pays attention to the record."

Date: 2026-11-19. Asked in #758, thread 4. Went to thread 6 as a directive: `tryWrite` lands only `val` or `dbhas`.

### "Listing" in VOCABULARY.md

The matter: Rec: a *listing* row for the minder's sense, *minded* and *givable* applying to it, and *sparse*'s use
reworded.

The Coach: (empty: took the Rec).

Date: 2026-11-19. Asked in #757, thread 3. Went to thread 6.

### A listing event when the listing is removed

The matter: thread 3 made `labelpaths` undefined once the listing is removed. Rec: keep it.

The Coach:

> "ok"

Date: 2026-11-19. Asked in #757, thread 3. As built.

### A child heard of before its parent's first listing

The matter: a box landing while the parent's first `list` is in flight joins no listing until the next `list`. Rec:
accept as documented, with a `notes/wontfix.md` row.

The Coach:

> "seed the root box listing as bare wherever it is that the root box is seeded. have hello  fetch the listing if
> that's not a can of worms"

Date: 2026-11-19. Asked in #757, thread 3. Went to thread 6.

### `carkind` on what is not a car

The matter: the ruled tag calls a listing and an invalidation kinds of car, which VOCABULARY.md's *car* does not.
Rec: keep `carkind`, with a line in *car* saying the tag spans all three events.

The Coach:

> "ok"

Date: 2026-11-19. Asked in #756, thread 2. The VOCABULARY line goes to thread 6.

### Event type names

The matter: the plan's `ThingCar`, `ListingCar`, `InvalidationCar` fought VOCABULARY.md; thread 2 named them
`MinderEvent`, a union of `ThingEvent`, `ListingEvent`, `InvalidationEvent`. Rec: keep those.

The Coach:

> "ok"

Date: 2026-11-19. Asked in #756, thread 2. As built.

### The invalidation event, one per query

The matter: TanStack tells one event per query invalidated, so `tags: 'all'` described the ask, not the event. Rec:
`{ carkind: 'invalidation', modelkind, labelpath, card: 'list', tag: 'kids' }`; and `tags` or `labels`?

The Coach, in chat, in two answers:

> "yes; in the case of a card: 'get', the tag is the label, and for self it's 'full'"

> "tag and tags, as they may not be constrained to the tight string formal label requires"

Date: 2026-11-19. Asked in thread 5 and #756. Went to thread 5's handoff, which changes `InvalidationEvent`.

### Deletes, corrected

The matter: the Coach's correction of the scope ruling and of giver_needs.md's "no delete verb".

The Coach, in chat:

> "I overspake. Delete: yes. Deleting the root node ("parent") and cascading that with all the machinery that entails:
> no"

Date: 2026-11-19. Raised in chat. Went to the plan's ground rules and thread 4.

### M4: `invalidate`'s second argument

The matter: Rec: required.

The Coach:

> "exactly"

Date: 2026-11-19. Asked in thread 5. No other destination recorded.

### M3: the write verb's name and answer

The matter: Rec: `tryWrite(ask)`, answering the vaultDB's `WriteThingAnswer` once its records have landed.

The Coach:

> "we want both eventually. There's some subtlety about throwing from that method in terms of how cache invalidation
> is supposed to work that I can investigate; carry on with what goes with the grain"

Date: 2026-11-19. Asked in thread 4. `tryWrite` in thread 4, a throwing verb later.

### M2: the small list answer

The matter: Rec: build on today's list answer, propose the small shape for later.

The Coach:

> "mark small list answer not for this sprint"

Date: 2026-11-19. Asked in thread 3. A TODO.md entry in thread 3, no proposal.

### M6: the listing and invalidation fields

The matter: Rec: a parent `labelpath` on both, and `list:'all'`.

The Coach:

> "`{ carkind: 'listing', modelkind, labelpaths, tag: 'kids' of: { parentpath }  }` Chosen to not restrict listings to
> always be child listings `{ carkind:'invalidation', modelkind, labelpath, card: 'list', tags: 'all' }` The design is
> thought through for future features: "card" being (not yet, but later) "list", "self", "kids" (#,  !, /); tags hold
> the string 'all' or later a list of labels."

Date: 2026-11-19. Asked in threads 2, 3 and 5. Went to their handoffs.

### M6: the thing event's shape

The matter: the plan spread the car flat; Rec: `{ carkind:'thing', modelkind, labelpath, car }`, `car` undefined when
removed, dropping `act`, `isTimely`, `lastErr` from `listen`.

The Coach: (empty: took the Rec).

Date: 2026-11-19. Asked in thread 2. Went to thread 2's handoff.

### Scope: Part 1, five threads

The matter: the sprint builds giver_needs.md's Part 1 (M1, M2, M3, M4, M6, M7) as five PRs stacked on #751; M5 and all
of Part 2 wait; M6 runs second; M7 rides with M1.

The Coach:

> "yes. Don't do bulk deletion which has a whole bags of wormses in it and is not needed / work based on origin/main
> plus the other pr"

Date: 2026-11-19. Asked in the plan (#752). Went to the plan's ground rules.

## Calls left to the orchestrator

These are the orchestrator's calls, made without a ruling from the Coach. Each row gives the matter, the call, and
where it landed.

### Guard name for a box's labelpath (#753)

The matter: `Labelpath.isBox`, or `isOfBox` to echo `isOfModelkind`.

The orchestrator's call: keep `Labelpath.isBox`: it reads as the question it asks.

Lands in: #753, as filed.

### Listing query defaults stay once set (#757)

The matter: TanStack cannot remove a `setQueryDefaults` entry, so one stays per parent ever listed.

The orchestrator's call: accept: bounded by the parents in one bank (today the root box).

Lands in: #757, as built.

### A list always tells a listing event, even when nothing changed (#757)

The matter: a list always tells a listing event, even when nothing changed.

The orchestrator's call: accept: a list must clear invalidation by setting the listing; the array keeps its identity,
so a listener re-renders nothing.

Lands in: #757, as built.

### tryWrite and a vaultDB that rejects (#758)

The matter: only the checks before asking are caught; a broken adapter's rejection propagates.

The orchestrator's call: keep: as list does; a broken state is reported by throwing, never accommodated (CLAUDE.md).

Lands in: #758, as built.

### invalidate's first argument (#759)

The matter: `Labelpath | undefined`, since no required parameter may follow an optional one; every listing is
`invalidate(undefined, { list: 'all' })`.

The orchestrator's call: keep: it is the Coach's signature, spelled as TypeScript allows; an overload would be a second
shape to document.

Lands in: #759, as built.

### A record joining an invalidated listing clears TanStack's invalid mark without a list (#759)

The matter: a record joining an invalidated listing clears TanStack's invalid mark without a list.

The orchestrator's call: keep: nothing in the minder reads the mark; the join tells a listing event, and the next
invalidate tells afresh.

Lands in: #759, as built.

### A join no longer moves a listing's time (#765)

The matter: staleness counts from the last list.

The orchestrator's call: accept: a join is not a fetch.

Lands in: #765, as built.
