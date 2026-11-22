---
---

safebyok-react-lean, private: when a form that a `useDraft`'s inputs sit in is reset, as React resets a form once its action ends, the draft forgets only the fields typed into and masks the field shown; its sidecar edits stay, and so does its base while one is pending. A Save refused inside a form action, such as a dismissed unlock, used to drop the sidecar edits too. `discard()` still drops everything. Nothing published changes.
