---
"safebyok-convex": minor
---

fakeDeployment (safebyok-convex/testing) takes a logger for its clients and gives them a quiet one by default: what a client says with log is dropped, and warn and error reach the console, where a real client prints every line. A test that refuses a mutation on purpose still sees the client's error printed, unless it catches it: pass fakeDeployment(host, { logger }) with log, warn and error functions (a VaultLogger such as TH.spyLogger().logger fits), or logger: console to see everything. FakeClientOpts, which connectWith hands its make function, gains a logger field: pass those options on to your client's constructor as they come, and it logs as the deployment was told. fakeDeployment now refuses 'bad_option' for a host without an api and a createTest function, and for options with a field it does not take or a logger lacking log, warn and error functions.
