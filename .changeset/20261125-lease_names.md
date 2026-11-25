---
---

A deviceDB keeps one devicetok per user, the same for every bank of theirs, and `ensureDevicetok` takes the userid alone: a host sees a fresh devicetok minted once per user, where one was kept for each bank. A lease names itself by its own labelpath, `lease/<label>`, from `LeaseLabelpath.of`, which replaces `leaseLabelpathOf` and `leaseScopeOf`. It ships nothing, since safebyok and safebyok-react-lean are private at 0.0.0.
