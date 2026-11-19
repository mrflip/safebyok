---
"safebyok-postgres": patch
---

safebyok-postgres refuses with `storage_unavailable` only a failed statement a retry may mend: a lost or refused connection, a serialization failure or deadlock, a server short of resources or shutting down, a lock not granted in time (SQLSTATE classes 08, 40, 53, 57 and 55P03, Node's connection error codes, and pg's lost-connection errors). Every other failed statement, a constraint or data error, a raised exception, or a user_id whose channel name is too long among them, is now refused with `unexpected_error`. A write function that stores nothing where the classifier finds a write, which means the SQL functions installed are from another version, is refused with `unexpected_error` too, in the vaultDB where it was `storage_issue`. A watch whose notice cannot be fetched for a reason a retry would not mend now ends, and hands that refusal to its `onBadNews`; one a retry may mend still drops the notice.
