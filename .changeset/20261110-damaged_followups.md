---
"safebyok": minor
---

The refusal kind `damaged_box` is now `damaged_whisper`: a whisper that will not open under the vault's key, or opens to no whisper. A host that branches on `damaged_box` changes the name; nothing else about it changes.

A vault row carried back on a vaultDB's answer that fails its checks now refuses `record_conflict`, not `damaged_row`: `damaged_row` is the vaultDB's alone.

A listing's subscribers are told when its `damaged_rows` changes.
