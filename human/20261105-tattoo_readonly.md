# 2026-11-05: tattoo is readonly by default -- one question to rule on

`tattoo` and `tattooProp` now default to `writable: false, configurable: true`. All six calls in the core are respelled, with the same descriptors as before. None meant `Object.assign`.

* **Drop `writable`, and maybe `TattooOpts`?** Nothing in `src/` passes `writable: true`; only tests do. All six objects freeze or seal themselves in the constructor, so the two `{ configurable: false }` calls (`lease.ts`, `storable.ts`) only matter during construction. I'd drop the `writable` option, and probably `TattooOpts` with it, so `tattoo` is always readonly and configurable.
