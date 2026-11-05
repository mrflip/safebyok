---
"safebyok": minor
---

**A whisper is the object itself.** `WhisperHolder` and `{ val }` are gone: `box.extractWhisper`, `tryExtractWhisper`, `box.whisper`, `box.put`, `vault.putBox` and `boxListing.create` take and give a `Whisper`, which the entry point now exports. Change `whisper: { val: 'sk-...' }` to `whisper: 'sk-...'`, and `const { val } = await box.extractWhisper()` to `const whisper = await box.extractWhisper()`. A whisper left out at a birth is `{}`. A `box.put` or `vault.putBox` of a bad whisper still refuses `bad_option`; what was a bare string, or an object with other fields than `val`, is now a good whisper.

**The whisper a box hands out is a plain object.** `box.whisper` and what `extractWhisper` answers are no longer frozen, so a host can edit one and hand it to `box.put`, which stores a copy. An edit tells nobody. As before, a lock keeps it, `box.whisper` answers `LOCKED` until the unlock, and then the same object is back.

**`LOCKED` is `{ [@LOCKED]: 'locked' }`, and a symbol key is refused.** A whisper or a sidecar with a symbol key at any depth, such as `LOCKED` or a copy of it, now refuses, as JSON would drop the key and leave `{}`. `box.put({ whisper: box.whisper })` with what was read while locked stores nothing, also after an unlock.

**Messages changed:** a whisper's shape, an object in a whisper or sidecar, and a patch's advice, which no longer says `{ val }`.

**Stored format:** a whisper is now sealed as its bare JSON, where it was `{"val":...}`, and `whisper_schema_version` stays 1. A box sealed before this release is not refused: it opens to the whisper `{ val: ... }`, and a host sees that object until the box is put again.
