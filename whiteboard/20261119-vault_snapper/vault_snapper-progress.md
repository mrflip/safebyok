# vault_snapper: progress

What the threads have taught, newer than the plan wherever they disagree. Workers look things up here; the
orchestrator writes it.

## Where things stand (2026-11-19)

* origin/main is at #761 (`95f1a0425`); the minder's Part 1 (#753, #756 to #759, #765, #766) is merged.
* The Coach's last message before the sprint changed `vault-pieces.md` in several places; the plan's thread texts
  quote it. In particular: no `putBox` (only `putBoxOnce` and `delBoxOnce`); the Bank keeps writing its own record and
  the main gate itself (thread 4 tests that the minder still hears of them first); drafts are out (box instances, the
  next sprint); gatings only on a born bank; verbs stay where they are.
* es-toolkit (a dependency already) has `deepFreeze` and `isEqual`.

## Thread 1, car_agerank (#769) (*Orchestrator:*)

* `ThingCar.agerank` is a stored field made in `carOf`; compare two cars with `<`; on a tie they carry the same
  revisions and liveness, so keep the prior. A bare car's last field is `'----------'`. A sparse and a whole tombstone
  of one Thing share an agerank. `Revseq.padded` is exported beside `Lifeseq`.
* The liveness `behind` is `bhnd` everywhere, VOCABULARY.md included.
* Records are deep-frozen in place as they land (the vaultDB's own answer objects).
* `#minding` holds a symbol per hello-to-goodbye stretch; a get resuming in another stretch refuses `disabled`.
  `list` and `tryWrite` lack the check; thread 2 adds it.

## The sprint doc (*Orchestrator:*)

* https://claude.ai/artifact/HHcmx1GE3oZyh6rQMWjgv3 — doc `83e42a7e-4892-49d9-b45e-585ca636e9a0`; State enum `b9b89cb1-c517`.
* Tabs (tab id / body id): Open Matters `1a05d4a3-494c` / `cb45b78b-f909` (matters table `m6pymgdn7tc.85`, bookmark rev 4);
  Cleanup `6077489e-8954` / `14b54849-af59`; Progress `51ab4975-ceed` / `26336557-6583`; Resolved `a912f3b9-5db8` / `c14689aa-a452`.
