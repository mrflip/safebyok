---
---

Empty: the new `safebyok` is private, and nothing published reaches what changed. `BaseBox.tombstoneOf` now takes `sidecar: {}` in its public props, a tombstone's own sidecar, where it refused any sidecar before (`A tombstone's sidecar is always {}: give { am: 'x' } with no sidecar.`); any other sidecar still refuses as `bad_record`, now with the phrase the stored box's check uses, `A box tombstone's sidecar is always {}.` A lease's `seal(BaseBox, live, { am: 'x', sidecar: {} })` writes the tombstone too. The thrower `tombstoneSidecarGiven` and the phrase `TombstoneSidecarGiven` are gone. Nothing stored changes.
