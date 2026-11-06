---
"safebyok": minor
---

A listing's answers set aside the rows that fail their check in `damaged_rows`, renamed from `damaged_records` (`BankListed`, `VaultListed` and `boxListing.damaged_rows`): a host that reads the old field reads undefined until it takes the new name. A `storage_unavailable` or `unexpected_error` refusal now always carries an `Error` as its cause: a thrown string becomes that Error's message, a thrown null or undefined an Error saying nothing was thrown, and any other thrown value an Error naming its type with the value as its own cause. A WebCrypto failure in sealing a whisper reaches the host as the DOMException itself from `putBox`, `box.put` or `putExposed`, and as an `unexpected_error` with that DOMException as its cause only from their `try*` forms.
