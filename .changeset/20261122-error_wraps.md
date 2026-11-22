---
---

safebyok-react-lean, private: the errors the React layer catches and hands a host are typed `Error`, and are one: `Draft.lastErr`, `StrengthVerdictResult.lastErr`, and what `WhisperMask` and `WhisperText` hand their `onError` (`unknown` until now), and `PutBoxActionResult.err`, whose type already said `Error`. An `Error` arrives as the same object; anything else thrown arrives wrapped in one, the value its cause. Nothing published changes.
