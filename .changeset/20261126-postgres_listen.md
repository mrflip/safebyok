---
"safebyok-postgres": minor
---

`makePostgresListen(client)` makes the `listen` a `PostgresVaultDB` hears other writes through, on a `pg` `Client` you
connect for it. Every watch shares that one connection: it LISTENs on a channel the first time a watch asks for it,
passes each notification to every watch on its channel, and UNLISTENs once the last of them stops. A failed UNLISTEN
reaches the stopped watch's `onBadNews`. It replaces the README's recipe, which never UNLISTENed.
