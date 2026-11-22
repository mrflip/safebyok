---
---

safebyok (the new core, private): `bulletproofHandlerOf` and `bulletproofAsyncHandlerOf` wrap a function a host handed us, once, so that what it throws goes through a transformer and is rethrown (`ifError: 'fail'`) or told to `onBadNews` (`'tell'`). They are for our own packages, and a host has nothing new to call. The minder's `listen`, and the key deriver's and strength checker's `load`, use them, and behave as before. safebyok-react-lean, private: `putBoxAction` wraps the host's `whisperOf` and `sidecarOf`, and a draft's `put` its `sidecarOf`, so that what they throw that is no `Error` arrives wrapped in one; a draft's `put` used to reject with it as thrown. Nothing published changes, and nothing stored.
