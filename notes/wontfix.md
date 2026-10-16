# Won't fix

Behaviour the package leaves undefined on purpose: cases a host can reach, whose outcome we do not
promise, test or design for, each with the ruling that put it here and what happens today. A
reviewer reads `notes/security.md` for what we decided; this file is for what we decided not to
decide. Add an entry at the end of the list, dated, with the ruling or the row it came from.

* 2026-10-16 (G129, the Coach: "make a file WONTFIX"): **one device, one setting.** Opening the
  same vault on one device with different settings -- a different `forcePassphraseReentryHours`,
  `maxWhisperBytes`, `maxLockboxes`, `validators` or `keyDeriver` -- is
  undefined behaviour, whether the handles are in one tab or in two. A device keeps one
  remembered unlock and one device mark per vault, shared by every handle on it, and each handle
  reads them by its own settings. Today, for the window: an open with a shorter window than the
  remembered unlock was written under forgets it (see `rememberedUnlock` in
  `packages/safebyok/src/vault.ts`), so a tab opened with the shorter window forgets what a tab
  with the longer one remembered, and every tab on the device asks for the passphrase again.
  That is the safe direction, and it is all we say of it. A host that varies a setting by route
  passes the same one everywhere a vault opens on a device.
