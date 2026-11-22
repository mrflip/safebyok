> The Coach's draft of `docs/where-data-lives.md`, uncommitted in the base checkout, copied 2026-11-22 for its intent. It names a deviceDB the new core does not have yet; the endings in it are out of bounds for this sprint (the plan, *Ground rules*).

# Where data lives, and when it is discarded

## Where user data lives

Places that hold user data we control:

* **IndexedDB**, through the deviceDB.
* **The backing datastore**, through the vaultDB.
* **The bank's lease and gate**, in memory.
* **The TSQ Cache** managed by the `Minder`
* **Our namespaced part of the host's React Query**: our queries, and our form mutations.

*Note*: by customer's policy, a userid is not sensitive data. The customer is advised to use their auth provider's opaque id, or to
use safebyok's `mash` to generate an opaque id from a personal identifier (email, social handle). If a host stores emails as userids, we honour the host's policy.

We trust IndexedDB, the TSQ and React Query to drop data when we tell them to. Two cautions:

* **A mounted `useQuery`** keeps showing its last record after `removeQueries`, until the
  components showing it unmount.
* **A vaultDB adapter whose transport keeps its own client cache** (an Apollo or Convex client can)
  is one more place, and `vaultDB.vacate` would need to clear it (in TODO).

The host owns everything else, and our discards never reach it:

* **React's own tree:** drafts, the values in `WhisperInput`'s DOM, `useActionState` state. Only
  unmounting drops these.
* **A React Query persister or broadcast plugin.** `persistQueryClient` would write our records and
  sidecars to the host's storage. We export a predicate for the host's `shouldDehydrateQuery` to
  keep them out.
* **Another tab**, which has its own vault and lease in memory.
* **The host's own state**, such as a result it kept from a `withWhisper` callback.

## Data retention lifecycle

Once a device is given a userid and started, it does the best job it can with the data it has
until it is signalled to end.

1. **A running device ends only on a signal.** The signals are an explicit end, a different
   userid, and the provider's unmount. An absent userid is not a signal.
2. **While it runs, it serves what it has.** A refused or failed vaultDB call is reported, and ends
   nothing. Losing the host's session works like going offline.
3. **It does not keep knocking.** When the backend refuses because the session is gone, the device
   neither retries on its own nor reopens the watch in a loop. The stage shows that the watch is
   down (`isWatching` false), and the host decides what to do.
4. **It extends nothing.** The lease expires on its own clock, and autolock still locks.
5. **It lets go at once when signalled.** The teardown is synchronous and complete.
6. **It never outlives its provider.**

Only the host can tell a brief lapse in its session from a sign-out. Ending a device is
consequential, so inferring an end from an absent value is the wrong default. Between sessions,
the vault is protected by the lease and its autolock, not by the host's session.

This costs something: a host that forgets its one `signOut()` line leaves keys in memory until
autolock or until the tab closes. The docs and the kit's sign-out button carry that line.

## What the provider's `userid` does

A userid starts a device, and only a signal ends one.

| What happens | Effect |
|---|---|
| `userid` becomes a string, and nothing is running | start |
| `userid` goes null or undefined | nothing |
| `userid` becomes a different user | a signal: the first user's device ends, then the second user's starts |
| the provider unmounts, or `pagehide` fires | a signal: sweep; nothing stored changes |
| `signOut()`, `vacate()`, the delete gating, or the userid-only discard | the host's policy decides what is dropped |

The `[userid]` effect has no cleanup, and calling start twice is safe. A React reviewer will read
the missing cleanup as a bug, so the code carries a comment explaining it. The unmount still cleans
up.

## What each end discards

The four ends share one teardown, and each discards something different:

| End         | Discards                                                                |
| ----------- | ----------------------------------------------------------------------- |
| sweep       | nothing                                                                 |
| `signOut()` | Chosen by customer: boxes, gate, lease, userids seen                    |
| `vacate()`  | everything of the user's on this device, as if they had never logged in |
| delete      | everything, everywhere (devices delete as they come on line)            |

`vacate()` covers:

* **the deviceDB's rows:** the device row, the cached lease, gate, wayins and boxes, and the
  saved userid;
* **in memory:** the bank's lease and gate, and the TSQ;
* **our part of the host's React Query:** our queries and our form mutations, evicted;
* **the vaultDB:** our watch handlers, and the adapter's own client cache once that TODO lands.

It does not touch the backing datastore; only delete does.

The host can also discard a user's data with only a userid and no session. This is a function at
module scope, callable before any provider mounts, and it covers a session that expired while the
lease was still stored.

The in-memory part of an end is synchronous, but the IndexedDB deletes are not. A sign-out handler
should `await device.vacate()` before it redirects to the auth provider's logout page.

Nothing resumes an ended instance: there is no restart.
