---
"safebyok-big": minor
---

**A whisper is always a plain object of JSON.** `WhisperHolder` and `{ val }` are gone: `box.extractWhisper`, `tryExtractWhisper`, `box.whisper`, `box.put`, `vault.putBox` and `boxListing.create` take and give a `Whisper`, `Record<string, any>`, which the entry point now exports. So `box.whisper.org` and `box.put({ whisper: box.whisper })` compile. Change `whisper: { val: 'sk-...' }` to `whisper: { apiKey: 'sk-...' }`, and `const { val } = await box.extractWhisper()` to `const { apiKey } = await box.extractWhisper()`. A bare string, number, boolean, array, null or undefined now refuses (`bad_option` at a put). A whisper left out at a birth is `{}`. A whisper or a sidecar with a symbol key at any depth refuses, as JSON would drop the key and leave `{}`.

**`box.whisper` always answers an object.** Exposed, unlocked and not veiled, it is the whisper: a plain, unfrozen object, keeping its identity until replaced, so a host can edit it. Otherwise it is one of three frozen bags, marked with the new public symbol `Whispered` (`Symbol.for('@safebyok/whispered')`): `{ [Whispered]: 'encrypted' }` while not exposed, locked or not; `{ [Whispered]: 'locked' }` while exposed and locked, veiled or not; and `{ [Whispered]: 'veiled' }` while exposed, unlocked and veiled. It no longer answers null. `Storable.isLockedFUBag` is now `Storable.isFUBag`, true for anything carrying the mark, as a copy does. A put of a bag, a copy or a nested one refuses, also after an unlock, so nothing read while locked can replace the secret.

**`box.veil()` hides; `box.unexpose()` discards.** `veil()` used to overwrite the value, and is now sync, safe from any state, and keeps it. `unveil()` shows it again, keeps it hidden while locked, and refuses `bad_option` while not exposed. `unexpose()` is the way to drop a whisper, safe from any state. `expose()` needs the vault unlocked, and shows what it opens, even after a `veil()`. A lock touches none of this, and a sweep, a vacate or a delete clears the value. A delete leaving the value exposed was a bug.

**`box.putExposed({ sidecar }, opts)` and `tryPutExposed`** seal the value exposed, an edit in place included, so they never read a bag. They refuse `bad_option` given a `whisper` or while not exposed, and `vault_locked` while locked, and are allowed while veiled.

**`box.lockState()` and one subscription.** `box.lockState()` reads as `vault.lockState()` does. `box.subscribe(fn)` also subscribes `fn` to the box's vault, and its unsubscribe removes both, so it hears of a lock and an unlock; it also hears the vault's other moves, which leave the box's snapshot as it was and which `useSyncExternalStore` ignores. `box.getSnapshot()` gains `veiled` and `lockState`, and moves on a lock and an unlock, where it used not to. `Vault.lock()` still visits no box. `Listing` rows of box snapshots do not follow the lock until a box's snapshot is next made.

**A strength checker's failing `load` refuses `hello` `unexpected_error`,** with what it threw as the cause, as CUSTOMIZATION.md said. A refusal it threw used to pass through as itself.

**Messages changed:** a whisper's shape, the bag handed to a put (it used to say `LOCKED` by name), an object in a whisper or sidecar, a patch's advice, and a new one for a verb needing a whisper exposed.

**Stored format:** a whisper is now sealed as its bare JSON, where it was `{"val":...}`, and `whisper_schema_version` stays 1, as no public release has happened. A box sealed before this release is not refused: it opens to the whisper `{ val: ... }`, and a host sees that object until the box is put again. A box sealed with a bare string, by an earlier commit of this release, refuses `damaged_box`.
