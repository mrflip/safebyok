# Security Policy

safebyok holds people's secrets, so we treat a report about it as the most important thing in the
queue. Thank you for taking the time.

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub: on this repository's
**Security** tab, choose **Report a vulnerability**. Only the maintainers can see the report,
and we can work out a fix and an advisory with you there.

Include what you can of:

* what an attacker can learn or do, and what they need first (access to the database? to the
  page? to the device?);
* the version of safebyok, and the platform (browser, Node, React Native) where you saw it;
* steps or a proof of concept. Please use made-up secrets, never a real API key.

We aim to acknowledge a report within a week, and to agree on a disclosure date with you once we
understand it. We will credit you in the advisory unless you would rather we didn't.

## Supported versions

Until 1.0, only the latest published version receives security fixes.

## What we consider in scope

safebyok's promise is that **whoever holds the application's database, server code and environment
cannot read a user's secrets**, and cannot alter them without the change being detected. Anything
that breaks that promise is in scope, for example:

* recovering a whisper, a vaultKey or a passphraseKey from what is stored (VOCABULARY.md names
  each);
* tampering with stored records in a way that goes undetected, or that rolls a vault back to an
  older passphrase or a weaker keyDeriverSpec;
* secret material escaping into an error, a log, a thrown value or anything else that leaves the
  library;
* weak or predictable randomness, or a key derivation weaker than the published keyDeriverSpec;
* a published package whose contents do not match this repository's source.

`notes/guarantees.md` states, value by value, where secret material may exist, in what form, for
how long, and which code may hold it. Anything that shows one of those guarantees broken is in
scope.

## What is outside safebyok's protection

These are real risks, but no library running inside the page can defend against them:

* **Code running in the same page or app as safebyok** -- a cross-site scripting hole in the host
  application, a malicious browser extension, a compromised dependency of the host app -- can
  read secrets once a vault is unlocked.
* **A compromised device** (malware, a keylogger capturing the passphrase).
* **A weak passphrase.** Argon2id makes guessing expensive, not impossible.
* **A host application that sends a decrypted secret to its own server.**

If you are unsure whether something is in scope, report it privately anyway.
