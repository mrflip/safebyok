---
"safebyok": patch
---

A vault's box calls read as one method each, with no behaviour a host relies on changed. Two edges move: a getBox, getWhisper, putBox keeping its whisper, or delBox on a locked vault whose listing does not show the box now answers at once (null, 'absent_box' or 'no_whisper') while another kind of gating (a putWayin, delWayin or del) is pending, where it waited that gating out first; and when the Vault object goes gone while getBox, putBox or delBox waits on storage, the call refuses 'vault_gone' without the logger's 'moved on' line. **Stored format:** unchanged.
