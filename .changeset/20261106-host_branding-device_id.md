---
"safebyok": minor
---

**A `device_id` is a UUID**, such as `crypto.randomUUID()` makes, kept by the host for the device. `Bank.make` refuses any other `device_id` as 'bad_option', where it took a label. safebyok still mints none. **Stored format:** a wayin's `device_id` is checked as a UUID, so a stored wayin with an older, label-shaped id fails safe: its record reads as damaged. The `user_id` is unchanged.
