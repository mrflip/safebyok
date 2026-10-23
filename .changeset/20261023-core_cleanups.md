---
"safebyok": patch
---

**What a key deriver throws is kept nowhere.** A `keyDeriver` hears the passphrase, so what it throws may quote it. A throw from `deriveKeyBytes` now refuses `unexpected_error` with no `cause`, quoting none of it, and the logger hears only that it threw (`call: 'deriveKeyBytes'`) and the `refusalkind` of a `VaultError` it threw, when that kind is on the list. A condition-family `VaultError` it throws keeps its kind, but not its message or `meta`: the vault says it in its own words. A host that read the deriver's error from the refusal's `cause` (safebyok-fastkey's `bad_option` for a Content-Security-Policy without `'wasm-unsafe-eval'`, say) finds the kind in its logger instead.
