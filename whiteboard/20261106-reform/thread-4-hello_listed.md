# Thread 4: hello_listed (2026-11-06)

Branch `20261106-hello_listed`, PR pending, stacked on #513. Justify: see the PR's Tests line.

* **Built**: `boxListing.hello()` takes no argument (the base `Listing.hello`, no override). `BoxListing._takeListed(listed)` holds the boxes sparse and sets the damaged rows aside; `vault.hello` calls it after `boxListing.hello()`. The second `VX.boxesListed.parse` is gone: `vaultListing.fetchListed` parses the list once, where it is fetched.
* **Decisions taken**: the non-public path is a method named with a leading underbar, `_takeListed`, since a `#`-private method cannot be called by the vault. `no-underscore-dangle` is off in the lint config, so no disable. Not a `_cheat_` name (that is for test backdoors) and not a friend object (machinery for one call). Calling order is as before: `hello()` (watch started) then the listed boxes.
* **Tests**: the "refuses a boxListing.hello given a list that fails its check" test moved to `vault.hello`: a get answering `boxes: 'none'` refuses `damaged_row` and lists nothing, which tests `fetchListed`'s parse.
* **Deviations**: none. The method is still reachable from JS on the public class, only its name says not for hosts; TypeScript hosts see it in the type.
* **For the Coach**: `_takeListed` is the one new name; say if you want another.
