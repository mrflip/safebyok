# Thread 6: lease_duck (2026-11-22)

Branch `20261122-lease_duck`, PR [#842](https://github.com/mrflip/safebyok/pull/842), stacked on [#830](https://github.com/mrflip/safebyok/pull/830). Proved: `pnpm justify` green after the catch-up (14 test runs, 7322 tests; safebyok 29 files, 1403 tests).

The Coach (2026-11-22): "can you give lease and wayin getters wherever they don't have it as a direct property -- label (return the gate label) labelpath (`label/${this.label}`), scope, am='a', modelkind -- anything else to make them reasonably duck-typed".

* **Built** (getters alone, in each class's `[Props]` section and banner; no stored field, check, `stamp`, `toJSON` or `pickle` changes):
  * **`Lease`** (`src/models/lease.ts`): `label`, its gate's label, `Labelpath.labelOf(gate_labelpath)` (`gate` for the main gate, `passkeys` for `gate/passkeys`); `labelpath`, `` `lease/${label}` ``; `scope`, `{ userid, banklabel, labelpath }` typed `ThingScope`; `am`, always `'a'`; `written_at`, its `proved_at`.
  * **`Wayin`** (`src/models/wayin.ts`): `labelpath`, `` `wayin/${label}` `` (`wayin/main`, `wayin/passkey0`); `am`, always `'a'`; `written_at`, its `born_at`.
  * `modelkind` was already a getter on both.
  * **Tests**: `tests/models/lease.test.ts`, "a lease's Thing-like getters": each value for a gate labelpath of `gate` and `gate/passkeys`; that a Thing scope check refuses `lease.scope`; that keys, `stamp`, `toJSON` and JSON show the stamp fields alone. `tests/models/wayin.test.ts`, "a wayin's Thing-like getters": each value for both kinds; keys, `pickle` and `toJSON` unchanged.
* **Decisions made**:
  * **`label/${this.label}` read as a typo** for `lease/${this.label}`, the way a gate's labelpath starts `gate`; the wayin's is `wayin/…` on the same reading.
  * **`scope` is built by hand, not parsed.** `ThingChecks.thingScope` checks a labelpath starts with a Thingkind (`bank`, `gate`, `box`), so `lease/…` fails it: parsing `this`, as `Gate.scope` does, would throw on every call. Each labelpath getter's doc says a Thing scope check refuses it, and a test pins that.
  * **`written_at`**: a lease's is its `proved_at`, since each proof grants a new lease whole (a renewal keeps `born_at` only). A wayin's is its `born_at`: a wayin is minted fresh with `born_at` now (`mintPassphraseHeader`, `mintPasskeyHeader`), and its `born_at` is bound into its wrap's ctx, so it is replaced, never rewritten.
  * **Leaks**: the getters sit on the prototype, non-enumerable. `Helpers.tattoo` copies a record's own entries onto the instance, and `StampChecks.leaseStamp.parse(this)` reads only its shape's keys, so neither sees them; a strict check walks own keys. The tests prove it.
* **Weighed and left out**:
  * **`revtok`, `revseq`**: a lease's `gate_revtok` is its gate's revision, not the lease's; neither has revisions of its own.
  * **`lifeseq`, `lifepath`**: a lease's `gate_lifeseq` is the gate's life; neither has lives.
  * **`fmt` on a wayin**: a wayin carries none; it is stored inside its gate, under the gate's `fmt`.
  * **`label` on a lease as anything but the gate's**: as the Coach asked.
  * **`scope` on a wayin**: it has no `userid` or `banklabel` (it lives inside its gate's record); see *For the Coach*.
* **For the Coach**:
  * **Wayin `scope`**: not built. Options: (a) leave it out (today); (b) `Wayin.make(record, { bankScope })` takes its bank's scope, stored in a private field, and `scope` returns `{ ...bankScope, labelpath }`: every `Wayin.make` call must pass it: seven in `gate.ts` and `proving.ts`, and the wayin tests; (c) the gate hands it out, `gate.scopeOf(wayin)`, no change to `Wayin`. Recommend (a) until a caller wants it.
  * **These labelpaths fail a Thing scope check.** Options: (a) leave it (today), duck-typed only in shape; (b) teach `Labelpath`/`isLabelpath` the `lease` and `wayin` heads, which would let a vaultDB's Thing checks accept a labelpath no Thing can have. Recommend (a).
