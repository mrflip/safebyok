---
"safebyok": minor
---

**`box.field(path, { whenLocked })`** answers a React 19 ref callback, `(el) => cleanup`, binding anything with a `value` string to the whisper at a dotted path. While the whisper shows, the element holds it, so it reaches no prop or state. At a lock or a veil the element goes blank, or shows `WhisperMask` under `whenLocked: 'mask'`; while not exposed it is blank. An edit is read into the value on the way into hiding, and comes back with it; what is written while hidden is never read back. `field` answers the same callback for the same path and options, so a re-render does not unbind. When the last field unbinds, the box unexposes.

**`box.saveFields(opts)` and `trySaveFields`** read each bound element over a copy of the value, and seal one put. They refuse `bad_option` with no field bound, while not exposed, or while veiled, and `vault_locked` while locked. A text left as shown leaves its leaf alone; an edited number comes back a string.

**`box.patchWhisper(patch)`** deep-merges into a new object, an array replacing, swaps it in, and tells the subscribers; nothing is stored. It refuses `vault_locked` while locked, and `bad_option` while not exposed or given a symbol key or a marked bag. It works behind a veil.

**`box.whisperMasked`** is the value when it shows; while locked or veiled, the value's shape with each leaf `WhisperMask`, frozen, marked so a put refuses it, its identity held until the value changes; and the `encrypted` bag while not exposed. So `useSyncExternalStore(box.subscribe, () => box.whisperMasked)` needs no library code, as does `() => box.whisper`.

**`box.expose()` always tells the subscribers,** and a swap of the value moves `box.getSnapshot()`'s identity though its fields are the same, so a repeat `expose` is heard. `WhisperMask` and the types `BoxFieldEl`, `BoxFieldOpts` and `BoxFieldRef` are new exports. The README has one recipe each for a script, a raw field and React.
