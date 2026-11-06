# Sizes: records, notices, banks and the limits they meet

How many bytes each stored record, notice and bank takes, against the limits of the transports and stores in our
horizon, to judge where data volume is an issue.

**Lead.** Even the simplest notice fits, easily. The Postgres adapter's notice for a box write (box row, vault row as
`world`, scope) is 1.6 KB for a mini box and 2.1 to 2.5 KB for a medium one, against pg_notify's 8,000 bytes (the
adapter caps it at 7,999). It stops fitting once the box row passes about 6.6 KB, whisper and sidecar together. An
RSA-2048 keypair with a 1 KB sidecar fits (6.2 KB). An RSA-4096 keypair with one does not (8.4 KB), nor does an mTLS
identity with a 4 KB sidecar (19.4 KB). Past that size the adapter sends a header of about 300 bytes, and each listener
calls `getBox`: slower, not broken. No call against a default-limit bank exceeds a Convex transaction, as
safebyok-convex holds a vault to 7.3 MB. But no limit on vaults per bank exists, so `listVaults` fails at 8,192 vaults.
A typical bank is 8 kB, a 75%-limit bank 19 to 44 GB: volume is an issue only at the limits, so ratchet them down.

**Measured** is one throwaway run on 2026-11-06: Node 24, the core's `src/` at `byok-closerlook-pg`
(fb6d281d3), and safebyok-convex at `byok-closerlook-cvx` (bdfe5aa9b). Each record was sealed with real WebCrypto
through the core's own `wrapKeyUnder`, `cipherBytes` and `stableJsonify`, and each passed `SX.vaultRecord` or
`SX.boxRecord`. **Computed** is arithmetic on measured figures. **Documented** is from an official page, fetched
2026-11-06 (*Sources*). **Estimate** is from memory, a vendor's forum, or a source file rather than docs.

## What a record is made of

| Part                                | Bytes in JSON                  | Source   | Note                                                                                        |
| ----------------------------------- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| A cipherIv, 12 bytes                | 16                             | Measured | base64url without padding, in every ciphered field                                          |
| A wrapped 256-bit key               | 64                             | Measured | AES-GCM `wrapKey`, raw: 32 bytes and a 16-byte tag. Box keys and vault keys alike           |
| A wrapped 512-bit key               | 107                            | Measured | The same, wrapping a 64-byte key                                                            |
| A whisper of W bytes of JSON        | ceil((W + 16) × 4 / 3)         | Measured | AES-GCM with a 16-byte tag, then base64url: about 1.33 × W                                  |
| passphraseSalt, `salt_bytes` 16     | 22                             | Measured | `Argon2idWebV1.salt_bytes`; the spec allows 8 to 65,536                                     |
| prfSalt                             | 43                             | Measured | `PasskeySaltBytes` 32, fixed by the check                                                   |
| `credential_id`                     | 22 to 86 (43 used)             | Estimate | A platform passkey is 16 to 32 bytes, a security key 64 or more. WebAuthn allows 1,023     |
| A token or revisionTok              | 36                             | Measured | `crypto.randomUUID()`; the checks ask only for one character                               |
| A label / a user_id                 | 2 to 40 / 1 to 100             | Measured | `MaxLabelChars`, `MaxUserIdChars`                                                           |

Every field is ASCII, except a host's sidecar, which may not be.

## Vault rows

| Vault row                                                                    | JSON  | Convex doc | Source   |
| ---------------------------------------------------------------------------- | ----- | ---------- | -------- |
| Now: a passphrase wayin, typical labels                                      | 669   | 674        | Measured |
| Now: a passphrase and a passkey wayin, typical labels                        | 1,029 | 1,011      | Measured |
| Now: both wayins, every label and the `device_id` at its maximum, a 64-byte credential | 1,237 | 1,219 (1,441 with its columns) | Measured |
| Larger: both wayins, 512-bit wrapped keys, a 32-byte salt, two more passphrase wayins, typical labels | 1,944 | 1,868 | Measured |
| Larger, at maximum labels                                                    | 2,180 | 2,104      | Measured |
| A vault tombstone                                                            | 286   | 323        | Measured |

Typical labels are `acme_chat`, `auth0|` plus 24 hex characters, `main`, and a 26-character `device_id`.

* **Reading "a slightly larger key".** The vaultKey and boxKey are already AES-256, the largest key AES has. So the
  row grows in two ways. Each wrapped key is 512 bits, as an AES-256-SIV or HMAC-SHA-512 key would be: +43 bytes per
  wayin. The passphraseSalt is 32 bytes, +21 bytes. Both are overkill: RFC 9106 recommends a 16-byte Argon2 salt.
* **Reading "two more wayins the size of a passphrase".** The gate check allows exactly one passphrase wayin and at
  most one passkey wayin. So two more passphrase wayins were added after the check passed, as extra gate fields.

## Box rows

The whisper of mini and medium is `{"anthropic":"sk-ant-api03-…"}`, holding a 108-character key in the shape of an
Anthropic API key. Its JSON is 124 bytes. **The sidecar sizes are the Coach's chosen estimates**: 2, 150, 1,000,
1,000 and 4,000 bytes of JSON. Each is a plausible host bag (`account_id`, `calls`, `tokens`, `model`, at 1,000 and
up a `limits` string) padded through a `notes` string to exactly that length, all ASCII.

| Box     | Whisper                                         | Whisper JSON | Sidecar JSON | Core's measure | JSON length | Convex weighs | Source   |
| ------- | ----------------------------------------------- | ------------ | ------------ | -------------- | ----------- | ------------- | -------- |
| mini    | the API key                                     | 124          | 2            | 781            | 781         | 901           | Measured |
| medium  | the API key                                     | 124          | 150          | 1,087          | 1,087       | 1,355         | Measured |
| large   | RSA-2048 public and private PEM, a field each   | 2,226        | 1,000        | 4,740          | 4,740       | 5,005         | Measured |
| large-4096 | the same, RSA-4096                           | 4,168        | 1,000        | 7,329          | 7,329       | 7,594         | Measured |
| xl      | an mTLS identity: RSA-4096 leaf key, leaf and issuing certs, root cert | 9,921 | 4,000 | 18,000 | 18,000 | 18,265        | Measured |
| any     | its tombstone                                   | n/a          | n/a          | 366 to 524     | same        | n/a           | Measured |

* **The core's measure** is what `box_too_large` judges against `maxRecordBytes`, in `vault-db-new.ts` `jsonBytes`:
  `new TextEncoder().encode(JSON.stringify(boxRecord)).length`. It equals the JSON length whenever the sidecar is
  ASCII. **Convex weighs** is safebyok-convex's `weigh`, Convex's `getDocumentSize` of the stored document with its
  label columns. That is what counts toward `MaxVaultBoxBytes`.
* **Reading "minimum validatable size".** The labels and user_id are at their minimum: 2 characters, and 1 for the
  user_id. The tokens, times and ciphered fields are as the core mints them (UUIDs, 13-digit times, real ciphertext),
  since their checks accept one character but no box ever holds that. Medium, large and xl have their labels at
  75% of maximum (30) and the user_id at 75 characters. Beside the sidecar, the labels and the user_id are the only
  fields that vary.
* **Rule of thumb:** a box is about 600 bytes of fixed fields at minimum labels, or 750 at 75% labels, plus its
  sidecar's JSON, plus 1.33 × its whisper's JSON.

## The Postgres notice for a box write

`safebyok-postgres` sends `{applabel, user_id, vaultlabel, vault_tok, boxlabel, heard: {vault, box}}` through
`pg_notify`. If that JSON is over `NoticeMaxBytes` (7,999), it sends the same header without `heard`, and each
listener fetches the box afresh with `doGetBox` (`toldTextOf`, `#heardOrNull`).

| Box        | Notice, passphrase vault | Notice, passphrase and passkey vault | Notice, larger vault | Header alone | Source   |
| ---------- | ------------------------ | ------------------------------------ | -------------------- | ------------ | -------- |
| mini       | 1,554                    | 1,914                                | 2,829                | 116          | Measured |
| medium     | 2,148                    | 2,508                                | 3,423                | 274          | Measured |
| large      | 5,801                    | 6,161                                | 7,076                | 274          | Measured |
| large-4096 | **8,390: header**        | **8,750: header**                    | **9,665: header**    | 274          | Measured |
| xl         | **19,061: header**       | **19,421: header**                   | **20,336: header**   | 274          | Measured |

| Where the notice stops carrying its rows       | Largest whisper JSON, with that sidecar | Its box row | Source   |
| ---------------------------------------------- | -------------------- | ----------- | -------- |
| mini fields and sidecar, passphrase vault      | 4,958                | 7,226       | Measured |
| medium fields and sidecar, passphrase vault    | 4,512                | 6,938       | Measured |
| medium fields and sidecar, passphrase and passkey vault | 4,242       | 6,578       | Measured |
| medium fields and sidecar, larger vault        | 3,556                | 5,663       | Measured |

The edge is a box size: each byte of sidecar takes the room of about 0.75 bytes of whisper JSON.

A vault write's notice carries only the vault row, 0.7 to 2.2 KB, so it always fits. A vault deletion sends one notice
per box, each about 1 KB, in one transaction. A vault of 8,000 boxes would queue about 8 MB of notices, against the
8 GB queue.

## How many fit in one notification, 10% to spare

Every box is in one vault, under distinct boxlabels of one length. *Full* is `{ boxes: [<box rows>] }`. *Hint* is
`[applabel, user_id, vaultlabel, vault_tok, [[boxlabel, fmt, revision_tok, revision_seq, written_at, am, box_tok], …]]`.
*Kept* is the same tuple with `registered_at`, `whisper_codec`, `whisper_schema_version`, the sidecar, and
`box_key_wrapped` and `whisper_ciphered` each as `[iv, ciphertext]`.

| Box        | pg_notify 7,200 B: full / hint / kept | 128 KiB (API Gateway WebSocket): full / hint / kept | Bytes per box: full / hint / kept | Source   |
| ---------- | ------------------------------------- | --------------------------------------------------- | --------------------------------- | -------- |
| mini       | 9 / 64 / 16                           | 150 / 1,071 / 269                                   | 782 / 110 / 438                   | Measured |
| medium     | 6 / 50 / 11                           | 108 / 853 / 191                                     | 1,088 / 138 / 614                 | Measured |
| large      | 1 / 50 / 1                            | 24 / 853 / 27                                       | 4,741 / 138 / 4,267               | Measured |
| large-4096 | 0 / 50 / 1                            | 16 / 853 / 17                                       | 7,330 / 138 / 6,856               | Measured |
| xl         | 0 / 50 / 0                            | 6 / 853 / 6                                         | 18,001 / 138 / 17,527             | Measured |

* **Reading "without sidecar or any whisper fields".** The whisper fields are `whisper_codec`,
  `whisper_schema_version`, `whisper_ciphered` and `box_key_wrapped`: a boxKey is there only to open its whisper. So
  *hint* says only that a box changed. Its size depends only on the length of the boxlabel, which is why large and
  xl match medium.
* The tuple saves the repeated field names and labels: about 45% of a medium box, falling to 3% for xl, where the ciphertext dominates.

| `{ device_id: <SHA-256 hex>, vaults: [<vault rows>] }`                | pg_notify 7,200 B | 128 KiB | Bytes per vault | Source   |
| --------------------------------------------------------------------- | ----------------- | ------- | --------------- | -------- |
| Now, a passphrase wayin                                               | 10                | 175     | 670             | Measured |
| Now, a passphrase and a passkey wayin                                 | 6                 | 114     | 1,030           | Measured |
| Now, both wayins, labels at 75%                                       | 6                 | 105     | 1,122           | Measured |
| Larger                                                                | 3                 | 60      | 1,945           | Measured |

## Bank sizes

No limit on vaults per bank exists. The core sets no limit on boxes or record bytes: `maxRecordBytes` and the
`maxBoxes` of the memory and Postgres stores default to `Infinity`. Two sets of defaults exist elsewhere, and each
gets a family of rows below.

* *Convex*: what safebyok-convex enforces. Each box is at most 1,048,576 bytes, a vault holds at most 8,000 boxes,
  and its box rows weigh at most 7,339,008 bytes (`MaxVaultBoxBytes`, half the 16 MiB read, less a document and the
  tally).
* *Old*: the old design's `Bank.make` defaults, in packages/safebyok-old. A vault holds at most 100 boxes
  (`MaxBoxes`), and a whisper and its sidecar together at most 40,444 bytes of JSON (`MaxWhisperBytes`).

Both families take 8,192 as the 100% figure for vaults per bank. That is Convex's limit on the elements of any array,
which `listVaults`' return meets. Each vault row is the maximum-label row, 1,441 bytes as Convex weighs it. Each
dimension is set to the given percentage independently. *Clipped* holds each vault to `MaxVaultBoxBytes`, as
safebyok-convex does.

| Family, % of each limit | Vaults | Boxes per vault | Box (Convex) | Naive bank | Boxes after the clip | Per vault | Bank      | Source   |
| ----------------------- | ------ | --------------- | ------------ | ---------- | -------------------- | --------- | --------- | -------- |
| Convex, 10%             | 819    | 800             | 105,124      | 68.9 GB    | 69                   | 7.3 MB    | 5.9 GB    | Computed |
| Convex, 75%             | 6,144  | 6,000           | 786,700      | 29.0 TB    | 9                    | 7.1 MB    | 43.5 GB   | Computed |
| Convex, 100%            | 8,192  | 8,000           | 1,048,844    | 68.7 TB    | 6                    | 6.3 MB    | 51.6 GB   | Computed |
| Old, 10%                | 819    | 10              | 6,382        | 53.4 MB    | 10                   | 65.3 kB   | 53.4 MB   | Computed |
| Old, 75%                | 6,144  | 75              | 41,434       | 19.1 GB    | 75                   | 3.1 MB    | 19.1 GB   | Computed |
| Old, 100%               | 8,192  | 100             | 54,915       | 45.0 GB    | 100                  | 5.5 MB    | 45.0 GB   | Computed |
| Typical user            | 1      | 5 medium        | 1,355        | 8.2 kB     | 5                    | 8.2 kB    | 8.2 kB    | Computed |
| Heavy user              | 3      | 20 of 4 KiB     | 4,364        | 266 kB     | 20                   | 88.7 kB   | 266 kB    | Computed |
| Ratchet A               | 8      | 32 of 8 KiB     | 8,460        | 2.2 MB     | 32                   | 272 kB    | 2.2 MB    | Computed |
| Ratchet B               | 16     | 64 of 16 KiB    | 16,652       | 17.1 MB    | 64                   | 1.1 MB    | 17.1 MB   | Computed |

* **One call against these banks.** A `listBoxes` reads at most 7.3 MB and returns at most 8,000 boxes, so it fits
  one Convex transaction (16 MiB, 8,192 elements). That is what `MaxVaultBoxBytes` and `MaxVaultBoxes` are for.
  A `listVaults` of 8,192 maximum-label vaults reads 11.8 MB, which fits. But **nothing stops a bank from growing
  past it**. At 8,193 vaults the returned array is over Convex's limit. At about 7,200 *larger* vault rows the read
  is over 16 MiB.
* **Where a default-limit box or vault meets a common limit.** A 1 MiB box is over:
  * a DynamoDB item (400 KB);
  * an AppSync subscription payload (240 KB);
  * an API Gateway WebSocket message (128 KB);
  * a Durable Object legacy value (128 KiB);
  * Express's default `express.json` body (100 kB), which caps a `putBox` sent through safebyok-graphql on Express.

  A full Convex-capped vault (7.3 MB) answered whole is over a Vercel Function response (4.5 MB) and a synchronous
  Lambda response (6 MB). The old default box (55 kB) is under every one of these.

## Limits in our horizon

| Limit                                              | Value                                     | Hard or soft                       | Source     |
| -------------------------------------------------- | ----------------------------------------- | ---------------------------------- | ---------- |
| Postgres `NOTIFY` payload                          | under 8,000 bytes                         | Hard: a compile-time `BLCKSZ` sum  | Documented |
| Postgres notification queue                        | 8 GB                                      | Soft: `max_notify_queue_pages`     | Documented |
| Postgres field (`jsonb` column)                    | 1 GB; `jsonb` offsets cap a container near 256 MiB | Hard                      | Documented; Estimate |
| Convex document                                    | 1 MiB; 1,024 fields; nesting 16           | Hard                               | Documented |
| Convex array, any value                            | 8,192 elements                            | Hard                               | Documented |
| Convex query or mutation                           | 16 MiB read; 32,000 documents scanned; 4,096 index ranges; 16 MiB and 16,000 documents written; 1 s of user code | Hard | Documented |
| Convex arguments or return value                   | 16 MiB (5 MiB arguments for a Node action) | Hard                              | Documented |
| DynamoDB item                                      | 400 KB; reads in 4 KB units, writes in 1 KB units; a query page is 1 MB | Hard | Documented |
| Firestore document                                 | 1 MiB (1,048,576 B)                        | Hard                              | Documented |
| Cloudflare D1 row or value                         | 2,000,000 B; a SQL statement 100,000 B      | Hard                              | Documented |
| Cloudflare Workers KV value                        | 25 MiB; a key 512 B                         | Hard                              | Documented |
| Cloudflare Durable Object value                    | 2 MB (SQLite backend); 128 KiB (legacy KV backend) | Hard                        | Documented |
| Supabase Realtime broadcast                        | 256 KB Free; 3,000 KB paid                  | Per plan                          | Documented |
| Supabase Realtime Postgres Changes                 | 1,024 KB; it reads the WAL, not pg_notify   | Hard                              | Documented |
| AWS AppSync subscription payload                   | 240 KB                                      | Hard                              | Documented |
| AWS API Gateway WebSocket                          | 32 KB a frame, 128 KB a message             | Hard                              | Documented |
| AWS API Gateway REST / Lambda synchronous          | 10 MB / 6 MB each way                       | Hard                              | Documented |
| Vercel Function body                               | 4.5 MB each way                             | Hard                              | Documented |
| Express `express.json` / Fastify `bodyLimit`       | 100 kb / 1 MiB                              | Soft: defaults                    | Documented |
| GraphQL Yoga / Apollo standalone body              | 25 MB / 50 MB                               | Soft / hard                       | Documented |
| Node `ws` `maxPayload` / Cloudflare WebSocket message | 100 MiB / 32 MiB                          | Soft / hard                       | Documented |
| Browser WebSocket, BroadcastChannel                | none published; memory and IPC, about 128 MiB or more | n/a                   | Estimate   |
| localStorage                                       | 5 MiB per origin (Chromium counts UTF-16 units) | Hard                         | Documented |
| IndexedDB                                          | up to 60% of disk (Chromium, Safari 17+); 10% or 10 GiB (Firefox, best-effort) | Soft | Documented |

## Reference payloads

| Payload                                               | Bytes      | gzip    | Source     |
| ----------------------------------------------------- | ---------- | ------- | ---------- |
| An Anthropic API key, as used here                    | 108        | n/a     | Estimate   |
| Ed25519 SSH key, public / private (OpenSSH)           | 93 / 399   | n/a     | Measured   |
| EC P-256 key, public / private (PEM)                  | 178 / 241  | n/a     | Measured   |
| RSA-2048 key, public / private (PEM, PKCS#8)          | 451 / 1,704 | n/a    | Measured   |
| RSA-2048 key, private (OpenSSH)                       | 1,823      | n/a     | Measured   |
| RSA-4096 key, public / private (PEM, PKCS#8)          | 800 / 3,268 | n/a    | Measured   |
| RSA-4096 key, private (OpenSSH)                       | 3,381      | n/a     | Measured   |
| PGP public key, Ed25519 with a Cv25519 subkey (armored) | 636      | n/a     | Measured   |
| PGP public key, RSA-4096 with an RSA-4096 subkey (armored) | 3,126 | n/a     | Measured   |
| PGP secret key, RSA-4096 with its subkey (armored, unprotected) | 6,622 | n/a | Measured   |
| TLS leaf certificate, www.google.com / github.com (ECDSA) | 1,269 / 1,432 | n/a | Measured |
| TLS chain as served, www.google.com / github.com      | 3,503 / 3,857 | n/a  | Measured   |
| RSA-4096 certificate: leaf / issuing / root (generated) | 2,358 / 2,130 / 1,944 | n/a | Measured |
| 640×640 PNG: smooth gradient / plasma blurred (photo-like) / plasma / noise | 5,743 / 1,691,968 / 1,925,603 / 2,462,381 | n/a | Measured |
| 640×640 JPEG, the plasma at quality 85                | 46,368     | n/a     | Measured   |
| 640×640 PNG of a real photograph                      | 400 k to 900 k | n/a | Estimate   |
| Wikipedia, "Alan Turing": wikitext / REST HTML / parse JSON | 175,898 / 1,152,428 / 803,257 | 58,997 / 184,946 / 152,889 | Measured |
| `packages/` as text: 441 tracked files / without safebyok-old / the core's `src/` | 6,360,673 / 3,521,738 / 407,792 | n/a | Measured |
| `packages/` as tar.gz / without safebyok-old           | 1,632,844 / 944,611 | n/a | Measured   |

A binary blob in a whisper is base64 inside JSON and then base64 again as ciphertext, so its box is about 1.78 times
the blob. The photo-like PNG (1.7 MB) would be a box of about 3 MB. That is over a Convex document, and so over
safebyok-convex's `maxRecordBytes`.

## Convex cost to poll, per 1,000 devices a month

A poll is one `listVaults` and one `listBoxes` per vault, so it makes 1 + V function calls and reads the whole bank.
The rates are the Professional plan's overage prices: $2 per million calls and $0.20 per GB of database I/O, with
730 hours in a month. Gross ignores Pro's included 25M calls and 50 GB; Net subtracts them.

| Bank                               | Poll every | Calls a month | Database I/O a month | Gross / Net USD a month | Source   |
| ---------------------------------- | ---------- | ------------- | -------------------- | ----------------------- | -------- |
| Convex, 75%                        | 1 h        | 4.49 billion  | 31.8 PB              | $6.36M / $6.36M         | Computed |
| Convex, 10%                        | 4 h        | 150 million   | 1.08 PB              | $217k / $217k           | Computed |
| Old, 75%                           | 1 h        | 4.49 billion  | 13.9 PB              | $2.80M / $2.80M         | Computed |
| Old, 10%                           | 4 h        | 150 million   | 9.8 TB               | $2,250 / $2,190         | Computed |
| Typical user                       | 1 h / 4 h  | 1.46M / 365k  | 6.0 GB / 1.5 GB      | $4 / $0; $1 / $0        | Computed |
| Heavy user                         | 1 h / 4 h  | 2.9M / 730k   | 194 GB / 49 GB       | $45 / $29; $11 / $0     | Computed |
| Ratchet A, 8 × 32 × 8 KiB          | 1 h / 4 h  | 6.6M / 1.6M   | 1.6 TB / 398 GB      | $331 / $308; $83 / $69  | Computed |
| Ratchet B, 16 × 64 × 16 KiB        | 1 h / 4 h  | 12.4M / 3.1M  | 12.5 TB / 3.1 TB     | $2,518 / $2,483; $629 / $613 | Computed |

* **Assumptions.** Each device polls a bank of its own, and every poll reads every byte. Storage is negligible: 1,000
  typical banks are 8 MB.
* **The I/O is an upper bound; the calls are not.** Convex charges no database bandwidth for a cached query result
  (Documented), and a poll of an unchanged bank mostly hits that cache. A cached result still counts as a function
  call (Estimate, from Convex staff on its forum). So for a quiet bank, the call count (1 + V per poll) is the cost.
  One `getBank` query in place of N + 1 would cut it to one call per poll.
* Convex rounds each document up to 1 KB for bandwidth and storage (Estimate, from its forum). That adds about 30%
  to a mini box, and nothing to the large rows that dominate the at-limit banks.

## Ratcheting

* **Notice whole, box limit of about 6 KiB.** A box row of 6,144 bytes keeps every box notice whole under today's
  vault rows. The larger vault needs 5.5 KiB. Either holds an RSA-2048 keypair with its 1 KB sidecar (a 4.7 KB box),
  or an RSA-4096 PGP public key with a 150-byte sidecar (about 5.2 KB). Neither holds an RSA-4096 keypair with a 1 KB
  sidecar (7.3 KB), or an mTLS identity.
* **Notice degraded, box limit of 16 to 20 KiB.** 16 KiB holds every box here but xl, which is 18.0 KB with its 4 KB
  sidecar. 20 KiB holds xl too. Boxes over about 6.6 KB get the header and a `getBox` per listener.
* **Vaults per bank.** Today none is set, and Convex's 8,192 is the de facto limit, set by a failure. Any cap from 8
  to 64 keeps `listVaults` far inside one transaction.
* **Boxes per vault.** At 32 or 64, a full vault answered whole stays at 1.1 MB or less, under every response limit in
  the table.

## How far to trust these

* **One run.** Each figure comes from one run with random keys, IVs and UUIDs. The ciphertext length is
  deterministic, so only a different label or sidecar would move it, and by its own length.
* **Convex's measure.** It is Convex 1.48's `getDocumentSize`, as safebyok-convex's `weigh` calls it. How Convex meters
  billed I/O is not published, so the cost table assumes billed bytes equal document bytes.
* **The notice.** It was rebuilt from `toldTextOf` and `boxToldOf`, not captured from a live Postgres. The vault row
  in a real notice has come back through `jsonb`, which reorders keys but keeps the compact length.
* **The vault defaults.** No adapter or core option names a limit on vaults per bank. Convex's array limit stands in
  for one, so the 10%, 75% and 100% vault counts are this report's reading, not a setting.
* **Prices and limits.** They were fetched on 2026-11-06 and change without notice. The Supabase, AppSync and Yoga
  figures come from docs pages or published typings, not from a test.
* **The PNGs.** Generated images bracket the range: a gradient compresses to almost nothing, and fractal noise
  barely compresses. A real photograph's size is an estimate.

## Sources

* Postgres NOTIFY: https://www.postgresql.org/docs/current/sql-notify.html. Its queue:
  https://www.postgresql.org/docs/current/runtime-config-resource.html. Field limits:
  https://www.postgresql.org/docs/current/limits.html. The source of `NOTIFY_PAYLOAD_MAX_LENGTH`:
  https://raw.githubusercontent.com/postgres/postgres/master/src/backend/commands/async.c
* Convex limits: https://docs.convex.dev/production/state/limits. Pricing: https://www.convex.dev/pricing. Cached
  reads: https://docs.convex.dev/realtime. Calls and rounding (forum):
  https://discord-questions.convex.dev/m/1357041598965485659 and https://discord-questions.convex.dev/m/1134162924592705537
* DynamoDB: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html. Firestore:
  https://firebase.google.com/docs/firestore/quotas
* Cloudflare: https://developers.cloudflare.com/d1/platform/limits/, https://developers.cloudflare.com/kv/platform/limits/,
  https://developers.cloudflare.com/durable-objects/platform/limits/
* Supabase Realtime: https://supabase.com/docs/guides/realtime/limits and
  https://supabase.com/docs/guides/realtime/architecture
* AWS: https://docs.aws.amazon.com/general/latest/gr/appsync.html,
  https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html,
  https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html,
  https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html. Vercel:
  https://vercel.com/docs/functions/limitations
* HTTP servers: https://expressjs.com/en/5x/api/express/, https://fastify.dev/docs/latest/Reference/Server/,
  https://www.apollographql.com/docs/apollo-server/api/standalone,
  https://unpkg.com/graphql-yoga@6.0.1/typings/server.d.ts, https://github.com/websockets/ws/blob/master/doc/ws.md
* Browser storage: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
* Wikipedia: https://en.wikipedia.org/w/index.php?title=Alan_Turing&action=raw,
  https://en.wikipedia.org/api/rest_v1/page/html/Alan_Turing,
  https://en.wikipedia.org/w/api.php?action=parse&page=Alan_Turing&format=json
* Scripts: throwaway, kept outside the repo in the measuring session's scratch directory: `make-payloads.sh` (keys,
  certs, PGP, PNGs), `sizes.test.ts` (records, notices, counts, sealed with the core's own helpers) and `bank.mjs`
  (banks and cost). Each figure above says what it measured, so a rerun can rebuild them.
