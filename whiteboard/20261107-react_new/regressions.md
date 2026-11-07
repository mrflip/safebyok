# react_new: regressions and concerns, accepted for now

Each is real. None is fixed in this sprint; each says what a host sees.

## One holder's `unexpose` hides the whisper from every holder

The listing hands out one Box per boxlabel, which is what makes "bob" one box across the page. But
`expose` keeps no count of who wants it, and `BoxFields` counts only its own fields. So a form that
unexposes on unmount (`useEffect(() => () => box.unexpose(), [box])`) blanks `DevBoxInspector`
and every `BoxWhisperField` on the same box. StrictMode's rehearsal unmount does the same to a box
something else exposed before the form mounted.

A host sees: a whisper shown in one place goes blank when an unrelated component on the page
unmounts. The Coach (2026-11-07): keep it for now; the answer is likely a different approach, not
a counter.

## `BoxListing.list()` changes `damaged_rows` without telling subscribers

`list()` replaces `#damagedRows`, but the listing's listeners only hear a change of a present box's
snapshot. A list that only adds or clears a damaged row tells nobody.

A host sees: a `useBoxes` that also shows damaged rows stays stale until some present box changes.

## `sideEffects: false` would drop a bare entry import

Every package is marked `sideEffects: false`, so an `import 'pkg/entry'` used only as a switch is
tree-shaken. The Dev*Inspector panels are gated by being exported only from `safebyok-react/devmode`,
which a host must import by name, so nothing relies on a bare import. Any future "import this to
turn it on" needs a real export, or a `sideEffects` exception for that file.

## No start-over for a forgotten passphrase

The old dialog took `allowStartOver`, meant to let a user who forgot the passphrase begin a new
vault. The new gating has no start-over, so thread 2 dropped the prop, and threads 3 and 11 did not
bring it back. *Orchestrator:* the Coach took the Rec (2026-11-07): decide later whether it returns,
likely as delete-and-rebuild behind a warning.

A host sees: a user who forgot the passphrase, with no passkey, deletes the vault (Delete account)
and starts again.
