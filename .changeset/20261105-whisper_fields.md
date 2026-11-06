---
"safebyok": minor
---

**`box.field(path)`** answers a React 19 ref callback, `(el) => cleanup`, binding anything with a `value` string to the whisper at a dotted path. While the whisper shows, the element holds it, so it reaches no prop or state. At a lock or a veil, and while not exposed, the element is blank. An edit is read into the value on the way into hiding, and comes back with it; what is typed while hidden is never read back. `field` answers the same callback for the same path, so a re-render does not unbind. When the last field unbinds, the box unexposes.

**`box.saveFields(opts)` and `trySaveFields`** read each bound element over a copy of the value, and seal one put. They refuse `bad_option` with no field bound, while not exposed, or while veiled, and `vault_locked` while locked. A text left as shown leaves its leaf alone; an edited number comes back a string.

**`box.patchWhisper(patch)`** deep-merges into a new object, an array replacing, swaps it in, and tells the subscribers; nothing is stored. It refuses `vault_locked` while locked, and `bad_option` while not exposed or given a symbol key or a marked bag. It works behind a veil. So `useSyncExternalStore(box.subscribe, () => box.whisper)` needs no library code.

**`box.expose()` always tells the subscribers,** and a swap of the value moves `box.getSnapshot()`'s identity though its fields are the same, so a repeat `expose` is heard. The types `BoxFieldEl` and `BoxFieldRef` are new exports. The README has one recipe each for a script, a raw field and React.
