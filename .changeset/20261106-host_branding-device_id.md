---
"safebyok-big": minor
---

**A `device_id` is a UUID**, such as `crypto.randomUUID()` makes, kept by the host for the device. `Bank.make` refuses any other `device_id` as 'bad_option', where it took a label. safebyok still mints none. **Stored format:** a wayin's `device_id` is checked as a UUID, so a vault whose stored wayin carries an older, label-shaped id fails safe: the whole vault reads as stored damaged, its other wayin with it, and is left as it is. The `user_id` is unchanged.
