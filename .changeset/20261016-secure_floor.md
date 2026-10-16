---
"safebyok": minor
"safebyok-react": minor
---

**New passphrases must be strong enough: at least 12 characters by default.** `openVault` takes a `passphraseStrengthTest`, a function from a passphrase to a verdict (`{ strong: true }` or `{ strong: false, reason }`, at once or as a promise), run on the passphrase the first `unlock()` creates a vault with and on each one `addPassphrase()` or `changePassphrase()` sets, before any key derivation. A weak one is refused with the new kind `weak_passphrase` (a condition), the test's reason its message. It never runs on `unlock()` of a vault that stands, so no existing user is locked out. The default, `passphraseLengthTest` (exported, with `MinPassphraseChars`, 12, and the types `PassphraseStrengthTest` and `PassphraseVerdict`), asks for 12 code points and no composition rules, as NIST SP 800-63B advises. **What a host will see:** creating a vault, or adding or changing a passphrase, with fewer than 12 characters now refuses; pass a test of your own to choose otherwise. `VaultProvider` takes the same `passphraseStrengthTest` prop, never reopening the vault for a new one (an arrow in the props is fine), and its dialog shows the refusal's reason. `safebyok/testing`'s `memoryVaultOpts` admits any passphrase (`anyPassphraseTest`), so test suites keep their short ones.

**`zxcvbnPassphraseTest`, from `safebyok/browser`**, is a stronger test: the 12-character floor, then a zxcvbn score of at least 3 (`MinZxcvbnScore`), which turns away common passwords, keyboard walks, repeats, sequences and dates. It adds two runtime dependencies, `@zxcvbn-ts/core` and `@zxcvbn-ts/language-common`; its dictionary is about 216 kB minified and brotlied, so it is its own import, and `browserOpts()` does not bring it in.

**`openVault` refuses a page that is not a secure context** (plain http, anywhere but localhost) with the new kind `insecure_context` (misuse), where it used to fail later with a `TypeError` and no kind: serve the app over https.

**A key deriver handing back 32 zero bytes is refused** with `bad_option`, at every derivation: a key anyone could rebuild, which a deriver returning bytes it kept from an earlier call would.
