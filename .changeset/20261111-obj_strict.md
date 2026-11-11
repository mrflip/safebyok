---
"safebyok": minor
---

**`objStrict` and `objStrip` make one validator of an object each**, from `safebyok/storage` beside `objCheck`: `objStrict(build, opts?, sources?)` refuses a field `build` does not return, and `objStrip` drops it unread. `opts` is the kind, or `{ refusalkind }`, 'bad_record' unless given; any other `opts` refuses 'bad_option'. The type `RefusalOpts` is exported beside them. **`rowPeek` is renamed `rowMeta`** in `safebyok/storage`, and checks as before. **Stored format:** unchanged.
