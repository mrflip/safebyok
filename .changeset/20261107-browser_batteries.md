---
"safebyok": minor
---

safebyok/browser exports zxcvbnStrengthChecker, with MinPassphraseChars and MinZxcvbnScore: 12 characters, then a zxcvbn score of 3 of 4, its dictionary loaded at bank.hello(). It also exports browserOpts({ dbName }), the frozen bag of argon2idWebV1Deriver, idbDeviceDB and zxcvbnStrengthChecker to spread into Bank.make; it supplies no device_id. safebyok now depends on @zxcvbn-ts/core and @zxcvbn-ts/language-common, which reach only an app that imports either.
