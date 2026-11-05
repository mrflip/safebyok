# More style

Rules that earn a tag and a review finding, but not a line in STYLE.md: most code keeps them without being told. STYLE.md
*Comments and doc blocks* points here; the pairs are in `notes/gallant-docblocks.md`.

## Doc blocks

* **Option values get a list** `#option-values-get-a-list`, one value a line, the default marked (`create`, below). A
  term with a home (`sealed`, `stamp`) gets one `{@link}` or a pointer, never a second definition `#point-dont-redefine`.
* **A guard names the predicates it asks** `#guard-names-its-predicates`, linked: `throw unless {@link isEnabled}, unlocked,
  {@link isPresent}, {@link isFull}`.
* **A maintainer's note is a `//` comment** `#reason-goes-above`, on the line above the doc block or by the code it concerns: an
  invariant kept (`// every lock goes through here`) or a reason (`// The lock first: no box opens under a lease while the
  tombstone goes out.`). STYLE.md's `#purpose-not-path` already sends the reason there; this is the form it takes.
