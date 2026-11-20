---
---

Empty: the new `safebyok` is private. What a caller of a `ThingMinder` will see:

- **`tryGet`, `tryList` and `write`.** `get`, `list` and `tryWrite` each come as a pair: `tryGet`, `tryList` and `tryWrite` resolve an `Outcome`, a refusal (misuse included) as its bad outcome; `get`, `list` and the new `write` throw it. A `get` that throws something other than a refusal now throws it as an `unexpected_error`.
- **`listingAt` and `isListingBareAt` take a scope again**, of the minder's own bank, as `at` does, in place of a bare labelpath.
- **No `carkind`, no `tag`.** A `MinderEvent` no longer carries `carkind`, and a listing's event no longer carries `tag: 'kids'`. `ThingMinder.isThingEvent(event)` tells a car's event from a listing's, and narrows it to a `ThingEvent`. `ThingFormat` is unchanged: the events with those fields never shipped.
- **A goodbye and a fresh hello.** A get, list or write still under way across a `goodbye` and a fresh `hello` may land its answer in the new stretch's cache: that is left unspecified (`notes/wontfix.md`). A plain `goodbye` still caches nothing of an answer that lands after it.

Nothing stored changes.
