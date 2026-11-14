---
"safebyok-big": minor
---

**`safebyok/utils` gains `mask`, `MaskOpts`, `fromB64`, `toB64` and `WhisperFieldAttributes`.** `mask(text, opts?)` answers an outline of a secret text that is safe to show, such as `sk***...***wxyz` for an API key: a whiff of each end with stars between, one plain line with marks, invisibles, controls and spaces stripped. `opts` is `MaskOpts`: `head`, `tail`, `minStars` and `maxLen`, each defaulted, and an option out of range, or a field it does not take, refuses 'bad_option'. So does a text that is not a string. `toB64` and `fromB64` are the unpadded base64url codec of every stored `_b64` field, the same functions the core uses. `WhisperFieldAttributes` is the frozen bag of attributes for a field a user types a secret into, so a browser and its password managers leave it alone. The old design's `mask` refused a text that is not a string as 'bad_whisper', which the new core has no kind for. **Stored format:** unchanged.
