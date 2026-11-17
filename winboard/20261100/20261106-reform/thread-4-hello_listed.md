# Thread 4: hello_listed (2026-11-06)

Branch `20261106-hello_listed`, PR #523, stacked on #513. Justify green: safebyok 1834 tests, root 302, safebyok-old 3537; lint 0 errors.

* **Built**: `boxListing.hello()` takes no argument (the base `Listing.hello`, no override). `BoxListing._takeListed(listed)` holds the boxes sparse and sets the damaged rows aside; `vault.hello` calls it after `boxListing.hello()`. The second `VX.boxesListed.parse` is gone: `vaultListing.fetchListed` parses the list once, where it is fetched.
* **Decisions taken**: the non-public path is a method named with a leading underbar, `_takeListed`, since a `#`-private method cannot be called by the vault. `no-underscore-dangle` is off, but `unicorn/prefer-private-class-fields` flags the underbar name, so it carries one `eslint-disable-line`, as the `_cheat_` methods do. Not a `_cheat_` name (that is for test backdoors) and not a friend object (machinery for one call). Calling order is as before: `hello()` (watch started) then the listed boxes.
* **Tests**: the "refuses a boxListing.hello given a list that fails its check" test moved to `vault.hello`: a get answering `boxes: 'none'` refuses `damaged_row` and lists nothing, which tests `fetchListed`'s parse.
* **Deviations**: one `eslint-disable-line unicorn/prefer-private-class-fields` on `_takeListed`. Set aside: a `#`-private method (the vault cannot call it), a friend object like the vault's lease friend (machinery for one call), a name with no underbar such as `takeListedByVault` (nothing but its length says not for hosts), passing the list through the constructor's world (thread 6's ground).
* **Discoveries**: an earlier justify went red in tests/scripts (three 5s timeouts) while other threads' justifies ran; green on a quiet rerun.
* **Left open**: the method is still reachable from JS on the public class, only its name says not for hosts; TypeScript hosts see it in the type.
* **For the Coach**: `_takeListed` is the one new name; say if you want another.
