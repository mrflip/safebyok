---
"safebyok": patch
"safebyok-convex": patch
---

Built with tsdown 0.23.1 (rolldown-plugin-dts 0.28.7), whose declaration files no longer export private helper types by accident. The JavaScript is byte-identical. In the types, three declaration chunks now end with `export {};`, so a type the source never exported is no longer importable from them: `ForComponent` from `safebyok-convex/_generated/component.js`, and, by a deep path past the `exports` map only, `KeyDeriverBase` from safebyok's `key-deriver` chunk and `Env` from the Convex component's generated `server`. Every exported name is unchanged; a host that imported one of these private names should copy the type instead.
