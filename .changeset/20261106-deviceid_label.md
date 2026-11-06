---
"safebyok": minor
---

A `device_id` must now be a label, the rule an `applabel` and a `vaultlabel` follow: lowercase letters, digits and single underscores, starting with a letter and ending on a letter or digit, 2 to 40 characters. `Bank.make` refuses a host-given `device_id` that is not one ('bad_option'). A stored wayin or device record whose `device_id` was a UUID, or anything else that is not a label, now fails validation and reads as damaged or absent; before 1.0 there is no shim or migration. This is the strict default, to be loosened when a host complains.
