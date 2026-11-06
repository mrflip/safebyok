---
"safebyok": minor
---

**A new entry point, `safebyok/dom`, exports `BoxFields`** and the types `BoxFieldEl` and `BoxFieldRef`. It needs no DOM types: an element is anything with a `value` string. `BoxFields.of(box)` answers the one instance for a box, wherever it is called.

**`fields.bind(path)`** answers a React 19 ref callback, `(el) => cleanup`, binding an element to the whisper at a dotted path. While the whisper shows, the element holds it, so it reaches no prop or state. At a lock or a veil, and while not exposed, the element is blank. An edit is read into the value on the way into hiding, and comes back with it; what is typed while hidden is never read back. `bind` answers the same callback for the same path, so a re-render does not unbind. When the last field unbinds, the box unexposes.

**`fields.save(opts)` and `fields.trySave(opts)`** read each bound element over the value, and seal one put, resolving the box. They refuse `bad_option` with no field bound, while not exposed, or while veiled, and `vault_locked` while locked. A text left as shown leaves its leaf alone; an edited number comes back a string.

**`box.patchWhisper(patch)`** deep-merges into a new object, an array replacing, swaps it in, and tells the subscribers; nothing is stored. It works while locked and behind a veil, showing nothing until the whisper shows. It refuses `bad_option` while not exposed or given a symbol key or a marked bag. So `useSyncExternalStore(box.subscribe, () => box.whisper)` needs no library code.

**`box.expose()` always tells the subscribers,** so a repeat `expose` is heard though `box.getSnapshot()`, which holds nothing of the value, does not move. Read the value through `box.whisper`. The types `BoxPutOpts` and `Outcome`, which `Box`'s signatures name, are now exported from `safebyok`. The README has one recipe each for a script, a raw field and React.

**Every model answers a `modelkind`** (`box.modelkind === 'box'`, and so on for a bank, vault, listing, gating, gate, wayin and lease), as a getter, so it is no own key and no spread or `Object.keys` shows it. The type `Modelkind` is exported. `BoxFields.of` checks it in place of `instanceof Box`, so a box from the other of the ESM and CommonJS builds passes.
